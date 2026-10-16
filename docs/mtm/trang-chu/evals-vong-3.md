---
type: evals
du_an: trang-chu (kèm api-pavietnam)
buoc: 4 - Test (QA độc lập, vòng 3)
dau_vao: plan.md (U1 đến U7, V1 đến V3, lệch L8 đến L16), nguon-cau-chu.md, evals.md (vòng trang chủ), ../api-pavietnam/evals-vong-2.md
nhanh: mtm/trang-chu @ 6bfc19d
cap_nhat: 16/10/2026
ket_luan: SẴN SÀNG DEPLOY. Không lỗi chặn; 3 lỗi thấp và 2 ghi chú, không cần sửa trước khi deploy
---

# Đánh giá độc lập vòng 3: U1 đến U7, V1 đến V3

QA tự chạy app sandbox P.A (`PAVIETNAM_SANDBOX=1`), mỗi chế độ một CSDL tạm mới seed: cổng 3131 (gốc) và 3132 (`BASE_PATH=/ten-mien`), hộp thư SMTP giả cục bộ. Trình duyệt: Chrome 155 headless qua DevTools Protocol, profile tạm trong scratchpad. Không gọi P.A thật, không đụng VPS, không push, không sửa mã sản phẩm. Đã tắt máy chủ và Chrome khi xong. Script và nhật ký nằm trong scratchpad `qa3/`, không commit.

## 1. Cổng chặn (QA tự chạy)

| Lệnh | Kết quả |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | 0 lỗi |
| `npm test` | 219/219 trên 6bfc19d; 220/220 sau khi thêm test thoát HTML của QA (mục 4) |
| `npm run kiem-dau` | 0 chuỗi thiếu dấu, 0 lỗi mã hóa |
| `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` | 58 + 40 + 41 trang dưới `/ten-mien`, 0 link thiếu tiền tố |
| Em dash, en dash, NFD trong `src public/css test scripts docs/mtm/trang-chu` | 0 |

## 2. Bảng tiêu chí

