/**
 * Diem nhan thong bao tu cong thanh toan (server-to-server).
 *
 * Nguyen tac:
 *  - Luon xac thuc chu ky / token TRUOC khi doc hay GHI du lieu.
 *  - Luon tra HTTP 200 kem ack khi da NHAN duoc thong bao hop le, ke ca khi
 *    khong khop don hang: neu tra loi, cong thanh toan se gui lai lien tuc.
 *  - Xu ly nang (dang ky ten mien) day sang hang doi de phan hoi that nhanh.
 */
import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { wrap } from '../middleware/error.js';
import { getProvider, settlePayment } from '../payments/index.js';
import { authenticateSepayWebhook, parseSepayTransaction } from '../payments/sepay.js';
import { ingestSepayTransaction } from '../payments/sepayIngest.js';
import { kickWorker } from '../jobs/worker.js';
import type { ProviderId } from '../payments/types.js';

const router = Router();

function headersOf(req: { headers: Record<string, unknown> }): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v as string | undefined);
  }
  return out;
}

/**
 * SePay - bien dong so du tai khoan ngan hang.
 *
 * Thu tu bat buoc: XAC THUC -> doc -> ghi. Khong ghi gi vao CSDL khi xac thuc
 * hong: neu khong, ai cung chen duoc dong bank_transactions voi external_id
 * tuy y va doi soat bu (reconcile_sepay) se bo qua giao dich that cung ma.
 */
router.post(
  '/sepay',
  wrap(async (req, res) => {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody;
    const auth = authenticateSepayWebhook(rawBody, headersOf(req));
    if (!auth.ok) {
      // 401 de ban phat hien cau hinh sai ngay tren my.sepay.vn
      log.warn('sepay_webhook_rejected', { message: auth.message });
      res.status(401).json({ success: false, message: auth.message });
      return;
    }

    const tx = parseSepayTransaction(req.body);
    if (!tx) {
      log.warn('sepay_webhook_unreadable');
      res.status(200).json({ success: true, message: 'Khong doc duoc du lieu giao dich' });
      return;
    }

    const kq = await ingestSepayTransaction(tx, req.body);
    if (kq.outcome?.status === 'paid') kickWorker();
    log.info('sepay_webhook_handled', {
      txId: tx.id, refCode: kq.refCode, status: kq.status, flag: kq.flag, amount: tx.amount,
    });
    // SePay coi HTTP 200 + {success:true} la da nhan; tra loi khac se bi gui lai
    res.json({ success: true });
  }),
);

/** MoMo va ZaloPay dung chung mot khung xu ly. */
for (const id of ['momo', 'zalopay'] as ProviderId[]) {
  router.post(
    `/${id}`,
    wrap(async (req, res) => {
      const provider = getProvider(id);
      if (!provider?.verifyIpn) {
        res.status(404).json({ error: 'Phuong thuc khong duoc ho tro' });
        return;
      }

      const result = provider.verifyIpn(req.body, headersOf(req));
      if (!result.ok) {
        log.warn('ipn_rejected', { provider: id, message: result.message });
        res.status(200).json(result.ack ?? { message: result.message });
        return;
      }

      const outcome = await settlePayment({
        provider: id,
        refCode: result.refCode,
        amount: result.amount,
        providerTxn: result.providerTxn,
      });

      if (outcome.status === 'paid') kickWorker();
      log.info('ipn_handled', { provider: id, refCode: result.refCode, outcome: outcome.status });
      res.status(200).json(result.ack ?? { success: true });
    }),
  );
}

/** Kiem tra nhanh webhook da toi duoc server chua (dung khi cau hinh tren SePay). */
router.get('/health', (_req, res) => {
  res.json({ ok: true, time: nowIso() });
});

export default router;
