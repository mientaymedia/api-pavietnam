/**
 * SePay - chuyen khoan ngan hang + DOI SOAT TU DONG.
 *
 * Vi sao SePay: doanh nghiep chi can 1 tai khoan ngan hang thong thuong.
 * SePay doc bien dong so du va bao ve he thong qua webhook, nen ten mien duoc
 * kich hoat ngay sau khi khach chuyen khoan - khong can cong thanh toan trung gian.
 *
 * Luong hoat dong:
 *   1. Sinh ma QR (qr.sepay.vn) voi so tien + noi dung = ma don hang.
 *   2. Khach quet QR / chuyen khoan.
 *   3. SePay goi POST toi  {APP_URL}/webhooks/sepay  kem header
 *      `Authorization: Apikey <SEPAY_WEBHOOK_TOKEN>`.
 *   4. He thong doi chieu noi dung <-> ma don, kiem tra so tien, roi day don
 *      vao hang doi dang ky ten mien tu dong.
 *
 * Du phong: neu webhook that lac (mat mang, deploy lai...), job `reconcile_sepay`
 * goi API SePay lay giao dich gan nhat va doi soat lai - xem src/jobs/handlers.ts.
 *
 * Cau hinh tai: https://my.sepay.vn  -> Cong ty > Webhooks va API Token.
 */
import { settings } from '../lib/settings.js';
import { safeEqual } from '../lib/crypto.js';
import { httpRequest } from '../lib/http.js';
import crypto from 'node:crypto';
import type { CreateContext, CreateResult, PaymentProvider } from './types.js';

/** Ma don hang co dang DH + 6 ky tu. Dung de do trong noi dung chuyen khoan. */
export const ORDER_CODE_RE = /DH[0-9A-Z]{6}/i;

/**
 * Anh QR cua SePay (mien phi, khong can API key).
 * `bank` la ma ngan hang viet tat, vi du: ACB, VCB, TCB, MB, BIDV, VPB...
 */
export function buildSepayQrUrl(input: { amount: number; addInfo: string }): string {
  const s = settings.sepay();
  if (!s.accountNumber || !s.bankCode) return '';
  const params = new URLSearchParams({
    acc: s.accountNumber,
    bank: s.bankCode,
    amount: String(input.amount),
    des: input.addInfo,
    template: 'compact',
  });
  return `https://qr.sepay.vn/img?${params}`;
}

export const sepayProvider: PaymentProvider = {
  id: 'sepay',
  label: 'Chuyển khoản ngân hàng (QR SePay)',
  description: 'Quét mã QR hoặc chuyển khoản thủ công. Hệ thống đối soát tự động, kích hoạt tên miền trong vài giây.',

  isEnabled: () => {
    const s = settings.sepay();
    return s.enabled && Boolean(s.accountNumber);
  },

  async create(ctx: CreateContext): Promise<CreateResult> {
    const s = settings.sepay();
    return {
      qrUrl: buildSepayQrUrl({ amount: ctx.order.total, addInfo: ctx.refCode }),
      instructions: [
        { label: 'Ngân hàng', value: s.bankName || s.bankCode },
        { label: 'Số tài khoản', value: s.accountNumber, copyable: true },
        { label: 'Chủ tài khoản', value: s.accountName },
        { label: 'Số tiền', value: String(ctx.order.total), copyable: true },
        { label: 'Nội dung chuyển khoản', value: ctx.refCode, copyable: true },
      ],
    };
  },

};

/** Lech gio toi da giua X-SePay-Timestamp va dong ho may chu (chong phat lai). */
export const SEPAY_TIMESTAMP_SKEW_S = 300;

export interface SepayAuthResult {
  ok: boolean;
  /** Ly do tu choi (ghi log, tra ve cho SePay). Khong chua bi mat. */
  message: string;
}

/**
 * Xac thuc webhook SePay TRUOC khi doc hay ghi bat ky du lieu nao.
 *
 *  - SEPAY_WEBHOOK_AUTH=apikey (mac dinh): header `Authorization: Apikey <token>`
 *    trung SEPAY_WEBHOOK_TOKEN.
 *  - SEPAY_WEBHOOK_AUTH=hmac: header `X-SePay-Signature: sha256=<hex>` la
 *    HMAC-SHA256 (khoa SEPAY_WEBHOOK_SECRET) cua chuoi
 *    `"{X-SePay-Timestamp}.{raw_body}"`; timestamp lech qua 5 phut thi tu choi.
 *    Xem https://developer.sepay.vn/en/sepay-webhooks/xac-thuc
 *
 * Moi phep so sanh deu hang thoi gian (safeEqual).
 */
