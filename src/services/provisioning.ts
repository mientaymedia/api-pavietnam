/**
 * Cap phat tu dong: bien mot don hang DA THANH TOAN thanh ten mien hoat dong.
 *
 * Nguyen tac an toan:
 *  1. Truoc khi goi API dang ky, dong don hang duoc dat sang 'processing' trong
 *     mot transaction -> hai tien trinh khong the cung dang ky mot ten mien.
 *  2. Moi buoc deu idempotent: chay lai job da hoan tat se khong dang ky lan hai.
 *  3. Loi tam thoi (mang, timeout) duoc thu lai; loi vinh vien (ten mien da co
 *     nguoi lay) dung ngay va bao cho khach + quan tri.
 */
import { db, nowIso, tx } from '../db/index.js';
import { log } from '../lib/logger.js';
import { registerDomain, renewDomain, setNameservers } from '../pavietnam/client.js';
import { RegistrarError, type RegisterContact } from '../pavietnam/types.js';
import { settings } from '../lib/settings.js';
import { clearCheckCache } from './domains.js';
import { getOrder, getOrderItems, orderContactId, refreshOrderStatus, type Order, type OrderItem } from './orders.js';
import { sendDomainActivated, sendProvisionFailed, userEmail } from './notifications.js';
import { audit } from './audit.js';
import { upsertDomainFromProvider } from './domainRepo.js';

/** Loi khong the khac phuc bang cach thu lai. */
const PERMANENT_PATTERNS = [
  /da\s*(duoc\s*)?dang\s*ky/i,
  /already\s+(registered|exists|taken)/i,
  /not\s+available/i,
  /unavailable/i,
  /invalid\s+domain/i,
  /reserved/i,
  /khong\s+du\s+so\s+du/i,
  /insufficient\s+(funds|balance)/i,
];

function isPermanent(message: string): boolean {
  return PERMANENT_PATTERNS.some((re) => re.test(message));
}

export interface ProvisionSummary {
  orderId: number;
  processed: number;
  succeeded: number;
  failed: number;
}

/** Cap phat toan bo cac dong cua mot don hang. */
export async function provisionOrder(orderId: number): Promise<ProvisionSummary> {
  const order = getOrder(orderId);
  if (!order) throw new Error(`Khong tim thay don hang #${orderId}`);
  if (order.status === 'pending_payment') {
    throw new Error(`Don hang ${order.code} chua thanh toan, khong the cap phat`);
  }

  const summary: ProvisionSummary = { orderId, processed: 0, succeeded: 0, failed: 0 };
  for (const item of getOrderItems(orderId)) {
    if (item.status === 'active' || item.status === 'failed') continue;
    summary.processed++;
    const ok = await provisionItem(item.id);
    if (ok) summary.succeeded++;
    else summary.failed++;
  }

  refreshOrderStatus(orderId);
  log.info('order_provisioned', { code: order.code, ...summary });
  return summary;
}

/**
 * Cap phat mot dong don hang.
 * @returns true neu dong da o trang thai 'active' sau khi chay.
 */
