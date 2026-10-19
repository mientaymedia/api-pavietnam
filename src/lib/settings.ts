/**
 * Cau hinh Control Panel: cac gia tri co the sua truc tiep tren giao dien admin,
 * ghi de gia tri mac dinh trong .env. Secret (API key, hash secret cong thanh toan)
 * duoc ma hoa AES-256-GCM truoc khi luu.
 */
import { db, nowIso } from '../db/index.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { config } from '../config.js';
import { log } from './logger.js';

let cache: Map<string, string> | null = null;

function load(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>();
  const rows = db.prepare('SELECT key, value, is_secret FROM settings').all() as {
    key: string; value: string; is_secret: number;
  }[];
  for (const row of rows) {
    if (!row.value) continue;
    try {
      map.set(row.key, row.is_secret ? decryptSecret(row.value) : row.value);
    } catch (err) {
      log.warn('setting_decrypt_failed', { key: row.key, error: String(err) });
    }
  }
  cache = map;
  return map;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

export function getSetting(key: string, fallback = ''): string {
  const v = load().get(key);
  return v === undefined || v === '' ? fallback : v;
}

export function getSettingNumber(key: string, fallback: number): number {
  // Phai kiem tra chuoi RONG truoc: Number('') === 0 va 0 la so huu han,
  // nen neu doi thang sang so thi fallback se khong bao gio duoc dung -
  // cau hinh de trong se am tham thanh 0 (vd smtp.port = 0, ttl don = 0 gio).
  const raw = getSetting(key, '').trim();
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

export function getSettingBool(key: string, fallback: boolean): boolean {
  const v = getSetting(key, '');
  if (v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export function setSetting(key: string, value: string, isSecret = false): void {
  const stored = isSecret && value ? encryptSecret(value) : value;
  db.prepare(
    `INSERT INTO settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret, updated_at = excluded.updated_at`,
  ).run(key, stored, isSecret ? 1 : 0, nowIso());
  invalidateSettingsCache();
}

export function setSettings(entries: Record<string, string>, secretKeys: string[] = []): void {
  const secrets = new Set(secretKeys);
  const run = db.transaction((items: [string, string][]) => {
    for (const [k, v] of items) {
      const isSecret = secrets.has(k);
      const stored = isSecret && v ? encryptSecret(v) : v;
      db.prepare(
        `INSERT INTO settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret, updated_at = excluded.updated_at`,
      ).run(k, stored, isSecret ? 1 : 0, nowIso());
    }
  });
  run.immediate(Object.entries(entries));
  invalidateSettingsCache();
}

/* --------------------------------------------------- truy cap co kieu, co fallback */

export const settings = {
  site: () => ({
    name: getSetting('site.name', config.appName),
    tagline: getSetting('site.tagline', 'Đăng ký tên miền Việt Nam & Quốc tế - kích hoạt tức thì'),
    // Mac dinh theo brain MienTay Media (Tai lieu san pham, muc "Lien he"): truoc
    // day email ho tro roi ve MAIL_FROM (no-reply) va hotline de trong, nen
    // footer, phieu thanh toan va email khong co cach nao lien he nguoi that.
    supportEmail: getSetting('site.support_email', 'hello@mientaymedia.com'),
    hotline: getSetting('site.hotline', '0976.788.840'),
    // Thong tin phap ly chu da chot 16/10/2026, khop trang Gioi thieu va Dieu
    // khoan tren mientaymedia.com. Ten phap ly chi in o dong phap ly cuoi footer;
    // ten hien thi van la site.name (MienTay Media).
    address: getSetting('site.address', '12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang'),
    legalName: getSetting('site.legal_name', 'Công ty TNHH Phần mềm Mientay Media'),
    taxCode: getSetting('site.tax_code', '1602182849'),
    taxIssued: getSetting('site.tax_issued', 'Sở KH&ĐT tỉnh An Giang cấp ngày 13/06/2024'),
    // Nguoi dai dien theo phap luat (Dieu 11 khoan 1 diem a Luat TMDT 122/2025,
    // Dieu 4 ND 248/2026). Mac dinh lay tu site-data.ts va trang Dieu khoan dich
    // vu cua mientaymedia.com. Footer van kiem rong de neu sau nay bo mac dinh
    // thi chi an dong nay (o de trong trong Cau hinh se ve mac dinh, nhu cac o khac).
    legalRep: getSetting('site.legal_rep', 'Đinh Văn Tạo Em'),
    // Bieu tuong "da thong bao" chi co sau khi UBND tinh xac nhan thong bao theo
    // ND 248/2026 (Dieu 45 khoan 2 diem a). Mac dinh trong: khong tu gan bieu
    // tuong khi chua duoc cap. Footer chi hien khi co du anh va link online.gov.vn.
    bctBadgeImg: getSetting('site.bct_badge_img', ''),
    bctBadgeUrl: getSetting('site.bct_badge_url', ''),
    workingHours: getSetting('site.working_hours', 'Thứ 2 đến thứ 7, 8:00 đến 17:30'),
    logoUrl: getSetting('site.logo_url', ''),
    primaryColor: getSetting('site.primary_color', '#0a6cff'),
    // Nut chat Zalo tren trang khach (chu yeu cau 19/10/2026). OA mac dinh la OA
    // MienTay Media dang dung tren mientaymedia.com. Chi doc qua zaloChatOaId().
    zaloChatEnabled: getSettingBool('site.zalo_chat_enabled', true),
    zaloOaId: getSetting('site.zalo_oa_id', '3962957485228412416'),
    zaloWelcome: getSetting('site.zalo_welcome', 'Xin chào! MienTay Media có thể hỗ trợ gì cho bạn về tên miền?'),
  }),

  pa: () => ({
    endpoint: getSetting('pa.endpoint', config.pa.endpoint),
    username: getSetting('pa.username', config.pa.username),
    apikey: getSetting('pa.apikey', config.pa.apikey),
    sandbox: getSettingBool('pa.sandbox', config.pa.sandbox),
  }),

  dns: () => ({
    defaultNameservers: getSetting('dns.default_ns', 'ns1.pavietnam.vn,ns2.pavietnam.vn')
      .split(',').map((s) => s.trim()).filter(Boolean),
  }),

  pricing: () => ({
    markupPercent: getSettingNumber('pricing.markup_percent', 0),
    roundStep: getSettingNumber('pricing.round_step', 1000),
    vatPercent: getSettingNumber('pricing.vat_percent', 0),
  }),

  order: () => ({
    autoProvision: getSettingBool('order.auto_provision', true),
    /** Gio giu don cho thanh toan truoc khi tu huy. */
    paymentTtlHours: getSettingNumber('order.payment_ttl_hours', 48),
    renewNoticeDays: getSetting('order.renew_notice_days', '30,15,7,1')
      .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
    /** Bat dau gia han tu dong khi ten mien con bao nhieu ngay. */
    autoRenewDaysBefore: getSettingNumber('order.auto_renew_days_before', 14),
    /** So ten mien dong bo moi lan quet - giu nho de khong dap API nha dang ky. */
    syncBatchSize: getSettingNumber('order.sync_batch_size', 50),
    /** Ten mien khong dong bo qua bao nhieu gio thi lam moi. */
    syncStaleHours: getSettingNumber('order.sync_stale_hours', 168),
    /** Ten mien sap het han thi doc day hon - bao nhieu gio mot lan. */
    syncNearExpiryHours: getSettingNumber('order.sync_near_expiry_hours', 24),
  }),

  sepay: () => ({
    enabled: getSettingBool('sepay.enabled', config.sepay.enabled),
    bankCode: getSetting('sepay.bank_code', config.sepay.bankCode),
    bankName: getSetting('sepay.bank_name', config.sepay.bankName),
    accountNumber: getSetting('sepay.account_number', config.sepay.accountNumber),
    accountName: getSetting('sepay.account_name', config.sepay.accountName),
    webhookToken: getSetting('sepay.webhook_token', config.sepay.webhookToken),
    apiToken: getSetting('sepay.api_token', config.sepay.apiToken),
  }),

  momo: () => ({
    enabled: getSettingBool('momo.enabled', config.momo.enabled),
    partnerCode: getSetting('momo.partner_code', config.momo.partnerCode),
    accessKey: getSetting('momo.access_key', config.momo.accessKey),
    secretKey: getSetting('momo.secret_key', config.momo.secretKey),
    endpoint: getSetting('momo.endpoint', config.momo.endpoint),
  }),

  zalopay: () => ({
    enabled: getSettingBool('zalopay.enabled', config.zalopay.enabled),
    appId: getSetting('zalopay.app_id', config.zalopay.appId),
    key1: getSetting('zalopay.key1', config.zalopay.key1),
    key2: getSetting('zalopay.key2', config.zalopay.key2),
    endpoint: getSetting('zalopay.endpoint', config.zalopay.endpoint),
  }),

  zns: () => ({
    enabled: getSettingBool('zns.enabled', config.zns.enabled),
    appId: getSetting('zns.app_id', config.zns.appId),
    secretKey: getSetting('zns.secret_key', config.zns.secretKey),
    refreshToken: getSetting('zns.refresh_token', config.zns.refreshToken),
    /** Gui ZNS cho ca nhung su kien da co email (true) hay chi ZNS (false). */
    alsoEmail: getSettingBool('zns.also_email', true),
  }),

  security: () => ({
    /** Tai khoan admin/staff bat buoc bat xac thuc hai lop moi vao khu quan tri. */
    require2faAdmin: getSettingBool('security.require_2fa_admin', true),
  }),

  smtp: () => ({
    host: getSetting('smtp.host', config.smtp.host),
    port: getSettingNumber('smtp.port', config.smtp.port),
    secure: getSettingBool('smtp.secure', config.smtp.secure),
    user: getSetting('smtp.user', config.smtp.user),
    pass: getSetting('smtp.pass', config.smtp.pass),
    from: getSetting('smtp.from', config.smtp.from),
    adminAlert: getSetting('smtp.admin_alert', config.smtp.adminAlert),
  }),

  ai: () => ({
    /** Chu chot 18/10/2026: mac dinh TAT cho toi khi nhap khoa va bat tay. */
    enabled: getSettingBool('ai.enabled', false),
    openaiKey: getSetting('ai.openai_key', ''),
    model: getSetting('ai.model', '').trim(),
    reasoningEffort: getSetting('ai.reasoning_effort', '').trim(),
    // Don gia, ty gia, tran: rong hoac <= 0 thi ve mac dinh. Neu de 0 lot qua,
    // chi phi uoc tinh luon bang 0 va tran ngay khong bao gio cham.
    dailyCapVnd: soDuong('ai.daily_cap_vnd', 50_000),
    /** USD / 1 trieu token. Mac dinh co y cao hon gia model nho: uoc tinh du, tran cham som. */
    priceInputUsd: soDuong('ai.price_input_usd', 1),
    priceOutputUsd: soDuong('ai.price_output_usd', 5),
    usdVnd: soDuong('ai.usd_vnd', 27_000),
    // Kep trong quyet dinh cua chu (8 ten, 16 lenh P.A): cau hinh chi giam duoc.
    maxNames: kep(soDuong('ai.max_names', 8), 1, 8),
    maxChecks: kep(soDuong('ai.max_checks', 16), 1, 16),
    ratePerMinute: kep(soDuong('ai.rate_per_minute', 5), 1, 1000),
    ratePerDay: kep(soDuong('ai.rate_per_day', 30), 1, 100_000),
    timeoutSec: kep(soDuong('ai.timeout_sec', 15), 3, 60),
    blockedWords: getSetting('ai.blocked_words', TU_CAM_MAC_DINH),
  }),
};

function soDuong(key: string, fallback: number): number {
  const v = getSettingNumber(key, fallback);
  return v > 0 ? v : fallback;
}

function kep(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}

/**
 * Tu cam mac dinh cho Tim cung AI (chu sua trong Cau hinh). So khop tren ten da
 * bo dau: co quan nha nuoc va tu nhay cam theo quy dinh ten mien .vn, co bac,
 * doi truy, ma tuy, va thuong hieu lon de khong goi y ten trung nhan hieu.
 */
const TU_CAM_MAC_DINH = [
  'chinhphu', 'quochoi', 'chutichnuoc', 'thutuong', 'bochinhtri', 'trunguong', 'dangcongsan',
  'nhanuoc', 'ubnd', 'hdnd', 'congan', 'quandoi', 'bocongan', 'quocphong',
  'toaan', 'vienkiemsat', 'tongcucthue',
  'casino', 'cacuoc', 'danhbac', 'lode', 'baccarat', 'bet', 'slot', 'taixiu',
  'sex', 'sexy', 'porn', 'xxx', 'gaigoi',
  'matuy', 'heroin', 'thuoclac', 'vaynong', 'phandong',
  'google', 'youtube', 'facebook', 'instagram', 'tiktok', 'zalo', 'apple', 'iphone',
  'microsoft', 'samsung', 'amazon', 'netflix', 'shopee', 'lazada', 'tiki', 'grab', 'momo',
  'viettel', 'vinaphone', 'mobifone', 'vnpt', 'fpt', 'vingroup', 'vinfast', 'vinhomes', 'vinamilk',
  'honda', 'toyota', 'yamaha', 'nike', 'adidas', 'gucci', 'chanel', 'cocacola', 'pepsi', 'openai', 'chatgpt',
].join(', ');

/** Danh sach key la secret - luon ma hoa khi luu, va che khi hien thi. */
export const SECRET_KEYS = [
  'pa.apikey',
  'sepay.webhook_token',
  'sepay.api_token',
  'momo.secret_key',
  'momo.access_key',
  'zalopay.key1',
  'zalopay.key2',
  'smtp.pass',
  'zns.secret_key',
  'zns.refresh_token',
  'zns.access_token',
  'ai.openai_key',
];

/**
 * OA ID cho nut chat Zalo, rong khi tat hoac OA khong hop le.
 *
 * Vi sao kiem chu so: OA ID duoc in vao thuoc tinh HTML, link zalo.me va quyet
 * dinh co mo CSP cho Zalo hay khong. Quan tri go nham (dan ca link, de khoang
 * trang) thi coi nhu tat, khong nap script la, khong in link hong.
 */
export function zaloChatOaId(): string {
  const s = settings.site();
  const oa = s.zaloOaId.trim();
  return s.zaloChatEnabled && /^\d{6,25}$/.test(oa) ? oa : '';
}
