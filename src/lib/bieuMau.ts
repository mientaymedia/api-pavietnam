/**
 * Danh muc bieu mau ho so ten mien cho trang /bieu-mau-ho-so.
 *
 * Vi sao chi dan link, khong luu file: mau nha nuoc (TT 48/2025, ND 115/2025)
 * dan thang ve van ban goc tren cong chinh thuc, luu ban sao vao repo thi van
 * ban sua la minh lech ma khong ai biet.
 *
 * Mau rieng cua nha dang ky (quoc te, .gov.vn, cam ket, chuyen nhuong...): chu
 * yeu cau 19/10/2026 trang khach khong neu ten, khong link sang nha dang ky, nen
 * danh dau `lienHe` va trang in "Lien he MienTay Media de nhan mau" kem hotline.
 * Nhan vien gui ban moi nhat cua nha dang ky khi khach can.
 *
 * Moi link da kiem bang curl ngay 19/10/2026 (200/206): Cong Chinh phu
 * (datafiles.chinhphu.vn), Bo KH&CN (mst.gov.vn), VNNIC.
 */

export interface LinkTai {
  nhan: string;
  url: string;
}

export interface BieuMau {
  ten: string;
  /** Mau so theo van ban nha nuoc, hoac ghi ro la mau cua nha dang ky. */
  canCu: string;
  /** Rong khi `lienHe`: mau khong cong khai link, khach lien he de nhan. */
  tai: LinkTai[];
  /** Mau rieng cua nha dang ky: trang in loi moi lien he thay cho link tai. */
  lienHe?: boolean;
  ghiChu?: string;
}

export interface NhomBieuMau {
  id: string;
  ten: string;
  muc: BieuMau[];
}

const TT48_PDF = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/12/48-bkhcn.pdf';
const ND115_PDF = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/6/115-nd.signed.pdf';

const TT48 = 'Thông tư 48/2025/TT-BKHCN';
const ND115 = 'Nghị định 115/2025/NĐ-CP';
const TT48_MST = 'https://mst.gov.vn/van-ban-phap-luat/25274.htm';
const MAU_NDK = 'Mẫu riêng của nhà đăng ký';

const vanBanTT48: LinkTai = { nhan: 'Văn bản gốc TT 48/2025 (Phụ lục II, PDF)', url: TT48_PDF };
const vanBanTT48Mst: LinkTai = { nhan: 'TT 48/2025 trên trang Bộ Khoa học và Công nghệ', url: TT48_MST };
const vanBanND115: LinkTai = { nhan: 'Văn bản gốc NĐ 115/2025 (PDF)', url: ND115_PDF };
const TT48_LINK: LinkTai[] = [vanBanTT48, vanBanTT48Mst];

