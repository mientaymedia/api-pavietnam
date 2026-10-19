/**
 * Thong tin chu the ten mien.
 *
 * PHAN BIET HAI VIEC - day la diem hay bi lam sai:
 *
 *  1. SUA THONG TIN LIEN HE (email, dien thoai, dia chi cua CUNG mot chu the)
 *     -> Goi API duoc ngay. Ham `updateContact()` ben duoi.
 *
 *  2. DOI CHU THE (sang nguoi/to chuc KHAC)
 *     -> Voi .vn: thu tuc phap ly theo quy dinh VNNIC, can ban khai co dau/chu ky
 *        va giay to phap nhan, don vi dang ky xu ly - KHONG phai mot lenh API.
 *     -> Voi ten mien quoc te: doi chu the thuong keo theo khoa chuyen doi 60 ngay
 *        va can xac nhan tu ca chu cu lan chu moi theo quy dinh ICANN.
 *     Vi vay he thong nhan HO SO YEU CAU (`ownership_requests`) roi quan tri vien
 *     xu ly thu cong, thay vi gia vo rang no tu dong.
 */
import { db, nowIso, parseJson } from '../db/index.js';
import { log } from '../lib/logger.js';
import { getDomainContact, updateDomainContact } from '../pavietnam/client.js';
import type { RegisterContact } from '../pavietnam/types.js';
import { getTld } from './pricing.js';
import { audit } from './audit.js';
import { sendContactUpdated, sendOwnershipRequestStatus, userEmail } from './notifications.js';
import type { DomainRow } from './domainRepo.js';
import { timPhuong, timTinh } from '../lib/diaGioi.js';
import {
  MAU_GIAY_TO, MAU_MA_SO_THUE, chuanHoaGioiTinh, diaChiHopLe, ngaySinhHopLe,
} from '../lib/validate.js';
import { chuanHoaDienThoai, laTenMienVn } from '../pavietnam/thamSo.js';

export interface ContactRow {
  id: number; user_id: number; kind: string; full_name: string; org_name: string;
  id_number: string; tax_code: string; email: string; phone: string; address: string;
  ward: string; city: string; province: string; postal_code: string; country: string;
  birth_date: string; gender: string;
}

export function toRegisterContact(row: ContactRow): RegisterContact {
  return {
    kind: row.kind === 'organization' ? 'organization' : 'individual',
    fullName: row.full_name,
    orgName: row.org_name,
    idNumber: row.id_number,
    taxCode: row.tax_code,
    email: row.email,
    phone: row.phone,
    address: row.address,
    ward: row.ward ?? '',
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    country: row.country,
    birthDate: row.birth_date,
    gender: row.gender,
  };
}

