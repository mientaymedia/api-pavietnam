import { config } from '../config.js';
import { db, isoIn, nowIso, tx } from '../db/index.js';
import { log } from '../lib/logger.js';
import { settings } from '../lib/settings.js';
import { getOrder, getOrderByCode, markOrderPaid, type Order } from '../services/orders.js';
import { sendOrderCreated, sendPaymentReceived } from '../services/notifications.js';
import { audit } from '../services/audit.js';
import { sepayProvider } from './sepay.js';
import { momoProvider } from './momo.js';
import { zalopayProvider } from './zalopay.js';
import { balanceProvider } from './balance.js';
import type { CreateResult, PaymentProvider, PaymentRow, ProviderId } from './types.js';

const PROVIDERS: PaymentProvider[] = [sepayProvider, momoProvider, zalopayProvider, balanceProvider];

export function getProvider(id: string): PaymentProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Danh sach phuong thuc dang bat, de hien tren trang thanh toan. */
export function availableProviders(): PaymentProvider[] {
  return PROVIDERS.filter((p) => p.isEnabled());
}

export interface StartPaymentInput {
  order: Order;
  providerId: ProviderId;
  clientIp: string;
  /**
   * Gui email/ZNS "don hang cho thanh toan" kem huong dan chuyen khoan.
   * Dat false khi noi goi da co thong bao rieng (vd gia han tu dong).
   */
  notify?: boolean;
}

export interface StartPaymentOutput extends CreateResult {
  payment: PaymentRow;
}

/**
 * Tao (hoac dung lai) mot giao dich thanh toan cho don hang.
 * Neu don da co giao dich `pending` cung phuong thuc va con han, dung lai
 * de tranh sinh nhieu ma tham chieu cho cung mot don.
 */
