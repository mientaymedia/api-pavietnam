import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { getCart } from '../services/cart.js';
import { createOrderFromCart } from '../services/orders.js';
import { computeDiscount, findCoupon } from '../services/pricing.js';
import { contactSchema, fieldErrors } from '../lib/validate.js';
import { getProvider, settlePayment } from '../payments/index.js';
import { isVerified, requireVerifiedToOrder } from '../services/verification.js';
import { kickWorker } from '../jobs/worker.js';
import { loiHoSoPA, type ContactRow } from '../services/domainContact.js';

const router = Router();

function contactsOf(userId: number): ContactRow[] {
  return db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id').all(userId) as ContactRow[];
}

router.get('/', requireAuth, (req, res) => {
  const cart = getCart(req.cartKey);
  if (!cart.lines.length) {
    flash(req, 'info', 'Giỏ hàng đang trống.');
    return res.redirect('/');
  }
  res.render('checkout/index', {
    title: 'Thanh toán',
    cart,
    contacts: contactsOf(req.currentUser!.id),
    coupon: '',
    discount: 0,
    couponError: '',
    contactErrors: {},
    values: {},
  });
});

/** Kiem tra ma giam gia truoc khi dat hang (khong tao don). */
router.post('/ma-giam-gia', requireAuth, (req, res) => {
  const cart = getCart(req.cartKey);
  const code = String(req.body?.coupon ?? '').trim();
  const { discount, error } = computeDiscount(
    findCoupon(code),
    cart.lines.map((l) => ({ tld: l.tld, amount: l.amount })),
  );

  res.render('checkout/index', {
    title: 'Thanh toán',
    cart,
    contacts: contactsOf(req.currentUser!.id),
    coupon: code,
    discount,
    couponError: code && !discount ? (error ?? 'Mã giảm giá không hợp lệ') : '',
    contactErrors: {},
    values: req.body ?? {},
  });
});

router.post(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const userId = req.currentUser!.id;
    const cart = getCart(req.cartKey);
    if (!cart.lines.length) {
      flash(req, 'error', 'Giỏ hàng đang trống.');
      return res.redirect('/');
    }

    // Ten mien duoc quan ly qua email; dat hang bang email chua xac thuc de
    // dan den mat lien lac voi tai san cua chinh khach.
    if (requireVerifiedToOrder() && !isVerified(userId)) {
      flash(req, 'error', 'Vui lòng xác thực địa chỉ email trước khi đặt hàng. Kiểm tra hộp thư của bạn.');
      return res.redirect('/thanh-toan');
    }

    let contactId = Number(req.body?.contact_id) || null;
    const veLai = (status: number, them: { contactErrors?: Record<string, string>; hoSoLoi?: string[]; suaHoSo?: number }) =>
      res.status(status).render('checkout/index', {
        title: 'Thanh toán',
        cart,
        contacts: contactsOf(userId),
        coupon: String(req.body?.coupon ?? ''),
        discount: 0,
        couponError: '',
        contactErrors: {},
        values: req.body ?? {},
        ...them,
      });

    // Buoc 1 cua form khong JS: chon tinh roi ve lai form kem phuong xa, chua tao don
    if (req.body?.buoc === 'chon-tinh') return veLai(200, { contactErrors: {}, hoSoLoi: [] });

    // P.A tu choi ho so thieu truong (ma 2xxx, 6020-6025): kiem theo tung duoi
    // can dang ky TRUOC khi tao don, khach sua ngay thay vi don treo sau khi tra tien
    const duoiDangKy = [...new Set(cart.lines.filter((l) => l.action === 'register').map((l) => l.tld))];
    const kiemTheoDuoi = (row: ContactRow) => [...new Set(duoiDangKy.flatMap((t) => loiHoSoPA(row, t)))];

    // Nguoi dung chon "tao ho so moi" -> validate va luu
    if (!contactId || req.body?.contact_mode === 'new') {
      const parsed = contactSchema.safeParse(req.body);
      if (!parsed.success) return veLai(422, { contactErrors: fieldErrors(parsed.error) });

      const c = parsed.data;
      const loi = kiemTheoDuoi({ ...c, id: 0, user_id: userId } as ContactRow);
      if (loi.length) return veLai(422, { contactErrors: {}, hoSoLoi: loi });

      const isFirst = contactsOf(userId).length === 0;
      const info = db
        .prepare(
          `INSERT INTO contacts (user_id, kind, full_name, org_name, id_number, tax_code, email, phone, address, ward,
                                 city, province, postal_code, country, birth_date, gender, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId, c.kind, c.full_name, c.org_name, c.id_number, c.tax_code, c.email, c.phone, c.address, c.ward,
          c.city, c.province, c.postal_code, c.country, c.birth_date, c.gender, isFirst ? 1 : 0, nowIso(), nowIso(),
        );
      contactId = Number(info.lastInsertRowid);
    } else {
      // Xac minh ho so thuoc ve chinh nguoi dung nay
      const row = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(contactId, userId) as ContactRow | undefined;
      if (!row) {
        flash(req, 'error', 'Hồ sơ chủ thể không hợp lệ.');
        return res.redirect('/thanh-toan');
      }
      const loi = kiemTheoDuoi(row);
      if (loi.length) return veLai(422, { hoSoLoi: loi, suaHoSo: row.id });
    }

    const created = createOrderFromCart({
      userId,
      cartKey: req.cartKey,
      contactId,
      couponCode: String(req.body?.coupon ?? ''),
      note: String(req.body?.note ?? '').slice(0, 500),
      ip: req.ip ?? '',
    });

    if (!created.ok) {
      flash(req, 'error', created.error);
      return res.redirect('/thanh-toan');
    }

    res.redirect(`/don-hang/${created.order.code}`);
  }),
);

/**
 * Khach quay ve tu cong thanh toan (MoMo / ZaloPay).
 * Day chi la trang HIEN THI. Viec ghi nhan tien luon dua vao IPN/webhook -
 * du lieu tren URL do trinh duyet mang ve nen khong duoc tin tuyet doi.
 */
router.get(
  '/ket-qua/:provider',
  wrap(async (req, res) => {
    const provider = getProvider(String(req.params.provider));
    if (!provider?.verifyReturn) {
      flash(req, 'info', 'Vui lòng kiểm tra trạng thái đơn hàng.');
      return res.redirect('/don-hang');
    }

    const query = Object.fromEntries(
      Object.entries(req.query).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : (v ?? ''))]),
    );
    const result = provider.verifyReturn(query);

    // Neu chu ky hop le va bao thanh cong, ghi nhan luon (IPN co the den cham)
    if (result.ok && result.refCode) {
      await settlePayment({
        provider: provider.id,
        refCode: result.refCode,
        amount: result.amount,
        providerTxn: result.providerTxn,
      });
      kickWorker();
    }

    if (result.refCode) {
      flash(req, result.ok ? 'success' : 'error', result.message);
      return res.redirect(`/don-hang/${result.refCode}`);
    }

    flash(req, 'error', result.message || 'Không xác định được kết quả thanh toán.');
    res.redirect('/don-hang');
  }),
);

export default router;
