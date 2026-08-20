import crypto from 'node:crypto';
import { config } from '../config.js';

/* ---------------- Mat khau: scrypt (co san trong Node, khong can native dep) --------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = crypto.scryptSync(plain.normalize('NFKC'), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/* ---------------- Token & so ngau nhien --------------- */

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Ma tham chieu ngan, de doc, dung lam noi dung chuyen khoan. Khong co ky tu de nham (0/O/1/I). */
export function randomCode(len = 8): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[buf[i]! % alphabet.length];
  return out;
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmac(algo: 'sha256' | 'sha512', key: string | Buffer, data: string): string {
  return crypto.createHmac(algo, key).update(data, 'utf8').digest('hex');
}

/** So sanh chuoi chong timing attack. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ---------------- Ma hoa secret luu trong DB (API key cong thanh toan...) --------------- */

function keyBuf(): Buffer {
  return crypto.createHash('sha256').update(config.encryptionKey).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [v, ivB, tagB, dataB] = payload.split('.');
  if (v !== 'v1' || !ivB || !tagB || !dataB) throw new Error('Chuoi ma hoa khong hop le');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf(), Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
}

/** Che bot secret khi hien thi/ghi log: f8237f66... -> f823****dae8 */
export function maskSecret(s: string): string {
  if (!s) return '';
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}${'*'.repeat(Math.min(8, s.length - 8))}${s.slice(-4)}`;
}
