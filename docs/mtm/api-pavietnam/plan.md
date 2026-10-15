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
- [x] P1. Commit tài liệu SDLC (`intent.md`, `spec.md`, `plan.md`). Kiểm: `git status` sạch trong `docs/mtm`. Commit `3009d8a`.
- [x] B0. Công cụ quét `scripts/kiem-dau.mjs` + `scripts/kiem-dau.cho-phep.json` (spec 3.5), chế độ báo cáo; ghi số đếm ban đầu vào lời commit. Cảnh báo kiểu dấu cũ `khoá, huỷ, tuỳ, hoá, thoả, hoà, thuỷ` (D2 đảo chiều so với spec 3.11). Có chế độ `--html` đọc stdin cho B12. Kiểm: công cụ chạy, kiểm mã hoá NFC/BOM đạt trên toàn repo; test cũ không đổi (165/171 như trước). Commit `674382c`; số đếm ban đầu 1148 chuỗi trên 88 tệp.
- [x] B1. L2: `scripts/chay-test.mjs`, dòng `"test"` và `"kiem-dau"` trong `package.json`. L1: `src/pavietnam/client.ts` xét sandbox trước khi đòi key. `test/sandbox.test.ts`. Kiểm: `npm test` 171 + mới, 0 hỏng, trong Git Bash và PowerShell. Kết quả: 173/173 đạt (5 lần liên tiếp trong Git Bash, 1 lần trong PowerShell).
- [x] B2. `src/lib/text.ts` (`boDau`), so khớp qua `boDau` ở `provisioning.ts` (`isPermanent`, export) và `client.ts` (`interpret`, `checkDomain`, `whois`); `test/text-match.test.ts`. Chưa thêm dấu chữ nào. Kiểm: cổng 6.1. Kết quả: 179/179 đạt.
- [x] B3a. Hạ tầng tiền tố: `config.ts` (`basePath`, kiểm khớp `APP_URL`), `src/lib/basePath.ts`, `app.ts` (router con, bọc `res.redirect`, ngoài tiền tố), `session.ts`, `middleware/auth.ts:11`, `routes/cart.ts` (`quayLai`), `routes/home.ts` (robots), `.env.example` (`BASE_PATH=`), `test/base-path.test.ts` (phần không phụ thuộc view). Kiểm: cổng 6.1, test cũ không đổi khi `BASE_PATH` rỗng. Kết quả: 190/190 đạt.
- [x] B3b. View: chèn `<%= base %>` trước mọi `href`/`action`/`src` tuyệt đối; `url()` cho link dựng trong khối mã; `head.ejs` `data-base`; `public/js/app.js` `fetch` theo `data-base`; `scripts/kiem-base.mjs`; hoàn tất `test/base-path.test.ts`. Kiểm: mã băm thuộc tính sau khi xoá `<%= base %>` không đổi, `kiem-base` = 0. Kết quả: 191/191 đạt; `kiem-base` bò 58 + 40 + 41 trang (vãng lai, khách, quản trị), 0 link thiếu tiền tố.
- [x] B4. Lõi dùng chung: `config.ts` (MienTay Media), `.env.example` (APP_NAME, MAIL_FROM, mẫu SePay MB), `money.ts` (đ), `settings.ts`, `seed.ts`, partials, `error.ejs`, `middleware/error.ts`, `public/js/app.js`; `test/money.test.ts`. Kiểm: cổng 6.1, `kiem-dau` sạch trên tệp vừa sửa. Kết quả: 193/193 đạt.
- [x] B5. Trang công khai: `home`, `pricing`, `search`, `whois`, `transfer` + `routes/home.ts`. Kết quả: 193/193 đạt.
- [x] B6. Đăng nhập/đăng ký/2FA: `views/auth/*`, `routes/auth.ts`, `lib/validate.ts`, middleware, `twoFactor.ts`, `verification.ts`, `test/two-factor.test.ts`. Kết quả: 193/193 đạt.
- [x] B7. Giỏ, thanh toán, đơn: views, `routes/cart.ts`, `checkout.ts`, `orders.ts`, services, phần hiển thị `payments/*` (trừ vùng khoá), `test/cart-orders.test.ts`. Kiểm thêm spec 6.2. Kết quả: 193/193 đạt; momo.ts chỉ đổi dòng 16-17, 64, 110; zalopay.ts dòng 26, 69; webhooks.ts không diff.
- [x] B8. Khách và tên miền: `dashboard`, `account/*`, `domains/*` (detail có thể commit riêng), `account.ts`, `controlPanel.ts`, services liên quan, `test/domain-contact.test.ts`, `test/transfer-out.test.ts` (`/mở khóa/i`). Kết quả: 193/193 đạt.
- [x] B9. Quản trị: `views/admin/*`, `routes/admin.ts` (gồm giá trị mẫu ZNS), `reports.ts`, `audit.ts`, `jobs/*`, thông điệp hiển thị trong `client.ts`. Có thể tách commit. Kết quả: 193/193 đạt (commit B9a, B9b).
- [x] B10. API JSON: `routes/api.ts` (chỉ giá trị `error`/`message`). Kết quả: 193/193 đạt.
- [x] B11. Email và ZNS: `notifications.ts`, `znsEvents.ts`, `lib/zns.ts`, `mailer.ts`, `test/zns.test.ts`, `test/email-encoding.test.ts`. Kết quả: 195/195 đạt.
- [ ] B12. Kiểm chứng cuối có thể làm trên máy: `kiem-dau` toàn bộ = 0, NFD = 0, mã băm, `kiem-base` = 0, spec 6.2, curl 6.3 bước 1 đến 3 (cả hai chế độ tiền tố), rút gọn danh sách cho phép, lập `test.md` có bảng kiểm chính tả cho chủ. Không mở PR (không push).

