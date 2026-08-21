/**
 * Chuyen ten mien DI noi khac.
 *
 * Day la quyen cua chu ten mien - khong duoc gay kho de. Nhung ma EPP cung la
 * chia khoa chiem doat ten mien, nen moi lan lay deu:
 *   - Ghi nhat ky kiem toan (ai lay, tu IP nao, luc nao)
 *   - Gui email bao cho chu so huu ngay lap tuc
 * Nho vay neu tai khoan bi chiem, chu that biet ngay va con kip xu ly.
 */
import { db, isoIn, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';
import { getAuthCode, setDomainLock } from '../pavietnam/client.js';
import { audit } from './audit.js';
import { sendAuthCodeIssued, sendTransferLockChanged, userEmail } from './notifications.js';
import type { DomainRow } from './domainRepo.js';

/** Khoang cach toi thieu giua hai lan lay ma EPP cua cung mot ten mien. */
const AUTH_CODE_COOLDOWN_MS = 5 * 60_000;

export type AuthCodeOutcome =
  | { status: 'ok'; authCode: string }
  | { status: 'locked'; message: string }
  | { status: 'too_soon'; message: string }
  | { status: 'error'; message: string };

/**
 * Lay ma EPP de chuyen ten mien di.
 *
 * Yeu cau ten mien da duoc MO KHOA truoc - dung thong le cua nganh, va tranh
 * truong hop lay ma nham roi de lo.
 */
export async function requestAuthCode(
  domain: DomainRow,
  ctx: { userId: number; ip?: string },
): Promise<AuthCodeOutcome> {
  if (domain.transfer_lock) {
    return {
      status: 'locked',
      message: 'Ten mien dang khoa chuyen doi. Vui long mo khoa truoc khi lay ma EPP.',
    };
  }

  // Chan bam lien tuc: moi lan lay deu sinh email canh bao cho chu so huu
  if (domain.auth_code_last_at && domain.auth_code_last_at > isoIn(-AUTH_CODE_COOLDOWN_MS)) {
    return {
      status: 'too_soon',
      message: 'Ban vua lay ma EPP cach day it phut. Vui long kiem tra email truoc khi lay lai.',
    };
  }

  try {
    const result = await getAuthCode(domain.domain);

    db.prepare('UPDATE domains SET auth_code_last_at = ?, updated_at = ? WHERE id = ?')
      .run(nowIso(), nowIso(), domain.id);

    audit({
      userId: ctx.userId,
      action: 'domain.auth_code_issued',
      entity: 'domain',
      entityId: domain.id,
      ip: ctx.ip,
      // KHONG bao gio ghi ma EPP vao nhat ky
      meta: { domain: domain.domain },
    });
    log.info('auth_code_issued', { domain: domain.domain, userId: ctx.userId });

    const email = userEmail(domain.user_id);
    if (email) {
      await sendAuthCodeIssued({
        userId: domain.user_id,
        email,
        domain: domain.domain,
        ip: ctx.ip ?? '',
      });
    }

    return { status: 'ok', authCode: result.authCode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('auth_code_failed', { domain: domain.domain, error: message });
    return { status: 'error', message };
  }
}

/** Bat / tat khoa chuyen doi. */
export async function changeTransferLock(
  domain: DomainRow,
  locked: boolean,
  ctx: { userId: number; ip?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setDomainLock(domain.domain, locked);
    db.prepare('UPDATE domains SET transfer_lock = ?, updated_at = ? WHERE id = ?')
      .run(locked ? 1 : 0, nowIso(), domain.id);

    audit({
      userId: ctx.userId,
      action: locked ? 'domain.lock' : 'domain.unlock',
      entity: 'domain',
      entityId: domain.id,
      ip: ctx.ip,
      meta: { domain: domain.domain },
    });

    const email = userEmail(domain.user_id);
    if (email) {
      await sendTransferLockChanged({ userId: domain.user_id, email, domain: domain.domain, locked });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
