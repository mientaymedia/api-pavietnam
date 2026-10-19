import { z } from 'zod';
import { chuanHoaDienThoai } from '../pavietnam/thamSo.js';
import { timPhuong, timTinh } from './diaGioi.js';

export const emailSchema = z.string().trim().toLowerCase().email('Email không hợp lệ').max(190);

/**
 * Bang users bat buoc email duy nhat, nen tai khoan tao bang mang xa hoi chua
 * co email (Zalo) mang mot email tam. Duoi .invalid (RFC 2606) khong bao gio la
 * hop thu that: khong gui thu toi do, khong cho dang ky bang tay.
 */
export const DUOI_EMAIL_TAM = '@chua-co-email.invalid';

export function laEmailTam(email: string | null | undefined): boolean {
  return String(email ?? '').toLowerCase().endsWith(DUOI_EMAIL_TAM);
}

export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(200, 'Mật khẩu quá dài');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\s.-]{8,20}$/, 'Số điện thoại không hợp lệ');

/** Nhan ca ten mien co dau (IDN) va ASCII. */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Tên miền quá ngắn')
  .max(253, 'Tên miền quá dài')
  .regex(
    /^(?=.{1,253}$)([a-z0-9¡-￿](?:[a-z0-9¡-￿-]{0,61}[a-z0-9¡-￿])?\.)+[a-z]{2,}$/i,
    'Tên miền không hợp lệ',
  );

/** Nhan (label) cua ten mien, chua bao gom duoi. */
export const sldSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9¡-￿](?:[a-z0-9¡-￿-]*[a-z0-9¡-￿])?$/i, 'Tên miền chỉ gồm chữ, số và dấu gạch ngang');

/**
 * Ma xac thuc chuyen ten mien (EPP / Auth Code) do nha dang ky CU cap.
 * Moi nha dang ky sinh mot dinh dang khac nhau nen chi kiem tra do dai va
 * loai bo khoang trang, khong ap dat quy tac ky tu.
 */
export const authCodeSchema = z
  .string()
  .trim()
  .min(4, 'Mã xác thực chuyển tên miền quá ngắn')
  .max(100, 'Mã xác thực chuyển tên miền quá dài');

export const yearsSchema = z.coerce.number().int().min(1).max(10);

export const nameserverSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, 'Nameserver không hợp lệ');

/* ------------------------------------------------ ho so chu the theo P.A */

/** CCCD 12 so, CMND 9 so, ho chieu 1-2 chu cai + 6-8 so (P.A bao 2056/2058 khi sai dinh dang). */
export const MAU_GIAY_TO = /^(\d{9}|\d{12}|[A-Z]{1,2}\d{6,8})$/;
/** Ma so thue 10 so, hoac 10 so kem ma chi nhanh -xxx. */
export const MAU_MA_SO_THUE = /^\d{10}(-\d{3})?$/;

/**
 * Dia chi P.A doi "So nha ten duong/to/ap" va dai hon 6 ky tu (ma 3055, 2068).
 * Co mot chu so, hoac co tu chi to / ap / khom / thon / xom / ban / buon la du.
 */
export function diaChiHopLe(diaChi: string): boolean {
  const s = String(diaChi ?? '').trim();
  return s.length > 6 && (/\d/.test(s) || /(^|[\s,])(tổ|ấp|khóm|thôn|xóm|bản|buôn|khu phố)(?=[\s,]|$)/iu.test(s.normalize('NFC')));
}

/** YYYY-mm-dd co that, sau 1900 va truoc hom nay. */
export function ngaySinhHopLe(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!
    && +m[1]! >= 1900 && d.getTime() < Date.now();
}

/** 'nam' / 'Nữ' / 'nu' -> 'Nam' | 'Nữ' (dung chu P.A doi o uiGender, adminGender); khac -> ''. */
export function chuanHoaGioiTinh(s: string): '' | 'Nam' | 'Nữ' {
  const k = String(s ?? '').normalize('NFC').trim().toLowerCase();
  if (k === 'nam') return 'Nam';
  if (k === 'nữ' || k === 'nu') return 'Nữ';
  return '';
}