| # | Mục | Cách kiểm | Kết quả | Bằng chứng |
|---|---|---|---|---|
| U1a | `interpret`: 38 ca của vòng 2 | chạy lại `qa2/pa-probe.mts` (P.A giả cục bộ, đi qua `call()` thật) | ĐẠT | 38/38 ĐẠT, TỔNG LỖI 0 (chữ thuần, HTML, JSON, NFD, "Thành công" mọi dạng, `registerDomain` ném lỗi, `checkDomain` có dấu, `isPermanent`) |
| U1b | `interpret`: status thật, giả, phủ định | `qa3/interp3.mts`, 56 status | ĐẠT (kèm lỗi thấp 1) | 20 status thật (available, Registered, `  AVAILABLE `, Domain expired, Thành công dạng NFD...) đều `ok=true`; 25 câu phủ định/lỗi (`error: domain not registered`, `Lỗi: tên miền chưa active`, `not active`, `non-active`, `không active`, `chưa registered`, `Thất bại: registered`, `That bai active`, `sai: active`, `not-registered`, `registered=no`...) đều `ok=false`; 7 token gần (`inactive`, `unregistered`, `deactivated`, `notregistered`, `domain_not_registered`, `activex`, `preregistered`) đều `ok=false`. Lệch 2/56: `registered: false`, `active=0` vẫn `ok=true` (lỗi thấp 1) |
| U2 | Giới hạn đăng nhập theo email chuẩn hóa | `qa3/u2.mjs`: 18 lần sai mật khẩu, mỗi lần đổi hoa thường và thêm khoảng trắng, tab, xuống dòng quanh cùng một email; rồi một email khác cùng IP | ĐẠT | cả hai chế độ: `401` x15 rồi `429` từ lần 16; email khác cùng IP vẫn `401` (không bị khóa lây). Test repo `test/dang-nhap-gioi-han.test.ts` xanh |
| U2 hồi quy | `next=` và hai lớp sau U2 | `qa3/e2e.mjs` (bản vòng 2, đổi phần thử `next=` sang xoay 4 tài khoản riêng `or0` đến `or3@qa.test`, mỗi tài khoản 11 đến 12 lần) | ĐẠT | 40 biến thể `next=` + 4 body `next[]`/trùng lặp: 44/44 ĐẠT mỗi chế độ, không lần nào 429; hai lớp với `next=/a/..//evil.com` an toàn; `next=/gio-hang`, `/control-panel`, `/admin/cau-hinh` về đúng trang có tiền tố |
| Hồi quy Referer | `quayLai` giỏ hàng | `qa3/referer2.mjs`, giãn cách 3,2 giây | ĐẠT | gốc 23/23, base 26/26, TỔNG LỖI 0 (19 Referer độc + 4 đến 7 hợp lệ) |
| U3, U4 | Không tràn ngang | Chrome 360x780 DPR 2 `mobile` và 1366x900; so `scrollWidth`/`clientWidth`, liệt kê phần tử vượt khung ngoài vùng cuộn; ép tải ảnh lazy | ĐẠT | 39 trang mỗi chế độ x 2 khổ = 156 lượt đo, 0 tràn: 12 trang vãng lai, 13 trang khách (gồm `/don-hang/<mã>` đã hoàn tất, `/don-hang/<mã>` CHỜ THANH TOÁN CÓ QR, `/thanh-toan`, `/control-panel/<tên miền>`, phiếu `/hoa-don`), 14 trang quản trị (gồm `/admin/bao-cao`, `/admin`, `/admin/don-hang/<id>`, `/admin/ma-giam-gia`, `/admin/doi-chu-the`, `/admin/hang-doi`, `/admin/zns`). `/don-hang/<mã>` và `/admin/bao-cao` 360/360 ở cả hai chế độ (vòng trước 537 và 366); ảnh QR SePay 540x540 tải được, bảng "Chi tiết" cuộn trong khung |
| U5 | Hotline, email mặc định | đọc HTML trang chủ CSDL mới | ĐẠT | footer: `tel:0976788840` "Hotline: 0976.788.840", `mailto:hello@mientaymedia.com`, link mientaymedia.com; khớp `sp/01-mineflow.md:49` |
| U6 | Câu chữ trang chủ theo nguồn | trích văn bản khối 5 (3 thẻ mới), khối 6, FAQ, footer từ HTML thật; mở từng `tệp:dòng` trong `nguon-cau-chu.md` (chỉ đọc brain và mientay-web) | ĐẠT (kèm lỗi thấp 3) | mọi câu mới đều có nguồn và đúng nghĩa: tiêu đề khối 6 = `site/lien-he.ts:17`; Mineflow = `sp/01-mineflow.md:15`; Zalo, GW, M365, website = `sp/02:15`, `sp/04:15`, `sp/05:15`, `sp/10:15`; "Hơn 500 doanh nghiệp..." = `site/lien-he.ts:27`; cấu hình DNS = `site/ten-mien.ts:12`, `:36`; lý do 1 = `site/ten-mien.ts:12`; lý do 3 và câu 24 giờ = `sp/01:49`, `site/lien-he.ts:25`; thẻ M365 149.000 đ, chưa VAT = `Rate card:48`, `:51`; Mineflow Free, Pro 99.000 đ đã gồm VAT = `Rate card:16`, `:19`, `:20`; GW 7 $ Starter = `Rate card:62`, `sp/04:25`. Không thấy câu nào trên trang không có nguồn; 3 câu cũ đã bỏ đúng như ghi |
| U7, V3 | Ảnh chụp | kích thước tệp trong thư mục | ĐẠT (kèm ghi chú 1) | `trang-chu-desktop.png` 1366x4261, `trang-chu-dien-thoai.png` 720x16734 (360 DPR 2), `don-hang-dien-thoai.png` 720x4992 |
| V1 | Ghi quyết định chủ | đọc `nguon-cau-chu.md` mục "Chủ đã chốt", `plan.md` "Ghi cho bước Deploy" | ĐẠT | đủ 3 ý (pháp lý, giữ bảng giá, 301 từ `domain.mientaymedia.com`), có lệnh kiểm sau Deploy |
| V2a | Footer pháp lý hiện đúng một lần | Chrome: đếm `.footer-legal`, đếm "Công ty TNHH Phần mềm Mientay Media" và "1602182849" trong `innerText` mọi trang | ĐẠT | 152/152 lượt trang có header/footer: 1 dòng pháp lý, tên pháp lý 1 lần, MST 1 lần; phiếu `/hoa-don` (trang in, không footer) 0. Nội dung: "Công ty TNHH Phần mềm Mientay Media. MST 1602182849, do Sở KH&ĐT tỉnh An Giang cấp ngày 13/06/2024. Trụ sở: 12A5 Lê Thị Hồng Gấm, Khóm Bình Khánh 2, Phường Bình Đức, An Giang."; "Giờ làm việc: Thứ 2 đến thứ 7, 8:00 đến 17:30"; khớp `site/gioi-thieu.ts:13`, `:33`, `site-data.ts:33`, `:57`, `site/lien-he.ts:19` |
| V2b | Sửa trong Cấu hình thì footer đổi | `qa3/v-cauhinh.mjs`: quản trị (đã 2FA) gửi lại toàn bộ form Cấu hình, chỉ đổi 5 ô mới | ĐẠT | đủ 5 ô (giá trị mặc định đúng); giá trị thường "Công ty Thử Nghiệm QA", "9999999999", "Thứ 2 đến chủ nhật..." hiện ngay ở `/` và `/bang-gia`, không cần khởi động lại; để trống thì về mặc định (đúng L15); trả lại xong, không ô nào khác bị đổi |
| V2c | Thoát HTML | nhập `<script>`, `"><img onerror>`, `<b>`, `<i>`, `</p><svg onload>`, `<a href=javascript:>`, `'`, `"`, `&` vào 5 ô | ĐẠT | HTML trang chủ, footer và trang Cấu hình không chứa thẻ thô nào; footer in `&lt;script&gt;...`, `&#34;`, `&#39;`, `KH&amp;ĐT`; Chrome: 0 hộp thoại alert, 0 vi phạm CSP, 0 phần tử chèn được trong footer, vẫn 1 dòng pháp lý. QA thêm test cố định (mục 4) |
| CSP, console | Mọi trang | Chrome: `securitypolicyviolation`, `Runtime`, `Log`, `Network` | ĐẠT | 0 vi phạm CSP, 0 exception, 0 lỗi console trên 156 lượt tải; chỉ ngoại lệ đúng thiết kế: trang 404 có dòng "Failed to load resource: 404" (4 dòng LỖI tự động); request ra ngoài duy nhất là ảnh QR `qr.sepay.vn` ở trang đơn chờ thanh toán (CSP cho phép sẵn) |
| E2E | Luồng chính hai chế độ | `qa3/e2e.mjs` | ĐẠT | gốc 154 dòng, base 161 dòng; dòng LỖI còn lại giống hệt vòng 2 và không phải lỗi sản phẩm: 5 (gốc) / 7 (base) `quayLai` bị 429 do script gửi hơn 20 lần/phút vào `/gio-hang/them` (đã kiểm riêng bằng `referer2.mjs`, 0 lỗi), 1 "Bản ghi DNS mới hiện trên trang" (sandbox không lưu bản ghi, flash vẫn báo đã thêm) |

