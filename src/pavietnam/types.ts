import type { NhomMa } from './maLoi.js';

/** Kieu du lieu dung chung cho tang tich hop nha dang ky (registrar). */

export interface RawResult {
  /** Van ban tho tra ve tu API (luon giu lai de doi soat / debug). */
  raw: string;
  /** Du lieu da parse (JSON / XML / key=value tuy dinh dang P.A tra ve). */
  data: Record<string, unknown>;
  /** true khi API bao thanh cong. */
  ok: boolean;
  /** Ma loi (neu co). */
  code: string;
  /** Thong bao loi/thanh cong da chuan hoa. */
  message: string;
  durationMs: number;
  /** ReturnCode cua P.A (null khi phan hoi khong co, vd check_whois tra so tran). */
  returnCode?: number | null;
  /** Lenh vua roi di endpoint thu (interface_test.php). */
  endpointThu?: boolean;
}

export interface CheckResult extends RawResult {
  domain: string;
  available: boolean;
}

export interface WhoisResult extends RawResult {
  domain: string;
  registered: boolean;
  registrar?: string;
  createdAt?: string;
  expiresAt?: string;
  nameservers: string[];
  text: string;
}

export interface RegisterResult extends RawResult {
  domain: string;
  /** trans_id cua P.A (return_full=1). */
  providerRef: string;
  expiresAt?: string;
  /** So tien P.A tru cho giao dich, dong (duong). 0 khi P.A khong tra. */
  transMoney: number;
  /** So du dai ly sau giao dich, null khi P.A khong tra. */
  accountStill: number | null;
}

export interface DnsRecord {
  id?: string;
  type: string;
  /** Ten ban ghi tuong doi ('@', 'www', 'mail'). */
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}

export interface DomainInfo {
  domain: string;
  status?: string;
  registeredAt?: string;
  expiresAt?: string;
  nameservers: string[];
}

export interface RegisterContact {
  kind: 'individual' | 'organization';
  fullName: string;
  orgName?: string;
  idNumber?: string;
  taxCode?: string;
  email: string;
  phone: string;
  /** So nha, ten duong (P.A bat buoc co so nha / to / ap). */
  address?: string;
  /** Phuong xa theo dung ten P.A. */
  ward?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  birthDate?: string;
  gender?: string;
}

export class RegistrarError extends Error {
  constructor(
    message: string,
    readonly code = '',
    readonly raw = '',
    /** Nhom ma theo src/pavietnam/maLoi.ts; rong khi loi khong den tu ReturnCode. */
    readonly nhom: NhomMa | '' = '',
  ) {
    super(message);
    this.name = 'RegistrarError';
  }
}
