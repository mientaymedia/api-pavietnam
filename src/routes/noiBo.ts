/**
 * CONG MAY NOI BO cho CRM: /api/noi-bo/* (dac ta docs/mtm/pa-dang-ky/api-crm.md).
 *
 * CRM goi bang client san co (crm-mientaymedia src/server/tich-hop/web-client.ts):
 * `Authorization: Bearer <WEB_TEN_MIEN_KEY>`, `content-type: application/json`,
 * `x-mtm-nguon: crm`. Loi tra `{ error, ma_loi }`; 4xx la loi du lieu / khoa
 * (CRM khong thu lai), 5xx / 429 thu lai duoc.
 *
 *  - GET  /api/noi-bo/trang-thai : so du P.A, don cho quy (kem tong can nap), don loi kem ma P.A
 *  - POST /api/noi-bo/kich-hoat  : kiem so du roi dang ky don cho quy (tuy chon mot don).
 *    Dung chung `kichHoatDonCho` voi nut Telegram va job 5 phut: goi lap khong dang ky hai lan.
 */
import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { wrap } from '../middleware/error.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { settings } from '../lib/settings.js';
import { dongDangGiu, kichHoatDonCho, tomTatChoQuy } from '../services/choQuy.js';
import { audit } from '../services/audit.js';

const router = Router();

/** Khoa dang nhan (nhieu khoa de xoay vong). Khoa ngan hon 32 ky tu bi bo: coi nhu chua cau hinh. */
function khoaDangNhan(): Buffer[] {
  return config.webTenMienKey.split(',').map((k) => k.trim()).filter((k) => k.length >= 32)
    .map((k) => crypto.createHash('sha256').update(k).digest());
}

/**
 * So bam sha256 (do dai co dinh) bang timingSafeEqual, duyet het danh sach de
 * thoi gian khong lo vi tri khoa. Kiem khoa TRUOC moi viec khac.
 */
function xacThuc(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  const khoa = khoaDangNhan();
  if (!khoa.length) {
    res.status(503).json({ error: 'Cổng nội bộ chưa bật', ma_loi: 'chua_bat' });
    return;
  }
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  const nhan = crypto.createHash('sha256').update(m?.[1] ?? '').digest();
  let dung = false;
  for (const k of khoa) if (crypto.timingSafeEqual(nhan, k)) dung = true;
  if (!m || !dung) {
    res.status(401).json({ error: 'Khóa không hợp lệ', ma_loi: 'khoa_khong_hop_le' });
    return;
  }
  if (req.method === 'POST' && !req.is('application/json')) {
    res.status(415).json({ error: 'Chỉ nhận dữ liệu JSON', ma_loi: 'khong_phai_json' });
    return;
  }
  next();
}

// Gioi han truoc xac thuc: lam cham do khoa. CRM goi it (bam nut, dashboard).
router.use(rateLimit({ windowMs: 60_000, max: 60, message: 'Gọi quá nhanh, thử lại sau' }));
router.use(xacThuc);

function cheDo(): 'that' | 'thu' | 'gia_lap' {
  const pa = settings.pa();
  return pa.sandbox ? 'gia_lap' : pa.useTestEndpoint ? 'thu' : 'that';
}

router.get('/trang-thai', wrap(async (_req, res) => {
  const t = await tomTatChoQuy();
  const loi = [...dongDangGiu('can_nguoi_xu_ly'), ...dongDangGiu('sai_ho_so')];
  res.json({
    luc: new Date().toISOString(),
    che_do: cheDo(),
    so_du: t.soDu,
    ...(t.loiSoDu ? { loi_so_du: t.loiSoDu } : {}),
    cho_quy: {
      so_dong: t.cho.length,
      tong_can: t.tongCan,
      can_nap: t.canNap,
      don: t.cho.map((d) => ({
        ma_don: d.order_code, ma_dong: d.id, ten_mien: d.domain, loai: d.action, so_nam: d.years,
        can: d.can, tu_luc: d.hold_since,
      })),
    },
    don_loi: loi.map((d) => ({
      ma_don: d.order_code, ma_dong: d.id, ten_mien: d.domain, loai_giu: d.hold,
      ma_pa: d.pa_code, chi_tiet: d.error, tu_luc: d.hold_since,
    })),
  });
}));

router.post('/kich-hoat', wrap(async (req, res) => {
  const body = (req.body ?? {}) as { ma_don?: unknown; order_id?: unknown };
  let orderId: number | undefined;
  if (body.ma_don !== undefined && body.ma_don !== null && body.ma_don !== '') {
    const ma = String(body.ma_don).trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(ma)) {
      res.status(400).json({ error: 'Mã đơn không hợp lệ', ma_loi: 'du_lieu_khong_hop_le' });
      return;
    }
    const row = db.prepare('SELECT id FROM orders WHERE code = ?').get(ma) as { id: number } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Không tìm thấy đơn', ma_loi: 'khong_tim_thay' });
      return;
    }
    orderId = row.id;
  } else if (body.order_id !== undefined && body.order_id !== null) {
    orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      res.status(400).json({ error: 'order_id không hợp lệ', ma_loi: 'du_lieu_khong_hop_le' });
      return;
    }
  }

  const kq = await kichHoatDonCho(orderId ? { orderId } : {});
  audit({ userId: null, action: 'noi_bo.kich_hoat', entity: 'order', ...(orderId ? { entityId: orderId } : {}), meta: { nguon: req.get('x-mtm-nguon') ?? '', soDong: kq.ketQua.length } });
  res.json({
    dang_chay: Boolean(kq.dangChay),
    so_du: kq.soDu,
    ...(kq.loiSoDu ? { loi_so_du: kq.loiSoDu } : {}),
    da_chay: kq.ketQua.map((k) => ({ ma_don: k.orderCode, ma_dong: k.itemId, ten_mien: k.domain, thanh_cong: k.ok })),
    con_cho: kq.conCho,
    can_nap: kq.canNap,
  });
}));

export default router;
