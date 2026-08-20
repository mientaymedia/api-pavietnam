import { db, nowIso } from '../db/index.js';
import { roundUpTo, toVnd } from '../lib/money.js';
import { settings } from '../lib/settings.js';

export interface Tld {
  id: number;
  tld: string;
  kind: 'vn' | 'intl';
  label: string;
  cost_register: number;
  cost_renew: number;
  price_register: number;
  price_renew: number;
  price_transfer: number;
  setup_fee: number;
  vat_percent: number;
  min_years: number;
  max_years: number;
  requires_vn_contact: number;
  is_active: number;
  is_featured: number;
  sort_order: number;
}

export type DomainAction = 'register' | 'renew' | 'transfer';

export function listTlds(opts: { activeOnly?: boolean; featuredOnly?: boolean } = {}): Tld[] {
  const where: string[] = [];
  if (opts.activeOnly !== false) where.push('is_active = 1');
  if (opts.featuredOnly) where.push('is_featured = 1');
  const sql = `SELECT * FROM tlds ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY sort_order, tld`;
  return db.prepare(sql).all() as Tld[];
}

export function getTld(tld: string): Tld | undefined {
  return db.prepare('SELECT * FROM tlds WHERE tld = ? COLLATE NOCASE').get(tld.replace(/^\./, '')) as Tld | undefined;
}

export function knownTlds(): string[] {
  return (db.prepare('SELECT tld FROM tlds WHERE is_active = 1').all() as { tld: string }[]).map((r) => r.tld);
}

export interface PriceBreakdown {
  /** Gia mot nam (da gom markup, chua VAT). */
  unitPrice: number;
  /** Phi khoi tao (chi tinh 1 lan khi dang ky moi). */
  setupFee: number;
  years: number;
  /** Tong truoc VAT. */
  subtotal: number;
  vatPercent: number;
  vat: number;
  /** Tong phai tra. */
  total: number;
  currency: 'VND';
}

/**
 * Tinh gia cho mot ten mien.
 *
 * Nam dau dung `price_register` (thuong khuyen mai), cac nam tiep theo dung
 * `price_renew` - dung thong le cua nganh dang ky ten mien.
 */
export function priceFor(tld: Tld, action: DomainAction, years: number): PriceBreakdown {
  const p = settings.pricing();
  const applyMarkup = (base: number) =>
    roundUpTo(toVnd(base * (1 + p.markupPercent / 100)), p.roundStep || 1);

  const y = Math.max(tld.min_years || 1, Math.min(years, tld.max_years || 10));

  let subtotal: number;
  let unitPrice: number;
  let setupFee = 0;

  if (action === 'register') {
    unitPrice = applyMarkup(tld.price_register);
    const renewUnit = applyMarkup(tld.price_renew || tld.price_register);
    setupFee = applyMarkup(tld.setup_fee);
    subtotal = unitPrice + renewUnit * (y - 1) + setupFee;
  } else if (action === 'renew') {
    unitPrice = applyMarkup(tld.price_renew || tld.price_register);
    subtotal = unitPrice * y;
  } else {
    unitPrice = applyMarkup(tld.price_transfer || tld.price_renew || tld.price_register);
    subtotal = unitPrice * y;
  }

  const vatPercent = tld.vat_percent || p.vatPercent || 0;
  const vat = toVnd((subtotal * vatPercent) / 100);

  return {
    unitPrice,
    setupFee,
    years: y,
    subtotal: toVnd(subtotal),
    vatPercent,
    vat,
    total: toVnd(subtotal + vat),
    currency: 'VND',
  };
}

