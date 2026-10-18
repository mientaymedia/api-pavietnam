---
type: plan
du_an: footer-phap-ly
buoc: 3 - Build
dau_vao: docs/mtm/footer-phap-ly/spec.md
nhanh: mtm/footer-phap-ly (worktree D:\api-pavietnam-trangchu, từ mtm/trang-chu c6adc32)
cap_nhat: 18/10/2026
---

# Plan: footer pháp lý và trang biểu mẫu hồ sơ

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm.

Cổng chặn mỗi commit mã: `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run kiem-dau` 0 lỗi, `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu tiền tố.

## Các bước

- [x] F0. Tài liệu `intent.md`, `spec.md`, `plan.md`. Kiểm: tệp có trong `docs/mtm/footer-phap-ly`.
- [x] F1. Setting mới: `src/lib/settings.ts` (`legalRep`, `bctBadgeImg`, `bctBadgeUrl`), `src/db/seed.ts`, `src/routes/admin.ts` (ô nhập), `src/lib/csp.ts` (mở nguồn ảnh biểu tượng nếu ở ngoài). Kiểm: cổng chặn; test `csp` có thêm ca ảnh biểu tượng. Xong: 234/234, kiem-dau 0, kiem-base 0.
- [x] F2. Footer: `src/views/partials/footer.ejs`, `public/css/app.css`, `test/trang-chu.test.ts`. Kiểm: test footer mới (khối pháp lý, dòng đại lý, cột Chính sách đủ 9 link, cột Tên miền, biểu tượng chỉ hiện khi đủ setting, thoát HTML), cổng chặn. Xong: 238/238, kiem-dau 0, kiem-base 0 (link `/bieu-mau-ho-so` có trang ở F3). Xem L2, L3.
- [x] F3. Trang biểu mẫu: `src/lib/bieuMau.ts`, `src/views/bieu-mau-ho-so.ejs`, `src/routes/home.ts` (route + sitemap), CSS, `test/bieu-mau.test.ts`. Kiểm: test mới (200, đủ 5 nhóm, link https nguồn chính thức, không matbao, có ghi chú hotline, sitemap), cổng chặn. Xong: 243/243, kiem-dau 0 (thêm "Bộ Khoa học" vào danh sách cho phép, xem L4), kiem-base 0.
- [x] F4. Chạy sandbox cổng 3102, CSDL tạm, BASE_PATH=/ten-mien; đo tràn ngang 1366/360 cho `/` và `/bieu-mau-ho-so`; chụp `footer-1366.png`, `footer-360.png`, `bieu-mau-1366.png`, `bieu-mau-360.png`. Kiểm: scrollWidth = clientWidth, ảnh có trong thư mục. Xong: scrollWidth = clientWidth ở cả `/`, `/bieu-mau-ho-so`, `/bang-gia` (1351/1351 ở 1366, 360/360 ở 360); không lỗi console, không yêu cầu 4xx. Chỉ dải chip trang chủ và bảng giá vượt khung con nhưng cuộn trong khung riêng như trước. Ảnh: `footer-1366.png`, `footer-360.png`, `bieu-mau-1366.png`, `bieu-mau-360.png`.

## Lệch spec

- L1. Nhánh: quy trình chung tạo nhánh từ nhánh chính, nhưng bản đang chạy thật là `mtm/trang-chu` (chưa gộp vào nhánh chính của repo). Tạo `mtm/footer-phap-ly` từ `mtm/trang-chu` c6adc32 ngay trong worktree đó để gộp lại được bằng fast-forward; không đụng `mtm/trang-chu`.
- L2. Người đại diện: có nguồn (`D:\mientay-web\web\src\lib\site-data.ts` dòng 58 và trang Điều khoản dịch vụ), nên `site.legal_rep` mặc định "Đinh Văn Tạo Em" thay vì để trống. Như mọi ô cấu hình khác, ô để trống trong Cấu hình sẽ về mặc định; footer vẫn kiểm rỗng để nếu bỏ mặc định thì chỉ ẩn dòng. Vì vậy không có test "ẩn khi trống" qua Cấu hình.
- L3. Test trang chủ "không kéo tài nguyên ngoài" trước đây chặn mọi `href` ra ngoài, kể cả thẻ `<a>`; footer nay có link VNNIC theo yêu cầu. Thu hẹp về `src=` và `<link href=` (đúng ý chú thích của test: CSP chặn tài nguyên, không chặn liên kết). Các test footer cũ sửa theo bố cục mới (mỗi ý pháp lý một dòng, "MST" đổi thành "Mã số doanh nghiệp" theo Điều 4 NĐ 248), vẫn giữ đủ ca thoát HTML và thêm ô người đại diện.
- L4. `kiem-dau` bắt nhầm "Bộ Khoa học" (chữ "Khoa" đúng là không dấu), thêm vào `scripts/kiem-dau.cho-phep.json` giống "Kinh doanh".
- L5. Trang biểu mẫu thêm khối "Quy trình đăng ký" (6 bước theo đúng luồng web, dẫn hướng dẫn VNNIC) để link "Quy trình đăng ký" ở footer có đích; không có trang quy trình riêng trên mientaymedia.com. Bước 5 ghi "nhà đăng ký có thể yêu cầu bản khai" vì web hiện không tự thu bản khai.
- L6. Liên kết tải dùng khối Google Docs mà trang P.A đang hiện (bản mới nhất), không dùng các tệp .zip cũ cùng tên khi P.A có cả hai; mẫu P.A không có thì dẫn văn bản gốc. Có thêm mục .name.vn và từ khóa báo chí (P.A có mẫu cam kết riêng), không đưa "bảo vệ, giữ chỗ tên miền" vì không nằm trong 5 nhóm được giao.

## Cần chủ làm hoặc xác minh

Trên mientaymedia.com (web tên miền không sửa site chính):

1. Làm thủ tục thông báo nền tảng TMĐT kinh doanh trực tiếp có chức năng đặt hàng trực tuyến trên Cổng dịch vụ công quốc gia (UBND tỉnh An Giang xác nhận), rồi điền `site.bct_badge_img` và `site.bct_badge_url` trong Cấu hình để biểu tượng hiện ở footer. Căn cứ: Điều 14 khoản 1 LTMĐT; Điều 23, 24, Điều 45 khoản 2 điểm a, Phụ lục I NĐ 248/2026. Trang Điều khoản dịch vụ hiện ghi "đang hoàn thiện hồ sơ với Bộ Công Thương": nên sửa theo cơ quan mới.
2. Cập nhật căn cứ trong các trang chính sách: `dieu-khoan-su-dung`, `chinh-sach-gia`, `chinh-sach-hoan-tien` còn dẫn NĐ 52/2013 (hết hiệu lực 01/7/2026); `dieu-khoan-dich-vu`, `chinh-sach-thanh-toan`, `chinh-sach-bao-mat`, `chinh-sach-quyen-rieng-tu` còn dẫn NĐ 13/2023 (hết hiệu lực 01/01/2026). Không trang nào dẫn NĐ 248/2026. Căn cứ: Điều 52 khoản 3 NĐ 248/2026; Điều 42 khoản 2 NĐ 356/2025.
3. Bổ sung nội dung riêng cho tên miền vào các trang chính sách (hiện chưa có): nêu P.A Việt Nam là nhà đăng ký, MienTay Media là đại lý (Điều 12 khoản 4 điểm c NĐ 147/2024); tách lệ phí đăng ký, phí duy trì .vn nộp nhà nước khỏi tiền dịch vụ (Điều 8 khoản 1 NĐ 248/2026; Điều 9 khoản 3 NĐ 147/2024; TT 10/2025/TT-BTC); hoàn trả tên miền theo Mẫu 03 và giới hạn hoàn tiền không trái Điều 38 khoản 3, Điều 42 khoản 3 Luật 19/2023/QH15; bên được tiếp cận dữ liệu gồm P.A và VNNIC (Điều 5 NĐ 248/2026; Điều 21 khoản 4, 6 TT 48/2025); đối tượng được đăng ký từng đuôi (.edu.vn, .gov.vn, .id.vn) và người dưới 18 tuổi (Điều 9 NĐ 248/2026; TT 48/2025); thỏa thuận thanh toán trước (Điều 41 khoản 2 Luật 19/2023/QH15); thông báo gia hạn 07 ngày làm việc (Điều 42 khoản 2 điểm đ Luật 19/2023/QH15).
4. Hỏi P.A Việt Nam (kênh đại lý partner@pavietnam.vn, 1900 9477) bộ biểu mẫu hiện hành theo TT 48/2025 và NĐ 115/2025: P.A chưa có mẫu hộ kinh doanh (Mẫu 01b, 03b Phụ lục II TT 48/2025), trang P.A không ghi căn cứ TT 48, vẫn dùng tên "Đơn đề nghị thay đổi tên chủ thể" thay cho Mẫu 27 NĐ 115/2025, một số link mang dấu thời gian 12/2024. Khi P.A cập nhật thì sửa `src/lib/bieuMau.ts`.
5. Xác minh người đại diện theo pháp luật "Đinh Văn Tạo Em" (lấy từ `site-data.ts` của mientaymedia.com) và địa chỉ trụ sở khớp GCN ĐKDN sau sắp xếp đơn vị hành chính; nơi cấp "Sở KH&ĐT tỉnh An Giang" là tên cơ quan tại thời điểm cấp 13/06/2024 (Điều 4 NĐ 248/2026).
6. Hợp đồng đại lý bằng văn bản với P.A, xác định rõ MienTay Media không thực hiện vai trò nhà đăng ký, ai là bên kiểm soát, bên xử lý dữ liệu (Điều 12 khoản 4 điểm c NĐ 147/2024; Điều 37 Luật 91/2025/QH15).
7. Chưa chắc chắn, nên hỏi luật sư: "kinh doanh dịch vụ đăng ký, duy trì tên miền" có còn trong danh mục ngành nghề có điều kiện của Luật Đầu tư 143/2025/QH15 không; nếu còn thì phải công khai giấy tờ (Điều 16 khoản 1 điểm b LTMĐT). Mẫu số trong TT 48/2025 mới đối chiếu qua bản trích, chưa đọc nguyên văn bản scan.
