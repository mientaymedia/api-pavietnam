import { db, nowIso } from '../db/index.js';
import { checkDomains, normalizeDomain, splitDomain, whois } from '../pavietnam/client.js';
import type { CheckResult, WhoisResult } from '../pavietnam/types.js';
import { knownTlds, listTlds, priceFor, type PriceBreakdown, type Tld } from './pricing.js';
import { log } from '../lib/logger.js';

/** Thoi gian song cua cache ket qua kiem tra (giay). Ngan de tranh ban ten mien da bi lay mat. */
const CHECK_CACHE_TTL_SEC = 120;

export interface SearchResult {
  domain: string;
  sld: string;
  tld: string;
  kind: 'vn' | 'intl';
  available: boolean;
  /** true khi khong lay duoc ket qua tu API (loi mang / IP chua whitelist). */
  unknown: boolean;
  message: string;
  price: PriceBreakdown | null;
  requiresVnContact: boolean;
}

/**
 * Tim ten mien: nhan vao tu khoa ('congty') hoac ten mien day du ('congty.vn').
 *
 * - Neu nhap ten mien day du: kiem tra chinh xac ten do truoc, roi goi y cac duoi khac.
 * - Neu nhap tu khoa: kiem tra tren cac duoi noi bat.
 */
export async function searchDomains(
  term: string,
  opts: { tlds?: string[]; years?: number } = {},
): Promise<{ query: string; sld: string; results: SearchResult[] }> {
  const raw = normalizeDomain(term);
  const sldOnly = raw.replace(/\.[a-z0-9.-]+$/, '');
  const all = listTlds({ activeOnly: true });
  const tldMap = new Map(all.map((t) => [t.tld.toLowerCase(), t]));

  const requested = (opts.tlds ?? []).map((t) => t.replace(/^\./, '').toLowerCase()).filter((t) => tldMap.has(t));
  const parsed = splitDomain(raw, knownTlds());

  let sld = parsed?.sld ?? sldOnly;
  if (!sld) return { query: raw, sld: '', results: [] };
  sld = sld.replace(/[^a-z0-9¡-￿-]/gi, '');

  // Thu tu: duoi nguoi dung go -> duoi duoc chon -> duoi noi bat
  const chosen: Tld[] = [];
  const push = (t: Tld | undefined) => {
    if (t && !chosen.some((c) => c.tld === t.tld)) chosen.push(t);
  };
  if (parsed) push(tldMap.get(parsed.tld));
  for (const t of requested) push(tldMap.get(t));
  if (chosen.length < 2) for (const t of all.filter((x) => x.is_featured)) push(t);
  if (!chosen.length) for (const t of all.slice(0, 8)) push(t);

  const candidates = chosen.slice(0, 12).map((t) => ({ tld: t, domain: `${sld}.${t.tld}` }));

  const { fresh, failed, messages } = await kiemTraNhieu(candidates.map((c) => c.domain));

  const years = opts.years ?? 1;
  const results: SearchResult[] = candidates.map(({ tld, domain }) => {
    const hit = fresh.get(domain);
    const unknown = !hit && failed.has(domain);
    const available = hit?.available ?? false;
    return {
      domain,
      sld,
      tld: tld.tld,
      kind: tld.kind,
      available,
      unknown,
      message: unknown ? (messages.get(domain) ?? '') : available ? 'Còn trống' : 'Đã có người đăng ký',
      price: available ? priceFor(tld, 'register', years) : null,
      requiresVnContact: tld.requires_vn_contact === 1,
    };
  });

  return { query: raw, sld, results };
}

/**
 * Kiem tra nhieu ten mien: lay tu cache truoc, chi goi API cho phan con thieu.
 * Dung chung cho o tim thuong va Tim cung AI de ca hai chung mot bo dem.
 *
 * Ten nao khong co trong `fresh` la CHUA BIET trang thai: noi goi khong duoc
 * coi do la con trong. `kiem` truyen vao duoc de test dem so lenh gui P.A.
 */
export async function kiemTraNhieu(
  domains: string[],
  kiem: (ds: string[]) => Promise<CheckResult[]> = checkDomains,
): Promise<{ fresh: Map<string, { available: boolean }>; failed: Set<string>; messages: Map<string, string> }> {
  const fresh = new Map<string, { available: boolean }>();
  const needCheck: string[] = [];
  for (const d of domains) {
    const cached = readCache(d);
    if (cached) fresh.set(d, cached);
    else needCheck.push(d);
  }

  const messages = new Map<string, string>();
  const failed = new Set<string>();
  if (needCheck.length) {
    const checked = await kiem(needCheck);
    for (const r of checked) {
      if (r.ok) {
        fresh.set(r.domain, { available: r.available });
        writeCache(r.domain, r.available, r.raw);
      } else {
        failed.add(r.domain);
        messages.set(r.domain, r.message || 'Không kiểm tra được');
        log.warn('domain_check_failed', { domain: r.domain, message: r.message });
      }
    }
  }
  return { fresh, failed, messages };
}

/** Tra cuu WHOIS (co bat loi de trang van hien thi duoc thong bao than thien). */
export async function lookupWhois(domain: string): Promise<WhoisResult | { error: string; domain: string }> {
  const d = normalizeDomain(domain);
  try {
    return await whois(d);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), domain: d };
  }
}

/* ------------------------------------------------------------------- cache */

function readCache(domain: string): { available: boolean } | null {
  const row = db
    .prepare('SELECT available, checked_at FROM domain_check_cache WHERE domain = ? COLLATE NOCASE')
    .get(domain) as { available: number; checked_at: string } | undefined;
  if (!row) return null;
  const age = (Date.now() - new Date(row.checked_at).getTime()) / 1000;
  if (age > CHECK_CACHE_TTL_SEC) return null;
  return { available: row.available === 1 };
}

function writeCache(domain: string, available: boolean, raw: string): void {
  db.prepare(
    `INSERT INTO domain_check_cache (domain, available, raw, checked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET available=excluded.available, raw=excluded.raw, checked_at=excluded.checked_at`,
  ).run(domain, available ? 1 : 0, raw.slice(0, 2000), nowIso());
}

/** Xoa cache cua mot ten mien (goi sau khi dang ky thanh cong). */
export function clearCheckCache(domain: string): void {
  db.prepare('DELETE FROM domain_check_cache WHERE domain = ? COLLATE NOCASE').run(domain);
}
