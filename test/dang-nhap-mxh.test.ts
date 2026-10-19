/**
 * Dang nhap, dang ky, lien ket bang Zalo, Google, GitHub qua HTTP that (phien,
 * CSRF, gioi han) voi may chu OAuth gia lap cuc bo (test/helpers/oauth-gia.ts).
 * Tinh huong theo docs/mtm/dang-nhap-mxh/spec.md muc 7.
 */
import './helpers/csdl-rieng.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { moOauthGia, type NguoiGia } from './helpers/oauth-gia.js';
import { moApp } from './helpers/http-app.js';

const gia = await moOauthGia();
Object.assign(process.env, {
  OAUTH_MOCK_BASE: gia.goc,
  ZALO_APP_ID: gia.khoa.zalo.id, ZALO_APP_SECRET: gia.khoa.zalo.secret,
  GOOGLE_CLIENT_ID: gia.khoa.google.id, GOOGLE_CLIENT_SECRET: gia.khoa.google.secret,
  GITHUB_CLIENT_ID: gia.khoa.github.id, GITHUB_CLIENT_SECRET: gia.khoa.github.secret,
});

// Ghi lai moi dong log trong luc chay de kiem khong lo ma, token, bi mat
const nhatKy: string[] = [];
for (const k of ['log', 'error', 'warn'] as const) {
  const goc = console[k].bind(console);
  console[k] = (...a: unknown[]) => { nhatKy.push(a.map(String).join(' ')); goc(...a); };
}

const app = await moApp();
const { db, nowIso } = await import('../src/db/index.js');
const { hashPassword } = await import('../src/lib/crypto.js');
const { setSetting } = await import('../src/lib/settings.js');
const { beginSetup, confirmSetup } = await import('../src/services/twoFactor.js');
const { currentCode } = await import('../src/lib/totp.js');
const { lyDoChanDatHang } = await import('../src/services/lienKetMxh.js');
const { issueToken, consumeToken } = await import('../src/services/verification.js');
const { sendMail } = await import('../src/lib/mailer.js');

after(async () => {
  app.dong();
  await gia.dong();
});

type Ben = 'zalo' | 'google' | 'github';
const so = () => String(100000 + Math.floor(Math.random() * 1e9));
const emailMoi = () => `mxh-${crypto.randomBytes(5).toString('hex')}@vi-du.vn`;

