---
type: evals
du_an: trang-chu
buoc: 4 - Test (QA độc lập)
dau_vao: intent.md mục 3, spec.md mục 2 đến 5, plan.md (T0 đến T6, lệch L1 đến L7)
nhanh: mtm/trang-chu @ 7b7f5af
cap_nhat: 16/10/2026
ket_luan: ĐẠT, kèm 1 lỗi thấp (trang quản trị Báo cáo tràn 6px ở 360px) và 1 lỗi có sẵn nên sửa sớm (trang đơn hàng, chi tiết tên miền tràn ngang trên điện thoại)
---

# Đánh giá độc lập: trang chủ mới

QA tự chạy app sandbox P.A với CSDL tạm ở cổng 3111 (gốc) và 3112 (`BASE_PATH=/ten-mien`), thêm cổng 3121 chạy bản trước trang chủ (`69bf6a0`, xuất bằng `git archive` vào scratchpad) để so sánh. Trình duyệt: Chrome 155 headless qua DevTools Protocol, profile tạm trong scratchpad, đã đóng khi xong. Không sửa code, không push.

## 1. Bảng tiêu chí

| # | Tiêu chí (intent 3, spec 2 đến 5) | Cách kiểm | Kết quả | Bằng chứng |
|---|---|---|---|---|
| 1 | Đủ 9 khối đúng thứ tự | đọc HTML `/ten-mien/` | ĐẠT | thanh ưu đãi (dòng 19), header (27), hero (91), banner (186), "Dịch vụ nổi bật" (229), giới thiệu (333), "Khách hàng tin dùng" (358), "Câu hỏi thường gặp" 5 câu `<details>` (395), footer (422) |
| 2 | Chip giá đúng bảng giá thật, không gõ cứng | `qa2/chip.mts`: đọc chip trên trang, so với `priceFor(t,'register',1).total` trên cùng CSDL; rồi đổi giá .vn thành 777.000 và bật VAT 10% trong CSDL tạm, tải lại | ĐẠT | 19/19 chip khớp cả tên đuôi, giá, thứ tự (5 đuôi nổi bật trước) ở hai chế độ. Sau khi đổi giá: chip, thanh ưu đãi, thẻ .vn đổi theo ngay; với VAT 10% (máy chủ mới đọc cấu hình): .vn 854.700 đ, .com 350.900 đ, giá chuyển thấp nhất 350.900 đ, khớp `/bang-gia` và kết quả tìm kiếm. Đã trả giá về như cũ |
| 3 | Ô tìm gửi `/tim-kiem?q=` | Chrome: điền ô, `requestSubmit()`; curl | ĐẠT | gốc `/tim-kiem?q=mientayqa`, base `/ten-mien/tim-kiem?q=mientayqa`, trang kết quả 200; `q` rỗng 302 về trang chủ có tiền tố |
| 4 | Tab "Chuyển tên miền về" không cần JS, gửi `/chuyen-ten-mien?domain=` điền sẵn | Chrome: bấm nhãn, đo `display` hai form ở 360px và 1366px; gửi form; curl với giá trị độc | ĐẠT | ban đầu chỉ form tìm hiện, bấm tab thì chỉ form chuyển hiện; gửi `TenMien-Cu.com` tới `${BASE}/chuyen-ten-mien?domain=TenMien-Cu.com`, ô điền sẵn `tenmien-cu.com`; `domain="><svg onload=alert(1)>.com` in ra `value="&#34;&gt;&lt;svg ...` (đã thoát); 300 ký tự bị cắt |
| 5 | Header và footer mới trên các trang khác không vỡ | Chrome: 32 trang mỗi chế độ (12 vãng lai, 11 khách đăng nhập thật, 9 quản trị đăng nhập thật có TOTP), mỗi trang ở 360px và 1366px | ĐẠT | mọi trang có `.site-header`, `.site-footer`, logo đầu trang và logo trắng chân trang tải được (naturalWidth > 0); menu `<details>` mở ở 360px: 7 link, không link nào ra ngoài khung. Ngoại lệ đúng thiết kế: phiếu `/don-hang/<mã>/hoa-don` là trang in riêng, không có header/footer |
| 6 | Không tràn ngang ở 360px | Chrome 360x780, DPR 2, `mobile: true`: so `scrollWidth` với `clientWidth`, liệt kê phần tử vượt khung không nằm trong vùng cuộn | ĐẠT cho trang chủ; xem lỗi 1, 2 cho trang khác | trang chủ 360/360 ở cả hai chế độ, kể cả khi mở menu; dải 19 chip `overflow-x: auto` cuộn trong khung (scrollWidth 2725 trong khung 360). 29 trên 32 trang mỗi chế độ không tràn ở 360px |
| 7 | CSP không bị vi phạm | Chrome: gắn bộ nghe `securitypolicyviolation` trước khi tải trang, đọc `Log`, `Runtime` (console, exception), `Network` | ĐẠT | 0 vi phạm CSP, 0 exception, 0 lỗi console trên 64 lượt tải mỗi chế độ (trừ dòng "Failed to load resource: 404" của trang 404, đúng thiết kế). Request ra ngoài duy nhất: ảnh QR `qr.sepay.vn` ở `/admin/cau-hinh` (xem trước QR, CSP cho phép sẵn `img-src https://qr.sepay.vn`, có từ trước) |
| 8 | Font tự phục vụ | curl 8 tệp woff2 + OFL ở hai chế độ; Chrome đọc `document.fonts` | ĐẠT | 16 lượt `200 font/woff2` + OFL `200 text/plain`, tệp bắt đầu bằng `wOF2`, `/fonts/...` ngoài tiền tố 404; `@font-face` dùng `../fonts/` và có `unicode-range` tách latin/vietnamese; body dùng "Be Vietnam Pro", nạp đủ 400/600/700 (trang chủ thêm 800) cả bộ latin và vietnamese; không request font ra ngoài |
| 9 | Logo khách hàng tải được | Chrome: cuộn tới khối khách hàng (ảnh `loading="lazy"`) | ĐẠT | 12/12 tải được ở 360px và 1366px, hai chế độ; 12/12 alt "Logo khách hàng <tên>"; curl 28 lượt `200 image/png` |
| 10 | Không chép nội dung, ảnh của Mắt Bão | md5 14 ảnh so với `D:\mientay-web\web\public\img`; tải trang chủ matbao.net (chỉ đọc) và so cụm 6 từ; `grep` tên Mắt Bão | ĐẠT | 14/14 ảnh trùng byte với ảnh của mientay-web (logo xanh = `font-roboto-mientaymedia.png`, logo trắng = `Logo-trang-mientaymedia.png`, 12 logo khách `Logo-*-300x89-1.png`); 0 cụm 6 từ trùng (1021 từ trang mình, 1741 từ trang Mắt Bão); 0 tên tệp ảnh trùng; tên lớp CSS trùng chỉ có `container`, `active`; "Mắt Bão" chỉ có trong `intent.md` |
| 11 | Cổng chặn: BASE_PATH, kiem-dau, kiem-base, npm test, tsc | QA tự chạy | ĐẠT | tsc 0; 212/212; kiem-dau 0; kiem-base 0 link thiếu tiền tố; 0 NFD, 0 em dash, en dash trong `src public test scripts docs/mtm/trang-chu` |
| 12 | Màu thương hiệu | đọc `:root`, ảnh chụp, email | ĐẠT | `--brand #0a6cff` dùng ở nút, chip, footer navy; 16/16 email trong luồng thật có `#0a6cff`, không còn `#0f766e` (CSDL tạm mới seed); `head.ejs` coi `#0f766e` là mặc định cũ (L1) |
| 13 | Rà link mọi trang có header/footer mới | `qa2/e2e.mjs` bò mọi `href`/`src` nội bộ trên các trang đã đi | ĐẠT | 98 link (base), 99 link (gốc): không 4xx/5xx, dưới base không link nào thiếu tiền tố, mọi `Location` có tiền tố |

