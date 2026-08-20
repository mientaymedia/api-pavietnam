/**
 * Phien dang nhap luu trong SQLite, cookie chi chua session id da ky HMAC.
 * Khong dung thu vien ngoai de giam be mat phu thuoc va de kiem soat bao mat.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { db, isoIn, nowIso, parseJson } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';

const COOKIE = 'sid';
const TTL_MS = 30 * 24 * 3600_000; // 30 ngay

export interface SessionData {
  userId?: number;
  flash?: { type: 'success' | 'error' | 'info'; message: string }[];
  csrf?: string;
  [key: string]: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionId: string;
      session: SessionData;
      /** Khoa gio hang: theo user neu da dang nhap, nguoc lai theo phien. */
      cartKey: string;
      currentUser?: {
        id: number; email: string; full_name: string; role: 'customer' | 'staff' | 'admin'; balance: number;
      };
    }
  }
}

function sign(value: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function serialize(sid: string): string {
  return `${sid}.${sign(sid)}`;
}

function deserialize(raw: string | undefined): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const sid = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(sid);
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? sid : null;
}

export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cookies = req.cookies as Record<string, string> | undefined;
  let sid = deserialize(cookies?.[COOKIE]);
  let data: SessionData = {};

  if (sid) {
    const row = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?').get(sid) as
      | { data: string; expires_at: string }
      | undefined;
    if (row && row.expires_at > nowIso()) {
      data = parseJson<SessionData>(row.data, {});
    } else {
      if (row) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      sid = null;
    }
  }

  if (!sid) {
    sid = randomToken(24);
    db.prepare(
      `INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, NULL, '{}', ?, ?, ?, ?)`,
    ).run(sid, req.ip ?? '', String(req.get('user-agent') ?? '').slice(0, 255), isoIn(TTL_MS), nowIso());
    res.cookie(COOKIE, serialize(sid), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: TTL_MS,
      path: '/',
    });
  }

  req.sessionId = sid;
  req.session = data;

  const snapshot = JSON.stringify(data);
  res.on('finish', () => {
    const current = JSON.stringify(req.session);
    if (current === snapshot) return;
    db.prepare('UPDATE sessions SET data = ?, user_id = ?, expires_at = ? WHERE sid = ?')
      .run(current, req.session.userId ?? null, isoIn(TTL_MS), sid);
  });

  // Nap thong tin nguoi dung dang dang nhap
  if (data.userId) {
    const user = db
      .prepare(`SELECT id, email, full_name, role, balance, status FROM users WHERE id = ?`)
      .get(data.userId) as Request['currentUser'] & { status?: string } | undefined;
    if (user && user.status !== 'suspended') {
      const { status: _ignored, ...rest } = user;
      req.currentUser = rest;
    } else {
      delete req.session.userId;
    }
  }

  req.cartKey = req.currentUser ? `user:${req.currentUser.id}` : sid;
  next();
}

/** Dang nhap: xoay session id de chong session fixation. */
export function loginSession(req: Request, res: Response, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE sid = ?').run(req.sessionId);
  const sid = randomToken(24);
  const data: SessionData = { ...req.session, userId, csrf: randomToken(16) };
  db.prepare(
    `INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(sid, userId, JSON.stringify(data), req.ip ?? '', String(req.get('user-agent') ?? '').slice(0, 255), isoIn(TTL_MS), nowIso());
  res.cookie(COOKIE, serialize(sid), { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: TTL_MS, path: '/' });
  req.sessionId = sid;
  req.session = data;
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), userId);
}

export function destroySession(req: Request, res: Response): void {
  db.prepare('DELETE FROM sessions WHERE sid = ?').run(req.sessionId);
  res.clearCookie(COOKIE, { path: '/' });
  req.session = {};
}

/** Thong bao 1 lan (hien o request tiep theo roi tu xoa). */
export function flash(req: Request, type: 'success' | 'error' | 'info', message: string): void {
  req.session.flash = [...(req.session.flash ?? []), { type, message }];
}

export function takeFlash(req: Request): { type: string; message: string }[] {
  const items = req.session.flash ?? [];
  if (items.length) delete req.session.flash;
  return items;
}

/** Don session het han (goi dinh ky). */
export function purgeExpiredSessions(): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso()).changes;
}
