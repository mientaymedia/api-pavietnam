---
type: intent
du_an: api-pavietnam (nền tảng bán tên miền tự động trên API đại lý P.A Việt Nam)
buoc: 1 - Plan
trang_thai: da chot - san sang Design
cap_nhat: 15/10/2026
---

# Intent: chuyển toàn bộ chữ hiển thị sang tiếng Việt có dấu trước khi triển khai

Yêu cầu của chủ (nguyên văn): "trước khi làm triển khai lên bảng tiếng việt có dấu nhé".
Hiểu là: trước khi đưa lên VPS, mọi chữ mà khách và người quản trị nhìn thấy phải là tiếng Việt có dấu.

Mốc kiểm tra hiện trạng: commit `55b3a60` trên nhánh `main` (D:\api-pavietnam), có một thay đổi chưa commit ở `package.json` (thêm khối `allowScripts`).

## 1. Vì sao làm

- Toàn bộ chữ trên giao diện đang viết không dấu. Ví dụ trang chủ: "Dang ky ten mien Viet Nam &amp; Quoc te" (`src/views/home.ejs:6`), nút "Kiem tra" (`src/views/home.ejs:11`), menu "Bang gia", "Gio hang", "Dang nhap", "Dang ky", "Quan tri" (`src/views/partials/header.ejs:17-25, 37, 44-45`).
- Chữ không dấu cũng có trong email gửi khách, ví dụ tiêu đề "Khoi phuc mat khau", "Ten mien ... da duoc kich hoat" (`src/services/notifications.ts:110, 190`, tổng 18 tiêu đề email), trong thông báo lỗi kiểm tra dữ liệu như "Mat khau toi thieu 8 ky tu" (`src/lib/validate.ts:7`), trong trang lỗi "Khong tim thay trang" (`src/middleware/error.ts:17`).
- Ai bị ảnh hưởng:
  - Khách mua tên miền: chữ không dấu trông như hàng làm vội, khó đọc, dễ hiểu sai (ví dụ "Da" có thể là "Đã" hay "Da"; "ma" có thể là "mã" hay "mà"). Với một dịch vụ thu tiền và giữ tài sản số của khách, điều này làm giảm lòng tin.
  - Nhân viên quản trị: màn hình cấu hình, báo cáo, nhật ký đều không dấu, đọc chậm và dễ nhầm.
- Hệ thống CHƯA triển khai (VPS 14.225.81.243 chưa cài Node; thư mục `data/` trong repo trống, không có CSDL thật). Đây là thời điểm rẻ nhất để đổi: chưa có khách, chưa có dữ liệu cũ phải chuyển đổi.

## 2. Kết quả muốn có

1. Khách và quản trị viên không còn thấy câu chữ tiếng Việt không dấu ở bất kỳ màn hình web, email, thông báo lỗi, thông báo flash, hộp xác nhận, trang lỗi, tệp CSV xuất ra hay phản hồi JSON của API.
2. Chữ có dấu hiển thị đúng ở mọi nơi: trình duyệt (máy tính, điện thoại), hộp thư (Gmail, Outlook), Excel khi mở CSV.
3. Không có gì khác thay đổi về hành vi: đường dẫn URL, tên trường form, khoá cấu hình, mã đơn hàng, nội dung chuyển khoản, chữ ký thanh toán, tên tham số ZNS giữ nguyên; toàn bộ test hiện đang xanh vẫn xanh.
4. Tên thương hiệu hiển thị và đơn vị tiền được chốt một lần, dùng thống nhất.

## 3. Phạm vi

Số liệu đếm bằng máy ngày 15/10/2026 (công cụ quét chuỗi ký tự trong mã TypeScript qua trình phân tích cú pháp, và đoạn chữ, thuộc tính `placeholder`/`title`/`aria-label`/`alt`/`data-confirm`, chuỗi trong khối mã của tệp EJS). Đây là số ước lượng có sai số vài phần trăm (có lẫn vài chuỗi kỹ thuật bị đếm nhầm), dùng để định cỡ công việc, không phải danh sách cuối.

