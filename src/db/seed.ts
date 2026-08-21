/**
 * Khoi tao du lieu ban dau:
 *   - Tai khoan quan tri
 *   - Bang gia mau cho ten mien .vn va quoc te
 *   - Cau hinh mac dinh (ngan hang nhan tien, nameserver, chinh sach gia)
 *
 * Chay lai an toan: khong ghi de gia tri da co.
 *
 * LUU Y VE GIA: cac muc gia duoi day chi la GIA MAU de he thong chay duoc ngay.
 * Ban PHAI cap nhat theo bang gia dai ly thuc te cua P.A Viet Nam tai
 * Quan tri > Bang gia truoc khi mo ban.
 */
import { config } from '../config.js';
import { db, migrate, nowIso } from './index.js';
import { hashPassword } from '../lib/crypto.js';
import { upsertTld } from '../services/pricing.js';
import { getSetting, setSetting } from '../lib/settings.js';

migrate();

/* ------------------------------------------------------------- quan tri vien */

const adminEmail = config.seedAdmin.email.toLowerCase();
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(adminEmail);

if (existingAdmin) {
  db.prepare(`UPDATE users SET role = 'admin' WHERE email = ? COLLATE NOCASE`).run(adminEmail);
  console.log(`- Tai khoan quan tri da ton tai: ${adminEmail}`);
} else {
  const password = config.seedAdmin.password;
  if (!password) {
    console.error('! Chua dat ADMIN_PASSWORD trong .env - bo qua buoc tao tai khoan quan tri.');
  } else {
    db.prepare(
      `INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at)
       VALUES (?, ?, 'Quan tri vien', 'admin', ?, ?)`,
    ).run(adminEmail, hashPassword(password), nowIso(), nowIso());
    console.log(`+ Da tao tai khoan quan tri: ${adminEmail}`);
  }
}

/* ------------------------------------------------------------------ bang gia */

interface SeedTld {
  tld: string; kind: 'vn' | 'intl'; label: string;
  cost_register: number; cost_renew: number;
  price_register: number; price_renew: number; price_transfer?: number;
  setup_fee?: number; requires_vn_contact?: 0 | 1; is_featured?: 0 | 1; sort_order: number;
}

const SEED_TLDS: SeedTld[] = [
  // --- Ten mien Viet Nam (bat buoc ho so chu the theo quy dinh VNNIC) ---
  { tld: 'vn',        kind: 'vn', label: 'Ten mien quoc gia Viet Nam', cost_register: 700_000, cost_renew: 460_000, price_register: 830_000, price_renew: 520_000, setup_fee: 0, requires_vn_contact: 1, is_featured: 1, sort_order: 1 },
  { tld: 'com.vn',    kind: 'vn', label: 'Doanh nghiep, thuong mai',   cost_register: 600_000, cost_renew: 380_000, price_register: 690_000, price_renew: 430_000, requires_vn_contact: 1, is_featured: 1, sort_order: 2 },
  { tld: 'net.vn',    kind: 'vn', label: 'Nha cung cap dich vu mang',  cost_register: 600_000, cost_renew: 380_000, price_register: 690_000, price_renew: 430_000, requires_vn_contact: 1, sort_order: 3 },
  { tld: 'org.vn',    kind: 'vn', label: 'To chuc',                    cost_register: 400_000, cost_renew: 250_000, price_register: 460_000, price_renew: 290_000, requires_vn_contact: 1, sort_order: 4 },
  { tld: 'edu.vn',    kind: 'vn', label: 'Giao duc, dao tao',          cost_register: 400_000, cost_renew: 250_000, price_register: 460_000, price_renew: 290_000, requires_vn_contact: 1, sort_order: 5 },
  { tld: 'info.vn',   kind: 'vn', label: 'Thong tin',                  cost_register: 400_000, cost_renew: 250_000, price_register: 460_000, price_renew: 290_000, requires_vn_contact: 1, sort_order: 6 },
  { tld: 'biz.vn',    kind: 'vn', label: 'Kinh doanh',                 cost_register: 400_000, cost_renew: 250_000, price_register: 460_000, price_renew: 290_000, requires_vn_contact: 1, sort_order: 7 },

  // --- Ten mien quoc te ---
  { tld: 'com',   kind: 'intl', label: 'Pho bien nhat the gioi', cost_register: 280_000, cost_renew: 310_000, price_register: 319_000, price_renew: 359_000, price_transfer: 319_000, is_featured: 1, sort_order: 10 },
  { tld: 'net',   kind: 'intl', label: 'Cong nghe, mang',        cost_register: 330_000, cost_renew: 360_000, price_register: 379_000, price_renew: 409_000, price_transfer: 379_000, is_featured: 1, sort_order: 11 },
  { tld: 'org',   kind: 'intl', label: 'To chuc phi loi nhuan',  cost_register: 320_000, cost_renew: 350_000, price_register: 369_000, price_renew: 399_000, price_transfer: 369_000, sort_order: 12 },
  { tld: 'info',  kind: 'intl', label: 'Trang thong tin',        cost_register: 120_000, cost_renew: 420_000, price_register: 149_000, price_renew: 479_000, sort_order: 13 },
  { tld: 'biz',   kind: 'intl', label: 'Kinh doanh',             cost_register: 300_000, cost_renew: 380_000, price_register: 349_000, price_renew: 429_000, sort_order: 14 },
  { tld: 'shop',  kind: 'intl', label: 'Ban hang truc tuyen',    cost_register: 150_000, cost_renew: 800_000, price_register: 189_000, price_renew: 899_000, is_featured: 1, sort_order: 15 },
  { tld: 'store', kind: 'intl', label: 'Cua hang',               cost_register: 150_000, cost_renew: 900_000, price_register: 189_000, price_renew: 999_000, sort_order: 16 },
  { tld: 'online',kind: 'intl', label: 'Truc tuyen',             cost_register: 100_000, cost_renew: 850_000, price_register: 129_000, price_renew: 949_000, sort_order: 17 },
  { tld: 'site',  kind: 'intl', label: 'Website ca nhan',        cost_register: 100_000, cost_renew: 700_000, price_register: 129_000, price_renew: 799_000, sort_order: 18 },
  { tld: 'xyz',   kind: 'intl', label: 'Sang tao, khoi nghiep',  cost_register: 60_000,  cost_renew: 350_000, price_register: 79_000,  price_renew: 399_000, sort_order: 19 },
  { tld: 'dev',   kind: 'intl', label: 'Lap trinh vien',         cost_register: 380_000, cost_renew: 400_000, price_register: 429_000, price_renew: 459_000, sort_order: 20 },
  { tld: 'io',    kind: 'intl', label: 'Cong nghe, startup',     cost_register: 1_100_000, cost_renew: 1_200_000, price_register: 1_249_000, price_renew: 1_349_000, sort_order: 21 },
];