export const NHOM_BIEU_MAU: NhomBieuMau[] = [
  {
    id: 'dang-ky',
    ten: 'Đăng ký tên miền',
    muc: [
      {
        ten: 'Bản khai đăng ký tên miền .vn cho cá nhân',
        canCu: `Mẫu số 01c, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
      {
        ten: 'Bản khai đăng ký tên miền .vn cho cơ quan, tổ chức, doanh nghiệp',
        canCu: `Mẫu số 01a, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
      {
        ten: 'Bản khai đăng ký tên miền .vn cho hộ kinh doanh',
        canCu: `Mẫu số 01b, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
      {
        ten: 'Xác nhận của cha, mẹ hoặc người giám hộ (chủ thể dưới 18 tuổi)',
        canCu: `Mẫu số 02, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
      {
        ten: 'Tên miền .edu.vn (cơ quan, tổ chức giáo dục)',
        canCu: `Mẫu số 01a, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
        ghiChu: 'Chỉ cơ quan, tổ chức giáo dục được đăng ký .edu.vn; dùng bản khai của tổ chức.',
      },
      {
        ten: 'Tên miền .gov.vn (cơ quan nhà nước)',
        canCu: `${MAU_NDK}: bản khai và bản cam kết, giải trình`,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Tên miền có từ khóa báo chí, tạp chí, tin tức',
        canCu: `${MAU_NDK}: bản cam kết và giải trình`,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Tên miền .name.vn',
        canCu: `${MAU_NDK}: bản cam kết và giải trình`,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Bản khai đăng ký tên miền quốc tế',
        canCu: `${MAU_NDK} (nhà nước không ban hành mẫu cho tên miền quốc tế)`,
        tai: [],
        lienHe: true,
      },
    ],
  },
  {
    id: 'thay-doi',
    ten: 'Thay đổi thông tin, chuyển đổi chủ thể',
    muc: [
      {
        ten: 'Bản khai thay đổi thông tin tên miền .vn',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Bản khai cập nhật thông tin tên miền .vn và quốc tế',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Bản khai chuyển đổi chủ thể đăng ký sử dụng tên miền .vn',
        canCu: `Điều 55 và Mẫu số 27 ${ND115}`,
        tai: [vanBanND115],
        ghiChu: 'Dùng khi đổi chủ thể do tặng, cho, góp vốn, thừa kế, đổi tên, sáp nhập.',
      },
    ],
  },
  {
    id: 'chuyen-nha-dang-ky',
    ten: 'Chuyển nhà đăng ký',
    muc: [
      {
        ten: 'Đơn chuyển tên miền từ nhà đăng ký khác về MienTay Media',
        canCu: `${MAU_NDK}; điều kiện chuyển theo ${TT48}`,
        tai: [],
        lienHe: true,
        ghiChu: 'Tên miền .vn không chuyển được trong 60 ngày đầu sau khi đăng ký, trong 30 ngày trước ngày hết hạn, hoặc khi đang bị tạm ngừng.',
      },
    ],
  },
  {
    id: 'hoan-tra',
    ten: 'Hoàn trả tên miền .vn',
    muc: [
      {
        ten: 'Biểu mẫu hoàn trả tên miền .vn cho cá nhân',
        canCu: `Mẫu số 03c, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
      {
        ten: 'Biểu mẫu hoàn trả tên miền .vn cho cơ quan, tổ chức, doanh nghiệp',
        canCu: `Mẫu số 03a, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
      {
        ten: 'Biểu mẫu hoàn trả tên miền .vn cho hộ kinh doanh',
        canCu: `Mẫu số 03b, Phụ lục II ${TT48}`,
        tai: TT48_LINK,
      },
    ],
  },
  {
    id: 'chuyen-nhuong',
    ten: 'Chuyển nhượng quyền sử dụng tên miền',
    muc: [
      {
        ten: 'Văn bản đề nghị chuyển nhượng và nhận chuyển nhượng quyền sử dụng tên miền .vn',
        canCu: `Điều 52 và Mẫu số 24 ${ND115}`,
        tai: [vanBanND115],
      },
      {
        ten: 'Bộ hồ sơ chuyển nhượng tên miền .vn (tổng hợp)',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Bộ hồ sơ chuyển nhượng tên miền quốc tế (tổng hợp)',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Bản cam kết không thuộc đối tượng nộp thuế chuyển nhượng',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Bản cam kết hoàn thành nghĩa vụ thuế chuyển nhượng',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
      {
        ten: 'Văn bản đề nghị rút hồ sơ chuyển nhượng',
        canCu: MAU_NDK,
        tai: [],
        lienHe: true,
      },
    ],
  },
];

/** Van ban goc va trang chinh thuc lien quan, in o cuoi trang. */
export const VAN_BAN_GOC: LinkTai[] = [
  { nhan: `${TT48} về quản lý, sử dụng tài nguyên Internet (PDF, Cổng Thông tin điện tử Chính phủ)`, url: TT48_PDF },
  { nhan: `${TT48} trên trang Bộ Khoa học và Công nghệ`, url: TT48_MST },
  { nhan: `${ND115} (chuyển nhượng, chuyển đổi chủ thể tên miền .vn; PDF)`, url: ND115_PDF },
  { nhan: 'Nghị định 116/2026/NĐ-CP sửa đổi Nghị định 147/2024/NĐ-CP (PDF, VNNIC)', url: 'https://vnnic.vn/sites/default/files/116-ndcp_signed.pdf' },
  { nhan: 'Chính sách, quy định về tên miền .vn (VNNIC)', url: 'https://vnnic.vn/vi/ten-mien-vn/chinh-sach-quy-dinh' },
  { nhan: 'Thông báo sử dụng tên miền quốc tế (thongbaotenmien.vn)', url: 'https://thongbaotenmien.vn' },
  { nhan: 'Danh sách nhà đăng ký tên miền .vn (nhadangky.vn)', url: 'https://nhadangky.vn' },
];

export const HUONG_DAN_VNNIC = 'https://vnnic.vn/vi/ten-mien-vn/danh-cho-chu-the/dang-ky-ten-mien/huong-dan-dang-ky-ten-mien';
export const WHOIS_VNNIC = 'https://vnnic.vn/vi/whois-information?lang=vi';