/** Mot trinh duyet: giu cookie sid, tu doi khi may chu cap phien moi. */
class TrinhDuyet {
  cookie = '';
  private nhan(r: Response): Response {
    const moi = (r.headers.get('set-cookie') ?? '').split(';')[0];
    if (moi && moi.startsWith('sid=')) this.cookie = moi;
    return r;
  }
  async lay(p: string): Promise<Response> {
    return this.nhan(await app.lay(p, { headers: this.cookie ? { cookie: this.cookie } : {} }));
  }
  async gui(p: string, du: Record<string, string>): Promise<Response> {
    return this.nhan(await app.guiForm(p, { cookie: this.cookie }, du));
  }
  async csrf(p = '/dang-nhap'): Promise<string> {
    const html = await (await this.lay(p)).text();
    return html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? '';
  }
  get sid(): string {
    return decodeURIComponent(this.cookie.slice(4)).split('.')[0] ?? '';
  }
  /** user_id cua phien hien tai (null = chua dang nhap). */
  nguoiDung(): number | null {
    const row = db.prepare('SELECT user_id FROM sessions WHERE sid = ?').get(this.sid) as { user_id: number | null } | undefined;
    return row?.user_id ?? null;
  }
  phien(): Record<string, unknown> {
    const row = db.prepare('SELECT data FROM sessions WHERE sid = ?').get(this.sid) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : {};
  }
  /** Noi dung cac thong bao flash dang cho (doc trang de chung hien ra). */
  async thongBao(p = '/'): Promise<string> {
    return (await (await this.lay(p)).text()).replace(/&#34;/g, '"');
  }
}

async function moTrinhDuyet(): Promise<TrinhDuyet> {
  const t = new TrinhDuyet();
  await t.lay('/dang-nhap');
  return t;
}

/** Bam nut, tra Location tro toi trang xin quyen cua may chu gia. */
async function bamNut(t: TrinhDuyet, ben: Ben, query = ''): Promise<string> {
  const r = await t.lay(`/auth/${ben}${query}`);
  assert.equal(r.status, 302, `bat dau ${ben}`);
  return r.headers.get('location') ?? '';
}

/** Ca luong: bam nut, dong y, quay ve. Tra phan hoi cua callback. */
async function dangNhapMxh(t: TrinhDuyet, ben: Ben, nguoi: NguoiGia, query = ''): Promise<Response> {
  const { callback } = gia.dongY(await bamNut(t, ben, query), nguoi);
  return t.lay(callback);
}

function taoKhachMatKhau(email: string, xacMinh = true): number {
  return Number(db.prepare(
    `INSERT INTO users (email, password_hash, full_name, role, email_verified_at, created_at, updated_at) VALUES (?, ?, 'Có Mật Khẩu', 'customer', ?, ?, ?)`,
  ).run(email, hashPassword('mat-khau-thu-123'), xacMinh ? nowIso() : null, nowIso(), nowIso()).lastInsertRowid);
}

const danhTinh = (ben: Ben, id: string) =>
  db.prepare('SELECT * FROM user_identities WHERE provider = ? AND provider_user_id = ?').get(ben, id) as
    { user_id: number; email: string } | undefined;

/* ---------------------------------------------------------------- nut */

test('nut chi hien ben da cau hinh; la link GET khong JS; CSP khong mo them nguon', async () => {
  const t = await moTrinhDuyet();
  for (const p of ['/dang-nhap', '/dang-ky']) {
    const r = await t.lay(p);
    const html = await r.text();
    for (const ben of ['zalo', 'google', 'github']) assert.match(html, new RegExp(`<a [^>]*href="/auth/${ben}(\\?[^"]*)?"`), `${p} ${ben}`);
    const csp = r.headers.get('content-security-policy') ?? '';
    assert.doesNotMatch(csp, /google|github|zaloapp|graph\.zalo/);
    assert.match(csp, /form-action 'self'/);
  }
  assert.match(await (await t.lay('/dang-nhap')).text(), /Đăng nhập bằng Google/);
  assert.match(await (await t.lay('/dang-ky')).text(), /Đăng ký bằng Google/);

  setSetting('oauth.github_enabled', '0');
  try {
    const html = await (await t.lay('/dang-nhap')).text();
    assert.doesNotMatch(html, /href="\/auth\/github/);
    assert.match(html, /href="\/auth\/google/);
    // Bam thang vao duong dan cung khong mo luong
    const r = await t.lay('/auth/github');
    assert.equal(r.headers.get('location'), '/dang-nhap');
  } finally {
    setSetting('oauth.github_enabled', '1');
  }
  assert.equal((await t.lay('/auth/facebook')).status, 404);
});

/* ------------------------------------------------------------- state, PKCE */

test('PKCE: challenge S256 43 ky tu, verifier trong phien khop; state 32 byte luu trong phien', async () => {
  for (const ben of ['zalo', 'google', 'github'] as const) {
    const t = await moTrinhDuyet();
    const q = new URL(await bamNut(t, ben)).searchParams;
    const o = t.phien()['oauth'] as { state: string; verifier: string; ben: string };
    assert.equal(o.ben, ben);
    assert.equal(q.get('state'), o.state);
    assert.ok(o.state.length >= 43);
    assert.match(q.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/);
    assert.equal(q.get('code_challenge'), crypto.createHash('sha256').update(o.verifier).digest('base64url'));
    if (ben !== 'zalo') assert.equal(q.get('code_challenge_method'), 'S256');
    assert.match(q.get('redirect_uri') ?? '', new RegExp(`/auth/${ben}/callback$`));
  }
});

test('state sai thi tu choi, va o state bi xoa luon (khong thu tiep duoc)', async () => {
  const t = await moTrinhDuyet();
  const { callback, state } = gia.dongY(await bamNut(t, 'google'), { id: so(), ten: 'A', email: emailMoi(), daXacMinh: true });
  const r = await t.lay(callback.replace(state, 'state-gia-mao'));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/dang-nhap');
  assert.equal(t.nguoiDung(), null);
  assert.match(await t.thongBao(), /đã hết hạn hoặc không hợp lệ/);
  // State dung nhung o da bi xoa o lan truoc
  const r2 = await t.lay(callback);
  assert.equal(r2.headers.get('location'), '/dang-nhap');
  assert.equal(t.nguoiDung(), null);
});

test('state het han sau 10 phut', async () => {
  const t = await moTrinhDuyet();
  const { callback } = gia.dongY(await bamNut(t, 'github'), { id: so(), ten: 'A' });
  const p = t.phien();
  (p['oauth'] as { at: number }).at = Date.now() - 10 * 60_000 - 1000;
  db.prepare('UPDATE sessions SET data = ? WHERE sid = ?').run(JSON.stringify(p), t.sid);
  const r = await t.lay(callback);
  assert.equal(r.headers.get('location'), '/dang-nhap');
  assert.equal(t.nguoiDung(), null);
});

test('state cua ben nay khong dung cho ben khac; khong co phien thi tu choi', async () => {
  const t = await moTrinhDuyet();
  const { code, state } = gia.dongY(await bamNut(t, 'google'), { id: so(), ten: 'A' });
  const r = await t.lay(`/auth/github/callback?code=${code}&state=${state}`);
  assert.equal(r.headers.get('location'), '/dang-nhap');
  const la = await moTrinhDuyet();
  assert.equal((await la.lay(`/auth/google/callback?code=${code}&state=${state}`)).headers.get('location'), '/dang-nhap');
  assert.equal(la.nguoiDung(), null);
});

test('khach huy quyen: thong bao than thien, khong tao tai khoan', async () => {
  const t = await moTrinhDuyet();
  const loc = await bamNut(t, 'google');
  const state = new URL(loc).searchParams.get('state')!;
  const truoc = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const r = await t.lay(`/auth/google/callback?error=access_denied&state=${state}`);
  assert.equal(r.headers.get('location'), '/dang-nhap');
  assert.match(await t.thongBao(), /Bạn đã hủy đăng nhập bằng Google/);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n, truoc);
});

test('ben kia tu choi doi ma (vd verifier sai): bao loi chung, khong dang nhap', async () => {
  const t = await moTrinhDuyet();
  const { callback } = gia.dongY(await bamNut(t, 'zalo'), { id: so(), ten: 'Z' });
  const p = t.phien();
  (p['oauth'] as { verifier: string }).verifier = crypto.randomBytes(32).toString('base64url');
  db.prepare('UPDATE sessions SET data = ? WHERE sid = ?').run(JSON.stringify(p), t.sid);
  const r = await t.lay(callback);
  assert.equal(r.headers.get('location'), '/dang-nhap');
  assert.equal(t.nguoiDung(), null);
  assert.match(await t.thongBao(), /Chưa đăng nhập được bằng Zalo/);
});

/* ---------------------------------------------------------- dang ky moi */

test('Google lan dau: tao tai khoan voi email da xac minh, phien moi, next noi bo duoc giu', async () => {
  const t = await moTrinhDuyet();
  const sidKhach = t.sid;
  const email = emailMoi();
  const id = so();
  const r = await dangNhapMxh(t, 'google', { id, ten: 'Trần Thị Google', email, daXacMinh: true }, '?next=%2Fgio-hang');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/gio-hang');

  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown>;
  assert.ok(u, 'tao tai khoan');
  assert.equal(u['password_hash'], '');
  assert.ok(u['email_verified_at']);
  assert.equal(u['full_name'], 'Trần Thị Google');
  assert.equal(danhTinh('google', id)?.user_id, u['id']);
  // Chong co dinh phien: sid moi, sid khach cu bi xoa
  assert.notEqual(t.sid, sidKhach);
  assert.equal(db.prepare('SELECT 1 FROM sessions WHERE sid = ?').get(sidKhach), undefined);
  assert.equal(t.nguoiDung(), u['id']);
  assert.equal(t.phien()['oauth'], undefined);
  assert.equal(lyDoChanDatHang(Number(u['id'])), null);

  // Lan sau vao lai dung tai khoan do
  const t2 = await moTrinhDuyet();
  await dangNhapMxh(t2, 'google', { id, ten: 'Trần Thị Google', email, daXacMinh: true });
  assert.equal(t2.nguoiDung(), u['id']);
});

test('next doc hai bi bo, ve /dashboard', async () => {
  for (const next of ['//evil.com', 'https://evil.com', '/.//evil.com', '/\\evil.com']) {
    const t = await moTrinhDuyet();
    const r = await dangNhapMxh(t, 'github', { id: so(), ten: 'N' }, `?next=${encodeURIComponent(next)}`);
    const loc = r.headers.get('location') ?? '';
    // Zalo, GitHub khong email thi sang bo sung email; con lai /dashboard. Khong bao gio ra ngoai
    assert.ok(loc === '/dashboard' || loc === '/tai-khoan/email', `${next} -> ${loc}`);
  }
  const t = await moTrinhDuyet();
  const r = await dangNhapMxh(t, 'google', { id: so(), ten: 'N', email: emailMoi(), daXacMinh: true }, `?next=${encodeURIComponent('//evil.com')}`);
  assert.equal(r.headers.get('location'), '/dashboard');
});

test('Google email chua xac minh thi khong dung email do: tai khoan email tam, phai bo sung', async () => {
  const t = await moTrinhDuyet();
  const email = emailMoi();
  const r = await dangNhapMxh(t, 'google', { id: so(), ten: 'Chưa XM', email, daXacMinh: false });
  assert.equal(r.headers.get('location'), '/tai-khoan/email');
  assert.equal(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email), undefined);
});

/* --------------------------------------------------------------- Zalo */

test('Zalo khong co email: email tam, bat bo sung email, chan dat hang toi khi xac thuc', async () => {
  const t = await moTrinhDuyet();
  const r = await dangNhapMxh(t, 'zalo', { id: so(), ten: 'Khách Zalo' });
  assert.equal(r.headers.get('location'), '/tai-khoan/email');
  const userId = t.nguoiDung()!;
  assert.ok(userId);
  const u = db.prepare('SELECT email, email_verified_at FROM users WHERE id = ?').get(userId) as { email: string; email_verified_at: string | null };
  assert.match(u.email, /@chua-co-email\.invalid$/);
  assert.equal(u.email_verified_at, null);

  // Trang khach khong in email tam; dai nhac tro sang bo sung email
  const html = await t.thongBao('/tai-khoan');
  assert.doesNotMatch(html, /chua-co-email/);
  assert.match(html, /\/tai-khoan\/email/);
  assert.match(html, /Zalo không cung cấp email/);

  // Khong gui thu toi email tam
  assert.equal(await sendMail({ to: u.email, subject: 'thu', html: 'x', userId }), false);
  assert.equal(
    (db.prepare("SELECT status FROM email_logs WHERE to_email = ? ORDER BY id DESC").get(u.email) as { status: string }).status,
    'skipped',
  );

  // Dat hang that qua HTTP: bi chuyen sang bo sung email, khong tao don
  db.prepare(`INSERT INTO cart_items (cart_key, user_id, action, domain, tld, years, unit_price, amount, created_at)
              VALUES (?, ?, 'register', ?, 'vn', 1, 450000, 450000, ?)`).run(`user:${userId}`, userId, `zalo-${userId}.vn`, nowIso());
  const csrf = await t.csrf('/tai-khoan');
  const dat = await t.gui('/thanh-toan', { _csrf: csrf });
  assert.equal(dat.headers.get('location'), '/tai-khoan/email');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(userId) as { n: number }).n, 0);

