/**
 * Cong "Tai khoan MienTay" tai CONG_TAI_KHOAN_PATH (vd mientaymedia.com/tai-khoan),
 * dac ta o docs/mtm/tai-khoan-chung/spec.md muc 4.
 *
 * Router nay gan o goc cua cong (app.ts). Dang nhap, dang ky, 2FA, quen va dat
 * lai mat khau dung lai ham xu ly cua routes/auth.ts (mot ban logic, mot bo dem
 * gioi han tan suat); o day chi them trang chon san pham va ba trang tai khoan.
 *
 * Form doi thong tin, doi mat khau, huy lien ket gui ve route san co cua
 * /ten-mien kem truong an quay_ve (lib/congTaiKhoan.ts veTaiKhoan): cung phien
 * nen khong phai dang nhap lai, va khong co ban logic thu hai de lech nhau.
 * Bat, tat 2FA (QR, ma du phong) van o /ten-mien/tai-khoan/bao-mat.
 */
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { withBase } from '../lib/basePath.js';
import { duLieuMxh, laEmailTam } from '../services/lienKetMxh.js';
import { getState, requires2FA } from '../services/twoFactor.js';
import {
  trangDangKy, trangDangNhap, trangDatLai, trangHaiLop, trangQuenMatKhau,
  xuLyDangKy, xuLyDangNhap, xuLyDangXuat, xuLyDatLai, xuLyHaiLop, xuLyQuenMatKhau,
} from './auth.js';

const router = Router();

/**
 * Dia chi ung dung Mineflow. Mineflow chua noi dang nhap mot lan (intent, quyet
 * dinh Q1): chi la lien ket, khach dang nhap rieng o trang Mineflow.
 */
export const MINEFLOW_URL = 'https://app.mineflow.dev';

/* ---------------------------------------------------- trang chon san pham */

router.get('/', (req, res) => {
  if (!req.currentUser) return res.redirect('/dang-nhap');
  res.render('cong/chon-san-pham', {
    title: 'Chọn sản phẩm',
    sanPham: [
      {
        ten: 'Tên miền',
        moTa: 'Đăng ký, gia hạn, quản lý DNS cho tên miền .vn và quốc tế.',
        url: withBase('/control-panel'),
        ngoai: false,
        ghiChu: '',
      },
      {
        ten: 'Mineflow',
        moTa: 'Chăm sóc khách hàng và bán hàng qua Zalo.',
        url: MINEFLOW_URL,
        ngoai: true,
        ghiChu: 'Mineflow dùng tài khoản riêng, bạn đăng nhập lại ở trang Mineflow.',
      },
    ],
  });
});

/* ------------------------------------------------- dang nhap, dang ky */

router.get('/dang-nhap', trangDangNhap);
router.post('/dang-nhap', ...xuLyDangNhap);
router.get('/dang-nhap/hai-lop', trangHaiLop);
router.post('/dang-nhap/hai-lop', ...xuLyHaiLop);
router.get('/dang-ky', trangDangKy);
router.post('/dang-ky', ...xuLyDangKy);
router.get('/quen-mat-khau', trangQuenMatKhau);
router.post('/quen-mat-khau', ...xuLyQuenMatKhau);
router.get('/dat-lai-mat-khau', trangDatLai);
router.post('/dat-lai-mat-khau', ...xuLyDatLai);
router.post('/dang-xuat', xuLyDangXuat);

/* ------------------------------------------------------ trang tai khoan */

router.get('/ho-so', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, full_name, phone, created_at FROM users WHERE id = ?')
    .get(req.currentUser!.id) as { id: number; email: string; full_name: string; phone: string; created_at: string };
  res.render('cong/ho-so', { title: 'Hồ sơ', user, emailTam: laEmailTam(user.email) });
});

router.get('/bao-mat', requireAuth, (req, res) => {
  const user = req.currentUser!;
  res.render('cong/bao-mat', {
    title: 'Bảo mật',
    mxh: duLieuMxh(user.id),
    hai: getState(user.id),
    batBuoc2fa: requires2FA(user.role),
  });
});

router.get('/lien-ket', requireAuth, (req, res) => {
  res.render('cong/lien-ket', { title: 'Liên kết mạng xã hội', mxh: duLieuMxh(req.currentUser!.id) });
});

export default router;
