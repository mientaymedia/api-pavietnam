/**
 * Tien to duong dan (BASE_PATH) cho app chay duoi thu muc con.
 *
 * Route ben trong app KHONG doi: toan bo route duoc gan vao mot router con
 * mount tai BASE (xem app.ts), nen req.path ben trong da bo tien to. Chi can
 * them tien to o nhung cho dua duong dan RA ngoai: link trong view, redirect,
 * cookie path, robots.txt.
 */
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { laDiaChiHost } from './redirect.js';

export const BASE = config.basePath;

/** Them tien to cho duong dan noi bo bat dau bang mot dau '/'. URL ngoai, '//', '/\', 'back' giu nguyen. */
export function withBase(p: string): string {
  if (!BASE || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return p;
  return BASE + p;
}

/**
 * Bo tien to khoi duong dan da co tien to (req.originalUrl, pathname cua Referer).
 * Tra null neu duong dan nam ngoai app. So theo ca doan: /ten-mien-khac khong
 * thuoc /ten-mien. Khong bao gio "co tien to roi thi bo qua" o chieu nguoc lai,
 * vi app co route that ten '/ten-mien' (URL hop le /ten-mien/ten-mien/...).
 */
export function stripBase(p: string): string | null {
  if (!BASE) return p;
  if (p === BASE) return '/';
  if (p.startsWith(`${BASE}/`)) return p.slice(BASE.length);
  if (p.startsWith(`${BASE}?`)) return `/${p.slice(BASE.length)}`;
  return null;
}

/**
 * Boc res.redirect de them tien to MOT lan cho duong dan noi bo. Nho vay hon
 * 120 loi goi res.redirect('/...') trong route khong phai sua; URL ngoai (MoMo,
 * Zalo) khong bat dau bang '/' nen di qua nguyen ven.
 *
 * Lop chan cuoi cho open redirect (ca khi BASE rong): khong bao gio phat
 * Location dang `//host` hay `/\host`. Khong route nao can dang nay; neu co
 * thi do la du lieu nguoi dung lot qua kiem tra, nen ve trang chu.
 */
export function redirectWithBase(_req: Request, res: Response, next: NextFunction): void {
  const goc = res.redirect.bind(res) as (a: string | number, b?: string | number) => void;
  const dich = (p: string): string => withBase(laDiaChiHost(p) ? '/' : p);
  res.redirect = ((a: string | number, b?: string | number) => {
    if (typeof a === 'number') return goc(a, dich(String(b)));
    if (typeof b === 'number') return goc(b, dich(a)); // dang cu redirect(url, status)
    return goc(dich(a));
  }) as Response['redirect'];
  next();
}

/**
 * Yeu cau nam ngoai tien to (chi gap khi vao thang cong cua app; tren may that
 * cac duong dan khac do site chinh phuc vu). Trang goc dua ve trang chu cua
 * app, con lai 404 chu thuan: cac bien cua view (site, currentUser) chi co
 * trong router con.
 */
export function outsideBase(req: Request, res: Response): void {
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/') {
    res.redirect(302, `${BASE}/`);
    return;
  }
  res.status(404).type('text/plain').send('Không tìm thấy trang.');
}
