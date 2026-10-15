/**
 * KHU VUC QUAN TRI.
 *
 * Trang trong tam: /admin/cau-hinh  -> "Cấu hình Control Panel"
 * Cho phep sua truc tiep (khong can sua .env, khong can restart):
 *   - Ket noi API dai ly P.A Viet Nam (endpoint, username, API Key, sandbox)
 *   - Nameserver mac dinh
 *   - Chinh sach gia (markup, lam tron, VAT)
 *   - SePay (tai khoan nhan tien, webhook token, API token)
 *   - Vi dien tu MoMo / ZaloPay
 *   - SMTP gui email
 *   - Thuong hieu (ten site, mau sac, hotline)
 */
import { Router } from 'express';
import { db, nowIso, parseJson } from '../db/index.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { maskSecret, randomToken } from '../lib/crypto.js';
import { resetMailer } from '../lib/mailer.js';
import { SECRET_KEYS, getSetting, setSettings, settings } from '../lib/settings.js';
import { listTlds, upsertTld } from '../services/pricing.js';
import { getOrder, getOrderItems, refreshOrderStatus } from '../services/orders.js';
import { confirmManually } from '../payments/index.js';
import { provisionOrder } from '../services/provisioning.js';
import { getBalance, checkDomain } from '../pavietnam/client.js';
import { enqueue, jobStats } from '../jobs/queue.js';
import { kickWorker } from '../jobs/worker.js';
import { credit } from '../payments/balance.js';
import { audit } from '../services/audit.js';
import { buildSepayQrUrl } from '../payments/sepay.js';
import { sendMail } from '../lib/mailer.js';
import { buildPermissionUrl, exchangeAuthorizationCode, isZnsReady, normalizePhone, sendZns } from '../lib/zns.js';
import { ZNS_EVENTS, ZNS_EVENT_LIST } from '../services/znsEvents.js';
import { pendingRefundCount, refundFailedItems, refundOrderItem } from '../services/refunds.js';
import {
  listOwnershipRequests, ownerSnapshot, pendingOwnershipCount, setOwnershipStatus,
} from '../services/domainContact.js';
import { formatVnd } from '../lib/money.js';
import {
  doanhThuTheoDuoi, doanhThuTheoThang, duBaoGiaHan, khachHangHangDau, theoPhuongThuc,
  tongQuan, xuatDoanhThu, xuatDonHang, xuatTenMien,
} from '../services/reports.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth, requireAdmin);

/* -------------------------------------------------------------- tong quan */

router.get('/', (_req, res) => {
  const count = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;

  res.render('admin/dashboard', {
    title: 'Quản trị - Tổng quan',
    stats: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      domains: count('SELECT COUNT(*) AS n FROM domains'),
      activeDomains: count(`SELECT COUNT(*) AS n FROM domains WHERE status='active'`),
      pendingOrders: count(`SELECT COUNT(*) AS n FROM orders WHERE status='pending_payment'`),
      failedItems: pendingRefundCount(),
      ownershipPending: pendingOwnershipCount(),
      revenue: (db.prepare(`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status IN ('paid','processing','completed','partially_completed')`).get() as { n: number }).n,
    },
    jobs: jobStats(),
    recentOrders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 10').all(),
    recentErrors: db.prepare(`SELECT * FROM api_logs WHERE ok = 0 ORDER BY id DESC LIMIT 8`).all(),
  });
});

/* --------------------------------------------- CAU HINH CONTROL PANEL */

