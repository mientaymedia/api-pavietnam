/**
 * Cong Tai khoan MienTay dung chung phien voi /ten-mien (docs/mtm/tai-khoan-chung/
 * spec.md muc 10): app that duoi BASE_PATH=/ten-mien, cong o /tai-khoan, may
 * chu OAuth gia lap cuc bo (khong goi Zalo, Google, GitHub that).
 *
 * config.ts doc bien moi truong luc nap: dat bien TRUOC roi moi import dong.
 */
import './helpers/csdl-rieng.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { BIEN_THE_NEXT } from './helpers/bien-the-redirect.js';
import { moOauthGia, type NguoiGia } from './helpers/oauth-gia.js';

const gia = await moOauthGia();
Object.assign(process.env, {
  BASE_PATH: '/ten-mien',
  APP_URL: 'http://127.0.0.1/ten-mien',
  CONG_TAI_KHOAN_PATH: '/tai-khoan',
  OAUTH_MOCK_BASE: gia.goc,
  ZALO_APP_ID: gia.khoa.zalo.id, ZALO_APP_SECRET: gia.khoa.zalo.secret,
  GOOGLE_CLIENT_ID: gia.khoa.google.id, GOOGLE_CLIENT_SECRET: gia.khoa.google.secret,
  GITHUB_CLIENT_ID: gia.khoa.github.id, GITHUB_CLIENT_SECRET: gia.khoa.github.secret,
});

await import('./helpers/db.js');
const { createApp } = await import('../src/app.js');
const { config, chuanHoaCongPath } = await import('../src/config.js');
const { db, nowIso, isoIn } = await import('../src/db/index.js');
const { hashPassword, randomToken } = await import('../src/lib/crypto.js');
const { beginSetup, confirmSetup } = await import('../src/services/twoFactor.js');
const { currentCode, codeForCounter } = await import('../src/lib/totp.js');

let server: Server;
let goc = '';

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  goc = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server?.close();
  await gia.dong();
});

type Ben = 'zalo' | 'google' | 'github';
const so = () => String(100000 + Math.floor(Math.random() * 1e9));
const emailMoi = () => `tkc-${crypto.randomBytes(5).toString('hex')}@vi-du.vn`;
const MAT_KHAU = 'mat-khau-thu-123';

/**
 * Trinh duyet gia: giu cookie theo Path nhu trinh duyet that (cung ten sid,
 * khac Path), gui cookie co Path khop dai nhat. Ghi lai moi Set-Cookie.
 */
class TrinhDuyet {
  hop = new Map<string, string>();
  daNhan: string[] = [];

  private nhan(r: Response): Response {
    for (const c of r.headers.getSetCookie()) {
      this.daNhan.push(c);
      const [kv = '', ...thuocTinh] = c.split(';').map((s) => s.trim());
      const path = thuocTinh.find((a) => /^path=/i.test(a))?.slice(5) ?? '/';
      const xoa = kv === 'sid=' || thuocTinh.some((a) => /^expires=Thu, 01 Jan 1970/i.test(a) || /^max-age=0$/i.test(a));
      if (xoa) this.hop.delete(path);
      else this.hop.set(path, kv);
    }
    return r;
  }

  cookieCho(p: string): string {
    const duong = p.split('?')[0] ?? p;
    let tot = '';
    let kq = '';
    for (const [path, kv] of this.hop) {
      const khop = path === '/' || duong === path || duong.startsWith(`${path}/`);
      if (khop && path.length > tot.length) { tot = path; kq = kv; }
    }
    return kq;
  }

  async lay(p: string): Promise<Response> {
    const cookie = this.cookieCho(p);
    return this.nhan(await fetch(goc + p, { redirect: 'manual', headers: cookie ? { cookie } : {} }));
  }

  async gui(p: string, du: Record<string, string>): Promise<Response> {
    const cookie = this.cookieCho(p);
    return this.nhan(await fetch(goc + p, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
      body: new URLSearchParams(du).toString(),
    }));
  }

  async csrf(p: string): Promise<string> {
    const html = await (await this.lay(p)).text();
    return html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  }

  sidCua(path: string): string {
    return decodeURIComponent((this.hop.get(path) ?? '').slice(4)).split('.')[0] ?? '';
  }
}

