---
type: intent
du_an: trang-chu (làm lại trang chủ web bán tên miền)
buoc: 1 - Plan
nhanh: mtm/trang-chu (worktree D:\api-pavietnam-trangchu, tạo từ mtm/api-pavietnam 2b38ea4)
cap_nhat: 16/10/2026
---

# Intent: trang chủ bán tên miền theo bố cục quen thuộc của ngành, mang màu MienTay Media

Yêu cầu của chủ (nguyên văn): "clone trang chủ matbao.net cho tên miền" + "nhớ chú ý màu brand mientaymedia, nếu cần xem repo mientay-web".

## 1. Cách hiểu

- Chỉ học CẤU TRÚC và thứ tự khối của trang chủ Mắt Bão (thanh ưu đãi, header, hero có ô tìm lớn và dải giá đuôi, banner, lưới dịch vụ, giới thiệu, logo khách hàng, câu hỏi thường gặp, footer).
- KHÔNG chép chữ, ảnh, logo, mascot, banner, tên thương hiệu hay mã nguồn của Mắt Bão. Mọi chữ do mình viết, hình vẽ bằng CSS/SVG tự làm, logo và logo khách hàng là của MienTay Media (lấy từ repo mientay-web).

## 2. Vì sao

- Trang chủ hiện tại là một hero nền xanh ngọc + một bảng giá: đủ dùng nhưng không giống thương hiệu MienTay Media (xanh #0a6cff) và thiếu các khối tạo lòng tin (cam kết, khách hàng, câu hỏi thường gặp).
- Khách mua tên miền ở Việt Nam đã quen bố cục của các nhà đăng ký lớn; theo bố cục đó giúp họ tìm ô tìm kiếm và giá ngay.

## 3. Kết quả muốn có

1. Trang chủ có đủ 9 khối theo thứ tự ở spec, màu và font của MienTay Media, chạy tốt từ 360px.
2. Giá trên trang lấy từ bảng giá thật (`services/pricing`), không gõ cứng.
3. Không cần JavaScript cho chức năng chính; ô tìm vẫn gửi `/tim-kiem?q=`.
4. Không phá gì: BASE_PATH, CSP, `kiem-dau`, `kiem-base`, `npm test`, `tsc` đều sạch.

## 4. Ngoài phạm vi

- Không làm lại các trang khác (chỉ hưởng màu và font mới qua CSS chung, header và footer dùng chung).
- Không thêm khuyến mãi thật vào CSDL hay mã giảm giá; chữ ưu đãi chỉ nêu giá đang bán.
- Không push, không merge, không đụng VPS.
