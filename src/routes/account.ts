/**
 * Khu vuc tai khoan khach hang: bang dieu khien, ho so chu the, doi mat khau,
 * API token (de khach tu xay front-end rieng), so du vi.
 */
import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { contactSchema, fieldErrors, passwordSchema } from '../lib/validate.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { daysUntilExpiry, listUserDomains } from '../services/domainRepo.js';
import { listOrders } from '../services/orders.js';
import { audit } from '../services/audit.js';
import { loiHoSoPA, type ContactRow } from '../services/domainContact.js';
import { qrSvg } from '../lib/qrcode.js';
import { formatSecret } from '../lib/totp.js';
import {
  beginSetup, confirmSetup, disable as disable2FA, getPendingSetup, getState,
  regenerateRecoveryCodes, requires2FA,
} from '../services/twoFactor.js';

const router = Router();

// Router nay duoc gan o '/', nen requireAuth phai dat theo TUNG route.
// Neu dung router.use(requireAuth) thi moi request di qua day - ke ca route
// cong khai cua router khac - deu bi chan.

router.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const domains = listUserDomains(userId);
  const orders = listOrders(userId, 5);

  res.render('dashboard', {
    title: 'Bảng điều khiển',
    domains: domains.map((d) => ({ ...d, daysLeft: daysUntilExpiry(d) })),
    orders,
    stats: {
      domains: domains.length,
      active: domains.filter((d) => d.status === 'active').length,
      expiringSoon: domains.filter((d) => {
        const left = daysUntilExpiry(d);
        return left !== null && left >= 0 && left <= 30;
      }).length,
      pendingOrders: orders.filter((o) => o.status === 'pending_payment').length,
    },
  });
});

/* ---------------------------------------------------------- ho so chu the */

function hoSoCua(userId: number): (ContactRow & { canBoSung: string[] })[] {
  return (db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id').all(userId) as ContactRow[])
    // Ho so tao truoc khi form doi co the thieu phuong xa, ngay sinh...: bao som
    // de khach sua truoc khi dat hang, khong de don treo o buoc dang ky
    .map((c) => ({ ...c, canBoSung: loiHoSoPA(c, 'vn') }));
}

router.get('/tai-khoan/ho-so', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const sua = Number(req.query['sua']) || 0;
  const dangSua = sua
    ? (db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(sua, userId) as ContactRow | undefined)
    : undefined;
  res.render('account/contacts', {
    title: 'Hồ sơ chủ thể tên miền',
    contacts: hoSoCua(userId),
    values: dangSua ?? {},
    errors: {},
  });
});