/**
 * Ho so chu the. Ca nhan: ho ten, CCCD/ho chieu. To chuc: ten, MST, va nguoi dai
 * dien dung chung cac o full_name / id_number / birth_date / gender. Chung:
 * email, dien thoai (luu dang +84-xxxxxxxxx), dia chi so nha ten duong, tinh va
 * phuong xa dung ten P.A (luu ten chuan). Ngay sinh, gioi tinh va nguoi dai dien
 * chi bat buoc voi ten mien .vn: kiem theo duoi o trang thanh toan
 * (`loiHoSoPA`), khong o day vi mot ho so dung cho nhieu duoi.
 */
export const contactSchema = z
  .object({
    kind: z.enum(['individual', 'organization']).default('individual'),
    full_name: z.string().trim().min(4, 'Họ tên phải dài hơn 3 ký tự').max(120),
    org_name: z.string().trim().max(200).default(''),
    id_number: z.string().trim().toUpperCase().max(20).default(''),
    tax_code: z.string().trim().max(14).default(''),
    email: emailSchema,
    phone: z.string().trim().transform((v, ctx) => {
      const so = chuanHoaDienThoai(v);
      if (!so) {
        ctx.addIssue({ code: 'custom', message: 'Số điện thoại Việt Nam không hợp lệ (ví dụ 0901234567)' });
        return z.NEVER;
      }
      return so;
    }),
    address: z.string().trim().max(255).default(''),
    ward: z.string().trim().max(100).default(''),
    city: z.string().trim().max(100).default(''),
    province: z.string().trim().max(100).default(''),
    postal_code: z.string().trim().max(20).default(''),
    country: z.string().trim().toUpperCase().default('VN'),
    birth_date: z.string().trim().max(10).default(''),
    gender: z.string().trim().max(5).default('').transform(chuanHoaGioiTinh),
  })
  .superRefine((val, ctx) => {
    const loi = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (val.country !== 'VN') loi('country', 'Hiện chỉ nhận chủ thể tại Việt Nam');
    if (val.kind === 'organization') {
      if (val.org_name.length <= 3) loi('org_name', 'Tổ chức: bắt buộc nhập tên đơn vị (dài hơn 3 ký tự)');
      if (!MAU_MA_SO_THUE.test(val.tax_code)) loi('tax_code', 'Tổ chức: mã số thuế gồm 10 số (chi nhánh thêm -xxx)');
    } else if (!val.id_number) {
      loi('id_number', 'Cá nhân: bắt buộc nhập số CCCD hoặc hộ chiếu');
    }
    if (val.id_number && !MAU_GIAY_TO.test(val.id_number)) loi('id_number', 'Số CCCD (12 số), CMND (9 số) hoặc hộ chiếu không đúng định dạng');
    if (!diaChiHopLe(val.address)) loi('address', 'Địa chỉ cần có số nhà và tên đường (hoặc tổ, ấp, khóm), dài hơn 6 ký tự');
    const tinh = timTinh(val.province);
    if (!tinh) loi('province', 'Vui lòng chọn tỉnh, thành phố trong danh sách');
    else if (!timPhuong(tinh.id, val.ward)) loi('ward', `Vui lòng chọn phường, xã thuộc ${tinh.ten}`);
    if (val.birth_date && !ngaySinhHopLe(val.birth_date)) loi('birth_date', 'Ngày sinh không hợp lệ');
  })
  // Luu dung ten chuan cua P.A (hoa thuong, khoang trang theo danh sach)
  .transform((val) => {
    const tinh = timTinh(val.province);
    return { ...val, province: tinh?.ten ?? val.province, ward: (tinh && timPhuong(tinh.id, val.ward)?.ten) || val.ward };
  });

export const dnsRecordSchema = z
  .object({
    type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']),
    name: z.string().trim().max(255).default('@'),
    content: z.string().trim().min(1, 'Vui lòng nhập giá trị bản ghi').max(4000),
    ttl: z.coerce.number().int().min(60).max(604800).default(3600),
    priority: z.coerce.number().int().min(0).max(65535).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'MX' && val.priority === undefined) {
      ctx.addIssue({ code: 'custom', path: ['priority'], message: 'Bản ghi MX bắt buộc có độ ưu tiên' });
    }
    if (val.type === 'A' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(val.content)) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Bản ghi A phải là địa chỉ IPv4' });
    }
    if (val.type === 'AAAA' && !val.content.includes(':')) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Bản ghi AAAA phải là địa chỉ IPv6' });
    }
  });

/** Gom loi cua zod thanh map { field: 'thong bao' } de hien ra form. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Thong bao loi dau tien, dung cho API JSON. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Dữ liệu không hợp lệ';
}
