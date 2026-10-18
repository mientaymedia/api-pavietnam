---
type: intent
du_an: footer-phap-ly (footer pháp lý và trang biểu mẫu hồ sơ cho web tên miền)
buoc: 1 - Plan
nhanh: mtm/footer-phap-ly (worktree D:\api-pavietnam-trangchu, tạo từ mtm/trang-chu c6adc32)
cap_nhat: 18/10/2026
---

# Intent: footer web tên miền đủ mục luật yêu cầu, có trang biểu mẫu hồ sơ

Yêu cầu của chủ: (1) bổ sung footer trang tên miền mục biểu mẫu hồ sơ giống ý tưởng trang "Biểu mẫu hồ sơ" của Mắt Bão, không chép file hay nội dung của họ; (2) kiểm luật nhà nước để footer đầy đủ đối với web tên miền; chỉ sửa footer web tên miền (và trang biểu mẫu footer trỏ tới), không sửa site mientaymedia.com.

## 1. Vì sao

- Từ 01/7/2026 Luật TMĐT 122/2025/QH15 và NĐ 248/2026/NĐ-CP thay NĐ 52/2013, NĐ 85/2021. Trang /ten-mien có giỏ hàng, đặt hàng nên là nền tảng TMĐT kinh doanh trực tiếp: phải công bố thông tin doanh nghiệp và các chính sách tại vị trí dễ thấy (Điều 11 Luật TMĐT; Điều 4 đến 16, Điều 17 khoản 1 điểm a NĐ 248).
- MienTay Media chỉ là đại lý của P.A Việt Nam (NĐ 147/2024 Điều 12 khoản 4 điểm c): web phải nói rõ ai là nhà đăng ký, tránh tự nhận vai trò nhà đăng ký.
- Khách cần biểu mẫu hồ sơ (đăng ký, thay đổi, chuyển nhà đăng ký, hoàn trả, chuyển nhượng) theo TT 48/2025/TT-BKHCN và NĐ 115/2025/NĐ-CP; P.A có nghĩa vụ công bố mẫu, mình dẫn về nguồn chính thức.

Nguồn luật: báo cáo đã nghiên cứu `luat-footer-ten-mien.md` (scratchpad phiên 18/10/2026), tóm lại ở spec mục 1.

## 2. Kết quả muốn có

1. Footer có đủ: tên doanh nghiệp, trụ sở, mã số doanh nghiệp kèm ngày cấp, nơi cấp, người đại diện theo pháp luật, điện thoại, email, một kênh trực tuyến; dòng đại lý P.A; cột "Chính sách" trỏ tới các trang đang có trên mientaymedia.com theo tên mục của NĐ 248; cột "Tên miền" thêm Biểu mẫu hồ sơ, Quy trình đăng ký, WHOIS VNNIC, Quy định sử dụng tên miền; chỗ cho biểu tượng "đã thông báo" chỉ hiện khi đã cấu hình.
2. Trang mới `/bieu-mau-ho-so`: biểu mẫu theo nhóm, mỗi mục có căn cứ và liên kết tải từ nguồn chính thức (P.A, Cổng Chính phủ, VNNIC), không lưu file vào repo.
3. Không phá gì: BASE_PATH, CSP, không tràn ngang 360px, sitemap có trang mới, tsc, npm test, kiem-dau, kiem-base đều sạch.

## 3. Ngoài phạm vi

- Không sửa mientaymedia.com (kể cả khi trang chính sách ở đó còn dẫn văn bản cũ): ghi vào danh sách cần chủ làm.
- Không tự viết chính sách pháp lý dài, không gõ lại biểu mẫu nhà nước.
- Không làm thủ tục thông báo TMĐT, không push, không đụng VPS.
