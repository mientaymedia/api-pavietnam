/**
 * Danh sach tinh thanh va phuong xa THEO DUNG TEN cua P.A.
 *
 * P.A tu choi ownerProvince / ownerWard / uiWard / adminWard viet khac tep
 * Tinh_thanh_Viet_Nam.xlsx va Phuong_xa_Viet_Nam.xlsx (ma loi 6020 den 6025),
 * nen form chi cho chon tu danh sach nay va may chu luon tra ve ten chuan.
 *
 * Thu tu tim tep:
 *   1. DIA_GIOI_FILE (neu dat)
 *   2. dia-gioi-pa.json canh tep CSDL: ban nap lai tu P.A bang `npm run pa:dia-gioi`
 *      tren may chu (thu muc du lieu la volume nen con sau khi build lai)
 *   3. ban dong goi src/data/dia-gioi-pa.json (chuyen tu xlsx, xem scripts/chuyen-dia-gioi-xlsx.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { log } from './logger.js';

export interface Phuong { id: number; ten: string }
export interface Tinh { id: number; ten: string; phuong: Phuong[] }
export interface DuLieuDiaGioi { nguon: string; cap_nhat: string; tinh: Tinh[] }

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEN_TEP_DIA_GIOI = 'dia-gioi-pa.json';

/** Tep ban nap lai tu P.A tren may chu (ghi canh CSDL). */
export function tepDiaGioiMayChu(): string {
  return process.env['DIA_GIOI_FILE'] || path.join(path.dirname(config.databaseFile), TEN_TEP_DIA_GIOI);
}

function tepDongGoi(): string {
  const canh = path.join(here, '..', 'data', TEN_TEP_DIA_GIOI);
  return fs.existsSync(canh) ? canh : path.join(here, '..', '..', 'src', 'data', TEN_TEP_DIA_GIOI);
}

let cache: { duLieu: DuLieuDiaGioi; tep: string } | null = null;

export function xoaCacheDiaGioi(): void {
  cache = null;
}

function hopLe(d: unknown): d is DuLieuDiaGioi {
  const x = d as DuLieuDiaGioi;
  return Boolean(x && Array.isArray(x.tinh) && x.tinh.length && x.tinh.every((t) => t && t.ten && Array.isArray(t.phuong)));
}

function nap(): { duLieu: DuLieuDiaGioi; tep: string } {
  if (cache) return cache;
  for (const tep of [tepDiaGioiMayChu(), tepDongGoi()]) {
    if (!fs.existsSync(tep)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(tep, 'utf8')) as unknown;
      if (hopLe(d)) {
        cache = { duLieu: d, tep };
        return cache;
      }
      log.warn('dia_gioi_khong_hop_le', { tep });
    } catch (err) {
      // Tep nap lai bi hong thi van con ban dong goi, khong de form chet
      log.warn('dia_gioi_doc_loi', { tep, error: String(err) });
    }
  }
  cache = { duLieu: { nguon: '', cap_nhat: '', tinh: [] }, tep: '' };
  return cache;
}

export function thongTinDiaGioi(): { nguon: string; capNhat: string; tep: string; soTinh: number; soPhuong: number } {
  const { duLieu, tep } = nap();
  return {
    nguon: duLieu.nguon,
    capNhat: duLieu.cap_nhat,
    tep,
    soTinh: duLieu.tinh.length,
    soPhuong: duLieu.tinh.reduce((n, t) => n + t.phuong.length, 0),
  };
}

/** Chuan hoa de so khop: NFC, chu thuong, gom khoang trang. Khong bo dau: "Hoà" va "Hòa" la hai ten khac nhau voi P.A. */
function khoa(s: string): string {
  return String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function danhSachTinh(): { id: number; ten: string }[] {
  return nap().duLieu.tinh.map((t) => ({ id: t.id, ten: t.ten }));
}

/** Tim tinh theo ma so hoac ten (dung ten P.A). */
export function timTinh(giaTri: string | number): Tinh | undefined {
  const s = String(giaTri ?? '').trim();
  if (!s) return undefined;
  const ds = nap().duLieu.tinh;
  if (/^\d+$/.test(s)) return ds.find((t) => t.id === Number(s));
  const k = khoa(s);
  return ds.find((t) => khoa(t.ten) === k);
}

export function phuongCuaTinh(tinh: string | number): Phuong[] {
  return timTinh(tinh)?.phuong ?? [];
}

/** Tim phuong xa thuoc tinh da chon; tra ve ten chuan cua P.A. */
export function timPhuong(tinh: string | number, phuong: string): Phuong | undefined {
  const k = khoa(phuong);
  if (!k) return undefined;
  return phuongCuaTinh(tinh).find((p) => khoa(p.ten) === k);
}
