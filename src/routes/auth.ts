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

const router = Router();

const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Vui long nhap ho ten').max(120),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: 'Mat khau nhap lai khong khop',
  });

/** Chi cho phep chuyen huong noi bo, chan open redirect. */
function safeNext(value: unknown): string {
  const s = String(value ?? '');
  return s.startsWith('/') && !s.startsWith('//') ? s : '/dashboard';
}

router.get('/dang-ky', (req, res) => {
  if (req.currentUser) return res.redirect('/dashboard');
  res.render('auth/register', { title: 'Dang ky tai khoan', values: {}, errors: {} });
});

router.post(
  '/dang-ky',
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Qua nhieu lan dang ky tu IP nay. Vui long thu lai sau.' }),
  wrap(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).render('auth/register', {
        title: 'Dang ky tai khoan',
        values: req.body,
        errors: fieldErrors(parsed.error),
      });
      return;
    }

    const { full_name, email, phone, password } = parsed.data;
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (exists) {
      res.status(422).render('auth/register', {
        title: 'Dang ky tai khoan',
        values: req.body,
        errors: { email: 'Email nay da duoc dang ky' },
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

    flash(req, 'success', `Tao tai khoan thanh cong. Chung toi da gui email xac thuc toi ${email}.`);
    res.redirect(safeNext(req.body?.next));
  }),
);

router.get('/dang-nhap', (req, res) => {
  if (req.currentUser) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Dang nhap', values: {}, errors: {}, next: req.query['next'] ?? '' });
});

router.post(
  '/dang-nhap',
  rateLimit({
    windowMs: 15 * 60_000,
    max: 15,
    key: (req) => `${req.ip}:${String((req.body as Record<string, unknown>)?.['email'] ?? '')}`,
    message: 'Sai thong tin dang nhap qua nhieu lan. Vui long thu lai sau 15 phut.',
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
        title: 'Dang nhap',
        values: { email },
        errors: { _: 'Email hoac mat khau khong dung' },
        next: req.body?.next ?? '',
      });
      return;
    }

    if (user.status === 'suspended') {
      res.status(403).render('auth/login', {
        title: 'Dang nhap',
        values: { email },
        errors: { _: 'Tai khoan da bi tam khoa. Vui long lien he ho tro.' },
        next: '',
      });
      return;
    }

    const guestCart = req.sessionId;
    loginSession(req, res, user.id);
    mergeCart(guestCart, `user:${user.id}`, user.id);
    audit({ userId: user.id, action: 'user.login', entity: 'user', entityId: user.id, ip: req.ip });

    res.redirect(safeNext(req.body?.next));
  }),
);

router.post('/dang-xuat', (req, res) => {
  const userId = req.currentUser?.id;
  destroySession(req, res);
  if (userId) audit({ userId, action: 'user.logout', entity: 'user', entityId: userId, ip: req.ip });
  res.redirect('/');
});

router.get('/quen-mat-khau', (_req, res) => {
  res.render('auth/forgot', { title: 'Quen mat khau', sent: false });
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
    res.render('auth/forgot', { title: 'Quen mat khau', sent: true });
  }),
);

router.get('/dat-lai-mat-khau', (req, res) => {
  res.render('auth/reset', { title: 'Dat lai mat khau', token: String(req.query['token'] ?? ''), errors: {} });
});

router.post(
  '/dat-lai-mat-khau',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  wrap(async (req, res) => {
    const token = String(req.body?.token ?? '');
    const password = String(req.body?.password ?? '');
    const confirm = String(req.body?.password_confirm ?? '');

    const render = (message: string) =>
      res.status(422).render('auth/reset', { title: 'Dat lai mat khau', token, errors: { _: message } });

    const check = passwordSchema.safeParse(password);
    if (!check.success) return render(check.error.issues[0]?.message ?? 'Mat khau khong hop le');
    if (password !== confirm) return render('Mat khau nhap lai khong khop');

    const row = db
      .prepare('SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?')
      .get(sha256(token)) as { id: number; user_id: number; expires_at: string; used_at: string | null } | undefined;

    if (!row || row.used_at || row.expires_at < nowIso()) {
      return render('Lien ket khong hop le hoac da het han. Vui long yeu cau lai.');
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), nowIso(), row.user_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
    // Dang xuat moi thiet bi khac
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);

    audit({ userId: row.user_id, action: 'user.password_reset', entity: 'user', entityId: row.user_id, ip: req.ip });
    flash(req, 'success', 'Doi mat khau thanh cong. Vui long dang nhap lai.');
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
      title: 'Xac thuc email',
      outcome: outcome.status,
      loggedIn: Boolean(req.currentUser),
    });
  }),
);

router.post(
  '/gui-lai-xac-thuc',
  requireAuth,
  rateLimit({ windowMs: 3600_000, max: 10, message: 'Ban da yeu cau gui lai qua nhieu lan. Vui long thu lai sau.' }),
  wrap(async (req, res) => {
    const user = req.currentUser!;

    if (isVerified(user.id)) {
      flash(req, 'info', 'Email cua ban da duoc xac thuc roi.');
      return res.redirect('/tai-khoan');
    }

    const { allowed, sentLastHour } = canResend(user.id);
    if (!allowed) {
      flash(req, 'error', `Da gui ${sentLastHour} email xac thuc trong mot gio qua. Vui long doi roi thu lai.`);
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
        ? `Da gui lai email xac thuc toi ${user.email}. Kiem tra ca thu muc spam giup chung toi.`
        : 'Khong gui duoc email. Vui long lien he ho tro hoac kiem tra cau hinh SMTP.',
    );
    res.redirect('/tai-khoan');
  }),
);

export default router;
