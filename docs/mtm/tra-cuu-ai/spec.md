---
type: spec
du_an: tra-cuu-ai
buoc: 2 - Design
dau_vao: docs/mtm/tra-cuu-ai/intent.md (mục "Quyết định của chủ" 18/10/2026 là chính thức)
nhanh: mtm/tra-cuu-ai (worktree D:\api-pavietnam-ai, tách từ mtm/trang-chu 9c55284 + intent c6adc32)
cap_nhat: 18/10/2026
---

# Spec: Tìm tên miền cùng AI

Chủ đã chốt: OpenAI, mặc định TẮT, trần 50.000 đ/ngày, 8 tên x 2 đuôi (tối đa 16 lệnh P.A), mỗi IP 5 lượt/phút và 30 lượt/ngày, mô tả tối đa 200 ký tự, không captcha, không bắt đăng nhập, KHÔNG lưu nguyên văn mô tả.

## 1. Đường dẫn

| Đường dẫn | Việc |
|---|---|
| `GET /tim-cung-ai` | Trang có form gợi ý (để "Thử mô tả khác" và khi khách mở thẳng). AI chưa sẵn sàng thì hiện thông báo thân thiện, mã 200, gợi ý dùng ô tìm thường. |
| `POST /tim-cung-ai` | Nhận `_csrf`, `mo_ta`, `duoi` (lặp lại được). Qua 2 lớp giới hạn IP, kiểm hợp lệ, gọi dịch vụ gợi ý, trả trang kết quả HTML. |

- Cả hai trang: `<meta name="robots" content="noindex, nofollow">` và header `X-Robots-Tag: noindex, nofollow`. `robots.txt` thêm `Disallow: /tim-cung-ai` (có tiền tố BASE_PATH như các dòng khác). Không thêm vào sitemap.
- POST đi qua `csrfMiddleware` sẵn có (không miễn trừ): trang khác và bot không kích hoạt lời gọi AI tốn tiền qua GET.
- Nút "Thêm vào giỏ" gửi `POST /gio-hang/them` sẵn có, thêm trường ẩn `nguon=ai` chỉ để đếm thống kê.

## 2. Giao diện

- Hero trang chủ (`src/views/home.ejs`): radio thứ ba `tc-tab-ai`, nhãn "Tìm cùng AI", form `tc-panel-ai` gồm ô mô tả (`maxlength=200`, bắt buộc), nút "Gợi ý tên", dãy ô chọn "Đuôi ưa thích (tùy chọn)" lấy từ đuôi đang bán (nổi bật trước, tối đa 6), dòng ghi chú "Gợi ý do AI tạo, trạng thái còn trống được kiểm tra thật qua nhà đăng ký." Đổi tab chỉ bằng CSS `:checked ~`, không JS. Tab chỉ hiện khi AI sẵn sàng (mục 4).
- Màn hẹp (dưới 480px): dải nhãn tab được xuống dòng để 3 nhãn không tràn ngang ở 360px.
- Trang kết quả (`src/views/tim-cung-ai.ejs`): form điền lại mô tả vừa gửi (chỉ trong phản hồi này, không lưu), ghi chú AI, danh sách kết quả dùng lại lớp `.result` của trang `/tim-kiem`: tên miền, một câu lý do (cắt 120 ký tự, in bằng `<%=`), trạng thái "Còn trống" / "Đã có người đăng ký" / "Chưa kiểm tra được", giá đăng ký năm đầu (`priceFor`) và nút "Thêm vào giỏ" chỉ với dòng "Còn trống"; dòng đã có chủ mờ đi, có nút WHOIS. Xếp: còn trống, chưa kiểm tra được, đã có chủ. Cuối trang: liên kết "Thử mô tả khác" (về ô mô tả) và "Tìm theo từ khóa" (về `/#tim-ten-mien`).
- Câu miễn trừ: "Bạn tự chịu trách nhiệm về quyền sử dụng tên (thương hiệu, nhãn hiệu) trước khi đăng ký."
- Không chỉ báo "đang xử lý" bằng CSS: CSS không biết form đã gửi khi không có JS (xem Lệch spec trong plan).

## 3. Cấu hình (`/admin/cau-hinh`, nhóm "Tìm cùng AI", tiền tố `ai.`)