function taoKhach(email = emailMoi()): { id: number; email: string } {
  const id = Number(db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, email_verified_at, created_at, updated_at) VALUES (?, ?, 'Khách Thử', 'customer', ?, ?, ?)`,
  ).run(email, hashPassword(MAT_KHAU), nowIso(), nowIso(), nowIso()).lastInsertRowid);
  return { id, email };
}

/** Dang nhap mat khau o cong, tra phan hoi POST. */
async function dangNhapCong(t: TrinhDuyet, email: string, next = ''): Promise<Response> {
  const csrf = await t.csrf(`/tai-khoan/dang-nhap${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  assert.ok(csrf, 'trang dang nhap cong co token CSRF');
  return t.gui('/tai-khoan/dang-nhap', { _csrf: csrf, email, password: MAT_KHAU, next });
}

/** Bat 2FA cho tai khoan, tra ham sinh ma cho chu ky ke tiep (chu ky hien tai da dung khi bat). */
function bat2fa(userId: number, email: string): () => string {
  const { secret } = beginSetup(userId, email);
  assert.equal(confirmSetup(userId, currentCode(secret)).ok, true);
  return () => codeForCounter(secret, Math.floor(Date.now() / 30_000) + 1);
}

async function mxhTuCong(t: TrinhDuyet, ben: Ben, nguoi: NguoiGia, query = ''): Promise<{ xinQuyen: string; r: Response }> {
  const bd = await t.lay(`/ten-mien/auth/${ben}?cong=1${query}`);
  assert.equal(bd.status, 302, `bat dau ${ben}`);
  const xinQuyen = bd.headers.get('location') ?? '';
  const { callback } = gia.dongY(xinQuyen, nguoi);
  return { xinQuyen, r: await t.lay(callback) };
}

/* ------------------------------------------------------------ cau hinh */

test('CONG_TAI_KHOAN_PATH: rong la tat, kiem dang, khong trung hay long BASE_PATH', () => {
  assert.equal(chuanHoaCongPath('', '/ten-mien'), '');
  assert.equal(chuanHoaCongPath('/tai-khoan/', '/ten-mien'), '/tai-khoan');
  assert.throws(() => chuanHoaCongPath('/tai-khoan', ''), /BASE_PATH/);
  assert.throws(() => chuanHoaCongPath('/ten-mien', '/ten-mien'), /lồng/);
  assert.throws(() => chuanHoaCongPath('/ten-mien/tai-khoan', '/ten-mien'), /lồng/);
  assert.throws(() => chuanHoaCongPath('/a', '/a/b'), /lồng/);
  assert.throws(() => chuanHoaCongPath('tai-khoan', '/ten-mien'), /không hợp lệ/);
  assert.throws(() => chuanHoaCongPath('/Tai Khoan', '/ten-mien'), /không hợp lệ/);
  assert.equal(config.congTaiKhoanPath, '/tai-khoan');
});

/* ---------------------------------------------------------- giao dien */

test('trang dang nhap cong: ba nut bat dau o /ten-mien kem cong=1, khong script, form gui ve cong', async () => {
  const t = new TrinhDuyet();
  const r = await t.lay('/tai-khoan/dang-nhap?next=%2Ften-mien%2Fdon-hang');
  assert.equal(r.status, 200);
  const html = await r.text();
  for (const ben of ['zalo', 'google', 'github']) {
    assert.match(html, new RegExp(`href="/ten-mien/auth/${ben}\\?cong=1&amp;next=%2Ften-mien%2Fdon-hang"`), ben);
  }
  assert.match(html, /Tài khoản MienTay/);
  assert.match(html, /action="\/tai-khoan\/dang-nhap"/);
  assert.doesNotMatch(html, /<script/i);
  // CSP nhu cu, va o cong khong mo nguon chat Zalo
  const csp = r.headers.get('content-security-policy') ?? '';
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /form-action 'self'/);
  // Phien moi tao o cong chi dat cookie cua cong
  assert.deepEqual([...t.hop.keys()], ['/tai-khoan']);
});

