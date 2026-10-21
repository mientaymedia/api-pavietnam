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
// Cookie chi gui cho duong dan cua app: chay duoi /ten-mien thi khong lo sang
// site chinh cung ten mien.
const COOKIE_PATH = config.basePath || '/';
// Cong Tai khoan MienTay (/tai-khoan) dung chung phien: KHONG mo cookie ra
// Path=/ (cookie phien se gui cho moi trang Next.js cua site chinh, intent muc
// 9) ma dat them mot cookie cung ten, cung gia tri, Path cua cong. Hai duong
// dan khong long nhau (config.ts kiem) nen moi yeu cau chi mang mot cookie.
const CONG_PATH = config.congTaiKhoanPath;
const MOI_PATH = CONG_PATH ? [COOKIE_PATH, CONG_PATH] : [COOKIE_PATH];

export interface SessionData {
  userId?: number;
  flash?: { type: 'success' | 'error' | 'info'; message: string }[];
  csrf?: string;
  /** Da dat cookie o moi Path (xem datCookie); chi dat mot lan moi phien. */
  cookieChung?: boolean;
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

function datCookie(res: Response, sid: string, paths: string[]): void {
  for (const path of paths) {
    res.cookie(COOKIE, serialize(sid), { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: TTL_MS, path });
  }
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

  // Phien cua /ten-mien la goc: phien moi o day, hoac phien cu chua lan sang
  // cong (dang nhap tu truoc khi bat cong, gio hang cua khach vang lai), dat
  // cookie o moi Path. Phien moi tao o cong chi dat cookie cua cong: ghi de
  // cookie /ten-mien la mat gio hang hay phien dang nhap cu dang giu o do.
  const oCong = Boolean(CONG_PATH) && req.baseUrl === CONG_PATH;
  // Lay TRUOC khi danh dau cookieChung: lan lan sang dau tien phai ghi xuong CSDL
  let snapshot = JSON.stringify(data);
  if (!sid) {
    sid = randomToken(24);
    const coDanhDau = !oCong && MOI_PATH.length > 1;
    if (coDanhDau) data = { cookieChung: true };
    db.prepare(
      `INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    ).run(sid, JSON.stringify(data), req.ip ?? '', String(req.get('user-agent') ?? '').slice(0, 255), isoIn(TTL_MS), nowIso());
    datCookie(res, sid, oCong ? [CONG_PATH] : MOI_PATH);
    snapshot = JSON.stringify(data); // da ghi luc INSERT
  } else if (!oCong && MOI_PATH.length > 1 && !data.cookieChung) {
    datCookie(res, sid, MOI_PATH);
    data.cookieChung = true;
  }

  req.sessionId = sid;
  req.session = data;

  res.on('finish', () => {
    const current = JSON.stringify(req.session);
    if (current === snapshot) return;
    // req.sessionId chu khong phai sid: loginSession doi sang phien moi giua
    // chung, ghi vao sid cu (da xoa) la mat flash dat sau khi dang nhap.
    db.prepare('UPDATE sessions SET data = ?, user_id = ?, expires_at = ? WHERE sid = ?')
      .run(current, req.session.userId ?? null, isoIn(TTL_MS), req.sessionId);
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
  const data: SessionData = { ...req.session, userId, csrf: randomToken(16), cookieChung: MOI_PATH.length > 1 };
  db.prepare(
    `INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(sid, userId, JSON.stringify(data), req.ip ?? '', String(req.get('user-agent') ?? '').slice(0, 255), isoIn(TTL_MS), nowIso());
  // Ca hai Path: dang nhap o cong la da dang nhap o /ten-mien va nguoc lai
  datCookie(res, sid, MOI_PATH);
  req.sessionId = sid;
  req.session = data;
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), userId);
}

export function destroySession(req: Request, res: Response): void {
  db.prepare('DELETE FROM sessions WHERE sid = ?').run(req.sessionId);
  // Xoa ca hai Path: dang xuat mot noi la het phien o moi noi da noi
  for (const path of MOI_PATH) res.clearCookie(COOKIE, { path });
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
