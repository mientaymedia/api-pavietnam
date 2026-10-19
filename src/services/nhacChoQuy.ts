/**
 * Nhac khi don bi giu lau (chay trong job 5 phut retry_awaiting_funds):
 *  - Van thieu quy sau 4 gio: nhac lai quan tri (Telegram kem nut kich hoat,
 *    email), roi 4 gio mot lan cho toi khi het don cho.
 *  - Dong giu qua 24 gio (cho quy hoac cho nguoi xu ly): email xin loi khach
 *    MOT lan. Khong bao gio tu hoan tien: khach da tra, viec cua minh la dang ky.
 */
import { db, isoIn, nowIso, parseJson } from '../db/index.js';
import { log } from '../lib/logger.js';
import { formatVnd } from '../lib/money.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { NUT_KICH_HOAT, guiQuanTri } from '../lib/telegram.js';
import { dongDangGiu, tomTatChoQuy } from './choQuy.js';
import { alertAdmin, sendXinLoiCham, userEmail } from './notifications.js';
import { tinChoQuy } from './tinTelegram.js';

export const NHAC_LAI_MS = 4 * 3600_000;
export const XIN_LOI_MS = 24 * 3600_000;
const KHOA_NHAC = 'cho_quy.nhac_luc';

export async function nhacChoQuy(): Promise<{ daNhac: boolean; xinLoi: number }> {
  let daNhac = false;
  const cho = dongDangGiu('cho_nap_quy');
  if (cho.length) {
    const cuNhat = cho.map((d) => d.hold_since ?? nowIso()).sort()[0]!;
    const lanCuoi = getSetting(KHOA_NHAC, '');
    const moc = lanCuoi > cuNhat ? lanCuoi : cuNhat;
    if (moc <= isoIn(-NHAC_LAI_MS)) {
      const t = await tomTatChoQuy();
      await guiQuanTri(tinChoQuy(t, 'NHẮC LẠI: VẪN THIẾU QUỸ ĐẠI LÝ P.A'), NUT_KICH_HOAT);
      await alertAdmin(`Nhắc lại: vẫn thiếu quỹ đại lý, cần nạp ${formatVnd(t.canNap)}`,
        `<p>Còn <b>${t.cho.length}</b> dòng đơn chờ nạp quỹ (khách đã thanh toán). Cần nạp thêm ít nhất <b>${formatVnd(t.canNap)}</b>.</p>`);
      setSetting(KHOA_NHAC, nowIso());
      daNhac = true;
    }
  }

  let xinLoi = 0;
  const lau = [...cho, ...dongDangGiu('can_nguoi_xu_ly')].filter((d) => d.hold_since && d.hold_since <= isoIn(-XIN_LOI_MS));
  for (const d of lau) {
    const row = db.prepare('SELECT meta FROM order_items WHERE id = ?').get(d.id) as { meta: string } | undefined;
    const meta = parseJson<Record<string, unknown>>(row?.meta, {});
    if (meta['xinLoiLuc']) continue;
    // Ghi truoc khi gui: job chay lai giua chung khong gui email lan hai
    meta['xinLoiLuc'] = nowIso();
    db.prepare('UPDATE order_items SET meta = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(meta), nowIso(), d.id);
    await sendXinLoiCham({ userId: d.user_id, email: userEmail(d.user_id), domain: d.domain, orderCode: d.order_code });
    xinLoi++;
  }
  if (daNhac || xinLoi) log.info('nhac_cho_quy', { daNhac, xinLoi });
  return { daNhac, xinLoi };
}
