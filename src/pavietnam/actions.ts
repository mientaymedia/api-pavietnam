/**
 * BAN DO LENH cua API dai ly P.A Viet Nam, theo tai lieu chinh thuc
 * API_PAVIETNAM.pdf va cac tep demo kem theo (register_domain_vietnam.php, ...).
 *
 * Tham so lenh ten `cmd` (da xac minh voi P.A that 18/10/2026: gui `action`
 * thi bi bao INVALID COMMAND). `check_whois` va `get_whois` da chay that tu IP
 * VPS da whitelist. Cac lenh con lai dung dung ten trong tai lieu; chu nen chay
 * `scripts/pa-thu-endpoint-test.mjs` voi interface_test.php truoc khi ban that.
 *
 * Ten lenh van ghi de duoc qua .env (PA_ACTION_*) phong khi P.A doi ten.
 * Rieng gia han: bang tham so trong tai lieu ghi `renew_domain_vn` nhung ca
 * demo lan link mau deu dung `renew_domain`, nen mac dinh `renew_domain`.
 */

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

export type ActionKey =
  | 'check'          // check_whois: '1' con trong, '0' da co chu
  | 'whois'          // get_whois: van ban WHOIS
  | 'registerVn'     // dang ky ten mien Viet Nam (.vn, .com.vn ...)
  | 'registerIntl'   // dang ky ten mien quoc te
  | 'renew'          // gia han ca hai loai
  | 'dnsVn'          // doi DNS ten mien Viet Nam (bat buoc kem IP)
  | 'dnsIntl'        // doi DNS ten mien quoc te (toi da 4)
  | 'dates'          // ngay dang ky va ngay het han
  | 'balance'        // so du tai khoan dai ly
  | 'owned'          // ten mien co thuoc dai ly khong (ReturnCode 0/1/2)
  | 'infoGet'        // thong tin lien he, chi ten mien quoc te
  | 'infoSet'        // cap nhat thong tin lien he, chi ten mien quoc te
  | 'changePassword' // doi mat khau quan ly ten mien
  | 'country'
  | 'province'
  | 'ward'
  // Ngoai tai lieu P.A: khong co lenh tuong ung. Giu de che do gia lap va
  // man hinh cu van chay; o che do that bi chan truoc khi goi (xem
  // `lenhNgoaiTaiLieu`), tru khi chu tu dat ten lenh qua .env.
  | 'transfer'
  | 'authCode'
  | 'lockSet'
  | 'dnsGet'
  | 'dnsSet'
  | 'list';

/** Bien moi truong ghi de ten lenh cua tung nhom. */
const BIEN_MOI_TRUONG: Record<ActionKey, string> = {
  check: 'PA_ACTION_CHECK',
  whois: 'PA_ACTION_WHOIS',
  registerVn: 'PA_ACTION_REGISTER_VN',
  registerIntl: 'PA_ACTION_REGISTER_INTL',
  renew: 'PA_ACTION_RENEW',
  dnsVn: 'PA_ACTION_DNS_VN',
  dnsIntl: 'PA_ACTION_DNS_INTL',
  dates: 'PA_ACTION_DATES',
  balance: 'PA_ACTION_BALANCE',
  owned: 'PA_ACTION_OWNED',
  infoGet: 'PA_ACTION_INFO_GET',
  infoSet: 'PA_ACTION_INFO_SET',
  changePassword: 'PA_ACTION_CHANGE_PASSWORD',
  country: 'PA_ACTION_COUNTRY',
  province: 'PA_ACTION_PROVINCE',
  ward: 'PA_ACTION_WARD',
  transfer: 'PA_ACTION_TRANSFER',
  authCode: 'PA_ACTION_AUTH_CODE',
  lockSet: 'PA_ACTION_LOCK_SET',
  dnsGet: 'PA_ACTION_DNS_GET',
  dnsSet: 'PA_ACTION_DNS_SET',
  list: 'PA_ACTION_LIST',
};