  // Bo sung email da co nguoi dung: tu choi
  const daCo = emailMoi();
  taoKhachMatKhau(daCo);
  const trung = await t.gui('/tai-khoan/email', { _csrf: csrf, email: daCo });
  assert.equal(trung.status, 422);
  assert.match(await trung.text(), /Email này đã có tài khoản/);
  // Email tam cung khong nhan
  assert.equal((await t.gui('/tai-khoan/email', { _csrf: csrf, email: 'a@chua-co-email.invalid' })).status, 422);

  const email = emailMoi();
  const ok = await t.gui('/tai-khoan/email', { _csrf: csrf, email });
  assert.equal(ok.headers.get('location'), '/tai-khoan');
  assert.equal((db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string }).email, email);
  // Co email roi nhung chua xac thuc: van chan (tai khoan khong mat khau)
  assert.equal(lyDoChanDatHang(userId), 'chua_xac_thuc');
  const dat2 = await t.gui('/thanh-toan', { _csrf: csrf });
  assert.equal(dat2.headers.get('location'), '/thanh-toan');

  assert.equal(consumeToken(issueToken({ id: userId, email })).status, 'ok');
  assert.equal(lyDoChanDatHang(userId), null);
  // Da xac thuc thi trang bo sung email dong lai
  assert.equal((await t.lay('/tai-khoan/email')).headers.get('location'), '/tai-khoan');
});

