---
type: intent
du_an: tra-cuu-ai (tra cứu và gợi ý tên miền bằng AI)
buoc: 1 - Plan
trang_thai: da chot - san sang Design
nhanh: mtm/trang-chu (worktree D:\api-pavietnam-trangchu); khi làm nên tách nhánh riêng, ví dụ mtm/tra-cuu-ai
cap_nhat: 18/10/2026
---

# Intent: tìm tên miền cùng AI trên mientaymedia.com/ten-mien

Yêu cầu của chủ (nguyên văn): "xem bổ sung tính năng tra cứu tên miền bằng AI giúp mình".

Cách hiểu: khách chưa nghĩ ra tên thì mô tả ngành nghề hoặc ý tưởng bằng lời, máy chủ nhờ AI đề xuất vài tên, rồi KIỂM TRA THẬT từng tên qua P.A trước khi báo "còn trống", kèm giá đang bán và nút thêm vào giỏ. Học ý tưởng tab "Tìm tên miền cùng AI" của Mắt Bão (matbao.net), không chép chữ, giao diện hay mã.

## 1. Vì sao làm

- Ô tìm hiện tại chỉ nhận một từ khóa hoặc tên miền đầy đủ (`src/services/domains.ts` dòng 23 đến 32: "nhận vào từ khóa ('congty') hoặc tên miền đầy đủ"). Khách chưa có tên, hoặc tên muốn dùng đã có chủ, sẽ phải tự nghĩ và gõ lại nhiều lần; nhiều người bỏ đi ở bước này (cần xác minh bằng số liệu: hiện chưa đo tỷ lệ tìm mà không thêm vào giỏ).
- Khi tên đã có chủ, trang kết quả chỉ gợi ý CÙNG tên với đuôi khác (`domains.ts` dòng 45 đến 55), không gợi ý tên khác.
- Đối thủ lớn trong nước (Mắt Bão) đã có tab tìm tên miền cùng AI ngay ở hero, khách bắt đầu coi đây là tính năng bình thường.
- MienTay Media vừa bán tên miền vừa bán "API key AI" (`D:\javis\brains\Brain Default\Tài liệu sản phẩm\06-api-key-ai.md`): tính năng này đồng thời là ví dụ sống cho sản phẩm AI của công ty.
- Người bị ảnh hưởng: khách vãng lai muốn mua tên miền (chủ shop, doanh nghiệp nhỏ, người mới lập dự án), và chủ (doanh thu tên miền, chi phí AI, tải P.A).

## 2. Kết quả muốn có

1. Ở hero trang chủ có tab thứ ba "Tìm cùng AI" cạnh "Tìm tên miền" và "Chuyển tên miền về", làm bằng radio và CSS như hai tab hiện có (`src/views/home.ejs` dòng 63 đến 84), không cần JavaScript.
2. Luồng của khách:
   1. Nhập mô tả ngắn bằng tiếng Việt (ví dụ "tiệm bánh mì nhà làm ở Cần Thơ, bán online"), tùy chọn đánh dấu đuôi ưa thích (.vn, .com.vn, .com, ...) lấy từ danh sách đuôi đang bán.
   2. Bấm "Gợi ý tên", chờ vài giây (có thông báo đang xử lý bằng CSS, không bắt buộc JS).
   3. Nhận N gợi ý (N do chủ chốt, xem mục 7). Mỗi dòng: tên miền ở dạng không dấu, một câu ngắn vì sao hợp, trạng thái THẬT từ P.A ("Còn trống", "Đã có người đăng ký", "Chưa kiểm tra được"), giá đăng ký năm đầu từ bảng giá (`priceFor`, `src/services/pricing.ts`), nút "Thêm vào giỏ" gửi vào `POST /gio-hang/them` sẵn có (`src/routes/cart.ts` dòng 43 trở đi, đã kiểm lại `checkDomain` trước khi thêm).
   4. Tên đã có chủ vẫn hiện nhưng mờ đi, có liên kết WHOIS; tên còn trống xếp lên trước.
   5. Có liên kết "Thử mô tả khác" và "Tìm theo từ khóa" quay về ô tìm thường.
3. Chủ bật hoặc tắt tính năng, đặt khóa AI, model, trần chi phí và giới hạn ngay trong Quản trị, mục Cấu hình (`/admin/cau-hinh`), không cần sửa .env hay khởi động lại. Tắt thì tab AI ẩn và đường dẫn trả trang thông báo thân thiện.
4. Chủ xem được trong quản trị: số lượt gợi ý trong ngày, chi phí AI ước tính trong ngày, số lượt bị chặn do giới hạn, số gợi ý được thêm vào giỏ.

