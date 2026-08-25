/**
 * KIEM TRA TRUOC KHI MO BAN.
 *
 *   npm run kiem-tra
 *
 * Chay tren CHINH may chu se phuc vu khach. Cong cu di qua tung dieu kien can
 * de he thong hoat dong that va noi ro cho nao con thieu, thieu cai gi, sua o
 * dau. Khong sua gi ca - chi doc va bao cao.
 *
 * Ket qua:
 *   CHAN  - chua chay that duoc, phai sua
 *   LUU Y - chay duoc nhung nen sua
 *   DAT   - da on
 *
 * Ma thoat khac 0 neu con muc CHAN, de dung duoc trong kich ban trien khai.
 */
import { config } from './config.js';
import { db, migrate } from './db/index.js';
import { settings } from './lib/settings.js';
import { verifyPassword, maskSecret } from './lib/crypto.js';
import { listTlds } from './services/pricing.js';
import { isEnabled as twoFactorEnabled, requires2FA } from './services/twoFactor.js';
import { ACTIONS } from './pavietnam/actions.js';

type Muc = 'DAT' | 'LUU Y' | 'CHAN';

interface KetQua {
  nhom: string;
  ten: string;
  muc: Muc;
  chiTiet: string;
  cachSua?: string;
}

const ketQua: KetQua[] = [];
function ghi(nhom: string, ten: string, muc: Muc, chiTiet: string, cachSua?: string): void {
  ketQua.push({ nhom, ten, muc, chiTiet, ...(cachSua ? { cachSua } : {}) });
}

/* ------------------------------------------------------------------- 1. Nen tang */

function kiemTraNenTang(): void {
  const nhom = '1. Nen tang';

  if (config.isProd) ghi(nhom, 'Che do chay', 'DAT', 'NODE_ENV=production');
  else ghi(nhom, 'Che do chay', 'CHAN', `NODE_ENV=${config.env}`,
    'Dat NODE_ENV=production trong .env. Che do dev tat HSTS va sinh khoa phien tam thoi.');

  // Khoa phien / khoa ma hoa: config.ts da nem loi neu thieu o production,
  // nen den duoc day nghia la co. Nhung van phai chac chan khong dung mau .env.example
  const mau = ['thay_bang_chuoi_ngau_nhien_64_ky_tu', 'doi_mat_khau_nay_ngay'];
  for (const [ten, giaTri] of [['SESSION_SECRET', config.sessionSecret], ['ENCRYPTION_KEY', config.encryptionKey]] as [string, string][]) {
    if (mau.includes(giaTri)) {
      ghi(nhom, ten, 'CHAN', 'Van con la gia tri mau trong .env.example',
        'Sinh khoa that: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    } else if (giaTri.length < 32) {
      ghi(nhom, ten, 'LUU Y', `Chi dai ${giaTri.length} ky tu`, 'Nen dung 64 ky tu ngau nhien.');
    } else {
      ghi(nhom, ten, 'DAT', `${giaTri.length} ky tu`);
    }
  }

  if (config.appUrl.startsWith('https://')) ghi(nhom, 'APP_URL', 'DAT', config.appUrl);
  else ghi(nhom, 'APP_URL', 'CHAN', config.appUrl,
    'Phai la dia chi https that. Duong dan nay di vao email, ma QR va webhook - sai la khach bam vao khong toi noi.');

  if (config.trustProxy) ghi(nhom, 'TRUST_PROXY', 'DAT', 'Bat - doc dung IP that sau nginx');
  else ghi(nhom, 'TRUST_PROXY', 'LUU Y', 'Tat',
    'Neu chay sau nginx/Cloudflare thi dat TRUST_PROXY=1, neu khong moi khach deu chung mot IP va gioi han tan suat se chan nham.');

  // Cookie phien chi duoc gui qua HTTPS khi isProd - nhac lai cho ro
  ghi(nhom, 'HTTPS', config.isProd && config.appUrl.startsWith('https://') ? 'DAT' : 'LUU Y',
    config.isProd ? 'Cookie phien se duoc danh dau Secure' : 'Cookie phien CHUA duoc danh dau Secure',
    config.isProd ? undefined : 'Chi bat khi NODE_ENV=production.');
}

/* --------------------------------------------------------------------- 2. CSDL */

function kiemTraCsdl(): void {
  const nhom = '2. Co so du lieu';
  try {
    migrate();
    const bangs = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);
    const canCo = ['users', 'orders', 'order_items', 'domains', 'payments', 'jobs', 'settings', 'two_factor'];
    const thieu = canCo.filter((b) => !bangs.includes(b));
    if (thieu.length) ghi(nhom, 'Bang du lieu', 'CHAN', `Thieu bang: ${thieu.join(', ')}`, 'Chay: npm run migrate');
    else ghi(nhom, 'Bang du lieu', 'DAT', `${bangs.length} bang, day du`);

    const wal = db.pragma('journal_mode', { simple: true });
    ghi(nhom, 'Che do ghi', wal === 'wal' ? 'DAT' : 'LUU Y', `journal_mode=${String(wal)}`,
      wal === 'wal' ? undefined : 'WAL cho phep doc va ghi cung luc; khong co WAL thi web se cho worker.');

    ghi(nhom, 'Tep CSDL', 'DAT', config.databaseFile);
  } catch (err) {
    ghi(nhom, 'Ket noi', 'CHAN', String(err), 'Kiem tra quyen ghi thu muc chua tep CSDL.');
  }
}

