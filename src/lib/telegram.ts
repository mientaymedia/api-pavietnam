/**
 * Gui tin Telegram Bot API cho quan tri (@mientaymediabot).
 *
 * Token nam trong URL goi Bot API nen KHONG BAO GIO ghi URL hay loi tho ra log:
 * moi thong bao loi deu qua `cheToken`. Chua cau hinh token hoac chat id thi
 * im lang bo qua (kenh tuy chon, khong lam hong cap phat).
 */
import { config } from '../config.js';
import { log } from './logger.js';
import { settings } from './settings.js';

export interface NutBam { text: string; callback_data: string }

function cheToken(s: string, token: string): string {
  return token ? s.split(token).join('***') : s;
}

export function telegramSanSang(): boolean {
  const t = settings.telegram();
  return Boolean(t.botToken && t.adminChatIds.length);
}

/** Goi mot phuong thuc Bot API. Tra ve true neu Telegram bao ok. */
export async function goiTelegram(phuongThuc: string, du: Record<string, unknown>): Promise<boolean> {
  const token = settings.telegram().botToken;
  if (!token) return false;
  try {
    const r = await fetch(`${config.telegram.apiBase}/bot${token}/${phuongThuc}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(du),
      signal: AbortSignal.timeout(10_000),
    });
    const kq = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!kq.ok) log.warn('telegram_loi', { phuongThuc, status: r.status, loi: cheToken(String(kq.description ?? ''), token) });
    return Boolean(kq.ok);
  } catch (err) {
    log.warn('telegram_loi', { phuongThuc, loi: cheToken(err instanceof Error ? err.message : String(err), token) });
    return false;
  }
}

/** Gui tin van ban thuan (khong parse_mode: ten mien, ten khach khong lam vo dinh dang). */
export async function guiTin(chatId: string, text: string, nut?: NutBam[][]): Promise<boolean> {
  return goiTelegram('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
    ...(nut?.length ? { reply_markup: { inline_keyboard: nut } } : {}),
  });
}

/** Gui cho moi chat id quan tri duoc phep. */
export async function guiQuanTri(text: string, nut?: NutBam[][]): Promise<void> {
  if (!telegramSanSang()) return;
  for (const chatId of settings.telegram().adminChatIds) await guiTin(chatId, text, nut);
}

export async function traLoiNut(callbackId: string, text: string): Promise<void> {
  await goiTelegram('answerCallbackQuery', { callback_query_id: callbackId, text: text.slice(0, 190) });
}

/** Nut "Da nap, kich hoat" gan vao tin thieu quy. callback_data chi la lenh, khong mang du lieu. */
export const NUT_KICH_HOAT: NutBam[][] = [[{ text: 'Đã nạp, kích hoạt', callback_data: 'kichhoat' }]];