router.post('/tai-khoan/ho-so', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  // Buoc 1 cua form khong JS: chon tinh xong thi ve lai form kem danh sach
  // phuong xa cua tinh do, chua kiem va chua luu gi
  if (req.body?.buoc === 'chon-tinh') {
    return res.render('account/contacts', {
      title: 'Hồ sơ chủ thể tên miền', contacts: hoSoCua(userId), values: req.body ?? {}, errors: {},
    });
  }
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render('account/contacts', {
      title: 'Hồ sơ chủ thể tên miền',
      contacts: hoSoCua(userId),
      values: req.body ?? {},
      errors: fieldErrors(parsed.error),
    });
  }

  const c = parsed.data;
  const id = Number(req.body?.id) || 0;
  const owned = id ? db.prepare('SELECT 1 FROM contacts WHERE id = ? AND user_id = ?').get(id, userId) : null;

  if (id && owned) {
    db.prepare(
      `UPDATE contacts SET kind=?, full_name=?, org_name=?, id_number=?, tax_code=?, email=?, phone=?, address=?, ward=?,
                           city=?, province=?, postal_code=?, country=?, birth_date=?, gender=?, updated_at=?
       WHERE id=? AND user_id=?`,
    ).run(
      c.kind, c.full_name, c.org_name, c.id_number, c.tax_code, c.email, c.phone, c.address, c.ward,
      c.city, c.province, c.postal_code, c.country, c.birth_date, c.gender, nowIso(), id, userId,
    );
    flash(req, 'success', 'Đã cập nhật hồ sơ chủ thể.');
  } else {
    const isFirst = (db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(userId) as { n: number }).n === 0;
    db.prepare(
      `INSERT INTO contacts (user_id, kind, full_name, org_name, id_number, tax_code, email, phone, address, ward,
                             city, province, postal_code, country, birth_date, gender, is_default, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      userId, c.kind, c.full_name, c.org_name, c.id_number, c.tax_code, c.email, c.phone, c.address, c.ward,
      c.city, c.province, c.postal_code, c.country, c.birth_date, c.gender, isFirst ? 1 : 0, nowIso(), nowIso(),
    );
    flash(req, 'success', 'Đã thêm hồ sơ chủ thể.');
  }
  res.redirect('/tai-khoan/ho-so');
});

router.post('/tai-khoan/ho-so/:id/mac-dinh', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const id = Number(req.params.id);
  const owned = db.prepare('SELECT 1 FROM contacts WHERE id = ? AND user_id = ?').get(id, userId);
  if (owned) {
    db.prepare('UPDATE contacts SET is_default = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE contacts SET is_default = 1 WHERE id = ?').run(id);
    flash(req, 'success', 'Đã đặt làm hồ sơ mặc định.');
  }
  res.redirect('/tai-khoan/ho-so');
});

router.post('/tai-khoan/ho-so/:id/xoa', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const id = Number(req.params.id);
  const used = db.prepare('SELECT 1 FROM domains WHERE contact_id = ?').get(id);
  if (used) {
    flash(req, 'error', 'Không thể xóa: hồ sơ này đang gắn với tên miền đang hoạt động.');
  } else {
    db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(id, userId);
    flash(req, 'info', 'Đã xóa hồ sơ.');
  }
  res.redirect('/tai-khoan/ho-so');
});

/* ------------------------------------------------------------ thong tin ca nhan */

router.get('/tai-khoan', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  res.render('account/profile', {
    title: 'Tài khoản của tôi',
    user: db.prepare('SELECT id, email, full_name, phone, balance, created_at FROM users WHERE id = ?').get(userId),
    tokens: db.prepare('SELECT id, name, token_prefix, scopes, last_used_at, created_at FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC').all(userId),
    wallet: db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId),
    newToken: null,
    errors: {},
  });
});

router.post('/tai-khoan/thong-tin', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  db.prepare('UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?')
    .run(String(req.body?.full_name ?? '').slice(0, 120), String(req.body?.phone ?? '').slice(0, 20), nowIso(), userId);
  flash(req, 'success', 'Đã cập nhật thông tin.');
  res.redirect('/tai-khoan');
});

router.post(
  '/tai-khoan/doi-mat-khau',
  requireAuth,
  wrap(async (req, res) => {
    const userId = req.currentUser!.id;
    const current = String(req.body?.current_password ?? '');
    const next = String(req.body?.password ?? '');
    const confirm = String(req.body?.password_confirm ?? '');

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string };
    if (!verifyPassword(current, row.password_hash)) {
      flash(req, 'error', 'Mật khẩu hiện tại không đúng.');
      return res.redirect('/tai-khoan');
    }
    const check = passwordSchema.safeParse(next);
    if (!check.success) {
      flash(req, 'error', check.error.issues[0]?.message ?? 'Mật khẩu không hợp lệ');
      return res.redirect('/tai-khoan');
    }
    if (next !== confirm) {
      flash(req, 'error', 'Mật khẩu nhập lại không khớp.');
      return res.redirect('/tai-khoan');
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(next), nowIso(), userId);
    audit({ userId, action: 'user.change_password', entity: 'user', entityId: userId, ip: req.ip });
    flash(req, 'success', 'Đã đổi mật khẩu.');
    res.redirect('/tai-khoan');
  }),
);

/* ------------------------------------------------------------------ bao mat */

/** Du lieu chung cua trang Bao mat; `them` de chen QR hoac ma du phong. */
function trangBaoMat(req: import('express').Request, them: Record<string, unknown> = {}) {
  const user = req.currentUser!;
  return {
    title: 'Bảo mật tài khoản',
    state: getState(user.id),
    batBuoc: requires2FA(user.role),
    setup: null as { uri: string; secret: string } | null,
    /** Khoa chia nhom 4 ky tu cho nguoi dung nhap tay khi khong quet duoc QR. */
    secretDeNhap: '',
    qr: '',
    recoveryCodes: null as string[] | null,
    errors: {} as Record<string, string>,
    ...them,
  };
}

router.get('/tai-khoan/bao-mat', requireAuth, (req, res) => {
  const user = req.currentUser!;
  // Neu dang cai dat do (vd nguoi dung tai lai trang) thi hien lai dung ma QR do
  const setup = getPendingSetup(user.id, user.email);
  res.render('account/security', trangBaoMat(req, setup ? { setup, secretDeNhap: formatSecret(setup.secret), qr: qrSvg(setup.uri, { alt: 'Mã QR cài đặt xác thực hai lớp' }) } : {}));
});

router.post('/tai-khoan/bao-mat/bat-dau', requireAuth, (req, res) => {
  const user = req.currentUser!;
  try {
    const setup = beginSetup(user.id, user.email);
    res.render('account/security', trangBaoMat(req, {
      state: getState(user.id),
      setup,
      secretDeNhap: formatSecret(setup.secret),
      qr: qrSvg(setup.uri, { alt: 'Mã QR cài đặt xác thực hai lớp' }),
    }));
  } catch (err) {
    flash(req, 'error', err instanceof Error ? err.message : 'Không bắt đầu được.');
    res.redirect('/tai-khoan/bao-mat');
  }
});

router.post(
  '/tai-khoan/bao-mat/xac-nhan',
  requireAuth,
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Nhập sai quá nhiều lần. Vui lòng thử lại sau.' }),
  (req, res) => {
    const user = req.currentUser!;
    const kq = confirmSetup(user.id, String(req.body?.code ?? ''), req.ip);

    if (!kq.ok) {
      const setup = getPendingSetup(user.id, user.email);
      res.status(422).render('account/security', trangBaoMat(req, {
        setup,
        secretDeNhap: setup ? formatSecret(setup.secret) : '',
        qr: setup ? qrSvg(setup.uri, { alt: 'Mã QR cài đặt xác thực hai lớp' }) : '',
        errors: { code: kq.loi ?? 'Mã không đúng' },
      }));
      return;
    }

    // Ma du phong chi hien MOT lan, ngay day - he thong khong luu ban goc
    res.render('account/security', trangBaoMat(req, {
      state: getState(user.id),
      recoveryCodes: kq.recoveryCodes ?? null,
    }));
  },
);

router.post(
  '/tai-khoan/bao-mat/tat',
  requireAuth,
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Nhập sai quá nhiều lần. Vui lòng thử lại sau.' }),
  (req, res) => {
    const user = req.currentUser!;
    if (requires2FA(user.role)) {
      flash(req, 'error', 'Tài khoản quản trị bắt buộc dùng xác thực hai lớp, không thể tắt.');
      return res.redirect('/tai-khoan/bao-mat');
    }

    const kq = disable2FA(user.id, String(req.body?.code ?? ''), req.ip);
    flash(req, kq.ok ? 'success' : 'error', kq.ok ? 'Đã tắt xác thực hai lớp.' : (kq.loi ?? 'Không tắt được.'));
    res.redirect('/tai-khoan/bao-mat');
  },
);

router.post('/tai-khoan/bao-mat/ma-du-phong', requireAuth, (req, res) => {
  const user = req.currentUser!;
  if (!getState(user.id).enabled) {
    flash(req, 'error', 'Chưa bật xác thực hai lớp.');
    return res.redirect('/tai-khoan/bao-mat');
  }
  res.render('account/security', trangBaoMat(req, { recoveryCodes: regenerateRecoveryCodes(user.id, req.ip) }));
});

/* ------------------------------------------------------------------ API token */

router.post('/tai-khoan/api-token', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const name = String(req.body?.name ?? 'Token').slice(0, 60);
  const scopes = String(req.body?.scopes ?? 'read') === 'write' ? 'read,write' : 'read';

  const token = `pat_${randomToken(24)}`;
  db.prepare(
    `INSERT INTO api_tokens (user_id, name, token_prefix, token_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, name, token.slice(0, 12), sha256(token), scopes, nowIso());

  audit({ userId, action: 'api_token.create', entity: 'user', entityId: userId, ip: req.ip, meta: { name, scopes } });

  res.render('account/profile', {
    title: 'Tài khoản của tôi',
    user: db.prepare('SELECT id, email, full_name, phone, balance, created_at FROM users WHERE id = ?').get(userId),
    tokens: db.prepare('SELECT id, name, token_prefix, scopes, last_used_at, created_at FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC').all(userId),
    wallet: db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId),
    // Chi hien thi DUY NHAT mot lan - he thong khong luu token dang goc
    newToken: token,
    errors: {},
  });
});

router.post('/tai-khoan/api-token/:id/thu-hoi', requireAuth, (req, res) => {
  db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?')
    .run(nowIso(), Number(req.params.id), req.currentUser!.id);
  flash(req, 'info', 'Đã thu hồi API token.');
  res.redirect('/tai-khoan');
});

export default router;