## 3. Phạm vi

- Tab "Tìm cùng AI" ở hero trang chủ và một trang kết quả gợi ý riêng dưới BASE_PATH (tên đường dẫn chốt ở bước Design).
- Gọi AI từ máy chủ, khóa lưu mã hóa trong bảng `settings` như các khóa khác (`src/lib/settings.ts` dòng 56 đến 63 mã hóa AES-GCM; danh sách khóa bí mật `SECRET_KEYS` dòng 190 đến 202). Khóa không bao giờ xuất hiện trong HTML, log hay trình duyệt.
- Chuẩn hóa tên do AI trả: bỏ dấu tiếng Việt, chỉ giữ a đến z, 0 đến 9 và gạch nối, độ dài hợp lệ, khớp `domainSchema` (`src/lib/validate.ts` dòng 16 đến 24), chỉ giữ đuôi đang bán (`listTlds({ activeOnly: true })`).
- Lọc từ cấm và từ nhạy cảm trước khi kiểm tra P.A (danh sách do chủ duyệt, có thể sửa trong quản trị).
- Kiểm tra trạng thái bằng `checkDomains` (`src/pavietnam/client.ts` dòng 278, song song tối đa 4) qua bộ đệm 120 giây sẵn có (`domains.ts` dòng 8, 115 đến 130), không bao giờ hiện "Còn trống" nếu chưa có kết quả `1` thật từ P.A.
- Giới hạn chống lạm dụng: theo IP (dùng `rateLimit` sẵn có, `src/middleware/ratelimit.ts`, khóa theo đường dẫn và IP thật qua `CLIENT_IP_HEADER`), giới hạn độ dài mô tả, trần số lượt và trần chi phí toàn trang mỗi ngày; chạm trần thì tự tắt AI đến hết ngày và vẫn cho tìm thường.
- Mục cấu hình mới trong `/admin/cau-hinh` (`src/routes/admin.ts`, mảng `SETTING_FIELDS` dòng 75) và số liệu đếm cơ bản.
- Test tự động cho phần chuẩn hóa tên, lọc từ, giới hạn, trạng thái tắt, và giả lập AI (không gọi AI thật trong `npm test`).

## 4. Ngoài phạm vi

- Không làm chat AI hỏi đáp, không làm trợ lý tư vấn nhiều lượt.
- Không gợi ý bằng JavaScript tức thì khi gõ (gõ đến đâu gợi ý đến đó).
- Không tạo logo, slogan hay nội dung website bằng AI.
- Không tên miền tiếng Việt có dấu (IDN, punycode `xn--`) trong lần này: chỉ gợi ý tên không dấu. Ghi lại để làm sau nếu chủ muốn.
- Không đổi luồng giỏ hàng, thanh toán, cấp phát.
- Không đưa trang kết quả AI vào sitemap hay cho lập chỉ mục.
- Không đẩy mô tả của khách sang CRM hay Mineflow trừ khi chủ chốt ở mục 7.
- Không push, không merge, không đụng VPS ở bước này.

## 5. Ràng buộc

