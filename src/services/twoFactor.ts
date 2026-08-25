/**
 * Xac thuc hai lop (2FA) bang ma mot lan theo thoi gian.
 *
 * Vi sao can: tai khoan quan tri nam API key P.A (tieu tien that moi lan dang ky
 * ten mien), token SePay, va thong tin ca nhan cua khach. Neu chi co mat khau
 * thi lo mat khau la mat tat ca. Lop thu hai khien mat khau bi lo van chua du de
 * vao duoc.
 *
 * Quy trinh: nguoi dung quet ma QR -> nhap mot ma de xac nhan da quet dung ->
 * he thong moi bat that va giao 10 ma du phong.
 */
import crypto from 'node:crypto';
import { db, nowIso, tx } from '../db/index.js';
import { decryptSecret, encryptSecret, randomCode, sha256 } from '../lib/crypto.js';
import { settings } from '../lib/settings.js';
import { generateSecret, otpauthUri, verifyTotp } from '../lib/totp.js';
import { audit } from './audit.js';
import { log } from '../lib/logger.js';

export const SO_MA_DU_PHONG = 10;

interface HangTwoFactor {
  user_id: number;
  secret_enc: string;
  confirmed_at: string | null;
  last_counter: number | null;
}

function layHang(userId: number): HangTwoFactor | undefined {
  return db.prepare('SELECT user_id, secret_enc, confirmed_at, last_counter FROM two_factor WHERE user_id = ?')
    .get(userId) as HangTwoFactor | undefined;
}

/** Da bat that (da quet va xac nhan) hay chua. */
export function isEnabled(userId: number): boolean {
  return Boolean(layHang(userId)?.confirmed_at);
}

export interface TrangThai2FA {
  enabled: boolean;
  /** Da tao khoa nhung chua xac nhan - dang do dang. */
  pending: boolean;
  enabledAt: string | null;
  /** So ma du phong con dung duoc. */
  recoveryLeft: number;
}

export function getState(userId: number): TrangThai2FA {
  const hang = layHang(userId);
  const conLai = db
    .prepare('SELECT COUNT(*) AS n FROM two_factor_recovery WHERE user_id = ? AND used_at IS NULL')
    .get(userId) as { n: number };
  return {
    enabled: Boolean(hang?.confirmed_at),
    pending: Boolean(hang && !hang.confirmed_at),
    enabledAt: hang?.confirmed_at ?? null,
    recoveryLeft: conLai.n,
  };
}

/** He thong co BAT BUOC quan tri vien dung 2FA khong. */
export function batBuocChoQuanTri(): boolean {
  return settings.security().require2faAdmin;
}

/** Tai khoan nay co bi bat buoc dung 2FA khong. */
export function requires2FA(role: string): boolean {
  return (role === 'admin' || role === 'staff') && batBuocChoQuanTri();
}

/* --------------------------------------------------------------- cai dat */

export interface BuocCaiDat {
  secret: string;
  uri: string;
}

/**
 * Bat dau cai dat: tao khoa bi mat moi va tra ve dia chi otpauth de ve ma QR.
 *
 * Goi lai nhieu lan se tao khoa MOI va bo khoa cu dang do - dung khi nguoi dung
 * quet hong roi lam lai. Nhung neu 2FA DA bat that thi khong cho ghi de: muon
 * doi thiet bi phai tat truoc (va tat thi can nhap ma hien tai).
 */
export function beginSetup(userId: number, email: string): BuocCaiDat {
  const hang = layHang(userId);
  if (hang?.confirmed_at) throw new Error('Xac thuc hai lop dang bat. Hay tat truoc khi cai dat lai.');

  const secret = generateSecret();
  const bayGio = nowIso();
  db.prepare(
    `INSERT INTO two_factor (user_id, secret_enc, confirmed_at, last_counter, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET secret_enc = excluded.secret_enc, confirmed_at = NULL,
       last_counter = NULL, updated_at = excluded.updated_at`,
  ).run(userId, encryptSecret(secret), bayGio, bayGio);

  return {
    secret,
    uri: otpauthUri({ secret, account: email, issuer: tenNhaCungCap() }),
  };
}

/**
 * Lay lai ma QR cua lan cai dat dang do (khi nguoi dung tai lai trang).
 * Tra ve null neu chua bat dau hoac 2FA da bat that.
 */
export function getPendingSetup(userId: number, email: string): BuocCaiDat | null {
  const hang = layHang(userId);
  if (!hang || hang.confirmed_at) return null;
  const secret = giaiMaKhoa(hang);
  return { secret, uri: otpauthUri({ secret, account: email, issuer: tenNhaCungCap() }) };
}

