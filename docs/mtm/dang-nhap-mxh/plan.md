---
type: plan
du_an: dang-nhap-mxh
buoc: 3 - Build
dau_vao: docs/mtm/dang-nhap-mxh/spec.md
nhanh: mtm/dang-nhap-mxh (worktree D:\api-pavietnam-oauth, tách từ mtm/trang-chu 14dba8f)
cap_nhat: 19/10/2026
---

# Plan: đăng nhập bằng Zalo, Google, GitHub

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm. Người giao việc đã nói viết plan rồi làm luôn.

Cổng chặn mỗi commit: `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run kiem-dau` 0; bước có giao diện thêm `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0.

## Các bước

- [x] B0. (c065984) `intent.md`, `spec.md`, `plan.md`. Kiểm: tệp có trong `docs/mtm/dang-nhap-mxh`.
- [x] B1. (5cd78b4) Dữ liệu và cấu hình: bảng `user_identities` (`src/db/schema.sql`), khóa trong `src/config.ts`, `src/lib/settings.ts` (`settings.oauth()`, `SECRET_KEYS`), `.env.example`, nhóm "Đăng nhập mạng xã hội" ở `/admin/cau-hinh` (`src/routes/admin.ts`, `src/views/admin/settings.ejs`). Kiểm: test cũ đạt; migrate chạy lại không lỗi.
- [x] B2. (f4d8809) Lớp nhà cung cấp `src/lib/oauth.ts`: PKCE, URL xin quyền, đổi mã, lấy hồ sơ cho ba bên, `OAUTH_MOCK_BASE`. Kiểm: test đơn vị với máy chủ giả lập.
- [x] B3. (7c8deb1; sửa phiên f663442, xem L5) Ghép tài khoản `src/services/lienKetMxh.ts`, email tạm (`sendMail` bỏ qua), route `src/routes/dangNhapMxh.ts` (bắt đầu, callback, hủy liên kết, đặt mật khẩu, bổ sung email), nối vào `src/app.ts`, `src/routes/auth.ts` (gắn danh tính chờ sau đăng nhập mật khẩu), `src/routes/checkout.ts` (chặn đặt hàng). Kiểm: test HTTP đủ tình huống spec mục 7.
- [x] B4. (477c4e2, commit trước B3 để test của B3 chạy được ngay ở commit đó) Giao diện: `partials/nut-mxh.ejs`, trang đăng nhập, đăng ký, khối liên kết ở `/tai-khoan`, trang bổ sung email, dải nhắc ở header, CSS. Kiểm: kiem-base, kiem-dau, test nút ẩn hiện.
- [x] B5. Ảnh trang đăng nhập 1366 và 360 vào `docs/mtm/dang-nhap-mxh/`; kết quả kiểm cuối, việc chủ cần làm. Kiểm: ảnh không tràn ngang.

Kết quả kiểm cuối (19/10/2026): `tsc` sạch; `npm test` 383/383 đạt (mốc đầu 352, thêm 9 test lớp OAuth và 22 test HTTP); `npm run kiem-dau` 0; `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu tiền tố (chạy cả khi chưa có khóa lẫn khi có đủ khóa ba bên); ảnh `dang-nhap-1366.png`, `dang-nhap-360.png` chụp dưới `/ten-mien` bằng giả lập thiết bị Chrome, không tràn ngang (scrollWidth = clientWidth).

## Lệch spec

