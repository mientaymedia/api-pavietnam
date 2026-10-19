/**
 * Trang /bieu-mau-ho-so: du nhom bieu mau, mau nha nuoc dan van ban goc tren
 * cong chinh thuc (Cong Chinh phu, Bo KH&CN, VNNIC); mau rieng cua nha dang ky
 * chi co loi moi lien he (chu yeu cau 19/10/2026: khong neu ten, khong link
 * sang nha dang ky). Khong luu file trong repo.
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

// Nguon duoc phep: cong van ban nha nuoc, VNNIC va hai trang cong khai cua
// VNNIC. Khong con link sang trang hay Google Docs cua nha dang ky.
const NGUON = /^https:\/\/(datafiles\.chinhphu\.vn|mst\.gov\.vn|vnnic\.vn|thongbaotenmien\.vn|nhadangky\.vn)\//;

test('du 5 nhom bieu mau theo yeu cau, moi muc co can cu va co link tai hoac loi moi lien he', () => {
  assert.deepEqual(
    NHOM_BIEU_MAU.map((n) => n.id),
    ['dang-ky', 'thay-doi', 'chuyen-nha-dang-ky', 'hoan-tra', 'chuyen-nhuong'],
  );
  for (const n of NHOM_BIEU_MAU) {
    assert.ok(n.muc.length > 0, n.id);
    for (const m of n.muc) {
      assert.ok(m.canCu.trim(), `${m.ten}: thieu can cu`);
      // Dung mot trong hai: mau nha nuoc co link, mau rieng chi co loi moi lien he
      assert.ok(m.tai.length > 0 !== Boolean(m.lienHe), `${m.ten}: phai co link hoac lienHe`);
      assert.doesNotMatch(`${m.ten} ${m.canCu} ${m.ghiChu ?? ''} ${m.tai.map((l) => l.nhan).join(' ')}`, /P\.A|pavietnam/i, m.ten);
    }
  }
});

test('moi link la https toi nguon chinh thuc, khong co file cua nha dang ky khac', () => {
  const tatCa = [...NHOM_BIEU_MAU.flatMap((n) => n.muc.flatMap((m) => m.tai)), ...VAN_BAN_GOC];
  for (const l of tatCa) {
    assert.match(`${l.url}/`, NGUON, l.url);
    assert.doesNotMatch(l.url, /matbao|pavietnam/i);
    assert.doesNotMatch(l.nhan, /P\.A|pavietnam/i);
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
  assert.match(than, /Cần nhận mẫu hoặc hỗ trợ điền hồ sơ, liên hệ hotline <a href="tel:0976788840">0976\.788\.840<\/a>\./);
  assert.match(than, /MienTay Media là đại lý của nhà đăng ký tên miền \.vn và quốc tế được cấp phép\./);
  assert.match(than, /<section class="card bm-group" id="quy-trinh-dang-ky">/);
  for (const n of NHOM_BIEU_MAU) assert.match(than, new RegExp(`id="${n.id}"`), n.id);
  // Moi mau rieng cua nha dang ky co mot loi moi lien he kem hotline
  const soLienHe = NHOM_BIEU_MAU.flatMap((n) => n.muc).filter((m) => m.lienHe).length;
  assert.ok(soLienHe > 0);
  assert.equal(
    (than.match(/Liên hệ MienTay Media để nhận mẫu: hotline <a href="tel:0976788840">0976\.788\.840<\/a>\./g) ?? []).length,
    soLienHe,
  );
  // Ca trang (than va footer) khong con chu P.A hay link pavietnam
  assert.doesNotMatch(html, /P\.A|pavietnam/i);
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