/** Cac o nhap tren trang cau hinh: [key trong DB, nhan hien thi, loai]. */
const SETTING_FIELDS: { key: string; label: string; type?: 'text' | 'password' | 'number' | 'checkbox' | 'textarea'; hint?: string }[] = [
  // Thuong hieu
  { key: 'site.name', label: 'Tên website' },
  { key: 'site.tagline', label: 'Khẩu hiệu' },
  { key: 'site.hotline', label: 'Hotline' },
  { key: 'site.support_email', label: 'Email hỗ trợ' },
  { key: 'site.address', label: 'Địa chỉ công ty' },
  { key: 'site.primary_color', label: 'Màu chủ đạo', hint: 'Ví dụ: #0f766e' },
  { key: 'site.logo_url', label: 'Đường dẫn logo' },

  // API P.A Viet Nam
  { key: 'pa.endpoint', label: 'API endpoint', hint: 'https://daily.pavietnam.vn/interface.php' },
  { key: 'pa.username', label: 'Username đại lý' },
  { key: 'pa.apikey', label: 'API Key', type: 'password', hint: 'API Key đổi khi bạn đổi mật khẩu tài khoản đại lý' },
  { key: 'pa.sandbox', label: 'Chế độ giả lập (không gọi API thật)', type: 'checkbox' },

  // DNS & gia
  { key: 'dns.default_ns', label: 'Nameserver mặc định', hint: 'Cách nhau bằng dấu phẩy' },
  { key: 'pricing.markup_percent', label: 'Tỷ lệ cộng thêm (%)', type: 'number' },
  { key: 'pricing.round_step', label: 'Làm tròn giá lên bội số (VND)', type: 'number' },
  { key: 'pricing.vat_percent', label: 'VAT mặc định (%)', type: 'number' },
  { key: 'order.auto_provision', label: 'Tự động đăng ký sau khi thanh toán', type: 'checkbox' },
  { key: 'order.payment_ttl_hours', label: 'Giờ giữ đơn chờ thanh toán', type: 'number' },
  { key: 'order.auto_refund_failed', label: 'Tự động hoàn tiền vào ví khi đăng ký thất bại', type: 'checkbox' },
  { key: 'order.sync_batch_size', label: 'Số tên miền đồng bộ mỗi lần quét', type: 'number' },
  { key: 'order.sync_stale_hours', label: 'Làm mới tên miền sau bao nhiêu giờ', type: 'number' },
  { key: 'order.sync_near_expiry_hours', label: 'Tên miền sắp hết hạn: đọc lại mỗi (giờ)', type: 'number' },
  { key: 'order.renew_notice_days', label: 'Mốc nhắc gia hạn (ngày)', hint: 'Ví dụ: 30,15,7,1' },

  // SePay
  { key: 'sepay.enabled', label: 'Bật thanh toán chuyển khoản (SePay)', type: 'checkbox' },
  { key: 'sepay.bank_code', label: 'Mã ngân hàng (QR)', hint: 'TCB, VCB, ACB, MB, BIDV...' },
  { key: 'sepay.bank_name', label: 'Tên ngân hàng hiển thị' },
  { key: 'sepay.account_number', label: 'Số tài khoản nhận tiền' },
  { key: 'sepay.account_name', label: 'Tên chủ tài khoản' },
  { key: 'sepay.webhook_token', label: 'SePay webhook token', type: 'password', hint: 'Trùng với header Apikey khai báo trên my.sepay.vn' },
  { key: 'sepay.api_token', label: 'SePay API token', type: 'password', hint: 'Dùng để đối soát bù khi webhook thất lạc' },

  // Vi dien tu
  { key: 'momo.enabled', label: 'Bật ví MoMo', type: 'checkbox' },
  { key: 'momo.partner_code', label: 'MoMo Partner Code' },
  { key: 'momo.access_key', label: 'MoMo Access Key', type: 'password' },
  { key: 'momo.secret_key', label: 'MoMo Secret Key', type: 'password' },
  { key: 'momo.endpoint', label: 'MoMo endpoint' },
  { key: 'zalopay.enabled', label: 'Bật ZaloPay', type: 'checkbox' },
  { key: 'zalopay.app_id', label: 'ZaloPay App ID' },
  { key: 'zalopay.key1', label: 'ZaloPay Key1', type: 'password' },
  { key: 'zalopay.key2', label: 'ZaloPay Key2', type: 'password' },
  { key: 'zalopay.endpoint', label: 'ZaloPay endpoint' },

  // Xac thuc tai khoan
  { key: 'auth.require_email_verified', label: 'Bắt buộc xác thực email trước khi đặt hàng', type: 'checkbox' },
  { key: 'auth.verify_resend_per_hour', label: 'Số lần gửi lại email xác thực / giờ', type: 'number' },

  // Bao mat
  { key: 'security.require_2fa_admin', label: 'Bắt buộc xác thực hai lớp cho tài khoản quản trị', type: 'checkbox', hint: 'Tắt khi không còn thiết bị xác thực - nhưng khi tắt, mật khẩu bị lộ là mất toàn bộ quyền quản trị' },

  // ZNS - Zalo Notification Service
  { key: 'zns.enabled', label: 'Bật gửi tin qua Zalo (ZNS)', type: 'checkbox' },
  { key: 'zns.app_id', label: 'Zalo App ID' },
  { key: 'zns.secret_key', label: 'Zalo Secret Key', type: 'password' },
  { key: 'zns.refresh_token', label: 'Zalo Refresh Token', type: 'password', hint: 'Zalo đổi token này mỗi lần dùng - hệ thống tự lưu lại bản mới' },

  // Email
  { key: 'smtp.host', label: 'SMTP host' },
  { key: 'smtp.port', label: 'SMTP port', type: 'number' },
  { key: 'smtp.secure', label: 'SMTP dùng SSL/TLS', type: 'checkbox' },
  { key: 'smtp.user', label: 'SMTP user' },
  { key: 'smtp.pass', label: 'SMTP password', type: 'password' },
  { key: 'smtp.from', label: 'Địa chỉ gửi đi' },
  { key: 'smtp.admin_alert', label: 'Email nhận cảnh báo nội bộ' },
];

