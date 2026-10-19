/**
 * DAY SU KIEN DON HANG SANG CRM (POST <CRM>/api/tich-hop/web-ten-mien/su-kien).
 *
 * Hop dong theo ben nhan (crm-mientaymedia src/server/tich-hop/kiem-tra.ts):
 * `phien_ban: 1`, `ma_su_kien` dung khuon cua tung loai va trung header
 * `Idempotency-Key`, `don` la anh chup don (tong cac dong = tong don tung dong).
 * CRM nhan lai cung ma voi du lieu moi thi "trang thai moi nhat thang", nen
 * sau khi dang ky xong web gui lai `don_da_thanh_toan` cua don do.
 *
 * Giao qua hang doi (`day_su_kien_crm`): anh chup dung LUC GUI (trang thai moi
 * nhat), loi mang / 5xx thu lai luy thua khoang 2 gio, loi du lieu / khoa (4xx)
 * dung ngay. `don_cho_quy`, `don_loi` CRM chua nhan: chi gui khi chu bat
 * `crm.su_kien_mo_rong` (xem docs/mtm/pa-dang-ky/api-crm.md).
 */
import { domainToASCII, domainToUnicode } from 'node:url';
import { db, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { settings } from '../lib/settings.js';
import { enqueue } from '../jobs/queue.js';
import { getTld, priceFor } from './pricing.js';
import { canTien } from './choQuy.js';
import { dangKyKenh, type SuKienDon } from './suKienDon.js';
import type { Order, OrderItem } from './orders.js';

export type LoaiSuKienCrm = 'don_da_thanh_toan' | 'ten_mien_doi_han' | 'don_cho_quy' | 'don_loi';

/** CRM tra cac ma nay la loi du lieu / cau hinh: thu lai khong giup gi (giong MA_VINH_VIEN ben CRM). */
const MA_DUNG = [400, 401, 403, 404, 413, 415, 422];

function crmSanSang(): boolean {
  const c = settings.crm();
  return c.enabled && Boolean(c.url && c.key);
}

const ngay = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);
const ascii = (d: string) => domainToASCII(d) || d;

function trangThaiDong(item: OrderItem, trangThaiTenMien: string): string {
  if (item.status === 'active') return item.action === 'transfer' && trangThaiTenMien === 'pending' ? 'dang_chuyen' : 'thanh_cong';
  if (item.status === 'failed') return 'that_bai';
  if (item.status === 'refunded') return 'da_hoan';
  return 'dang_xu_ly'; // pending (ke ca dang giu) / processing: khach thay "dang xu ly"
}

/**
 * Anh chup don theo kiem-tra.ts ben CRM. Giam gia va VAT cua don chia theo ty
 * le thanh tien tung dong (lam tron xuong, phan du don vao dong cuoi), roi dong
 * cuoi bu chenh de tong `thanh_tien_sau_thue` bang dung `tong` cua don.
 */
