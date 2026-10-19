---
type: plan
du_an: pa-dang-ky
buoc: 3 - Build
dau_vao: docs/mtm/pa-dang-ky/spec.md
nhanh: mtm/pa-dang-ky (worktree D:\api-pavietnam-pa, tách từ mtm/trang-chu 130dbcd)
cap_nhat: 19/10/2026
---

# Plan: tích hợp đúng API đại lý P.A

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm. Chủ đã đồng ý làm luôn sau khi viết plan.

Cổng chặn mỗi commit: `npx tsc -p tsconfig.json --noEmit`, `npm test` (mốc trước khi làm 264/264), `npm run kiem-dau` 0; bước có giao diện thêm `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0.

## Các bước

- [x] B0. Tài liệu `intent.md`, `spec.md`, `plan.md`. Kiểm: tệp có trong `docs/mtm/pa-dang-ky`.
- [x] B1. Dữ liệu địa giới: `scripts/chuyen-dia-gioi-xlsx.mjs` (đọc xlsx bằng zlib, không thư viện), `src/data/dia-gioi-pa.json`, `src/lib/diaGioi.ts`, chép tệp trong `scripts/postbuild.mjs`. Kiểm: chạy script với 2 tệp xlsx; test tra cứu tỉnh, phường.
- [x] B2. Tầng P.A: `src/pavietnam/actions.ts`, `maLoi.ts`, `thamSo.ts`, `parse.ts`, `client.ts`, `probe.ts`; cấu hình endpoint thử (`src/config.ts`, `src/lib/settings.ts`, `.env.example`), `src/preflight.ts`. Kiểm: test đơn vị đọc phản hồi, phân loại mã, tham số đăng ký; test cũ đạt.
- [x] B3. Lệnh nạp lại địa giới qua `get_province`/`get_ward` (`src/pavietnam/napDiaGioi.ts`, `npm run pa:dia-gioi`). Kiểm: test với máy chủ P.A giả.
- [x] B4. Hồ sơ chủ thể: cột `ward`, `src/lib/validate.ts`, `src/services/domainContact.ts`, `partials/contact-form.ejs`, `routes/account.ts` (sửa hồ sơ, 2 bước), `routes/checkout.ts` (2 bước, kiểm theo đuôi), route JSON phường xã, `public/js/app.js`. Kiểm: test hợp lệ và HTTP; kiem-base.
- [x] B5. Cấp phát: cột mới, `src/services/provisioning.ts` (số dư, phân loại, giữ đơn, get_date_domain, check_domain), job `retry_awaiting_funds`, mật khẩu tên miền trong Control Panel. Kiểm: test luồng với máy chủ P.A giả.
- [x] B6. Đổi DNS .vn có IP (tự phân giải), quốc tế 4 DNS; form Control Panel nhận "tên IP". Kiểm: test với máy chủ giả.
- [x] B7. Quản trị: số dư thật, cờ chế độ, Kiểm tra API bằng `check_account_still`, trang `/admin/cho-xu-ly`. Kiểm: test HTTP; kiem-base.
- [ ] B8. `scripts/pa-thu-endpoint-test.mjs` (từ chối endpoint khác `interface_test.php`). Kiểm: test chạy script với endpoint thật thì thoát lỗi, với máy chủ giả có đường dẫn `interface_test.php` thì in đủ mã.
- [ ] B9. Chụp form chủ thể 1366 và 360 vào `docs/mtm/pa-dang-ky/`; cập nhật plan. Kiểm: ảnh không tràn ngang.

Phạm vi chủ chốt thêm 19/10 (làm sau B0 đến B9):

- [ ] B10. Thông báo Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`, secret webhook trong settings mã hóa; tin khi đơn đã thanh toán, đăng ký thành công, thiếu quỹ (kèm nút "Đã nạp, kích hoạt"), lỗi cần người xử lý. Kiểm: test với Telegram giả lập (`TELEGRAM_API_BASE`).
- [ ] B11. Webhook `POST /webhooks/telegram`: xác thực `X-Telegram-Bot-Api-Secret-Token`, chỉ chat id được phép; nút và `/kichhoat` chạy kiểm số dư rồi đăng ký đơn chờ; `/sodu`, `/doncho`; bấm hai lần không đăng ký hai lần. Hướng dẫn setWebhook trong docs. Kiểm: test HTTP.
- [ ] B12. Cổng máy cho CRM (chủ sửa 19/10): dùng chung `/api/noi-bo/*` với khóa `WEB_TEN_MIEN_KEY` theo client sẵn có bên CRM (`D:/crm-mientaymedia/src/server/tich-hop/web-client.ts`, chỉ đọc); thêm `GET /api/noi-bo/trang-thai`, `POST /api/noi-bo/kich-hoat` (dùng chung khóa với nút Telegram); web đẩy sự kiện sang CRM khi đơn đã thanh toán, chờ quỹ, lỗi, đăng ký xong (đối chiếu `kiem-tra.ts` bên CRM). Đặc tả `docs/mtm/pa-dang-ky/api-crm.md`. Kiểm: test HTTP và CRM giả lập.

## Lệch spec

(ghi trong lúc làm)