export function upsertTld(input: Partial<Tld> & { tld: string }): void {
  const existing = getTld(input.tld);
  const merged = {
    tld: input.tld.replace(/^\./, '').toLowerCase(),
    kind: input.kind ?? existing?.kind ?? 'intl',
    label: input.label ?? existing?.label ?? '',
    cost_register: input.cost_register ?? existing?.cost_register ?? 0,
    cost_renew: input.cost_renew ?? existing?.cost_renew ?? 0,
    price_register: input.price_register ?? existing?.price_register ?? 0,
    price_renew: input.price_renew ?? existing?.price_renew ?? 0,
    price_transfer: input.price_transfer ?? existing?.price_transfer ?? 0,
    setup_fee: input.setup_fee ?? existing?.setup_fee ?? 0,
    vat_percent: input.vat_percent ?? existing?.vat_percent ?? 0,
    min_years: input.min_years ?? existing?.min_years ?? 1,
    max_years: input.max_years ?? existing?.max_years ?? 10,
    requires_vn_contact: input.requires_vn_contact ?? existing?.requires_vn_contact ?? 0,
    is_active: input.is_active ?? existing?.is_active ?? 1,
    is_featured: input.is_featured ?? existing?.is_featured ?? 0,
    sort_order: input.sort_order ?? existing?.sort_order ?? 100,
  };

  db.prepare(
    `INSERT INTO tlds (tld, kind, label, cost_register, cost_renew, price_register, price_renew, price_transfer,
                       setup_fee, vat_percent, min_years, max_years, requires_vn_contact, is_active, is_featured,
                       sort_order, updated_at)
     VALUES (@tld, @kind, @label, @cost_register, @cost_renew, @price_register, @price_renew, @price_transfer,
             @setup_fee, @vat_percent, @min_years, @max_years, @requires_vn_contact, @is_active, @is_featured,
             @sort_order, @updated_at)
     ON CONFLICT(tld) DO UPDATE SET
       kind=excluded.kind, label=excluded.label, cost_register=excluded.cost_register, cost_renew=excluded.cost_renew,
       price_register=excluded.price_register, price_renew=excluded.price_renew, price_transfer=excluded.price_transfer,
       setup_fee=excluded.setup_fee, vat_percent=excluded.vat_percent, min_years=excluded.min_years,
       max_years=excluded.max_years, requires_vn_contact=excluded.requires_vn_contact, is_active=excluded.is_active,
       is_featured=excluded.is_featured, sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
  ).run({ ...merged, updated_at: nowIso() });
}

/* ------------------------------------------------------------------- coupon */

export interface Coupon {
  id: number;
  code: string;
  discount_type: 'percent' | 'fixed';
  value: number;
  min_amount: number;
  max_discount: number;
  tld_filter: string;
  max_uses: number;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: number;
}

export function findCoupon(code: string): Coupon | undefined {
  if (!code.trim()) return undefined;
  return db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE AND is_active = 1').get(code.trim()) as
    | Coupon
    | undefined;
}

export interface DiscountResult {
  discount: number;
  error?: string;
}

/** Tinh so tien giam gia cho gio hang. Tra ve loi dang van ban neu ma khong hop le. */
export function computeDiscount(
  coupon: Coupon | undefined,
  items: { tld: string; amount: number }[],
): DiscountResult {
  if (!coupon) return { discount: 0 };

  const now = nowIso();
  if (coupon.starts_at && now < coupon.starts_at) return { discount: 0, error: 'Ma giam gia chua den thoi gian su dung' };
  if (coupon.expires_at && now > coupon.expires_at) return { discount: 0, error: 'Ma giam gia da het han' };
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { discount: 0, error: 'Ma giam gia da het luot su dung' };
  }

  const filter = coupon.tld_filter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const eligible = filter.length ? items.filter((i) => filter.includes(i.tld.toLowerCase())) : items;
  const base = eligible.reduce((sum, i) => sum + i.amount, 0);
  if (!base) return { discount: 0, error: 'Ma giam gia khong ap dung cho san pham trong gio' };

  const cartTotal = items.reduce((sum, i) => sum + i.amount, 0);
  if (coupon.min_amount > 0 && cartTotal < coupon.min_amount) {
    return { discount: 0, error: `Don hang toi thieu ${coupon.min_amount.toLocaleString('vi-VN')}d moi dung duoc ma nay` };
  }

  let discount = coupon.discount_type === 'percent' ? toVnd((base * coupon.value) / 100) : toVnd(coupon.value);
  if (coupon.max_discount > 0) discount = Math.min(discount, coupon.max_discount);
  return { discount: Math.min(discount, base) };
}
