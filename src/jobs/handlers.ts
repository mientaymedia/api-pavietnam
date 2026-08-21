import { db, isoIn, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { settings } from '../lib/settings.js';
import { provisionOrder, provisionItem } from '../services/provisioning.js';
import { cancelOrder, createRenewalOrder, getOrder, refreshOrderStatus } from '../services/orders.js';
import { domainInfo } from '../pavietnam/client.js';
import {
  daysUntilExpiry, domainsExpiringWithin, getDomainByName, upsertDomainFromProvider,
} from '../services/domainRepo.js';
import {
  sendAutoRenewCharged, sendAutoRenewNeedsPayment, sendRenewalReminder, userEmail,
} from '../services/notifications.js';
import { getTld, priceFor } from '../services/pricing.js';
import { balanceOf, debit } from '../payments/balance.js';
import { fetchRecentTransactions, ORDER_CODE_RE } from '../payments/sepay.js';
import { settlePayment, startPayment } from '../payments/index.js';
import type { JobType } from './queue.js';

export type Handler = (payload: Record<string, unknown>) => Promise<void>;

export const handlers: Record<JobType, Handler> = {
  /** Dang ky / gia han toan bo cac dong cua don hang da thanh toan. */
  async provision_order(payload) {
    const orderId = Number(payload['orderId']);
    if (!orderId) throw new Error('Thieu orderId');
    await provisionOrder(orderId);
  },

  async provision_item(payload) {
    const itemId = Number(payload['itemId']);
    if (!itemId) throw new Error('Thieu itemId');
    await provisionItem(itemId);
    const item = db.prepare('SELECT order_id FROM order_items WHERE id = ?').get(itemId) as { order_id: number } | undefined;
    if (item) refreshOrderStatus(item.order_id);
  },

  /** Dong bo trang thai / ngay het han tu P.A ve he thong. */
  async sync_domain(payload) {
    const name = String(payload['domain'] ?? '');
    const row = getDomainByName(name);
    if (!row) return;

    const info = await domainInfo(name);
    upsertDomainFromProvider({
      userId: row.user_id,
      domain: row.domain,
      tld: row.tld,
      ...(info.expiresAt ? { expiresAt: info.expiresAt } : {}),
      ...(info.nameservers.length ? { nameservers: info.nameservers } : {}),
    });

    // Ten mien qua han -> danh dau expired de khong nhac gia han nham
    const refreshed = getDomainByName(name);
    if (refreshed) {
      const left = daysUntilExpiry(refreshed);
      if (left !== null && left < 0 && refreshed.status === 'active') {
        db.prepare(`UPDATE domains SET status='expired', updated_at=? WHERE id=?`).run(nowIso(), refreshed.id);
      }
    }
  },

  /** Gui email nhac gia han theo cac moc cau hinh (mac dinh 30/15/7/1 ngay). */
  async send_renewal_reminders() {
    const milestones = settings.order().renewNoticeDays;
    if (!milestones.length) return;

    const maxDays = Math.max(...milestones);
    let sent = 0;

    for (const domain of domainsExpiringWithin(maxDays)) {
      const left = daysUntilExpiry(domain);
      if (left === null || left < 0) continue;
      if (!milestones.includes(left)) continue;

      // Da nhac trong 20 gio qua thi bo qua (tranh gui trung khi job chay lai)
      if (domain.renew_notified_at && domain.renew_notified_at > isoIn(-20 * 3600_000)) continue;

      const tld = getTld(domain.tld);
      const price = tld ? priceFor(tld, 'renew', 1).total : 0;
      const email = userEmail(domain.user_id);
      if (!email) continue;

      await sendRenewalReminder({
        userId: domain.user_id,
        email,
        domain: domain.domain,
        expiresAt: domain.expires_at ?? '',
        daysLeft: left,
        renewPrice: price,
      });

      db.prepare('UPDATE domains SET renew_notified_at = ? WHERE id = ?').run(nowIso(), domain.id);
      sent++;
    }

    if (sent) log.info('renewal_reminders_sent', { count: sent });
  },

  /**
   * GIA HAN TU DONG.
   *
   * Voi moi ten mien da bat `auto_renew` va sap het han:
   *   1. Tao don gia han (bo qua neu da co don dang cho - tranh tao trung)
   *   2. Du so du -> tru vi va gia han ngay
   *   3. Khong du -> giu don lai va gui email kem link thanh toan
   *
   * Chay lai an toan: `createRenewalOrder` tra ve don da co thay vi tao don moi.
   */
  async auto_renew_domains() {
    const daysBefore = settings.order().autoRenewDaysBefore;
    if (daysBefore <= 0) return;

    let renewed = 0;
    let awaitingPayment = 0;

    for (const domain of domainsExpiringWithin(daysBefore)) {
      if (!domain.auto_renew || domain.status !== 'active') continue;

      const left = daysUntilExpiry(domain);
      if (left === null || left < 0) continue;

      const created = createRenewalOrder({
        userId: domain.user_id,
        contactId: domain.contact_id,
        domain: domain.domain,
        tld: domain.tld,
        years: 1,
        note: 'Gia han tu dong',
      });
      if (!created.ok) {
        log.warn('auto_renew_order_failed', { domain: domain.domain, error: created.error });
        continue;
      }
      // Don da ton tai tu lan chay truoc -> khong lam gi them, tranh gui email lap
      if (created.existing) continue;

      const order = created.order;
      const email = userEmail(domain.user_id);

      if (debit(domain.user_id, order.total, `auto_renew:${order.code}`, `Gia han tu dong ${domain.domain}`)) {
        await settlePayment({
          provider: 'balance',
          refCode: order.code,
          amount: order.total,
          providerTxn: `AUTORENEW-${order.id}`,
          silent: true, // email rieng "da tru vi va gia han" se duoc gui ngay duoi
        });
        renewed++;
        if (email) {
          await sendAutoRenewCharged({
            userId: domain.user_id, email, domain: domain.domain, years: 1,
            amount: order.total, balanceAfter: balanceOf(domain.user_id), orderCode: order.code,
          });
        }
      } else {
        // Khong du so du: tao san QR chuyen khoan de khach thanh toan mot cham
        try {
          await startPayment({ order, providerId: 'sepay', clientIp: '' });
        } catch (err) {
          log.warn('auto_renew_payment_setup_failed', { domain: domain.domain, error: String(err) });
        }
        awaitingPayment++;
        if (email) {
          await sendAutoRenewNeedsPayment({
            userId: domain.user_id, email, domain: domain.domain, daysLeft: left,
            amount: order.total, balance: balanceOf(domain.user_id), orderCode: order.code,
          });
        }
      }
    }

    if (renewed || awaitingPayment) {
      log.info('auto_renew_run', { renewed, awaitingPayment });
    }
  },

  /** Huy cac don qua han thanh toan de giai phong ma don va ma giam gia. */
  async expire_stale_orders() {
    const ttlHours = settings.order().paymentTtlHours;
    const cutoff = isoIn(-ttlHours * 3600_000);
    const stale = db
      .prepare(`SELECT id FROM orders WHERE status='pending_payment' AND created_at < ?`)
      .all(cutoff) as { id: number }[];

    for (const row of stale) {
      cancelOrder(row.id, `Qua ${ttlHours} gio khong thanh toan`);
    }
    if (stale.length) log.info('stale_orders_cancelled', { count: stale.length });
  },

  /**
   * Doi soat bu voi SePay.
   *
   * Webhook la duong chinh; job nay la luoi an toan cho truong hop webhook that
   * lac (server dang deploy, mat mang...). No lay giao dich gan nhat qua API
   * SePay va ghi nhan nhung don chua duoc thanh toan.
   */
  async reconcile_sepay() {
    const s = settings.sepay();
    if (!s.enabled || !s.apiToken) return;

    const transactions = await fetchRecentTransactions(50);
    let matched = 0;

    for (const tx of transactions) {
      // Da xu ly giao dich nay chua?
      const seen = db.prepare('SELECT id FROM bank_transactions WHERE provider = ? AND external_id = ?')
        .get('sepay', tx.id);
      if (seen) continue;

      const match = ORDER_CODE_RE.exec(`${tx.code} ${tx.content}`.replace(/\s+/g, ''));
      const refCode = match?.[0]?.toUpperCase() ?? '';

      let status = 'unmatched';
      if (refCode) {
        const outcome = await settlePayment({
          provider: 'sepay', refCode, amount: tx.amount, providerTxn: tx.id,
        });
        status = outcome.status === 'paid' ? 'matched'
          : outcome.status === 'already_paid' || outcome.status === 'duplicate' ? 'duplicate'
          : outcome.status === 'amount_mismatch' ? 'amount_mismatch'
          : 'unmatched';
        if (outcome.status === 'paid') matched++;
      }

      db.prepare(
        `INSERT OR IGNORE INTO bank_transactions
           (provider, external_id, account_number, amount, content, matched_code, status, raw, created_at)
         VALUES ('sepay', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(tx.id, tx.accountNumber, tx.amount, tx.content.slice(0, 500), refCode, status, JSON.stringify(tx).slice(0, 2000), nowIso());
    }

    if (matched) log.info('sepay_reconciled', { matched, scanned: transactions.length });
  },
};

/** Job dinh ky: [ten job, chu ky ms]. */
export const RECURRING: { type: JobType; everyMs: number }[] = [
  { type: 'send_renewal_reminders', everyMs: 6 * 3600_000 },
  { type: 'auto_renew_domains', everyMs: 12 * 3600_000 },
  { type: 'expire_stale_orders', everyMs: 3600_000 },
  { type: 'reconcile_sepay', everyMs: 10 * 60_000 },
];

/** Tien ich: xac dinh don hang cua mot job (dung cho trang admin). */
export function jobOrderCode(payload: Record<string, unknown>): string {
  const orderId = Number(payload['orderId']);
  if (!orderId) return '';
  return getOrder(orderId)?.code ?? '';
}
