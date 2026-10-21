---
type: intent
du_an: tai-khoan-chung (một tài khoản MienTay dùng chung, đăng nhập một lần)
buoc: 1 - Plan
trang_thai: da chot - san sang Design
cap_nhat: 20/10/2026
---

# Intent: Tài khoản MienTay chung, đăng nhập một lần bằng Google, Zalo, GitHub hoặc email

Quy trình: Plan (intent.md) -> Design (spec.md) -> Build -> Test -> Deploy qua PR -> Maintain.
Intent này chỉ nói VÌ SAO và CÁI GÌ. Giao thức cụ thể, luồng màn hình chi tiết, lược đồ dữ liệu để cho spec.md.

Yêu cầu của chủ (nguyên văn, 20/10/2026): "trên web mientaymedia.com các trang nào có login, signin dùng chung login google, zalo, github".

Chủ đã chọn hướng (20/10/2026): "Một tài khoản MienTay chung: dựng cổng đăng nhập chung (ví dụ mientaymedia.com/tai-khoan) có Google, Zalo, GitHub; nút Đăng nhập trên menu site chính dẫn về đây, sau đó khách chọn vào Tên miền hoặc Mineflow; web tên miền dùng luôn cổng này (đăng nhập một lần). Mineflow chỉ nối được nếu mã nguồn Mineflow do mình quản lý."

## 0. Hiện trạng đã kiểm (đọc mã ngày 20/10/2026, không sửa gì)

Trên mientaymedia.com và các sản phẩm liên quan hiện có các chỗ đăng nhập sau:

