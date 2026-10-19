---
type: plan
du_an: footer-v2
buoc: 3 - Build
dau_vao: yêu cầu chủ 19/10/2026 (qua điều phối), chưa có spec.md riêng
nhanh: mtm/footer-v2 (worktree D:\api-pavietnam-trangchu, từ mtm/trang-chu 130dbcd)
cap_nhat: 19/10/2026
---

# Plan: footer v2, bỏ tên P.A khỏi trang khách, Zalo chat

Ký hiệu: `[x]` xong (kèm commit), `[ ]` chưa làm.

Cổng chặn mỗi commit mã: `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run kiem-dau` 0 lỗi, `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0 link thiếu tiền tố.

## Các bước

- [x] V1. Bỏ chữ P.A khỏi chỗ khách thấy (trừ footer, trang biểu mẫu): `src/views/domains/detail.ejs` (ô "Nhà đăng ký"), `src/services/dns.ts` (thông báo lỗi DNS), `src/pavietnam/client.ts` (thông báo thiếu khóa API có thể lộ ra ô tìm). Kiểm: grep, cổng chặn. Xong: 264/264, kiem-dau 0.
- [x] V2. Trang biểu mẫu: `src/lib/bieuMau.ts` (mẫu nhà nước dẫn văn bản gốc datafiles.chinhphu.vn, mst.gov.vn; mẫu riêng của nhà đăng ký đánh dấu `lienHe`, không link), `src/views/bieu-mau-ho-so.ejs`, `public/css/app.css`, `test/bieu-mau.test.ts`. Kiểm: test mới (không link pavietnam.vn hay docs.google.com, mẫu riêng có "Liên hệ MienTay Media để nhận mẫu" kèm hotline, không chữ P.A trong thân trang), cổng chặn. Xong: 264/264, kiem-dau 0, kiem-base 0.
- [x] V3. Footer v2: `src/views/partials/footer.ejs`, `public/css/app.css`, `test/trang-chu.test.ts`, `test/css-tran-ngang.test.ts`. 5 cột (Thương hiệu, Tên miền, Dịch vụ MienTay Media, Chính sách, Hỗ trợ), dải pháp lý dưới, câu đại lý trung tính. Kiểm: test footer (cột dịch vụ đủ link 200 đã curl, câu đại lý mới, không P.A), cổng chặn. Xong: 266/266, kiem-dau 0, kiem-base 0. Xem L1 đến L3.
- [x] V4. Zalo chat: `src/lib/settings.ts`, `src/routes/admin.ts`, `src/lib/csp.ts`, partial mới `src/views/partials/zalo-chat.ejs` gọi từ footer (không ở trang admin), CSS nút dự phòng, test mới `test/zalo-chat.test.ts`, `test/csp.test.ts`. Kiểm: widget có ở trang chủ, tìm kiếm, giỏ hàng, biểu mẫu; không có ở admin; tắt thì không có script; CSP có đúng nguồn Zalo; Chrome headless 0 lỗi CSP. Xong: 272/272, kiem-dau 0, kiem-base 0; Chrome headless (CSP thật, cổng 3117) nạp widget, bấm mở hộp chat, 0 lỗi CSP, 0 lỗi console. Xem L4 đến L6.
- [x] V5. Đo và chụp: sandbox cổng tạm, CSDL tạm, BASE_PATH=/ten-mien; tràn ngang 1366/768/360; ảnh footer 3 khổ, `/bieu-mau-ho-so`, trang chủ 1366/360 có nút Zalo vào `docs/mtm/footer-v2/`. Kiểm: scrollWidth = clientWidth, ảnh có trong thư mục. Xong: 8 trang (`/`, `/bieu-mau-ho-so`, `/bang-gia`, `/gio-hang`, `/tim-kiem`, `/whois`, `/chuyen-ten-mien`, `/dang-nhap`) ở 1366, 768, 360 đều scrollWidth = clientWidth, không lỗi console hay CSP. Ảnh: `footer-1366.png`, `footer-768.png`, `footer-360.png`, `bieu-mau-1366.png`, `bieu-mau-360.png`, `trang-chu-zalo-1366.png`, `trang-chu-zalo-360.png`. Ảnh cả trang biểu mẫu chụp dài nên nút Zalo cố định hiện ở vùng khung nhìn đầu trang, trên máy thật nút nằm góc dưới.
- [x] V6. Grep cuối, liệt kê chỗ còn "P.A"/"pavietnam" và lý do (mục dưới). Thêm: lỗi mất kết nối API trong `src/pavietnam/client.ts` ghi "nhà đăng ký" (có thể hiện ra ô tìm của khách).

## Lệch spec

- L0. Không có `spec.md`; đầu vào là yêu cầu chủ chuyển qua điều phối, đã ghi rõ phạm vi, nhánh, cách kiểm và đòi trả commit. Coi đó là lệnh làm luôn, plan viết để theo dõi tiến độ.

- L1. Cột Chính sách rút gọn nhãn cho vừa một dòng (chủ cho phép); tên đầy đủ theo NĐ 248/2026 để ở thuộc tính `title` và trên trang đích. Cột Hỗ trợ ghi "Quy định tên miền .vn" theo đúng chữ chủ gợi ý.
- L2. Cột Dịch vụ chọn 8 mục theo thứ tự Tài liệu sản phẩm của brain (Mineflow, Zalo, MienTay OS, Google Workspace, Microsoft 365, website, marketing thuê ngoài, nhận diện thương hiệu); "Phòng marketing thuê ngoài" (sản phẩm 09 của brain) thay cho "Digital Marketing", LarkSuite, Pancake, Smax AI không đưa vào để giữ số mục gần bằng cột khác. Nhãn ngắn "Marketing thuê ngoài", "Thiết kế website và app". Mô tả ngắn ở cột thương hiệu dùng khẩu hiệu trong Cấu hình (`site.tagline`), không tự viết câu mới chưa có nguồn.
- L3. Test `tra-cuu-ai` "không có google-" nay chỉ xét phần kết quả trước footer: footer có link dịch vụ `google-workspace` của chính MienTay Media, không phải gợi ý AI lọt từ cấm. Nền footer đổi từ `--brand-navy` (#0a3da8) sang `--ink` (#0b1b3b) theo bảng màu chủ đưa.

- L4. Yêu cầu Zalo đến giữa chừng (điều phối 19/10/2026), làm cùng nhánh, commit riêng. CSP đo thật: chỉ cần `script-src https://sp.zalo.me za.zdn.vn` và `frame-src https://*.zalo.me`; không thêm img-src, connect-src, style-src (ảnh, mạng, CSS của hộp chat nằm trong iframe của Zalo). `za.zdn.vn` là script thống kê do sdk.js tự nạp bằng đường dẫn `//`; chặn thì console báo lỗi CSP nên mở, ghi không kèm giao thức để trên HTTPS chỉ khớp https. CSP chỉ mở cho trang khách có nút (không mở ở `/admin`, không mở khi tắt).
- L5. Nút dự phòng là link `https://zalo.me/<OA>` nổi góc phải dưới, hiện ngay cả khi tắt JS hoặc script bị chặn; khi widget đã vẽ iframe thì ẩn bằng `body:has(.zalo-chat-widget iframe)` (CSS, không cần JS). Trình duyệt cũ không hỗ trợ `:has` sẽ thấy cả hai nút, vẫn bấm được. Footer chừa 76px dưới dòng bản quyền để nút không che chữ.
- L6. OA ID sai định dạng (không phải 6 đến 25 chữ số) coi như tắt, không in link hỏng, không mở CSP. Tests "không tải tài nguyên ngoài" ở trang chủ và biểu mẫu thêm ngoại lệ đúng một script `sp.zalo.me/plugins/sdk.js`.

