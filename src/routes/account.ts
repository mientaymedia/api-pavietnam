/**
 * Khu vuc tai khoan khach hang: bang dieu khien, ho so chu the, doi mat khau,
 * API token (de khach tu xay front-end rieng), so du vi.
 */
import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { contactSchema, fieldErrors, passwordSchema } from '../lib/validate.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto.js';
import { daysUntilExpiry, listUserDomains } from '../services/domainRepo.js';
import { listOrders } from '../services/orders.js';
import { audit } from '../services/audit.js';

const router = Router();

// Router nay duoc gan o '/', nen requireAuth phai dat theo TUNG route.
// Neu dung router.use(requireAuth) thi moi request di qua day - ke ca route
// cong khai cua router khac - deu bi chan.

router.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const domains = listUserDomains(userId);
  const orders = listOrders(userId, 5);

  res.render('dashboard', {
    title: 'Bang dieu khien',
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

router.get('/tai-khoan/ho-so', requireAuth, (req, res) => {
  res.render('account/contacts', {
    title: 'Ho so chu the ten mien',
    contacts: db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id')
      .all(req.currentUser!.id),
    values: {},
    errors: {},
  });
});

router.post('/tai-khoan/ho-so', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render('account/contacts', {
      title: 'Ho so chu the ten mien',
      contacts: db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id').all(userId),
      values: req.body ?? {},
      errors: fieldErrors(parsed.error),
    });
  }

  const c = parsed.data;
  const id = Number(req.body?.id) || 0;
  const owned = id ? db.prepare('SELECT 1 FROM contacts WHERE id = ? AND user_id = ?').get(id, userId) : null;

  if (id && owned) {
    db.prepare(
      `UPDATE contacts SET kind=?, full_name=?, org_name=?, id_number=?, tax_code=?, email=?, phone=?, address=?,
                           city=?, province=?, postal_code=?, country=?, birth_date=?, gender=?, updated_at=?
       WHERE id=? AND user_id=?`,
    ).run(
      c.kind, c.full_name, c.org_name, c.id_number, c.tax_code, c.email, c.phone, c.address,
      c.city, c.province, c.postal_code, c.country, c.birth_date, c.gender, nowIso(), id, userId,
    );
    flash(req, 'success', 'Da cap nhat ho so chu the.');
  } else {
    const isFirst = (db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(userId) as { n: number }).n === 0;
    db.prepare(
      `INSERT INTO contacts (user_id, kind, full_name, org_name, id_number, tax_code, email, phone, address,
                             city, province, postal_code, country, birth_date, gender, is_default, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      userId, c.kind, c.full_name, c.org_name, c.id_number, c.tax_code, c.email, c.phone, c.address,
      c.city, c.province, c.postal_code, c.country, c.birth_date, c.gender, isFirst ? 1 : 0, nowIso(), nowIso(),
    );
    flash(req, 'success', 'Da them ho so chu the.');
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
    flash(req, 'success', 'Da dat lam ho so mac dinh.');
  }
  res.redirect('/tai-khoan/ho-so');
});

router.post('/tai-khoan/ho-so/:id/xoa', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  const id = Number(req.params.id);
  const used = db.prepare('SELECT 1 FROM domains WHERE contact_id = ?').get(id);
  if (used) {
    flash(req, 'error', 'Khong the xoa: ho so nay dang gan voi ten mien dang hoat dong.');
  } else {
    db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(id, userId);
    flash(req, 'info', 'Da xoa ho so.');
  }
  res.redirect('/tai-khoan/ho-so');
});

/* ------------------------------------------------------------ thong tin ca nhan */

router.get('/tai-khoan', requireAuth, (req, res) => {
  const userId = req.currentUser!.id;
  res.render('account/profile', {
    title: 'Tai khoan cua toi',
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
  flash(req, 'success', 'Da cap nhat thong tin.');
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
      flash(req, 'error', 'Mat khau hien tai khong dung.');
      return res.redirect('/tai-khoan');
    }
    const check = passwordSchema.safeParse(next);
    if (!check.success) {
      flash(req, 'error', check.error.issues[0]?.message ?? 'Mat khau khong hop le');
      return res.redirect('/tai-khoan');
    }
    if (next !== confirm) {
      flash(req, 'error', 'Mat khau nhap lai khong khop.');
      return res.redirect('/tai-khoan');
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(next), nowIso(), userId);
    audit({ userId, action: 'user.change_password', entity: 'user', entityId: userId, ip: req.ip });
    flash(req, 'success', 'Da doi mat khau.');
    res.redirect('/tai-khoan');
  }),
);

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
    title: 'Tai khoan cua toi',
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
  flash(req, 'info', 'Da thu hoi API token.');
  res.redirect('/tai-khoan');
});

export default router;
