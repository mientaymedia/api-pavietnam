/**
 * Hoan tien khi dang ky ten mien that bai.
 *
 * Vi sao can: khach da tra tien nhung ten mien khong dang ky duoc (ten mien vua
 * bi nguoi khac lay, tai khoan dai ly het so du, ho so chu the bi tu choi...).
 * Neu khong co duong hoan tien, tien nam lai o doanh nghiep con khach thi khong
 * nhan duoc gi - vua mat long tin vua roi loan so sach.
 *
 * Hoan ve DAU: cong vao SO DU VI cua khach, khong chuyen nguoc ra ngan hang.
 *  - Nhanh (ngay lap tuc), khong phi, khong can thao tac ngan hang
 *  - Khach dung ngay duoc cho don sau
 *  - Muon nhan tien mat, khach lien he ho tro - quan tri vien tru vi va chuyen tay
 * Email gui cho khach noi ro dieu nay.
 */
import { db, nowIso, tx } from '../db/index.js';
import { log } from '../lib/logger.js';
import { credit } from '../payments/balance.js';
import { getOrder, getOrderItems, refreshOrderStatus, type OrderItem } from './orders.js';
import { sendRefunded, userEmail } from './notifications.js';
import { audit } from './audit.js';
import { getSettingBool } from '../lib/settings.js';

/** Tu dong hoan tien ngay khi mot dong don that bai vinh vien. */
export function autoRefundEnabled(): boolean {
  return getSettingBool('order.auto_refund_failed', true);
}

export type RefundOutcome =
  | { status: 'refunded'; amount: number; balanceAfter: number }
  | { status: 'already_refunded' }
  | { status: 'not_refundable'; reason: string }
  | { status: 'not_found' };

/**
 * Hoan tien cho MOT dong don hang.
 *
 * An toan khi goi nhieu lan: viec doi trang thai sang 'refunded' nam trong cung
 * transaction voi lenh cong tien, va chi doi tu 'failed' - nen hai lan goi
 * dong thoi khong the cong tien hai lan.
 */
export async function refundOrderItem(
  itemId: number,
  opts: { actorUserId?: number | null; reason?: string } = {},
): Promise<RefundOutcome> {
  const claimed = tx((): { item: OrderItem; ok: boolean } | null => {
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as OrderItem | undefined;
    if (!item) return null;
    if (item.status === 'refunded') return { item, ok: false };
    if (item.status !== 'failed') return { item, ok: false };

    // Chi doi khi van con la 'failed' -> chan hoan tien hai lan
    const info = db
      .prepare(`UPDATE order_items SET status='refunded', updated_at=? WHERE id=? AND status='failed'`)
      .run(nowIso(), itemId);
    return { item, ok: info.changes === 1 };
  });

  if (!claimed) return { status: 'not_found' };
  if (!claimed.ok) {
    return claimed.item.status === 'refunded'
      ? { status: 'already_refunded' }
      : { status: 'not_refundable', reason: `Dong don dang o trang thai "${claimed.item.status}", chi hoan duoc dong da that bai` };
  }

  const item = claimed.item;
  const order = getOrder(item.order_id);
  if (!order) return { status: 'not_found' };

  // Hoan dung so tien cua dong do, kem phan VAT tuong ung neu don co VAT
  const amount = refundableAmount(order.id, item);
  const balanceAfter = credit(
    order.user_id,
    amount,
    'refund',
    `order:${order.code}:item:${item.id}`,
    opts.reason || `Hoan tien ${item.domain} - dang ky khong thanh cong`,
  );

  refreshOrderStatus(order.id);

  audit({
    userId: opts.actorUserId ?? null,
    action: 'order.refund_item',
    entity: 'order',
    entityId: order.id,
    meta: { domain: item.domain, amount, reason: opts.reason ?? '' },
  });
  log.info('order_item_refunded', { order: order.code, domain: item.domain, amount });

  const email = userEmail(order.user_id);
  if (email) {
    await sendRefunded({
      userId: order.user_id,
      email,
      domain: item.domain,
      orderCode: order.code,
      amount,
      balanceAfter,
      reason: opts.reason || item.error || 'Dang ky khong thanh cong',
    });
  }

  return { status: 'refunded', amount, balanceAfter };
}

/**
 * So tien hoan cho mot dong = tien hang cua dong + phan VAT tuong ung.
 * Giam gia toan don duoc chia theo ty le de khong hoan qua so khach da tra.
 */
export function refundableAmount(orderId: number, item: OrderItem): number {
  const order = getOrder(orderId);
  if (!order) return item.amount;

  const goc = getOrderItems(orderId).reduce((sum, i) => sum + i.amount, 0);
  if (goc <= 0) return 0;

  const tyLe = item.amount / goc;
  const thucTra = order.total; // da tru giam gia, da cong VAT
  return Math.round(thucTra * tyLe);
}

/** Hoan tien cho toan bo cac dong da that bai cua mot don. */
export async function refundFailedItems(
  orderId: number,
  opts: { actorUserId?: number | null; reason?: string } = {},
): Promise<{ refunded: number; total: number }> {
  let refunded = 0;
  let total = 0;

  for (const item of getOrderItems(orderId)) {
    if (item.status !== 'failed') continue;
    const outcome = await refundOrderItem(item.id, opts);
    if (outcome.status === 'refunded') {
      refunded++;
      total += outcome.amount;
    }
  }
  return { refunded, total };
}

/** Cac dong dang cho hoan tien - dung cho canh bao tren trang quan tri. */
export function pendingRefundCount(): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM order_items WHERE status='failed'`).get() as { n: number }
  ).n;
}
