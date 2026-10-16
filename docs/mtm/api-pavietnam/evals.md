---
type: evals
du_an: api-pavietnam
buoc: 4 - Test (QA độc lập)
dau_vao: intent.md mục 6, spec.md mục 2, 3.10, 6 và mục 10, plan.md mục "Lệch spec", test.md
nhanh: mtm/api-pavietnam @ 2b38ea4 (18 commit từ 55b3a60)
cap_nhat: 16/10/2026
ket_luan: CHƯA ĐẠT
---

# Đánh giá độc lập: thêm dấu tiếng Việt và tiền tố BASE_PATH

QA không dùng số liệu của Build, tự chạy lại mọi thứ. Không sửa code, không push, không gọi P.A thật (chỉ sandbox và một máy chủ P.A giả ở 127.0.0.1), không đụng VPS. Script kiểm thử để ngoài repo, trong thư mục scratchpad của phiên QA (`qa/e2e.mjs`, `qa/chinh-ta.mjs`, `qa/pa-probe.mts`, `qa/smtp-sink.mjs`, `qa/start.sh`).

## 1. Kết luận

**CHƯA ĐẠT.** Phần thêm dấu, tiền tố `/ten-mien`, cookie, tài nguyên tĩnh, email, CSV và logic phân loại lỗi P.A đều đạt khi chạy thật. Còn một lỗi bảo mật chặn: tham số `next=` sau đăng nhập vẫn là open redirect với dạng `/.//evil.com` (lỗi 1). Ngoài ra ba tiêu chí cần người (8 email Gmail, 9 Excel, 12 chủ duyệt chính tả) chưa có xác nhận.

## 2. Bảng tiêu chí (intent mục 6, spec mục 2)

