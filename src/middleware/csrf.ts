/**
 * Chong CSRF bang token trong session, gui kem moi form POST.
 * Webhook (server-to-server) duoc mien tru vi da xac thuc bang chu ky rieng.
 */
import type { NextFunction, Request, Response } from 'express';
import { randomToken, safeEqual } from '../lib/crypto.js';

const EXEMPT_PREFIXES = ['/webhooks/', '/api/'];

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.csrf) req.session.csrf = randomToken(16);
  res.locals['csrfToken'] = req.session.csrf;

  const safeMethod = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  const exempt = EXEMPT_PREFIXES.some((p) => req.path.startsWith(p));
  if (safeMethod || exempt) return next();

  const body = req.body as Record<string, unknown> | undefined;
  const sent = String(body?.['_csrf'] ?? req.get('x-csrf-token') ?? '');

  if (!sent || !safeEqual(sent, req.session.csrf)) {
    res.status(403);
    if (!req.path.startsWith('/api/') && req.accepts('html')) {
      res.render('error', {
        title: 'Phiên làm việc hết hạn',
        message: 'Yêu cầu không hợp lệ hoặc phiên đã hết hạn. Vui lòng tải lại trang và thử lại.',
      });
    } else {
      res.json({ error: 'CSRF token không hợp lệ' });
    }
    return;
  }
  next();
}