## 3. Lỗi và ghi chú

Không lỗi chặn deploy.

1. **[Thấp] `interpret` coi `registered: false`, `active=0` là thành công; `not available` là thất bại.** Từ phủ định chỉ gồm `not|no|non|khong|chua|error|loi|fail|invalid|denied|that bai|sai`, không có `false`, `0`. Tái hiện: `interpret({ status: 'registered: false' }, '').ok` trả `true`. Ngược lại, nếu P.A trả status "Domain not available" cho tên miền đã có chủ thì `ok=false`: `checkDomain` không bị ảnh hưởng (đọc còn trống riêng), nhưng nút "Kiểm tra API" ở Cấu hình (`admin.ts:254`) sẽ báo "THẤT BẠI" dù kết nối tốt. Cả hai chỉ xảy ra nếu P.A thật trả status dạng đó; xác minh bằng `pa:probe` trên VPS (đã có trong việc của chủ, L11).
2. **[Rất thấp] Giờ làm việc trong footer tràn ngang khi nhập chuỗi liền rất dài.** `.footer-text` không có `overflow-wrap` như `.footer-legal`. Tái hiện: đặt `site.working_hours` là một từ liền khoảng 60 ký tự, mở `/` ở 360px: `scrollWidth` 516. Với giá trị thật hay có dấu cách thì 360/360. Nên thêm `overflow-wrap: anywhere` cho `.footer-text` khi tiện sửa.
3. **[Thấp, câu chữ] Thẻ Google Workspace ghi gọn hơn quy tắc brain.** `sp/04-google-workspace.md:21` dặn "luôn nói ... chưa gồm VAT 10%, nhân viên xác nhận khi chốt"; thẻ ghi "quy đổi theo tỷ giá Vietcombank ngày báo giá, chưa gồm VAT" (bỏ "10%" và "nhân viên xác nhận khi chốt"); `Rate card:90` chỉ đòi phần quy đổi nên không sai nguồn. "Chỉ từ 7 $" trong khi hãng có ưu đãi 3,50 $ năm đầu. Đã nằm trong "Cần chủ xác minh" ý 5; chủ chọn câu cuối.

