---
type: spec
du_an: pa-dang-ky
buoc: 2 - Design
dau_vao: docs/mtm/pa-dang-ky/intent.md; tài liệu API_PAVIETNAM.pdf và tệp demo của P.A (chỉ đọc)
nhanh: mtm/pa-dang-ky
cap_nhat: 19/10/2026
---

# Spec: tích hợp API đại lý P.A

## 1. Gọi P.A

- Endpoint thật `https://daily.pavietnam.vn/interface.php` (`PAVIETNAM_ENDPOINT`, `pa.endpoint`). Endpoint thử `https://daily.pavietnam.vn/interface_test.php` (`PAVIETNAM_ENDPOINT_TEST`, `pa.endpoint_test`). Bật chế độ thử bằng `PA_USE_TEST_ENDPOINT=1` hoặc ô `pa.use_test_endpoint` trong Cấu hình.
- Chế độ thử chỉ áp cho lệnh GHI (đăng ký, gia hạn, đổi DNS, đổi mật khẩu, sửa thông tin): tài liệu chỉ có link thử cho các lệnh đó. Lệnh đọc (`check_whois`, `get_whois`, `check_account_still`, `get_date_domain`, `check_domain`, `get_province`, `get_ward`, `get_country`, `get_info_domain`) luôn đi endpoint thật.
- Mọi lệnh gửi GET như demo, giá trị urlencode, `cmd`, `username`, `apikey`; thêm `responsetype=json` trừ `check_whois` và `get_whois` (đang chạy thật, giữ nguyên). Nhật ký API che `apikey` và `passwordDomain`.
- Đọc phản hồi: JSON `Command`, `ReturnCode`, `ReturnText` (cả khi có BOM); dạng `<pre>Array ( [ReturnCode] => ... )` của PHP cũng đọc được.

## 2. Bảng phân loại mã (src/pavietnam/maLoi.ts)

| Nhóm | Mã | Xử lý khi cấp phát |
|---|---|---|
| thành công | 200; 900 chỉ khi lệnh đi endpoint thử | ghi nhận, lưu trans_id, trans_money, ngày hết hạn |
| thiếu quỹ | 400 | dòng đơn giữ "chờ nạp quỹ", cảnh báo quản trị, job 5 phút thử lại |
| cần người xử lý | 606, 302, 301, 605, 100, 109, 201, 202, 304, 305, 403, 500, 501, 600 đến 603; 900 ở endpoint thật | giữ "cần người xử lý", cảnh báo, không hoàn tự động |
| lỗi dữ liệu khách | 108, 203 đến 208, 306 đến 309, 406, 2xxx, 3053 đến 3056, 6000 đến 6099 | giữ "sai hồ sơ", cảnh báo quản trị sửa hồ sơ rồi bấm thử lại; không thử lại tự động |
| đã có chủ / tên không hợp lệ | 101, 303, 102 đến 107, 209, 402, 404, 405, 604 | thất bại vĩnh viễn, hoàn tiền như cũ (101/303 ở lần thử thứ hai trở đi: hỏi `check_domain` trước, ReturnCode 1 nghĩa là chính lần trước đã đăng ký được) |
| tạm thời | 300, 503, 505 đến 507, mất mạng, mã lạ | thử lại; quá 3 lần thì giữ "cần người xử lý" (không hoàn: có thể P.A đã trừ tiền) |

## 3. Tham số đăng ký (src/pavietnam/thamSo.ts, hàm thuần)

- Chung: `domainName` (không đuôi), `domainExt`, `domainYear`, `passwordDomain`, `for` canhan|congty, `domainDNS1..2` (.vn thêm `domainDNS3`), `ownerType` 1|2, `ownerName`, `ownerID_Number` hoặc `ownerTaxCode`, `ownerAddress`, `ownerWard`, `ownerProvince`, `ownerCountry`="Viet Nam", `ownerEmail1`, `ownerPhone`; `ui*` cùng giá trị chủ thể; `sendmail`, `return_full=1`.
- .vn cá nhân: thêm `uiGender` Nam|Nữ, `uiBirthdate` YYYY-mm-dd. .vn (cả hai loại): `admin*` là người quản lý cá nhân. Cá nhân: người quản lý là chính chủ thể. Công ty: người đại diện (họ tên, CCCD, ngày sinh, giới tính nhập trong hồ sơ), địa chỉ và liên hệ theo hồ sơ công ty.
- Điện thoại gửi dạng `+84-xxxxxxxxx`. Mật khẩu tên miền: 12 ký tự a-z và 0-9, có cả chữ và số, sinh ngẫu nhiên một lần cho dòng đơn (lưu mã hóa, dùng lại khi thử lại), sau đó chép sang tên miền, khách xem trong Control Panel.