test('moi Set-Cookie: khong Domain, co HttpOnly, SameSite=Lax, Path chi /ten-mien hoac /tai-khoan', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await t.lay('/ten-mien/');
  const r = await dangNhapCong(t, k.email);
  assert.equal(r.status, 302);
  await t.gui('/tai-khoan/dang-xuat', { _csrf: await t.csrf('/tai-khoan/ho-so') });
  assert.ok(t.daNhan.length >= 4);
  for (const c of t.daNhan) {
    assert.doesNotMatch(c, /;\s*domain=/i, c);
    assert.match(c, /;\s*HttpOnly/i, c);
    assert.match(c, /;\s*SameSite=Lax/i, c);
    assert.match(c, /;\s*Path=\/(ten-mien|tai-khoan)(;|$)/, c);
  }
});

/* -------------------------------------------------------- dang nhap mot lan */

test('dang nhap o cong roi vao /ten-mien/control-panel khong phai dang nhap lai', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  const r = await dangNhapCong(t, k.email);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/tai-khoan/', 'khong co next: trang chon san pham');
  // Hai cookie cung mot phien
  assert.ok(t.sidCua('/ten-mien'));
  assert.equal(t.sidCua('/ten-mien'), t.sidCua('/tai-khoan'));

  assert.equal((await t.lay('/ten-mien/control-panel')).status, 200);
  assert.equal((await t.lay('/ten-mien/dashboard')).status, 200);
  const chon = await t.lay('/tai-khoan/');
  assert.equal(chon.status, 200);
  const html = await chon.text();
  assert.match(html, /href="\/ten-mien\/control-panel"/);
  assert.match(html, /href="https:\/\/app\.mineflow\.dev"[^>]*target="_blank" rel="noopener"/);
  assert.match(html, /Mineflow dùng tài khoản riêng/);
});

test('dang nhap o /ten-mien (POST cu) roi mo cong thay da dang nhap', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await t.lay('/ten-mien/'); // phien goc, cookie o ca hai Path
  assert.equal(t.sidCua('/ten-mien'), t.sidCua('/tai-khoan'));
  const csrf = await t.csrf('/tai-khoan/dang-nhap');
  const r = await t.gui('/ten-mien/dang-nhap', { _csrf: csrf, email: k.email, password: MAT_KHAU, next: '/don-hang' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/ten-mien/don-hang');
  const cong = await t.lay('/tai-khoan/');
  assert.equal(cong.status, 200);
  assert.match(await cong.text(), /Chọn sản phẩm/);
  assert.equal((await t.lay('/tai-khoan/dang-nhap')).headers.get('location'), '/tai-khoan/', 'da dang nhap thi khong hien form');
});

test('phien dang nhap cu chi co cookie /ten-mien: lan dau vao /ten-mien thi lan sang cong', async () => {
  const k = taoKhach();
  const sid = randomToken(24);
  db.prepare(`INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, '', '', ?, ?)`)
    .run(sid, k.id, JSON.stringify({ userId: k.id }), isoIn(3600_000), nowIso());
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(sid).digest('base64url');
  const t = new TrinhDuyet();
  t.hop.set('/ten-mien', `sid=${sid}.${sig}`);

  const r = await t.lay('/ten-mien/control-panel');
  assert.equal(r.status, 200);
  assert.equal(t.sidCua('/tai-khoan'), sid, 'dat them cookie cho cong');
  assert.equal((await t.lay('/tai-khoan/')).status, 200);
  // Chi dat mot lan
  const truoc = t.daNhan.length;
  await t.lay('/ten-mien/control-panel');
  assert.equal(t.daNhan.length, truoc);
});

test('gio hang khach vang lai giu nguyen khi bam dang nhap tu /ten-mien sang cong', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await t.lay('/ten-mien/');
  const sidKhach = t.sidCua('/ten-mien');
  // Link cu di qua /ten-mien nen cong dung dung phien do (gio hang theo phien)
  const r = await t.lay('/ten-mien/dang-nhap?next=%2Fgio-hang');
  assert.equal(r.headers.get('location'), '/tai-khoan/dang-nhap?next=%2Ften-mien%2Fgio-hang');
  assert.equal(t.sidCua('/tai-khoan'), sidKhach);
  const vao = await dangNhapCong(t, k.email, '/ten-mien/gio-hang');
  assert.equal(vao.headers.get('location'), '/ten-mien/gio-hang');
});

