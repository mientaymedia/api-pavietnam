import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, hashPassword, maskSecret, randomCode, safeEqual, verifyPassword } from '../src/lib/crypto.js';

test('bam va kiem tra mat khau', () => {
  const hash = hashPassword('MatKhau#123');
  assert.notEqual(hash, 'MatKhau#123');
  assert.equal(verifyPassword('MatKhau#123', hash), true);
  assert.equal(verifyPassword('MatKhauSai', hash), false);
});

test('moi lan bam ra chuoi khac nhau (co salt)', () => {
  assert.notEqual(hashPassword('abc12345'), hashPassword('abc12345'));
});

test('verifyPassword khong nem loi voi du lieu hong', () => {
  assert.equal(verifyPassword('abc', 'rac'), false);
  assert.equal(verifyPassword('abc', ''), false);
});

test('ma hoa va giai ma secret', () => {
  // Chuoi mau co dang API key (32 ky tu hex) - KHONG dung key that trong test
  const plain = '0123456789abcdef0123456789abcdef';
  const enc = encryptSecret(plain);
  assert.notEqual(enc, plain);
  assert.equal(decryptSecret(enc), plain);
});

test('giai ma that bai khi du lieu bi sua', () => {
  const enc = encryptSecret('bi-mat');
  const parts = enc.split('.');
  parts[3] = Buffer.from('da-bi-sua').toString('base64url');
  assert.throws(() => decryptSecret(parts.join('.')));
});

test('maskSecret giu 4 ky tu dau/cuoi', () => {
  assert.equal(maskSecret('abcdefghijklmnop'), 'abcd********mnop');
  assert.equal(maskSecret('short'), '****');
  assert.equal(maskSecret(''), '');
});

test('randomCode khong chua ky tu de nham', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(randomCode(8), /^[2-9A-HJ-NP-Z]{8}$/);
  }
});

test('safeEqual so sanh dung', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});
