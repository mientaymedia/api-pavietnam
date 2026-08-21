/**
 * ZNS - Zalo Notification Service (gui tin qua Zalo Official Account).
 *
 * ------------------------------------------------------------------------
 *  DIEU QUAN TRONG NHAT: refresh_token cua Zalo XOAY MOI LAN DUNG
 * ------------------------------------------------------------------------
 * Moi lan doi access_token, Zalo tra ve mot refresh_token MOI va vo hieu cai cu.
 * Neu khong luu lai ngay, ban mat quyen goi API va phai vao Zalo Developers cap
 * lai bang tay. Vi vay ham `refreshAccessToken()` luu ca hai token vao bang
 * `settings` NGAY trong cung mot transaction truoc khi tra ket qua.
 *
 * Chuan bi truoc khi dung (tai https://developers.zalo.me):
 *   1. Tao ung dung, lien ket voi Zalo Official Account cua doanh nghiep
 *   2. Lay App ID + Secret Key
 *   3. Cap refresh_token lan dau qua luong OAuth cua Zalo
 *   4. Tao va cho duyet cac mau tin (template) - ZNS chi gui duoc mau DA DUYET
 *
 * Tai lieu: https://developers.zalo.me/docs/zalo-notification-service
 */
import { getSetting, setSetting, setSettings, settings } from './settings.js';
import { httpRequest } from './http.js';
import { log } from './logger.js';
import { db, isoIn, nowIso } from '../db/index.js';

// Cho phep tro sang may chu gia lap khi kiem thu; mac dinh la endpoint that cua Zalo.
const OAUTH_URL = process.env['ZNS_OAUTH_URL'] || 'https://oauth.zaloapp.com/v4/oa/access_token';
const SEND_URL = process.env['ZNS_SEND_URL'] || 'https://business.openapi.zalo.me/message/template';

/** Doi access_token som hon han that 5 phut de tranh dung dung luc het han. */
const EXPIRY_SAFETY_MS = 5 * 60_000;

export class ZnsError extends Error {
  constructor(
    message: string,
    readonly code = '',
    readonly raw = '',
  ) {
    super(message);
    this.name = 'ZnsError';
  }
}