export async function startPayment(input: StartPaymentInput): Promise<StartPaymentOutput> {
  const provider = getProvider(input.providerId);
  if (!provider || !provider.isEnabled()) throw new Error('Phuong thuc thanh toan khong kha dung');
  if (input.order.status !== 'pending_payment') throw new Error('Don hang nay khong con cho thanh toan');

  const existing = db
    .prepare(
      `SELECT * FROM payments WHERE order_id = ? AND provider = ? AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT 1`,
    )
    .get(input.order.id, input.providerId, nowIso()) as PaymentRow | undefined;

  if (existing && existing.amount === input.order.total && (existing.pay_url || existing.qr_url)) {
    // Dung lai giao dich cu -> khong gui lai email huong dan, tranh lam phien
    return { payment: existing, payUrl: existing.pay_url || undefined, qrUrl: existing.qr_url || undefined };
  }

  const refCode = input.order.code;
  const ttlHours = settings.order().paymentTtlHours;
  const result = await provider.create({
    order: input.order,
    refCode,
    clientIp: input.clientIp,
    returnUrl: `${config.appUrl}/thanh-toan/ket-qua/${provider.id}`,
    ipnUrl: `${config.appUrl}/webhooks/${provider.id}`,
  });

  const info = db
    .prepare(
      `INSERT INTO payments (order_id, user_id, provider, ref_code, amount, status, provider_txn, pay_url, qr_url,
                             request_body, response_body, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.order.id, input.order.user_id, provider.id, refCode, input.order.total,
      result.providerTxn ?? '', result.payUrl ?? '', result.qrUrl ?? '',
      (result.requestBody ?? '').slice(0, 4000), (result.responseBody ?? '').slice(0, 4000),
      isoIn(ttlHours * 3600_000), nowIso(), nowIso(),
    );

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(info.lastInsertRowid)) as PaymentRow;
  log.info('payment_started', { order: input.order.code, provider: provider.id, amount: input.order.total });

  // Gui huong dan thanh toan (so tai khoan, noi dung chuyen khoan, ma QR).
  // Tru so du thi tien da tru xong ngay - khong co gi de huong dan.
  if (input.notify !== false && provider.id !== 'balance') {
    const email = (db.prepare('SELECT email FROM users WHERE id = ?').get(input.order.user_id) as
      { email: string } | undefined)?.email;
    if (email) {
      await sendOrderCreated(input.order, email, {
        provider: provider.id,
        refCode,
        ...(result.payUrl ? { payUrl: result.payUrl } : {}),
        ...(result.qrUrl ? { qrUrl: result.qrUrl } : {}),
      });
    }
  }

  return { ...result, payment };
}

export interface SettleInput {
  provider: ProviderId;
  refCode: string;
  amount: number;
  providerTxn: string;
  /** Cho phep so tien nho hon tong don (vd khach chuyen thieu) hay khong. */
  allowPartial?: boolean;
  /**
   * Khong gui email "da nhan thanh toan".
   * Dung cho gia han TU DONG: khach khong tu bam thanh toan, va da co email
   * rieng bao da tru vi - gui them email nay chi lam phien.
   */
  silent?: boolean;
}

export type SettleOutcome =
  | { status: 'paid'; order: Order }
  | { status: 'already_paid'; order: Order }
  | { status: 'duplicate'; order: Order | null }
  | { status: 'not_found'; order: null }
  | { status: 'amount_mismatch'; order: Order; expected: number; received: number };

/**
 * Ghi nhan mot khoan thanh toan da xac thuc.
 *
 * An toan khi goi lai nhieu lan: cong thanh toan thuong gui IPN nhieu lan cho
 * cung mot giao dich, va webhook ngan hang co the phat lai.
 */
export async function settlePayment(input: SettleInput): Promise<SettleOutcome> {
  const refCode = input.refCode.trim().toUpperCase();
  const order = getOrderByCode(refCode);
  if (!order) {
    log.warn('settle_order_not_found', { refCode, provider: input.provider });
    return { status: 'not_found', order: null };
  }

  // Da ghi nhan giao dich nay truoc do?
  if (input.providerTxn) {
    const dup = db
      .prepare(`SELECT id FROM payments WHERE provider = ? AND provider_txn = ? AND status = 'paid'`)
      .get(input.provider, input.providerTxn);
    if (dup) return { status: 'duplicate', order };
  }

  if (order.status !== 'pending_payment') {
    return { status: 'already_paid', order };
  }

  if (input.amount < order.total && !input.allowPartial) {
    log.warn('settle_amount_mismatch', { refCode, expected: order.total, received: input.amount });
    return { status: 'amount_mismatch', order, expected: order.total, received: input.amount };
  }

  tx(() => {
    const pending = db
      .prepare(`SELECT id FROM payments WHERE order_id = ? AND provider = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`)
      .get(order.id, input.provider) as { id: number } | undefined;

    if (pending) {
      db.prepare(`UPDATE payments SET status='paid', provider_txn=?, paid_at=?, updated_at=? WHERE id=?`)
        .run(input.providerTxn, nowIso(), nowIso(), pending.id);
    } else {
      db.prepare(
        `INSERT INTO payments (order_id, user_id, provider, ref_code, amount, status, provider_txn, paid_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
      ).run(order.id, order.user_id, input.provider, refCode, input.amount, input.providerTxn, nowIso(), nowIso(), nowIso());
    }
  });

  const updated = markOrderPaid(order.id, { provider: input.provider, txnId: input.providerTxn });
  audit({
    userId: order.user_id, action: 'payment.settled', entity: 'order', entityId: order.id,
    meta: { provider: input.provider, amount: input.amount, txn: input.providerTxn },
  });

  if (!input.silent) {
    const email = (db.prepare('SELECT email FROM users WHERE id = ?').get(order.user_id) as { email: string } | undefined)?.email;
    if (email) await sendPaymentReceived(updated ?? order, email);
  }

  return { status: 'paid', order: updated ?? order };
}

/** Quan tri vien xac nhan thanh toan thu cong (chuyen khoan khong doi soat duoc). */
export async function confirmManually(orderId: number, adminUserId: number, note = ''): Promise<SettleOutcome> {
  const order = getOrder(orderId);
  if (!order) return { status: 'not_found', order: null };
  audit({ userId: adminUserId, action: 'payment.manual_confirm', entity: 'order', entityId: orderId, meta: { note } });
  return settlePayment({
    provider: 'manual',
    refCode: order.code,
    amount: order.total,
    providerTxn: `MANUAL-${orderId}-${Date.now()}`,
    allowPartial: true,
  });
}

export function listPayments(orderId: number): PaymentRow[] {
  return db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC').all(orderId) as PaymentRow[];
}

export function getPaymentByRef(refCode: string): PaymentRow | undefined {
  return db.prepare(`SELECT * FROM payments WHERE ref_code = ? ORDER BY id DESC LIMIT 1`).get(refCode) as PaymentRow | undefined;
}

export * from './types.js';