- Kỹ thuật: Node 20, TypeScript, Express 4, EJS, SQLite (`package.json`); app chạy dưới `BASE_PATH=/ten-mien` (`src/config.ts` dòng 40 đến 61), mọi liên kết phải qua tiền tố `base`.
- CSP chặt: `script-src 'self'`, `connect-src 'self'`, `form-action 'self'` (`src/lib/csp.ts` dòng 47 đến 58). Trình duyệt không được gọi thẳng nhà cung cấp AI; mọi lời gọi đi từ máy chủ. Không thêm script nội tuyến.
- Không JavaScript bắt buộc: biểu mẫu gửi về máy chủ, máy chủ trả trang HTML. Nên dùng POST có CSRF (`src/middleware/csrf.ts`) để trang khác và bot không kích hoạt lời gọi AI tốn tiền qua một đường dẫn GET (quyết định cuối ở bước Design).
- Tải P.A: mỗi tên gợi ý trên mỗi đuôi là một lệnh `check_whois` thật từ IP VPS đã whitelist (`client.ts` dòng 250 đến 255; timeout 30 giây, thử lại 2 lần theo `config.ts` dòng 79 đến 80). Ví dụ 8 tên x 2 đuôi = 16 lệnh mỗi lượt. Phải có trần số lệnh P.A mỗi lượt để không làm P.A hạn chế IP và không làm chậm khách khác.
- Giới hạn tần suất hiện lưu trong bộ nhớ một tiến trình (`ratelimit.ts` dòng 1 đến 4): đủ cho triển khai hiện tại, khởi động lại thì đếm lại từ đầu. Trần chi phí ngày phải lưu bền (CSDL), không dựa vào bộ nhớ.
- Khách đang chạy: web đang bán thật; tính năng phải tắt được tức thì, và khi AI lỗi, hết tiền (lỗi 402 nếu dùng cổng api.mientaymedia.com) hoặc chậm thì trang vẫn hiện được, gợi ý dùng ô tìm thường.
- Pháp lý: tên miền .vn có quy định về tên miền liên quan đến cơ quan nhà nước, tên gọi quốc gia, từ vi phạm thuần phong mỹ tục (văn bản hiện hành cần xác minh, ví dụ Thông tư của Bộ TT&TT về quản lý tài nguyên Internet). Không được gợi ý tên trùng thương hiệu lớn đã biết. Nếu lưu mô tả khách thì phải tuân Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân (cần xác minh văn bản thay thế nếu có).
- Ngân sách: chi phí AI trả theo token; chưa có con số trần, cần chủ chốt.
- Quy tắc giá công ty: chỉ hiện giá đang bán từ bảng giá, không bịa khuyến mãi (như intent trang chủ, `docs/mtm/trang-chu/intent.md`).

## 6. Tiêu chí hoàn thành ĐO ĐƯỢC

1. `npm run typecheck`, `npm test`, `npm run kiem-dau` đều sạch; có tệp test mới (ví dụ `test/tra-cuu-ai.test.ts`) chạy được không cần mạng và không cần khóa AI thật.
2. Test chuẩn hóa: đầu vào "Bánh Mì Cô Ba", "café-đà-lạt", "  --abc--  ", chuỗi 70 ký tự trở lên, chuỗi có ký tự lạ cho ra tên không dấu hợp lệ theo `domainSchema` hoặc bị loại; không có tên nào chứa ký tự ngoài `[a-z0-9-]`, không bắt đầu hay kết thúc bằng `-`.
3. Test an toàn trạng thái: khi `checkDomains` giả lập trả lỗi hoặc không trả kết quả cho một tên, trang hiện "Chưa kiểm tra được" và KHÔNG có nút "Thêm vào giỏ" ở dạng "Còn trống" cho tên đó. Không có đường nào hiện "Còn trống" nếu P.A không trả `1`.
4. Test chỉ đuôi đang bán: AI giả lập trả `abc.xyz` (đuôi không có trong bảng giá) thì tên đó bị loại hoặc đổi sang đuôi khách chọn; mọi dòng "Còn trống" đều có giá khác rỗng từ `priceFor`.
5. Test lọc từ: mô tả hoặc gợi ý chứa từ trong danh sách cấm (ví dụ tên cơ quan nhà nước, thương hiệu mẫu do chủ duyệt) thì không gọi P.A cho tên đó và không hiện ra.
6. Test giới hạn: lượt thứ (giới hạn IP + 1) trong cửa sổ trả 429 với thông báo tiếng Việt; mô tả dài hơn giới hạn bị từ chối trước khi gọi AI (đếm số lời gọi AI giả lập = 0).
7. Test trần ngày: khi tổng chi phí ước tính trong ngày đạt trần, lượt tiếp theo không gọi AI (đếm = 0) và trang hiện thông báo dùng ô tìm thường.
8. Test bật tắt: đặt `ai.enabled = 0` thì trang chủ không còn tab AI (kiểm bằng chuỗi HTML trong test trang chủ, tương tự `test/trang-chu.test.ts`) và đường dẫn AI trả trang thông báo, không lỗi 500.
9. Test bí mật: khóa AI nằm trong `SECRET_KEYS`, lưu vào `settings` ở dạng mã hóa (`is_secret = 1`), trang `/admin/cau-hinh` chỉ hiện dạng che `***`; tìm chuỗi khóa thử trong HTML trả về và trong log ghi ra đều không thấy.
10. Test CSP và không JS: trang kết quả không có `<script>` nội tuyến, không có `on*=` trong thuộc tính, `test/csp.test.ts` vẫn qua; tắt JavaScript trên trình duyệt vẫn gửi được mô tả và thấy kết quả (thao tác tay trên bản chạy thử).
11. Trần tải P.A: test đếm số lệnh `check_whois` giả lập mỗi lượt không vượt trần cấu hình (đề xuất mặc định 16).
12. Độ trễ: trên bản chạy thử với AI thật, 10 lượt liên tiếp có trung vị thời gian phản hồi trang dưới 8 giây và không lượt nào quá 20 giây (quá thì trả kết quả phần đã có hoặc thông báo lỗi thân thiện). Đo bằng `curl -w "%{time_total}"` hoặc log.
13. SEO: `robots.txt` có dòng `Disallow` cho đường dẫn AI (kiểm bằng `curl .../ten-mien/robots.txt`), trang kết quả có `noindex`, sitemap không chứa đường dẫn AI.
14. Giao diện: tab AI hiển thị đúng ở 360px và 1280px, không tràn ngang (`test/css-tran-ngang.test.ts` vẫn qua), có ảnh chụp lưu cạnh tệp này ở bước Test.
15. Đo trên thật sau 7 ngày chạy: có số lượt gợi ý, chi phí ngày, số lượt bị chặn, số gợi ý được thêm vào giỏ hiện trong quản trị (kiểm bằng thao tác mở trang quản trị).

