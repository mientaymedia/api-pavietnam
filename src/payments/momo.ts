/**
 * Vi MoMo - All-in-One v2 (captureWallet).
 * Chu ky HMAC-SHA256 tren chuoi tham so theo DUNG thu tu MoMo quy dinh.
 */
import crypto from 'node:crypto';
import { settings } from '../lib/settings.js';
import { httpRequest } from '../lib/http.js';
import type { CreateContext, CreateResult, PaymentProvider, VerifyResult } from './types.js';

function hmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export const momoProvider: PaymentProvider = {
  id: 'momo',
  label: 'Vi MoMo',
  description: 'Thanh toan bang ung dung MoMo, xac nhan tuc thi.',

  isEnabled: () => {
    const m = settings.momo();
    return m.enabled && Boolean(m.partnerCode && m.accessKey && m.secretKey);
  },

  async create(ctx: CreateContext): Promise<CreateResult> {
    const m = settings.momo();
    const requestId = `${ctx.refCode}-${Date.now()}`;
    const orderInfo = `Thanh toan don hang ${ctx.refCode}`;
    const amount = String(ctx.order.total);
    const extraData = '';
    const requestType = 'captureWallet';

    // Thu tu truong duoi day la BAT BUOC theo tai lieu MoMo
    const rawSignature =
      `accessKey=${m.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ctx.ipnUrl}` +
      `&orderId=${ctx.refCode}&orderInfo=${orderInfo}&partnerCode=${m.partnerCode}` +
      `&redirectUrl=${ctx.returnUrl}&requestId=${requestId}&requestType=${requestType}`;

    const payload = {
      partnerCode: m.partnerCode,
      partnerName: 'Domain',
      storeId: m.partnerCode,
      requestId,
      amount,
      orderId: ctx.refCode,
      orderInfo,
      redirectUrl: ctx.returnUrl,
      ipnUrl: ctx.ipnUrl,
      lang: 'vi',
      extraData,
      requestType,
      signature: hmac(rawSignature, m.secretKey),
    };

    const body = JSON.stringify(payload);
    const responseBody = await httpRequest(m.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      timeoutMs: 20_000,
    });

    const parsed = JSON.parse(responseBody) as { payUrl?: string; resultCode?: number; message?: string };
    if (!parsed.payUrl) {
      throw new Error(`MoMo tu choi tao giao dich: ${parsed.message ?? responseBody.slice(0, 200)}`);
    }

    return {
      payUrl: parsed.payUrl,
      providerTxn: requestId,
      requestBody: body.replace(m.accessKey, '***'),
      responseBody,
    };
  },

  verifyIpn(body: unknown): VerifyResult {
    const m = settings.momo();
    const d = (body ?? {}) as Record<string, string | number>;

    const raw =
      `accessKey=${m.accessKey}&amount=${d['amount']}&extraData=${d['extraData'] ?? ''}&message=${d['message']}` +
      `&orderId=${d['orderId']}&orderInfo=${d['orderInfo']}&orderType=${d['orderType']}&partnerCode=${d['partnerCode']}` +
      `&payType=${d['payType']}&requestId=${d['requestId']}&responseTime=${d['responseTime']}` +
      `&resultCode=${d['resultCode']}&transId=${d['transId']}`;

    const expected = hmac(raw, m.secretKey);
    const received = String(d['signature'] ?? '');
    if (received !== expected) {
      return { ok: false, refCode: String(d['orderId'] ?? ''), amount: 0, providerTxn: '', message: 'Chu ky MoMo khong hop le' };
    }

    const ok = Number(d['resultCode']) === 0;
    return {
      ok,
      refCode: String(d['orderId'] ?? ''),
      amount: Math.round(Number(d['amount'] ?? 0)),
      providerTxn: String(d['transId'] ?? ''),
      message: ok ? 'Thanh toan thanh cong' : `MoMo tra ma ${d['resultCode']}: ${d['message']}`,
      ack: { message: 'received' },
    };
  },

  /** Redirect tu MoMo dung cung bo tham so; chi dung de hien thi, khong de ghi nhan tien. */
  verifyReturn(query) {
    const ok = String(query['resultCode'] ?? '') === '0';
    return {
      ok,
      refCode: String(query['orderId'] ?? ''),
      amount: Math.round(Number(query['amount'] ?? 0)),
      providerTxn: String(query['transId'] ?? ''),
      message: ok ? 'Thanh toan thanh cong' : `MoMo tra ma ${query['resultCode']}`,
    };
  },
};
