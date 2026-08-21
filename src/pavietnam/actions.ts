/**
 * BAN DO ACTION cua API dai ly P.A Viet Nam.
 *
 * ------------------------------------------------------------------------
 *  QUAN TRONG - DOC TRUOC KHI CHAY THAT
 * ------------------------------------------------------------------------
 * Tai lieu API dai ly cua P.A (kb.pavietnam.vn) chi truy cap duoc tu mang
 * cua ban, khong the doi chieu tu moi truong build. Vi vay ten `action` va
 * ten tham so duoc khai bao TAP TRUNG tai file nay va co the ghi de bang
 * bien moi truong, de khi doi chieu tai lieu ban chi sua o MOT cho.
 *
 * Cach xac minh nhanh (chay tu may co IP da whitelist voi P.A):
 *
 *     npm run pa:probe -- --domain vidu.com
 *
 * Lenh tren goi lan luot cac action ung vien va in ra phan hoi tho, giup ban
 * chot dung ten action. Sau do dat lai trong .env, vi du:
 *
 *     PA_ACTION_CHECK=checkdomain
 *     PA_ACTION_REGISTER=regdomain
 *
 * Khong can sua code ung dung.
 */

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

export type ActionKey =
  | 'check'
  | 'register'
  | 'renew'
  | 'transfer'
  | 'authCode'      // lay ma EPP de chuyen ten mien di
  | 'lockSet'       // khoa / mo khoa chuyen doi
  | 'whois'
  | 'dnsGet'
  | 'dnsSet'
  | 'nsSet'
  | 'list'
  | 'info'
  | 'balance';

/** Ten action dang dung (co the ghi de qua .env). */
export const ACTIONS: Record<ActionKey, string> = {
  check: env('PA_ACTION_CHECK', 'checkdomain'),
  register: env('PA_ACTION_REGISTER', 'regdomain'),
  renew: env('PA_ACTION_RENEW', 'renewdomain'),
  transfer: env('PA_ACTION_TRANSFER', 'transferdomain'),
  authCode: env('PA_ACTION_AUTH_CODE', 'geteppcode'),
  lockSet: env('PA_ACTION_LOCK_SET', 'lockdomain'),
  whois: env('PA_ACTION_WHOIS', 'whois'),
  dnsGet: env('PA_ACTION_DNS_GET', 'getdns'),
  dnsSet: env('PA_ACTION_DNS_SET', 'updatedns'),
  nsSet: env('PA_ACTION_NS_SET', 'changens'),
  list: env('PA_ACTION_LIST', 'listdomain'),
  info: env('PA_ACTION_INFO', 'domaininfo'),
  balance: env('PA_ACTION_BALANCE', 'balance'),
};

/**
 * Cac ten action ung vien - dung cho `npm run pa:probe` de do xem P.A chap nhan ten nao.
 * Khong dung trong luong chay that.
 */
export const ACTION_CANDIDATES: Record<ActionKey, string[]> = {
  check: ['checkdomain', 'check', 'domaincheck', 'checkdomains', 'availability'],
  register: ['regdomain', 'register', 'registerdomain', 'adddomain', 'createdomain'],
  renew: ['renewdomain', 'renew', 'extenddomain', 'gia_han'],
  transfer: ['transferdomain', 'transfer', 'movedomain', 'transferin', 'chuyen_ve'],
  authCode: ['geteppcode', 'getepp', 'getauthcode', 'authcode', 'eppcode', 'getauthinfo'],
  lockSet: ['lockdomain', 'setlock', 'domainlock', 'updatelock', 'setdomainlock'],
  whois: ['whois', 'domainwhois', 'whoisdomain'],
  dnsGet: ['getdns', 'listdns', 'getrecord', 'dnsinfo', 'getdnsrecord'],
  dnsSet: ['updatedns', 'setdns', 'adddns', 'dnsupdate', 'updaterecord'],
  nsSet: ['changens', 'updatens', 'setns', 'changenameserver', 'updatenameserver'],
  list: ['listdomain', 'listdomains', 'getdomains', 'domainlist'],
  info: ['domaininfo', 'getdomaininfo', 'infodomain', 'getdomain'],
  balance: ['balance', 'checkbalance', 'getbalance', 'accountinfo'],
};

/**
 * Ten tham so gui len API. Cung co the ghi de qua .env neu tai lieu dung ten khac.
 */
export const FIELDS = {
  domain: env('PA_FIELD_DOMAIN', 'domain'),
  years: env('PA_FIELD_YEARS', 'year'),
  ns: env('PA_FIELD_NS', 'ns'),
  /** Ma xac thuc chuyen ten mien (EPP / Auth Code) do nha dang ky cu cap. */
  authCode: env('PA_FIELD_AUTH_CODE', 'authcode'),
  /** Gia tri bat/tat khoa chuyen doi. */
  lock: env('PA_FIELD_LOCK', 'lock'),
  recordType: env('PA_FIELD_RECORD_TYPE', 'type'),
  recordName: env('PA_FIELD_RECORD_NAME', 'name'),
  recordValue: env('PA_FIELD_RECORD_VALUE', 'value'),
  recordTtl: env('PA_FIELD_RECORD_TTL', 'ttl'),
  recordPriority: env('PA_FIELD_RECORD_PRIORITY', 'priority'),
} as const;

/**
 * Ten cac truong co the xuat hien trong phan hoi, theo thu tu uu tien khi doc.
 * Parser se thu lan luot -> khong phu thuoc mot dinh dang duy nhat.
 */
export const RESPONSE_KEYS = {
  status: ['status', 'result', 'code', 'errorcode', 'error_code', 'ketqua'],
  message: ['message', 'msg', 'description', 'error', 'errormessage', 'error_message', 'note', 'thongbao'],
  available: ['available', 'availability', 'isavailable', 'is_available', 'free', 'status'],
  domain: ['domain', 'domainname', 'domain_name', 'tenmien'],
  expires: ['expires', 'expiredate', 'expire_date', 'expired', 'expirationdate', 'exp_date', 'ngayhethan'],
  created: ['created', 'createdate', 'create_date', 'registered', 'registerdate', 'ngaydangky'],
  nameservers: ['ns', 'nameserver', 'nameservers', 'dns', 'name_server'],
  registrar: ['registrar', 'sponsor', 'nhadangky'],
  transactionId: ['transactionid', 'transaction_id', 'orderid', 'order_id', 'id', 'ref'],
  balance: ['balance', 'sodu', 'credit', 'amount'],
  authCode: ['authcode', 'auth_code', 'eppcode', 'epp_code', 'epp', 'transferkey', 'password'],
  lock: ['lock', 'locked', 'lockstatus', 'transferlock', 'clientupdateprohibited'],
  records: ['records', 'record', 'rows', 'data', 'items', 'list'],
} as const;

/** Cac gia tri status duoc coi la THANH CONG. */
export const SUCCESS_TOKENS = new Set([
  'ok', 'success', 'successful', 'true', '1', '0', '200', 'done', 'completed', 'thanhcong',
]);

/**
 * Luu y ve ma trang thai: mot so API tra `code=0` nghia la thanh cong, so khac
 * tra `status=1`. Vi vay ca '0' va '1' deu nam trong danh sach thanh cong, va
 * ta uu tien doc `status`/`result` (dang chu) truoc `code` (dang so).
 */