/** Gia tri hien tai de do vao form; secret duoc che di. */
function currentSettingValues(): Record<string, string> {
  const resolved: Record<string, string> = {
    ...flatten('site', settings.site()),
    ...flatten('pa', settings.pa()),
    'dns.default_ns': settings.dns().defaultNameservers.join(','),
    ...flatten('pricing', settings.pricing()),
    ...flatten('order', settings.order()),
    ...flatten('sepay', settings.sepay()),
    ...flatten('momo', settings.momo()),
    ...flatten('zalopay', settings.zalopay()),
    ...flatten('smtp', settings.smtp()),
    ...flatten('security', settings.security()),
  };
  for (const key of SECRET_KEYS) {
    if (resolved[key]) resolved[key] = maskSecret(resolved[key]!);
  }
  return resolved;
}

/** camelCase -> snake_case va gan tien to nhom. */
function flatten(prefix: string, obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`;
    out[key] = Array.isArray(v) ? v.join(',') : typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? '');
  }
  return out;
}

router.get('/cau-hinh', (_req, res) => {
  res.render('admin/settings', {
    title: 'Cấu hình Control Panel',
    fields: SETTING_FIELDS,
    values: currentSettingValues(),
    secretKeys: SECRET_KEYS,
    webhookUrl: `${config.appUrl}/webhooks/sepay`,
    qrPreview: buildSepayQrUrl({ amount: 10000, addInfo: 'DHTEST01' }),
    znsEvents: ZNS_EVENT_LIST.map((e) => ({ ...e, templateId: getSetting(e.settingKey, '') })),
    znsReady: isZnsReady(),
  });
});

/** Luu rieng cac template ID cua ZNS (danh sach dong theo su kien). */
router.post('/cau-hinh/zns-template', (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const updates: Record<string, string> = {};
  for (const e of ZNS_EVENT_LIST) {
    const v = body[e.settingKey];
    if (v !== undefined) updates[e.settingKey] = v.trim();
  }
  setSettings(updates);
  flash(req, 'success', 'Đã lưu template ID của ZNS.');
  res.redirect('/admin/cau-hinh');
});

router.post('/cau-hinh', (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const updates: Record<string, string> = {};

  for (const field of SETTING_FIELDS) {
    if (field.type === 'checkbox') {
      updates[field.key] = body[field.key] ? '1' : '0';
      continue;
    }
    const value = body[field.key];
    if (value === undefined) continue;

    // O secret de trong hoac van dang hien thi dang che -> giu nguyen gia tri cu
    if (SECRET_KEYS.includes(field.key)) {
      if (!value.trim() || value.includes('*')) continue;
    }
    updates[field.key] = value.trim();
  }

  setSettings(updates, SECRET_KEYS);
  resetMailer();
  audit({
    userId: req.currentUser!.id, action: 'settings.update', entity: 'settings', ip: req.ip,
    meta: { keys: Object.keys(updates).filter((k) => !SECRET_KEYS.includes(k)) },
  });

  flash(req, 'success', 'Đã lưu cấu hình. Thay đổi có hiệu lực ngay, không cần khởi động lại.');
  res.redirect('/admin/cau-hinh');
});

/** Kiem tra ket noi API P.A ngay tren trang cau hinh. */
router.post(
  '/cau-hinh/kiem-tra-api',
  wrap(async (req, res) => {
    const domain = String(req.body?.test_domain ?? '').trim() || 'pavietnam.vn';
    try {
      const check = await checkDomain(domain);
      let balanceText = '';
      try {
        const b = await getBalance();
        balanceText = b.ok ? ` Số dư đại lý: ${b.balance.toLocaleString('vi-VN')}.` : '';
      } catch {
        // khong bat buoc
      }
      flash(
        req,
        check.ok ? 'success' : 'error',
        `Kết nối API: ${check.ok ? 'THÀNH CÔNG' : 'THẤT BẠI'}. ${domain} -> ${check.available ? 'còn trống' : 'đã đăng ký'}.${balanceText} ` +
          `Phản hồi thô: ${check.raw.slice(0, 200)}`,
      );
    } catch (err) {
      flash(
        req,
        'error',
        `Không gọi được API: ${err instanceof Error ? err.message : String(err)}. ` +
          'Kiểm tra lại username/API Key và IP đã được P.A whitelist chưa.',
      );
    }
    res.redirect('/admin/cau-hinh');
  }),
);

/** Gui thu mot email de kiem tra cau hinh SMTP ngay tren giao dien. */
router.post(
  '/cau-hinh/kiem-tra-smtp',
  wrap(async (req, res) => {
    const to = String(req.body?.test_email ?? '').trim() || req.currentUser!.email;
    const s = settings.smtp();

    const ok = await sendMail({
      to,
      template: 'smtp_test',
      subject: `[${settings.site().name}] Thử cấu hình SMTP`,
      html:
        `<p>Nếu bạn đọc được email này, cấu hình SMTP đã hoạt động.</p>` +
        `<p>Máy chủ: <b>${s.host}:${s.port}</b> (${s.secure ? 'SSL/TLS' : 'không mã hóa'})<br>` +
        `Gửi từ: <b>${s.from}</b></p>`,
    });

    if (ok) {
      flash(req, 'success', `Đã gửi email thử tới ${to}. Kiểm tra hộp thư (cả thư mục spam).`);
    } else {
      const last = db.prepare(`SELECT error FROM email_logs WHERE status='failed' ORDER BY id DESC LIMIT 1`)
        .get() as { error: string } | undefined;
      flash(req, 'error', `Gửi thất bại. ${last?.error ?? 'Kiểm tra host, port, tài khoản và mật khẩu ứng dụng.'}`);
    }
    res.redirect('/admin/cau-hinh');
  }),
);

/** Gui thu mot tin ZNS de kiem tra ket noi Zalo. */
router.post(
  '/cau-hinh/kiem-tra-zns',
  wrap(async (req, res) => {
    const phone = String(req.body?.test_phone ?? '').trim();
    const event = String(req.body?.test_event ?? 'domain_activated') as keyof typeof ZNS_EVENTS;
    const spec = ZNS_EVENTS[event] ?? ZNS_EVENTS.domain_activated;

    if (!normalizePhone(phone)) {
      flash(req, 'error', 'Số điện thoại không hợp lệ. Dùng dạng 0901234567 hoặc 84901234567.');
      return res.redirect('/admin/cau-hinh');
    }

    // Dien du lieu mau cho dung cac tham so ma mau tin khai bao
    const templateData: Record<string, string> = {};
    for (const key of spec.params) {
      templateData[key] = key === 'amount' ? formatVnd(100_000)
        : key.includes('domain') ? 'vidu-thu.vn'
        : key.includes('date') || key.includes('expires') ? new Date().toISOString().slice(0, 10)
        : key.includes('days') ? '7'
        : key.includes('order') ? 'DHTHU001'
        : 'thử nghiệm';
    }

    const result = await sendZns({
      phone,
      templateId: getSetting(spec.settingKey, ''),
      templateData,
      event: `test_${event}`,
      userId: req.currentUser!.id,
    });

    flash(
      req,
      result.ok ? 'success' : 'error',
      result.ok
        ? `Đã gửi ZNS thử tới ${phone} (msg_id: ${result.msgId ?? '-'}). Kiểm tra Zalo của số này.`
        : `Gửi ZNS thất bại: ${result.error ?? 'không rõ nguyên nhân'}`,
    );
    res.redirect('/admin/cau-hinh');
  }),
);

/* ------------------------------------------------------------------ bao cao */

router.get('/bao-cao', (_req, res) => {
  const theoThang = doanhThuTheoThang(12);
  res.render('admin/reports', {
    title: 'Báo cáo kinh doanh',
    tongQuan: tongQuan(),
    theoThang,
    // Truc y dung chung cho ca 12 cot; 1 de tranh chia cho 0 khi chua co du lieu
    dinhTruc: Math.max(1, ...theoThang.map((t) => t.doanhThu)),
    theoDuoi: doanhThuTheoDuoi(),
    phuongThuc: theoPhuongThuc(),
    duBao: duBaoGiaHan(),
    khachHang: khachHangHangDau(10),
  });
});

/** Xuat du lieu ra CSV (mo duoc bang Excel). */
router.get('/xuat/:loai', (req, res) => {
  const loai = String(req.params.loai);
  const ngay = new Date().toISOString().slice(0, 10);

  const bang: Record<string, { csv: () => string; ten: string }> = {
    'don-hang': { csv: xuatDonHang, ten: `don-hang-${ngay}.csv` },
    'ten-mien': { csv: xuatTenMien, ten: `ten-mien-${ngay}.csv` },
    'doanh-thu': { csv: () => xuatDoanhThu(24), ten: `doanh-thu-${ngay}.csv` },
  };

  const muc = bang[loai];
  if (!muc) {
    flash(req, 'error', 'Loại dữ liệu không hợp lệ.');
    return res.redirect('/admin/bao-cao');
  }

  audit({ userId: req.currentUser!.id, action: 'report.export', entity: 'report', entityId: loai, ip: req.ip });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${muc.ten}"`);
  res.send(muc.csv());
});

