/**
 * Dang nhap, dang ky, lien ket bang Zalo, Google, GitHub (OAuth 2.0 Authorization
 * Code + PKCE S256). Noi chuyen voi nha cung cap o lib/oauth.ts, quy tac ghep
 * tai khoan o services/lienKetMxh.ts; day lo state, phien va chuyen trang.
 *
 * Nut la link GET chu khong phai form: CSP `form-action 'self'` chan ca chuyen
 * huong sau khi gui form sang mien khac, nen form POST roi 302 sang Google se
 * bi trinh duyet chan.
 */
import { Router, type Request, type Response } from 'express';
import { db, nowIso } from '../db/index.js';
import { hashPassword, randomToken, safeEqual } from '../lib/crypto.js';
import { emailSchema, passwordSchema } from '../lib/validate.js';
import { duongDanNoiBo } from '../lib/redirect.js';
import { log } from '../lib/logger.js';
import {
  LoiMxh, TEN_HIEN_THI, diaChiXinQuyen, khoaCua, laNhaCungCap, layHoSo, taoPkce,
  type NhaCungCap,
} from '../lib/oauth.js';
import { flash, loginSession } from '../middleware/session.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { mergeCart } from '../services/cart.js';
import { audit } from '../services/audit.js';
import { isEnabled as twoFactorEnabled } from '../services/twoFactor.js';
import { issueToken } from '../services/verification.js';
import { sendEmailVerification, sendWelcome } from '../services/notifications.js';
import {
  coMatKhau, duocBoSungEmail, ganDanhTinh, ghiChoLienKet, huyDanhTinh, laEmailTam, xuLyDangNhapMxh,
} from '../services/lienKetMxh.js';

const router = Router();

/** state song toi da 10 phut (giao viec), sau do phai bam nut lai. */
const HAN_STATE_MS = 10 * 60_000;

/** Mot o trong phien: mo luong moi thi ghi de luong cu (khong tich tu state). */
interface PhienOauth {
  ben: NhaCungCap;
  state: string;
  verifier: string;
  nonce: string;
  at: number;
  next: string;
  /** Id tai khoan dang lien ket them; 0 la dang nhap. */
  lienKet: number;
}

const gioiHanBatDau = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  message: 'Bạn bấm đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
});

// Callback la cho ke gian thu ma, thu state: gioi han rieng theo IP
const gioiHanCallback = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  message: 'Quá nhiều lần đăng nhập bằng mạng xã hội từ địa chỉ này. Vui lòng thử lại sau 15 phút.',
});

/* --------------------------------------------------------------- bat dau */

router.get('/auth/:ben', gioiHanBatDau, (req, res, next) => {
  const ben = req.params['ben'];
  if (!laNhaCungCap(ben)) return next();
  const ten = TEN_HIEN_THI[ben];
  const lienKet = req.query['lien_ket'] === '1';

  const khoa = khoaCua(ben);
  if (!khoa) {
    flash(req, 'error', `Đăng nhập bằng ${ten} hiện chưa mở. Vui lòng dùng email và mật khẩu.`);
    return res.redirect(lienKet && req.currentUser ? '/tai-khoan' : '/dang-nhap');
  }

  if (lienKet) {
    if (!req.currentUser) return res.redirect('/dang-nhap?next=%2Ftai-khoan');
    // Link GET khong qua lop CSRF chung: kiem token phien o day de trang la
    // khong ep duoc tai khoan dang dang nhap lien ket voi mot danh tinh nao do
    if (!req.session.csrf || !safeEqual(String(req.query['_csrf'] ?? ''), req.session.csrf)) {
      res.status(403).render('error', {
        title: 'Phiên làm việc hết hạn',
        message: 'Yêu cầu liên kết không hợp lệ hoặc đã hết hạn. Vui lòng mở lại trang Tài khoản và thử lại.',
      });
      return;
    }
  } else if (req.currentUser) {
    return res.redirect('/dashboard');
  }

  const { verifier, challenge } = taoPkce();
  const phien: PhienOauth = {
    ben,
    state: randomToken(32),
    verifier,
    nonce: ben === 'google' ? randomToken(16) : '',
    at: Date.now(),
    next: duongDanNoiBo(req.query['next'], '/dashboard'),
    lienKet: lienKet ? req.currentUser!.id : 0,
  };
  req.session['oauth'] = phien;
  res.redirect(diaChiXinQuyen(ben, khoa, { state: phien.state, challenge, nonce: phien.nonce || undefined }));
});

/* ---------------------------------------------------------------- quay ve */

