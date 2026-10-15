import { Router } from 'express';
import { z } from 'zod';
import { db, isoIn, nowIso } from '../db/index.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { emailSchema, fieldErrors, passwordSchema, phoneSchema } from '../lib/validate.js';
import { destroySession, flash, loginSession } from '../middleware/session.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { wrap } from '../middleware/error.js';
import { mergeCart } from '../services/cart.js';
import { sendEmailVerification, sendPasswordReset, sendWelcome } from '../services/notifications.js';
import { canResend, consumeToken, isVerified, issueToken } from '../services/verification.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { isEnabled as twoFactorEnabled, verifyLogin as verify2FA } from '../services/twoFactor.js';

const router = Router();

const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Vui lòng nhập họ tên').max(120),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: 'Mật khẩu nhập lại không khớp',
  });

/**
 * Chi cho phep chuyen huong NOI BO.
 *
 * Kiem tra "bat dau bang / va khong bat dau bang //" la KHONG DU:
 * `/\\evil.com` lot qua duoc, va trinh duyet doi dau gach nguoc thanh gach
 * xuoi nen no thanh `//evil.com` - tuc la chuyen thang sang trang cua ke tan
 * cong. Ke gian dung dung dieu nay de lua: nan nhan dang nhap that o site cua
 * ta roi bi day sang trang gia y het.
 *
 * Cach chac chan: dung URL parser voi mot goc gia, roi chi lay lai duong dan.
 * Bat ky dia chi tuyet doi hay giao thuc tuong doi nao cung bi loai.
 */
function safeNext(value: unknown): string {
  const macDinh = '/dashboard';
  const raw = String(value ?? '').trim();
  if (!raw || raw[0] !== '/') return macDinh;

  // Loai truc tiep cac dang dua sang host khac: // hoac /\ (ke ca sau khi giai ma)
  if (/^[/\\]{2}/.test(raw) || /^\/[\\]/.test(raw)) return macDinh;

  try {
    const goc = 'http://noi-bo.invalid';
    const u = new URL(raw, goc);
    if (u.origin !== goc) return macDinh;         // da bi day sang host khac
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return macDinh;
  }
}

router.get('/dang-ky', (req, res) => {
  if (req.currentUser) return res.redirect('/dashboard');
  res.render('auth/register', { title: 'Đăng ký tài khoản', values: {}, errors: {} });
});

