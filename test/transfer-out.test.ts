import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, isoIn, nowIso } from '../src/db/index.js';
import { requestAuthCode } from '../src/services/transferOut.js';
import type { DomainRow } from '../src/services/domainRepo.js';

function tenMien(over: Partial<DomainRow> = {}): DomainRow {
  const domain = `tm-${Math.random().toString(36).slice(2)}.com`;
  const userId = Number(
    db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Thu', ?, ?)`)
      .run(`${domain}@test.vn`, nowIso(), nowIso()).lastInsertRowid,
  );
  const id = Number(
    db.prepare(
      `INSERT INTO domains (user_id, domain, tld, status, provider, nameservers, transfer_lock, created_at, updated_at)
       VALUES (?, ?, 'com', 'active', 'pavietnam', '[]', ?, ?, ?)`,
    ).run(userId, domain, over.transfer_lock ?? 1, nowIso(), nowIso()).lastInsertRowid,
  );
  return db.prepare('SELECT * FROM domains WHERE id = ?').get(id) as DomainRow;
}

test('dang khoa thi khong lay duoc ma EPP', async () => {
  const d = tenMien({ transfer_lock: 1 });
  const r = await requestAuthCode(d, { userId: d.user_id });

  assert.equal(r.status, 'locked');
  if (r.status === 'locked') assert.match(r.message, /mo khoa/i);
});

test('da mo khoa thi lay duoc ma EPP', async () => {
  const d = tenMien({ transfer_lock: 0 });
  const r = await requestAuthCode(d, { userId: d.user_id });

  assert.equal(r.status, 'ok');
  if (r.status === 'ok') assert.ok(r.authCode.length > 0);
});

test('lay ma xong thi ghi lai thoi diem', async () => {
  const d = tenMien({ transfer_lock: 0 });
  await requestAuthCode(d, { userId: d.user_id });

  const sau = db.prepare('SELECT auth_code_last_at FROM domains WHERE id = ?').get(d.id) as
    { auth_code_last_at: string | null };
  assert.ok(sau.auth_code_last_at, 'phai ghi lai thoi diem lay ma');
});

test('vua lay xong thi phai doi truoc khi lay lai', async () => {
  const d = tenMien({ transfer_lock: 0 });
  await requestAuthCode(d, { userId: d.user_id });

  const lai = db.prepare('SELECT * FROM domains WHERE id = ?').get(d.id) as DomainRow;
  const r = await requestAuthCode(lai, { userId: d.user_id });

  assert.equal(r.status, 'too_soon');
});

test('qua thoi gian cho thi lay lai duoc', async () => {
  const d = tenMien({ transfer_lock: 0 });
  db.prepare('UPDATE domains SET auth_code_last_at = ? WHERE id = ?').run(isoIn(-3600_000), d.id);

  const lai = db.prepare('SELECT * FROM domains WHERE id = ?').get(d.id) as DomainRow;
  const r = await requestAuthCode(lai, { userId: d.user_id });

  assert.equal(r.status, 'ok');
});

test('nhat ky kiem toan khong bao gio chua ma EPP', async () => {
  const d = tenMien({ transfer_lock: 0 });
  const r = await requestAuthCode(d, { userId: d.user_id, ip: '1.2.3.4' });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;

  const nhatKy = db
    .prepare(`SELECT meta, ip FROM audit_logs WHERE action='domain.auth_code_issued' AND entity_id=? ORDER BY id DESC LIMIT 1`)
    .get(String(d.id)) as { meta: string; ip: string };

  assert.equal(nhatKy.meta.includes(r.authCode), false, 'ma EPP khong duoc nam trong nhat ky');
  assert.equal(nhatKy.ip, '1.2.3.4', 'phai ghi lai IP de truy vet');
});

test('gui email canh bao cho chu so huu moi lan lay ma', async () => {
  const d = tenMien({ transfer_lock: 0 });
  await requestAuthCode(d, { userId: d.user_id });

  const mail = db
    .prepare(`SELECT template FROM email_logs WHERE user_id=? ORDER BY id DESC LIMIT 1`)
    .get(d.user_id) as { template: string } | undefined;

  assert.equal(mail?.template, 'auth_code_issued');
});