| Nơi | Ai đăng nhập | Cách đăng nhập hiện nay | Nguồn |
|---|---|---|---|
| Site chính mientaymedia.com (Next.js, `D:\mientay-web\web`) | Không có đăng nhập riêng | Nút "Đăng nhập" ở menu máy tính và menu di động trỏ `contact.appUrl` = `https://app.mineflow.dev`; giá trị này CMS ghi đè được | `web/src/components/SiteHeader.tsx` dòng 236 và 276 (nhánh `feat/tieng-anh`; trên `main` là dòng 187 và 222); `web/src/lib/site-data.ts` dòng 44; `web/src/lib/cms.ts` dòng 273. Trang `mineflow-cdp/page.tsx` dòng 93 và 508 cũng dẫn tới `appUrl`. Không có route `/tai-khoan` trong `web/src/app/` |
| Web tên miền mientaymedia.com/ten-mien (Express/EJS/SQLite, `D:\api-pavietnam-trangchu`, nhánh `mtm/trang-chu`) | Khách mua tên miền, nhân viên, quản trị | Email/mật khẩu (scrypt), 2FA TOTP, Zalo, Google, GitHub (OAuth 2.0 + PKCE S256, `state` một lần) | `src/lib/oauth.ts` dòng 21 đến 113; `src/routes/dangNhapMxh.ts` dòng 65 và 108; `src/services/lienKetMxh.ts` dòng 96 đến 141; `src/routes/auth.ts` dòng 99 đến 245; `src/lib/crypto.ts` dòng 4 đến 11 |
| CRM crm.mientaymedia.com (`D:\crm-mientaymedia`) | Chỉ nhân viên nội bộ | NextAuth, Google Workspace giới hạn tên miền `mientaymedia.com` | `src/server/auth.ts` dòng 1 đến 40; intent `docs/mtm/crm-giao-dien-dang-nhap/intent.md` (D5: không cho tự đăng ký) |
| MienTay OS / Javis (`D:\javis`) | Chủ của từng bản cài (mỗi khách doanh nghiệp một bản riêng) | Đăng nhập quản trị và TOTP của bản cài, không có tài khoản khách công khai | `ARCHITECTURE.md` dòng 151 và 154; bộ nhớ dự án `mientay-media-dinh-huong-san-pham.md` |
| Mineflow | Khách của Mineflow | Không có mã nguồn trên máy này. Tìm `D:\` sâu 3 cấp chỉ thấy gói kết nối `D:\javis-store\packs\javis.mineflow` và video. Địa chỉ ứng dụng không thống nhất: site chính dùng `app.mineflow.dev`, gói Javis và bộ nhớ dùng `app.mineflow.vn`, đăng ký ở `mineflow.vn` | `D:\javis-store\huong-dan\mineflow.md` dòng 1 đến 25; bộ nhớ `luong-du-lieu-crm-pos-mineflow.md`. Site chính ghi Mineflow "do Miền Tây Media phát triển" (`site-data.ts` dòng 273) nhưng ai giữ mã thì (cần xác minh) |

Chi tiết phiên của web tên miền liên quan trực tiếp tới dự án:

- Cookie `sid` chỉ chứa id phiên ký HMAC, phiên lưu trong bảng `sessions` SQLite, sống 30 ngày, `httpOnly`, `SameSite=Lax`, `path` = `/ten-mien`, không đặt `Domain` (chỉ gửi cho đúng host) (`src/middleware/session.ts` dòng 11 đến 15, 76 đến 86, 127). Đăng nhập xoay id phiên chống session fixation (dòng 120 đến 131). Đăng xuất chỉ xóa phiên của web này (`src/routes/auth.ts` dòng 240 đến 245).
- Bảng `users` bắt buộc email duy nhất (`src/db/schema.sql` dòng 12 đến 25); bảng `user_identities` một danh tính mỗi bên mỗi tài khoản (dòng 103 đến 112). Khách Zalo không có email được tạo email tạm và bị bắt bổ sung trước khi đặt hàng (`src/services/lienKetMxh.ts` dòng 11, 141).
- Quy tắc ghép an toàn đã có: email trùng chỉ tự gộp khi tài khoản đó không có mật khẩu, không bật 2FA và email đã xác minh; còn lại phải đăng nhập mật khẩu một lần (`src/services/lienKetMxh.ts` dòng 118 đến 128).
- Redirect URI đã khai ở ba bên: `https://mientaymedia.com/ten-mien/auth/{zalo,google,github}/callback`, sinh từ `APP_URL` (`src/lib/oauth.ts` dòng 50 đến 52; `docs/mtm/dang-nhap-mxh/plan.md` dòng 41 đến 51). App Zalo 3014037252788300341, GitHub OAuth App client id Ov23lisYYH2CNmbgZEyD (theo giao việc; khóa đã nhập trên VPS hay chưa thì (cần xác minh)). GitHub OAuth App chỉ nhận một callback (`plan.md` dòng 51).
- Traefik chỉ chuyển `Host(mientaymedia.com) && PathPrefix(/ten-mien)` vào container tên miền, có ipallowlist chỉ nhận lưu lượng từ cloudflared (`deploy/vps/docker-compose.yml` dòng 21 và 24). Mọi đường dẫn khác của mientaymedia.com do site Next.js phục vụ.
- Số tài khoản khách đang có trên bản chạy thật (cần xác minh). Bộ nhớ ghi ngày 18/10/2026 còn chưa có tài khoản quản trị, SePay đang tắt, nên số khách thật có lẽ rất ít (cần xác minh).

## 1. Vì sao làm

- Nút "Đăng nhập" trên menu site chính hiện đưa mọi khách sang Mineflow, kể cả khách đến để mua tên miền. Khách tên miền phải tự tìm `/ten-mien/dang-nhap`. Người bị ảnh hưởng: khách mua tên miền, khách Mineflow, và đội bán hàng (khách hỏi "đăng nhập ở đâu").
- Mỗi sản phẩm tự làm đăng nhập thì khách phải nhớ nhiều tài khoản, MienTay phải khai OAuth ở Zalo, Google, GitHub cho từng sản phẩm và giữ nhiều bản quy tắc bảo mật (2FA, ghép tài khoản) dễ lệch nhau.
- Định hướng công ty là một hệ sản phẩm (Mineflow, MienTay OS, tên miền, Google Workspace) quanh CRM làm trung tâm (bộ nhớ `luong-du-lieu-crm-pos-mineflow.md`, `mientay-media-dinh-huong-san-pham.md`). Một danh tính khách thống nhất là nền để sau này bán chéo và đồng bộ khách về CRM theo một mã khách.
- Web tên miền đã có sẵn phần khó nhất (ba nhà cung cấp, 2FA, ghép an toàn, test giả lập), nên làm lớp dùng chung bây giờ rẻ hơn để mỗi sản phẩm tự làm lại.