/* ------------------------------------------------------------------ bang gia */

router.get('/bang-gia', (_req, res) => {
  res.render('admin/pricing', { title: 'Quản lý bảng giá', tlds: listTlds({ activeOnly: false }) });
});

router.post('/bang-gia', (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const tld = String(body['tld'] ?? '').trim().replace(/^\./, '').toLowerCase();
  if (!tld) {
    flash(req, 'error', 'Vui lòng nhập đuôi tên miền.');
    return res.redirect('/admin/bang-gia');
  }

  upsertTld({
    tld,
    kind: body['kind'] === 'vn' ? 'vn' : 'intl',
    label: String(body['label'] ?? ''),
    cost_register: Number(body['cost_register']) || 0,
    cost_renew: Number(body['cost_renew']) || 0,
    price_register: Number(body['price_register']) || 0,
    price_renew: Number(body['price_renew']) || 0,
    price_transfer: Number(body['price_transfer']) || 0,
    setup_fee: Number(body['setup_fee']) || 0,
    vat_percent: Number(body['vat_percent']) || 0,
    min_years: Number(body['min_years']) || 1,
    max_years: Number(body['max_years']) || 10,
    requires_vn_contact: body['requires_vn_contact'] ? 1 : 0,
    is_active: body['is_active'] ? 1 : 0,
    is_featured: body['is_featured'] ? 1 : 0,
    sort_order: Number(body['sort_order']) || 100,
  });

  flash(req, 'success', `Đã lưu bảng giá cho .${tld}`);
  res.redirect('/admin/bang-gia');
});

