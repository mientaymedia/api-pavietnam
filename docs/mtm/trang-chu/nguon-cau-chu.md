---
type: nguon-cau-chu
du_an: trang-chu
cap_nhat: 16/10/2026 (thêm mục Chủ đã chốt)
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
| Giờ làm việc: Thứ 2 đến thứ 7, 8:00 đến 17:30 (`site.working_hours`, setting mới, sửa được trong Cấu hình) | chủ chốt 16/10/2026; khớp `site/lien-he.ts:19`, `:26` |
| Dòng pháp lý cuối footer: "Công ty TNHH Phần mềm Mientay Media. MST 1602182849, do Sở KH&ĐT tỉnh An Giang cấp ngày 13/06/2024. Trụ sở: 12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang." (`site.legal_name`, `site.tax_code`, `site.tax_issued`, `site.address`) | chủ chốt 16/10/2026; tên: `site/gioi-thieu.ts:13`, `:29`; MST và nơi cấp: `site/lien-he.ts:28`, `D:\mientay-web\web\src\lib\site-data.ts:57`; trụ sở: `site/gioi-thieu.ts:33`, `site-data.ts:33` |

## 2. Khối "Về MienTay Media" và 3 lý do chọn (`src/views/home.ejs`, khối 6)

| Câu trên web | Nguồn |
|---|---|
| (tiêu đề) "Công ty phần mềm và giải pháp chuyển đổi số tại An Giang" | `site/lien-he.ts:17` ("công ty phần mềm và giải pháp chuyển đổi số tại An Giang"); trụ sở An Giang: `site/lien-he.ts:47` |
| "MienTay Media tự phát triển Mineflow, nền tảng dữ liệu khách hàng và tự động hóa marketing." | `sp/01-mineflow.md:15` ("Nền tảng dữ liệu khách hàng (CDP) và tự động hóa marketing do MienTay Media tự phát triển") |
| "Chúng tôi triển khai giải pháp Zalo, Google Workspace, Microsoft 365 và thiết kế website cho doanh nghiệp." | Zalo: `sp/02-zalo-business-solutions.md:15`; Google Workspace: `sp/04-google-workspace.md:15`; Microsoft 365: `sp/05-microsoft-365.md:15`; website: `sp/10-thiet-ke-website-app.md:15` |
| "Hơn 500 doanh nghiệp trên toàn quốc đang dùng giải pháp do MienTay Media triển khai." | `site/lien-he.ts:27` ("500+", "Doanh nghiệp trên toàn quốc đang dùng giải pháp do Miền Tây Media triển khai"), `site/lien-he.ts:51`. Brain không có số này: xem mục cần xác minh, ý 8 |
| "Đăng ký tên miền tại đây, bạn có thể nhờ MienTay Media cấu hình DNS để trỏ tên miền về hosting, Google Workspace hoặc landing page." | `site/ten-mien.ts:12` ("tư vấn chọn đuôi phù hợp và cấu hình DNS cho bạn"), `site/ten-mien.ts:36` ("trỏ tên miền về hosting, Google Workspace hoặc landing page"); `sp/04-google-workspace.md:16` ("miễn phí cấu hình tên miền") |
| Lý do 1: "Bạn giữ toàn quyền tên miền" / "MienTay Media bàn giao đầy đủ quyền quản trị tên miền cho doanh nghiệp." | `site/ten-mien.ts:12` ("Chúng tôi bàn giao đầy đủ quyền quản trị tên miền cho doanh nghiệp."), `site/ten-mien.ts:36` ("Bạn vẫn giữ toàn quyền quản trị tên miền") |
| Lý do 2: "Đủ dịch vụ sau tên miền" / "Ngoài tên miền, MienTay Media triển khai email theo tên miền với Google Workspace, Microsoft 365, thiết kế website và giải pháp Zalo." | email theo tên miền: `sp/04-google-workspace.md:15` ("Gmail theo tên miền"), `sp/05-microsoft-365.md:15` ("email theo tên miền (Exchange)"); website: `sp/10-thiet-ke-website-app.md:15`; Zalo: `sp/02-zalo-business-solutions.md:15` |
| Lý do 3: "Hỗ trợ tiếng Việt từ người thật" | "hỗ trợ kỹ thuật tiếng Việt": `sp/04-google-workspace.md:15`, `sp/13-google-cloud.md:17`; "người thật": `sp/01-mineflow.md:48` (mục "Liên hệ khi cần người thật") |
| "Bạn có thể gọi hotline 0976.788.840, nhắn Zalo OA hoặc gửi email hello@mientaymedia.com." (hotline, email đọc từ Cấu hình, mặc định như mục 1) | `sp/01-mineflow.md:49` ("Hotline ... Email: hello@mientaymedia.com · Zalo OA của MienTay Media") |
| "Mọi yêu cầu được phản hồi trong 24 giờ làm việc." | `site/lien-he.ts:25` ("được phản hồi trong 24 giờ làm việc"); `sp/11-thiet-ke-ladipage.md:17` ("báo giá trong 24 giờ làm việc") |

