/**
 * Gui email qua Resend HTTP API voi may chu Resend GIA lap cuc bo (khong goi
 * api.resend.com). Kiem: dung URL, header Bearer, than JSON theo API Resend,
 * dia chi gui mac dinh tren ten mien da xac minh, khoa khong lot vao log hay
 * email_logs, khoa nhap o Cau hinh duoc ma hoa.
 *
 * config.ts doc bien moi truong luc nap: dat bien TRUOC roi moi import dong.
 */
import './helpers/csdl-rieng.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

interface YeuCau { method: string; url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }
const yeuCau: YeuCau[] = [];
let traLoi: { status: number; body: unknown } = { status: 200, body: { id: 'email-gia-1' } };

const server = http.createServer((req, res) => {
  let tho = '';
  req.on('data', (c) => (tho += c));
  req.on('end', () => {
    yeuCau.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: tho ? JSON.parse(tho) : {} });
    res.writeHead(traLoi.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(traLoi.body));
  });
});
server.listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', () => r()));

const KHOA_ENV = 're_thu_env_1234567890abcdef';
Object.assign(process.env, {
  MAIL_DRIVER: 'resend',
  RESEND_API_KEY: KHOA_ENV,
  RESEND_API_BASE: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
});
delete process.env['MAIL_FROM'];
delete process.env['MAIL_REPLY_TO'];
delete process.env['ADMIN_ALERT_EMAIL'];

// Ghi lai moi dong log de kiem khoa khong lot ra
const nhatKy: string[] = [];
for (const k of ['log', 'error', 'warn'] as const) {
  const goc = console[k].bind(console);
  console[k] = (...a: unknown[]) => { nhatKy.push(a.map(String).join(' ')); goc(...a); };
}

await import('./helpers/db.js');
const { db } = await import('../src/db/index.js');
const { sendMail } = await import('../src/lib/mailer.js');
const { setSetting, setSettings, SECRET_KEYS, invalidateSettingsCache } = await import('../src/lib/settings.js');

after(() => {
  server.close();
});

const nhatKyEmail = (to: string) =>
  db.prepare('SELECT status, error FROM email_logs WHERE to_email = ? ORDER BY id DESC LIMIT 1').get(to) as
    { status: string; error: string } | undefined;

test('gui qua Resend: dung URL, header Bearer, than JSON, from tren ten mien da xac minh, reply_to hello@', async () => {
  yeuCau.length = 0;
  traLoi = { status: 200, body: { id: 'email-gia-1' } };
  const ok = await sendMail({ to: 'khach@vi-du.vn', subject: 'Xác thực email', html: '<p>Xin chào <b>Khách</b></p>' });
  assert.equal(ok, true);
  assert.equal(yeuCau.length, 1);
  const y = yeuCau[0]!;
  assert.equal(y.method, 'POST');
  assert.equal(y.url, '/emails');
  assert.equal(y.headers['authorization'], `Bearer ${KHOA_ENV}`);
  assert.match(String(y.headers['content-type']), /application\/json/);
  assert.equal(y.body['from'], 'MienTay Media <no-reply@updates.mientaymedia.com>');
  assert.deepEqual(y.body['to'], ['khach@vi-du.vn']);
  assert.equal(y.body['subject'], 'Xác thực email');
  assert.equal(y.body['html'], '<p>Xin chào <b>Khách</b></p>');
  assert.equal(y.body['text'], 'Xin chào Khách');
  assert.equal(y.body['reply_to'], 'hello@mientaymedia.com');
  assert.equal(nhatKyEmail('khach@vi-du.vn')?.status, 'sent');
});

