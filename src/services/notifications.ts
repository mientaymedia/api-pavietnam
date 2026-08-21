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
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="background:${esc(site.primaryColor)};padding:20px 28px;color:#fff;font-size:18px;font-weight:600;">${esc(site.name)}</td></tr>
  <tr><td style="padding:28px;">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;">${esc(title)}</h1>
    ${bodyHtml}
  </td></tr>
  <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    ${esc(site.name)}${site.hotline ? ` &middot; Hotline: ${esc(site.hotline)}` : ''}${site.supportEmail ? ` &middot; ${esc(site.supportEmail)}` : ''}<br>
    Email nay duoc gui tu he thong, vui long khong tra loi truc tiep.
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
    subject: `Chao mung ban den voi ${settings.site().name}`,
    html: layout('Tai khoan cua ban da san sang', `
      <p>Xin chao <b>${esc(user.full_name || user.email)}</b>,</p>
      <p>Tai khoan cua ban da duoc tao thanh cong. Ban co the dang nhap de tim kiem, dang ky ten mien va quan ly DNS ngay bay gio.</p>
      ${button('Vao trang quan ly', url('/dashboard'))}
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
    subject: `Xac thuc dia chi email cho tai khoan ${site.name}`,
    html: layout('Xac thuc dia chi email', `
      <p>Xin chao <b>${esc(user.full_name || user.email)}</b>,</p>
      <p>Vui long xac nhan day la dia chi email cua ban. He thong dung email nay de gui
         <b>thong tin quan tri ten mien</b>: ngay het han, nameserver, canh bao va hoa don.</p>
      ${button('Xac thuc email cua toi', link)}
      <p style="font-size:13px;color:#6b7280;">
        Neu nut tren khong bam duoc, sao chep lien ket sau vao trinh duyet:<br>
        <span style="word-break:break-all;font-family:monospace;font-size:12px;">${esc(link)}</span>
      </p>
      <p style="font-size:13px;color:#6b7280;">
        Lien ket co hieu luc trong <b>24 gio</b>. Neu ban khong tao tai khoan nao, hay bo qua email nay.
      </p>
    `),
  });
}

export async function sendPasswordReset(user: { id: number; email: string }, token: string): Promise<void> {
  await sendMail({
    to: user.email,
    userId: user.id,
    template: 'password_reset',
    subject: 'Khoi phuc mat khau',
    html: layout('Dat lai mat khau', `
      <p>Chung toi nhan duoc yeu cau dat lai mat khau cho tai khoan <b>${esc(user.email)}</b>.</p>
      <p>Lien ket co hieu luc trong 60 phut. Neu ban khong yeu cau, hay bo qua email nay.</p>
      ${button('Dat lai mat khau', url(`/dat-lai-mat-khau?token=${encodeURIComponent(token)}`))}
    `),
  });
}

export async function sendOrderCreated(order: {
  id: number; code: string; total: number; user_id: number;
}, email: string, payment: { provider: string; payUrl?: string; qrUrl?: string; refCode: string }): Promise<void> {
  const bank = settings.sepay();
  const bankBlock = payment.provider === 'sepay'
    ? `${table([
        ['Ngan hang', esc(bank.bankName || bank.bankCode)],
        ['So tai khoan', `<span style="font-family:monospace;font-size:16px;">${esc(bank.accountNumber)}</span>`],
        ['Chu tai khoan', esc(bank.accountName)],
        ['So tien', esc(formatVnd(order.total))],
        ['Noi dung chuyen khoan', `<span style="font-family:monospace;font-size:16px;color:#b91c1c;">${esc(payment.refCode)}</span>`],
      ])}
      <p style="font-size:13px;color:#b91c1c;">Vui long ghi <b>dung noi dung chuyen khoan</b> de he thong tu dong doi soat va kich hoat ten mien.</p>
      ${payment.qrUrl ? `<p style="text-align:center;"><img src="${esc(payment.qrUrl)}" alt="Ma QR chuyen khoan" width="260" style="max-width:100%;border:1px solid #e5e7eb;border-radius:8px;"></p>` : ''}`
    : `<p>Vui long hoan tat thanh toan de he thong kich hoat ten mien tu dong.</p>
       ${payment.payUrl ? button('Thanh toan ngay', payment.payUrl) : ''}`;

  await sendMail({
    to: email,
    userId: order.user_id,
    template: 'order_created',
    subject: `Don hang ${order.code} - cho thanh toan`,
    html: layout(`Don hang ${esc(order.code)}`, `
      <p>Cam on ban da dat hang. Don hang dang cho thanh toan.</p>
      ${bankBlock}
      ${button('Xem chi tiet don hang', url(`/don-hang/${order.code}`))}
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
    subject: `Da nhan thanh toan don hang ${order.code}`,
    html: layout('Thanh toan thanh cong', `
      <p>Chung toi da nhan duoc thanh toan <b>${esc(formatVnd(order.total))}</b> cho don hang <b>${esc(order.code)}</b>.</p>
      <p>He thong dang tien hanh dang ky ten mien. Ban se nhan duoc email thong tin quan tri ngay khi hoan tat (thuong duoi 1 phut).</p>
      ${button('Theo doi don hang', url(`/don-hang/${order.code}`))}
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
    subject: `Ten mien ${input.domain} da duoc kich hoat`,
    html: layout(`Ten mien ${esc(input.domain)} da hoat dong`, `
      <p>Ten mien cua ban da duoc dang ky thanh cong va kich hoat.</p>
      ${table([
        ['Ten mien', `<span style="font-family:monospace;">${esc(input.domain)}</span>`],
        ['Thoi han', `${esc(input.years)} nam`],
        ['Ngay het han', esc(input.expiresAt ? input.expiresAt.slice(0, 10) : 'Dang cap nhat')],
        ['Nameserver', input.nameservers.length ? input.nameservers.map((n) => `<span style="font-family:monospace;">${esc(n)}</span>`).join('<br>') : 'Mac dinh cua he thong'],
      ])}
      <p>Ban co the quan ly ban ghi DNS, doi nameserver va bat gia han tu dong trong Control Panel:</p>
      ${button('Mo Control Panel ten mien', url(`/control-panel/${encodeURIComponent(input.domain)}`))}
      <p style="font-size:13px;color:#6b7280;">Luu y: thay doi DNS can 5 phut den 24 gio de cap nhat tren toan cau.</p>
      ${site.hotline ? `<p style="font-size:13px;color:#6b7280;">Can ho tro? Goi ${esc(site.hotline)}.</p>` : ''}
    `),
  });

  await notifyZns('domain_activated', input.userId, {
    domain: input.domain,
    expires_at: input.expiresAt ? input.expiresAt.slice(0, 10) : 'dang cap nhat',
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
    subject: `Da tiep nhan yeu cau chuyen ten mien ${input.domain}`,
    html: layout('Yeu cau chuyen ten mien da duoc gui', `
      <p>Chung toi da gui yeu cau chuyen <b>${esc(input.domain)}</b> ve he thong (don hang <b>${esc(input.orderCode)}</b>).</p>
      <p><b>Viec ban can lam tiep:</b></p>
      <ul style="font-size:14px; line-height:1.8;">
        <li>Kiem tra hop thu cua <b>email quan tri ten mien</b> - nha dang ky cu se gui thu xac nhan.</li>
        <li>Bam duyet trong thu do. Neu khong duyet, yeu cau se tu huy sau 5-7 ngay.</li>
        <li>Dam bao ten mien <b>khong bi khoa</b> (trang thai clientTransferProhibited) va da qua 60 ngay ke tu lan dang ky/chuyen gan nhat.</li>
      </ul>
      <p>Ten mien quoc te thuong mat 5-7 ngay de hoan tat. Chung toi se gui email khi ten mien ve tai khoan cua ban.</p>
      ${button('Theo doi don hang', url(`/don-hang/${input.orderCode}`))}
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
    subject: `Can xu ly: dang ky ${input.domain} chua hoan tat`,
    html: layout('Dang ky ten mien chua hoan tat', `
      <p>Rat tiec, he thong chua dang ky duoc ten mien <b>${esc(input.domain)}</b> thuoc don hang <b>${esc(input.orderCode)}</b>.</p>
      <p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:8px;font-size:13px;">${esc(input.error)}</p>
      <p>Bo phan ky thuat da duoc thong bao va se lien he voi ban. Khoan thanh toan cua ban van duoc bao luu.</p>
      ${button('Xem don hang', url(`/don-hang/${input.orderCode}`))}
    `),
  });
  await notifyZns('provision_failed', input.userId, {
    domain: input.domain,
    order_code: input.orderCode,
  }, `failed-${input.orderCode}-${input.domain}`);

  await alertAdmin(`Dang ky that bai: ${input.domain}`, `
    <p>Don hang <b>${esc(input.orderCode)}</b> - ten mien <b>${esc(input.domain)}</b> dang ky that bai.</p>
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
    subject: `Da hoan ${formatVnd(input.amount)} cho ${input.domain}`,
    html: layout('Da hoan tien vao tai khoan cua ban', `
      <p>Rat tiec, ten mien <b>${esc(input.domain)}</b> khong dang ky duoc. Chung toi da hoan lai
         so tien tuong ung vao so du tai khoan cua ban.</p>
      ${table([
        ['Ten mien', `<span style="font-family:monospace;">${esc(input.domain)}</span>`],
        ['Ma don hang', esc(input.orderCode)],
        ['So tien hoan', esc(formatVnd(input.amount))],
        ['So du hien tai', esc(formatVnd(input.balanceAfter))],
        ['Ly do', esc(input.reason)],
      ])}
      <p>So du nay dung duoc ngay cho don hang tiep theo - chon thanh toan bang
         <b>So du tai khoan</b> khi dat hang.</p>
      <p style="font-size:13px;color:#6b7280;">
        Muon nhan lai bang tien mat thay vi so du? Lien he
        ${esc(site.supportEmail || site.hotline || 'bo phan ho tro')} kem ma don <b>${esc(input.orderCode)}</b>.
      </p>
      ${button('Xem so du tai khoan', url('/tai-khoan'))}
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
    subject: `Ten mien ${input.domain} het han sau ${input.daysLeft} ngay`,
    html: layout('Nhac gia han ten mien', `
      <p>Ten mien <b>${esc(input.domain)}</b> se het han vao <b>${esc(input.expiresAt.slice(0, 10))}</b> (con ${esc(input.daysLeft)} ngay).</p>
      ${table([['Phi gia han 1 nam', esc(formatVnd(input.renewPrice))]])}
      <p>De tranh gian doan website va email, vui long gia han truoc ngay het han.</p>
      ${button('Gia han ngay', url(`/control-panel/${encodeURIComponent(input.domain)}/gia-han`))}
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
    subject: `Da tu dong gia han ${input.domain}`,
    html: layout('Gia han tu dong thanh cong', `
      <p>Ten mien <b>${esc(input.domain)}</b> da duoc gia han tu dong.</p>
      ${table([
        ['Thoi han gia han', `${esc(input.years)} nam`],
        ['So tien da tru', esc(formatVnd(input.amount))],
        ['So du con lai', esc(formatVnd(input.balanceAfter))],
        ['Ma don hang', esc(input.orderCode)],
      ])}
      <p class="tiny">Muon dung gia han tu dong? Tat trong Control Panel cua ten mien.</p>
      ${button('Xem don hang', url(`/don-hang/${input.orderCode}`))}
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
    subject: `Can thanh toan de gia han ${input.domain} (con ${input.daysLeft} ngay)`,
    html: layout('Gia han tu dong: can thanh toan', `
      <p>Ten mien <b>${esc(input.domain)}</b> se het han sau <b>${esc(input.daysLeft)} ngay</b>.</p>
      <p>He thong da tao san don gia han, nhung so du tai khoan khong du de tru tu dong:</p>
      ${table([
        ['Can thanh toan', esc(formatVnd(input.amount))],
        ['So du hien tai', esc(formatVnd(input.balance))],
        ['Ma don hang', esc(input.orderCode)],
      ])}
      <p>Vui long thanh toan don duoi day de ten mien duoc gia han. Don se tu huy neu khong thanh toan.</p>
      ${button('Thanh toan ngay', url(`/don-hang/${input.orderCode}`))}
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
