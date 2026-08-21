/**
 * CONTROL PANEL cua khach hang: quan ly ten mien da mua.
 *  - Tong quan: trang thai, ngay het han, nameserver
 *  - Quan ly ban ghi DNS (A / AAAA / CNAME / MX / TXT / NS / SRV / CAA)
 *  - Doi nameserver
 *  - Bat/tat gia han tu dong, dat lenh gia han
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { flash } from '../middleware/session.js';
import { wrap } from '../middleware/error.js';
import { rateLimit } from '../middleware/ratelimit.js';
import {
  daysUntilExpiry, getOwnedDomain, listUserDomains, nameserversOf, setAutoRenew,
} from '../services/domainRepo.js';
import { addRecord, changeNameservers, deleteRecord, listRecords, RECORD_PRESETS, updateRecord } from '../services/dns.js';
import { dnsRecordSchema, fieldErrors, nameserverSchema } from '../lib/validate.js';
import { getTld, priceFor } from '../services/pricing.js';
import { addToCart } from '../services/cart.js';
import { lookupWhois } from '../services/domains.js';
import { changeTransferLock, requestAuthCode } from '../services/transferOut.js';
import { enqueue } from '../jobs/queue.js';
import { settings } from '../lib/settings.js';

const router = Router();
router.use(requireAuth);

/** Nap ten mien theo duong dan va kiem tra quyen so huu. */
function load(req: Parameters<typeof requireAuth>[0]) {
  const isAdmin = req.currentUser?.role === 'admin' || req.currentUser?.role === 'staff';
  return getOwnedDomain(String(req.params.domain ?? ''), req.currentUser!.id, isAdmin);
}

router.get('/', (req, res) => {
  const domains = listUserDomains(req.currentUser!.id);
  res.render('domains/list', {
    title: 'Control Panel - Ten mien cua toi',
    domains: domains.map((d) => ({ ...d, ns: nameserversOf(d), daysLeft: daysUntilExpiry(d) })),
  });
});

router.get(
  '/:domain',
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) {
      flash(req, 'error', 'Khong tim thay ten mien trong tai khoan cua ban.');
      return res.redirect('/control-panel');
    }

    const dns = await listRecords(domain);
    const tld = getTld(domain.tld);

    res.render('domains/detail', {
      title: `Control Panel - ${domain.domain}`,
      domain,
      ns: nameserversOf(domain),
      defaultNs: settings.dns().defaultNameservers,
      daysLeft: daysUntilExpiry(domain),
      dns,
      presets: RECORD_PRESETS,
      renewPrice: tld ? priceFor(tld, 'renew', 1) : null,
      recordErrors: {},
    });
  }),
);

router.post(
  '/:domain/nameservers',
  rateLimit({ windowMs: 60_000, max: 10 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const raw = String(req.body?.nameservers ?? '')
      .split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

    const invalid = raw.filter((ns) => !nameserverSchema.safeParse(ns).success);
    if (invalid.length) {
      flash(req, 'error', `Nameserver khong hop le: ${invalid.join(', ')}`);
      return res.redirect(`/control-panel/${domain.domain}`);
    }
    if (raw.length < 2) {
      flash(req, 'error', 'Can toi thieu 2 nameserver.');
      return res.redirect(`/control-panel/${domain.domain}`);
    }

    try {
      await changeNameservers(domain, raw, req.currentUser!.id);
      flash(req, 'success', 'Da cap nhat nameserver. Thay doi co the mat 5 phut den 24 gio de co hieu luc toan cau.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Khong doi duoc nameserver.');
    }
    res.redirect(`/control-panel/${domain.domain}`);
  }),
);

router.post(
  '/:domain/dns/them',
  rateLimit({ windowMs: 60_000, max: 30 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const parsed = dnsRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      flash(req, 'error', Object.values(fieldErrors(parsed.error))[0] ?? 'Ban ghi khong hop le');
      return res.redirect(`/control-panel/${domain.domain}`);
    }

    try {
      await addRecord(domain, parsed.data, req.currentUser!.id);
      flash(req, 'success', 'Da them ban ghi DNS.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Khong them duoc ban ghi.');
    }
    res.redirect(`/control-panel/${domain.domain}`);
  }),
);

