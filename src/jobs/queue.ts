/**
 * Hang doi cong viec ben trong CSDL (khong can Redis).
 *
 * Vi sao khong xu ly truc tiep trong request? Dang ky ten mien qua API co the
 * mat vai giay va co the that bai tam thoi. Dua vao hang doi giup:
 *  - Webhook thanh toan phan hoi ngay (tranh cong TT bao timeout & goi lai)
 *  - Tu dong thu lai theo cap so nhan khi API loi
 *  - Khong mat viec khi tien trinh restart (job nam trong CSDL)
 */
import { db, isoIn, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';

export type JobType =
  | 'provision_order'      // dang ky/gia han toan bo mot don hang
  | 'provision_item'       // xu ly mot dong don hang
  | 'sync_domain'          // dong bo trang thai/ngay het han tu P.A cho MOT ten mien
  | 'sync_domains_due'     // quet va xep lich dong bo cac ten mien can lam moi
  | 'send_renewal_reminders'
  | 'auto_renew_domains'    // tu dong gia han ten mien da bat auto_renew
  | 'expire_stale_orders'
  | 'reconcile_sepay';      // doi soat bu khi webhook SePay that lac

export interface JobRow {
  id: number;
  type: JobType;
  payload: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string;
}

export interface EnqueueOptions {
  delayMs?: number;
  maxAttempts?: number;
  /** Khoa chong trung: neu da co job cung khoa dang cho/dang chay thi bo qua. */
  dedupeKey?: string;
}

export function enqueue(type: JobType, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): number | null {
  const runAfter = opts.delayMs ? isoIn(opts.delayMs) : nowIso();
  try {
    const info = db
      .prepare(
        `INSERT INTO jobs (type, payload, status, max_attempts, run_after, dedupe_key, created_at, updated_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`,
      )
      .run(type, JSON.stringify(payload), opts.maxAttempts ?? 5, runAfter, opts.dedupeKey ?? null, nowIso(), nowIso());
    return Number(info.lastInsertRowid);
  } catch (err) {
    // Vi pham unique index dedupe -> da co job tuong duong, coi nhu thanh cong
    if (String(err).includes('UNIQUE')) {
      log.debug('job_deduped', { type, dedupeKey: opts.dedupeKey });
      return null;
    }
    throw err;
  }
}

/** Lay mot job den han va danh dau dang chay (atomic). */
export function claimNext(): JobRow | null {
  const claim = db.transaction((): JobRow | null => {
    const row = db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'queued' AND run_after <= ?
         ORDER BY run_after, id LIMIT 1`,
      )
      .get(nowIso()) as JobRow | undefined;
    if (!row) return null;
    db.prepare(`UPDATE jobs SET status='running', locked_at=?, attempts=attempts+1, updated_at=? WHERE id=?`)
      .run(nowIso(), nowIso(), row.id);
    return { ...row, attempts: row.attempts + 1, status: 'running' };
  });
  return claim();
}

export function completeJob(id: number): void {
  db.prepare(`UPDATE jobs SET status='done', last_error='', updated_at=?, dedupe_key=NULL WHERE id=?`).run(nowIso(), id);
}

/** Danh dau that bai; tu lap lich thu lai neu chua het so lan cho phep. */
export function failJob(job: JobRow, error: string): void {
  const message = error.slice(0, 1000);
  if (job.attempts >= job.max_attempts) {
    db.prepare(`UPDATE jobs SET status='failed', last_error=?, updated_at=?, dedupe_key=NULL WHERE id=?`)
      .run(message, nowIso(), job.id);
    log.error('job_failed_permanently', { id: job.id, type: job.type, error: message });
    return;
  }
  const delayMs = Math.min(30 * 60_000, 5_000 * 2 ** (job.attempts - 1)); // 5s, 10s, 20s... toi da 30 phut
  db.prepare(`UPDATE jobs SET status='queued', last_error=?, run_after=?, updated_at=? WHERE id=?`)
    .run(message, isoIn(delayMs), nowIso(), job.id);
  log.warn('job_retry_scheduled', { id: job.id, type: job.type, attempt: job.attempts, delayMs });
}

/** Giai phong job bi ket o trang thai 'running' (vd tien trinh bi kill giua chung). */
export function requeueStuckJobs(olderThanMs = 10 * 60_000): number {
  const cutoff = isoIn(-olderThanMs);
  const info = db
    .prepare(`UPDATE jobs SET status='queued', updated_at=? WHERE status='running' AND locked_at < ?`)
    .run(nowIso(), cutoff);
  if (info.changes) log.warn('jobs_requeued_after_stall', { count: info.changes });
  return info.changes;
}

export function jobStats(): { queued: number; running: number; failed: number; done: number } {
  const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM jobs GROUP BY status`).all() as { status: string; n: number }[];
  const out = { queued: 0, running: 0, failed: 0, done: 0 };
  for (const r of rows) if (r.status in out) out[r.status as keyof typeof out] = r.n;
  return out;
}