export function anhChupDon(orderId: number): Record<string, unknown> | null {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as (Order & { updated_at: string }) | undefined;
  if (!o) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId) as OrderItem[];
  const u = db.prepare('SELECT id, email, full_name, phone FROM users WHERE id = ?').get(o.user_id) as
    { id: number; email: string; full_name: string; phone: string } | undefined;
  const tongA = items.reduce((n, i) => n + i.amount, 0);

  let conGiam = o.discount;
  let conThue = o.vat;
  const dong = items.map((i, idx) => {
    const cuoi = idx === items.length - 1;
    const giam = cuoi ? conGiam : tongA ? Math.floor((o.discount * i.amount) / tongA) : 0;
    const thue = cuoi ? conThue : tongA ? Math.floor((o.vat * i.amount) / tongA) : 0;
    conGiam -= giam;
    conThue -= thue;
    const tm = i.domain_id
      ? (db.prepare('SELECT status, expires_at FROM domains WHERE id = ?').get(i.domain_id) as { status: string; expires_at: string | null } | undefined)
      : undefined;
    const tld = getTld(i.tld);
    const suat = o.vat ? (tld?.vat_percent || settings.pricing().vatPercent) : 0;
    return {
      ma_dong: i.id,
      loai: i.action,
      ten_mien: ascii(i.domain),
      so_nam: i.years,
      thanh_tien: i.amount,
      giam_gia_phan_bo: giam,
      // Ngoai 0/5/8/10 thi CRM tra 422: gui dung so dang ap, de loi lo ra thay vi doan
      thue_suat: suat,
      tien_thue: thue,
      thanh_tien_sau_thue: i.amount - giam + thue,
      trang_thai: trangThaiDong(i, tm?.status ?? ''),
      trang_thai_ten_mien: tm?.status ?? '',
      het_han: ngay(tm?.expires_at),
      ten_mien_hien_thi: domainToUnicode(ascii(i.domain)),
    };
  });
  const lech = o.total - dong.reduce((n, d) => n + d.thanh_tien_sau_thue, 0);
  if (dong.length && lech) dong[dong.length - 1]!.thanh_tien_sau_thue += lech;

  const thanhToan = (db.prepare(`SELECT id, provider, amount, provider_txn, paid_at FROM payments WHERE order_id = ? AND status IN ('paid','refunded') AND paid_at IS NOT NULL ORDER BY id`)
    .all(orderId) as { id: number; provider: string; amount: number; provider_txn: string; paid_at: string }[])
    .map((p) => ({ ma: p.id, nguon: p.provider, so_tien: p.amount, ma_giao_dich: p.provider_txn, luc: p.paid_at }));

  return {
    ma_don: o.code,
    trang_thai: o.status,
    tao_luc: o.created_at,
    thanh_toan_luc: o.paid_at,
    chot_cap_phat_luc: o.completed_at,
    tong: o.total,
    da_thu: thanhToan.reduce((n, p) => n + p.so_tien, 0),
    da_hoan: dong.filter((d) => d.trang_thai === 'da_hoan').reduce((n, d) => n + d.thanh_tien_sau_thue, 0),
    thanh_toan: thanhToan,
    dong,
    nguoi_mua: {
      ma_tai_khoan_web: o.user_id,
      ho_ten: u?.full_name ?? '',
      email: u?.email ?? '',
      so_dien_thoai: u?.phone || null,
    },
    xuat_hoa_don: null,
  };
}

/** Than su kien day du (null khi du lieu da mat, vd don bi xoa). */
export function thanSuKien(loai: LoaiSuKienCrm, orderId: number, itemId?: number): Record<string, unknown> | null {
  const don = anhChupDon(orderId);
  if (!don) return null;
  const luc = nowIso();
  const item = itemId ? (db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as OrderItem | undefined) : undefined;

  if (loai === 'don_da_thanh_toan') {
    return { phien_ban: 1, su_kien: loai, ma_su_kien: `${loai}:${don['ma_don']}`, luc, don };
  }
  if (!item) return null;
  if (loai === 'ten_mien_doi_han') {
    const tm = db.prepare('SELECT * FROM domains WHERE domain = ? COLLATE NOCASE').get(item.domain) as
      { domain: string; tld: string; status: string; expires_at: string | null; user_id: number } | undefined;
    if (!tm?.expires_at) return null;
    const ten = ascii(tm.domain);
    const hetHan = ngay(tm.expires_at)!;
    const tld = getTld(tm.tld);
    return {
      phien_ban: 1, su_kien: loai, ma_su_kien: `${loai}:${ten}:${hetHan}:${tm.status}`, luc, don,
      ten_mien: {
        ten, het_han: hetHan, trang_thai: tm.status, ma_tai_khoan_web: tm.user_id,
        gia_gia_han_1_nam: tld ? priceFor(tld, 'renew', 1).total : null, ten_hien_thi: domainToUnicode(ten),
      },
      nguoi_mua: don['nguoi_mua'] && {
        ho_ten: (don['nguoi_mua'] as Record<string, unknown>)['ho_ten'],
        email: (don['nguoi_mua'] as Record<string, unknown>)['email'],
        so_dien_thoai: (don['nguoi_mua'] as Record<string, unknown>)['so_dien_thoai'],
      },
    };
  }
  // Hai loai moi, CRM chua nhan (de xuat trong api-crm.md)
  const chung = { phien_ban: 1, su_kien: loai, ma_su_kien: `${loai}:${don['ma_don']}:${item.id}`, luc, don };
  if (loai === 'don_cho_quy') return { ...chung, cho_quy: { ma_dong: item.id, ten_mien: ascii(item.domain), can: canTien(item), tu_luc: item.hold_since } };
  return { ...chung, loi: { ma_dong: item.id, ten_mien: ascii(item.domain), loai_giu: item.hold, ma_pa: item.pa_code, chi_tiet: item.error, tu_luc: item.hold_since } };
}

