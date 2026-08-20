import type { NextFunction, Request, Response } from 'express';
import { db, nowIso } from '../db/index.js';
import { sha256 } from '../lib/crypto.js';
import { flash } from './session.js';

/** Bat buoc dang nhap; chua dang nhap thi chuyen sang trang dang nhap kem duong dan quay lai. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.currentUser) return next();
  flash(req, 'error', 'Vui long dang nhap de tiep tuc.');
  res.redirect(`/dang-nhap?next=${encodeURIComponent(req.originalUrl)}`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.currentUser && (req.currentUser.role === 'admin' || req.currentUser.role === 'staff')) return next();
  res.status(403).render('error', {
    title: 'Khong co quyen truy cap',
    message: 'Ban khong co quyen vao khu vuc quan tri.',
  });
}

/** Xac thuc REST API bang Bearer token (cho khach tu xay front-end rieng). */
export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Thieu API token. Gui header: Authorization: Bearer <token>' });
    return;
  }

  const row = db
    .prepare(
      `SELECT t.id, t.user_id, t.scopes, u.email, u.full_name, u.role, u.balance, u.status
       FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
    )
    .get(sha256(token)) as
    | { id: number; user_id: number; scopes: string; email: string; full_name: string; role: string; balance: number; status: string }
    | undefined;

  if (!row || row.status === 'suspended') {
    res.status(401).json({ error: 'API token khong hop le hoac da bi thu hoi' });
    return;
  }

  db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
  req.currentUser = {
    id: row.user_id, email: row.email, full_name: row.full_name,
    role: row.role as 'customer' | 'staff' | 'admin', balance: row.balance,
  };
  next();
}
