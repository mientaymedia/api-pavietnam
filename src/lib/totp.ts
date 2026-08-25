/**
 * Mat khau mot lan theo thoi gian (TOTP - RFC 6238).
 *
 * Tu viet bang `node:crypto` co san, khong them thu vien ngoai: thuat toan chi
 * la HMAC-SHA1 + cat chuoi, ma day la lop bao ve tai khoan quan tri nen cang it
 * phu thuoc ben ngoai cang tot.
 *
 * Tuong thich Google Authenticator / Microsoft Authenticator / Authy:
 * SHA-1, 6 chu so, chu ky 30 giay.
 */
import crypto from 'node:crypto';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;

const BANG_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Ma hoa Base32 (RFC 4648), khong dem '=' - ung dung xac thuc deu chap nhan. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BANG_BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BANG_BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const sach = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of sach) {
    const idx = BANG_BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`Ky tu Base32 khong hop le: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Sinh khoa bi mat moi (20 byte = 160 bit, dung khuyen nghi cua RFC 4226). */
export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/** So thu tu chu ky 30 giay tinh tu moc 1970. */
export function counterFor(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_PERIOD);
}

/** Sinh ma cho mot chu ky cu the (HOTP - RFC 4226). */
export function codeForCounter(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  // Ghi 8 byte big-endian. Dung BigInt de khong tran so nguyen 32 bit.
  msg.writeBigUInt64BE(BigInt(counter));

  const hmacBuf = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmacBuf[hmacBuf.length - 1]! & 0x0f;
  const binary =
    ((hmacBuf[offset]! & 0x7f) << 24) |
    ((hmacBuf[offset + 1]! & 0xff) << 16) |
    ((hmacBuf[offset + 2]! & 0xff) << 8) |
    (hmacBuf[offset + 3]! & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Ma dang co hieu luc ngay bay gio. */
export function currentCode(secretBase32: string, atMs: number = Date.now()): string {
  return codeForCounter(secretBase32, counterFor(atMs));
}

export interface KetQuaTotp {
  ok: boolean;
  /** Chu ky khop - luu lai de khong cho dung lai chinh ma do (chong phat lai). */
  counter?: number;
}

/**
 * Kiem tra ma nguoi dung nhap.
 *
 * `window = 1` nghia la chap nhan chu ky truoc, hien tai va sau (khoang 90 giay).
 * Can thiet vi dong ho dien thoai thuong lech vai giay, va nguoi dung mat vai
 * giay de go ma.
 *
 * `minCounter`: neu truyen vao, moi chu ky <= gia tri nay deu bi tu choi. Day la
 * chong phat lai - ke nao doc trom duoc ma vua dung cung khong xai lai duoc.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { window?: number; atMs?: number; minCounter?: number | null } = {},
): KetQuaTotp {
  const sach = String(code ?? '').replace(/\D/g, '');
  if (sach.length !== TOTP_DIGITS) return { ok: false };

  const window = opts.window ?? 1;
  const hienTai = counterFor(opts.atMs ?? Date.now());

  for (let d = -window; d <= window; d++) {
    const counter = hienTai + d;
    if (counter < 0) continue;
    if (opts.minCounter != null && counter <= opts.minCounter) continue;
    // So sanh chong do thoi gian
    const mong = codeForCounter(secretBase32, counter);
    if (crypto.timingSafeEqual(Buffer.from(mong), Buffer.from(sach))) return { ok: true, counter };
  }
  return { ok: false };
}

/**
 * Dia chi otpauth:// de ung dung xac thuc quet bang ma QR.
 * Dinh dang theo chuan Key Uri Format cua Google Authenticator.
 */
export function otpauthUri(opts: { secret: string; account: string; issuer: string }): string {
  const nhan = `${opts.issuer}:${opts.account}`;
  const tham = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(nhan)}?${tham.toString()}`;
}

/** Chia khoa thanh nhom 4 ky tu cho de nhap tay: ABCD EFGH IJKL ... */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
