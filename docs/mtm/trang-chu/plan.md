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

- [ ] T0. Tài liệu `intent.md`, `spec.md`, `plan.md`. Kiểm: `git status` sạch trong `docs/mtm/trang-chu`.
- [ ] T1. Tài nguyên: `public/fonts/*.woff2` + `OFL.txt`, `public/img/mientaymedia-logo.png`, `public/img/mientaymedia-logo-trang.png`, `public/img/khach-hang/*.png`. Kiểm: tệp tồn tại, `GET /fonts/...` 200.
- [ ] T2. Màu và font chung: `public/css/app.css` (`:root`, `@font-face`), `src/lib/settings.ts`, `src/db/seed.ts`, `src/routes/admin.ts` (gợi ý), `src/views/partials/head.ejs`. Kiểm: cổng chặn.
- [ ] T3. Dữ liệu trang chủ: `src/routes/home.ts` (chips, noiBat, uuDai, giaChuyenTu; `/chuyen-ten-mien?domain=`), `test/trang-chu.test.ts`. Kiểm: test mới đạt (phần dữ liệu), cổng chặn.
- [ ] T4. Header và footer dùng chung: `src/views/partials/header.ejs`, `src/views/partials/footer.ejs`, CSS. Kiểm: cổng chặn + `kiem-base`.
- [ ] T5. Trang chủ: `src/views/home.ejs` (9 khối), CSS `tc-*`. Kiểm: cổng chặn + `kiem-base`, test trang chủ đạt đủ.
- [ ] T6. Chạy thử sandbox cổng 3101, CSDL tạm; chụp `docs/mtm/trang-chu/trang-chu-desktop.png`, `trang-chu-dien-thoai.png`; sửa lỗi nhìn thấy. Kiểm: ảnh có trong thư mục, không tràn ngang ở 360px.

## Lệch spec

(chưa có)
