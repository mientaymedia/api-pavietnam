import { db, nowIso, parseJson } from '../db/index.js';
import { getTld, priceFor, type DomainAction } from './pricing.js';
import { normalizeDomain, splitDomain } from '../pavietnam/client.js';
import { knownTlds } from './pricing.js';

export interface CartItem {
  id: number;
  cart_key: string;
  user_id: number | null;
  action: DomainAction;
  domain: string;
  tld: string;
  years: number;
  unit_price: number;
  amount: number;
  meta: string;
}

export interface CartLine extends CartItem {
  vat: number;
  total: number;
  requiresVnContact: boolean;
}

export interface CartSummary {
  lines: CartLine[];
  subtotal: number;
  vat: number;
  total: number;
  requiresVnContact: boolean;
  count: number;
}

export function addToCart(input: {
  cartKey: string;
  userId: number | null;
  domain: string;
  action: DomainAction;
  years: number;
}): { ok: true } | { ok: false; error: string } {
  const domain = normalizeDomain(input.domain);
  const parsed = splitDomain(domain, knownTlds());
  if (!parsed) return { ok: false, error: 'Duoi ten mien khong duoc ho tro' };

  const tld = getTld(parsed.tld);
  if (!tld || !tld.is_active) return { ok: false, error: 'Duoi ten mien khong duoc ho tro' };

  const price = priceFor(tld, input.action, input.years);

  db.prepare(
    `INSERT INTO cart_items (cart_key, user_id, action, domain, tld, years, unit_price, amount, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
     ON CONFLICT(cart_key, domain, action) DO UPDATE SET
       years=excluded.years, unit_price=excluded.unit_price, amount=excluded.amount, user_id=excluded.user_id`,
  ).run(
    input.cartKey,
    input.userId,
    input.action,
    domain,
    tld.tld,
    price.years,
    price.unitPrice,
    price.subtotal,
    nowIso(),
  );
  return { ok: true };
}

export function removeFromCart(cartKey: string, id: number): void {
  db.prepare('DELETE FROM cart_items WHERE cart_key = ? AND id = ?').run(cartKey, id);
}

export function updateCartYears(cartKey: string, id: number, years: number): void {
  const item = db.prepare('SELECT * FROM cart_items WHERE cart_key = ? AND id = ?').get(cartKey, id) as CartItem | undefined;
  if (!item) return;
  const tld = getTld(item.tld);
  if (!tld) return;
  const price = priceFor(tld, item.action, years);
  db.prepare('UPDATE cart_items SET years=?, unit_price=?, amount=? WHERE id=?')
    .run(price.years, price.unitPrice, price.subtotal, id);
}

export function clearCart(cartKey: string): void {
  db.prepare('DELETE FROM cart_items WHERE cart_key = ?').run(cartKey);
}

/** Chuyen gio hang cua khach vang lai sang tai khoan sau khi dang nhap. */
export function mergeCart(fromKey: string, toKey: string, userId: number): void {
  const items = db.prepare('SELECT * FROM cart_items WHERE cart_key = ?').all(fromKey) as CartItem[];
  const move = db.transaction(() => {
    for (const item of items) {
      db.prepare(
        `INSERT INTO cart_items (cart_key, user_id, action, domain, tld, years, unit_price, amount, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cart_key, domain, action) DO NOTHING`,
      ).run(toKey, userId, item.action, item.domain, item.tld, item.years, item.unit_price, item.amount, item.meta, nowIso());
    }
    db.prepare('DELETE FROM cart_items WHERE cart_key = ?').run(fromKey);
  });
  move();
}

export function getCart(cartKey: string): CartSummary {
  const items = db
    .prepare('SELECT * FROM cart_items WHERE cart_key = ? ORDER BY id')
    .all(cartKey) as CartItem[];

  let subtotal = 0;
  let vat = 0;
  let requiresVnContact = false;

  const lines: CartLine[] = items.map((item) => {
    const tld = getTld(item.tld);
    const price = tld ? priceFor(tld, item.action, item.years) : null;
    const lineSubtotal = price?.subtotal ?? item.amount;
    const lineVat = price?.vat ?? 0;
    subtotal += lineSubtotal;
    vat += lineVat;
    if (tld?.requires_vn_contact) requiresVnContact = true;
    return {
      ...item,
      amount: lineSubtotal,
      unit_price: price?.unitPrice ?? item.unit_price,
      vat: lineVat,
      total: lineSubtotal + lineVat,
      requiresVnContact: tld?.requires_vn_contact === 1,
    };
  });

  return { lines, subtotal, vat, total: subtotal + vat, requiresVnContact, count: lines.length };
}

export function cartMeta<T>(item: CartItem, fallback: T): T {
  return parseJson<T>(item.meta, fallback);
}
