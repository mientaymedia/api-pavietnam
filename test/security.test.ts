import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duongDanNoiBo, laDiaChiHost } from '../src/lib/redirect.js';
import { redirectWithBase } from '../src/lib/basePath.js';

// Cung ham voi safeNext trong src/routes/auth.ts (goi thang ham that, khong
// con ban sao: ban sao cu khong lo duoc loi /.//evil.com).
const safeNext = (value: unknown): string => duongDanNoiBo(value, '/dashboard');

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

// Loi evals 1: kiem chuoi tho thi lot, vi URL parser bo doan dau cham va
// pathname ket qua thanh //evil.com.
const BIEN_THE_DOC = [
  '/.//evil.com',
  '/..//evil.com',
  '/%2e//evil.com',
  '/%2E//evil.com',
  '/%2e%2e//evil.com',
  '/a/..//evil.com',
  '/a/b/../..//evil.com',
  '/./\\evil.com',
  '/.\\/evil.com',
  '/.//evil.com/duong-dan?x=1',
  '%2F%2Fevil.com',
  '/\\evil.com',
  '//evil.com',
  '///evil.com',
  'https://evil.com',
  'HTTPS://evil.com',
  'javascript:alert(1)',
  '/\t/evil.com',
  '/\n/evil.com',
  '\t//evil.com',
  '/dashboard\u0000',
  '/\u0000/evil.com',
];

test('chan bien the chuan hoa thanh //host (loi evals 1)', () => {
  for (const xau of BIEN_THE_DOC) {
    assert.equal(safeNext(xau), '/dashboard', `phai chan: ${JSON.stringify(xau)}`);
  }
});

test('duong dan noi bo co doan dau cham van duoc chuan hoa binh thuong', () => {
  assert.equal(safeNext('/a/../gio-hang'), '/gio-hang');
  assert.equal(safeNext('/./bang-gia?x=1#y'), '/bang-gia?x=1#y');
  assert.equal(safeNext('/%2e/whois'), '/whois');
});

test('laDiaChiHost nhan ra moi dang trinh duyet hieu la sang host khac', () => {
  for (const p of ['//evil.com', '/\\evil.com', '\\\\evil.com', ' //evil.com', '/\t/evil.com', '\u0001//evil.com']) {
    assert.ok(laDiaChiHost(p), JSON.stringify(p));
  }
  for (const p of ['/', '/dashboard', '/a//b', 'https://pay.momo.vn/x']) {
    assert.ok(!laDiaChiHost(p), JSON.stringify(p));
  }
});

test('ban boc res.redirect khong bao gio phat Location //host', () => {
  const da: unknown[][] = [];
  const res = { redirect: (...a: unknown[]) => { da.push(a); } } as unknown as Parameters<typeof redirectWithBase>[1];
  redirectWithBase({} as Parameters<typeof redirectWithBase>[0], res, () => {});
  res.redirect('//evil.com');
  res.redirect(302, '/\\evil.com');
  res.redirect('/gio-hang');
  res.redirect('https://pay.momo.vn/thanh-toan');
  // Test chay o goc (BASE rong): dich bi chan ve trang chu cua app.
  assert.deepEqual(da, [['/'], [302, '/'], ['/gio-hang'], ['https://pay.momo.vn/thanh-toan']]);
});