## 2. Kết quả muốn có

1. Có một cổng "Tài khoản MienTay" ở một địa chỉ cố định (chủ chốt ở câu Q2), đăng nhập và đăng ký bằng Google, Zalo, GitHub và (nếu chủ giữ, câu Q3) email/mật khẩu, kèm 2FA.
2. Nút "Đăng nhập" trên menu site chính (máy tính và di động, tiếng Việt và tiếng Anh) dẫn về cổng này.
3. Sau khi đăng nhập, khách hoặc về đúng trang đã bấm đăng nhập, hoặc thấy trang chọn sản phẩm (Tên miền, Mineflow), theo câu Q4.
4. Đã đăng nhập ở cổng thì vào `/ten-mien` là đã đăng nhập, không hỏi lại mật khẩu hay mạng xã hội. Ngược lại, khách đăng nhập từ `/ten-mien` cũng là đã đăng nhập ở cổng.
5. Đăng xuất ở cổng hoặc ở `/ten-mien` thì cả hai đều đăng xuất (đăng xuất toàn cục trong phạm vi các ứng dụng đã nối).
6. Tài khoản tên miền đang có (mật khẩu, 2FA, danh tính Zalo/Google/GitHub, đơn hàng, tên miền, ví) giữ nguyên, đăng nhập ở cổng thấy đúng dữ liệu cũ, không ai phải đăng ký lại.
7. Cổng nói chuẩn chung (OIDC) để ứng dụng thứ hai trở đi (Mineflow nếu nối được, câu Q1) cắm vào mà không phải khai lại OAuth ở Zalo, Google, GitHub.

### Trải nghiệm người dùng mong muốn

- Khách ở bất kỳ trang nào của mientaymedia.com bấm "Đăng nhập" trên menu -> sang cổng, địa chỉ quay về được mang theo.
- Cổng hiện ba nút "Đăng nhập bằng Zalo / Google / GitHub" và (tùy Q3) ô email, mật khẩu, quên mật khẩu, đăng ký. Bật 2FA thì hỏi mã sau bước đăng nhập, như hiện nay.
- Đăng nhập xong: theo Q4, về trang trước hoặc trang chọn "Tên miền" / "Mineflow". Chọn Tên miền -> vào `/ten-mien/dashboard` đã đăng nhập.
- Khách vào thẳng `/ten-mien/dang-nhap` (link cũ, email cũ, đánh dấu trình duyệt) vẫn đăng nhập được, hoặc được chuyển sang cổng rồi quay về đúng trang; không có link cũ nào thành 404.
- Đăng xuất ở menu tài khoản của bất kỳ ứng dụng đã nối -> mọi ứng dụng đã nối đều hết phiên trên trình duyệt đó.
- Trang tài khoản ở cổng quản lý chung: hồ sơ, liên kết hoặc hủy Zalo/Google/GitHub, mật khẩu, 2FA. Phần riêng của tên miền (hồ sơ chủ thể tên miền, API token, ví) vẫn ở `/ten-mien`.

## 3. Phương án kiến trúc (để chủ chọn ở Q5, chi tiết kỹ thuật cho spec.md)

### Phương án A: Nâng web tên miền thành nhà cung cấp danh tính (đề xuất)

Cổng tài khoản là một phần của ứng dụng Express hiện có (dùng chung bảng `users`, `user_identities`, 2FA), được phục vụ thêm ở địa chỉ cổng. `/ten-mien` cùng host nên dùng chung phiên trực tiếp. Ứng dụng khác (Mineflow nếu nối) nối bằng OIDC Authorization Code + PKCE với cổng.