## Chỗ còn "P.A"/"pavietnam" và lý do

Lệnh: `grep -rniE "p\.a|pavietnam" src/views src/services src/lib src/routes public`, bỏ chú thích và import.

- Tên trong mã: thư mục `src/pavietnam`, import, chú thích ASCII, `'pavietnam'` là mã nhà cung cấp lưu trong CSDL (`domainRepo.ts`, `client.ts`), tên sự kiện log `pavietnam_call_failed`. Không hiện cho khách; giữ để gộp và CSDL cũ vẫn chạy.
- `src/lib/settings.ts`, `src/db/seed.ts`: nameserver mặc định `ns1.pavietnam.vn,ns2.pavietnam.vn`. Là tên máy chủ DNS thật, khách thấy ở ô gợi ý nameserver trong Control Panel; đổi chữ là hỏng DNS. Chủ muốn giấu thì cần nameserver mang tên riêng (việc kỹ thuật với nhà đăng ký, ngoài phạm vi).
- Dữ liệu WHOIS thô và bản ghi DNS (trang `/whois`, chi tiết tên miền): trường Registrar, nameserver là dữ liệu tra cứu, giữ nguyên theo yêu cầu.
- Trang quản trị nội bộ: `src/routes/admin.ts` (nhóm cấu hình API P.A, endpoint `daily.pavietnam.vn`, tên miền thử `pavietnam.vn`, nhắc whitelist IP, nhãn "Số lệnh kiểm tra P.A"), `src/views/admin/*`. Chủ cho phép giữ.
- `src/pavietnam/client.ts` dữ liệu giả lập sandbox (WHOIS, MX `mail.pavietnam.vn`) và `probe.ts` (công cụ dòng lệnh): không chạy trên máy thật cho khách.
- Lỗi thô nhà đăng ký trả về (`ReturnText`) vẫn được chuyển nguyên cho người dùng như trước; nếu nhà đăng ký tự ghi tên mình trong câu lỗi thì sẽ hiện. Chưa thấy trường hợp nào, không lọc để khỏi che lỗi thật.
- `package.json` mô tả dự án: không hiện trên web.
