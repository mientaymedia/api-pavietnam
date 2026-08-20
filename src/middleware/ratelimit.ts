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

export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string; message?: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = `${req.path}:${opts.key ? opts.key(req) : (req.ip ?? 'unknown')}`;
    const now = Date.now();
    const bucket = buckets.get(id);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(id, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    bucket.count++;
    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429);
      const message = opts.message ?? `Ban thao tac qua nhanh. Vui long thu lai sau ${retryAfter} giay.`;
      const isMachinePath = req.path.startsWith('/api/') || req.path.startsWith('/webhooks/');
      if (!isMachinePath && req.accepts('html')) res.render('error', { title: 'Qua nhieu yeu cau', message });
      else res.json({ error: message });
      return;
    }
    next();
  };
}
