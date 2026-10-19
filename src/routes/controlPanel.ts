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
import {
  ownershipRequestFor, readRegistrarContact, submitOwnershipRequest, updateContact, type ContactRow,
} from '../services/domainContact.js';
import { db } from '../db/index.js';
import { enqueue } from '../jobs/queue.js';
import { settings } from '../lib/settings.js';
import { decryptSecret } from '../lib/crypto.js';
import { docNameserver } from '../pavietnam/client.js';
import { laTenMienVn, type NameserverPA } from '../pavietnam/thamSo.js';

const router = Router();
router.use(requireAuth);

/**
 * Mat khau quan ly ten mien do he thong sinh khi dang ky qua P.A: chu ten mien
 * can de dang nhap trang quan ly cua nha dang ky. Chi hien trong Control Panel
 * cua chinh chu (route da kiem quyen so huu), khong gui qua email.
 */
function docMatKhauTenMien(enc: string): string {
  if (!enc) return '';
  try {
    return decryptSecret(enc);
  } catch {
    return '';
  }
}

/** Nap ten mien theo duong dan va kiem tra quyen so huu. */
function load(req: Parameters<typeof requireAuth>[0]) {
  const isAdmin = req.currentUser?.role === 'admin' || req.currentUser?.role === 'staff';
  return getOwnedDomain(String(req.params.domain ?? ''), req.currentUser!.id, isAdmin);
}

router.get('/', (req, res) => {
  const domains = listUserDomains(req.currentUser!.id);
  res.render('domains/list', {
    title: 'Control Panel - Tên miền của tôi',
    domains: domains.map((d) => ({ ...d, ns: nameserversOf(d), daysLeft: daysUntilExpiry(d) })),
  });
});

router.get(
  '/:domain',
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) {
      flash(req, 'error', 'Không tìm thấy tên miền trong tài khoản của bạn.');
      return res.redirect('/control-panel');
    }

    const dns = await listRecords(domain);
    const tld = getTld(domain.tld);
    const chuThe = await readRegistrarContact(domain);

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
      chuThe,
      hoSoChuThe: db.prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY is_default DESC, id')
        .all(req.currentUser!.id),
      hoSoDoiChuThe: ownershipRequestFor(domain.id),
      canHoSoDayDu: tld?.requires_vn_contact === 1,
      matKhauTenMien: docMatKhauTenMien(domain.pa_password_enc),
      dnsCanIp: laTenMienVn(domain.tld),
    });
  }),
);

router.post(
  '/:domain/nameservers',
  rateLimit({ windowMs: 60_000, max: 10 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    // Moi dong: "ten-nameserver" hoac "ten-nameserver IP". Ten mien .vn bat buoc
    // co IP voi P.A; bo trong thi he thong tu phan giai (setNameservers).
    const dongNhap = String(req.body?.nameservers ?? '')
      .split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const raw = dongNhap.map((d) => docNameserver(d));

    const invalid = dongNhap.filter((_d, i) => !raw[i] || !nameserverSchema.safeParse(raw[i]!.host).success);
    if (invalid.length) {
      flash(req, 'error', `Nameserver không hợp lệ: ${invalid.join(', ')}`);
      return res.redirect(`/control-panel/${domain.domain}`);
    }
    if (raw.length < 2) {
      flash(req, 'error', 'Cần tối thiểu 2 nameserver.');
      return res.redirect(`/control-panel/${domain.domain}`);
    }

    try {
      await changeNameservers(domain, raw as NameserverPA[], req.currentUser!.id);
      flash(req, 'success', 'Đã cập nhật nameserver. Thay đổi có thể mất 5 phút đến 24 giờ để có hiệu lực toàn cầu.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Không đổi được nameserver.');
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
      flash(req, 'error', Object.values(fieldErrors(parsed.error))[0] ?? 'Bản ghi không hợp lệ');
      return res.redirect(`/control-panel/${domain.domain}`);
    }

    try {
      await addRecord(domain, parsed.data, req.currentUser!.id);
      flash(req, 'success', 'Đã thêm bản ghi DNS.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Không thêm được bản ghi.');
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
      flash(req, 'error', Object.values(fieldErrors(parsed.error))[0] ?? 'Bản ghi không hợp lệ');
      return res.redirect(`/control-panel/${domain.domain}`);
    }

    try {
      await updateRecord(domain, Number(req.params.index), parsed.data, req.currentUser!.id);
      flash(req, 'success', 'Đã cập nhật bản ghi DNS.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Không sửa được bản ghi.');
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
      flash(req, 'success', 'Đã xóa bản ghi DNS.');
    } catch (err) {
      flash(req, 'error', err instanceof Error ? err.message : 'Không xóa được bản ghi.');
    }
    res.redirect(`/control-panel/${domain.domain}`);
  }),
);

