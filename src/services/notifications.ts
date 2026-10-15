/**
 * Email gui cho khach hang & quan tri vien.
 * Moi mau email dung chung mot layout don gian, hop voi hau het mail client.
 */
import { config } from '../config.js';
import { formatVnd } from '../lib/money.js';
import { sendMail } from '../lib/mailer.js';
import { settings } from '../lib/settings.js';
import { db } from '../db/index.js';
import { getSetting } from '../lib/settings.js';
import { sendZns } from '../lib/zns.js';
import { ZNS_EVENTS, type ZnsEvent } from './znsEvents.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, bodyHtml: string): string {
  const site = settings.site();
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="background:${esc(site.primaryColor)};padding:20px 28px;color:#fff;font-size:18px;font-weight:600;">${esc(site.name)}</td></tr>
  <tr><td style="padding:28px;">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;">${esc(title)}</h1>
    ${bodyHtml}
  </td></tr>
  <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    ${esc(site.name)}${site.hotline ? ` &middot; Hotline: ${esc(site.hotline)}` : ''}${site.supportEmail ? ` &middot; ${esc(site.supportEmail)}` : ''}<br>
    Email này được gửi từ hệ thống, vui lòng không trả lời trực tiếp.
  </td></tr>
</table></td></tr></table></body></html>`;
}

function button(label: string, url: string): string {
  const site = settings.site();
  return `<p style="margin:24px 0;"><a href="${esc(url)}" style="background:${esc(site.primaryColor)};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600;">${esc(label)}</a></p>`;
}

function table(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;">
  ${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:42%;">${esc(k)}</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${v}</td></tr>`,
    )
    .join('')}
