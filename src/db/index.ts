import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

export const db = new Database(config.databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// Cho toi 10 giay khi CSDL dang bi tien trinh khac ghi, thay vi hong ngay
db.pragma('busy_timeout = 10000');

/** Tao/ cap nhat bang. An toan khi chay lai nhieu lan (CREATE TABLE IF NOT EXISTS). */
export function migrate(): void {
  const schemaPath = fs.existsSync(path.join(here, 'schema.sql'))
    ? path.join(here, 'schema.sql')
    : path.join(here, '..', '..', 'src', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  addMissingColumns();
  log.info('db_migrated', { file: config.databaseFile });
}

/**
 * Them cot moi vao bang da ton tai.
 *
 * `CREATE TABLE IF NOT EXISTS` khong sua duoc bang da co, nen cot them sau phai
 * duoc bo sung o day. Moi muc chi chay mot lan; chay lai la khong lam gi.
 */
function addMissingColumns(): void {
  const themCot: { bang: string; cot: string; dinhNghia: string }[] = [
    { bang: 'domains', cot: 'transfer_lock', dinhNghia: 'INTEGER NOT NULL DEFAULT 1' },
    { bang: 'domains', cot: 'auth_code_last_at', dinhNghia: 'TEXT' },
  ];

  for (const { bang, cot, dinhNghia } of themCot) {
    const daCo = (db.prepare(`PRAGMA table_info(${bang})`).all() as { name: string }[])
      .some((c) => c.name === cot);
    if (daCo) continue;
    db.exec(`ALTER TABLE ${bang} ADD COLUMN ${cot} ${dinhNghia}`);
    log.info('db_column_added', { bang, cot });
  }
}

/** Thoi diem hien tai dang ISO-8601 UTC (dung thong nhat toan he thong). */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Chay nhieu lenh trong 1 transaction.
 *
 * Dung BEGIN IMMEDIATE (`.immediate()`) chu khong phai BEGIN mac dinh.
 *
 * Vi sao: BEGIN mac dinh la "deferred" - no chi xin khoa ghi khi gap lenh ghi
 * DAU TIEN. Neu hai tien trinh cung mo transaction roi cung nang len ghi, mot
 * ben nhan SQLITE_BUSY NGAY LAP TUC va `busy_timeout` khong cuu duoc (khong the
 * cho, vi cho cung se ket). BEGIN IMMEDIATE xin khoa ghi ngay tu dau, nen ben
 * den sau se CHO theo busy_timeout thay vi hong.
 *
 * Chuyen nay xay ra that khi chay worker o tien trinh rieng (WORKER_DISABLED=1):
 * worker va web cung ghi vao mot file CSDL.
 *
 * Ghi chu trung thuc: loi "database is locked" da xuat hien that (khi chay bo
 * kiem thu song song), nhung khi thu tai hien co chu dich thi khong lap lai
 * duoc - cua so thoi gian rat hep. Cung luc do `busy_timeout` cung duoc nang
 * tu 5s len 10s, nen KHONG khang dinh duoc rieng thay doi nao da khac phuc.
 * Ca hai deu la cach lam dung cho SQLite nhieu tien trinh nen giu ca hai.
 */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn).immediate();
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