export interface ZnsConfig {
  enabled: boolean;
  appId: string;
  secretKey: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export function znsConfig(): ZnsConfig {
  const base = settings.zns();
  return {
    enabled: base.enabled,
    appId: base.appId,
    secretKey: base.secretKey,
    refreshToken: base.refreshToken,
    accessToken: getSetting('zns.access_token', ''),
    accessTokenExpiresAt: getSetting('zns.access_token_expires_at', ''),
  };
}

export function isZnsReady(): boolean {
  const c = znsConfig();
  return c.enabled && Boolean(c.appId && c.secretKey && c.refreshToken);
}

/* ------------------------------------------------------------------ token */

/**
 * Doi refresh_token lay access_token moi, va LUU LAI refresh_token moi.
 * Zalo vo hieu refresh_token cu ngay sau khi doi.
 */
async function refreshAccessToken(): Promise<string> {
  const c = znsConfig();
  if (!c.appId || !c.secretKey || !c.refreshToken) {
    throw new ZnsError('Chua cau hinh ZNS (App ID / Secret Key / Refresh Token)', 'NO_CONFIG');
  }

  const body = new URLSearchParams({
    app_id: c.appId,
    refresh_token: c.refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const raw = await httpRequest(OAUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', secret_key: c.secretKey },
    body,
    timeoutMs: 20_000,
    retries: 1,
  });

  let parsed: { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number; error_name?: string; error_description?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ZnsError(`Zalo tra ve du lieu khong doc duoc: ${raw.slice(0, 200)}`, 'BAD_RESPONSE', raw);
  }

  if (!parsed.access_token) {
    const msg = parsed.error_description || parsed.error_name || raw.slice(0, 200);
    throw new ZnsError(
      `Khong doi duoc access token: ${msg}. ` +
        'Refresh token co the da het han (3 thang) hoac da bi dung o noi khac - vao Zalo Developers cap lai.',
      String(parsed.error ?? ''),
      raw,
    );
  }

  // Luu ca hai token cung luc. Mat refresh_token moi = mat quyen goi API.
  const expiresInSec = Number(parsed.expires_in ?? 3600) || 3600;
  setSettings(
    {
      'zns.access_token': parsed.access_token,
      'zns.access_token_expires_at': isoIn(expiresInSec * 1000),
      ...(parsed.refresh_token ? { 'zns.refresh_token': parsed.refresh_token } : {}),
    },
    ['zns.access_token', 'zns.refresh_token'],
  );

  log.info('zns_token_refreshed', { expiresInSec, rotatedRefreshToken: Boolean(parsed.refresh_token) });
  return parsed.access_token;
}

/** Lay access_token con han; tu doi moi khi sap het han. */
async function getAccessToken(forceRefresh = false): Promise<string> {
  const c = znsConfig();
  if (!forceRefresh && c.accessToken && c.accessTokenExpiresAt) {
    const remaining = new Date(c.accessTokenExpiresAt).getTime() - Date.now();
    if (Number.isFinite(remaining) && remaining > EXPIRY_SAFETY_MS) return c.accessToken;
  }
  return refreshAccessToken();
}

/* ------------------------------------------------------------------- gui */

export interface SendZnsInput {
  phone: string;
  templateId: string;
  templateData: Record<string, string | number>;
  /** Ten su kien de ghi nhat ky (order_created, domain_activated...). */
  event?: string;
  userId?: number | null;
  trackingId?: string;
}

export interface SendZnsResult {
  ok: boolean;
  msgId?: string;
  error?: string;
  errorCode?: string;
  skipped?: boolean;
}

/**
 * Chuan hoa so dien thoai ve dinh dang Zalo yeu cau: 84xxxxxxxxx
 * (khong dau +, khong so 0 dau).
 */
export function normalizePhone(phone: string): string | null {
  const digits = String(phone ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;

  let n = digits;
  if (n.startsWith('84')) n = n.slice(2);
  else if (n.startsWith('0')) n = n.slice(1);

  // So di dong Viet Nam sau khi bo ma vung: 9 chu so, bat dau bang 3/5/7/8/9
  if (!/^[35789]\d{8}$/.test(n)) return null;
  return `84${n}`;
}

/**
 * Gui mot tin ZNS theo mau da duoc Zalo duyet.
 *
 * KHONG nem loi ra ngoai: ZNS la kenh thong bao phu, that bai khong duoc lam
 * hong luong dat hang / dang ky ten mien. Moi ket qua deu ghi vao `zns_logs`.
 */
export async function sendZns(input: SendZnsInput): Promise<SendZnsResult> {
  const event = input.event ?? '';

  if (!isZnsReady()) {
    logZns({ ...input, event, status: 'skipped', error: 'ZNS chua duoc bat hoac chua cau hinh' });
    return { ok: false, skipped: true, error: 'ZNS chua duoc cau hinh' };
  }
  if (!input.templateId) {
    logZns({ ...input, event, status: 'skipped', error: `Chua khai bao template ID cho su kien "${event}"` });
    return { ok: false, skipped: true, error: 'Chua khai bao template ID' };
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    logZns({ ...input, event, status: 'skipped', error: `So dien thoai khong hop le: ${input.phone}` });
    return { ok: false, skipped: true, error: 'So dien thoai khong hop le' };
  }

  const trackingId = input.trackingId ?? `${event || 'zns'}-${Date.now()}`;
  const payload = {
    phone,
    template_id: input.templateId,
    template_data: input.templateData,
    tracking_id: trackingId,
  };

  try {
    // Thu lai MOT lan neu access token bi tu choi (vd token vua bi thu hoi)
    let result = await postZns(payload, await getAccessToken());
    if (result.errorCode === '-124' || result.errorCode === '-216') {
      log.warn('zns_token_rejected_retrying', { code: result.errorCode });
      result = await postZns(payload, await getAccessToken(true));
    }

    logZns({
      ...input, event, phone, trackingId,
      status: result.ok ? 'sent' : 'failed',
      msgId: result.msgId ?? '',
      errorCode: result.errorCode ?? '',
      error: result.error ?? '',
      request: JSON.stringify(payload),
      response: result.raw,
    });

    if (!result.ok) log.warn('zns_send_failed', { event, code: result.errorCode, error: result.error });
    return { ok: result.ok, ...(result.msgId ? { msgId: result.msgId } : {}), ...(result.error ? { error: result.error } : {}), ...(result.errorCode ? { errorCode: result.errorCode } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logZns({ ...input, event, phone, trackingId, status: 'failed', error: message, request: JSON.stringify(payload) });
    log.error('zns_send_error', { event, error: message });
    return { ok: false, error: message };
  }
}

async function postZns(payload: unknown, accessToken: string) {
  const raw = await httpRequest(SEND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', access_token: accessToken },
    body: JSON.stringify(payload),
    timeoutMs: 20_000,
    retries: 1,
  });

  let parsed: { error?: number; message?: string; data?: { msg_id?: string; sent_time?: string } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `Phan hoi khong doc duoc: ${raw.slice(0, 200)}`, raw };
  }

  const code = Number(parsed.error ?? -1);
  if (code === 0) {
    return { ok: true, msgId: parsed.data?.msg_id ?? '', raw };
  }
  return {
    ok: false,
    errorCode: String(code),
    error: `${parsed.message ?? 'Loi khong xac dinh'} (${explainZnsError(code)})`,
    raw,
  };
}

/** Dien giai cac ma loi ZNS hay gap sang tieng Viet. */
export function explainZnsError(code: number): string {
  const map: Record<number, string> = {
    [-124]: 'Access token khong hop le hoac het han',
    [-125]: 'Access token bi thu hoi',
    [-201]: 'Tham so khong hop le - kiem tra template_data co dung cac truong cua mau khong',
    [-202]: 'Thieu tham so bat buoc',
    [-211]: 'Template khong ton tai hoac chua duoc duyet',
    [-212]: 'Template chua duoc kich hoat',
    [-213]: 'Du lieu truyen vao khong khop voi cau truc template',
    [-216]: 'Ung dung chua duoc lien ket voi Official Account',
    [-224]: 'So dien thoai khong hop le',
    [-226]: 'Nguoi nhan chua tung tuong tac hoac da chan OA',
    [-230]: 'Tai khoan het so du ZNS',
    [-232]: 'Vuot han muc gui trong ngay',
  };
  return map[code] ?? `ma loi ${code}`;
}

function logZns(input: {
  userId?: number | null; phone: string; event: string; templateId?: string; trackingId?: string;
  status: 'sent' | 'failed' | 'skipped'; msgId?: string; errorCode?: string; error?: string;
  request?: string; response?: string;
}): void {
  try {
    db.prepare(
      `INSERT INTO zns_logs (user_id, phone, event, template_id, tracking_id, msg_id, status, error_code, error, request, response, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.userId ?? null, input.phone, input.event, input.templateId ?? '', input.trackingId ?? '',
      input.msgId ?? '', input.status, input.errorCode ?? '', (input.error ?? '').slice(0, 500),
      (input.request ?? '').slice(0, 2000), (input.response ?? '').slice(0, 2000), nowIso(),
    );
  } catch (err) {
    log.warn('zns_log_write_failed', { error: String(err) });
  }
}

/** Xoa access token dang luu, buoc lan gui sau phai lay token moi. */
export function clearZnsAccessToken(): void {
  setSetting('zns.access_token', '');
  setSetting('zns.access_token_expires_at', '');
}
