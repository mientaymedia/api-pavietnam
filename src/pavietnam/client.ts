import dnsPromises from 'node:dns/promises';
import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';
import { httpRequest } from '../lib/http.js';
import { log } from '../lib/logger.js';
import { maskSecret, sha256 } from '../lib/crypto.js';
import { settings } from '../lib/settings.js';
import { boDau } from '../lib/text.js';
import { danhSachTinh, phuongCuaTinh } from '../lib/diaGioi.js';
import {
  ACTIONS, FIELDS, RESPONSE_KEYS, SUCCESS_TOKENS, guiResponseTypeJson, laLenhGhi, lenhNgoaiTaiLieu, type ActionKey,
} from './actions.js';
import { phanLoaiMa } from './maLoi.js';
import {
  asBool, docKhoangNgay, docPhanHoiPA, docSoTien, normalizeDate, parseNameservers, parseResponse, pick, type Flat,
} from './parse.js';
import {
  THAM_SO_BI_MAT, laTenMienVn, matKhauTenMienHopLe, thamSoDangKy, thamSoDoiDnsQuocTe, thamSoDoiDnsVn, thamSoGiaHan,
  type NameserverPA,
} from './thamSo.js';
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
  endpointTest: string;
  username: string;
  apikey: string;
}

/** Lay thong tin dang nhap: uu tien cau hinh trong Control Panel, sau do den .env. */
function credentials(override?: Partial<PaCredentials>): PaCredentials {
  const cp = settings.pa();
  return {
    endpoint: override?.endpoint || cp.endpoint || config.pa.endpoint,
    endpointTest: override?.endpointTest || cp.endpointTest || config.pa.endpointTest,
    username: override?.username || cp.username || config.pa.username,
    apikey: override?.apikey || cp.apikey || config.pa.apikey,
  };
}

/** Che do gia lap: bat qua Control Panel hoac PAVIETNAM_SANDBOX=1. */
function sandboxEnabled(): boolean {
  return settings.pa().sandbox;
}

/** Che do thu: lenh ghi di interface_test.php (P.A tra 900, khong tru tien). */
export function cheDoThuDangBat(): boolean {
  return settings.pa().useTestEndpoint;
}