test('Resend tra loi 4xx: tra false, ghi failed kem ma HTTP va thong bao, khong co khoa', async () => {
  // Thong bao loi gia co lap lai khoa: van phai bi loc truoc khi ghi
  traLoi = { status: 403, body: { statusCode: 403, name: 'validation_error', message: `The updates.mientaymedia.com domain is not verified (${KHOA_ENV})` } };
  const ok = await sendMail({ to: 'loi@vi-du.vn', subject: 'Thử', html: '<p>Thử</p>' });
  assert.equal(ok, false);
  const ghi = nhatKyEmail('loi@vi-du.vn');
  assert.equal(ghi?.status, 'failed');
  assert.match(ghi!.error, /HTTP 403/);
  assert.match(ghi!.error, /not verified/);
  assert.doesNotMatch(ghi!.error, new RegExp(KHOA_ENV));
  assert.ok(!nhatKy.some((d) => d.includes(KHOA_ENV)), 'khoa khong lot vao log');
});

test('khoa nhap o Cau hinh duoc ma hoa trong CSDL va dung thay khoa .env', async () => {
  const khoa = 're_thu_cau_hinh_abcdef123456';
  setSettings({ 'smtp.resend_key': khoa }, SECRET_KEYS);
  try {
    const row = db.prepare("SELECT value, is_secret FROM settings WHERE key = 'smtp.resend_key'").get() as { value: string; is_secret: number };
    assert.equal(row.is_secret, 1);
    assert.ok(!row.value.includes(khoa), 'khong luu khoa dang ro');

    yeuCau.length = 0;
    traLoi = { status: 200, body: { id: 'email-gia-2' } };
    assert.equal(await sendMail({ to: 'cauhinh@vi-du.vn', subject: 'Thử', html: '<p>Thử</p>' }), true);
    assert.equal(yeuCau[0]?.headers['authorization'], `Bearer ${khoa}`);
  } finally {
    db.prepare("DELETE FROM settings WHERE key = 'smtp.resend_key'").run();
    invalidateSettingsCache();
  }
});

test('reply_to, from doi duoc o Cau hinh; MAIL_DRIVER smtp khong goi Resend', async () => {
  setSetting('smtp.reply_to', 'hotro@mientaymedia.com');
  setSetting('smtp.from', 'MienTay Media <tb@api.mientaymedia.com>');
  try {
    yeuCau.length = 0;
    traLoi = { status: 200, body: { id: 'email-gia-3' } };
    await sendMail({ to: 'doi@vi-du.vn', subject: 'Thử', html: '<p>Thử</p>' });
    assert.equal(yeuCau[0]?.body['reply_to'], 'hotro@mientaymedia.com');
    assert.equal(yeuCau[0]?.body['from'], 'MienTay Media <tb@api.mientaymedia.com>');
  } finally {
    setSetting('smtp.reply_to', '');
    setSetting('smtp.from', '');
  }

  setSetting('smtp.driver', 'smtp');
  try {
    yeuCau.length = 0;
    assert.equal(await sendMail({ to: 'smtp@vi-du.vn', subject: 'Thử', html: '<p>Thử</p>' }), false);
    assert.equal(yeuCau.length, 0, 'khong goi Resend');
    assert.equal(nhatKyEmail('smtp@vi-du.vn')?.status, 'skipped');
  } finally {
    setSetting('smtp.driver', '');
  }
});

test('Resend khong tra loi trong han hoac khong ket noi duoc: ghi failed, khong nem loi', async () => {
  const cu = process.env['RESEND_API_BASE'];
  // Cong dong: fetch loi ngay. config da nap nen doi qua thuoc tinh cua config
  const { config } = await import('../src/config.js');
  const goc = config.smtp.resendApiBase;
  (config.smtp as { resendApiBase: string }).resendApiBase = 'http://127.0.0.1:9';
  try {
    assert.equal(await sendMail({ to: 'mang@vi-du.vn', subject: 'Thử', html: '<p>Thử</p>' }), false);
    assert.equal(nhatKyEmail('mang@vi-du.vn')?.status, 'failed');
  } finally {
    (config.smtp as { resendApiBase: string }).resendApiBase = goc;
    process.env['RESEND_API_BASE'] = cu;
  }
});
