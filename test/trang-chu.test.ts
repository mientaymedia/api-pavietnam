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
  // Trang chu khong duoc keo tai nguyen ngoai may chu (CSP chan, trang se vo).
  // Chi xet src= va <link href=: the <a> tro ra ngoai (VNNIC o footer) khong
  // phai tai nguyen, CSP khong chan.
  assert.doesNotMatch(html, /\ssrc="https?:\/\/(?!mientaymedia\.com)/);
  assert.doesNotMatch(html, /<link[^>]*\shref="https?:\/\/(?!mientaymedia\.com)/);
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

test('footer in khoi phap ly chu da chot, doc tu Cau hinh; ten hien thi van la MienTay Media', async () => {
  const { html } = await trang('/');
  const footer = html.slice(html.indexOf('<footer'));
  // Du muc Dieu 11 khoan 1 diem a Luat TMDT 122/2025, Dieu 4 ND 248/2026
  assert.match(footer, /<p class="footer-legal-name">Công ty TNHH Phần mềm Mientay Media<\/p>/);
  assert.match(footer, /<p>Mã số doanh nghiệp: 1602182849, do Sở KH&amp;ĐT tỉnh An Giang cấp ngày 13\/06\/2024<\/p>/);
  assert.match(footer, /<p>Người đại diện theo pháp luật: Đinh Văn Tạo Em<\/p>/);
  assert.match(footer, /<p>Trụ sở: 12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang<\/p>/);
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
    assert.match(sau, /Mã số doanh nghiệp: 1602182849, do Sở thử cấp</);
  } finally {
    setSetting('site.working_hours', '');
    setSetting('site.tax_issued', '');
  }
});

test('footer ghi ro vai tro dai ly cua P.A Viet Nam (ND 147/2024 Dieu 12 khoan 4 diem c)', async () => {
  const footer = (await trang('/')).html.split('<footer')[1]!;
  assert.match(
    footer,
    /<p class="footer-agent">MienTay Media là đại lý của Công ty TNHH P\.A Việt Nam, nhà đăng ký tên miền quốc gia \.vn và quốc tế\. Tên miền do P\.A Việt Nam đăng ký, quản lý\.<\/p>/,
  );
});

test('cot Chinh sach du muc ND 248/2026, tro toi trang dang co tren mientaymedia.com', async () => {
  const footer = (await trang('/')).html.split('<footer')[1]!;
  const muc: [string, string][] = [
    ['Điều kiện giao dịch chung', 'dieu-khoan-su-dung'],
    ['Thỏa thuận sử dụng dịch vụ', 'dieu-khoan-dich-vu'],
    ['Chính sách giá', 'chinh-sach-gia'],
    ['Điều kiện, hạn chế cung cấp dịch vụ', 'dieu-kien-cung-cap-dich-vu'],
    ['Chính sách thanh toán', 'chinh-sach-thanh-toan'],
    ['Cung cấp, chấm dứt dịch vụ và hoàn tiền', 'chinh-sach-hoan-tien'],
    ['Chính sách bảo mật thông tin', 'chinh-sach-quyen-rieng-tu'],
    ['Bảo vệ dữ liệu cá nhân', 'chinh-sach-bao-mat'],
    ['Giải quyết khiếu nại', 'phuong-thuc-khieu-nai'],
  ];
  for (const [nhan, duong] of muc) {
    assert.ok(footer.includes(`<a href="https://mientaymedia.com/${duong}" rel="noopener">${nhan}</a>`), nhan);
  }
  // Kenh lien he truc tuyen (Dieu 7 khoan 1 ND 248/2026)
  assert.match(footer, /href="https:\/\/mientaymedia\.com\/ho-tro-truc-tuyen" rel="noopener">Hỗ trợ trực tuyến</);
});

test('cot Ten mien co bieu mau, quy trinh, WHOIS VNNIC, quy dinh su dung, bao cao lam dung', async () => {
  const footer = (await trang('/')).html.split('<footer')[1]!;
  assert.match(footer, /<a href="\/bieu-mau-ho-so">Biểu mẫu hồ sơ<\/a>/);
  assert.match(footer, /<a href="\/bieu-mau-ho-so#quy-trinh-dang-ky">Quy trình đăng ký<\/a>/);
  assert.match(footer, /<a href="https:\/\/vnnic\.vn\/vi\/whois-information\?lang=vi" rel="noopener">WHOIS \.vn tại VNNIC<\/a>/);
  assert.match(footer, /<a href="https:\/\/vnnic\.vn\/vi\/ten-mien-vn\/chinh-sach-quy-dinh" rel="noopener">Quy định sử dụng tên miền \.vn<\/a>/);
  assert.match(footer, /<a href="https:\/\/mientaymedia\.com\/quy-trinh-bao-cao-lam-dung" rel="noopener">Báo cáo lạm dụng<\/a>/);
  assert.doesNotMatch(footer, /matbao/i);
});

test('bieu tuong da thong bao chi hien khi du anh va link online.gov.vn', async () => {
  // Mac dinh: cong ty chua lam thu tuc theo ND 248/2026, khong duoc gan bieu tuong
  assert.doesNotMatch((await trang('/')).html, /footer-badge/);

  const thu = async (anh: string, link: string): Promise<string> => {
    setSetting('site.bct_badge_img', anh);
    setSetting('site.bct_badge_url', link);
    try {
      return (await trang('/')).html;
    } finally {
      setSetting('site.bct_badge_img', '');
      setSetting('site.bct_badge_url', '');
    }
  };

  const du = await thu('/img/da-thong-bao.png', 'https://online.gov.vn/nen-tang/123');
  assert.match(du, /<a class="footer-badge" href="https:\/\/online\.gov\.vn\/nen-tang\/123" rel="noopener"><img src="\/img\/da-thong-bao\.png" alt="Đã thông báo hoạt động thương mại điện tử"/);

  // Thieu mot trong hai, link khong phai online.gov.vn, anh dang javascript: hay //host thi an
  assert.doesNotMatch(await thu('/img/da-thong-bao.png', ''), /footer-badge/);
  assert.doesNotMatch(await thu('', 'https://online.gov.vn/nen-tang/123'), /footer-badge/);
  assert.doesNotMatch(await thu('/img/a.png', 'https://online.gov.vn.lua-dao.com/x'), /footer-badge/);
  assert.doesNotMatch(await thu('/img/a.png', 'javascript:alert(1)'), /footer-badge/);
  assert.doesNotMatch(await thu('javascript:alert(1)', 'https://online.gov.vn/x'), /footer-badge/);
  assert.doesNotMatch(await thu('//lua-dao.com/a.png', 'https://online.gov.vn/x'), /footer-badge/);
});

test('dich vu khac va gioi thieu theo brain: dung gia Rate card, link mientaymedia.com, lien he tu cau hinh', async () => {
  const { html } = await trang('/');
  for (const p of ['google-workspace', 'microsoft-365', 'mineflow-cdp']) {
    assert.match(html, new RegExp(`href="https://mientaymedia\.com/${p}" rel="noopener"`), p);
  }
  assert.match(html, /Chỉ từ <strong>7 \$<\/strong>\/người\/tháng/);
  assert.match(html, /Chỉ từ <strong>149\.000 đ<\/strong>\/người\/tháng/);
  assert.match(html, /Gói Pro 99\.000 đ\/tháng, đã gồm VAT/);
  // Google Workspace: noi du quy tac brain (sp/04:21, Rate card:61, :90), khong hua muc VND
  assert.match(
    html,
    /Giá hãng gói Starter tính bằng USD, quy đổi theo tỷ giá Vietcombank ngày báo giá, chưa gồm thuế nhà thầu 10% và VAT 10%\. Nhân viên xác nhận giá khi chốt\./,
  );
  // Uu dai hang 3,50 $ nam dau do chu quyet, chua dua len
  assert.doesNotMatch(html, /3[,.]50? ?\$/);
  // Ly do "ho tro" doc lien he tu cau hinh (mac dinh theo brain)
  assert.match(html, /gọi hotline 0976\.788\.840, nhắn Zalo OA hoặc gửi email hello@mientaymedia\.com\./);
  // Cau cu khong co nguon trong brain da bo
  assert.doesNotMatch(html, /đồng hành cả chặng đường/);
});

test('QA vong 3: cac o phap ly va gio lam viec thoat ky tu HTML khi in ra footer', async () => {
  const doc: Record<string, string> = {
    'site.legal_name': '<script>alert(1)</script>"><img src=x onerror=alert(2)> Công ty QA',
    'site.tax_code': `0000000001"><b>dam</b>'`,
    'site.tax_issued': `Sở KH&ĐT <i>độc</i> ' "`,
    'site.address': '</p><svg onload=alert(3)> Số 1 đường QA',
    'site.working_hours': '<a href=javascript:alert(4)>bấm</a> Thứ 2',
    'site.legal_rep': '<u>đại diện</u>"',
  };
  for (const [k, v] of Object.entries(doc)) setSetting(k, v);
  try {
    const { html } = await trang('/');
    const footer = html.slice(html.indexOf('<footer'));
    for (const tho of ['<script>alert(1)', '<img src=x', '<b>dam</b>', '<i>độc</i>', '<svg onload', '<a href=javascript', '<u>đại diện']) {
      assert.ok(!html.includes(tho), `the doc khong duoc in tho: ${tho}`);
    }
    assert.match(footer, /<p class="footer-legal-name">&lt;script&gt;alert\(1\)&lt;\/script&gt;&#34;&gt;&lt;img src=x onerror=alert\(2\)&gt; Công ty QA<\/p>/);
    assert.match(footer, /<p>Mã số doanh nghiệp: 0000000001&#34;&gt;&lt;b&gt;dam&lt;\/b&gt;&#39;, do Sở KH&amp;ĐT &lt;i&gt;độc&lt;\/i&gt; &#39; &#34;<\/p>/);
    assert.match(footer, /<p>Người đại diện theo pháp luật: &lt;u&gt;đại diện&lt;\/u&gt;&#34;<\/p>/);
    assert.match(footer, /<p>Trụ sở: &lt;\/p&gt;&lt;svg onload=alert\(3\)&gt; Số 1 đường QA<\/p>/);
    assert.match(footer, /Giờ làm việc: &lt;a href=javascript:alert\(4\)&gt;bấm&lt;\/a&gt; Thứ 2</);
    assert.equal((html.match(/class="footer-legal"/g) ?? []).length, 1);
  } finally {
    for (const k of Object.keys(doc)) setSetting(k, '');
  }
});