- Ưu: tái dùng toàn bộ mã đã test (ba nhà cung cấp, quy tắc ghép, 2FA, giới hạn tần suất); không phải di chuyển tài khoản (cùng CSDL); không thêm dịch vụ trên VPS GData dùng chung; Zalo (không phải OIDC chuẩn, `src/lib/oauth.ts` dòng 11 và 85 đến 89) đã chạy sẵn.
- Nhược: phải tự viết phần máy chủ OIDC (cấp mã, token, khóa ký JWKS, discovery, đăng xuất) hoặc dùng thư viện như `oidc-provider` cho Node; web bán tên miền thành điểm hỏng chung (sập là mọi sản phẩm không đăng nhập được); SQLite một máy là giới hạn khi nhiều ứng dụng.
- Chi phí: chỉ công làm; không phí phần mềm, không thêm máy. Ước lượng công (cần xác minh ở spec).

### Phương án B: Dịch vụ danh tính riêng trên VPS (Keycloak, Authentik, Ory, Zitadel)

Dựng một máy chủ danh tính mã nguồn mở ở `id.mientaymedia.com`, nó giữ tài khoản và nối Google, GitHub; web tên miền và Mineflow thành ứng dụng khách OIDC.

- Ưu: tính năng đầy đủ, chuẩn sẵn (OIDC, đăng xuất, quản lý phiên, giao diện quản trị); thay sản phẩm sau này dễ.
- Nhược: Zalo không có sẵn trong các sản phẩm này, phải viết phần mở rộng hoặc cấu hình nguồn OAuth tùy biến (mức khả thi (cần xác minh) theo từng sản phẩm); phải di chuyển tài khoản tên miền (mật khẩu scrypt định dạng riêng `src/lib/crypto.ts` dòng 11, có thể không nhập được nên khách phải đặt lại mật khẩu, (cần xác minh)); thêm một dịch vụ cần RAM, sao lưu, cập nhật bảo mật trên VPS GData đang chạy CRM, mailserver, web tên miền (bộ nhớ `vps-gdata-va-api-pavietnam.md`); phải viết lại giao diện tiếng Việt và thương hiệu; web tên miền phải sửa sâu để bỏ đăng nhập riêng.
- Chi phí: bản mã nguồn mở miễn phí, tốn RAM VPS (Keycloak cỡ 0,5 đến 1 GB, (cần xác minh) với cấu hình máy) và công vận hành lâu dài.

### Phương án C: Chỉ dùng chung cookie phiên trên mientaymedia.com

Mở `path` cookie `sid` từ `/ten-mien` ra `/` (hoặc đặt `Domain=.mientaymedia.com`), cổng và site chính đọc chung phiên.

- Ưu: nhanh nhất, ít mã nhất cho trường hợp chỉ có `/ten-mien`.
- Nhược: không nối được Mineflow (khác tên miền `mineflow.dev` / `mineflow.vn`, cookie không sang được); mở `path=/` làm cookie phiên gửi cho mọi trang Next.js và form trên site chính; đặt `Domain=.mientaymedia.com` thì cookie còn gửi cho cms., crm., hoadon. (hoadon đang lỗi SSL theo bộ nhớ) nên một lỗ ở bất kỳ tên miền con nào cũng lộ phiên khách. Không phải nền cho sản phẩm thứ hai.

### Đề xuất

Phương án A, làm hai nấc:

1. Nấc 1 (dự án này): cổng tài khoản do ứng dụng tên miền phục vụ ở địa chỉ chủ chốt (Q2), dùng chung phiên với `/ten-mien` theo cách không mở cookie ra tên miền con; nút Đăng nhập site chính trỏ về cổng; đăng xuất chung; giữ link cũ.
2. Nấc 2 (chỉ khi Q1 = có và có mã Mineflow): bật phần OIDC của cổng và nối Mineflow làm ứng dụng khách. Nếu Mineflow là bên ngoài, trang chọn sản phẩm chỉ là liên kết sang trang đăng nhập riêng của Mineflow, ghi rõ là đăng nhập riêng.

