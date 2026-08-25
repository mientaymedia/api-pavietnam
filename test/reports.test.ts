import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, nowIso } from '../src/db/index.js';
import { doanhThuTheoDuoi, doanhThuTheoThang, toCsv } from '../src/services/reports.js';
import { upsertTld } from '../src/services/pricing.js';

/**
 * Cac file test chay SONG SONG tren cung mot CSDL, nen khong duoc so sanh
 * tong toan he thong - file khac chen du lieu vao giua la sai ngay.
 * Moi bai test dung mot DUOI RIENG roi chi doc dong cua duoi do.
 */
function duoiRieng(): string {
  const tld = `bc${Math.random().toString(36).slice(2, 8)}`;
  upsertTld({
    tld, kind: 'intl', cost_register: 200_000, cost_renew: 200_000,
    price_register: 300_000, price_renew: 300_000, is_active: 1,
  });
  return tld;
}

/** Doc so lieu cua RIENG mot duoi - khong bi anh huong boi test khac. */
function soLieu(tld: string) {
  return doanhThuTheoDuoi().find((d) => d.tld === tld) ?? { tld, soLuong: 0, doanhThu: 0, giaVon: 0, lai: 0, tyLeLai: 0 };
}

/** Tao mot don da thanh toan voi cac dong o trang thai chi dinh. */
function don(items: { tld: string; amount: number; status: string }[], thang = nowIso().slice(0, 7)) {

  const userId = Number(
    db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'T', ?, ?)`)
      .run(`bc-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid,
  );
  const tong = items.reduce((s, i) => s + i.amount, 0);
  const orderId = Number(
    db.prepare(
      `INSERT INTO orders (code, user_id, status, subtotal, total, paid_at, created_at, updated_at)
       VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)`,
    ).run(`BC${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId, tong, tong, `${thang}-15T10:00:00Z`, nowIso(), nowIso()).lastInsertRowid,
  );

  for (const i of items) {
    db.prepare(
      `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, created_at, updated_at)
       VALUES (?, 'register', ?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(orderId, `d-${Math.random().toString(36).slice(2)}.${i.tld}`, i.tld, i.amount, i.amount, i.status, nowIso(), nowIso());
  }
  return { userId, orderId };
}

test('doanh thu KHONG tinh dong that bai va dong da hoan tien', () => {
  const tld = duoiRieng();
  don([
    { tld, amount: 300_000, status: 'active' },
    { tld, amount: 300_000, status: 'failed' },
    { tld, amount: 300_000, status: 'refunded' },
  ]);

  // Ba dong nhung chi dong 'active' duoc tinh
  assert.equal(soLieu(tld).doanhThu, 300_000);
  assert.equal(soLieu(tld).soLuong, 1);
});

test('lai gop = doanh thu tru gia von', () => {
  const tld = duoiRieng();
  don([{ tld, amount: 300_000, status: 'active' }]);

  const d = soLieu(tld);
  assert.equal(d.doanhThu, 300_000);
  assert.equal(d.giaVon, 200_000);
  assert.equal(d.lai, 100_000);
});

test('truc thoi gian lien tuc - thang khong ban duoc gi van co mat', () => {
  const rows = doanhThuTheoThang(12);

  assert.equal(rows.length, 12, 'phai du 12 thang du co thang rong');

  // Cac thang phai lien tiep va tang dan
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i]!.thang > rows[i - 1]!.thang, 'thang phai sap xep tu cu den moi');
  }

  // Thang cuoi la thang hien tai
  assert.equal(rows[11]!.thang, new Date().toISOString().slice(0, 7));
});

test('thang khong co doanh thu tra ve so 0, khong phai undefined', () => {
  const rows = doanhThuTheoThang(12);
  for (const r of rows) {
    assert.equal(typeof r.doanhThu, 'number');
    assert.equal(typeof r.lai, 'number');
    assert.ok(r.doanhThu >= 0);
  }
});

test('thong ke theo duoi ten mien tinh dung ty le lai', () => {
  const tld = duoiRieng();
  don([{ tld, amount: 300_000, status: 'active' }]);

  const d = soLieu(tld);
  assert.equal(d.lai, d.doanhThu - d.giaVon);
  assert.equal(d.tyLeLai, Math.round((d.lai / d.doanhThu) * 100));
  assert.equal(d.tyLeLai, 33);
});

test('don chua thanh toan khong duoc tinh vao doanh thu', () => {
  const tld = duoiRieng();
  const { orderId } = don([{ tld, amount: 300_000, status: 'active' }]);
  assert.equal(soLieu(tld).doanhThu, 300_000);

  db.prepare(`UPDATE orders SET status='pending_payment', paid_at=NULL WHERE id=?`).run(orderId);
  assert.equal(soLieu(tld).doanhThu, 0, 'don chua thanh toan khong duoc tinh');
});

test('CSV co BOM de Excel doc dung tieng Viet', () => {
  const csv = toCsv(['Cot'], [['Tiếng Việt có dấu']]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('Tiếng Việt có dấu'));
});

test('CSV boc dau nhay va dau phay dung chuan', () => {
  const csv = toCsv(['A', 'B'], [['Cong ty "ABC"', 'Ha Noi, Viet Nam']]);
  assert.ok(csv.includes('"Cong ty ""ABC"""'), 'dau nhay kep phai duoc nhan doi');
  assert.ok(csv.includes('"Ha Noi, Viet Nam"'), 'dau phay phai nam trong o');
});

test('CSV xu ly gia tri rong va null', () => {
  const csv = toCsv(['A', 'B', 'C'], [['x', null, undefined]]);
  assert.ok(csv.includes('"x","",""'));
});