| # | Tiêu chí | Cách kiểm (QA tự chạy) | Kết quả | Bằng chứng |
|---|---|---|---|---|
| 1 | Không còn chữ không dấu trong phạm vi | `npm run kiem-dau`; thêm: lọc HTML của 167 trang đã render (83 dưới `/ten-mien`, 84 ở gốc) qua `kiem-dau --html` | ĐẠT | "0 chuỗi thiếu dấu trên 0 tệp, 0 lỗi mã hóa, 0 mục thừa, 29 chuỗi được cho phép". Trên trang thật chỉ còn: nhãn "Kinh doanh", "Doanh thu" (vốn không dấu), dữ liệu giả lập sandbox ("P.A Viet Nam (sandbox)", "Nguyen Van A") và nội dung khách tự nhập ("... chuyen khoan" trong giao dịch) |
| 2 | Không có dấu tổ hợp NFD | `LC_ALL=en_US.UTF-8 grep -rnP "[\x{0300}-\x{036F}]" src public test \| wc -l` | ĐẠT | 0 |
| 3 | Biên dịch sạch | `npx tsc -p tsconfig.json --noEmit` | ĐẠT | thoát 0 |
| 4 | Test không lùi | `npm test` (Git Bash) | ĐẠT | tests 195, pass 195, fail 0 |
| 5 | URL không đổi | `grep -rhoE "'/[a-z0-9/:._-]*'" src/routes src/app.ts \| sort \| md5sum` | ĐẠT | `13c9676178cd08b3a27a2dd17d17343e` |
| 6 | Tên trường form, thuộc tính, khóa cấu hình không đổi | các lệnh băm spec 6.1 (sau khi xóa `<%= base %>`) | ĐẠT | name `a78750c5...`, value `73dc6011...`, action `f87296a1...`, href `e7e154dd...`, src `4997d2ed...`, id `adc98f92...`, for `6a1e55df...`, khóa cấu hình `71aa4f47...`: khớp hết giá trị gốc |
| 7 | Trang hiển thị đúng | chạy app thật (sandbox, CSDL tạm trong scratchpad), cổng 3111 ở gốc và 3112 với `BASE_PATH=/ten-mien`; tải 9 trang của intent và 13 trang quản trị sau khi đăng nhập thật có 2FA | ĐẠT | mọi trang 200, `Content-Type: text/html; charset=utf-8`, trang chủ có "Đăng ký tên miền Việt Nam"; xem mục 3 |
| 8 | Email có dấu đọc được | SMTP giả cục bộ nhận thư thật từ luồng chạy (8 mẫu mỗi chế độ), giải mã MIME | ĐẠT phần máy, CHƯA kiểm Gmail | mọi `Subject` dạng `=?UTF-8?Q?...?=`, giải mã ra đúng chữ có dấu; thân có `charset=utf-8`; 7/8 mẫu có `<meta charset="utf-8">` (mẫu `smtp_test` không, xem lỗi 4). Gửi tới Gmail thật: cần người |
| 9 | CSV mở đúng trong Excel | tải `/admin/xuat/don-hang`, `/ten-mien`, `/doanh-thu` ở cả hai chế độ, đọc byte đầu | ĐẠT phần máy, CHƯA mở Excel | 200, `text/csv; charset=utf-8`, có BOM `EF BB BF`, tiêu đề cột có dấu ("Mã đơn","Ngày tạo",...,"Khóa chuyển đổi"). Mở bằng Excel: cần người |
| 10 | Thanh toán không bị ảnh hưởng | `git diff 55b3a60 -U0 -- src/payments/momo.ts src/payments/zalopay.ts src/routes/webhooks.ts`; luồng SePay thật qua webhook | ĐẠT | `webhooks.ts` không diff; momo đổi dòng 16-17, 64, 110; zalopay 26, 69 (ngoài vùng khóa). Đơn `DH` + 6 ký tự, QR và số TK 45688840 hiện trên trang đơn, webhook có token khớp đơn, tên miền được kích hoạt |
| 11 | Thương hiệu, đơn vị tiền thống nhất | `grep -rn "Ten Mien Viet\|Mien Tay Media" src .env.example`; xem trang và email | ĐẠT | 0 dòng; "MienTay Media" ở tiêu đề tab, đầu trang, chân email; tiền "830.000 đ" trên trang, email, CSV |
| 12 | Chủ ký duyệt chính tả | bảng kiểm `test.md` mục 4 | CHƯA ĐẠT (chờ chủ) | bảng chưa ký. QA đã lấy mẫu 13 trang và 8 email, không thấy lỗi dấu sai nghĩa (mục 5) |
| 13 | Dưới `/ten-mien` không còn link gốc thiếu tiền tố | `node scripts/kiem-base.mjs`; thêm: QA bò lại mọi `href`/`src` nội bộ trên các trang đã đi và GET từng link | ĐẠT | kiem-base: 58 + 40 + 41 trang, 0 link thiếu. QA: 79 link dưới `/ten-mien`, 80 link ở gốc, không link nào 4xx/5xx, mọi `Location` có tiền tố |
| - | Chuyển hướng `next=` an toàn | đăng nhập thật với 10 biến thể `next` độc hại | **CHƯA ĐẠT** | 4 biến thể của spec về `/ten-mien/dashboard`, nhưng `/.//evil.com`, `/..//evil.com`, `/%2e//evil.com`, `/a/..//evil.com` ra `Location: //evil.com` (lỗi 1) |
| - | Hồi quy logic P.A | máy chủ P.A giả cục bộ, đi qua `call()` thật với sandbox tắt | ĐẠT | mục 4 |

## 3. Luồng chạy thật (cả gốc và `/ten-mien`)

Khởi động: `migrate`, `seed` (quản trị viên từ `ADMIN_EMAIL`/`ADMIN_PASSWORD`), `node --import tsx src/server.ts`, `PAVIETNAM_SANDBOX=1`, CSDL tạm, SMTP giả. Kết quả từng bước (giống nhau ở hai chế độ, khác duy nhất ở tiền tố):