/* --------------------------------------------------------- dang xuat chung */

test('dang xuat o cong: het phien ca hai noi, xoa dong sessions', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await dangNhapCong(t, k.email);
  const sid = t.sidCua('/tai-khoan');
  const csrf = await t.csrf('/tai-khoan/ho-so');
  const r = await t.gui('/tai-khoan/dang-xuat', { _csrf: csrf });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/tai-khoan/');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE sid = ?').get(sid) as { n: number }).n, 0);
  assert.equal(t.hop.size, 0, 'xoa cookie o ca hai Path');

  const cp = await t.lay('/ten-mien/control-panel');
  assert.equal(cp.status, 302);
  assert.equal(cp.headers.get('location'), '/tai-khoan/dang-nhap?next=%2Ften-mien%2Fcontrol-panel');
});

test('dang xuat o /ten-mien: cong thay chua dang nhap', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await dangNhapCong(t, k.email);
  const sid = t.sidCua('/ten-mien');
  const csrf = await t.csrf('/ten-mien/dashboard');
  const r = await t.gui('/ten-mien/dang-xuat', { _csrf: csrf });
  assert.equal(r.status, 302);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE sid = ?').get(sid) as { n: number }).n, 0);
  // Ke ca khi trinh duyet con giu cookie cu cua cong: dong sessions da xoa
  t.hop.set('/tai-khoan', `sid=${sid}.x`);
  const cong = await t.lay('/tai-khoan/');
  assert.equal(cong.headers.get('location'), '/tai-khoan/dang-nhap');
});

test('POST dang xuat cong thieu hoac sai _csrf: 403, van dang nhap', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await dangNhapCong(t, k.email);
  assert.equal((await t.gui('/tai-khoan/dang-xuat', {})).status, 403);
  assert.equal((await t.gui('/tai-khoan/dang-xuat', { _csrf: 'sai' })).status, 403);
  assert.equal((await t.lay('/ten-mien/control-panel')).status, 200);
});

/* ---------------------------------------------------------------- 2FA */

test('2FA van bat buoc o cong: sai ma khong vao duoc /ten-mien, dung ma ve dich', async () => {
  const t = new TrinhDuyet();
  // Khach den tu /ten-mien: hai cookie cung mot phien (xem spec muc 2, gioi han
  // cua phien chi co cookie cong)
  await t.lay('/ten-mien/');
  const k = taoKhach();
  const ma = bat2fa(k.id, k.email);
  const r = await dangNhapCong(t, k.email, '/ten-mien/don-hang');
  assert.equal(r.headers.get('location'), '/tai-khoan/dang-nhap/hai-lop');
  assert.equal((await t.lay('/ten-mien/control-panel')).status, 302, 'chua nhap ma thi chua co phien');

  const csrf = await t.csrf('/tai-khoan/dang-nhap/hai-lop');
  const sai = await t.gui('/tai-khoan/dang-nhap/hai-lop', { _csrf: csrf, code: '000000' });
  assert.equal(sai.status, 401);
  assert.equal((await t.lay('/ten-mien/control-panel')).status, 302);

  const dung = await t.gui('/tai-khoan/dang-nhap/hai-lop', { _csrf: csrf, code: ma() });
  assert.equal(dung.status, 302);
  assert.equal(dung.headers.get('location'), '/ten-mien/don-hang');
  assert.equal((await t.lay('/ten-mien/control-panel')).status, 200);
});

/* --------------------------------------------------------- next doc hai */

test('next doc hai o cong deu ve trang chon san pham; next noi bo hop le duoc giu', async () => {
  for (const bien of [...BIEN_THE_NEXT, '/tai-khoan/dang-nhap', '/tai-khoan/dang-xuat', '/ten-mien/dang-nhap?next=//evil.com']) {
    const t = new TrinhDuyet();
    const r = await dangNhapCong(t, taoKhach().email, bien);
    assert.equal(r.status, 302, JSON.stringify(bien));
    assert.equal(r.headers.get('location'), '/tai-khoan/', JSON.stringify(bien));
  }
  for (const [next, dich] of [['/ten-mien/don-hang', '/ten-mien/don-hang'], ['/bang-gia', '/bang-gia'], ['/tai-khoan/bao-mat', '/tai-khoan/bao-mat']]) {
    const t = new TrinhDuyet();
    const r = await dangNhapCong(t, taoKhach().email, next!);
    assert.equal(r.headers.get('location'), dich);
  }
});

