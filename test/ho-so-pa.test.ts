/**
 * Ho so chu the theo yeu cau P.A: kiem hop le phia may chu, kiem theo duoi o
 * trang thanh toan, form 2 buoc khong JS, danh sach phuong xa JSON.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AppThu, Phien } from './helpers/http-app.js';

let app: AppThu;
let M: {
  db: typeof import('../src/db/index.js')['db'];
  nowIso: typeof import('../src/db/index.js')['nowIso'];
  contactSchema: typeof import('../src/lib/validate.js')['contactSchema'];
  loiHoSoPA: typeof import('../src/services/domainContact.js')['loiHoSoPA'];
  upsertTld: typeof import('../src/services/pricing.js')['upsertTld'];
};

const HOP_LE = {
  kind: 'individual', full_name: 'Nguyễn Văn An', id_number: '087123456789', email: 'an@vidu.vn',
  phone: '0987 654 321', address: '344 Huỳnh Tấn Phát', province: 'thành phố hồ chí minh', ward: 'Phường Tân Thuận',
  birth_date: '1990-05-01', gender: 'nam',
};

before(async () => {
  const { moApp } = await import('./helpers/http-app.js');
  app = await moApp();
  const { db, nowIso } = await import('../src/db/index.js');
  const { contactSchema } = await import('../src/lib/validate.js');
  const { loiHoSoPA } = await import('../src/services/domainContact.js');
  const { upsertTld } = await import('../src/services/pricing.js');
  M = { db, nowIso, contactSchema, loiHoSoPA, upsertTld };
  upsertTld({ tld: 'vn', kind: 'vn', price_register: 450_000, price_renew: 450_000, requires_vn_contact: 1, is_active: 1 });
  upsertTld({ tld: 'com', kind: 'intl', price_register: 300_000, price_renew: 300_000, is_active: 1 });
});
after(() => app?.dong());

test('ho so hop le: luu dien thoai +84-, ten tinh va phuong chuan cua P.A, gioi tinh Nam', () => {
  const r = M.contactSchema.safeParse(HOP_LE);
  assert.equal(r.success, true, JSON.stringify(!r.success && r.error.issues));
  if (!r.success) return;
  assert.equal(r.data.phone, '+84-987654321');
  assert.equal(r.data.province, 'Thành phố Hồ Chí Minh');
  assert.equal(r.data.ward, 'Phường Tân Thuận');
  assert.equal(r.data.gender, 'Nam');
});

test('ho so sai: dia chi khong so nha, phuong khong thuoc tinh, CCCD sai, MST sai, nuoc ngoai', () => {
  const loi = (o: Record<string, string>) => {
    const r = M.contactSchema.safeParse({ ...HOP_LE, ...o });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };
  assert.deepEqual(loi({ address: 'Huỳnh Tấn Phát' }), ['address']);
  assert.deepEqual(loi({ address: 'Ấp Bình Khánh' }), []);
  assert.deepEqual(loi({ ward: 'Phường Bình Đức' }), ['ward']);
  assert.deepEqual(loi({ province: 'Sài Gòn' }), ['province']);
  assert.deepEqual(loi({ id_number: '12345' }), ['id_number']);
  assert.deepEqual(loi({ phone: '12345' }), ['phone']);
  assert.deepEqual(loi({ birth_date: '2099-01-01' }), ['birth_date']);
  assert.deepEqual(loi({ kind: 'organization', org_name: 'Công ty ABC', tax_code: '123' }), ['tax_code']);
  assert.deepEqual(loi({ country: 'US' }), ['country']);
});

function hoSoDb(o: Record<string, string> = {}) {
  return {
    id: 0, user_id: 0, kind: 'individual', full_name: 'Nguyễn Văn An', org_name: '', id_number: '087123456789', tax_code: '',
    email: 'an@vidu.vn', phone: '+84-987654321', address: '344 Huỳnh Tấn Phát', ward: 'Phường Tân Thuận', city: '',
    province: 'Thành phố Hồ Chí Minh', postal_code: '', country: 'VN', birth_date: '1990-05-01', gender: 'Nam', ...o,
  };
}

test('kiem theo duoi: .vn doi ngay sinh, gioi tinh; cong ty .vn doi CCCD nguoi dai dien; .com thi khong', () => {
  assert.deepEqual(M.loiHoSoPA(hoSoDb(), 'vn'), []);
  const thieu = hoSoDb({ birth_date: '', gender: '' });
  assert.equal(M.loiHoSoPA(thieu, 'vn').length, 2);
  assert.deepEqual(M.loiHoSoPA(thieu, 'com'), []);
  const congTy = hoSoDb({ kind: 'organization', org_name: 'Công ty TNHH ABC', tax_code: '0314785258', id_number: '' });
  assert.deepEqual(M.loiHoSoPA(congTy, 'com'), []);
  assert.match(M.loiHoSoPA(congTy, 'com.vn').join(), /CCCD người đại diện/);
  // Ho so cu chua co phuong xa
  assert.match(M.loiHoSoPA(hoSoDb({ ward: '' }), 'com').join(), /phường, xã/);
});

test('JSON phuong xa theo tinh (ma hoac ten)', async () => {
  const ds = await (await app.lay('/dia-gioi/phuong?tinh=91')).json() as string[];
  assert.ok(ds.includes('Phường Bình Đức'));
  const ds2 = await (await app.lay(`/dia-gioi/phuong?tinh=${encodeURIComponent('Tỉnh An Giang')}`)).json() as string[];
  assert.deepEqual(ds2, ds);
  assert.deepEqual(await (await app.lay('/dia-gioi/phuong?tinh=khong')).json(), []);
});

let khach: Phien;

test('form 2 buoc khong JS: chon tinh roi bam lay danh sach -> ve lai form kem phuong xa, chua luu', async () => {
  khach = await app.khach();
  const truoc = (M.db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(khach.userId) as { n: number }).n;
  const r = await app.guiForm('/tai-khoan/ho-so', khach, { _csrf: khach.csrf, buoc: 'chon-tinh', full_name: 'Nguyễn Văn An', province: 'Tỉnh An Giang' });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<option value="Phường Bình Đức"/);
  assert.match(html, /value="Nguyễn Văn An"/);
  const sau = (M.db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(khach.userId) as { n: number }).n;
  assert.equal(sau, truoc);
});

test('luu ho so qua form, sua lai duoc qua ?sua=', async () => {
  const r = await app.guiForm('/tai-khoan/ho-so', khach, { _csrf: khach.csrf, ...HOP_LE });
  assert.equal(r.status, 302);
  const row = M.db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(khach.userId) as Record<string, string | number>;
  assert.equal(row['ward'], 'Phường Tân Thuận');
  assert.equal(row['phone'], '+84-987654321');
  const html = await (await app.lay(`/tai-khoan/ho-so?sua=${row['id']}`, { headers: { cookie: khach.cookie } })).text();
  assert.match(html, new RegExp(`name="id" value="${row['id']}"`));
  assert.match(html, /<option value="Phường Tân Thuận" selected>/);
});

test('thanh toan: ho so cu thieu ngay sinh khong dat duoc don .vn, hien danh sach can bo sung', async () => {
  const k = await app.khach();
  const id = Number(M.db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, id_number, email, phone, address, ward, province, country, is_default, created_at, updated_at)
     VALUES (?, 'individual', 'Nguyễn Văn Cũ', '087123456780', 'cu@vidu.vn', '+84-987654322', '12 Lê Lợi', 'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', 'VN', 1, ?, ?)`,
  ).run(k.userId, M.nowIso(), M.nowIso()).lastInsertRowid);
  M.db.prepare(
    `INSERT INTO cart_items (cart_key, user_id, action, domain, tld, years, unit_price, amount, created_at)
     VALUES (?, ?, 'register', ?, 'vn', 1, 450000, 450000, ?)`,
  ).run(`user:${k.userId}`, k.userId, `hoso-${k.userId}.vn`, M.nowIso());
  const r = await app.guiForm('/thanh-toan', k, { _csrf: k.csrf, contact_id: String(id) });
  assert.equal(r.status, 422);
  const html = await r.text();
  assert.match(html, /thiếu ngày sinh/);
  assert.match(html, new RegExp(`/tai-khoan/ho-so\\?sua=${id}`));
  assert.equal((M.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(k.userId) as { n: number }).n, 0);

  // Bo sung roi dat lai: tao duoc don
  M.db.prepare(`UPDATE contacts SET birth_date = '1991-02-03', gender = 'Nữ' WHERE id = ?`).run(id);
  const r2 = await app.guiForm('/thanh-toan', k, { _csrf: k.csrf, contact_id: String(id) });
  assert.equal(r2.status, 302);
  assert.match(r2.headers.get('location') ?? '', /^\/don-hang\/DH/);
});
