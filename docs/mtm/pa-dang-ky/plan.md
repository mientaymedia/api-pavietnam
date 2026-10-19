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
- [ ] B1. Dữ liệu địa giới: `scripts/chuyen-dia-gioi-xlsx.mjs` (đọc xlsx bằng zlib, không thư viện), `src/data/dia-gioi-pa.json`, `src/lib/diaGioi.ts`, chép tệp trong `scripts/postbuild.mjs`. Kiểm: chạy script với 2 tệp xlsx; test tra cứu tỉnh, phường.
- [ ] B2. Tầng P.A: `src/pavietnam/actions.ts`, `maLoi.ts`, `thamSo.ts`, `parse.ts`, `client.ts`, `probe.ts`; cấu hình endpoint thử (`src/config.ts`, `src/lib/settings.ts`, `.env.example`), `src/preflight.ts`. Kiểm: test đơn vị đọc phản hồi, phân loại mã, tham số đăng ký; test cũ đạt.
- [ ] B3. Lệnh nạp lại địa giới qua `get_province`/`get_ward` (`src/pavietnam/napDiaGioi.ts`, `npm run pa:dia-gioi`). Kiểm: test với máy chủ P.A giả.
- [ ] B4. Hồ sơ chủ thể: cột `ward`, `src/lib/validate.ts`, `src/services/domainContact.ts`, `partials/contact-form.ejs`, `routes/account.ts` (sửa hồ sơ, 2 bước), `routes/checkout.ts` (2 bước, kiểm theo đuôi), route JSON phường xã, `public/js/app.js`. Kiểm: test hợp lệ và HTTP; kiem-base.
- [ ] B5. Cấp phát: cột mới, `src/services/provisioning.ts` (số dư, phân loại, giữ đơn, get_date_domain, check_domain), job `retry_awaiting_funds`, mật khẩu tên miền trong Control Panel. Kiểm: test luồng với máy chủ P.A giả.
- [ ] B6. Đổi DNS .vn có IP (tự phân giải), quốc tế 4 DNS; form Control Panel nhận "tên IP". Kiểm: test với máy chủ giả.
- [ ] B7. Quản trị: số dư thật, cờ chế độ, Kiểm tra API bằng `check_account_still`, trang `/admin/cho-xu-ly`. Kiểm: test HTTP; kiem-base.
- [ ] B8. `scripts/pa-thu-endpoint-test.mjs` (từ chối endpoint khác `interface_test.php`). Kiểm: test chạy script với endpoint thật thì thoát lỗi, với máy chủ giả có đường dẫn `interface_test.php` thì in đủ mã.
- [ ] B9. Chụp form chủ thể 1366 và 360 vào `docs/mtm/pa-dang-ky/`; cập nhật plan. Kiểm: ảnh không tràn ngang.

## Lệch spec

(ghi trong lúc làm)
