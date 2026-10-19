/**
 * Luong cap phat sau thanh toan voi may chu P.A gia cuc bo (dung dinh dang tai
 * lieu): dang ky .vn ca nhan, .com.vn cong ty, .com; thieu quy roi nap; 400,
 * 606, 6023, 303; gia han; che do thu 900. Khong goi P.A that.
 */
import './helpers/db.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { db, nowIso } from '../src/db/index.js';
import { decryptSecret } from '../src/lib/crypto.js';
import { upsertTld } from '../src/services/pricing.js';
import { provisionItem, provisionOrder } from '../src/services/provisioning.js';
import { kichHoatDonCho, tomTatChoQuy } from '../src/services/choQuy.js';
import { dangKyKenh, type SuKienDon } from '../src/services/suKienDon.js';
import { ma, moPaGia, type PaGia } from './helpers/pa-gia.js';

let pa: PaGia;
const cu = { ...config.pa };
const suKien: SuKienDon[] = [];
let userId = 0;
let caNhan = 0;
let congTy = 0;

before(async () => {
  pa = await moPaGia();
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false, username: 'daily-thu', apikey: 'khoa-thu-1234567890', retries: 0, log: true,
  });
  upsertTld({ tld: 'vn', kind: 'vn', cost_register: 750_000, cost_renew: 480_000, price_register: 900_000, price_renew: 600_000, requires_vn_contact: 1, is_active: 1 });
  upsertTld({ tld: 'com.vn', kind: 'vn', cost_register: 650_000, cost_renew: 480_000, price_register: 800_000, price_renew: 600_000, requires_vn_contact: 1, is_active: 1 });
  upsertTld({ tld: 'com', kind: 'intl', cost_register: 280_000, cost_renew: 280_000, price_register: 350_000, price_renew: 350_000, is_active: 1 });

  userId = Number(db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Khach', ?, ?)`)
    .run(`cp-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid);
  const hoSo = db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, org_name, id_number, tax_code, email, phone, address, ward, province, country, birth_date, gender, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VN', ?, ?, ?, ?)`,
  );
  caNhan = Number(hoSo.run(userId, 'individual', 'Nguyễn Văn An', '', '087123456789', '', 'an@vidu.vn', '+84-987654321',
    '344 Huỳnh Tấn Phát', 'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', '1990-05-01', 'Nam', nowIso(), nowIso()).lastInsertRowid);
  congTy = Number(hoSo.run(userId, 'organization', 'Trần Thị Bình', 'Công ty TNHH ABC', '079222333444', '0314785258', 'b@abc.vn', '+84-2963811111',
    '12A5 Lê Thị Hồng Gấm', 'Phường Bình Đức', 'Tỉnh An Giang', '1985-11-27', 'Nữ', nowIso(), nowIso()).lastInsertRowid);

  dangKyKenh('test_ghi', async (e) => { suKien.push(e); });
});
after(async () => {
  Object.assign(config.pa, cu);
  await pa.dong();
});
beforeEach(() => {
  pa.datLai();
  config.pa.useTestEndpoint = false;
  suKien.length = 0;
  // Khong de dong cho quy cua test truoc lan sang test sau
  // (chi dong cua khach trong tep nay: CSDL test dung chung voi tep khac)
  db.prepare(`UPDATE order_items SET hold = '', status = 'failed' WHERE hold <> '' AND order_id IN (SELECT id FROM orders WHERE user_id = ?)`).run(userId);
});

function taoDon(dong: { action?: 'register' | 'renew'; domain: string; tld: string; years?: number; amount?: number }[], contactId = caNhan) {
  const code = `DHT${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const orderId = Number(db.prepare(
    `INSERT INTO orders (code, user_id, contact_id, status, subtotal, total, paid_at, created_at, updated_at) VALUES (?, ?, ?, 'paid', 0, 0, ?, ?, ?)`,
  ).run(code, userId, contactId, nowIso(), nowIso(), nowIso()).lastInsertRowid);
  const ids = dong.map((d) => Number(db.prepare(
    `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(orderId, d.action ?? 'register', d.domain, d.tld, d.years ?? 1, d.amount ?? 900_000, d.amount ?? 900_000, nowIso(), nowIso()).lastInsertRowid));
  return { orderId, code, ids };
}

const dong = (id: number) => db.prepare('SELECT * FROM order_items WHERE id = ?').get(id) as Record<string, string | number>;
const don = (id: number) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<string, string>;
const tenMoi = (duoi: string) => `cp${Math.random().toString(36).slice(2, 9)}.${duoi}`;
const lenh = (cmd: string) => pa.yeuCau.filter((q) => q.cmd === cmd);

