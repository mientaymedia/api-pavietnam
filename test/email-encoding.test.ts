import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { db, nowIso } from '../src/db/index.js';
import { settings } from '../src/lib/settings.js';
import { buildSmtpTest, sendDomainActivated, sendPasswordReset } from '../src/services/notifications.js';

test('tieu de co dau duoc ma hoa chuan MIME, than thu khai bao utf-8', async () => {
  // Dung streamTransport: dung thu y nhu khi gui that nhung khong mo ket noi mang
  const tx = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const info = await tx.sendMail({
    from: 'MienTay Media <no-reply@mientaymedia.com>',
    to: 'khach@vidu.vn',
    subject: 'Tên miền vidu.vn đã được kích hoạt',
    html: '<p>Tên miền của bạn đã được đăng ký thành công.</p>',
  });
  const raw = (info.message as Buffer).toString('utf8');

  assert.match(raw, /^Subject: =\?UTF-8\?[BQ]\?/m);
  assert.match(raw, /charset=utf-8/i);
  // From la ASCII nen khong can ma hoa
  assert.match(raw, /^From: MienTay Media <no-reply@mientaymedia\.com>$/m);
});

/** Email test chay khi CHUA cau hinh SMTP: thu duoc ghi vao email_logs voi trang thai skipped. */
function tieuDeGanNhat(to: string): string {
  const row = db.prepare('SELECT subject FROM email_logs WHERE to_email = ? ORDER BY id DESC LIMIT 1').get(to) as
    | { subject: string }
    | undefined;
  return row?.subject ?? '';
}

test('email khoi phuc mat khau va kich hoat ten mien luu tieu de co dau, dang NFC', async (t) => {
  if (settings.smtp().host) return t.skip('CSDL test dang cau hinh SMTP that');

  const email = `mail-${Math.random().toString(36).slice(2)}@test.vn`;
  const userId = Number(
    db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Thu', ?, ?)`)
      .run(email, nowIso(), nowIso()).lastInsertRowid,
  );

  await sendPasswordReset({ id: userId, email }, 'token-thu');
  const reset = tieuDeGanNhat(email);
  assert.equal(reset, 'Khôi phục mật khẩu');
  assert.equal(reset, reset.normalize('NFC'));

  await sendDomainActivated({ userId, email, domain: 'vidu.vn', expiresAt: null, nameservers: [], years: 1 });
  const active = tieuDeGanNhat(email);
  assert.equal(active, 'Tên miền vidu.vn đã được kích hoạt');
  assert.equal(active, active.normalize('NFC'));
});

test('email thu cau hinh SMTP di qua khung chung, co meta charset (loi evals 4)', () => {
  const { subject, html } = buildSmtpTest();
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /Thử cấu hình SMTP/);
  assert.match(subject, /Thử cấu hình SMTP$/);
  assert.equal(html, html.normalize('NFC'));
});