test('dang ky bang tay voi duoi email tam bi tu choi', async () => {
  const t = await moTrinhDuyet();
  const csrf = await t.csrf('/dang-ky');
  const r = await t.gui('/dang-ky', {
    _csrf: csrf, full_name: 'Ke Gian', email: 'abc@chua-co-email.invalid', phone: '0901234567',
    password: 'mat-khau-dai-123', password_confirm: 'mat-khau-dai-123',
  });
  assert.equal(r.status, 422);
});

/* -------------------------------------------------------- ghep tai khoan */

test('email trung tai khoan co mat khau: KHONG tu gop; dang nhap mat khau mot lan thi tu lien ket', async () => {
  const email = emailMoi();
  const userId = taoKhachMatKhau(email);
  const id = so();
  const t = await moTrinhDuyet();
  const r = await dangNhapMxh(t, 'google', { id, ten: 'Ke Gian Hay Chu', email: email.toUpperCase(), daXacMinh: true }, '?next=%2Fdon-hang');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/dang-nhap?next=%2Fdon-hang');
  assert.equal(t.nguoiDung(), null, 'khong duoc vao tai khoan co mat khau');
  assert.equal(danhTinh('google', id), undefined);
  assert.match(await t.thongBao('/dang-nhap'), /đăng nhập bằng mật khẩu một lần/);

  const csrf = await t.csrf();
  const dn = await t.gui('/dang-nhap', { _csrf: csrf, email, password: 'mat-khau-thu-123', next: '/don-hang' });
  assert.equal(dn.headers.get('location'), '/don-hang');
  assert.equal(t.nguoiDung(), userId);
  assert.equal(danhTinh('google', id)?.user_id, userId);
  assert.match(await t.thongBao('/tai-khoan'), /Đã liên kết Google/);

  // Tu nay Google vao thang tai khoan do
  const t2 = await moTrinhDuyet();
  await dangNhapMxh(t2, 'google', { id, ten: 'X', email, daXacMinh: true });
  assert.equal(t2.nguoiDung(), userId);
});

