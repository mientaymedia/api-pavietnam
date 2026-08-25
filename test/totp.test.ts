import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode, base32Encode, codeForCounter, counterFor, currentCode,
  formatSecret, generateSecret, otpauthUri, verifyTotp,
} from '../src/lib/totp.js';

/* ----------------------------------------------------------------- Base32 */

test('Base32 ma hoa dung theo RFC 4648', () => {
  // Vector kiem thu chuan trong RFC 4648 muc 10
  assert.equal(base32Encode(Buffer.from('')), '');
  assert.equal(base32Encode(Buffer.from('f')), 'MY');
  assert.equal(base32Encode(Buffer.from('fo')), 'MZXQ');
  assert.equal(base32Encode(Buffer.from('foo')), 'MZXW6');
  assert.equal(base32Encode(Buffer.from('foob')), 'MZXW6YQ');
  assert.equal(base32Encode(Buffer.from('fooba')), 'MZXW6YTB');
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
});

test('Base32 giai ma nguoc lai dung', () => {
  for (const s of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'Mien Tay Media']) {
    assert.equal(base32Decode(base32Encode(Buffer.from(s))).toString(), s);
  }
});

test('Base32 bo qua khoang trang, gach ngang va dau bang', () => {
  assert.equal(base32Decode('MZXW 6YTB-OI=').toString(), 'foobar');
  assert.equal(base32Decode('mzxw6ytboi').toString(), 'foobar');
});

test('Base32 tu choi ky tu khong hop le', () => {
  assert.throws(() => base32Decode('MZXW1'), /khong hop le/);
});

/* ------------------------------------------------------------------- TOTP */

/**
 * Vector kiem thu chinh thuc trong RFC 6238 phu luc B (khoa SHA-1
 * "12345678901234567890"), cat con 6 chu so cuoi.
 */
test('sinh dung ma theo vector kiem thu cua RFC 6238', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const cases: [number, string][] = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];
  for (const [giay, mong] of cases) {
    assert.equal(codeForCounter(secret, Math.floor(giay / 30)), mong, `moc ${giay}`);
  }
});

test('chu ky doi moi 30 giay', () => {
  assert.equal(counterFor(0), 0);
  assert.equal(counterFor(29_999), 0);
  assert.equal(counterFor(30_000), 1);
  assert.equal(counterFor(59_999), 1);
});

test('chap nhan lech dong ho mot chu ky ve moi phia', () => {
  const secret = generateSecret();
  const moc = 1_800_000_000_000;

  // Ma cua chu ky truoc / hien tai / sau deu duoc chap nhan
  for (const lech of [-30_000, 0, 30_000]) {
    const ma = currentCode(secret, moc + lech);
    assert.equal(verifyTotp(secret, ma, { atMs: moc }).ok, true, `lech ${lech}ms`);
  }

  // Lech 2 chu ky tro len thi khong
  for (const lech of [-90_000, 90_000]) {
    const ma = currentCode(secret, moc + lech);
    assert.equal(verifyTotp(secret, ma, { atMs: moc }).ok, false, `lech ${lech}ms phai bi tu choi`);
  }
});

test('tu choi ma sai dinh dang', () => {
  const secret = generateSecret();
  for (const xau of ['', '12345', '1234567', 'abcdef', '   ']) {
    assert.equal(verifyTotp(secret, xau).ok, false, `phai tu choi: ${JSON.stringify(xau)}`);
  }
});

test('minCounter chan dung lai ma da tieu', () => {
  const secret = generateSecret();
  const moc = 1_800_000_000_000;
  const ma = currentCode(secret, moc);
  const lan1 = verifyTotp(secret, ma, { atMs: moc });
  assert.equal(lan1.ok, true);

  // Dung lai chinh ma do khi da ghi nhan chu ky -> tu choi
  assert.equal(verifyTotp(secret, ma, { atMs: moc, minCounter: lan1.counter! }).ok, false);

  // Nhung ma cua chu ky KE TIEP thi van chap nhan
  const maSau = currentCode(secret, moc + 30_000);
  assert.equal(verifyTotp(secret, maSau, { atMs: moc + 30_000, minCounter: lan1.counter! }).ok, true);
});

test('khoa khac nhau khong xac thuc cheo duoc', () => {
  const a = generateSecret();
  const b = generateSecret();
  const moc = 1_800_000_000_000;
  assert.equal(verifyTotp(b, currentCode(a, moc), { atMs: moc }).ok, false);
});

test('khoa sinh ra du dai 160 bit', () => {
  const secret = generateSecret();
  assert.equal(base32Decode(secret).length, 20);
  assert.match(secret, /^[A-Z2-7]+$/);
});

/* ------------------------------------------------------------- dia chi otpauth */

test('dia chi otpauth dung dinh dang ung dung xac thuc doc duoc', () => {
  const uri = otpauthUri({ secret: 'JBSWY3DPEHPK3PXP', account: 'admin@mientaymedia.com', issuer: 'Mien Tay Media' });
  const u = new URL(uri);
  assert.equal(u.protocol, 'otpauth:');
  assert.equal(u.host, 'totp');
  assert.equal(decodeURIComponent(u.pathname.slice(1)), 'Mien Tay Media:admin@mientaymedia.com');
  assert.equal(u.searchParams.get('secret'), 'JBSWY3DPEHPK3PXP');
  assert.equal(u.searchParams.get('issuer'), 'Mien Tay Media');
  assert.equal(u.searchParams.get('digits'), '6');
  assert.equal(u.searchParams.get('period'), '30');
});

test('chia khoa thanh nhom bon ky tu cho de nhap tay', () => {
  assert.equal(formatSecret('ABCDEFGH'), 'ABCD EFGH');
  assert.equal(formatSecret('ABCDEFGHIJ'), 'ABCD EFGH IJ');
});
