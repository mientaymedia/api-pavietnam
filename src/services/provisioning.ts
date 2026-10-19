/**
 * Cap phat tu dong: bien mot don hang DA THANH TOAN thanh ten mien hoat dong.
 *
 * Nguyen tac an toan:
 *  1. Truoc khi goi API dang ky, dong don hang duoc dat sang 'processing' trong
 *     mot transaction -> hai tien trinh khong the cung dang ky mot ten mien.
 *  2. Moi buoc deu idempotent: chay lai job da hoan tat se khong dang ky lan hai.
 *  3. Ket qua P.A doc theo bang phan loai ma (src/pavietnam/maLoi.ts):
 *     - thieu quy (400, hoac so du kiem truoc khong du): GIU don cho nap quy,
 *       khong hoan tien, job 5 phut tu dang ky lai
 *     - can nguoi xu ly (606 da tru tien, 302 tam khoa, sai cau hinh dai ly) va
 *       sai ho so (2xxx, 6020-6025): GIU don, bao quan tri, khong hoan tu dong
 *     - da co chu / ten khong hop le: that bai vinh vien, hoan tien nhu cu
 *     - tam thoi (mang, loi he thong P.A): thu lai; qua 3 lan thi giu cho nguoi
 *       xem chu khong hoan, vi lenh het gio cho co the P.A da lam xong
 *  Dong bi giu van o 'pending' (cot `hold`), nen khach thay don "dang xu ly".
 */
import { db, nowIso, parseJson, tx } from '../db/index.js';
import { log } from '../lib/logger.js';
import {
  checkOwned, getBalance, getDomainDates, registerDomain, renewDomain, setNameservers, transferDomain,
} from '../pavietnam/client.js';
import { phanLoaiMa, type NhomMa } from '../pavietnam/maLoi.js';
import { RegistrarError, type RegisterContact, type RegisterResult } from '../pavietnam/types.js';
import { settings } from '../lib/settings.js';
import { clearCheckCache } from './domains.js';
import { getOrder, getOrderItems, orderContactId, refreshOrderStatus, type Order, type OrderItem } from './orders.js';
import { sendDomainActivated, sendProvisionFailed, sendTransferSubmitted, userEmail } from './notifications.js';
import { audit } from './audit.js';
import { enqueue } from '../jobs/queue.js';
import { upsertDomainFromProvider } from './domainRepo.js';
import { autoRefundEnabled, refundOrderItem } from './refunds.js';
import { boDau } from '../lib/text.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { sinhMatKhauTenMien } from '../pavietnam/thamSo.js';
import { loiHoSoPA, type ContactRow } from './domainContact.js';
import { canTien, type LoaiGiu } from './choQuy.js';
import { phatSuKien } from './suKienDon.js';
import './kenhSuKien.js';

/**
 * Loi khong the khac phuc bang cach thu lai, voi loi KHONG co ReturnCode (gia
 * lap, lenh ngoai tai lieu). Viet ASCII khong dau va so tren chu da boDau: P.A
 * tra chu co dau ("đã được đăng ký") cung phai khop.
 */
const PERMANENT_PATTERNS = [
  /da\s*(duoc\s*)?dang\s*ky/i,
  /already\s+(registered|exists|taken)/i,
  /not\s+available/i,
  /unavailable/i,
  /invalid\s+domain/i,
  /reserved/i,
  /khong\s+du\s+so\s+du/i,
  /insufficient\s+(funds|balance)/i,
];

export function isPermanent(message: string): boolean {
  const chu = boDau(message);
  return PERMANENT_PATTERNS.some((re) => re.test(chu));
}

/** Nhom cua mot loi khi cap phat: uu tien nhom tu ReturnCode, roi moi doan theo chu. */
export function nhomLoi(err: unknown): NhomMa {
  if (err instanceof RegistrarError) {
    if (err.nhom) return err.nhom;
    if (/^\d+$/.test(err.code)) return phanLoaiMa(Number(err.code));
    if (isPermanent(err.message)) return 'vinh_vien';
  }
  return 'tam_thoi';
}

