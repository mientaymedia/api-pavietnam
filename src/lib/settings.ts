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
  const v = Number(getSetting(key, ''));
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
  run(Object.entries(entries));
  invalidateSettingsCache();
}

/* --------------------------------------------------- truy cap co kieu, co fallback */

export const settings = {
  site: () => ({
    name: getSetting('site.name', config.appName),
    tagline: getSetting('site.tagline', 'Dang ky ten mien Viet Nam & Quoc te - kich hoat tuc thi'),
    supportEmail: getSetting('site.support_email', config.smtp.from),
    hotline: getSetting('site.hotline', ''),
    address: getSetting('site.address', ''),
    logoUrl: getSetting('site.logo_url', ''),
    primaryColor: getSetting('site.primary_color', '#0f766e'),
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

  smtp: () => ({
    host: getSetting('smtp.host', config.smtp.host),
    port: getSettingNumber('smtp.port', config.smtp.port),
    secure: getSettingBool('smtp.secure', config.smtp.secure),
    user: getSetting('smtp.user', config.smtp.user),
    pass: getSetting('smtp.pass', config.smtp.pass),
    from: getSetting('smtp.from', config.smtp.from),
    adminAlert: getSetting('smtp.admin_alert', config.smtp.adminAlert),
  }),
};

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
];