Giữ phương án B làm hướng chuyển khi có từ ba ứng dụng khách trở lên hoặc cần tính năng doanh nghiệp (SAML, nhiều tổ chức). Lý do chọn A: dữ liệu và mã đã có, VPS dùng chung không nên thêm dịch vụ nặng, Zalo là nhà cung cấp quan trọng nhất với khách Việt mà B không hỗ trợ sẵn.

## 4. Phạm vi

- Cổng tài khoản ở địa chỉ chốt ở Q2: đăng nhập, đăng ký, quên mật khẩu (nếu Q3 giữ mật khẩu), 2FA, liên kết và hủy liên kết Zalo/Google/GitHub, trang chọn sản phẩm (nếu Q4 chọn).
- Định tuyến để địa chỉ cổng tới đúng ứng dụng (Traefik, và Cloudflare tunnel nếu là tên miền con). Việc chạm VPS và Cloudflare để ở bước Deploy, có PR và chủ duyệt.
- Phiên dùng chung giữa cổng và `/ten-mien`; đăng xuất toàn cục giữa hai bên.
- Sửa nút "Đăng nhập" ở `SiteHeader.tsx` (máy tính, di động, bản tiếng Anh) và giá trị `appUrl` ở CMS; quyết định riêng cho các nút "Dùng thử/Vào ứng dụng" ở trang `mineflow-cdp` (giữ trỏ Mineflow hay qua cổng) theo Q1.
- Giữ `/ten-mien/dang-nhap`, `/ten-mien/dang-ky`, `/ten-mien/auth/*/callback` chạy hoặc chuyển hướng an toàn sang cổng.
- Cập nhật redirect URI ở Zalo, Google, GitHub nếu địa chỉ cổng khác `/ten-mien` (danh sách việc chủ làm ở trang developer, như `docs/mtm/dang-nhap-mxh/plan.md`).
- Phần OIDC cho ứng dụng khách và nối Mineflow: chỉ khi Q1 = có.
- Cập nhật chính sách quyền riêng tư nói rõ một tài khoản dùng cho nhiều sản phẩm và dữ liệu chia sẻ giữa chúng (chủ duyệt nội dung).
- Test tự động với máy chủ OAuth giả lập đã có, cộng test cho luồng cổng, chuyển hướng quay về, đăng xuất chung.

## 5. Ngoài phạm vi

- CRM: đăng nhập nhân viên bằng Google Workspace `@mientaymedia.com`, không phải khách (`D:\crm-mientaymedia\src\server\auth.ts` dòng 1 đến 13), và mỗi khách doanh nghiệp có bản CRM riêng với OAuth riêng (intent `crm-giao-dien-dang-nhap` D8). Không nối vào cổng khách. (mặc định, chủ có thể đổi)
- MienTay OS / Javis: mỗi bản cài có quản trị riêng (`D:\javis\ARCHITECTURE.md` dòng 151, 154), không có tài khoản khách công khai. Không nối. (mặc định, chủ có thể đổi)
- CMS cms.mientaymedia.com (Strapi, chỉ người biên tập).
- Viết mã hay sửa mã Mineflow khi chưa có câu trả lời Q1; mọi việc trên hệ thống Mineflow bên ngoài.
- Đồng bộ tài khoản khách sang CRM hoặc Pancake POS (đã có dự án `dong-bo-don-hang`; nối mã khách chung để dự án sau).
- Đăng nhập bằng Facebook, Apple, Microsoft, số điện thoại OTP.
- Hiện tên hay ảnh khách trên menu site chính (site chính giữ nút cố định; hiện trạng thái đăng nhập để sau).
- Lưu hay làm mới access token của Zalo/Google/GitHub (giữ nguyên quyết định ở `docs/mtm/dang-nhap-mxh/intent.md` mục 4).
- Thiết kế, mã, triển khai: đó là bước 2 và 3.

## 6. Ràng buộc

