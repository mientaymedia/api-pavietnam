import './helpers/db.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, nowIso } from '../src/db/index.js';
import { addToCart } from '../src/services/cart.js';
import { createOrderFromCart, getOrder, getOrderItems, markOrderPaid } from '../src/services/orders.js';
import { refundFailedItems, refundOrderItem } from '../src/services/refunds.js';
import { balanceOf } from '../src/payments/balance.js';
import { upsertTld } from '../src/services/pricing.js';

function nen(soTenMien = 1) {
  upsertTld({ tld: 'hoan', kind: 'intl', price_register: 300_000, price_renew: 300_000, is_active: 1 });
  const email = `hoan-${Math.random().toString(36).slice(2)}@test.vn`;
  const userId = Number(
    db.prepare(`INSERT INTO users (email, password_hash, full_name, created_at, updated_at) VALUES (?, 'x', 'Thu', ?, ?)`)
      .run(email, nowIso(), nowIso()).lastInsertRowid,
  );

  const cartKey = `t-${Math.random()}`;
  for (let i = 0; i < soTenMien; i++) {
    addToCart({ cartKey, userId, domain: `d${i}-${Math.random().toString(36).slice(2)}.hoan`, action: 'register', years: 1 });
  }
  const created = createOrderFromCart({ userId, cartKey, contactId: null });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('khong tao duoc don');

  markOrderPaid(created.order.id, { provider: 'manual' });
  return { userId, order: created.order, items: getOrderItems(created.order.id) };
}

test('hoan tien cong dung so tien vao so du', async () => {
  const { userId, items } = nen(1);
  db.prepare(`UPDATE order_items SET status='failed' WHERE id=?`).run(items[0]!.id);

  const truoc = balanceOf(userId);
  const r = await refundOrderItem(items[0]!.id, {});

  assert.equal(r.status, 'refunded');
  if (r.status !== 'refunded') return;
  assert.equal(r.amount, 300_000);
  assert.equal(balanceOf(userId), truoc + 300_000);
});

test('hoan hai lan khong cong tien hai lan', async () => {
  const { userId, items } = nen(1);
  db.prepare(`UPDATE order_items SET status='failed' WHERE id=?`).run(items[0]!.id);

  await refundOrderItem(items[0]!.id, {});
  const sauLan1 = balanceOf(userId);

  const lan2 = await refundOrderItem(items[0]!.id, {});
  assert.equal(lan2.status, 'already_refunded');
  assert.equal(balanceOf(userId), sauLan1);
});

test('khong hoan duoc dong dang hoat dong', async () => {
  const { userId, items } = nen(1);
  db.prepare(`UPDATE order_items SET status='active' WHERE id=?`).run(items[0]!.id);

  const truoc = balanceOf(userId);
  const r = await refundOrderItem(items[0]!.id, {});

  assert.equal(r.status, 'not_refundable');
  assert.equal(balanceOf(userId), truoc);
});

test('don co dong thanh cong lan that bai -> hoan tat mot phan', async () => {
  const { order, items } = nen(2);
  db.prepare(`UPDATE order_items SET status='active' WHERE id=?`).run(items[0]!.id);
  db.prepare(`UPDATE order_items SET status='failed' WHERE id=?`).run(items[1]!.id);

  await refundOrderItem(items[1]!.id, {});
  assert.equal(getOrder(order.id)!.status, 'partially_completed');
});

test('moi dong deu duoc hoan -> don chuyen sang da hoan tien', async () => {
  const { order, items } = nen(2);
  for (const i of items) db.prepare(`UPDATE order_items SET status='failed' WHERE id=?`).run(i.id);

  const { refunded } = await refundFailedItems(order.id, {});
  assert.equal(refunded, 2);
  assert.equal(getOrder(order.id)!.status, 'refunded');
});

test('so tien hoan chia theo ty le khi don co nhieu dong', async () => {
  const { userId, items } = nen(2);
  db.prepare(`UPDATE order_items SET status='failed' WHERE id=?`).run(items[0]!.id);

  const truoc = balanceOf(userId);
  const r = await refundOrderItem(items[0]!.id, {});

  assert.equal(r.status, 'refunded');
  if (r.status !== 'refunded') return;
  // Don 600.000d gom 2 dong bang nhau -> hoan dung mot nua
  assert.equal(r.amount, 300_000);
  assert.equal(balanceOf(userId), truoc + 300_000);
});

test('ghi nhat ky bien dong vi khi hoan tien', async () => {
  const { userId, items } = nen(1);
  db.prepare(`UPDATE order_items SET status='failed' WHERE id=?`).run(items[0]!.id);
  await refundOrderItem(items[0]!.id, { reason: 'Ly do thu nghiem' });

  const w = db.prepare(`SELECT kind, amount, note FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1`)
    .get(userId) as { kind: string; amount: number; note: string };

  assert.equal(w.kind, 'refund');
  assert.equal(w.amount, 300_000);
  assert.match(w.note, /thu nghiem/i);
});

test('dong don khong ton tai thi bao khong tim thay', async () => {
  const r = await refundOrderItem(999_999_999, {});
  assert.equal(r.status, 'not_found');
});
