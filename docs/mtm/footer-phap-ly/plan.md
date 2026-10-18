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
- [ ] F3. Trang biểu mẫu: `src/lib/bieuMau.ts`, `src/views/bieu-mau-ho-so.ejs`, `src/routes/home.ts` (route + sitemap), CSS, `test/bieu-mau.test.ts`. Kiểm: test mới (200, đủ 5 nhóm, link https nguồn chính thức, không matbao, có ghi chú hotline, sitemap), cổng chặn.
- [ ] F4. Chạy sandbox cổng 3102, CSDL tạm, BASE_PATH=/ten-mien; đo tràn ngang 1366/360 cho `/` và `/bieu-mau-ho-so`; chụp `footer-1366.png`, `footer-360.png`, `bieu-mau-1366.png`, `bieu-mau-360.png`. Kiểm: scrollWidth = clientWidth, ảnh có trong thư mục.

## Lệch spec

- L1. Nhánh: quy trình chung tạo nhánh từ nhánh chính, nhưng bản đang chạy thật là `mtm/trang-chu` (chưa gộp vào nhánh chính của repo). Tạo `mtm/footer-phap-ly` từ `mtm/trang-chu` c6adc32 ngay trong worktree đó để gộp lại được bằng fast-forward; không đụng `mtm/trang-chu`.
- L2. Người đại diện: có nguồn (`D:\mientay-web\web\src\lib\site-data.ts` dòng 58 và trang Điều khoản dịch vụ), nên `site.legal_rep` mặc định "Đinh Văn Tạo Em" thay vì để trống. Như mọi ô cấu hình khác, ô để trống trong Cấu hình sẽ về mặc định; footer vẫn kiểm rỗng để nếu bỏ mặc định thì chỉ ẩn dòng. Vì vậy không có test "ẩn khi trống" qua Cấu hình.
- L3. Test trang chủ "không kéo tài nguyên ngoài" trước đây chặn mọi `href` ra ngoài, kể cả thẻ `<a>`; footer nay có link VNNIC theo yêu cầu. Thu hẹp về `src=` và `<link href=` (đúng ý chú thích của test: CSP chặn tài nguyên, không chặn liên kết). Các test footer cũ sửa theo bố cục mới (mỗi ý pháp lý một dòng, "MST" đổi thành "Mã số doanh nghiệp" theo Điều 4 NĐ 248), vẫn giữ đủ ca thoát HTML và thêm ô người đại diện.

## Cần chủ làm hoặc xác minh

(điền khi xong)