test('danh tinh cho khong gan nham vao tai khoan khac dang nhap tren cung may', async () => {
  const emailA = emailMoi();
  taoKhachMatKhau(emailA);
  const emailB = emailMoi();
  const userB = taoKhachMatKhau(emailB);
  const id = so();
  const t = await moTrinhDuyet();
  await dangNhapMxh(t, 'github', { id, ten: 'A', email: emailA, daXacMinh: true });
  const csrf = await t.csrf();
  await t.gui('/dang-nhap', { _csrf: csrf, email: emailB, password: 'mat-khau-thu-123' });
  assert.equal(t.nguoiDung(), userB);
  assert.equal(danhTinh('github', id), undefined);
});

test('email trung tai khoan co 2FA hoac email ben minh chua xac minh: khong tu gop', async () => {
  // Tai khoan MXH khong mat khau nhung bat 2FA
  const t = await moTrinhDuyet();
  const email = emailMoi();
  await dangNhapMxh(t, 'google', { id: so(), ten: 'Có 2FA', email, daXacMinh: true });
  const userId = t.nguoiDung()!;
  const { secret } = beginSetup(userId, email);
  assert.equal(confirmSetup(userId, currentCode(secret)).ok, true);
  const t2 = await moTrinhDuyet();
  const gh = so();
  const r = await dangNhapMxh(t2, 'github', { id: gh, ten: 'X', email, daXacMinh: true });
  assert.match(r.headers.get('location') ?? '', /^\/dang-nhap\?next=/);
  assert.equal(danhTinh('github', gh), undefined);

  // Tai khoan co mat khau, email chua xac minh (co the la nguoi khac chiem email)
  const e2 = emailMoi();
  taoKhachMatKhau(e2, false);
  const t3 = await moTrinhDuyet();
  const g2 = so();
  await dangNhapMxh(t3, 'google', { id: g2, ten: 'Chu That', email: e2, daXacMinh: true });
  assert.equal(t3.nguoiDung(), null);
  assert.equal(danhTinh('google', g2), undefined);
});

