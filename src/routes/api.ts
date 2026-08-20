/**
 * REST API JSON - de khach hang tu xay giao dien rieng (app, landing page...).
 *
 * Xac thuc: header  Authorization: Bearer <token>
 * Token tao tai: Tai khoan cua toi > API token.
 *
 * Cac endpoint cong khai (khong can token): /tlds, /check, /whois
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireApiToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { wrap } from '../middleware/error.js';
import { firstError, domainSchema, dnsRecordSchema, nameserverSchema, yearsSchema } from '../lib/validate.js';
import { listTlds, priceFor, getTld } from '../services/pricing.js';
import { searchDomains, lookupWhois } from '../services/domains.js';
import { checkDomain } from '../pavietnam/client.js';
import { addToCart, getCart } from '../services/cart.js';
import { createOrderFromCart, getOrderByCode, getOrderItems, listOrders } from '../services/orders.js';
import { availableProviders, startPayment, type ProviderId } from '../payments/index.js';
import { daysUntilExpiry, getOwnedDomain, listUserDomains, nameserversOf } from '../services/domainRepo.js';
import { addRecord, changeNameservers, deleteRecord, listRecords, replaceRecords } from '../services/dns.js';
import { db } from '../db/index.js';

const router = Router();

router.use(rateLimit({ windowMs: 60_000, max: 120, message: 'Vuot qua gioi han 120 request/phut.' }));

/* ------------------------------------------------------------- cong khai */

router.get('/tlds', (_req, res) => {
  res.json({
    data: listTlds({ activeOnly: true }).map((t) => ({
      tld: t.tld,
      kind: t.kind,
      label: t.label,
      requiresVnContact: t.requires_vn_contact === 1,
      minYears: t.min_years,
      maxYears: t.max_years,
      price: {
        register: priceFor(t, 'register', 1),
        renew: priceFor(t, 'renew', 1),
        transfer: priceFor(t, 'transfer', 1),
      },
    })),
  });
});

router.get(
  '/check',
  rateLimit({ windowMs: 60_000, max: 60 }),
  wrap(async (req, res) => {
    const raw = String(req.query['domain'] ?? '').trim();

    // Khong co dau cham -> coi la tu khoa, tra ve goi y tren nhieu duoi
    if (raw && !raw.includes('.')) {
      const search = await searchDomains(raw, { years: Number(req.query['years'] ?? 1) || 1 });
      res.json({ query: raw, data: search.results });
      return;
    }

    const parsed = domainSchema.safeParse(raw);
    if (!parsed.success) {
      res.status(422).json({ error: firstError(parsed.error) });
      return;
    }

    try {
      const result = await checkDomain(parsed.data);
      const tld = getTld(parsed.data.split('.').slice(1).join('.'));
      res.json({
        data: {
          domain: result.domain,
          available: result.available,
          price: tld && result.available ? priceFor(tld, 'register', Number(req.query['years'] ?? 1) || 1) : null,
        },
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Loi goi API nha dang ky' });
    }
  }),
);

router.get(
  '/whois',
  rateLimit({ windowMs: 60_000, max: 30 }),
  wrap(async (req, res) => {
    const parsed = domainSchema.safeParse(String(req.query['domain'] ?? ''));
    if (!parsed.success) {
      res.status(422).json({ error: firstError(parsed.error) });
      return;
    }
    res.json({ data: await lookupWhois(parsed.data) });
  }),
);

/* --------------------------------------------------------- can xac thuc */

router.use(requireApiToken);

router.get('/me', (req, res) => {
  res.json({
    data: {
      id: req.currentUser!.id,
      email: req.currentUser!.email,
      fullName: req.currentUser!.full_name,
      balance: req.currentUser!.balance,
    },
  });
});

const orderSchema = z.object({
  items: z
    .array(
      z.object({
        domain: domainSchema,
        action: z.enum(['register', 'renew', 'transfer']).default('register'),
        years: yearsSchema.default(1),
      }),
    )
    .min(1, 'Can it nhat mot ten mien')
    .max(20, 'Toi da 20 ten mien moi don'),
  contactId: z.coerce.number().int().positive().optional(),
  coupon: z.string().trim().max(50).optional(),
  /** Tao luon giao dich thanh toan va tra ve link/QR. */
  payWith: z.enum(['sepay', 'momo', 'zalopay', 'balance']).optional(),
});

router.post(
  '/orders',
  wrap(async (req, res) => {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: firstError(parsed.error) });
      return;
    }

    const userId = req.currentUser!.id;
    const cartKey = `api:${userId}:${Date.now()}`;

    for (const item of parsed.data.items) {
      const added = addToCart({ cartKey, userId, domain: item.domain, action: item.action, years: item.years });
      if (!added.ok) {
        res.status(422).json({ error: `${item.domain}: ${added.error}` });
        return;
      }
    }

    let contactId = parsed.data.contactId ?? null;
    if (contactId) {
      const owned = db.prepare('SELECT 1 FROM contacts WHERE id = ? AND user_id = ?').get(contactId, userId);
      if (!owned) {
        res.status(422).json({ error: 'contactId khong thuoc ve tai khoan nay' });
        return;
      }
    } else {
      const fallback = db.prepare('SELECT id FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id LIMIT 1')
        .get(userId) as { id: number } | undefined;
      contactId = fallback?.id ?? null;
    }

    const created = createOrderFromCart({
      userId, cartKey, contactId,
      ...(parsed.data.coupon ? { couponCode: parsed.data.coupon } : {}),
      ip: req.ip ?? '',
    });
    if (!created.ok) {
      res.status(422).json({ error: created.error });
      return;
    }

    const body: Record<string, unknown> = { data: serializeOrder(created.order.code) };

    if (parsed.data.payWith) {
      try {
        const payment = await startPayment({
          order: created.order,
          providerId: parsed.data.payWith as ProviderId,
          clientIp: req.ip ?? '',
        });
        body['payment'] = {
          provider: parsed.data.payWith,
          refCode: payment.payment.ref_code,
          amount: payment.payment.amount,
          payUrl: payment.payUrl ?? null,
          qrUrl: payment.qrUrl ?? null,
          instructions: payment.instructions ?? null,
        };
      } catch (err) {
        body['paymentError'] = err instanceof Error ? err.message : 'Khong tao duoc giao dich thanh toan';
      }
    }

    res.status(201).json(body);
  }),
);