| Khóa | Mặc định | Ghi chú |
|---|---|---|
| `ai.enabled` | 0 | Công tắc. |
| `ai.openai_key` | trống | Bí mật: thêm vào `SECRET_KEYS`, lưu AES-GCM, ô nhập hiện dạng che, không vào log hay audit. |
| `ai.model` | trống | Chủ nhập tên model nhỏ hiện hành của OpenAI. |
| `ai.reasoning_effort` | trống | Chỉ gửi khi có giá trị (model suy luận). |
| `ai.daily_cap_vnd` | 50000 | Trần chi phí ước tính mỗi ngày (giờ Việt Nam). |
| `ai.price_input_usd` | 1 | USD cho 1 triệu token vào. Cố ý đặt cao hơn giá model nhỏ để ước tính dư (an toàn), chủ sửa theo bảng giá. |
| `ai.price_output_usd` | 5 | USD cho 1 triệu token ra (gồm token suy luận). |
| `ai.usd_vnd` | 27000 | Tỷ giá. |
| `ai.max_names` | 8 | Số tên tối đa mỗi lượt. |
| `ai.max_checks` | 16 | Trần lệnh `check_whois` mỗi lượt. |
| `ai.rate_per_minute` | 5 | Lượt mỗi phút mỗi IP. |
| `ai.rate_per_day` | 30 | Lượt mỗi 24 giờ mỗi IP. |
| `ai.timeout_sec` | 15 | Thời gian chờ OpenAI. |
| `ai.blocked_words` | danh sách mặc định | Ô nhiều dòng, cách nhau bằng dấu phẩy hoặc xuống dòng. |

Giá trị trống, không phải số hoặc nhỏ hơn hoặc bằng 0 của đơn giá, tỷ giá, trần thì dùng mặc định (để không bao giờ ước tính chi phí bằng 0). Số tên và số lệnh bị kẹp trong [1, 8] và [1, 16]: cấu hình không vượt được quyết định của chủ.

`ai.openai_key` không đọc từ .env (chỉ trong Cấu hình). Địa chỉ API mặc định `https://api.openai.com/v1`, đổi được bằng biến môi trường `OPENAI_BASE_URL` (chỉ người vận hành máy chủ, không có ô trong quản trị để không gửi khóa sang máy lạ); test dùng biến này trỏ về máy chủ giả lập cục bộ.

## 4. AI sẵn sàng khi

`ai.enabled = 1` VÀ có khóa VÀ có model VÀ chi phí ước tính hôm nay (giờ Việt Nam, UTC+7) nhỏ hơn trần. Thiếu một điều kiện: tab ẩn, `GET`/`POST /tim-cung-ai` hiện thông báo (mã 200), ô tìm thường không bị ảnh hưởng.

## 5. Lớp nhà cung cấp (`src/lib/ai/`)

- `types.ts`: giao diện `NhaCungCapGoiY { ten; goiY(dauVao, tuyChon): Promise<KetQuaAi> }`, `KetQuaAi = { goiY: { ten, lyDo }[]; tokenVao; tokenRa }`, lỗi `AiError { ma: 'timeout' | 'http' | 'het-tien' | 'tu-choi' | 'dinh-dang' | 'mang'; tokenVao?; tokenRa? }`.
- `openai.ts`: `POST {base}/chat/completions` bằng `fetch` + `AbortController` (không thử lại: tốn tiền và chậm). Thân: `model`, `messages` (chỉ dẫn hệ thống cố định + mô tả khách trong tin nhắn người dùng), `response_format: { type: 'json_schema', json_schema: { name: 'goi_y_ten_mien', strict: true, schema } }` với schema `{ goi_y: [{ ten: string, ly_do: string }] }`, `max_completion_tokens: 1200`, `reasoning_effort` nếu có. Đọc `usage.prompt_tokens`, `usage.completion_tokens`. Từ chối (`message.refusal`), JSON hỏng, `finish_reason = length` là lỗi `dinh-dang`; HTTP 401/403/429 hết hạn mức (`insufficient_quota`) phân loại riêng để quản trị thấy trong log.
- Không bao giờ ghi khóa, thân yêu cầu, thân phản hồi lỗi (lỗi 401 của OpenAI có đoạn khóa) hay mô tả vào log. Log chỉ: mã lỗi, mã HTTP, thời gian, số token.
- `index.ts`: `layNhaCungCap()` trả bản OpenAI theo cấu hình. Đổi nhà cung cấp sau này chỉ thêm tệp mới và đổi hàm này.

