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
import type { CreateContext, CreateResult, PaymentProvider, VerifyResult } from './types.js';

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
  label: 'Chuyen khoan ngan hang (QR SePay)',
  description: 'Quet ma QR hoac chuyen khoan thu cong. He thong doi soat tu dong, kich hoat ten mien trong vai giay.',

  isEnabled: () => {
    const s = settings.sepay();
    return s.enabled && Boolean(s.accountNumber);
  },

  async create(ctx: CreateContext): Promise<CreateResult> {
    const s = settings.sepay();
    return {
      qrUrl: buildSepayQrUrl({ amount: ctx.order.total, addInfo: ctx.refCode }),
      instructions: [
        { label: 'Ngan hang', value: s.bankName || s.bankCode },
        { label: 'So tai khoan', value: s.accountNumber, copyable: true },
        { label: 'Chu tai khoan', value: s.accountName },
        { label: 'So tien', value: String(ctx.order.total), copyable: true },
        { label: 'Noi dung chuyen khoan', value: ctx.refCode, copyable: true },
      ],
    };
  },

  /**
   * Xac thuc webhook SePay.
   * SePay gui header `Authorization: Apikey <token>` - token nay do BAN dat
   * trong trang quan tri SePay va phai trung voi SEPAY_WEBHOOK_TOKEN.
   */
  verifyIpn(body: unknown, headers: Record<string, string | undefined>): VerifyResult {
    const s = settings.sepay();
    const auth = headers['authorization'] ?? '';
    const token = auth.replace(/^(Apikey|Bearer)\s+/i, '').trim();

    if (!s.webhookToken) {
      return { ok: false, refCode: '', amount: 0, providerTxn: '', message: 'Chua cau hinh SEPAY_WEBHOOK_TOKEN' };
    }
    if (!token || !safeEqual(token, s.webhookToken)) {
      return { ok: false, refCode: '', amount: 0, providerTxn: '', message: 'Token webhook khong hop le' };
    }

    const tx = parseSepayTransaction(body);
    if (!tx) {
      return { ok: false, refCode: '', amount: 0, providerTxn: '', message: 'Khong doc duoc du lieu giao dich' };
    }
    if (tx.direction === 'out') {
      return { ok: false, refCode: '', amount: 0, providerTxn: tx.id, message: 'Bo qua giao dich chuyen di', ack: { success: true } };
    }

    const match = ORDER_CODE_RE.exec(`${tx.code} ${tx.content}`.replace(/\s+/g, ''));
    return {
      ok: Boolean(match),
      refCode: match?.[0]?.toUpperCase() ?? '',
      amount: tx.amount,
      providerTxn: tx.id,
      message: match ? 'OK' : 'Khong tim thay ma don trong noi dung chuyen khoan',
      // SePay coi HTTP 200 + {success:true} la da nhan; tra ve de tranh gui lai
      ack: { success: true },
    };
  },
};

export interface SepayTx {
  id: string;
  amount: number;
  content: string;
  /** Ma tham chieu SePay tu dong tach duoc tu noi dung (neu cau hinh prefix). */
  code: string;
  accountNumber: string;
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
    accountNumber: String(raw['accountNumber'] ?? raw['subAccount'] ?? ''),
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
      gateway: String(t['bank_brand_name'] ?? ''),
      transactionDate: String(t['transaction_date'] ?? ''),
      direction: Number(t['amount_in'] ?? 0) > 0 ? 'in' : 'out',
    }))
    .filter((t) => t.id && t.direction === 'in');
}
