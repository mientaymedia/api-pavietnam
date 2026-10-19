/**
 * Cong may noi bo cho CRM (/api/noi-bo/trang-thai, /api/noi-bo/kich-hoat) va
 * day su kien sang CRM. P.A va CRM deu la may chu gia cuc bo.
 */
import './helpers/csdl-rieng.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppThu } from './helpers/http-app.js';
import type { PaGia } from './helpers/pa-gia.js';

const KHOA = 'khoa-noi-bo-thu-0123456789abcdef0123456789';
const KHOA_CRM = 'khoa-gui-crm-thu-0123456789abcdef01234567';
let app: AppThu;
let pa: PaGia;
let M: {
  db: typeof import('../src/db/index.js')['db'];
  nowIso: typeof import('../src/db/index.js')['nowIso'];
  config: typeof import('../src/config.js')['config'];
  setSettings: typeof import('../src/lib/settings.js')['setSettings'];
  SECRET_KEYS: string[];
  handlers: typeof import('../src/jobs/handlers.js')['handlers'];
  provisionOrder: typeof import('../src/services/provisioning.js')['provisionOrder'];
  markOrderPaid: typeof import('../src/services/orders.js')['markOrderPaid'];
};
let cuPa: Record<string, unknown> = {};
let userId = 0;
let contactId = 0;

/* -------------------------------------------------------- CRM gia lap */
interface YeuCauCrm { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }
const crmNhan: YeuCauCrm[] = [];
let crmTraVe = 200;
const crm = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    if (req.url === '/api/tich-hop/web-ten-mien/su-kien') crmNhan.push({ headers: req.headers, body: JSON.parse(b) });
    res.writeHead(crmTraVe, { 'content-type': 'application/json' });
    res.end(JSON.stringify(crmTraVe === 200 ? { ok: true } : { error: 'loi thu' }));
  });
});

before(async () => {
  crm.listen(0, '127.0.0.1');
  await new Promise<void>((r) => crm.once('listening', () => r()));
  const { moApp } = await import('./helpers/http-app.js');
  const { moPaGia } = await import('./helpers/pa-gia.js');
  app = await moApp();
  pa = await moPaGia();
  const { db, nowIso } = await import('../src/db/index.js');
  const { config } = await import('../src/config.js');
  const st = await import('../src/lib/settings.js');
  const { handlers } = await import('../src/jobs/handlers.js');
  const { provisionOrder } = await import('../src/services/provisioning.js');
  const { markOrderPaid } = await import('../src/services/orders.js');
  const { upsertTld } = await import('../src/services/pricing.js');
  M = { db, nowIso, config, setSettings: st.setSettings, SECRET_KEYS: st.SECRET_KEYS, handlers, provisionOrder, markOrderPaid };
  cuPa = { ...config.pa };
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false, username: 'daily-thu', apikey: 'khoa-thu-1234567890', retries: 0, log: false,
  });
  config.webTenMienKey = `ngan,${KHOA}`;
  upsertTld({ tld: 'biz', kind: 'intl', cost_register: 250_000, cost_renew: 250_000, price_register: 330_000, price_renew: 330_000, vat_percent: 10, is_active: 1 });
  userId = Number(db.prepare(`INSERT INTO users (email, password_hash, full_name, phone, created_at, updated_at) VALUES (?, 'x', 'Anh Nam', '0901234567', ?, ?)`)
    .run(`nb-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid);
  contactId = Number(db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, id_number, email, phone, address, ward, province, country, created_at, updated_at)
     VALUES (?, 'individual', 'Trần Văn Nam', '087123456789', 'nam@vidu.vn', '+84-901234567', '344 Huỳnh Tấn Phát', 'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', 'VN', ?, ?)`,
  ).run(userId, nowIso(), nowIso()).lastInsertRowid);
});
after(async () => {
  Object.assign(M.config.pa, cuPa);
  app?.dong();
  await pa?.dong();
  crm.close();
});
beforeEach(() => {
  pa.datLai();
  crmNhan.length = 0;
  crmTraVe = 200;
});

const goi = (p: string, init: RequestInit & { khoa?: string } = {}) =>
  app.lay(`/api/noi-bo${p}`, {
    ...init,
    headers: { authorization: `Bearer ${init.khoa ?? KHOA}`, 'x-mtm-nguon': 'crm', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });

function taoDon(opts: { hold?: string; paCode?: string; status?: string; orderStatus?: string } = {}) {
  const code = `DHN${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const domain = `nb${Math.random().toString(36).slice(2, 8)}.biz`;
  const orderId = Number(M.db.prepare(
    `INSERT INTO orders (code, user_id, contact_id, status, subtotal, discount, vat, total, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 330000, 30000, 30000, 330000, ?, ?, ?)`,
  ).run(code, userId, contactId, opts.orderStatus ?? 'processing', M.nowIso(), M.nowIso(), M.nowIso()).lastInsertRowid);
  const itemId = Number(M.db.prepare(
    `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, hold, hold_since, pa_code, error, created_at, updated_at)
     VALUES (?, 'register', ?, 'biz', 1, 330000, 330000, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(orderId, domain, opts.status ?? 'pending', opts.hold ?? '', opts.hold ? M.nowIso() : null, opts.paCode ?? '', opts.hold ? 'Lỗi thử' : '', M.nowIso(), M.nowIso()).lastInsertRowid);
  M.db.prepare(`INSERT INTO payments (order_id, user_id, provider, ref_code, amount, status, provider_txn, paid_at, created_at, updated_at)
                VALUES (?, ?, 'sepay', ?, 330000, 'paid', ?, ?, ?, ?)`).run(orderId, userId, code, `FT${orderId}`, M.nowIso(), M.nowIso(), M.nowIso());
  return { orderId, itemId, code, domain };
}