const MAC_DINH: Record<ActionKey, string> = {
  check: 'check_whois',
  whois: 'get_whois',
  registerVn: 'register_domain_vietnam',
  registerIntl: 'register_domain_quocte',
  renew: 'renew_domain',
  dnsVn: 'change_dns_domain_vietnam',
  dnsIntl: 'change_dns_domain_quocte',
  dates: 'get_date_domain',
  balance: 'check_account_still',
  owned: 'check_domain',
  infoGet: 'get_info_domain',
  infoSet: 'set_info_domain',
  changePassword: 'change_password_domain',
  country: 'get_country',
  province: 'get_province',
  ward: 'get_ward',
  transfer: 'transferdomain',
  authCode: 'geteppcode',
  lockSet: 'lockdomain',
  dnsGet: 'getdns',
  dnsSet: 'updatedns',
  list: 'listdomain',
};

/** Ten lenh dang dung (co the ghi de qua .env). */
export const ACTIONS = Object.fromEntries(
  (Object.keys(MAC_DINH) as ActionKey[]).map((k) => [k, env(BIEN_MOI_TRUONG[k], MAC_DINH[k])]),
) as Record<ActionKey, string>;

const NGOAI_TAI_LIEU: ActionKey[] = ['transfer', 'authCode', 'lockSet', 'dnsGet', 'dnsSet', 'list'];

/**
 * Nhom lenh khong co trong tai lieu P.A va chu chua tu dat ten lenh qua .env.
 * Goi that se chi nhan 600 "Lenh thuc thi khong duoc ho tro", nen chan som va
 * bao ro cho khach thay vi hien loi ky thuat.
 */
export function lenhNgoaiTaiLieu(key: ActionKey): boolean {
  return NGOAI_TAI_LIEU.includes(key) && !process.env[BIEN_MOI_TRUONG[key]]?.trim();
}

/**
 * Lenh GHI: tai lieu chi co link chay thu (interface_test.php) cho nhom nay.
 * Khi bat che do thu, chi nhom nay di endpoint thu; lenh doc van di endpoint
 * that de tim ten mien, so du, ngay het han van dung.
 */
export function laLenhGhi(action: string): boolean {
  return [ACTIONS.registerVn, ACTIONS.registerIntl, ACTIONS.renew, ACTIONS.dnsVn, ACTIONS.dnsIntl,
    ACTIONS.changePassword, ACTIONS.infoSet].includes(action);
}

/**
 * Lenh tra so tran / van ban thuan, khong gui `responsetype=json`: hai lenh
 * nay dang chay that dung nhu vay, giu nguyen.
 */
export function guiResponseTypeJson(action: string): boolean {
  return action !== ACTIONS.check && action !== ACTIONS.whois;
}

/**
 * Ten tham so dung chung. Tham so dang ky / doi DNS nam o `thamSo.ts` theo
 * dung ten trong tai lieu (domainName, ownerName, uiGender ...).
 */
export const FIELDS = {
  /** Ten tham so chua ten lenh. P.A dung `cmd` (gui `action` se bi bao INVALID COMMAND). */
  command: env('PA_FIELD_COMMAND', 'cmd'),
  domain: 'domain',
  years: 'year',
  // Ten tham so cua cac lenh ngoai tai lieu (chi dung o che do gia lap)
  ns: 'ns',
  authCode: 'authcode',
  lock: 'lock',
  recordType: 'type',
  recordName: 'name',
  recordValue: 'value',
  recordTtl: 'ttl',
  recordPriority: 'priority',
} as const;

/**
 * Ten cac truong co the xuat hien trong phan hoi khong theo dinh dang
 * Command/ReturnCode (che do gia lap, lenh ngoai tai lieu), theo thu tu uu tien.
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
  transactionId: ['trans_id', 'transactionid', 'transaction_id', 'orderid', 'order_id', 'id', 'ref'],
  authCode: ['authcode', 'auth_code', 'eppcode', 'epp_code', 'epp', 'transferkey', 'password'],
  lock: ['lock', 'locked', 'lockstatus', 'transferlock', 'clientupdateprohibited'],
  records: ['records', 'record', 'rows', 'data', 'items', 'list'],
} as const;

/** Cac gia tri status duoc coi la THANH CONG (phan hoi khong co ReturnCode). */
export const SUCCESS_TOKENS = new Set([
  'ok', 'success', 'successful', 'true', '1', '0', '200', 'done', 'completed', 'thanhcong',
]);
