/**
 * Mot cua duy nhat bao ra ngoai khi don / dong don doi trang thai quan trong:
 * da thanh toan, dang ky xong, cho nap quy, can nguoi xu ly, sai ho so.
 *
 * Vi sao gom mot cho: cung mot su kien can toi nhieu kenh (email quan tri,
 * Telegram, CRM). Goi tu khau cap phat chi mot dong, them kenh khong phai sua
 * khau cap phat. Moi kenh tu bat loi cua minh: bao that bai khong duoc lam hong
 * viec cap phat da xong.
 */
import { log } from '../lib/logger.js';

export type LoaiSuKien = 'don_da_thanh_toan' | 'dang_ky_xong' | 'cho_quy' | 'can_nguoi_xu_ly' | 'sai_ho_so';

export interface SuKienDon {
  loai: LoaiSuKien;
  orderId: number;
  orderCode: string;
  userId: number;
  /** Dong don lien quan (khong co voi don_da_thanh_toan). */
  itemId?: number;
  domain?: string;
  /** ReturnCode P.A va loi doc duoc (giu don). */
  maPA?: string;
  loi?: string;
  /** Ngay het han (dang_ky_xong). */
  expiresAt?: string | null;
  /** So tien don (don_da_thanh_toan) hoac so tien can cho dong nay (cho_quy). */
  soTien?: number;
}

export type KenhSuKien = (e: SuKienDon) => Promise<void>;

const kenh: { ten: string; gui: KenhSuKien }[] = [];

/** Dang ky mot kenh nhan su kien (email, Telegram, CRM...). */
export function dangKyKenh(ten: string, gui: KenhSuKien): void {
  if (!kenh.some((k) => k.ten === ten)) kenh.push({ ten, gui });
}

export async function phatSuKien(e: SuKienDon): Promise<void> {
  for (const k of kenh) {
    try {
      await k.gui(e);
    } catch (err) {
      log.warn('su_kien_kenh_loi', { kenh: k.ten, loai: e.loai, orderCode: e.orderCode, error: String(err) });
    }
  }
}
