/**
 * Gioi han tan suat don gian trong bo nho (du cho trien khai 1 tien trinh).
 * Neu chay nhieu instance, thay bang Redis hoac gioi han o tang nginx.
 */
import type { NextFunction, Request, Response } from 'express';

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key);
}, 60_000).unref?.();

export function rateLimit(opts: {
  windowMs: number;
  /** So hoac ham: ham doc lai cau hinh moi lan, doi tren quan tri co hieu luc ngay. */
  max: number | (() => number);
  key?: (req: Request) => string;
  message?: string;
  /** Goi moi lan chan (vd dem so luot bi chan cho thong ke). */
  onLimit?: (req: Request) => void;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = `${req.path}:${opts.key ? opts.key(req) : (req.ip ?? 'unknown')}`;
    const now = Date.now();
    const bucket = buckets.get(id);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(id, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    bucket.count++;
    const max = typeof opts.max === 'function' ? opts.max() : opts.max;
    if (bucket.count > max) {
      opts.onLimit?.(req);
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429);
      const message = opts.message ?? `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`;
      const isMachinePath = req.path.startsWith('/api/') || req.path.startsWith('/webhooks/');
      if (!isMachinePath && req.accepts('html')) res.render('error', { title: 'Quá nhiều yêu cầu', message });
      else res.json({ error: message });
      return;
    }
    next();
  };
}
