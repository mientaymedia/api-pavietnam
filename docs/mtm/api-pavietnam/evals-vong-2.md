---
type: evals
du_an: api-pavietnam
buoc: 4 - Test (QA độc lập, vòng 2)
dau_vao: evals.md (vòng 1, kết luận CHƯA ĐẠT tại 738ba18), plan.md mục "Sửa sau Test" (S1 đến S5)
nhanh: mtm/trang-chu @ 7b7f5af (= mtm/api-pavietnam 69bf6a0 gộp trang chủ mới)
cap_nhat: 16/10/2026
ket_luan: ĐẠT (các dòng CHƯA ĐẠT của vòng 1 đã đạt; còn việc cần người như vòng 1)
---

# Đánh giá độc lập vòng 2: kiểm lại sau S1 đến S5

QA tự chạy lại mọi thứ, không dùng số liệu của Build. Không sửa code, không push, không gọi P.A thật (chỉ máy chủ P.A giả ở 127.0.0.1), không đụng VPS, không đụng `D:\api-pavietnam`. Script kiểm thử để ngoài repo, trong thư mục scratchpad của phiên QA (`qa2/e2e.mjs`, `qa2/referer2.mjs`, `qa2/pa-probe.mts`, `qa2/sessions.mts`, `qa2/trinh-duyet.mjs`, `qa2/so-sanh.mjs`). Máy chủ thử, SMTP giả và Chrome headless đã tắt khi xong.

## 1. Kết luận

**ĐẠT** cho các dòng vòng 1 ghi CHƯA ĐẠT do lỗi máy (lỗi 1, 2, 4, 5). Open redirect qua `next=` và qua `Referer` giỏ hàng không còn lọt với 10 biến thể vòng 1 và 33 biến thể mới, ở cả gốc lẫn `BASE_PATH=/ten-mien`, kể cả bước đăng nhập hai lớp. `interpret` nhận "Thành công" mọi dạng dấu, mọi câu lỗi vẫn là lỗi. Các tiêu chí cần người (8 Gmail, 9 Excel, 12 chủ ký chính tả) vẫn mở như vòng 1.

## 2. Cổng chặn (QA tự chạy trên 7b7f5af)

| Lệnh | Kết quả |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | thoát 0 |
| `npm test` | tests 212, pass 212, fail 0 |
| `npm run kiem-dau` | 0 chuỗi thiếu dấu, 0 lỗi mã hóa, 0 mục thừa, 30 chuỗi được cho phép |
| `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` | 58 + 40 + 41 trang, 0 link thiếu tiền tố |
| Dấu tổ hợp NFD, em dash, en dash trong `src public test scripts` (quét bằng node) | 0 |

Không có test đỏ, không cần đối chiếu nhánh gốc.

## 3. Bảng kiểm lại các dòng vòng 1

| # vòng 1 | Tiêu chí | Cách kiểm | Kết quả | Bằng chứng |
|---|---|---|---|---|
| Lỗi 1 | Chuyển hướng `next=` an toàn | Đăng nhập thật (mật khẩu đúng) ở cổng 3111 (gốc) và 3112 (`BASE_PATH=/ten-mien`, chạy bằng Git Bash chỉ với `MSYS_NO_PATHCONV=1`). 10 biến thể vòng 1 + 28 biến thể mới + 4 dạng thân form mảng/trùng lặp + 1 thử XSS ô ẩn | **ĐẠT** | 43/43 mỗi chế độ, mọi phản hồi `302` có `Location` cùng origin, bắt đầu bằng tiền tố. Xem 3.1 |
| Lỗi 1 | `next=` qua bước hai lớp | Quản trị có 2FA đăng nhập với `next=/a/..//evil.com`, nhập TOTP thật | **ĐẠT** | gốc: `Location: /dashboard`; base: `Location: /ten-mien/dashboard` |
| Lỗi 2 | `quayLai` giỏ hàng theo Referer | `POST /gio-hang/them` (CSRF hợp lệ, tên miền sai) với 19 Referer độc + 4 đến 7 Referer hợp lệ, giãn cách 3,2 giây tránh giới hạn 20 lần/phút | **ĐẠT** | 0 lỗi mỗi chế độ. Xem 3.2 |
| Lỗi 3 | Chạy dưới tiền tố trên Git Bash | `MSYS_NO_PATHCONV=1 bash start.sh ... /ten-mien` (bỏ hẳn `MSYS2_ENV_CONV_EXCL` của vòng 1) | **ĐẠT** | log máy chủ: "MienTay Media dang chay tai http://127.0.0.1:3112/ten-mien" |
| Lỗi 4 | Email thử SMTP có `<meta charset="utf-8">` | SMTP giả nhận 8 thư thật mỗi chế độ, giải MIME bằng Python `email` | **ĐẠT** | 16/16 thư có meta charset, `charset=utf-8`, tiêu đề giải ra đúng chữ có dấu, kể cả "[MienTay Media] Thử cấu hình SMTP" |
| Lỗi 5 | `interpret` nhận "Thành công" có dấu, câu lỗi vẫn lỗi | máy chủ P.A giả, `PAVIETNAM_SANDBOX=0`, đi qua `call()` thật | **ĐẠT** | 38/38 ca, 0 lỗi. Xem mục 4 |
| 7, 13 | Luồng chạy thật, link nội bộ | `qa2/e2e.mjs` cả hai chế độ (đăng ký, giỏ, đặt hàng, SePay webhook, kích hoạt, control panel, 2FA, 13 trang quản trị, CSV) | ĐẠT | base 142 dòng ĐẠT, gốc 137; bò 98 link (base) và 99 link (gốc) không 4xx/5xx, mọi `Location` có tiền tố, mọi `Set-Cookie` đúng `Path`. Dòng LỖI còn lại đều là giả: xem 3.3 |
| 9 | CSV | như vòng 1 | ĐẠT phần máy | 3 tệp 200, `text/csv; charset=utf-8`, có BOM, tiêu đề cột có dấu. Mở Excel: cần người |
| 8, 12 | Gmail, chủ ký chính tả | | CHƯA ĐẠT (chờ chủ) | như vòng 1 |

