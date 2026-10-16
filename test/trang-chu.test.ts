/**
 * Trang chu: gia tren trang phai lay tu bang gia that (priceFor), o tim gui
 * dung route tim kiem, tab chuyen ten mien dien san o nhap.
 *
 * Cac tep test chay song song tren cung CSDL va tu them duoi rieng, nen chi
 * khang dinh tren duoi do tep nay tao ra, khong dem tong so duoi.
 */
import './helpers/db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { getTld, priceFor, upsertTld } from '../src/services/pricing.js';
import { formatVnd } from '../src/lib/money.js';
import { setSetting } from '../src/lib/settings.js';

let server: Server;
let goc = '';

before(async () => {
  upsertTld({ tld: 'trangchu', kind: 'intl', label: 'Thử trang chủ', price_register: 123_000, price_renew: 456_000, price_transfer: 99_000, is_active: 1, is_featured: 1, sort_order: 1 });
  upsertTld({ tld: 'tatban', kind: 'intl', label: 'Đã ngừng bán', price_register: 777_000, price_renew: 777_000, is_active: 0, sort_order: 2 });
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
});

async function trang(p: string): Promise<{ status: number; html: string }> {
  const r = await fetch(goc + p, { redirect: 'manual' });
  return { status: r.status, html: await r.text() };
}

test('chip gia lay tu bang gia that, bo duoi ngung ban', async () => {
  const { status, html } = await trang('/');
  assert.equal(status, 200);
  const gia = formatVnd(priceFor(getTld('trangchu')!, 'register', 1).total);
  assert.match(html, new RegExp(`\\.trangchu[\\s\\S]{0,200}${gia.replace('.', '\\.')}`));
  assert.doesNotMatch(html, /\.tatban/);
});

test('o tim ten mien gui toi /tim-kiem voi tham so q', async () => {
  const { html } = await trang('/');
  assert.match(html, /<form[^>]*action="\/tim-kiem"[^>]*method="get"/);
  assert.match(html, /name="q"/);
});

