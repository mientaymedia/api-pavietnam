---
type: plan
du_an: trang-chu
buoc: 3 - Build
dau_vao: docs/mtm/trang-chu/spec.md
nhanh: mtm/trang-chu (worktree D:\api-pavietnam-trangchu, từ mtm/api-pavietnam 2b38ea4)
cap_nhat: 16/10/2026
---

# Plan: trang chủ mới

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm.

Cổng chặn mỗi commit: `npx tsc -p tsconfig.json --noEmit`, `npm test` (mốc 195/195), `npm run kiem-dau` 0 lỗi; từ T4 thêm `node scripts/kiem-base.mjs` 0 link thiếu tiền tố.

## Các bước

- [x] T0. Tài liệu `intent.md`, `spec.md`, `plan.md`. Kiểm: `git status` sạch trong `docs/mtm/trang-chu`. Commit `7302774`.
- [x] T1. Tài nguyên: `public/fonts/*.woff2` + `OFL.txt`, `public/img/mientaymedia-logo.png`, `public/img/mientaymedia-logo-trang.png`, `public/img/khach-hang/*.png`. Kiểm: tệp tồn tại, `GET /fonts/...` 200. Commit `a985d31`.
- [x] T2. Màu và font chung: `public/css/app.css` (`:root`, `@font-face`), `src/lib/settings.ts`, `src/db/seed.ts`, `src/routes/admin.ts` (gợi ý), `src/views/partials/head.ejs`. Kiểm: cổng chặn. Commit `5d23869`; 195/195 đạt.
- [x] T3. Dữ liệu trang chủ: `src/routes/home.ts` (chips, noiBat, uuDai, giaChuyenTu; `/chuyen-ten-mien?domain=`), `test/trang-chu.test.ts`. Kiểm: test mới đạt (phần dữ liệu), cổng chặn. Commit `e85dbc4`; 198/198 đạt.
- [x] T4. Header và footer dùng chung: `src/views/partials/header.ejs`, `src/views/partials/footer.ejs`, CSS. Kiểm: cổng chặn + `kiem-base`. Commit `86b7f3a`; 198/198 đạt, kiem-base 0.
- [x] T5. Trang chủ: `src/views/home.ejs` (9 khối), CSS `tc-*`. Kiểm: cổng chặn + `kiem-base`, test trang chủ đạt đủ. Commit `8423d0f`; 200/200 đạt, kiem-base 0.
- [x] T6. Chạy thử sandbox cổng 3101, CSDL tạm; chụp `docs/mtm/trang-chu/trang-chu-desktop.png`, `trang-chu-dien-thoai.png`; sửa lỗi nhìn thấy. Kiểm: ảnh có trong thư mục, không tràn ngang ở 360px. Sửa: form chuyển bị hiện cùng form tìm (thứ tự CSS), nút Đăng ký trong menu mất nền, placeholder ngắn lại. 1366px và 360px không tràn ngang (scrollWidth = clientWidth), font Be Vietnam Pro tải đủ 4 độ đậm.

## Lệch spec

