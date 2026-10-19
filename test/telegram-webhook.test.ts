/**
 * Webhook Telegram POST /webhooks/telegram (Telegram va P.A deu gia lap):
 * secret header, chat id duoc phep, nut "Da nap, kich hoat" va /kichhoat chay
 * kich hoat, bam hai lan / Telegram gui lai khong dang ky hai lan, /sodu, /doncho.
 */
import './helpers/csdl-rieng.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AppThu } from './helpers/http-app.js';
import type { PaGia } from './helpers/pa-gia.js';
import type { TelegramGia } from './helpers/telegram-gia.js';

const SECRET = 'secret-webhook-thu-ABC123';
let app: AppThu;
let pa: PaGia;
let tg: TelegramGia;
let M: {
  db: typeof import('../src/db/index.js')['db'];
  nowIso: typeof import('../src/db/index.js')['nowIso'];
  config: typeof import('../src/config.js')['config'];
};
let cuPa: Record<string, unknown> = {};
let cuTg: Record<string, unknown> = {};
let userId = 0;
let contactId = 0;
let updateId = Math.floor(Math.random() * 1e9);

before(async () => {
  const { moApp } = await import('./helpers/http-app.js');
  const { moPaGia } = await import('./helpers/pa-gia.js');
  const { moTelegramGia } = await import('./helpers/telegram-gia.js');
  app = await moApp();
  pa = await moPaGia();
  tg = await moTelegramGia();
  const { db, nowIso } = await import('../src/db/index.js');
  const { config } = await import('../src/config.js');
  const { upsertTld } = await import('../src/services/pricing.js');
  M = { db, nowIso, config };
  cuPa = { ...config.pa };
  cuTg = { ...config.telegram };
  Object.assign(config.pa, {
    sandbox: false, endpoint: `${pa.goc}/interface.php`, endpointTest: `${pa.goc}/interface_test.php`,
    useTestEndpoint: false, username: 'daily-thu', apikey: 'khoa-thu-1234567890', retries: 0, log: false,
  });
  Object.assign(config.telegram, { botToken: '999:TOKEN-GIA', adminChatIds: '777', webhookSecret: SECRET, apiBase: tg.goc });
  upsertTld({ tld: 'info', kind: 'intl', cost_register: 200_000, cost_renew: 200_000, price_register: 300_000, price_renew: 300_000, is_active: 1 });
  userId = Number(db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Khách', ?, ?)`)
    .run(`tw-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid);
  contactId = Number(db.prepare(
    `INSERT INTO contacts (user_id, kind, full_name, id_number, email, phone, address, ward, province, country, created_at, updated_at)
     VALUES (?, 'individual', 'Lê Văn Tư', '087123456789', 'tu@vidu.vn', '+84-987654321', '344 Huỳnh Tấn Phát', 'Phường Tân Thuận', 'Thành phố Hồ Chí Minh', 'VN', ?, ?)`,
  ).run(userId, nowIso(), nowIso()).lastInsertRowid);
});
after(async () => {
  Object.assign(M.config.pa, cuPa);
  Object.assign(M.config.telegram, cuTg);
  app?.dong();
  await pa?.dong();
  await tg?.dong();
});
beforeEach(() => {
  pa.datLai();
  tg.tin.length = 0;
});

function gui(body: unknown, secret = SECRET): Promise<Response> {
  return app.lay('/webhooks/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(body),
  });
}
const nut = (chat: number | string, data = 'kichhoat') => ({ update_id: ++updateId, callback_query: { id: `cb${updateId}`, data, message: { chat: { id: chat } } } });
const lenh = (chat: number | string, text: string) => ({ update_id: ++updateId, message: { chat: { id: chat }, text } });

async function choTin(dieuKien: () => boolean, ms = 3000): Promise<void> {
  const het = Date.now() + ms;
  while (!dieuKien() && Date.now() < het) await new Promise((r) => setTimeout(r, 30));
}
const tinGui = () => tg.tin.filter((t) => t.phuongThuc === 'sendMessage').map((t) => String(t.du['text']));

function donChoQuy(domain: string): number {
  const orderId = Number(M.db.prepare(
    `INSERT INTO orders (code, user_id, contact_id, status, total, created_at, updated_at) VALUES (?, ?, ?, 'processing', 300000, ?, ?)`,
  ).run(`DHW${Math.random().toString(36).slice(2, 8).toUpperCase()}`, userId, contactId, M.nowIso(), M.nowIso()).lastInsertRowid);
  return Number(M.db.prepare(
    `INSERT INTO order_items (order_id, action, domain, tld, years, unit_price, amount, status, hold, hold_since, created_at, updated_at)
     VALUES (?, 'register', ?, 'info', 1, 300000, 300000, 'pending', 'cho_nap_quy', ?, ?, ?)`,
  ).run(orderId, domain, M.nowIso(), M.nowIso(), M.nowIso()).lastInsertRowid);
}

test('sai secret: 401, khong lam gi; dung secret nhung chat la: 200 va bo qua', async () => {
  const d = `tw${Math.random().toString(36).slice(2, 8)}.info`;
  const id = donChoQuy(d);
  assert.equal((await gui(nut(777), 'sai')).status, 401);
  assert.equal((await gui(nut(777), '')).status, 401);
  assert.equal((await gui(nut(12345))).status, 200);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(pa.yeuCau.length, 0);
  assert.equal(tg.tin.length, 0);
  assert.equal((M.db.prepare('SELECT hold FROM order_items WHERE id = ?').get(id) as { hold: string }).hold, 'cho_nap_quy');
  M.db.prepare(`UPDATE order_items SET hold = '', status = 'failed' WHERE id = ?`).run(id);
});

test('nut "Da nap, kich hoat": dang ky don cho quy, tra loi ket qua; bam hai lan va Telegram gui lai khong dang ky lai', async () => {
  const d = `tw${Math.random().toString(36).slice(2, 8)}.info`;
  const id = donChoQuy(d);
  const u = nut(777);
  const [r1, r2, r3] = await Promise.all([gui(u), gui(u), gui(nut(777))]);
  assert.deepEqual([r1.status, r2.status, r3.status], [200, 200, 200]);
  await choTin(() => tinGui().some((t) => t.includes(d)));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(pa.yeuCau.filter((q) => q.cmd === 'register_domain_quocte').length, 1);
  assert.deepEqual(M.db.prepare('SELECT status, hold FROM order_items WHERE id = ?').get(id), { status: 'active', hold: '' });
  assert.ok(tinGui().some((t) => t.includes(`${d}`) && t.includes('đăng ký xong')), tinGui().join('\n---\n'));
  assert.ok(tg.tin.some((t) => t.phuongThuc === 'answerCallbackQuery'));
});

test('/kichhoat khi van thieu quy: khong dang ky, bao so can nap', async () => {
  pa.soDu = 10_000;
  const d = `tw${Math.random().toString(36).slice(2, 8)}.info`;
  const id = donChoQuy(d);
  await gui(lenh(777, '/kichhoat@mientaymediabot'));
  await choTin(() => tinGui().length > 0);
  assert.equal(pa.yeuCau.filter((q) => q.cmd === 'register_domain_quocte').length, 0);
  assert.match(tinGui()[0]!, /Không có dòng nào chạy được/);
  assert.match(tinGui()[0]!, /cần nạp thêm/);
  M.db.prepare(`UPDATE order_items SET hold = '', status = 'failed' WHERE id = ?`).run(id);
});

test('/sodu tra so du P.A; /doncho liet ke don dang giu; lenh la tra huong dan', async () => {
  pa.dat('check_account_still', { body: '{"Command":"check_account_still","Username":"daily-thu","Money":"3,896"}' });
  await gui(lenh(777, '/sodu'));
  await choTin(() => tinGui().length > 0);
  assert.match(tinGui()[0]!, /Số dư đại lý P\.A: 3\.896/);
  pa.dat('check_account_still', null);

  tg.tin.length = 0;
  const d = `tw${Math.random().toString(36).slice(2, 8)}.info`;
  const id = donChoQuy(d);
  await gui(lenh(777, '/donchờ'));
  await choTin(() => tinGui().length > 0);
  assert.match(tinGui()[0]!, /ĐƠN CHỜ NẠP QUỸ/);
  assert.ok(tinGui()[0]!.includes(d));
  M.db.prepare(`UPDATE order_items SET hold = '', status = 'failed' WHERE id = ?`).run(id);

  tg.tin.length = 0;
  await gui(lenh(777, '/xyz'));
  await choTin(() => tinGui().length > 0);
  assert.match(tinGui()[0]!, /\/kichhoat/);
});

test('chua cau hinh secret: webhook tat (503)', async () => {
  const cu = M.config.telegram.webhookSecret;
  M.config.telegram.webhookSecret = '';
  try {
    assert.equal((await gui(nut(777), '')).status, 503);
  } finally {
    M.config.telegram.webhookSecret = cu;
  }
});
