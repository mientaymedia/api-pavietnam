/**
 * Danh muc bieu mau ho so ten mien cho trang /bieu-mau-ho-so.
 *
 * Vi sao chi dan link, khong luu file: MienTay Media la dai ly, ho so cuoi cung
 * nop cho nha dang ky P.A Viet Nam. P.A co nghia vu cong bo bieu mau (Dieu 12
 * khoan 3 diem b ND 147/2024), nen ban dung la ban tren trang P.A; luu ban sao
 * vao repo thi P.A doi mau la minh lech ma khong ai biet. Mau nao P.A chua co
 * (ho kinh doanh theo TT 48/2025) thi dan ve van ban goc tren cong chinh thuc.
 *
 * Moi link da kiem bang curl ngay 18/10/2026 (200). Nguon: trang
 * https://www.pavietnam.vn/vn/bieu-mau-ho-so/ (khoi Google Docs la ban moi
 * nhat P.A dang hien), Cong Chinh phu, VNNIC. Khong dung file cua nha dang ky khac.
 */

export interface LinkTai {
  nhan: string;
  url: string;
}

export interface BieuMau {
  ten: string;
  /** Mau so theo van ban nha nuoc, hoac ghi ro la mau cua nha dang ky. */
  canCu: string;
  tai: LinkTai[];
  ghiChu?: string;
}

export interface NhomBieuMau {
  id: string;
  ten: string;
  muc: BieuMau[];
}

const PA_TRANG = 'https://www.pavietnam.vn/vn/bieu-mau-ho-so/';
const PA_TAI = 'https://www.pavietnam.vn/download/Bieu_mau_ho_so_dang_ky';
const TT48_PDF = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/12/48-bkhcn.pdf';
const ND115_PDF = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/6/115-nd.signed.pdf';

const TT48 = 'Thông tư 48/2025/TT-BKHCN';
const ND115 = 'Nghị định 115/2025/NĐ-CP';
const MAU_PA = 'Mẫu của nhà đăng ký P.A Việt Nam';

const vanBanTT48: LinkTai = { nhan: 'Văn bản gốc TT 48/2025 (Phụ lục II, PDF)', url: TT48_PDF };
const vanBanND115: LinkTai = { nhan: 'Văn bản gốc NĐ 115/2025 (PDF)', url: ND115_PDF };
const docTCVn = 'https://docs.google.com/document/d/1b5p3OQlawaQt6PD_VvHPgN1CePWWYOLX/edit';

// P.A chua dang mau rieng cho ho kinh doanh (01b, 03b): ghi ro de khach khong
// tuong minh quen, va de chu biet con viec hoi P.A (plan, muc can chu xac minh).
const CHUA_CO_HKD =
  'P.A Việt Nam chưa đăng mẫu riêng cho hộ kinh doanh; mẫu gốc nằm trong Phụ lục II của Thông tư (bản scan). Liên hệ hotline để được hướng dẫn.';

