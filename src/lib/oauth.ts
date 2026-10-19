/**
 * Dang nhap bang Zalo, Google, GitHub: OAuth 2.0 Authorization Code + PKCE S256.
 *
 * Tep nay chi lo phan noi chuyen voi nha cung cap (dia chi xin quyen, doi ma,
 * lay ho so). Quyet dinh dang nhap ai, ghep tai khoan nao nam o
 * services/lienKetMxh.ts; state va phien nam o routes/dangNhapMxh.ts.
 *
 * Nguon (doi chieu 19/10/2026, chi tiet o docs/mtm/dang-nhap-mxh/spec.md muc 1):
 *  - GitHub: docs.github.com "Authorizing OAuth apps" (PKCE chi nhan S256).
 *  - Google: developers.google.com/identity/openid-connect/openid-connect.
 *  - Zalo: User Access Token v4 (PKCE bat buoc, secret_key o header).
 *
 * Khong bao gio ghi log ma (code), token hay than phan hoi: LoiMxh chi mang
 * ten buoc va ma HTTP.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { settings } from './settings.js';
import { HttpError, httpRequest } from './http.js';

export type NhaCungCap = 'zalo' | 'google' | 'github';

export const NHA_CUNG_CAP: readonly NhaCungCap[] = ['zalo', 'google', 'github'];

export const TEN_HIEN_THI: Record<NhaCungCap, string> = { zalo: 'Zalo', google: 'Google', github: 'GitHub' };

export function laNhaCungCap(v: unknown): v is NhaCungCap {
  return typeof v === 'string' && (NHA_CUNG_CAP as readonly string[]).includes(v);
}

export interface KhoaBen { id: string; secret: string }

/** Khoa cua mot ben, null khi tat hoac thieu id/bi mat (mac dinh tat khi chua nhap khoa). */
export function khoaCua(ben: NhaCungCap): KhoaBen | null {
  const o = settings.oauth();
  const k = ben === 'zalo'
    ? { bat: o.zaloEnabled, id: o.zaloAppId, secret: o.zaloAppSecret }
    : ben === 'google'
      ? { bat: o.googleEnabled, id: o.googleClientId, secret: o.googleClientSecret }
      : { bat: o.githubEnabled, id: o.githubClientId, secret: o.githubClientSecret };
  return k.bat && k.id && k.secret ? { id: k.id, secret: k.secret } : null;
}

/** Cac ben dang dung duoc, theo thu tu hien nut. */
export function danhSachDangBat(): NhaCungCap[] {
  return NHA_CUNG_CAP.filter((b) => khoaCua(b) !== null);
}

/** Dia chi quay ve, phai khai bao dung tung ky tu o trang developer cua tung ben. */
export function diaChiQuayVe(ben: NhaCungCap): string {
  return `${config.appUrl}/auth/${ben}/callback`;
}

/**
 * Test tro moi dia chi ve may chu gia lap: https://host/duong -> <mock>/host/duong.
 * config da bo bien nay tren production.
 */
function diaChi(url: string): string {
  if (!config.oauth.mockBase) return url;
  const u = new URL(url);
  return `${config.oauth.mockBase}/${u.host}${u.pathname}${u.search}`;
}

/* -------------------------------------------------------------------- PKCE */

/** S256 theo RFC 7636: challenge = base64url(sha256(verifier)), khong dau '='. */
export function maThachThuc(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** verifier 43 ky tu base64url (32 byte ngau nhien), muc toi thieu RFC cho phep va GitHub yeu cau. */
export function taoPkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: maThachThuc(verifier) };
}

/* --------------------------------------------------------- dia chi xin quyen */