## 4. Hồ sơ chủ thể

- Thêm cột `contacts.ward`. Cá nhân: họ tên, CCCD/hộ chiếu, ngày sinh, giới tính. Tổ chức: tên, MST, và người đại diện (họ tên, CCCD, ngày sinh, giới tính) dùng các cột `full_name`, `id_number`, `birth_date`, `gender`. Chung: email, điện thoại, địa chỉ số nhà tên đường, tỉnh, phường xã.
- Tỉnh và phường xã: tệp `src/data/dia-gioi-pa.json` chuyển từ Tinh_thanh_Viet_Nam.xlsx và Phuong_xa_Viet_Nam.xlsx bằng `scripts/chuyen-dia-gioi-xlsx.mjs <tinh.xlsx> <phuong.xlsx>`. Trên máy chủ nạp lại bằng `npm run pa:dia-gioi` (get_province, get_ward), ghi vào thư mục dữ liệu (cạnh CSDL), ưu tiên hơn tệp đóng gói.
- Form 2 bước không cần JS: chọn tỉnh, bấm "Lấy danh sách phường, xã" (gửi lại form, không lưu), rồi chọn phường trong danh sách của tỉnh đó. Có JS thì đổi tỉnh là danh sách phường tự nạp (`GET /dia-gioi/phuong?tinh=<mã>`).
- Kiểm phía máy chủ: tỉnh có trong danh sách, phường thuộc tỉnh, địa chỉ hơn 6 ký tự và có số nhà (hoặc tổ, ấp, khóm, thôn, xóm), điện thoại chuẩn hóa được về +84, ngày sinh là ngày có thật trong quá khứ (không đặt tuổi tối thiểu), giới tính Nam|Nữ. Theo đuôi: mọi đuôi cần CCCD (cá nhân) hoặc MST (tổ chức); .vn thêm ngày sinh, giới tính, và với tổ chức thêm người đại diện. Kiểm ở trang thanh toán (theo đuôi trong giỏ) và trước khi gọi P.A.

## 5. Cấp phát

- Trước khi gọi đăng ký hoặc gia hạn: `check_account_still`. Cần = `cost_register` (hoặc `cost_renew`) x số năm của đuôi; giá vốn chưa nhập (0) thì dùng số tiền khách trả của dòng đó (ước dư). Số dư nhỏ hơn cần: giữ "chờ nạp quỹ".
- Cột mới `order_items.hold` ('' | 'cho_nap_quy' | 'can_nguoi_xu_ly' | 'sai_ho_so'), `pa_trans_id`, `pa_trans_money`, `pa_password_enc`; `domains.pa_password_enc`. Dòng bị giữ vẫn ở `pending` nên đơn hiện "Đang xử lý" với khách.
- Sau đăng ký thành công: gọi `get_date_domain` lấy ngày đăng ký và hết hạn; không đọc được thì tính từ hôm nay cộng số năm.
- Job `retry_awaiting_funds` 5 phút một lần: đọc số dư, lần lượt nhả các dòng "chờ nạp quỹ" cũ nhất trong phạm vi số dư rồi cấp phát.

## 6. Quản trị

- Tổng quan: thẻ số dư đại lý thật (đọc trực tiếp, lỗi thì báo), cờ chế độ thử/thật, số dòng chờ nạp quỹ và cần người xử lý.
- Cấu hình: ô endpoint thử và công tắc chế độ thử, dải cảnh báo khi đang ở chế độ thử. Nút Kiểm tra API gọi `check_account_still`.
- Trang `/admin/cho-xu-ly`: các dòng đang bị giữ (lý do, mã P.A, số tiền cần nạp), nút "Thử lại" từng dòng.

## 7. Kiểm thử

- Máy chủ P.A giả cục bộ trả đúng định dạng tài liệu (200, 900, 400, 606, 2xxx, 6023...). Luồng: .vn cá nhân, .com.vn công ty, .com; thiếu quỹ rồi nạp; gia hạn; đổi DNS .vn có IP.
- `scripts/pa-thu-endpoint-test.mjs`: biến môi trường `PA_USERNAME`, `PA_APIKEY`, `PA_ENDPOINT`; từ chối chạy nếu endpoint không phải `interface_test.php`; in Command/ReturnCode/ReturnText, không in apikey.
