---
type: plan
du_an: tai-khoan-chung (nấc 1)
buoc: 3 - Build (xong), 4 - Test (xong phần máy cục bộ)
nhanh: mtm/tai-khoan-chung (repo tên miền), feat/tai-khoan-mientay (repo mientay-web)
cap_nhat: 21/10/2026
---

# Plan: Cổng Tài khoản MienTay (nấc 1)

Người giao việc đã nói "viết spec.md và plan.md rồi build luôn", nên làm ngay không dừng chờ duyệt. Spec: `spec.md`; triển khai: `trien-khai.md`.

## Các bước

- [x] 1. Cấu hình và phiên hai cookie (commit `6d6897d`)
  - Tệp: `src/config.ts`, `src/middleware/session.ts`, `src/lib/basePath.ts` (`chuyenTuyetDoi`, `taoRedirectTienTo`), `src/lib/congTaiKhoan.ts` (mới), `.env.example`.
  - Kiểm: tsc sạch; `npm test` 384/384 (cổng tắt mặc định, không đổi hành vi).
- [x] 2. Hàm xử lý đăng nhập dùng chung, router cổng, link cũ (commit `434adc8`)
  - Tệp: `src/routes/auth.ts`, `src/routes/congTaiKhoan.ts` (mới), `src/app.ts`, `src/middleware/auth.ts`, `src/routes/dangNhapMxh.ts`, `src/routes/account.ts`.
  - Kiểm: tsc; `npm test` 384/384.
- [x] 3. Giao diện cổng (commit `69f4eec`)
  - Tệp: `src/views/cong/*.ejs`, `public/css/cong.css`, `src/views/partials/nut-mxh.ejs`, `scripts/kiem-dau.cho-phep.json`.
  - Kiểm: chạy app cục bộ (BASE `/ten-mien`, cổng `/tai-khoan`), curl từng trang; `kiem-dau` 0.
- [x] 4. Test HTTP SSO (commit `706f5ad`)
  - Tệp: `test/tai-khoan-chung.test.ts` (19 test).
  - Kiểm: `npm test` 403/403.
- [x] 5. kiem-base bò cả cổng (commit `d44e01a`)
  - Kiểm: `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` thoát 0.
- [x] 6. Traefik và runbook (commit `718cb9d`)
  - Tệp: `deploy/vps/docker-compose.yml`, `docs/mtm/tai-khoan-chung/trien-khai.md`.
  - Kiểm: đọc lại nhãn khớp router `tenmien`. Máy này không có docker nên chưa chạy `docker compose config`.
- [x] 7. Email qua Resend (commit `57781cf`)
  - Tệp: `src/config.ts`, `src/lib/settings.ts`, `src/lib/mailer.ts`, `src/routes/admin.ts`, `src/views/admin/settings.ejs`, `.env.example`, `docs/EMAIL-ZNS.md`, `test/mailer-resend.test.ts` (5 test, máy chủ Resend giả lập).
  - Kiểm: `npm test` 408/408.
- [x] 8. Site chính: nút Đăng nhập trỏ cổng (repo mientay-web, worktree `D:\mientay-web-tk`, nhánh `feat/tai-khoan-mientay` từ `origin/main` a7e8057, commit `7d1da73`)
  - Tệp: `web/src/lib/site-data.ts` (`TAI_KHOAN_URL`), `web/src/components/SiteHeader.tsx` (máy tính và di động, `next` = pathname, trang chủ không kèm next).
  - Kiểm: `npx tsc --noEmit` 0, `eslint` hai tệp 0, `npm run build` đạt; HTML `bang-gia.html` có `href="https://mientaymedia.com/tai-khoan/dang-nhap?next=%2Fbang-gia"`, `index.html` có `href="https://mientaymedia.com/tai-khoan/dang-nhap"`, nút Đăng nhập không còn `app.mineflow.dev`.
