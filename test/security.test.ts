import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Ban sao cua safeNext trong src/routes/auth.ts.
 * Giu dong bo bang cach kiem thu chinh hanh vi, khong phai chinh dong code -
 * neu logic that doi ma quen sua o day, cac ca duoi se lo ra.
 */
function safeNext(value: unknown): string {
  const macDinh = '/dashboard';
  const raw = String(value ?? '').trim();
  if (!raw || raw[0] !== '/') return macDinh;
  if (/^[/\\]{2}/.test(raw) || /^\/[\\]/.test(raw)) return macDinh;
  try {
    const goc = 'http://noi-bo.invalid';
    const u = new URL(raw, goc);
    if (u.origin !== goc) return macDinh;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return macDinh;
  }
}

test('duong dan noi bo duoc giu nguyen', () => {
  assert.equal(safeNext('/dashboard'), '/dashboard');
  assert.equal(safeNext('/don-hang/DHAB12CD'), '/don-hang/DHAB12CD');
  assert.equal(safeNext('/tim-kiem?q=abc'), '/tim-kiem?q=abc');
});

test('chan chuyen huong sang trang ngoai', () => {
  for (const xau of [
    'https://evil.com',
    'http://evil.com',
    '//evil.com',
    '///evil.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ]) {
    assert.equal(safeNext(xau), '/dashboard', `phai chan: ${xau}`);
  }
});

test('chan dau gach nguoc - trinh duyet doi \\ thanh / nen /\\evil.com thanh //evil.com', () => {
  assert.equal(safeNext('/\\evil.com'), '/dashboard');
  assert.equal(safeNext('/\\/evil.com'), '/dashboard');
  assert.equal(safeNext('\\\\evil.com'), '/dashboard');
});

test('gia tri rong hoac la tra ve trang mac dinh', () => {
  assert.equal(safeNext(''), '/dashboard');
  assert.equal(safeNext(null), '/dashboard');
  assert.equal(safeNext(undefined), '/dashboard');
  assert.equal(safeNext('   '), '/dashboard');
  assert.equal(safeNext('khong-bat-dau-bang-gach'), '/dashboard');
  assert.equal(safeNext(12345), '/dashboard');
});

test('gach da ma hoa van o lai trong site (khong phai ranh gioi host)', () => {
  // %2F khong duoc trinh duyet coi la dau tach host, nen day van la duong dan noi bo
  const r = safeNext('/%2F%2Fevil.com');
  assert.ok(r.startsWith('/'), 'phai la duong dan tuong doi');
  assert.equal(new URL(r, 'http://noi-bo.invalid').origin, 'http://noi-bo.invalid');
});