export const NHOM_BIEU_MAU: NhomBieuMau[] = [
  {
    id: 'dang-ky',
    ten: 'Đăng ký tên miền',
    muc: [
      {
        ten: 'Bản khai đăng ký tên miền .vn cho cá nhân',
        canCu: `Mẫu số 01c, Phụ lục II ${TT48}`,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://docs.google.com/document/d/16pIU30fsG4te8mnWk3yZK354k8OT-KEV/edit' }],
      },
      {
        ten: 'Bản khai đăng ký tên miền .vn cho cơ quan, tổ chức, doanh nghiệp',
        canCu: `Mẫu số 01a, Phụ lục II ${TT48}`,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: docTCVn }],
      },
      {
        ten: 'Bản khai đăng ký tên miền .vn cho hộ kinh doanh',
        canCu: `Mẫu số 01b, Phụ lục II ${TT48}`,
        tai: [vanBanTT48],
        ghiChu: CHUA_CO_HKD,
      },
      {
        ten: 'Xác nhận của cha, mẹ hoặc người giám hộ (chủ thể dưới 18 tuổi)',
        canCu: `Mẫu số 02, Phụ lục II ${TT48}`,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://docs.google.com/document/d/1tqM5G8hF3exLj38bnbTPchOyxsT_l1hL0iFn9mz79d4/edit' }],
      },
      {
        ten: 'Tên miền .edu.vn (cơ quan, tổ chức giáo dục)',
        canCu: `Mẫu số 01a, Phụ lục II ${TT48}`,
        tai: [{ nhan: 'Tải bản khai tổ chức (P.A Việt Nam)', url: docTCVn }],
        ghiChu: 'Chỉ cơ quan, tổ chức giáo dục được đăng ký .edu.vn; dùng bản khai của tổ chức.',
      },
      {
        ten: 'Tên miền .gov.vn (cơ quan nhà nước)',
        canCu: `${MAU_PA}: bản khai và bản cam kết, giải trình`,
        tai: [
          { nhan: 'Tải bản khai .gov.vn (P.A Việt Nam)', url: `${PA_TAI}/Mau_danh_cho_co_quan_to_chuc_dang_ky_ten_mien_duoi_GOV_VN_ten_mien_giu_cho/Ban_khai_dang_ky_ten_mien_GOV_VN.zip` },
          { nhan: 'Tải bản cam kết .gov.vn (P.A Việt Nam)', url: 'https://pavietnam.vn/download/ban_cam_ket_dang_ky_domain_gov_vn.zip' },
        ],
      },
      {
        ten: 'Tên miền có từ khóa báo chí, tạp chí, tin tức',
        canCu: `${MAU_PA}: bản cam kết và giải trình`,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: `${PA_TAI}/Ban_cam_ket_va_giai_trinh_ve_viec_dang_ky_ten_mien_VN/Ban_cam_ket_va_giai_trinh_ve_viec_dang_ky_ten_mien_bao_chi_tap_chi_tin_tuc.zip` }],
      },
      {
        ten: 'Tên miền .name.vn',
        canCu: `${MAU_PA}: bản cam kết và giải trình`,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://pavietnam.vn/download/doc/CamKetGiaiTrinhTenMien.Name.VN.docx' }],
      },
      {
        ten: 'Bản khai đăng ký tên miền quốc tế',
        canCu: `${MAU_PA} (nhà nước không ban hành mẫu cho tên miền quốc tế)`,
        tai: [
          { nhan: 'Tải mẫu cá nhân (P.A Việt Nam)', url: `${PA_TAI}/Mau_danh_cho_ca_nhan/Ban_khai_dang_ky_ten_mien_quoc_te.zip` },
          { nhan: 'Tải mẫu tổ chức (P.A Việt Nam)', url: `${PA_TAI}/Mau_danh_cho_co_quan_to_chuc_doanh_nghiep/Ban_khai_dang_ky_ten_mien_quoc_te.zip` },
        ],
      },
    ],
  },
  {
    id: 'thay-doi',
    ten: 'Thay đổi thông tin, chuyển đổi chủ thể',
    muc: [
      {
        ten: 'Bản khai thay đổi thông tin tên miền .vn',
        canCu: MAU_PA,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://pavietnam.vn/download/don_thay_doi_thong_tin.zip' }],
      },
      {
        ten: 'Bản khai cập nhật thông tin tên miền .vn và quốc tế',
        canCu: MAU_PA,
        tai: [
          { nhan: 'Tải mẫu cá nhân (P.A Việt Nam)', url: 'https://pavietnam.vn/download/Ban_khai_cap_nhat_thong_tin_ten_mien_Ca_nhan.zip' },
          { nhan: 'Tải mẫu tổ chức (P.A Việt Nam)', url: 'https://pavietnam.vn/download/Ban_khai_cap_nhat_thong_tin_ten_mien_Cong_ty.zip' },
        ],
      },
      {
        ten: 'Bản khai chuyển đổi chủ thể đăng ký sử dụng tên miền .vn',
        canCu: `Điều 55 và Mẫu số 27 ${ND115}`,
        tai: [
          { nhan: 'Tải mẫu cá nhân (P.A Việt Nam)', url: 'https://docs.google.com/document/d/1hPaafwRFWCjtZnVR4JHcy5Vlk6xomrEk/edit' },
          { nhan: 'Tải mẫu tổ chức (P.A Việt Nam)', url: `${PA_TAI}/Mau_danh_cho_co_quan_to_chuc_doanh_nghiep/Don_de_nghi_thay_doi_ten_chu_the_ten_mien_VN.zip` },
          vanBanND115,
        ],
        ghiChu: 'Trên trang P.A Việt Nam, mẫu này mang tên "Đơn đề nghị thay đổi tên chủ thể tên miền .VN". Dùng khi đổi chủ thể do tặng, cho, góp vốn, thừa kế, đổi tên, sáp nhập.',
      },
    ],
  },
  {
    id: 'chuyen-nha-dang-ky',
    ten: 'Chuyển nhà đăng ký',
    muc: [
      {
        ten: 'Đơn chuyển tên miền từ nhà đăng ký khác về P.A Việt Nam',
        canCu: `${MAU_PA}; điều kiện chuyển theo ${TT48}`,
        tai: [
          { nhan: 'Tải mẫu cá nhân (P.A Việt Nam)', url: 'https://docs.google.com/document/d/1YWJDopV_iKJLy6QdBWPW-XAMJy50r69b/edit' },
          { nhan: 'Tải mẫu tổ chức (P.A Việt Nam)', url: 'https://docs.google.com/document/d/1U_tdU-ojqUJaFHWjisxQsPR7kDi49Fb-/edit' },
        ],
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
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://docs.google.com/document/d/1BKROIbyNo2B7B4u2jruzuf--Sm01vlhvXxWstSMtM38/edit' }],
      },
      {
        ten: 'Biểu mẫu hoàn trả tên miền .vn cho cơ quan, tổ chức, doanh nghiệp',
        canCu: `Mẫu số 03a, Phụ lục II ${TT48}`,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://docs.google.com/document/d/1ul_ws2_sIEkzhRAdeixxe-tJVEFUK7cukyAcNFD4FOg/edit' }],
      },
      {
        ten: 'Biểu mẫu hoàn trả tên miền .vn cho hộ kinh doanh',
        canCu: `Mẫu số 03b, Phụ lục II ${TT48}`,
        tai: [vanBanTT48],
        ghiChu: CHUA_CO_HKD,
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
        tai: [
          { nhan: 'Tải mẫu (P.A Việt Nam)', url: `${PA_TAI}/Mau_ho_so_chuyen_nhuong_ten_mien/Van_ban_de_nghi_chuyen_nhuong_va_nhan_chuyen_nhuong_quyen_su_dung_ten_mien_Internet.zip` },
          vanBanND115,
        ],
      },
      {
        ten: 'Bộ hồ sơ chuyển nhượng tên miền .vn (tổng hợp)',
        canCu: MAU_PA,
        tai: [{ nhan: 'Tải bộ mẫu (P.A Việt Nam)', url: `${PA_TAI}/Mau_ho_so_chuyen_nhuong_ten_mien/Mau_tong_hop_ho_so_chuyen_nhuong_ten_mien_VN.zip` }],
      },
      {
        ten: 'Bộ hồ sơ chuyển nhượng tên miền quốc tế (tổng hợp)',
        canCu: MAU_PA,
        tai: [{ nhan: 'Tải bộ mẫu (P.A Việt Nam)', url: `${PA_TAI}/Mau_ho_so_chuyen_nhuong_ten_mien/Mau_tong_hop_ho_so_chuyen_nhuong_ten_mien_Quoc_te.zip` }],
      },
      {
        ten: 'Bản cam kết không thuộc đối tượng nộp thuế chuyển nhượng',
        canCu: MAU_PA,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: `${PA_TAI}/Mau_ho_so_chuyen_nhuong_ten_mien/Ban_cam_ket_khong_thuoc_doi_tuong_nop_thue_chuyen_nhuong.zip` }],
      },
      {
        ten: 'Bản cam kết hoàn thành nghĩa vụ thuế chuyển nhượng',
        canCu: MAU_PA,
        tai: [
          { nhan: 'Tải mẫu tổ chức (P.A Việt Nam)', url: `${PA_TAI}/Mau_ho_so_chuyen_nhuong_ten_mien/Ban_Cam_Ket_Hoan_Thanh_Nghia_Vu_Thue_ToChuc.zip` },
          { nhan: 'Tải mẫu cá nhân, tổ chức nước ngoài (P.A Việt Nam)', url: `${PA_TAI}/Mau_ho_so_chuyen_nhuong_ten_mien/Ban_cam_ket_hoan_thanh_nghia_vu_nop_thue_theo_quy_dinh_ca_nhan_to_chuc_nuoc_ngoai.zip` },
        ],
      },
      {
        ten: 'Văn bản đề nghị rút hồ sơ chuyển nhượng',
        canCu: MAU_PA,
        tai: [{ nhan: 'Tải mẫu (P.A Việt Nam)', url: 'https://pavietnam.vn/download/Van-ban-de-nghi-rut-ho-so-chuyen-nhuong-quyen-su-dung-ten-mien.zip' }],
      },
    ],
  },
];