- L1. Màu chủ đạo: CSDL đã seed trước đây lưu sẵn `#0f766e` (mặc định cũ), sẽ đè màu mới. Chọn cách an toàn: `head.ejs` coi `#0f766e` cũng là mặc định, không sửa dữ liệu trong CSDL. Email (`notifications.ts`) vẫn đọc màu trong CSDL nên với CSDL cũ email còn màu xanh ngọc cho tới khi quản trị đổi trong Cấu hình.
- L2. Thẻ dịch vụ ghi "Chỉ từ ... /năm đầu" kèm dòng "Gia hạn ... /năm" thay cho "Chỉ từ ... đ/năm": giá đăng ký là giá năm đầu, giá gia hạn nhiều đuôi cao hơn hẳn (ví dụ .shop 189.000 đ rồi 899.000 đ), ghi "/năm" trơn dễ hiểu nhầm.
- L3. Thẻ cam kết thứ tư ghi "Hóa đơn rõ ràng" (hóa đơn của đơn hàng, xem và in lại) thay vì "hóa đơn điện tử": mã nguồn chưa có xuất hóa đơn điện tử theo chuẩn thuế.
- L4. Header và footer là partial dùng chung nên mọi trang đều đổi theo; điểm gập menu nâng từ 900px lên 1024px. Chỉ trang chủ có thanh ưu đãi.
- L5. Header không in tên bên cạnh logo khi dùng logo có sẵn (ảnh đã có chữ "MIENTAY Media"); nếu quản trị đặt `site.logo_url` thì giữ cách cũ (ảnh + tên).
- L6. "Mua ngay" được thêm vào `scripts/kiem-dau.cho-phep.json` (đúng chính tả, công cụ bắt nhầm từ "ngay").
- L7. Không có Claude in Chrome trong phiên này: ảnh chụp bằng Chrome headless qua DevTools Protocol (profile tạm), giả lập điện thoại 360px, DPR 2.
- L8. U3, U4 sửa ở CSS dùng chung (`.sidebar-layout`, `.grid-2/3/4` ở màn hẹp đổi `1fr` thành `minmax(0, 1fr)`), không sửa từng view: cùng một nguyên nhân (cột lưới `1fr` có min-width auto bị bảng con kéo rộng). Mọi trang dùng hai lớp này đều hưởng; đo lại 13 trang ở 360px và 1366px, bản máy tính không đổi độ rộng cột.
- L9. U4: thẻ "Dự kiến doanh thu gia hạn" không có bảng; phần tử kéo rộng là bảng "Theo đuôi tên miền" nằm cùng hàng lưới `grid-2`. Sau sửa bảng đó cuộn ngang trong khung riêng (347/326) và cả hàng về 328px. `/admin` (bảng quản trị) cũng tràn 2px vì cùng nguyên nhân, nay 360/360.
- L10. U2 làm `qa2/e2e.mjs` của QA vòng 2 bị 429 ở phần thử `next=`: script đó né giới hạn bằng cách đổi hoa thường email, đúng lỗ hổng vừa vá. Đây là hành vi mong muốn; vòng Test sau cần giãn cách hoặc dùng nhiều tài khoản. Bản chạy lại của Build (trong scratchpad) bỏ phần thử đó để tạo dữ liệu đo.
- L11. U1: status "inactive", "unregistered", "deactivated" nay là lỗi (trước là thành công). Nếu P.A thật trả "inactive" như trạng thái nghiệp vụ hợp lệ thì lệnh đó sẽ báo lỗi: cần xác minh bằng `pa:probe` trên VPS đã whitelist (việc đã có trong evals vòng 2, mục 6 ý 4).
- L12. U6: chỉ dẫn gốc là "chỉ dựa trên brain"; người giao việc bổ sung `D:\mientay-web\web\src\lib\seo-content\` là nguồn hợp lệ. Câu chỉ có ở site (An Giang, hơn 500 doanh nghiệp, 24 giờ làm việc, bàn giao quyền quản trị tên miền) đã đưa lên kèm nguồn và ghi vào mục cần chủ xác minh.
- L13. U6: thẻ Google Workspace ghi giá hãng "Chỉ từ 7 $/người/tháng" vì brain cấm hứa mức VNĐ cố định (giá VNĐ đổi theo tỷ giá từng ngày). Lời dẫn khối "Dịch vụ nổi bật" sửa thêm một câu cho đúng với ba thẻ mới (giá không lấy từ bảng giá tên miền). Hai lý do cũ "Giá minh bạch", "Tự động từ đầu đến cuối" bị thay vì brain không có.

## Sửa sau Test vòng 2 và câu chữ theo brain (đợt 2)

Đầu vào: `docs/mtm/api-pavietnam/evals-vong-2.md` (quan sát 1, 2), `docs/mtm/trang-chu/evals.md` (lỗi 1, 2), yêu cầu chủ: câu chữ trang chủ theo brain MienTay Media (`D:\javis\brains\Brain Default`, chỉ đọc) và nội dung đang đăng trên mientaymedia.com (`D:\mientay-web\web\src\lib\seo-content\`, chỉ đọc). Cổng chặn mỗi commit như trên, thêm `kiem-base` 0.

- [x] U1. `interpret`: status nghiệp vụ chỉ thành công khi khớp nguyên token hoặc không có dấu hiệu phủ định/lỗi. Tệp: `src/pavietnam/client.ts`, `test/text-match.test.ts`. Kiểm: test hai chiều mới, 38/38 ca `pa-probe` của QA vòng 2 vẫn đạt. Commit `7207d7a`; 213/213, pa-probe 38/38.
- [x] U2. Giới hạn đăng nhập theo email đã chuẩn hóa (trim + chữ thường). Tệp: `src/routes/auth.ts`, test mới. Kiểm: 42 lần đổi hoa thường email bị 429. Commit `5f4c91c`; 214/214, test mới đỏ trên mã cũ, xanh sau sửa.
- [x] U3. Trang đơn hàng và chi tiết tên miền không tràn ngang ở 360px. Tệp: `public/css/app.css`, view liên quan. Kiểm: Chrome headless 360px `scrollWidth` = 360; 1366px không đổi bố cục. Commit `2675192`; đo Chrome headless 360px: `/don-hang/<mã>` 537 (chờ thanh toán 526) về 360, `/control-panel/<tên miền>` 391 về 360, bảng cuộn trong `.table-wrap`; 1366px cột vẫn 750 + 330. 215/215.
- [x] U4. `/admin/bao-cao`: bảng "Dự kiến doanh thu gia hạn" cuộn ngang trong khung riêng. Kiểm: 360px `scrollWidth` = 360. Commit `b24a013`; `/admin/bao-cao` 366 về 360, `/admin` 362 về 360 (cùng nguyên nhân, xem L9); 1366px không đổi. 216/216.
- [x] U5. Liên hệ mặc định theo brain: hotline, email hỗ trợ, website (settings, seed, footer). Không đổi `MAIL_FROM`. Kiểm: cổng chặn, footer CSDL mới có đủ ba mục. Commit `1a3bf2c`; footer CSDL mới có hotline, email, website; 217/217. Nguồn ở `nguon-cau-chu.md` mục 1.
- [x] U6. Câu chữ trang chủ (giới thiệu, 3 lý do, thẻ dịch vụ khác, 5 câu hỏi) theo brain, nguồn từng câu trong `nguon-cau-chu.md`. Kiểm: cổng chặn, mọi câu mới có nguồn. Commit `59d75c5`; 3 thẻ mới (Google Workspace, Microsoft 365, Mineflow), giới thiệu và 3 lý do viết lại, 5 câu hỏi giữ nguyên sau đối chiếu; 218/218.
- [x] U7. Chụp lại trang chủ (1366px, 360px) và trang đơn hàng 360px vào thư mục này. Xong: `trang-chu-desktop.png`, `trang-chu-dien-thoai.png`, `don-hang-dien-thoai.png` (đơn chờ thanh toán có QR; Chrome headless, 360px DPR 2; ép tải logo lazy trước khi chụp). Đo lại 14 trang ở 360px và 1366px trên CSDL mới: 28/28 không tràn.

## Thông tin pháp lý chủ chốt 16/10/2026 (đợt 3)

Đầu vào: mục "Chủ đã chốt" trong `nguon-cau-chu.md`. Cổng chặn mỗi commit: `npx tsc --noEmit`, `npm test` đạt hết (mốc 218/218), `npm run kiem-dau` 0, `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0; footer không tràn ở 360px (Chrome headless).

