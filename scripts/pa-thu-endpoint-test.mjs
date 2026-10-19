/**
 * Chay thu cac lenh GHI cua P.A voi ENDPOINT THU (interface_test.php): P.A tra
 * 900 "Thuc hien thanh cong (Che do chay test)", khong tru tien, khong dang ky that.
 * Dung tren VPS (IP da whitelist), vi may dev khong goi duoc P.A.
 *
 *   PA_USERNAME=... PA_APIKEY=... PA_ENDPOINT=https://daily.pavietnam.vn/interface_test.php \
 *     node scripts/pa-thu-endpoint-test.mjs
 *
 * Thieu PA_USERNAME / PA_APIKEY thi lay PAVIETNAM_USERNAME / PAVIETNAM_APIKEY (cung
 * ten trong .env); thieu PA_ENDPOINT thi lay PAVIETNAM_ENDPOINT_TEST.
 *
 * Goi lan luot: dang ky .vn ca nhan, .com.vn cong ty, .com; gia han; doi DNS .vn
 * (kem IP) va .com. In Command / ReturnCode / ReturnText, KHONG in apikey.
 * TU CHOI chay neu duong dan endpoint khong phai /interface_test.php: lenh ghi
 * goi nham interface.php la dang ky that, tru tien that.
 *
 * Tham so dung CHINH bo dung tham so cua app (dist/pavietnam/thamSo.js, can
 * `npm run build` truoc; chay bang tsx thi doc thang src).
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const username = (process.env.PA_USERNAME || process.env.PAVIETNAM_USERNAME || '').trim();
const apikey = (process.env.PA_APIKEY || process.env.PAVIETNAM_APIKEY || '').trim();
const endpoint = (process.env.PA_ENDPOINT || process.env.PAVIETNAM_ENDPOINT_TEST || '').trim();

function tuChoi(msg, code = 2) {
  console.error(`DỪNG: ${msg}`);
  process.exit(code);
}

let url;
try {
  url = new URL(endpoint);
} catch {
  tuChoi('PA_ENDPOINT không phải URL hợp lệ. Ví dụ: https://daily.pavietnam.vn/interface_test.php');
}
if (!/\/interface_test\.php$/i.test(url.pathname) || url.search) {
  tuChoi(`endpoint ${url.origin}${url.pathname} không phải interface_test.php. Script này chỉ chạy với endpoint THỬ để không đăng ký thật, không trừ tiền.`);
}
if (!username || !apikey) tuChoi('thiếu PA_USERNAME hoặc PA_APIKEY (hoặc PAVIETNAM_USERNAME / PAVIETNAM_APIKEY).');
if (url.hostname !== 'daily.pavietnam.vn') console.log(`Lưu ý: endpoint không phải daily.pavietnam.vn (${url.hostname}).`);

async function napThamSo() {
  const dist = path.join(root, 'dist', 'pavietnam', 'thamSo.js');
  if (existsSync(dist)) return import(pathToFileURL(dist).href);
  try {
    return await import(pathToFileURL(path.join(root, 'src', 'pavietnam', 'thamSo.ts')).href);
  } catch {
    tuChoi('không tìm thấy dist/pavietnam/thamSo.js. Chạy `npm run build` trước (hoặc chạy bằng `node --import tsx`).');
  }
}

const { thamSoDangKy, thamSoGiaHan, thamSoDoiDnsVn, thamSoDoiDnsQuocTe, sinhMatKhauTenMien } = await napThamSo();

// Du lieu mau: dinh dang dung, ten mien ngau nhien. Endpoint thu khong luu gi.
const duoi = Date.now().toString(36);
const CA_NHAN = {
  kind: 'individual', fullName: 'Nguyễn Văn Thử', idNumber: '089090000001', email: 'hello@mientaymedia.com',
  phone: '0976788840', address: '12A5 Lê Thị Hồng Gấm', ward: 'Phường Bình Đức', province: 'Tỉnh An Giang',
  birthDate: '1990-01-01', gender: 'Nam',
};
const CONG_TY = {
  kind: 'organization', orgName: 'Công ty TNHH Phần mềm Mientay Media', taxCode: '1602182849', fullName: 'Đinh Văn Tạo Em',
  idNumber: '089090000002', email: 'hello@mientaymedia.com', phone: '0976788840', address: '12A5 Lê Thị Hồng Gấm',
  ward: 'Phường Bình Đức', province: 'Tỉnh An Giang', birthDate: '1990-01-01', gender: 'Nam',
};
const NS = ['ns1.pavietnam.vn', 'ns2.pavietnam.vn'];
const tenVn = `mtmthu${duoi}.vn`;
const tenComVn = `mtmthu${duoi}.com.vn`;
const tenCom = `mtmthu${duoi}.com`;

const lenh = [
  ['register_domain_vietnam', '.vn cá nhân', thamSoDangKy({ domain: tenVn, tld: 'vn', years: 1, password: sinhMatKhauTenMien(), nameservers: NS, contact: CA_NHAN })],
  ['register_domain_vietnam', '.com.vn công ty', thamSoDangKy({ domain: tenComVn, tld: 'com.vn', years: 1, password: sinhMatKhauTenMien(), nameservers: NS, contact: CONG_TY })],
  ['register_domain_quocte', '.com cá nhân', thamSoDangKy({ domain: tenCom, tld: 'com', years: 1, password: sinhMatKhauTenMien(), nameservers: NS, contact: CA_NHAN })],
  [process.env.PA_ACTION_RENEW || 'renew_domain', `gia hạn ${tenVn}`, thamSoGiaHan(tenVn, 1)],
  ['change_dns_domain_vietnam', `đổi DNS ${tenVn} (kèm IP)`, thamSoDoiDnsVn(tenVn, [{ host: 'ns1.pavietnam.vn', ip: '112.213.89.3' }, { host: 'ns2.pavietnam.vn', ip: '222.255.89.247' }])],
  ['change_dns_domain_quocte', `đổi DNS ${tenCom}`, thamSoDoiDnsQuocTe(tenCom, NS)],
];

console.log(`Endpoint: ${url.origin}${url.pathname}`);
console.log(`Username: ${username}`);
console.log('');

let tatCa900 = true;
for (const [cmd, moTa, thamSo] of lenh) {
  const q = new URLSearchParams({ cmd, username, apikey, ...thamSo, responsetype: 'json' });
  let tho = '';
  try {
    const r = await fetch(`${url.origin}${url.pathname}?${q.toString()}`, { signal: AbortSignal.timeout(30_000) });
    tho = (await r.text()).replace(/^﻿/, '').trim();
  } catch (err) {
    tho = `LỖI MẠNG: ${err instanceof Error ? err.message : String(err)}`;
  }
  let command = '';
  let returnCode = '';
  let returnText = '';
  try {
    const o = JSON.parse(tho);
    command = String(o.Command ?? '');
    returnCode = String(o.ReturnCode ?? '');
    returnText = String(o.ReturnText ?? '');
  } catch {
    const m = /\[ReturnCode\]\s*=>\s*(\d+)/.exec(tho);
    returnCode = m?.[1] ?? '';
    returnText = /\[ReturnText\]\s*=>\s*([^\n\r)]*)/.exec(tho)?.[1]?.trim() ?? tho.slice(0, 200);
  }
  // Phong P.A vong lai tham so: khong bao gio in apikey
  const an = (s) => s.split(apikey).join('***');
  if (returnCode !== '900') tatCa900 = false;
  console.log(`[${moTa}] cmd=${cmd}`);
  console.log(`  Command=${an(command)} ReturnCode=${returnCode || '(không có)'} ReturnText=${an(returnText)}`);
}

console.log('');
console.log(tatCa900 ? 'KẾT QUẢ: tất cả trả 900 (thành công ở chế độ chạy test).' : 'KẾT QUẢ: có lệnh không trả 900, xem ReturnCode ở trên.');
// exitCode thay vi process.exit: thoat ngang khi ket noi fetch con mo lam Node tren Windows sap
process.exitCode = tatCa900 ? 0 : 1;
