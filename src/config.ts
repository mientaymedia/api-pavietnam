import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';

function str(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}
function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

const isProd = str('NODE_ENV', 'development') === 'production';

/** Khoa bi mat: bat buoc phai dat that khi chay production. */
function secret(key: string): string {
  const v = str(key);
  if (v && v.length >= 16) return v;
  if (isProd) {
    throw new Error(
      `Thieu bien moi truong ${key}. Sinh bang: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  // Dev: sinh tam thoi (phien dang nhap se mat sau moi lan restart)
  return crypto.createHash('sha256').update(`dev-${key}`).digest('hex');
}

export const config = {
  env: str('NODE_ENV', 'development'),
  isProd,
  port: num('PORT', 3000),
  appUrl: str('APP_URL', `http://localhost:${num('PORT', 3000)}`).replace(/\/+$/, ''),
  appName: str('APP_NAME', 'Ten Mien Viet'),
  sessionSecret: secret('SESSION_SECRET'),
  encryptionKey: secret('ENCRYPTION_KEY'),
  trustProxy: bool('TRUST_PROXY', false),
  databaseFile: path.resolve(str('DATABASE_FILE', './data/app.sqlite')),

  pa: {
    endpoint: str('PAVIETNAM_ENDPOINT', 'https://daily.pavietnam.vn/interface.php'),
    username: str('PAVIETNAM_USERNAME'),
    apikey: str('PAVIETNAM_APIKEY'),
    timeoutMs: num('PAVIETNAM_TIMEOUT_MS', 30_000),
    retries: num('PAVIETNAM_RETRIES', 2),
    sandbox: bool('PAVIETNAM_SANDBOX', false),
    log: bool('PAVIETNAM_LOG', true),
  },

  smtp: {
    host: str('SMTP_HOST'),
    port: num('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: str('SMTP_USER'),
    pass: str('SMTP_PASS'),
    from: str('MAIL_FROM', 'no-reply@localhost'),
    adminAlert: str('ADMIN_ALERT_EMAIL'),
  },

  sepay: {
    enabled: bool('SEPAY_ENABLED', true),
    /** Ma ngan hang viet tat dung cho QR: ACB, VCB, TCB, MB, BIDV, VPB... */
    bankCode: str('SEPAY_BANK_CODE'),
    bankName: str('SEPAY_BANK_NAME'),
    accountNumber: str('SEPAY_ACCOUNT_NUMBER'),
    accountName: str('SEPAY_ACCOUNT_NAME'),
    /** Token BAN tu dat trong my.sepay.vn > Webhooks (header: Authorization: Apikey <token>) */
    webhookToken: str('SEPAY_WEBHOOK_TOKEN'),
    /** API Token tao tai my.sepay.vn > API Token - dung de doi soat bu. */
    apiToken: str('SEPAY_API_TOKEN'),
  },
  momo: {
    enabled: bool('MOMO_ENABLED', false),
    partnerCode: str('MOMO_PARTNER_CODE'),
    accessKey: str('MOMO_ACCESS_KEY'),
    secretKey: str('MOMO_SECRET_KEY'),
    endpoint: str('MOMO_ENDPOINT', 'https://test-payment.momo.vn/v2/gateway/api/create'),
  },
  zalopay: {
    enabled: bool('ZALOPAY_ENABLED', false),
    appId: str('ZALOPAY_APP_ID'),
    key1: str('ZALOPAY_KEY1'),
    key2: str('ZALOPAY_KEY2'),
    endpoint: str('ZALOPAY_ENDPOINT', 'https://sb-openapi.zalopay.vn/v2/create'),
  },

  seedAdmin: {
    email: str('ADMIN_EMAIL', 'admin@example.vn'),
    password: str('ADMIN_PASSWORD', ''),
  },
} as const;

export type Config = typeof config;
