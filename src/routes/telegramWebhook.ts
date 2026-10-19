/**
 * Webhook Telegram: POST /webhooks/telegram (Telegram goi khi quan tri bam nut
 * hoac go lenh voi @mientaymediabot).
 *
 * An toan:
 *  - Xac thuc header X-Telegram-Bot-Api-Secret-Token (secret_token khai bao khi
 *    setWebhook), so sanh hang thoi gian. Chua cau hinh secret thi tat han (503).
 *  - Chi lam theo chat id trong danh sach duoc phep; chat khac bi bo qua im lang.
 *  - Telegram gui lai cung update khi cham phan hoi: ghi update_id da xu ly va
 *    tra loi 200 ngay roi moi chay lenh. Kich hoat dung chung `kichHoatDonCho`
 *    (nha giu co dieu kien), bam nut hai lan khong dang ky hai lan.
 *
 * Lenh: /kichhoat (hoac nut "Da nap, kich hoat"), /sodu, /doncho, /help.
 * Tep rieng, khong sua webhooks.ts (khoa cung theo spec cu).
 */
import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { safeEqual } from '../lib/crypto.js';
import { log } from '../lib/logger.js';
import { boDau } from '../lib/text.js';
import { formatVnd } from '../lib/money.js';
import { settings } from '../lib/settings.js';
import { guiTin, traLoiNut } from '../lib/telegram.js';
import { getBalance } from '../pavietnam/client.js';
import { dongDangGiu, kichHoatDonCho, tomTatChoQuy } from '../services/choQuy.js';
import { tinChoQuy, tinKetQuaKichHoat } from '../services/tinTelegram.js';
import { audit } from '../services/audit.js';

const router = Router();

interface CapNhat {
  update_id?: number;
  message?: { chat?: { id?: number | string }; text?: string };
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number | string } } };
}

const HUONG_DAN = [
  'Lệnh quản trị tên miền:',
  '/kichhoat: kiểm số dư P.A rồi đăng ký các đơn chờ nạp quỹ',
  '/sodu: số dư tài khoản đại lý P.A',
  '/doncho: danh sách đơn đang giữ',
].join('\n');

/** Lan dau thay update_id nay thi true; Telegram gui lai cung update thi false. */
function lanDau(updateId: number | undefined): boolean {
  if (updateId === undefined) return true;
  const info = db.prepare('INSERT OR IGNORE INTO telegram_updates (update_id, created_at) VALUES (?, ?)').run(updateId, nowIso());
  return info.changes === 1;
}

async function xuLyLenh(chatId: string, lenh: string, callbackId?: string): Promise<void> {
  if (lenh === 'kichhoat') {
    if (callbackId) await traLoiNut(callbackId, 'Đang kiểm số dư và kích hoạt...');
    audit({ userId: null, action: 'telegram.kich_hoat', entity: 'order', meta: { chatId } });
    const kq = await kichHoatDonCho();
    await guiTin(chatId, tinKetQuaKichHoat(kq));
    return;
  }
  if (callbackId) await traLoiNut(callbackId, '');
  if (lenh === 'sodu') {
    const b = await getBalance().catch((err: unknown) => ({ ok: false, balance: 0, message: String(err) }));
    const pa = settings.pa();
    const cheDo = pa.sandbox ? 'giả lập' : pa.useTestEndpoint ? 'THỬ' : 'thật';
    await guiTin(chatId, b.ok ? `Số dư đại lý P.A: ${formatVnd(b.balance)} (chế độ ${cheDo})` : `Không đọc được số dư: ${b.message}`);
    return;
  }
  if (lenh === 'doncho') {
    const t = await tomTatChoQuy();
    const nguoi = dongDangGiu('can_nguoi_xu_ly');
    const hoSo = dongDangGiu('sai_ho_so');
    const dong = (ds: typeof nguoi) => ds.slice(0, 10).map((d) => `- ${d.order_code}: ${d.domain} (mã ${d.pa_code || 'không có'})`).join('\n');
    await guiTin(chatId, [
      tinChoQuy(t, 'ĐƠN CHỜ NẠP QUỸ'),
      `Cần người xử lý (${nguoi.length}):`, dong(nguoi) || '- không có',
      `Hồ sơ cần sửa (${hoSo.length}):`, dong(hoSo) || '- không có',
    ].join('\n'));
    return;
  }
  await guiTin(chatId, HUONG_DAN);
}

/** "/kichhoat@mientaymediabot" -> "kichhoat"; "/donchờ" -> "doncho". */
export function docLenh(text: string): string {
  const m = /^\/([^\s@]+)/.exec(String(text ?? '').trim());
  if (!m) return '';
  return boDau(m[1]!);
}

router.post('/', (req, res) => {
  const tg = settings.telegram();
  if (!tg.webhookSecret || !tg.botToken) {
    res.status(503).json({ ok: false });
    return;
  }
  if (!safeEqual(String(req.get('x-telegram-bot-api-secret-token') ?? ''), tg.webhookSecret)) {
    res.status(401).json({ ok: false });
    return;
  }

  const u = (req.body ?? {}) as CapNhat;
  const cb = u.callback_query;
  const chatId = String(cb?.message?.chat?.id ?? u.message?.chat?.id ?? '');
  // Tra loi ngay: lenh co the chay lau (dang ky qua P.A), Telegram se gui lai neu cho
  res.json({ ok: true });

  if (!chatId || !tg.adminChatIds.includes(chatId)) {
    if (chatId) log.warn('telegram_chat_khong_duoc_phep', { chatId });
    return;
  }
  if (!lanDau(u.update_id)) return;

  const lenh = cb ? String(cb.data ?? '') : docLenh(u.message?.text ?? '');
  void xuLyLenh(chatId, lenh, cb?.id).catch((err: unknown) => {
    log.error('telegram_lenh_loi', { lenh, error: err instanceof Error ? err.message : String(err) });
  });
});

export default router;
