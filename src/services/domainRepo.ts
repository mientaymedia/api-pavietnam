import { db, nowIso, parseJson } from '../db/index.js';

export interface DomainRow {
  id: number;
  user_id: number;
  contact_id: number | null;
  domain: string;
  tld: string;
  status: 'pending' | 'active' | 'expired' | 'suspended' | 'transferred_out' | 'cancelled' | 'failed';
  provider: string;
  provider_ref: string;
  nameservers: string;
  auto_renew: number;
  transfer_lock: number;
  auth_code_last_at: string | null;
  registered_at: string | null;
  expires_at: string | null;
  last_sync_at: string | null;
  renew_notified_at: string | null;
  created_at: string;
}

export interface UpsertDomainInput {
  userId: number;
  contactId?: number | null;
  domain: string;
  tld: string;
  status?: DomainRow['status'];
  providerRef?: string;
  nameservers?: string[];
  registeredAt?: string | null;
  expiresAt?: string | null;
}

/**
 * Tao hoac cap nhat ban ghi ten mien sau khi API nha dang ky tra ve ket qua.
 * Chi ghi de cac truong CO GIA TRI -> goi lai khi dong bo khong lam mat du lieu cu.
 */
export function upsertDomainFromProvider(input: UpsertDomainInput): number {
  const domain = input.domain.toLowerCase();
  const existing = db.prepare('SELECT * FROM domains WHERE domain = ? COLLATE NOCASE').get(domain) as DomainRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE domains SET
         user_id = ?,
         contact_id = COALESCE(?, contact_id),
         status = COALESCE(?, status),
         provider_ref = CASE WHEN ? <> '' THEN ? ELSE provider_ref END,
         nameservers = CASE WHEN ? <> '' THEN ? ELSE nameservers END,
         registered_at = COALESCE(registered_at, ?),
         expires_at = COALESCE(?, expires_at),
         last_sync_at = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      input.userId,
      input.contactId ?? null,
      input.status ?? null,
      input.providerRef ?? '', input.providerRef ?? '',
      input.nameservers?.length ? JSON.stringify(input.nameservers) : '',
      input.nameservers?.length ? JSON.stringify(input.nameservers) : '',
      input.registeredAt ?? null,
      input.expiresAt ?? null,
      nowIso(),
      nowIso(),
      existing.id,
    );
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO domains (user_id, contact_id, domain, tld, status, provider, provider_ref, nameservers,
                            registered_at, expires_at, last_sync_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pavietnam', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.contactId ?? null,
      domain,
      input.tld.toLowerCase(),
      input.status ?? 'active',
      input.providerRef ?? '',
      JSON.stringify(input.nameservers ?? []),
      input.registeredAt ?? null,
      input.expiresAt ?? null,
      nowIso(),
      nowIso(),
      nowIso(),
    );
  return Number(info.lastInsertRowid);
}

export function getDomainById(id: number): DomainRow | undefined {
  return db.prepare('SELECT * FROM domains WHERE id = ?').get(id) as DomainRow | undefined;
}

export function getDomainByName(domain: string): DomainRow | undefined {
  return db.prepare('SELECT * FROM domains WHERE domain = ? COLLATE NOCASE').get(domain) as DomainRow | undefined;
}

/** Lay ten mien va kiem tra quyen so huu (admin xem duoc tat ca). */
export function getOwnedDomain(domain: string, userId: number, isAdmin = false): DomainRow | undefined {
  const row = getDomainByName(domain);
  if (!row) return undefined;
  if (!isAdmin && row.user_id !== userId) return undefined;
  return row;
}

export function listUserDomains(userId: number): DomainRow[] {
  return db.prepare('SELECT * FROM domains WHERE user_id = ? ORDER BY expires_at IS NULL, expires_at, domain')
    .all(userId) as DomainRow[];
}

export function nameserversOf(row: DomainRow): string[] {
  return parseJson<string[]>(row.nameservers, []);
}

export function setDomainNameservers(id: number, nameservers: string[]): void {
  db.prepare('UPDATE domains SET nameservers = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(nameservers), nowIso(), id);
}

export function setAutoRenew(id: number, enabled: boolean): void {
  db.prepare('UPDATE domains SET auto_renew = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, nowIso(), id);
}

/** So ngay con lai truoc khi het han (am = da het han). */
export function daysUntilExpiry(row: DomainRow): number | null {
  if (!row.expires_at) return null;
  const ms = new Date(row.expires_at).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/** Ten mien sap het han, dung cho email nhac gia han. */
export function domainsExpiringWithin(days: number): DomainRow[] {
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString();
  return db
    .prepare(`SELECT * FROM domains WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at`)
    .all(cutoff) as DomainRow[];
}
