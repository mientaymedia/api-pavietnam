/**
 * BANG PHAN LOAI ReturnCode cua P.A (muc III "Danh sach ma loi" trong tai lieu).
 *
 * Moi ma roi vao dung MOT nhom, va nhom quyet dinh viec lam tiep khi cap phat:
 *  - thanh_cong   : ghi nhan
 *  - thieu_quy    : tai khoan dai ly het tien. KHONG hoan cho khach, giu don
 *                   cho chu nap quy roi job tu dang ky lai
 *  - nguoi_xu_ly  : co the da tru tien (606), ten mien bi khoa (302), hoac cau
 *                   hinh dai ly sai (IP, key, lenh). Thu lai hay hoan tu dong
 *                   deu co the sai, nen giu don cho nguoi xem
 *  - du_lieu      : ho so khach sai / thieu (2xxx, 6020-6025, 309...). Thu lai
 *                   y nguyen van sai, nen giu don cho quan tri sua ho so
 *  - vinh_vien    : ten mien da co chu / ten khong hop le. Khong bao gio dang
 *                   ky duoc, hoan tien nhu cu
 *  - tam_thoi     : loi he thong P.A, trung lenh DNS trong 24 gio, mat mang. Thu lai
 */

export type NhomMa = 'thanh_cong' | 'thieu_quy' | 'nguoi_xu_ly' | 'du_lieu' | 'vinh_vien' | 'tam_thoi';

const NGUOI_XU_LY = new Set([
  606, // da tru tien nhung chua vao hang doi
  302, // ten mien dang tam khoa
  301, 605, // gia han trung trong 24 gio: co the lan truoc da gia han duoc
  100, // "Thuc hien khong thanh cong" chung chung
  109, // dai ly chua cam ket chuong trinh dang ky tu dong .vn
  201, 202, // sai username / API key
  304, 305, // gui nham lenh .vn / quoc te: loi cua he thong minh
  403, // khong lay duoc thong tin ban khai
  500, 501, // dich vu khong thuoc dai ly, IP chua duoc phep
  600, 601, 602, 603, // lenh khong ho tro, ten mien dang chuyen / da chuyen / bi khoa
]);

const VINH_VIEN = new Set([101, 303, 102, 103, 104, 105, 106, 107, 209, 402, 404, 405, 604]);

const DU_LIEU = new Set([108, 203, 204, 205, 206, 207, 208, 306, 307, 308, 309, 406]);

const TAM_THOI = new Set([300, 503, 505, 506, 507]);

/**
 * Phan loai mot ReturnCode.
 * @param endpointThu lenh vua roi di endpoint thu (interface_test.php). Chi khi
 *   do 900 moi la thanh cong; 900 tu endpoint that la dau hieu cau hinh lech,
 *   coi nhu chua lam gi va giu cho nguoi xem.
 */
export function phanLoaiMa(ma: number | null | undefined, endpointThu = false): NhomMa {
  if (ma === null || ma === undefined || !Number.isFinite(ma)) return 'tam_thoi';
  if (ma === 200) return 'thanh_cong';
  if (ma === 900) return endpointThu ? 'thanh_cong' : 'nguoi_xu_ly';
  if (ma === 400) return 'thieu_quy';
  if (NGUOI_XU_LY.has(ma)) return 'nguoi_xu_ly';
  if (VINH_VIEN.has(ma)) return 'vinh_vien';
  if (DU_LIEU.has(ma)) return 'du_lieu';
  if (TAM_THOI.has(ma)) return 'tam_thoi';
  // Nhom ma thieu / sai tham so: 2001-2099, 3053-3056, 6000-6099
  if ((ma >= 2000 && ma < 3000) || (ma >= 3053 && ma <= 3056) || (ma >= 6000 && ma < 6100)) return 'du_lieu';
  // Ma la: chua biet nghia, thu lai co gioi han roi giu cho nguoi xem
  return 'tam_thoi';
}

/** Nhan tieng Viet cho trang quan tri. */
export const NHAN_NHOM: Record<NhomMa, string> = {
  thanh_cong: 'Thành công',
  thieu_quy: 'Thiếu quỹ đại lý',
  nguoi_xu_ly: 'Cần người xử lý',
  du_lieu: 'Hồ sơ khách sai hoặc thiếu',
  vinh_vien: 'Không đăng ký được',
  tam_thoi: 'Lỗi tạm thời',
};
