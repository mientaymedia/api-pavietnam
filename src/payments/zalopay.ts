/**
 * ZaloPay - Gateway v2.
 * Tao don: mac = HMAC-SHA256(key1) tren chuoi ghep theo thu tu quy dinh.
 * Callback: mac = HMAC-SHA256(key2) tren truong `data`.
 */
import crypto from 'node:crypto';
import { settings } from '../lib/settings.js';
import { httpRequest } from '../lib/http.js';
import type { CreateContext, CreateResult, PaymentProvider, VerifyResult } from './types.js';

function hmac(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/** ZaloPay yeu cau app_trans_id bat dau bang yymmdd theo gio Viet Nam. */
function appTransId(refCode: string): string {
  const vn = new Date(Date.now() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${String(vn.getUTCFullYear()).slice(2)}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}`;
  return `${day}_${refCode}`;
}

export const zalopayProvider: PaymentProvider = {
  id: 'zalopay',
  label: 'ZaloPay',
  description: 'Thanh toan bang vi ZaloPay hoac the lien ket.',

  isEnabled: () => {
    const z = settings.zalopay();
    return z.enabled && Boolean(z.appId && z.key1 && z.key2);
  },

  async create(ctx: CreateContext): Promise<CreateResult> {
    const z = settings.zalopay();
    const transId = appTransId(ctx.refCode);
    const appTime = Date.now();
    const embedData = JSON.stringify({ redirecturl: ctx.returnUrl, orderCode: ctx.refCode });
    const item = JSON.stringify([{ itemid: ctx.refCode, itemname: 'Ten mien', itemprice: ctx.order.total, itemquantity: 1 }]);

    const params: Record<string, string> = {
      app_id: z.appId,
      app_trans_id: transId,
      app_user: `user_${ctx.order.user_id}`,
      app_time: String(appTime),
      amount: String(ctx.order.total),
      item,
      embed_data: embedData,
      description: `Thanh toan don hang ${ctx.refCode}`,
      bank_code: '',
      callback_url: ctx.ipnUrl,
    };

    // Thu tu ghep chuoi ky la BAT BUOC theo tai lieu ZaloPay
    params['mac'] = hmac(
      `${z.appId}|${transId}|${params['app_user']}|${params['amount']}|${appTime}|${embedData}|${item}`,
      z.key1,
    );

    const body = new URLSearchParams(params).toString();
    const responseBody = await httpRequest(z.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      timeoutMs: 20_000,
    });

    const parsed = JSON.parse(responseBody) as { order_url?: string; return_code?: number; return_message?: string };
    if (!parsed.order_url) {
      throw new Error(`ZaloPay tu choi tao giao dich: ${parsed.return_message ?? responseBody.slice(0, 200)}`);
    }

    return { payUrl: parsed.order_url, providerTxn: transId, requestBody: body, responseBody };
  },

  verifyIpn(body: unknown): VerifyResult {
    const z = settings.zalopay();
    const envelope = (body ?? {}) as { data?: string; mac?: string };

    if (!envelope.data || !envelope.mac || hmac(envelope.data, z.key2) !== envelope.mac) {
      return {
        ok: false, refCode: '', amount: 0, providerTxn: '', message: 'Chu ky ZaloPay khong hop le',
        ack: { return_code: -1, return_message: 'mac not equal' },
      };
    }

    const data = JSON.parse(envelope.data) as { app_trans_id: string; amount: number; zp_trans_id: number | string };
    // app_trans_id co dang 'yymmdd_DHXXXXXX' -> lay phan sau dau gach duoi
    const refCode = String(data.app_trans_id).split('_').slice(1).join('_');

    return {
      ok: true,
      refCode,
      amount: Math.round(Number(data.amount ?? 0)),
      providerTxn: String(data.zp_trans_id ?? ''),
      message: 'Thanh toan thanh cong',
      ack: { return_code: 1, return_message: 'success' },
    };
  },
};