test('email trung tai khoan KHONG mat khau, khong 2FA, da xac minh: gop va dang nhap', async () => {
  const email = emailMoi();
  const t = await moTrinhDuyet();
  await dangNhapMxh(t, 'google', { id: so(), ten: 'G', email, daXacMinh: true });
  const userId = t.nguoiDung()!;
  const gh = so();
  const t2 = await moTrinhDuyet();
  await dangNhapMxh(t2, 'github', { id: gh, ten: 'G', email, daXacMinh: true });
  assert.equal(t2.nguoiDung(), userId);
  assert.equal(danhTinh('github', gh)?.user_id, userId);
});

test('tai khoan bi tam khoa khong dang nhap duoc bang mang xa hoi', async () => {
  const t = await moTrinhDuyet();
  const id = so();
  await dangNhapMxh(t, 'github', { id, ten: 'K' });
  const userId = t.nguoiDung()!;
  db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(userId);
  const t2 = await moTrinhDuyet();
  const r = await dangNhapMxh(t2, 'github', { id, ten: 'K' });
  assert.equal(r.headers.get('location'), '/dang-nhap');
  assert.equal(t2.nguoiDung(), null);
  assert.match(await t2.thongBao(), /tạm khóa/);
});

/* --------------------------------------------------------------- 2FA */

test('tai khoan co 2FA: sau mang xa hoi van phai nhap ma TOTP', async () => {
  const email = emailMoi();
  const id = so();
  const t = await moTrinhDuyet();
  await dangNhapMxh(t, 'google', { id, ten: 'Hai Lớp', email, daXacMinh: true });
  const userId = t.nguoiDung()!;
  const { secret } = beginSetup(userId, email);
  assert.equal(confirmSetup(userId, currentCode(secret)).ok, true);

  const t2 = await moTrinhDuyet();
  const r = await dangNhapMxh(t2, 'google', { id, ten: 'Hai Lớp', email, daXacMinh: true }, '?next=%2Fdon-hang');
  assert.equal(r.headers.get('location'), '/dang-nhap/hai-lop');
  assert.equal(t2.nguoiDung(), null, 'chua nhap ma thi chua co phien');
  assert.equal((await t2.lay('/tai-khoan')).status, 302);

  const csrf = await t2.csrf('/dang-nhap/hai-lop');
  const sai = await t2.gui('/dang-nhap/hai-lop', { _csrf: csrf, code: '000000' });
  assert.equal(sai.status, 401);
  // Ma cua chu ky ke tiep: chu ky hien tai da dung luc bat 2FA (chong phat lai)
  const { codeForCounter } = await import('../src/lib/totp.js');
  const ma = codeForCounter(secret, Math.floor(Date.now() / 30_000) + 1);
  const dung = await t2.gui('/dang-nhap/hai-lop', { _csrf: csrf, code: ma });
  assert.equal(dung.headers.get('location'), '/don-hang');
  assert.equal(t2.nguoiDung(), userId);
});

/* ------------------------------------------------------ lien ket, huy */