Bỏ khỏi web vì brain và site không có: tiêu đề cũ "Tên miền là bước đầu, MienTay Media đồng hành cả chặng đường", đoạn cũ "xây dựng giải pháp số ... công cụ bán hàng và chăm sóc khách hàng", hai lý do cũ "Giá minh bạch" và "Tự động từ đầu đến cuối" (đúng với hệ thống này nhưng là câu tự viết, không có trong brain; các ý đó vẫn có ở 4 thẻ cam kết của khối hero, ngoài phạm vi đợt này).

## 3. Lưới "Dịch vụ nổi bật": 3 thẻ dịch vụ khác (`src/views/home.ejs`, khối 5)

Các thẻ tên miền, Chuyển tên miền về, WHOIS, Quản lý DNS giữ nguyên (giá lấy từ bảng giá trong CSDL).

| Câu hoặc giá trên web | Nguồn |
|---|---|
| (lời dẫn khối) "Dịch vụ khác ghi rõ đã hay chưa gồm VAT trên từng thẻ." | câu mô tả cách trình bày của chính trang, không nêu sự thật về công ty |
| Google Workspace: "Gmail theo tên miền, Drive, Meet, Lịch, Docs và Gemini AI. MienTay Media triển khai trọn gói, hỗ trợ kỹ thuật tiếng Việt." | `sp/04-google-workspace.md:15` |
| Google Workspace: "Chỉ từ 7 $/người/tháng" | `Rate card MienTay Media.md:62` ("Starter 7 $"), `sp/04-google-workspace.md:25` |
| Google Workspace: "Giá hãng gói Starter tính bằng USD, quy đổi theo tỷ giá Vietcombank ngày báo giá, chưa gồm thuế nhà thầu 10% và VAT 10%. Nhân viên xác nhận giá khi chốt." (sửa sau QA vòng 3, lỗi thấp 3) | `Rate card MienTay Media.md:60` ("giá hãng USD quy đổi, chưa gồm VAT 10%"), `:61` (công thức "giá hãng USD x tỷ giá Vietcombank (bán ra) ngày báo giá x 1,10 (thuế nhà thầu 10%)", "VAT 10% cộng khi xuất hóa đơn": so với 7 $ thì giá khách trả chưa gồm cả hai khoản), `:90` (quy tắc: "nói rõ quy đổi theo tỷ giá Vietcombank ngày báo giá"); `sp/04-google-workspace.md:19`, `:21` (luôn nói "giá quy đổi theo tỷ giá Vietcombank ngày báo giá, chưa gồm VAT 10%, nhân viên xác nhận khi chốt", không hứa mức VNĐ cố định). Ưu đãi hãng 3,50 $ năm đầu (`Rate card:62`) chưa đưa lên, chờ chủ |
| Google Workspace: link `https://mientaymedia.com/google-workspace` | `sp/04-google-workspace.md:5` |
| Microsoft 365: "Email theo tên miền, bộ Office, Teams và 1 TB OneDrive. Tenant đứng tên doanh nghiệp, hóa đơn VAT đầy đủ." | `sp/05-microsoft-365.md:15` |
| Microsoft 365: "Chỉ từ 149.000 đ/người/tháng" / "Gói Business Basic, thanh toán theo năm, chưa gồm VAT" | `Rate card MienTay Media.md:48` (người dùng/tháng, thanh toán theo năm, chưa gồm VAT), `:51` (Business Basic 149.000đ); `sp/05-microsoft-365.md:17`, `:20` |
| Microsoft 365: link `https://mientaymedia.com/microsoft-365` | `sp/05-microsoft-365.md:5` |
| Mineflow: "Nền tảng dữ liệu khách hàng và tự động hóa marketing do MienTay Media tự phát triển: gom khách từ Zalo OA, Pancake POS, form, Excel về một hồ sơ." | `sp/01-mineflow.md:15` |
| Mineflow: "Có gói Miễn phí" / "Gói Pro 99.000 đ/tháng, đã gồm VAT" | `Rate card MienTay Media.md:16` (giá đã gồm VAT), `:19` (Free 0đ), `:20` (Pro 99.000đ); `sp/01-mineflow.md:31`, `:32` |
| Mineflow: link `https://mientaymedia.com/mineflow-cdp` | `sp/01-mineflow.md:5` |

Tiền viết theo kiểu của web này ("149.000 đ", có dấu cách), brain viết "149.000đ".

## 4. Câu hỏi thường gặp (`src/views/home.ejs`, khối 8)

