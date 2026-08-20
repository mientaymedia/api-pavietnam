/**
 * Diem nhan thong bao tu cong thanh toan (server-to-server).
 *
 * Nguyen tac:
 *  - Luon xac thuc chu ky / token TRUOC khi doc du lieu.
 *  - Luon tra HTTP 200 kem ack khi da NHAN duoc thong bao hop le, ke ca khi
 *    khong khop don hang: neu tra loi, cong thanh toan se gui lai lien tuc.
 *  - Xu ly nang (dang ky ten mien) day sang hang doi de phan hoi that nhanh.
 */
import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { wrap } from '../middleware/error.js';
import { getProvider, settlePayment } from '../payments/index.js';
import { parseSepayTransaction } from '../payments/sepay.js';
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

/** SePay - bien dong so du tai khoan ngan hang. */
router.post(
  '/sepay',
  wrap(async (req, res) => {
    const provider = getProvider('sepay')!;
    const result = provider.verifyIpn!(req.body, headersOf(req));

    const tx = parseSepayTransaction(req.body);
    if (tx) {
      // Ghi nhat ky moi giao dich nhan duoc, ke ca khong khop don
      db.prepare(
        `INSERT OR IGNORE INTO bank_transactions
           (provider, external_id, account_number, amount, content, matched_code, status, raw, created_at)
         VALUES ('sepay', ?, ?, ?, ?, ?, 'received', ?, ?)`,
      ).run(
        tx.id, tx.accountNumber, tx.amount, tx.content.slice(0, 500), result.refCode,
        JSON.stringify(req.body).slice(0, 2000), nowIso(),
      );
    }

    if (!result.ok) {
      // Token sai -> 401 de ban phat hien cau hinh loi. Con lai -> 200 kem ghi chu.
      const badToken = result.message.includes('Token');
      log.warn('sepay_webhook_rejected', { message: result.message, txId: tx?.id });
      if (tx) updateBankTx(tx.id, badToken ? 'received' : 'unmatched');
      res.status(badToken ? 401 : 200).json({ success: !badToken, message: result.message });
      return;
    }

    const outcome = await settlePayment({
      provider: 'sepay',
      refCode: result.refCode,
      amount: result.amount,
      providerTxn: result.providerTxn,
    });

    if (tx) {
      updateBankTx(
        tx.id,
        outcome.status === 'paid' ? 'matched'
          : outcome.status === 'duplicate' || outcome.status === 'already_paid' ? 'duplicate'
          : outcome.status === 'amount_mismatch' ? 'amount_mismatch'
          : 'unmatched',
      );
    }

    if (outcome.status === 'paid') kickWorker();
    log.info('sepay_webhook_handled', { refCode: result.refCode, outcome: outcome.status, amount: result.amount });
    res.json({ success: true });
  }),
);

function updateBankTx(externalId: string, status: string): void {
  db.prepare(`UPDATE bank_transactions SET status = ? WHERE provider = 'sepay' AND external_id = ?`)
    .run(status, externalId);
}

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
