/**
 * Gui email qua mot trong hai cach (chon o Cau hinh smtp.driver hoac MAIL_DRIVER):
 *  - 'resend': Resend HTTP API, POST https://api.resend.com/emails, header
 *    Authorization: Bearer <khoa>. Chu chot gui qua Resend 21/10/2026.
 *  - con lai: SMTP qua nodemailer (Gmail, hoac SMTP cua Resend: smtp.resend.com,
 *    465 SSL hoac 587 STARTTLS, user "resend", mat khau la khoa API).
 * Noi dung thu van do app dung (services/notifications.ts), khong dung mau Resend.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { settings } from './settings.js';
import { log } from './logger.js';
import { laEmailTam } from './validate.js';

let transporter: Transporter | null = null;
let transporterKey = '';

function getTransporter(): Transporter | null {
  const s = settings.smtp();
  if (!s.host) return null;
  const key = `${s.host}:${s.port}:${s.secure}:${s.user}`;
  if (transporter && transporterKey === key) return transporter;
  transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  });
  transporterKey = key;
  return transporter;
}

export function resetMailer(): void {
  transporter = null;
  transporterKey = '';
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  template?: string;
  userId?: number | null;
  replyTo?: string;
}

/**
 * Gui email. Khong nem loi ra ngoai: viec gui mail that bai khong duoc lam
 * hong luong dang ky ten mien - loi duoc ghi vao email_logs de xu ly sau.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  // Email tam cua tai khoan chua bo sung email: khong co hop thu nao de gui
  if (laEmailTam(input.to)) {
    logEmail(input, 'skipped', 'Tài khoản chưa có email');
    return false;
  }

  const s = settings.smtp();
  if (s.driver === 'resend') return guiQuaResend(input, s);

  const tx = getTransporter();

  if (!tx) {
    logEmail(input, 'skipped', 'Chưa cấu hình SMTP');
    log.warn('mail_skipped_no_smtp', { to: input.to, subject: input.subject });
    return false;
  }

  try {
    await tx.sendMail({
      from: s.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      replyTo: input.replyTo || s.replyTo || s.adminAlert || undefined,
    });
    logEmail(input, 'sent');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEmail(input, 'failed', message);
    log.error('mail_send_failed', { to: input.to, subject: input.subject, error: message });
    return false;
  }
}

/** Cho toi da 15 giay: Resend cham thi khong giu luong dang ky ten mien lai. */
const HAN_RESEND_MS = 15_000;

/**
 * Gui qua Resend HTTP API. Khoa chi nam trong header, khong bao gio vao log
 * hay email_logs: thong bao loi cua Resend cung duoc loc khoa truoc khi ghi.
 */
async function guiQuaResend(input: MailInput, s: ReturnType<typeof settings.smtp>): Promise<boolean> {
  if (!s.resendKey) {
    logEmail(input, 'skipped', 'Chưa cấu hình khóa API Resend');
    log.warn('mail_skipped_no_resend_key', { to: input.to, subject: input.subject });
    return false;
  }
  const replyTo = input.replyTo || s.replyTo || s.adminAlert;
  try {
    const r = await fetch(`${config.smtp.resendApiBase}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: s.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? htmlToText(input.html),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(HAN_RESEND_MS),
    });
    if (!r.ok) {
      // Resend tra JSON { statusCode, name, message } khi loi
      let chiTiet = '';
      try {
        const j = (await r.json()) as { message?: unknown; name?: unknown };
        chiTiet = String(j.message ?? j.name ?? '');
      } catch {
        // than khong phai JSON: chi giu ma HTTP
      }
      throw new Error(`Resend trả lỗi HTTP ${r.status}${chiTiet ? `: ${chiTiet}` : ''}`);
    }
    logEmail(input, 'sent');
    return true;
  } catch (err) {
    const tho = err instanceof Error ? err.message : String(err);
    const message = tho.split(s.resendKey).join('***');
    logEmail(input, 'failed', message);
    log.error('mail_send_failed', { driver: 'resend', to: input.to, subject: input.subject, error: message });
    return false;
  }
}

function logEmail(input: MailInput, status: 'sent' | 'failed' | 'skipped', error = '') {
  try {
    db.prepare(
      `INSERT INTO email_logs (user_id, to_email, subject, template, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.userId ?? null, input.to, input.subject, input.template ?? '', status, error.slice(0, 500), nowIso());
  } catch (err) {
    log.warn('email_log_write_failed', { error: String(err) });
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
