/**
 * Gioi han dang nhap tinh theo email da chuan hoa (trim + chu thuong).
 *
 * Evals vong 2, quan sat 2: khoa gioi han tung la email tho trong khi tra
 * nguoi dung dung COLLATE NOCASE, nen 42 lan gui chi doi hoa thuong email
 * (cung tai khoan, cung IP) khong lan nao bi 429.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

delete process.env['BASE_PATH'];

let server: Server;
let goc = '';

before(async () => {
  await import('./helpers/db.js');
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
});

/** Doi hoa thuong ngau nhien theo so lan, them khoang trang dau cuoi xen ke. */
function bienThe(email: string, i: number): string {
  const chu = [...email].map((c, j) => ((i >> (j % 10)) & 1 ? c.toUpperCase() : c.toLowerCase())).join('');
  return i % 3 === 0 ? `  ${chu} ` : chu;
}

test('42 lan dang nhap sai chi doi hoa thuong email: tu lan 16 bi 429', async () => {
  const { db, nowIso } = await import('../src/db/index.js');
  const { hashPassword } = await import('../src/lib/crypto.js');
  const email = `gioihan-${Math.random().toString(36).slice(2)}@test.vn`;
  db.prepare(
    `INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, ?, 'Thu', ?, ?)`,
  ).run(email, hashPassword('mat-khau-dung-123'), nowIso(), nowIso());

  const r0 = await fetch(`${goc}/dang-nhap`);
  const cookie = (r0.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const csrf = (await r0.text()).match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  assert.ok(cookie && csrf);

  const maTrangThai: number[] = [];
  for (let i = 0; i < 42; i++) {
    const r = await fetch(`${goc}/dang-nhap`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ _csrf: csrf, email: bienThe(email, i), password: 'sai-mat-khau' }).toString(),
    });
    maTrangThai.push(r.status);
    await r.arrayBuffer();
  }
  assert.deepEqual(maTrangThai.slice(0, 15), Array(15).fill(401));
  assert.deepEqual(maTrangThai.slice(15), Array(27).fill(429));
  // Cac bien the that su khac nhau (khong phai cung mot chuoi lap lai)
  assert.ok(new Set(Array.from({ length: 42 }, (_, i) => bienThe(email, i))).size > 15);
});
