/**
 * Cung co luong chuyen khoan SePay (nhanh mtm/sepay-cung-co):
 *  1. Xac thuc TRUOC, ghi SAU: webhook sai token khong chen duoc dong bank_transactions.
 *  2. Chuyen tien sau khi don da huy: gan co late_payment + bao nhan vien.
 *  3. Tien vao tai khoan khac tai khoan nhan da cau hinh: khong ghi nhan don, gan co.
 *  4. Chuyen thua: don van da thanh toan, gan co overpaid + bao nhan vien.
 *  5. Xac thuc HMAC-SHA256 (X-SePay-Signature / X-SePay-Timestamp), giu Apikey.
 *  6. Ngan hang nhan tien lay tu .env, thang gia tri cu luu trong CSDL.
 * Telegram la may chu gia cuc bo; khong goi SePay that.
 */
import './helpers/csdl-rieng.js';
import './helpers/db.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import { db, nowIso } from '../src/db/index.js';
import { setSetting } from '../src/lib/settings.js';
import { settings } from '../src/lib/settings.js';
import { cancelOrder, getOrder } from '../src/services/orders.js';
import { authenticateSepayWebhook, buildSepayQrUrl, isConfiguredAccount, sepayProvider } from '../src/payments/sepay.js';
import { ingestSepayTransaction } from '../src/payments/sepayIngest.js';
import { moApp, type AppThu } from './helpers/http-app.js';
import { moTelegramGia, type TelegramGia } from './helpers/telegram-gia.js';

// Gia tri thu, KHONG phai tai khoan that
const TK = '1903000000001';
const TOKEN = 'token-webhook-thu-123';
const SECRET = 'hmac-secret-thu-456';

let app: AppThu;
let tg: TelegramGia;
const cuSepay = { ...config.sepay };
const cuTg = { ...config.telegram };
let userId = 0;

before(async () => {
  tg = await moTelegramGia();
  Object.assign(config.telegram, { botToken: '1:TG-GIA', adminChatIds: '111', webhookSecret: '', apiBase: tg.goc });
  Object.assign(config.sepay, {
    enabled: true, bankCode: 'TCB', bankName: 'Techcombank', accountNumber: TK,
    accountName: 'CONG TY THU', webhookAuth: 'apikey', webhookToken: TOKEN, webhookSecret: SECRET, apiToken: '',
  });
  app = await moApp();
  userId = Number(db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Khach Thu', ?, ?)`)
    .run(`sepay-${Math.random().toString(36).slice(2)}@test.vn`, nowIso(), nowIso()).lastInsertRowid);
});
after(async () => {
  Object.assign(config.sepay, cuSepay);
  Object.assign(config.telegram, cuTg);
  app.dong();
  await tg.dong();
});
beforeEach(() => {
  config.sepay.webhookAuth = 'apikey';
  config.sepay.accountNumber = TK;
  tg.tin.length = 0;
});

function taoDon(total = 400_000): { id: number; code: string } {
  const code = `DH${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const id = Number(db.prepare(
    `INSERT INTO orders (code, user_id, status, subtotal, total, created_at, updated_at) VALUES (?, ?, 'pending_payment', ?, ?, ?, ?)`,
  ).run(code, userId, total, total, nowIso(), nowIso()).lastInsertRowid);
  return { id, code };
}

let soGd = 900_000;
function giaoDich(code: string, amount: number, them: Record<string, unknown> = {}) {
  return {
    id: ++soGd, gateway: 'Techcombank', transactionDate: '2026-10-21 10:00:00', accountNumber: TK,
    code: null, content: `CT DEN ${code} chuyen tien`, transferType: 'in', transferAmount: amount,
    accumulated: 0, subAccount: null, referenceCode: `FT${soGd}`, description: '', ...them,
  };
}

const dongGd = (id: number) => db.prepare(`SELECT * FROM bank_transactions WHERE provider='sepay' AND external_id=?`)
  .get(String(id)) as { status: string; flag: string } | undefined;
const tinSepay = () => tg.tin.filter((t) => String(t.du['text']).startsWith('[SePay]')).map((t) => String(t.du['text']));
const choTin = async (n = 1) => {
  for (let i = 0; i < 40 && tinSepay().length < n; i++) await new Promise((r) => setTimeout(r, 25));
};

function guiApikey(body: unknown, token = TOKEN) {
  return app.lay('/webhooks/sepay', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Apikey ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

function kyHmac(raw: string, ts: number, secret = SECRET) {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')}`;
}

function guiHmac(raw: string, opts: { ts?: number; sig?: string; headers?: Record<string, string> } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return app.lay('/webhooks/sepay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sepay-timestamp': String(ts),
      'x-sepay-signature': opts.sig ?? kyHmac(raw, ts),
      ...opts.headers,
    },
    body: raw,
  });
}