</table>`;
}

const url = (p: string) => `${config.appUrl}${p}`;

/* -------------------------------------------------------------------- mau email */

export async function sendWelcome(user: { id: number; email: string; full_name: string }): Promise<void> {
  await sendMail({
    to: user.email,
    userId: user.id,
    template: 'welcome',
    subject: `Chào mừng bạn đến với ${settings.site().name}`,
    html: layout('Tài khoản của bạn đã sẵn sàng', `
      <p>Xin chào <b>${esc(user.full_name || user.email)}</b>,</p>
      <p>Tài khoản của bạn đã được tạo thành công. Bạn có thể đăng nhập để tìm kiếm, đăng ký tên miền và quản lý DNS ngay bây giờ.</p>
      ${button('Vào trang quản lý', url('/dashboard'))}
    `),
  });
}

/**
 * Email xac thuc dia chi email khi dang ky.
 * Day la email dau tien khach nhan duoc, nen cung la phep thu SMTP tot nhat.
 */
export async function sendEmailVerification(
  user: { id: number; email: string; full_name: string },
  token: string,
): Promise<boolean> {
  const site = settings.site();
  const link = url(`/xac-thuc-email?token=${encodeURIComponent(token)}`);

  return sendMail({
    to: user.email,
    userId: user.id,
    template: 'email_verification',
    subject: `Xác thực địa chỉ email cho tài khoản ${site.name}`,
    html: layout('Xác thực địa chỉ email', `
      <p>Xin chào <b>${esc(user.full_name || user.email)}</b>,</p>
      <p>Vui lòng xác nhận đây là địa chỉ email của bạn. Hệ thống dùng email này để gửi
         <b>thông tin quản trị tên miền</b>: ngày hết hạn, nameserver, cảnh báo và hóa đơn.</p>
      ${button('Xác thực email của tôi', link)}
      <p style="font-size:13px;color:#6b7280;">
        Nếu nút trên không bấm được, sao chép liên kết sau vào trình duyệt:<br>
        <span style="word-break:break-all;font-family:monospace;font-size:12px;">${esc(link)}</span>
      </p>
      <p style="font-size:13px;color:#6b7280;">
        Liên kết có hiệu lực trong <b>24 giờ</b>. Nếu bạn không tạo tài khoản nào, hãy bỏ qua email này.
      </p>
    `),
  });
}

export async function sendPasswordReset(user: { id: number; email: string }, token: string): Promise<void> {
  await sendMail({
    to: user.email,
    userId: user.id,
    template: 'password_reset',
    subject: 'Khôi phục mật khẩu',
    html: layout('Đặt lại mật khẩu', `
      <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <b>${esc(user.email)}</b>.</p>
      <p>Liên kết có hiệu lực trong 60 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      ${button('Đặt lại mật khẩu', url(`/dat-lai-mat-khau?token=${encodeURIComponent(token)}`))}
    `),
  });
}

export async function sendOrderCreated(order: {
  id: number; code: string; total: number; user_id: number;
}, email: string, payment: { provider: string; payUrl?: string; qrUrl?: string; refCode: string }): Promise<void> {
  const bank = settings.sepay();
  const bankBlock = payment.provider === 'sepay'
    ? `${table([
        ['Ngân hàng', esc(bank.bankName || bank.bankCode)],
        ['Số tài khoản', `<span style="font-family:monospace;font-size:16px;">${esc(bank.accountNumber)}</span>`],
        ['Chủ tài khoản', esc(bank.accountName)],
        ['Số tiền', esc(formatVnd(order.total))],
        ['Nội dung chuyển khoản', `<span style="font-family:monospace;font-size:16px;color:#b91c1c;">${esc(payment.refCode)}</span>`],
      ])}
      <p style="font-size:13px;color:#b91c1c;">Vui lòng ghi <b>đúng nội dung chuyển khoản</b> để hệ thống tự động đối soát và kích hoạt tên miền.</p>
      ${payment.qrUrl ? `<p style="text-align:center;"><img src="${esc(payment.qrUrl)}" alt="Mã QR chuyển khoản" width="260" style="max-width:100%;border:1px solid #e5e7eb;border-radius:8px;"></p>` : ''}`
    : `<p>Vui lòng hoàn tất thanh toán để hệ thống kích hoạt tên miền tự động.</p>
       ${payment.payUrl ? button('Thanh toán ngay', payment.payUrl) : ''}`;

  await sendMail({
    to: email,
    userId: order.user_id,
    template: 'order_created',
    subject: `Đơn hàng ${order.code} - chờ thanh toán`,
    html: layout(`Đơn hàng ${esc(order.code)}`, `
      <p>Cảm ơn bạn đã đặt hàng. Đơn hàng đang chờ thanh toán.</p>
      ${bankBlock}
      ${button('Xem chi tiết đơn hàng', url(`/don-hang/${order.code}`))}
    `),
  });

  await notifyZns('order_created', order.user_id, {
    order_code: order.code,
    amount: formatVnd(order.total),
    domain: firstDomainOf(order.id),
  }, `order-${order.code}`);
}

export async function sendPaymentReceived(order: { id: number; code: string; total: number; user_id: number }, email: string): Promise<void> {
  await sendMail({
    to: email,
    userId: order.user_id,
    template: 'payment_received',
    subject: `Đã nhận thanh toán đơn hàng ${order.code}`,
    html: layout('Thanh toán thành công', `
      <p>Chúng tôi đã nhận được thanh toán <b>${esc(formatVnd(order.total))}</b> cho đơn hàng <b>${esc(order.code)}</b>.</p>
      <p>Hệ thống đang tiến hành đăng ký tên miền. Bạn sẽ nhận được email thông tin quản trị ngay khi hoàn tất (thường dưới 1 phút).</p>
      ${button('Theo dõi đơn hàng', url(`/don-hang/${order.code}`))}
    `),
  });

  await notifyZns('payment_received', order.user_id, {
    order_code: order.code,
    amount: formatVnd(order.total),
  }, `paid-${order.code}`);
}

/**
 * Email QUAN TRONG NHAT: thong tin quan tri ten mien sau khi dang ky thanh cong.
 */
export async function sendDomainActivated(input: {
  userId: number;
  email: string;
  domain: string;
  expiresAt?: string | null;
  nameservers: string[];
  years: number;
}): Promise<void> {
  const site = settings.site();
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'domain_activated',
    subject: `Tên miền ${input.domain} đã được kích hoạt`,
    html: layout(`Tên miền ${esc(input.domain)} đã hoạt động`, `
      <p>Tên miền của bạn đã được đăng ký thành công và kích hoạt.</p>
      ${table([
        ['Tên miền', `<span style="font-family:monospace;">${esc(input.domain)}</span>`],
        ['Thời hạn', `${esc(input.years)} năm`],
        ['Ngày hết hạn', esc(input.expiresAt ? input.expiresAt.slice(0, 10) : 'Đang cập nhật')],
        ['Nameserver', input.nameservers.length ? input.nameservers.map((n) => `<span style="font-family:monospace;">${esc(n)}</span>`).join('<br>') : 'Mặc định của hệ thống'],
      ])}
      <p>Bạn có thể quản lý bản ghi DNS, đổi nameserver và bật gia hạn tự động trong Control Panel:</p>
      ${button('Mở Control Panel tên miền', url(`/control-panel/${encodeURIComponent(input.domain)}`))}
      <p style="font-size:13px;color:#6b7280;">Lưu ý: thay đổi DNS cần 5 phút đến 24 giờ để cập nhật trên toàn cầu.</p>
      ${site.hotline ? `<p style="font-size:13px;color:#6b7280;">Cần hỗ trợ? Gọi ${esc(site.hotline)}.</p>` : ''}
    `),
  });

  await notifyZns('domain_activated', input.userId, {
    domain: input.domain,
    expires_at: input.expiresAt ? input.expiresAt.slice(0, 10) : 'đang cập nhật',
  }, `active-${input.domain}`);
}

/** Da gui yeu cau chuyen ten mien - con cho nha dang ky cu duyet. */
export async function sendTransferSubmitted(input: {
  userId: number; email: string; domain: string; orderCode: string;
}): Promise<void> {
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'transfer_submitted',
    subject: `Đã tiếp nhận yêu cầu chuyển tên miền ${input.domain}`,
    html: layout('Yêu cầu chuyển tên miền đã được gửi', `
      <p>Chúng tôi đã gửi yêu cầu chuyển <b>${esc(input.domain)}</b> về hệ thống (đơn hàng <b>${esc(input.orderCode)}</b>).</p>
      <p><b>Việc bạn cần làm tiếp:</b></p>
      <ul style="font-size:14px; line-height:1.8;">
        <li>Kiểm tra hộp thư của <b>email quản trị tên miền</b> - nhà đăng ký cũ sẽ gửi thư xác nhận.</li>
        <li>Bấm duyệt trong thư đó. Nếu không duyệt, yêu cầu sẽ tự hủy sau 5-7 ngày.</li>
        <li>Đảm bảo tên miền <b>không bị khóa</b> (trạng thái clientTransferProhibited) và đã quá 60 ngày kể từ lần đăng ký/chuyển gần nhất.</li>
      </ul>
      <p>Tên miền quốc tế thường mất 5-7 ngày để hoàn tất. Chúng tôi sẽ gửi email khi tên miền về tài khoản của bạn.</p>
      ${button('Theo dõi đơn hàng', url(`/don-hang/${input.orderCode}`))}
    `),
  });
}

export async function sendProvisionFailed(input: {
  userId: number; email: string; domain: string; orderCode: string; error: string;
}): Promise<void> {
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'provision_failed',
    subject: `Cần xử lý: đăng ký ${input.domain} chưa hoàn tất`,
    html: layout('Đăng ký tên miền chưa hoàn tất', `
      <p>Rất tiếc, hệ thống chưa đăng ký được tên miền <b>${esc(input.domain)}</b> thuộc đơn hàng <b>${esc(input.orderCode)}</b>.</p>
      <p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:8px;font-size:13px;">${esc(input.error)}</p>
      <p>Bộ phận kỹ thuật đã được thông báo và sẽ liên hệ với bạn. Khoản thanh toán của bạn vẫn được bảo lưu.</p>
      ${button('Xem đơn hàng', url(`/don-hang/${input.orderCode}`))}
    `),
  });
  await notifyZns('provision_failed', input.userId, {
    domain: input.domain,
    order_code: input.orderCode,
  }, `failed-${input.orderCode}-${input.domain}`);

  await alertAdmin(`Đăng ký thất bại: ${input.domain}`, `
    <p>Đơn hàng <b>${esc(input.orderCode)}</b> - tên miền <b>${esc(input.domain)}</b> đăng ký thất bại.</p>
    <pre style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:12px;">${esc(input.error)}</pre>
  `);
}

/** Da hoan tien vao vi sau khi dang ky ten mien that bai. */
export async function sendRefunded(input: {
  userId: number; email: string; domain: string; orderCode: string;
  amount: number; balanceAfter: number; reason: string;
}): Promise<void> {
  const site = settings.site();
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'refunded',
    subject: `Đã hoàn ${formatVnd(input.amount)} cho ${input.domain}`,
    html: layout('Đã hoàn tiền vào tài khoản của bạn', `
      <p>Rất tiếc, tên miền <b>${esc(input.domain)}</b> không đăng ký được. Chúng tôi đã hoàn lại
         số tiền tương ứng vào số dư tài khoản của bạn.</p>
      ${table([
        ['Tên miền', `<span style="font-family:monospace;">${esc(input.domain)}</span>`],
        ['Mã đơn hàng', esc(input.orderCode)],
        ['Số tiền hoàn', esc(formatVnd(input.amount))],
        ['Số dư hiện tại', esc(formatVnd(input.balanceAfter))],
        ['Lý do', esc(input.reason)],
      ])}
      <p>Số dư này dùng được ngay cho đơn hàng tiếp theo - chọn thanh toán bằng
         <b>Số dư tài khoản</b> khi đặt hàng.</p>
      <p style="font-size:13px;color:#6b7280;">
        Muốn nhận lại bằng tiền mặt thay vì số dư? Liên hệ
        ${esc(site.supportEmail || site.hotline || 'bộ phận hỗ trợ')} kèm mã đơn <b>${esc(input.orderCode)}</b>.
      </p>
      ${button('Xem số dư tài khoản', url('/tai-khoan'))}
    `),
  });
}

export async function sendRenewalReminder(input: {
  userId: number; email: string; domain: string; expiresAt: string; daysLeft: number; renewPrice: number;
}): Promise<void> {
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'renewal_reminder',
    subject: `Tên miền ${input.domain} hết hạn sau ${input.daysLeft} ngày`,
    html: layout('Nhắc gia hạn tên miền', `
      <p>Tên miền <b>${esc(input.domain)}</b> sẽ hết hạn vào <b>${esc(input.expiresAt.slice(0, 10))}</b> (còn ${esc(input.daysLeft)} ngày).</p>
      ${table([['Phí gia hạn 1 năm', esc(formatVnd(input.renewPrice))]])}
      <p>Để tránh gián đoạn website và email, vui lòng gia hạn trước ngày hết hạn.</p>
      ${button('Gia hạn ngay', url(`/control-panel/${encodeURIComponent(input.domain)}/gia-han`))}
    `),
  });

  await notifyZns('renewal_reminder', input.userId, {
    domain: input.domain,
    expires_at: input.expiresAt.slice(0, 10),
    days_left: input.daysLeft,
  }, `remind-${input.domain}-${input.daysLeft}`);
}

/** Da tru vi va gia han thanh cong. */
export async function sendAutoRenewCharged(input: {
  userId: number; email: string; domain: string; years: number; amount: number; balanceAfter: number; orderCode: string;
}): Promise<void> {
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'auto_renew_charged',
    subject: `Đã tự động gia hạn ${input.domain}`,
    html: layout('Gia hạn tự động thành công', `
      <p>Tên miền <b>${esc(input.domain)}</b> đã được gia hạn tự động.</p>
      ${table([
        ['Thời hạn gia hạn', `${esc(input.years)} năm`],
        ['Số tiền đã trừ', esc(formatVnd(input.amount))],
        ['Số dư còn lại', esc(formatVnd(input.balanceAfter))],
        ['Mã đơn hàng', esc(input.orderCode)],
      ])}
      <p class="tiny">Muốn dừng gia hạn tự động? Tắt trong Control Panel của tên miền.</p>
      ${button('Xem đơn hàng', url(`/don-hang/${input.orderCode}`))}
    `),
  });

  await notifyZns('auto_renew_charged', input.userId, {
    domain: input.domain,
    amount: formatVnd(input.amount),
    expires_at: new Date(Date.now() + input.years * 365 * 864e5).toISOString().slice(0, 10),
  }, `autorenew-${input.orderCode}`);
}

/** Bat gia han tu dong nhung so du khong du - can khach thanh toan. */
export async function sendAutoRenewNeedsPayment(input: {
  userId: number; email: string; domain: string; daysLeft: number; amount: number; balance: number; orderCode: string;
}): Promise<void> {
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'auto_renew_needs_payment',
    subject: `Cần thanh toán để gia hạn ${input.domain} (còn ${input.daysLeft} ngày)`,
    html: layout('Gia hạn tự động: cần thanh toán', `
      <p>Tên miền <b>${esc(input.domain)}</b> sẽ hết hạn sau <b>${esc(input.daysLeft)} ngày</b>.</p>
      <p>Hệ thống đã tạo sẵn đơn gia hạn, nhưng số dư tài khoản không đủ để trừ tự động:</p>
      ${table([
        ['Cần thanh toán', esc(formatVnd(input.amount))],
        ['Số dư hiện tại', esc(formatVnd(input.balance))],
        ['Mã đơn hàng', esc(input.orderCode)],
      ])}
      <p>Vui lòng thanh toán đơn dưới đây để tên miền được gia hạn. Đơn sẽ tự hủy nếu không thanh toán.</p>
      ${button('Thanh toán ngay', url(`/don-hang/${input.orderCode}`))}
    `),
  });
}

/**
 * Canh bao: co nguoi vua lay ma EPP cua ten mien.
 * Email nay quan trong ve mat an toan - neu chu that khong phai nguoi lay,
 * ho can biet ngay de doi mat khau va khoa lai ten mien.
 */
export async function sendAuthCodeIssued(input: {
  userId: number; email: string; domain: string; ip: string;
}): Promise<void> {
  const site = settings.site();
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'auth_code_issued',
    subject: `Cảnh báo: mã chuyển đổi của ${input.domain} vừa được lấy`,
    html: layout('Mã chuyển đổi tên miền vừa được lấy', `
      <p>Mã EPP (Auth Code) của tên miền <b>${esc(input.domain)}</b> vừa được lấy từ tài khoản của bạn.</p>
      ${table([
        ['Tên miền', `<span style="font-family:monospace;">${esc(input.domain)}</span>`],
        ['Thời điểm', new Date().toISOString().replace('T', ' ').slice(0, 16)],
        ['Địa chỉ IP', esc(input.ip || 'không xác định')],
      ])}
      <p style="background:#ecfdf5;border:1px solid #a7f3d0;padding:12px;border-radius:8px;font-size:14px;">
        <b>Nếu chính bạn vừa thao tác:</b> không cần làm gì thêm. Dùng mã đó tại nhà đăng ký mới để
        hoàn tất việc chuyển tên miền.
      </p>
      <p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:8px;font-size:14px;">
        <b>Nếu KHÔNG phải bạn:</b> tài khoản của bạn có thể đã bị truy cập trái phép. Hãy
        <b>đổi mật khẩu ngay</b>, sau đó vào Control Panel <b>khóa chuyển đổi</b> cho tên miền này.
        ${site.hotline ? `Cần gấp, gọi ${esc(site.hotline)}.` : ''}
      </p>
      ${button('Mở Control Panel tên miền', url(`/control-panel/${encodeURIComponent(input.domain)}`))}
    `),
  });
}

/** Bao khi trang thai khoa chuyen doi thay doi. */
export async function sendTransferLockChanged(input: {
  userId: number; email: string; domain: string; locked: boolean;
}): Promise<void> {
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'transfer_lock_changed',
    subject: `${input.domain}: đã ${input.locked ? 'khóa' : 'mở khóa'} chuyển đổi`,
    html: layout(`Đã ${input.locked ? 'khóa' : 'mở khóa'} chuyển đổi`, `
      <p>Tên miền <b>${esc(input.domain)}</b> vừa được <b>${input.locked ? 'khóa' : 'mở khóa'}</b> chuyển đổi.</p>
      ${input.locked
        ? '<p>Tên miền đang được bảo vệ: không ai có thể chuyển nó sang nhà đăng ký khác.</p>'
        : '<p style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:8px;font-size:14px;">' +
          'Trong thời gian mở khóa, tên miền <b>có thể bị chuyển đi</b> nếu ai đó có mã EPP. ' +
          'Nên khóa lại ngay sau khi hoàn tất công việc.</p>'}
      ${button('Mở Control Panel tên miền', url(`/control-panel/${encodeURIComponent(input.domain)}`))}
    `),
  });
}

/** Bao khi thong tin lien he chu the thay doi (gui ca dia chi cu lan moi). */
export async function sendContactUpdated(input: {
  userId: number; email: string; domain: string; emailCu: string; emailMoi: string; ip: string;
}): Promise<void> {
  const doiEmail = input.emailCu && input.emailCu !== input.emailMoi;
  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'contact_updated',
    subject: `${input.domain}: thông tin chủ thể vừa được cập nhật`,
    html: layout('Thông tin chủ thể tên miền đã thay đổi', `
      <p>Thông tin liên hệ của chủ thể tên miền <b>${esc(input.domain)}</b> vừa được cập nhật.</p>
      ${table([
        ['Tên miền', `<span style="font-family:monospace;">${esc(input.domain)}</span>`],
        ...(doiEmail
          ? ([['Email chủ thể', `${esc(input.emailCu)} &rarr; <b>${esc(input.emailMoi)}</b>`]] as [string, string][])
          : ([['Email chủ thể', esc(input.emailMoi)]] as [string, string][])),
        ['Thời điểm', new Date().toISOString().replace('T', ' ').slice(0, 16)],
        ['Địa chỉ IP', esc(input.ip || 'không xác định')],
      ])}
      ${doiEmail
        ? `<p style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:8px;font-size:14px;">
             Email chủ thể là đường khôi phục quyền kiểm soát tên miền. Email này được gửi tới
             <b>cả địa chỉ cũ và mới</b> để hai bên cùng biết.
           </p>`
        : ''}
      <p style="font-size:13px;color:#6b7280;">Nếu không phải bạn thao tác, hãy đổi mật khẩu ngay và liên hệ chúng tôi.</p>
      ${button('Mở Control Panel tên miền', url(`/control-panel/${encodeURIComponent(input.domain)}`))}
    `),
  });
}

/** Bao trang thai ho so doi chu the. */
export async function sendOwnershipRequestStatus(input: {
  userId: number; email: string; domain: string; status: string; note: string; requestId: number;
}): Promise<void> {
  const moTa: Record<string, { tieuDe: string; noiDung: string }> = {
    in_review: { tieuDe: 'Hồ sơ đang được xem xét', noiDung: 'Chúng tôi đã tiếp nhận và đang kiểm tra hồ sơ của bạn.' },
    need_documents: { tieuDe: 'Hồ sơ cần bổ sung giấy tờ', noiDung: 'Hồ sơ chưa đủ điều kiện. Vui lòng bổ sung theo hướng dẫn bên dưới.' },
    approved: { tieuDe: 'Hồ sơ đã được duyệt', noiDung: 'Hồ sơ hợp lệ. Chúng tôi đang tiến hành thủ tục với nhà đăng ký.' },
    completed: { tieuDe: 'Đã đổi chủ thể thành công', noiDung: 'Tên miền đã chuyển sang chủ thể mới.' },
    rejected: { tieuDe: 'Hồ sơ không được chấp nhận', noiDung: 'Rất tiếc, hồ sơ của bạn không được chấp nhận.' },
    cancelled: { tieuDe: 'Hồ sơ đã hủy', noiDung: 'Hồ sơ đổi chủ thể đã được hủy.' },
  };
  const m = moTa[input.status] ?? { tieuDe: 'Cập nhật hồ sơ đổi chủ thể', noiDung: `Trạng thái mới: ${input.status}` };

  await sendMail({
    to: input.email,
    userId: input.userId,
    template: 'ownership_request_status',
    subject: `${input.domain}: ${m.tieuDe.toLowerCase()}`,
    html: layout(m.tieuDe, `
      <p>Hồ sơ đổi chủ thể cho tên miền <b>${esc(input.domain)}</b> (mã hồ sơ <b>#${input.requestId}</b>):</p>
      <p>${esc(m.noiDung)}</p>
      ${input.note
        ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:8px;font-size:14px;">
             <b>Ghi chú từ bộ phận xử lý:</b><br>${esc(input.note)}
           </div>`
        : ''}
      ${button('Mở Control Panel tên miền', url(`/control-panel/${encodeURIComponent(input.domain)}`))}
    `),
  });
}

