---
type: plan
du_an: api-pavietnam
buoc: 3 - Build
dau_vao: docs/mtm/api-pavietnam/spec.md (đã duyệt, mục 10 ưu tiên)
nhanh: mtm/api-pavietnam (tạo từ 55b3a60)
cap_nhat: 15/10/2026
---

# Plan: thêm dấu tiếng Việt cho chữ hiển thị và tiền tố BASE_PATH

Ký hiệu tiến độ: `[x]` xong (kèm mã commit), `[ ]` chưa làm, `[~]` đang làm hoặc làm một phần.

## Cổng chặn cho mỗi commit (spec 6.1)

Chạy trong Git Bash tại `D:\api-pavietnam`. Từ B1 trở đi phải đạt đủ:

1. `npx tsc -p tsconfig.json --noEmit` thoát 0.
2. `npm test` (từ B1) hoặc `DATABASE_FILE=<tạm> PAVIETNAM_SANDBOX=1 node --test --import tsx test/*.test.ts` (B0): từ B1 là 171 cũ + test mới, 0 hỏng.
3. `node scripts/kiem-dau.mjs <các tệp vừa sửa>` sạch (từ B0).
4. Mã băm (đo lại tại 55b3a60 ngày 15/10/2026, khớp spec):
   - route `13c9676178cd08b3a27a2dd17d17343e`, `name=` `a78750c5d214bd9ba6f0caa639ece0c0`
   - sau khi xoá `<%= base %>`: `value` `73dc6011...`, `action` `f87296a1...`, `href` `e7e154dd...`, `src` `4997d2ed...`, `id` `adc98f92...`, `for` `6a1e55df...`
   - khoá cấu hình `71aa4f47da269d8356a08a90e3be958c`
5. Luôn `PAVIETNAM_SANDBOX=1`, không đặt key P.A thật, không push, không gọi máy chủ ngoài.

## Các bước

