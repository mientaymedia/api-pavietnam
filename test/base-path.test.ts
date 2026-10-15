/**
 * App chay duoi tien to duong dan (BASE_PATH=/ten-mien).
 *
 * config.ts doc bien moi truong luc nap, nen phai dat bien TRUOC roi moi
 * import dong (khong import tinh, ke ca helpers/db).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env['BASE_PATH'] = '/ten-mien';
process.env['APP_URL'] = 'http://127.0.0.1/ten-mien';
process.env['SEPAY_WEBHOOK_TOKEN'] = 'token-thu-base-path-1234';

const B = '/ten-mien';
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

/** Lay cookie sid + token CSRF tu trang dang nhap. */
async function moPhien(): Promise<{ cookie: string; csrf: string }> {
  const r = await lay(`${B}/dang-nhap`);
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const html = await r.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  assert.ok(cookie.startsWith('sid=') && csrf, 'phai co phien va token CSRF');
  return { cookie, csrf };
}

async function taoKhach(): Promise<{ email: string; password: string }> {
  const { db, nowIso } = await import('../src/db/index.js');
  const { hashPassword } = await import('../src/lib/crypto.js');
  const email = `bp-${Math.random().toString(36).slice(2)}@test.vn`;
  const password = 'mat-khau-thu-123';
  db.prepare(
    `INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, ?, 'Thu', ?, ?)`,
  ).run(email, hashPassword(password), nowIso(), nowIso());
  return { email, password };
}

async function dangNhap(next: string): Promise<string | null> {
  const { email, password } = await taoKhach();
  const { cookie, csrf } = await moPhien();
  const r = await lay(`${B}/dang-nhap`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({ _csrf: csrf, email, password, next }).toString(),
  });
  assert.equal(r.status, 302);
  return r.headers.get('location');
}

test('trang chu va tai nguyen tinh nam duoi tien to', async () => {
  assert.equal((await lay(`${B}/`)).status, 200);
  // Thieu dau / cuoi: express.static tu chuyen sang /ten-mien/ (dung tien to)
  const r = await lay(B);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), `${B}/`);
  assert.equal((await lay(`${B}/css/app.css`)).status, 200);
  assert.equal((await lay(`${B}/js/app.js`)).status, 200);
});

test('ngoai tien to: goc chuyen vao app, con lai 404', async () => {
  const r = await lay('/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `${B}/`);
  assert.equal((await lay('/gio-hang')).status, 404);
  assert.equal((await lay('/ten-mien-khac/gio-hang')).status, 404);
});

test('trang can dang nhap chuyen toi dang nhap, next khong chua tien to', async () => {
  const r = await lay(`${B}/dashboard?tab=1`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `${B}/dang-nhap?next=${encodeURIComponent('/dashboard?tab=1')}`);
});

test('dang nhap xong ve dung trang, them tien to dung mot lan', async () => {
  assert.equal(await dangNhap('/gio-hang'), `${B}/gio-hang`);
});

test('next doc hai van bi chan duoi tien to', async () => {
  for (const xau of ['//evil.com', '/\\evil.com', 'https://evil.com', '%2F%2Fevil.com']) {
    assert.equal(await dangNhap(xau), `${B}/dashboard`, xau);
  }
});

test('quay lai trang truoc chi trong app', async () => {
  const { cookie, csrf } = await moPhien();
  // Ten mien sai dinh dang: route bao loi roi quay lai trang truoc (quayLai)
  const xoa = (referer: string) =>
    lay(`${B}/gio-hang/them`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, referer },
      body: new URLSearchParams({ _csrf: csrf, domain: '!!!' }).toString(),
    });
  // Cung ten mien nhung ngoai app (site chinh) -> ve gio hang
  assert.equal((await xoa(`${goc}/blog/bai-viet`)).headers.get('location'), `${B}/gio-hang`);
  // Trong app -> quay lai dung trang, khong lap tien to
  assert.equal((await xoa(`${goc}${B}/bang-gia?x=1`)).headers.get('location'), `${B}/bang-gia?x=1`);
});

test('cookie phien chi gui cho duong dan cua app', async () => {
  const r = await lay(`${B}/`);
  assert.match(r.headers.get('set-cookie') ?? '', /Path=\/ten-mien(;|$)/);
});

test('robots.txt va sitemap.xml co tien to', async () => {
  const robots = await (await lay(`${B}/robots.txt`)).text();
  assert.match(robots, /^Disallow: \/ten-mien\/admin$/m);
  assert.match(robots, /^Sitemap: http:\/\/127\.0\.0\.1\/ten-mien\/sitemap\.xml$/m);
  const sitemap = await (await lay(`${B}/sitemap.xml`)).text();
  assert.match(sitemap, /<loc>http:\/\/127\.0\.0\.1\/ten-mien\/bang-gia<\/loc>/);
});

test('webhook SePay toi dung handler (khong bi CSRF chan)', async () => {
  const r = await lay(`${B}/webhooks/sepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(r.status, 401);
});

test('header CSP van co tren trang duoi tien to', async () => {
  const r = await lay(`${B}/`);
  assert.match(r.headers.get('content-security-policy') ?? '', /script-src 'self'/);
});

test('BASE_PATH va APP_URL phai khop, sai dinh dang thi dung', async () => {
  const { chuanHoaBasePath } = await import('../src/config.js');
  assert.equal(chuanHoaBasePath('', 'https://vidu.vn'), '');
  assert.equal(chuanHoaBasePath('/', 'https://vidu.vn/'), '');
  assert.equal(chuanHoaBasePath('/ten-mien/', 'https://vidu.vn/ten-mien'), '/ten-mien');
  assert.throws(() => chuanHoaBasePath('/ten-mien', 'https://vidu.vn'), /không khớp/);
  assert.throws(() => chuanHoaBasePath('', 'https://vidu.vn/ten-mien'), /không khớp/);
  assert.throws(() => chuanHoaBasePath('ten-mien', 'https://vidu.vn/ten-mien'), /không hợp lệ/);
  assert.throws(() => chuanHoaBasePath('/Ten Mien', 'https://vidu.vn/ten-mien'), /không hợp lệ/);
});