## Lệch spec

1. Repo không có nhánh `main` cục bộ hay trên remote; nhánh chính là `claude/domain-registration-platform-23gtg1` (origin/HEAD), đúng commit `55b3a60` mà spec gọi là `main`. Nhánh `mtm/api-pavietnam` tạo từ commit này.
2. Spec mục 7 ghi nhánh `feat/tieng-viet-co-dau` và "mở PR khi xong B12"; theo mục 10 dùng `mtm/api-pavietnam`, và theo người giao việc không push nên không mở PR.
3. D2 (mục 10): dùng kiểu dấu mới "khóa, hủy, tùy, hóa đơn, thỏa". Bảng 3.11 và câu test `transfer-out` đổi theo (`/mở khóa/i`); công cụ quét cảnh báo kiểu CŨ thay vì kiểu mới như spec 3.5/3.11 viết.
4. D1 (mục 10): `allowScripts` đã commit riêng ở P0, nên B1 không cần cách `git apply --cached` ở spec 3.3.
5. B1: spec 3.3 chỉ nói tạo CSDL tạm rồi chạy test. Thực tế CSDL mới tinh bị nhiều tiến trình test cùng chuyển WAL và tạo bảng nên lần đầu có 5 tệp hỏng "database is locked" (trước đây không lộ vì `data/test.sqlite` được giữ lại giữa các lần chạy). `chay-test.mjs` chạy `src/db/migrate.ts` một lần trước khi chạy test. Không sửa `src/db/index.ts`.
6. B1: `test/sandbox.test.ts` đổi `config.pa` ngay trong tiến trình thay vì ghi `pa.sandbox` vào bảng `settings`, vì các tệp test khác chạy song song trên cùng CSDL và phải luôn ở chế độ giả lập (ghi `pa.sandbox=0` có thể làm chúng gọi P.A thật).
7. B0: `src/db/migrate.ts` (dòng in "Da tao/cap nhat cau truc CSDL.") là màn hình dòng lệnh như `seed.ts` (C6) nhưng spec 3.4/3.5 không liệt kê; xếp vào danh sách cho phép với lý do C6, không thêm dấu.
8. B0b (commit `fb1502f`): từ điển của spec 3.5 bỏ sót nhiều nhãn ngắn không chứa từ "đặc trưng" ("Ca nhan", "Tong quan", "Hang doi", "Bao cao kinh doanh"...). Thêm luật thứ hai vào `kiem-dau.mjs`: chuỗi không có dấu nào mà từ một nửa số từ trở lên (tối thiểu 2 từ) là âm tiết tiếng Việt viết ASCII thì báo "câu không dấu". Chặt hơn spec, không nới. Số đếm ban đầu theo luật mới: 1303 chuỗi trên 88 tệp. Nhãn một từ ("Thoat") vẫn phải soát bằng mắt khi sửa từng tệp.
9. B3: link dựng trong khối mã (menu đầu trang, `verify-result.ejs`) chèn `<%= base %>` thay vì bọc `url(...)` như spec 3.10 gợi ý, để mã băm `href` (đo sau khi xóa `<%= base %>`) vẫn khớp. `url()` vẫn có trong `res.locals`. Bản bọc `res.redirect` đặt ở đầu router con thay vì cấp `app`, để lời chuyển hướng `GET /` ngoài tiền tố (ở cấp `app`) không bị thêm tiền tố hai lần; mọi route vẫn đi qua bản bọc.
10. B3: `GET /ten-mien` (thiếu `/` cuối) trả 301 sang `/ten-mien/` do `express.static` tự chuyển hướng; đích có tiền tố đúng nên giữ.
11. Spec 3.6 liệt kê 12 câu so khớp chữ trong test, nhưng thực tế còn thêm: `two-factor.test.ts:89` (`/dang bat/`), `qrcode.test.ts:140` (`/qua dai/`), `totp.test.ts:34` (`/khong hop le/`). Câu nào có chữ nguồn được thêm dấu thì đổi theo trong cùng commit, giữ nguyên độ chặt (B6: `/dang bat/` thành `/đang bật/`).
12. B7: thông điệp `verifyReturn` của MoMo (`momo.ts:110`) được hiện cho khách qua flash ở trang `/thanh-toan/ket-qua`, khác `verifyIpn`, nên đã thêm dấu; `verifyIpn` giữ nguyên theo spec 3.4. Hai chỗ viết cứng đơn vị "d" (`pricing.ts` lỗi mã giảm giá tối thiểu, `balance.ts` số dư không đủ) chuyển sang `formatVnd` để thống nhất "830.000 đ" (C2).
13. B11: thêm dấu cả ở vài tệp spec không liệt kê nhưng chữ lọt ra màn hình hoặc vào test: `src/lib/http.ts` (lỗi mạng ghép vào thông điệp lỗi P.A hiện cho quản trị), `src/lib/crypto.ts`, `src/lib/totp.ts` (lỗi nội bộ; `totp.test.ts:34` đổi theo thành `/không hợp lệ/`), `src/lib/qrcode.ts` (`aria-label` mặc định "Mã QR" và lỗi chuỗi quá dài; `qrcode.test.ts:140` thành `/quá dài/`). Không đổi hành vi.