- [x] V1. Ghi quyết định của chủ vào `nguon-cau-chu.md` và plan này (cả ghi chú Deploy). Kiểm: không em dash, en dash. Xong trong commit V1.
- [ ] V2. Footer in dòng pháp lý và giờ làm việc từ Cấu hình. Tệp: `src/lib/settings.ts` (mặc định `site.address`, `site.legal_name`, `site.tax_code`, `site.tax_issued`, `site.working_hours`), `src/db/seed.ts`, `src/routes/admin.ts` (ô sửa trong Cấu hình), `src/views/partials/footer.ejs`, `public/css/app.css`, `test/trang-chu.test.ts`. Kiểm: cổng chặn; test footer mới; Chrome headless 360px và 1366px footer không tràn.
- [ ] V3. Chụp lại trang chủ máy tính và điện thoại vào thư mục này. Kiểm: ảnh có footer mới.

## Ghi cho bước Deploy

- `domain.mientaymedia.com` (đang được mientaymedia.com giới thiệu, `site/ten-mien.ts:10`, `:12`) phải chuyển hướng 301 về `https://mientaymedia.com/ten-mien`, giữ đường dẫn con nếu có. Chủ chốt 16/10/2026. Kiểm sau Deploy: `curl -sI https://domain.mientaymedia.com/` trả `301` và `Location: https://mientaymedia.com/ten-mien`.
- Giá tên miền trên mientaymedia.com chưa khớp web này (việc riêng của chủ, không làm trong repo này): xem `nguon-cau-chu.md`, mục Chủ đã chốt, ý 2.
