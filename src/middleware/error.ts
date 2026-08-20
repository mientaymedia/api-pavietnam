import type { NextFunction, Request, Response } from 'express';
import { log } from '../lib/logger.js';
import { config } from '../config.js';

/**
 * Cac duong dan may-goi-may (/api, /webhooks) luon tra JSON.
 * Chi dua vao `req.accepts('html')` la khong du: client API thuong gui
 * header Accept nhan moi kieu, nen se bi tra ve trang HTML thay vi loi JSON.
 */
function wantsJson(req: Request): boolean {
  return req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || !req.accepts('html');
}

export function notFound(req: Request, res: Response): void {
  res.status(404);
  if (!wantsJson(req)) {
    res.render('error', { title: 'Khong tim thay trang', message: `Duong dan ${req.path} khong ton tai.` });
  } else {
    res.json({ error: 'Khong tim thay' });
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : String(err);
  log.error('unhandled_error', { path: req.path, method: req.method, error: message, stack: err instanceof Error ? err.stack : undefined });

  if (res.headersSent) return;
  res.status(500);
  if (!wantsJson(req)) {
    res.render('error', {
      title: 'Da xay ra loi',
      message: config.isProd ? 'He thong gap su co. Vui long thu lai sau it phut.' : message,
    });
  } else {
    res.json({ error: config.isProd ? 'Loi he thong' : message });
  }
}

/** Boc handler async de loi duoc chuyen toi errorHandler thay vi lam treo request. */
export function wrap<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as T, res, next).catch(next);
  };
}