| Nhóm | Tệp | Số đoạn chữ (ước lượng) | Ghi chú |
|---|---|---|---|
| Giao diện EJS `src/views/**` | 44 tệp (42 tệp có chữ; `partials/head.ejs`, `partials/flash.ejs` không có chữ cố định) | khoảng 990 | Nhiều nhất: `domains/detail.ejs` (115), `admin/settings.ejs` (78), `admin/reports.ejs` (53) |
| Route `src/routes/*.ts` | 9 tệp | khoảng 265 | Tiêu đề trang truyền vào `res.render`, flash, nhãn cấu hình (`admin.ts` riêng 122), thông điệp JSON của `api.ts` |
| Dịch vụ `src/services/*.ts` | 15 tệp có chữ | khoảng 165 | Email (`notifications.ts` 68), báo cáo và tiêu đề cột CSV (`reports.ts` 36), nhãn và mẫu ZNS (`znsEvents.ts` 12), thông điệp trả về khách (`transferOut.ts:39, 47`, `dns.ts`, `provisioning.ts`) |
| Thư viện `src/lib/*.ts` | `validate.ts`, `zns.ts`, `mailer.ts`, `settings.ts`, `money.ts`, `qrcode.ts` | khoảng 55 | Lỗi kiểm tra dữ liệu (`validate.ts`, 20), giải thích mã lỗi ZNS cho quản trị (`zns.ts:327-340`), khẩu hiệu mặc định (`settings.ts:86`), đơn vị tiền "d" (`money.ts:10`) |
| Middleware `src/middleware/*.ts` | 5 tệp | 17 | Đăng nhập, quyền, CSRF, lỗi, giới hạn tần suất |
| Cổng thanh toán `src/payments/*.ts` | 6 tệp | khoảng 35 | Chỉ phần hiển thị trên site: tên, mô tả phương thức, nhãn khung chuyển khoản (`sepay.ts:48-65`), thông báo lỗi. Xem mục 4 về chuỗi gửi sang cổng |
| Lỗi từ client P.A hiện cho quản trị `src/pavietnam/client.ts` | 1 tệp | khoảng 15 | Ví dụ `client.ts:63, 114, 350-351, 413`. Không gồm dữ liệu giả lập sandbox |
| Tác vụ nền `src/jobs/*.ts` | 2 tệp | 6 | Lý do lỗi, ghi chú gia hạn tự động hiện trên trang quản trị |
| Dữ liệu khởi tạo `src/db/seed.ts` | 1 tệp | khoảng 20 | Nhãn 19 đuôi tên miền (`seed.ts:53-75`), khẩu hiệu (`seed.ts:98`), tên "Quan tri vien" (`seed.ts:36`) |
| Cấu hình mặc định | `src/config.ts:39`, `.env.example:10, 74` | 3 | Tên thương hiệu mặc định, tên người gửi email |
| JavaScript phía trình duyệt `public/js/app.js` | 1 tệp | 1 | "Da chep!" (`app.js:13`) |
| Test `test/*.test.ts` | 5 tệp | 12 câu so khớp chữ thông báo của hệ thống | Xem rủi ro R3 |

Tổng trong phạm vi: khoảng 1.550 đến 1.600 đoạn chữ trên khoảng 90 tệp.

Việc trong phạm vi:
- Thêm dấu cho mọi chữ hiển thị ở các nhóm trên, giữ nguyên ý câu (văn phong theo câu hỏi C5 ở mục 7).
- Cập nhật các test đang so khớp chữ không dấu cho khớp chữ mới.
- Thống nhất tên thương hiệu mặc định (`config.ts:39` đang là "Ten Mien Viet", `.env.example:10` đang là "Mien Tay Media") theo câu hỏi C1.
- Thống nhất đơn vị tiền theo câu hỏi C2 (hiện `formatVnd` trả "830.000 d", `src/lib/money.ts:9-11`; hàm này dùng chung cho giao diện, email và tham số ZNS).
- Mô tả mẫu ZNS hiển thị cho quản trị (`label`, `sample` trong `src/services/znsEvents.ts:22-59`).