/* ---------------------------------------------------------- ma giam gia */

router.get('/ma-giam-gia', (_req, res) => {
  res.render('admin/coupons', {
    title: 'Mã giảm giá',
    coupons: db.prepare('SELECT * FROM coupons ORDER BY id DESC LIMIT 200').all(),
    tlds: listTlds({ activeOnly: false }),
  });
});

router.post('/ma-giam-gia', (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const code = String(body['code'] ?? '').trim().toUpperCase();

  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    flash(req, 'error', 'Mã giảm giá chỉ gồm chữ, số, gạch ngang - từ 3 đến 30 ký tự.');
    return res.redirect('/admin/ma-giam-gia');
  }

  const discountType = body['discount_type'] === 'fixed' ? 'fixed' : 'percent';
  const value = Math.max(0, Number(body['value']) || 0);
  if (discountType === 'percent' && value > 100) {
    flash(req, 'error', 'Giảm theo phần trăm không thể vượt quá 100%.');
    return res.redirect('/admin/ma-giam-gia');
  }
  if (!value) {
    flash(req, 'error', 'Vui lòng nhập mức giảm.');
    return res.redirect('/admin/ma-giam-gia');
  }

  // Ngay nhap dang yyyy-mm-dd (gio Viet Nam) -> quy ve moc UTC de so sanh nhat quan
  const toIso = (d: string, endOfDay = false) => {
    if (!d?.trim()) return null;
    const t = Date.parse(endOfDay ? `${d}T23:59:59+07:00` : `${d}T00:00:00+07:00`);
    return Number.isNaN(t) ? null : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  };

  db.prepare(
    `INSERT INTO coupons (code, discount_type, value, min_amount, max_discount, tld_filter,
                          max_uses, starts_at, expires_at, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       discount_type=excluded.discount_type, value=excluded.value, min_amount=excluded.min_amount,
       max_discount=excluded.max_discount, tld_filter=excluded.tld_filter, max_uses=excluded.max_uses,
       starts_at=excluded.starts_at, expires_at=excluded.expires_at, is_active=excluded.is_active`,
  ).run(
    code, discountType, value,
    Math.max(0, Number(body['min_amount']) || 0),
    Math.max(0, Number(body['max_discount']) || 0),
    String(body['tld_filter'] ?? '').trim().toLowerCase(),
    Math.max(0, Number(body['max_uses']) || 0),
    toIso(String(body['starts_at'] ?? '')),
    toIso(String(body['expires_at'] ?? ''), true),
    body['is_active'] ? 1 : 0,
    nowIso(),
  );

  audit({ userId: req.currentUser!.id, action: 'coupon.save', entity: 'coupon', entityId: code, ip: req.ip });
  flash(req, 'success', `Đã lưu mã giảm giá ${code}.`);
  res.redirect('/admin/ma-giam-gia');
});

