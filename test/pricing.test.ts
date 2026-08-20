import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDiscount, priceFor, type Coupon, type Tld } from '../src/services/pricing.js';
import { roundUpTo, withVat } from '../src/lib/money.js';

const tld = (over: Partial<Tld> = {}): Tld => ({
  id: 1, tld: 'com', kind: 'intl', label: '',
  cost_register: 250_000, cost_renew: 280_000,
  price_register: 300_000, price_renew: 350_000, price_transfer: 300_000,
  setup_fee: 0, vat_percent: 0, min_years: 1, max_years: 10,
  requires_vn_contact: 0, is_active: 1, is_featured: 0, sort_order: 1,
  ...over,
});

test('nam dau tinh gia dang ky, cac nam sau tinh gia gia han', () => {
  const p = priceFor(tld(), 'register', 3);
  assert.equal(p.subtotal, 300_000 + 350_000 * 2);
});

test('gia han tinh dong gia moi nam', () => {
  assert.equal(priceFor(tld(), 'renew', 2).subtotal, 700_000);
});

test('phi khoi tao chi tinh mot lan khi dang ky moi', () => {
  const t = tld({ setup_fee: 100_000 });
  assert.equal(priceFor(t, 'register', 2).subtotal, 300_000 + 350_000 + 100_000);
  assert.equal(priceFor(t, 'renew', 2).subtotal, 700_000); // gia han khong tinh phi khoi tao
});

test('so nam bi ep ve khoang cho phep', () => {
  const t = tld({ min_years: 2, max_years: 5 });
  assert.equal(priceFor(t, 'renew', 1).years, 2);
  assert.equal(priceFor(t, 'renew', 99).years, 5);
});

test('VAT duoc cong vao tong', () => {
  const p = priceFor(tld({ vat_percent: 10 }), 'renew', 1);
  assert.equal(p.subtotal, 350_000);
  assert.equal(p.vat, 35_000);
  assert.equal(p.total, 385_000);
});

test('lam tron len boi so', () => {
  assert.equal(roundUpTo(300_001, 1000), 301_000);
  assert.equal(roundUpTo(300_000, 1000), 300_000);
  assert.equal(roundUpTo(1234, 0), 1234); // buoc 0 -> khong lam tron
});

test('withVat', () => {
  assert.equal(withVat(100_000, 10), 110_000);
  assert.equal(withVat(100_000, 0), 100_000);
});

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: 1, code: 'SALE', discount_type: 'percent', value: 10,
  min_amount: 0, max_discount: 0, tld_filter: '', max_uses: 0, used_count: 0,
  starts_at: null, expires_at: null, is_active: 1,
  ...over,
});

test('giam gia theo phan tram', () => {
  const r = computeDiscount(coupon(), [{ tld: 'com', amount: 1_000_000 }]);
  assert.equal(r.discount, 100_000);
});

test('giam gia co tran toi da', () => {
  const r = computeDiscount(coupon({ value: 50, max_discount: 200_000 }), [{ tld: 'com', amount: 1_000_000 }]);
  assert.equal(r.discount, 200_000);
});

test('chi ap dung cho duoi duoc phep', () => {
  const r = computeDiscount(coupon({ tld_filter: 'vn' }), [
    { tld: 'com', amount: 1_000_000 },
    { tld: 'vn', amount: 500_000 },
  ]);
  assert.equal(r.discount, 50_000); // 10% cua rieng dong .vn
});

test('bao loi khi duoi khong khop', () => {
  const r = computeDiscount(coupon({ tld_filter: 'vn' }), [{ tld: 'com', amount: 1_000_000 }]);
  assert.equal(r.discount, 0);
  assert.ok(r.error);
});

test('bao loi khi ma het han hoac het luot', () => {
  assert.ok(computeDiscount(coupon({ expires_at: '2000-01-01T00:00:00Z' }), [{ tld: 'com', amount: 100 }]).error);
  assert.ok(computeDiscount(coupon({ max_uses: 1, used_count: 1 }), [{ tld: 'com', amount: 100 }]).error);
});

test('bao loi khi chua dat gia tri don toi thieu', () => {
  const r = computeDiscount(coupon({ min_amount: 2_000_000 }), [{ tld: 'com', amount: 1_000_000 }]);
  assert.equal(r.discount, 0);
  assert.ok(r.error);
});

test('giam gia khong vuot qua gia tri don', () => {
  const r = computeDiscount(coupon({ discount_type: 'fixed', value: 5_000_000 }), [{ tld: 'com', amount: 300_000 }]);
  assert.equal(r.discount, 300_000);
});

test('khong co ma thi khong giam', () => {
  assert.deepEqual(computeDiscount(undefined, [{ tld: 'com', amount: 100 }]), { discount: 0 });
});