/* ------------------------------------------------------------- 3. API P.A Viet Nam */

async function kiemTraPa(): Promise<void> {
  const nhom = '3. API dai ly P.A Viet Nam';
  const pa = settings.pa();

  if (!pa.username || !pa.apikey) {
    ghi(nhom, 'Thong tin dang nhap', 'CHAN', 'Chua dat username hoac API key',
      'Dat PAVIETNAM_USERNAME / PAVIETNAM_APIKEY trong .env, hoac nhap o Quan tri > Cau hinh.');
    return;
  }
  ghi(nhom, 'Thong tin dang nhap', 'DAT', `${pa.username} / ${maskSecret(pa.apikey)}`);

  if (pa.sandbox) {
    ghi(nhom, 'Che do sandbox', 'CHAN', 'Dang BAT - khong goi mang that, moi ten mien deu bao con trong',
      'Dat PAVIETNAM_SANDBOX=0 truoc khi mo ban that.');
  } else {
    ghi(nhom, 'Che do sandbox', 'DAT', 'Tat - goi API that');
  }

  // Bao IP dang di ra ngoai, de doi chieu voi danh sach whitelist ben P.A
  let ipRaNgoai = '';
  try {
    const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) });
    if (r.ok) ipRaNgoai = (await r.text()).trim();
  } catch { /* khong lay duoc thi thoi */ }
  if (ipRaNgoai) {
    ghi(nhom, 'IP di ra ngoai', 'LUU Y', ipRaNgoai,
      `Dia chi nay PHAI nam trong danh sach IP duoc phep ben P.A. Neu chua, vao trang dai ly P.A them ${ipRaNgoai} roi thu lai.`);
  }

  // Goi thu mot action CHI DOC. Khong bao gio goi register/renew o day.
  try {
    const { getBalance } = await import('./pavietnam/client.js');
    const kq = await getBalance();
    if (kq.ok) {
      ghi(nhom, `Goi thu action "${ACTIONS.balance}"`, 'DAT', `Phan hoi hop le, so du: ${kq.balance}`);
    } else {
      ghi(nhom, `Goi thu action "${ACTIONS.balance}"`, 'CHAN',
        `Khong thanh cong: ${String(kq.message ?? '').slice(0, 160) || '(phan hoi rong)'}`,
        'Hai nguyen nhan thuong gap: (a) IP may chu chua duoc P.A cho phep; (b) ten action chua dung. ' +
        'Chay `npm run pa:probe -- --domain tenmien-cua-ban.com` de xac dinh ten action that, roi dat lai PA_ACTION_* trong .env.');
    }
  } catch (err) {
    ghi(nhom, 'Goi thu API', 'CHAN', String(err).slice(0, 200),
      'Kiem tra ket noi mang tu may chu toi daily.pavietnam.vn (tuong lua, DNS).');
  }
}

/* ---------------------------------------------------------------- 4. Bang gia */

