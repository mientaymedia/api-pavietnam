/**
 * Quan tri: so du dai ly that (check_account_still), co che do thu / that,
 * Kiem tra API, trang Don cho xu ly (kich hoat, thu lai, danh dau that bai).
 * May chu P.A gia cuc bo.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AppThu, Phien } from './helpers/http-app.js';
import type { PaGia } from './helpers/pa-gia.js';

let app: AppThu;
let pa: PaGia;
let qt: Phien;
let M: {
  db: typeof import('../src/db/index.js')['db'];
  nowIso: typeof import('../src/db/index.js')['nowIso'];
  config: typeof import('../src/config.js')['config'];
};
let cu: Record<string, unknown> = {};

before(async () => {
  const { moApp } = await import('./helpers/http-app.js');
  const { moPaGia } = await import('./helpers/pa-gia.js');
  app = await moApp();
  pa = await moPaGia();
  const { db, nowIso } = await import('../src/db/index.js');
  const { config } = await import('../src/config.js');
  const { upsertTld } = await import('../src/services/pricing.js');
  M = { db, nowIso, config };
  cu = { ...config.pa };
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false, username: 'daily-thu', apikey: 'khoa-thu-1234567890', retries: 0, log: false,
  });
  upsertTld({ tld: 'net', kind: 'intl', cost_register: 300_000, cost_renew: 300_000, price_register: 400_000, price_renew: 400_000, is_active: 1 });
  qt = await app.quanTri();
});
after(async () => {
  Object.assign(M.config.pa, cu);
  app?.dong();
  await pa?.dong();
});

const trang = async (p: string) => (await app.lay(p, { headers: { cookie: qt.cookie } })).text();

test('tong quan hien so du dai ly that tu check_account_still va che do that', async () => {
  pa.datLai();
  pa.dat('check_account_still', { body: '{"Command":"check_account_still","Username":"daily-thu","Money":"3,896"}' });
  const html = await trang('/admin');
  assert.match(html, /Tài khoản đại lý P\.A/);
  assert.match(html, /3\.896/);
  assert.doesNotMatch(html, /chế độ THỬ/);
  pa.dat('check_account_still', null);
});

test('che do thu: moi trang quan tri hien dai canh bao', async () => {
  M.config.pa.useTestEndpoint = true;
  try {
    assert.match(await trang('/admin/don-hang'), /P\.A đang ở chế độ THỬ/);
  } finally {
    M.config.pa.useTestEndpoint = false;
  }
});

test('Kiem tra API dung check_account_still: thanh cong va loi 501', async () => {
  pa.datLai();
  const csrf = await app.csrf('/admin/cau-hinh', qt);
  let r = await app.guiForm('/admin/cau-hinh/kiem-tra-api', qt, { _csrf: csrf, test_domain: '' });
  assert.equal(r.status, 302);
  assert.deepEqual(pa.yeuCau.map((q) => q.cmd), ['check_account_still']);
  assert.match(await trang('/admin/cau-hinh'), /Kết nối API: THÀNH CÔNG/);

  pa.dat('check_account_still', { body: '{"Command":"check_account_still","ReturnCode":501,"ReturnText":"Lỗi: IP không được phép truy cập hệ thống API"}' });
  r = await app.guiForm('/admin/cau-hinh/kiem-tra-api', qt, { _csrf: await app.csrf('/admin/cau-hinh', qt), test_domain: '' });
  const html = await trang('/admin/cau-hinh');
  assert.match(html, /THẤT BẠI\. Mã 501/);
  pa.dat('check_account_still', null);
});

function donGiu(hold: string, domain: string): { orderId: number; itemId: number } {
  const contactId = Number(M.db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, id_number, email, phone, address, ward, province, country, created_at, updated_at)
     VALUES (?, 'individual', 'Nguyễn Văn An', '087123456789', 'an@vidu.vn', '+84-987654321', '344 Huỳnh Tấn Phát', 'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', 'VN', ?, ?)`,
  ).run(qt.userId, M.nowIso(), M.nowIso()).lastInsertRowid);
  const orderId = Number(M.db.prepare(
    `INSERT INTO orders (code, user_id, contact_id, status, total, created_at, updated_at) VALUES (?, ?, ?, 'processing', 400000, ?, ?)`,
  ).run(`DHQ${Math.random().toString(36).slice(2, 8).toUpperCase()}`, qt.userId, contactId, M.nowIso(), M.nowIso()).lastInsertRowid);
  const itemId = Number(M.db.prepare(
    `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, hold, hold_since, pa_code, error, created_at, updated_at)
     VALUES (?, 'register', ?, 'net', 1, 400000, 400000, 'pending', ?, ?, ?, 'loi thu', ?, ?)`,
  ).run(orderId, domain, hold, M.nowIso(), hold === 'can_nguoi_xu_ly' ? '606' : '400', M.nowIso(), M.nowIso()).lastInsertRowid);
  return { orderId, itemId };
}

test('Don cho xu ly: liet ke, kich hoat don cho quy khi du so du, danh dau that bai', async () => {
  pa.datLai();
  const d1 = `qt${Math.random().toString(36).slice(2, 8)}.net`;
  const d2 = `qt${Math.random().toString(36).slice(2, 8)}.net`;
  const cho = donGiu('cho_nap_quy', d1);
  const can = donGiu('can_nguoi_xu_ly', d2);
  const html = await trang('/admin/cho-xu-ly');
  assert.match(html, new RegExp(d1.replace('.', '\\.')));
  assert.match(html, new RegExp(d2.replace('.', '\\.')));
  assert.match(html, />606</);

  const r = await app.guiForm('/admin/cho-xu-ly/kich-hoat', qt, { _csrf: await app.csrf('/admin/cho-xu-ly', qt) });
  assert.equal(r.status, 302);
  const dong = M.db.prepare('SELECT status, hold FROM order_items WHERE id = ?');
  assert.deepEqual(dong.get(cho.itemId), { status: 'active', hold: '' });
  // Dong 606 khong bi kich hoat chung
  assert.deepEqual(dong.get(can.itemId), { status: 'pending', hold: 'can_nguoi_xu_ly' });

  const r2 = await app.guiForm(`/admin/cho-xu-ly/${can.itemId}/that-bai`, qt, { _csrf: await app.csrf('/admin/cho-xu-ly', qt) });
  assert.equal(r2.headers.get('location'), `/admin/don-hang/${can.orderId}`);
  assert.deepEqual(dong.get(can.itemId), { status: 'failed', hold: '' });
});

test('Thu lai: nha dong dang giu ve hang doi', async () => {
  const d = `qt${Math.random().toString(36).slice(2, 8)}.net`;
  const sai = donGiu('sai_ho_so', d);
  await app.guiForm(`/admin/cho-xu-ly/${sai.itemId}/thu-lai`, qt, { _csrf: await app.csrf('/admin/cho-xu-ly', qt) });
  const r = M.db.prepare('SELECT hold FROM order_items WHERE id = ?').get(sai.itemId) as { hold: string };
  assert.equal(r.hold, '');
  const job = M.db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE type = 'provision_item' AND payload LIKE ?`).get(`%"itemId":${sai.itemId}%`) as { n: number };
  assert.ok(job.n >= 1);
});