## 4. Ngoài phạm vi (không làm)

- Đường dẫn URL (`/dang-nhap`, `/gio-hang`, `/bang-gia`, ...): giữ nguyên không dấu. Hiện có 216 chuỗi đường dẫn trong `src/routes` và `src/app.ts`.
- Tên trường form (176 thuộc tính `name="..."` trong `src/views`), khoá cấu hình (`site.tagline`, `zns.tpl.*`, ...), mã sự kiện, mã lỗi máy đọc (`NO_CREDENTIALS`, ...), khoá log (`log.info('mail_skipped_no_smtp', ...)`).
- Chú thích trong mã, tên biến, tên hàm (kể cả tên biến tiếng Việt như `nhan`, `khop`, `tieuDe`, `loai`), log nội bộ.
- Tài liệu nội bộ: `README.md`, `docs/*.md`, chú thích trong `.env.example`.
- Chữ gửi sang bên thứ ba có tính chữ ký hoặc đối soát, đợt này giữ không dấu:
  - Nội dung đơn gửi MoMo (`orderInfo`, `src/payments/momo.ts:27`, được đưa vào chuỗi ký tại `momo.ts:35`) và ZaloPay (`description`, `itemname`, `src/payments/zalopay.ts:38, 48`, `item` nằm trong chuỗi ký tại `zalopay.ts:55`). Đổi sang có dấu cần thử với môi trường thật của từng cổng, làm ở đợt riêng nếu cần.
  - Nội dung chuyển khoản ngân hàng (mã đơn dạng DH + 6 ký tự, `src/payments/sepay.ts:26`): ngân hàng không nhận dấu, giữ nguyên.
  - Tên tham số mẫu ZNS (`order_code`, `amount`, `domain`, ...): đã là "hợp đồng" với mẫu bên Zalo (`znsEvents.ts:7-9`).
- Dữ liệu giả lập sandbox trong `src/pavietnam/client.ts:571-621` (giả lập phản hồi của P.A, không phải chữ của mình).
- Màn hình dòng lệnh dành cho người vận hành: `npm run kiem-tra` (`src/preflight.ts`, khoảng 130 dòng chữ), dòng in ra của `seed.ts`, `probe.ts`, `server.ts:14`. Mặc định không làm, trừ khi chủ chọn khác ở câu hỏi C6.
- Hai lỗi phụ phát hiện khi kiểm tra (đề xuất xử lý, tuỳ câu hỏi C4):
  - L1: chế độ sandbox vẫn đòi username/API Key. `src/pavietnam/client.ts:59-66` kiểm tra thông tin đăng nhập và ném `NO_CREDENTIALS` trước khi xét sandbox ở `client.ts:85`. Hậu quả đã đo: chạy toàn bộ test khi không có key cho kết quả 171 test, 165 đạt, 6 hỏng, cả 6 trong `test/transfer-out.test.ts` (lấy mã EPP).
  - L2: script `npm test` dùng cú pháp gán biến môi trường kiểu Linux (`package.json:18`, `DATABASE_FILE=./data/test.sqlite node --test ...`), không chạy được bằng `npm test` trên Windows.
- Triển khai lên VPS (Coolify, traefik, cài Node, cấu hình P.A): thuộc intent khác.

## 5. Ràng buộc

