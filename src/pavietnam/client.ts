import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';
import { httpRequest } from '../lib/http.js';
import { log } from '../lib/logger.js';
import { maskSecret, sha256 } from '../lib/crypto.js';
import { settings } from '../lib/settings.js';
import { boDau } from '../lib/text.js';
import { ACTIONS, FIELDS, RESPONSE_KEYS, SUCCESS_TOKENS, type ActionKey } from './actions.js';
import { asBool, normalizeDate, parseNameservers, parseResponse, pick, type Flat } from './parse.js';
import {
  RegistrarError,
  type CheckResult,
  type DnsRecord,
  type DomainInfo,
  type RawResult,
  type RegisterContact,
  type RegisterResult,
  type WhoisResult,
} from './types.js';

export interface PaCredentials {
  endpoint: string;
  username: string;
  apikey: string;
}

/** Lay thong tin dang nhap: uu tien cau hinh trong Control Panel, sau do den .env. */
function credentials(override?: Partial<PaCredentials>): PaCredentials {
  const cp = settings.pa();
  return {
    endpoint: override?.endpoint || cp.endpoint || config.pa.endpoint,
    username: override?.username || cp.username || config.pa.username,
    apikey: override?.apikey || cp.apikey || config.pa.apikey,
  };
}

/** Che do gia lap: bat qua Control Panel hoac PAVIETNAM_SANDBOX=1. */
function sandboxEnabled(): boolean {
  return settings.pa().sandbox;
}

/* ============================================================== goi API tho */

export interface CallOptions {
  /** Gui bang POST thay vi GET (nen dung khi tham so dai, vd danh sach ban ghi DNS). */
  method?: 'GET' | 'POST';
  credentials?: Partial<PaCredentials>;
  /** Ghi vao api_logs kem ten mien lien quan. */
  domainForLog?: string;
}

/**
 * Goi mot action bat ky cua API dai ly P.A.
 * Dung truc tiep khi ban can mot action chua duoc boc thanh ham rieng.
 */
export async function call(
  action: string,
  params: Record<string, string | number | undefined> = {},
  opts: CallOptions = {},
): Promise<RawResult> {
  const cred = credentials(opts.credentials);
  // Xet sandbox TRUOC khi doi key: gia lap khong goi P.A nen khong can key that
  // (may dev, test). Che do that van bat buoc co du username + API Key.
  const sandbox = sandboxEnabled();
  if (!sandbox && (!cred.username || !cred.apikey)) {
    throw new RegistrarError(
      'Chưa cấu hình username/API Key của P.A Việt Nam. Vào Control Panel > Cấu hình API hoặc đặt PAVIETNAM_USERNAME / PAVIETNAM_APIKEY trong .env.',
      'NO_CREDENTIALS',
    );
  }

  const query = new URLSearchParams();
  query.set('username', cred.username || 'sandbox');
  query.set('apikey', cred.apikey || 'sandbox');
  query.set(FIELDS.command, action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
  }

  // Chuoi an toan de ghi log: khong bao gio luu API Key that
  const safeQuery = new URLSearchParams(query);
  safeQuery.set('apikey', maskSecret(query.get('apikey') ?? ''));
  const logged = `${cred.endpoint}?${safeQuery.toString()}`;

  const started = Date.now();
  let raw = '';
  let ok = false;
  try {
    if (sandbox) {
      raw = sandboxResponse(action, params);
    } else if ((opts.method ?? 'GET') === 'POST') {
      raw = await httpRequest(cred.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: query.toString(),
        timeoutMs: config.pa.timeoutMs,
        retries: config.pa.retries,
      });
    } else {
      raw = await httpRequest(`${cred.endpoint}?${query.toString()}`, {
        timeoutMs: config.pa.timeoutMs,
        retries: config.pa.retries,
      });
    }

    const data = parseResponse(raw);
    const interpreted = interpret(data, raw);
    ok = interpreted.ok;
    const result: RawResult = { raw, data, durationMs: Date.now() - started, ...interpreted };
    writeApiLog(action, opts.domainForLog ?? String(params[FIELDS.domain] ?? ''), logged, raw, ok, result.durationMs);
    return result;
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    writeApiLog(action, opts.domainForLog ?? String(params[FIELDS.domain] ?? ''), logged, `LỖI: ${message}`, false, durationMs);
    log.error('pavietnam_call_failed', { action, error: message });
    if (err instanceof RegistrarError) throw err;
    throw new RegistrarError(`Không kết nối được API P.A Việt Nam: ${message}`, 'NETWORK', raw);
  }
}

