import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { searchDomains, lookupWhois } from '../services/domains.js';
import { listTlds, priceFor } from '../services/pricing.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { normalizeDomain } from '../pavietnam/client.js';

const router = Router();

router.get('/', (_req, res) => {
  const tlds = listTlds({ activeOnly: true });
  res.render('home', {
    title: 'Dang ky ten mien Viet Nam & Quoc te',
    featured: tlds.filter((t) => t.is_featured).slice(0, 8),
    tlds,
    priceFor,
  });
});

router.get(
  '/tim-kiem',
  rateLimit({ windowMs: 60_000, max: 30, message: 'Ban tim kiem qua nhanh, vui long cho mot chut.' }),
  wrap(async (req, res) => {
    const q = String(req.query['q'] ?? '').trim();
    const years = Math.max(1, Math.min(10, Number(req.query['years'] ?? 1) || 1));

    if (!q) {
      res.redirect('/');
      return;
    }

    const search = await searchDomains(q, { years });
    res.render('search', {
      title: `Ket qua tim kiem: ${q}`,
      q,
      years,
      search,
      allTlds: listTlds({ activeOnly: true }),
    });
  }),
);

router.get(
  '/whois',
  rateLimit({ windowMs: 60_000, max: 20 }),
  wrap(async (req, res) => {
    const domain = normalizeDomain(String(req.query['domain'] ?? ''));
    const result = domain ? await lookupWhois(domain) : null;
    res.render('whois', { title: 'Tra cuu WHOIS', domain, result });
  }),
);

router.get('/bang-gia', (_req, res) => {
  const tlds = listTlds({ activeOnly: true });
  res.render('pricing', {
    title: 'Bang gia ten mien',
    vn: tlds.filter((t) => t.kind === 'vn'),
    intl: tlds.filter((t) => t.kind === 'intl'),
    priceFor,
  });
});

export default router;