export function diaChiXinQuyen(
  ben: NhaCungCap,
  khoa: KhoaBen,
  p: { state: string; challenge: string; nonce?: string },
): string {
  const redirect = diaChiQuayVe(ben);
  if (ben === 'zalo') {
    // Zalo v4 chi nhan S256 nen khong co tham so code_challenge_method
    return diaChi(`https://oauth.zaloapp.com/v4/permission?${new URLSearchParams({
      app_id: khoa.id, redirect_uri: redirect, code_challenge: p.challenge, state: p.state,
    })}`);
  }
  if (ben === 'google') {
    return diaChi(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: khoa.id,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce ?? '',
      code_challenge: p.challenge,
      code_challenge_method: 'S256',
      // Khach co nhieu tai khoan Google thi duoc chon, khong tu vao tai khoan dang mo
      prompt: 'select_account',
    })}`);
  }
  return diaChi(`https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: khoa.id,
    redirect_uri: redirect,
    scope: 'read:user user:email',
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  })}`);
}

/* ------------------------------------------------------------ doi ma, ho so */

export interface HoSoMxh {
  ben: NhaCungCap;
  /** Id cua nguoi dung ben nha cung cap (Google `sub`, GitHub `id`, Zalo `id`). */
  id: string;
  ten: string;
  /** Rong neu ben do khong tra email. */
  email: string;
  /** Chi true khi nha cung cap xac nhan email (Google email_verified, GitHub verified). */
  emailDaXacMinh: boolean;
}

export class LoiMxh extends Error {
  constructor(
    readonly ben: NhaCungCap,
    readonly buoc: 'doi_ma' | 'ho_so' | 'id_token',
    readonly status?: number,
  ) {
    // Chi ten ben va buoc: thong diep nay co the vao log loi chung
    super(`Đăng nhập ${TEN_HIEN_THI[ben]} lỗi ở bước ${buoc}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'LoiMxh';
  }
}

const CHO_MS = 10_000;

/**
 * Goi nha cung cap, doc JSON. Khong thu lai: ma xac thuc chi dung duoc mot lan,
 * goi lai sau khi ben kia da nhan la chac chan hong.
 */
async function goi(
  ben: NhaCungCap,
  buoc: LoiMxh['buoc'],
  url: string,
  opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; form?: Record<string, string> },
): Promise<unknown> {
  try {
    const text = await httpRequest(diaChi(url), {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...opts.headers,
      },
      body: opts.form ? new URLSearchParams(opts.form).toString() : undefined,
      timeoutMs: CHO_MS,
      retries: 0,
      retryOn5xx: false,
    });
    return JSON.parse(text) as unknown;
  } catch (err) {
    // Bo than phan hoi (HttpError.body) va thong diep goc: co the chua ma hay token
    throw new LoiMxh(ben, buoc, err instanceof HttpError ? err.status : undefined);
  }
}

function chuoi(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

function idHopLe(ben: NhaCungCap, buoc: LoiMxh['buoc'], v: unknown): string {
  const id = chuoi(v).trim();
  if (!id || id.length > 128) throw new LoiMxh(ben, buoc);
  return id;
}

function gon(s: string, max = 120): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Doi ma lay ho so. Nem LoiMxh khi ben kia tu choi hoac tra du lieu la. */
export async function layHoSo(
  ben: NhaCungCap,
  khoa: KhoaBen,
  p: { code: string; verifier: string; nonce?: string },
): Promise<HoSoMxh> {
  if (ben === 'zalo') return hoSoZalo(khoa, p);
  if (ben === 'google') return hoSoGoogle(khoa, p);
  return hoSoGithub(khoa, p);
}

async function hoSoZalo(khoa: KhoaBen, p: { code: string; verifier: string }): Promise<HoSoMxh> {
  const token = (await goi('zalo', 'doi_ma', 'https://oauth.zaloapp.com/v4/access_token', {
    method: 'POST',
    headers: { secret_key: khoa.secret },
    form: { code: p.code, app_id: khoa.id, grant_type: 'authorization_code', code_verifier: p.verifier },
  })) as { access_token?: unknown };
  // Zalo bao loi bang HTTP 200 kem { error, error_name }: thieu access_token la loi
  const accessToken = chuoi(token?.access_token);
  if (!accessToken) throw new LoiMxh('zalo', 'doi_ma');

  const me = (await goi('zalo', 'ho_so', 'https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
    headers: { access_token: accessToken },
  })) as { id?: unknown; name?: unknown; error?: unknown };
  if (me?.error !== undefined && Number(me.error) !== 0) throw new LoiMxh('zalo', 'ho_so');

  // Zalo khong tra email: tai khoan moi phai bo sung email (services/lienKetMxh.ts)
  return { ben: 'zalo', id: idHopLe('zalo', 'ho_so', me?.id), ten: gon(chuoi(me?.name)), email: '', emailDaXacMinh: false };
}