Đối chiếu `brain/FAQ/` (8 tệp, đều về API key AI và Google Workspace, không câu nào về tên miền) và `site/ten-mien.ts:21` đến `:37` (4 câu hỏi tên miền đang đăng). Không câu nào mâu thuẫn, giữ nguyên 5 câu:

| Câu hỏi trên web | Đối chiếu |
|---|---|
| "Nên chọn đuôi .vn hay .com?" | khớp `site/ten-mien.ts:24` ("Nhiều doanh nghiệp đăng ký cả hai để giữ thương hiệu"); web không nêu giá cố định (giá site lệch bảng giá, xem ý 6) |
| "Đăng ký tên miền .vn cần thông tin gì?" | khớp `site/ten-mien.ts:28` (khai báo thông tin cá nhân hoặc doanh nghiệp, hồ sơ chủ thể tại Việt Nam) |
| "Bao lâu thì tên miền dùng được?" | brain và site không nói; câu mô tả cách hệ thống này chạy (tự gửi lệnh đăng ký khi thanh toán được xác nhận) |
| "Quên gia hạn thì sao?" | khớp `site/ten-mien.ts:32` ("nhắc hạn trước khi tên miền hết hạn") |
| "Chuyển tên miền từ nơi khác về cần gì?" | brain và site không nói; câu mô tả quy trình chuyển của hệ thống này |

## Chủ đã chốt (16/10/2026)

1. **Footer in đủ thông tin pháp lý** (giải quyết ý 1, 2, 3 bên dưới). Giá trị mặc định trong `src/lib/settings.ts` và seed, footer đọc từ Cấu hình, quản trị sửa được:
   - Tên pháp lý `site.legal_name`: "Công ty TNHH Phần mềm Mientay Media", đúng như chủ ghi và như `site/gioi-thieu.ts:13`, `:29`. Lưu ý: chính site viết hoa không thống nhất, các trang pháp lý ghi "Công ty TNHH Phần Mềm Mientay Media" (`D:\mientay-web\web\src\app\dieu-khoan-dich-vu\page.tsx:25`, `:640`, `chinh-sach-bao-mat\page.tsx:30`, `dieu-khoan-su-dung\page.tsx:110`), còn `site-data.ts:34` và `app\gioi-thieu\page.tsx:281` ghi chữ in hoa toàn bộ. Web này theo cách chủ ghi; sửa trong Cấu hình nếu chủ muốn kiểu khác.
   - Mã số thuế `site.tax_code`: 1602182849; nơi cấp `site.tax_issued`: "Sở KH&ĐT tỉnh An Giang cấp ngày 13/06/2024" (cách viết của `site-data.ts:57` và `components\policy\Prose.tsx:28`).
   - Trụ sở `site.address`: "12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang" (`site/gioi-thieu.ts:33`, `site-data.ts:33`, giống nhau ở mọi trang pháp lý của site).
   - Hotline 0976.788.840, email hello@mientaymedia.com: giữ như mục 1.
   - Giờ làm việc `site.working_hours` (setting mới): "Thứ 2 đến thứ 7, 8:00 đến 17:30", theo site; brain ghi T2 đến T6 nên brain cần sửa cho khớp.
   - Thương hiệu hiển thị vẫn là "MienTay Media" (`site.name`); tên pháp lý chỉ ở dòng pháp lý cuối footer.
2. **Giữ nguyên bảng giá web bán tên miền** (.com 319.000 đ, .vn 830.000 đ). Không sửa mientay-web trong việc này. Việc riêng của chủ: **mientaymedia.com cần sửa giá tên miền cho khớp web bán tên miền** (`site/ten-mien.ts:24` đang ghi .com 280.000đ, .vn 650.000đ). Giải quyết ý 6.
3. **Địa chỉ cổng tên miền là `https://mientaymedia.com/ten-mien`.** `domain.mientaymedia.com` (site đang giới thiệu, `site/ten-mien.ts:10`, `:12`) phải chuyển hướng 301 về đó; ghi trong `plan.md` cho bước Deploy. Giải quyết ý 7.

## Cần chủ xác minh

Các ý dưới đây chưa đưa lên web vì brain không có hoặc brain và site lệch nhau, trừ khi ghi rõ "đang có trên web".