test('lien ket them can _csrf cua phien; danh tinh cua nguoi khac bi tu choi', async () => {
  const khach = await app.khach();
  const t = new TrinhDuyet();
  t.cookie = khach.cookie;
  // Thieu hoac sai token: 403, khong mo luong
  assert.equal((await t.lay('/auth/github?lien_ket=1')).status, 403);
  assert.equal((await t.lay('/auth/github?lien_ket=1&_csrf=sai')).status, 403);
  assert.equal(t.phien()['oauth'], undefined);

  const csrf = await t.csrf('/tai-khoan');
  const gh = so();
  const r = await dangNhapMxh(t, 'github', { id: gh, ten: 'Dev' }, `?lien_ket=1&_csrf=${encodeURIComponent(csrf)}`);
  assert.equal(r.headers.get('location'), '/tai-khoan');
  assert.equal(danhTinh('github', gh)?.user_id, khach.userId);
  const html = await t.thongBao('/tai-khoan');
  assert.match(html, /Đã liên kết GitHub/);
  assert.match(html, /\/tai-khoan\/lien-ket\/github\/huy/);

  // Nguoi thu hai lien ket cung GitHub id: tu choi
  const k2 = await app.khach();
  const t2 = new TrinhDuyet();
  t2.cookie = k2.cookie;
  const csrf2 = await t2.csrf('/tai-khoan');
  await dangNhapMxh(t2, 'github', { id: gh, ten: 'Dev' }, `?lien_ket=1&_csrf=${encodeURIComponent(csrf2)}`);
  assert.equal(danhTinh('github', gh)?.user_id, khach.userId);
  assert.match(await t2.thongBao('/tai-khoan'), /đã liên kết với một tài khoản khác/);

  // Huy lien ket (co mat khau nen huy duoc ca cai cuoi)
  const huy = await t.gui('/tai-khoan/lien-ket/github/huy', { _csrf: csrf });
  assert.equal(huy.headers.get('location'), '/tai-khoan');
  assert.equal(danhTinh('github', gh), undefined);
});

test('khong cho huy lien ket cuoi cung khi chua dat mat khau; dat mat khau roi thi huy duoc', async () => {
  const t = await moTrinhDuyet();
  const id = so();
  await dangNhapMxh(t, 'zalo', { id, ten: 'Chỉ Zalo' });
  const userId = t.nguoiDung()!;
  const csrf = await t.csrf('/tai-khoan');
  assert.match(await (await t.lay('/tai-khoan')).text(), /\/tai-khoan\/dat-mat-khau/);

  await t.gui('/tai-khoan/lien-ket/zalo/huy', { _csrf: csrf });
  assert.equal(danhTinh('zalo', id)?.user_id, userId, 'van con lien ket');
  assert.match(await t.thongBao('/tai-khoan'), /Hãy đặt mật khẩu trước khi hủy liên kết Zalo/);

  // Sai CSRF khong dat duoc mat khau
  assert.equal((await t.gui('/tai-khoan/dat-mat-khau', { _csrf: 'sai', password: 'mat-khau-moi-123', password_confirm: 'mat-khau-moi-123' })).status, 403);
  await t.gui('/tai-khoan/dat-mat-khau', { _csrf: csrf, password: 'mat-khau-moi-123', password_confirm: 'mat-khau-moi-123' });
  assert.notEqual((db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string }).password_hash, '');
  // Dat lan hai khong ghi de (phai dung Doi mat khau)
  const hashCu = (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string }).password_hash;
  await t.gui('/tai-khoan/dat-mat-khau', { _csrf: csrf, password: 'mat-khau-khac-456', password_confirm: 'mat-khau-khac-456' });
  assert.equal((db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string }).password_hash, hashCu);

  await t.gui('/tai-khoan/lien-ket/zalo/huy', { _csrf: csrf });
  assert.equal(danhTinh('zalo', id), undefined);
});

/* ------------------------------------------------------- quan tri, log */

test('Cau hinh in redirect URI cua ca ba ben va che bi mat', async () => {
  const qt = await app.quanTri();
  const html = await (await app.lay('/admin/cau-hinh', { headers: { cookie: qt.cookie } })).text();
  for (const ben of ['zalo', 'google', 'github']) assert.match(html, new RegExp(`/auth/${ben}/callback`));
  assert.match(html, /name="oauth\.google_client_secret"/);
  for (const s of Object.values(gia.khoa)) assert.ok(!html.includes(s.secret), 'bi mat khong hien ra trinh duyet');
});

test('log khong chua ma xac thuc, token, verifier hay bi mat', () => {
  assert.ok(gia.yeuCau.length > 10, 'cac test tren da goi may chu gia');
  const chu = nhatKy.join('\n');
  assert.ok(chu.includes('oauth_state_invalid'), 'co ghi log su kien');
  assert.doesNotMatch(chu, /tok_[0-9a-f]{6}/);
  assert.doesNotMatch(chu, /ma_[0-9a-f]{6}/);
  for (const s of Object.values(gia.khoa)) assert.ok(!chu.includes(s.secret));
  for (const y of gia.yeuCau) if (y.form['code_verifier']) assert.ok(!chu.includes(y.form['code_verifier']));
});
