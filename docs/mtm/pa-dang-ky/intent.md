---
type: intent
du_an: pa-dang-ky (tích hợp đúng API đại lý P.A Việt Nam)
buoc: 1 - Plan
trang_thai: da chot (chu dong y, lam luon)
nhanh: mtm/pa-dang-ky (worktree D:\api-pavietnam-pa, tách từ mtm/trang-chu 130dbcd)
cap_nhat: 19/10/2026
---

# Intent: đăng ký, gia hạn, đổi DNS tên miền qua đúng API đại lý P.A

## 1. Vì sao làm

- Web bán tên miền đang chạy thật ở https://mientaymedia.com/ten-mien. Lớp gọi P.A (`src/pavietnam/actions.ts`) chỉ có `check_whois` và `get_whois` là đã xác minh với P.A thật; các lệnh còn lại là tên đoán (`regdomain`, `renewdomain`, `balance`...). Khách thanh toán xong thì lệnh đăng ký sẽ bị P.A trả 600 "Lệnh thực thi không được hỗ trợ", rồi hệ thống hoàn tiền: khách không có tên miền.
- Tài liệu chính thức của P.A (API_PAVIETNAM.pdf và các tệp demo) nay đã có: tên lệnh, tên tham số, định dạng JSON `Command/ReturnCode/ReturnText`, danh sách mã lỗi.
- Hồ sơ chủ thể hiện thiếu nhiều trường P.A bắt buộc: phường xã, tỉnh theo đúng tên của P.A, ngày sinh, giới tính, người quản lý (.vn), số điện thoại dạng +84-.
- Tài khoản đại lý trả trước: hết quỹ thì đăng ký thất bại 400, không được hoàn tiền nhầm cho khách mà phải chờ chủ nạp quỹ.

## 2. Kết quả muốn có

1. Đăng ký .vn cá nhân, .com.vn công ty, .com (và các đuôi khác) gửi đúng lệnh `register_domain_vietnam` / `register_domain_quocte` với đủ tham số; 200 là thành công; 900 chỉ là thành công khi đang dùng endpoint thử.
2. Gia hạn bằng `renew_domain` (tên lệnh cấu hình được), đổi DNS bằng `change_dns_domain_vietnam` (kèm IP, tự phân giải nếu khách không nhập) và `change_dns_domain_quocte`, ngày hết hạn đọc bằng `get_date_domain`, số dư bằng `check_account_still`.
3. Form hồ sơ chủ thể thu đủ trường P.A đòi, chọn tỉnh và phường xã đúng tên trong danh sách P.A, không bắt buộc JavaScript, kiểm hợp lệ phía máy chủ trước khi gọi P.A.
4. Thiếu quỹ: đơn chờ nạp quỹ (khách thấy "đang xử lý"), quản trị được cảnh báo kèm số tiền cần nạp, job 5 phút tự đăng ký lại khi đủ quỹ. 606 và 302: giữ đơn cho người xử lý, không hoàn tự động.
5. Quản trị thấy số dư đại lý thật, cờ chế độ thử hoặc thật, danh sách đơn chờ nạp quỹ; nút Kiểm tra API dùng `check_account_still`.
6. Chủ chạy được một script thử với `interface_test.php` trên VPS (máy này không trong whitelist).

## 3. Ngoài phạm vi

- Không gọi P.A thật, không SSH, không đụng VPS từ máy này.
- Chuyển tên miền về, lấy mã EPP, khóa chuyển đổi, bản ghi DNS chi tiết: tài liệu P.A không có lệnh tương ứng; giữ nguyên như cũ (chỉ chạy ở chế độ giả lập hoặc khi chủ tự đặt tên lệnh qua .env), báo rõ "chưa hỗ trợ qua API" ở chế độ thật.
- Khách nước ngoài (quốc gia khác Việt Nam): chưa hỗ trợ trong đợt này.