- L1. Tài liệu Zalo v4 không tải được (trang dựng bằng JavaScript, Chrome headless chỉ nhận khung). Làm theo tham số trong giao việc; máy chủ giả lập mô phỏng đúng các tham số đó. Chưa kiểm được với Zalo thật: khi Zalo trả lỗi hoặc khách bấm Từ chối, Zalo có thể quay về không kèm `code` (mình coi là hủy) hoặc kèm mã lỗi riêng. Chủ thử một lần với ứng dụng thật trước khi mở cho khách.
- L2. Chữ trên nút là "Đăng nhập bằng ..." / "Đăng ký bằng ..." thay cho "Đăng nhập với ..." trong giao việc: hướng dẫn thương hiệu Google (bản tiếng Việt) chỉ cho "Đăng nhập bằng Google", "Đăng ký bằng Google", "Tiếp tục bằng Google"; ba nút nói giống nhau cho đồng bộ.
- L3. Nút Zalo không dùng logo Zalo (không có tệp logo chính thức trong repo, không tự vẽ lại thương hiệu); dùng nền xanh Zalo `#0068FF` và nhãn chữ "Zalo". Muốn dùng logo chính thức thì chủ tải từ bộ nhận diện của Zalo, mình thay vào `partials/nut-mxh.ejs`. Google: font Roboto không có trên máy chủ (CSP `font-src 'self'`), dùng font hệ thống gần nhất; logo G, màu, viền đúng hướng dẫn.
- L4. Thêm điều kiện an toàn ngoài giao việc: chỉ tự gộp khi tài khoản có sẵn không mật khẩu, không 2FA VÀ email bên mình đã xác minh (tài khoản có email chưa xác minh có thể là người khác chiếm email). Danh tính chờ liên kết chỉ gắn khi email của tài khoản vừa đăng nhập mật khẩu trùng email nhà cung cấp (máy dùng chung). Tài khoản không mật khẩu luôn phải xác minh email trước khi đặt hàng, kể cả khi tắt `auth.require_email_verified`. Thêm `UNIQUE (user_id, provider)`.
- L5. Sửa lỗi có sẵn ở `middleware/session.ts`: sau `loginSession` (phiên mới), dữ liệu phiên ghi lúc kết thúc yêu cầu vẫn ghi vào sid cũ đã xóa, nên mọi flash đặt sau khi đăng nhập bị mất (gồm cả thông báo "Bạn vừa dùng một mã dự phòng" ở 2FA đã có từ trước). Nay ghi vào `req.sessionId`.
- L6. Liên kết thêm đi bằng link GET kèm `_csrf` trên URL (không dùng form POST): CSP `form-action 'self'` chặn form chuyển hướng ra miền khác. Token lộ qua Referer không xảy ra vì `Referrer-Policy: strict-origin-when-cross-origin` chỉ gửi gốc sang miền khác.
- L7. Tài khoản Zalo dùng email tạm `mxh-<ngẫu nhiên>@chua-co-email.invalid` vì cột `users.email` NOT NULL UNIQUE (đổi ràng buộc trong SQLite phải dựng lại bảng). Email tạm không hiện ra giao diện, không nhận thư, không đăng ký bằng tay được.

Ghi chú ngoài phạm vi (không sửa): trang `/admin/cau-hinh` không có nhóm hiển thị cho khóa `tg.*` và `crm.*` (thiếu trong danh sách `groups` của `views/admin/settings.ejs`), nên mỗi lần bấm Lưu cấu hình, ô checkbox `crm.bat` và `crm.su_kien_mo_rong` bị ghi thành 0. Nên sửa ở nhánh khác.

## Việc chủ cần làm

Redirect URI trên máy thật (APP_URL = https://mientaymedia.com/ten-mien), khai báo đúng từng ký tự:

| Bên | Redirect URI |
|---|---|
| Zalo | https://mientaymedia.com/ten-mien/auth/zalo/callback |
| Google | https://mientaymedia.com/ten-mien/auth/google/callback |
| GitHub | https://mientaymedia.com/ten-mien/auth/github/callback |

1. Zalo (developers.zalo.me): tạo ứng dụng (tên gợi ý "MienTay Media - Tên miền"), bật sản phẩm Đăng nhập (Social API) cho nền tảng Web, khai báo Callback URL ở trên và tên miền mientaymedia.com; quyền cần: thông tin tên và ảnh đại diện (mặc định của đăng nhập, không xin số điện thoại). Đưa ứng dụng sang trạng thái kích hoạt (live) để người ngoài danh sách thử nghiệm đăng nhập được. Lấy App ID và Secret Key nhập vào Quản trị > Cấu hình > Đăng nhập bằng mạng xã hội (hoặc `ZALO_APP_ID`, `ZALO_APP_SECRET`). Thử một lần cả Đồng ý lẫn Từ chối (L1).
2. Google (console.cloud.google.com): tạo dự án, OAuth consent screen kiểu External, tên ứng dụng "MienTay Media", email hỗ trợ hello@mientaymedia.com, logo, link Chính sách bảo mật và Điều khoản trên mientaymedia.com, Authorized domain mientaymedia.com; scope chỉ `openid`, `email`, `profile` (không cần thẩm định). Publish app (ra khỏi Testing). Credentials > OAuth client ID loại Web application, Authorized redirect URI ở trên. Nhập Client ID, Client Secret.
3. GitHub (github.com > Settings > Developer settings > OAuth Apps > New OAuth App): Application name "MienTay Media", Homepage URL https://mientaymedia.com/ten-mien, Authorization callback URL ở trên (OAuth App chỉ nhận một callback). Scope do web xin: `read:user`, `user:email`. Generate a new client secret, nhập Client ID, Client Secret.
4. Sau khi nhập khóa: nút tự hiện ở /dang-nhap và /dang-ky. Muốn tạm tắt một bên thì bỏ ô "Bật đăng nhập bằng ..." (không cần xóa khóa).
5. Duyệt và gộp nhánh `mtm/dang-nhap-mxh` (chưa push). Bảng `user_identities` tự tạo khi app khởi động (`server.ts` gọi `migrate()`).
