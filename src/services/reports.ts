/**
 * Bao cao kinh doanh.
 *
 * DINH NGHIA DOANH THU (quan trong - moi con so duoi day deu dua tren no):
 * chi tinh nhung dong don hang DA KICH HOAT (`status='active'`) thuoc don da
 * thanh toan. Dong that bai hoac da hoan tien KHONG duoc tinh - neu tinh ca
 * chung thi bao cao se cao hon tien thuc nhan.
 *
 * GIA VON lay tu bang gia (`cost_register`, `cost_renew`). Day la gia von tai
 * THOI DIEM XEM bao cao, khong phai luc ban - vi he thong khong chup lai gia von
 * vao don hang. Neu ban doi gia von trong bang gia, so lai cua ky cu se doi theo.
 */
import { db } from '../db/index.js';

/** Cac trang thai don duoc tinh vao doanh thu. */
const DON_DA_THU_TIEN = `('paid','processing','completed','partially_completed')`;

/**
 * Gia von cua mot dong don hang.
 * Nam dau tinh gia von dang ky, cac nam sau tinh gia von gia han - dung cach
 * he thong tinh gia ban, de con so lai co y nghia.
 */
const BIEU_THUC_GIA_VON = `
  CASE i.action
    WHEN 'register' THEN COALESCE(t.cost_register, 0) + COALESCE(t.cost_renew, 0) * (i.years - 1)
    ELSE COALESCE(t.cost_renew, t.cost_register, 0) * i.years
  END`;

export interface DongTheoThang {
  thang: string;        // '2026-08'
  doanhThu: number;
  giaVon: number;
  lai: number;
  soDon: number;
  soTenMien: number;
}

/** Doanh thu, gia von va lai theo tung thang. */
export function doanhThuTheoThang(soThang = 12): DongTheoThang[] {
  const rows = db
    .prepare(
      `SELECT substr(o.paid_at, 1, 7) AS thang,
              SUM(i.amount)            AS doanhThu,
              SUM(${BIEU_THUC_GIA_VON}) AS giaVon,
              COUNT(DISTINCT o.id)     AS soDon,
              COUNT(i.id)              AS soTenMien
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN tlds t ON t.tld = i.tld COLLATE NOCASE
       WHERE i.status = 'active'
         AND o.status IN ${DON_DA_THU_TIEN}
         AND o.paid_at IS NOT NULL
       GROUP BY thang
       ORDER BY thang DESC
       LIMIT ?`,
    )
    .all(soThang) as { thang: string; doanhThu: number; giaVon: number; soDon: number; soTenMien: number }[];

  const theoThang = new Map(rows.map((r) => [r.thang, r]));

  // Sinh du DAY DU cac thang, ke ca thang khong co doanh thu.
  // Neu chi tra ve thang co du lieu thi truc thoi gian bi dut quang va bieu do
  // hieu sai xu huong - thang e am se bien mat thay vi hien ra la mot cot rong.
  const ketQua: DongTheoThang[] = [];
  const moc = new Date();
  moc.setUTCDate(1);

  for (let i = soThang - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(moc.getUTCFullYear(), moc.getUTCMonth() - i, 1));
    const thang = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const r = theoThang.get(thang);
    ketQua.push({
      thang,
      doanhThu: r?.doanhThu ?? 0,
      giaVon: r?.giaVon ?? 0,
      lai: (r?.doanhThu ?? 0) - (r?.giaVon ?? 0),
      soDon: r?.soDon ?? 0,
      soTenMien: r?.soTenMien ?? 0,
    });
  }
  return ketQua;
}

export interface DongTheoDuoi {
  tld: string;
  soLuong: number;
  doanhThu: number;
  giaVon: number;
  lai: number;
  tyLeLai: number;
}