- Khách đang chạy: `/ten-mien` đã live từ 18/10/2026 (bộ nhớ `vps-gdata-va-api-pavietnam.md`). Không được làm mất phiên, đơn, tên miền, ví của khách; mọi link cũ phải còn chạy. Đổi tới đâu cũng có đường lui.
- VPS GData dùng chung (Coolify, CRM, mailserver, cloudflared): không thêm dịch vụ nặng nếu không cần; deploy qua PR và Coolify/docker compose như cũ, không sửa trực tiếp.
- Định tuyến: hiện chỉ `PathPrefix(/ten-mien)` vào container tên miền; mọi đường dẫn khác là của Next.js. Địa chỉ `/tai-khoan` trên mientaymedia.com phải không đụng route hiện có của site chính (hiện chưa có, đã kiểm `web/src/app/`). Ứng dụng tên miền hiện chỉ hỗ trợ một `BASE_PATH` khớp với `APP_URL` (`src/config.ts` dòng 40 đến 61), nên phục vụ thêm một địa chỉ là việc phải tính ở spec.
- Nhà cung cấp OAuth: GitHub OAuth App chỉ một callback URL; redirect URI phải khớp từng ký tự; Zalo bắt PKCE và khai tên miền; đổi redirect URI ở ba bên là việc chủ làm bằng tay, có thể gây gián đoạn nếu đổi sai thứ tự. Quy tắc khớp đường dẫn con của GitHub và số callback Zalo cho phép (cần xác minh với tài liệu chính thức).
- Bảo mật: giữ nguyên mức hiện có (PKCE, `state` một lần, xoay phiên, 2FA bắt buộc khi đã bật, không tự gộp tài khoản có mật khẩu, không log mã hay token). Không cookie nào được đặt `Domain=.mientaymedia.com`.
- Pháp lý: dữ liệu cá nhân của khách theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực từ 01/01/2026, (cần xác minh) văn bản hiện hành): phải báo khách tài khoản dùng cho những sản phẩm nào, chỉ chia sẻ cho ứng dụng khách các trường tối thiểu (mã khách, email, tên), có đồng ý khi một sản phẩm mới lần đầu nhận dữ liệu. Trang chính sách hiện ở `mientaymedia.com/chinh-sach-quyen-rieng-tu`.
- Thương hiệu Google: chữ nút theo hướng dẫn ("Đăng nhập bằng Google"), đã chốt ở `docs/mtm/dang-nhap-mxh/plan.md` dòng 30.
- Ngân sách: không phí phần mềm; không mua thêm máy chủ (mặc định, chủ có thể đổi).
- Lớp khách thấy dùng tên thương hiệu MienTay, giữ tên trong mã như cũ (bộ nhớ `mientay-os-rebrand.md`).
- Repo site chính `superstar109/mientay-web` có nhiều nhánh đang mở (`feat/tieng-anh`, `main`, `fix/audit-thieu`...); nhánh nào đang chạy thật (cần xác minh) trước khi sửa header.

## 7. Tiêu chí hoàn thành đo được

Kiểm trên bản thử (staging hoặc máy cục bộ với máy chủ OAuth giả lập), rồi lặp lại các mục có dấu (*) trên bản thật sau deploy.