- **Chưa có khách, chưa có dữ liệu thật:** `data/` trống, VPS chưa cài Node. Không cần chuyển đổi dữ liệu cũ. Lưu ý: `seed.ts` không ghi đè giá trị đã có (`seed.ts:7, 82-83, 119-125`), nên nếu có CSDL thử nghiệm nào đã chạy seed trước đó (cần xác minh, ví dụ trên máy khác), khẩu hiệu và nhãn đuôi tên miền trong CSDL đó vẫn không dấu cho tới khi sửa tay trong trang quản trị hoặc tạo lại CSDL.
- **Không đổi hành vi:** chỉ đổi chữ hiển thị. Không đổi URL, tên trường form, khoá cấu hình, cấu trúc dữ liệu.
- **Mã hoá UTF-8 dạng dựng sẵn (NFC):** tệp nguồn lưu UTF-8; không để lọt ký tự dấu tổ hợp (dạng NFD), vì trông giống hệt nhưng làm hỏng so khớp và tìm kiếm. Nền tảng hiện có: trang khai báo `lang="vi"` và `meta charset="utf-8"` (`src/views/partials/head.ejs:2, 4`); CSV xuất ra đã có BOM UTF-8 cho Excel (`src/services/reports.ts:227`); phông chữ là phông hệ thống (`public/css/app.css:30`), hỗ trợ tiếng Việt.
- **Email qua SMTP (nodemailer):** tiêu đề có dấu phải được mã hoá đúng chuẩn ở header; nodemailer làm việc này tự động (cần xác minh bằng một lần gửi thử thật).
- **Mã có so khớp theo chữ:** `src/services/provisioning.ts:25-34` dùng biểu thức chính quy không dấu (ví dụ `/da\s*(duoc\s*)?dang\s*ky/i`, `/khong\s+du\s+so\s+du/i`) để quyết định lỗi đăng ký có thử lại hay không. Đổi chữ thông báo không được làm sai lệch logic này.
- **Ngân sách và thời gian:** đây là việc chặn trước khi triển khai, nên càng gọn càng tốt; không mở rộng sang viết lại nội dung hay thiết kế giao diện. (Hạn chót cụ thể: cần xác minh với chủ.)
- **Đang có thay đổi chưa commit** ở `package.json` (khối `allowScripts`); người thực hiện phải commit hoặc giữ nguyên thay đổi này, không ghi đè.

## 6. Tiêu chí hoàn thành đo được

Mỗi tiêu chí kèm cách kiểm. Lệnh test chạy trong Git Bash từ `D:\api-pavietnam`, đặt `DATABASE_FILE` ra thư mục tạm.

