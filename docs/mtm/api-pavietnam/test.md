---
type: test
du_an: api-pavietnam
buoc: 4 - Test
dau_vao: spec.md mục 6, plan.md
nhanh: mtm/api-pavietnam
cap_nhat: 16/10/2026
---

# Kiểm thử: thêm dấu tiếng Việt và tiền tố BASE_PATH

## 1. Đã kiểm trên máy (B12, tự động)

| # | Tiêu chí (intent mục 6, spec mục 2) | Lệnh | Kết quả |
|---|---|---|---|
| 1 | Không còn chữ không dấu trong phạm vi | `npm run kiem-dau` | 0 chuỗi thiếu dấu, 0 lỗi mã hóa, 0 mục thừa; 29 chuỗi cho phép, mỗi mục có lý do trong `scripts/kiem-dau.cho-phep.json` |
| 2 | Không có dấu tổ hợp NFD | `LC_ALL=en_US.UTF-8 grep -rnP "[\x{0300}-\x{036F}]" src public test` | 0 dòng |
| 3 | Biên dịch sạch | `npx tsc -p tsconfig.json --noEmit` | thoát 0 |
| 4 | Test không lùi | `npm test` (Git Bash và PowerShell) | 195/195 đạt (171 cũ + 24 mới) |
| 5 | URL không đổi | mã băm route | `13c9676178cd08b3a27a2dd17d17343e` (khớp) |
| 6 | Tên trường, thuộc tính, khóa cấu hình không đổi | mã băm `name`, `value`, `action`, `href`, `src`, `id`, `for` (sau khi xóa `<%= base %>`), `key:`/`settingKey:` | tất cả khớp giá trị gốc ở spec 6.1 |
| 7 | Trang hiển thị đúng | chạy app sandbox, CSDL tạm, đã seed; tải `/`, `/bang-gia`, `/whois`, `/chuyen-ten-mien`, `/gio-hang`, `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/admin` (đăng nhập bằng cookie), một lần ở gốc và một lần dưới `/ten-mien`; lọc HTML qua `kiem-dau --html` | cả 18 lượt: 200, `text/html; charset=utf-8`; 0 chữ không dấu, trừ nhãn đuôi "Kinh doanh" (đúng chính tả, vốn không dấu) trên `/` và `/bang-gia` |
| 10 | Thanh toán không bị ảnh hưởng | `git diff 55b3a60 -- src/payments src/routes/webhooks.ts` | `webhooks.ts` không diff; `momo.ts` chỉ đổi dòng 16-17, 64, 110; `zalopay.ts` dòng 26, 69; `sepay.ts` dòng 48-49, 61-65 (nhãn hiển thị). `sepay.test.ts` đạt |
| 11 | Thương hiệu, tiền thống nhất | `grep -rn "Ten Mien Viet\|Mien Tay Media" src .env.example` | 0 dòng; `formatVnd(830000) === "830.000 đ"` (`test/money.test.ts`) |
| 13 | Không còn link gốc thiếu tiền tố dưới `/ten-mien` | `node scripts/kiem-base.mjs` | bò 58 + 40 + 41 trang (vãng lai, khách, quản trị), 0 link thiếu |

## 2. Cần người làm (chưa làm được trên máy)

| # | Việc | Ghi chú |
|---|---|---|
| 8 | Gửi thật email khôi phục mật khẩu và email kích hoạt tên miền tới Gmail, xem "Hiển thị bản gốc" có `Subject: =?UTF-8?...?=` | Cần SMTP thật. Mã hóa header đã kiểm bằng `test/email-encoding.test.ts` (streamTransport) |
| 9 | Mở `/admin/xuat/don-hang`, `/admin/xuat/ten-mien`, `/admin/xuat/doanh-thu` bằng Excel trên Windows | BOM và `charset=utf-8` giữ nguyên như trước |
| 6.3.6 | Xem trang chủ, giỏ hàng, chi tiết tên miền trên Android và iPhone (hoặc chế độ thiết bị của Chrome) | Lưu ý nút hẹp "chép tất cả" ở trang bảo mật |
| 6.3.3 | Thử tay dưới `/ten-mien`: đăng nhập từ trang cần đăng nhập rồi quay về đúng trang; thêm vào giỏ rồi quay lại; trang chờ thanh toán SePay tự cập nhật | Phần tự động đã có trong `test/base-path.test.ts` |