/* ---------------------------------------------------------- mang xa hoi */

test('Google, GitHub tu cong: redirect_uri van la callback /ten-mien, xong ve dich, cong thay da dang nhap', async () => {
  for (const ben of ['google', 'github'] as const) {
    const t = new TrinhDuyet();
    await t.lay('/tai-khoan/dang-nhap'); // khach mo cong truoc (chi cookie cong)
    const { xinQuyen, r } = await mxhTuCong(t, ben, { id: so(), ten: 'Mạng Xã Hội', email: emailMoi(), daXacMinh: true }, '&next=%2Ften-mien%2Fdon-hang');
    const uri = new URL(xinQuyen).searchParams.get('redirect_uri');
    assert.equal(uri, `http://127.0.0.1/ten-mien/auth/${ben}/callback`, `${ben} giu redirect URI da khai`);
    assert.equal(r.status, 302, ben);
    assert.equal(r.headers.get('location'), '/ten-mien/don-hang', ben);
    assert.equal(t.sidCua('/ten-mien'), t.sidCua('/tai-khoan'));
    assert.equal((await t.lay('/tai-khoan/')).status, 200, ben);
    assert.equal((await t.lay('/ten-mien/control-panel')).status, 200, ben);
  }
});

test('Zalo tu cong: dang nhap duoc, chua co email thi sang trang bo sung email', async () => {
  const t = new TrinhDuyet();
  const { xinQuyen, r } = await mxhTuCong(t, 'zalo', { id: so(), ten: 'Khách Zalo' });
  assert.equal(new URL(xinQuyen).searchParams.get('redirect_uri'), 'http://127.0.0.1/ten-mien/auth/zalo/callback');
  assert.equal(r.headers.get('location'), '/ten-mien/tai-khoan/email');
  assert.equal((await t.lay('/tai-khoan/')).status, 200);
});

test('mang xa hoi tu cong: email trung tai khoan co mat khau khong tu gop, ve dang nhap cong', async () => {
  const k = taoKhach();
  const t = new TrinhDuyet();
  const { r } = await mxhTuCong(t, 'google', { id: so(), ten: 'Trùng Email', email: k.email, daXacMinh: true }, '&next=%2Fbang-gia');
  assert.equal(r.headers.get('location'), '/tai-khoan/dang-nhap?next=%2Fbang-gia');
  assert.equal((await t.lay('/ten-mien/control-panel')).status, 302);
  // Dang nhap mat khau mot lan thi duoc lien ket va ve dung dich
  const vao = await dangNhapCong(t, k.email, '/bang-gia');
  assert.equal(vao.headers.get('location'), '/bang-gia');
  assert.ok(db.prepare("SELECT 1 FROM user_identities WHERE provider = 'google' AND user_id = ?").get(k.id));
});

test('mang xa hoi tu cong voi tai khoan co 2FA: sang trang 2FA cua cong', async () => {
  const k = taoKhach();
  const ma = bat2fa(k.id, k.email);
  const gh = so();
  db.prepare("INSERT INTO user_identities (provider, provider_user_id, user_id, email) VALUES ('github', ?, ?, '')").run(gh, k.id);
  const t = new TrinhDuyet();
  const { r } = await mxhTuCong(t, 'github', { id: gh, ten: 'Có 2FA' }, '&next=%2Ften-mien%2Fdon-hang');
  assert.equal(r.headers.get('location'), '/tai-khoan/dang-nhap/hai-lop');
  assert.equal((await t.lay('/ten-mien/control-panel')).status, 302);
  const csrf = await t.csrf('/tai-khoan/dang-nhap/hai-lop');
  const dung = await t.gui('/tai-khoan/dang-nhap/hai-lop', { _csrf: csrf, code: ma() });
  assert.equal(dung.headers.get('location'), '/ten-mien/don-hang');
});