/* ---------------------------------------------------- cong noi bo */

test('xac thuc: thieu / sai khoa 401, khoa ngan bi bo qua, chua cau hinh 503, POST khong JSON 415', async () => {
  assert.equal((await app.lay('/api/noi-bo/trang-thai')).status, 401);
  assert.equal((await goi('/trang-thai', { khoa: 'sai-khoa-0123456789abcdef0123456789abcd' })).status, 401);
  assert.equal((await goi('/trang-thai', { khoa: 'ngan' })).status, 401);
  const r415 = await goi('/kich-hoat', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
  assert.equal(r415.status, 415);
  const cu = M.config.webTenMienKey;
  M.config.webTenMienKey = '';
  try {
    const r = await goi('/trang-thai');
    assert.equal(r.status, 503);
    assert.equal(((await r.json()) as { ma_loi: string }).ma_loi, 'chua_bat');
  } finally {
    M.config.webTenMienKey = cu;
  }
});

test('trang-thai: so du P.A, don cho quy kem tong can nap, don loi kem ma P.A', async () => {
  const cho = taoDon({ hold: 'cho_nap_quy', paCode: '400' });
  const loi = taoDon({ hold: 'can_nguoi_xu_ly', paCode: '606' });
  pa.soDu = 100_000;
  const r = await goi('/trang-thai');
  assert.equal(r.status, 200);
  const j = await r.json() as Record<string, any>;
  assert.equal(j['so_du'], 100_000);
  assert.equal(j['che_do'], 'that');
  const dongCho = j['cho_quy'].don.find((d: any) => d.ma_don === cho.code);
  assert.equal(dongCho.can, 250_000);
  assert.ok(j['cho_quy'].can_nap >= 150_000);
  const dongLoi = j['don_loi'].find((d: any) => d.ma_don === loi.code);
  assert.equal(dongLoi.ma_pa, '606');
  assert.equal(dongLoi.loai_giu, 'can_nguoi_xu_ly');
  M.db.prepare(`UPDATE order_items SET hold = '', status = 'failed' WHERE id IN (?, ?)`).run(cho.itemId, loi.itemId);
});

test('kich-hoat theo ma_don: dang ky don cho quy, goi dong thoi khong dang ky hai lan; ma la 404', async () => {
  const cho = taoDon({ hold: 'cho_nap_quy', paCode: '400' });
  const body = JSON.stringify({ ma_don: cho.code });
  const [a, b] = await Promise.all([goi('/kich-hoat', { method: 'POST', body }), goi('/kich-hoat', { method: 'POST', body })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  const ja = await a.json() as Record<string, any>;
  const jb = await b.json() as Record<string, any>;
  assert.equal(ja.da_chay.length + jb.da_chay.length, 1);
  assert.equal(pa.yeuCau.filter((q) => q.cmd === 'register_domain_quocte').length, 1);
  assert.deepEqual(M.db.prepare('SELECT status, hold FROM order_items WHERE id = ?').get(cho.itemId), { status: 'active', hold: '' });
  const lai = await (await goi('/kich-hoat', { method: 'POST', body })).json() as Record<string, any>;
  assert.equal(lai.da_chay.length, 0);
  assert.equal((await goi('/kich-hoat', { method: 'POST', body: JSON.stringify({ ma_don: 'DHKHONGCO' }) })).status, 404);
  assert.equal((await goi('/kich-hoat', { method: 'POST', body: JSON.stringify({ ma_don: 'x y' }) })).status, 400);
});

/* ---------------------------------------------------- day su kien CRM */

async function chayJobCrm(): Promise<string[]> {
  const jobs = M.db.prepare(`SELECT id, payload FROM jobs WHERE type = 'day_su_kien_crm' AND status = 'queued' ORDER BY id`).all() as { id: number; payload: string }[];
  const kq: string[] = [];
  for (const j of jobs) {
    M.db.prepare(`UPDATE jobs SET status = 'done', dedupe_key = NULL WHERE id = ?`).run(j.id);
    try {
      await M.handlers.day_su_kien_crm(JSON.parse(j.payload));
      kq.push('ok');
    } catch (err) {
      kq.push(`loi:${String(err)}`);
    }
  }
  return kq;
}

test('CRM tat (mac dinh): khong xep su kien nao', async () => {
  const d = taoDon({ orderStatus: 'pending_payment' });
  M.db.prepare(`UPDATE orders SET status = 'pending_payment', paid_at = NULL WHERE id = ?`).run(d.orderId);
  M.markOrderPaid(d.orderId, { provider: 'sepay' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((M.db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE type = 'day_su_kien_crm'`).get() as { n: number }).n, 0);
});

test('don da thanh toan -> CRM: phien_ban 1, Idempotency-Key = ma_su_kien, tong dong = tong don; dang ky xong -> ten_mien_doi_han va gui lai anh chup', async () => {
  M.setSettings({ 'crm.bat': '1', 'crm.url': `http://127.0.0.1:${(crm.address() as AddressInfo).port}`, 'crm.khoa': KHOA_CRM }, M.SECRET_KEYS);
  const d = taoDon({ orderStatus: 'pending_payment' });
  M.db.prepare(`UPDATE orders SET status = 'pending_payment', paid_at = NULL WHERE id = ?`).run(d.orderId);
  M.markOrderPaid(d.orderId, { provider: 'sepay' });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(await chayJobCrm(), ['ok']);
  const ev = crmNhan[0]!;
  assert.equal(ev.headers['authorization'], `Bearer ${KHOA_CRM}`);
  assert.equal(ev.body['phien_ban'], 1);
  assert.equal(ev.body['su_kien'], 'don_da_thanh_toan');
  assert.equal(ev.body['ma_su_kien'], `don_da_thanh_toan:${d.code}`);
  assert.equal(ev.headers['idempotency-key'], ev.body['ma_su_kien']);
  assert.match(String(ev.body['luc']), /Z$/);
  const don = ev.body['don'] as Record<string, any>;
  assert.equal(don.tong, 330_000);
  assert.equal(don.dong.reduce((n: number, x: any) => n + x.thanh_tien_sau_thue, 0), don.tong);
  assert.equal(don.dong[0].giam_gia_phan_bo, 30_000);
  assert.equal(don.dong[0].tien_thue, 30_000);
  assert.equal(don.dong[0].thue_suat, 10);
  assert.equal(don.dong[0].trang_thai, 'dang_xu_ly');
  assert.equal(don.da_thu, 330_000);
  assert.equal(don.thanh_toan[0].nguon, 'sepay');
  assert.equal(don.nguoi_mua.ma_tai_khoan_web, userId);

  crmNhan.length = 0;
  await M.provisionOrder(d.orderId);
  assert.deepEqual(await chayJobCrm(), ['ok', 'ok']);
  const doiHan = crmNhan.find((x) => x.body['su_kien'] === 'ten_mien_doi_han')!;
  assert.equal(doiHan.body['ma_su_kien'], `ten_mien_doi_han:${d.domain}:2027-10-19:active`);
  assert.equal((doiHan.body['ten_mien'] as any).het_han, '2027-10-19');
  const lai = crmNhan.find((x) => x.body['su_kien'] === 'don_da_thanh_toan')!;
  assert.equal((lai.body['don'] as any).dong[0].trang_thai, 'thanh_cong');
  assert.equal((lai.body['don'] as any).dong[0].het_han, '2027-10-19');
});

test('CRM tra 422: dung khong thu lai; 500: nem de hang doi thu lai; khoa khong lot vao loi', async () => {
  const d = taoDon();
  const { giaoSuKienCrm } = await import('../src/services/dayCrm.js');
  crmTraVe = 422;
  assert.equal(await giaoSuKienCrm('don_da_thanh_toan', d.orderId), 'dung');
  crmTraVe = 500;
  await assert.rejects(() => giaoSuKienCrm('don_da_thanh_toan', d.orderId), (e: unknown) => /CRM trả 500/.test(String(e)) && !String(e).includes(KHOA_CRM));
});

test('su kien mo rong don_cho_quy / don_loi: chi gui khi bat crm.su_kien_mo_rong', async () => {
  const { phatSuKien } = await import('../src/services/suKienDon.js');
  const d = taoDon({ hold: 'cho_nap_quy', paCode: '400' });
  await phatSuKien({ loai: 'cho_quy', orderId: d.orderId, orderCode: d.code, userId, itemId: d.itemId, domain: d.domain });
  assert.equal((await chayJobCrm()).length, 0);
  M.setSettings({ 'crm.su_kien_mo_rong': '1' });
  await phatSuKien({ loai: 'cho_quy', orderId: d.orderId, orderCode: d.code, userId, itemId: d.itemId, domain: d.domain });
  assert.deepEqual(await chayJobCrm(), ['ok']);
  assert.equal(crmNhan[0]!.body['ma_su_kien'], `don_cho_quy:${d.code}:${d.itemId}`);
  assert.equal((crmNhan[0]!.body['cho_quy'] as any).can, 250_000);
  M.setSettings({ 'crm.su_kien_mo_rong': '0' });
  M.db.prepare(`UPDATE order_items SET hold = '', status = 'failed' WHERE id = ?`).run(d.itemId);
});