export async function provisionItem(itemId: number): Promise<boolean> {
  // Buoc 1: gianh quyen xu ly (atomic) - chan chay trung
  const claimed = tx((): OrderItem | null => {
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as OrderItem | undefined;
    if (!item) return null;
    if (item.status === 'active') return null;      // da xong
    if (item.status === 'processing') return null;  // tien trinh khac dang lam
    if (item.status === 'failed') return null;
    db.prepare(`UPDATE order_items SET status='processing', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending'`)
      .run(nowIso(), itemId);
    const after = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as OrderItem;
    return after.status === 'processing' ? after : null;
  });

  if (!claimed) {
    const current = db.prepare('SELECT status FROM order_items WHERE id = ?').get(itemId) as { status: string } | undefined;
    return current?.status === 'active';
  }

  const order = getOrder(claimed.order_id);
  if (!order) {
    markItemFailed(claimed, 'Khong tim thay don hang');
    return false;
  }

  try {
    if (claimed.action === 'renew') {
      await doRenew(order, claimed);
    } else {
      await doRegister(order, claimed);
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = err instanceof RegistrarError && isPermanent(message);
    const outOfRetries = claimed.attempts >= 3;

    if (permanent || outOfRetries) {
      markItemFailed(claimed, message);
      await sendProvisionFailed({
        userId: order.user_id,
        email: userEmail(order.user_id),
        domain: claimed.domain,
        orderCode: order.code,
        error: message,
      });
      refreshOrderStatus(order.id);
      return false;
    }

    // Loi tam thoi: tra ve 'pending' de hang doi thu lai
    db.prepare(`UPDATE order_items SET status='pending', error=?, updated_at=? WHERE id=?`)
      .run(message.slice(0, 500), nowIso(), claimed.id);
    log.warn('provision_item_retry', { itemId, domain: claimed.domain, attempt: claimed.attempts, error: message });
    throw err; // de job queue lap lich thu lai
  }
}

async function doRegister(order: Order, item: OrderItem): Promise<void> {
  const contact = loadContact(order);
  if (!contact) throw new RegistrarError('Thieu ho so chu the de dang ky ten mien', 'NO_CONTACT');

  const ns = settings.dns().defaultNameservers;
  const result = await registerDomain({
    domain: item.domain,
    years: item.years,
    contact,
    nameservers: ns.length >= 2 ? ns : undefined,
  });

  const domainId = upsertDomainFromProvider({
    userId: order.user_id,
    contactId: order.contact_id,
    domain: item.domain,
    tld: item.tld,
    status: 'active',
    providerRef: result.providerRef,
    nameservers: ns,
    registeredAt: nowIso(),
    expiresAt: result.expiresAt ?? addYearsIso(nowIso(), item.years),
  });

  db.prepare(`UPDATE order_items SET status='active', domain_id=?, provider_ref=?, error='', updated_at=? WHERE id=?`)
    .run(domainId, result.providerRef, nowIso(), item.id);

  clearCheckCache(item.domain);
  audit({ userId: order.user_id, action: 'domain.register', entity: 'domain', entityId: domainId, meta: { domain: item.domain, years: item.years } });

  const domainRow = db.prepare('SELECT expires_at, nameservers FROM domains WHERE id = ?').get(domainId) as
    | { expires_at: string | null; nameservers: string }
    | undefined;

  await sendDomainActivated({
    userId: order.user_id,
    email: userEmail(order.user_id),
    domain: item.domain,
    expiresAt: domainRow?.expires_at ?? null,
    nameservers: JSON.parse(domainRow?.nameservers ?? '[]') as string[],
    years: item.years,
  });
}

async function doRenew(order: Order, item: OrderItem): Promise<void> {
  const result = await renewDomain(item.domain, item.years);

  const existing = db.prepare('SELECT * FROM domains WHERE domain = ? COLLATE NOCASE').get(item.domain) as
    | { id: number; expires_at: string | null }
    | undefined;

  const newExpiry = result.expiresAt ?? addYearsIso(existing?.expires_at ?? nowIso(), item.years);
  const domainId = upsertDomainFromProvider({
    userId: order.user_id,
    contactId: order.contact_id,
    domain: item.domain,
    tld: item.tld,
    status: 'active',
    providerRef: result.providerRef,
    expiresAt: newExpiry,
  });

  db.prepare(`UPDATE order_items SET status='active', domain_id=?, provider_ref=?, error='', updated_at=? WHERE id=?`)
    .run(domainId, result.providerRef, nowIso(), item.id);

  audit({ userId: order.user_id, action: 'domain.renew', entity: 'domain', entityId: domainId, meta: { domain: item.domain, years: item.years, expiresAt: newExpiry } });

  await sendDomainActivated({
    userId: order.user_id,
    email: userEmail(order.user_id),
    domain: item.domain,
    expiresAt: newExpiry,
    nameservers: [],
    years: item.years,
  });
}

function markItemFailed(item: OrderItem, error: string): void {
  db.prepare(`UPDATE order_items SET status='failed', error=?, updated_at=? WHERE id=?`)
    .run(error.slice(0, 500), nowIso(), item.id);
  log.error('provision_item_failed', { itemId: item.id, domain: item.domain, error });
}

function loadContact(order: Order): RegisterContact | null {
  const id = orderContactId(order);
  if (!id) return null;
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    kind: row['kind'] === 'organization' ? 'organization' : 'individual',
    fullName: row['full_name'] ?? '',
    orgName: row['org_name'] ?? '',
    idNumber: row['id_number'] ?? '',
    taxCode: row['tax_code'] ?? '',
    email: row['email'] ?? '',
    phone: row['phone'] ?? '',
    address: row['address'] ?? '',
    city: row['city'] ?? '',
    province: row['province'] ?? '',
    postalCode: row['postal_code'] ?? '',
    country: row['country'] ?? 'VN',
    birthDate: row['birth_date'] ?? '',
    gender: row['gender'] ?? '',
  };
}

/** Cong them so nam vao moc thoi gian ISO. */
export function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowIso();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Dat nameserver mac dinh cho ten mien vua dang ky (goi rieng neu API yeu cau buoc 2). */
export async function applyDefaultNameservers(domain: string): Promise<void> {
  const ns = settings.dns().defaultNameservers;
  if (ns.length < 2) return;
  await setNameservers(domain, ns);
}