Ghi chú:

1. `don-hang-dien-thoai.png` chụp ở U7, trước V2, nên footer trong ảnh chưa có dòng pháp lý và giờ làm việc. Chỉ là ảnh tài liệu.
2. Phiếu thanh toán `/don-hang/<mã>/hoa-don` có địa chỉ (L14) nhưng không có tên pháp lý, MST. Có từ trước, ngoài phạm vi; chủ cân nhắc nếu phiếu cần đủ thông tin người bán.

## 4. Test QA thêm vào nhánh

- `test/trang-chu.test.ts`, test "QA vong 3: 5 o phap ly va gio lam viec thoat ky tu HTML khi in ra footer": đặt ký tự HTML độc vào 5 setting, khẳng định trang không có thẻ thô, dòng pháp lý và giờ làm việc in đúng chuỗi đã thoát, đúng một dòng pháp lý; trả setting về rỗng (mặc định) trong `finally`. Đạt; tổng 220/220.

## 5. Việc cần chủ làm

1. Trên VPS đã whitelist, chạy `pa:probe` để xem P.A trả status gì cho tên miền đã có chủ, đang hoạt động, hết hạn (lỗi thấp 1, L11): nếu là `inactive`, `not available` hay dạng `x: false` thì báo lại để chỉnh `interpret`.
2. Chốt câu chữ thẻ Google Workspace (lỗi thấp 3) và duyệt giá 3 thẻ dịch vụ khác vì Rate card còn là nháp (`nguon-cau-chu.md`, cần xác minh ý 4, 5); xác nhận "Hơn 500 doanh nghiệp" và ghi vào brain (ý 8); sửa giờ làm việc trong brain thành thứ 2 đến thứ 7 cho khớp site.
3. Sau Deploy: kiểm 301 `domain.mientaymedia.com` về `https://mientaymedia.com/ten-mien` theo `plan.md`; xem trang chủ và trang đơn có QR trên điện thoại thật.