1. **(Đã chốt 16/10/2026, xem mục Chủ đã chốt.) Tên pháp lý và mã số thuế trong footer.** Site ghi "Công ty TNHH Phần mềm Mientay Media" (`site/gioi-thieu.ts:13`, `:29`) và MST 1602182849 do Sở Kế hoạch và Đầu tư tỉnh An Giang cấp 13/06/2024 (`site/lien-he.ts:28`, `site/gioi-thieu.ts:33`); tên trên tài khoản ngân hàng là "CONG TY TNHH PHAN MEM MIENTAY MEDIA". Brain không có tên pháp lý hay MST (tìm trong `Tài liệu sản phẩm/`, `FAQ/`, `wiki/`), nên chưa nhất quán giữa brain và site: chưa đưa vào footer. Chủ xác nhận rồi ghi vào brain thì thêm được.
2. **(Đã chốt: theo site, thứ 2 đến thứ 7.) Giờ làm việc.** Brain ghi "T2-T6, 8:00-17:30" (brain viết bằng dấu gạch dài, chép lại bằng gạch nối) (`sp/01-mineflow.md:49` và các tệp 02 đến 16), site ghi "thứ 2 đến thứ 7, 8:00 đến 17:30" (`site/lien-he.ts:19`, `:26`, `:39`). Lệch thứ 7: không in giờ làm việc lên web.
3. **(Đã chốt: in địa chỉ đầy đủ.) Địa chỉ trụ sở trong footer.** Site có địa chỉ đầy đủ "12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang" (`site/gioi-thieu.ts:33`), brain không có. Không seed `site.address`; quản trị điền trong Cấu hình nếu chủ đồng ý.
4. **Rate card và tài liệu sản phẩm còn là nháp** (đang có trên web: giá 3 thẻ dịch vụ khác). `Rate card MienTay Media.md:5` ghi "nhap - cho nguoi phu trach duyet", `sp/00-huong-dan-dien.md:9` ghi các tệp 01 đến 05, 09 đến 16 "đang ở trạng thái nháp chờ người phụ trách xác nhận". Chủ duyệt giá Google Workspace 7 $, Microsoft 365 149.000 đ, Mineflow Free và Pro 99.000 đ trước khi mở bán.
5. **Cách ghi giá Google Workspace** (đang có trên web). Giá khách trả thật = giá hãng USD x tỷ giá Vietcombank x 1,10 (thuế nhà thầu) rồi cộng VAT 10% (`Rate card MienTay Media.md:61`), và có ưu đãi hãng 3,50 $ năm đầu cho khách mới tối đa 20 người (`:62`). Sau QA vòng 3 (lỗi thấp 3), thẻ ghi "Chỉ từ 7 $/người/tháng" kèm "Giá hãng gói Starter tính bằng USD, quy đổi theo tỷ giá Vietcombank ngày báo giá, chưa gồm thuế nhà thầu 10% và VAT 10%. Nhân viên xác nhận giá khi chốt." theo `sp/04-google-workspace.md:21`; ưu đãi 3,50 $ chưa đưa lên. Chủ chọn có nêu ưu đãi hay không và duyệt câu cuối cùng.
6. **(Đã chốt: giữ bảng giá web này, sửa site sau.) Giá tên miền trên site lệch bảng giá của web này.** `site/ten-mien.ts:24` ghi .com 280.000đ/năm, .vn 650.000đ/năm; bảng giá mẫu khi seed (`src/db/seed.ts`) là .vn 830.000 đ, .com 319.000 đ. Giá trên web này luôn lấy từ bảng giá trong CSDL; chủ thống nhất giá thật rồi sửa một trong hai nơi.
7. **(Đã chốt: mientaymedia.com/ten-mien, domain. chuyển hướng 301.) Địa chỉ cổng tên miền.** `site/ten-mien.ts:10`, `:12` giới thiệu cổng là `domain.mientaymedia.com`, còn web này chạy ở `mientaymedia.com/ten-mien` (`.env.example`). Chủ chọn một địa chỉ và sửa site cho khớp.
8. **"Hơn 500 doanh nghiệp"** (đang có trên web). Chỉ có trên site (`site/lien-he.ts:27`, `site/gioi-thieu.ts:13`), brain không có. Đưa lên vì site là nguồn hợp lệ theo chỉ dẫn; chủ xác nhận và ghi vào brain.
9. **Năm khởi đầu 2022** (`site/gioi-thieu.ts:11`, `:13`, `:32`): brain không có, chưa đưa lên web.
10. **"Hỗ trợ kỹ thuật tiếng Việt 24/7"** (`sp/05-microsoft-365.md:15`): lệch với giờ làm việc 8:00 đến 17:30 ở ý 2, chưa đưa lên web (lý do 3 chỉ ghi "hỗ trợ tiếng Việt").
11. **"Đã triển khai hơn 1.000 website"** (`sp/10-thiet-ke-website-app.md:16`): brain chỉ chép lại là "Website ghi", tài liệu còn chờ người phụ trách xác nhận; chưa đưa lên web.
12. **Logo "Khách hàng tin dùng"**: 12 logo có từ đợt trước (lấy từ repo mientay-web), brain không có danh sách khách hàng được phép nêu tên. Không đổi trong đợt này; chủ xác nhận các khách hàng đồng ý hiển thị logo.