router.post(
  '/dang-ky',
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Quá nhiều lần đăng ký từ IP này. Vui lòng thử lại sau.' }),
  wrap(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).render('auth/register', {
        title: 'Đăng ký tài khoản',
        values: req.body,
        errors: fieldErrors(parsed.error),
      });
      return;
    }

    const { full_name, email, phone, password } = parsed.data;
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (exists) {
      res.status(422).render('auth/register', {
        title: 'Đăng ký tài khoản',
        values: req.body,
        errors: { email: 'Email này đã được đăng ký' },
      });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, phone, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'customer', ?, ?)`,
      )
      .run(email, hashPassword(password), full_name, phone, nowIso(), nowIso());

    const userId = Number(info.lastInsertRowid);
    const guestCart = req.sessionId;
    loginSession(req, res, userId);
    mergeCart(guestCart, `user:${userId}`, userId);

    audit({ userId, action: 'user.register', entity: 'user', entityId: userId, ip: req.ip });

    // Email xac thuc gui truoc; email chao mung gui sau khi xac thuc xong
    // -> khach khong nhan hai email cung luc.
    void sendEmailVerification({ id: userId, email, full_name }, issueToken({ id: userId, email }));

    flash(req, 'success', `Tạo tài khoản thành công. Chúng tôi đã gửi email xác thực tới ${email}.`);
    res.redirect(safeNext(req.body?.next));
  }),
);

router.get('/dang-nhap', (req, res) => {
  if (req.currentUser) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Đăng nhập', values: {}, errors: {}, next: req.query['next'] ?? '' });
});

router.post(
  '/dang-nhap',
  rateLimit({
    windowMs: 15 * 60_000,
    max: 15,
    key: (req) => `${req.ip}:${String((req.body as Record<string, unknown>)?.['email'] ?? '')}`,
    message: 'Sai thông tin đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
  }),
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    const user = db
      .prepare('SELECT id, email, password_hash, status FROM users WHERE email = ? COLLATE NOCASE')
      .get(email) as { id: number; email: string; password_hash: string; status: string } | undefined;

    // Thong bao chung chung: khong tiet lo email nao ton tai
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).render('auth/login', {
        title: 'Đăng nhập',
        values: { email },
        errors: { _: 'Email hoặc mật khẩu không đúng' },
        next: req.body?.next ?? '',
      });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).render('auth/login', {
        title: 'Đăng nhập',
        values: { email },
        errors: { _: 'Tài khoản đã bị tạm khóa. Vui lòng liên hệ hỗ trợ.' },
        next: '',
      });
      return;
    }

    // Mat khau dung nhung tai khoan co lop thu hai: CHUA cho vao. Ghi tam vao
    // phien khach (phien nay chua co userId nen chua co quyen gi) roi doi ma.
    if (twoFactorEnabled(user.id)) {
      req.session.pending2fa = { userId: user.id, at: Date.now(), next: safeNext(req.body?.next) };
      audit({ userId: user.id, action: 'user.login_2fa_required', entity: 'user', entityId: user.id, ip: req.ip });
      return res.redirect('/dang-nhap/hai-lop');
    }

    const guestCart = req.sessionId;
    loginSession(req, res, user.id);
    mergeCart(guestCart, `user:${user.id}`, user.id);
    audit({ userId: user.id, action: 'user.login', entity: 'user', entityId: user.id, ip: req.ip });

    res.redirect(safeNext(req.body?.next));
  }),
);

/* ------------------------------------------------- buoc hai: ma xac thuc */

/** Cho toi da 10 phut de nhap ma, sau do phai dang nhap lai tu dau. */
const HAN_CHO_2FA_MS = 10 * 60_000;

interface ChoXacThuc {
  userId: number;
  at: number;
  next: string;
}

function layChoXacThuc(req: import('express').Request): ChoXacThuc | null {
  const cho = req.session.pending2fa as ChoXacThuc | undefined;
  if (!cho || typeof cho.userId !== 'number') return null;
  if (Date.now() - cho.at > HAN_CHO_2FA_MS) {
    delete req.session.pending2fa;
    return null;
  }
  return cho;
}

router.get('/dang-nhap/hai-lop', (req, res) => {
  if (req.currentUser) return res.redirect('/dashboard');
  if (!layChoXacThuc(req)) {
    flash(req, 'error', 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
    return res.redirect('/dang-nhap');
  }
  res.render('auth/two-factor', { title: 'Xác thực hai lớp', errors: {} });
});

router.post(
  '/dang-nhap/hai-lop',
  rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    key: (req) => `${req.ip}:${String((req.session?.pending2fa as ChoXacThuc | undefined)?.userId ?? '')}`,
    message: 'Nhập sai mã quá nhiều lần. Vui lòng thử lại sau 15 phút.',
  }),
  wrap(async (req, res) => {
    const cho = layChoXacThuc(req);
    if (!cho) {
      flash(req, 'error', 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
      return res.redirect('/dang-nhap');
    }

    const kq = verify2FA(cho.userId, String(req.body?.code ?? ''));
    if (!kq.ok) {
      audit({ userId: cho.userId, action: 'user.2fa_failed', entity: 'user', entityId: cho.userId, ip: req.ip });
      res.status(401).render('auth/two-factor', {
        title: 'Xác thực hai lớp',
        errors: { _: 'Mã không đúng hoặc đã hết hạn. Hãy lấy mã mới nhất trong ứng dụng.' },
      });
      return;
    }

    delete req.session.pending2fa;
    const guestCart = req.sessionId;
    loginSession(req, res, cho.userId);
    mergeCart(guestCart, `user:${cho.userId}`, cho.userId);
    audit({ userId: cho.userId, action: 'user.login', entity: 'user', entityId: cho.userId, ip: req.ip, meta: { twoFactor: kq.duPhong ? 'ma_du_phong' : 'ung_dung' } });

    if (kq.duPhong) {
      flash(req, 'info', `Bạn vừa dùng một mã dự phòng, còn lại ${kq.conLai ?? 0} mã. Nên tạo bộ mã mới trong mục Bảo mật.`);
    }
    res.redirect(cho.next || '/dashboard');
  }),
);

router.post('/dang-xuat', (req, res) => {
  const userId = req.currentUser?.id;
  destroySession(req, res);
  if (userId) audit({ userId, action: 'user.logout', entity: 'user', entityId: userId, ip: req.ip });
  res.redirect('/');
});

router.get('/quen-mat-khau', (_req, res) => {
  res.render('auth/forgot', { title: 'Quên mật khẩu', sent: false });
});

router.post(
  '/quen-mat-khau',
  rateLimit({ windowMs: 15 * 60_000, max: 5 }),
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT id, email FROM users WHERE email = ? COLLATE NOCASE').get(email) as
      | { id: number; email: string }
      | undefined;

    if (user) {
      const token = randomToken(32);
      db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .run(user.id, sha256(token), isoIn(60 * 60_000), nowIso());
      void sendPasswordReset(user, token);
    }

    // Luon bao da gui, du email co ton tai hay khong
    res.render('auth/forgot', { title: 'Quên mật khẩu', sent: true });
  }),
);

router.get('/dat-lai-mat-khau', (req, res) => {
  res.render('auth/reset', { title: 'Đặt lại mật khẩu', token: String(req.query['token'] ?? ''), errors: {} });
});

router.post(
  '/dat-lai-mat-khau',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  wrap(async (req, res) => {
    const token = String(req.body?.token ?? '');
    const password = String(req.body?.password ?? '');
    const confirm = String(req.body?.password_confirm ?? '');

    const render = (message: string) =>
      res.status(422).render('auth/reset', { title: 'Đặt lại mật khẩu', token, errors: { _: message } });

    const check = passwordSchema.safeParse(password);
    if (!check.success) return render(check.error.issues[0]?.message ?? 'Mật khẩu không hợp lệ');
    if (password !== confirm) return render('Mật khẩu nhập lại không khớp');

    const row = db
      .prepare('SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?')
      .get(sha256(token)) as { id: number; user_id: number; expires_at: string; used_at: string | null } | undefined;

    if (!row || row.used_at || row.expires_at < nowIso()) {
      return render('Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.');
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), nowIso(), row.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
    // Dang xuat moi thiet bi khac
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);

    audit({ userId: row.user_id, action: 'user.password_reset', entity: 'user', entityId: row.user_id, ip: req.ip });
    flash(req, 'success', 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
    res.redirect('/dang-nhap');
  }),
);

/* ------------------------------------------------------ xac thuc email */

router.get(
  '/xac-thuc-email',
  rateLimit({ windowMs: 60_000, max: 20 }),
  wrap(async (req, res) => {
    const outcome = consumeToken(String(req.query['token'] ?? ''));

    if (outcome.status === 'ok') {
      const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(outcome.userId) as
        { id: number; email: string; full_name: string };
      audit({ userId: outcome.userId, action: 'user.email_verified', entity: 'user', entityId: outcome.userId, ip: req.ip });
      void sendWelcome(user);
    }

    res.status(outcome.status === 'ok' || outcome.status === 'already_verified' ? 200 : 400);
    res.render('auth/verify-result', {
      title: 'Xác thực email',
      outcome: outcome.status,
      loggedIn: Boolean(req.currentUser),
    });
  }),
);

router.post(
  '/gui-lai-xac-thuc',
  requireAuth,
  rateLimit({ windowMs: 3600_000, max: 10, message: 'Bạn đã yêu cầu gửi lại quá nhiều lần. Vui lòng thử lại sau.' }),
  wrap(async (req, res) => {
    const user = req.currentUser!;

    if (isVerified(user.id)) {
      flash(req, 'info', 'Email của bạn đã được xác thực rồi.');
      return res.redirect('/tai-khoan');
    }

    const { allowed, sentLastHour } = canResend(user.id);
    if (!allowed) {
      flash(req, 'error', `Đã gửi ${sentLastHour} email xác thực trong một giờ qua. Vui lòng đợi rồi thử lại.`);
      return res.redirect('/tai-khoan');
    }

    const sent = await sendEmailVerification(
      { id: user.id, email: user.email, full_name: user.full_name },
      issueToken({ id: user.id, email: user.email }),
    );

    flash(
      req,
      sent ? 'success' : 'error',
      sent
        ? `Đã gửi lại email xác thực tới ${user.email}. Kiểm tra cả thư mục spam giúp chúng tôi.`
        : 'Không gửi được email. Vui lòng liên hệ hỗ trợ hoặc kiểm tra cấu hình SMTP.',
    );
    res.redirect('/tai-khoan');
  }),
);

export default router;