- [x] P0. Commit khối `allowScripts` trong `package.json` thành commit riêng (D1). Tệp: `package.json`. Kiểm: `git diff package.json` rỗng. Commit `1b61da7`.
- [ ] P1. Commit tài liệu SDLC (`intent.md`, `spec.md`, `plan.md`). Kiểm: `git status` sạch trong `docs/mtm`.
- [ ] B0. Công cụ quét `scripts/kiem-dau.mjs` + `scripts/kiem-dau.cho-phep.json` (spec 3.5), chế độ báo cáo; ghi số đếm ban đầu vào lời commit. Cảnh báo kiểu dấu cũ `khoá, huỷ, tuỳ, hoá, thoả, hoà, thuỷ` (D2 đảo chiều so với spec 3.11). Có chế độ `--html` đọc stdin cho B12. Kiểm: công cụ chạy, kiểm mã hoá NFC/BOM đạt trên toàn repo; test cũ không đổi (165/171 như trước).
- [ ] B1. L2: `scripts/chay-test.mjs`, dòng `"test"` và `"kiem-dau"` trong `package.json`. L1: `src/pavietnam/client.ts` xét sandbox trước khi đòi key. `test/sandbox.test.ts`. Kiểm: `npm test` 171 + mới, 0 hỏng, trong Git Bash và PowerShell.
- [ ] B2. `src/lib/text.ts` (`boDau`), so khớp qua `boDau` ở `provisioning.ts` (`isPermanent`, export) và `client.ts` (`interpret`, `checkDomain`, `whois`); `test/text-match.test.ts`. Chưa thêm dấu chữ nào. Kiểm: cổng 6.1.
- [ ] B3a. Hạ tầng tiền tố: `config.ts` (`basePath`, kiểm khớp `APP_URL`), `src/lib/basePath.ts`, `app.ts` (router con, bọc `res.redirect`, ngoài tiền tố), `session.ts`, `middleware/auth.ts:11`, `routes/cart.ts` (`quayLai`), `routes/home.ts` (robots), `.env.example` (`BASE_PATH=`), `test/base-path.test.ts` (phần không phụ thuộc view). Kiểm: cổng 6.1, test cũ không đổi khi `BASE_PATH` rỗng.
- [ ] B3b. View: chèn `<%= base %>` trước mọi `href`/`action`/`src` tuyệt đối; `url()` cho link dựng trong khối mã; `head.ejs` `data-base`; `public/js/app.js` `fetch` theo `data-base`; `scripts/kiem-base.mjs`; hoàn tất `test/base-path.test.ts`. Kiểm: mã băm thuộc tính sau khi xoá `<%= base %>` không đổi, `kiem-base` = 0.
- [ ] B4. Lõi dùng chung: `config.ts` (MienTay Media), `.env.example` (APP_NAME, MAIL_FROM, mẫu SePay MB), `money.ts` (đ), `settings.ts`, `seed.ts`, partials, `error.ejs`, `middleware/error.ts`, `public/js/app.js`; `test/money.test.ts`. Kiểm: cổng 6.1, `kiem-dau` sạch trên tệp vừa sửa.
- [ ] B5. Trang công khai: `home`, `pricing`, `search`, `whois`, `transfer` + `routes/home.ts`.
- [ ] B6. Đăng nhập/đăng ký/2FA: `views/auth/*`, `routes/auth.ts`, `lib/validate.ts`, middleware, `twoFactor.ts`, `verification.ts`, `test/two-factor.test.ts`.
- [ ] B7. Giỏ, thanh toán, đơn: views, `routes/cart.ts`, `checkout.ts`, `orders.ts`, services, phần hiển thị `payments/*` (trừ vùng khoá), `test/cart-orders.test.ts`. Kiểm thêm spec 6.2.
- [ ] B8. Khách và tên miền: `dashboard`, `account/*`, `domains/*` (detail có thể commit riêng), `account.ts`, `controlPanel.ts`, services liên quan, `test/domain-contact.test.ts`, `test/transfer-out.test.ts` (`/mở khóa/i`).
- [ ] B9. Quản trị: `views/admin/*`, `routes/admin.ts` (gồm giá trị mẫu ZNS), `reports.ts`, `audit.ts`, `jobs/*`, thông điệp hiển thị trong `client.ts`. Có thể tách commit.
- [ ] B10. API JSON: `routes/api.ts` (chỉ giá trị `error`/`message`).
- [ ] B11. Email và ZNS: `notifications.ts`, `znsEvents.ts`, `lib/zns.ts`, `mailer.ts`, `test/zns.test.ts`, `test/email-encoding.test.ts`.
- [ ] B12. Kiểm chứng cuối có thể làm trên máy: `kiem-dau` toàn bộ = 0, NFD = 0, mã băm, `kiem-base` = 0, spec 6.2, curl 6.3 bước 1 đến 3 (cả hai chế độ tiền tố), rút gọn danh sách cho phép, lập `test.md` có bảng kiểm chính tả cho chủ. Không mở PR (không push).

## Lệch spec

1. Repo không có nhánh `main` cục bộ hay trên remote; nhánh chính là `claude/domain-registration-platform-23gtg1` (origin/HEAD), đúng commit `55b3a60` mà spec gọi là `main`. Nhánh `mtm/api-pavietnam` tạo từ commit này.
2. Spec mục 7 ghi nhánh `feat/tieng-viet-co-dau` và "mở PR khi xong B12"; theo mục 10 dùng `mtm/api-pavietnam`, và theo người giao việc không push nên không mở PR.
3. D2 (mục 10): dùng kiểu dấu mới "khóa, hủy, tùy, hóa đơn, thỏa". Bảng 3.11 và câu test `transfer-out` đổi theo (`/mở khóa/i`); công cụ quét cảnh báo kiểu CŨ thay vì kiểu mới như spec 3.5/3.11 viết.
4. D1 (mục 10): `allowScripts` đã commit riêng ở P0, nên B1 không cần cách `git apply --cached` ở spec 3.3.
