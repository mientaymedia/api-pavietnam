/**
 * Tim ten mien cung AI: khach mo ta y tuong, AI de xuat ten, may chu chuan hoa,
 * loc, roi KIEM TRA THAT qua P.A truoc khi bao "Con trong".
 *
 * Nguyen tac (intent tra-cuu-ai, chu chot 18/10/2026):
 * - Trang thai khong bao gio lay tu AI. "Con trong" chi khi P.A (hoac bo dem
 *   120 giay cua chinh ket qua P.A) tra co; moi truong hop khac la "Chua kiem
 *   tra duoc" hoac "Da co nguoi dang ky".
 * - Khong luu, khong ghi log nguyen van mo ta. Chi giu so dem an danh theo ngay.
 * - Tran chi phi ngay doc tu CSDL (ben qua khoi dong lai), cham tran thi tat AI
 *   den het ngay gio Viet Nam; o tim thuong khong lien quan.
 */
import { db, nowIso } from '../db/index.js';
import { settings } from '../lib/settings.js';
import { boDau } from '../lib/text.js';
import { domainSchema } from '../lib/validate.js';
import { log } from '../lib/logger.js';
import { AiError, MAX_TOKEN_RA, layNhaCungCap, type NhaCungCapGoiY } from '../lib/ai/index.js';
import type { CheckResult } from '../pavietnam/types.js';
import { listTlds, priceFor, type PriceBreakdown, type Tld } from './pricing.js';
import { kiemTraNhieu } from './domains.js';

export const MO_TA_TOI_THIEU = 3;
export const MO_TA_TOI_DA = 200;
/** So duoi toi da cho moi ten (chu chot: 8 ten x 2 duoi = 16 lenh P.A). */
const DUOI_MOI_TEN = 2;
const LY_DO_TOI_DA = 120;
/**
 * Token vao uoc tinh xau nhat khi khong co usage (het gio, mat mang): chi dan
 * he thong khoang 250 token + mo ta 200 ky tu, lam tron len cho an toan.
 */
const TOKEN_VAO_XAU_NHAT = 500;

/* ---------------------------------------------------------- thong ke ngay */

type CotDem = 'calls' | 'blocked' | 'errors' | 'suggested' | 'available' | 'added_to_cart';

/** Ngay theo gio Viet Nam (UTC+7, khong co gio mua he): moc reset tran chi phi. */
export function ngayVn(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

export function demThongKe(cot: CotDem, soLuong = 1): void {
  if (soLuong <= 0) return;
  // Ten cot lay tu kieu CotDem co dinh, khong tu du lieu nguoi dung
  db.prepare(
    `INSERT INTO ai_usage_daily (day, ${cot}, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET ${cot} = ${cot} + excluded.${cot}, updated_at = excluded.updated_at`,
  ).run(ngayVn(), soLuong, nowIso());
}

/** Chi phi uoc tinh (VND) tu so token va don gia trong Cau hinh. */
export function uocTinhChiPhi(tokenVao: number, tokenRa: number): number {
  const ai = settings.ai();
  return ((tokenVao * ai.priceInputUsd + tokenRa * ai.priceOutputUsd) / 1_000_000) * ai.usdVnd;
}

function congChiPhi(tokenVao: number, tokenRa: number): number {
  const vnd = uocTinhChiPhi(tokenVao, tokenRa);
  db.prepare(
    `INSERT INTO ai_usage_daily (day, tokens_in, tokens_out, cost_vnd, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out,
       cost_vnd = cost_vnd + excluded.cost_vnd, updated_at = excluded.updated_at`,
  ).run(ngayVn(), tokenVao, tokenRa, vnd, nowIso());
  return vnd;
}

export function chiPhiHomNay(): number {
  const row = db.prepare('SELECT cost_vnd FROM ai_usage_daily WHERE day = ?').get(ngayVn()) as
    | { cost_vnd: number }
    | undefined;
  return row?.cost_vnd ?? 0;
}

export interface DongThongKe {
  day: string;
  calls: number;
  blocked: number;
  errors: number;
  suggested: number;
  available: number;
  added_to_cart: number;
  tokens_in: number;
  tokens_out: number;
  cost_vnd: number;
}

export function thongKeGanDay(soNgay = 14): DongThongKe[] {
  return db
    .prepare(
      `SELECT day, calls, blocked, errors, suggested, available, added_to_cart, tokens_in, tokens_out, cost_vnd
       FROM ai_usage_daily ORDER BY day DESC LIMIT ?`,
    )
    .all(soNgay) as DongThongKe[];
}

/* ---------------------------------------------------------- bat / tat */

export type TrangThaiAi = 'san-sang' | 'tat' | 'thieu-cau-hinh' | 'cham-tran';

export function trangThaiAi(): TrangThaiAi {
  const ai = settings.ai();
  if (!ai.enabled) return 'tat';
  if (!ai.openaiKey || !ai.model) return 'thieu-cau-hinh';
  if (chiPhiHomNay() >= ai.dailyCapVnd) return 'cham-tran';
  return 'san-sang';
}

export const aiSanSang = (): boolean => trangThaiAi() === 'san-sang';

/* ---------------------------------------------------------- chuan hoa, loc */

/** Gop khoang trang, kiem do dai theo ky tu (khong theo byte). Sai thi null. */
export function chuanHoaMoTa(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const dai = [...s].length;
  return dai >= MO_TA_TOI_THIEU && dai <= MO_TA_TOI_DA ? s : null;
}

/**
 * Ten AI tra ve -> nhan ten mien ASCII khong dau, hoac null neu khong dung duoc.
 * Duoi AI tu kem (vd "abc.xyz") bi bo: duoi luon lay tu danh sach dang ban.
 * Qua dai thi LOAI chu khong cat: cat giua chung tao ra ten vo nghia.
 */
export function chuanHoaTen(raw: string): string | null {
  let s = boDau(String(raw ?? '')).trim();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '');
  s = s.split('.')[0] ?? '';
  s = s
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length >= 2 && s.length <= 63 ? s : null;
}