const NHOM_GIU: Partial<Record<NhomMa, LoaiGiu>> = {
  thieu_quy: 'cho_nap_quy',
  nguoi_xu_ly: 'can_nguoi_xu_ly',
  du_lieu: 'sai_ho_so',
};

export interface ProvisionSummary {
  orderId: number;
  processed: number;
  succeeded: number;
  failed: number;
}

/** Cap phat toan bo cac dong cua mot don hang. */
export async function provisionOrder(orderId: number): Promise<ProvisionSummary> {
  const order = getOrder(orderId);
  if (!order) throw new Error(`Không tìm thấy đơn hàng #${orderId}`);
  if (order.status === 'pending_payment') {
    throw new Error(`Đơn hàng ${order.code} chưa thanh toán, không thể cấp phát`);
  }

  const summary: ProvisionSummary = { orderId, processed: 0, succeeded: 0, failed: 0 };
  for (const item of getOrderItems(orderId)) {
    // Dong dang giu chi chay lai qua kich hoat (cho quy) hoac quan tri bam thu lai
    if (item.status === 'active' || item.status === 'failed' || item.hold) continue;
    summary.processed++;
    const ok = await provisionItem(item.id);
    if (ok) summary.succeeded++;
    else summary.failed++;
  }

  refreshOrderStatus(orderId);
  log.info('order_provisioned', { code: order.code, ...summary });
  return summary;
}

/**
 * Cap phat mot dong don hang.
 * @returns true neu dong da o trang thai 'active' sau khi chay.
 */
export async function provisionItem(itemId: number): Promise<boolean> {
  // Buoc 1: gianh quyen xu ly (atomic) - chan chay trung
  const claimed = tx((): OrderItem | null => {
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as OrderItem | undefined;
    if (!item) return null;
    if (item.status !== 'pending' || item.hold) return null; // da xong, dang chay, that bai hoac dang giu
    db.prepare(`UPDATE order_items SET status='processing', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending' AND hold=''`)
      .run(nowIso(), itemId);
    const after = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId) as OrderItem;
    return after.status === 'processing' ? after : null;
  });

  if (!claimed) {
    const current = db.prepare('SELECT status FROM order_items WHERE id = ?').get(itemId) as { status: string } | undefined;
    return current?.status === 'active';
  }

  const order = getOrder(claimed.order_id);
  if (!order) {
    markItemFailed(claimed, 'Không tìm thấy đơn hàng');
    return false;
  }

  try {
    if (claimed.action === 'renew') {
      if (!(await duQuy(order, claimed))) return false;
      await doRenew(order, claimed);
    } else if (claimed.action === 'transfer') {
      await doTransfer(order, claimed);
    } else {
      const loiHoSo = kiemHoSo(order, claimed);
      if (loiHoSo) {
        await giuDong(order, claimed, 'sai_ho_so', loiHoSo, '');
        return false;
      }
      if (!(await duQuy(order, claimed))) return false;
      await doRegister(order, claimed);
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof RegistrarError ? err.code : '';
    let nhom = nhomLoi(err);

    // 101/303 o lan thu thu hai tro di: lan truoc co the da dang ky duoc nhung
    // het gio cho phan hoi. Hoi check_domain truoc khi coi la "da co chu".
    if (nhom === 'vinh_vien' && claimed.action === 'register' && claimed.attempts > 1 && ['101', '303'].includes(code)) {
      try {
        if ((await checkOwned(claimed.domain)).state === 1) {
          await doRegister(order, claimed, { daCo: true });
          return true;
        }
      } catch (e2) {
        log.warn('kiem_check_domain_loi', { domain: claimed.domain, error: String(e2) });
        nhom = 'nguoi_xu_ly'; // khong chac: de nguoi xem, khong hoan
      }
    }

    const giu = NHOM_GIU[nhom];
    if (giu) {
      await giuDong(order, claimed, giu, message, code);
      return false;
    }

    if (nhom === 'vinh_vien') {
      markItemFailed(claimed, message, code);
      await sendProvisionFailed({
        userId: order.user_id,
        email: userEmail(order.user_id),
        domain: claimed.domain,
        orderCode: order.code,
        error: message,
      });

      // Khach da tra tien nhung khong nhan duoc ten mien -> tra lai ngay.
      // Tat trong cau hinh neu doanh nghiep muon duyet tay tung truong hop.
      if (autoRefundEnabled()) {
        const refund = await refundOrderItem(claimed.id, {
          reason: `Đăng ký không thành công: ${message.slice(0, 200)}`,
        });
        if (refund.status === 'refunded') {
          log.info('auto_refund_done', { domain: claimed.domain, amount: refund.amount });
        }
      }

      refreshOrderStatus(order.id);
      return false;
    }

    // Loi tam thoi qua 3 lan: giu cho nguoi xem, KHONG hoan (co the da tru tien)
    if (claimed.attempts >= 3) {
      await giuDong(order, claimed, 'can_nguoi_xu_ly', `Lỗi lặp lại ${claimed.attempts} lần: ${message}`, code);
      return false;
    }

    // Loi tam thoi: tra ve 'pending' de hang doi thu lai
    db.prepare(`UPDATE order_items SET status='pending', error=?, pa_code=?, updated_at=? WHERE id=?`)
      .run(message.slice(0, 500), code.slice(0, 20), nowIso(), claimed.id);
    log.warn('provision_item_retry', { itemId, domain: claimed.domain, attempt: claimed.attempts, error: message });
    throw err; // de job queue lap lich thu lai
  }
}

