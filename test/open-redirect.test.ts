/**
 * Chong open redirect qua next= khi app chay o GOC (BASE_PATH rong), di qua
 * dang nhap that (CSRF, phien, ca buoc hai lop). Ban duoi tien to nam o
 * base-path.test.ts.
 *
 * Loi evals 1: next=/.//evil.com tung cho `Location: //evil.com`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BIEN_THE_NEXT } from './helpers/bien-the-redirect.js';

// May dev co the dat BASE_PATH trong moi truong; tep nay can che do goc.
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

function lay(p: string, init: RequestInit = {}): Promise<Response> {
  return fetch(goc + p, { redirect: 'manual', ...init });
}

async function moPhien(): Promise<{ cookie: string; csrf: string }> {
  const r = await lay('/dang-nhap');
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const csrf = (await r.text()).match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  assert.ok(cookie.startsWith('sid=') && csrf, 'phai co phien va token CSRF');
  return { cookie, csrf };
}

async function taoKhach(): Promise<{ id: number; email: string; password: string }> {
  const { db, nowIso } = await import('../src/db/index.js');
  const { hashPassword } = await import('../src/lib/crypto.js');
  const email = `or-${Math.random().toString(36).slice(2)}@test.vn`;
  const password = 'mat-khau-thu-123';
  const r = db.prepare(
    `INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, ?, 'Thu', ?, ?)`,
  ).run(email, hashPassword(password), nowIso(), nowIso());
  return { id: Number(r.lastInsertRowid), email, password };
}

function guiForm(p: string, cookie: string, du: Record<string, string>): Promise<Response> {
  return lay(p, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(du).toString(),
  });
}

async function dangNhap(next: string): Promise<string | null> {
  const { email, password } = await taoKhach();
  const { cookie, csrf } = await moPhien();
  const r = await guiForm('/dang-nhap', cookie, { _csrf: csrf, email, password, next });
  assert.equal(r.status, 302);
  return r.headers.get('location');
}

test('o goc: next noi bo ve dung trang', async () => {
  assert.equal(await dangNhap('/gio-hang'), '/gio-hang');
  assert.equal(await dangNhap('/a/../gio-hang'), '/gio-hang');
});

test('o goc: moi bien the next doc hai ve /dashboard (loi evals 1)', async () => {
  for (const xau of BIEN_THE_NEXT) {
    const loc = await dangNhap(xau);
    assert.equal(loc, '/dashboard', JSON.stringify(xau));
  }
});

test('o goc: buoc hai lop cung khong chuyen sang host khac', async () => {
  const { beginSetup, confirmSetup } = await import('../src/services/twoFactor.js');
  const { currentCode } = await import('../src/lib/totp.js');

  for (const xau of ['/.//evil.com', '/a/..//evil.com']) {
    const u = await taoKhach();
    const { secret } = beginSetup(u.id, u.email);
    const bat = confirmSetup(u.id, currentCode(secret));
    assert.equal(bat.ok, true);

    const { cookie, csrf } = await moPhien();
    const r1 = await guiForm('/dang-nhap', cookie, { _csrf: csrf, email: u.email, password: u.password, next: xau });
    assert.equal(r1.headers.get('location'), '/dang-nhap/hai-lop');
    // Ma du phong: tranh trung bo dem TOTP vua dung de bat 2FA
    const r2 = await guiForm('/dang-nhap/hai-lop', cookie, { _csrf: csrf, code: bat.recoveryCodes![0]! });
    assert.equal(r2.status, 302);
    assert.equal(r2.headers.get('location'), '/dashboard', xau);
  }
});

test('o goc: quay lai gio hang khong theo Referer //host (loi evals 2)', async () => {
  const { cookie, csrf } = await moPhien();
  // Ten mien sai dinh dang: route bao loi roi quay lai trang truoc (quayLai)
  const xoa = (referer: string) =>
    lay('/gio-hang/them', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, referer },
      body: new URLSearchParams({ _csrf: csrf, domain: '!!!' }).toString(),
    });
  assert.equal((await xoa(`${goc}/bang-gia?x=1`)).headers.get('location'), '/bang-gia?x=1');
  for (const p of ['//evil.com/x', '/.//evil.com/x', '/a/..//evil.com/x']) {
    assert.equal((await xoa(`${goc}${p}`)).headers.get('location'), '/gio-hang', p);
  }
});
