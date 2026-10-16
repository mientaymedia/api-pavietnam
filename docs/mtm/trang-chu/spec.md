---
type: spec
du_an: trang-chu
buoc: 2 - Design
dau_vao: docs/mtm/trang-chu/intent.md
cap_nhat: 16/10/2026
---

# Spec: trang chủ mới

## 1. Thương hiệu (lấy từ D:\mientay-web\web\src\app\globals.css, chỉ đọc)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--brand` | #0a6cff | nút, liên kết, điểm nhấn |
| `--brand-dark` | #0a4fcb | nút khi rê chuột |
| `--brand-navy` | #0a3da8 | nền footer, banner |
| `--ink` | #0b1b3b | chữ chính |
| `--brand-light` | #eef4ff | nền nhấn, chip |

- Font Be Vietnam Pro, tự phục vụ 8 tệp woff2 (bộ `latin` + `vietnamese`, độ đậm 400/600/700/800) lấy từ gói npm `@fontsource/be-vietnam-pro` 5.3.0, kèm giấy phép OFL, đặt ở `public/fonts/`. Không thêm phụ thuộc npm. Dự phòng: font hệ thống.
- Logo: `public/img/mientaymedia-logo.png` (chữ xanh, header) và `public/img/mientaymedia-logo-trang.png` (chữ trắng, footer), chép từ mientay-web. Nếu quản trị đã đặt `site.logo_url` thì header vẫn ưu tiên logo đó như trước.
- Màu chủ đạo mặc định của cấu hình `site.primary_color` đổi từ #0f766e sang #0a6cff (settings, seed, gợi ý trang quản trị, so sánh trong `head.ejs`), để email và nơi nào đọc màu này cùng tông.

## 2. Các khối (thứ tự từ trên xuống)

1. Thanh ưu đãi mỏng: một câu nêu giá đăng ký năm đầu thật của đuôi .vn (hoặc đuôi nổi bật đầu tiên) + nút "Mua ngay" nhảy tới ô tìm (`#tim-ten-mien`). Chỉ có ở trang chủ.
2. Header (dùng chung): logo, menu sản phẩm (Tìm tên miền, Bảng giá, Chuyển về, WHOIS, các mục khi đăng nhập), giỏ hàng có biểu tượng và số lượng, nút Đăng nhập / Đăng ký. Giữ nút menu `<details>` cho màn hẹp.
3. Hero nền sáng gradient nhẹ: tiêu đề, mô tả, hai tab bằng radio + CSS (Tìm tên miền / Chuyển tên miền về), ô tìm bo tròn có nút bên phải gửi `GET /tim-kiem?q=`; tab chuyển gửi `GET /chuyen-ten-mien?domain=` (route điền sẵn ô tên miền). Dưới ô là dải chip đuôi + giá đăng ký năm đầu (mọi đuôi đang bán, đuôi nổi bật trước; cuộn ngang trên điện thoại). Dưới nữa 4 thẻ cam kết: Kích hoạt tức thì, Quản lý DNS miễn phí, Thanh toán QR tự động, Hóa đơn rõ ràng.
4. Hai banner: banner rộng nền navy với hình trang trí SVG tự vẽ + thẻ giới thiệu tên miền .vn bên phải (giá thật).
5. "Dịch vụ nổi bật": lưới 3 cột, 6 thẻ đuôi (đuôi nổi bật, bù bằng đuôi đang bán theo thứ tự nếu thiếu) + 3 thẻ công cụ (Chuyển tên miền về: giá chuyển thấp nhất; Tra cứu WHOIS: miễn phí; Quản lý DNS: miễn phí kèm tên miền). Mỗi thẻ: nhãn nhóm, icon SVG, tên, mô tả, "Chỉ từ ... /năm".
6. Giới thiệu MienTay Media + 3 thẻ lý do chọn.
7. "Khách hàng tin dùng": 12 logo `Logo-*.png` từ mientay-web chép vào `public/img/khach-hang/`, alt "Logo khách hàng <tên>".
8. Câu hỏi thường gặp: 5 câu, `<details>/<summary>`.
9. Footer (dùng chung): nền navy, logo trắng, thông tin liên hệ từ cấu hình (`site.address`, `site.hotline`, `site.supportEmail`), cột liên kết.

## 3. Dữ liệu từ route `/`

`routes/home.ts` truyền thêm: `chips` (mọi đuôi đang bán, nổi bật trước), `noiBat` (6 đuôi cho lưới), `uuDai` (đuôi cho thanh ưu đãi và thẻ .vn), `giaChuyenTu` (giá chuyển thấp nhất hoặc null). Giá đều qua `priceFor(t, 'register' | 'transfer', 1).total`, có VAT nếu cấu hình.

## 4. Ràng buộc

- Mọi đường dẫn nội bộ có `<%= base %>`; ảnh font trong CSS dùng đường dẫn tương đối `../fonts/`.
- CSP giữ nguyên: không script, style, font, ảnh từ ngoài; không thêm JS.
- CSS trang chủ dùng tiền tố lớp `tc-` trong `public/css/app.css` để không ảnh hưởng trang khác.
- Chữ tiếng Việt có dấu, kiểu dấu mới (khóa, hủy, hóa đơn), xưng "bạn", tiền dạng "830.000 đ", không em dash hay en dash.

## 5. Kiểm

- `npx tsc --noEmit`, `npm test` (195 cũ + test mới cho trang chủ), `npm run kiem-dau`, `node scripts/kiem-base.mjs`: đều sạch.
- Test mới `test/trang-chu.test.ts`: trang chủ 200, có form `action="/tim-kiem"`, chip có giá đúng bằng `priceFor`, có logo khách hàng, có form chuyển, `/chuyen-ten-mien?domain=` điền sẵn và được thoát ký tự.
- Chạy app sandbox P.A, cổng 3101, CSDL tạm; chụp desktop và điện thoại vào `docs/mtm/trang-chu/`.
