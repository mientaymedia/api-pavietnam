/**
 * Thong bao Telegram cho quan tri (Telegram va P.A deu la may chu gia cuc bo):
 * don moi da thanh toan, dang ky xong, thieu quy kem nut "Da nap, kich hoat",
 * loi can nguoi xu ly kem ma; nhac lai thieu quy sau 4 gio, xin loi khach sau
 * 24 gio, khong tu hoan. Token khong lot ra log.
 */
import './helpers/csdl-rieng.js';
import './helpers/db.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { db, isoIn, nowIso } from '../src/db/index.js';
import { setSetting } from '../src/lib/settings.js';
import { upsertTld } from '../src/services/pricing.js';
import { provisionOrder } from '../src/services/provisioning.js';
import { markOrderPaid } from '../src/services/orders.js';
import { nhacChoQuy } from '../src/services/nhacChoQuy.js';
import { ma, moPaGia, type PaGia } from './helpers/pa-gia.js';
import { moTelegramGia, type TelegramGia } from './helpers/telegram-gia.js';

const TOKEN = '123456:TOKEN-GIA-KHONG-THAT';
let pa: PaGia;
let tg: TelegramGia;
const cuPa = { ...config.pa };
const cuTg = { ...config.telegram };
let userId = 0;
let contactId = 0;

before(async () => {
  pa = await moPaGia();
  tg = await moTelegramGia();
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false, username: 'daily-thu', apikey: 'khoa-thu-1234567890', retries: 0, log: false,
  });
  Object.assign(config.telegram, { botToken: TOKEN, adminChatIds: '111,-1002', webhookSecret: 'bi-mat', apiBase: tg.goc });
  upsertTld({ tld: 'org', kind: 'intl', cost_register: 300_000, cost_renew: 300_000, price_register: 400_000, price_renew: 400_000, is_active: 1 });
  userId = Number(db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Chị Mai', ?, ?)`)
    .run(`tg-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid);
  contactId = Number(db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, id_number, email, phone, address, ward, province, country, created_at, updated_at)
     VALUES (?, 'individual', 'Lê Thị Mai', '087123456789', 'mai@vidu.vn', '+84-987654321', '344 Huỳnh Tấn Phát', 'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', 'VN', ?, ?)`,
  ).run(userId, nowIso(), nowIso()).lastInsertRowid);
});
after(async () => {
  Object.assign(config.pa, cuPa);
  Object.assign(config.telegram, cuTg);
  await pa.dong();
  await tg.dong();
});
beforeEach(() => {
  pa.datLai();
  tg.tin.length = 0;
});