router.get(
  '/auth/:ben/callback',
  gioiHanCallback,
  wrap(async (req, res, next) => {
    const ben = req.params['ben'];
    if (!laNhaCungCap(ben)) return next();
    const ten = TEN_HIEN_THI[ben];

    // Lay ra va xoa ngay: state dung mot lan, ke ca khi cac buoc sau loi
    const cho = req.session['oauth'] as PhienOauth | undefined;
    delete req.session['oauth'];

    const veLai = (loai: 'error' | 'info', thongBao: string) => {
      flash(req, loai, thongBao);
      res.redirect(req.currentUser ? '/tai-khoan' : '/dang-nhap');
    };

    const state = String(req.query['state'] ?? '');
    if (
      !cho || cho.ben !== ben || typeof cho.state !== 'string' || !state
      || !safeEqual(state, cho.state) || Date.now() - cho.at > HAN_STATE_MS
    ) {
      log.warn('oauth_state_invalid', { ben, coPhien: Boolean(cho) });
      return veLai('error', `Phiên đăng nhập bằng ${ten} đã hết hạn hoặc không hợp lệ. Vui lòng bấm nút ${ten} lại.`);
    }

    const code = String(req.query['code'] ?? '');
    if (req.query['error'] !== undefined || !code) {
      return veLai('info', `Bạn đã hủy đăng nhập bằng ${ten}. Có thể thử lại hoặc dùng email và mật khẩu.`);
    }

    const khoa = khoaCua(ben);
    if (!khoa) return veLai('error', `Đăng nhập bằng ${ten} hiện chưa mở. Vui lòng dùng email và mật khẩu.`);

    let hs;
    try {
      hs = await layHoSo(ben, khoa, { code, verifier: cho.verifier, nonce: cho.nonce || undefined });
    } catch (err) {
      // Chi ghi ben, buoc, ma HTTP: khong ghi ma, token, than phan hoi
      log.warn('oauth_failed', err instanceof LoiMxh ? { ben, buoc: err.buoc, status: err.status } : { ben });
      return veLai('error', `Chưa đăng nhập được bằng ${ten}. Vui lòng thử lại sau ít phút hoặc dùng email và mật khẩu.`);
    }

    /* Che do lien ket: tai khoan dang dang nhap them mot danh tinh */
    if (cho.lienKet) {
      const toi = req.currentUser;
      if (!toi || toi.id !== cho.lienKet) {
        return veLai('error', 'Phiên liên kết không còn hợp lệ. Vui lòng đăng nhập lại rồi liên kết.');
      }
      const kq = ganDanhTinh(toi.id, hs);
      if (kq === 'ok') {
        audit({ userId: toi.id, action: 'user.oauth_link', entity: 'user', entityId: toi.id, ip: req.ip, meta: { ben } });
        flash(req, 'success', `Đã liên kết ${ten}. Lần sau bạn có thể đăng nhập bằng ${ten}.`);
      } else if (kq === 'da_gan') {
        flash(req, 'info', `Tài khoản ${ten} này đã liên kết với bạn từ trước.`);
      } else if (kq === 'da_co_ben_nay') {
        flash(req, 'error', `Bạn đã liên kết một tài khoản ${ten} khác. Hủy liên kết cũ trước khi liên kết tài khoản mới.`);
      } else {
        flash(req, 'error', `Tài khoản ${ten} này đã liên kết với một tài khoản khác trên ${String(res.locals['site']?.name ?? 'website')}.`);
      }
      return res.redirect('/tai-khoan');
    }

    if (req.currentUser) return res.redirect('/dashboard');

    const kq = xuLyDangNhapMxh(hs, req.ip);
    if (kq.loai === 'tam_khoa') {
      return veLai('error', 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.');
    }
    if (kq.loai === 'can_mat_khau') {
      ghiChoLienKet(req.session, hs);
      flash(
        req,
        'info',
        `Email ${kq.email} đã có tài khoản tại đây. Để bảo vệ tài khoản, hãy đăng nhập bằng mật khẩu một lần, hệ thống sẽ tự liên kết ${ten}. Chưa có mật khẩu thì dùng "Quên mật khẩu".`,
      );
      return res.redirect(`/dang-nhap?next=${encodeURIComponent(cho.next)}`);
    }

    if (kq.loai === 'tao_moi' && !kq.thieuEmail) {
      void sendWelcome({ id: kq.userId, email: kq.email, full_name: kq.ten });
    }
    batDauPhien(req, res, kq.userId, ben, cho.next, kq.loai === 'tao_moi' && kq.thieuEmail);
  }),
);

/**
 * Cap phien sau khi da biet tai khoan. Co 2FA thi chua cap: ghi pending2fa
 * nhu dang nhap mat khau, route /dang-nhap/hai-lop lo phan con lai.
 */
function batDauPhien(req: Request, res: Response, userId: number, ben: NhaCungCap, next: string, thieuEmail: boolean): void {
  if (twoFactorEnabled(userId)) {
    req.session.pending2fa = { userId, at: Date.now(), next };
    audit({ userId, action: 'user.login_2fa_required', entity: 'user', entityId: userId, ip: req.ip, meta: { ben } });
    return res.redirect('/dang-nhap/hai-lop');
  }

  const guestCart = req.sessionId;
  loginSession(req, res, userId); // phien moi: chong co dinh phien
  mergeCart(guestCart, `user:${userId}`, userId);
  audit({ userId, action: 'user.oauth_login', entity: 'user', entityId: userId, ip: req.ip, meta: { ben } });

  if (thieuEmail) {
    flash(req, 'info', `Đã tạo tài khoản bằng ${TEN_HIEN_THI[ben]}. ${TEN_HIEN_THI[ben]} không cung cấp email, vui lòng bổ sung email để nhận thông tin quản trị tên miền.`);
    return res.redirect('/tai-khoan/email');
  }
  res.redirect(next);
}

/* ------------------------------------------------------- tai khoan: lien ket */

router.post('/tai-khoan/lien-ket/:ben/huy', requireAuth, (req, res) => {
  const ben = req.params['ben'];
  const user = req.currentUser!;
  if (!laNhaCungCap(ben)) return res.redirect('/tai-khoan');
  const ten = TEN_HIEN_THI[ben];

  const kq = huyDanhTinh(user.id, ben);
  if (kq === 'ok') {
    audit({ userId: user.id, action: 'user.oauth_unlink', entity: 'user', entityId: user.id, ip: req.ip, meta: { ben } });
    flash(req, 'success', `Đã hủy liên kết ${ten}.`);
  } else if (kq === 'cuoi_cung') {
    flash(req, 'error', `Đây là cách đăng nhập duy nhất của bạn. Hãy đặt mật khẩu trước khi hủy liên kết ${ten}, nếu không bạn sẽ không vào được tài khoản.`);
  } else {
    flash(req, 'info', `Tài khoản chưa liên kết ${ten}.`);
  }
  res.redirect('/tai-khoan');
});

/** Tai khoan tao bang mang xa hoi chua co mat khau: dat lan dau, khong hoi mat khau cu. */
router.post(
  '/tai-khoan/dat-mat-khau',
  requireAuth,
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.' }),
  (req, res) => {
    const user = req.currentUser!;
    if (coMatKhau(user.id)) {
      flash(req, 'error', 'Tài khoản đã có mật khẩu. Dùng mục Đổi mật khẩu.');
      return res.redirect('/tai-khoan');
    }
    const password = String(req.body?.password ?? '');
    const check = passwordSchema.safeParse(password);
    if (!check.success) {
      flash(req, 'error', check.error.issues[0]?.message ?? 'Mật khẩu không hợp lệ');
      return res.redirect('/tai-khoan');
    }
    if (password !== String(req.body?.password_confirm ?? '')) {
      flash(req, 'error', 'Mật khẩu nhập lại không khớp.');
      return res.redirect('/tai-khoan');
    }
    // Chi dat khi van rong: hai yeu cau cung luc khong ghi de nhau
    const r = db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash = ''")
      .run(hashPassword(password), nowIso(), user.id);
    if (r.changes) {
      audit({ userId: user.id, action: 'user.set_password', entity: 'user', entityId: user.id, ip: req.ip });
      flash(req, 'success', 'Đã đặt mật khẩu. Bạn có thể đăng nhập bằng email và mật khẩu.');
    }
    res.redirect('/tai-khoan');
  },
);

/* ------------------------------------------------------- bo sung email */

function trangEmail(req: Request, res: Response, status: number, values: Record<string, unknown>, errors: Record<string, string>) {
  res.status(status).render('account/bo-sung-email', { title: 'Bổ sung email', values, errors });
}

router.get('/tai-khoan/email', requireAuth, (req, res) => {
  const user = req.currentUser!;
  if (!duocBoSungEmail(user.id)) return res.redirect('/tai-khoan');
  trangEmail(req, res, 200, { email: laEmailTam(user.email) ? '' : user.email }, {});
});

router.post(
  '/tai-khoan/email',
  requireAuth,
  rateLimit({ windowMs: 3600_000, max: 10, message: 'Bạn đã đổi email quá nhiều lần. Vui lòng thử lại sau.' }),
  wrap(async (req, res) => {
    const user = req.currentUser!;
    if (!duocBoSungEmail(user.id)) return res.redirect('/tai-khoan');

    const parsed = emailSchema.safeParse(req.body?.email);
    if (!parsed.success || laEmailTam(parsed.data)) {
      return trangEmail(req, res, 422, req.body ?? {}, { email: 'Email không hợp lệ' });
    }
    const email = parsed.data;
    const trung = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id <> ?').get(email, user.id);
    if (trung) {
      // Khong gop o day: email do da co chu, phai dang nhap tai khoan do roi lien ket
      return trangEmail(req, res, 422, req.body ?? {}, {
        email: 'Email này đã có tài khoản. Hãy đăng nhập tài khoản đó rồi liên kết trong mục Tài khoản.',
      });
    }

    db.prepare('UPDATE users SET email = ?, email_verified_at = NULL, updated_at = ? WHERE id = ?').run(email, nowIso(), user.id);
    audit({ userId: user.id, action: 'user.email_added', entity: 'user', entityId: user.id, ip: req.ip });
    const sent = await sendEmailVerification({ id: user.id, email, full_name: user.full_name }, issueToken({ id: user.id, email }));
    flash(
      req,
      sent ? 'success' : 'error',
      sent
        ? `Đã lưu email ${email} và gửi thư xác thực. Bấm liên kết trong thư để hoàn tất trước khi đặt hàng.`
        : `Đã lưu email ${email} nhưng chưa gửi được thư xác thực. Vui lòng bấm "Gửi lại email xác thực" sau ít phút.`,
    );
    res.redirect('/tai-khoan');
  }),
);

export default router;
