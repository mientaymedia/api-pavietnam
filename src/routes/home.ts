import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { searchDomains, lookupWhois } from '../services/domains.js';
import { listTlds, priceFor } from '../services/pricing.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { normalizeDomain } from '../pavietnam/client.js';
import { config } from '../config.js';

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

/** Trang chuyen ten mien tu nha dang ky khac ve he thong. */
router.get('/chuyen-ten-mien', (_req, res) => {
  const tlds = listTlds({ activeOnly: true }).filter((t) => t.price_transfer > 0);
  res.render('transfer', {
    title: 'Chuyen ten mien ve',
    tlds,
    priceFor,
    values: {},
  });
});

router.get('/bang-gia', (_req, res) => {
  const tlds = listTlds({ activeOnly: true });
  res.render('pricing', {
    title: 'Bang gia ten mien',
    vn: tlds.filter((t) => t.kind === 'vn'),
    intl: tlds.filter((t) => t.kind === 'intl'),
    priceFor,
  });
});

/* ------------------------------------------------------------- SEO co ban */

router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      // Khong cho lap chi muc khu vuc rieng tu / dong nhieu URL rac
      'Disallow: /admin',
      'Disallow: /tai-khoan',
      'Disallow: /don-hang',
      'Disallow: /control-panel',
      'Disallow: /gio-hang',
      'Disallow: /thanh-toan',
      'Disallow: /api/',
      'Disallow: /webhooks/',
      'Disallow: /tim-kiem',
      'Allow: /',
      '',
      `Sitemap: ${config.appUrl}/sitemap.xml`,
      '',
    ].join('\n'),
  );
});

router.get('/sitemap.xml', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    { loc: '/', priority: '1.0', freq: 'daily' },
    { loc: '/bang-gia', priority: '0.9', freq: 'weekly' },
    { loc: '/chuyen-ten-mien', priority: '0.7', freq: 'monthly' },
    { loc: '/whois', priority: '0.6', freq: 'monthly' },
    { loc: '/dang-ky', priority: '0.5', freq: 'monthly' },
  ];

  const urls = pages
    .map(
      (p) =>
        `  <url>\n    <loc>${config.appUrl}${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
    )
    .join('\n');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
});

export default router;
