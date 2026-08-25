import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sessionMiddleware, takeFlash } from './middleware/session.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/error.js';
import { settings } from './lib/settings.js';
import { buildCsp } from './lib/csp.js';
import { getCart } from './services/cart.js';
import { formatVnd } from './lib/money.js';
import { isVerified } from './services/verification.js';

import homeRoutes from './routes/home.js';
import authRoutes from './routes/auth.js';
import cartRoutes from './routes/cart.js';
import checkoutRoutes from './routes/checkout.js';
import orderRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';
import controlPanelRoutes from './routes/controlPanel.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

export function createApp() {
  const app = express();

  if (config.trustProxy) app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(here, 'views'));
  app.disable('x-powered-by');

  // Webhook can body tho de xac thuc chu ky -> giu lai ban raw
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
  app.use(express.static(path.join(projectRoot, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

  // Header bao mat co ban (khong can thu vien ngoai)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', buildCsp());
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(sessionMiddleware);

  // Bien dung chung cho moi view.
  // Phai dat TRUOC csrfMiddleware: khi CSRF bi tu choi, trang loi cung can
  // cac bien nay de render duoc (neu khong se thanh loi 500 kho hieu).
  app.use((req, res, next) => {
    res.locals['site'] = settings.site();
    res.locals['currentUser'] = req.currentUser ?? null;
    res.locals['flashes'] = takeFlash(req);
    res.locals['cartCount'] = req.method === 'GET' ? getCart(req.cartKey).count : 0;
    res.locals['formatVnd'] = formatVnd;
    res.locals['currentPath'] = req.path;
    res.locals['appUrl'] = config.appUrl;
    res.locals['csrfToken'] = '';
    // Hien dai nhac xac thuc email tren moi trang khi khach chua xac thuc
    res.locals['needsEmailVerify'] = Boolean(req.currentUser) && !isVerified(req.currentUser!.id);
    next();
  });

  app.use(csrfMiddleware);

  app.use('/', homeRoutes);
  app.use('/', authRoutes);
  app.use('/gio-hang', cartRoutes);
  app.use('/thanh-toan', checkoutRoutes);
  app.use('/don-hang', orderRoutes);
  app.use('/webhooks', webhookRoutes);
  app.use('/control-panel', controlPanelRoutes);
  app.use('/', accountRoutes);
  app.use('/admin', adminRoutes);
  app.use('/api/v1', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
