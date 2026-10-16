/**
 * Kiem tra dich chuyen huong lay tu du lieu nguoi dung (next=, Referer).
 *
 * Chi chap nhan duong dan NOI BO: mot dau '/' roi toi ten trang. Moi dang dua
 * sang host khac deu bi loai: dia chi tuyet doi (https://), giao thuc tuong
 * doi (//evil.com), va `/\evil.com` (trinh duyet doi \ thanh / nen no cung la
 * //evil.com).
 *
 * Kiem chuoi tho roi moi chuan hoa la KHONG DU: URL parser bo cac doan dau
 * cham, `/.//evil.com`, `/a/..//evil.com`, `/%2e//evil.com` deu thanh pathname
 * `//evil.com`. Vi vay phai kiem lai KET QUA sau khi chuan hoa, tuc dung chuoi
 * se nam trong header Location.
 */

const GOC = 'http://noi-bo.invalid';

// Ky tu dieu khien C0 va DEL. Trinh duyet bo tab/xuong dong ben trong URL
// (`/\t/evil.com` thanh `//evil.com`) va bo ky tu dieu khien o dau.
const DIEU_KHIEN = /[\u0000-\u001f\u007f]/;

/** Chuoi se bi trinh duyet hieu la "sang host khac" neu dat vao Location. */
export function laDiaChiHost(p: string): boolean {
  const gon = p.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '');
  return /^[/\\]{2}/.test(gon);
}

/**
 * Tra duong dan noi bo da chuan hoa (pathname + query + hash), hoac `macDinh`
 * neu gia tri khong an toan. Ket qua chua co tien to BASE_PATH: ban boc
 * res.redirect them dung mot lan.
 */
export function duongDanNoiBo(value: unknown, macDinh: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || DIEU_KHIEN.test(raw)) return macDinh;
  if (raw[0] !== '/' || laDiaChiHost(raw)) return macDinh;

  try {
    const u = new URL(raw, GOC);
    if (u.origin !== GOC) return macDinh;
    const kq = `${u.pathname}${u.search}${u.hash}`;
    // Kiem lai sau chuan hoa: day la cho /.//evil.com tung lot qua.
    if (!kq.startsWith('/') || laDiaChiHost(kq) || DIEU_KHIEN.test(kq)) return macDinh;
    if (new URL(kq, GOC).origin !== GOC) return macDinh;
    return kq;
  } catch {
    return macDinh;
  }
}
