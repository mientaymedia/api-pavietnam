---
type: spec
du_an: dang-nhap-mxh
buoc: 2 - Design
dau_vao: docs/mtm/dang-nhap-mxh/intent.md
cap_nhat: 19/10/2026
---

# Spec: đăng nhập bằng Zalo, Google, GitHub

## 1. Nguồn đã đối chiếu (19/10/2026)

| Bên | Tài liệu | Điều đã kiểm |
|---|---|---|
| GitHub | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps | `code_challenge` + `code_challenge_method=S256` (không nhận `plain`), `code_verifier` khi đổi token; `state` khuyến nghị; gửi `Accept: application/json` để nhận JSON; từ chối quyền thì quay về `error=access_denied`. |
| GitHub | https://docs.github.com/en/rest/users/emails | `GET /user/emails` trả `email, primary, verified`; cần scope `user:email`. |
| Google | https://developers.google.com/identity/openid-connect/openid-connect | Điểm cuối từ Discovery: `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, userinfo `https://openidconnect.googleapis.com/v1/userinfo`; `code_challenge_methods_supported` có S256. id_token nhận trực tiếp từ điểm cuối token qua HTTPS kèm client secret thì tin được mà không cần kiểm chữ ký, nhưng vẫn kiểm `iss` (`https://accounts.google.com` hoặc `accounts.google.com`), `aud` = client id, `exp`, `nonce`. Email chỉ dùng khi `email_verified` đúng. |
| Google | https://developers.google.com/identity/branding-guidelines?hl=vi | Chữ trên nút: "Đăng nhập bằng Google", "Đăng ký bằng Google" hoặc "Tiếp tục bằng Google"; nền trắng `#FFFFFF`, viền `#747775` 1px, chữ `#1F1F1F` Roboto Medium 14/20; logo "G" bốn màu chuẩn, không đổi màu, không đổi tỷ lệ. |
| Zalo | https://developers.zalo.me/docs/social-api/tham-khao/user-access-token-v4 | Trang dựng bằng JavaScript: `curl` và Chrome headless đều chỉ nhận khung trang, không lấy được nội dung. Dùng tham số chủ giao (dưới đây), khớp tài liệu v4 đã biết. Chủ kiểm lại khi tạo ứng dụng (plan, Lệch spec L1). |

Zalo v4 (theo giao việc): xin quyền `GET https://oauth.zaloapp.com/v4/permission?app_id&redirect_uri&code_challenge&state` (PKCE bắt buộc); đổi mã `POST https://oauth.zaloapp.com/v4/access_token`, header `secret_key`, thân form `code, app_id, grant_type=authorization_code, code_verifier`; hồ sơ `GET https://graph.zalo.me/v2.0/me?fields=id,name,picture`, header `access_token`. Zalo không trả email.

## 2. Luồng

- `GET /auth/:nhaCungCap` (`zalo|google|github`): sinh `state` (32 byte), `code_verifier` (43 ký tự base64url), `nonce` (Google), lưu vào phiên `oauth` (một ô, mở luồng mới thì ghi đè), kèm `next` đã qua `duongDanNoiBo`, rồi 302 sang nhà cung cấp. Nút là thẻ `<a>`, không phải form: CSP `form-action 'self'` chặn cả chuyển hướng sau khi gửi form sang miền khác.
- Liên kết thêm (đã đăng nhập): `GET /auth/:nhaCungCap?lien_ket=1&_csrf=<token phiên>`; thiếu hoặc sai token thì từ chối (chặn trang lạ ép liên kết).
- `GET /auth/:nhaCungCap/callback`: lấy ô `oauth` ra và XÓA ngay (dùng một lần, kể cả khi lỗi); sai nhà cung cấp, `state` khác (so hằng thời gian) hoặc quá 10 phút thì báo hết hạn. Có `error` hoặc thiếu `code` thì báo đã hủy. Đổi mã (không thử lại: mã chỉ dùng một lần), lấy hồ sơ; lỗi mạng hay lỗi phía nhà cung cấp chỉ ghi log tên bên, mã HTTP, không ghi mã, token, thân phản hồi.
- Giới hạn tần suất: bắt đầu 30 lần, callback 30 lần mỗi 15 phút mỗi IP.
- Đăng nhập xong dùng `loginSession` sẵn có (cấp phiên mới, chống cố định phiên) và gộp giỏ hàng như đăng nhập mật khẩu.
- Tài khoản có 2FA: ghi `pending2fa` như đăng nhập mật khẩu rồi chuyển `/dang-nhap/hai-lop`; chưa nhập mã thì chưa có phiên.
- Máy chủ giả lập cho test: `OAUTH_MOCK_BASE` (chỉ ở `.env`, bỏ qua khi `NODE_ENV=production`) đổi mọi địa chỉ thành `<base>/<host gốc><đường dẫn>`.

## 3. Ghép tài khoản

Thứ tự khi callback thành công (hồ sơ `{id, ten, email, emailDaXacMinh}`):