1. (*) `curl -sI <địa chỉ cổng>` trả 200 (hoặc 302 sang trang đăng nhập của cổng) và trang có đủ nút Zalo, Google, GitHub (cùng form email nếu Q3 giữ): kiểm bằng `curl -s <cổng> | grep -c 'auth/\(zalo\|google\|github\)'` ra 3.
2. (*) HTML site chính đã build: `curl -s https://mientaymedia.com/ | grep -o 'href="[^"]*"[^>]*>Đăng nhập'` chỉ ra địa chỉ cổng, không còn `app.mineflow.dev` ở nút Đăng nhập; tương tự cho menu di động và trang `/en`.
3. Test tự động: đăng nhập ở cổng bằng từng bên Zalo, Google, GitHub (máy chủ giả lập) rồi `GET /ten-mien/dashboard` trả 200 với cùng trình duyệt (cookie jar), không có bước đăng nhập nào ở giữa.
4. Test tự động: đăng nhập ở `/ten-mien/dang-nhap` rồi mở cổng thấy đã đăng nhập (không hiện form).
5. Test tự động: đăng xuất ở cổng rồi `GET /ten-mien/dashboard` trả 302 về trang đăng nhập; đăng xuất ở `/ten-mien` rồi mở cổng thấy chưa đăng nhập. Phiên trong bảng `sessions` của người đó bị xóa (truy vấn đếm = 0).
6. Test tự động: tài khoản có mật khẩu và 2FA đăng nhập ở cổng bị hỏi mã 2FA; sai mã thì không vào được `/ten-mien/dashboard`.
7. Test tự động: các tình huống ghép tài khoản ở `docs/mtm/dang-nhap-mxh/spec.md` mục 7 vẫn qua khi chạy qua cổng (email trùng tài khoản có mật khẩu không tự gộp).
8. Test tự động: tham số quay về trỏ ra ngoài danh sách cho phép (`https://evil.example`, `//evil.example`, `/\evil.example`) đều bị bỏ, khách về trang mặc định.
9. Test tự động: mọi `Set-Cookie` của cổng và `/ten-mien` không có thuộc tính `Domain`, có `HttpOnly`, `Secure` (khi production), `SameSite=Lax` hoặc chặt hơn.
10. Test tự động: POST đăng xuất, liên kết, hủy liên kết thiếu hoặc sai `_csrf` trả 403.
11. Link cũ: `GET /ten-mien/dang-nhap`, `/ten-mien/dang-ky`, `/ten-mien/quen-mat-khau` trả 200 hoặc 302 sang cổng kèm địa chỉ quay về đúng; không cái nào 404 (test HTTP).
12. Di chuyển: trên bản sao CSDL thật, số dòng `users` và `user_identities` trước và sau khi chạy bản mới bằng nhau; một tài khoản mẫu đăng nhập ở cổng thấy đúng danh sách tên miền và số dư cũ.
13. (*) Trên bản thật: chủ đăng nhập thử bằng Zalo, Google, GitHub qua cổng mỗi bên một lần, cả Đồng ý lẫn Từ chối, ghi kết quả vào plan.md.
14. `npx tsc --noEmit`, `npm test`, `kiem-dau`, `kiem-base` của repo tên miền sạch; `npm run build` của `web/` thành công (build ở `D:\mientay-web`).
15. Ảnh chụp cổng ở 1366 và 360 px, có và không có 2FA.
16. Chỉ khi Q1 = có: một ứng dụng khách OIDC thử (hoặc Mineflow staging) đăng nhập qua cổng, nhận `id_token` hợp lệ kiểm được bằng khóa ở địa chỉ JWKS của cổng; đăng xuất ở cổng làm ứng dụng khách hết phiên trong thời gian chốt ở spec.

## 8. Câu hỏi chủ cần chốt

- Q1. Mineflow có tham gia đăng nhập một lần không, và ai đang giữ mã nguồn Mineflow? Trên máy này không có mã Mineflow; site chính ghi Mineflow "do Miền Tây Media phát triển". Nếu mình không sửa được mã, Mineflow chỉ là một liên kết sang trang đăng nhập riêng của Mineflow và nấc 2 bỏ. Kèm theo: địa chỉ đúng của ứng dụng Mineflow là `app.mineflow.dev` hay `app.mineflow.vn`?
- Q2. Địa chỉ cổng: `mientaymedia.com/tai-khoan` (cùng host, không cần tunnel mới, nhưng chung host với site Next.js) hay tên miền con riêng như `id.mientaymedia.com` / `taikhoan.mientaymedia.com` (tách hẳn, gọn cho OIDC, phải thêm hostname ở Cloudflare tunnel và khai lại tên miền ở Zalo)?
- Q3. Có giữ đăng nhập email/mật khẩu ở cổng không? Tài khoản tên miền hiện có dùng mật khẩu; bỏ thì khách cũ phải liên kết mạng xã hội hoặc dùng mã gửi qua email.
- Q4. Sau khi đăng nhập: luôn hiện trang chọn sản phẩm (Tên miền, Mineflow), hay về thẳng trang khách vừa ở và chỉ hiện trang chọn khi bấm Đăng nhập từ trang không thuộc sản phẩm nào? (Đề xuất: về trang trước nếu có, không thì trang chọn.)
- Q5. Duyệt phương án A (nâng web tên miền thành nhà cung cấp danh tính) hay muốn phương án B (Keycloak/Authentik riêng trên VPS, tốn RAM, Zalo phải tự viết, khách cũ có thể phải đặt lại mật khẩu)?
- Q6. Tên hiển thị của tài khoản chung cho khách: "Tài khoản MienTay", "MienTay ID" hay tên khác?

