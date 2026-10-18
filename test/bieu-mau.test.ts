/**
 * Trang /bieu-mau-ho-so: du nhom bieu mau, moi muc co can cu va link tai toi
 * nguon chinh thuc (P.A Viet Nam, Cong Chinh phu, VNNIC), khong luu file trong
 * repo va khong dung tai lieu cua nha dang ky khac.
 */
import './helpers/db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { NHOM_BIEU_MAU, VAN_BAN_GOC } from '../src/lib/bieuMau.js';

let server: Server;
let goc = '';

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
});

// Nguon duoc phep: nha dang ky P.A, cong van ban nha nuoc, VNNIC va hai trang
// cong khai cua VNNIC. Google Docs la noi P.A dang cac ban khai .vn moi nhat.
const NGUON = /^https:\/\/(www\.pavietnam\.vn|pavietnam\.vn|docs\.google\.com|datafiles\.chinhphu\.vn|mst\.gov\.vn|vnnic\.vn|thongbaotenmien\.vn|nhadangky\.vn)\//;

test('du 5 nhom bieu mau theo yeu cau, moi muc co can cu va it nhat mot link tai', () => {
  assert.deepEqual(
    NHOM_BIEU_MAU.map((n) => n.id),
    ['dang-ky', 'thay-doi', 'chuyen-nha-dang-ky', 'hoan-tra', 'chuyen-nhuong'],
  );
  for (const n of NHOM_BIEU_MAU) {
    assert.ok(n.muc.length > 0, n.id);
    for (const m of n.muc) {
      assert.ok(m.canCu.trim(), `${m.ten}: thieu can cu`);
      assert.ok(m.tai.length > 0, `${m.ten}: thieu link`);
    }
  }
});

test('moi link la https toi nguon chinh thuc, khong co file cua nha dang ky khac', () => {
  const tatCa = [...NHOM_BIEU_MAU.flatMap((n) => n.muc.flatMap((m) => m.tai)), ...VAN_BAN_GOC];
  for (const l of tatCa) {
    assert.match(`${l.url}/`, NGUON, l.url);
    assert.doesNotMatch(l.url, /matbao/i);
  }
});

test('can cu ghi dung mau so TT 48/2025 va ND 115/2025 cho cac mau nha nuoc', () => {
  const canCu = (ten: string): string => NHOM_BIEU_MAU.flatMap((n) => n.muc).find((m) => m.ten === ten)!.canCu;
  assert.equal(canCu('Bản khai đăng ký tên miền .vn cho cá nhân'), 'Mẫu số 01c, Phụ lục II Thông tư 48/2025/TT-BKHCN');
  assert.equal(canCu('Bản khai đăng ký tên miền .vn cho cơ quan, tổ chức, doanh nghiệp'), 'Mẫu số 01a, Phụ lục II Thông tư 48/2025/TT-BKHCN');
  assert.equal(canCu('Bản khai đăng ký tên miền .vn cho hộ kinh doanh'), 'Mẫu số 01b, Phụ lục II Thông tư 48/2025/TT-BKHCN');
  assert.equal(canCu('Bản khai chuyển đổi chủ thể đăng ký sử dụng tên miền .vn'), 'Điều 55 và Mẫu số 27 Nghị định 115/2025/NĐ-CP');
  assert.match(canCu('Văn bản đề nghị chuyển nhượng và nhận chuyển nhượng quyền sử dụng tên miền .vn'), /Mẫu số 24 Nghị định 115\/2025\/NĐ-CP/);
});

test('trang 200, co ghi chu hotline, quy trinh dang ky va du nhom; link ngoai co rel noopener', async () => {
  const r = await fetch(goc + '/bieu-mau-ho-so');
  assert.equal(r.status, 200);
  const html = await r.text();
  const than = html.slice(0, html.indexOf('<footer'));
  assert.match(than, /Biểu mẫu do nhà đăng ký P\.A Việt Nam cung cấp; nếu cần hỗ trợ điền hồ sơ, liên hệ hotline <a href="tel:0976788840">0976\.788\.840<\/a>\./);
  assert.match(than, /<section class="card bm-group" id="quy-trinh-dang-ky">/);
  for (const n of NHOM_BIEU_MAU) assert.match(than, new RegExp(`id="${n.id}"`), n.id);
  // Mau ho kinh doanh: P.A chua co, phai noi ro thay vi de link trong
  assert.equal((than.match(/P\.A Việt Nam chưa đăng mẫu riêng cho hộ kinh doanh/g) ?? []).length, 2);
  for (const m of than.matchAll(/<a href="(https:[^"]+)"([^>]*)>/g)) {
    assert.match(m[2]!, /rel="noopener"/, m[1]!);
  }
  assert.doesNotMatch(html, /matbao/i);
  // Khong keo tai nguyen ngoai (CSP)
  assert.doesNotMatch(html, /\ssrc="https?:\/\//);
});

test('sitemap co trang bieu mau', async () => {
  const xml = await (await fetch(goc + '/sitemap.xml')).text();
  assert.match(xml, /<loc>[^<]*\/bieu-mau-ho-so<\/loc>/);
});
