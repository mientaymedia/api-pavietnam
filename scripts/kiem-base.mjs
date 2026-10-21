/**
 * Kiem link thieu tien to khi app chay duoi BASE_PATH (vd /ten-mien).
 *
 *   node scripts/kiem-base.mjs
 *
 * Dung app that tren CSDL tam, che do gia lap P.A (khong goi mang ngoai), tao
 * mot khach va mot quan tri vien, roi bo qua moi trang GET: cac route khong
 * tham so lay tu chinh src/routes, cong moi link noi bo tim thay tren trang.
 * Moi gia tri href/action/src/formaction va header Location bat dau bang '/'
 * phai bat dau bang "<BASE>/" hoac dung bang "<BASE>". Ma thoat 1 neu co sot.
 *
 * Bat ca cong Tai khoan MienTay (CONG_TAI_KHOAN_PATH=/tai-khoan, docs/mtm/
 * tai-khoan-chung): bo them cac trang cua cong, va link noi bo duoc phep
 * thuoc "<BASE>" hoac "<CONG>" (cung mot app, Traefik chuyen ca hai vao).
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = '/ten-mien';
const C = '/tai-khoan';
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'api-pavietnam-base-'));

// Phai dat truoc khi nap bat ky module nao cua app (config doc luc nap).
Object.assign(process.env, {
  NODE_ENV: 'development',
  BASE_PATH: B,
  CONG_TAI_KHOAN_PATH: C,
  APP_URL: `http://127.0.0.1${B}`,
  PAVIETNAM_SANDBOX: '1',
  DATABASE_FILE: path.join(tmpDir, 'app.sqlite'),
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_EMAIL: 'quantri@kiem-base.test',
  ADMIN_PASSWORD: crypto.randomBytes(12).toString('hex'),
  WORKER_DISABLED: '1',
  PAVIETNAM_LOG: '0',
});

// Bang gia + tai khoan quan tri mau: chay seed nhu nguoi van hanh (tien trinh rieng).
const seed = spawnSync(process.execPath, ['--import', 'tsx', 'src/db/seed.ts'], { cwd: root, env: process.env, encoding: 'utf8' });
if (seed.status !== 0) {
  console.error(seed.stdout, seed.stderr);
  process.exit(1);
}

const { register } = await import('tsx/esm/api');
register();
const nap = (p) => import(pathToFileURL(path.join(root, p)).href);

const { db, nowIso, isoIn } = await nap('src/db/index.ts');
const { config } = await nap('src/config.ts');
const { encryptSecret, randomToken } = await nap('src/lib/crypto.ts');
const { createRenewalOrder } = await nap('src/services/orders.ts');
const { createApp } = await nap('src/app.ts');

/* --------------------------------------------------------- du lieu thu */

function taoPhien(userId) {
  const sid = randomToken(24);
  db.prepare(
    `INSERT INTO sessions (sid, user_id, data, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, '', '', ?, ?)`,
  ).run(sid, userId, JSON.stringify({ userId }), isoIn(3600_000), nowIso());
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(sid).digest('base64url');
  return `sid=${sid}.${sig}`;
}

const khachId = Number(
  db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Khach thu', ?, ?)`)
    .run('khach@kiem-base.test', nowIso(), nowIso()).lastInsertRowid,
);
db.prepare(
  `INSERT INTO domains (user_id, domain, tld, status, provider, nameservers, created_at, updated_at)
   VALUES (?, 'kiem-base.vn', 'vn', 'active', 'pavietnam', '[]', ?, ?)`,
).run(khachId, nowIso(), nowIso());
createRenewalOrder({ userId: khachId, contactId: null, domain: 'kiem-base.vn', tld: 'vn', years: 1 });

// Quan tri vien phai bat 2FA moi vao duoc /admin: danh dau da bat san.
const adminId = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL).id;
db.prepare('INSERT INTO two_factor (user_id, secret_enc, confirmed_at) VALUES (?, ?, ?)')
  .run(adminId, encryptSecret('JBSWY3DPEHPK3PXP'), nowIso());

// Bat Tim cung AI bang khoa gia de tab va form AI cung duoc kiem tien to. Khong
// goi OpenAI: kiem-base chi bo trang GET, loi goi AI chi co o POST.
const { setSettings, SECRET_KEYS } = await nap('src/lib/settings.ts');
setSettings({ 'ai.enabled': '1', 'ai.model': 'kiem-base', 'ai.openai_key': 'sk-kiem-base' }, SECRET_KEYS);

/* ------------------------------------------------ route GET khong tham so */

