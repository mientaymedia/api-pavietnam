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
- [x] A8. Test HTTP (`test/tra-cuu-ai.test.ts` phần 2): giới hạn 429, mô tả dài 400, CSRF 403, bật tắt, noindex, robots, sitemap, bí mật, CSP, trần qua HTTP. Kiểm: `npm test` đạt hết. Commit `6dab3d4`; 254/254 đạt (chạy 3 lần liền đều đạt), kiem-base 0.
- [x] A9. Chạy thử cục bộ (P.A sandbox, OpenAI giả lập trong scratchpad), chụp `docs/mtm/tra-cuu-ai/tab-ai-1366.png`, `tab-ai-360.png`, `ket-qua-1366.png`, `ket-qua-360.png`; sửa lỗi nhìn thấy. Kiểm: ảnh có trong thư mục, 360px không tràn ngang. Chạy bằng P.A sandbox, OpenAI giả lập, BASE_PATH=/ten-mien, Chrome headless qua DevTools Protocol (script trong scratchpad, không thêm phụ thuộc). Cả 4 ảnh: scrollWidth = clientWidth (không tràn ngang). Ở 360px ba nhãn tab xuống hai hàng như dự kiến.

## Lệch spec

- L1. Tên cột bảng `ai_usage_daily` đổi sang tiếng Anh (`day, calls, blocked, errors, suggested, available, added_to_cart, tokens_in, tokens_out, cost_vnd`) thay vì tiếng Việt không dấu như bản spec đầu: `kiem-dau` đọc chuỗi SQL và báo tên cột không dấu là chữ thiếu dấu; các bảng khác trong `schema.sql` cũng dùng tên tiếng Anh. Spec mục 8 đã sửa theo.
- L2. Không có chỉ báo "đang xử lý" bằng CSS (intent mục 2.2): không có JS thì CSS không biết form đã gửi. Trình duyệt vẫn hiện vòng tải của chính nó. Nếu chủ muốn, thêm vài dòng vào `public/js/app.js` (tệp tự phục vụ, hợp CSP) ở lần sau.
- L3. Ô "Đuôi ưa thích" cho chọn nhiều hơn 2 (không có JS để chặn); máy chủ chỉ lấy 2 đuôi đầu theo thứ tự hiển thị, nhãn ghi rõ "tối đa 2".
- L4. Mô tả của khách chứa từ cấm KHÔNG bị chặn cả lượt (ví dụ "phụ kiện iphone" là nhu cầu thật), chỉ tên gợi ý chứa từ cấm bị loại trước khi gọi P.A. Tiêu chí 5 của intent vẫn đạt (tên đó không gọi P.A, không hiện ra).
- L5. Trạng thái "Chưa kiểm tra được" trên trang AI không in nguyên văn lỗi P.A như trang `/tim-kiem` (khách không cần chữ kỹ thuật).
- L6. Chi phí ước tính: lỗi hết giờ hoặc mất mạng cộng mức xấu nhất (500 token vào, 1.200 token ra) vì OpenAI có thể vẫn tính tiền; lỗi HTTP không cộng. Đơn giá và tỷ giá mặc định (1 và 5 USD cho 1 triệu token, 27.000 đ) cố ý cao để trần chạm sớm hơn thực tế; chủ cần sửa theo model đã chọn.
- L7. Bộ đếm "thêm vào giỏ" dựa vào trường ẩn `nguon=ai`: người cố ý có thể gửi giả để thổi số. Chỉ là thống kê, không ảnh hưởng tiền hay đơn.
- L8. Giới hạn theo IP vẫn trong bộ nhớ một tiến trình (như `rateLimit` sẵn có); khởi động lại thì đếm lại. Trần chi phí ngày thì bền trong CSDL. Giới hạn ngày là cửa sổ 24 giờ kể từ lượt đầu, không reset lúc 0 giờ.
- L9. Không đo độ trễ với OpenAI thật (tiêu chí 12 của intent) vì không được gọi OpenAI thật; thời gian chờ mặc định 15 giây, cấu hình được 3 đến 60 giây. Kiểm P.A thật dùng timeout và thử lại sẵn có (30 giây, 2 lần), có thể làm một lượt chậm khi P.A chậm.

## Việc chủ cần làm trước khi bật

1. Tạo khóa API trong tài khoản OpenAI (nên tạo khóa riêng cho web này, đặt hạn mức chi tiêu tháng trong OpenAI làm lớp chặn thứ hai), nạp tiền.
2. Chọn một model nhỏ, rẻ hiện hành có hỗ trợ Structured Outputs (json_schema) và nhập đúng tên vào Quản trị > Cấu hình > Tìm cùng AI. Model suy luận: đặt "Mức suy luận" là minimal hoặc low.
3. Nhập đơn giá token vào, token ra (USD cho 1 triệu token) theo bảng giá OpenAI của model đó, và tỷ giá.
4. Duyệt danh sách từ cấm mặc định trong cùng nhóm.
5. Bật công tắc, thử vài mô tả trên bản thật, xem thẻ "Tìm cùng AI" ở Quản trị > Tổng quan.
6. Bước Deploy: không cần lệnh riêng, máy chủ tự chạy `migrate()` khi khởi động (`src/server.ts`) và tạo bảng `ai_usage_daily` trên CSDL cũ.
