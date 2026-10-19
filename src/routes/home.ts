import { Router } from 'express';
import { wrap } from '../middleware/error.js';
import { searchDomains, lookupWhois } from '../services/domains.js';
import { listTlds, priceFor } from '../services/pricing.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { normalizeDomain } from '../pavietnam/client.js';
import { config } from '../config.js';
import { BASE } from '../lib/basePath.js';
import { HUONG_DAN_VNNIC, NHOM_BIEU_MAU, VAN_BAN_GOC, WHOIS_VNNIC } from '../lib/bieuMau.js';
import { aiSanSang, duoiChoChon } from '../services/goiYTenMien.js';
import { phuongCuaTinh } from '../lib/diaGioi.js';

const router = Router();

router.get('/', (_req, res) => {
  const tlds = listTlds({ activeOnly: true });
  // Duoi noi bat len truoc, giu thu tu sort_order trong tung nhom: chip va
  // luoi dich vu doc tu cung mot danh sach nen khong bao gio lech gia nhau.
  const xep = [...tlds.filter((t) => t.is_featured), ...tlds.filter((t) => !t.is_featured)];
  const giaChuyen = tlds.filter((t) => t.price_transfer > 0).map((t) => priceFor(t, 'transfer', 1).total);

  res.render('home', {
    title: 'Đăng ký tên miền Việt Nam & Quốc tế',
    chips: xep,
    // Luoi 3 cot: 6 the duoi + 3 the cong cu. Thieu duoi noi bat thi bu bang
    // duoi dang ban de hang cuoi cua luoi khong bi hut.
    noiBat: xep.slice(0, 6),
    // Thanh uu dai va the .vn chi neu gia dang ban, khong bia khuyen mai.
    uuDai: tlds.find((t) => t.tld === 'vn') ?? xep[0] ?? null,
    giaChuyenTu: giaChuyen.length ? Math.min(...giaChuyen) : null,
    // Tab Tim cung AI chi hien khi bat, du khoa, model va chua cham tran ngay
    aiBat: aiSanSang(),
    duoiCho: duoiChoChon(),
    priceFor,
  });
});

/**
 * Danh sach phuong xa cua mot tinh (ma so hoac ten P.A), cho form ho so chu the
 * tu nap khi doi tinh. Form van chay khong JS (nut "Lay danh sach phuong, xa").
 */
router.get('/dia-gioi/phuong', (req, res) => {
  const tinh = String(req.query['tinh'] ?? '').slice(0, 100);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json(tinh ? phuongCuaTinh(tinh).map((p) => p.ten) : []);
});

router.get(
  '/tim-kiem',
  rateLimit({ windowMs: 60_000, max: 30, message: 'Bạn tìm kiếm quá nhanh, vui lòng chờ một chút.' }),
  wrap(async (req, res) => {
    const q = String(req.query['q'] ?? '').trim();
    const years = Math.max(1, Math.min(10, Number(req.query['years'] ?? 1) || 1));

    if (!q) {
      res.redirect('/');
      return;
    }

    const search = await searchDomains(q, { years });
    res.render('search', {
      title: `Kết quả tìm kiếm: ${q}`,
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
    res.render('whois', { title: 'Tra cứu WHOIS', domain, result });
  }),
);

/** Trang chuyen ten mien tu nha dang ky khac ve he thong. */
router.get('/chuyen-ten-mien', (req, res) => {
  const tlds = listTlds({ activeOnly: true }).filter((t) => t.price_transfer > 0);
  // Tab "Chuyển tên miền về" o trang chu gui ?domain= toi day: dien san o nhap
  // de khach khong phai go lai. Chi dien san, viec kiem hop le van o gio hang.
  const domain = normalizeDomain(String(req.query['domain'] ?? '')).slice(0, 253);
  res.render('transfer', {
    title: 'Chuyển tên miền về',
    tlds,
    priceFor,
    values: domain ? { domain } : {},
  });
});

router.get('/bang-gia', (_req, res) => {
  const tlds = listTlds({ activeOnly: true });
  res.render('pricing', {
    title: 'Bảng giá tên miền',
    vn: tlds.filter((t) => t.kind === 'vn'),
    intl: tlds.filter((t) => t.kind === 'intl'),
    priceFor,
  });
});

/** Bieu mau ho so ten mien: footer tro toi day (xem lib/bieuMau.ts). */
router.get('/bieu-mau-ho-so', (_req, res) => {
  res.render('bieu-mau-ho-so', {
    title: 'Biểu mẫu hồ sơ tên miền',
    nhom: NHOM_BIEU_MAU,
    vanBanGoc: VAN_BAN_GOC,
    huongDanVnnic: HUONG_DAN_VNNIC,
    whoisVnnic: WHOIS_VNNIC,
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
      // Trang ket qua goi y AI: mong, nhieu bien the, moi lan xem ton tien AI
      'Disallow: /tim-cung-ai',
      'Allow: /',
      '',
      `Sitemap: ${config.appUrl}/sitemap.xml`,
      '',
    ]
      // Chay duoi BASE_PATH thi duong dan chan cung phai co tien to
      .map((dong) => dong.replace(/^(Disallow|Allow): (?=\/)/, `$1: ${BASE}`))
      .join('\n'),
  );
});

router.get('/sitemap.xml', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const pages = [
    { loc: '/', priority: '1.0', freq: 'daily' },
    { loc: '/bang-gia', priority: '0.9', freq: 'weekly' },
    { loc: '/chuyen-ten-mien', priority: '0.7', freq: 'monthly' },
    { loc: '/whois', priority: '0.6', freq: 'monthly' },
    { loc: '/bieu-mau-ho-so', priority: '0.5', freq: 'monthly' },
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