/** Status nghiep vu (sau boDau, bo khoang trang) duoc coi la goi thanh cong. */
const BUSINESS_STATUS = new Set(['available', 'unavailable', 'registered', 'active', 'expired']);
/**
 * Dau hieu phu dinh / loi trong status: co mot tu nay thi khong con la thanh cong.
 * 'false', '0' chi xet o nhanh co tu nghiep vu, so nguyen token: "registered:
 * false", "active=0" la cau tra loi KHONG. Status '0' dung mot minh van la ma
 * thanh cong vi SUCCESS_TOKENS duoc khop truoc.
 */
const STATUS_PHU_DINH = /\b(not|no|non|khong|chua|error|loi|fail(ed|ure)?|invalid|denied|that\s*bai|sai|false|0)\b/;

/** Doc trang thai thanh cong / ma loi / thong bao tu phan hoi da parse. */
export function interpret(data: Flat, raw: string): Pick<RawResult, 'ok' | 'code' | 'message'> {
  const status = pick(data, [...RESPONSE_KEYS.status]) ?? '';
  const message = pick(data, [...RESPONSE_KEYS.message]) ?? '';
  // boDau + bo khoang trang: status "Thành công", "THÀNH CÔNG", "thanh cong"
  // (ca dang NFD) deu thanh 'thanhcong'. Truoc day chi khop dung 'thanhcong'
  // nen mot lenh dang ky P.A da lam xong co the bi coi la loi roi thu lai,
  // hoan tien. Van so KHOP NGUYEN CHUOI voi danh sach: cau loi khong lot.
  const normalized = boDau(status).trim();
  const gon = normalized.replace(/\s+/g, '');

  let ok: boolean;
  if (normalized) {
    ok = SUCCESS_TOKENS.has(normalized) || SUCCESS_TOKENS.has(gon);
    // Mot so action tra ve status mang nghia nghiep vu ('available'/'unavailable'):
    // day khong phai loi ky thuat nen van coi la goi thanh cong. Truoc day chi
    // can CHUA mot tu nay la du, nen "error: domain not registered" hay "Lỗi:
    // tên miền chưa active" thanh thanh cong. Nay: khop nguyen token, hoac co
    // nguyen tu nghiep vu ma khong co dau hieu phu dinh / loi nao.
    if (!ok) {
      ok =
        BUSINESS_STATUS.has(gon) ||
        (/\b(available|unavailable|registered|active|expired)\b/.test(normalized) && !STATUS_PHU_DINH.test(normalized));
    }
  } else {
    // Khong co truong status -> suy doan tu noi dung. So tren chu da boDau:
    // "Lỗi: ..." hay "IP không được phép truy cập" truoc day khong khop gi nen
    // loi goi hong bi coi la THANH CONG.
    ok = !/\b(error|loi|fail(ed)?|invalid|denied|not\s+allowed|permission|khong\s+duoc\s+phep|khong\s+duoc\s+ho\s+tro)\b/i.test(
      boDau(raw),
    );
  }

  return { ok, code: status, message: message || (ok ? '' : raw.slice(0, 500)) };
}

/**
 * Ma EPP la chia khoa chuyen ten mien di - ai co no cung co the doat ten mien.
 * Vi vay khong luu vao nhat ky, ke ca nhat ky ky thuat chi quan tri vien xem duoc.
 */
function redactAuthCode(action: string, response: string): string {
  if (action !== ACTIONS.authCode) return response;
  return response.replace(
    /("?(?:authcode|auth_code|eppcode|epp_code|epp|transferkey|password)"?\s*[:=]\s*"?)([^",&}\s]+)/gi,
    '$1***DA-CHE***',
  );
}

