---
type: spec
du_an: footer-phap-ly
buoc: 2 - Design
dau_vao: docs/mtm/footer-phap-ly/intent.md
cap_nhat: 18/10/2026
---

# Spec: footer pháp lý và trang biểu mẫu hồ sơ

Viết tắt: LTMĐT = Luật 122/2025/QH15; NĐ248 = NĐ 248/2026/NĐ-CP; NĐ147 = NĐ 147/2024/NĐ-CP (sửa bởi NĐ 116/2026); TT48 = TT 48/2025/TT-BKHCN; NĐ115 = NĐ 115/2025/NĐ-CP; LBVNTD = Luật 19/2023/QH15; LDLCN = Luật 91/2025/QH15.

## 1. Mục footer và căn cứ

| Mục | Hiện ra | Căn cứ |
|---|---|---|
| Tên doanh nghiệp, trụ sở, mã số doanh nghiệp, ngày cấp, nơi cấp | Khối pháp lý cuối footer, mỗi ý một dòng | Điều 11 khoản 1 điểm a LTMĐT; Điều 4 NĐ248; Điều 37 khoản 1 LBVNTD |
| Người đại diện theo pháp luật | Setting mới `site.legal_rep`, mặc định "Đinh Văn Tạo Em" (nguồn: `D:\mientay-web\web\src\lib\site-data.ts` dòng 58, trang Điều khoản dịch vụ). Để trống thì ẩn dòng | như trên |
| Điện thoại, email, kênh trực tuyến | Cột Liên hệ: hotline, email, "Hỗ trợ trực tuyến" (mientaymedia.com/ho-tro-truc-tuyen) | Điều 7 khoản 1 NĐ248 |
| Vai trò đại lý | "MienTay Media là đại lý của Công ty TNHH P.A Việt Nam, nhà đăng ký tên miền quốc gia .vn và quốc tế. Tên miền do P.A Việt Nam đăng ký, quản lý." | Điều 12 khoản 4 điểm c NĐ147 |
| Biểu tượng đã thông báo | Setting `site.bct_badge_img` + `site.bct_badge_url`; chỉ hiện khi đủ cả hai và link thuộc online.gov.vn. Ảnh ngoài máy chủ thì CSP mở đúng nguồn đó (như logo) | Điều 14 khoản 1 LTMĐT; Điều 45 khoản 2 điểm a NĐ248 |

Cột "Chính sách" (trang đang có, đã curl 200 trên production 18/10/2026):

| Nhãn | Trang | Mục NĐ248 |
|---|---|---|
| Điều kiện giao dịch chung | /dieu-khoan-su-dung | Điều 6 |
| Thỏa thuận sử dụng dịch vụ | /dieu-khoan-dich-vu | Điều 6 (bổ sung) |
| Chính sách giá | /chinh-sach-gia | Điều 8 |
| Điều kiện, hạn chế cung cấp dịch vụ | /dieu-kien-cung-cap-dich-vu | Điều 9 |
| Chính sách thanh toán | /chinh-sach-thanh-toan | Điều 10 |
| Cung cấp, chấm dứt dịch vụ và hoàn tiền | /chinh-sach-hoan-tien | Điều 15, 16 |
| Chính sách bảo mật thông tin | /chinh-sach-quyen-rieng-tu | Điều 5 |
| Bảo vệ dữ liệu cá nhân | /chinh-sach-bao-mat | Điều 5; LDLCN |
| Giải quyết khiếu nại | /phuong-thuc-khieu-nai | Điều 7 |

Cột "Tên miền": giữ 4 link cũ, thêm Biểu mẫu hồ sơ (`/bieu-mau-ho-so`), Quy trình đăng ký (`/bieu-mau-ho-so#quy-trinh-dang-ky`), WHOIS .vn tại VNNIC (https://vnnic.vn/vi/whois-information?lang=vi), Quy định sử dụng tên miền .vn (https://vnnic.vn/vi/ten-mien-vn/chinh-sach-quy-dinh), Báo cáo lạm dụng (mientaymedia.com/quy-trinh-bao-cao-lam-dung).

Không áp dụng (bán dịch vụ, không có tính năng): chính sách giao hàng, đổi trả (Điều 13, 14 NĐ248), livestream (Điều 12), bảo hành.

## 2. Trang `/bieu-mau-ho-so`

- Dữ liệu tách ra `src/lib/bieuMau.ts` (mảng nhóm, mỗi mục: tên, căn cứ, link tải, nguồn) để test kiểm được: mọi link là https tới nguồn chính thức, không có matbao.
- Khối: giới thiệu vai trò đại lý; "Quy trình đăng ký" (6 bước theo đúng luồng của web, dẫn hướng dẫn VNNIC); 5 nhóm biểu mẫu (Đăng ký; Thay đổi thông tin, chuyển đổi chủ thể; Chuyển nhà đăng ký; Hoàn trả; Chuyển nhượng); "Văn bản gốc" (TT48, NĐ115, NĐ116, trang chính sách VNNIC, thongbaotenmien.vn, nhadangky.vn).
- Ghi chú cố định: "Biểu mẫu do nhà đăng ký P.A Việt Nam cung cấp; nếu cần hỗ trợ điền hồ sơ, liên hệ hotline ..." (hotline đọc từ cấu hình).
- Mẫu hộ kinh doanh (01b, 03b TT48): P.A chưa có, dẫn văn bản gốc TT48 và ghi rõ.
- Có trong sitemap. Không thêm JS; danh sách dọc, không bảng, để không tràn ở 360px.

## 3. Ràng buộc

- Link nội bộ có `<%= base %>`; link ngoài `rel="noopener"`.
- Không em dash, en dash; chữ có dấu, kiểu dấu mới.
- Test trang chủ "không kéo tài nguyên ngoài" chỉ xét `src=` và `<link href=`: thẻ `<a>` ra ngoài không phải tài nguyên, CSP không chặn.

## 4. Kiểm

`npx tsc --noEmit`, `npm test`, `npm run kiem-dau`, `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs`, đo tràn ngang Chrome headless 1366/360 cho `/` và `/bieu-mau-ho-so`, ảnh footer 1366/360 và trang biểu mẫu vào thư mục này.
