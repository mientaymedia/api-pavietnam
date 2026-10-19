---
type: intent
du_an: dang-nhap-mxh (đăng nhập, đăng ký bằng Zalo, Google, GitHub)
buoc: 1 - Plan
nhanh: mtm/dang-nhap-mxh (worktree D:\api-pavietnam-oauth, tách từ mtm/trang-chu 14dba8f)
cap_nhat: 19/10/2026
---

# Intent: khách đăng nhập web tên miền bằng Zalo, Google, GitHub

Yêu cầu của chủ (nguyên văn): "bổ sung tính năng login qua zalo, google, github".

## 1. Cách hiểu

- Trang đăng nhập và đăng ký có thêm nút của ba nhà cung cấp; bấm vào là sang trang xin quyền của bên đó, quay về là đã đăng nhập (hoặc đã có tài khoản mới).
- Tài khoản cũ dùng mật khẩu vẫn chạy y như trước. Người đã có tài khoản liên kết thêm hoặc hủy liên kết từng nhà cung cấp trong trang Tài khoản.
- Chỉ nhà cung cấp chủ đã nhập khóa mới hiện nút. Chưa nhập khóa thì web giống hệt bản hiện tại.

## 2. Vì sao

- Khách Việt Nam dùng Zalo hằng ngày, khách kỹ thuật dùng Google, GitHub: bớt bước tạo mật khẩu là bớt người bỏ giữa chừng ở bước đăng ký trước khi mua tên miền.
- Tên miền là tài sản: đăng nhập nhanh không được trở thành đường chiếm tài khoản. Vì vậy không tự gộp vào tài khoản có mật khẩu, 2FA vẫn bắt buộc, email vẫn phải xác minh trước khi đặt hàng.

## 3. Kết quả muốn có

1. Ba luồng OAuth 2.0 Authorization Code có `state` dùng một lần (10 phút) và PKCE S256, chạy đúng dưới `BASE_PATH=/ten-mien`.
2. Bảng `user_identities`; quy tắc ghép tài khoản an toàn (spec mục 3).
3. Nút không cần JavaScript, CSP không phải mở thêm nguồn nào.
4. Khóa nhập ở `/admin/cau-hinh` hoặc `.env`, bí mật lưu mã hóa, không ghi log mã hay token.
5. Test với máy chủ OAuth giả lập cục bộ cho cả ba; `tsc`, `npm test`, `kiem-dau`, `kiem-base` sạch; ảnh trang đăng nhập 1366 và 360.

## 4. Ngoài phạm vi

- Không gọi nhà cung cấp thật, không tạo ứng dụng ở trang developer (việc của chủ, liệt kê ở plan).
- Không lưu, không làm mới access token sau khi đăng nhập xong (chỉ cần danh tính một lần).
- Không hiện ảnh đại diện (tránh mở `img-src` cho máy chủ ảnh của bên ngoài).
- Không push, không đụng VPS, không đụng các worktree khác.