/**
 * Kiem so du dai ly (check_account_still) truoc khi dang ky / gia han. Khong
 * du thi giu dong cho nap quy va tra false. Doc so du loi thi nem loi theo
 * nhom ma (vd 501 IP chua phep -> can nguoi xu ly).
 */
async function duQuy(order: Order, item: OrderItem): Promise<boolean> {
  const b = await getBalance();
  if (!b.ok) {
    const nhom = b.returnCode !== null && b.returnCode !== undefined ? phanLoaiMa(b.returnCode) : 'tam_thoi';
    throw new RegistrarError(`Không đọc được số dư đại lý: ${b.message}`, b.code, b.raw, nhom);
  }
  const can = canTien(item);
  if (b.balance >= can) return true;
  await giuDong(order, item, 'cho_nap_quy', `Số dư đại lý ${b.balance} đồng, cần ${can} đồng`, '400');
  return false;
}

/** Ho so chu the con thieu gi so voi yeu cau P.A cho duoi nay (chua goi P.A). */
function kiemHoSo(order: Order, item: OrderItem): string {
  const id = orderContactId(order);
  const row = id ? (db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow | undefined) : undefined;
  if (!row) return 'Thiếu hồ sơ chủ thể để đăng ký tên miền';
  const loi = loiHoSoPA(row, item.tld);
  return loi.length ? `Hồ sơ chủ thể chưa đủ: ${loi.join('; ')}` : '';
}

/**
 * Giu dong o 'pending' voi ly do, bao quan tri MOT lan khi dong moi bi giu
 * (job 5 phut chay lai khong gui lap).
 */