/* ------------------------------------------------ 1. xac thuc truoc, ghi sau */

test('1. sai token: 401 va KHONG chen dong bank_transactions; giao dich that cung id van duoc ghi nhan', async () => {
  const don = taoDon();
  const gd = giaoDich(don.code, 400_000);

  for (const token of ['sai-token', '']) {
    const r = await guiApikey(gd, token);
    assert.equal(r.status, 401);
    assert.equal(dongGd(gd.id), undefined, 'ke gia mao khong duoc chen dong');
  }
  assert.equal(getOrder(don.id)?.status, 'pending_payment');

  // Giao dich that cung external_id den sau: khong bi coi la "da xu ly"
  const r = await guiApikey(gd);
  assert.equal(r.status, 200);
  assert.equal(dongGd(gd.id)?.status, 'matched');
  assert.equal(getOrder(don.id)?.status, 'paid');
});

test('1b. chua cau hinh token: tu choi 401, khong ghi', async () => {
  config.sepay.webhookToken = '';
  try {
    const gd = giaoDich(taoDon().code, 400_000);
    assert.equal((await guiApikey(gd, 'bat-ky')).status, 401);
    assert.equal(dongGd(gd.id), undefined);
  } finally {
    config.sepay.webhookToken = TOKEN;
  }
});

/* ------------------------------------------------ 2. tre han: gan co + bao */

test('2. chuyen sau khi don da huy (qua han): gan co late_payment, bao nhan vien, khong im lang', async () => {
  const don = taoDon();
  cancelOrder(don.id, 'Quá 48 giờ không thanh toán');
  const gd = giaoDich(don.code, 400_000);

  const r = await guiApikey(gd);
  assert.equal(r.status, 200);
  const dong = dongGd(gd.id);
  assert.equal(dong?.flag, 'late_payment');
  assert.equal(getOrder(don.id)?.status, 'cancelled');

  await choTin();
  const tin = tinSepay();
  assert.equal(tin.length, 1, tin.join('\n---\n'));
  assert.match(tin[0]!, /SAU KHI đơn đã hủy/);
  assert.ok(tin[0]!.includes(don.code));
  assert.ok(tin[0]!.includes(String(gd.id)));

  // SePay gui lai cung giao dich: khong bao trung, co van giu
  await guiApikey(gd);
  await new Promise((r2) => setTimeout(r2, 100));
  assert.equal(tinSepay().length, 1);
  assert.equal(dongGd(gd.id)?.flag, 'late_payment');
});

test('2b. don da thanh toan bang giao dich khac, khach chuyen lan hai: gan co double_payment + bao', async () => {
  const don = taoDon();
  await guiApikey(giaoDich(don.code, 400_000));
  assert.equal(getOrder(don.id)?.status, 'paid');
  tg.tin.length = 0;

  const gd2 = giaoDich(don.code, 400_000);
  await guiApikey(gd2);
  assert.equal(dongGd(gd2.id)?.flag, 'double_payment');
  await choTin();
  assert.match(tinSepay()[0] ?? '', /ĐÃ thanh toán/);
});

test('2c. SePay gui lai giao dich da khop: van matched, khong gan co, khong bao', async () => {
  const don = taoDon();
  const gd = giaoDich(don.code, 400_000);
  await guiApikey(gd);
  await guiApikey(gd);
  assert.equal(dongGd(gd.id)?.status, 'matched');
  assert.equal(dongGd(gd.id)?.flag, '');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(tinSepay().length, 0);
});

/* ------------------------------------------------ 3. sai tai khoan nhan */

test('3. tien vao tai khoan khac tai khoan da cau hinh: khong ghi nhan don, gan co wrong_account, bao', async () => {
  const don = taoDon();
  const gd = giaoDich(don.code, 400_000, { accountNumber: '9999999999' });
  const r = await guiApikey(gd);
  assert.equal(r.status, 200);
  assert.equal(dongGd(gd.id)?.status, 'unmatched');
  assert.equal(dongGd(gd.id)?.flag, 'wrong_account');
  assert.equal(getOrder(don.id)?.status, 'pending_payment');
  await choTin();
  assert.match(tinSepay()[0] ?? '', /SAI tài khoản nhận/);
});

test('3b. so tai khoan co dau cach / qua tai khoan ao (subAccount) van khop', () => {
  assert.equal(isConfiguredAccount({ accountNumber: '1903 0000 00001', subAccount: '' }, TK), true);
  assert.equal(isConfiguredAccount({ accountNumber: '123', subAccount: TK }, TK), true);
  assert.equal(isConfiguredAccount({ accountNumber: TK, subAccount: '' }, ''), false, 'chua cau hinh thi khong khop');
  assert.equal(isConfiguredAccount({ accountNumber: '', subAccount: '' }, TK), false);
});