## 6. Dịch vụ (`src/services/goiYTenMien.ts`)

`goiYTenMien({ moTa, duoi }, deps)`; `deps` mặc định là nhà cung cấp thật và bộ kiểm tra có bộ đệm; test truyền bản giả.

1. Chưa sẵn sàng: trả `tat` hoặc `het-han-muc` (đếm `bi_chan` khi do trần), không gọi AI.
2. Mô tả: gộp khoảng trắng, 3 đến 200 ký tự (đếm theo ký tự Unicode); sai thì `khong-hop-le`, không gọi AI. Route cũng kiểm trước để trả mã 400.
3. Gọi AI; cộng chi phí vào bảng ngày NGAY khi có `usage` (kể cả khi đầu ra hỏng). Lỗi không có `usage` (hết giờ, mất mạng sau khi đã gửi) thì cộng chi phí xấu nhất (500 token vào + 1200 token ra) vì OpenAI có thể vẫn tính tiền. Lỗi HTTP 4xx (yêu cầu bị từ chối) không cộng.
4. Hậu xử lý từng tên: bỏ dấu (`boDau` + `đ`), chữ thường; có dấu chấm thì chỉ lấy nhãn đầu (đuôi do AI đưa bị bỏ, dùng đuôi của mục 5); khoảng trắng và `_` thành `-`; bỏ ký tự ngoài `[a-z0-9-]`; gộp `-` liên tiếp; bỏ `-` đầu cuối; độ dài nhãn 2 đến 63, dài hơn thì LOẠI (không cắt); bỏ trùng; lọc từ cấm; giữ tối đa `max_names`.
5. Đuôi: các đuôi khách chọn có trong `listTlds({ activeOnly: true })` (tối đa 2, theo thứ tự hiển thị); không chọn thì 2 đuôi nổi bật đầu; không có thì 2 đuôi đang bán đầu. Ghép tên x đuôi, mỗi tên qua `domainSchema`, cắt ở `max_checks`.
6. Kiểm tra: hàm `kiemTraNhieu` tách từ `searchDomains` (`src/services/domains.ts`, dùng chung bộ đệm 120 giây, `checkDomains` song song 4). "Còn trống" CHỈ khi P.A (hoặc bộ đệm từ P.A) trả có; không có kết quả, lỗi hoặc thiếu dòng thì "Chưa kiểm tra được"; giá chỉ gắn cho dòng còn trống.
7. Lý do: bỏ ký tự điều khiển, gộp khoảng trắng, cắt 120 ký tự; không bao giờ hiện nguyên văn phản hồi AI ngoài trường này.
8. Thống kê: cộng `luot`, `goi_y` (số tên sau lọc), `con_trong`, `loi`.

### Lọc từ cấm

So khớp trên tên đã bỏ dấu. Từ cấm cũng bỏ dấu và bỏ `-`. Từ 4 ký tự trở lên: khớp chuỗi con trên tên đã bỏ `-` ("honda" chặn "hondacantho"). Từ ngắn hơn: chỉ khớp nguyên một khúc giữa các dấu `-` ("bet" chặn "bet-88" nhưng không chặn "betong"). Danh sách mặc định gồm cơ quan nhà nước và từ nhạy cảm theo quy định .vn (ví dụ chinhphu, quochoi, congan, quandoi, ubnd, nhanuoc), từ cờ bạc, đồi trụy, ma túy, và thương hiệu lớn (google, facebook, zalo, shopee, viettel, vinamilk, ...). Mô tả của khách KHÔNG bị chặn vì chứa từ cấm (ví dụ "phụ kiện iphone" là nhu cầu thật); chỉ tên gợi ý bị loại trước khi gọi P.A.

## 7. Giới hạn và trần

- `rateLimit` sẵn có, thêm 2 tùy chọn nhỏ: `max` nhận hàm (đọc cấu hình lúc chạy) và `onLimit` (để đếm `bi_chan`). Hai lớp trên `POST /tim-cung-ai` có khóa riêng (`phut:`/`ngay:` + IP) vì khóa mặc định theo đường dẫn sẽ làm hai lớp dùng chung một bộ đếm. IP là `req.ip`, đã là IP thật khi đặt `CLIENT_IP_HEADER`.
- Thông báo 429 bằng tiếng Việt, trang lỗi sẵn có.
- Trần chi phí lưu trong bảng mới (mục 8), không trong bộ nhớ: khởi động lại không đếm lại.