let added = 0;
for (const t of SEED_TLDS) {
  const exists = db.prepare('SELECT 1 FROM tlds WHERE tld = ? COLLATE NOCASE').get(t.tld);
  if (exists) continue;
  upsertTld({
    ...t,
    price_transfer: t.price_transfer ?? 0,
    setup_fee: t.setup_fee ?? 0,
    requires_vn_contact: t.requires_vn_contact ?? 0,
    is_featured: t.is_featured ?? 0,
    min_years: t.kind === 'vn' ? 1 : 1,
    max_years: 10,
    is_active: 1,
  });
  added++;
}
console.log(`+ Bang gia: them ${added} duoi moi (tong ${SEED_TLDS.length} duoi mau).`);

/* ------------------------------------------------------- cau hinh mac dinh */

const DEFAULTS: Record<string, string> = {
  'site.name': config.appName,
  'site.tagline': 'Dang ky ten mien Viet Nam & Quoc te - kich hoat tuc thi',
  'site.primary_color': '#0f766e',
  'dns.default_ns': 'ns1.pavietnam.vn,ns2.pavietnam.vn',
  'pricing.markup_percent': '0',
  'pricing.round_step': '1000',
  'pricing.vat_percent': '0',
  'order.auto_provision': '1',
  'order.payment_ttl_hours': '48',
  'order.renew_notice_days': '30,15,7,1',
  'order.auto_renew_days_before': '14',
  'order.auto_refund_failed': '1',
  'sepay.enabled': '1',
  'sepay.bank_code': config.sepay.bankCode || 'TCB',
  'sepay.bank_name': config.sepay.bankName || 'Techcombank',
  'sepay.account_number': config.sepay.accountNumber,
  'sepay.account_name': config.sepay.accountName,
};

let seeded = 0;
for (const [key, value] of Object.entries(DEFAULTS)) {
  if (!value) continue;
  if (getSetting(key, '')) continue; // da cau hinh -> giu nguyen
  setSetting(key, value);
  seeded++;
}
console.log(`+ Cau hinh: dat ${seeded} gia tri mac dinh.`);

console.log('\nHoan tat. Buoc tiep theo:');
console.log('  1) npm run dev  (hoac npm run build && npm start)');
console.log('  2) Dang nhap /admin  ->  Cau hinh Control Panel  ->  dien API Key P.A + SePay');
console.log('  3) Cap nhat Bang gia theo bang gia dai ly thuc te cua ban\n');