test('3c. doi soat bu (ingest) cung kiem tai khoan nhan', async () => {
  const don = taoDon();
  const kq = await ingestSepayTransaction({
    id: `api-${++soGd}`, amount: 400_000, content: don.code, code: '', accountNumber: '111222333',
    subAccount: '', gateway: 'Techcombank', transactionDate: '', direction: 'in',
  }, {});
  await kq.alert;
  assert.equal(kq.flag, 'wrong_account');
  assert.equal(getOrder(don.id)?.status, 'pending_payment');
});

/* ------------------------------------------------ 4. chuyen thua / thieu */

test('4. chuyen thua: don da thanh toan, gan co overpaid, bao so tien thua', async () => {
  const don = taoDon(400_000);
  const gd = giaoDich(don.code, 450_000);
  await guiApikey(gd);
  assert.equal(getOrder(don.id)?.status, 'paid');
  assert.equal(dongGd(gd.id)?.status, 'matched');
  assert.equal(dongGd(gd.id)?.flag, 'overpaid');
  await choTin();
  const tin = tinSepay()[0] ?? '';
  assert.match(tin, /THỪA/);
  assert.match(tin, /Thừa: 50\.000/);
});

test('4b. chuyen dung so tien: khong gan co, khong bao', async () => {
  const don = taoDon(400_000);
  const gd = giaoDich(don.code, 400_000);
  await guiApikey(gd);
  assert.equal(dongGd(gd.id)?.flag, '');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(tinSepay().length, 0);
});

test('4c. chuyen thieu: don van cho, gan co underpaid + bao', async () => {
  const don = taoDon(400_000);
  const gd = giaoDich(don.code, 100_000);
  await guiApikey(gd);
  assert.equal(getOrder(don.id)?.status, 'pending_payment');
  assert.equal(dongGd(gd.id)?.status, 'amount_mismatch');
  assert.equal(dongGd(gd.id)?.flag, 'underpaid');
  await choTin();
  assert.match(tinSepay()[0] ?? '', /THIẾU/);
});

/* ------------------------------------------------ 5. HMAC-SHA256 */

test('5. hmac: chu ky dung tren body THO (giu nguyen khoang trang) -> ghi nhan', async () => {
  config.sepay.webhookAuth = 'hmac';
  const don = taoDon();
  const gd = giaoDich(don.code, 400_000);
  // Body co khoang trang la: JSON.stringify(req.body) se khac -> phai dung body tho
  const raw = JSON.stringify(gd, null, 2);
  const r = await guiHmac(raw);
  assert.equal(r.status, 200);
  assert.equal(dongGd(gd.id)?.status, 'matched');
  assert.equal(getOrder(don.id)?.status, 'paid');
});

test('5b. hmac: chu ky sai / secret sai / timestamp lech / thieu header / chi co Apikey -> 401, khong ghi', async () => {
  config.sepay.webhookAuth = 'hmac';
  const don = taoDon();
  const gd = giaoDich(don.code, 400_000);
  const raw = JSON.stringify(gd);
  const now = Math.floor(Date.now() / 1000);

  const cases: [string, Promise<Response>][] = [
    ['sai chu ky', guiHmac(raw, { sig: `sha256=${'0'.repeat(64)}` })],
    ['sai secret', guiHmac(raw, { sig: kyHmac(raw, now, 'secret-khac') })],
    ['body bi sua', guiHmac(raw.replace('400000', '1'), { sig: kyHmac(raw, now), ts: now })],
    ['timestamp cu (phat lai)', guiHmac(raw, { ts: now - 600 })],
    ['timestamp tuong lai', guiHmac(raw, { ts: now + 600 })],
    ['ky tren timestamp khac', guiHmac(raw, { ts: now, sig: kyHmac(raw, now - 1) })],
    ['thieu chu ky', guiHmac(raw, { sig: '' })],
    ['chi co Apikey', guiApikey(gd)],
  ];
  for (const [ten, p] of cases) {
    const r = await p;
    assert.equal(r.status, 401, ten);
  }
  assert.equal(dongGd(gd.id), undefined);
  assert.equal(getOrder(don.id)?.status, 'pending_payment');
});

test('5c. hmac: chua dat secret thi tu choi', () => {
  config.sepay.webhookAuth = 'hmac';
  config.sepay.webhookSecret = '';
  try {
    const raw = '{"id":1}';
    const ts = Math.floor(Date.now() / 1000);
    const kq = authenticateSepayWebhook(raw, { 'x-sepay-timestamp': String(ts), 'x-sepay-signature': kyHmac(raw, ts, '') });
    assert.equal(kq.ok, false);
  } finally {
    config.sepay.webhookSecret = SECRET;
  }
});

