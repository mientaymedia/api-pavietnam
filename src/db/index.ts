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
  log.info('db_migrated', { file: config.databaseFile });
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