1. **Không còn chữ không dấu trong phạm vi.** Chạy công cụ quét chuỗi (giai đoạn 2 viết lại hoặc dùng lại công cụ đếm đã dùng ở mục 3) kèm từ điển các từ chỉ xuất hiện khi thiếu dấu (ví dụ: `khong`, `duoc`, `dang ky`, `ten mien`, `thanh toan`, `vui long`, `tai khoan`, `mat khau`, `gio hang`, `don hang`, `chua`, `nhap`, `quan tri`) trên các tệp ở mục 3. Kết quả: 0 dòng, ngoài danh sách cho phép được ghi rõ trong tài liệu thiết kế (ví dụ chuỗi gửi MoMo/ZaloPay, biểu thức ở `provisioning.ts:25-34`).
2. **Không có dấu tổ hợp NFD:** `grep -rnP "[\x{0300}-\x{036F}]" src public test` trả về 0 dòng.
3. **Biên dịch sạch:** `npx tsc -p tsconfig.json --noEmit` thoát mã 0.
4. **Test không lùi:** `DATABASE_FILE=<thư mục tạm>/test.sqlite node --test --import tsx test/*.test.ts` cho số test đạt lớn hơn hoặc bằng 165 trên 171 và không có test nào đang đạt bị hỏng. Nếu chủ chọn sửa L1 (C4): 171 trên 171 đạt. 12 câu so khớp chữ ở mục 3 đã được đổi sang chữ có dấu (không xoá, không nới lỏng thành biểu thức luôn đúng).
5. **URL không đổi:** `grep -rhoE "'/[a-z0-9/:._-]*'" src/routes src/app.ts | sort | md5sum` ra đúng `13c9676178cd08b3a27a2dd17d17343e` (216 chuỗi đường dẫn, đo ngày 15/10/2026), trừ khi tài liệu thiết kế ghi rõ lý do thay đổi.
6. **Tên trường form không đổi:** `grep -rhoE 'name="[^"]+"' src/views | sort | md5sum` ra đúng `a78750c5d214bd9ba6f0caa639ece0c0` (176 thuộc tính), trừ khi tài liệu thiết kế ghi rõ lý do thay đổi.
7. **Trang hiển thị đúng:** chạy máy chủ ở chế độ sandbox, `curl -si http://localhost:<cổng>/` có header `Content-Type: text/html; charset=utf-8` và thân chứa "Đăng ký tên miền Việt Nam". Các trang `/`, `/bang-gia`, `/whois`, `/chuyen-ten-mien`, `/gio-hang`, `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, cùng trang quản trị `/admin` sau khi đăng nhập, trả 200 và không chứa từ nào trong từ điển ở tiêu chí 1.
8. **Email có dấu đọc được:** gửi thử một email khôi phục mật khẩu và một email kích hoạt tên miền tới hộp thư Gmail thật; tiêu đề và nội dung hiển thị đúng dấu; header `Subject` trong mã nguồn thư ở dạng mã hoá `=?UTF-8?...?=`.
9. **CSV mở đúng trong Excel:** xuất `/admin/xuat/don-hang` và `/admin/xuat/ten-mien`, mở bằng Excel trên Windows, tiêu đề cột hiển thị đúng dấu.
10. **Thanh toán không bị ảnh hưởng:** test `test/sepay.test.ts` đạt; mã đơn trong mã QR và nội dung chuyển khoản vẫn dạng `DH` + 6 ký tự; chuỗi gửi MoMo/ZaloPay giữ nguyên như trước (so `git diff` hai tệp `momo.ts`, `zalopay.ts` không đổi dòng 27, 35, 38, 48, 55).
11. **Thương hiệu và đơn vị tiền thống nhất:** `grep -rn "Ten Mien Viet\|Mien Tay Media" src .env.example` trả 0 dòng; tên hiển thị và đơn vị tiền khớp quyết định C1, C2.
12. **Người duyệt chính tả ký xác nhận:** người được chủ chỉ định (C5) đi qua danh sách màn hình (44 trang EJS, 18 email) và đánh dấu đạt trên bảng kiểm trong tài liệu kiểm thử của giai đoạn 4.

## 7. Quyết định của chủ (chốt 15/10/2026)

- **C1. Thương hiệu:** "MienTay Media" ở mọi nơi khách thấy (đầu trang, tiêu đề tab, email, người gửi email, cảnh báo quản trị).
- **C2. Đơn vị tiền:** "830.000 đ" (`formatVnd`), dùng chung cho giao diện, email và tham số ZNS.
- **C3. ZNS:** chưa có mẫu nào được Zalo duyệt. Soạn tham số và nội dung có dấu ngay từ đầu, giữ nguyên tên tham số.
- **C4. Hai lỗi phụ:** mặc định theo đề xuất là CÓ sửa trong đợt này (L1 sandbox, L2 `npm test` trên Windows), vì cần để đạt 171/171.
- **C5. Văn phong:** mặc định chỉ thêm dấu, giữ xưng "bạn"; chủ duyệt chính tả trên bản chạy thử.
- **C6. Màn hình dòng lệnh:** mặc định ngoài phạm vi đợt này.
- **Bối cảnh triển khai (cho giai đoạn Deploy, không thuộc Build):** web chạy ở `https://mientaymedia.vn` trên VPS GData 14.225.81.243 (P.A đã whitelist, đã xác nhận 15/10/2026). SePay nhận tiền vào MB (mã `MB`), số tài khoản 45688840, người thụ hưởng "CONG TY TNHH PHAN MEM MIENTAY MEDIA"; webhook `https://mientaymedia.vn/webhooks/sepay`. Code webhook SePay đã có sẵn, chỉ cần cấu hình. `.env.example` nên đổi giá trị mẫu SePay sang tài khoản MB này.