test('du cac khoi: uu dai, tab chuyen, dich vu, khach hang, cau hoi', async () => {
  const { html } = await trang('/');
  assert.match(html, /class="tc-promo"/);
  assert.match(html, /<form[^>]*action="\/chuyen-ten-mien"[^>]*method="get"/);
  assert.match(html, /Dịch vụ nổi bật/);
  assert.match(html, /<img src="\/img\/khach-hang\/[a-z0-9-]+\.png" alt="Logo khách hàng /);
  assert.match(html, /<details>\s*<summary>/);
  // Trang chu khong duoc keo tai nguyen ngoai may chu (CSP chan, trang se vo)
  assert.doesNotMatch(html, /\s(src|href)="https?:\/\/(?!mientaymedia\.com)/);
});

test('logo khach hang va font tu phuc vu deu ton tai', async () => {
  const { html } = await trang('/');
  const anh = [...html.matchAll(/src="(\/img\/khach-hang\/[^"]+)"/g)].map((m) => m[1]!);
  assert.ok(anh.length >= 6, 'it nhat 6 logo khach hang');
  for (const a of [...anh, '/img/mientaymedia-logo.png', '/fonts/be-vietnam-pro-vietnamese-400-normal.woff2']) {
    assert.equal((await fetch(goc + a)).status, 200, a);
  }
});

test('chuyen ten mien: ?domain= dien san o nhap va duoc thoat ky tu', async () => {
  const { html } = await trang('/chuyen-ten-mien?domain=' + encodeURIComponent('https://www.ViDu.com/abc'));
  assert.match(html, /name="domain" value="vidu\.com"/);

  const xau = await trang('/chuyen-ten-mien?domain=' + encodeURIComponent('"><script>x</script>'));
  assert.equal(xau.status, 200);
  assert.doesNotMatch(xau.html, /<script>x<\/script>/);
});

test('footer co lien he mac dinh theo brain MienTay Media, khong lo hop thu no-reply', async () => {
  const { html } = await trang('/');
  const footer = html.slice(html.indexOf('<footer'));
  assert.match(footer, /href="tel:0976788840">Hotline: 0976\.788\.840</);
  assert.match(footer, /href="mailto:hello@mientaymedia\.com">hello@mientaymedia\.com</);
  assert.match(footer, /href="https:\/\/mientaymedia\.com"/);
  assert.doesNotMatch(footer, /no-?reply/i);
});

test('footer in dong phap ly chu da chot, doc tu Cau hinh; ten hien thi van la MienTay Media', async () => {
  const { html } = await trang('/');
  const footer = html.slice(html.indexOf('<footer'));
  assert.match(footer, /<p class="footer-legal">Công ty TNHH Phần mềm Mientay Media\. MST 1602182849, do Sở KH&amp;ĐT tỉnh An Giang cấp ngày 13\/06\/2024\. Trụ sở: 12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang\.<\/p>/);
  assert.match(footer, /Giờ làm việc: Thứ 2 đến thứ 7, 8:00 đến 17:30/);
  assert.match(footer, /&copy; \d{4} MienTay Media</);
  // Ten phap ly chi o dong phap ly, khong lan sang header hay than trang
  assert.equal(html.split('Công ty TNHH Phần mềm Mientay Media').length - 1, 1);

  // Quan tri sua trong Cau hinh thi footer doi theo (de trong thi ve gia tri mac dinh)
  setSetting('site.working_hours', 'Thứ 2 đến thứ 6');
  setSetting('site.tax_issued', 'Sở thử cấp');
  try {
    const sau = (await trang('/')).html;
    assert.match(sau, /Giờ làm việc: Thứ 2 đến thứ 6</);
    assert.match(sau, /MST 1602182849, do Sở thử cấp\. Trụ sở:/);
  } finally {
    setSetting('site.working_hours', '');
    setSetting('site.tax_issued', '');
  }
});

test('dich vu khac va gioi thieu theo brain: dung gia Rate card, link mientaymedia.com, lien he tu cau hinh', async () => {
  const { html } = await trang('/');
  for (const p of ['google-workspace', 'microsoft-365', 'mineflow-cdp']) {
    assert.match(html, new RegExp(`href="https://mientaymedia\.com/${p}" rel="noopener"`), p);
  }
  assert.match(html, /Chỉ từ <strong>7 \$<\/strong>\/người\/tháng/);
  assert.match(html, /Chỉ từ <strong>149\.000 đ<\/strong>\/người\/tháng/);
  assert.match(html, /Gói Pro 99\.000 đ\/tháng, đã gồm VAT/);
  // Ly do "ho tro" doc lien he tu cau hinh (mac dinh theo brain)
  assert.match(html, /gọi hotline 0976\.788\.840, nhắn Zalo OA hoặc gửi email hello@mientaymedia\.com\./);
  // Cau cu khong co nguon trong brain da bo
  assert.doesNotMatch(html, /đồng hành cả chặng đường/);
});

test('QA vong 3: 5 o phap ly va gio lam viec thoat ky tu HTML khi in ra footer', async () => {
  const doc: Record<string, string> = {
    'site.legal_name': '<script>alert(1)</script>"><img src=x onerror=alert(2)> Công ty QA',
    'site.tax_code': `0000000001"><b>dam</b>'`,
    'site.tax_issued': `Sở KH&ĐT <i>độc</i> ' "`,
    'site.address': '</p><svg onload=alert(3)> Số 1 đường QA',
    'site.working_hours': '<a href=javascript:alert(4)>bấm</a> Thứ 2',
  };
  for (const [k, v] of Object.entries(doc)) setSetting(k, v);
  try {
    const { html } = await trang('/');
    const footer = html.slice(html.indexOf('<footer'));
    for (const tho of ['<script>alert(1)', '<img src=x', '<b>dam</b>', '<i>độc</i>', '<svg onload', '<a href=javascript']) {
      assert.ok(!html.includes(tho), `the doc khong duoc in tho: ${tho}`);
    }
    assert.match(footer, /<p class="footer-legal">&lt;script&gt;alert\(1\)&lt;\/script&gt;&#34;&gt;&lt;img src=x onerror=alert\(2\)&gt; Công ty QA\. MST 0000000001&#34;&gt;&lt;b&gt;dam&lt;\/b&gt;&#39;, do Sở KH&amp;ĐT &lt;i&gt;độc&lt;\/i&gt; &#39; &#34;\. Trụ sở: &lt;\/p&gt;&lt;svg onload=alert\(3\)&gt; Số 1 đường QA\.<\/p>/);
    assert.match(footer, /Giờ làm việc: &lt;a href=javascript:alert\(4\)&gt;bấm&lt;\/a&gt; Thứ 2</);
    assert.equal((html.match(/class="footer-legal"/g) ?? []).length, 1);
  } finally {
    for (const k of Object.keys(doc)) setSetting(k, '');
  }
});
