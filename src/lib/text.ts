/**
 * Chuan hoa chu de SO KHOP, khong bao gio dung de hien thi.
 *
 * Cac bieu thuc phan loai loi / ket qua cua P.A viet bang ASCII khong dau. P.A
 * (va chu cua chinh he thong) co the tra chu co dau, vd "Ten mien da duoc dang
 * ky" thanh "Tên miền đã được đăng ký": khong boDau thi regex khong khop va mot
 * loi vinh vien bi thu lai, hoac mot phan hoi loi bi coi la thanh cong.
 */
export function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