- Trang công khai `/`, `/bang-gia`, `/whois`, `/whois?domain=vidu.vn`, `/chuyen-ten-mien`, `/gio-hang`, `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/tim-kiem`: 200.
- Tĩnh `/ten-mien/css/app.css`, `/ten-mien/js/app.js`: 200; `/css/app.css` ngoài tiền tố: 404. `<body data-base="/ten-mien">`, `app.js` đọc `data-base` cho `fetch`.
- Ngoài tiền tố: `GET /` 302 tới `/ten-mien/`; `GET /gio-hang` 404; `GET /ten-mien` 301 tới `/ten-mien/`; `GET /ten-mien-khac/` 404.
- `robots.txt`: `Disallow: /ten-mien/admin` ... và `Sitemap: http://127.0.0.1:3112/ten-mien/sitemap.xml`; `sitemap.xml` có `<loc>` theo `APP_URL`. Trang 404 có dấu.
- Cookie: `sid` có `Path=/ten-mien` (gốc: `Path=/`), cookie xóa khi đăng xuất cùng `Path`; mọi `Set-Cookie` trong cả phiên đều đúng `Path`.
- Trang cần đăng nhập: `/ten-mien/control-panel` chuyển tới `/ten-mien/dang-nhap?next=%2Fcontrol-panel` (next không chứa tiền tố); đăng nhập xong quay về `/ten-mien/control-panel`.
- Đăng ký khách: 302 tới `/ten-mien/dashboard`. Đăng xuất: về `/ten-mien/`.
- Tìm tên miền, thêm vào giỏ: 302 tới `/ten-mien/gio-hang`; `quayLai` với Referer trong app về đúng trang, Referer cùng origin ngoài app về giỏ, khác origin về giỏ. Giỏ hiện "830.000 đ".
- Thanh toán, đặt hàng: 302 tới `/ten-mien/don-hang/DH6HHJLY`; chọn SePay: trang đơn có QR, số TK 45688840; `/don-hang/<mã>/trang-thai` trả JSON dưới tiền tố; hóa đơn, danh sách đơn 200.
- Webhook `POST /ten-mien/webhooks/sepay`: không token 401 (tới đúng handler, không bị CSRF chặn); có token 200 `{"success":true}`, worker đăng ký (sandbox), đơn "Hoàn tất".
- Control panel: danh sách và chi tiết tên miền 200; thêm bản ghi DNS 302 về trang tên miền có tiền tố, flash "Đã thêm bản ghi DNS." (sandbox không lưu bản ghi nên danh sách vẫn là 3 bản ghi mẫu, không phải lỗi); mở khóa chuyển đổi, lấy mã EPP chạy, có email cảnh báo.
- Quản trị: đăng nhập lần đầu về `/ten-mien/admin`, bị chuyển tới `/ten-mien/tai-khoan/bao-mat` (bắt buộc 2FA); bật 2FA bằng script (đọc khóa từ trang, tính TOTP), hiện mã dự phòng; đăng xuất, đăng nhập lại có `next=/admin/cau-hinh`: qua bước `/ten-mien/dang-nhap/hai-lop`, nhập mã, về `/ten-mien/admin/cau-hinh`.
- 13 trang quản trị (`/admin`, `bao-cao`, `cau-hinh`, `bang-gia`, `ma-giam-gia`, `don-hang`, `doi-chu-the`, `ten-mien`, `nguoi-dung`, `giao-dich`, `hang-doi`, `zns`, `nhat-ky-api`) và chi tiết đơn: 200. Ba CSV: đạt (tiêu chí 9). Nút "Gửi email thử": 302 về `/ten-mien/admin/cau-hinh`, thư tới SMTP giả.

## 4. Hồi quy logic P.A (spec 3.2)

Chạy `qa/pa-probe.mts`: máy chủ HTTP giả ở 127.0.0.1 trả từng phản hồi, `PAVIETNAM_SANDBOX=0`, key giả, đi qua `call()` thật (parse, `interpret`, ghi log).

