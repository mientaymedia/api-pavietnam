/**
 * Ghep danh tinh mang xa hoi (Zalo, Google, GitHub) voi tai khoan cua web.
 *
 * Vi sao can can than: ten mien la tai san. Neu cu thay email trung la gop
 * thi ai lam chu mot tai khoan Google co email cua nan nhan (hoac nha cung cap
 * tra email chua xac minh) se vao duoc tai khoan cua nan nhan. Quy tac o
 * docs/mtm/dang-nhap-mxh/spec.md muc 3:
 *  - chi tin email nha cung cap da xac minh;
 *  - chi tu gop vao tai khoan KHONG mat khau, KHONG 2FA, email ben minh da xac
 *    minh; con lai phai dang nhap bang mat khau mot lan roi moi gan;
 *  - khong co email (Zalo) thi tao tai khoan moi voi email tam, bat bo sung
 *    va xac minh email truoc khi dat hang.
 */
import crypto from 'node:crypto';
import { db, nowIso, tx } from '../db/index.js';
import type { HoSoMxh, NhaCungCap } from '../lib/oauth.js';
import { TEN_HIEN_THI, danhSachDangBat, laNhaCungCap } from '../lib/oauth.js';
import type { SessionData } from '../middleware/session.js';
import { isEnabled as twoFactorEnabled } from './twoFactor.js';
import { isVerified, requireVerifiedToOrder } from './verification.js';
import { audit } from './audit.js';
import { DUOI_EMAIL_TAM, laEmailTam } from '../lib/validate.js';

export { laEmailTam };

function taoEmailTam(): string {
  return `mxh-${crypto.randomBytes(8).toString('hex')}${DUOI_EMAIL_TAM}`;
}

export interface DanhTinh {
  id: number;
  provider: NhaCungCap;
  provider_user_id: string;
  user_id: number;
  email: string;
  created_at: string;
}

export function timDanhTinh(ben: NhaCungCap, providerUserId: string): DanhTinh | undefined {
  return db.prepare('SELECT * FROM user_identities WHERE provider = ? AND provider_user_id = ?')
    .get(ben, providerUserId) as DanhTinh | undefined;
}

export function danhTinhCua(userId: number): DanhTinh[] {
  return db.prepare('SELECT * FROM user_identities WHERE user_id = ? ORDER BY id').all(userId) as DanhTinh[];
}

/** Tai khoan co dat mat khau chua. Tai khoan tao bang mang xa hoi de password_hash rong. */
export function coMatKhau(userId: number): boolean {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  return Boolean(row?.password_hash);
}

export type KetQuaGan = 'ok' | 'da_gan' | 'cua_nguoi_khac' | 'da_co_ben_nay';

/** Gan danh tinh vao tai khoan dang dang nhap (che do lien ket). */
export function ganDanhTinh(userId: number, hs: HoSoMxh): KetQuaGan {
  return tx(() => {
    const co = timDanhTinh(hs.ben, hs.id);
    if (co) return co.user_id === userId ? 'da_gan' : 'cua_nguoi_khac';
    const cungBen = db.prepare('SELECT 1 FROM user_identities WHERE user_id = ? AND provider = ?').get(userId, hs.ben);
    if (cungBen) return 'da_co_ben_nay';
    themDanhTinh(userId, hs);
    return 'ok';
  });
}