router.post('/ma-giam-gia/:id/trang-thai', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE coupons SET is_active = CASE is_active WHEN 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  flash(req, 'success', 'Đã đổi trạng thái mã giảm giá.');
  res.redirect('/admin/ma-giam-gia');
});

/* ------------------------------------------------------------------ don hang */

router.get('/don-hang', (req, res) => {
  const status = String(req.query['status'] ?? '');
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all();
  res.render('admin/orders', { title: 'Quản lý đơn hàng', orders: rows, status });
});

router.get('/don-hang/:id', (req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) {
    flash(req, 'error', 'Không tìm thấy đơn hàng.');
    return res.redirect('/admin/don-hang');
  }
  res.render('admin/order-detail', {
    title: `Đơn hàng ${order.code}`,
    order,
    items: getOrderItems(order.id),
    payments: db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC').all(order.id),
    customer: db.prepare('SELECT id, email, full_name, phone FROM users WHERE id = ?').get(order.user_id),
  });
});

/** Xac nhan thanh toan thu cong (khach chuyen khoan nhung khong doi soat duoc). */
router.post(
  '/don-hang/:id/xac-nhan-thanh-toan',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const outcome = await confirmManually(id, req.currentUser!.id, String(req.body?.note ?? ''));
    kickWorker();
    flash(
      req,
      outcome.status === 'paid' ? 'success' : 'info',
      outcome.status === 'paid' ? 'Đã ghi nhận thanh toán, hệ thống đang đăng ký tên miền.'
        : outcome.status === 'already_paid' ? 'Đơn hàng này đã được thanh toán trước đó.'
        : 'Không thể ghi nhận thanh toán cho đơn này.',
    );
    res.redirect(`/admin/don-hang/${id}`);
  }),
);

/** Chay lai cap phat cho don bi loi. */
router.post(
  '/don-hang/:id/cap-phat-lai',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    // Dua cac dong that bai ve trang thai cho de chay lai
    db.prepare(`UPDATE order_items SET status='pending', attempts=0, error='' WHERE order_id=? AND status='failed'`).run(id);
    try {
      const summary = await provisionOrder(id);
      flash(req, 'success', `Đã chạy lại: ${summary.succeeded} thành công, ${summary.failed} thất bại.`);
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Không chạy lại được.');
    }
    refreshOrderStatus(id);
    res.redirect(`/admin/don-hang/${id}`);
  }),
);

/** Hoan tien mot dong don da that bai vao so du khach hang. */
router.post(
  '/don-hang/:id/hoan-tien/:itemId',
  wrap(async (req, res) => {
    const orderId = Number(req.params.id);
    const outcome = await refundOrderItem(Number(req.params.itemId), {
      actorUserId: req.currentUser!.id,
      reason: String(req.body?.reason ?? '').slice(0, 200),
    });

    const thongBao: Record<string, [string, string]> = {
      refunded: ['success', `Đã hoàn ${outcome.status === 'refunded' ? formatVnd(outcome.amount) : ''} vào số dư khách hàng.`],
      already_refunded: ['info', 'Dòng đơn này đã được hoàn tiền trước đó.'],
      not_refundable: ['error', outcome.status === 'not_refundable' ? outcome.reason : 'Không hoàn được'],
      not_found: ['error', 'Không tìm thấy dòng đơn hàng.'],
    };
    const [loai, noiDung] = thongBao[outcome.status] ?? ['error', 'Không hoàn được'];
    flash(req, loai as 'success' | 'info' | 'error', noiDung);
    res.redirect(`/admin/don-hang/${orderId}`);
  }),
);

/** Hoan tien toan bo cac dong da that bai cua don. */
router.post(
  '/don-hang/:id/hoan-tien-tat-ca',
  wrap(async (req, res) => {
    const orderId = Number(req.params.id);
    const { refunded, total } = await refundFailedItems(orderId, {
      actorUserId: req.currentUser!.id,
      reason: String(req.body?.reason ?? '').slice(0, 200),
    });
    flash(
      req,
      refunded ? 'success' : 'info',
      refunded ? `Đã hoàn ${refunded} dòng, tổng ${formatVnd(total)} vào số dư khách hàng.` : 'Không có dòng nào cần hoàn tiền.',
    );
    res.redirect(`/admin/don-hang/${orderId}`);
  }),
);