test('lien ket tu trang Lien ket cua cong: can _csrf, xong ve /tai-khoan/lien-ket', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await dangNhapCong(t, k.email);
  assert.equal((await t.lay('/ten-mien/auth/github?lien_ket=1&cong=1')).status, 403);
  const trang = await (await t.lay('/tai-khoan/lien-ket')).text();
  const link = trang.match(/href="(\/ten-mien\/auth\/github\?lien_ket=1&amp;cong=1&amp;_csrf=[^"]+)"/)?.[1];
  assert.ok(link, 'trang co link lien ket GitHub kem _csrf');
  const bd = await t.lay(link!.replace(/&amp;/g, '&'));
  const { callback } = gia.dongY(bd.headers.get('location') ?? '', { id: so(), ten: 'Dev' });
  const r = await t.lay(callback);
  assert.equal(r.headers.get('location'), '/tai-khoan/lien-ket');
  assert.match(await (await t.lay('/tai-khoan/lien-ket')).text(), /Đã liên kết GitHub/);
});

/* --------------------------------------------------------------- link cu */

test('link cu cua /ten-mien 302 sang cong, giu next an toan va token, khong cai nao 404', async () => {
  const t = new TrinhDuyet();
  const cap: [string, string][] = [
    ['/ten-mien/dang-nhap', '/tai-khoan/dang-nhap'],
    ['/ten-mien/dang-nhap?next=%2Fcontrol-panel', '/tai-khoan/dang-nhap?next=%2Ften-mien%2Fcontrol-panel'],
    ['/ten-mien/dang-nhap?next=%2F%2Fevil.com', '/tai-khoan/dang-nhap'],
    ['/ten-mien/dang-ky', '/tai-khoan/dang-ky'],
    ['/ten-mien/quen-mat-khau', '/tai-khoan/quen-mat-khau'],
    ['/ten-mien/dat-lai-mat-khau?token=abc123', '/tai-khoan/dat-lai-mat-khau?token=abc123'],
    ['/ten-mien/dang-nhap/hai-lop', '/tai-khoan/dang-nhap/hai-lop'],
  ];
  for (const [cu, moi] of cap) {
    const r = await t.lay(cu);
    assert.equal(r.status, 302, cu);
    assert.equal(r.headers.get('location'), moi, cu);
    const den = await t.lay(moi);
    assert.notEqual(den.status, 404, moi);
  }
  assert.match(await (await t.lay('/tai-khoan/dat-lai-mat-khau?token=abc123')).text(), /name="token" value="abc123"/);
  // Trang tai khoan cua cong: chua dang nhap thi ve dang nhap kem next tren host
  assert.equal((await t.lay('/tai-khoan/ho-so')).headers.get('location'), '/tai-khoan/dang-nhap?next=%2Ftai-khoan%2Fho-so');
});

test('form cua cong gui ve route /ten-mien: quay_ve hop le ve cong, gia tri la ve /ten-mien/tai-khoan', async () => {
  const t = new TrinhDuyet();
  const k = taoKhach();
  await dangNhapCong(t, k.email);
  const csrf = await t.csrf('/tai-khoan/ho-so');
  const r = await t.gui('/ten-mien/tai-khoan/thong-tin', { _csrf: csrf, full_name: 'Tên Mới', phone: '0909000111', quay_ve: 'ho-so' });
  assert.equal(r.headers.get('location'), '/tai-khoan/ho-so');
  assert.match(await (await t.lay('/tai-khoan/ho-so')).text(), /value="Tên Mới"/);
  for (const la of ['//evil.com', 'constructor', '__proto__', 'dang-xuat']) {
    const x = await t.gui('/ten-mien/tai-khoan/thong-tin', { _csrf: csrf, full_name: 'Tên Mới', phone: '', quay_ve: la });
    assert.equal(x.headers.get('location'), '/ten-mien/tai-khoan', la);
  }
  const mk = await t.gui('/ten-mien/tai-khoan/doi-mat-khau', { _csrf: csrf, current_password: 'sai', password: 'x', password_confirm: 'x', quay_ve: 'bao-mat' });
  assert.equal(mk.headers.get('location'), '/tai-khoan/bao-mat');
  assert.match(await (await t.lay('/tai-khoan/bao-mat')).text(), /Mật khẩu hiện tại không đúng/);
});