export function authenticateSepayWebhook(
  rawBody: string | undefined,
  headers: Record<string, string | undefined>,
  nowMs = Date.now(),
): SepayAuthResult {
  const s = settings.sepay();

  if (s.webhookAuth === 'hmac') {
    if (!s.webhookSecret) return { ok: false, message: 'Chua cau hinh SEPAY_WEBHOOK_SECRET' };
    const sig = (headers['x-sepay-signature'] ?? '').trim();
    const ts = (headers['x-sepay-timestamp'] ?? '').trim();
    if (!sig || !/^\d{1,12}$/.test(ts)) return { ok: false, message: 'Thieu chu ky hoac timestamp webhook' };
    if (Math.abs(Math.floor(nowMs / 1000) - Number(ts)) > SEPAY_TIMESTAMP_SKEW_S) {
      return { ok: false, message: 'Timestamp webhook qua han' };
    }
    if (rawBody === undefined) return { ok: false, message: 'Khong co body tho de kiem chu ky' };
    const expected = `sha256=${crypto.createHmac('sha256', s.webhookSecret).update(`${ts}.${rawBody}`, 'utf8').digest('hex')}`;
    // Bam ca hai truoc khi so de do dai bang nhau: khong lo do dai qua thoi gian
    if (!safeEqual(sha256Hex(sig.toLowerCase()), sha256Hex(expected))) {
      return { ok: false, message: 'Chu ky webhook khong hop le' };
    }
    return { ok: true, message: 'OK' };
  }

  if (!s.webhookToken) return { ok: false, message: 'Chua cau hinh SEPAY_WEBHOOK_TOKEN' };
  const auth = headers['authorization'] ?? '';
  const token = auth.replace(/^(Apikey|Bearer)\s+/i, '').trim();
  if (!token || !safeEqual(sha256Hex(token), sha256Hex(s.webhookToken))) {
    return { ok: false, message: 'Token webhook khong hop le' };
  }
  return { ok: true, message: 'OK' };
}

function sha256Hex(v: string): string {
  return crypto.createHash('sha256').update(v, 'utf8').digest('hex');
}

/** Do ma don (DHxxxxxx) trong ma tham chieu + noi dung chuyen khoan. */
export function findOrderCode(tx: Pick<SepayTx, 'code' | 'content'>): string {
  const match = ORDER_CODE_RE.exec(`${tx.code} ${tx.content}`.replace(/\s+/g, ''));
  return match?.[0]?.toUpperCase() ?? '';
}

/** Chi giu chu so: ngan hang/SePay co the chen dau cach, gach noi. */
function chuSo(v: string): string {
  return v.replace(/\D+/g, '');
}

/**
 * Giao dich co vao DUNG tai khoan nhan tien da cau hinh khong. So voi ca so tai
 * khoan chinh lan tai khoan ao (subAccount, VA) SePay bao ve. Chua cau hinh tai
 * khoan thi khong khop gi ca.
 */
export function isConfiguredAccount(tx: Pick<SepayTx, 'accountNumber' | 'subAccount'>, configured = settings.sepay().accountNumber): boolean {
  const muc = chuSo(configured);
  if (!muc) return false;
  return [tx.accountNumber, tx.subAccount].some((a) => chuSo(a) === muc);
}

export interface SepayTx {
  id: string;
  amount: number;
  content: string;
  /** Ma tham chieu SePay tu dong tach duoc tu noi dung (neu cau hinh prefix). */
  code: string;
  accountNumber: string;
  /** Tai khoan ao (VA) neu SePay bao, '' neu khong co. */
  subAccount: string;
  gateway: string;
  transactionDate: string;
  direction: 'in' | 'out';
}

/** Doc mot giao dich tu payload webhook SePay. */
export function parseSepayTransaction(body: unknown): SepayTx | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const amount = Number(raw['transferAmount'] ?? raw['amount_in'] ?? raw['amount'] ?? 0);
  const id = String(raw['id'] ?? raw['referenceCode'] ?? '');
  if (!id) return null;

  return {
    id,
    amount: Math.abs(Math.round(amount)),
    content: String(raw['content'] ?? raw['description'] ?? ''),
    code: String(raw['code'] ?? ''),
    accountNumber: String(raw['accountNumber'] ?? ''),
    subAccount: String(raw['subAccount'] ?? ''),
    gateway: String(raw['gateway'] ?? ''),
    transactionDate: String(raw['transactionDate'] ?? ''),
    direction: String(raw['transferType'] ?? 'in').toLowerCase() === 'out' ? 'out' : 'in',
  };
}

/**
 * Lay danh sach giao dich gan day tu API SePay (dung de doi soat bu khi webhook
 * that lac). Can API Token tao tai my.sepay.vn > API Token.
 */
export async function fetchRecentTransactions(limit = 50): Promise<SepayTx[]> {
  const s = settings.sepay();
  if (!s.apiToken) return [];

  const params = new URLSearchParams({ limit: String(limit) });
  if (s.accountNumber) params.set('account_number', s.accountNumber);

  const body = await httpRequest(`https://my.sepay.vn/userapi/transactions/list?${params}`, {
    headers: { Authorization: `Bearer ${s.apiToken}`, 'content-type': 'application/json' },
    timeoutMs: 20_000,
    retries: 1,
  });

  const parsed = JSON.parse(body) as { transactions?: Record<string, unknown>[] };
  return (parsed.transactions ?? [])
    .map((t): SepayTx => ({
      id: String(t['id'] ?? ''),
      amount: Math.abs(Math.round(Number(t['amount_in'] ?? 0))),
      content: String(t['transaction_content'] ?? ''),
      code: String(t['code'] ?? ''),
      accountNumber: String(t['account_number'] ?? ''),
      subAccount: String(t['sub_account'] ?? ''),
      gateway: String(t['bank_brand_name'] ?? ''),
      transactionDate: String(t['transaction_date'] ?? ''),
      direction: Number(t['amount_in'] ?? 0) > 0 ? 'in' : 'out',
    }))
    .filter((t) => t.id && t.direction === 'in');
}
