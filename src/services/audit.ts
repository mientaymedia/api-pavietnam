import { db, nowIso } from '../db/index.js';
import { log } from '../lib/logger.js';

export function audit(input: {
  userId?: number | null;
  action: string;
  entity?: string;
  entityId?: string | number;
  ip?: string;
  meta?: unknown;
}): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, ip, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.userId ?? null,
      input.action,
      input.entity ?? '',
      String(input.entityId ?? ''),
      input.ip ?? '',
      JSON.stringify(input.meta ?? {}),
      nowIso(),
    );
  } catch (err) {
    log.warn('audit_write_failed', { error: String(err) });
  }
}