| Phản hồi | Mong đợi | Kết quả |
|---|---|---|
| `Lỗi: Lệnh thực thi không được hỗ trợ` (chữ thuần) | lỗi | ĐẠT, `ok=false` |
| `IP không được phép truy cập` (chữ thuần) | lỗi | ĐẠT |
| Cùng câu ở dạng NFD | lỗi | ĐẠT |
| `LỖI: LỆNH THỰC THI KHÔNG ĐƯỢC HỖ TRỢ` (viết hoa) | lỗi | ĐẠT |
| Câu lỗi bọc trong HTML | lỗi | ĐẠT |
| Bản không dấu của hai câu trên | lỗi | ĐẠT |
| JSON `status=error` + message có dấu; JSON chỉ có message có dấu | lỗi | ĐẠT |
| `registerDomain` gặp hai câu lỗi trên | ném `RegistrarError`, `isPermanent=false` (D3: thử lại) | ĐẠT |
| `checkDomain` với "Tên miền đã được đăng ký" / "chưa được đăng ký" / "còn trống" | không còn trống / còn trống / còn trống | ĐẠT |
| `isPermanent`: "Tên miền đã được đăng ký", "Tài khoản không đủ số dư" | true | ĐẠT |
| `isPermanent`: "Không kết nối được API P.A Việt Nam: timeout" | false | ĐẠT |
| Chữ thuần `Thành công` | thành công | ĐẠT |
| JSON `status` = `Thành công` (có dấu) | (ngoài phạm vi) | bị coi là LỖI; xem lỗi 5 |

## 5. Lấy mẫu chính tả

Đọc từng đoạn chữ (trích tự động, khử trùng lặp, đọc bằng mắt) ở 13 trang: trang chủ, bảng giá, chuyển tên miền, kết quả tìm kiếm, đăng ký, giỏ hàng, thanh toán, chi tiết đơn, phiếu thanh toán, control panel chi tiết tên miền (DNS, nameserver, chủ thể, chuyển đi), bảo mật 2FA (bắt đầu và mã dự phòng), quản trị tổng quan, quản trị cấu hình. Và 8 email render ra HTML: xác thực email, đơn hàng chờ thanh toán, đã nhận thanh toán, tên miền đã kích hoạt, mở khóa chuyển đổi, cảnh báo lấy mã EPP, đặt lại mật khẩu, thử SMTP. Kèm bộ mẫu máy dò các cặp dễ nhầm (đang/đăng, mã/mà, miền/miễn, gia/giá, chủ/chữ, trợ/trỏ, ký/kỳ, thuế/thuê), kiểu dấu cũ (khoá, huỷ, tuỳ, hoá, thoả, hoà, thuỷ) và danh sách 71 âm tiết có dấu hiếm gặp.

Kết quả: **không thấy lỗi dấu sai nghĩa**. "đang" và "đăng" dùng đúng ("Đang bật", "Đang mở khóa", "Đăng ký", "đăng nhập"); "mã" đúng ("Mã chỉ hiện một lần", "Mã giảm giá", "mã số thuế"); không còn kiểu dấu cũ (kể cả `grep` toàn bộ `src`, `public`, `test`, `scripts`); dùng "khóa", "hủy", "tùy", "hóa đơn" đúng D2. Chỉ còn điểm đã nằm trong `test.md` mục 3 chờ chủ quyết: "theo qui trình riêng của VNNIC" (`transfer.ejs`).

## 6. Rà mục "Lệch spec" của plan.md

