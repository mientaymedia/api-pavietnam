---
type: spec
du_an: tai-khoan-chung (nấc 1)
buoc: 2 - Design
trang_thai: dang lam
cap_nhat: 21/10/2026
nguon: intent.md (mục "Quyết định của chủ" 21/10/2026 là chính thức)
---

# Spec: Cổng "Tài khoản MienTay" tại mientaymedia.com/tai-khoan (nấc 1)

Phương án A, nấc 1: ứng dụng tên miền (Express/EJS/SQLite) phục vụ thêm cổng ở `/tai-khoan`, dùng chung bảng `users`, `user_identities`, 2FA và phiên với `/ten-mien`. Không có OIDC (nấc 2, để sau). Mineflow chỉ là liên kết sang trang đăng nhập riêng.

## 1. Bật tắt và đường lui

- Biến mới `CONG_TAI_KHOAN_PATH` (ví dụ `/tai-khoan`). Rỗng = tắt: app chạy y như trước (mọi test cũ ở gốc và dưới `/ten-mien` không đổi hành vi).
- Kiểm lúc khởi động (`src/config.ts`): cùng dạng với `BASE_PATH`; phải khác `BASE_PATH`, không lồng nhau; `BASE_PATH` rỗng thì không bật được cổng (app ở gốc có route `/tai-khoan` của chính nó). Sai thì dừng khởi động với thông báo rõ.
- `deploy/vps/docker-compose.yml` đặt `CONG_TAI_KHOAN_PATH=${CONG_TAI_KHOAN_PATH:-/tai-khoan}` và thêm router Traefik. Đường lui: đặt biến rỗng (hoặc bỏ router) rồi dựng lại container; link cũ `/ten-mien/dang-nhap` lại hiện form cũ.

## 2. Phiên dùng chung (không mở cookie ra `Path=/`)

Cookie `sid` hiện có `Path=/ten-mien`. Intent mục 3 phương án C và mục 9 cảnh báo `Path=/` làm cookie phiên gửi cho mọi trang Next.js. Chọn cơ chế tương đương: **hai cookie cùng tên, cùng giá trị, hai `Path`** (`/ten-mien` và `/tai-khoan`). Hai đường dẫn không lồng nhau nên mỗi yêu cầu chỉ mang đúng một cookie. Thuộc tính giữ nguyên: `HttpOnly`, `SameSite=Lax`, `Secure` khi production, không `Domain`, sống 30 ngày.

Quy tắc (`src/middleware/session.ts`):

1. Phiên `/ten-mien` là gốc. Yêu cầu dưới `/ten-mien` có phiên hợp lệ mà chưa đánh dấu `cookieChung` thì đặt cả hai cookie rồi đánh dấu (một lần mỗi phiên). Nhờ vậy phiên đang đăng nhập từ trước khi triển khai, và giỏ hàng của khách vãng lai, lan sang cổng ở lần đầu khách vào `/ten-mien`.
2. Phiên mới tạo dưới `/ten-mien`: đặt cả hai cookie. Phiên mới tạo dưới cổng: chỉ đặt cookie của cổng (không ghi đè cookie `/ten-mien` có thể đang giữ giỏ hàng hay phiên cũ).
3. `loginSession` (đăng nhập, 2FA xong, mạng xã hội): xoay id như cũ, đặt cả hai cookie, đánh dấu `cookieChung`.
4. `destroySession` (đăng xuất ở bất kỳ đâu): xóa dòng `sessions` và xóa cả hai cookie. Hai bên cùng một id nên đăng xuất một nơi là hết cả hai.

Giới hạn đã biết: phiên đăng nhập cũ (trước triển khai) mà khách vào thẳng cổng trước khi vào `/ten-mien` thì cổng thấy chưa đăng nhập; đăng nhập lại là thống nhất. Chấp nhận vì số khách thật rất ít (intent mục 0) và phiên cũ hết hạn sau 30 ngày.

Giới hạn thứ hai: khách chưa từng vào `/ten-mien` mở cổng (phiên chỉ có cookie cổng), nhập mật khẩu đúng của tài khoản có 2FA, rồi giữa chừng mở một trang `/ten-mien` ở thẻ khác thì `/ten-mien` tạo phiên mới cho cả hai Path và bước chờ mã 2FA mất; khách đăng nhập lại. Không mất dữ liệu nào, chỉ phải gõ lại mật khẩu.

## 3. Đích sau đăng nhập (`next`)

- Ở cổng, `next` là **đường dẫn trên host** (ví dụ `/ten-mien/control-panel`, `/bang-gia` của site chính). Kiểm bằng `duongDanNoiBo` (chặn `//evil`, `/\evil`, `https://`, ký tự điều khiển, `/.//evil`), thêm: trỏ vào trang đăng nhập, đăng ký, đăng xuất, quên, đặt lại mật khẩu của cổng hoặc của `/ten-mien` thì bỏ (tránh vòng lặp). Không hợp lệ hoặc không có: trang chọn sản phẩm `/tai-khoan/`.
- Ở `/ten-mien` (khi cổng tắt), `next` giữ nghĩa cũ (đường dẫn trong app).
- Chuyển hướng tới đường dẫn host đi qua hàm riêng `chuyenTuyetDoi` (không thêm tiền tố lần nữa, vẫn chặn `//host`).