function themDanhTinh(userId: number, hs: HoSoMxh): void {
  db.prepare(
    `INSERT INTO user_identities (provider, provider_user_id, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(hs.ben, hs.id, userId, hs.emailDaXacMinh ? hs.email : '', nowIso());
}

export type KetQuaHuy = 'ok' | 'khong_co' | 'cuoi_cung';

/**
 * Huy lien ket. Khong cho huy danh tinh cuoi cung khi chua dat mat khau:
 * huy xong la khong con cach nao dang nhap vao tai khoan (va ten mien trong do).
 */
export function huyDanhTinh(userId: number, ben: NhaCungCap): KetQuaHuy {
  return tx(() => {
    const ds = danhTinhCua(userId);
    if (!ds.some((d) => d.provider === ben)) return 'khong_co';
    if (ds.length <= 1 && !coMatKhau(userId)) return 'cuoi_cung';
    db.prepare('DELETE FROM user_identities WHERE user_id = ? AND provider = ?').run(userId, ben);
    return 'ok';
  });
}

interface HangUser {
  id: number;
  email: string;
  password_hash: string;
  status: string;
  email_verified_at: string | null;
}

export type KetQuaMxh =
  | { loai: 'dang_nhap'; userId: number; moiGan: boolean }
  | { loai: 'tao_moi'; userId: number; thieuEmail: boolean; email: string; ten: string }
  /** Email trung tai khoan khong duoc tu gop: phai dang nhap bang mat khau mot lan. */
  | { loai: 'can_mat_khau'; email: string }
  | { loai: 'tam_khoa' };

/**
 * Quyet dinh khi khach CHUA dang nhap quay ve tu nha cung cap. Ghi CSDL
 * (gan danh tinh, tao tai khoan) trong mot giao dich; viec cap phien do route lam.
 */
export function xuLyDangNhapMxh(hs: HoSoMxh, ip?: string): KetQuaMxh {
  const kq = tx((): KetQuaMxh => {
    const co = timDanhTinh(hs.ben, hs.id);
    if (co) {
      const u = db.prepare('SELECT status FROM users WHERE id = ?').get(co.user_id) as { status: string } | undefined;
      if (!u) return { loai: 'tam_khoa' };
      return u.status === 'suspended' ? { loai: 'tam_khoa' } : { loai: 'dang_nhap', userId: co.user_id, moiGan: false };
    }

    const email = hs.emailDaXacMinh ? hs.email : '';
    if (email) {
      const u = db.prepare('SELECT id, email, password_hash, status, email_verified_at FROM users WHERE email = ? COLLATE NOCASE')
        .get(email) as HangUser | undefined;
      if (u) {
        if (u.status === 'suspended') return { loai: 'tam_khoa' };
        const tuGopDuoc = !u.password_hash && !twoFactorEnabled(u.id) && Boolean(u.email_verified_at);
        if (!tuGopDuoc) return { loai: 'can_mat_khau', email: u.email };
        // Moi tai khoan mot danh tinh moi ben: da co ben nay (id khac) thi cung khong tu gop
        const cungBen = db.prepare('SELECT 1 FROM user_identities WHERE user_id = ? AND provider = ?').get(u.id, hs.ben);
        if (cungBen) return { loai: 'can_mat_khau', email: u.email };
        themDanhTinh(u.id, hs);
        return { loai: 'dang_nhap', userId: u.id, moiGan: true };
      }
    }

    const emailLuu = email || taoEmailTam();
    const info = db.prepare(
      `INSERT INTO users (email, password_hash, full_name, phone, role, email_verified_at, created_at, updated_at)
       VALUES (?, '', ?, '', 'customer', ?, ?, ?)`,
    ).run(emailLuu, hs.ten || 'Khách hàng', email ? nowIso() : null, nowIso(), nowIso());
    const userId = Number(info.lastInsertRowid);
    themDanhTinh(userId, hs);
    return { loai: 'tao_moi', userId, thieuEmail: !email, email: emailLuu, ten: hs.ten || 'Khách hàng' };
  });

  if (kq.loai === 'tao_moi') {
    audit({ userId: kq.userId, action: 'user.oauth_register', entity: 'user', entityId: kq.userId, ip, meta: { ben: hs.ben, coEmail: !kq.thieuEmail } });
  } else if (kq.loai === 'dang_nhap' && kq.moiGan) {
    audit({ userId: kq.userId, action: 'user.oauth_link', entity: 'user', entityId: kq.userId, ip, meta: { ben: hs.ben, tuGop: true } });
  }
  return kq;
}

/* --------------------------------------------- danh tinh cho gan sau mat khau */

/** Cho toi da 10 phut, nhu phien xac thuc hai lop. */
const HAN_CHO_LIEN_KET_MS = 10 * 60_000;

export interface ChoLienKet {
  ben: NhaCungCap;
  id: string;
  email: string;
  ten: string;
  at: number;
}

export function ghiChoLienKet(session: SessionData, hs: HoSoMxh): void {
  const cho: ChoLienKet = { ben: hs.ben, id: hs.id, email: hs.email, ten: hs.ten, at: Date.now() };
  session['choLienKet'] = cho;
}

/**
 * Goi ngay sau khi dang nhap bang mat khau (va 2FA) thanh cong. Chi gan khi
 * email cua tai khoan vua dang nhap trung email nha cung cap da xac minh: may
 * dung chung, nguoi truoc bam Google roi bo do, nguoi sau dang nhap tai khoan
 * cua minh thi khong bi gan nham Google cua nguoi truoc.
 */
export function ganLienKetDangCho(session: SessionData, userId: number, ip?: string): NhaCungCap | null {
  const cho = session['choLienKet'] as ChoLienKet | undefined;
  delete session['choLienKet'];
  if (!cho || !laNhaCungCap(cho.ben) || typeof cho.id !== 'string' || Date.now() - cho.at > HAN_CHO_LIEN_KET_MS) return null;

  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!u || !cho.email || u.email.toLowerCase() !== cho.email.toLowerCase()) return null;

  const kq = ganDanhTinh(userId, { ben: cho.ben, id: cho.id, ten: cho.ten, email: cho.email, emailDaXacMinh: true });
  if (kq !== 'ok') return null;
  audit({ userId, action: 'user.oauth_link', entity: 'user', entityId: userId, ip, meta: { ben: cho.ben, sauMatKhau: true } });
  return cho.ben;
}

/* ------------------------------------------------------------- dat hang */

/**
 * Ly do chua cho dat hang vi email, null neu duoc. Ngoai cau hinh
 * `auth.require_email_verified` san co, tai khoan khong mat khau (tao bang
 * mang xa hoi) luon phai co email that da xac minh: do la kenh duy nhat de
 * nhan thong tin quan tri ten mien va lay lai tai khoan.
 */
export function lyDoChanDatHang(userId: number): 'thieu_email' | 'chua_xac_thuc' | null {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!u || laEmailTam(u.email)) return 'thieu_email';
  if (isVerified(userId)) return null;
  return requireVerifiedToOrder() || !coMatKhau(userId) ? 'chua_xac_thuc' : null;
}

/** Duoc dung trang bo sung email: tai khoan khong mat khau, email chua xac minh. */
export function duocBoSungEmail(userId: number): boolean {
  return !coMatKhau(userId) && !isVerified(userId);
}

/** Du lieu khoi "Dang nhap bang mang xa hoi" cho trang /tai-khoan. */
export function duLieuMxh(userId: number) {
  const ds = danhTinhCua(userId);
  const bat = danhSachDangBat();
  return {
    coMatKhau: coMatKhau(userId),
    danhSach: (['zalo', 'google', 'github'] as const)
      // Ben da tat van hien neu tai khoan dang gan, de khach huy duoc
      .filter((b) => bat.includes(b) || ds.some((d) => d.provider === b))
      .map((b) => ({ ben: b, ten: TEN_HIEN_THI[b], dangBat: bat.includes(b), danhTinh: ds.find((d) => d.provider === b) ?? null })),
  };
}