/** Doanh thu va lai theo tung duoi ten mien. */
export function doanhThuTheoDuoi(): DongTheoDuoi[] {
  const rows = db
    .prepare(
      `SELECT i.tld                     AS tld,
              COUNT(i.id)               AS soLuong,
              SUM(i.amount)             AS doanhThu,
              SUM(${BIEU_THUC_GIA_VON}) AS giaVon
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN tlds t ON t.tld = i.tld COLLATE NOCASE
       WHERE i.status = 'active' AND o.status IN ${DON_DA_THU_TIEN}
       GROUP BY i.tld
       ORDER BY doanhThu DESC`,
    )
    .all() as { tld: string; soLuong: number; doanhThu: number; giaVon: number }[];

  return rows.map((r) => {
    const doanhThu = r.doanhThu ?? 0;
    const giaVon = r.giaVon ?? 0;
    const lai = doanhThu - giaVon;
    return {
      tld: r.tld,
      soLuong: r.soLuong,
      doanhThu,
      giaVon,
      lai,
      tyLeLai: doanhThu > 0 ? Math.round((lai / doanhThu) * 100) : 0,
    };
  });
}

/** Tien thuc nhan theo tung phuong thuc thanh toan. */
export function theoPhuongThuc(): { provider: string; soGiaoDich: number; tongTien: number }[] {
  return db
    .prepare(
      `SELECT provider, COUNT(*) AS soGiaoDich, SUM(amount) AS tongTien
       FROM payments WHERE status = 'paid'
       GROUP BY provider ORDER BY tongTien DESC`,
    )
    .all() as { provider: string; soGiaoDich: number; tongTien: number }[];
}

export interface MocGiaHan {
  soNgay: number;
  soTenMien: number;
  duKienDoanhThu: number;
}

/**
 * Du bao doanh thu gia han: ten mien sap het han va so tien se thu neu khach
 * gia han het. Day la con so DU KIEN, khong phai cam ket.
 */
export function duBaoGiaHan(cacMoc = [30, 60, 90]): MocGiaHan[] {
  return cacMoc.map((soNgay) => {
    const moc = new Date(Date.now() + soNgay * 86_400_000).toISOString();
    const r = db
      .prepare(
        `SELECT COUNT(*) AS soTenMien,
                COALESCE(SUM(COALESCE(t.price_renew, t.price_register, 0)), 0) AS duKien
         FROM domains d
         LEFT JOIN tlds t ON t.tld = d.tld COLLATE NOCASE
         WHERE d.status = 'active' AND d.expires_at IS NOT NULL AND d.expires_at <= ?`,
      )
      .get(moc) as { soTenMien: number; duKien: number };
    return { soNgay, soTenMien: r.soTenMien, duKienDoanhThu: r.duKien };
  });
}

/** Khach hang dong gop doanh thu nhieu nhat. */
export function khachHangHangDau(gioiHan = 10): { email: string; hoTen: string; soTenMien: number; doanhThu: number }[] {
  return db
    .prepare(
      `SELECT u.email, u.full_name AS hoTen,
              COUNT(i.id) AS soTenMien, SUM(i.amount) AS doanhThu
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       JOIN users u ON u.id = o.user_id
       WHERE i.status = 'active' AND o.status IN ${DON_DA_THU_TIEN}
       GROUP BY u.id ORDER BY doanhThu DESC LIMIT ?`,
    )
    .all(gioiHan) as { email: string; hoTen: string; soTenMien: number; doanhThu: number }[];
}

export interface TongQuanKinhDoanh {
  doanhThu: number;
  giaVon: number;
  lai: number;
  tyLeLai: number;
  soTenMien: number;
  soKhachHang: number;
  giaTriDonTrungBinh: number;
  daHoanTien: number;
}

