/**
 * NAP LAI danh sach tinh thanh, phuong xa tu chinh P.A (get_province, get_ward).
 * Chay TREN MAY CHU co IP da whitelist:
 *
 *   npm run pa:dia-gioi            # chi doc va in tom tat, khong ghi
 *   npm run pa:dia-gioi -- --ghi   # ghi dia-gioi-pa.json canh tep CSDL
 *
 * Vi sao: tep xlsx kem tai lieu co the cu hon du lieu P.A dang kiem. Ban nap lai
 * ghi vao thu muc du lieu (volume, con sau khi build lai) va duoc uu tien hon
 * ban dong goi (xem src/lib/diaGioi.ts). Thieu bat ky tinh nao thi KHONG ghi:
 * mot danh sach thieu con te hon danh sach cu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ACTIONS } from './actions.js';
import { call } from './client.js';
import { docPhanHoiPA, pick, type Flat } from './parse.js';
import { tepDiaGioiMayChu, xoaCacheDiaGioi, type DuLieuDiaGioi, type Tinh } from '../lib/diaGioi.js';

/**
 * Tai lieu chi ghi "File json danh sach", khong mo ta truong. Doc mem: mang
 * (hoac mang long trong object) cac doi tuong co ma so va ten.
 */
export function docDanhSach(raw: string): { id: number; ten: string }[] {
  let goc: unknown;
  try {
    goc = JSON.parse(String(raw ?? '').replace(/^﻿/, '').trim());
  } catch {
    return [];
  }
  const mang = Array.isArray(goc)
    ? goc
    : goc && typeof goc === 'object'
      ? (Object.values(goc as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined)
        ?? Object.entries(goc as Record<string, unknown>).map(([k, v]) => (typeof v === 'string' ? { id: k, name: v } : v))
      : [];
  const out: { id: number; ten: string }[] = [];
  for (const muc of mang) {
    if (!muc || typeof muc !== 'object') continue;
    const dong = Object.fromEntries(Object.entries(muc as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v])) as Flat;
    const id = Number(pick(dong, ['id', 'province_id', 'ward_id', 'ma', 'code', 'matinh', 'maxa']));
    const ten = String(pick(dong, ['name', 'province_name', 'ward_name', 'ten', 'title', 'tentinh', 'tenxa']) ?? '')
      .normalize('NFC').replace(/\s+/g, ' ').trim();
    if (Number.isFinite(id) && id > 0 && ten) out.push({ id, ten });
  }
  return out;
}

export async function napTuPA(): Promise<DuLieuDiaGioi> {
  const resTinh = await call(ACTIONS.province, {});
  const dsTinh = docDanhSach(resTinh.raw);
  if (!dsTinh.length) {
    const pa = docPhanHoiPA(resTinh.raw);
    throw new Error(`get_province không trả danh sách: ${pa.returnCode ?? ''} ${pa.returnText || resTinh.raw.slice(0, 200)}`.trim());
  }
  const tinh: Tinh[] = [];
  for (const t of dsTinh) {
    const res = await call(ACTIONS.ward, { province_id: t.id });
    const phuong = docDanhSach(res.raw).sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
    if (!phuong.length) throw new Error(`get_ward không trả phường xã nào cho ${t.ten} (mã ${t.id}), không ghi tệp.`);
    tinh.push({ id: t.id, ten: t.ten, phuong });
  }
  return { nguon: 'P.A get_province, get_ward', cap_nhat: new Date().toISOString().slice(0, 10), tinh };
}

/** Ghi nguyen tu (tep tam roi doi ten): tien trinh web dang doc khong gap tep do dang. */
export function ghiDiaGioi(duLieu: DuLieuDiaGioi, tep = tepDiaGioiMayChu()): string {
  fs.mkdirSync(path.dirname(tep), { recursive: true });
  const tam = `${tep}.tmp`;
  fs.writeFileSync(tam, `${JSON.stringify(duLieu)}\n`, 'utf8');
  fs.renameSync(tam, tep);
  xoaCacheDiaGioi();
  return tep;
}

const chayTrucTiep = process.argv[1] !== undefined && /pavietnam[/\\]napDiaGioi\.(ts|js)$/.test(process.argv[1]);
if (chayTrucTiep) {
  napTuPA()
    .then((d) => {
      const soPhuong = d.tinh.reduce((n, t) => n + t.phuong.length, 0);
      console.log(`Đọc được ${d.tinh.length} tỉnh thành, ${soPhuong} phường xã từ P.A.`);
      if (process.argv.includes('--ghi')) {
        console.log(`Đã ghi ${ghiDiaGioi(d)}. Tiến trình web dùng bản mới từ lần khởi động kế tiếp.`);
      } else {
        console.log('Chưa ghi (thêm --ghi để ghi).');
      }
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