/** Danh sach tu cam trong Cau hinh (phay, cham phay hoac xuong dong) -> dang da bo dau. */
export function tachTuCam(text: string): string[] {
  return text
    .split(/[,;\r\n]+/)
    .map((w) => boDau(w).replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
}

/**
 * Tu tu 4 ky tu: khop chuoi con tren ten da bo gach noi ("honda" chan
 * "hondacantho"). Tu ngan hon: chi khop nguyen mot khuc giua cac gach noi,
 * vi khop chuoi con se chan nham ("bet" nam trong "betong").
 */
export function biCam(nhan: string, tuCam: string[]): boolean {
  const lien = nhan.replace(/-/g, '');
  const khuc = nhan.split('-');
  return tuCam.some((w) => (w.length >= 4 ? lien.includes(w) : khuc.includes(w)));
}

/** Duoi khach chon (chi duoi dang ban), khong chon thi duoi noi bat, toi da 2. */
export function chonDuoi(duoiKhach: string[]): Tld[] {
  const tlds = listTlds({ activeOnly: true });
  const xep = [...tlds.filter((t) => t.is_featured), ...tlds.filter((t) => !t.is_featured)];
  const muon = new Set(duoiKhach.map((d) => String(d).replace(/^\./, '').trim().toLowerCase()));
  const chon = xep.filter((t) => muon.has(t.tld.toLowerCase()));
  if (chon.length) return chon.slice(0, DUOI_MOI_TEN);
  const noiBat = xep.filter((t) => t.is_featured);
  return (noiBat.length ? noiBat : xep).slice(0, DUOI_MOI_TEN);
}

function lamSachLyDo(s: string): string {
  const sach = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const kyTu = [...sach];
  return kyTu.length > LY_DO_TOI_DA ? `${kyTu.slice(0, LY_DO_TOI_DA - 3).join('')}...` : sach;
}

/* ---------------------------------------------------------- goi y */

export interface DongGoiY {
  domain: string;
  sld: string;
  tld: string;
  lyDo: string;
  trangThai: 'con-trong' | 'da-co-chu' | 'chua-kiem-tra';
  price: PriceBreakdown | null;
  requiresVnContact: boolean;
}

export type KetQuaGoiYTenMien =
  | { loai: 'ok'; dong: DongGoiY[] }
  | { loai: 'tat' | 'het-han-muc' | 'khong-hop-le' | 'loi' | 'trong'; thongBao: string };

export const THONG_BAO = {
  tat: 'Tính năng Tìm cùng AI đang tạm tắt. Bạn vẫn tìm tên miền theo từ khóa được như thường.',
  'het-han-muc': 'Tìm cùng AI đã dùng hết lượt của hôm nay. Bạn vẫn tìm tên miền theo từ khóa được như thường, hoặc quay lại vào ngày mai.',
  'khong-hop-le': `Bạn mô tả ngắn gọn trong khoảng ${MO_TA_TOI_THIEU} đến ${MO_TA_TOI_DA} ký tự nhé.`,
  loi: 'Hiện chưa gợi ý được tên, bạn thử lại sau ít phút hoặc tìm theo từ khóa.',
  trong: 'Chưa có tên phù hợp từ mô tả này. Bạn thử mô tả cụ thể hơn, ví dụ ngành nghề và địa điểm.',
} as const;

export interface PhuThuocGoiY {
  nhaCungCap?: NhaCungCapGoiY;
  /** Bo kiem tra gui P.A; test truyen ban gia de dem so lenh. */
  kiem?: (ds: string[]) => Promise<CheckResult[]>;
}

export async function goiYTenMien(
  input: { moTa: unknown; duoi?: string[] },
  deps: PhuThuocGoiY = {},
): Promise<KetQuaGoiYTenMien> {
  const trangThai = trangThaiAi();
  if (trangThai === 'cham-tran') {
    demThongKe('blocked');
    return { loai: 'het-han-muc', thongBao: THONG_BAO['het-han-muc'] };
  }
  if (trangThai !== 'san-sang') return { loai: 'tat', thongBao: THONG_BAO.tat };

  const moTa = chuanHoaMoTa(input.moTa);
  if (!moTa) return { loai: 'khong-hop-le', thongBao: THONG_BAO['khong-hop-le'] };

  const ai = settings.ai();
  const nhaCungCap = deps.nhaCungCap ?? layNhaCungCap();
  const batDau = Date.now();
  demThongKe('calls');

  let goiY: { ten: string; lyDo: string }[];
  try {
    const kq = await nhaCungCap.goiY({ moTa, soTen: ai.maxNames });
    const chiPhi = congChiPhi(kq.tokenVao, kq.tokenRa);
    goiY = kq.goiY;
    log.info('ai_goi_y', {
      nhaCungCap: nhaCungCap.ten, ms: Date.now() - batDau, tokenVao: kq.tokenVao, tokenRa: kq.tokenRa,
      chiPhiVnd: Math.round(chiPhi), soTenAi: kq.goiY.length,
    });
  } catch (err) {
    demThongKe('errors');
    if (err instanceof AiError) {
      if (err.tokenVao !== undefined || err.tokenRa !== undefined) {
        congChiPhi(err.tokenVao ?? 0, err.tokenRa ?? 0);
      } else if (err.ma === 'timeout' || err.ma === 'mang') {
        // Yeu cau co the da toi va bi tinh tien du ta khong nhan duoc tra loi:
        // cong muc xau nhat de tran ngay khong bi vuot vi chuoi loi het gio.
        congChiPhi(TOKEN_VAO_XAU_NHAT, MAX_TOKEN_RA);
      }
      log.warn('ai_goi_y_loi', { ma: err.ma, status: err.status, message: err.message, ms: Date.now() - batDau });
    } else {
      log.error('ai_goi_y_loi', { ma: 'khac', error: err instanceof Error ? err.name : 'unknown' });
    }
    return { loai: 'loi', thongBao: THONG_BAO.loi };
  }

  // Chuan hoa, bo trung, loc tu cam TRUOC khi gui P.A
  const tuCam = tachTuCam(ai.blockedWords);
  const ten: { sld: string; lyDo: string }[] = [];
  for (const g of goiY) {
    const sld = chuanHoaTen(g.ten);
    if (!sld || biCam(sld, tuCam) || ten.some((t) => t.sld === sld)) continue;
    ten.push({ sld, lyDo: lamSachLyDo(g.lyDo) });
    if (ten.length >= ai.maxNames) break;
  }
  demThongKe('suggested', ten.length);

  const duoi = chonDuoi(input.duoi ?? []);
  const ungVien: { sld: string; lyDo: string; tld: Tld; domain: string }[] = [];
  for (const t of ten) {
    for (const d of duoi) {
      const domain = `${t.sld}.${d.tld}`;
      if (domainSchema.safeParse(domain).success) ungVien.push({ ...t, tld: d, domain });
    }
  }
  const canKiem = ungVien.slice(0, ai.maxChecks);
  if (!canKiem.length) return { loai: 'trong', thongBao: THONG_BAO.trong };

  const { fresh } = await kiemTraNhieu(
    canKiem.map((u) => u.domain),
    ...(deps.kiem ? [deps.kiem] : []),
  );

  const thuTu = { 'con-trong': 0, 'chua-kiem-tra': 1, 'da-co-chu': 2 } as const;
  const dong: DongGoiY[] = canKiem
    .map((u) => {
      const hit = fresh.get(u.domain);
      const trangThaiDong: DongGoiY['trangThai'] = !hit ? 'chua-kiem-tra' : hit.available ? 'con-trong' : 'da-co-chu';
      return {
        domain: u.domain,
        sld: u.sld,
        tld: u.tld.tld,
        lyDo: u.lyDo,
        trangThai: trangThaiDong,
        price: trangThaiDong === 'con-trong' ? priceFor(u.tld, 'register', 1) : null,
        requiresVnContact: u.tld.requires_vn_contact === 1,
      };
    })
    // sort cua JS on dinh: trong cung nhom giu thu tu AI de xuat
    .sort((a, b) => thuTu[a.trangThai] - thuTu[b.trangThai]);

  demThongKe('available', dong.filter((d) => d.trangThai === 'con-trong').length);
  return { loai: 'ok', dong };
}
