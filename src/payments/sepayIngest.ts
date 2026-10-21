/**
 * Ghi nhan MOT giao dich SePay da xac thuc - dung chung cho webhook
 * (routes/webhooks.ts) va doi soat bu (job reconcile_sepay).
 *
 * Chi goi ham nay SAU khi da xac thuc nguon (webhook: chu ky / token; doi soat
 * bu: goi API SePay bang API token cua minh). Truoc day webhook ghi dong
 * bank_transactions truoc khi kiem token, nen ai cung chen duoc dong voi
 * external_id bat ky va lam doi soat bu bo qua giao dich that.
 *
 * Nhung truong hop tien da vao nhung KHONG duoc am tham bo qua - gan co (flag)
 * tren dong bank_transactions va bao nhan vien (Telegram + email quan tri):
 *   - wrong_account : tien vao tai khoan khac tai khoan nhan da cau hinh -> khong ghi nhan don
 *   - late_payment  : don da huy (qua han thanh toan) roi khach moi chuyen
 *   - double_payment: don da thanh toan bang giao dich khac (khach chuyen hai lan)
 *   - overpaid      : don duoc ghi nhan da thanh toan nhung khach chuyen du
 *   - underpaid     : khach chuyen thieu, don van cho thanh toan
 */
import { db, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { guiQuanTri } from '../lib/telegram.js';
import { settings } from '../lib/settings.js';
import { formatVnd } from '../lib/money.js';
import { alertAdmin } from '../services/notifications.js';
import { settlePayment, type SettleOutcome } from './index.js';
import { findOrderCode, isConfiguredAccount, type SepayTx } from './sepay.js';

export type BankTxStatus = 'received' | 'matched' | 'unmatched' | 'duplicate' | 'amount_mismatch';
export type BankTxFlag = '' | 'wrong_account' | 'late_payment' | 'double_payment' | 'overpaid' | 'underpaid';

export interface IngestResult {
  status: BankTxStatus;
  flag: BankTxFlag;
  refCode: string;
  outcome: SettleOutcome | null;
  /** Lan bao nhan vien (neu co) - test cho xong; webhook khong doi. */
  alert: Promise<void>;
}

interface BankTxRow { status: BankTxStatus; flag: string }

export async function ingestSepayTransaction(tx: SepayTx, raw: unknown): Promise<IngestResult> {
  const refCode = findOrderCode(tx);

  db.prepare(
    `INSERT OR IGNORE INTO bank_transactions
       (provider, external_id, account_number, amount, content, matched_code, status, raw, created_at)
     VALUES ('sepay', ?, ?, ?, ?, ?, 'received', ?, ?)`,
  ).run(
    tx.id, tx.accountNumber || tx.subAccount, tx.amount, tx.content.slice(0, 500), refCode,
    JSON.stringify(raw).slice(0, 2000), nowIso(),
  );
  const before = db.prepare(`SELECT status, flag FROM bank_transactions WHERE provider = 'sepay' AND external_id = ?`)
    .get(tx.id) as BankTxRow;

  let status: BankTxStatus = 'unmatched';
  let flag: BankTxFlag = '';
  let outcome: SettleOutcome | null = null;

  if (tx.direction === 'out') {
    status = 'unmatched';
  } else if (!isConfiguredAccount(tx)) {
    // Tien vao tai khoan khac tai khoan nhan da cau hinh (SePay lien ket nhieu
    // tai khoan, hoac cau hinh sai): khong mo don, bao nhan vien kiem tra.
    status = 'unmatched';
    flag = 'wrong_account';
  } else if (refCode) {
    outcome = await settlePayment({ provider: 'sepay', refCode, amount: tx.amount, providerTxn: tx.id });
    switch (outcome.status) {
      case 'paid':
        status = 'matched';
        if (tx.amount > outcome.order.total) flag = 'overpaid';
        break;
      case 'duplicate':
        // Cung giao dich SePay gui lai: da ghi nhan, khong co tien moi
        status = 'duplicate';
        break;
      case 'already_paid':
        status = 'duplicate';
        flag = outcome.order.status === 'cancelled' ? 'late_payment' : 'double_payment';
        break;
      case 'amount_mismatch':
        status = 'amount_mismatch';
        flag = 'underpaid';
        break;
      default:
        status = 'unmatched';
    }
  }

  // Khong ha cap dong da khop (SePay gui lai -> settle tra duplicate), khong xoa co da gan
  const finalStatus = before.status === 'matched' ? 'matched' : status;
  const finalFlag = flag || (before.flag as BankTxFlag);
  db.prepare(`UPDATE bank_transactions SET status = ?, flag = ? WHERE provider = 'sepay' AND external_id = ?`)
    .run(finalStatus, finalFlag, tx.id);

  // Bao mot lan cho moi co moi (SePay gui lai thi khong bao trung)
  let alert: Promise<void> = Promise.resolve();
  if (flag && flag !== before.flag) {
    log.warn('sepay_tx_flagged', { flag, txId: tx.id, refCode, amount: tx.amount });
    alert = baoNhanVien(flag, tx, refCode, outcome).catch((err) => {
      log.warn('sepay_alert_failed', { flag, txId: tx.id, error: String(err) });
    });
  }

  return { status: finalStatus, flag: finalFlag, refCode, outcome, alert };
}

const TIEU_DE: Record<Exclude<BankTxFlag, ''>, string> = {
  wrong_account: 'Tiền vào SAI tài khoản nhận - chưa ghi nhận đơn',
  late_payment: 'Khách chuyển tiền SAU KHI đơn đã hủy (quá hạn)',
  double_payment: 'Khách chuyển tiền cho đơn ĐÃ thanh toán',
  overpaid: 'Khách chuyển THỪA - đơn đã ghi nhận thanh toán',
  underpaid: 'Khách chuyển THIẾU - đơn chưa ghi nhận',
};

const VIEC: Record<Exclude<BankTxFlag, ''>, string> = {
  wrong_account: 'Kiểm tra cấu hình tài khoản nhận (SEPAY_BANK_ACCOUNT) và tài khoản liên kết trên my.sepay.vn; xác nhận thủ công nếu đúng là tiền của đơn.',
  late_payment: 'Liên hệ khách: mở lại đơn / tạo đơn mới và xác nhận thủ công, hoặc hoàn tiền.',
  double_payment: 'Đối chiếu với giao dịch đã ghi nhận; hoàn khoản thừa hoặc cộng vào ví khách.',
  overpaid: 'Hoàn phần chênh lệch hoặc cộng vào ví khách.',
  underpaid: 'Liên hệ khách chuyển bổ sung, hoặc xác nhận thủ công nếu chấp nhận.',
};

async function baoNhanVien(flag: Exclude<BankTxFlag, ''>, tx: SepayTx, refCode: string, outcome: SettleOutcome | null): Promise<void> {
  const order = outcome?.order ?? null;
  const dong: [string, string][] = [
    ['Mã GD SePay', tx.id],
    ['Số tiền', formatVnd(tx.amount)],
    ['Tài khoản nhận', [tx.accountNumber, tx.subAccount].filter(Boolean).join(' / ') || '(trống)'],
    ['Ngân hàng', tx.gateway || '-'],
    ['Nội dung', tx.content.slice(0, 200)],
    ['Mã đơn dò được', refCode || '-'],
  ];
  if (order) {
    dong.push(['Tổng đơn', formatVnd(order.total)], ['Trạng thái đơn', order.status]);
    if (flag === 'overpaid') dong.push(['Thừa', formatVnd(tx.amount - order.total)]);
  }
  const tieuDe = TIEU_DE[flag];
  const viec = VIEC[flag];

  await guiQuanTri([`[SePay] ${tieuDe}`, ...dong.map(([k, v]) => `${k}: ${v}`), `Việc cần làm: ${viec}`].join('\n'));
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  await alertAdmin(`SePay: ${tieuDe}`, `
    <table cellpadding="4">${dong.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>
    <p><b>Việc cần làm:</b> ${esc(viec)}</p>
    <p>Xem tại Quản trị &gt; Đối soát ngân hàng (${esc(settings.site().name)}).</p>`);
}