test('.vn ca nhan: kiem so du, register_domain_vietnam, luu trans_id, ngay het han tu get_date_domain, mat khau', async () => {
  const d = tenMoi('vn');
  const { orderId, ids } = taoDon([{ domain: d, tld: 'vn' }]);
  const kq = await provisionOrder(orderId);
  assert.equal(kq.succeeded, 1);
  assert.deepEqual(pa.yeuCau.map((q) => q.cmd), ['check_account_still', 'register_domain_vietnam', 'get_date_domain']);
  const q = lenh('register_domain_vietnam')[0]!.thamSo;
  assert.equal(q['domainName'], d.split('.')[0]);
  assert.equal(q['for'], 'canhan');
  assert.equal(q['uiGender'], 'Nam');
  assert.equal(q['adminName'], 'Nguyễn Văn An');
  assert.equal(q['ownerWard'], 'Phường Tân Thuận');
  const r = dong(ids[0]!);
  assert.equal(r['status'], 'active');
  assert.ok(String(r['pa_trans_id']).length > 0);
  assert.equal(r['pa_trans_money'], 830_000);
  const ten = db.prepare('SELECT * FROM domains WHERE domain = ?').get(d) as Record<string, string>;
  assert.equal(ten['expires_at'], '2027-10-19T00:00:00Z');
  assert.equal(decryptSecret(ten['pa_password_enc']!), q['passwordDomain']);
  assert.equal(don(orderId)['status'], 'completed');
  assert.deepEqual(suKien.map((e) => e.loai), ['dang_ky_xong']);
});

test('.com.vn cong ty: for=congty, MST, nguoi quan ly la nguoi dai dien', async () => {
  const { orderId, ids } = taoDon([{ domain: tenMoi('com.vn'), tld: 'com.vn' }], congTy);
  await provisionOrder(orderId);
  const q = lenh('register_domain_vietnam')[0]!.thamSo;
  assert.equal(q['domainExt'], 'com.vn');
  assert.equal(q['for'], 'congty');
  assert.equal(q['ownerType'], '2');
  assert.equal(q['ownerName'], 'Công ty TNHH ABC');
  assert.equal(q['ownerTaxCode'], '0314785258');
  assert.equal(q['adminName'], 'Trần Thị Bình');
  assert.equal(q['adminGender'], 'Nữ');
  assert.equal(dong(ids[0]!)['status'], 'active');
});

test('.com: register_domain_quocte, khong co nhom admin', async () => {
  const { orderId, ids } = taoDon([{ domain: tenMoi('com'), tld: 'com', amount: 350_000 }]);
  await provisionOrder(orderId);
  const q = lenh('register_domain_quocte')[0]!.thamSo;
  assert.equal(q['domainExt'], 'com');
  assert.equal(q['adminName'], undefined);
  assert.equal(dong(ids[0]!)['status'], 'active');
});

test('thieu quy: giu cho nap quy, khong goi dang ky, khong hoan; nap roi kich hoat; bam lan hai khong dang ky lai', async () => {
  pa.soDu = 100_000;
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  await provisionOrder(orderId);
  let r = dong(ids[0]!);
  assert.equal(r['status'], 'pending');
  assert.equal(r['hold'], 'cho_nap_quy');
  assert.equal(lenh('register_domain_vietnam').length, 0);
  assert.equal(don(orderId)['status'], 'processing'); // khach thay "dang xu ly"
  assert.equal(suKien[0]?.loai, 'cho_quy');
  const t = await tomTatChoQuy();
  assert.equal(t.soDu, 100_000);
  assert.equal(t.canNap, 750_000 - 100_000);

  // Job / kich hoat khi chua nap: van giu, khong dang ky
  const k0 = await kichHoatDonCho();
  assert.equal(k0.ketQua.length, 0);
  assert.equal(dong(ids[0]!)['hold'], 'cho_nap_quy');

  pa.soDu = 5_000_000;
  const [k1, k2] = await Promise.all([kichHoatDonCho(), kichHoatDonCho()]);
  const k3 = await kichHoatDonCho();
  r = dong(ids[0]!);
  assert.equal(r['status'], 'active');
  assert.equal(r['hold'], '');
  assert.equal(lenh('register_domain_vietnam').length, 1);
  assert.equal(k1.ketQua.length + k2.ketQua.length + k3.ketQua.length, 1);
  assert.equal(don(orderId)['status'], 'completed');
});

test('P.A tra 400 du so du kiem truoc: van giu cho nap quy', async () => {
  pa.dat('register_domain_vietnam', ma('register_domain_vietnam', 400, 'Lỗi: Tài khoản không đủ tiền để thực hiện giao dịch'));
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  await provisionOrder(orderId);
  assert.equal(dong(ids[0]!)['hold'], 'cho_nap_quy');
  assert.equal(dong(ids[0]!)['pa_code'], '400');
});

test('606 da tru tien: giu can nguoi xu ly, khong hoan tien', async () => {
  pa.dat('register_domain_vietnam', ma('register_domain_vietnam', 606, 'Lỗi: Đã trừ tiền giao dịch nhưng domain chưa được đưa vào hàng đợi'));
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  await provisionOrder(orderId);
  const r = dong(ids[0]!);
  assert.equal(r['hold'], 'can_nguoi_xu_ly');
  assert.equal(r['status'], 'pending');
  assert.equal(suKien[0]?.loai, 'can_nguoi_xu_ly');
  assert.equal(suKien[0]?.maPA, '606');
  // Chay lai don khong goi P.A them lan nao
  await provisionOrder(orderId);
  assert.equal(lenh('register_domain_vietnam').length, 1);
});

