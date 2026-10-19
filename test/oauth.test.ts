/**
 * Lop noi chuyen voi nha cung cap (src/lib/oauth.ts) tren may chu OAuth gia:
 * PKCE S256, dia chi xin quyen, doi ma va lay ho so cho Zalo, Google, GitHub.
 */
import './helpers/csdl-rieng.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { moOauthGia } from './helpers/oauth-gia.js';

// config doc bien moi truong luc nap: dat truoc roi moi import src
const gia = await moOauthGia();
Object.assign(process.env, {
  OAUTH_MOCK_BASE: gia.goc,
  ZALO_APP_ID: gia.khoa.zalo.id, ZALO_APP_SECRET: gia.khoa.zalo.secret,
  GOOGLE_CLIENT_ID: gia.khoa.google.id, GOOGLE_CLIENT_SECRET: gia.khoa.google.secret,
  GITHUB_CLIENT_ID: gia.khoa.github.id, GITHUB_CLIENT_SECRET: gia.khoa.github.secret,
});
await import('./helpers/db.js');
const o = await import('../src/lib/oauth.js');
const { setSetting } = await import('../src/lib/settings.js');

after(() => gia.dong());

function batDau(ben: 'zalo' | 'google' | 'github') {
  const khoa = o.khoaCua(ben)!;
  const pkce = o.taoPkce();
  const state = crypto.randomBytes(8).toString('hex');
  const nonce = ben === 'google' ? 'nonce-thu' : undefined;
  const url = o.diaChiXinQuyen(ben, khoa, { state, challenge: pkce.challenge, nonce });
  return { khoa, pkce, state, nonce, url };
}

test('PKCE: verifier 43 ky tu base64url, challenge la base64url(sha256(verifier)) khong dau =', () => {
  const { verifier, challenge } = o.taoPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(o.taoPkce().verifier, verifier);
});