## 8. CSDL (`src/db/schema.sql`, `CREATE TABLE IF NOT EXISTS`, `migrate` tạo được trên CSDL cũ)

```sql
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  ngay        TEXT PRIMARY KEY,           -- YYYY-MM-DD theo gio Viet Nam
  luot        INTEGER NOT NULL DEFAULT 0, -- so lan da goi AI
  bi_chan     INTEGER NOT NULL DEFAULT 0, -- bi chan do gioi han IP hoac tran
  loi         INTEGER NOT NULL DEFAULT 0,
  goi_y       INTEGER NOT NULL DEFAULT 0,
  con_trong   INTEGER NOT NULL DEFAULT 0,
  them_gio    INTEGER NOT NULL DEFAULT 0,
  token_vao   INTEGER NOT NULL DEFAULT 0,
  token_ra    INTEGER NOT NULL DEFAULT 0,
  chi_phi_vnd REAL    NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

Chỉ số đếm, không có cột nào chứa mô tả, IP hay tên miền.

## 9. Quản trị

- `/admin` (Tổng quan): thẻ "Tìm cùng AI" với trạng thái (Đang bật / Tắt / Chạm trần hôm nay / Thiếu khóa hoặc model), chi phí hôm nay trên trần, bảng 14 ngày gần nhất: lượt, bị chặn, lỗi, gợi ý, còn trống, thêm vào giỏ, chi phí.
- `/admin/cau-hinh`: nhóm "Tìm cùng AI" (mục 3); trang cấu hình hiển thị được kiểu `textarea` (đã khai báo trong kiểu `SETTING_FIELDS` nhưng view chưa vẽ).

## 10. Kiểm (test tự động, không mạng thật)

`test/tra-cuu-ai.test.ts` (máy chủ OpenAI giả lập cục bộ qua `OPENAI_BASE_URL`, P.A sandbox, IP khác nhau mỗi test qua `CLIENT_IP_HEADER`):

1. Chuẩn hóa: "Bánh Mì Cô Ba", "café-đà-lạt", "  --abc--  ", chuỗi 70 ký tự, ký tự lạ, `abc.xyz`; kết quả khớp `[a-z0-9-]`, không đầu cuối `-`, qua `domainSchema` hoặc bị loại.
2. Lọc từ cấm, từ ngắn và dài.
3. Đuôi: chỉ đuôi đang bán, `abc.xyz` đổi sang đuôi khách chọn; trần 16 lệnh (đếm lời gọi bộ kiểm giả); dòng còn trống có giá.
4. An toàn trạng thái: bộ kiểm giả trả lỗi hoặc thiếu dòng thì "Chưa kiểm tra được", không có nút giỏ.
5. Trần chi phí: đặt chi phí hôm nay bằng trần thì không gọi AI (đếm máy giả = 0), tab ẩn, trang báo dùng ô tìm thường; cộng chi phí đúng theo usage và đơn giá; lỗi hết giờ cộng chi phí xấu nhất.
6. Giới hạn: lượt thứ 6 trong phút trả 429 tiếng Việt; mô tả 201 ký tự trả 400 và máy giả không bị gọi.
7. Bật tắt: tắt thì trang chủ không có tab AI, `/tim-cung-ai` không lỗi 500.
8. CSRF: POST thiếu hoặc sai token trả 403, máy giả không bị gọi.
9. SEO: trang kết quả có `noindex`, robots có `Disallow: /tim-cung-ai`, sitemap không có.
10. Bí mật: khóa nằm trong `SECRET_KEYS`, lưu `is_secret = 1` và không phải chữ trơn, trang cấu hình không chứa khóa, log ghi ra trong lượt gọi không chứa khóa và mô tả.
11. CSP: trang kết quả không `<script>` nội tuyến, không `on*=`.
12. Lỗi AI (500, JSON hỏng, hết giờ): trang thân thiện mã 200, không 500.

Cổng chặn mỗi commit: `npx tsc -p tsconfig.json --noEmit`, `npm test`, `npm run kiem-dau` 0, `MSYS_NO_PATHCONV=1 node scripts/kiem-base.mjs` 0. Ảnh chụp ở 1366 và 360px: tab AI và trang kết quả (OpenAI giả lập, P.A sandbox).