function writeApiLog(action: string, domain: string, request: string, response: string, ok: boolean, durationMs: number) {
  if (!config.pa.log) return;
  try {
    db.prepare(
      `INSERT INTO api_logs (provider, action, domain, request, response, ok, duration_ms, created_at)
       VALUES ('pavietnam', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(action, domain, request.slice(0, 4000), redactAuthCode(action, response).slice(0, 8000), ok ? 1 : 0, durationMs, nowIso());
  } catch (err) {
    log.warn('api_log_write_failed', { error: String(err) });
  }
}

function ensureOk(res: RawResult, what: string): RawResult {
  if (!res.ok) throw new RegistrarError(res.message || `${what} thất bại`, res.code, res.raw);
  return res;
}

/* ========================================================== ham nghiep vu */

/**
 * Suy ra "con trong" tu chu cua phan hoi khi khong co truong 0/1 ro rang.
 * So tren chu da boDau de khop ca "đã được đăng ký" lan "da duoc dang ky".
 */
export function availableFromText(text: string): boolean {
  const hay = boDau(text);
  if (/\b(unavailable|not\s+available|taken|registered|da\s*(duoc\s*)?dang\s*ky|khong\s*kha\s*dung)\b/.test(hay)) {
    return false;
  }
  if (/\b(available|free|chua\s*(duoc\s*)?dang\s*ky|kha\s*dung|con\s*trong)\b/.test(hay)) return true;
  return false; // An toan: khong ro thi coi nhu KHONG con trong
}

/** Bo ky tu BOM o dau va khoang trang - P.A tra van ban co BOM UTF-8. */
export function lamSachPhanHoi(raw: string): string {
  return (raw ?? '').replace(/^﻿/, '').trim();
}

/**
 * Cau bao loi cua P.A dang `<pre>Array ( [ReturnCode] => 600 [ReturnText] => Lỗi: ... ) </pre>`:
 * lay rieng phan ReturnText de hien cho nguoi dung, khong dua ca khoi HTML.
 */
export function thongBaoLoiPA(raw: string): string {
  const m = lamSachPhanHoi(raw).match(/\[ReturnText\]\s*=>\s*([^\n\r)]+)/);
  return (m?.[1] ?? '').trim();
}

/**
 * Doc ket qua lenh kiem tra ten mien.
 * - P.A `check_whois` tra so tran: '1' = con trong, '0' = da co chu.
 * - Phan hoi dang JSON/khoa-gia tri (sandbox, API khac) doc qua truong available.
 * - Phan hoi la loi (lenh sai, IP, xac thuc) -> nem loi de man hinh hien
 *   "Chua kiem tra duoc" thay vi bao nham "Da co nguoi dang ky".
 */
export function docKetQuaKiemTra(res: Pick<RawResult, 'raw' | 'data' | 'ok' | 'message' | 'code'>): boolean {
  const tran = lamSachPhanHoi(res.raw);
  if (tran === '1') return true;
  if (tran === '0') return false;

  if (!res.ok) {
    throw new RegistrarError(thongBaoLoiPA(res.raw) || res.message || 'Không kiểm tra được tên miền', res.code || 'ERROR', res.raw);
  }

  const availableRaw = pick(res.data, [...RESPONSE_KEYS.available]);
  if (availableRaw !== undefined && /^(0|1|true|false|yes|no|y|n)$/i.test(availableRaw.trim())) {
    return asBool(availableRaw);
  }
  return availableFromText(`${availableRaw ?? ''} ${res.message} ${res.raw}`);
}

/** Kiem tra ten mien con trong hay khong. */
export async function checkDomain(domain: string): Promise<CheckResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.check, { [FIELDS.domain]: d }, { domainForLog: d });
  const available = docKetQuaKiemTra(res);
  return { ...res, ok: true, domain: d, available };
}

/** Dau hieu P.A tu choi lenh (xac thuc, IP, lenh, tham so): ket noi chua dung. */
const LOI_KET_NOI =
  /\b(error|loi|fail(ed|ure)?|invalid|denied|not\s+allowed|permission|unauthori[sz]ed|forbidden|whitelist|api\s*key|xac\s*thuc|khong\s+duoc\s+phep|khong\s+duoc\s+ho\s+tro|khong\s+hop\s+le|sai)\b/;
/** Cau tra loi nghiep vu ve ten mien: P.A da doc va thuc thi lenh. */
const TRA_LOI_NGHIEP_VU =
  /\b(available|unavailable|registered|active|expired|taken|da\s*(duoc\s*)?dang\s*ky|chua\s*(duoc\s*)?dang\s*ky|con\s*trong)\b/;

/**
 * Nut "Kiem tra API" trong Cau hinh chi hoi: P.A co tra loi hop le khong. Ten
 * mien thu da co chu thi status co the la "Domain not available" (interpret
 * coi la ok=false vi co "not"), nhung do van la ket noi tot. Nen: ok thi dat;
 * khong ok thi chi dat khi la cau tra loi nghiep vu va khong co dau hieu tu
 * choi nao. Khong ro thi coi la THAT BAI (an toan, quan tri xem phan hoi tho).
 */
export function ketNoiHopLe(res: Pick<RawResult, 'ok' | 'code' | 'message' | 'raw'>): boolean {
  if (res.ok) return true;
  const chu = boDau(`${res.code} ${res.message} ${res.raw}`);
  return !LOI_KET_NOI.test(chu) && TRA_LOI_NGHIEP_VU.test(chu);
}

/** Kiem tra nhieu ten mien song song, gioi han so lenh chay dong thoi. */
export async function checkDomains(domains: string[], concurrency = 4): Promise<CheckResult[]> {
  const queue = [...domains];
  const results: CheckResult[] = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const d = queue.shift();
      if (!d) return;
      try {
        results.push(await checkDomain(d));
      } catch (err) {
        results.push({
          raw: '', data: {}, ok: false, code: 'ERROR',
          message: err instanceof Error ? err.message : String(err),
          durationMs: 0, domain: normalizeDomain(d), available: false,
        });
      }
    }
  });
  await Promise.all(workers);
  const order = new Map(domains.map((d, i) => [normalizeDomain(d), i]));
  return results.sort((a, b) => (order.get(a.domain) ?? 0) - (order.get(b.domain) ?? 0));
}

/** Dang ky ten mien. Tra ve ma tham chieu + ngay het han neu API cung cap. */
export async function registerDomain(input: {
  domain: string;
  years: number;
  contact: RegisterContact;
  nameservers?: string[];
}): Promise<RegisterResult> {
  const d = normalizeDomain(input.domain);
  const params: Record<string, string | number> = {
    [FIELDS.domain]: d,
    [FIELDS.years]: input.years,
    ...contactParams(input.contact),
  };
  if (input.nameservers?.length) {
    input.nameservers.forEach((ns, i) => {
      params[`${FIELDS.ns}${i + 1}`] = ns;
    });
    params[FIELDS.ns] = input.nameservers.join(',');
  }

  const res = ensureOk(await call(ACTIONS.register, params, { method: 'POST', domainForLog: d }), `Đăng ký ${d}`);
  return {
    ...res,
    domain: d,
    providerRef: pick(res.data, [...RESPONSE_KEYS.transactionId]) ?? '',
    expiresAt: normalizeDate(pick(res.data, [...RESPONSE_KEYS.expires])),
  };
}

/** Gia han ten mien. */
export async function renewDomain(domain: string, years: number): Promise<RegisterResult> {
  const d = normalizeDomain(domain);
  const res = ensureOk(
    await call(ACTIONS.renew, { [FIELDS.domain]: d, [FIELDS.years]: years }, { method: 'POST', domainForLog: d }),
    `Gia hạn ${d}`,
  );
  return {
    ...res,
    domain: d,
    providerRef: pick(res.data, [...RESPONSE_KEYS.transactionId]) ?? '',
    expiresAt: normalizeDate(pick(res.data, [...RESPONSE_KEYS.expires])),
  };
}

/**
 * Chuyen ten mien ve (transfer-in).
 *
 * Khac voi dang ky moi: can `authCode` (ma EPP) do nha dang ky CU cap, va ket qua
 * thuong la "da tiep nhan yeu cau" chu chua phai "da hoan tat" - viec chuyen ten mien
 * mat 5-7 ngay voi ten mien quoc te. Trang thai duoc dong bo lai qua job `sync_domain`.
 */
export async function transferDomain(input: {
  domain: string;
  years: number;
  authCode: string;
  contact?: RegisterContact;
}): Promise<RegisterResult> {
  const d = normalizeDomain(input.domain);
  const params: Record<string, string | number> = {
    [FIELDS.domain]: d,
    [FIELDS.years]: input.years,
    [FIELDS.authCode]: input.authCode,
    // Gui kem vai bien the ten pho bien de tang kha nang tuong thich
    eppcode: input.authCode,
    auth_code: input.authCode,
    ...(input.contact ? contactParams(input.contact) : {}),
  };

  const res = ensureOk(
    await call(ACTIONS.transfer, params, { method: 'POST', domainForLog: d }),
    `Chuyển tên miền ${d}`,
  );
  return {
    ...res,
    domain: d,
    providerRef: pick(res.data, [...RESPONSE_KEYS.transactionId]) ?? '',
    expiresAt: normalizeDate(pick(res.data, [...RESPONSE_KEYS.expires])),
  };
}

/** Doc thong tin chu the dang luu tai nha dang ky. */
export async function getDomainContact(domain: string): Promise<{ contact: Record<string, string> } & RawResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.contactGet, { [FIELDS.domain]: d }, { domainForLog: d });

  const doc = (keys: string[]) => pick(res.data, keys) ?? '';
  return {
    ...res,
    contact: {
      fullName: doc(['name', 'fullname', 'ownername', 'owner', 'registrant']),
      orgName: doc(['company', 'organization', 'org', 'congty']),
      idNumber: doc(['idnumber', 'id_number', 'idcard', 'cmnd']),
      taxCode: doc(['taxcode', 'tax_code', 'mst']),
      email: doc(['email', 'owneremail']),
      phone: doc(['phone', 'tel', 'ownerphone']),
      address: doc(['address', 'addr', 'diachi']),
      city: doc(['city']),
      province: doc(['province', 'state']),
      country: doc(['country']),
    },
  };
}

/**
 * Cap nhat THONG TIN LIEN HE cua chu the (email, dien thoai, dia chi).
 *
 * KHONG dung de doi CHU THE sang nguoi/to chuc khac - viec do la thu tuc phap ly
 * rieng, xem `src/services/domainContact.ts`.
 */
export async function updateDomainContact(domain: string, contact: RegisterContact): Promise<RawResult> {
  const d = normalizeDomain(domain);
  return ensureOk(
    await call(ACTIONS.contactSet, { [FIELDS.domain]: d, ...contactParams(contact) }, { method: 'POST', domainForLog: d }),
    `Cập nhật thông tin liên hệ ${d}`,
  );
}

/**
 * Lay ma EPP (Auth Code) de khach CHUYEN TEN MIEN DI noi khac.
 *
 * Day la quyen cua chu ten mien - khong duoc gay kho de. Nhung cung la duong
 * chiem doat ten mien neu lot vao tay nguoi khac, nen tang tren ghi nhat ky
 * va gui email bao cho chu so huu moi lan ma duoc lay.
 */
export async function getAuthCode(domain: string): Promise<{ authCode: string } & RawResult> {
  const d = normalizeDomain(domain);
  const res = ensureOk(
    await call(ACTIONS.authCode, { [FIELDS.domain]: d }, { domainForLog: d }),
    `Lấy mã EPP của ${d}`,
  );

  const code = pick(res.data, [...RESPONSE_KEYS.authCode]) ?? '';
  if (!code) {
    throw new RegistrarError(
      'Nhà đăng ký không trả về mã EPP. Tên miền có thể đang bị khóa chuyển đổi, ' +
        'hoặc chưa quá 60 ngày kể từ lần đăng ký/chuyển gần nhất.',
      'NO_AUTH_CODE',
      res.raw,
    );
  }
  return { ...res, authCode: code };
}

/**
 * Khoa / mo khoa chuyen doi (clientTransferProhibited).
 * Khoa la trang thai an toan mac dinh; phai mo khoa truoc khi chuyen ten mien di.
 */
export async function setDomainLock(domain: string, locked: boolean): Promise<RawResult> {
  const d = normalizeDomain(domain);
  return ensureOk(
    await call(
      ACTIONS.lockSet,
      { [FIELDS.domain]: d, [FIELDS.lock]: locked ? '1' : '0', status: locked ? 'lock' : 'unlock' },
      { method: 'POST', domainForLog: d },
    ),
    `${locked ? 'Khóa' : 'Mở khóa'} tên miền ${d}`,
  );
}

/** Chu WHOIS co cho thay ten mien da co chu khong (so tren chu da boDau). */
export function registeredFromWhoisText(text: string): boolean {
  return !/no\s+match|not\s+found|khong\s+tim\s+thay|chua\s+(duoc\s+)?dang\s+ky|available/i.test(boDau(text));
}

/** Tra cuu WHOIS. */
export async function whois(domain: string): Promise<WhoisResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.whois, { [FIELDS.domain]: d }, { domainForLog: d });
  if (!res.ok) {
    throw new RegistrarError(thongBaoLoiPA(res.raw) || res.message || `Tra cứu WHOIS ${d} thất bại`, res.code || 'ERROR', res.raw);
  }
  // P.A `get_whois` tra van ban thuan, cac dong ngan cach bang <br/> va co BOM
  const text = String(pick(res.data, ['raw_text', 'whois', 'result', 'data']) ?? res.raw)
    .replace(/^﻿/, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return {
    ...res,
    domain: d,
    registered: registeredFromWhoisText(text),
    // Doc tu van ban da lam sach truoc: phan hoi WHOIS thuan cua P.A co the bi
    // parser khoa-gia tri tach nham va dinh ca the <br/> vao gia tri
    registrar: extract(text, /^\s*Registrar:\s*(.+)$/im) ?? pick(res.data, [...RESPONSE_KEYS.registrar]),
    createdAt: normalizeDate(
      extract(text, /Creat(?:ed|ion)\s*(?:on|Date)?:\s*(.+)/i) ?? pick(res.data, [...RESPONSE_KEYS.created]),
    ),
    expiresAt: normalizeDate(
      extract(text, /Expir\w*\s*(?:on|Date)?:\s*(.+)/i) ?? pick(res.data, [...RESPONSE_KEYS.expires]),
    ),
    nameservers: parseNameservers(
      (text.match(/Name\s*Server:\s*(.+)/gi) ?? []).join(',') || pick(res.data, [...RESPONSE_KEYS.nameservers]),
    ),
    text,
  };
}

/** Thong tin ten mien trong tai khoan dai ly. */
export async function domainInfo(domain: string): Promise<DomainInfo & RawResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.info, { [FIELDS.domain]: d }, { domainForLog: d });
  return {
    ...res,
    domain: d,
    status: pick(res.data, ['domainstatus', 'status', 'state']),
    registeredAt: normalizeDate(pick(res.data, [...RESPONSE_KEYS.created])),
    expiresAt: normalizeDate(pick(res.data, [...RESPONSE_KEYS.expires])),
    nameservers: parseNameservers(pick(res.data, [...RESPONSE_KEYS.nameservers])),
  };
}

/** Doi nameserver (tro ten mien sang DNS khac). */
export async function setNameservers(domain: string, nameservers: string[]): Promise<RawResult> {
  const d = normalizeDomain(domain);
  const list = parseNameservers(nameservers);
  if (list.length < 2) throw new RegistrarError('Cần tối thiểu 2 nameserver.', 'VALIDATION');

  const params: Record<string, string> = { [FIELDS.domain]: d, [FIELDS.ns]: list.join(',') };
  list.forEach((ns, i) => {
    params[`${FIELDS.ns}${i + 1}`] = ns;
  });
  return ensureOk(await call(ACTIONS.nsSet, params, { method: 'POST', domainForLog: d }), `Đổi nameserver ${d}`);
}

/** Lay danh sach ban ghi DNS hien tai. */
export async function getDnsRecords(domain: string): Promise<{ records: DnsRecord[] } & RawResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.dnsGet, { [FIELDS.domain]: d }, { domainForLog: d });
  return { ...res, records: extractRecords(res.data, d) };
}

/** Ghi de toan bo bo ban ghi DNS cua ten mien. */
export async function setDnsRecords(domain: string, records: DnsRecord[]): Promise<RawResult> {
  const d = normalizeDomain(domain);
  const params: Record<string, string | number> = { [FIELDS.domain]: d };
  records.forEach((r, i) => {
    const n = i + 1;
    params[`${FIELDS.recordType}${n}`] = r.type.toUpperCase();
    params[`${FIELDS.recordName}${n}`] = r.name || '@';
    params[`${FIELDS.recordValue}${n}`] = r.content;
    params[`${FIELDS.recordTtl}${n}`] = r.ttl || 3600;
    if (r.priority !== undefined) params[`${FIELDS.recordPriority}${n}`] = r.priority;
  });
  params['total'] = records.length;
  // Gui kem dang JSON de tuong thich neu API chap nhan tham so `records`
  params['records'] = JSON.stringify(records);

  return ensureOk(await call(ACTIONS.dnsSet, params, { method: 'POST', domainForLog: d }), `Cập nhật DNS ${d}`);
}

/** Danh sach ten mien trong tai khoan dai ly (dung de doi soat dinh ky). */
export async function listDomains(): Promise<{ domains: DomainInfo[] } & RawResult> {
  const res = await call(ACTIONS.list, {});
  const rows = collectRows(res.data);
  const domains: DomainInfo[] = rows
    .map((row) => ({
      domain: String(pick(row, [...RESPONSE_KEYS.domain]) ?? '').toLowerCase(),
      status: pick(row, ['status', 'domainstatus']),
      registeredAt: normalizeDate(pick(row, [...RESPONSE_KEYS.created])),
      expiresAt: normalizeDate(pick(row, [...RESPONSE_KEYS.expires])),
      nameservers: parseNameservers(pick(row, [...RESPONSE_KEYS.nameservers])),
    }))
    .filter((d) => d.domain.includes('.'));
  return { ...res, domains };
}

/** So du tai khoan dai ly. */
export async function getBalance(): Promise<{ balance: number } & RawResult> {
  const res = await call(ACTIONS.balance, {});
  const raw = pick(res.data, [...RESPONSE_KEYS.balance]) ?? '0';
  return { ...res, balance: Number(String(raw).replace(/[^\d.-]/g, '')) || 0 };
}

/* ============================================================== tien ich */

export function normalizeDomain(domain: string): string {
  return String(domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

/** Tach phan duoi cua ten mien theo danh sach TLD da biet (uu tien TLD dai nhat). */
export function splitDomain(domain: string, knownTlds: string[]): { sld: string; tld: string } | null {
  const d = normalizeDomain(domain);
  const sorted = [...knownTlds].map((t) => t.replace(/^\./, '').toLowerCase()).sort((a, b) => b.length - a.length);
  for (const tld of sorted) {
    if (d.endsWith(`.${tld}`)) {
      const sld = d.slice(0, -(tld.length + 1));
      if (sld && !sld.includes('.')) return { sld, tld };
    }
  }
  const parts = d.split('.');
  if (parts.length >= 2) return { sld: parts.slice(0, -1).join('.'), tld: parts.at(-1)! };
  return null;
}

function contactParams(c: RegisterContact): Record<string, string> {
  const country = c.country || 'VN';
  return {
    // Ten truong ho so chu the theo API dai ly P.A.
    // Neu tai lieu cua ban dung ten khac, chi can sua tai day.
    name: c.fullName,
    fullname: c.fullName,
    company: c.orgName ?? '',
    ownertype: c.kind === 'organization' ? '1' : '0',
    idnumber: c.idNumber ?? '',
    id_number: c.idNumber ?? '',
    taxcode: c.taxCode ?? '',
    tax_code: c.taxCode ?? '',
    email: c.email,
    phone: c.phone,
    address: c.address ?? '',
    city: c.city ?? '',
    province: c.province ?? c.city ?? '',
    state: c.province ?? c.city ?? '',
    zipcode: c.postalCode ?? '',
    postalcode: c.postalCode ?? '',
    country,
    birthday: c.birthDate ?? '',
    gender: c.gender ?? '',
  };
}

function extract(text: string, re: RegExp): string | undefined {
  const m = re.exec(text);
  return m?.[1]?.trim();
}

/** Gom cac dong du lieu tu phan hoi dang mang / dang object long nhau. */
function collectRows(data: Flat): Flat[] {
  for (const key of RESPONSE_KEYS.records) {
    const v = data[key];
    if (Array.isArray(v)) {
      return v.map((item) => (typeof item === 'object' && item ? (item as Flat) : { value: item }));
    }
  }
  const items = data['items'];
  if (Array.isArray(items)) return items.map((i) => (typeof i === 'object' && i ? (i as Flat) : { value: i }));
  return Object.keys(data).length ? [data] : [];
}

function extractRecords(data: Flat, domain: string): DnsRecord[] {
  return collectRows(data)
    .map((row): DnsRecord | null => {
      const type = pick(row, ['type', 'recordtype', 'record_type']);
      const content = pick(row, ['value', 'content', 'address', 'data', 'target', 'rdata']);
      if (!type || !content) return null;
      const name = (pick(row, ['name', 'host', 'hostname', 'record', 'subdomain']) ?? '@')
        .replace(new RegExp(`\\.?${domain.replace(/\./g, '\\.')}\\.?$`, 'i'), '')
        .trim() || '@';
      const priority = pick(row, ['priority', 'prio', 'mxpref', 'pref']);
      return {
        id: pick(row, ['id', 'recordid', 'record_id']),
        type: type.toUpperCase(),
        name,
        content,
        ttl: Number(pick(row, ['ttl']) ?? 3600) || 3600,
        ...(priority !== undefined ? { priority: Number(priority) || 0 } : {}),
      };
    })
    .filter((r): r is DnsRecord => r !== null);
}

/* ======================================================= che do gia lap */

/**
 * Sandbox: tra du lieu mau, khong goi mang. Cho phep phat trien / demo khi IP
 * chua duoc P.A whitelist. Bat bang PAVIETNAM_SANDBOX=1.
 */
function sandboxResponse(action: string, params: Record<string, string | number | undefined>): string {
  const domain = String(params[FIELDS.domain] ?? 'example.com');
  const taken = parseInt(sha256(domain).slice(0, 2), 16) % 3 !== 0; // ~1/3 con trong
  const inOneYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

  if (action === ACTIONS.check) {
    return JSON.stringify({ status: 'OK', domain, available: taken ? 0 : 1, message: taken ? 'Domain da duoc dang ky' : 'Domain con trong' });
  }
  if (action === ACTIONS.register || action === ACTIONS.renew) {
    return JSON.stringify({ status: 'OK', domain, transactionid: `SBX${Date.now()}`, expiredate: inOneYear, message: 'Thanh cong (sandbox)' });
  }
  if (action === ACTIONS.whois) {
    return JSON.stringify({
      status: 'OK', domain,
      raw_text: taken
        ? `Domain Name: ${domain}\nRegistrar: P.A Viet Nam (sandbox)\nCreation Date: 2020-01-01\nExpiry Date: ${inOneYear}\nName Server: ns1.pavietnam.vn\nName Server: ns2.pavietnam.vn`
        : `No match for "${domain}"`,
    });
  }
  if (action === ACTIONS.dnsGet) {
    return JSON.stringify({
      status: 'OK',
      records: [
        { id: '1', type: 'A', name: '@', value: '103.28.36.1', ttl: 3600 },
        { id: '2', type: 'CNAME', name: 'www', value: domain, ttl: 3600 },
        { id: '3', type: 'MX', name: '@', value: 'mail.pavietnam.vn', ttl: 3600, priority: 10 },
      ],
    });
  }
  if (action === ACTIONS.list) {
    return JSON.stringify({ status: 'OK', items: [{ domain, status: 'active', expiredate: inOneYear, ns: 'ns1.pavietnam.vn,ns2.pavietnam.vn' }] });
  }
  if (action === ACTIONS.contactGet) {
    return JSON.stringify({
      status: 'OK', domain, name: 'Nguyen Van A', email: 'chuthe@example.vn',
      phone: '0901234567', address: '123 Le Loi', province: 'TP HCM', country: 'VN',
    });
  }
  if (action === ACTIONS.contactSet) {
    return JSON.stringify({ status: 'OK', domain, message: 'Da cap nhat thong tin lien he' });
  }
  if (action === ACTIONS.authCode) {
    return JSON.stringify({ status: 'OK', domain, authcode: `EPP-${sha256(domain).slice(0, 10).toUpperCase()}` });
  }
  if (action === ACTIONS.lockSet) {
    return JSON.stringify({ status: 'OK', domain, lock: params['lock'], message: 'Da cap nhat trang thai khoa' });
  }
  if (action === ACTIONS.balance) {
    return JSON.stringify({ status: 'OK', balance: 50_000_000 });
  }
  return JSON.stringify({ status: 'OK', message: 'Thanh cong (sandbox)' });
}