1. Chế độ liên kết: danh tính đã gắn tài khoản khác thì từ chối; gắn chính mình thì báo đã liên kết; còn lại thêm dòng `user_identities`.
2. Danh tính đã có: đăng nhập tài khoản đó (tạm khóa thì từ chối; 2FA thì đòi mã).
3. Email đã xác minh bởi nhà cung cấp (Google `email_verified`, GitHub email `primary` + `verified`) trùng tài khoản có sẵn:
   - Tài khoản KHÔNG mật khẩu, KHÔNG 2FA, email đã xác minh ở phía mình: gắn danh tính và đăng nhập.
   - Ngược lại (có mật khẩu, có 2FA, hoặc email bên mình chưa xác minh): KHÔNG gộp. Ghi `choLienKet` (nhà cung cấp, id, email, 10 phút) vào phiên khách, chuyển `/dang-nhap` với lời nhắn đăng nhập bằng mật khẩu (hoặc dùng Quên mật khẩu). Đăng nhập mật khẩu (và 2FA) thành công đúng tài khoản có email đó thì tự gắn và báo.
4. Không có danh tính, không trùng email: tạo tài khoản mới `password_hash = ''` (không đăng nhập mật khẩu được). Có email đã xác minh thì dùng làm email, đánh dấu đã xác minh, gửi email chào mừng. Không có (Zalo, hoặc email chưa xác minh) thì dùng email tạm `mxh-<ngẫu nhiên>@chua-co-email.invalid` (bảng `users` bắt buộc email duy nhất), chuyển sang `/tai-khoan/email` để bổ sung.

Email tạm: không gửi thư tới đó (`sendMail` bỏ qua), không hiện ra giao diện, không đăng ký được bằng tay.

Đặt hàng: chặn khi email còn là email tạm, hoặc tài khoản không mật khẩu mà email chưa xác minh (thêm vào quy tắc `auth.require_email_verified` sẵn có). Bổ sung email: `/tai-khoan/email`, chỉ cho tài khoản không mật khẩu và chưa xác minh, email chưa ai dùng, gửi thư xác minh theo luồng hiện có, giới hạn 10 lần mỗi giờ.

## 4. Tài khoản

- Trang `/tai-khoan` có khối "Đăng nhập bằng mạng xã hội": từng nhà cung cấp đã bật, đã liên kết (kèm email nếu có, ngày) thì nút Hủy liên kết (POST, CSRF), chưa thì nút Liên kết.
- Không cho hủy liên kết cuối cùng khi chưa đặt mật khẩu. Tài khoản không mật khẩu thấy form "Đặt mật khẩu" thay cho "Đổi mật khẩu".
- Nhật ký: `user.oauth_login`, `user.oauth_register`, `user.oauth_link`, `user.oauth_unlink`, `user.set_password`.

## 5. Dữ liệu và cấu hình

```sql
CREATE TABLE IF NOT EXISTS user_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('zalo','google','github')),
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (...),
  UNIQUE (provider, provider_user_id)
);
```

Thêm `UNIQUE (user_id, provider)`: mỗi tài khoản một danh tính mỗi bên, hủy rồi mới liên kết cái khác.

Cấu hình (Cấu hình ghi đè `.env`): `oauth.zalo_app_id`/`ZALO_APP_ID`, `oauth.zalo_app_secret`/`ZALO_APP_SECRET`, `oauth.google_client_id`/`GOOGLE_CLIENT_ID`, `oauth.google_client_secret`/`GOOGLE_CLIENT_SECRET`, `oauth.github_client_id`/`GITHUB_CLIENT_ID`, `oauth.github_client_secret`/`GITHUB_CLIENT_SECRET`; ba bí mật trong `SECRET_KEYS` (mã hóa AES-256-GCM, che khi hiện). Ô bật tắt `oauth.<bên>_enabled` mặc định bật, nhưng bên nào thiếu id hoặc bí mật thì luôn tắt.

Redirect URI khai báo ở từng bên: `{APP_URL}/auth/{zalo|google|github}/callback`, trên máy thật `https://mientaymedia.com/ten-mien/auth/zalo/callback` (tương tự google, github). Trang Cấu hình in sẵn ba địa chỉ này.

## 6. Giao diện

- `partials/nut-mxh.ejs` dùng chung cho đăng nhập và đăng ký; chữ "Đăng nhập bằng ..." ở trang đăng nhập, "Đăng ký bằng ..." ở trang đăng ký (Google chỉ cho các cách nói đó, ba nút nói giống nhau cho đồng bộ).
- Google: theo hướng dẫn mục 1, logo G bốn màu SVG nội tuyến. GitHub: nền `#24292f`, chữ trắng, dấu Invertocat trắng. Zalo: nền xanh Zalo `#0068FF`, chữ trắng, nhãn chữ "Zalo".
- Không JavaScript, không ảnh ngoài, CSP giữ nguyên.

## 7. Kiểm thử

Máy chủ giả lập một tiến trình đóng vai ba bên (kiểm `code_verifier` theo S256, `client_secret`/`secret_key`, `redirect_uri`, mã dùng một lần). Tình huống: nút ẩn hiện theo cấu hình; state sai, state hết hạn, state dùng lại; PKCE (độ dài, S256 khớp); hủy quyền; đăng ký mới Google, GitHub; email trùng tài khoản có mật khẩu (không gộp, đăng nhập mật khẩu rồi tự gắn); trùng tài khoản không mật khẩu đã xác minh (gộp); Zalo không email (email tạm, chặn đặt hàng, bổ sung email); 2FA sau MXH; liên kết cần `_csrf`, danh tính của người khác; hủy liên kết cuối cùng khi chưa có mật khẩu; phiên mới sau đăng nhập; `next` độc hại; log không chứa mã, token, bí mật; CSP không đổi.
