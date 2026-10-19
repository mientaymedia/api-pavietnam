/**
 * Dung tham so gui P.A cho lenh dang ky va doi DNS, DUNG TEN trong tai lieu
 * (register_domain_vietnam.php, register_domain_quocte.php, change_dns_*.php).
 *
 * Tep nay co y la ham thuan: khong doc CSDL, cau hinh hay mang. Nho vay
 * scripts/pa-thu-endpoint-test.mjs (chay tren VPS voi interface_test.php) dung
 * lai dung bo tham so nay tu dist/, thu that ca cach map chu khong chi thu mau.
 */
import crypto from 'node:crypto';

/** Quoc gia theo tep "Quoc gia ISO3166.xls" cua P.A. Dot nay chi ho tro khach Viet Nam. */
export const QUOC_GIA_VN = 'Viet Nam';

export interface ChuThePA {
  kind: 'individual' | 'organization';
  /** Ca nhan: ho ten chu the. To chuc: ho ten nguoi dai dien (nguoi quan ly .vn). */
  fullName: string;
  orgName?: string;
  /** Ca nhan: CCCD/ho chieu chu the. To chuc: CCCD nguoi dai dien. */
  idNumber?: string;
  taxCode?: string;
  email: string;
  phone: string;
  address?: string;
  ward?: string;
  province?: string;
  /** YYYY-mm-dd. Ca nhan: cua chu the. To chuc: cua nguoi dai dien. */
  birthDate?: string;
  /** 'Nam' | 'Nữ'. */
  gender?: string;
}

/** Duoi ten mien Viet Nam: vn, com.vn, net.vn, edu.vn ... */
export function laTenMienVn(tld: string): boolean {
  const t = String(tld ?? '').replace(/^\./, '').toLowerCase();
  return t === 'vn' || t.endsWith('.vn');
}

/**
 * Chuan hoa so dien thoai ve dang P.A doi cho ten mien Viet Nam (ma loi 309):
 * "+84-987654321" (di dong) hoac "+84-2963xxxxxx" (co dinh). Nhan 0987654321,
 * 84987654321, +84 98 765 4321, +84-987654321. Khong hop le -> null.
 */
export function chuanHoaDienThoai(input: string): string | null {
  const s = String(input ?? '').trim();
  if (!s || /[^\d+\s().-]/.test(s)) return null;
  let so = s.replace(/[^\d]/g, '');
  if (s.startsWith('+') || so.startsWith('84')) {
    if (!so.startsWith('84')) return null; // chi nhan so Viet Nam
    so = so.slice(2);
  } else if (so.startsWith('0')) {
    so = so.slice(1);
  } else {
    return null;
  }
  so = so.replace(/^0+/, '');
  // So quoc gia (bo so 0 dau): di dong 9 chu so, co dinh 10 chu so
  if (!/^[1-9]\d{8,9}$/.test(so)) return null;
  return `+84-${so}`;
}

/** Luat mat khau ten mien P.A: 8-15 ky tu, chi a-z va 0-9, bat buoc co ca chu va so (ma 307, 308). */
export function matKhauTenMienHopLe(mk: string): boolean {
  return /^(?=.*[a-z])(?=.*\d)[a-z0-9]{8,15}$/.test(String(mk ?? ''));
}

/** Sinh mat khau ten mien 12 ky tu ngau nhien dung luat P.A. */
export function sinhMatKhauTenMien(doDai = 12): string {
  const chu = 'abcdefghijkmnpqrstuvwxyz'; // bo l, o de khach doc khong nham voi 1, 0
  const so = '23456789';
  const tatCa = chu + so;
  for (;;) {
    let mk = '';
    for (let i = 0; i < doDai; i++) mk += tatCa[crypto.randomInt(tatCa.length)];
    if (matKhauTenMienHopLe(mk)) return mk;
  }
}

/** Ten mien day du -> domainName (phan ten) + domainExt (phan duoi) theo duoi da biet. */
export function tachTenMien(domain: string, tld: string): { domainName: string; domainExt: string } {
  const d = String(domain ?? '').trim().toLowerCase().replace(/\.$/, '');
  const ext = String(tld ?? '').replace(/^\./, '').toLowerCase();
  if (!ext || !d.endsWith(`.${ext}`)) throw new Error(`Tên miền ${d} không khớp đuôi .${ext}`);
  return { domainName: d.slice(0, -(ext.length + 1)), domainExt: ext };
}

/** Ten hien thi cua chu the: ten to chuc voi cong ty, ho ten voi ca nhan. */
function tenChuThe(c: ChuThePA): string {
  return c.kind === 'organization' ? (c.orgName ?? '').trim() : c.fullName.trim();
}