## 7. Câu hỏi chủ cần chốt

1. Nhà cung cấp AI và khóa: (a) dùng cổng của công ty `api.mientaymedia.com` (chuẩn Anthropic, khóa `sk-mtm-...`, nạp VNĐ, theo `06-api-key-ai.md`), hay (b) gọi thẳng Anthropic API bằng khóa riêng? Đề xuất (a) vì trả bằng VNĐ, xem chi phí trong dashboard công ty và làm ví dụ sống cho sản phẩm; model đề xuất là dòng Claude nhẹ và rẻ mới nhất (ví dụ `claude-haiku-5-5`, cần xác minh tên model có trong danh mục cổng). Ai tạo khóa và nạp tiền?
2. Trần chi phí AI mỗi ngày là bao nhiêu (VNĐ)? Đề xuất khởi đầu 50.000đ/ngày, chạm trần thì tự tắt AI đến hết ngày.
3. Số gợi ý mỗi lượt là bao nhiêu? Đề xuất 8 tên, mỗi tên kiểm tối đa 2 đuôi (tối đa 16 lệnh P.A mỗi lượt).
4. Giới hạn mỗi IP: đề xuất 5 lượt/phút và 30 lượt/ngày; mô tả tối đa 200 ký tự. Có cần thêm captcha không (đề xuất KHÔNG ở bản đầu vì captcha bên thứ ba phải nới CSP và cần JS; chỉ bật nếu số liệu cho thấy bị lạm dụng)?
5. Có bắt khách đăng nhập mới dùng AI không? Đề xuất KHÔNG bắt, nhưng khách đã đăng nhập được hạn mức cao hơn.
6. Có lưu mô tả khách nhập để làm marketing hoặc đưa vào CRM không? Liên quan dữ liệu cá nhân (mô tả có thể chứa tên, số điện thoại, địa chỉ). Đề xuất: chỉ lưu số đếm và thống kê ẩn danh, KHÔNG lưu nguyên văn; nếu muốn lưu thì phải có câu đồng ý rõ trên form, thời hạn xóa, và cập nhật chính sách bảo mật.
7. Danh sách từ cấm và thương hiệu cần chặn: chủ duyệt danh sách khởi đầu do bước Design soạn (từ nhạy cảm theo quy định .vn, tên cơ quan nhà nước, thương hiệu lớn), hay giao nhân viên phụ trách?
8. Tên tab và câu chữ: "Tìm cùng AI" có ổn không, có nêu rõ "gợi ý do AI tạo, kiểm tra trạng thái thật qua nhà đăng ký" không?

## 8. Rủi ro

