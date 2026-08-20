import nodemailer, { type Transporter } from 'nodemailer';
import { db, nowIso } from '../db/index.js';
import { settings } from './settings.js';
import { log } from './logger.js';

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
  const s = settings.smtp();
  const tx = getTransporter();

  if (!tx) {
    logEmail(input, 'skipped', 'Chua cau hinh SMTP');
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
      replyTo: input.replyTo || s.adminAlert || undefined,
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