router.get('/orders', (req, res) => {
  res.json({ data: listOrders(req.currentUser!.id, 100) });
});

router.get('/orders/:code', (req, res) => {
  const order = getOrderByCode(String(req.params.code));
  if (!order || order.user_id !== req.currentUser!.id) {
    res.status(404).json({ error: 'Khong tim thay don hang' });
    return;
  }
  res.json({ data: serializeOrder(order.code) });
});

function serializeOrder(code: string) {
  const order = getOrderByCode(code)!;
  return {
    code: order.code,
    status: order.status,
    subtotal: order.subtotal,
    discount: order.discount,
    vat: order.vat,
    total: order.total,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    items: getOrderItems(order.id).map((i) => ({
      domain: i.domain, action: i.action, years: i.years, amount: i.amount, status: i.status, error: i.error || null,
    })),
  };
}

router.get('/payment-methods', (_req, res) => {
  res.json({ data: availableProviders().map((p) => ({ id: p.id, label: p.label, description: p.description })) });
});

router.get('/cart', (req, res) => {
  res.json({ data: getCart(`user:${req.currentUser!.id}`) });
});

/* ------------------------------------------------------------- ten mien */

router.get('/domains', (req, res) => {
  res.json({
    data: listUserDomains(req.currentUser!.id).map((d) => ({
      domain: d.domain,
      status: d.status,
      registeredAt: d.registered_at,
      expiresAt: d.expires_at,
      daysLeft: daysUntilExpiry(d),
      autoRenew: d.auto_renew === 1,
      nameservers: nameserversOf(d),
    })),
  });
});

/** Nap ten mien thuoc so huu, tra 404 neu khong phai cua nguoi goi. */
function ownedOr404(req: Parameters<typeof requireApiToken>[0], res: Parameters<typeof requireApiToken>[1]) {
  const row = getOwnedDomain(String(req.params.domain ?? ''), req.currentUser!.id);
  if (!row) {
    res.status(404).json({ error: 'Khong tim thay ten mien trong tai khoan' });
    return null;
  }
  return row;
}

router.get(
  '/domains/:domain/dns',
  wrap(async (req, res) => {
    const domain = ownedOr404(req, res);
    if (!domain) return;
    const view = await listRecords(domain);
    res.json({ data: view.records, stale: view.stale, error: view.error ?? null });
  }),
);

router.post(
  '/domains/:domain/dns',
  wrap(async (req, res) => {
    const domain = ownedOr404(req, res);
    if (!domain) return;

    // Gui mang -> ghi de toan bo; gui object -> them mot ban ghi
    const body = req.body as unknown;
    if (Array.isArray(body)) {
      const parsed = z.array(dnsRecordSchema).max(200).safeParse(body);
      if (!parsed.success) {
        res.status(422).json({ error: firstError(parsed.error) });
        return;
      }
      res.json({ data: await replaceRecords(domain, parsed.data, req.currentUser!.id) });
      return;
    }

    const parsed = dnsRecordSchema.safeParse(body);
    if (!parsed.success) {
      res.status(422).json({ error: firstError(parsed.error) });
      return;
    }
    res.status(201).json({ data: await addRecord(domain, parsed.data, req.currentUser!.id) });
  }),
);

router.delete(
  '/domains/:domain/dns/:index',
  wrap(async (req, res) => {
    const domain = ownedOr404(req, res);
    if (!domain) return;
    res.json({ data: await deleteRecord(domain, Number(req.params.index), req.currentUser!.id) });
  }),
);

router.put(
  '/domains/:domain/nameservers',
  wrap(async (req, res) => {
    const domain = ownedOr404(req, res);
    if (!domain) return;

    const parsed = z.array(nameserverSchema).min(2, 'Can toi thieu 2 nameserver').max(6)
      .safeParse((req.body as { nameservers?: unknown })?.nameservers ?? req.body);
    if (!parsed.success) {
      res.status(422).json({ error: firstError(parsed.error) });
      return;
    }

    await changeNameservers(domain, parsed.data, req.currentUser!.id);
    res.json({ data: { domain: domain.domain, nameservers: parsed.data } });
  }),
);

export default router;
