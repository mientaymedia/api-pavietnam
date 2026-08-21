import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Email khong hop le').max(190);

export const passwordSchema = z
  .string()
  .min(8, 'Mat khau toi thieu 8 ky tu')
  .max(200, 'Mat khau qua dai');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\s.-]{8,20}$/, 'So dien thoai khong hop le');

/** Nhan ca ten mien co dau (IDN) va ASCII. */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Ten mien qua ngan')
  .max(253, 'Ten mien qua dai')
  .regex(
    /^(?=.{1,253}$)([a-z0-9¡-￿](?:[a-z0-9¡-￿-]{0,61}[a-z0-9¡-￿])?\.)+[a-z]{2,}$/i,
    'Ten mien khong hop le',
  );

/** Nhan (label) cua ten mien, chua bao gom duoi. */
export const sldSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9¡-￿](?:[a-z0-9¡-￿-]*[a-z0-9¡-￿])?$/i, 'Ten mien chi gom chu, so va dau gach ngang');

/**
 * Ma xac thuc chuyen ten mien (EPP / Auth Code) do nha dang ky CU cap.
 * Moi nha dang ky sinh mot dinh dang khac nhau nen chi kiem tra do dai va
 * loai bo khoang trang, khong ap dat quy tac ky tu.
 */
export const authCodeSchema = z
  .string()
  .trim()
  .min(4, 'Ma xac thuc chuyen ten mien qua ngan')
  .max(100, 'Ma xac thuc chuyen ten mien qua dai');

export const yearsSchema = z.coerce.number().int().min(1).max(10);

export const nameserverSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, 'Nameserver khong hop le');

export const contactSchema = z
  .object({
    kind: z.enum(['individual', 'organization']).default('individual'),
    full_name: z.string().trim().min(2, 'Vui long nhap ho ten').max(120),
    org_name: z.string().trim().max(200).default(''),
    id_number: z.string().trim().max(30).default(''),
    tax_code: z.string().trim().max(30).default(''),
    email: emailSchema,
    phone: phoneSchema,
    address: z.string().trim().max(255).default(''),
    city: z.string().trim().max(100).default(''),
    province: z.string().trim().max(100).default(''),
    postal_code: z.string().trim().max(20).default(''),
    country: z.string().trim().length(2).toUpperCase().default('VN'),
    birth_date: z.string().trim().max(20).default(''),
    gender: z.string().trim().max(10).default(''),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'organization') {
      if (!val.org_name) ctx.addIssue({ code: 'custom', path: ['org_name'], message: 'To chuc: bat buoc nhap ten don vi' });
      if (!val.tax_code) ctx.addIssue({ code: 'custom', path: ['tax_code'], message: 'To chuc: bat buoc nhap ma so thue' });
    } else if (!val.id_number) {
      ctx.addIssue({ code: 'custom', path: ['id_number'], message: 'Ca nhan: bat buoc nhap so CMND/CCCD' });
    }
  });

export const dnsRecordSchema = z
  .object({
    type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']),
    name: z.string().trim().max(255).default('@'),
    content: z.string().trim().min(1, 'Vui long nhap gia tri ban ghi').max(4000),
    ttl: z.coerce.number().int().min(60).max(604800).default(3600),
    priority: z.coerce.number().int().min(0).max(65535).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'MX' && val.priority === undefined) {
      ctx.addIssue({ code: 'custom', path: ['priority'], message: 'Ban ghi MX bat buoc co do uu tien' });
    }
    if (val.type === 'A' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(val.content)) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Ban ghi A phai la dia chi IPv4' });
    }
    if (val.type === 'AAAA' && !val.content.includes(':')) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Ban ghi AAAA phai la dia chi IPv6' });
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
  return err.issues[0]?.message ?? 'Du lieu khong hop le';
}
