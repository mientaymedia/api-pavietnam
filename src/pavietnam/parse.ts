/**
 * Bo parse phan hoi cua API P.A Viet Nam.
 *
 * API dai ly co the tra ve JSON, XML hoac van ban dang `key=value` tuy phien ban /
 * tuy action. De khong phu thuoc vao mot dinh dang duy nhat, ta thu lan luot ca ba
 * roi chuan hoa ve mot object phang (key thuong hoa).
 */

export type Flat = Record<string, unknown>;

export function parseResponse(text: string): Flat {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return {};

  return (
    tryJson(trimmed) ?? tryXml(trimmed) ?? tryKeyValue(trimmed) ?? { raw_text: trimmed }
  );
}

function tryJson(text: string): Flat | null {
  if (!/^[[{]/.test(text)) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { items: parsed };
    return typeof parsed === 'object' && parsed !== null ? flatten(parsed as Flat) : null;
  } catch {
    return null;
  }
}

function tryXml(text: string): Flat | null {
  if (!text.startsWith('<')) return null;
  const out: Flat = {};
  // Lay cac the la (khong long nhau) - du cho phan hoi phang cua API dai ly.
  const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1]!.toLowerCase();
    const value = decodeXml(m[2]!.trim());
    if (/<[A-Za-z_]/.test(m[2]!)) {
      // The long nhau: parse de quy roi giu ca hai cach truy cap -
      //   out['result']        = { status: 'OK', ... }   (giu cau truc goc)
      //   out['status']        = 'OK'                    (truy cap phang)
      // Nho vay `pick(data, ['status'])` van doc duoc du API boc trong <result>.
      const child = tryXml(m[2]!.trim());
      pushMulti(out, key, child ?? value);
      if (child) {
        for (const [ck, cv] of Object.entries(child)) {
          if (!(ck in out)) out[ck] = cv;
        }
      }
    } else {
      pushMulti(out, key, value);
    }
  }
  return Object.keys(out).length ? out : null;
}

function tryKeyValue(text: string): Flat | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const out: Flat = {};
  let matched = 0;
  for (const line of lines) {
    const m = /^([\w .\-\[\]]{1,60}?)\s*[:=|]\s*(.*)$/.exec(line);
    if (m) {
      matched++;
      pushMulti(out, m[1]!.trim().toLowerCase().replace(/\s+/g, '_'), m[2]!.trim());
    }
  }
  // Chi coi la key=value neu phan lon dong khop, tranh nhan nham van ban whois
  if (matched >= Math.max(1, Math.ceil(lines.length * 0.5))) {
    out['raw_text'] = text;
    return out;
  }
  return null;
}

function pushMulti(out: Flat, key: string, value: unknown) {
  if (!(key in out)) {
    out[key] = value;
    return;
  }
  const cur = out[key];
  if (Array.isArray(cur)) cur.push(value);
  else out[key] = [cur, value];
}

/** Lam phang object long nhau: {a:{b:1}} -> {a:{b:1}, 'a.b':1, b:1} de tra cuu linh hoat. */
function flatten(obj: Flat, prefix = '', depth = 0): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    const full = prefix ? `${prefix}.${key}` : key;
    out[full] = v;
    if (prefix && !(key in out)) out[key] = v;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) {
      Object.assign(out, flatten(v as Flat, full, depth + 1));
    }
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ------------------------------------------------------------------ tien ich */

/** Lay gia tri dau tien tim thay theo danh sach key uu tien (khong phan biet hoa thuong). */
export function pick(data: Flat, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = data[key.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') {
      return Array.isArray(v) ? String(v[0]) : String(v);
    }
  }
  return undefined;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'ok', 'success', 'available', 'free', 'y']);
const FALSY = new Set(['0', 'false', 'no', 'error', 'fail', 'failed', 'unavailable', 'taken', 'n']);

export function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim().toLowerCase();
  if (TRUTHY.has(s)) return true;
  if (FALSY.has(s)) return false;
  return fallback;
}

/** Chuan hoa ngay ve ISO-8601 UTC. Chap nhan dd/mm/yyyy, yyyy-mm-dd, timestamp. */
export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const s = value.trim();
  if (!s) return undefined;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (dmy) {
    const [, d, mo, y, h = '0', mi = '0', sec = '0'] = dmy;
    return new Date(
      Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +sec),
    ).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  const ts = /^\d{10}$/.test(s) ? Number(s) * 1000 : /^\d{13}$/.test(s) ? Number(s) : NaN;
  // WHOIS hay ghi mui gio dang +0000 (khong co dau hai cham), JS chi doc +00:00
  const isoMuiGio = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const dt = Number.isFinite(ts) ? new Date(ts) : new Date(isoMuiGio);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Tach danh sach nameserver tu chuoi hoac mang. */
