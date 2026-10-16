---
type: nguon-cau-chu
du_an: trang-chu
cap_nhat: 16/10/2026
nguon_su_that:
  - D:\javis\brains\Brain Default (brain MienTay Media, chỉ đọc)
  - D:\mientay-web\web\src\lib\seo-content\ (câu đang đăng trên mientaymedia.com, chỉ đọc)
---

# Nguồn câu chữ trang chủ và footer

Mỗi dòng: câu (hoặc giá trị) trên web, rồi nguồn dạng `tệp:dòng`. Viết tắt:

- `brain/` = `D:\javis\brains\Brain Default\`
- `sp/` = `brain/Tài liệu sản phẩm/`
- `site/` = `D:\mientay-web\web\src\lib\seo-content\`

Thương hiệu hiển thị là "MienTay Media" (chủ đã chốt), dù site ghi "Miền Tây Media".

## 1. Footer và cấu hình mặc định

| Trên web | Nguồn |
|---|---|
| Hotline: 0976.788.840 (`site.hotline` mặc định, seed) | `sp/01-mineflow.md:49`, `sp/04-google-workspace.md:45`, `sp/05-microsoft-365.md:35` ("Hotline: 0976788840 (0976.788.840, Em Đinh)"); `site/gioi-thieu.ts:25` ("hotline 0976.788.840") |
| hello@mientaymedia.com (`site.support_email` mặc định, seed) | `sp/01-mineflow.md:49`, `sp/07-javis-os.md:46` ("Email: hello@mientaymedia.com") |
| mientaymedia.com (link cột "Liên hệ", có sẵn) | `sp/00-huong-dan-dien.md:9` ("website công khai mientaymedia.com"), `sp/04-google-workspace.md:5` |
| `MAIL_FROM` giữ `no-reply@...` | không đổi theo yêu cầu; footer vẫn ẩn mọi địa chỉ no-reply |

## Cần chủ xác minh

Các câu dưới đây KHÔNG đưa lên web vì brain không có hoặc brain và site lệch nhau.

1. **Tên pháp lý và mã số thuế trong footer.** Site ghi "Công ty TNHH Phần mềm Mientay Media" (`site/gioi-thieu.ts:13`, `:29`) và MST 1602182849 do Sở Kế hoạch và Đầu tư tỉnh An Giang cấp 13/06/2024 (`site/lien-he.ts:28`, `site/gioi-thieu.ts:33`); tên trên tài khoản ngân hàng là "CONG TY TNHH PHAN MEM MIENTAY MEDIA". Brain không có tên pháp lý hay MST (tìm trong `Tài liệu sản phẩm/`, `FAQ/`, `wiki/`), nên chưa nhất quán giữa brain và site: chưa đưa vào footer. Chủ xác nhận rồi ghi vào brain thì thêm được.
2. **Giờ làm việc.** Brain ghi "T2–T6, 8:00–17:30" (`sp/01-mineflow.md:49` và các tệp 02 đến 16), site ghi "thứ 2 đến thứ 7, 8:00 đến 17:30" (`site/lien-he.ts:19`, `:26`, `:39`). Lệch thứ 7: không in giờ làm việc lên web.
3. **Địa chỉ trụ sở trong footer.** Site có địa chỉ đầy đủ "12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang" (`site/gioi-thieu.ts:33`), brain không có. Không seed `site.address`; quản trị điền trong Cấu hình nếu chủ đồng ý.
