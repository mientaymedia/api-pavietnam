---
type: plan
du_an: tai-khoan-chung (nấc 1)
buoc: 3 - Build
nhanh: mtm/tai-khoan-chung (repo tên miền), feat/tai-khoan-mientay (repo mientay-web)
cap_nhat: 21/10/2026
---

# Plan: Cổng Tài khoản MienTay (nấc 1)

Người giao việc đã nói "viết spec.md và plan.md rồi build luôn", nên làm ngay không dừng chờ duyệt. Spec: `spec.md` cùng thư mục.

## Các bước

- [ ] 1. Cấu hình và phiên hai cookie
  - Tệp: `src/config.ts`, `src/middleware/session.ts`, `src/lib/basePath.ts` (thêm `chuyenTuyetDoi`, `taoRedirectTienTo`), `src/lib/congTaiKhoan.ts` (mới: `CONG`, `dichCong`, `laCong`), `.env.example`.
  - Kiểm: `npx tsc --noEmit`; `npm test` không đổi kết quả (cổng tắt mặc định).
- [ ] 2. Tách hàm xử lý đăng nhập dùng chung, router cổng, chuyển hướng link cũ
  - Tệp: `src/routes/auth.ts`, `src/routes/congTaiKhoan.ts` (mới), `src/app.ts`, `src/middleware/auth.ts`, `src/routes/dangNhapMxh.ts` (cờ `cong`), `src/routes/account.ts` (`quay_ve`).
  - Kiểm: tsc; `npm test`.
- [ ] 3. Giao diện cổng
  - Tệp: `src/views/cong/*.ejs`, `public/css/cong.css`, `src/views/partials/nut-mxh.ejs` (tham số cổng).
  - Kiểm: mở thử từng trang bằng app chạy cục bộ; `npm run kiem-dau`.
- [ ] 4. Test HTTP SSO
  - Tệp: `test/tai-khoan-chung.test.ts`.
  - Kiểm: `npm test` đạt hết.
- [ ] 5. kiem-base bò cả cổng
  - Tệp: `scripts/kiem-base.mjs`.
  - Kiểm: `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` thoát 0.
- [ ] 6. Traefik và docs triển khai
  - Tệp: `deploy/vps/docker-compose.yml`, `docs/mtm/tai-khoan-chung/trien-khai.md` (callback giữ nguyên, thứ tự triển khai, đường lui).
  - Kiểm: đọc lại nhãn Traefik khớp router `tenmien`; `docker compose config` nếu máy có docker.
- [ ] 7. Email qua Resend
  - Tệp: `src/config.ts`, `src/lib/settings.ts`, `src/lib/mailer.ts`, `src/routes/admin.ts` (ô cấu hình), `.env.example`, `docs/EMAIL-ZNS.md`, `test/mailer-resend.test.ts`.
  - Kiểm: test với máy chủ Resend giả lập; `npm test`.
- [ ] 8. Site chính: nút Đăng nhập trỏ cổng
  - Tệp (worktree `D:\mientay-web-tk`): `web/src/lib/site-data.ts`, `web/src/components/SiteHeader.tsx`.
  - Kiểm: `npm run lint`, `npx tsc --noEmit`, `npm run build` trong `web/`.
- [ ] 9. Ảnh cổng 1366 và 360, kiểm toàn bộ, ghi kết quả
  - Tệp: `docs/mtm/tai-khoan-chung/*.png`, plan này.
  - Kiểm: tsc, npm test, kiem-dau, kiem-base.

## Lệch spec

(ghi trong lúc làm)

## Kết quả kiểm

(ghi ở bước 9)

## Việc chủ cần làm

(ghi ở bước 9)
