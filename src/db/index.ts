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
db.pragma('busy_timeout = 5000');

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

/** Chay nhieu lenh trong 1 transaction. */
export function tx<T>(fn: () => T): T {
  const wrapped = db.transaction(fn);
  return wrapped();
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