async function giuDong(order: Order, item: OrderItem, hold: LoaiGiu, message: string, code: string): Promise<void> {
  const truoc = db.prepare('SELECT hold FROM order_items WHERE id = ?').get(item.id) as { hold: string } | undefined;
  db.prepare(
    `UPDATE order_items SET status='pending', hold=?, hold_since=COALESCE(hold_since, ?), error=?, pa_code=?, updated_at=? WHERE id=?`,
  ).run(hold, nowIso(), message.slice(0, 500), code.slice(0, 20), nowIso(), item.id);
  refreshOrderStatus(order.id);
  log.warn('provision_item_held', { itemId: item.id, domain: item.domain, hold, code, error: message });
  if (truoc?.hold === hold) return;
  audit({ userId: null, action: 'order_item.held', entity: 'order', entityId: order.id, meta: { domain: item.domain, hold, code } });
  await phatSuKien({
    loai: hold === 'cho_nap_quy' ? 'cho_quy' : hold,
    orderId: order.id, orderCode: order.code, userId: order.user_id, itemId: item.id, domain: item.domain,
    maPA: code, loi: message, soTien: canTien(item),
  });
}

/** Ngay het han that tu P.A sau khi dang ky / gia han; khong doc duoc thi tra undefined. */
async function ngayTuPA(domain: string): Promise<{ registeredAt?: string; expiresAt?: string }> {
  try {
    const n = await getDomainDates(domain);
    return { ...(n.registeredAt ? { registeredAt: n.registeredAt } : {}), ...(n.expiresAt ? { expiresAt: n.expiresAt } : {}) };
  } catch (err) {
    // Che do thu: ten mien chua dang ky that nen P.A khong co ngay. Khong chan cap phat.
    log.warn('get_date_domain_loi', { domain, error: String(err) });
    return {};
  }
}

/** Ghi ket qua giao dich P.A vao dong don (trans_id, so tien bi tru, che do thu). */
function ghiGiaoDich(item: OrderItem, result: Pick<RegisterResult, 'providerRef' | 'transMoney' | 'endpointThu' | 'returnCode'>) {
  const meta = parseJson<Record<string, unknown>>(item.meta, {});
  if (result.endpointThu) meta['paThu'] = true; // 900: chua dang ky that
  db.prepare(`UPDATE order_items SET pa_trans_id=?, pa_trans_money=?, pa_code=?, meta=?, updated_at=? WHERE id=?`)
    .run(result.providerRef, result.transMoney, String(result.returnCode ?? ''), JSON.stringify(meta), nowIso(), item.id);
}

async function doRegister(order: Order, item: OrderItem, opts: { daCo?: boolean } = {}): Promise<void> {
  const contact = loadContact(order);
  if (!contact) throw new RegistrarError('Thiếu hồ sơ chủ thể để đăng ký tên miền', 'NO_CONTACT', '', 'du_lieu');

  const ns = settings.dns().defaultNameservers;
  const matKhau = matKhauCuaDong(item);
  // daCo: check_domain xac nhan lan dang ky truoc da thanh cong, khong goi lai
  const result = opts.daCo
    ? null
    : await registerDomain({ domain: item.domain, tld: item.tld, years: item.years, contact, nameservers: ns, password: matKhau });
  if (result) ghiGiaoDich(item, result);
  const ngay = result?.endpointThu ? {} : await ngayTuPA(item.domain);

  const domainId = upsertDomainFromProvider({
    userId: order.user_id,
    contactId: order.contact_id,
    domain: item.domain,
    tld: item.tld,
    status: 'active',
    providerRef: result?.providerRef ?? '',
    nameservers: ns,
    registeredAt: ngay.registeredAt ?? nowIso(),
    expiresAt: ngay.expiresAt ?? addYearsIso(nowIso(), item.years),
  });
  db.prepare('UPDATE domains SET pa_password_enc = ? WHERE id = ?').run(encryptSecret(matKhau), domainId);

  db.prepare(`UPDATE order_items SET status='active', domain_id=?, provider_ref=?, error='', updated_at=? WHERE id=?`)
    .run(domainId, result?.providerRef ?? '', nowIso(), item.id);

  clearCheckCache(item.domain);
  audit({
    userId: order.user_id, action: 'domain.register', entity: 'domain', entityId: domainId,
    meta: { domain: item.domain, years: item.years, ...(result?.endpointThu ? { cheDoThu: true } : {}), ...(opts.daCo ? { xacNhanCheckDomain: true } : {}) },
  });

  const domainRow = db.prepare('SELECT expires_at, nameservers FROM domains WHERE id = ?').get(domainId) as
    | { expires_at: string | null; nameservers: string }
    | undefined;

  await phatSuKien({
    loai: 'dang_ky_xong', orderId: order.id, orderCode: order.code, userId: order.user_id, itemId: item.id,
    domain: item.domain, expiresAt: domainRow?.expires_at ?? null, maPA: String(result?.returnCode ?? ''),
  });

  await sendDomainActivated({
    userId: order.user_id,
    email: userEmail(order.user_id),
    domain: item.domain,
    expiresAt: domainRow?.expires_at ?? null,
    nameservers: JSON.parse(domainRow?.nameservers ?? '[]') as string[],
    years: item.years,
  });
}

