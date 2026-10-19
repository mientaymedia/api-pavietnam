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
- [x] B8. `scripts/pa-thu-endpoint-test.mjs` (từ chối endpoint khác `interface_test.php`). Kiểm: test chạy script với endpoint thật thì thoát lỗi, với máy chủ giả có đường dẫn `interface_test.php` thì in đủ mã.
- [x] B9. Chụp form chủ thể 1366 và 360 vào `docs/mtm/pa-dang-ky/`; cập nhật plan. Kiểm: ảnh không tràn ngang.

Phạm vi chủ chốt thêm 19/10 (làm sau B0 đến B9):

- [x] B10. Thông báo Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`, secret webhook trong settings mã hóa; tin khi đơn đã thanh toán, đăng ký thành công, thiếu quỹ (kèm nút "Đã nạp, kích hoạt"), lỗi cần người xử lý. Kiểm: test với Telegram giả lập (`TELEGRAM_API_BASE`).
- [x] B11. Webhook `POST /webhooks/telegram`: xác thực `X-Telegram-Bot-Api-Secret-Token`, chỉ chat id được phép; nút và `/kichhoat` chạy kiểm số dư rồi đăng ký đơn chờ; `/sodu`, `/doncho`; bấm hai lần không đăng ký hai lần. Hướng dẫn setWebhook trong docs. Kiểm: test HTTP.
- [x] B12. Cổng máy cho CRM (chủ sửa 19/10): dùng chung `/api/noi-bo/*` với khóa `WEB_TEN_MIEN_KEY` theo client sẵn có bên CRM (`D:/crm-mientaymedia/src/server/tich-hop/web-client.ts`, chỉ đọc); thêm `GET /api/noi-bo/trang-thai`, `POST /api/noi-bo/kich-hoat` (dùng chung khóa với nút Telegram); web đẩy sự kiện sang CRM khi đơn đã thanh toán, chờ quỹ, lỗi, đăng ký xong (đối chiếu `kiem-tra.ts` bên CRM). Đặc tả `docs/mtm/pa-dang-ky/api-crm.md`. Kiểm: test HTTP và CRM giả lập.

Kết quả kiểm cuối (19/10/2026, sau B12): `tsc` sạch; `npm test` 344/344 đạt (mốc đầu 264); `npm run kiem-dau` 0; `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu tiền tố; ảnh `ho-so-1366.png`, `ho-so-360.png` không tràn ngang (scrollWidth = clientWidth).

## Lệch spec

- L1. Bảng phân loại thêm nhóm "không đăng ký được" (101, 303, 102 đến 107, 209, 402, 404, 405, 604): giao việc chỉ liệt kê 5 nhóm nhưng tên đã có chủ thì không bao giờ đăng ký được, giữ hành vi cũ là thất bại và hoàn tiền. An toàn thêm: 101/303 ở lần thử thứ hai trở đi hỏi `check_domain` trước, ReturnCode 1 coi như lần trước đã đăng ký được.
- L2. Lỗi cấu hình đại lý (501 IP, 202 key, 600 lệnh, 304/305) xếp vào "cần người xử lý" thay vì "tạm thời": thử lại không giúp và hoàn tiền thì sai (tên miền vẫn mua được sau khi sửa cấu hình). Lỗi tạm thời quá 3 lần cũng giữ cho người xem, không hoàn như trước (có thể P.A đã trừ tiền khi hết giờ chờ). Lệnh ghi không tự thử lại ở tầng HTTP.
- L3. Chế độ thử chỉ đổi endpoint của lệnh GHI (đăng ký, gia hạn, đổi DNS, đổi mật khẩu, sửa thông tin): tài liệu chỉ có link thử cho các lệnh này; lệnh đọc (check_whois, số dư, ngày hết hạn) vẫn đi endpoint thật để tìm kiếm và số dư đúng. 900 chỉ được tính khi lệnh thật sự đi đường dẫn `/interface_test.php`. Ở chế độ thử, đơn được ghi "đăng ký xong" kèm `meta.paThu`, hạn tính từ hôm nay (P.A không có ngày), quản trị có dải cảnh báo trên mọi trang.
- L4. Gửi mọi lệnh bằng GET như demo của P.A (trước dùng POST cho đăng ký). `sendmail` mặc định 0 (email P.A mang tên P.A, hệ thống đã tự gửi email), có ô bật trong Cấu hình.
- L5. Điện thoại gửi dạng `+84-xxxxxxxxx` cho cả nhóm owner (demo ghi owner `0987654321`, nhưng mã 309 đòi dạng +84 với tên miền .vn).
- L6. Chỉ nhận chủ thể tại Việt Nam (`ownerCountry` = "Viet Nam"); khách nước ngoài cần tệp quốc gia ISO3166 (.xls nhị phân) và chưa làm.
- L7. Người đại diện của tổ chức dùng chung các cột `full_name`, `id_number`, `birth_date`, `gender` (không thêm bảng); địa chỉ và liên hệ người quản lý .vn lấy theo hồ sơ công ty. Chỉ thêm cột `contacts.ward`. Bỏ ô Quận/Huyện và Quốc gia khỏi form (hành chính 2 cấp, chỉ Việt Nam).
- L8. `validateForTld` (quy định VNNIC, dùng cho đổi chủ thể và sửa liên hệ) giữ nguyên; luật P.A là hàm mới `loiHoSoPA`, kiểm ở trang thanh toán (theo đuôi trong giỏ) và trước khi gọi P.A. Hồ sơ cũ thiếu phường xã sẽ bị giữ "sai hồ sơ" khi cấp phát; trang hồ sơ hiện "Cần bổ sung" và có nút Sửa.
- L9. Lệnh không có trong tài liệu P.A (chuyển tên miền về, mã EPP, khóa chuyển đổi, đọc/sửa bản ghi DNS, liệt kê) bị chặn ở chế độ thật với thông báo "chưa hỗ trợ qua API", trừ khi chủ đặt `PA_ACTION_*`. Đơn chuyển tên miền về sẽ bị giữ "cần người xử lý". Trang Control Panel vẫn mở được (khối DNS báo không đọc được). Sửa liên hệ quốc tế dùng `set_info_domain`, .vn báo làm bằng bản khai.
- L10. Số tiền cần cho một dòng = giá vốn (`cost_register` / `cost_renew`) x số năm; giá vốn chưa nhập thì dùng số tiền khách trả (ước dư, có thể giữ đơn khi quỹ đủ giá vốn nhưng thiếu giá bán).
- L11. Job chờ quỹ chạy bằng một bộ hẹn giờ 5 phút riêng trong worker (lịch định kỳ chung chỉ xếp lại mỗi 10 phút). Nhắc thiếu quỹ 4 giờ một lần cho tới khi hết đơn chờ; email xin lỗi gửi một lần cho dòng giữ quá 24 giờ, áp cho cả "chờ nạp quỹ" và "cần người xử lý" (khách cùng phải chờ), không áp cho "sai hồ sơ".
- L12. Phần 8 theo chỉnh sửa của chủ: không có `/api/may/*`, `CRM_WEB_KEY`; dùng `/api/noi-bo/*` với `WEB_TEN_MIEN_KEY`. Web chưa có `thong-bao`, `gia-han` mà `web-client.ts` của CRM gọi (ngoài phạm vi, ghi trong `api-crm.md`). Sự kiện `don_cho_quy`, `don_loi` CRM chưa nhận: web chỉ gửi khi bật `crm.su_kien_mo_rong`.
- L13. Đẩy sự kiện sang CRM cần cấu hình mới ở web (`crm.bat`, `crm.url`, `crm.khoa` hoặc `CRM_URL`, `CRM_INTEGRATION_KEY`), mặc định tắt. Tên ô theo runbook bên CRM (`crm.khoa`, `crm.bat`).
- L14. Test dùng CSDL riêng cho các tệp có kích hoạt đơn chờ (`test/helpers/csdl-rieng.ts`): kích hoạt quét mọi dòng giữ, chạy song song trên CSDL chung sẽ đăng ký nhầm dòng của tệp khác.
- L15. Telegram: tin văn bản thuần (không parse_mode) để tên khách, tên miền không làm vỡ định dạng; webhook trả 200 ngay rồi mới chạy lệnh (Telegram gửi lại nếu chậm), chống trùng bằng bảng `telegram_updates`.

## Cách chạy script thử với interface_test.php (trên VPS)

Trong container web (đã có `dist/` sau build, dùng chính bộ tham số của app):

```bash
docker exec -it <container-web> sh -c 'PA_ENDPOINT=https://daily.pavietnam.vn/interface_test.php node scripts/pa-thu-endpoint-test.mjs'
```

Thiếu `PA_USERNAME` / `PA_APIKEY` thì script lấy `PAVIETNAM_USERNAME` / `PAVIETNAM_APIKEY` sẵn có trong môi trường. Script từ chối (thoát 2) nếu endpoint không phải `/interface_test.php`; in `Command`, `ReturnCode`, `ReturnText` của 6 lệnh (đăng ký .vn cá nhân, .com.vn công ty, .com, gia hạn, đổi DNS .vn kèm IP, đổi DNS .com), không in apikey; thoát 0 khi cả 6 trả 900.

## Việc chủ cần làm

1. Deploy nhánh (qua PR, không đẩy thẳng main). `migrate()` tự thêm cột và bảng mới khi khởi động.
2. Trên VPS chạy script thử ở trên, gửi lại kết quả. Nếu P.A báo sai tên lệnh gia hạn thì đặt `PA_ACTION_RENEW=renew_domain_vn`.
3. Tùy chọn: `npm run pa:dia-gioi -- --ghi` trong container để nạp danh sách tỉnh, phường xã mới nhất từ P.A (ghi cạnh CSDL, khởi động lại web để dùng).
4. Quản trị > Bảng giá: nhập giá vốn P.A (`cost_register`, `cost_renew`) cho từng đuôi để kiểm số dư đúng.
5. Quản trị > Cấu hình: kiểm "Chế độ thử" đang TẮT trước khi bán; bấm "Kiểm tra ngay" (check_account_still) xem số dư.
6. Telegram (biến `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`, `TELEGRAM_WEBHOOK_SECRET` đã có trong .env VPS). Đăng ký webhook một lần (thay giá trị thật, chạy trên VPS):

   ```bash
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"      -d url=https://mientaymedia.com/ten-mien/webhooks/telegram      -d secret_token=$TELEGRAM_WEBHOOK_SECRET      -d 'allowed_updates=["message","callback_query"]'
   ```

   Thử: gõ `/sodu` với @mientaymediabot từ chat id được phép.
7. CRM: đặt `WEB_TEN_MIEN_KEY` (cùng giá trị hai bên, từ 32 ký tự) trên web; ở web nhập địa chỉ CRM và khóa gửi (`CRM_URL`, `CRM_INTEGRATION_KEY` hoặc ô trong Cấu hình), bật "Đẩy sự kiện đơn hàng sang CRM". Gửi `docs/mtm/pa-dang-ky/api-crm.md` cho bên CRM: cần thêm hàm GET cho `trang-thai`, và nếu muốn dashboard chờ quỹ thì bổ sung hai loại `don_cho_quy`, `don_loi` rồi mới bật `crm.su_kien_mo_rong`.
8. Hồ sơ chủ thể cũ chưa có phường xã: nhắc khách vào Tài khoản > Hồ sơ để bổ sung (trang đã hiện "Cần bổ sung").
