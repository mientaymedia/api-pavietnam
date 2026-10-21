import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sessionMiddleware, takeFlash } from './middleware/session.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/error.js';
import { settings, zaloChatOaId } from './lib/settings.js';
import { buildCsp } from './lib/csp.js';
import { getCart } from './services/cart.js';
import { formatVnd } from './lib/money.js';
import { isVerified } from './services/verification.js';
import { BASE, outsideBase, redirectWithBase, taoRedirectTienTo, withBase } from './lib/basePath.js';
import { CONG } from './lib/congTaiKhoan.js';
import { clientIpMiddleware } from './lib/clientIp.js';
import { danhSachTinh, phuongCuaTinh } from './lib/diaGioi.js';
import { danhSachDangBat } from './lib/oauth.js';
import { laEmailTam } from './services/lienKetMxh.js';

import homeRoutes from './routes/home.js';
import timCungAiRoutes from './routes/timCungAi.js';
import authRoutes from './routes/auth.js';
import dangNhapMxhRoutes from './routes/dangNhapMxh.js';
import cartRoutes from './routes/cart.js';
import checkoutRoutes from './routes/checkout.js';
import orderRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';
import telegramWebhookRoutes from './routes/telegramWebhook.js';
import controlPanelRoutes from './routes/controlPanel.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';
import noiBoRoutes from './routes/noiBo.js';
import congTaiKhoanRoutes from './routes/congTaiKhoan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

export function createApp() {
  const app = express();

  if (config.clientIpHeader) {
    // IP lay tu header cua Cloudflare, dat vao X-Forwarded-For roi tin dung mot lop
    app.use(clientIpMiddleware(config.clientIpHeader));
    app.set('trust proxy', 1);
  } else if (config.trustProxy) {
    app.set('trust proxy', 1);
  }
  app.set('view engine', 'ejs');
  app.set('views', path.join(here, 'views'));
  app.disable('x-powered-by');

  // Header bao mat co ban (khong can thu vien ngoai). O cap app de ca phan
  // hoi ngoai tien to BASE_PATH cung co.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Chi trang khach co nut chat Zalo moi mo CSP cho Zalo (xem lib/csp.ts)
    res.setHeader('Content-Security-Policy', buildCsp({ zaloChat: Boolean(zaloChatOaId()) && !laTrangQuanTri(req.path) }));
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

  lopChung(site, true);

  site.use('/', homeRoutes);
  site.use('/', timCungAiRoutes);
  site.use('/', authRoutes);
  site.use('/', dangNhapMxhRoutes);
  site.use('/gio-hang', cartRoutes);
  site.use('/thanh-toan', checkoutRoutes);
  site.use('/don-hang', orderRoutes);
  site.use('/webhooks/telegram', telegramWebhookRoutes);
  site.use('/webhooks', webhookRoutes);
  site.use('/control-panel', controlPanelRoutes);
  site.use('/', accountRoutes);
  site.use('/admin', adminRoutes);
  site.use('/api/noi-bo', noiBoRoutes);
  site.use('/api/v1', apiRoutes);

  site.use(notFound);
  site.use(errorHandler);

  if (BASE) {
    app.use(BASE, site);
    // Cong "Tai khoan MienTay" (docs/mtm/tai-khoan-chung/spec.md): router rieng
    // gan o CONG_TAI_KHOAN_PATH, cung lop chung va cung phien voi /ten-mien.
    // Lop boc redirect them tien to cua cong nen ham xu ly dung chung voi
    // routes/auth.ts goi res.redirect('/dang-nhap/hai-lop') la dung cho.
    if (CONG) {
      const cong = express.Router();
      cong.use(taoRedirectTienTo(CONG));
      lopChung(cong, false);
      cong.use('/', congTaiKhoanRoutes);
      cong.use(notFound);
      cong.use(errorHandler);
      app.use(CONG, cong);
    }
    app.use(outsideBase);
  } else {
    app.use(site);
  }
  return app;
}

/**
 * Lop dung chung cua moi router trang: body, cookie, phien, bien cho view, CSRF.
 * Dung cho router /ten-mien va router cong Tai khoan MienTay.
 */
function lopChung(r: express.Router, coTepTinh: boolean): void {
  // Webhook can body tho de xac thuc chu ky -> giu lai ban raw
  r.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  r.use(express.urlencoded({ extended: false, limit: '256kb' }));
  r.use(cookieParser());
  // Tep tinh dat TRUOC phien: tai CSS, anh khong tao phien moi. Cong khong co
  // tep tinh rieng, dung tep cua /ten-mien (cung container).
  if (coTepTinh) r.use(express.static(path.join(projectRoot, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

  r.use(sessionMiddleware);

  // Bien dung chung cho moi view.
  // Phai dat TRUOC csrfMiddleware: khi CSRF bi tu choi, trang loi cung can
  // cac bien nay de render duoc (neu khong se thanh loi 500 kho hieu).
  r.use((req, res, next) => {
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
    // Cong Tai khoan MienTay: link trong cong dung <%= cong %>/..., tep tinh van <%= base %>/...
    res.locals['cong'] = CONG;
    res.locals['siteChinhUrl'] = config.siteChinhUrl;
    res.locals['csrfToken'] = '';
    // Danh sach tinh, phuong xa theo ten P.A cho form ho so chu the
    res.locals['diaGioi'] = { danhSachTinh, phuongCuaTinh };
    // Hien dai nhac xac thuc email tren moi trang khi khach chua xac thuc
    // OA cho nut chat Zalo o footer; rong o trang quan tri hoac khi tat
    res.locals['zaloChatOa'] = laTrangQuanTri(req.path) ? '' : zaloChatOaId();
    res.locals['needsEmailVerify'] = Boolean(req.currentUser) && !isVerified(req.currentUser!.id);
    // Tai khoan tao bang Zalo chua co email: dai nhac doi sang "Bo sung email"
    res.locals['thieuEmail'] = Boolean(req.currentUser) && laEmailTam(req.currentUser!.email);
    // Nut dang nhap mang xa hoi: chi ben da nhap du khoa va dang bat
    res.locals['nutMxh'] = req.currentUser ? [] : danhSachDangBat();
    next();
  });

  r.use(csrfMiddleware);
}

/**
 * Duong dan thuoc trang quan tri (co hoac khong co tien to BASE_PATH): o day
 * khong gan nut chat Zalo, khong mo CSP cho Zalo.
 */
function laTrangQuanTri(duong: string): boolean {
  const bo = BASE && (duong === BASE || duong.startsWith(BASE + '/')) ? duong.slice(BASE.length) || '/' : duong;
  return /^\/admin(\/|$)/.test(bo);
}
