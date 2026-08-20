import { db, nowIso, tx } from '../db/index.js';
import { randomCode } from '../lib/crypto.js';
import { toVnd } from '../lib/money.js';
import { log } from '../lib/logger.js';
import { clearCart, getCart } from './cart.js';
import { computeDiscount, findCoupon, getTld } from './pricing.js';
import { enqueue } from '../jobs/queue.js';
import { audit } from './audit.js';

export interface Order {
  id: number;
  code: string;
  user_id: number;
  contact_id: number | null;
  status: 'pending_payment' | 'paid' | 'processing' | 'completed' | 'partially_completed' | 'failed' | 'cancelled' | 'refunded';
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  coupon_code: string;
  note: string;
  ip: string;
  paid_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  action: 'register' | 'renew' | 'transfer';
  domain: string;
  tld: string;
  years: number;
  unit_price: number;
  amount: number;
  status: 'pending' | 'processing' | 'active' | 'failed' | 'refunded';
  domain_id: number | null;
  provider_ref: string;
  error: string;
  attempts: number;
}

/** Ma don hang - dong thoi la noi dung chuyen khoan. Ngan, de doc, khong trung. */
function generateOrderCode(): string {
  for (let i = 0; i < 10; i++) {
    const code = `DH${randomCode(6)}`;
    const exists = db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code);
    if (!exists) return code;
  }
  return `DH${Date.now().toString(36).toUpperCase()}`;
}

export interface CreateOrderInput {
  userId: number;
  cartKey: string;
  contactId: number | null;
  couponCode?: string;
  note?: string;
  ip?: string;
}

export function createOrderFromCart(input: CreateOrderInput):
  | { ok: true; order: Order }
  | { ok: false; error: string } {
  const cart = getCart(input.cartKey);
  if (!cart.lines.length) return { ok: false, error: 'Gio hang dang trong' };

  if (cart.requiresVnContact && !input.contactId) {
    return { ok: false, error: 'Ten mien .vn bat buoc phai chon ho so chu the' };
  }

  const coupon = findCoupon(input.couponCode ?? '');
  const { discount, error } = computeDiscount(
    coupon,
    cart.lines.map((l) => ({ tld: l.tld, amount: l.amount })),
  );
  if (error) return { ok: false, error };

  const subtotal = cart.subtotal;
  const vat = cart.vat;
  const total = Math.max(0, toVnd(subtotal - discount + vat));

  const order = tx((): Order => {
    const code = generateOrderCode();
    const info = db
      .prepare(
        `INSERT INTO orders (code, user_id, contact_id, status, subtotal, discount, vat, total, coupon_code, note, ip, created_at, updated_at)
         VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(code, input.userId, input.contactId, subtotal, discount, vat, total, coupon?.code ?? '', input.note ?? '', input.ip ?? '', nowIso(), nowIso());

    const orderId = Number(info.lastInsertRowid);
    for (const line of cart.lines) {
      db.prepare(
        `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ).run(orderId, line.action, line.domain, line.tld, line.years, line.unit_price, line.amount, nowIso(), nowIso());
    }

    if (coupon) {
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
    }
    clearCart(input.cartKey);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order;
  });

  audit({ userId: input.userId, action: 'order.create', entity: 'order', entityId: order.id, ip: input.ip, meta: { total, items: cart.lines.length } });
  log.info('order_created', { code: order.code, total });
  return { ok: true, order };
}

export function getOrderByCode(code: string): Order | undefined {
  return db.prepare('SELECT * FROM orders WHERE code = ?').get(code) as Order | undefined;
}

export function getOrder(id: number): Order | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
}

export function getOrderItems(orderId: number): OrderItem[] {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId) as OrderItem[];
}

export function listOrders(userId: number, limit = 50): Order[] {
  return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as Order[];
}

/**
 * Danh dau don hang da thanh toan va day vao hang doi cap phat.
 * Ham nay AN TOAN khi goi nhieu lan (webhook cong thanh toan hay goi lap).
 */
export function markOrderPaid(orderId: number, meta: { provider: string; txnId?: string }): Order | null {
  const result = tx((): { order: Order | null; changed: boolean } => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order | undefined;
    if (!order) return { order: null, changed: false };
    if (order.status !== 'pending_payment') return { order, changed: false };

    db.prepare(`UPDATE orders SET status='paid', paid_at=?, updated_at=? WHERE id=? AND status='pending_payment'`)
      .run(nowIso(), nowIso(), orderId);
    return { order: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order, changed: true };
  });

  if (!result.order) return null;
  if (result.changed) {
    audit({ userId: result.order.user_id, action: 'order.paid', entity: 'order', entityId: orderId, meta });
    log.info('order_paid', { code: result.order.code, provider: meta.provider });
    enqueue('provision_order', { orderId }, { dedupeKey: `provision_order:${orderId}` });
  }
  return result.order;
}

/** Cap nhat trang thai tong cua don dua tren trang thai tung dong. */
export function refreshOrderStatus(orderId: number): void {
  const items = getOrderItems(orderId);
  if (!items.length) return;
  const all = (s: OrderItem['status']) => items.every((i) => i.status === s);
  const some = (s: OrderItem['status']) => items.some((i) => i.status === s);

  let status: Order['status'];
  if (all('active')) status = 'completed';
  else if (all('failed')) status = 'failed';
  else if (some('active') && some('failed') && !some('pending') && !some('processing')) status = 'partially_completed';
  else status = 'processing';

  const completedAt = status === 'completed' || status === 'partially_completed' || status === 'failed' ? nowIso() : null;
  db.prepare('UPDATE orders SET status=?, completed_at=COALESCE(?, completed_at), updated_at=? WHERE id=?')
    .run(status, completedAt, nowIso(), orderId);
}

export function cancelOrder(orderId: number, reason = ''): void {
  const order = getOrder(orderId);
  if (!order || order.status !== 'pending_payment') return;
  db.prepare(`UPDATE orders SET status='cancelled', note=?, updated_at=? WHERE id=?`)
    .run(`${order.note}${order.note ? ' | ' : ''}Huy: ${reason}`.slice(0, 500), nowIso(), orderId);
  db.prepare(`UPDATE payments SET status='expired', updated_at=? WHERE order_id=? AND status='pending'`)
    .run(nowIso(), orderId);
  if (order.coupon_code) {
    db.prepare('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE code = ? COLLATE NOCASE').run(order.coupon_code);
  }
  audit({ userId: order.user_id, action: 'order.cancel', entity: 'order', entityId: orderId, meta: { reason } });
}

/** Kiem tra don co the cap phat khong (da thanh toan & con dong cho xu ly). */
export function isProvisionable(order: Order): boolean {
  return order.status === 'paid' || order.status === 'processing';
}

/** Ho so chu the mac dinh khi dong don hang khong chi dinh rieng. */
export function orderContactId(order: Order): number | null {
  if (order.contact_id) return order.contact_id;
  const row = db
    .prepare('SELECT id FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id LIMIT 1')
    .get(order.user_id) as { id: number } | undefined;
  return row?.id ?? null;
}

/** Canh bao neu duoi ten mien trong don da bi tat sau khi khach dat hang. */
export function inactiveTlds(orderId: number): string[] {
  return getOrderItems(orderId)
    .map((i) => i.tld)
    .filter((tld, idx, arr) => arr.indexOf(tld) === idx)
    .filter((tld) => {
      const t = getTld(tld);
      return !t || !t.is_active;
    });
}
