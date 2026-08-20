import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_CODE_RE, parseSepayTransaction } from '../src/payments/sepay.js';

/** Ngan hang thuong chen them tien to/hau to vao noi dung chuyen khoan. */
const contents = [
  ['CT DEN:522512 DHAB12CD', 'DHAB12CD'],
  ['NGUYEN VAN A chuyen tien DHAB12CD', 'DHAB12CD'],
  ['DHAB12CD', 'DHAB12CD'],
  ['thanh toan don dhab12cd cam on', 'DHAB12CD'],
  ['TIEN VE TK 688840 - DH99XYZ7 - GD 123', 'DH99XYZ7'],
];

for (const [content, expected] of contents) {
  test(`do ma don tu noi dung: "${content}"`, () => {
    const m = ORDER_CODE_RE.exec(String(content).replace(/\s+/g, ''));
    assert.equal(m?.[0]?.toUpperCase(), expected);
  });
}

test('khong do duoc ma khi noi dung khong chua ma don', () => {
  assert.equal(ORDER_CODE_RE.exec('chuyen tien an trua'), null);
});

test('doc giao dich tien vao', () => {
  const tx = parseSepayTransaction({
    id: 92704,
    gateway: 'Techcombank',
    transactionDate: '2026-08-20 12:00:00',
    accountNumber: '688840',
    code: null,
    content: 'CT DEN DHAB12CD',
    transferType: 'in',
    transferAmount: 1_350_000,
    referenceCode: 'FT26123',
  });
  assert.equal(tx?.id, '92704');
  assert.equal(tx?.amount, 1_350_000);
  assert.equal(tx?.direction, 'in');
  assert.equal(tx?.accountNumber, '688840');
});

test('nhan dien giao dich chuyen di', () => {
  const tx = parseSepayTransaction({ id: 1, transferType: 'out', transferAmount: 50_000, content: 'rut tien' });
  assert.equal(tx?.direction, 'out');
});

test('so tien am van doc ra gia tri duong', () => {
  const tx = parseSepayTransaction({ id: 2, transferType: 'in', transferAmount: -100, content: 'x' });
  assert.equal(tx?.amount, 100);
});

test('payload khong hop le tra ve null', () => {
  assert.equal(parseSepayTransaction(null), null);
  assert.equal(parseSepayTransaction('chuoi'), null);
  assert.equal(parseSepayTransaction({ content: 'thieu id' }), null);
});