function kiemTraBangGia(): void {
  const nhom = '4. Bang gia';
  const tlds = listTlds({ activeOnly: true });

  if (!tlds.length) {
    ghi(nhom, 'Duoi ten mien', 'CHAN', 'Chua co duoi nao dang ban', 'Chay `npm run seed` roi sua gia that o Quan tri > Bang gia.');
    return;
  }
  ghi(nhom, 'Duoi ten mien', 'DAT', `${tlds.length} duoi dang ban`);

  const khongGia = tlds.filter((t) => !t.price_register || t.price_register <= 0);
  if (khongGia.length) {
    ghi(nhom, 'Gia ban', 'CHAN', `${khongGia.length} duoi chua co gia: ${khongGia.slice(0, 8).map((t) => `.${t.tld}`).join(', ')}`,
      'Vao Quan tri > Bang gia dat gia cho tung duoi.');
  } else {
    ghi(nhom, 'Gia ban', 'DAT', 'Moi duoi dang ban deu co gia dang ky');
  }

  const khongGiaVon = tlds.filter((t) => !t.cost_register || t.cost_register <= 0);
  if (khongGiaVon.length) {
    ghi(nhom, 'Gia von', 'LUU Y', `${khongGiaVon.length} duoi chua nhap gia von`,
      'Khong nhap gia von thi bao cao lai/lo se khong dung. Quan tri > Bang gia.');
  } else {
    ghi(nhom, 'Gia von', 'DAT', 'Da co gia von cho moi duoi');
  }
}

/* ------------------------------------------------------------- 5. Thanh toan */

function kiemTraThanhToan(): void {
  const nhom = '5. Thanh toan';
  const s = settings.sepay();

  if (!s.enabled) {
    ghi(nhom, 'SePay', 'LUU Y', 'Dang tat', 'Neu khong bat cong nao thi khach khong tu thanh toan duoc.');
  } else if (!s.accountNumber || !s.bankCode) {
    ghi(nhom, 'SePay', 'CHAN', 'Bat nhung thieu so tai khoan hoac ma ngan hang',
      'Dat SEPAY_ACCOUNT_NUMBER va SEPAY_BANK_CODE, hoac nhap o Quan tri > Cau hinh.');
  } else {
    ghi(nhom, 'SePay', 'DAT', `${s.bankName || s.bankCode} - ${s.accountNumber} (${s.accountName || 'chua dat ten chu tk'})`);
  }

  if (s.enabled && !s.webhookToken) {
    ghi(nhom, 'Token webhook SePay', 'CHAN', 'Chua dat',
      `Khong co token thi he thong tu choi moi bao co -> tien vao ma don khong tu mo. ` +
      `Vao my.sepay.vn > Webhooks, tao webhook toi ${config.appUrl}/webhooks/sepay voi header ` +
      `"Authorization: Apikey <token>", roi dat cung token do vao SEPAY_WEBHOOK_TOKEN.`);
  } else if (s.enabled) {
    ghi(nhom, 'Token webhook SePay', 'DAT', maskSecret(s.webhookToken));
    ghi(nhom, 'Dia chi webhook', 'LUU Y', `${config.appUrl}/webhooks/sepay`,
      'Dia chi nay phai duoc khai bao ben my.sepay.vn va phai truy cap duoc tu Internet.');
  }

  const congKhac = [
    ['MoMo', settings.momo().enabled, Boolean(settings.momo().partnerCode && settings.momo().secretKey)],
    ['ZaloPay', settings.zalopay().enabled, Boolean(settings.zalopay().appId && settings.zalopay().key1)],
  ] as [string, boolean, boolean][];
  for (const [ten, bat, duCauHinh] of congKhac) {
    if (!bat) continue;
    ghi(nhom, ten, duCauHinh ? 'DAT' : 'CHAN', duCauHinh ? 'Da cau hinh' : 'Bat nhung thieu khoa',
      duCauHinh ? undefined : `Dien day du khoa cua ${ten} hoac tat di.`);
  }
}

/* ------------------------------------------------------------------ 6. Email */