/** Duong dan co dung la endpoint thu cua P.A khong (interface_test.php). */
export function laEndpointThu(url: string): boolean {
  try {
    return /\/interface_test\.php$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/* ============================================================== goi API tho */

export interface CallOptions {
  /** Gui bang POST thay vi GET. Tai lieu P.A dung GET cho moi lenh, nen mac dinh GET. */
  method?: 'GET' | 'POST';
  credentials?: Partial<PaCredentials>;
  /** Ghi vao api_logs kem ten mien lien quan. */
  domainForLog?: string;
}

/**
 * Goi mot lenh bat ky cua API dai ly P.A.
 * Dung truc tiep khi ban can mot lenh chua duoc boc thanh ham rieng.
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
    // Loi nay co the hien ra o tim cua khach, nen khong neu ten nha dang ky.
    throw new RegistrarError(
      'Chưa cấu hình username/API Key của nhà đăng ký. Vào Control Panel > Cấu hình API hoặc đặt PAVIETNAM_USERNAME / PAVIETNAM_APIKEY trong .env.',
      'NO_CREDENTIALS',
    );
  }

  // Che do thu chi doi endpoint cua lenh ghi (tai lieu chi co link thu cho nhom
  // nay); 900 chi la thanh cong khi lenh thuc su di interface_test.php
  const diThu = !sandbox && cheDoThuDangBat() && laLenhGhi(action);
  const endpoint = diThu ? cred.endpointTest : cred.endpoint;
  const endpointThu = diThu && laEndpointThu(endpoint);

  const query = new URLSearchParams();
  query.set(FIELDS.command, action);
  query.set('username', cred.username || 'sandbox');
  query.set('apikey', cred.apikey || 'sandbox');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
  }
  if (guiResponseTypeJson(action)) query.set('responsetype', 'json');

  // Chuoi an toan de ghi log: khong bao gio luu API Key that hay mat khau ten mien
  const safeQuery = new URLSearchParams(query);
  for (const k of THAM_SO_BI_MAT) {
    if (safeQuery.has(k)) safeQuery.set(k, maskSecret(query.get(k) ?? ''));
  }
  const logged = `${endpoint}?${safeQuery.toString()}`;

  // Lenh ghi KHONG tu thu lai o tang HTTP: het thoi gian cho chua chac P.A chua
  // lam, goi lai co the dang ky / gia han hai lan. Khau cap phat tu kiem roi moi thu.
  const retries = laLenhGhi(action) ? 0 : config.pa.retries;

  const started = Date.now();
  let raw = '';
  let ok = false;
  try {
    if (sandbox) {
      raw = sandboxResponse(action, params);
    } else if ((opts.method ?? 'GET') === 'POST') {
      raw = await httpRequest(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: query.toString(),
        timeoutMs: config.pa.timeoutMs,
        retries,
      });
    } else {
      raw = await httpRequest(`${endpoint}?${query.toString()}`, { timeoutMs: config.pa.timeoutMs, retries });
    }

    const data = parseResponse(raw);
    const pa = docPhanHoiPA(raw);
    let interpreted: Pick<RawResult, 'ok' | 'code' | 'message'>;
    if (pa.returnCode !== null) {
      // Dinh dang chuan cua tai lieu: quyet dinh theo ReturnCode. check_domain
      // dung ReturnCode 0/1/2 lam cau tra loi nghiep vu, khong phai loi.
      const nghiepVu = action === ACTIONS.owned && [0, 1, 2].includes(pa.returnCode);
      const thanhCong = nghiepVu || phanLoaiMa(pa.returnCode, endpointThu) === 'thanh_cong';
      interpreted = {
        ok: thanhCong,
        code: String(pa.returnCode),
        message: pa.returnText || (thanhCong ? '' : lamSachPhanHoi(raw).slice(0, 500)),
      };
    } else {
      interpreted = interpret(data, raw);
    }
    ok = interpreted.ok;
    const result: RawResult = {
      raw, data, durationMs: Date.now() - started, ...interpreted, returnCode: pa.returnCode, endpointThu,
    };
    writeApiLog(action, opts.domainForLog ?? String(params[FIELDS.domain] ?? ''), logged, raw, ok, result.durationMs);
    return result;
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    writeApiLog(action, opts.domainForLog ?? String(params[FIELDS.domain] ?? ''), logged, `LỖI: ${message}`, false, durationMs);
    log.error('pavietnam_call_failed', { action, error: message });
    if (err instanceof RegistrarError) throw err;
    throw new RegistrarError(`Không kết nối được API nhà đăng ký: ${message}`, 'NETWORK', raw, 'tam_thoi');
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

/**
 * Doc trang thai thanh cong / ma loi / thong bao tu phan hoi KHONG co ReturnCode
 * (so tran cua check_whois, van ban WHOIS, du lieu gia lap, lenh ngoai tai lieu).
 * Phan hoi co ReturnCode duoc `call` doc theo bang phan loai, khong qua day.
 */
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

/** Loi kem nhom ma (src/pavietnam/maLoi.ts) de khau cap phat biet lam gi tiep. */
function ensureOk(res: RawResult, what: string): RawResult {
  if (res.ok) return res;
  const nhom = res.returnCode !== null && res.returnCode !== undefined ? phanLoaiMa(res.returnCode, res.endpointThu) : '';
  throw new RegistrarError(res.message || `${what} thất bại`, res.code, res.raw, nhom);
}

/**
 * Chan som lenh khong co trong tai lieu P.A o che do that (xem
 * `lenhNgoaiTaiLieu`). Gia lap van chay de dev / test man hinh cu.
 */
function chanNgoaiTaiLieu(key: ActionKey, viec: string): void {
  if (sandboxEnabled() || !lenhNgoaiTaiLieu(key)) return;
  throw new RegistrarError(
    `${viec} chưa hỗ trợ qua API của nhà đăng ký. Vui lòng liên hệ bộ phận hỗ trợ để được xử lý.`,
    'UNSUPPORTED',
    '',
    'nguoi_xu_ly',
  );
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
 * Ket qua kiem tra ten mien co phai cau tra loi hop le cua P.A khong. Ten mien
 * thu da co chu thi status co the la "Domain not available" (interpret coi la
 * ok=false vi co "not"), nhung do van la ket noi tot. Nen: ok thi dat; khong ok
 * thi chi dat khi la cau tra loi nghiep vu va khong co dau hieu tu choi nao.
 * Khong ro thi coi la THAT BAI (an toan, quan tri xem phan hoi tho).
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

/** Doc trans_id, trans_money, trans_accountstill (return_full=1). */
function ketQuaGiaoDich(res: RawResult, domain: string): RegisterResult {
  return {
    ...res,
    domain,
    providerRef: pick(res.data, ['trans_id']) ?? '',
    // trans_money la so am ("-830,000"): luu so tien bi tru, so duong
    transMoney: Math.abs(docSoTien(pick(res.data, ['trans_money'])) ?? 0),
    accountStill: docSoTien(pick(res.data, ['trans_accountstill'])),
  };
}

/**
 * Dang ky ten mien bang register_domain_vietnam (duoi .vn) hoac
 * register_domain_quocte. Mat khau ten mien do khau cap phat sinh va giu (dung
 * lai khi thu lai), nen nhan vao chu khong tu sinh o day.
 */
export async function registerDomain(input: {
  domain: string;
  tld: string;
  years: number;
  contact: RegisterContact;
  nameservers: string[];
  password: string;
}): Promise<RegisterResult> {
  const d = normalizeDomain(input.domain);
  if (!matKhauTenMienHopLe(input.password)) {
    throw new RegistrarError('Mật khẩu tên miền không đúng quy định của P.A (8 đến 15 ký tự a-z, 0-9, có cả chữ và số).', 'VALIDATION', '', 'du_lieu');
  }
  const params = thamSoDangKy({
    domain: d,
    tld: input.tld,
    years: input.years,
    password: input.password,
    nameservers: input.nameservers,
    contact: input.contact,
    sendmail: settings.pa().sendmail,
  });
  const action = laTenMienVn(input.tld) ? ACTIONS.registerVn : ACTIONS.registerIntl;
  const res = ensureOk(await call(action, params, { domainForLog: d }), `Đăng ký ${d}`);
  return ketQuaGiaoDich(res, d);
}

/** Gia han ten mien (renew_domain, ca .vn lan quoc te). */
export async function renewDomain(domain: string, years: number): Promise<RegisterResult> {
  const d = normalizeDomain(domain);
  const res = ensureOk(
    await call(ACTIONS.renew, thamSoGiaHan(d, years, settings.pa().sendmail), { domainForLog: d }),
    `Gia hạn ${d}`,
  );
  return ketQuaGiaoDich(res, d);
}

/** Ngay dang ky va ngay het han (get_date_domain: Date "dd/mm/yyyy - dd/mm/yyyy"). */
export async function getDomainDates(domain: string): Promise<{ registeredAt?: string; expiresAt?: string } & RawResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.dates, { [FIELDS.domain]: d }, { domainForLog: d });
  const ngay = docKhoangNgay(pick(res.data, ['date']));
  if (!ngay.expiresAt) {
    throw new RegistrarError(res.message || `P.A không trả ngày sử dụng của ${d}`, res.code || 'NO_DATE', res.raw);
  }
  return { ...res, ok: true, ...ngay };
}

/**
 * Ten mien co thuoc tai khoan dai ly khong (check_domain).
 * 1: thuoc quyen quan ly, 2: thuoc dai ly nhung da qua han, 0: khong co trong he thong.
 */
export async function checkOwned(domain: string): Promise<{ state: 0 | 1 | 2 | null } & RawResult> {
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.owned, { [FIELDS.domain]: d }, { domainForLog: d });
  const state = res.returnCode === 0 || res.returnCode === 1 || res.returnCode === 2 ? res.returnCode : null;
  return { ...res, state };
}

