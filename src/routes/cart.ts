import { Router, type Request } from 'express';
import { addToCart, clearCart, getCart, removeFromCart, updateCartYears } from '../services/cart.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { checkDomain } from '../pavietnam/client.js';
import { authCodeSchema, domainSchema, yearsSchema } from '../lib/validate.js';
import { rateLimit } from '../middleware/ratelimit.js';

const router = Router();

/**
 * Quay lai trang truoc do NHUNG chi khi do la trang noi bo.
 *
 * `res.redirect('back')` doc header Referer va khong kiem tra gi - co the day
 * nguoi dung sang trang ngoai. No cung da bi go khoi Express 5.
 */
function quayLai(req: Request): string {
  const macDinh = '/gio-hang';
  const referer = req.get('referer');
  if (!referer) return macDinh;
  try {
    const u = new URL(referer);
    const goc = `${req.protocol}://${req.get('host')}`;
    return u.origin === goc ? `${u.pathname}${u.search}` : macDinh;
  } catch {
    return macDinh;
  }
}

router.get('/', (req, res) => {
  res.render('cart', { title: 'Gio hang', cart: getCart(req.cartKey) });
});

router.post(
  '/them',
  // Moi lan them ten mien la mot lan goi API cua nha dang ky. Khong chan thi
  // khach vang lai cung co the dot het han muc API, hoac lam IP cua ta bi P.A
  // han che. Con so du rong rai cho nguoi mua that (mua 20 ten mien / phut).
  rateLimit({ windowMs: 60_000, max: 20, message: 'Ban them ten mien qua nhanh. Vui long cho mot chut.' }),
  wrap(async (req, res) => {
    const domain = domainSchema.safeParse(req.body?.domain);
    const years = yearsSchema.safeParse(req.body?.years ?? 1);
    const action = String(req.body?.action ?? 'register') as 'register' | 'renew' | 'transfer';

    if (!domain.success) {
      flash(req, 'error', 'Ten mien khong hop le.');
      return res.redirect(quayLai(req));
    }

    // Chuyen ten mien ve: bat buoc co ma EPP, va ten mien phai DA duoc dang ky
    let meta: Record<string, unknown> | undefined;
    if (action === 'transfer') {
      const raw = req.body?.auth_code;
      // Zod tra "Required" khi thieu truong - thay bang thong bao nguoi dung hieu duoc
      if (raw === undefined || String(raw).trim() === '') {
        flash(req, 'error', 'Vui long nhap ma xac thuc (EPP/Auth Code) lay tu nha dang ky hien tai.');
        return res.redirect(quayLai(req));
      }
      const code = authCodeSchema.safeParse(raw);
      if (!code.success) {
        flash(req, 'error', code.error.issues[0]?.message ?? 'Ma xac thuc khong hop le');
        return res.redirect(quayLai(req));
      }
      meta = { authCode: code.data };
    }

    // Kiem tra lai truoc khi them: tranh cho khach mua ten mien vua bi nguoi khac lay
    if (action === 'register') {
      try {
        const check = await checkDomain(domain.data);
        if (check.ok && !check.available) {
          flash(req, 'error', `Rat tiec, ${domain.data} vua duoc nguoi khac dang ky.`);
          return res.redirect(quayLai(req));
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
      ...(meta ? { meta } : {}),
    });

    if (!result.ok) {
      flash(req, 'error', result.error);
      return res.redirect(quayLai(req));
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