function taoDon(domain: string, status = 'pending_payment') {
  const code = `DHG${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const orderId = Number(db.prepare(
    `INSERT INTO orders (code, user_id, contact_id, status, subtotal, total, created_at, updated_at) VALUES (?, ?, ?, ?, 400000, 400000, ?, ?)`,
  ).run(code, userId, contactId, status, nowIso(), nowIso()).lastInsertRowid);
  const itemId = Number(db.prepare(
    `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, created_at, updated_at)
     VALUES (?, 'register', ?, 'org', 1, 400000, 400000, 'pending', ?, ?)`,
  ).run(orderId, domain, nowIso(), nowIso()).lastInsertRowid);
  return { orderId, code, itemId };
}

const choTin = () => new Promise((r) => setTimeout(r, 150));
const tenMoi = () => `tg${Math.random().toString(36).slice(2, 9)}.org`;
const vanBan = () => tg.tin.filter((t) => t.phuongThuc === 'sendMessage').map((t) => String(t.du['text']));

test('don da thanh toan: gui moi chat id duoc phep, kem ma don, so tien, ten mien', async () => {
  const d = tenMoi();
  const { orderId, code } = taoDon(d);
  markOrderPaid(orderId, { provider: 'manual' });
  await choTin();
  const gui = tg.tin.filter((t) => t.phuongThuc === 'sendMessage' && String(t.du['text']).includes(code));
  assert.deepEqual(gui.map((t) => t.du['chat_id']).sort(), ['-1002', '111']);
  assert.match(String(gui[0]!.du['text']), new RegExp(`Đơn mới đã thanh toán: ${code}`));
  assert.match(String(gui[0]!.du['text']), new RegExp(d.replace('.', '\\.')));
  assert.equal(gui[0]!.token, TOKEN);
});

test('dang ky xong: ten mien, khach, han', async () => {
  const d = tenMoi();
  const { orderId } = taoDon(d, 'paid');
  await provisionOrder(orderId);
  const t = vanBan().find((x) => x.startsWith(`Đăng ký xong: ${d}`));
  assert.ok(t, vanBan().join('\n---\n'));
  assert.match(t!, /Hạn: 19\/10\/2027/);
  assert.match(t!, /Chị Mai/);
});

test('thieu quy: so can nap, so du, danh sach don, nut "Da nap, kich hoat"', async () => {
  pa.soDu = 50_000;
  const d = tenMoi();
  const { orderId } = taoDon(d, 'paid');
  await provisionOrder(orderId);
  const tin = tg.tin.find((t) => String(t.du['text']).startsWith('THIẾU QUỸ ĐẠI LÝ P.A') && String(t.du['text']).includes(d));
  assert.ok(tin, vanBan().join('\n---\n'));
  assert.match(String(tin!.du['text']), /Số dư hiện tại: 50\.000/);
  assert.match(String(tin!.du['text']), /Cần nạp thêm: /);
  assert.deepEqual((tin!.du['reply_markup'] as { inline_keyboard: unknown })['inline_keyboard'], [[{ text: 'Đã nạp, kích hoạt', callback_data: 'kichhoat' }]]);
});

test('loi can nguoi xu ly: kem ma P.A 606 va loi du lieu 6023', async () => {
  for (const [m, dau] of [[606, 'ĐƠN CẦN NGƯỜI XỬ LÝ'], [6023, 'HỒ SƠ CHỦ THỂ CẦN SỬA']] as const) {
    pa.dat('register_domain_quocte', ma('register_domain_quocte', m, `Lỗi ${m}`));
    const d = tenMoi();
    const { orderId } = taoDon(d, 'paid');
    await provisionOrder(orderId);
    const t = vanBan().find((x) => x.includes(d) && x.startsWith(dau));
    assert.ok(t, `${m}: ${vanBan().join('\n---\n')}`);
    assert.match(t!, new RegExp(`Mã P.A: ${m}`));
  }
  pa.dat('register_domain_quocte', null);
});

test('nhac lai thieu quy sau 4 gio; xin loi khach sau 24 gio dung mot lan; khong hoan', async () => {
  const d = tenMoi();
  const { itemId, orderId } = taoDon(d, 'processing');
  db.prepare(`UPDATE order_items SET hold = 'cho_nap_quy', hold_since = ? WHERE id = ?`).run(isoIn(-25 * 3600_000), itemId);
  setSetting('cho_quy.nhac_luc', isoIn(-5 * 3600_000));
  pa.soDu = 0;

  const kq = await nhacChoQuy();
  assert.equal(kq.daNhac, true);
  const nhac = tg.tin.find((t) => String(t.du['text']).startsWith('NHẮC LẠI: VẪN THIẾU QUỸ'));
  assert.ok(nhac);
  assert.ok(String(nhac!.du['text']).includes(d));
  assert.ok(nhac!.du['reply_markup']);
  const xinLoi = () => (db.prepare(`SELECT COUNT(*) AS n FROM email_logs WHERE user_id = ? AND template = 'provision_delayed'`).get(userId) as { n: number }).n;
  assert.equal(xinLoi(), 1);

  // Chay lai ngay: khong nhac lai (chua du 4 gio), khong xin loi lan hai
  tg.tin.length = 0;
  const kq2 = await nhacChoQuy();
  assert.equal(kq2.daNhac, false);
  assert.equal(tg.tin.length, 0);
  assert.equal(xinLoi(), 1);
  assert.deepEqual(db.prepare('SELECT status, hold FROM order_items WHERE id = ?').get(itemId), { status: 'pending', hold: 'cho_nap_quy' });
  assert.notEqual((db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string }).status, 'refunded');
});

test('token khong lot ra nhat ky ke ca khi Telegram loi', async () => {
  const cu = config.telegram.apiBase;
  config.telegram.apiBase = 'http://127.0.0.1:1';
  const ghi: string[] = [];
  // Logger ghi warn qua console.error
  const goc = console.error;
  console.error = (...a: unknown[]) => { ghi.push(a.map(String).join(' ')); };
  try {
    const { guiQuanTri } = await import('../src/lib/telegram.js');
    await guiQuanTri('thu');
  } finally {
    console.error = goc;
    config.telegram.apiBase = cu;
  }
  assert.ok(ghi.length > 0);
  assert.ok(!ghi.join('').includes(TOKEN));
});
