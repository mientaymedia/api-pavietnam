---
type: plan
du_an: footer-v2
buoc: 3 - Build
dau_vao: yêu cầu chủ 19/10/2026 (qua điều phối), chưa có spec.md riêng
nhanh: mtm/footer-v2 (worktree D:\api-pavietnam-trangchu, từ mtm/trang-chu 130dbcd)
cap_nhat: 19/10/2026
---

# Plan: footer v2, bỏ tên P.A khỏi trang khách, Zalo chat

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm.

Cổng chặn mỗi commit mã: `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run kiem-dau` 0 lỗi, `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu tiền tố.

## Các bước

- [x] V1. Bỏ chữ P.A khỏi chỗ khách thấy (trừ footer, trang biểu mẫu): `src/views/domains/detail.ejs` (ô "Nhà đăng ký"), `src/services/dns.ts` (thông báo lỗi DNS), `src/pavietnam/client.ts` (thông báo thiếu khóa API có thể lộ ra ô tìm). Kiểm: grep, cổng chặn. Xong: 264/264, kiem-dau 0.
- [x] V2. Trang biểu mẫu: `src/lib/bieuMau.ts` (mẫu nhà nước dẫn văn bản gốc datafiles.chinhphu.vn, mst.gov.vn; mẫu riêng của nhà đăng ký đánh dấu `lienHe`, không link), `src/views/bieu-mau-ho-so.ejs`, `public/css/app.css`, `test/bieu-mau.test.ts`. Kiểm: test mới (không link pavietnam.vn hay docs.google.com, mẫu riêng có "Liên hệ MienTay Media để nhận mẫu" kèm hotline, không chữ P.A trong thân trang), cổng chặn. Xong: 264/264, kiem-dau 0, kiem-base 0.
- [ ] V3. Footer v2: `src/views/partials/footer.ejs`, `public/css/app.css`, `test/trang-chu.test.ts`, `test/css-tran-ngang.test.ts`. 5 cột (Thương hiệu, Tên miền, Dịch vụ MienTay Media, Chính sách, Hỗ trợ), dải pháp lý dưới, câu đại lý trung tính. Kiểm: test footer (cột dịch vụ đủ link 200 đã curl, câu đại lý mới, không P.A), cổng chặn.
- [ ] V4. Zalo chat: `src/lib/settings.ts`, `src/routes/admin.ts`, `src/lib/csp.ts`, partial mới `src/views/partials/zalo-chat.ejs` gọi từ footer (không ở trang admin), CSS nút dự phòng, test mới `test/zalo-chat.test.ts`, `test/csp.test.ts`. Kiểm: widget có ở trang chủ, tìm kiếm, giỏ hàng, biểu mẫu; không có ở admin; tắt thì không có script; CSP có đúng nguồn Zalo; Chrome headless 0 lỗi CSP.
- [ ] V5. Đo và chụp: sandbox cổng tạm, CSDL tạm, BASE_PATH=/ten-mien; tràn ngang 1366/768/360; ảnh footer 3 khổ, `/bieu-mau-ho-so`, trang chủ 1366/360 có nút Zalo vào `docs/mtm/footer-v2/`. Kiểm: scrollWidth = clientWidth, ảnh có trong thư mục.
- [ ] V6. Grep cuối, liệt kê chỗ còn "P.A"/"pavietnam" và lý do (mục dưới).

## Lệch spec

- L0. Không có `spec.md`; đầu vào là yêu cầu chủ chuyển qua điều phối, đã ghi rõ phạm vi, nhánh, cách kiểm và đòi trả commit. Coi đó là lệnh làm luôn, plan viết để theo dõi tiến độ.

## Chỗ còn "P.A"/"pavietnam" và lý do

(điền ở V6)