| # | Lệch | Đánh giá |
|---|---|---|
| 1, 2 | Nhánh gốc tên khác `main`; không mở PR | Không ảnh hưởng intent. PR vẫn phải mở ở bước Deploy |
| 3 | Kiểu dấu mới (D2) | Đúng quyết định chủ ở spec mục 10; đã kiểm không còn kiểu cũ |
| 4 | `allowScripts` commit riêng | Đúng D1 |
| 5 | `chay-test.mjs` chạy migrate trước | Hợp lý, không đổi `src/db/index.ts` |
| 6 | `sandbox.test.ts` đổi `config.pa` trong tiến trình | Hợp lý, tránh test khác gọi P.A thật |
| 7 | `migrate.ts` vào danh sách cho phép | Đúng C6 (màn hình dòng lệnh) |
| 8 | Luật quét chặt hơn spec | Chặt hơn, không nới, tốt |
| 9 | Link trong khối mã chèn `<%= base %>` thay vì `url()`; bọc `res.redirect` ở router con | Không sai intent: mã băm khớp, kiem-base 0, QA kiểm `GET /` ngoài tiền tố không bị thêm tiền tố hai lần |
| 10 | `/ten-mien` 301 sang `/ten-mien/` | Đúng đích, chấp nhận |
| 11 | Thêm 3 câu so khớp test ngoài bảng spec | Đổi theo chữ nguồn, giữ độ chặt |
| 12 | Thêm dấu `verifyReturn` của MoMo; `formatVnd` ở `pricing.ts`, `balance.ts` | `momo.ts:110` ngoài vùng khóa (27, 32-35, 40); `checkout.ts` chỉ dùng thông điệp để hiện flash. Không đổi hành vi |
| 13 | Thêm dấu ở `http.ts`, `crypto.ts`, `totp.ts`, `qrcode.ts` | Không có logic nào so khớp các chuỗi này (QA đã `grep` các lệnh `includes/startsWith/match/test` trên chuỗi chữ trong `src`) |
| 14 | `webhooks.ts:93` vào danh sách cho phép; email Gmail, Excel, điện thoại chưa làm | Đúng spec 3.4 (tệp khóa cứng). Ba việc cần người vẫn mở (tiêu chí 8, 9, 6.3.6) |

Không mục lệch nào làm sai ý intent.

## 7. Danh sách lỗi (theo mức độ)

1. **[Trung bình, bảo mật, có sẵn từ 55b3a60, chặn deploy] Open redirect qua `next=` khi đăng nhập.** `safeNext` (`src/routes/auth.ts:43-59`) chỉ chặn `//` và `/\` trên chuỗi thô, rồi trả `u.pathname` sau khi `new URL` chuẩn hóa dấu chấm; `/.//evil.com` thành pathname `//evil.com`. Bản bọc `res.redirect` (`withBase`) cố ý bỏ qua chuỗi bắt đầu bằng `//`, nên dưới `/ten-mien` cũng lọt. Áp cho cả bước hai lớp (`auth.ts:159, 237`, giá trị lưu từ `safeNext`).
   Tái hiện: mở `/ten-mien/dang-nhap?next=%2F.%2F%2Fevil.com`, đăng nhập đúng mật khẩu; phản hồi `302 Location: //evil.com` (trình duyệt đi sang `evil.com`). Cũng lọt: `/..//evil.com`, `/%2e//evil.com`, `/a/..//evil.com`. Ở gốc (BASE rỗng) giống hệt.
   Hướng sửa (để Build làm): sau khi parse, loại `pathname` bắt đầu bằng `//` hoặc `/\`; thêm 4 biến thể này vào `test/base-path.test.ts` và `test/security.test.ts`.

2. **[Thấp, bảo mật, có sẵn] `quayLai` (giỏ hàng) chuyển hướng theo `Referer` có đường dẫn `//...`.** `src/routes/cart.ts:18-33` trả `stripBase(u.pathname)` mà không loại `//`. Tái hiện: `POST /ten-mien/gio-hang/them` (CSRF hợp lệ, tên miền sai) kèm `Referer: http://<host>/ten-mien//evil.com/x` cho `302 Location: //evil.com/x`. Khó khai thác vì trình duyệt gửi Referer theo trang chứa form, nhưng nên sửa cùng lỗi 1 (một hàm kiểm chung).