/**
 * Chuyen ten mien ve (transfer-in). Tai lieu P.A KHONG co lenh nay: chi chay o
 * che do gia lap hoac khi chu dat PA_ACTION_TRANSFER.
 */
export async function transferDomain(input: {
  domain: string;
  years: number;
  authCode: string;
  contact?: RegisterContact;
}): Promise<RegisterResult> {
  chanNgoaiTaiLieu('transfer', 'Chuyển tên miền về');
  const d = normalizeDomain(input.domain);
  const params: Record<string, string | number> = {
    [FIELDS.domain]: d,
    [FIELDS.years]: input.years,
    [FIELDS.authCode]: input.authCode,
  };
  const res = ensureOk(await call(ACTIONS.transfer, params, { domainForLog: d }), `Chuyển tên miền ${d}`);
  return {
    ...ketQuaGiaoDich(res, d),
    providerRef: pick(res.data, [...RESPONSE_KEYS.transactionId]) ?? '',
    expiresAt: normalizeDate(pick(res.data, [...RESPONSE_KEYS.expires])),
  };
}

/**
 * Doc thong tin chu the dang luu tai nha dang ky (get_info_domain, tai lieu
 * ghi chi ho tro ten mien quoc te).
 */
export async function getDomainContact(domain: string): Promise<{ contact: Record<string, string> } & RawResult> {
  const d = normalizeDomain(domain);
  if (laTenMienVn(d.split('.').slice(1).join('.')) && !sandboxEnabled()) {
    throw new RegistrarError('Tên miền Việt Nam không đọc được thông tin chủ thể qua API của nhà đăng ký.', 'UNSUPPORTED');
  }
  const res = ensureOk(await call(ACTIONS.infoGet, { [FIELDS.domain]: d }, { domainForLog: d }), `Đọc thông tin ${d}`);

  const doc = (keys: string[]) => pick(res.data, keys) ?? '';
  return {
    ...res,
    contact: {
      fullName: doc(['owner_name', 'name', 'fullname']),
      orgName: doc(['owner_company', 'company']),
      email: doc(['owner_email', 'email']),
      phone: doc(['owner_phone', 'phone']),
      address: doc(['owner_address', 'address']),
      city: doc(['owner_city', 'city']),
      province: doc(['owner_city', 'province']),
      country: doc(['owner_country', 'country']),
    },
  };
}