/** Xep mot su kien vao hang doi giao sang CRM. Khoa chong trung: cung loai, cung don/dong. */
export function xepSuKienCrm(loai: LoaiSuKienCrm, orderId: number, itemId?: number, nhan = ''): void {
  if (!crmSanSang()) return;
  enqueue('day_su_kien_crm', { loai, orderId, ...(itemId ? { itemId } : {}) }, {
    // `nhan` tach lan gui lai sau dang ky khoi lan gui dau (co the dang chay, da chup trang thai cu)
    dedupeKey: `crm:${loai}:${orderId}:${itemId ?? ''}:${nhan}`,
    // 5 giay luy thua, tran 30 phut: 11 lan la khoang 2 gio (runbook ben CRM)
    maxAttempts: 11,
  });
}

/** Ket qua giao: 'ok' | 'bo_qua' (khong con du lieu / CRM tat) | 'dung' (4xx, khong thu lai). Loi tam thoi thi nem. */
export async function giaoSuKienCrm(loai: LoaiSuKienCrm, orderId: number, itemId?: number): Promise<'ok' | 'bo_qua' | 'dung'> {
  const c = settings.crm();
  if (!c.enabled || !c.url || !c.key) return 'bo_qua';
  const than = thanSuKien(loai, orderId, itemId);
  if (!than) return 'bo_qua';
  const ma = String(than['ma_su_kien']);
  const cheKhoa = (s: string) => s.split(c.key).join('***');
  let res: Response;
  try {
    res = await fetch(`${c.url}/api/tich-hop/web-ten-mien/su-kien`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${c.key}`,
        'content-type': 'application/json',
        'idempotency-key': ma,
        'x-mtm-nguon': 'web-ten-mien',
      },
      body: JSON.stringify(than),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(cheKhoa(`Không gọi được CRM: ${err instanceof Error ? err.message : String(err)}`));
  }
  const text = cheKhoa((await res.text()).slice(0, 300));
  if (res.ok) {
    log.info('crm_su_kien_ok', { maSuKien: ma, status: res.status });
    return 'ok';
  }
  if (MA_DUNG.includes(res.status)) {
    log.warn('crm_su_kien_bi_tu_choi', { maSuKien: ma, status: res.status, phanHoi: text });
    return 'dung';
  }
  throw new Error(`CRM trả ${res.status}: ${text}`);
}

async function quaKenh(e: SuKienDon): Promise<void> {
  if (!crmSanSang()) return;
  if (e.loai === 'don_da_thanh_toan') xepSuKienCrm('don_da_thanh_toan', e.orderId);
  else if (e.loai === 'dang_ky_xong') {
    if (e.itemId) xepSuKienCrm('ten_mien_doi_han', e.orderId, e.itemId);
    // Gui lai anh chup: dong vua dang ky doi tu dang_xu_ly sang thanh_cong
    xepSuKienCrm('don_da_thanh_toan', e.orderId, undefined, `sau:${e.itemId ?? ''}`);
  } else if (settings.crm().suKienMoRong && e.itemId) {
    xepSuKienCrm(e.loai === 'cho_quy' ? 'don_cho_quy' : 'don_loi', e.orderId, e.itemId);
  }
}

dangKyKenh('crm', quaKenh);
