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

- [ ] B0. `intent.md`, `spec.md`, `plan.md`. Kiểm: tệp có trong `docs/mtm/dang-nhap-mxh`.
- [ ] B1. Dữ liệu và cấu hình: bảng `user_identities` (`src/db/schema.sql`), khóa trong `src/config.ts`, `src/lib/settings.ts` (`settings.oauth()`, `SECRET_KEYS`), `.env.example`, nhóm "Đăng nhập mạng xã hội" ở `/admin/cau-hinh` (`src/routes/admin.ts`, `src/views/admin/settings.ejs`). Kiểm: test cũ đạt; migrate chạy lại không lỗi.
- [ ] B2. Lớp nhà cung cấp `src/lib/oauth.ts`: PKCE, URL xin quyền, đổi mã, lấy hồ sơ cho ba bên, `OAUTH_MOCK_BASE`. Kiểm: test đơn vị với máy chủ giả lập.
- [ ] B3. Ghép tài khoản `src/services/lienKetMxh.ts`, email tạm (`sendMail` bỏ qua), route `src/routes/dangNhapMxh.ts` (bắt đầu, callback, hủy liên kết, đặt mật khẩu, bổ sung email), nối vào `src/app.ts`, `src/routes/auth.ts` (gắn danh tính chờ sau đăng nhập mật khẩu), `src/routes/checkout.ts` (chặn đặt hàng). Kiểm: test HTTP đủ tình huống spec mục 7.
- [ ] B4. Giao diện: `partials/nut-mxh.ejs`, trang đăng nhập, đăng ký, khối liên kết ở `/tai-khoan`, trang bổ sung email, dải nhắc ở header, CSS. Kiểm: kiem-base, kiem-dau, test nút ẩn hiện.
- [ ] B5. Ảnh trang đăng nhập 1366 và 360 vào `docs/mtm/dang-nhap-mxh/`; kết quả kiểm cuối, việc chủ cần làm. Kiểm: ảnh không tràn ngang.

## Lệch spec

(ghi khi gặp)

## Việc chủ cần làm

(điền ở B5)
