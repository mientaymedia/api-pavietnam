import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, nowIso } from '../src/db/index.js';
import { addToCart, getCart, clearCart } from '../src/services/cart.js';
import { createRenewalOrder } from '../src/services/orders.js';
import { upsertTld } from '../src/services/pricing.js';

/** Du lieu nen: mot duoi ten mien va mot khach hang de thu nghiem. */
function fixture() {
  upsertTld({
    tld: 'test', kind: 'intl', price_register: 300_000, price_renew: 350_000,
    price_transfer: 320_000, is_active: 1, min_years: 1, max_years: 10,
  });
  const email = `khach-${Math.random().toString(36).slice(2)}@test.vn`;
  const info = db
    .prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Khach', ?, ?)`)
    .run(email, nowIso(), nowIso());
  return { userId: Number(info.lastInsertRowid), cartKey: `test:${Math.random()}` };
}

test('chuyen ten mien ve BAT BUOC co ma EPP', () => {
  const { userId, cartKey } = fixture();
  const thieuMa = addToCart({ cartKey, userId, domain: 'abc.test', action: 'transfer', years: 1 });

  assert.equal(thieuMa.ok, false);
  if (!thieuMa.ok) assert.match(thieuMa.error, /EPP|xac thuc/i);
  assert.equal(getCart(cartKey).count, 0);
});

test('ma EPP duoc luu kem dong hang', () => {
  const { userId, cartKey } = fixture();
  const ok = addToCart({
    cartKey, userId, domain: 'abc.test', action: 'transfer', years: 1,
    meta: { authCode: 'EPP-123456' },
  });
  assert.equal(ok.ok, true);

  const line = getCart(cartKey).lines[0]!;
  assert.equal(line.action, 'transfer');
  assert.equal(JSON.parse(line.meta).authCode, 'EPP-123456');
  clearCart(cartKey);
});

test('dang ky va gia han khong doi hoi ma EPP', () => {
  const { userId, cartKey } = fixture();
  assert.equal(addToCart({ cartKey, userId, domain: 'abc.test', action: 'register', years: 1 }).ok, true);
  assert.equal(addToCart({ cartKey, userId, domain: 'xyz.test', action: 'renew', years: 1 }).ok, true);
  clearCart(cartKey);
});

test('gia chuyen ve dung theo bang gia transfer', () => {
  const { userId, cartKey } = fixture();
  addToCart({ cartKey, userId, domain: 'phi.test', action: 'transfer', years: 1, meta: { authCode: 'EPP-1' } });
  assert.equal(getCart(cartKey).lines[0]!.amount, 320_000);
  clearCart(cartKey);
});

test('gia han tu dong khong tao don trung cho cung ten mien', () => {
  const { userId } = fixture();
  const domain = `trung-${Math.random().toString(36).slice(2)}.test`;

  const lan1 = createRenewalOrder({ userId, contactId: null, domain, tld: 'test', years: 1 });
  assert.equal(lan1.ok, true);
  if (!lan1.ok) return;
  assert.equal(lan1.existing, false);

  // Chay lai khi don truoc van dang cho thanh toan -> tra ve don cu
  const lan2 = createRenewalOrder({ userId, contactId: null, domain, tld: 'test', years: 1 });
  assert.equal(lan2.ok, true);
  if (!lan2.ok) return;
  assert.equal(lan2.existing, true);
  assert.equal(lan2.order.code, lan1.order.code);

  const soDon = db
    .prepare(`SELECT COUNT(*) n FROM order_items WHERE domain = ? AND action = 'renew'`)
    .get(domain) as { n: number };
  assert.equal(soDon.n, 1);
});

test('don gia han tu dong duoc danh dau de khong gui email trung', () => {
  const { userId } = fixture();
  const domain = `co-${Math.random().toString(36).slice(2)}.test`;
  const created = createRenewalOrder({ userId, contactId: null, domain, tld: 'test', years: 1 });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const item = db.prepare('SELECT meta FROM order_items WHERE order_id = ?').get(created.order.id) as { meta: string };
  assert.equal(JSON.parse(item.meta).autoRenew, true);
});

test('gia han duoi da ngung ban thi bao loi ro rang', () => {
  const { userId } = fixture();
  const res = createRenewalOrder({ userId, contactId: null, domain: 'x.duoi-khong-ton-tai', tld: 'duoi-khong-ton-tai', years: 1 });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /khong con duoc ho tro/i);
});
