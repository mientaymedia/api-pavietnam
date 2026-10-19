/**
 * Nut chat Zalo tren trang khach (chu yeu cau 19/10/2026): widget chinh thuc
 * cua Zalo kem link du phong khong can JS, khong co o trang quan tri, tat cau
 * hinh thi khong nap script, CSP chi mo nguon Zalo khi trang co nut.
 */
import './helpers/db.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { db, isoIn, nowIso } from '../src/db/index.js';
import { encryptSecret, randomToken } from '../src/lib/crypto.js';
import { config } from '../src/config.js';
import { setSetting } from '../src/lib/settings.js';

const OA = '3962957485228412416';
let server: Server;
let goc = '';
let cookieQuanTri = '';

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Phien quan tri da bat 2FA (nhu kiem-base, tra-cuu-ai.test.ts)
  const email = `quantri-zalo-${randomToken(4)}@test.vn`;
  const id = Number(db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at) VALUES (?, 'x', 'Quản trị', 'admin', ?, ?)`,
  ).run(email, nowIso(), nowIso()).lastInsertRowid);
  db.prepare('INSERT INTO two_factor (user_id, secret_enc, confirmed_at) VALUES (?, ?, ?)').run(id, encryptSecret('JBSWY3DPEHPK3PXP'), nowIso());
  const sid = randomToken(24);
  db.prepare(`INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, '', '', ?, ?)`)
    .run(sid, id, JSON.stringify({ userId: id }), isoIn(3600_000), nowIso());
  cookieQuanTri = `sid=${sid}.${createHmac('sha256', config.sessionSecret).update(sid).digest('base64url')}`;
});

after(() => {
  server?.close();
});

async function lay(p: string, cookie = ''): Promise<{ status: number; html: string; csp: string }> {
  const r = await fetch(goc + p, { headers: cookie ? { cookie } : {} });
  return { status: r.status, html: await r.text(), csp: r.headers.get('content-security-policy') ?? '' };
}

function chiThi(csp: string, ten: string): string {
  return csp.split('; ').find((d) => d.startsWith(`${ten} `)) ?? '';
}

const WIDGET = `<div class="zalo-chat-widget" data-oaid="${OA}" data-welcome-message="Xin chào! MienTay Media có thể hỗ trợ gì cho bạn về tên miền?" data-autopopup="0" data-width="" data-height=""></div>`;
const SDK = '<script src="https://sp.zalo.me/plugins/sdk.js" async defer></script>';

test('trang khach co widget Zalo, link du phong va script SDK; CSP mo dung nguon Zalo', async () => {
  for (const p of ['/', '/tim-kiem?q=zalochat.vn', '/gio-hang', '/bieu-mau-ho-so']) {
    const { status, html, csp } = await lay(p);
    assert.equal(status, 200, p);
    assert.ok(html.includes(WIDGET), `${p}: thieu widget`);
    assert.ok(html.includes(SDK), `${p}: thieu SDK`);
    assert.match(html, new RegExp(`<a class="zalo-fab" href="https://zalo\.me/${OA}" target="_blank" rel="noopener"[^>]*>`), p);
    assert.equal(chiThi(csp, 'script-src'), "script-src 'self' https://sp.zalo.me za.zdn.vn", p);
    assert.equal(chiThi(csp, 'frame-src'), 'frame-src https://*.zalo.me', p);
    assert.ok(!csp.includes('unsafe-eval'), p);
    assert.ok(!chiThi(csp, 'script-src').includes('unsafe-inline'), p);
    // Chi mot widget, mot SDK moi trang
    assert.equal(html.split('class="zalo-chat-widget"').length - 1, 1, p);
  }
});

test('trang quan tri khong co nut Zalo va CSP khong mo nguon Zalo', async () => {
  for (const p of ['/admin', '/admin/cau-hinh']) {
    const { status, html, csp } = await lay(p, cookieQuanTri);
    assert.equal(status, 200, p);
    assert.doesNotMatch(html, /zalo-chat-widget|zalo-fab|sp\.zalo\.me/, p);
    assert.equal(chiThi(csp, 'script-src'), "script-src 'self'", p);
    assert.doesNotMatch(csp, /zalo|zdn/, p);
  }
});

test('trang cau hinh co o bat tat, OA ID va loi chao, mac dinh bat', async () => {
  const { html } = await lay('/admin/cau-hinh', cookieQuanTri);
  assert.match(html, /<input type="checkbox" name="site\.zalo_chat_enabled" value="1" checked>/);
  assert.match(html, new RegExp(`name="site\.zalo_oa_id"[^>]*value="${OA}"`));
  assert.match(html, /name="site\.zalo_welcome"[^>]*value="Xin chào! MienTay Media có thể hỗ trợ gì cho bạn về tên miền\?"/);
});

test('tat cau hinh hoac OA sai dinh dang thi khong nap script, khong in nut, CSP ve mac dinh', async () => {
  const kiem = async (k: string, v: string): Promise<void> => {
    setSetting(k, v);
    try {
      for (const p of ['/', '/gio-hang']) {
        const { html, csp } = await lay(p);
        assert.doesNotMatch(html, /zalo-chat-widget|zalo-fab|sp\.zalo\.me/, `${k}=${v} ${p}`);
        assert.equal(chiThi(csp, 'script-src'), "script-src 'self'", `${k}=${v} ${p}`);
        assert.equal(chiThi(csp, 'frame-src'), '', `${k}=${v} ${p}`);
      }
    } finally {
      setSetting(k, '');
    }
  };
  await kiem('site.zalo_chat_enabled', '0');
  await kiem('site.zalo_oa_id', 'https://zalo.me/123456789');
  await kiem('site.zalo_oa_id', '123" onload="x');
});

test('loi chao va OA tu cau hinh duoc thoat ky tu HTML', async () => {
  setSetting('site.zalo_welcome', '"><script>alert(1)</script>');
  setSetting('site.zalo_oa_id', '1234567890');
  try {
    const { html } = await lay('/');
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /data-oaid="1234567890" data-welcome-message="&#34;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.match(html, /href="https:\/\/zalo\.me\/1234567890"/);
  } finally {
    setSetting('site.zalo_welcome', '');
    setSetting('site.zalo_oa_id', '');
  }
});