3. **[Thông tin, môi trường] Git Bash đổi `BASE_PATH=/ten-mien` thành `C:/Program Files/Git/ten-mien`** khi truyền biến môi trường cho `node`, app dừng với "BASE_PATH không hợp lệ". Không ảnh hưởng VPS Linux. Ai chạy thử dưới tiền tố trên Windows cần `MSYS2_ENV_CONV_EXCL="BASE_PATH;APP_URL"` hoặc chạy bằng PowerShell; nên ghi vào `test.md` mục 4.

4. **[Thấp] Email "Thử cấu hình SMTP" không đi qua khung `layout`** nên thiếu `<meta charset="utf-8">` (spec 3.7 chỉ nêu khung chung). Header MIME vẫn có `charset=utf-8`, Gmail hiển thị đúng; chỉ ảnh hưởng trình đọc thư bỏ qua header.

5. **[Quan sát, có sẵn, cần xác minh với P.A thật] `interpret` không chuẩn hóa trường `status`.** Nếu P.A trả `status` là "Thành công" có dấu (hoặc "thanh cong" có khoảng trắng), lời gọi bị coi là thất bại vì `SUCCESS_TOKENS` chỉ có `thanhcong`. Hành vi y như 55b3a60, chiều an toàn với lời gọi đọc nhưng với `registerDomain` có thể dẫn tới thử lại rồi hoàn tiền dù P.A đã đăng ký. Đề xuất: chạy `npm run pa:probe` trên VPS đã whitelist để xem định dạng thật trước khi bật đăng ký tự động.

6. **[Quan sát, ngoài phạm vi] Mã trạng thái tiếng Anh vẫn hiện cho khách:** "active" ở đầu trang control panel, "sepay" và "paid" trong "Lịch sử giao dịch" của trang đơn. Không phải chữ tiếng Việt không dấu nên không vi phạm tiêu chí 1; chủ quyết có cần Việt hóa ở đợt sau.

## 8. Test đỏ

Không có. `npm test` 195/195, `kiem-dau` 0, `tsc` sạch, `kiem-base` 0. Không có test nào đỏ để đối chiếu với nhánh gốc.

## 9. Việc cần chủ làm

1. Cho Build sửa lỗi 1 (và nên gộp lỗi 2) kèm test, rồi gọi QA chạy lại mục 2 dòng "Chuyển hướng next=".
2. Gửi thử email khôi phục mật khẩu và kích hoạt tên miền tới Gmail thật, xem "Hiển thị bản gốc" (tiêu chí 8).
3. Mở ba tệp CSV bằng Excel trên Windows (tiêu chí 9).
4. Xem trang chủ, giỏ hàng, chi tiết tên miền trên điện thoại (spec 6.3.6).
5. Duyệt và ký bảng kiểm chính tả `test.md` mục 4, quyết điểm "qui trình" / "quy trình" (tiêu chí 12).
6. Trước khi bật đăng ký thật: chạy `pa:probe` trên VPS để xác minh định dạng phản hồi P.A (lỗi 5).
7. Ở Deploy: D6 (robots và cookie `sid` của mientay-web), D7 (HSTS `includeSubDomains`), khai lại webhook SePay `https://mientaymedia.com/ten-mien/webhooks/sepay`; chú thích webhook trong `.env.example` vẫn ghi dạng `https://<ten-mien-cua-ban>/webhooks/sepay`, nhớ thêm `/ten-mien`.

## 10. Việc sau (ngoài phạm vi đợt sửa theo evals)

Build đã sửa lỗi 1, 2, 4, 5 và ghi chú lỗi 3 (plan.md mục "Sửa sau Test", S1 đến S5). Mục dưới đây chỉ ghi lại, chưa sửa:

1. Lỗi 6: mã trạng thái tiếng Anh vẫn hiện cho khách ("active" ở đầu trang control panel; "sepay", "paid" trong "Lịch sử giao dịch" của trang đơn). Cần chủ quyết có Việt hóa ở đợt sau không; nếu có, chỉ đổi nhãn hiển thị qua bảng ánh xạ, giữ nguyên giá trị lưu trong CSDL và giá trị so khớp trong mã.