/**
 * Cap nhat THONG TIN LIEN HE cua chu the (email, dien thoai, dia chi) bang
 * set_info_domain (chi ten mien quoc te). Ten chu the va ten to chuc gui "-"
 * (tai lieu: "-" la khong cap nhat): day khong phai doi chu the.
 *
 * KHONG dung de doi CHU THE sang nguoi/to chuc khac - viec do la thu tuc phap ly
 * rieng, xem `src/services/domainContact.ts`.
 */
export async function updateDomainContact(domain: string, contact: RegisterContact): Promise<RawResult> {
  const d = normalizeDomain(domain);
  if (laTenMienVn(d.split('.').slice(1).join('.')) && !sandboxEnabled()) {
    throw new RegistrarError(
      'Tên miền Việt Nam cập nhật thông tin chủ thể bằng bản khai, chưa làm được qua API. Vui lòng liên hệ bộ phận hỗ trợ.',
      'UNSUPPORTED',
    );
  }
  const diaChi = [contact.address, contact.ward, contact.province].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  const khong = '-';
  const params: Record<string, string> = {
    [FIELDS.domain]: d,
    owner_name: khong,
    owner_company: khong,
    owner_email: contact.email || khong,
    owner_address: diaChi || khong,
    owner_city: (contact.province ?? '').trim() || khong,
    owner_country: 'VN',
    owner_phone: contact.phone || khong,
  };
  for (const nhom of ['admin', 'tech', 'billing']) {
    for (const truong of ['name', 'company', 'email', 'address', 'city', 'country', 'phone']) params[`${nhom}_${truong}`] = khong;
  }
  return ensureOk(await call(ACTIONS.infoSet, params, { domainForLog: d }), `Cập nhật thông tin liên hệ ${d}`);
}

/**
 * Lay ma EPP (Auth Code) de khach CHUYEN TEN MIEN DI noi khac.
 *
 * Day la quyen cua chu ten mien - khong duoc gay kho de. Nhung cung la duong
 * chiem doat ten mien neu lot vao tay nguoi khac, nen tang tren ghi nhat ky
 * va gui email bao cho chu so huu moi lan ma duoc lay. Tai lieu P.A khong co
 * lenh nay (chi chay o gia lap hoac khi chu dat PA_ACTION_AUTH_CODE).
 */