/** Ten hien trong ung dung xac thuc. Cat ngan de dia chi otpauth khong qua dai. */
function tenNhaCungCap(): string {
  const ten = (settings.site().name || 'Ten mien').replace(/[:?#&/]/g, ' ').trim();
  return ten.slice(0, 40) || 'Ten mien';
}

export interface KetQuaXacNhan {
  ok: boolean;
  /** Chi tra ve DUY NHAT mot lan, ngay sau khi bat thanh cong. */
  recoveryCodes?: string[];
  loi?: string;
}

/** Xac nhan da quet dung ma QR roi bat that, dong thoi phat ma du phong. */
export function confirmSetup(userId: number, code: string, ip?: string): KetQuaXacNhan {
  const hang = layHang(userId);
  if (!hang) return { ok: false, loi: 'Chua bat dau cai dat. Vui long tai lai trang.' };
  if (hang.confirmed_at) return { ok: false, loi: 'Xac thuc hai lop da duoc bat truoc do.' };

  const kq = verifyTotp(giaiMaKhoa(hang), code);
  if (!kq.ok) return { ok: false, loi: 'Ma khong dung. Kiem tra lai gio tren dien thoai roi thu ma moi nhat.' };

  const codes = taoMaDuPhong();
  tx(() => {
    db.prepare('UPDATE two_factor SET confirmed_at = ?, last_counter = ?, updated_at = ? WHERE user_id = ?')
      .run(nowIso(), kq.counter ?? null, nowIso(), userId);
    luuMaDuPhong(userId, codes);
  });

  audit({ userId, action: 'user.2fa_enabled', entity: 'user', entityId: userId, ip });
  return { ok: true, recoveryCodes: codes };
}

/**
 * Tat xac thuc hai lop. Bat buoc nhap ma hien tai (hoac ma du phong) truoc khi
 * tat - neu khong, ke chiem duoc phien dang nhap co the tu go lop bao ve nay.
 */
export function disable(userId: number, code: string, ip?: string): { ok: boolean; loi?: string } {
  if (!isEnabled(userId)) return { ok: false, loi: 'Xac thuc hai lop chua duoc bat.' };
  const kq = verifyLogin(userId, code);
  if (!kq.ok) return { ok: false, loi: 'Ma khong dung.' };

  tx(() => {
    db.prepare('DELETE FROM two_factor WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM two_factor_recovery WHERE user_id = ?').run(userId);
  });
  audit({ userId, action: 'user.2fa_disabled', entity: 'user', entityId: userId, ip });
  return { ok: true };
}

/** Cap lai bo ma du phong moi (bo cu het hieu luc ngay). */
export function regenerateRecoveryCodes(userId: number, ip?: string): string[] {
  const codes = taoMaDuPhong();
  tx(() => {
    db.prepare('DELETE FROM two_factor_recovery WHERE user_id = ?').run(userId);
    luuMaDuPhong(userId, codes);
  });
  audit({ userId, action: 'user.2fa_recovery_regenerated', entity: 'user', entityId: userId, ip });
  return codes;
}

/* ------------------------------------------------------------ kiem tra khi dang nhap */

export interface KetQuaDangNhap {
  ok: boolean;
  /** true neu nguoi dung vua tieu mot ma du phong (nen nhac ho cap lai bo moi). */
  duPhong?: boolean;
  conLai?: number;
}

/**
 * Kiem tra ma o buoc thu hai khi dang nhap.
 *
 * Nhan ca ma 6 so tu ung dung lan ma du phong. Ma tu ung dung khong dung lai
 * duoc: moi chu ky da dung se duoc ghi vao `last_counter` va cac lan sau tu choi
 * moi chu ky <= gia tri do.
 */
export function verifyLogin(userId: number, code: string): KetQuaDangNhap {
  const hang = layHang(userId);
  if (!hang?.confirmed_at) return { ok: false };

  const sach = String(code ?? '').trim();

  // Ma tu ung dung xac thuc
  if (/^\d{6}$/.test(sach.replace(/\s/g, ''))) {
    const kq = verifyTotp(giaiMaKhoa(hang), sach.replace(/\s/g, ''), { minCounter: hang.last_counter });
    if (kq.ok) {
      db.prepare('UPDATE two_factor SET last_counter = ?, updated_at = ? WHERE user_id = ?')
        .run(kq.counter ?? null, nowIso(), userId);
      return { ok: true };
    }
    return { ok: false };
  }

  return dungMaDuPhong(userId, sach);
}

/* ------------------------------------------------------------------- ma du phong */

function taoMaDuPhong(): string[] {
  // Dinh dang XXXX-XXXX cho de doc va de chep ra giay
  return Array.from({ length: SO_MA_DU_PHONG }, () => `${randomCode(4)}-${randomCode(4)}`);
}

function chuanHoa(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function luuMaDuPhong(userId: number, codes: string[]): void {
  const stmt = db.prepare('INSERT INTO two_factor_recovery (user_id, code_hash, created_at) VALUES (?, ?, ?)');
  for (const c of codes) stmt.run(userId, sha256(chuanHoa(c)), nowIso());
}

/**
 * Doi mot ma du phong lay quyen vao. Ma chi dung duoc mot lan: cau UPDATE co
 * dieu kien `used_at IS NULL` nen hai yeu cau cung luc thi chi mot cai an.
 */
function dungMaDuPhong(userId: number, code: string): KetQuaDangNhap {
  const chuan = chuanHoa(code);
  if (chuan.length < 6) return { ok: false };

  const hang = db
    .prepare('SELECT id FROM two_factor_recovery WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
    .get(userId, sha256(chuan)) as { id: number } | undefined;
  if (!hang) return { ok: false };

  const kq = db.prepare('UPDATE two_factor_recovery SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(nowIso(), hang.id);
  if (kq.changes !== 1) return { ok: false };

  const conLai = db
    .prepare('SELECT COUNT(*) AS n FROM two_factor_recovery WHERE user_id = ? AND used_at IS NULL')
    .get(userId) as { n: number };

  audit({ userId, action: 'user.2fa_recovery_used', entity: 'user', entityId: userId, meta: { conLai: conLai.n } });
  return { ok: true, duPhong: true, conLai: conLai.n };
}

/* ------------------------------------------------------------------------ noi bo */

function giaiMaKhoa(hang: HangTwoFactor): string {
  try {
    return decryptSecret(hang.secret_enc);
  } catch (err) {
    // Xay ra khi ENCRYPTION_KEY bi doi ma CSDL van con ban ghi cu.
    log.error('2fa_secret_undecryptable', { userId: hang.user_id, error: String(err) });
    throw new Error('Khong doc duoc khoa xac thuc hai lop. Vui long lien he quan tri he thong.');
  }
}

/** Chuoi ngau nhien de gan phien cho buoc hai - khong dung de xac thuc, chi de doi chieu. */
export function newPendingToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}
