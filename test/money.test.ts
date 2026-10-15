import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatVnd } from '../src/lib/money.js';

test('tien hien thi dang "830.000 đ" (chu đ thuong, khoang trang thuong)', () => {
  assert.equal(formatVnd(830_000), '830.000 đ');
  assert.equal(formatVnd(0), '0 đ');
  assert.equal(formatVnd(1_249_000.4), '1.249.000 đ');
});

test('chuoi tien o dang NFC, khong dung ky hieu ₫ hay VNĐ', () => {
  const s = formatVnd(100_000);
  assert.equal(s, s.normalize('NFC'));
  assert.ok(!s.includes('₫') && !s.includes('VNĐ'));
  assert.equal(s.at(-1), 'đ');
  assert.equal(s.at(-2), ' ');
});