Ảnh chụp kiểm (scratchpad, không commit): trang chủ 1366px và 360px, menu điện thoại mở, dashboard và quản trị ở 360px.

## 2. Lỗi

1. **[Thấp, mới do đợt này] `/admin/bao-cao` tràn ngang 6px ở 360px.** Bản trước trang chủ (69bf6a0) đo 360/360, bản mới 366/360; phần tử vượt khung là `div.table-wrap` và `div.card` của "Dự kiến doanh thu gia hạn". Nguyên nhân khả dĩ: font Be Vietnam Pro rộng hơn font hệ thống nên bảng không còn vừa. Tái hiện: đăng nhập quản trị, mở `/admin/bao-cao` (hoặc `/ten-mien/admin/bao-cao`) ở khung 360px, `document.documentElement.scrollWidth` = 366. Chỉ trang quản trị, không chặn deploy.
2. **[Trung bình, có sẵn, nặng thêm chút] Trang chi tiết đơn hàng và chi tiết tên miền tràn ngang trên điện thoại.** Ở 360px: `/don-hang/<mã>` 537px (bản trước 518px), `/control-panel/<tên miền>` 391px (bản trước 370px). Thẻ "Chi tiết", "Tổng kết", "Quản lý tên miền", bảng DNS và ô "TTL" bị kéo rộng theo bảng con. Không do trang chủ gây ra (bản trước cũng tràn) và nằm ngoài phạm vi intent ("không làm lại các trang khác"), nhưng trang đơn hàng là nơi khách quét QR thanh toán trên điện thoại. Tái hiện: đặt một đơn, mở trang đơn ở khung 360px, kéo ngang được. Nên sửa trước khi chạy quảng cáo.