function routeGoc() {
  const app = readFileSync(path.join(root, 'src/app.ts'), 'utf8');
  const gan = new Map(); // ten bien import -> tep
  for (const m of app.matchAll(/import (\w+) from '\.\/routes\/(\w+)\.js'/g)) gan.set(m[1], m[2]);
  const ra = new Set(['/']);
  for (const m of app.matchAll(/site\.use\('([^']+)', (\w+)\)/g)) {
    const tep = gan.get(m[2]);
    if (!tep) continue;
    const src = readFileSync(path.join(root, 'src/routes', `${tep}.ts`), 'utf8');
    for (const r of src.matchAll(/router\.get\(\s*'([^']+)'/g)) {
      if (r[1].includes(':')) continue;
      ra.add(path.posix.join(m[1], r[1]).replace(/(.)\/$/, '$1'));
    }
  }
  return [...ra].filter((p) => !p.startsWith('/api/'));
}

/** Route GET khong tham so cua cong (routes/congTaiKhoan.ts gan o goc cua cong). */
function routeCong() {
  const src = readFileSync(path.join(root, 'src/routes/congTaiKhoan.ts'), 'utf8');
  const ra = new Set(['/']);
  for (const r of src.matchAll(/router\.get\(\s*'([^']+)'/g)) if (!r[1].includes(':')) ra.add(r[1]);
  return [...ra];
}

/* ------------------------------------------------------------------- bo */

const server = createApp().listen(0);
await new Promise((r) => server.once('listening', r));
const goc = `http://127.0.0.1:${server.address().port}`;

const loi = [];
const coTienTo = (v) => [B, C].some((t) => v === t || v.startsWith(`${t}/`) || v.startsWith(`${t}?`));
const laNoiBo = (v) => v.startsWith('/') && !v.startsWith('//');

function kiem(trang, loai, v) {
  if (laNoiBo(v) && !coTienTo(v)) loi.push(`${trang}: ${loai} ${JSON.stringify(v)}`);
}

async function bo(vai, cookie) {
  const daXem = new Set();
  const hang = [...routeGoc().map((p) => B + (p === '/' ? '/' : p)), ...routeCong().map((p) => C + p)];
  let soTrang = 0;
  while (hang.length && soTrang < 400) {
    const url = hang.shift();
    if (daXem.has(url)) continue;
    daXem.add(url);
    // Khong bam link co tac dung phu hoac dua ra ngoai
    if (/\/(dang-xuat|zns\/ket-noi)/.test(url)) continue;
    const r = await fetch(goc + url, { redirect: 'manual', headers: cookie ? { cookie } : {} });
    soTrang++;
    if (process.env.KIEM_BASE_IN) console.log(`[${vai}] ${r.status} ${url}`);
    const loc = r.headers.get('location');
    if (loc) {
      kiem(`[${vai}] ${url}`, 'Location', loc);
      if (laNoiBo(loc) && coTienTo(loc)) hang.push(loc.split('#')[0]);
    }
    if (!(r.headers.get('content-type') ?? '').includes('text/html')) continue;
    const html = await r.text();
    for (const m of html.matchAll(/\s(href|action|src|formaction)="([^"]*)"/g)) {
      const v = m[2].replace(/&amp;/g, '&');
      kiem(`[${vai}] ${url}`, m[1], v);
      if (m[1] === 'href' && laNoiBo(v) && coTienTo(v) && !v.includes('?')) hang.push(v.split('#')[0]);
    }
  }
  return soTrang;
}

const ketQua = {
  khach_vang_lai: await bo('khách vãng lai', ''),
  khach: await bo('khách', taoPhien(khachId)),
  quan_tri: await bo('quản trị', taoPhien(adminId)),
};
server.close();

// JS phia trinh duyet: moi fetch/location phai dung tien to doc tu data-base
const appJs = readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
for (const m of appJs.matchAll(/(fetch\(|location(?:\.href)?\s*=\s*)\s*'\//g)) {
  loi.push(`public/js/app.js: ${m[0]} dùng đường dẫn gốc thiếu tiền tố`);
}

db.close();
rmSync(tmpDir, { recursive: true, force: true });

for (const l of [...new Set(loi)]) console.log(l);
console.log(
  `Đã bò ${ketQua.khach_vang_lai} trang (khách vãng lai), ${ketQua.khach} trang (khách), ` +
    `${ketQua.quan_tri} trang (quản trị) dưới ${B} và ${C}. Link thiếu tiền tố: ${new Set(loi).size}.`,
);
process.exit(loi.length ? 1 : 0);