async function doRenew(order: Order, item: OrderItem): Promise<void> {
  const result = await renewDomain(item.domain, item.years);
  ghiGiaoDich(item, result);

  const existing = db.prepare('SELECT * FROM domains WHERE domain = ? COLLATE NOCASE').get(item.domain) as
    | { id: number; expires_at: string | null }
    | undefined;

  // Ngay het han moi doc lai tu P.A; che do thu thi P.A chua gia han that
  const ngay = result.endpointThu ? {} : await ngayTuPA(item.domain);
  const newExpiry = ngay.expiresAt ?? addYearsIso(existing?.expires_at ?? nowIso(), item.years);
  const domainId = upsertDomainFromProvider({
    userId: order.user_id,
    contactId: order.contact_id,
    domain: item.domain,
    tld: item.tld,
    status: 'active',
    providerRef: result.providerRef,
    expiresAt: newExpiry,
  });

  db.prepare(`UPDATE order_items SET status='active', domain_id=?, provider_ref=?, error='', updated_at=? WHERE id=?`)
    .run(domainId, result.providerRef, nowIso(), item.id);

  audit({ userId: order.user_id, action: 'domain.renew', entity: 'domain', entityId: domainId, meta: { domain: item.domain, years: item.years, expiresAt: newExpiry } });
  await phatSuKien({
    loai: 'dang_ky_xong', orderId: order.id, orderCode: order.code, userId: order.user_id, itemId: item.id,
    domain: item.domain, expiresAt: newExpiry, maPA: String(result.returnCode ?? ''),
  });

  // Gia han TU DONG da co email rieng ("da tru vi va gia han") - khong gui trung
  if (parseJson<{ autoRenew?: boolean }>(item.meta, {}).autoRenew) return;

  await sendDomainActivated({
    userId: order.user_id,
    email: userEmail(order.user_id),
    domain: item.domain,
    expiresAt: newExpiry,
    nameservers: [],
    years: item.years,
  });
}

/**
 * Chuyen ten mien ve (transfer-in).
 *
 * Khac dang ky moi o hai diem quan trong:
 *  - Can ma EPP (luu trong `order_items.meta` tu luc them vao gio hang)
 *  - Nha dang ky thuong chi TIEP NHAN yeu cau; ten mien ve thuc su sau 5-7 ngay.
 *    Vi vay ten mien duoc ghi trang thai `pending` chu khong phai `active`, va
 *    duoc xep lich dong bo lai de cap nhat khi hoan tat.
 * Tai lieu P.A khong co lenh chuyen ve: o che do that `transferDomain` bao
 * UNSUPPORTED (nhom can nguoi xu ly), dong duoc giu cho quan tri lam tay.
 */
