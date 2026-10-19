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
 *   - Tim cung AI (khoa OpenAI, model, tran chi phi, gioi han, tu cam)
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
import { NHAN_NHOM } from '../pavietnam/maLoi.js';
import { dongDangGiu, kichHoatDonCho, nhaDong, tomTatChoQuy } from '../services/choQuy.js';
import { enqueue, jobStats } from '../jobs/queue.js';
import { kickWorker } from '../jobs/worker.js';
import { credit } from '../payments/balance.js';
import { audit } from '../services/audit.js';
import { buildSepayQrUrl } from '../payments/sepay.js';
import { sendSmtpTest } from '../services/notifications.js';
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
import { chiPhiHomNay, thongKeGanDay, trangThaiAi } from '../services/goiYTenMien.js';

const router = Router();
router.use(requireAuth, requireAdmin);

/**
 * Che do goi P.A hien tren MOI trang quan tri (admin-nav): de quen bat che do
 * thu thi don "dang ky xong" ma khong co ten mien that.
 */
function cheDoPA(): { ma: 'gia_lap' | 'thu' | 'that'; nhan: string } {
  const pa = settings.pa();
  if (pa.sandbox) return { ma: 'gia_lap', nhan: 'Giả lập (không gọi P.A)' };
  if (pa.useTestEndpoint) return { ma: 'thu', nhan: `Thử: lệnh đăng ký, gia hạn, đổi DNS đi ${pa.endpointTest} (P.A trả 900, không trừ tiền, không đăng ký thật)` };
  return { ma: 'that', nhan: 'Thật (interface.php)' };
}

router.use((_req, res, next) => {
  res.locals['paCheDo'] = cheDoPA();
  next();
});

/* -------------------------------------------------------------- tong quan */

router.get('/', wrap(async (_req, res) => {
  const count = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;
  // So du doc truc tiep tu P.A moi lan mo trang (check_account_still), loi thi bao loi
  const choQuy = await tomTatChoQuy();

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
    // Thong ke an danh Tim cung AI: chi so dem, khong co mo ta cua khach
    ai: {
      trangThai: trangThaiAi(),
      chiPhiHomNay: chiPhiHomNay(),
      tran: settings.ai().dailyCapVnd,
      thongKe: thongKeGanDay(14),
    },
    paSoDu: choQuy,
    dongGiu: {
      choQuy: choQuy.cho.length,
      canNguoi: dongDangGiu('can_nguoi_xu_ly').length,
      saiHoSo: dongDangGiu('sai_ho_so').length,
    },
  });
}));

/* --------------------------------------------- CAU HINH CONTROL PANEL */