export async function alertAdmin(subject: string, bodyHtml: string): Promise<void> {
  const to = settings.smtp().adminAlert;
  if (!to) return;
  await sendMail({ to, template: 'admin_alert', subject: `[${settings.site().name}] ${subject}`, html: layout(subject, bodyHtml) });
}

/** Ten mien dau tien trong don - dung lam noi dung tom tat cho tin ZNS. */
function firstDomainOf(orderId: number): string {
  const rows = db.prepare('SELECT domain FROM order_items WHERE order_id = ? ORDER BY id').all(orderId) as
    { domain: string }[];
  if (!rows.length) return '';
  return rows.length === 1 ? rows[0]!.domain : `${rows[0]!.domain} +${rows.length - 1}`;
}

/** Tien ich: lay email cua chu tai khoan. */
export function userEmail(userId: number): string {
  return userContact(userId).email;
}

/** Email + so dien thoai cua chu tai khoan (ZNS gui theo so dien thoai). */
export function userContact(userId: number): { email: string; phone: string } {
  const row = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(userId) as
    | { email: string; phone: string }
    | undefined;
  return { email: row?.email ?? '', phone: row?.phone ?? '' };
}

/**
 * Gui ZNS cho mot su kien.
 *
 * Khong nem loi: ZNS la kenh phu, that bai khong duoc lam hong luong nghiep vu.
 * Tu bo qua khi chua bat ZNS, chua khai template ID, hoac khach khong co so dien thoai.
 */
async function notifyZns(
  event: ZnsEvent,
  userId: number,
  data: Record<string, string | number>,
  trackingId?: string,
): Promise<void> {
  const { phone } = userContact(userId);
  if (!phone) return;

  await sendZns({
    phone,
    templateId: getSetting(ZNS_EVENTS[event].settingKey, ''),
    templateData: data,
    event,
    userId,
    ...(trackingId ? { trackingId } : {}),
  });
}
