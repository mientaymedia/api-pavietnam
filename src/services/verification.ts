/**
 * Xac thuc dia chi email khi dang ky.
 *
 * Vi sao can: email la kenh giao thong tin quan tri ten mien (ngay het han,
 * nameserver, canh bao). Email sai = khach mat lien lac voi tai san cua ho.
 *
 * Chinh sach: mac dinh khach VAN dung duoc site khi chua xac thuc, chi bi chan
 * o buoc DAT HANG - de khong can duong nguoi dung ngay tu dau. Doi hanh vi nay
 * bang cau hinh `auth.require_email_verified`.
 */
import { db, isoIn, nowIso } from '../db/index.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { getSettingBool, getSettingNumber } from '../lib/settings.js';
import { log } from '../lib/logger.js';

/** Lien ket xac thuc song bao lau. */
const TOKEN_TTL_MS = 24 * 3600_000;

export interface VerificationUser {
  id: number;
  email: string;
  full_name: string;
  email_verified_at: string | null;
}

export function requireVerifiedToOrder(): boolean {
  return getSettingBool('auth.require_email_verified', false);
}

/** So lan duoc gui lai trong mot gio. */
function resendLimit(): number {
  return getSettingNumber('auth.verify_resend_per_hour', 5);
}

export function isVerified(userId: number): boolean {
  const row = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(userId) as
    | { email_verified_at: string | null }
    | undefined;
  return Boolean(row?.email_verified_at);
}

/**
 * Tao token xac thuc moi. Vo hieu cac token cu cua nguoi dung de mot lien ket
 * cu bi lo khong con dung duoc.
 */
export function issueToken(user: { id: number; email: string }): string {
  const token = randomToken(32);
  db.transaction(() => {
    db.prepare(`UPDATE email_verifications SET used_at = ? WHERE user_id = ? AND used_at IS NULL`)
      .run(nowIso(), user.id);
    db.prepare(
      `INSERT INTO email_verifications (user_id, email, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(user.id, user.email.toLowerCase(), sha256(token), isoIn(TOKEN_TTL_MS), nowIso());
  }).immediate();
  return token;
}

export type VerifyOutcome =
  | { status: 'ok'; userId: number; email: string }
  | { status: 'already_verified'; userId: number }
  | { status: 'expired' }
  | { status: 'invalid' };

/** Doi token lay ket qua xac thuc. An toan khi bam lai lien ket nhieu lan. */
export function consumeToken(token: string): VerifyOutcome {
  if (!token.trim()) return { status: 'invalid' };

  const row = db
    .prepare(
      `SELECT id, user_id, email, expires_at, used_at FROM email_verifications WHERE token_hash = ?`,
    )
    .get(sha256(token)) as
    | { id: number; user_id: number; email: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row) return { status: 'invalid' };

  // Da dung roi nhung tai khoan da xac thuc -> coi nhu thanh cong (khach bam lai lien ket)
  if (row.used_at) {
    return isVerified(row.user_id)
      ? { status: 'already_verified', userId: row.user_id }
      : { status: 'invalid' };
  }
  if (row.expires_at < nowIso()) return { status: 'expired' };

  // Email da doi ke tu luc gui -> lien ket khong con y nghia
  const current = db.prepare('SELECT email FROM users WHERE id = ?').get(row.user_id) as
    | { email: string }
    | undefined;
  if (!current) return { status: 'invalid' };
  if (current.email.toLowerCase() !== row.email.toLowerCase()) return { status: 'invalid' };

  db.transaction(() => {
    db.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
    db.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?')
      .run(nowIso(), nowIso(), row.user_id);
  }).immediate();

  log.info('email_verified', { userId: row.user_id });
  return { status: 'ok', userId: row.user_id, email: current.email };
}

/**
 * Kiem tra co duoc gui lai email xac thuc khong.
 * Gioi han theo NGUOI DUNG (khac voi gioi han theo IP o tang middleware) de
 * mot tai khoan khong the bi dung lam cong cu gui thu rac.
 */
export function canResend(userId: number): { allowed: boolean; sentLastHour: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM email_verifications WHERE user_id = ? AND created_at > ?`,
    )
    .get(userId, isoIn(-3600_000)) as { n: number };
  return { allowed: row.n < resendLimit(), sentLastHour: row.n };
}

/** Danh sach nguoi dung chua xac thuc - dung cho trang quan tri. */
export function unverifiedCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NULL').get() as { n: number }).n;
}