## 4. Route của cổng (`src/routes/congTaiKhoan.ts`, gắn ở `CONG_TAI_KHOAN_PATH`)

| Route | Việc |
|---|---|
| `GET /` | Đã đăng nhập: trang chọn sản phẩm. Chưa: 302 `/tai-khoan/dang-nhap` |
| `GET, POST /dang-nhap` | Email, mật khẩu; ba nút Zalo, Google, GitHub. Đã đăng nhập: GET về trang chọn sản phẩm |
| `GET, POST /dang-nhap/hai-lop` | Mã 2FA hoặc mã dự phòng (bắt buộc khi đã bật, như cũ) |
| `GET, POST /dang-ky` | Đăng ký email, mật khẩu, kèm nút mạng xã hội |
| `GET, POST /quen-mat-khau`, `GET, POST /dat-lai-mat-khau` | Như cũ |
| `POST /dang-xuat` | Cần `_csrf`; hết phiên cả hai nơi; về `/tai-khoan/` (tức trang đăng nhập) |
| `GET /ho-so` | Họ tên, điện thoại, email; form gửi về `/ten-mien/tai-khoan/thong-tin` kèm `quay_ve=ho-so` |
| `GET /bao-mat` | Đổi hoặc đặt mật khẩu (gửi về route `/ten-mien` có sẵn, `quay_ve=bao-mat`); trạng thái 2FA và nút sang `/ten-mien/tai-khoan/bao-mat` để bật, tắt, tạo mã dự phòng |
| `GET /lien-ket` | Danh sách Zalo, Google, GitHub; liên kết (link GET kèm `_csrf`) và hủy (POST kèm `_csrf`, `quay_ve=lien-ket`) |

Logic đăng nhập, đăng ký, 2FA, quên và đặt lại mật khẩu **dùng chung một bản** với `/ten-mien` (`src/routes/auth.ts` xuất các hàm xử lý; mỗi hàm tự biết đang chạy ở cổng hay ở `/ten-mien` qua `req.baseUrl`): chỉ khác tệp view và cách hiểu `next`. Giới hạn tần suất dùng chung một bộ đếm cho cả hai nơi.

`quay_ve` chỉ nhận ba giá trị cố định (`ho-so`, `bao-mat`, `lien-ket`) và chỉ khi cổng bật; giá trị khác thì về `/ten-mien/tai-khoan` như cũ.

## 5. Mạng xã hội

- Redirect URI giữ nguyên: `https://mientaymedia.com/ten-mien/auth/{zalo,google,github}/callback`. Chủ không phải khai lại gì ở Zalo, Google, GitHub.
- Nút ở cổng trỏ `/ten-mien/auth/<ben>?cong=1&next=<đích>`. Bắt đầu ở `/ten-mien` có lợi: `state`, PKCE lưu vào phiên gốc, cookie `/ten-mien` chắc chắn có, callback đọc được.
- `cong=1` (chỉ có tác dụng khi cổng bật) ghi vào phiên OAuth: callback lỗi, hủy, cần mật khẩu thì về `/tai-khoan/dang-nhap`; cần 2FA thì về `/tai-khoan/dang-nhap/hai-lop`; xong thì về đích; liên kết xong thì về `/tai-khoan/lien-ket`. Quy tắc ghép tài khoản (`services/lienKetMxh.ts`) không đổi.
- Tài khoản Zalo chưa có email vẫn về `/ten-mien/tai-khoan/email` để bổ sung (như cũ).

## 6. Link cũ

Khi cổng bật, `GET /ten-mien/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/dang-nhap/hai-lop` trả 302 sang `/tai-khoan/<cùng đường dẫn>`, giữ `token` (đặt lại mật khẩu), đổi `next` (đường dẫn trong app) thành đường dẫn host `/ten-mien<next>` sau khi qua `duongDanNoiBo`. `requireAuth` chuyển thẳng sang `/tai-khoan/dang-nhap?next=<đường dẫn host đang mở>`. POST cũ vẫn chạy (form trong trang đã lưu đệm). Email đặt lại mật khẩu, xác thực email giữ link `/ten-mien/...` (link cũ chạy, đổi lại không cần).

## 7. Giao diện

- Thương hiệu "Tài khoản MienTay", logo chữ MienTay Media, màu `--brand` có sẵn, font Be Vietnam Pro tự phục vụ, không JavaScript, CSP như cũ (không mở thêm nguồn). Tệp `src/views/cong/*.ejs`, CSS `public/css/cong.css` (nạp sau `app.css`).
- Trang chọn sản phẩm: thẻ "Tên miền" (`/ten-mien/control-panel`) và thẻ "Mineflow" (`https://app.mineflow.dev`, mở tab mới, ghi chú "Mineflow dùng tài khoản riêng, bạn đăng nhập lại ở trang Mineflow").
- Logo dẫn về site chính (gốc của `APP_URL`).