export interface DauVaoDangKy {
  domain: string;
  tld: string;
  years: number;
  password: string;
  nameservers: string[];
  contact: ChuThePA;
  /** P.A gui email thong bao cho khach (0: khong gui). */
  sendmail?: boolean;
}

/**
 * Tham so register_domain_vietnam / register_domain_quocte.
 *
 * - owner*: thong tin tao ma khach hang PA-xxx; ui*: chu the hien tren whois.
 *   Ca hai cung la mot chu the cua don hang.
 * - .vn: them uiGender / uiBirthdate (ca nhan) va nhom admin* (nguoi quan ly,
 *   luon la ca nhan). Ca nhan: nguoi quan ly la chinh chu the. Cong ty: nguoi
 *   dai dien da nhap trong ho so, dia chi va lien he theo ho so cong ty.
 * - Dien thoai gui dang +84-xxxxxxxxx cho moi nhom (ma 309 voi ten mien .vn).
 */
export function thamSoDangKy(v: DauVaoDangKy): Record<string, string> {
  const c = v.contact;
  const vn = laTenMienVn(v.tld);
  const congTy = c.kind === 'organization';
  const { domainName, domainExt } = tachTenMien(v.domain, v.tld);
  const phone = chuanHoaDienThoai(c.phone) ?? c.phone;
  const ten = tenChuThe(c);
  const dc = (c.address ?? '').trim();
  const phuong = (c.ward ?? '').trim();
  const tinh = (c.province ?? '').trim();

  const p: Record<string, string> = {
    domainName,
    domainExt,
    domainYear: String(v.years),
    passwordDomain: v.password,
    for: congTy ? 'congty' : 'canhan',
  };
  const ns = v.nameservers.slice(0, vn ? 3 : 2);
  ns.forEach((n, i) => { p[`domainDNS${i + 1}`] = n; });

  Object.assign(p, {
    ownerType: congTy ? '2' : '1',
    ownerName: ten,
    ownerID_Number: congTy ? '' : (c.idNumber ?? '').trim(),
    ownerTaxCode: congTy ? (c.taxCode ?? '').trim() : '',
    ownerAddress: dc,
    ownerWard: phuong,
    ownerProvince: tinh,
    ownerCountry: QUOC_GIA_VN,
    ownerEmail1: c.email,
    ownerPhone: phone,

    uiName: ten,
    uiID_Number: congTy ? '' : (c.idNumber ?? '').trim(),
    uiTaxCode: congTy ? (c.taxCode ?? '').trim() : '',
    uiAddress: dc,
    uiWard: phuong,
    uiProvince: tinh,
    uiCountry: QUOC_GIA_VN,
    uiEmail: c.email,
    uiPhone: phone,
  });

  if (vn) {
    if (!congTy) {
      p['uiGender'] = c.gender ?? '';
      p['uiBirthdate'] = c.birthDate ?? '';
    } else {
      p['uiCompany'] = ten;
    }
    Object.assign(p, {
      adminName: c.fullName.trim(),
      adminID_Number: (c.idNumber ?? '').trim(),
      adminAddress: dc,
      adminWard: phuong,
      adminProvince: tinh,
      adminCountry: QUOC_GIA_VN,
      adminEmail: c.email,
      adminPhone: phone,
      adminGender: c.gender ?? '',
      adminBirthdate: c.birthDate ?? '',
    });
    if (congTy) p['adminCompany'] = ten;
  }

  p['sendmail'] = v.sendmail ? '1' : '0';
  // Tra ve trans_id, trans_money, trans_accountstill de doi soat
  p['return_full'] = '1';
  return p;
}

export interface NameserverPA { host: string; ip?: string }

/** change_dns_domain_vietnam: domainDNS1..3 + domainIP1..3 (IP bat buoc cho 2 cai dau). */
export function thamSoDoiDnsVn(domain: string, ns: NameserverPA[]): Record<string, string> {
  const p: Record<string, string> = { domain };
  for (let i = 0; i < 3; i++) {
    p[`domainDNS${i + 1}`] = ns[i]?.host ?? '';
    p[`domainIP${i + 1}`] = ns[i]?.ip ?? '';
  }
  return p;
}

/** change_dns_domain_quocte: domainDNS1..4. */
export function thamSoDoiDnsQuocTe(domain: string, ns: string[]): Record<string, string> {
  const p: Record<string, string> = { domain };
  for (let i = 0; i < 4; i++) p[`domainDNS${i + 1}`] = ns[i] ?? '';
  return p;
}

/** Tham so renew_domain. */
export function thamSoGiaHan(domain: string, years: number, sendmail = false): Record<string, string> {
  return { domain, year: String(years), sendmail: sendmail ? '1' : '0', return_full: '1' };
}

/** Tham so co gia tri bi mat, phai che trong nhat ky. */
export const THAM_SO_BI_MAT = ['apikey', 'passwordDomain'];