export function parseNameservers(value: unknown): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(/[,;\s|]+/);
  return arr
    .map((v) => String(v).trim().toLowerCase().replace(/\.$/, ''))
    .filter((v) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v));
}

/* ------------------------------------------------- dinh dang chuan cua P.A */

export interface PhanHoiPA {
  command: string;
  /** ReturnCode dang so; null khi phan hoi khong co (check_account_still, get_date_domain, so tran). */
  returnCode: number | null;
  returnText: string;
  /** Doi tuong JSON goc (giu nguyen hoa thuong cua khoa), null neu khong phai JSON. */
  json: Record<string, unknown> | null;
}

/**
 * Doc phan hoi theo tai lieu P.A: JSON `{"Command","ReturnCode","ReturnText",...}`
 * (co the kem BOM UTF-8). Loi truoc buoc xac thuc lai la `print_r` cua PHP:
 * `<pre>Array ( [Command] => ... [ReturnCode] => 600 [ReturnText] => ... )</pre>`,
 * hoac dang tran `501 => Loi: ...`; ca hai cung doc ra ReturnCode.
 */
export function docPhanHoiPA(raw: string): PhanHoiPA {
  const s = String(raw ?? '').replace(/^﻿/, '').trim();
  const out: PhanHoiPA = { command: '', returnCode: null, returnText: '', json: null };

  if (/^[[{]/.test(s)) {
    try {
      const v = JSON.parse(s) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        out.json = o;
        const lay = (k: string) => Object.entries(o).find(([kk]) => kk.toLowerCase() === k)?.[1];
        out.command = String(lay('command') ?? '');
        const ma = lay('returncode');
        out.returnCode = ma === undefined || ma === null || ma === '' ? null : Number.isFinite(Number(ma)) ? Number(ma) : null;
        const text = lay('returntext');
        // get_info_domain tra ReturnText la object thong tin lien he
        out.returnText = text && typeof text === 'object' ? JSON.stringify(text) : String(text ?? '');
      } else if (Array.isArray(v)) {
        out.json = { items: v };
      }
      return out;
    } catch {
      // khong phai JSON hop le: thu cac dang duoi
    }
  }

  // Gia tri ket thuc o khoa ke tiep, dau ")" dong mang, xuong dong hoac het chuoi:
  // print_r co the nam tren mot dong hoac nhieu dong
  const printR = (k: string) =>
    new RegExp('\\[' + k + '\\]\\s*=>\\s*(.*?)(?=\\s*\\[[A-Za-z_]+\\]\\s*=>|\\s*\\)\\s*(?:</pre>)?\\s*$|[\\r\\n]|$)', 'is')
      .exec(s)?.[1]?.trim();
  const maPrintR = printR('ReturnCode');
  if (maPrintR !== undefined) {
    out.command = printR('Command') ?? '';
    out.returnCode = /^\d+$/.test(maPrintR) ? Number(maPrintR) : null;
    out.returnText = printR('ReturnText') ?? '';
    return out;
  }

  const tran = /^(\d{3,4})\s*=>\s*(.*)$/s.exec(s);
  if (tran) {
    out.returnCode = Number(tran[1]);
    out.returnText = tran[2]!.replace(/<[^>]+>/g, '').trim();
  }
  return out;
}

/** "3,896" -> 3896; "-830,000" -> -830000; "5.000.000" -> 5000000. Khong doc duoc -> null. */
export function docSoTien(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const s = String(value).trim();
  if (!/\d/.test(s)) return null;
  // P.A dung dau phay ngan cach hang nghin, tien la dong nen khong co phan le
  const so = Number(s.replace(/[^\d-]/g, ''));
  return Number.isFinite(so) ? so : null;
}

/** get_date_domain: "24/01/2014 - 24/01/2016" -> hai moc ISO. */
export function docKhoangNgay(value: string | undefined): { registeredAt?: string; expiresAt?: string } {
  const m = /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(String(value ?? ''));
  if (!m) return {};
  const registeredAt = normalizeDate(m[1]);
  const expiresAt = normalizeDate(m[2]);
  return { ...(registeredAt ? { registeredAt } : {}), ...(expiresAt ? { expiresAt } : {}) };
}