## 8. Email qua Resend

- `MAIL_DRIVER=resend` (mặc định `smtp`): gửi qua Resend HTTP API `POST https://api.resend.com/emails`, header `Authorization: Bearer <RESEND_API_KEY>`, thân JSON `from`, `to`, `subject`, `html`, `text`, `reply_to`. Lỗi ghi `email_logs` với mã HTTP và `message` của Resend, không bao giờ ghi khóa.
- Khóa: `RESEND_API_KEY` trong `.env`, hoặc nhập ở Cấu hình (`smtp.resend_key`, lưu mã hóa AES-256-GCM như các bí mật khác, che khi hiện). Chọn driver ở Cấu hình (`smtp.driver`) hoặc `MAIL_DRIVER`.
- Mặc định `MAIL_FROM="MienTay Media <no-reply@updates.mientaymedia.com>"` (tên miền đã xác minh trên Resend; `mientaymedia.com` gốc chưa xác minh), `MAIL_REPLY_TO=hello@mientaymedia.com`.
- Phương án phụ SMTP của Resend: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465` + `SMTP_SECURE=1` (hoặc 587 STARTTLS, `SMTP_SECURE=0`), `SMTP_USER=resend`, `SMTP_PASS=<RESEND_API_KEY>`.
- `RESEND_API_BASE` chỉ để test trỏ về máy chủ giả lập; bỏ qua trên production.
- Nội dung email vẫn do app dựng (có test). Gửi theo mẫu Resend: không làm ở nấc này (xem plan, Lệch spec).

## 9. Site chính (repo mientay-web, nhánh `feat/tai-khoan-mientay` từ `origin/main`)

- Hằng `TAI_KHOAN_URL = "https://mientaymedia.com/tai-khoan/dang-nhap"` trong `web/src/lib/site-data.ts`; nút "Đăng nhập" ở `SiteHeader.tsx` (máy tính và di động) trỏ hằng này kèm `?next=<pathname hiện tại>`.
- Không đổi `CONTACT.appUrl`: nó còn là nút "Dùng thử" Mineflow ở `mineflow-cdp` và `ctaUrl` CMS. CMS không ghi đè được địa chỉ cổng (cố ý: một giá trị sai ở CMS làm hỏng đăng nhập).

## 10. Kiểm

Test HTTP mới `test/tai-khoan-chung.test.ts` (BASE `/ten-mien`, cổng `/tai-khoan`, máy chủ OAuth giả lập có sẵn):

1. Đăng nhập mật khẩu ở cổng rồi `GET /ten-mien/control-panel` 200 với cookie của path `/ten-mien`, không đăng nhập lại.
2. Đăng nhập ở `/ten-mien` (POST cũ) rồi `GET /tai-khoan/` thấy trang chọn sản phẩm.
3. Đăng xuất ở cổng: `/ten-mien/control-panel` 302 sang cổng; dòng `sessions` của sid đó = 0. Đăng xuất ở `/ten-mien`: cổng 302 sang đăng nhập.
4. 2FA: mật khẩu đúng ở cổng chuyển sang `/tai-khoan/dang-nhap/hai-lop`; sai mã 401, `/ten-mien/control-panel` vẫn 302; đúng mã vào được.
5. Mạng xã hội từ cổng (Google, Zalo, GitHub giả lập): bắt đầu ở `/ten-mien/auth/<ben>?cong=1`, `redirect_uri` vẫn là callback `/ten-mien/...`, xong về đích; tài khoản có mật khẩu trùng email không tự gộp (về đăng nhập cổng).
6. `next` độc hại (bộ biến thể `BIEN_THE_NEXT`) ở cổng đều về `/tai-khoan/`.
7. Mọi `Set-Cookie` không có `Domain`, có `HttpOnly`, `SameSite=Lax`, path chỉ là `/ten-mien` hoặc `/tai-khoan`.
8. POST đăng xuất cổng thiếu `_csrf` 403.
9. Link cũ: `/ten-mien/dang-nhap?next=/control-panel` 302 `/tai-khoan/dang-nhap?next=%2Ften-mien%2Fcontrol-panel`; `/ten-mien/dat-lai-mat-khau?token=x` giữ token; không cái nào 404.
10. Mailer: driver Resend gửi đúng URL, header, thân tới máy chủ giả lập; lỗi 4xx ghi `failed` không chứa khóa; khóa trong bảng `settings` được mã hóa.

Cộng: `npx tsc --noEmit`, `npm test`, `npm run kiem-dau`, `node scripts/kiem-base.mjs` (bò cả `/tai-khoan`, link nội bộ phải thuộc `/ten-mien` hoặc `/tai-khoan`), ảnh cổng 1366 và 360 px. Site chính: lint, build.