/** Doc thong tin chu the tu nha dang ky (co the that bai - khong chan giao dien). */
export async function readRegistrarContact(domain: DomainRow): Promise<{ contact: Record<string, string>; error?: string }> {
  try {
    const res = await getDomainContact(domain.domain);
    return { contact: res.contact };
  } catch (err) {
    return { contact: {}, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Kiem tra ho so du dieu kien lam chu the cho duoi ten mien nay chua.
 * `.vn` bat buoc CMND/CCCD (ca nhan) hoac ma so thue (to chuc) theo quy dinh VNNIC.
 */
export function validateForTld(contact: ContactRow, tld: string): string | null {
  const t = getTld(tld);
  if (!t?.requires_vn_contact) return null;

  if (contact.kind === 'organization') {
    if (!contact.org_name.trim()) return 'Tổ chức: bắt buộc có tên đơn vị';
    if (!contact.tax_code.trim()) return 'Tổ chức: bắt buộc có mã số thuế';
  } else if (!contact.id_number.trim()) {
    return 'Cá nhân: bắt buộc có số CMND/CCCD';
  }
  if (!contact.address.trim()) return 'Bắt buộc có địa chỉ';
  return null;
}

/**
 * Ho so co du dieu kien GUI P.A dang ky duoi nay khong (theo tai lieu P.A, khac
 * `validateForTld` la quy dinh VNNIC cho doi chu the / sua lien he).
 *
 * Kiem lai tu du lieu da luu vi ho so cu tao truoc khi form doi chua co phuong
 * xa, ngay sinh... Tra ve danh sach loi de hien het mot lan cho khach.
 *  - Moi duoi: ca nhan can CCCD/ho chieu, to chuc can ten + MST; dien thoai Viet
 *    Nam; dia chi so nha ten duong; tinh va phuong xa dung danh sach P.A.
 *  - .vn: them ngay sinh, gioi tinh; to chuc them CCCD nguoi dai dien (nguoi
 *    quan ly ten mien phai la ca nhan).
 */
export function loiHoSoPA(c: ContactRow, tld: string): string[] {
  const loi: string[] = [];
  const congTy = c.kind === 'organization';
  if (congTy) {
    if ((c.org_name ?? '').trim().length <= 3) loi.push('Thiếu tên tổ chức');
    if (!MAU_MA_SO_THUE.test((c.tax_code ?? '').trim())) loi.push('Thiếu hoặc sai mã số thuế');
  } else if (!MAU_GIAY_TO.test((c.id_number ?? '').trim().toUpperCase())) {
    loi.push('Thiếu hoặc sai số CCCD / hộ chiếu');
  }
  if ((c.full_name ?? '').trim().length <= 3) loi.push(congTy ? 'Thiếu họ tên người đại diện' : 'Thiếu họ tên');
  if ((c.country || 'VN').toUpperCase() !== 'VN') loi.push('Hiện chỉ nhận chủ thể tại Việt Nam');
  if (!chuanHoaDienThoai(c.phone ?? '')) loi.push('Số điện thoại không hợp lệ');
  if (!diaChiHopLe(c.address ?? '')) loi.push('Địa chỉ cần có số nhà và tên đường');
  const tinh = timTinh(c.province ?? '');
  if (!tinh) loi.push('Tỉnh, thành phố không đúng danh sách của nhà đăng ký');
  else if (!timPhuong(tinh.id, c.ward ?? '')) loi.push('Chưa chọn phường, xã thuộc tỉnh, thành phố');

  if (laTenMienVn(tld)) {
    const ai = congTy ? ' người đại diện' : '';
    if (congTy && !MAU_GIAY_TO.test((c.id_number ?? '').trim().toUpperCase())) loi.push('Tên miền .vn: thiếu số CCCD người đại diện');
    if (!ngaySinhHopLe(c.birth_date ?? '')) loi.push(`Tên miền .vn: thiếu ngày sinh${ai}`);
    if (!chuanHoaGioiTinh(c.gender ?? '')) loi.push(`Tên miền .vn: thiếu giới tính${ai}`);
  }
  return loi;
}

export type UpdateContactOutcome =
  | { status: 'ok' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

/**
 * Cap nhat thong tin lien he cua chu the (KHONG doi chu the).
 *
 * Email chu the la duong khoi phuc quyen kiem soat ten mien, nen khi email doi,
 * he thong bao cho CA hai dia chi cu va moi.
 */
export async function updateContact(
  domain: DomainRow,
  contact: ContactRow,
  ctx: { userId: number; ip?: string },
): Promise<UpdateContactOutcome> {
  const loi = validateForTld(contact, domain.tld);
  if (loi) return { status: 'invalid', message: loi };

  const truoc = domain.contact_id
    ? (db.prepare('SELECT * FROM contacts WHERE id = ?').get(domain.contact_id) as ContactRow | undefined)
    : undefined;

  try {
    await updateDomainContact(domain.domain, toRegisterContact(contact));
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  db.prepare('UPDATE domains SET contact_id = ?, updated_at = ? WHERE id = ?')
    .run(contact.id, nowIso(), domain.id);

  audit({
    userId: ctx.userId,
    action: 'domain.contact_updated',
    entity: 'domain',
    entityId: domain.id,
    ip: ctx.ip,
    meta: { domain: domain.domain, emailCu: truoc?.email ?? '', emailMoi: contact.email },
  });
  log.info('domain_contact_updated', { domain: domain.domain });

  // Bao cho ca email cu lan moi khi email chu the thay doi
  const nhan = new Set<string>([contact.email, userEmail(domain.user_id)]);
  if (truoc?.email && truoc.email !== contact.email) nhan.add(truoc.email);

  for (const to of nhan) {
    if (!to) continue;
    await sendContactUpdated({
      userId: domain.user_id,
      email: to,
      domain: domain.domain,
      emailCu: truoc?.email ?? '',
      emailMoi: contact.email,
      ip: ctx.ip ?? '',
    });
  }

  return { status: 'ok' };
}

/* -------------------------------------------------- doi chu the (ho so) */

export interface OwnershipRequest {
  id: number; domain_id: number; user_id: number; current_owner: string;
  new_contact_id: number | null; reason: string;
  status: 'pending' | 'in_review' | 'need_documents' | 'approved' | 'completed' | 'rejected' | 'cancelled';
  admin_note: string; handled_at: string | null; created_at: string;
}

/** Nhan ho so xin doi chu the. Khong tu dong thuc hien - quan tri vien xu ly. */
export function submitOwnershipRequest(input: {
  domain: DomainRow;
  newContactId: number;
  reason: string;
  userId: number;
  ip?: string;
}): { ok: true; id: number } | { ok: false; error: string } {
  const dangCho = db
    .prepare(`SELECT id FROM ownership_requests WHERE domain_id = ? AND status IN ('pending','in_review','need_documents','approved')`)
    .get(input.domain.id);
  if (dangCho) {
    return { ok: false, error: 'Tên miền này đang có hồ sơ đổi chủ thể chưa xử lý xong.' };
  }

  const moi = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?')
    .get(input.newContactId, input.userId) as ContactRow | undefined;
  if (!moi) return { ok: false, error: 'Hồ sơ chủ thể mới không hợp lệ.' };

  const loi = validateForTld(moi, input.domain.tld);
  if (loi) return { ok: false, error: loi };

  const cu = input.domain.contact_id
    ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(input.domain.contact_id)
    : {};

  const info = db
    .prepare(
      `INSERT INTO ownership_requests (domain_id, user_id, current_owner, new_contact_id, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.domain.id, input.userId, JSON.stringify(cu ?? {}), input.newContactId, input.reason.slice(0, 500), nowIso(), nowIso());

  const id = Number(info.lastInsertRowid);
  audit({
    userId: input.userId, action: 'domain.ownership_requested', entity: 'domain',
    entityId: input.domain.id, ip: input.ip, meta: { domain: input.domain.domain, requestId: id },
  });
  log.info('ownership_request_submitted', { domain: input.domain.domain, id });
  return { ok: true, id };
}

/** Quan tri vien cap nhat trang thai ho so. */
export async function setOwnershipStatus(
  id: number,
  status: OwnershipRequest['status'],
  ctx: { adminUserId: number; note?: string },
): Promise<boolean> {
  const req = db.prepare('SELECT * FROM ownership_requests WHERE id = ?').get(id) as OwnershipRequest | undefined;
  if (!req) return false;

  db.prepare(
    `UPDATE ownership_requests SET status = ?, admin_note = ?, handled_by = ?, handled_at = ?, updated_at = ? WHERE id = ?`,
  ).run(status, (ctx.note ?? '').slice(0, 1000), ctx.adminUserId, nowIso(), nowIso(), id);

  // Ho so hoan tat -> chu the moi tro thanh chu the chinh thuc cua ten mien
  if (status === 'completed' && req.new_contact_id) {
    db.prepare('UPDATE domains SET contact_id = ?, updated_at = ? WHERE id = ?')
      .run(req.new_contact_id, nowIso(), req.domain_id);
  }

  const domain = db.prepare('SELECT domain FROM domains WHERE id = ?').get(req.domain_id) as { domain: string } | undefined;
  const email = userEmail(req.user_id);
  if (email && domain) {
    await sendOwnershipRequestStatus({
      userId: req.user_id, email, domain: domain.domain,
      status, note: ctx.note ?? '', requestId: id,
    });
  }

  audit({
    userId: ctx.adminUserId, action: 'domain.ownership_status', entity: 'domain',
    entityId: req.domain_id, meta: { requestId: id, status },
  });
  return true;
}

export interface OwnershipRequestView extends OwnershipRequest {
  domain: string;
  email: string;
  /** Ho so chu the MOI - de quan tri vien doi chieu ngay tren mot man hinh. */
  new_owner_name: string | null;
  new_owner_email: string | null;
  new_owner_tax: string | null;
  new_owner_id: string | null;
}

export function listOwnershipRequests(filter: { status?: string; userId?: number } = {}): OwnershipRequestView[] {
  const dieuKien: string[] = [];
  const thamSo: unknown[] = [];
  if (filter.status) { dieuKien.push('r.status = ?'); thamSo.push(filter.status); }
  if (filter.userId) { dieuKien.push('r.user_id = ?'); thamSo.push(filter.userId); }

  return db
    .prepare(
      `SELECT r.*, d.domain, u.email,
              COALESCE(NULLIF(c.org_name, ''), c.full_name) AS new_owner_name,
              c.email AS new_owner_email,
              c.tax_code AS new_owner_tax,
              c.id_number AS new_owner_id
       FROM ownership_requests r
       JOIN domains d ON d.id = r.domain_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN contacts c ON c.id = r.new_contact_id
       ${dieuKien.length ? `WHERE ${dieuKien.join(' AND ')}` : ''}
       ORDER BY r.id DESC LIMIT 200`,
    )
    .all(...thamSo) as OwnershipRequestView[];
}

export function ownershipRequestFor(domainId: number): OwnershipRequest | undefined {
  return db
    .prepare(`SELECT * FROM ownership_requests WHERE domain_id = ? ORDER BY id DESC LIMIT 1`)
    .get(domainId) as OwnershipRequest | undefined;
}

export function ownerSnapshot(req: OwnershipRequest): Record<string, string> {
  return parseJson<Record<string, string>>(req.current_owner, {});
}

export function pendingOwnershipCount(): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ownership_requests WHERE status IN ('pending','in_review','need_documents')`)
    .get() as { n: number }).n;
}