- **ZNS qua Mineflow (chốt 15/10/2026):** chủ muốn dùng Mineflow cho cả hai việc: quản lý và gửi duyệt mẫu ZNS, và web gửi tin ZNS qua Mineflow thay vì gọi API Zalo trực tiếp. Việc đổi nhà cung cấp gửi tin là một dự án riêng (intent riêng), làm sau khi có tài liệu API Mineflow; MCP Mineflow chưa được cấp quyền trong phiên làm việc. Đợt thêm dấu này chỉ đổi chữ hiển thị và giá trị tham số ZNS, không đổi `src/lib/zns.ts` sang Mineflow, và nên giữ phần gửi ZNS sau một hàm duy nhất để dễ thay nhà cung cấp.

- **Đổi địa chỉ web (chốt 15/10/2026):** web chạy dưới đường dẫn con `https://mientaymedia.com/ten-mien` thay cho `mientaymedia.vn`. Hiện code mount mọi route ở gốc `/` (khoảng 152 link tuyệt đối trong view, 83 lệnh redirect), nên cần hỗ trợ tiền tố đường dẫn (BASE_PATH) cho link, redirect, tài nguyên tĩnh, cookie phiên (path), sitemap, link trong email; webhook SePay thành `https://mientaymedia.com/ten-mien/webhooks/sepay`. Lưu ý: `mientaymedia.com` là site Next.js (repo mientay-web, qua Cloudflare) và `/ten-mien` hiện ĐÃ có một trang giới thiệu dịch vụ tên miền; cần chủ chốt cách ghép (xem rủi ro). Phần định tuyến từ site chính sang app thuộc giai đoạn Deploy.
- **Đơn hàng đổ về Pancake POS và CRM:** chủ muốn đơn hàng tên miền đổ về Pancake POS (shop MienTay Media) và nối với CRM `crm-mientaymedia`. Đây là dự án riêng (intent riêng), không thuộc đợt thêm dấu.

## 7b. Câu hỏi gốc (đã chốt ở trên)

- **C1. Tên thương hiệu hiển thị là gì?** Hiện giao diện hiện "Ten Mien Viet" (mặc định ở `src/config.ts:39`), còn `.env.example:10` và người gửi email (`.env.example:74`) là "Mien Tay Media". Chọn một: "Tên Miền Việt", "MienTay Media", "Miền Tây Media" hay tên khác? Tên này hiện ở đầu trang, tiêu đề tab, chân email, tiêu đề cảnh báo gửi quản trị.
- **C2. Đơn vị tiền viết thế nào?** Hiện là "830.000 d" (`src/lib/money.ts:10`). Chọn "830.000 đ", "830.000 ₫" hay "830.000 VNĐ". Giá trị này cũng là tham số `amount` gửi qua ZNS.
- **C3. Mẫu tin ZNS:** đã có mẫu nào đăng ký và được Zalo duyệt chưa (`.env.example` đang để `ZNS_ENABLED=0`, cần xác minh)? Nếu chưa: đề xuất soạn mẫu có dấu ngay từ đầu theo các câu mẫu mới. Nếu đã duyệt mẫu không dấu: chủ chọn giữ mẫu cũ (chỉ đổi phần hiển thị trong trang quản trị) hay soạn lại mẫu có dấu và gửi Zalo duyệt lại (mất thời gian chờ duyệt). Tên tham số giữ nguyên trong cả hai trường hợp.
- **C4. Có sửa luôn hai lỗi phụ trong cùng đợt không?** L1 (sandbox vẫn đòi API Key, làm 6 test hỏng) và L2 (`npm test` không chạy trên Windows). Đề xuất: có, vì cả hai nhỏ và L1 làm tiêu chí 4 không đạt được 171/171.
- **C5. Văn phong và người duyệt:** chỉ thêm dấu, giữ nguyên câu chữ và xưng hô "bạn" như hiện tại; hay cho phép chỉnh câu chữ (ví dụ đổi sang "Quý khách")? Ai là người duyệt chính tả cuối cùng?
- **C6. Có tính màn hình dòng lệnh không?** `npm run kiem-tra` (khoảng 130 dòng chữ, dùng khi triển khai) và dòng in của `seed`. Mặc định không làm trong đợt này.