Quan sát (không phải lỗi): footer chỉ in địa chỉ, hotline khi quản trị đã đặt `site.address`, `site.hotline`; với CSDL mới seed cột "Liên hệ" chỉ có link mientaymedia.com. QA chỉ đọc mã `footer.ejs` cho nhánh có giá trị, chưa chạy với giá trị thật; chủ nên điền hai mục này trong Cấu hình trước khi mở bán.

## 3. Dòng LỖI tự động không phải lỗi sản phẩm

Trong 146 dòng của `trinh-duyet.mjs` mỗi lần chạy (2 chế độ gộp), 26 dòng LỖI: 8 do logo khách hàng `loading="lazy"` chưa tải khi chưa cuộn (đã kiểm lại sau khi cuộn: 12/12, tiêu chí 9); 4 do trang 404 cố ý trả 404; 4 do phiếu hóa đơn không có header/footer (trang in); 4 do request ảnh QR SePay ở trang cấu hình (CSP cho phép); 6 là lỗi 1 và 2 ở trên.

## 4. Rà mục "Lệch spec" của plan.md

L1 đến L7 không làm sai ý intent. L2 ("Chỉ từ ... /năm đầu" + "Gia hạn ... /năm") rõ hơn spec. L4 (menu gập ở 1024px) đã kiểm ở 360px. L7: QA cũng dùng Chrome headless.

## 5. Việc cần chủ làm

1. Quyết có sửa lỗi 2 (trang đơn hàng, chi tiết tên miền trên điện thoại) ngay đợt này hay đợt sau; lỗi 1 có thể gộp chung.
2. Điền `site.address`, `site.hotline`, email hỗ trợ trong Cấu hình để footer đủ thông tin liên hệ.
3. Xem trang chủ trên điện thoại thật (Safari iOS, Chrome Android) vì QA chỉ giả lập khung 360px.