router.post('/:domain/tu-dong-gia-han', (req, res) => {
  const domain = load(req);
  if (!domain) return res.redirect('/control-panel');
  const enabled = String(req.body?.auto_renew ?? '') === '1';
  setAutoRenew(domain.id, enabled);
  flash(req, 'success', enabled ? 'Đã bật gia hạn tự động.' : 'Đã tắt gia hạn tự động.');
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
  flash(req, 'success', `Đã thêm lệnh gia hạn ${domain.domain} (${years} năm) vào giỏ hàng.`);
  res.redirect('/gio-hang');
});

/* ------------------------------------------------ thong tin chu the */

router.post(
  '/:domain/chu-the',
  rateLimit({ windowMs: 60_000, max: 10 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const contactId = Number(req.body?.contact_id) || 0;
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?')
      .get(contactId, req.currentUser!.id) as ContactRow | undefined;

    if (!contact) {
      flash(req, 'error', 'Hồ sơ chủ thể không hợp lệ.');
      return res.redirect(`/control-panel/${domain.domain}#chu-the`);
    }

    const outcome = await updateContact(domain, contact, { userId: req.currentUser!.id, ip: req.ip ?? '' });
    if (outcome.status === 'ok') {
      flash(req, 'success', 'Đã cập nhật thông tin liên hệ chủ thể tại nhà đăng ký.');
    } else {
      flash(req, 'error', outcome.message);
    }
    res.redirect(`/control-panel/${domain.domain}#chu-the`);
  }),
);

/** Nop ho so xin doi chu the (thu tuc phap ly, quan tri vien xu ly). */
router.post(
  '/:domain/doi-chu-the',
  rateLimit({ windowMs: 3600_000, max: 5 }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const result = submitOwnershipRequest({
      domain,
      newContactId: Number(req.body?.new_contact_id) || 0,
      reason: String(req.body?.reason ?? ''),
      userId: req.currentUser!.id,
      ip: req.ip ?? '',
    });

    if (result.ok) {
      flash(req, 'success', `Đã nhận hồ sơ đổi chủ thể (mã #${result.id}). Bộ phận nghiệp vụ sẽ liên hệ hướng dẫn giấy tờ cần nộp.`);
    } else {
      flash(req, 'error', result.error);
    }
    res.redirect(`/control-panel/${domain.domain}#chu-the`);
  }),
);

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
          ? 'Đã khóa chuyển đổi. Tên miền không thể bị chuyển sang nhà đăng ký khác.'
          : 'Đã mở khóa chuyển đổi. Nên khóa lại ngay sau khi xong việc.',
      );
    }
    res.redirect(`/control-panel/${domain.domain}#chuyen-di`);
  }),
);

router.post(
  '/:domain/ma-chuyen-doi',
  rateLimit({ windowMs: 15 * 60_000, max: 5, message: 'Bạn lấy mã chuyển đổi quá nhiều lần. Vui lòng thử lại sau.' }),
  wrap(async (req, res) => {
    const domain = load(req);
    if (!domain) return res.redirect('/control-panel');

    const outcome = await requestAuthCode(domain, { userId: req.currentUser!.id, ip: req.ip ?? '' });

    if (outcome.status === 'ok') {
      // Ma chi hien MOT lan qua flash, khong luu vao CSDL cua he thong
      flash(req, 'success', `Mã chuyển đổi (EPP) của ${domain.domain}: ${outcome.authCode}`);
      flash(req, 'info', 'Sao chép ngay - mã này chỉ hiện một lần. Chúng tôi đã gửi email cảnh báo về tài khoản của bạn.');
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
  flash(req, 'info', 'Đang đồng bộ thông tin từ nhà đăng ký, vui lòng tải lại trang sau vài giây.');
  res.redirect(`/control-panel/${domain.domain}`);
});

export default router;
