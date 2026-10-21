/**
 * Cong "Tai khoan MienTay" (docs/mtm/tai-khoan-chung/spec.md): cung app, cung
 * phien voi BASE_PATH, phuc vu them o CONG_TAI_KHOAN_PATH (vd /tai-khoan).
 *
 * O cong, `next` la duong dan TREN HOST (/ten-mien/control-panel, /bang-gia cua
 * site chinh), khong phai duong dan trong app nhu o /ten-mien: cong la cua
 * chung cho nhieu san pham nen phai quay ve duoc ca trang ngoai app.
 */
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { BASE, chuyenTuyetDoi } from './basePath.js';
import { duongDanNoiBo } from './redirect.js';

/** Tien to cua cong; rong la cong tat. */
export const CONG = config.congTaiKhoanPath;

/** Yeu cau dang chay trong router cua cong (req.baseUrl la tien to noi router duoc gan). */
export function laCong(req: Request): boolean {
  return Boolean(CONG) && req.baseUrl === CONG;
}

/** Trang mac dinh sau dang nhap o cong: trang chon san pham. */
export const DICH_MAC_DINH = CONG ? `${CONG}/` : '/';

// Trang dang nhap, dang ky, dang xuat cua ca hai noi: lam dich thi khach dang
// nhap xong lai thay form dang nhap (vong lap), nen bo.
const TRANG_XAC_THUC = /^\/(dang-nhap|dang-ky|dang-xuat|quen-mat-khau|dat-lai-mat-khau)(\/|\?|#|$)/;

/**
 * Dich sau dang nhap o cong. Dung lai duongDanNoiBo (chan //evil, /\evil,
 * https://, /.//evil, ky tu dieu khien), roi bo cac trang xac thuc cua cong va
 * cua /ten-mien. Khong hop le thi ve trang chon san pham.
 */
export function dichCong(value: unknown): string {
  const p = duongDanNoiBo(value, DICH_MAC_DINH);
  for (const tienTo of [CONG, BASE]) {
    if (!tienTo) continue;
    if (p === tienTo || p.startsWith(`${tienTo}/`) || p.startsWith(`${tienTo}?`)) {
      const con = p.slice(tienTo.length) || '/';
      if (TRANG_XAC_THUC.test(con)) return DICH_MAC_DINH;
    }
  }
  return p;
}

/** Duong dan tren host cua mot trang trong cong. */
export function congUrl(p: string): string {
  return `${CONG}${p}`;
}

// Trang cua cong co form gui ve route san co cua /ten-mien (doi mat khau, ho
// so, huy lien ket): truong an quay_ve chi nhan dung cac gia tri nay.
const QUAY_VE: Record<string, string> = { 'ho-so': '/ho-so', 'bao-mat': '/bao-mat', 'lien-ket': '/lien-ket' };

/**
 * Xong mot thao tac tai khoan: ve trang cua cong neu form gui tu cong (quay_ve
 * hop le), khong thi ve /ten-mien/tai-khoan nhu cu. Gia tri la thi bo qua.
 */
export function veTaiKhoan(req: Request, res: Response): void {
  const ma = String((req.body as Record<string, unknown> | undefined)?.['quay_ve'] ?? '');
  const ve = CONG && Object.hasOwn(QUAY_VE, ma) ? QUAY_VE[ma] : undefined;
  if (ve) return chuyenTuyetDoi(res, congUrl(ve));
  res.redirect('/tai-khoan');
}