## 9. Rủi ro

- Chiếm tài khoản: một danh tính giờ mở nhiều sản phẩm, nên lỗi ghép tài khoản theo email (nhất là email do bên thứ ba báo) có hậu quả lớn hơn. Giữ quy tắc không tự gộp tài khoản có mật khẩu hoặc 2FA; Zalo không có email thì không bao giờ ghép theo email.
- Chuyển hướng mở (open redirect) và rò mã: tham số "quay về" và `redirect_uri` của ứng dụng khách phải so khớp danh sách cố định, nếu không kẻ xấu lấy được mã đăng nhập.
- CSRF đăng nhập và CSRF đăng xuất: kẻ xấu ép khách đăng nhập vào tài khoản của kẻ xấu (khách nhập thông tin thanh toán vào đó) hoặc đăng xuất hàng loạt. Cần `state` gắn phiên, `_csrf` cho thao tác POST.
- Phạm vi cookie: mở cookie ra `path=/` hay `Domain=.mientaymedia.com` làm phiên khách lộ sang site Next.js, CMS, CRM, hoadon (đang lỗi SSL). Đây là lý do không chọn phương án C.
- Đăng xuất toàn cục không trọn: ứng dụng khách giữ phiên riêng, đăng xuất ở cổng không lan sang nếu không có cơ chế đăng xuất chuẩn; khách tưởng đã thoát trên máy dùng chung.
- Điểm hỏng chung: cổng hoặc container tên miền sập thì mọi sản phẩm nối vào đều không đăng nhập được; SQLite một máy hạn chế mở rộng. Cần theo dõi và cảnh báo (Telegram đã có).
- Đổi redirect URI sai thứ tự ở Zalo, Google, GitHub làm đăng nhập mạng xã hội hỏng trên bản thật; GitHub chỉ một callback nên không chạy song song cũ và mới được nếu đường dẫn không thỏa quy tắc đường dẫn con (cần xác minh).
- Xung đột với site chính: thêm định tuyến `/tai-khoan` vào Traefik có thể che trang của Next.js nếu sau này site chính đặt trùng; nhiều nhánh `mientay-web` đang mở dễ deploy nhầm header cũ.
- Dữ liệu cá nhân: chia sẻ danh tính sang Mineflow (nếu là bên ngoài) là chuyển dữ liệu cho bên thứ ba, cần chính sách và đồng ý; thiếu thì vi phạm quy định bảo vệ dữ liệu cá nhân.
- Khách cũ bối rối khi giao diện đăng nhập đổi chỗ; email cũ có link `/ten-mien/dang-nhap` phải còn chạy.
- Phụ thuộc bên ngoài: nếu Mineflow không do mình quản lý thì phần "đăng nhập một lần sang Mineflow" không làm được, kỳ vọng của chủ cần điều chỉnh sớm.

## Quyết định của chủ (21/10/2026)

- Q5: Duyệt phương án A (web tên miền làm nhà cung cấp danh tính). Làm nấc 1 trước; nấc 2 (OIDC cho Mineflow) để sau.
- Q2, Q6: Cổng tại https://mientaymedia.com/tai-khoan, tên hiển thị "Tài khoản MienTay".
- Q1: Chưa nối Mineflow. Trang chọn sản phẩm vẫn có lối sang Mineflow (app.mineflow.dev, đăng nhập riêng như hiện nay).
- Q3 (mặc định khuyến nghị): giữ đăng nhập email/mật khẩu bên cạnh Google, Zalo, GitHub.
- Q4 (mặc định khuyến nghị): sau đăng nhập về trang trước nếu có (chỉ đường dẫn nội bộ an toàn), không có thì hiện trang chọn sản phẩm.
