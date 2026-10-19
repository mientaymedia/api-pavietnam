/**
 * Don CHO NAP QUY DAI LY va kich hoat lai.
 *
 * Tai khoan dai ly P.A tra truoc: het tien thi P.A tra 400. Khach da tra tien
 * that nen KHONG hoan, khong bao loi: dong don giu `hold='cho_nap_quy'` (khach
 * thay "dang xu ly"), chu nap quy roi he thong tu dang ky. Ba duong kich hoat
 * dung chung ham `kichHoatDonCho`: job 5 phut, nut Telegram / lenh /kichhoat,
 * va API noi bo cho CRM. Bam hai lan khong dang ky hai lan: nha giu bang mot
 * lenh UPDATE co dieu kien (chi mot ben thang), roi `provisionItem` con gianh
 * quyen xu ly mot lan nua bang trang thai 'processing'.
 */
import { db, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { getBalance } from '../pavietnam/client.js';
import { getTld } from './pricing.js';
import type { OrderItem } from './orders.js';

export type LoaiGiu = 'cho_nap_quy' | 'can_nguoi_xu_ly' | 'sai_ho_so';

/**
 * So tien dai ly can co de chay dong nay: gia von P.A (cost_register /
 * cost_renew) nhan so nam. Chua nhap gia von thi dung so tien khach tra cho
 * dong do: uoc du, khong de lot dong dang ky khi quy khong du.
 */
export function canTien(item: Pick<OrderItem, 'action' | 'tld' | 'years' | 'amount'>): number {
  const t = getTld(item.tld);
  const giaVon = item.action === 'renew' ? t?.cost_renew ?? 0 : t?.cost_register ?? 0;
  return giaVon > 0 ? giaVon * item.years : item.amount;
}

export interface DongGiu {
  id: number;
  order_id: number;
  order_code: string;
  user_id: number;
  email: string;
  action: string;
  domain: string;
  tld: string;
  years: number;
  amount: number;
  hold: LoaiGiu;
  hold_since: string | null;
  pa_code: string;
  error: string;
  can: number;
}

export function dongDangGiu(hold?: LoaiGiu, orderId?: number): DongGiu[] {
  const dk = [`i.hold <> ''`, `i.status = 'pending'`];
  const ts: unknown[] = [];
  if (hold) { dk.push('i.hold = ?'); ts.push(hold); }
  if (orderId) { dk.push('i.order_id = ?'); ts.push(orderId); }
  const rows = db.prepare(
    `SELECT i.id, i.order_id, o.code AS order_code, o.user_id, u.email, i.action, i.domain, i.tld, i.years, i.amount,
            i.hold, i.hold_since, i.pa_code, i.error
     FROM order_items i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id
     WHERE ${dk.join(' AND ')}
     ORDER BY i.hold_since, i.id`,
  ).all(...ts) as Omit<DongGiu, 'can'>[];
  return rows.map((r) => ({ ...r, can: canTien(r as unknown as OrderItem) }));
}

export interface TomTatChoQuy {
  soDu: number | null;
  loiSoDu?: string;
  cho: DongGiu[];
  tongCan: number;
  /** So tien toi thieu can nap them de chay het don cho (0 neu du). */
  canNap: number;
}

/** So du hien tai va danh sach don cho quy (dung cho canh bao, Telegram, CRM, quan tri). */
export async function tomTatChoQuy(): Promise<TomTatChoQuy> {
  const cho = dongDangGiu('cho_nap_quy');
  const tongCan = cho.reduce((n, d) => n + d.can, 0);
  let soDu: number | null = null;
  let loiSoDu: string | undefined;
  try {
    const b = await getBalance();
    if (b.ok) soDu = b.balance;
    else loiSoDu = b.message;
  } catch (err) {
    loiSoDu = err instanceof Error ? err.message : String(err);
  }
  return { soDu, ...(loiSoDu ? { loiSoDu } : {}), cho, tongCan, canNap: soDu === null ? tongCan : Math.max(0, tongCan - soDu) };
}

/** Nha mot dong dang giu ve hang cho cap phat. true neu chinh lan goi nay nha duoc. */
export function nhaDong(itemId: number, hold?: LoaiGiu): boolean {
  const info = hold
    ? db.prepare(`UPDATE order_items SET hold = '', hold_since = NULL, updated_at = ? WHERE id = ? AND hold = ? AND status = 'pending'`)
      .run(nowIso(), itemId, hold)
    : db.prepare(`UPDATE order_items SET hold = '', hold_since = NULL, attempts = 0, updated_at = ? WHERE id = ? AND hold <> '' AND status = 'pending'`)
      .run(nowIso(), itemId);
  return info.changes === 1;
}

export interface KetQuaKichHoat {
  /** Mot lan kich hoat khac dang chay trong tien trinh nay: khong lam gi them. */
  dangChay?: boolean;
  soDu: number | null;
  loiSoDu?: string;
  ketQua: { itemId: number; orderCode: string; domain: string; ok: boolean }[];
  conCho: number;
  canNap: number;
}

let dangKichHoat = false;

/**
 * Kiem so du roi dang ky cac dong cho quy, cu nhat truoc, trong pham vi so du.
 * Gap dong khong du tien thi dung (giu thu tu den truoc lam truoc).
 */
export async function kichHoatDonCho(opts: { orderId?: number } = {}): Promise<KetQuaKichHoat> {
  if (dangKichHoat) {
    const t = await tomTatChoQuy();
    return { dangChay: true, soDu: t.soDu, ketQua: [], conCho: t.cho.length, canNap: t.canNap };
  }
  dangKichHoat = true;
  try {
    const cho = dongDangGiu('cho_nap_quy', opts.orderId);
    const ketQua: KetQuaKichHoat['ketQua'] = [];
    if (!cho.length) {
      const t = await tomTatChoQuy();
      return { soDu: t.soDu, ...(t.loiSoDu ? { loiSoDu: t.loiSoDu } : {}), ketQua, conCho: t.cho.length, canNap: t.canNap };
    }

    const b = await getBalance().catch((err: unknown) => ({ ok: false, balance: 0, message: String(err) }));
    if (!b.ok) {
      return { soDu: null, loiSoDu: b.message, ketQua, conCho: cho.length, canNap: cho.reduce((n, d) => n + d.can, 0) };
    }

    // Nap dong sau de tranh vong import (provisioning -> suKienDon -> kenh -> choQuy)
    const { provisionItem } = await import('./provisioning.js');
    const { refreshOrderStatus } = await import('./orders.js');
    let con = b.balance;
    for (const d of cho) {
      if (d.can > con) break;
      if (!nhaDong(d.id, 'cho_nap_quy')) continue; // ben khac vua nha
      con -= d.can;
      const ok = await provisionItem(d.id).catch(async () => {
        // Loi tam thoi: dong da ve 'pending' khong giu, giao hang doi thu lai
        const { enqueue } = await import('../jobs/queue.js');
        enqueue('provision_item', { itemId: d.id }, { dedupeKey: `provision_item:${d.id}` });
        return false;
      });
      refreshOrderStatus(d.order_id);
      ketQua.push({ itemId: d.id, orderCode: d.order_code, domain: d.domain, ok });
    }
    const t = await tomTatChoQuy();
    if (ketQua.length) log.info('kich_hoat_don_cho', { soDong: ketQua.length, thanhCong: ketQua.filter((k) => k.ok).length });
    return { soDu: t.soDu, ketQua, conCho: t.cho.length, canNap: t.canNap };
  } finally {
    dangKichHoat = false;
  }
}