test('6023 phuong xa sai: giu sai ho so, khong thu lai tu dong', async () => {
  pa.dat('register_domain_vietnam', ma('register_domain_vietnam', 6023, 'Lỗi: Phường xã không đúng ở tham số: ownerWard'));
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  await provisionOrder(orderId);
  assert.equal(dong(ids[0]!)['hold'], 'sai_ho_so');
  assert.equal(suKien[0]?.loai, 'sai_ho_so');
});

test('ho so cu thieu phuong xa: giu sai ho so truoc khi goi P.A', async () => {
  const cuId = Number(db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, id_number, email, phone, address, country, created_at, updated_at)
     VALUES (?, 'individual', 'Lê Văn Cũ', '087123456700', 'cu@vidu.vn', '0901234567', '1 Lê Lợi', 'VN', ?, ?)`,
  ).run(userId, nowIso(), nowIso()).lastInsertRowid);
  const { orderId, ids } = taoDon([{ domain: tenMoi('com'), tld: 'com' }], cuId);
  await provisionOrder(orderId);
  assert.equal(dong(ids[0]!)['hold'], 'sai_ho_so');
  assert.match(String(dong(ids[0]!)['error']), /Tỉnh, thành phố không đúng danh sách/);
  assert.equal(pa.yeuCau.length, 0);
});

test('303 lan dau: that bai vinh vien va hoan tien', async () => {
  pa.dat('register_domain_vietnam', ma('register_domain_vietnam', 303, 'Lỗi: Domain đã tồn tại trong hệ thống'));
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  await provisionOrder(orderId);
  assert.equal(dong(ids[0]!)['status'], 'refunded');
  assert.equal(lenh('check_domain').length, 0);
});

test('303 o lan thu hai va check_domain = 1: coi la lan truoc da dang ky duoc', async () => {
  pa.dat('register_domain_vietnam', ma('register_domain_vietnam', 303, 'Lỗi: Domain đã tồn tại trong hệ thống'));
  pa.dat('check_domain', ma('check_domain', 1, 'Domain thuoc quyen quan ly cua ban'));
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  db.prepare('UPDATE order_items SET attempts = 1 WHERE id = ?').run(ids[0]!); // lan truoc het gio cho
  await provisionOrder(orderId);
  assert.equal(dong(ids[0]!)['status'], 'active');
  assert.equal(lenh('check_domain').length, 1);
});

test('gia han: renew_domain voi domain, year; ngay het han moi doc tu get_date_domain', async () => {
  const d = tenMoi('vn');
  db.prepare(`INSERT INTO domains (user_id, domain, tld, status, expires_at, created_at, updated_at) VALUES (?, ?, 'vn', 'active', '2026-11-01T00:00:00Z', ?, ?)`)
    .run(userId, d, nowIso(), nowIso());
  pa.dat('get_date_domain', { body: JSON.stringify({ Command: 'get_date_domain', Domain: d, Date: '01/11/2020 - 01/11/2028' }) });
  const { orderId, ids } = taoDon([{ action: 'renew', domain: d, tld: 'vn', years: 2, amount: 1_200_000 }]);
  await provisionOrder(orderId);
  const q = lenh('renew_domain')[0]!.thamSo;
  assert.equal(q['domain'], d);
  assert.equal(q['year'], '2');
  assert.equal(dong(ids[0]!)['status'], 'active');
  assert.equal((db.prepare('SELECT expires_at FROM domains WHERE domain = ?').get(d) as { expires_at: string }).expires_at, '2028-11-01T00:00:00Z');
  // Can quy cho gia han: cost_renew x so nam
  assert.equal(pa.yeuCau[0]!.cmd, 'check_account_still');
});

test('che do thu: dang ky di interface_test.php, 900 la thanh cong va danh dau paThu', async () => {
  config.pa.useTestEndpoint = true;
  const { orderId, ids } = taoDon([{ domain: tenMoi('vn'), tld: 'vn' }]);
  await provisionOrder(orderId);
  const r = dong(ids[0]!);
  assert.equal(r['status'], 'active');
  assert.equal(r['pa_code'], '900');
  assert.equal(JSON.parse(String(r['meta']))['paThu'], true);
  assert.equal(lenh('register_domain_vietnam')[0]!.duongDan, '/interface_test.php');
  assert.equal(lenh('get_date_domain').length, 0);
});

test('loi mang lap lai qua 3 lan: giu can nguoi xu ly, khong hoan', async () => {
  pa.dat('register_domain_quocte', { status: 503, body: 'Service Unavailable' });
  const { ids } = taoDon([{ domain: tenMoi('com'), tld: 'com' }]);
  for (let i = 0; i < 3; i++) await provisionItem(ids[0]!).catch(() => false);
  const r = dong(ids[0]!);
  assert.equal(r['hold'], 'can_nguoi_xu_ly');
  assert.equal(r['status'], 'pending');
});