/* ------------------------------------------------- ho so doi chu the */

router.get('/doi-chu-the', (req, res) => {
  const status = String(req.query['status'] ?? '');
  res.render('admin/ownership', {
    title: 'Hồ sơ đổi chủ thể',
    requests: listOwnershipRequests(status ? { status } : {}),
    status,
    ownerSnapshot,
  });
});

router.post(
  '/doi-chu-the/:id/trang-thai',
  wrap(async (req, res) => {
    const status = String(req.body?.status ?? '') as Parameters<typeof setOwnershipStatus>[1];
    const hopLe = ['pending', 'in_review', 'need_documents', 'approved', 'completed', 'rejected', 'cancelled'];
    if (!hopLe.includes(status)) {
      flash(req, 'error', 'Trạng thái không hợp lệ.');
      return res.redirect('/admin/doi-chu-the');
    }

    const ok = await setOwnershipStatus(Number(req.params.id), status, {
      adminUserId: req.currentUser!.id,
      note: String(req.body?.note ?? ''),
    });
    flash(req, ok ? 'success' : 'error', ok ? 'Đã cập nhật hồ sơ và gửi email cho khách.' : 'Không tìm thấy hồ sơ.');
    res.redirect('/admin/doi-chu-the');
  }),
);

/* -------------------------------------------------------------- ten mien */

router.get('/ten-mien', (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  const rows = q
    ? db.prepare(`SELECT d.*, u.email FROM domains d JOIN users u ON u.id=d.user_id
                  WHERE d.domain LIKE ? ORDER BY d.id DESC LIMIT 200`).all(`%${q}%`)
    : db.prepare(`SELECT d.*, u.email FROM domains d JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT 200`).all();
  res.render('admin/domains', { title: 'Quản lý tên miền', domains: rows, q });
});

router.post('/ten-mien/:id/dong-bo', (req, res) => {
  const row = db.prepare('SELECT domain FROM domains WHERE id = ?').get(Number(req.params.id)) as { domain: string } | undefined;
  if (row) {
    enqueue('sync_domain', { domain: row.domain }, { dedupeKey: `sync:${row.domain}` });
    kickWorker();
    flash(req, 'info', `Đang đồng bộ ${row.domain}...`);
  }
  res.redirect('/admin/ten-mien');
});

/* ------------------------------------------------------------- nguoi dung */

router.get('/nguoi-dung', (req, res) => {
  const q = String(req.query['q'] ?? '').trim();
  const rows = q
    ? db.prepare('SELECT id,email,full_name,phone,role,status,balance,created_at FROM users WHERE email LIKE ? OR full_name LIKE ? ORDER BY id DESC LIMIT 200').all(`%${q}%`, `%${q}%`)
    : db.prepare('SELECT id,email,full_name,phone,role,status,balance,created_at FROM users ORDER BY id DESC LIMIT 200').all();
  res.render('admin/users', { title: 'Quản lý khách hàng', users: rows, q });
});

router.post('/nguoi-dung/:id/nap-vi', (req, res) => {
  const userId = Number(req.params.id);
  const amount = Math.round(Number(req.body?.amount) || 0);
  if (amount === 0) {
    flash(req, 'error', 'Số tiền không hợp lệ.');
    return res.redirect('/admin/nguoi-dung');
  }
  const after = credit(userId, amount, amount > 0 ? 'topup' : 'adjustment', `admin:${req.currentUser!.id}`, String(req.body?.note ?? ''));
  audit({ userId: req.currentUser!.id, action: 'wallet.adjust', entity: 'user', entityId: userId, ip: req.ip, meta: { amount } });
  flash(req, 'success', `Đã cập nhật số dư. Số dư mới: ${formatVnd(after)}`);
  res.redirect('/admin/nguoi-dung');
});

router.post('/nguoi-dung/:id/trang-thai', (req, res) => {
  const userId = Number(req.params.id);
  const status = String(req.body?.status ?? 'active') === 'suspended' ? 'suspended' : 'active';
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), userId);
  if (status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  audit({ userId: req.currentUser!.id, action: 'user.status', entity: 'user', entityId: userId, ip: req.ip, meta: { status } });
  flash(req, 'success', status === 'suspended' ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
  res.redirect('/admin/nguoi-dung');
});