/** Doc phan payload cua JWT (khong kiem chu ky, xem ly do o hoSoGoogle). */
function docJwt(jwt: string): Record<string, unknown> | null {
  const phan = jwt.split('.');
  if (phan.length !== 3 || !phan[1]) return null;
  try {
    const v = JSON.parse(Buffer.from(phan[1], 'base64url').toString('utf8')) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function hoSoGoogle(khoa: KhoaBen, p: { code: string; verifier: string; nonce?: string }): Promise<HoSoMxh> {
  const token = (await goi('google', 'doi_ma', 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    form: {
      code: p.code,
      client_id: khoa.id,
      client_secret: khoa.secret,
      redirect_uri: diaChiQuayVe('google'),
      grant_type: 'authorization_code',
      code_verifier: p.verifier,
    },
  })) as { id_token?: unknown };

  // id_token nhan TRUC TIEP tu diem cuoi token qua HTTPS, kem client secret:
  // Google noi khi do khong can kiem chu ky (khong co ben trung gian). Van kiem
  // iss, aud, exp va nonce de token cua ung dung khac hay token cu khong lot vao.
  const c = docJwt(chuoi(token?.id_token));
  if (!c) throw new LoiMxh('google', 'id_token');
  const iss = chuoi(c['iss']);
  const aud = c['aud'];
  const audKhop = aud === khoa.id || (Array.isArray(aud) && aud.includes(khoa.id));
  const exp = Number(c['exp']);
  if (
    (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com')
    || !audKhop
    || !Number.isFinite(exp) || exp * 1000 < Date.now()
    || !p.nonce || chuoi(c['nonce']) !== p.nonce
  ) {
    throw new LoiMxh('google', 'id_token');
  }

  const email = chuoi(c['email']).trim().toLowerCase();
  const daXacMinh = c['email_verified'] === true || c['email_verified'] === 'true';
  return {
    ben: 'google',
    id: idHopLe('google', 'id_token', c['sub']),
    ten: gon(chuoi(c['name']) || email.split('@')[0] || ''),
    email,
    emailDaXacMinh: Boolean(email) && daXacMinh,
  };
}

async function hoSoGithub(khoa: KhoaBen, p: { code: string; verifier: string }): Promise<HoSoMxh> {
  const token = (await goi('github', 'doi_ma', 'https://github.com/login/oauth/access_token', {
    method: 'POST',
    form: {
      client_id: khoa.id,
      client_secret: khoa.secret,
      code: p.code,
      redirect_uri: diaChiQuayVe('github'),
      code_verifier: p.verifier,
    },
  })) as { access_token?: unknown };
  // GitHub cung tra loi bang HTTP 200 kem { error }
  const accessToken = chuoi(token?.access_token);
  if (!accessToken) throw new LoiMxh('github', 'doi_ma');

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // API GitHub tu choi yeu cau khong co User-Agent
    'User-Agent': 'MienTay-Media-ten-mien',
  };
  const u = (await goi('github', 'ho_so', 'https://api.github.com/user', { headers })) as { id?: unknown; login?: unknown; name?: unknown };

  // Email cong khai tren /user co the khong phai email da xac minh: chi tin
  // email primary + verified o /user/emails. Khach khong cap user:email thi
  // coi nhu khong co email, van dang nhap duoc.
  let email = '';
  try {
    const ds = await goi('github', 'ho_so', 'https://api.github.com/user/emails', { headers });
    const chinh = Array.isArray(ds)
      ? (ds as { email?: unknown; primary?: unknown; verified?: unknown }[]).find((e) => e?.primary === true && e?.verified === true)
      : undefined;
    email = chuoi(chinh?.email).trim().toLowerCase();
  } catch {
    email = '';
  }

  return {
    ben: 'github',
    id: idHopLe('github', 'ho_so', u?.id),
    ten: gon(chuoi(u?.name) || chuoi(u?.login)),
    email,
    emailDaXacMinh: Boolean(email),
  };
}