- [x] 9. Ảnh, kiểm toàn bộ, ghi kết quả (commit cuối)
  - Ảnh: `cong-dang-nhap-{1366,360}.png`, `cong-chon-san-pham-{1366,360}.png`, `cong-hai-lop-{1366,360}.png` (tài khoản có 2FA), `cong-bao-mat-1366.png`, `cong-lien-ket-360.png`.

## Lệch spec và chỗ chọn cách an toàn

1. Phiên chung dùng **hai cookie cùng giá trị** (`Path=/ten-mien` và `Path=/tai-khoan`) thay vì `Path=/`: giao việc cho phép "cơ chế tương đương"; `Path=/` làm cookie phiên gửi cho mọi trang Next.js (intent mục 9). Không đặt `Domain`, vẫn `HttpOnly`, `SameSite=Lax`, `Secure` khi production.
2. Hai giới hạn đã ghi ở spec mục 2: phiên đăng nhập có từ trước khi triển khai chỉ lan sang cổng sau lần đầu khách mở một trang `/ten-mien`; khách chỉ có phiên của cổng mà mở `/ten-mien` giữa lúc chờ nhập mã 2FA thì phải đăng nhập lại. Không mất dữ liệu.
3. Trang Bảo mật của cổng có đổi hoặc đặt mật khẩu và trạng thái 2FA; **bật, tắt 2FA, tạo mã dự phòng vẫn ở `/ten-mien/tai-khoan/bao-mat`** (nút dẫn sang, cùng phiên nên không đăng nhập lại). Lý do: không chép lần hai luồng QR và mã dự phòng đã có test. Bước nhập mã 2FA khi đăng nhập thì có ở cổng.
4. Form Hồ sơ, Bảo mật, hủy liên kết của cổng gửi về route có sẵn của `/ten-mien` kèm `quay_ve` (chỉ nhận `ho-so`, `bao-mat`, `lien-ket`), để chỉ có một bản logic. Liên kết mạng xã hội bắt đầu ở `/ten-mien/auth/<bên>?cong=1` vì callback đã khai nằm ở đó.
5. Đăng xuất xóa phiên của trình duyệt đang dùng (cả hai cookie, dòng `sessions` của sid đó). Không xóa phiên ở thiết bị khác của cùng người (intent tiêu chí 5 viết "phiên của người đó"; hiểu theo nghĩa trên trình duyệt đó như mục Trải nghiệm của intent).
6. Đã đăng nhập mà mở `/tai-khoan/dang-nhap?next=...` thì về trang chọn sản phẩm, bỏ qua `next` (khách bấm Đăng nhập trên site chính sẽ tưởng nút không làm gì nếu bị đưa về đúng trang cũ).
7. Nút Đăng nhập, Đăng ký trên header của `/ten-mien` vẫn trỏ `/ten-mien/dang-nhap` rồi 302 sang cổng (thêm một lần chuyển) để đường lui chỉ cần tắt biến môi trường.
8. Cổng không mở CSP cho widget chat Zalo (cổng không gắn widget); các chỉ thị khác giữ như cũ.
9. Gửi email theo 11 mẫu nháp trên Resend: **không làm**. Giao việc ghi "nếu dễ" và mặc định tắt; cú pháp gửi theo mẫu của API Resend hiện hành cần đối chiếu tài liệu chính thức mà phiên này không gọi Resend thật được, và mẫu còn là bản nháp. Nội dung thư vẫn do app dựng (có test).
10. `Secure` trên cookie chỉ có khi `NODE_ENV=production` (như cũ); test chạy ở chế độ dev nên chỉ kiểm `HttpOnly`, `SameSite=Lax`, không `Domain`, `Path`. Kiểm `Secure` bằng curl sau khi triển khai (trien-khai.md mục 2).
11. Site chính: chỉ sửa trên `origin/main` (không có bản tiếng Anh). Nhánh `feat/tieng-anh` sẽ đụng cùng hai dòng ở `SiteHeader.tsx` khi gộp; bản `/en` cần cùng thay đổi.
12. Chưa cập nhật trang chính sách quyền riêng tư (intent mục 4): cần chủ duyệt nội dung, ngoài phạm vi giao việc nấc 1.
13. Mặc định `MAIL_FROM` đổi từ `no-reply@localhost` sang `MienTay Media <no-reply@updates.mientaymedia.com>`; `.env` trên VPS nếu đang ghi `MAIL_FROM` khác thì giá trị đó vẫn thắng.