### Chạy thử dưới tiền tố trên Windows Git Bash (evals lỗi 3)

Git Bash (MSYS) tự đổi giá trị biến môi trường trông như đường dẫn POSIX khi truyền cho chương trình Windows: `BASE_PATH=/ten-mien` tới `node` thành `C:/Program Files/Git/ten-mien`, app dừng với "BASE_PATH không hợp lệ". Đặt `MSYS_NO_PATHCONV=1` ở đầu lệnh:

```bash
MSYS_NO_PATHCONV=1 BASE_PATH=/ten-mien APP_URL=http://127.0.0.1:3000/ten-mien PAVIETNAM_SANDBOX=1 npm run dev
MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs
```

Kiểm nhanh: `MSYS_NO_PATHCONV=1 BASE_PATH=/ten-mien node -e "console.log(process.env.BASE_PATH)"` phải in `/ten-mien` (không có biến này thì in `C:/Program Files/Git/ten-mien`). Cách khác: `MSYS2_ENV_CONV_EXCL="BASE_PATH;APP_URL"`, hoặc chạy trong PowerShell (`$env:BASE_PATH='/ten-mien'`). VPS Linux không bị.

### Sau đợt sửa theo evals (S1 đến S4 trong plan.md)

`npx tsc -p tsconfig.json --noEmit` thoát 0; `npm test` 207/207 đạt (195 cũ + 12 mới); `npm run kiem-dau` 0; `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu. QA cần chạy lại dòng "Chuyển hướng next=" của `evals.md` mục 2.

## 3. Điểm chính tả cần chủ quyết

| Chỗ | Đang để | Lý do |
|---|---|---|
| `transfer.ejs` | "theo qui trình riêng của VNNIC" | Chỉ thêm dấu (C5), giữ "qui"; nếu muốn chuẩn hóa thì đổi "quy trình" |
| `admin/settings.ejs` | "sai tên thì Zalo trả lỗi -213" | Gốc "tra loi" có thể đọc "trả lời" hoặc "trả lỗi"; chọn "trả lỗi" theo ngữ cảnh mã lỗi |
| `admin/coupons.ejs` | ngày bắt đầu trống hiện "Ngay" | Hiểu là "ngay" (bắt đầu ngay), không phải "Ngày" |
| `admin/settings.ejs` | "Xem thử mã QR (10.000 đ - nội dung DHTEST01)" | Gốc "10.000d"; thêm khoảng trắng cho khớp C2 |
| nhãn đuôi, báo cáo | "Kinh doanh", "Doanh thu" | Vốn không dấu, để nguyên |
| nhãn ô nhập tiền | "(VND)" | Giữ mã ISO theo D4 |

## 4. Bảng kiểm duyệt chính tả (tiêu chí 12)

Chạy bản thử: `PAVIETNAM_SANDBOX=1 DATABASE_FILE=<tạm>/app.sqlite npm run migrate && npm run seed && npm run dev`, mở `http://localhost:3000`. Đánh dấu cột "Đạt" hoặc ghi chỗ cần sửa.

### 4.1 Trang EJS (44 tệp)