/** Tong quan toan thoi gian. */
export function tongQuan(): TongQuanKinhDoanh {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(i.amount), 0)             AS doanhThu,
              COALESCE(SUM(${BIEU_THUC_GIA_VON}), 0) AS giaVon,
              COUNT(i.id)                            AS soTenMien,
              COUNT(DISTINCT o.user_id)              AS soKhachHang,
              COUNT(DISTINCT o.id)                   AS soDon
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN tlds t ON t.tld = i.tld COLLATE NOCASE
       WHERE i.status = 'active' AND o.status IN ${DON_DA_THU_TIEN}`,
    )
    .get() as { doanhThu: number; giaVon: number; soTenMien: number; soKhachHang: number; soDon: number };

  const hoan = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS n FROM wallet_transactions WHERE kind = 'refund'`)
    .get() as { n: number };

  const lai = r.doanhThu - r.giaVon;
  return {
    doanhThu: r.doanhThu,
    giaVon: r.giaVon,
    lai,
    tyLeLai: r.doanhThu > 0 ? Math.round((lai / r.doanhThu) * 100) : 0,
    soTenMien: r.soTenMien,
    soKhachHang: r.soKhachHang,
    giaTriDonTrungBinh: r.soDon > 0 ? Math.round(r.doanhThu / r.soDon) : 0,
    daHoanTien: hoan.n,
  };
}

/* ------------------------------------------------------------ xuat du lieu */

/**
 * Chuyen bang du lieu thanh CSV.
 *
 * Hai chi tiet bat buoc de Excel doc dung file tieng Viet:
 *  - Them BOM UTF-8 o dau file, khong thi Excel hien chu co dau thanh ky tu la
 *  - Boc gia tri trong dau nhay kep va nhan doi dau nhay ben trong
 */
export type OCsv = string | number | null | undefined;

export function toCsv(header: string[], rows: OCsv[][]): string {
  const oCsv = (v: OCsv) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const noiDung = [header.map(oCsv).join(','), ...rows.map((r) => r.map(oCsv).join(','))].join('\r\n');
  return `﻿${noiDung}\r\n`;
}

export function xuatDonHang(): string {
  const rows = db
    .prepare(
      `SELECT o.code, o.created_at, o.paid_at, o.status, u.email,
              i.domain, i.action, i.years, i.amount, i.status AS trangThaiDong
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
       JOIN users u ON u.id = o.user_id
       ORDER BY o.id DESC LIMIT 10000`,
    )
    .all() as Record<string, string | number>[];

  return toCsv(
    ['Ma don', 'Ngay tao', 'Ngay thanh toan', 'Trang thai don', 'Email khach', 'Ten mien', 'Dich vu', 'So nam', 'Thanh tien', 'Trang thai dong'],
    rows.map((r) => [
      r['code'] ?? '', r['created_at'] ?? '', r['paid_at'] ?? '', r['status'] ?? '', r['email'] ?? '',
      r['domain'] ?? '', r['action'] ?? '', r['years'] ?? '', r['amount'] ?? '', r['trangThaiDong'] ?? '',
    ]),
  );
}

export function xuatTenMien(): string {
  const rows = db
    .prepare(
      `SELECT d.domain, d.tld, d.status, d.registered_at, d.expires_at, d.auto_renew,
              d.transfer_lock, u.email, c.full_name, c.org_name, c.tax_code, c.id_number
       FROM domains d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN contacts c ON c.id = d.contact_id
       ORDER BY d.expires_at IS NULL, d.expires_at LIMIT 10000`,
    )
    .all() as Record<string, string | number | null>[];

  return toCsv(
    ['Ten mien', 'Duoi', 'Trang thai', 'Ngay dang ky', 'Ngay het han', 'Tu gia han', 'Khoa chuyen doi', 'Email tai khoan', 'Chu the', 'To chuc', 'Ma so thue', 'CMND/CCCD'],
    rows.map((r) => [
      r['domain'], r['tld'], r['status'], r['registered_at'], r['expires_at'],
      r['auto_renew'] ? 'Co' : 'Khong', r['transfer_lock'] ? 'Co' : 'Khong',
      r['email'], r['full_name'], r['org_name'], r['tax_code'], r['id_number'],
    ]),
  );
}

export function xuatDoanhThu(soThang = 24): string {
  return toCsv(
    ['Thang', 'Doanh thu', 'Gia von', 'Lai', 'Ty le lai (%)', 'So don', 'So ten mien'],
    doanhThuTheoThang(soThang).map((r) => [
      r.thang, r.doanhThu, r.giaVon, r.lai,
      r.doanhThu > 0 ? Math.round((r.lai / r.doanhThu) * 100) : 0,
      r.soDon, r.soTenMien,
    ]),
  );
}
