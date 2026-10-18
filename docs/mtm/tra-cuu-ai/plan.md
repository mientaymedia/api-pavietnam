---
type: plan
du_an: tra-cuu-ai
buoc: 3 - Build
dau_vao: docs/mtm/tra-cuu-ai/spec.md
nhanh: mtm/tra-cuu-ai (worktree D:\api-pavietnam-ai, tách từ mtm/trang-chu)
cap_nhat: 18/10/2026
---

# Plan: Tìm tên miền cùng AI

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm. Chủ đã duyệt theo mặc định khuyến nghị nên làm luôn sau khi viết plan.

Cổng chặn mỗi commit: `npx tsc -p tsconfig.json --noEmit`, `npm test` (mốc trước khi làm 233/233), `npm run kiem-dau` 0; bước có giao diện thêm `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu tiền tố.

## Các bước

- [x] A0. Tài liệu `spec.md`, `plan.md`. Kiểm: tệp có trong `docs/mtm/tra-cuu-ai`. Commit `9a27a57`.
- [x] A1. Nền: bảng `ai_usage_daily` (`src/db/schema.sql`), cấu hình `settings.ai()` và `ai.openai_key` trong `SECRET_KEYS` (`src/lib/settings.ts`), `OPENAI_BASE_URL` (`src/config.ts`, `.env.example`), `rateLimit` nhận `max` là hàm và `onLimit` (`src/middleware/ratelimit.ts`). Kiểm: cổng chặn; `migrate` tạo được bảng. Commit `68acbe5`; 233/233 đạt.
- [x] A2. Lớp nhà cung cấp `src/lib/ai/types.ts`, `src/lib/ai/openai.ts`, `src/lib/ai/index.ts`. Kiểm: tsc sạch; test ở A4. Commit `b9a661f`.
- [x] A3. Dịch vụ `src/services/goiYTenMien.ts` (sẵn sàng, chuẩn hóa, lọc từ, đuôi, trần, thống kê) và tách `kiemTraNhieu` khỏi `searchDomains` (`src/services/domains.ts`). Kiểm: cổng chặn, test cũ của tìm kiếm vẫn đạt. Commit `ddc4486`; 233/233 đạt.
- [x] A4. Test đơn vị dịch vụ và nhà cung cấp (`test/tra-cuu-ai.test.ts` phần 1): chuẩn hóa, lọc từ, đuôi, trần 16 lệnh, an toàn trạng thái, chi phí, lỗi AI. Kiểm: test mới đạt. Commit `c2472f5`; 244/244 đạt.
- [x] A5. Route `src/routes/timCungAi.ts` (GET/POST, 2 lớp giới hạn, noindex), gắn trong `src/app.ts`, robots (`src/routes/home.ts`), view `src/views/tim-cung-ai.ejs`, `noindex` trong `src/views/partials/head.ejs`, đếm "thêm vào giỏ" (`src/routes/cart.ts`). Kiểm: cổng chặn + kiem-base. Commit `96e8e9c`; 244/244 đạt, kiem-base 0.
- [x] A6. Tab "Tìm cùng AI" ở `src/views/home.ejs` + CSS (`public/css/app.css`), cờ `aiBat` từ route `/`. Kiểm: cổng chặn + kiem-base. Commit `6de3bd4`; 244/244 đạt, kiem-base 0 (đã bật AI bằng khóa giả trong kiem-base để bò cả tab và form AI).
- [x] A7. Quản trị: nhóm cấu hình `ai.` (`src/routes/admin.ts`, `src/views/admin/settings.ejs` vẽ `textarea`), thẻ thống kê ở `src/views/admin/dashboard.ejs`. Kiểm: cổng chặn + kiem-base. Commit `3d9e6df`; 244/244 đạt, kiem-base 0.
- [ ] A8. Test HTTP (`test/tra-cuu-ai.test.ts` phần 2): giới hạn 429, mô tả dài 400, CSRF 403, bật tắt, noindex, robots, sitemap, bí mật, CSP, trần qua HTTP. Kiểm: `npm test` đạt hết.
- [ ] A9. Chạy thử cục bộ (P.A sandbox, OpenAI giả lập trong scratchpad), chụp `docs/mtm/tra-cuu-ai/tab-ai-1366.png`, `tab-ai-360.png`, `ket-qua-1366.png`, `ket-qua-360.png`; sửa lỗi nhìn thấy. Kiểm: ảnh có trong thư mục, 360px không tràn ngang.

## Lệch spec

(ghi trong lúc làm)
