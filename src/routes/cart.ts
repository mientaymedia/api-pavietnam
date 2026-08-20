import { Router } from 'express';
import { addToCart, clearCart, getCart, removeFromCart, updateCartYears } from '../services/cart.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { checkDomain } from '../pavietnam/client.js';
import { domainSchema, yearsSchema } from '../lib/validate.js';

const router = Router();

router.get('/', (req, res) => {
  res.render('cart', { title: 'Gio hang', cart: getCart(req.cartKey) });
});

router.post(
  '/them',
  wrap(async (req, res) => {
    const domain = domainSchema.safeParse(req.body?.domain);
    const years = yearsSchema.safeParse(req.body?.years ?? 1);
    const action = String(req.body?.action ?? 'register') as 'register' | 'renew' | 'transfer';

    if (!domain.success) {
      flash(req, 'error', 'Ten mien khong hop le.');
      return res.redirect('back');
    }

    // Kiem tra lai truoc khi them: tranh cho khach mua ten mien vua bi nguoi khac lay
    if (action === 'register') {
      try {
        const check = await checkDomain(domain.data);
        if (check.ok && !check.available) {
          flash(req, 'error', `Rat tiec, ${domain.data} vua duoc nguoi khac dang ky.`);
          return res.redirect('back');
        }
      } catch {
        // API loi -> van cho them vao gio, se kiem tra lai luc cap phat
      }
    }

    const result = addToCart({
      cartKey: req.cartKey,
      userId: req.currentUser?.id ?? null,
      domain: domain.data,
      action,
      years: years.success ? years.data : 1,
    });

    if (!result.ok) {
      flash(req, 'error', result.error);
      return res.redirect('back');
    }

    flash(req, 'success', `Da them ${domain.data} vao gio hang.`);
    res.redirect('/gio-hang');
  }),
);

router.post('/cap-nhat/:id', (req, res) => {
  const years = yearsSchema.safeParse(req.body?.years);
  if (years.success) updateCartYears(req.cartKey, Number(req.params.id), years.data);
  res.redirect('/gio-hang');
});

router.post('/xoa/:id', (req, res) => {
  removeFromCart(req.cartKey, Number(req.params.id));
  flash(req, 'info', 'Da xoa khoi gio hang.');
  res.redirect('/gio-hang');
});

router.post('/xoa-het', (req, res) => {
  clearCart(req.cartKey);
  res.redirect('/gio-hang');
});

export default router;