### 3.1 Biến thể `next=` (cả hai chế độ cho cùng kết quả, chỉ khác tiền tố)

- Vòng 1, nay về `/dashboard`: `//evil.com`, `/\evil.com`, `https://evil.com`, `%2F%2Fevil.com`, `/.//evil.com`, `/..//evil.com`, `/%2e//evil.com`, `/a/..//evil.com`, `/<tab>/evil.com`, `javascript:alert(1)`.
- Mới, về `/dashboard`: `///evil.com`, `////evil.com`, `/\/evil.com`, `\\evil.com`, ` //evil.com` (dấu cách đầu), `/././/evil.com`, `/x/../..//evil.com`, `/%2E%2E//evil.com`, `/.%2e//evil.com`, `/a/b/../../..//evil.com`, `/\r\nSet-Cookie: x=1` (không sinh cookie), `/\u0000//evil.com`, `/\n/evil.com`, `https:evil.com`, `http:/evil.com`, `/./\evil.com`, `/ten-mien/.//evil.com` (ở gốc), `//evil.com` dạng `${BASE}//evil.com` ở gốc.
- Mới, giữ nguyên làm đường dẫn nội bộ (an toàn, trình duyệt hiểu là đường dẫn trên cùng host): `/%5Cevil.com`, `/%5C%5Cevil.com`, `/%2F/evil.com`, `/%09/evil.com`, `/https://evil.com`, `/#//evil.com`, `/?q=//evil.com`, `/∕∕evil.com` và `/／／evil.com` (mã hóa thành `%E2%88%95...`, `%EF%BC%8F...`), `/..\..\evil.com` (thành `/evil.com`), `/ten-mien//evil.com` dưới base (thành `/ten-mien/ten-mien//evil.com`).
- Thân form: `next[]=//evil.com` và `next[a]=//evil.com` về `/dashboard`; `next=/gio-hang&next=//evil.com` về `/gio-hang,//evil.com` (đường dẫn nội bộ, vô hại); `next=//evil.com&next=/` về `/dashboard`.
- `GET /dang-nhap?next="><script>alert(1)</script>`: ô ẩn in `value="&#34;&gt;&lt;script&gt;..."`, đã thoát.
- Hợp lệ vẫn chạy: `next=/gio-hang` về `${BASE}/gio-hang`; `/control-panel` về đúng trang; quản trị `next=/admin/cau-hinh` qua hai lớp về `${BASE}/admin/cau-hinh`.

Để khỏi chạm giới hạn 15 lần/15 phút của `/dang-nhap` (khóa theo IP + email thô), script đổi kiểu chữ hoa thường của email mỗi lần; đăng nhập so email không phân biệt hoa thường nên vẫn là cùng tài khoản. Ghi nhận: kẻ dò mật khẩu cũng né được giới hạn theo cách này (xem mục 5, quan sát 2).

### 3.2 Biến thể Referer giỏ hàng

- Độc, về `${BASE}/gio-hang`: `${O}${B}//evil.com/x`, `/.//evil.com`, `/.//evil.com/x`, `/\evil.com/x`, `/a/..//evil.com/x`, `///evil.com`, `/./\evil.com`, `/%2e%2e//evil.com`, `/x/../..//evil.com`, `javascript:alert(1)`, `//evil.com`, `/\evil.com`, `http://127.0.0.1:<cổng>@evil.com/...`, `http://evil.com#http://127.0.0.1:<cổng>/...`, `http://localhost:<cổng>/...` (khác origin), `https://127.0.0.1:<cổng>/...` (khác giao thức).
- Độc nhưng ra đường dẫn nội bộ vô hại: `/%5C%5Cevil.com`, `/%2F%2Fevil.com`, `/%09/evil.com` giữ nguyên dạng mã hóa.
- Hợp lệ: `/bang-gia` về `${B}/bang-gia`; `/bang-gia?x=//evil.com` giữ query; `/tim-kiem?q=abc#frag` bỏ hash; dưới base: `${O}/ten-mien` về `/ten-mien/`, `/ten-mien-khac/x`, `${O}/`, `${O}/trang-nextjs` về `/ten-mien/gio-hang`; ở gốc `${O}/` về `/`.

