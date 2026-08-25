/**
 * Quan ly DNS cho Control Panel.
 *
 * API dai ly P.A nhan ca BO ban ghi khi cap nhat, nen moi thao tac them/sua/xoa
 * deu theo trinh tu: doc bo hien tai -> sua trong bo nho -> ghi lai toan bo.
 * Cach nay tranh tinh trang ban ghi bi mat khi chi gui phan thay doi.
 */
import { db, nowIso } from '../db/index.js';
import { getDnsRecords, setDnsRecords, setNameservers } from '../pavietnam/client.js';
import type { DnsRecord } from '../pavietnam/types.js';
import { getDomainById, nameserversOf, setDomainNameservers, type DomainRow } from './domainRepo.js';
import { audit } from './audit.js';
import { log } from '../lib/logger.js';

export interface DnsView {
  records: DnsRecord[];
  /** true khi du lieu lay tu cache cuc bo do API loi. */
  stale: boolean;
  error?: string;
  syncedAt?: string;
}

/** Doc ban ghi DNS tu P.A, luu cache; neu API loi thi tra cache kem canh bao. */
export async function listRecords(domain: DomainRow): Promise<DnsView> {
  try {
    const res = await getDnsRecords(domain.domain);
    cacheRecords(domain.id, res.records);
    return { records: res.records, stale: false, syncedAt: nowIso() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('dns_list_failed', { domain: domain.domain, error: message });
    const cached = readCache(domain.id);
    return {
      records: cached.records,
      stale: true,
      error: message,
      ...(cached.syncedAt ? { syncedAt: cached.syncedAt } : {}),
    };
  }
}

export async function addRecord(domain: DomainRow, record: DnsRecord, userId: number): Promise<DnsRecord[]> {
  const current = await currentRecords(domain);
  const next = [...current, normalize(record, domain.domain)];
  await commit(domain, next, userId, 'dns.add', record);
  return next;
}

export async function updateRecord(
  domain: DomainRow,
  index: number,
  record: DnsRecord,
  userId: number,
): Promise<DnsRecord[]> {
  const current = await currentRecords(domain);
  if (index < 0 || index >= current.length) throw new Error('Khong tim thay ban ghi can sua');
  const next = current.map((r, i) => (i === index ? normalize(record, domain.domain) : r));
  await commit(domain, next, userId, 'dns.update', { before: current[index], after: record });
  return next;
}

export async function deleteRecord(domain: DomainRow, index: number, userId: number): Promise<DnsRecord[]> {
  const current = await currentRecords(domain);
  if (index < 0 || index >= current.length) throw new Error('Khong tim thay ban ghi can xoa');
  const removed = current[index];
  const next = current.filter((_, i) => i !== index);
  await commit(domain, next, userId, 'dns.delete', removed);
  return next;
}

/** Ghi de toan bo bo ban ghi (dung cho che do sua hang loat). */
export async function replaceRecords(domain: DomainRow, records: DnsRecord[], userId: number): Promise<DnsRecord[]> {
  const next = records.map((r) => normalize(r, domain.domain));
  await commit(domain, next, userId, 'dns.replace', { count: next.length });
  return next;
}

export async function changeNameservers(domain: DomainRow, nameservers: string[], userId: number): Promise<void> {
  const before = nameserversOf(domain);
  await setNameservers(domain.domain, nameservers);
  setDomainNameservers(domain.id, nameservers);
  audit({
    userId,
    action: 'domain.nameservers',
    entity: 'domain',
    entityId: domain.id,
    meta: { domain: domain.domain, before, after: nameservers },
  });
}

/* ------------------------------------------------------------------ noi bo */

async function currentRecords(domain: DomainRow): Promise<DnsRecord[]> {
  const view = await listRecords(domain);
  if (view.stale) {
    throw new Error(
      `Khong doc duoc ban ghi DNS hien tai tu P.A (${view.error ?? 'loi khong xac dinh'}). ` +
        'De tranh mat ban ghi, he thong khong cap nhat khi chua doc duoc du lieu goc.',
    );
  }
  return view.records;
}

async function commit(
  domain: DomainRow,
  records: DnsRecord[],
  userId: number,
  action: string,
  meta: unknown,
): Promise<void> {
  await setDnsRecords(domain.domain, records);
  cacheRecords(domain.id, records);
  audit({ userId, action, entity: 'domain', entityId: domain.id, meta: { domain: domain.domain, meta } });
}

function normalize(record: DnsRecord, domain: string): DnsRecord {
  let name = (record.name || '@').trim().toLowerCase();
  // Cho phep nhap ca 'www' lan 'www.tenmien.com' -> luu dang tuong doi
  name = name.replace(new RegExp(`\\.?${domain.replace(/\./g, '\\.')}\\.?$`, 'i'), '') || '@';
  return {
    ...(record.id ? { id: record.id } : {}),
    type: record.type.toUpperCase(),
    name,
    content: record.content.trim(),
    ttl: record.ttl || 3600,
    ...(record.priority !== undefined ? { priority: record.priority } : {}),
  };
}

function cacheRecords(domainId: number, records: DnsRecord[]): void {
  const write = db.transaction(() => {
    db.prepare('DELETE FROM dns_records WHERE domain_id = ?').run(domainId);
    for (const r of records) {
      db.prepare(
        `INSERT INTO dns_records (domain_id, remote_id, type, name, content, ttl, priority, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(domainId, r.id ?? '', r.type, r.name, r.content, r.ttl, r.priority ?? null, nowIso());
    }
  });
  write.immediate();
}

function readCache(domainId: number): { records: DnsRecord[]; syncedAt?: string } {
  const rows = db.prepare('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY id').all(domainId) as {
    remote_id: string; type: string; name: string; content: string; ttl: number; priority: number | null; synced_at: string;
  }[];
  const records = rows.map((r) => ({
    ...(r.remote_id ? { id: r.remote_id } : {}),
    type: r.type,
    name: r.name,
    content: r.content,
    ttl: r.ttl,
    ...(r.priority !== null ? { priority: r.priority } : {}),
  }));
  const syncedAt = rows[0]?.synced_at;
  return syncedAt ? { records, syncedAt } : { records };
}

/** Goi y ban ghi thuong dung khi khach vua co ten mien moi. */
export const RECORD_PRESETS: { label: string; record: DnsRecord }[] = [
  { label: 'Tro web ve IP may chu', record: { type: 'A', name: '@', content: '', ttl: 3600 } },
  { label: 'www tro ve ten mien chinh', record: { type: 'CNAME', name: 'www', content: '', ttl: 3600 } },
  { label: 'Email Google Workspace', record: { type: 'MX', name: '@', content: 'aspmx.l.google.com', ttl: 3600, priority: 1 } },
  { label: 'Xac thuc SPF co ban', record: { type: 'TXT', name: '@', content: 'v=spf1 -all', ttl: 3600 } },
];