test('5d. ham xac thuc: dung bien 300 giay, chu ky viet hoa van nhan', () => {
  config.sepay.webhookAuth = 'hmac';
  const raw = '{"id":2}';
  const ts = 1_800_000_000;
  const h = (t: number, sig = kyHmac(raw, t)) => ({ 'x-sepay-timestamp': String(t), 'x-sepay-signature': sig });
  assert.equal(authenticateSepayWebhook(raw, h(ts), (ts + 300) * 1000).ok, true);
  assert.equal(authenticateSepayWebhook(raw, h(ts), (ts + 301) * 1000).ok, false);
  assert.equal(authenticateSepayWebhook(raw, h(ts, kyHmac(raw, ts).toUpperCase().replace('SHA256=', 'sha256=')), ts * 1000).ok, true);
  assert.equal(authenticateSepayWebhook(undefined, h(ts), ts * 1000).ok, false);
});

test('5e. apikey van chay (tuong thich nguoc), ca dang Bearer', () => {
  assert.equal(authenticateSepayWebhook('', { authorization: `Apikey ${TOKEN}` }).ok, true);
  assert.equal(authenticateSepayWebhook('', { authorization: `Bearer ${TOKEN}` }).ok, true);
  assert.equal(authenticateSepayWebhook('', { authorization: `Apikey ${TOKEN}x` }).ok, false);
});

/* ------------------------------------------------ 6. ngan hang tu .env */

test('6. ngan hang nhan tien lay tu .env, thang gia tri cu trong CSDL; QR va huong dan dung ngan hang do', async () => {
  // Gia lap CSDL con giu tai khoan ngan hang cu nhap o Quan tri
  setSetting('sepay.bank_code', 'MB');
  setSetting('sepay.bank_name', 'MB');
  setSetting('sepay.account_number', '000111222');
  setSetting('sepay.account_name', 'TEN CU');

  const s = settings.sepay();
  assert.equal(s.bankName, 'Techcombank');
  assert.equal(s.bankCode, 'TCB');
  assert.equal(s.accountNumber, TK);
  assert.equal(s.accountName, 'CONG TY THU');
  assert.equal(s.accountSource, 'env');

  const qr = new URL(buildSepayQrUrl({ amount: 400_000, addInfo: 'DHABC123' }));
  assert.equal(qr.searchParams.get('bank'), 'TCB');
  assert.equal(qr.searchParams.get('acc'), TK);

  const don = taoDon();
  const kq = await sepayProvider.create({
    order: getOrder(don.id)!, refCode: don.code, clientIp: '', returnUrl: '', ipnUrl: '',
  });
  const nh = Object.fromEntries((kq.instructions ?? []).map((i) => [i.label, i.value]));
  assert.equal(nh['Ngân hàng'], 'Techcombank');
  assert.equal(nh['Số tài khoản'], TK);
  assert.equal(nh['Chủ tài khoản'], 'CONG TY THU');

  // Webhook doi chieu voi tai khoan .env, khong phai tai khoan cu trong CSDL
  const gdCu = giaoDich(taoDon().code, 400_000, { accountNumber: '000111222' });
  await guiApikey(gdCu);
  assert.equal(dongGd(gdCu.id)?.flag, 'wrong_account');

  // .env khong dat so tai khoan -> moi dung bo nhap o Quan tri (ca bo, khong tron)
  config.sepay.accountNumber = '';
  const s2 = settings.sepay();
  assert.equal(s2.accountNumber, '000111222');
  assert.equal(s2.bankCode, 'MB');
  assert.equal(s2.accountSource, 'admin');
  for (const k of ['sepay.bank_code', 'sepay.bank_name', 'sepay.account_number', 'sepay.account_name']) setSetting(k, '');
});

test('6b. ma QR de trong thi dung ten ngan hang', () => {
  const cu = config.sepay.bankCode;
  config.sepay.bankCode = '';
  try {
    assert.equal(settings.sepay().bankCode, 'Techcombank');
  } finally {
    config.sepay.bankCode = cu;
  }
});

test('6c. ma nguon va .env.example khong con tai khoan MB cu', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const goc = path.resolve(import.meta.dirname ?? '.', '..');
  const tep = ['.env.example', 'src/config.ts', 'src/lib/settings.ts', 'src/payments/sepay.ts', 'src/db/seed.ts'];
  for (const t of tep) {
    const nd = fs.readFileSync(path.join(goc, t), 'utf8');
    assert.ok(!nd.includes('45688840'), `${t} con so tai khoan cu`);
    assert.ok(!/SEPAY_BANK_CODE=MB\b/.test(nd), `${t} con ma ngan hang MB`);
  }
});