async function kiemTraEmail(): Promise<void> {
  const nhom = '6. Email';
  const s = settings.smtp();

  if (!s.host) {
    ghi(nhom, 'SMTP', 'CHAN', 'Chua cau hinh',
      'Khong co email thi khach khong nhan duoc thong tin quan tri ten mien, khong xac thuc duoc dia chi, khong nhac gia han duoc. ' +
      'Dat SMTP_HOST/PORT/USER/PASS trong .env hoac o Quan tri > Cau hinh.');
    return;
  }
  if (!s.port) {
    ghi(nhom, 'Cong SMTP', 'CHAN', 'Cong = 0', 'Dat SMTP_PORT (465 cho SSL, 587 cho STARTTLS).');
    return;
  }

  ghi(nhom, 'Cau hinh SMTP', 'DAT', `${s.host}:${s.port} ${s.secure ? '(SSL)' : '(STARTTLS)'} user=${s.user || '(khong xac thuc)'}`);

  if (!s.from) {
    ghi(nhom, 'Dia chi gui di', 'LUU Y', 'Chua dat', 'Dat MAIL_FROM - nhieu nha cung cap tu choi thu khong co dia chi gui.');
  } else {
    ghi(nhom, 'Dia chi gui di', 'DAT', s.from);
  }

  // Thu ket noi that toi may chu thu
  try {
    const nodemailer = (await import('nodemailer')).default;
    const tp = nodemailer.createTransport({
      host: s.host, port: s.port, secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      connectionTimeout: 10_000, greetingTimeout: 10_000,
    });
    await tp.verify();
    ghi(nhom, 'Ket noi thu', 'DAT', 'Dang nhap may chu thu thanh cong');
  } catch (err) {
    ghi(nhom, 'Ket noi thu', 'CHAN', String(err instanceof Error ? err.message : err).slice(0, 180),
      'Kiem tra lai host/cong/tai khoan. Voi Gmail phai dung "mat khau ung dung", khong phai mat khau tai khoan.');
  }
}

/* ----------------------------------------------------------------- 7. Quan tri */

function kiemTraQuanTri(): void {
  const nhom = '7. Tai khoan quan tri';
  const admins = db.prepare(`SELECT id, email, password_hash, role FROM users WHERE role IN ('admin','staff')`)
    .all() as { id: number; email: string; password_hash: string; role: string }[];

  if (!admins.length) {
    ghi(nhom, 'Tai khoan', 'CHAN', 'Chua co tai khoan quan tri nao', 'Chay: npm run seed');
    return;
  }
  ghi(nhom, 'Tai khoan', 'DAT', `${admins.length} tai khoan: ${admins.map((a) => a.email).join(', ')}`);

  // Mat khau con la mau trong .env.example?
  const matKhauMau = ['doi_mat_khau_nay_ngay', 'admin', '123456', 'password'];
  const yeu = admins.filter((a) => matKhauMau.some((mk) => verifyPassword(mk, a.password_hash)));
  if (yeu.length) {
    ghi(nhom, 'Mat khau', 'CHAN', `${yeu.length} tai khoan dung mat khau de doan: ${yeu.map((a) => a.email).join(', ')}`,
      'Dang nhap va doi ngay o Tai khoan > Doi mat khau.');
  } else {
    ghi(nhom, 'Mat khau', 'DAT', 'Khong tai khoan nao dung mat khau mau');
  }

  if (requires2FA('admin')) {
    const chuaBat = admins.filter((a) => !twoFactorEnabled(a.id));
    if (chuaBat.length) {
      ghi(nhom, 'Xac thuc hai lop', 'LUU Y', `${chuaBat.length} tai khoan chua bat: ${chuaBat.map((a) => a.email).join(', ')}`,
        'He thong se tu chan cac tai khoan nay khoi /admin cho toi khi bat. Vao Tai khoan > Bao mat.');
    } else {
      ghi(nhom, 'Xac thuc hai lop', 'DAT', 'Moi tai khoan quan tri deu da bat');
    }
  } else {
    ghi(nhom, 'Xac thuc hai lop', 'LUU Y', 'Da tat yeu cau bat buoc',
      'Nen bat lai o Quan tri > Cau hinh > Bao mat quan tri.');
  }
}

/* ------------------------------------------------------------ 8. Viec nen (worker) */