/** Van ban goc va trang chinh thuc lien quan, in o cuoi trang. */
export const VAN_BAN_GOC: LinkTai[] = [
  { nhan: `${TT48} về quản lý, sử dụng tài nguyên Internet (PDF, Cổng Thông tin điện tử Chính phủ)`, url: TT48_PDF },
  { nhan: `${TT48} trên trang Bộ Khoa học và Công nghệ`, url: 'https://mst.gov.vn/van-ban-phap-luat/25274.htm' },
  { nhan: `${ND115} (chuyển nhượng, chuyển đổi chủ thể tên miền .vn; PDF)`, url: ND115_PDF },
  { nhan: 'Nghị định 116/2026/NĐ-CP sửa đổi Nghị định 147/2024/NĐ-CP (PDF, VNNIC)', url: 'https://vnnic.vn/sites/default/files/116-ndcp_signed.pdf' },
  { nhan: 'Chính sách, quy định về tên miền .vn (VNNIC)', url: 'https://vnnic.vn/vi/ten-mien-vn/chinh-sach-quy-dinh' },
  { nhan: 'Trang biểu mẫu hồ sơ của nhà đăng ký P.A Việt Nam', url: PA_TRANG },
  { nhan: 'Thông báo sử dụng tên miền quốc tế (thongbaotenmien.vn)', url: 'https://thongbaotenmien.vn' },
  { nhan: 'Danh sách nhà đăng ký tên miền .vn (nhadangky.vn)', url: 'https://nhadangky.vn' },
];

export const HUONG_DAN_VNNIC = 'https://vnnic.vn/vi/ten-mien-vn/danh-cho-chu-the/dang-ky-ten-mien/huong-dan-dang-ky-ten-mien';
export const WHOIS_VNNIC = 'https://vnnic.vn/vi/whois-information?lang=vi';