/** Cac o nhap tren trang cau hinh: [key trong DB, nhan hien thi, loai]. */
const SETTING_FIELDS: { key: string; label: string; type?: 'text' | 'password' | 'number' | 'checkbox' | 'textarea'; hint?: string }[] = [
  // Thuong hieu
  { key: 'site.name', label: 'Tên website' },
  { key: 'site.tagline', label: 'Khẩu hiệu' },
  { key: 'site.hotline', label: 'Hotline' },
  { key: 'site.support_email', label: 'Email hỗ trợ' },
  { key: 'site.working_hours', label: 'Giờ làm việc', hint: 'Ví dụ: Thứ 2 đến thứ 7, 8:00 đến 17:30' },
  { key: 'site.address', label: 'Địa chỉ trụ sở' },
  { key: 'site.legal_name', label: 'Tên pháp lý công ty', hint: 'Chỉ in ở dòng pháp lý cuối trang; tên hiển thị là Tên website' },
  { key: 'site.tax_code', label: 'Mã số thuế' },
  { key: 'site.tax_issued', label: 'Nơi cấp và ngày cấp mã số thuế', hint: 'Ví dụ: Sở KH&ĐT tỉnh An Giang cấp ngày 13/06/2024' },
  { key: 'site.legal_rep', label: 'Người đại diện theo pháp luật', hint: 'In ở khối pháp lý cuối trang; để trống thì dùng mặc định Đinh Văn Tạo Em' },
  { key: 'site.bct_badge_img', label: 'Ảnh biểu tượng "Đã thông báo"', hint: 'Chỉ điền sau khi được xác nhận thông báo TMĐT. Đường dẫn ảnh, ví dụ /img/da-thong-bao.png' },
  { key: 'site.bct_badge_url', label: 'Link biểu tượng "Đã thông báo"', hint: 'Link do hệ thống online.gov.vn cấp, bắt đầu bằng https://online.gov.vn/' },
  { key: 'site.primary_color', label: 'Màu chủ đạo', hint: 'Ví dụ: #0a6cff' },
  { key: 'site.logo_url', label: 'Đường dẫn logo' },

  // API P.A Viet Nam
  { key: 'pa.endpoint', label: 'API endpoint', hint: 'https://daily.pavietnam.vn/interface.php' },
  { key: 'pa.username', label: 'Username đại lý' },
  { key: 'pa.apikey', label: 'API Key', type: 'password', hint: 'API Key đổi khi bạn đổi mật khẩu tài khoản đại lý' },
  { key: 'pa.sandbox', label: 'Chế độ giả lập (không gọi API thật)', type: 'checkbox' },
  { key: 'pa.endpoint_test', label: 'API endpoint chạy thử', hint: 'https://daily.pavietnam.vn/interface_test.php' },
  { key: 'pa.use_test_endpoint', label: 'Chế độ thử: đăng ký, gia hạn, đổi DNS đi endpoint chạy thử', type: 'checkbox', hint: 'P.A trả 900, không trừ tiền và KHÔNG đăng ký thật. Chỉ bật khi kiểm thử, nhớ tắt trước khi bán' },
  { key: 'pa.sendmail', label: 'Để P.A gửi email thông báo cho khách', type: 'checkbox', hint: 'Mặc định tắt: hệ thống đã tự gửi email kích hoạt, gia hạn' },

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

  // Tim cung AI (OpenAI). Chu chot 18/10/2026: mac dinh tat, 50.000 d/ngay,
  // 8 ten x 2 duoi, 5 luot/phut va 30 luot/ngay moi IP.
  { key: 'ai.enabled', label: 'Bật Tìm cùng AI ở trang chủ', type: 'checkbox', hint: 'Chỉ chạy khi đã có khóa OpenAI và tên model' },
  { key: 'ai.openai_key', label: 'Khóa API OpenAI', type: 'password', hint: 'Tạo trong tài khoản OpenAI, mục API keys. Lưu mã hóa, không hiện ra trình duyệt' },
  { key: 'ai.model', label: 'Tên model OpenAI', hint: 'Nhập đúng tên một model nhỏ, rẻ đang có trong tài khoản OpenAI của bạn' },
  { key: 'ai.reasoning_effort', label: 'Mức suy luận (tùy chọn)', hint: 'Để trống nếu model không phải model suy luận; model suy luận nên đặt minimal hoặc low cho nhanh và rẻ' },
  { key: 'ai.daily_cap_vnd', label: 'Trần chi phí mỗi ngày (VND)', type: 'number', hint: 'Chạm trần thì AI tự tắt đến hết ngày (giờ Việt Nam), ô tìm thường vẫn chạy' },
  { key: 'ai.price_input_usd', label: 'Đơn giá token vào (USD cho 1 triệu token)', hint: 'Theo bảng giá OpenAI của model đã chọn. Mặc định 1, cố ý cao để ước tính dư' },
  { key: 'ai.price_output_usd', label: 'Đơn giá token ra (USD cho 1 triệu token)', hint: 'Gồm cả token suy luận. Mặc định 5' },
  { key: 'ai.usd_vnd', label: 'Tỷ giá USD sang VND', type: 'number' },
  { key: 'ai.max_names', label: 'Số tên gợi ý mỗi lượt (tối đa 8)', type: 'number' },
  { key: 'ai.max_checks', label: 'Số lệnh kiểm tra P.A mỗi lượt (tối đa 16)', type: 'number' },
  { key: 'ai.rate_per_minute', label: 'Số lượt mỗi phút cho một IP', type: 'number' },
  { key: 'ai.rate_per_day', label: 'Số lượt mỗi ngày cho một IP', type: 'number' },
  { key: 'ai.timeout_sec', label: 'Thời gian chờ OpenAI (giây)', type: 'number' },
  { key: 'ai.blocked_words', label: 'Từ cấm và thương hiệu', type: 'textarea', hint: 'Cách nhau bằng dấu phẩy hoặc xuống dòng. Tên gợi ý chứa các từ này bị loại trước khi kiểm tra với P.A' },
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
    ...flatten('ai', settings.ai()),
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

/**
 * Kiem tra ket noi API P.A: goi check_account_still (chi doc, da xac minh that).
 * Tra loi co Money nghia la username, API Key va IP whitelist deu dung. Neu nhap
 * ten mien thu thi kiem them check_whois.
 */
router.post(
  '/cau-hinh/kiem-tra-api',
  wrap(async (req, res) => {
    const domain = String(req.body?.test_domain ?? '').trim();
    try {
      const b = await getBalance();
      if (!b.ok) {
        const ma = b.returnCode !== null && b.returnCode !== undefined ? ` Mã ${b.returnCode}.` : '';
        flash(req, 'error',
          `Kết nối API: THẤT BẠI.${ma} ${b.message}`.trim() +
          ' Kiểm tra username, API Key và IP máy chủ đã được P.A cho phép chưa.');
        return res.redirect('/admin/cau-hinh');
      }
      let them = '';
      if (domain) {
        try {
          const check = await checkDomain(domain);
          them = ` ${check.domain}: ${check.available ? 'còn trống' : 'đã có chủ'}.`;
        } catch (err) {
          them = ` Kiểm tra ${domain} lỗi: ${err instanceof Error ? err.message : String(err)}.`;
        }
      }
      flash(req, 'success', `Kết nối API: THÀNH CÔNG. Số dư đại lý: ${formatVnd(b.balance)}. Chế độ: ${cheDoPA().nhan}.${them}`);
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
    // Qua khung email chung (meta charset utf-8) nhu moi mau khac
    const ok = await sendSmtpTest(to);

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

/* ------------------------------------------- don dang giu (cho xu ly) */

router.get('/cho-xu-ly', wrap(async (_req, res) => {
  res.render('admin/cho-xu-ly', {
    title: 'Đơn chờ xử lý',
    tomTat: await tomTatChoQuy(),
    canNguoi: dongDangGiu('can_nguoi_xu_ly'),
    saiHoSo: dongDangGiu('sai_ho_so'),
    nhanNhom: NHAN_NHOM,
  });
}));

/** Kiem so du va dang ky ngay cac don cho quy (cung ham voi job 5 phut, Telegram, CRM). */
router.post('/cho-xu-ly/kich-hoat', wrap(async (req, res) => {
  const kq = await kichHoatDonCho();
  audit({ userId: req.currentUser!.id, action: 'cho_quy.kich_hoat', entity: 'order', ip: req.ip, meta: { soDong: kq.ketQua.length } });
  if (kq.loiSoDu) flash(req, 'error', `Không đọc được số dư đại lý: ${kq.loiSoDu}`);
  else if (kq.dangChay) flash(req, 'info', 'Một lượt kích hoạt khác đang chạy, vui lòng chờ.');
  else {
    const ok = kq.ketQua.filter((k) => k.ok).length;
    const dau = kq.ketQua.length ? `Đã chạy ${kq.ketQua.length} dòng, ${ok} đăng ký xong.` : 'Không có dòng nào chạy được.';
    const nap = kq.canNap ? `, cần nạp thêm ${formatVnd(kq.canNap)}` : '';
    flash(req, kq.ketQua.length ? 'success' : 'info', `${dau} Còn chờ: ${kq.conCho}${nap}.`);
  }
  res.redirect('/admin/cho-xu-ly');
}));

/** Nha mot dong dang giu (sau khi da sua ho so / kiem tren trang P.A) va chay lai. */
router.post('/cho-xu-ly/:itemId/thu-lai', (req, res) => {
  const itemId = Number(req.params.itemId);
  if (nhaDong(itemId)) {
    enqueue('provision_item', { itemId }, { dedupeKey: `provision_item:${itemId}` });
    kickWorker();
    audit({ userId: req.currentUser!.id, action: 'order_item.retry', entity: 'order_item', entityId: itemId, ip: req.ip });
    flash(req, 'success', 'Đã đưa dòng đơn vào hàng đợi đăng ký lại.');
  } else {
    flash(req, 'info', 'Dòng đơn này không còn bị giữ.');
  }
  res.redirect('/admin/cho-xu-ly');
});

/**
 * Chot that bai mot dong dang giu (vd 606 da doi soat voi P.A, khong dang ky
 * duoc). Sau do hoan tien o trang chi tiet don nhu dong that bai thuong.
 */
router.post('/cho-xu-ly/:itemId/that-bai', (req, res) => {
  const itemId = Number(req.params.itemId);
  const info = db.prepare(`UPDATE order_items SET status='failed', hold='', hold_since=NULL, updated_at=? WHERE id=? AND hold <> '' AND status='pending'`)
    .run(nowIso(), itemId);
  const row = db.prepare('SELECT order_id FROM order_items WHERE id = ?').get(itemId) as { order_id: number } | undefined;
  if (info.changes && row) {
    refreshOrderStatus(row.order_id);
    audit({ userId: req.currentUser!.id, action: 'order_item.mark_failed', entity: 'order_item', entityId: itemId, ip: req.ip });
    flash(req, 'success', 'Đã đánh dấu thất bại. Hoàn tiền ở trang chi tiết đơn nếu cần.');
    return res.redirect(`/admin/don-hang/${row.order_id}`);
  }
  flash(req, 'info', 'Dòng đơn này không còn bị giữ.');
  res.redirect('/admin/cho-xu-ly');
});

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