router.post(
  '/:domain/dns/sua/:index',
  rateLimit({ windowMs: 60_000, max: 30 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const parsed = dnsRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      flash(req, 'error', Object.values(fieldErrors(parsed.error))[0] ?? 'Ban ghi khong hop le');
      return res.redirect(`/control-panel/${domain.domain}`);
    }

    try {
      await updateRecord(domain, Number(req.params.index), parsed.data, req.currentUser!.id);
      flash(req, 'success', 'Da cap nhat ban ghi DNS.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Khong sua duoc ban ghi.');
    }
    res.redirect(`/control-panel/${domain.domain}`);
  }),
);

router.post(
  '/:domain/dns/xoa/:index',
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    try {
      await deleteRecord(domain, Number(req.params.index), req.currentUser!.id);
      flash(req, 'success', 'Da xoa ban ghi DNS.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Khong xoa duoc ban ghi.');
    }
    res.redirect(`/control-panel/${domain.domain}`);
  }),
);

router.post('/:domain/tu-dong-gia-han', (req, res) => {
  const domain = load(req);
  if (!domain) return res.redirect('/control-panel');
  const enabled = String(req.body?.auto_renew ?? '') === '1';
  setAutoRenew(domain.id, enabled);
  flash(req, 'success', enabled ? 'Da bat gia han tu dong.' : 'Da tat gia han tu dong.');
  res.redirect(`/control-panel/${domain.domain}`);
});

/** Dat lenh gia han: them vao gio hang roi chuyen sang thanh toan. */
router.post('/:domain/gia-han', (req, res) => {
  const domain = load(req);
  if (!domain) return res.redirect('/control-panel');

  const years = Math.max(1, Math.min(10, Number(req.body?.years ?? 1) || 1));
  const result = addToCart({
    cartKey: req.cartKey,
    userId: req.currentUser!.id,
    domain: domain.domain,
    action: 'renew',
    years,
  });

  if (!result.ok) {
    flash(req, 'error', result.error);
    return res.redirect(`/control-panel/${domain.domain}`);
  }
  flash(req, 'success', `Da them lenh gia han ${domain.domain} (${years} nam) vao gio hang.`);
  res.redirect('/gio-hang');
});

/* ------------------------------------------------- chuyen ten mien di */

router.post(
  '/:domain/khoa-chuyen-doi',
  rateLimit({ windowMs: 60_000, max: 10 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const khoa = String(req.body?.locked ?? '') === '1';
    const result = await changeTransferLock(domain, khoa, { userId: req.currentUser!.id, ip: req.ip ?? '' });

    if (!result.ok) {
      flash(req, 'error', result.error);
    } else {
      flash(
        req,
        'success',
        khoa
          ? 'Da khoa chuyen doi. Ten mien khong the bi chuyen sang nha dang ky khac.'
          : 'Da mo khoa chuyen doi. Nen khoa lai ngay sau khi xong viec.',
      );
    }
    res.redirect(`/control-panel/${domain.domain}#chuyen-di`);
  }),
);

router.post(
  '/:domain/ma-chuyen-doi',
  rateLimit({ windowMs: 15 * 60_000, max: 5, message: 'Ban lay ma chuyen doi qua nhieu lan. Vui long thu lai sau.' }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const outcome = await requestAuthCode(domain, { userId: req.currentUser!.id, ip: req.ip ?? '' });

    if (outcome.status === 'ok') {
      // Ma chi hien MOT lan qua flash, khong luu vao CSDL cua he thong
      flash(req, 'success', `Ma chuyen doi (EPP) cua ${domain.domain}: ${outcome.authCode}`);
      flash(req, 'info', 'Sao chep ngay - ma nay chi hien mot lan. Chung toi da gui email canh bao ve tai khoan cua ban.');
    } else {
      flash(req, 'error', outcome.message);
    }
    res.redirect(`/control-panel/${domain.domain}#chuyen-di`);
  }),
);

router.get(
  '/:domain/whois',
  rateLimit({ windowMs: 60_000, max: 20 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');
    const result = await lookupWhois(domain.domain);
    res.render('whois', { title: `WHOIS ${domain.domain}`, domain: domain.domain, result });
  }),
);

/** Dong bo lai thong tin tu P.A (ngay het han, nameserver). */
router.post('/:domain/dong-bo', (req, res) => {
  const domain = load(req);
  if (!domain) return res.redirect('/control-panel');
  enqueue('sync_domain', { domain: domain.domain }, { dedupeKey: `sync:${domain.domain}` });
  flash(req, 'info', 'Dang dong bo thong tin tu nha dang ky, vui long tai lai trang sau vai giay.');
  res.redirect(`/control-panel/${domain.domain}`);
});

export default router;
