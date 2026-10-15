import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { cancelOrder, getOrderByCode, getOrderItems, listOrders } from '../services/orders.js';
import { availableProviders, listPayments, startPayment, type ProviderId } from '../payments/index.js';
import { InsufficientBalance } from '../payments/balance.js';
import { settlePayment } from '../payments/index.js';
import { kickWorker } from '../jobs/worker.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { db } from '../db/index.js';
import { settings } from '../lib/settings.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  res.render('orders/list', { title: 'Đơn hàng của tôi', orders: listOrders(req.currentUser!.id) });
});

/** Lay don hang va kiem tra quyen xem. */
function loadOrder(req: Parameters<typeof requireAuth>[0], code: string) {
  const order = getOrderByCode(code);
  if (!order) return null;
  const isAdmin = req.currentUser?.role === 'admin' || req.currentUser?.role === 'staff';
  if (!isAdmin && order.user_id !== req.currentUser?.id) return null;
  return order;
}

router.get('/:code', (req, res) => {
  const order = loadOrder(req, String(req.params.code));
  if (!order) {
    flash(req, 'error', 'Không tìm thấy đơn hàng.');
    return res.redirect('/don-hang');
  }

  const payments = listPayments(order.id);
  res.render('orders/detail', {
    title: `Đơn hàng ${order.code}`,
    order,
    items: getOrderItems(order.id),
    payments,
    pendingPayment: payments.find((p) => p.status === 'pending') ?? null,
    providers: availableProviders(),
    balance: req.currentUser!.balance,
  });
});

router.post(
  '/:code/thanh-toan',
  rateLimit({ windowMs: 60_000, max: 10 }),
  wrap(async (req, res) => {
    const order = loadOrder(req, String(req.params.code));
    if (!order) {
      flash(req, 'error', 'Không tìm thấy đơn hàng.');
      return res.redirect('/don-hang');
    }
    if (order.status !== 'pending_payment') {
      flash(req, 'info', 'Đơn hàng này không còn chờ thanh toán.');
      return res.redirect(`/don-hang/${order.code}`);
    }

    const providerId = String(req.body?.provider ?? '') as ProviderId;

    try {
      const result = await startPayment({ order, providerId, clientIp: req.ip ?? '' });

      // Thanh toan bang so du: tien da bi tru ngay -> ghi nhan va cap phat luon
      if (providerId === 'balance') {
        await settlePayment({
          provider: 'balance',
          refCode: order.code,
          amount: order.total,
          providerTxn: result.payment.provider_txn || `WALLET-${order.id}`,
        });
        kickWorker();
        flash(req, 'success', 'Đã thanh toán bằng số dư. Hệ thống đang đăng ký tên miền.');
        return res.redirect(`/don-hang/${order.code}`);
      }

      if (result.payUrl) return res.redirect(result.payUrl);
      // Chuyen khoan: quay lai trang don hang, QR da duoc luu vao payment
      return res.redirect(`/don-hang/${order.code}`);
    } catch (err) {
      if (err instanceof InsufficientBalance) {
        flash(req, 'error', err.message);
      } else {
        flash(req, 'error', err instanceof Error ? err.message : 'Không tạo được giao dịch thanh toán.');
      }
      return res.redirect(`/don-hang/${order.code}`);
    }
  }),
);

router.post('/:code/huy', (req, res) => {
  const order = loadOrder(req, String(req.params.code));
  if (!order) {
    flash(req, 'error', 'Không tìm thấy đơn hàng.');
    return res.redirect('/don-hang');
  }
  if (order.status !== 'pending_payment') {
    flash(req, 'error', 'Chỉ có thể hủy đơn đang chờ thanh toán.');
    return res.redirect(`/don-hang/${order.code}`);
  }
  cancelOrder(order.id, 'Khách hàng tự hủy');
  flash(req, 'info', `Đã hủy đơn hàng ${order.code}.`);
  res.redirect('/don-hang');
});

/** Phieu thanh toan - ban in duoc, dung cho khach can chung tu noi bo. */
router.get('/:code/hoa-don', (req, res) => {
  const order = loadOrder(req, String(req.params.code));
  if (!order) {
    flash(req, 'error', 'Không tìm thấy đơn hàng.');
    return res.redirect('/don-hang');
  }

  res.render('orders/invoice', {
    title: `Phiếu thanh toán ${order.code}`,
    order,
    items: getOrderItems(order.id),
    payments: listPayments(order.id).filter((p) => p.status === 'paid'),
    contact: order.contact_id
      ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(order.contact_id)
      : null,
    customer: db.prepare('SELECT email, full_name, phone FROM users WHERE id = ?').get(order.user_id),
    site: settings.site(),
    bank: settings.sepay(),
  });
});

/** Kiem tra trang thai thanh toan (trang don hang tu goi de tu cap nhat). */
router.get('/:code/trang-thai', (req, res) => {
  const order = loadOrder(req, String(req.params.code));
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json({
    code: order.code,
    status: order.status,
    paid: order.status !== 'pending_payment' && order.status !== 'cancelled',
    items: getOrderItems(order.id).map((i) => ({ domain: i.domain, status: i.status, error: i.error })),
  });
});

export default router;