export async function getAuthCode(domain: string): Promise<{ authCode: string } & RawResult> {
  chanNgoaiTaiLieu('authCode', 'Lấy mã EPP');
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
 * Tai lieu P.A khong co lenh nay.
 */
export async function setDomainLock(domain: string, locked: boolean): Promise<RawResult> {
  chanNgoaiTaiLieu('lockSet', 'Khóa chuyển đổi tên miền');
  const d = normalizeDomain(domain);
  return ensureOk(
    await call(
      ACTIONS.lockSet,
      { [FIELDS.domain]: d, [FIELDS.lock]: locked ? '1' : '0', status: locked ? 'lock' : 'unlock' },
      { domainForLog: d },
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

/**
 * Thong tin ten mien de dong bo (job sync_domain). P.A khong co lenh doc trang
 * thai / nameserver, nen chi lay ngay dang ky va ngay het han qua get_date_domain.
 */
export async function domainInfo(domain: string): Promise<DomainInfo & RawResult> {
  const res = await getDomainDates(domain);
  return {
    ...res,
    domain: normalizeDomain(domain),
    ...(res.registeredAt ? { registeredAt: res.registeredAt } : {}),
    ...(res.expiresAt ? { expiresAt: res.expiresAt } : {}),
    nameservers: [],
  };
}

/** Phan giai ten nameserver ra IPv4 (de rieng de test thay duoc). */
export const phanGiaiIp = {
  resolve4: (host: string): Promise<string[]> => dnsPromises.resolve4(host),
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** "ns1.abc.vn" hoac "ns1.abc.vn 1.2.3.4" hoac { host, ip } -> { host, ip? }. */
export function docNameserver(v: string | NameserverPA): NameserverPA | null {
  const [hostRaw = '', ipRaw = ''] = typeof v === 'string' ? v.trim().split(/[\s=]+/) : [v.host, v.ip ?? ''];
  const host = parseNameservers(hostRaw)[0];
  if (!host) return null;
  const ip = ipRaw.trim();
  if (ip && !IPV4.test(ip)) return null;
  return ip ? { host, ip } : { host };
}

/**
 * Doi nameserver.
 * - Ten mien .vn: change_dns_domain_vietnam, toi da 3, BAT BUOC IP cho 2 cai dau.
 *   Khach khong nhap IP thi tu phan giai (resolve4); khong phan giai duoc thi
 *   bao khach nhap kem IP, khong gui P.A thieu IP.
 * - Quoc te: change_dns_domain_quocte, toi da 4.
 */
export async function setNameservers(domain: string, nameservers: (string | NameserverPA)[]): Promise<RawResult> {
  const d = normalizeDomain(domain);
  const vn = laTenMienVn(d.split('.').slice(1).join('.'));
  const list = nameservers.map(docNameserver);
  if (list.some((n) => n === null)) throw new RegistrarError('Nameserver hoặc địa chỉ IP không hợp lệ.', 'VALIDATION');
  const ns = (list as NameserverPA[]).filter((n, i, a) => a.findIndex((x) => x.host === n.host) === i);
  if (ns.length < 2) throw new RegistrarError('Cần tối thiểu 2 nameserver.', 'VALIDATION');
  const toiDa = vn ? 3 : 4;
  if (ns.length > toiDa) throw new RegistrarError(`Tối đa ${toiDa} nameserver.`, 'VALIDATION');

  if (!vn) {
    return ensureOk(
      await call(ACTIONS.dnsIntl, thamSoDoiDnsQuocTe(d, ns.map((n) => n.host)), { domainForLog: d }),
      `Đổi nameserver ${d}`,
    );
  }

  for (const n of ns) {
    if (n.ip) continue;
    try {
      const ips = await phanGiaiIp.resolve4(n.host);
      if (ips[0]) n.ip = ips[0];
    } catch {
      // de trong, kiem ngay duoi
    }
    if (!n.ip) {
      throw new RegistrarError(
        `Không tìm được địa chỉ IP của ${n.host}. Tên miền .vn bắt buộc kèm IP, vui lòng nhập theo dạng "${n.host} 1.2.3.4".`,
        'VALIDATION',
      );
    }
  }
  return ensureOk(await call(ACTIONS.dnsVn, thamSoDoiDnsVn(d, ns), { domainForLog: d }), `Đổi nameserver ${d}`);
}

/** Lay danh sach ban ghi DNS hien tai. Tai lieu P.A khong co lenh nay. */
export async function getDnsRecords(domain: string): Promise<{ records: DnsRecord[] } & RawResult> {
  chanNgoaiTaiLieu('dnsGet', 'Đọc bản ghi DNS');
  const d = normalizeDomain(domain);
  const res = await call(ACTIONS.dnsGet, { [FIELDS.domain]: d }, { domainForLog: d });
  return { ...res, records: extractRecords(res.data, d) };
}

/** Ghi de toan bo bo ban ghi DNS cua ten mien. Tai lieu P.A khong co lenh nay. */
export async function setDnsRecords(domain: string, records: DnsRecord[]): Promise<RawResult> {
  chanNgoaiTaiLieu('dnsSet', 'Sửa bản ghi DNS');
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
  params['records'] = JSON.stringify(records);

  return ensureOk(await call(ACTIONS.dnsSet, params, { method: 'POST', domainForLog: d }), `Cập nhật DNS ${d}`);
}

/** Danh sach ten mien trong tai khoan dai ly. Tai lieu P.A khong co lenh nay. */
export async function listDomains(): Promise<{ domains: DomainInfo[] } & RawResult> {
  chanNgoaiTaiLieu('list', 'Liệt kê tên miền');
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

/**
 * So du tai khoan dai ly (check_account_still). P.A tra
 * `{"Command","Username","Money":"3,896"}` (da xac minh that): Money la dong,
 * dau phay ngan cach hang nghin. Khong co Money la loi (IP, key...).
 */
export async function getBalance(): Promise<{ balance: number } & RawResult> {
  const res = await call(ACTIONS.balance, {});
  const money = docSoTien(pick(res.data, ['money']));
  if (money === null) {
    return { ...res, ok: false, message: res.message || lamSachPhanHoi(res.raw).slice(0, 300), balance: 0 };
  }
  return { ...res, ok: true, balance: money };
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
 * chua duoc P.A whitelist. Bat bang PAVIETNAM_SANDBOX=1. Lenh co trong tai lieu
 * tra dung dinh dang Command/ReturnCode/ReturnText cua P.A.
 */
function sandboxResponse(action: string, params: Record<string, string | number | undefined>): string {
  const domain = String(params[FIELDS.domain] ?? (params['domainName'] ? `${params['domainName']}.${params['domainExt']}` : 'example.com'));
  const taken = parseInt(sha256(domain).slice(0, 2), 16) % 3 !== 0; // ~1/3 con trong
  const inOneYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
  const pa = (them: Record<string, unknown> = {}) =>
    JSON.stringify({ Command: action, ReturnCode: 200, ReturnText: 'Thuc hien thanh cong', ...them });

  if (action === ACTIONS.check) {
    return JSON.stringify({ status: 'OK', domain, available: taken ? 0 : 1, message: taken ? 'Domain da duoc dang ky' : 'Domain con trong' });
  }
  if (action === ACTIONS.registerVn || action === ACTIONS.registerIntl || action === ACTIONS.renew) {
    return pa({ trans_id: `SBX${Date.now()}`, trans_domain: domain, trans_money: '-0', trans_accountstill: '50,000,000' });
  }
  if (action === ACTIONS.dnsVn || action === ACTIONS.dnsIntl || action === ACTIONS.infoSet || action === ACTIONS.changePassword) {
    return pa();
  }
  if (action === ACTIONS.dates) {
    return JSON.stringify({ Command: action, Domain: domain, Date: `${dmy(new Date().toISOString())} - ${dmy(inOneYear)}` });
  }
  if (action === ACTIONS.balance) {
    return JSON.stringify({ Command: action, Username: 'sandbox', Money: '50,000,000' });
  }
  if (action === ACTIONS.owned) {
    return JSON.stringify({ Command: action, ReturnCode: 1, ReturnText: 'Domain thuoc quyen quan ly cua ban' });
  }
  if (action === ACTIONS.province) {
    return JSON.stringify(danhSachTinh().map((t) => ({ id: t.id, name: t.ten })));
  }
  if (action === ACTIONS.ward) {
    return JSON.stringify(phuongCuaTinh(String(params['province_id'] ?? '')).map((p) => ({ id: p.id, name: p.ten })));
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
  if (action === ACTIONS.infoGet) {
    return pa({
      ReturnText: {
        owner_name: 'Nguyen Van A', owner_email: 'chuthe@example.vn', owner_phone: '0901234567',
        owner_address: '123 Le Loi', owner_city: 'TP HCM', owner_country: 'VN',
      },
    });
  }
  if (action === ACTIONS.authCode) {
    return JSON.stringify({ status: 'OK', domain, authcode: `EPP-${sha256(domain).slice(0, 10).toUpperCase()}` });
  }
  if (action === ACTIONS.lockSet) {
    return JSON.stringify({ status: 'OK', domain, lock: params['lock'], message: 'Da cap nhat trang thai khoa' });
  }
  return JSON.stringify({ status: 'OK', message: 'Thanh cong (sandbox)' });
}