## Kết quả kiểm (21/10/2026, máy cục bộ)

| Kiểm | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npm test` | 408/408 đạt (trước dự án 384; thêm 19 test SSO, 5 test Resend) |
| `npm run kiem-dau` | 0 chuỗi thiếu dấu, 0 lỗi mã hóa |
| `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` | thoát 0; bò 78 + 55 + 56 trang dưới `/ten-mien` và `/tai-khoan`, 0 link thiếu tiền tố |
| `npm run build` (repo tên miền) | đạt, `dist/views/cong` có đủ |
| Site chính `web/`: tsc, eslint hai tệp, `npm run build` (ở `D:\mientay-web-tk`) | đạt |
| Em dash, en dash trong mọi tệp đã sửa | không có |

Test SSO (`test/tai-khoan-chung.test.ts`) phủ: đăng nhập ở cổng rồi `/ten-mien/control-panel` 200; đăng nhập POST cũ ở `/ten-mien` rồi cổng thấy đã đăng nhập; phiên cũ lan sang cổng một lần; giỏ hàng khách vãng lai giữ qua link cũ; đăng xuất ở cổng hoặc ở `/ten-mien` hết cả hai, dòng `sessions` = 0; đăng xuất thiếu hay sai `_csrf` 403; 2FA bắt buộc (sai mã 401 và chưa vào được `/ten-mien`); 17 biến thể `next` độc hại về `/tai-khoan/`; Google, GitHub, Zalo từ cổng với `redirect_uri` vẫn là callback `/ten-mien`; email trùng tài khoản có mật khẩu không tự gộp; mạng xã hội gặp 2FA sang trang 2FA của cổng; liên kết từ cổng cần `_csrf`; link cũ 302 giữ `next` an toàn và `token`, không 404; `quay_ve` lạ bị bỏ; mọi `Set-Cookie` không `Domain`, có `HttpOnly`, `SameSite=Lax`, `Path` chỉ `/ten-mien` hoặc `/tai-khoan`.

Chưa kiểm (cần bản thật): OAuth thật ở Zalo, Google, GitHub qua cổng; `Secure` trên cookie; Traefik router mới; gửi Resend thật.

## Việc chủ cần làm

1. Duyệt và gộp hai nhánh (chưa push): repo tên miền `mtm/tai-khoan-chung`, repo `superstar109/mientay-web` nhánh `feat/tai-khoan-mientay`. Triển khai theo `trien-khai.md`: repo tên miền trước, kiểm, rồi mới site chính.
2. Không phải khai lại redirect URI ở Zalo, Google, GitHub.
3. Resend: tạo API key quyền Sending; trên VPS đặt `MAIL_DRIVER=resend`, `RESEND_API_KEY=...` (hoặc nhập ở Quản trị > Cấu hình > Email, lưu mã hóa); kiểm `MAIL_FROM` thuộc `updates.mientaymedia.com` hoặc `api.mientaymedia.com`; bấm Gửi email thử.
4. Sau triển khai: đăng nhập thử qua cổng bằng email, Zalo, Google, GitHub, mỗi bên cả Đồng ý lẫn Từ chối; ghi kết quả vào plan này.
5. Khi gộp `feat/tieng-anh` của site chính: áp cùng thay đổi nút Đăng nhập cho bản `/en`.
6. Duyệt nội dung cập nhật chính sách quyền riêng tư (một tài khoản dùng cho nhiều sản phẩm).
