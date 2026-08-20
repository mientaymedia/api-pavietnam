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
  providerRef: string;
  expiresAt?: string;
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
  address?: string;
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
  ) {
    super(message);
    this.name = 'RegistrarError';
  }
}