function kiemTraWorker(): void {
  const nhom = '8. Xu ly nen';
  if (config.workerDisabled) {
    ghi(nhom, 'Worker', 'LUU Y', 'WORKER_DISABLED=1 - tien trinh web KHONG chay viec nen',
      'Dung khi ban chay worker rieng (node dist/jobs/worker.js). Neu khong chay worker rieng thi dang ky ten mien, ' +
      'gui email va gia han tu dong se khong bao gio chay - dat WORKER_DISABLED=0.');
  } else {
    ghi(nhom, 'Worker', 'DAT', 'Chay trong tien trinh web');
  }

  const ketDong = db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'failed'`).get() as { n: number };
  if (ketDong.n > 0) {
    ghi(nhom, 'Viec that bai', 'LUU Y', `${ketDong.n} viec o trang thai failed`, 'Xem Quan tri > Nhat ky de biet nguyen nhan.');
  } else {
    ghi(nhom, 'Viec that bai', 'DAT', 'Khong co viec nao that bai');
  }
}

/* --------------------------------------------------------------------- 9. ZNS */

function kiemTraZns(): void {
  const nhom = '9. Zalo ZNS (tuy chon)';
  const z = settings.zns();
  if (!z.enabled) {
    ghi(nhom, 'ZNS', 'DAT', 'Dang tat - he thong chi gui email');
    return;
  }
  if (!z.appId || !z.secretKey || !z.refreshToken) {
    ghi(nhom, 'ZNS', 'CHAN', 'Bat nhung thieu App ID / Secret Key / Refresh Token',
      'Vao Quan tri > Cau hinh > Zalo ZNS bam "Ket noi Zalo OA", hoac tat ZNS_ENABLED.');
  } else {
    ghi(nhom, 'ZNS', 'DAT', `App ${z.appId}, da co refresh token`);
  }
}

/* --------------------------------------------------------------------- in ket qua */

const MAU = { CHAN: '\x1b[31m', 'LUU Y': '\x1b[33m', DAT: '\x1b[32m', het: '\x1b[0m' };

function inKetQua(): number {
  // isTTY la `undefined` (khong phai false) khi bi chuyen huong, nen phai dung ! chu khong so sanh === false
  const rong = !process.stdout.isTTY && !process.env['FORCE_COLOR'];
  const to = (m: Muc): string => (rong ? m.padEnd(5) : `${MAU[m]}${m.padEnd(5)}${MAU.het}`);

  console.log('');
  console.log('='.repeat(74));
  console.log(' KIEM TRA TRUOC KHI MO BAN');
  console.log('='.repeat(74));

  let nhomHienTai = '';
  for (const r of ketQua) {
    if (r.nhom !== nhomHienTai) {
      nhomHienTai = r.nhom;
      console.log(`\n${nhomHienTai}`);
      console.log('-'.repeat(74));
    }
    console.log(` [${to(r.muc)}] ${r.ten.padEnd(24)} ${r.chiTiet}`);
    if (r.cachSua) {
      for (const dong of batDong(r.cachSua, 66)) console.log(`          -> ${dong}`);
    }
  }

  const chan = ketQua.filter((r) => r.muc === 'CHAN');
  const luuY = ketQua.filter((r) => r.muc === 'LUU Y');

  console.log('');
  console.log('='.repeat(74));
  console.log(` Tong ket: ${ketQua.length - chan.length - luuY.length} dat, ${luuY.length} luu y, ${chan.length} chan`);
  console.log('='.repeat(74));

  if (chan.length) {
    console.log('\n CHUA MO BAN DUOC. Phai xu ly cac muc sau:');
    chan.forEach((r, i) => console.log(`   ${i + 1}. [${r.nhom}] ${r.ten}: ${r.chiTiet}`));
    console.log('');
    return 1;
  }

  console.log('\n Khong con muc chan nao. He thong san sang nhan don that.');
  if (luuY.length) console.log(` Van con ${luuY.length} muc nen xem lai o tren.`);
  console.log('');
  return 0;
}

/** Ngat dong cho vua be ngang, khong cat giua tu. */
function batDong(s: string, beNgang: number): string[] {
  const tu = s.split(' ');
  const dong: string[] = [];
  let hienTai = '';
  for (const t of tu) {
    if ((`${hienTai} ${t}`).trim().length > beNgang) { dong.push(hienTai.trim()); hienTai = t; }
    else hienTai = `${hienTai} ${t}`;
  }
  if (hienTai.trim()) dong.push(hienTai.trim());
  return dong;
}

/* ------------------------------------------------------------------------ chay */

async function main(): Promise<void> {
  kiemTraNenTang();
  kiemTraCsdl();
  await kiemTraPa();
  kiemTraBangGia();
  kiemTraThanhToan();
  await kiemTraEmail();
  kiemTraQuanTri();
  kiemTraWorker();
  kiemTraZns();
  process.exit(inKetQua());
}

void main();