async function doTransfer(order: Order, item: OrderItem): Promise<void> {
  const meta = parseJson<{ authCode?: string }>(item.meta, {});
  const authCode = (meta.authCode ?? '').trim();
  if (!authCode) {
    throw new RegistrarError('Thiếu mã xác thực (EPP/Auth Code) để chuyển tên miền', 'NO_AUTH_CODE', '', 'du_lieu');
  }

  const contact = loadContact(order);
  const result = await transferDomain({
    domain: item.domain,
    years: item.years,
    authCode,
    ...(contact ? { contact } : {}),
  });

  const domainId = upsertDomainFromProvider({
    userId: order.user_id,
    contactId: order.contact_id,
    domain: item.domain,
    tld: item.tld,
    status: 'pending', // cho nha dang ky cu duyet
    providerRef: result.providerRef,
    ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
  });

  db.prepare(`UPDATE order_items SET status='active', domain_id=?, provider_ref=?, error='', updated_at=? WHERE id=?`)
    .run(domainId, result.providerRef, nowIso(), item.id);

  audit({
    userId: order.user_id, action: 'domain.transfer', entity: 'domain', entityId: domainId,
    meta: { domain: item.domain, years: item.years },
  });

  // Kiem tra lai sau 6 gio de cap nhat trang thai khi ben cu da duyet
  enqueue('sync_domain', { domain: item.domain }, {
    delayMs: 6 * 3600_000,
    dedupeKey: `sync:${item.domain}`,
  });

  await sendTransferSubmitted({
    userId: order.user_id,
    email: userEmail(order.user_id),
    domain: item.domain,
    orderCode: order.code,
  });
}

/**
 * Mat khau quan ly ten mien cua dong don: sinh MOT lan, luu ma hoa trong meta,
 * thu lai dung lai dung mat khau do (P.A co the da nhan lan truoc).
 */
export function matKhauCuaDong(item: OrderItem): string {
  const meta = parseJson<Record<string, unknown>>(item.meta, {});
  if (typeof meta['paPasswordEnc'] === 'string') {
    try {
      return decryptSecret(meta['paPasswordEnc']);
    } catch {
      // khoa ma hoa doi: sinh lai (lan dang ky truoc chac chan chua thanh cong)
    }
  }
  const mk = sinhMatKhauTenMien();
  meta['paPasswordEnc'] = encryptSecret(mk);
  db.prepare('UPDATE order_items SET meta = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(meta), nowIso(), item.id);
  item.meta = JSON.stringify(meta);
  return mk;
}

function markItemFailed(item: OrderItem, error: string, code = ''): void {
  db.prepare(`UPDATE order_items SET status='failed', error=?, pa_code=?, updated_at=? WHERE id=?`)
    .run(error.slice(0, 500), code.slice(0, 20), nowIso(), item.id);
  log.error('provision_item_failed', { itemId: item.id, domain: item.domain, error });
}

function loadContact(order: Order): RegisterContact | null {
  const id = orderContactId(order);
  if (!id) return null;
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    kind: row['kind'] === 'organization' ? 'organization' : 'individual',
    fullName: row['full_name'] ?? '',
    orgName: row['org_name'] ?? '',
    idNumber: row['id_number'] ?? '',
    taxCode: row['tax_code'] ?? '',
    email: row['email'] ?? '',
    phone: row['phone'] ?? '',
    address: row['address'] ?? '',
    ward: row['ward'] ?? '',
    city: row['city'] ?? '',
    province: row['province'] ?? '',
    postalCode: row['postal_code'] ?? '',
    country: row['country'] ?? 'VN',
    birthDate: row['birth_date'] ?? '',
    gender: row['gender'] ?? '',
  };
}

/** Cong them so nam vao moc thoi gian ISO. */
export function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowIso();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Dat nameserver mac dinh cho ten mien vua dang ky (goi rieng neu API yeu cau buoc 2). */
export async function applyDefaultNameservers(domain: string): Promise<void> {
  const ns = settings.dns().defaultNameservers;
  if (ns.length < 2) return;
  await setNameservers(domain, ns);
}
