import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, splitDomain } from '../src/pavietnam/client.js';

const KNOWN = ['vn', 'com.vn', 'net.vn', 'com', 'net', 'io'];

test('chuan hoa ten mien nguoi dung nhap', () => {
  assert.equal(normalizeDomain('  HTTPS://WWW.AbC.CoM/trang-chu  '), 'abc.com');
  assert.equal(normalizeDomain('abc.vn.'), 'abc.vn');
  assert.equal(normalizeDomain(''), '');
});

test('tach duoi uu tien duoi DAI nhat', () => {
  // 'abc.com.vn' phai ra tld 'com.vn', khong phai 'vn'
  assert.deepEqual(splitDomain('abc.com.vn', KNOWN), { sld: 'abc', tld: 'com.vn' });
  assert.deepEqual(splitDomain('abc.vn', KNOWN), { sld: 'abc', tld: 'vn' });
  assert.deepEqual(splitDomain('abc.io', KNOWN), { sld: 'abc', tld: 'io' });
});

test('duoi la khong nam trong danh sach van tach duoc', () => {
  assert.deepEqual(splitDomain('abc.xyz', KNOWN), { sld: 'abc', tld: 'xyz' });
});

test('chuoi khong phai ten mien tra ve null', () => {
  assert.equal(splitDomain('abc', KNOWN), null);
});
