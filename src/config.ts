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
      `Thiếu biến môi trường ${key}. Sinh bằng: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  // Dev: sinh tam thoi (phien dang nhap se mat sau moi lan restart)
  return crypto.createHash('sha256').update(`dev-${key}`).digest('hex');
}

/**
 * Tien to duong dan khi app chay duoi thu muc con (vd https://mientaymedia.com/ten-mien).
 * Rong = chay o goc nhu truoc. Phai khop phan duong dan cua APP_URL: link trong
 * email, sitemap, URL thanh toan dung APP_URL, con link trong trang dung tien
 * to nay; lech nhau la khach bam vao link hong, nen dung khoi dong luon.
 */
export function chuanHoaBasePath(raw: string, appUrl: string): string {
  const v = raw.trim().replace(/\/+$/, '');
  if (v && !/^(\/[a-z0-9._~-]+)+$/.test(v)) {
    throw new Error(`BASE_PATH không hợp lệ: "${raw}". Ví dụ đúng: /ten-mien (chữ thường, bắt đầu bằng /).`);
  }
  const urlPath = new URL(appUrl).pathname.replace(/\/+$/, '');
  if (urlPath !== v) {
    throw new Error(
      `APP_URL và BASE_PATH không khớp: APP_URL có đường dẫn "${urlPath || '/'}" nhưng BASE_PATH là "${v || '/'}".`,
    );
  }
  return v;
}

const appUrl = str('APP_URL', `http://localhost:${num('PORT', 3000)}`).replace(/\/+$/, '');

export const config = {
  env: str('NODE_ENV', 'development'),
  isProd,
  port: num('PORT', 3000),
  appUrl,
  basePath: chuanHoaBasePath(str('BASE_PATH', ''), appUrl),
  appName: str('APP_NAME', 'MienTay Media'),
  sessionSecret: secret('SESSION_SECRET'),
  encryptionKey: secret('ENCRYPTION_KEY'),
  trustProxy: bool('TRUST_PROXY', false),
  /** Header chua IP that cua khach (vd cf-connecting-ip khi chay sau Cloudflare Tunnel). */
  clientIpHeader: str('CLIENT_IP_HEADER', ''),
  /**
   * Tat worker trong tien trinh web. Dat 1 khi ban chay worker rieng
   * (`node dist/jobs/worker.js`) de tranh hai tien trinh cung tranh job.
   */
  workerDisabled: bool('WORKER_DISABLED', false),
  databaseFile: path.resolve(str('DATABASE_FILE', './data/app.sqlite')),

  pa: {
    endpoint: str('PAVIETNAM_ENDPOINT', 'https://daily.pavietnam.vn/interface.php'),
    /** Endpoint chay thu cua P.A: dang ky / gia han / doi DNS tra 900, khong tru tien. */
    endpointTest: str('PAVIETNAM_ENDPOINT_TEST', 'https://daily.pavietnam.vn/interface_test.php'),
    /** Bat che do thu: lenh ghi di endpointTest (lenh doc van di endpoint that). */
    useTestEndpoint: bool('PA_USE_TEST_ENDPOINT', false),
    username: str('PAVIETNAM_USERNAME'),
    apikey: str('PAVIETNAM_APIKEY'),
    timeoutMs: num('PAVIETNAM_TIMEOUT_MS', 30_000),
    retries: num('PAVIETNAM_RETRIES', 2),
    sandbox: bool('PAVIETNAM_SANDBOX', false),
    log: bool('PAVIETNAM_LOG', true),
  },

  /**
   * Dia chi API OpenAI cho Tim cung AI. Khoa, model, gioi han nam trong Cau hinh;
   * rieng dia chi chi doi duoc o .env: o quan tri ma doi duoc thi khoa co the
   * bi gui toi may la. Test tro ve may chu gia lap cuc bo qua bien nay.
   */
  openaiBaseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),

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

  zns: {
    enabled: bool('ZNS_ENABLED', false),
    appId: str('ZNS_APP_ID'),
    secretKey: str('ZNS_SECRET_KEY'),
    refreshToken: str('ZNS_REFRESH_TOKEN'),
  },

  /**
   * Bot Telegram bao quan tri (don moi, dang ky xong, thieu quy, loi) va nhan
   * lenh /kichhoat, /sodu, /doncho. Ba bien nay da co trong .env tren VPS; o
   * Cau hinh chi ghi de khi nhap. TELEGRAM_API_BASE chi de test tro ve may gia.
   */
  telegram: {
    botToken: str('TELEGRAM_BOT_TOKEN'),
    /** Danh sach chat id duoc phep, cach nhau bang dau phay. */
    adminChatIds: str('TELEGRAM_ADMIN_CHAT_IDS'),
    webhookSecret: str('TELEGRAM_WEBHOOK_SECRET'),
    apiBase: str('TELEGRAM_API_BASE', 'https://api.telegram.org').replace(/\/+$/, ''),
  },

  /**
   * Cong may noi bo cho CRM (/api/noi-bo/*): khoa Bearer CRM gui len (cung
   * gia tri WEB_TEN_MIEN_KEY ben CRM). Nhieu khoa cach nhau dau phay de xoay vong.
   */
  webTenMienKey: str('WEB_TEN_MIEN_KEY'),

  /** Day su kien don hang sang CRM (cong /api/tich-hop/web-ten-mien/su-kien ben CRM). */
  crm: {
    url: str('CRM_URL').replace(/\/+$/, ''),
    key: str('CRM_INTEGRATION_KEY'),
  },

  seedAdmin: {
    email: str('ADMIN_EMAIL', 'admin@example.vn'),
    password: str('ADMIN_PASSWORD', ''),
  },
} as const;

export type Config = typeof config;