| # | Tệp | Mở ở đâu | Đạt / sửa |
|---|---|---|---|
| 1 | home.ejs | `/` | |
| 2 | pricing.ejs | `/bang-gia` | |
| 3 | search.ejs | `/tim-kiem?q=vidu` | |
| 4 | whois.ejs | `/whois?domain=vidu.vn` | |
| 5 | transfer.ejs | `/chuyen-ten-mien` | |
| 6 | cart.ejs | `/gio-hang` (có và không có hàng) | |
| 7 | checkout/index.ejs | `/thanh-toan` (cần đăng nhập, có hàng trong giỏ) | |
| 8 | orders/list.ejs | `/don-hang` | |
| 9 | orders/detail.ejs | `/don-hang/<mã>` (chờ thanh toán và đã xong) | |
| 10 | orders/invoice.ejs | `/don-hang/<mã>/hoa-don` | |
| 11 | dashboard.ejs | `/dashboard` | |
| 12 | domains/list.ejs | `/control-panel` | |
| 13 | domains/detail.ejs | `/control-panel/<tên miền>` | |
| 14 | account/profile.ejs | `/tai-khoan` | |
| 15 | account/security.ejs | `/tai-khoan/bao-mat` (trước, trong, sau khi bật 2FA) | |
| 16 | account/contacts.ejs | `/tai-khoan/ho-so` | |
| 17 | auth/login.ejs | `/dang-nhap` | |
| 18 | auth/register.ejs | `/dang-ky` | |
| 19 | auth/forgot.ejs | `/quen-mat-khau` (trước và sau khi gửi) | |
| 20 | auth/reset.ejs | liên kết trong email khôi phục | |
| 21 | auth/two-factor.ejs | đăng nhập tài khoản có 2FA | |
| 22 | auth/verify-result.ejs | liên kết xác thực email (đúng, hết hạn, sai, đã xác thực) | |
| 23 | error.ejs | `/khong-co-trang-nay` | |
| 24 | admin/dashboard.ejs | `/admin` | |
| 25 | admin/reports.ejs | `/admin/bao-cao` | |
| 26 | admin/settings.ejs | `/admin/cau-hinh` | |
| 27 | admin/pricing.ejs | `/admin/bang-gia` | |
| 28 | admin/coupons.ejs | `/admin/ma-giam-gia` | |
| 29 | admin/orders.ejs | `/admin/don-hang` | |
| 30 | admin/order-detail.ejs | `/admin/don-hang/<id>` | |
| 31 | admin/ownership.ejs | `/admin/doi-chu-the` | |
| 32 | admin/domains.ejs | `/admin/ten-mien` | |
| 33 | admin/users.ejs | `/admin/nguoi-dung` | |
| 34 | admin/bank-transactions.ejs | `/admin/giao-dich` | |
| 35 | admin/jobs.ejs | `/admin/hang-doi` | |
| 36 | admin/zns-logs.ejs | `/admin/zns` | |
| 37 | admin/api-logs.ejs | `/admin/nhat-ky-api` | |
| 38 | partials/header.ejs | đầu mọi trang (máy tính và điện thoại, trước và sau đăng nhập) | |
| 39 | partials/footer.ejs | chân mọi trang | |
| 40 | partials/admin-nav.ejs | thanh tab quản trị | |
| 41 | partials/order-status.ejs | nhãn trạng thái đơn | |
| 42 | partials/contact-form.ejs | biểu mẫu chủ thể (thanh toán, hồ sơ) | |
| 43 | partials/head.ejs | tiêu đề tab trình duyệt | |
| 44 | partials/flash.ejs | (không có chữ cố định) | |

### 4.2 Email (18 mẫu)

Khi chưa cấu hình SMTP, tiêu đề được ghi vào bảng `email_logs`; nội dung cần SMTP thật để xem.

| # | Mẫu (`template`) | Khi nào gửi | Đạt / sửa |
|---|---|---|---|
| 1 | welcome | sau khi xác thực email | |
| 2 | email_verification | đăng ký tài khoản, bấm "Gửi lại email xác thực" | |
| 3 | password_reset | `/quen-mat-khau` | |
| 4 | order_created | đặt hàng | |
| 5 | payment_received | thanh toán xong | |
| 6 | domain_activated | đăng ký thành công | |
| 7 | transfer_submitted | đơn chuyển tên miền về | |
| 8 | provision_failed | đăng ký thất bại | |
| 9 | admin_alert | cảnh báo gửi quản trị (đăng ký thất bại) | |
| 10 | refunded | hoàn tiền vào ví | |
| 11 | renewal_reminder | nhắc gia hạn | |
| 12 | auto_renew_charged | tự gia hạn trừ ví | |
| 13 | auto_renew_needs_payment | tự gia hạn thiếu số dư | |
| 14 | auth_code_issued | lấy mã EPP | |
| 15 | transfer_lock_changed | khóa / mở khóa chuyển đổi | |
| 16 | contact_updated | cập nhật chủ thể lên nhà đăng ký | |
| 17 | ownership_request_status | quản trị đổi trạng thái hồ sơ đổi chủ thể | |
| 18 | smtp_test | `/admin/cau-hinh`, "Gửi email thử" | |

Người duyệt: ____________________  Ngày: ____________
