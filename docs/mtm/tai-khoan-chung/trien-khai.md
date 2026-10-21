---
type: runbook
du_an: tai-khoan-chung (nấc 1)
buoc: 5 - Deploy (chủ làm, qua PR)
cap_nhat: 21/10/2026
---

# Triển khai cổng Tài khoản MienTay

Không ai tự triển khai từ nhánh này. Chủ duyệt PR rồi làm theo thứ tự dưới.

## 1. OAuth: không phải khai lại gì

Redirect URI đã khai ở ba bên giữ nguyên, từng ký tự:

- `https://mientaymedia.com/ten-mien/auth/zalo/callback`
- `https://mientaymedia.com/ten-mien/auth/google/callback`
- `https://mientaymedia.com/ten-mien/auth/github/callback`

Vì sao vẫn chạy khi khách bắt đầu ở `/tai-khoan`: nút ở cổng trỏ `/ten-mien/auth/<bên>?cong=1&next=...`. Luồng bắt đầu ở `/ten-mien` (state, PKCE nằm trong phiên của `/ten-mien`), `redirect_uri` vẫn sinh từ `APP_URL` (`https://mientaymedia.com/ten-mien`), callback cũ nhận mã, rồi vì có `cong=1` nên trả khách về cổng (trang chọn sản phẩm, trang trước đó, trang 2FA hoặc trang Liên kết của cổng). Tên miền khai ở Zalo vẫn là `mientaymedia.com`. GitHub OAuth App chỉ có một callback: không đổi nên không gián đoạn.

## 2. Thứ tự

1. Gộp PR repo tên miền. Trên VPS, trong thư mục `deploy/vps`: kiểm `.env` không có dòng `CONG_TAI_KHOAN_PATH=` rỗng (rỗng là tắt), rồi `docker compose up -d --build`. Compose đặt `CONG_TAI_KHOAN_PATH=/tai-khoan` và thêm router Traefik `tenmien-taikhoan` (`Host(mientaymedia.com) && PathPrefix(/tai-khoan)`, priority 1000, cùng middleware `tenmien-chi-tunnel`, `tenmien-gzip`, cùng service `tenmien`). Cloudflare tunnel không phải thêm hostname: vẫn là `mientaymedia.com`.
2. Kiểm trên bản thật:
   - `curl -sI https://mientaymedia.com/tai-khoan/dang-nhap` trả 200, có `Set-Cookie: sid=...; Path=/tai-khoan; ... HttpOnly; Secure; SameSite=Lax`, không có `Domain`.
   - `curl -s https://mientaymedia.com/tai-khoan/dang-nhap | grep -c 'ten-mien/auth/\(zalo\|google\|github\)?cong=1'` ra 3 (nếu cả ba bên đã nhập khóa).
   - `curl -sI https://mientaymedia.com/ten-mien/dang-nhap` trả 302 `Location: /tai-khoan/dang-nhap`.
   - Đăng nhập thử bằng email, Zalo, Google, GitHub qua cổng, mỗi bên một lần cả Đồng ý lẫn Từ chối; sau đó mở `/ten-mien/control-panel` không phải đăng nhập lại; Đăng xuất ở cổng rồi tải lại `/ten-mien/control-panel` phải về trang đăng nhập. Ghi kết quả vào `plan.md`.
3. Sau khi bước 2 đạt mới gộp PR site chính (`superstar109/mientay-web`, nhánh `feat/tai-khoan-mientay`) để nút "Đăng nhập" trỏ cổng. Làm ngược thứ tự thì nút Đăng nhập dẫn vào trang 404 của Next.js.

## 3. Đường lui

- Cổng lỗi: thêm dòng `CONG_TAI_KHOAN_PATH=` (rỗng) vào `.env`, `docker compose up -d`. Trang đăng nhập cũ ở `/ten-mien/dang-nhap` hiện lại, mọi tài khoản, phiên vẫn nguyên (cùng CSDL). Router Traefik `/tai-khoan` còn đó nhưng app trả 404; nếu đã gộp site chính thì revert commit nút Đăng nhập.
- Không có thay đổi CSDL nào: không có bước di chuyển dữ liệu, số dòng `users`, `user_identities` không đổi.

## 4. Ghi chú

- `PathPrefix(/tai-khoan)` của Traefik khớp cả `/tai-khoanabc`; đường dẫn đó vào app và app trả 404. Site chính không có route nào như vậy.
- Phiên đăng nhập có từ trước khi triển khai lan sang cổng ở lần đầu khách mở một trang `/ten-mien`. Khách vào thẳng cổng trước thì thấy form đăng nhập, đăng nhập lại là xong (spec mục 2).
- Email: xem mục Resend trong `docs/EMAIL-ZNS.md`.