test('dia chi xin quyen dung tham so tung ben, redirect_uri la APP_URL/auth/<ben>/callback', () => {
  const z = new URL(batDau('zalo').url);
  assert.equal(z.pathname, '/oauth.zaloapp.com/v4/permission');
  assert.equal(z.searchParams.get('app_id'), gia.khoa.zalo.id);
  assert.ok(z.searchParams.get('code_challenge'));
  assert.ok(z.searchParams.get('state'));
  assert.equal(z.searchParams.get('redirect_uri'), o.diaChiQuayVe('zalo'));
  assert.match(o.diaChiQuayVe('zalo'), /\/auth\/zalo\/callback$/);

  const g = new URL(batDau('google').url);
  assert.equal(g.pathname, '/accounts.google.com/o/oauth2/v2/auth');
  assert.equal(g.searchParams.get('scope'), 'openid email profile');
  assert.equal(g.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(g.searchParams.get('response_type'), 'code');
  assert.equal(g.searchParams.get('nonce'), 'nonce-thu');

  const h = new URL(batDau('github').url);
  assert.equal(h.pathname, '/github.com/login/oauth/authorize');
  assert.equal(h.searchParams.get('scope'), 'read:user user:email');
  assert.equal(h.searchParams.get('code_challenge_method'), 'S256');
});

test('Zalo: doi ma gui secret_key o header va code_verifier, ho so khong co email', async () => {
  const b = batDau('zalo');
  const { code } = gia.dongY(b.url, { id: '8800001', ten: 'Khách Zalo' });
  const hs = await o.layHoSo('zalo', b.khoa, { code, verifier: b.pkce.verifier });
  assert.deepEqual(hs, { ben: 'zalo', id: '8800001', ten: 'Khách Zalo', email: '', emailDaXacMinh: false });
  const doi = gia.yeuCau.findLast((y) => y.duong === '/oauth.zaloapp.com/v4/access_token')!;
  assert.equal(doi.headers['secret_key'], gia.khoa.zalo.secret);
  assert.equal(doi.form['code_verifier'], b.pkce.verifier);
  assert.equal(doi.form['client_secret'], undefined, 'Zalo: bi mat chi o header');
});

test('PKCE sai thi ben kia tu choi, ma da dung khong doi lai duoc', async () => {
  for (const ben of ['zalo', 'google', 'github'] as const) {
    const b = batDau(ben);
    const { code } = gia.dongY(b.url, { id: '1', ten: 'A', email: 'a@x.vn', daXacMinh: true });
    await assert.rejects(o.layHoSo(ben, b.khoa, { code, verifier: o.taoPkce().verifier, nonce: b.nonce }), o.LoiMxh);
    // Ma dung mot lan: verifier dung cung khong cuu duoc
    await assert.rejects(o.layHoSo(ben, b.khoa, { code, verifier: b.pkce.verifier, nonce: b.nonce }), o.LoiMxh);
  }
});

test('Google: lay sub, email da xac minh tu id_token; email chua xac minh thi danh dau false', async () => {
  let b = batDau('google');
  let { code } = gia.dongY(b.url, { id: 'g-sub-1', ten: 'Nguyễn Văn A', email: 'A@Gmail.com', daXacMinh: true });
  let hs = await o.layHoSo('google', b.khoa, { code, verifier: b.pkce.verifier, nonce: b.nonce });
  assert.deepEqual(hs, { ben: 'google', id: 'g-sub-1', ten: 'Nguyễn Văn A', email: 'a@gmail.com', emailDaXacMinh: true });

  b = batDau('google');
  ({ code } = gia.dongY(b.url, { id: 'g-sub-2', ten: 'B', email: 'b@gmail.com', daXacMinh: false }));
  hs = await o.layHoSo('google', b.khoa, { code, verifier: b.pkce.verifier, nonce: b.nonce });
  assert.equal(hs.emailDaXacMinh, false);
});

test('Google: id_token sai aud, sai iss, sai nonce hoac het han thi tu choi', async () => {
  const sai: Record<string, unknown>[] = [
    { aud: 'ung-dung-khac.apps.googleusercontent.com' },
    { iss: 'https://ke-gian.example' },
    { nonce: 'nonce-khac' },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { sub: '' },
  ];
  for (const sua of sai) {
    const b = batDau('google');
    const { code } = gia.dongY(b.url, { id: 'g', ten: 'G', email: 'g@gmail.com', daXacMinh: true, suaIdToken: sua });
    await assert.rejects(o.layHoSo('google', b.khoa, { code, verifier: b.pkce.verifier, nonce: b.nonce }), o.LoiMxh, JSON.stringify(sua));
  }
});

test('GitHub: chi lay email primary va verified, gui User-Agent', async () => {
  let b = batDau('github');
  let { code } = gia.dongY(b.url, { id: '4242', ten: 'Dev Thu', email: 'dev@vi-du.vn', daXacMinh: true });
  let hs = await o.layHoSo('github', b.khoa, { code, verifier: b.pkce.verifier });
  assert.deepEqual(hs, { ben: 'github', id: '4242', ten: 'Dev Thu', email: 'dev@vi-du.vn', emailDaXacMinh: true });
  assert.ok(gia.yeuCau.findLast((y) => y.duong === '/api.github.com/user')!.headers['user-agent']);

  b = batDau('github');
  ({ code } = gia.dongY(b.url, { id: '4243', ten: 'Chua Xac Minh', email: 'cxm@vi-du.vn', daXacMinh: false }));
  hs = await o.layHoSo('github', b.khoa, { code, verifier: b.pkce.verifier });
  assert.equal(hs.email, '');
  assert.equal(hs.emailDaXacMinh, false);
});

test('loi khong mang ma, token hay bi mat trong thong diep', async () => {
  const b = batDau('github');
  const { code } = gia.dongY(b.url, { id: '1', ten: 'A' });
  const sai = { ...b.khoa, secret: 'bi-mat-sai-123' };
  const loi = await o.layHoSo('github', sai, { code, verifier: b.pkce.verifier }).catch((e: unknown) => e);
  assert.ok(loi instanceof o.LoiMxh);
  const chu = `${loi.message} ${String(loi.stack)}`;
  for (const x of [code, b.pkce.verifier, 'bi-mat-sai-123', gia.khoa.github.secret]) assert.ok(!chu.includes(x), `lo ${x}`);
});

test('ben thieu khoa hoac bi tat thi khong dung duoc', () => {
  assert.deepEqual(o.danhSachDangBat(), ['zalo', 'google', 'github']);
  setSetting('oauth.github_enabled', '0');
  assert.equal(o.khoaCua('github'), null);
  assert.deepEqual(o.danhSachDangBat(), ['zalo', 'google']);
  setSetting('oauth.github_enabled', '1');
  assert.ok(o.khoaCua('github'));
});