| Rủi ro | Hậu quả | Cách giảm |
| --- | --- | --- |
| Bot hoặc người xấu bấm liên tục | Tốn tiền AI, P.A hạn chế IP VPS, ảnh hưởng tra cứu và cấp phát thật | Giới hạn theo IP, trần ngày lưu CSDL, POST có CSRF, trần lệnh P.A mỗi lượt, công tắc tắt nhanh trong quản trị |
| AI gợi ý tên đã có chủ nhưng nói "còn trống" | Khách mất lòng tin, đơn thất bại | Không bao giờ lấy trạng thái từ AI; chỉ hiện "Còn trống" khi P.A trả `1`; giỏ hàng kiểm lại lần nữa (`cart.ts`) |
| Tên vi phạm thương hiệu, từ nhạy cảm, nội dung không phù hợp | Rủi ro pháp lý, hồ sơ .vn bị từ chối, xấu hình ảnh | Chỉ dẫn hệ thống cấm, bộ lọc từ phía máy chủ sau khi AI trả, câu miễn trừ "khách tự chịu trách nhiệm về quyền với tên" |
| Khách nhập nội dung chèn lệnh (prompt injection) để AI trả nội dung lạ | Hiện chữ bậy trên trang | Chỉ hiện tên đã qua chuẩn hóa và lý do ngắn đã cắt độ dài, escape HTML (EJS `<%=`), không hiện nguyên văn câu trả lời AI |
| AI chậm hoặc lỗi, hết số dư | Trang treo, khách bỏ đi | Thời gian chờ ngắn, thông báo thân thiện, gợi ý dùng ô tìm thường; cảnh báo chủ khi lỗi 402 |
| Chi phí vượt dự kiến | Lỗ | Model nhẹ, giới hạn token ra, trần ngày, số liệu chi phí trong quản trị |
| Tiếng Việt không dấu sai nghĩa hoặc khó đọc ("ga" và "gà") | Gợi ý kém | Ghép chỉ dẫn yêu cầu tên dễ đọc, có thể có gạch nối; khách chọn đuôi; đánh giá bằng bộ mẫu ở bước Test |
| Punycode và tên có dấu | Khách gõ có dấu, mong tên có dấu | Bản này chỉ gợi ý không dấu, ghi rõ trên trang; IDN để sau |
| SEO: trang kết quả mỏng, nhiều URL | Ảnh hưởng xếp hạng trang chính | `noindex`, `Disallow` trong robots, không vào sitemap |
| Dữ liệu cá nhân trong mô tả | Vi phạm quy định bảo vệ dữ liệu | Mặc định không lưu nguyên văn, không ghi mô tả vào log (chờ chủ chốt câu 6) |
| Giới hạn trong bộ nhớ mất khi khởi động lại hoặc chạy nhiều tiến trình | Lách được giới hạn | Trần ngày và trần chi phí lưu CSDL; nếu chạy nhiều tiến trình thì giới hạn thêm ở tầng Traefik hoặc Cloudflare |

## Phương án đề xuất (để bước Design làm chi tiết)

Máy chủ nhận mô tả, gọi một model Claude nhẹ qua cổng `api.mientaymedia.com` (chuẩn Anthropic) với chỉ dẫn cố định và đầu ra có cấu trúc (danh sách tên gốc và lý do ngắn), chuẩn hóa và lọc ở máy chủ, ghép với đuôi khách chọn hoặc đuôi nổi bật, kiểm thật qua `checkDomains` có bộ đệm, rồi trả trang HTML dùng lại thẻ kết quả và nút giỏ hàng của trang `/tim-kiem`. Toàn bộ cấu hình (bật tắt, khóa, model, N, giới hạn, trần ngày, danh sách từ cấm) nằm trong `/admin/cau-hinh`. Mặc định TẮT khi triển khai, chủ bật sau khi nạp khóa và thử.


## Quyết định của chủ (18/10/2026)

- Nhà cung cấp AI: **OpenAI** (không dùng Anthropic hay cổng api.mientaymedia.com). Gọi OpenAI API từ máy chủ; khóa OpenAI do chủ tạo và nạp tiền, nhập trong /admin/cau-hinh, lưu mã hóa, không ra trình duyệt. Tên model là cấu hình (chủ chọn model nhỏ, rẻ hiện hành của OpenAI); dùng đầu ra có cấu trúc JSON.
- Giới hạn theo đề xuất: trần chi phí 50.000 đ/ngày (chạm trần tự tắt đến hết ngày, ô tìm thường vẫn chạy); 8 gợi ý mỗi lượt, mỗi tên tối đa 2 đuôi (tối đa 16 lệnh P.A); mỗi IP 5 lượt/phút và 30 lượt/ngày; mô tả tối đa 200 ký tự; không captcha; không bắt đăng nhập.
- Dữ liệu: KHÔNG lưu nguyên văn mô tả khách; chỉ thống kê ẩn danh (số lượt, số gợi ý, tỷ lệ thêm vào giỏ, chi phí).
- Giao diện: tab "Tìm cùng AI", có dòng ghi chú "Gợi ý do AI tạo, trạng thái còn trống được kiểm tra thật qua nhà đăng ký". Danh sách từ cấm và thương hiệu: dùng danh sách mặc định, chủ sửa trong Cấu hình.
- Triển khai: mặc định TẮT cho tới khi chủ nhập khóa OpenAI và bật.