/* ---------------------------------------------------- nhat ky & hang doi */

router.get('/nhat-ky-api', (req, res) => {
  const onlyErrors = String(req.query['loi'] ?? '') === '1';
  const rows = onlyErrors
    ? db.prepare('SELECT * FROM api_logs WHERE ok = 0 ORDER BY id DESC LIMIT 200').all()
    : db.prepare('SELECT * FROM api_logs ORDER BY id DESC LIMIT 200').all();
  res.render('admin/api-logs', { title: 'Nhật ký gọi API', logs: rows, onlyErrors });
});

router.get('/giao-dich', (_req, res) => {
  res.render('admin/bank-transactions', {
    title: 'Đối soát ngân hàng',
    transactions: db.prepare('SELECT * FROM bank_transactions ORDER BY id DESC LIMIT 200').all(),
  });
});

/** Buoc 1: chuyen quan tri vien sang Zalo de cap quyen cho ung dung. */
router.get('/zns/ket-noi', (req, res) => {
  const cfg = settings.zns();
  if (!cfg.appId || !cfg.secretKey) {
    flash(req, 'error', 'Vui lòng điền App ID và Secret Key trước khi kết nối.');
    return res.redirect('/admin/cau-hinh');
  }

  // state chong CSRF: Zalo se tra lai nguyen ven, ta doi chieu o buoc 2
  const state = randomToken(16);
  req.session['znsOauthState'] = state;
  res.redirect(buildPermissionUrl(`${config.appUrl}/admin/zns/callback`, state));
});

/** Buoc 2: Zalo chuyen ve day kem oa_code -> doi lay refresh token va luu. */
router.get(
  '/zns/callback',
  wrap(async (req, res) => {
    const state = String(req.query['state'] ?? '');
    const luu = String(req.session['znsOauthState'] ?? '');
    delete req.session['znsOauthState'];

    if (!luu || state !== luu) {
      flash(req, 'error', 'Phiên kết nối không hợp lệ hoặc đã hết hạn. Vui lòng bấm Kết nối lại.');
      return res.redirect('/admin/zns');
    }

    const oaCode = String(req.query['oa_code'] ?? req.query['code'] ?? '');
    if (!oaCode) {
      const loi = String(req.query['error_description'] ?? req.query['error'] ?? 'Zalo không trả về mã cấp quyền');
      flash(req, 'error', `Kết nối thất bại: ${loi}`);
      return res.redirect('/admin/zns');
    }

    try {
      await exchangeAuthorizationCode(oaCode);
      audit({ userId: req.currentUser!.id, action: 'zns.connected', entity: 'settings', ip: req.ip });
      flash(req, 'success', 'Đã kết nối Zalo OA thành công. Từ đây hệ thống tự duy trì token, bạn không phải làm gì thêm.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Không đổi được token');
    }
    res.redirect('/admin/zns');
  }),
);

router.get('/zns', (_req, res) => {
  const cfg = settings.zns();
  res.render('admin/zns-logs', {
    title: 'Nhật ký ZNS',
    logs: db.prepare('SELECT * FROM zns_logs ORDER BY id DESC LIMIT 200').all(),
    ready: isZnsReady(),
    coAppId: Boolean(cfg.appId && cfg.secretKey),
    daKetNoi: Boolean(cfg.refreshToken),
    callbackUrl: `${config.appUrl}/admin/zns/callback`,
  });
});

router.get('/hang-doi', (_req, res) => {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 100').all() as {
    id: number; type: string; payload: string; status: string; attempts: number; last_error: string; run_after: string;
  }[];
  res.render('admin/jobs', {
    title: 'Hàng đợi xử lý',
    jobs: rows.map((j) => ({ ...j, payloadObj: parseJson<Record<string, unknown>>(j.payload, {}) })),
    stats: jobStats(),
  });
});

router.post('/hang-doi/:id/chay-lai', (req, res) => {
  db.prepare(`UPDATE jobs SET status='queued', attempts=0, run_after=?, last_error='' WHERE id=?`)
    .run(nowIso(), Number(req.params.id));
  kickWorker();
  flash(req, 'info', 'Đã đưa job vào hàng đợi chạy lại.');
  res.redirect('/admin/hang-doi');
});

router.post('/hang-doi/chay-ngay', (req, res) => {
  const type = String(req.body?.type ?? '');
  if (type) {
    enqueue(type as never, {}, { maxAttempts: 1 });
    kickWorker();
    flash(req, 'info', `Đã xếp lịch chạy "${type}".`);
  }
  res.redirect('/admin/hang-doi');
});

export default router;