## 8. Rủi ro

- **R1. Sai dấu, sai nghĩa khi thêm dấu hàng loạt.** Khoảng 1.600 đoạn chữ, nhiều từ không dấu có nhiều cách đọc ("dang" là "đang" hay "đăng", "ma" là "mã" hay "mà", "Da" là "Đã" hay "Da"). Thêm dấu tự động bằng công cụ dễ sai. Giảm thiểu: người thực hiện đọc ngữ cảnh từng câu; có bước duyệt chính tả (tiêu chí 12).
- **R2. Sửa nhầm thứ không phải chữ hiển thị** (URL, tên trường form, khoá cấu hình, tên biến tiếng Việt, tên tham số ZNS) làm hỏng chức năng. Giảm thiểu: tiêu chí 5 và 6 so sánh trước và sau; test chạy lại toàn bộ.
- **R3. Test so khớp chữ.** 12 câu so khớp chữ thông báo của hệ thống trên 5 tệp sẽ hỏng khi đổi chữ: `test/cart-orders.test.ts:27, 96`, `test/domain-contact.test.ts:59, 88, 107`, `test/transfer-out.test.ts:28`, `test/two-factor.test.ts:84, 220`, `test/zns.test.ts:32-35`. Phải cập nhật theo, không nới lỏng. (Các câu so khớp khác như `test/refunds.test.ts:109`, `test/reports.test.ts:124-125` kiểm dữ liệu do chính test đưa vào nên không bị ảnh hưởng.)
- **R4. Logic phân loại lỗi đăng ký** dựa trên biểu thức không dấu (`src/services/provisioning.ts:25-34`). Nếu chữ lỗi nội bộ được đổi sang có dấu mà đi qua hàm này, một lỗi vĩnh viễn có thể bị coi là lỗi tạm và bị thử lại nhiều lần. Ngoài ra, chưa rõ P.A trả thông báo lỗi có dấu hay không dấu (cần xác minh khi có API Key); nếu P.A trả có dấu thì các mẫu này hiện cũng không bắt được, đây là vấn đề có sẵn, nên ghi nhận cho giai đoạn thiết kế.
- **R5. Lỗi mã hoá ký tự** (NFD, tệp không lưu UTF-8, header email sai) làm chữ hiển thị thành ký tự lạ ở một số máy hoặc hộp thư. Giảm thiểu: tiêu chí 2, 7, 8, 9.
- **R6. Giới hạn độ dài tham số ZNS** khi đổi đơn vị tiền hoặc soạn mẫu có dấu (giới hạn của Zalo: cần xác minh). Nếu phải duyệt lại mẫu (C3), có thể chậm lịch.
- **R7. Kéo dài lịch triển khai.** Đây là việc chặn trước khi lên VPS. Nếu mở rộng sang viết lại văn phong (C5) hoặc màn hình dòng lệnh (C6), thời gian tăng đáng kể.
- **R8. Va chạm với thay đổi song song** trên cùng các tệp (đang có `package.json` sửa dở chưa commit). Giảm thiểu: làm trên nhánh riêng, gộp sớm, không để kéo dài.