### 3.3 Các dòng LỖI trong `e2e.mjs` không phải lỗi sản phẩm

- "Bản ghi DNS mới hiện trên trang": sandbox không lưu bản ghi, flash "Đã thêm bản ghi DNS." vẫn hiện (giống vòng 1).
- 7 dòng `quayLai` trả 429 trong e2e: script gửi hơn 20 lần/phút vào `/gio-hang/them`, chạm giới hạn đúng thiết kế. Đã chạy lại riêng bằng `referer2.mjs` có giãn cách: 0 lỗi (3.2).

## 4. Hồi quy interpret P.A sau S4 (`qa2/pa-probe.mts`)

Máy chủ HTTP giả ở 127.0.0.1, `PAVIETNAM_SANDBOX=0`, key giả, đi qua `call()` thật.

| Nhóm | Ca | Kết quả |
|---|---|---|
| Thành công, phải `ok=true` | chữ thuần "Thành công"; JSON `status` "Thành công", "THÀNH CÔNG", NFD, "thanh cong", "  Thành   công  ", "Thành\tcônG", "success", "OK"; key=value nhiều dòng `status=0` và `status: Thành công` | ĐẠT 11/11 |
| Lỗi, phải `ok=false` | chữ thuần "Lỗi: Lệnh thực thi không được hỗ trợ", "IP không được phép truy cập" (thường, NFD, HOA, bọc HTML, không dấu); JSON `status=error` + message có dấu; JSON chỉ message; JSON `status` "Không thành công", "Thất bại", "Thành công một phần", "chưa thành công", "thành công?", "Lỗi: ...", "IP không được phép truy cập", "not ok", "-1"; `status=error` kèm message "Thành công" | ĐẠT 20/20 |
| `registerDomain` gặp hai câu lỗi | ném `RegistrarError`, `isPermanent=false` (D3: thử lại) | ĐẠT 2/2 |
| `checkDomain` | "đã được đăng ký" không trống; "chưa được đăng ký", "còn trống" là trống | ĐẠT 3/3 |
| `isPermanent` | "Tên miền đã được đăng ký", "Tài khoản không đủ số dư" true; lỗi timeout false | ĐẠT 3/3 |

Tổng 38/38. (Ghi chú cho vòng sau: ca key=value của vòng 1 viết `status=0&message=OK` trên một dòng là sai định dạng thử, bộ phân tích đọc theo dòng; vòng 2 đã sửa thành nhiều dòng.)

## 5. Lỗi và quan sát

Không còn lỗi chặn deploy trong phạm vi api-pavietnam. Quan sát mới (có sẵn trước S1 đến S5, không do đợt sửa gây ra):

1. **[Thấp, có sẵn] Nhánh "status nghiệp vụ" của `interpret` quá rộng.** `client.ts:138` coi mọi `status` chứa `available|unavailable|registered|active|expired` là gọi thành công, nên `status` "error: domain not registered", "inactive", "Lỗi: tên miền chưa active" đều thành `ok=true`. Hành vi y như trước S4 (S4 chỉ thêm `boDau`). Tái hiện: `interpret({ status: 'error: domain not registered' }, '')` trả `ok: true`. Nên xác minh bằng `pa:probe` trên VPS rồi siết thành so khớp nguyên từ.
2. **[Thấp, có sẵn] Giới hạn đăng nhập né được bằng đổi hoa thường email.** Khóa giới hạn của `POST /dang-nhap` là `ip:email` thô (`auth.ts:105`) trong khi tra người dùng dùng `COLLATE NOCASE`. Bằng chứng: giới hạn đếm mọi lần gửi (15 lần/15 phút), vậy mà `e2e.mjs` gửi 42 lần `POST /dang-nhap` cho cùng tài khoản từ cùng IP trong vài giây, chỉ đổi hoa thường email (`Khach@qa.test`, `kHach@qa.test`...), không lần nào bị 429. Tái hiện: lặp 16 lần sai mật khẩu, mỗi lần đổi kiểu chữ của email. Sửa: chuẩn hóa `trim().toLowerCase()` trong hàm `key`.
3. Lỗi 6 vòng 1 (mã trạng thái tiếng Anh "active", "sepay", "paid") vẫn còn, chờ chủ quyết như ghi ở `evals.md` mục 10.

## 6. Việc cần chủ làm (cập nhật từ vòng 1)

1. Gửi thử email khôi phục mật khẩu và kích hoạt tên miền tới Gmail thật (tiêu chí 8).
2. Mở ba tệp CSV bằng Excel (tiêu chí 9).
3. Duyệt và ký bảng kiểm chính tả `test.md` mục 4, quyết "qui trình" / "quy trình" (tiêu chí 12).
4. Trước khi bật đăng ký thật: chạy `pa:probe` trên VPS đã whitelist (quan sát 1 và lỗi 5 vòng 1).
5. Ở Deploy: D6, D7, khai lại webhook SePay `https://mientaymedia.com/ten-mien/webhooks/sepay` như vòng 1.
