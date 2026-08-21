import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, isoIn, nowIso } from '../src/db/index.js';
import { canResend, consumeToken, isVerified, issueToken } from '../src/services/verification.js';
import { sha256 } from '../src/lib/crypto.js';

function newUser(): { id: number; email: string } {
  const email = `xt-${Math.random().toString(36).slice(2)}@test.vn`;
  const info = db
    .prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Thu', ?, ?)`)
    .run(email, nowIso(), nowIso());
  return { id: Number(info.lastInsertRowid), email };
}

test('token hop le thi xac thuc thanh cong', () => {
  const user = newUser();
  assert.equal(isVerified(user.id), false);

  const outcome = consumeToken(issueToken(user));
  assert.equal(outcome.status, 'ok');
  assert.equal(isVerified(user.id), true);
});

test('bam lai cung lien ket khong bao loi', () => {
  const user = newUser();
  const token = issueToken(user);
  assert.equal(consumeToken(token).status, 'ok');
  assert.equal(consumeToken(token).status, 'already_verified');
});

test('token bia dat bi tu choi', () => {
  assert.equal(consumeToken('token-khong-co-that').status, 'invalid');
  assert.equal(consumeToken('').status, 'invalid');
  assert.equal(consumeToken('   ').status, 'invalid');
});

test('token het han bi tu choi', () => {
  const user = newUser();
  const token = issueToken(user);
  db.prepare('UPDATE email_verifications SET expires_at = ? WHERE token_hash = ?')
    .run(isoIn(-1000), sha256(token));

  assert.equal(consumeToken(token).status, 'expired');
  assert.equal(isVerified(user.id), false);
});

test('token cu bi vo hieu khi cap token moi', () => {
  const user = newUser();
  const cu = issueToken(user);
  const moi = issueToken(user);

  // Token cu da bi danh dau da dung nhung tai khoan chua xac thuc -> khong dung duoc
  assert.equal(consumeToken(cu).status, 'invalid');
  assert.equal(consumeToken(moi).status, 'ok');
});

test('doi email sau khi gui thi lien ket cu het y nghia', () => {
  const user = newUser();
  const token = issueToken(user);

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(`doi-${user.email}`, user.id);

  assert.equal(consumeToken(token).status, 'invalid');
  assert.equal(isVerified(user.id), false);
});

test('gioi han so lan gui lai theo tung nguoi dung', () => {
  const user = newUser();
  for (let i = 0; i < 5; i++) issueToken(user);

  const { allowed, sentLastHour } = canResend(user.id);
  assert.equal(sentLastHour, 5);
  assert.equal(allowed, false);
});

test('token cua nguoi khac khong xac thuc nham tai khoan', () => {
  const a = newUser();
  const b = newUser();
  const tokenA = issueToken(a);

  assert.equal(consumeToken(tokenA).status, 'ok');
  assert.equal(isVerified(a.id), true);
  assert.equal(isVerified(b.id), false);
});
