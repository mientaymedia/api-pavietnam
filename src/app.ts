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
import { BASE, outsideBase, redirectWithBase, withBase } from './lib/basePath.js';

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

  // Header bao mat co ban (khong can thu vien ngoai). O cap app de ca phan
  // hoi ngoai tien to BASE_PATH cung co.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', buildCsp());
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Moi thu con lai nam trong router con mount tai BASE_PATH: ben trong,
  // req.path da bo tien to nen route, CSRF, gioi han tan suat, danh dau menu
  // chay y nhu khi app o goc.
  const site = express.Router();

  // Phai dung dau router con: redirect nao ben duoi cung duoc them tien to
  // va qua lop chan open redirect (ca khi BASE rong).
  site.use(redirectWithBase);

  // Webhook can body tho de xac thuc chu ky -> giu lai ban raw
  site.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  site.use(express.urlencoded({ extended: false, limit: '256kb' }));
  site.use(cookieParser());
  site.use(express.static(path.join(projectRoot, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

  site.use(sessionMiddleware);

  // Bien dung chung cho moi view.
  // Phai dat TRUOC csrfMiddleware: khi CSRF bi tu choi, trang loi cung can
  // cac bien nay de render duoc (neu khong se thanh loi 500 kho hieu).
  site.use((req, res, next) => {
    res.locals['site'] = settings.site();
    res.locals['currentUser'] = req.currentUser ?? null;
    res.locals['flashes'] = takeFlash(req);
    res.locals['cartCount'] = req.method === 'GET' ? getCart(req.cartKey).count : 0;
    res.locals['formatVnd'] = formatVnd;
    res.locals['currentPath'] = req.path;
    res.locals['appUrl'] = config.appUrl;
    // Link trong view: href="<%= base %>/gio-hang", hoac url(duong_dan) trong khoi ma
    res.locals['base'] = BASE;
    res.locals['url'] = withBase;
    res.locals['csrfToken'] = '';
    // Hien dai nhac xac thuc email tren moi trang khi khach chua xac thuc
    res.locals['needsEmailVerify'] = Boolean(req.currentUser) && !isVerified(req.currentUser!.id);
    next();
  });

  site.use(csrfMiddleware);

  site.use('/', homeRoutes);
  site.use('/', authRoutes);
  site.use('/gio-hang', cartRoutes);
  site.use('/thanh-toan', checkoutRoutes);
  site.use('/don-hang', orderRoutes);
  site.use('/webhooks', webhookRoutes);
  site.use('/control-panel', controlPanelRoutes);
  site.use('/', accountRoutes);
  site.use('/admin', adminRoutes);
  site.use('/api/v1', apiRoutes);

  site.use(notFound);
  site.use(errorHandler);

  if (BASE) {
    app.use(BASE, site);
    app.use(outsideBase);
  } else {
    app.use(site);
  }
  return app;
}
