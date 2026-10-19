/**
 * Chinh sach bao mat noi dung (Content-Security-Policy).
 *
 * Muc dich: neu co mot lo XSS lot qua, trinh duyet van tu choi chay ma cua ke
 * tan cong. Day la lop chan CUOI CUNG - khong thay the viec escape du lieu, ma
 * la luoi do phia sau.
 *
 * Ghi chu trung thuc ve `style-src 'unsafe-inline'`:
 * Giao dien hien dung 212 thuoc tinh `style="..."` nam rai trong 35 tep view.
 * Chuan CSP KHONG cho phep dung nonce hay hash cho thuoc tinh style, nen chi co
 * hai lua chon: hoac giu 'unsafe-inline', hoac go sach ca 212 cho. Chung toi
 * giu 'unsafe-inline' cho style va siet chat `script-src` - vi script moi la
 * duong tan cong that su. Muon siet not style thi phai don giao dien truoc.
 */
import { config } from '../config.js';
import { settings } from './settings.js';

/**
 * Nguon cho widget chat Zalo (sp.zalo.me/plugins/sdk.js), do bang Chrome
 * headless 19/10/2026 voi CSP that: chi hai mien bi chan khi chua mo.
 *  - script: sdk.js o sp.zalo.me; sdk.js tu nap them za.zdn.vn/v3/za.js bang
 *    duong dan `//` (theo giao thuc cua trang). Ghi khong kem giao thuc de tren
 *    HTTPS chi khop https (may dev http van chay); chan thi console bao loi CSP.
 *  - frame: khung chat page.widget.zalo.me; giu `*.zalo.me` vi Zalo co the doi
 *    mien con cua khung, van chi trong mien zalo.me.
 * Khong can img-src, connect-src hay style-src them: anh, goi mang va CSS cua
 * hop chat nam trong iframe (CSP cua Zalo), con kieu noi tuyen sdk.js gan vao
 * khung da duoc 'unsafe-inline' cua style-src cho phep. Khong mo unsafe-inline
 * hay unsafe-eval cho script.
 */
export const ZALO_CSP = {
  script: ['https://sp.zalo.me', 'za.zdn.vn'],
  frame: ['https://*.zalo.me'],
};

/** Lay phan goc (scheme + host) cua mot dia chi, bo qua neu khong hop le. */
function goc(url: string): string | null {
  const sach = String(url ?? '').trim();
  if (!sach || sach.startsWith('/') || sach.startsWith('data:')) return null;
  try {
    const u = new URL(sach);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Dung chuoi CSP.
 *
 * `img-src` phai mo hon cac muc khac vi vai anh khong nam tren may chu nay:
 *  - ma QR chuyen khoan do SePay sinh (qr.sepay.vn)
 *  - logo do quan tri vien tu dat, co the tro toi bat ky dau
 *  - bieu tuong "da thong bao" (ND 248/2026) neu quan tri dat anh o ngoai
 * Ta chi mo dung cac nguon do chu khong mo `https:` chung chung.
 *
 * `zaloChat`: trang khach co nut chat Zalo (partials/zalo-chat.ejs) thi mo them
 * dung cac mien widget chinh thuc can, do bang Chrome headless 19/10/2026 (xem
 * ZALO_CSP). Trang quan tri va khi tat cau hinh thi khong mo gi them.
 */
export function buildCsp(opts: { zaloChat?: boolean } = {}): string {
  const anh = new Set<string>(["'self'", 'data:']);

  const qr = goc('https://qr.sepay.vn');
  if (qr) anh.add(qr);

  const logo = goc(settings.site().logoUrl);
  if (logo) anh.add(logo);

  const bieuTuong = goc(settings.site().bctBadgeImg);
  if (bieuTuong) anh.add(bieuTuong);

  const z = opts.zaloChat ? ZALO_CSP : null;

  const chiThi: string[] = [
    "default-src 'self'",
    `script-src 'self'${z ? ' ' + z.script.join(' ') : ''}`, // khong co script noi tuyen nao trong ma nguon
    "style-src 'self' 'unsafe-inline'", // xem ghi chu dau tep
    `img-src ${[...anh].join(' ')}`,
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",             // chan cuop bieu mau gui du lieu ra ngoai
    "frame-ancestors 'self'",         // tuong duong X-Frame-Options: SAMEORIGIN
    "base-uri 'none'",                // chan chen <base> de doi goc duong dan tuong doi
    "object-src 'none'",              // khong dung <object>/<embed>
  ];
  if (z) chiThi.push(`frame-src ${z.frame.join(' ')}`);

  // Tren may that (chay HTTPS) thi ep moi tai nguyen http len https
  if (config.isProd) chiThi.push('upgrade-insecure-requests');

  return chiThi.join('; ');
}
