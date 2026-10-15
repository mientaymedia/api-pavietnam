---
type: spec
du_an: api-pavietnam (nền tảng bán tên miền tự động trên API đại lý P.A Việt Nam)
buoc: 2 - Design
dau_vao: docs/mtm/api-pavietnam/intent.md (đã chốt, mục 7 "Quyết định của chủ")
moc_ma: main @ 55b3a60 (cộng thay đổi chưa commit ở package.json: khối allowScripts)
cap_nhat: 15/10/2026
---

# Spec: chuyển toàn bộ chữ hiển thị sang tiếng Việt có dấu

## 1. Tóm tắt giải pháp

Thêm dấu cho mọi chữ khách và quản trị viên nhìn thấy (giao diện EJS, tiêu đề trang và flash trong route, thông điệp JSON của `/api`, email, nhãn và tham số ZNS, lỗi kiểm tra dữ liệu, tiêu đề cột CSV, chữ trong `public/js/app.js`) bằng cách sửa trực tiếp chuỗi tại chỗ, không thêm tầng từ điển hay thư viện i18n. Việc chia thành 13 bước nhỏ theo nhóm tệp, mỗi bước một commit và mỗi commit đều xanh (biên dịch sạch, test đạt, mã băm URL và tên trường không đổi). Trước khi đụng vào chữ, làm ba việc nền: (1) công cụ quét `scripts/kiem-dau.mjs` để đo chữ không dấu còn sót và chặn ký tự NFD; (2) sửa L2 (`npm test` chạy được trên Windows qua script Node, không cần `cross-env`) và L1 (sandbox được xét trước khi đòi username/API Key) để đạt 171/171 ngay từ đầu; (3) chuẩn hoá chữ trước khi so khớp ở những chỗ logic phụ thuộc chữ (`provisioning.ts`, `client.ts`), để biểu thức chính quy khớp cả thông báo P.A có dấu lẫn không dấu. Thương hiệu hiển thị là "MienTay Media", tiền là "830.000 đ". Mọi chuỗi máy đọc (URL, `name`, khoá cấu hình, tên tham số ZNS, mã đơn, nội dung chuyển khoản, chuỗi ký MoMo/ZaloPay, phản hồi webhook) giữ nguyên và được khoá bằng mã băm trước-sau.

Theo cập nhật intent mục 7, web chạy dưới đường dẫn con `https://mientaymedia.com/ten-mien`. Một bước riêng (B3, làm TRƯỚC mọi bước thêm dấu vì cùng chạm link trong view) thêm biến môi trường `BASE_PATH` (mặc định rỗng, chạy ở gốc như cũ): toàn bộ route, tài nguyên tĩnh và trang lỗi được gắn vào một router con mount tại `BASE_PATH`; mọi `res.redirect` đường dẫn nội bộ được tự thêm tiền tố bởi một middleware; link trong EJS được thêm tiền tố bằng cách chèn `<%= base %>` ngay trước dấu `/` (chèn thuần, nên xoá `<%= base %>` đi thì ra đúng chuỗi cũ và mã băm cũ); cookie phiên dùng `path` theo tiền tố; link tuyệt đối (email, sitemap, `ipnUrl`, webhook) đi theo `APP_URL` đã gồm `/ten-mien`. Không đổi đường dẫn route nào bên trong ứng dụng. Đơn hàng sang Pancake POS và CRM là dự án riêng, không thuộc spec này.

Ghi chú về luật repo Javis: repo này (`github.com/mientaymedia/api-pavietnam`) KHÔNG có bản gốc upstream và không có lượt gộp hằng đêm, nên không có tệp nào là "tệp của bản gốc" và không cần đánh dấu `# MTM`. Không có CI (`.github` không tồn tại); mọi kiểm tra chạy local.

## 2. Ánh xạ tiêu chí của intent sang cách đáp ứng

| # | Tiêu chí (intent mục 6) | Cách đáp ứng | Kiểm ở bước |
|---|---|---|---|
| 1 | Không còn chữ không dấu trong phạm vi | `scripts/kiem-dau.mjs` quét chuỗi TS (qua trình phân tích cú pháp của `typescript`, đã có trong devDependencies) và chữ EJS, so với từ điển từ thiếu dấu; danh sách cho phép ở `scripts/kiem-dau.cho-phep.json`, mỗi mục có lý do. Kết quả cuối phải 0 dòng. | B0 dựng công cụ, B12 chạy toàn bộ |
| 2 | Không có dấu tổ hợp NFD | `kiem-dau.mjs` báo lỗi nếu tệp có U+0300..U+036F, có BOM, hoặc `nội dung !== nội dung.normalize('NFC')`. Thêm lệnh `grep -rnP` của intent làm kiểm chéo. | Mọi bước |
| 3 | Biên dịch sạch | `npm run typecheck` thoát 0 sau mỗi commit. | Mọi bước |
| 4 | Test không lùi, 171/171 | B1 sửa L1, L2 nên từ B1 trở đi phải 171/171. 12 câu so khớp chữ được đổi sang chữ có dấu trong CÙNG commit với chữ nguồn tương ứng (bảng ở mục 3.6). Test mới cộng thêm, nên con số cuối là 171 cũ + số test mới, tất cả đạt. | Mọi bước |
| 5 | URL không đổi | Mã băm `13c9676178cd08b3a27a2dd17d17343e` (216 chuỗi). Route không đổi vì tiền tố nằm ở chỗ mount, không ở định nghĩa route. Thêm khoá phụ: `href=`, `action=`, `src=` trong view, đo sau khi xoá `<%= base %>` (mục 3.4, 3.10). | Mọi bước |
| 6 | Tên trường form không đổi | Mã băm `a78750c5d214bd9ba6f0caa639ece0c0` (176). Thêm khoá phụ: `value=`, `id=`, `for=` trong view, khoá cấu hình `key:`/`settingKey:` trong `src`. | Mọi bước |
| 7 | Trang hiển thị đúng | Express trả `text/html; charset=utf-8` mặc định; `head.ejs` đã có `meta charset`. Kiểm bằng `curl` trên máy chủ chạy sandbox (script trong mục 6.3), một lần với `BASE_PATH` rỗng theo đúng danh sách trang của intent, một lần với `BASE_PATH=/ten-mien` (các đường dẫn đó có thêm tiền tố). | B12 |
| 8 | Email có dấu đọc được | nodemailer tự mã hoá `Subject` dạng `=?UTF-8?..?=`; thêm `<meta charset="utf-8">` vào khung email; test mới dựng thư bằng `streamTransport` và khẳng định header. Gửi thật tới Gmail ở B12. | B11, B12 |
| 9 | CSV mở đúng trong Excel | BOM đã có (`reports.ts:237`), header `text/csv; charset=utf-8` đã có (`admin.ts:372`); tên tệp CSV giữ ASCII (`don-hang-<ngày>.csv`). Chỉ đổi tiêu đề cột. Mở thử bằng Excel ở B12. | B9, B12 |
| 10 | Thanh toán không bị ảnh hưởng | Dòng `momo.ts:27, 32-35, 40` và `zalopay.ts:38, 48, 54-57` không được sửa; thông điệp `verifyIpn` giữ nguyên; `ORDER_CODE_RE` giữ nguyên. Kiểm bằng `git diff` theo dòng (mục 6.2). | B7, B12 |
| 11 | Thương hiệu và đơn vị tiền thống nhất | `config.ts:39` thành `'MienTay Media'`; `.env.example:10, 74` thành `MienTay Media`; `money.ts:10` thành `đ`; `admin.ts:311` (giá trị mẫu `'100.000 d'` viết cứng) chuyển sang `formatVnd(100_000)`. | B4, B9 |
| 12 | Người duyệt chính tả ký xác nhận | B12 sinh bảng kiểm (44 trang EJS, 18 email) cho chủ duyệt trên bản chạy thử (C5). | B12 |
| 13 (mới, cập nhật intent mục 7) | Chạy dưới `BASE_PATH=/ten-mien` không còn link gốc thiếu tiền tố | Thiết kế 3.10. `test/base-path.test.ts` (trong `npm test`) và `scripts/kiem-base.mjs` (bò toàn bộ trang GET kể cả `/admin`, quét `href`, `action`, `src`, header `Location`, `fetch(` trong `app.js`): mọi giá trị bắt đầu bằng `/` phải bắt đầu bằng `/ten-mien/` hoặc bằng đúng `/ten-mien`. Chạy lại với `BASE_PATH` rỗng: mọi test cũ đạt, mã băm `href`/`action`/`src` (sau khi xoá `<%= base %>`) không đổi. | B3, B12 |

## 3. Thiết kế

### 3.1 Thành phần

Không có thành phần nghiệp vụ mới. Bốn thành phần phụ trợ:

1. **`src/lib/text.ts` (mới):** hàm `boDau(s: string): string` trả chuỗi ASCII thường để so khớp:
   `s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()`.
   Chỉ dùng cho so khớp nội bộ, không bao giờ dùng để hiển thị.
2. **`scripts/kiem-dau.mjs` (mới) + `scripts/kiem-dau.cho-phep.json` (mới):** công cụ quét, chạy bằng `npm run kiem-dau` hoặc `node scripts/kiem-dau.mjs [đường dẫn...]` để quét riêng các tệp vừa sửa.
3. **`scripts/chay-test.mjs` (mới):** bộ chạy test đa nền tảng thay cho cú pháp gán biến kiểu Linux (L2).
4. **`src/lib/basePath.ts` (mới) và `scripts/kiem-base.mjs` (mới):** tiền tố đường dẫn và công cụ kiểm link thiếu tiền tố (mục 3.10).
5. **Test mới:** `test/text-match.test.ts`, `test/sandbox.test.ts`, `test/email-encoding.test.ts`, `test/money.test.ts`, `test/base-path.test.ts`.

### 3.2 Logic phụ thuộc chữ (rủi ro R4)

Đã rà toàn bộ `src` các chỗ ra quyết định dựa trên nội dung chữ. Có 5 chỗ:

| Vị trí | Hiện tại | Vấn đề với chữ có dấu | Cách xử lý |
|---|---|---|---|
| `src/services/provisioning.ts:25-38` `isPermanent` | Regex không dấu trên `message` | "Tên miền đã được đăng ký" do P.A trả có dấu không khớp `/da\s*(duoc\s*)?dang\s*ky/i` nên lỗi vĩnh viễn bị thử lại tới 3 lần | Giữ nguyên mảng regex (ASCII), đổi thành `PERMANENT_PATTERNS.some((re) => re.test(boDau(message)))` |
| `src/pavietnam/client.ts:132` `interpret` (nhánh không có trường status) | `/\b(error\|loi\|fail(ed)?\|invalid\|denied\|not\s+allowed\|permission)\b/i.test(raw)` | Phản hồi dạng chữ "Lỗi: Lệnh thực thi không được hỗ trợ" không khớp `loi` (vì "ỗ"), "IP không được phép truy cập" không khớp gì cả, nên lời gọi lỗi bị coi là THÀNH CÔNG. Đây là lỗi có sẵn, nghiêm trọng hơn chuyện hiển thị. | Test trên `boDau(raw)`; thêm `khong\s+duoc\s+phep` và `khong\s+duoc\s+ho\s+tro` vào danh sách từ báo lỗi |
| `src/pavietnam/client.ts:179-186` `checkDomain` | Regex trên `hay.toLowerCase()` | "đã được đăng ký", "khả dụng", "còn trống" có dấu không khớp, rơi về mặc định "không còn trống" (an toàn nhưng sai) | `const hay = boDau(...)`; mở rộng `chua\s*dang\s*ky` thành `chua\s*(duoc\s*)?dang\s*ky` |
| `src/pavietnam/client.ts:380` `whois` | `/no\s+match\|not\s+found\|khong\s+tim\s+thay\|chua\s+dang\s+ky\|available/i.test(text)` | Như trên | Test trên `boDau(text)`, cũng mở rộng `chua\s+(duoc\s+)?dang\s+ky` |
| `src/routes/webhooks.ts:51` | `result.message.includes('Token')` quyết định trả 401 | Nếu dịch "Token webhook khong hop le" mà mất chữ `Token` thì đổi mã HTTP | Không dịch thông điệp `verifyIpn` (xem 3.4). Không sửa `webhooks.ts`. |

Thứ tự trong `isPermanent` và `interpret` sau khi chuẩn hoá: mọi regex là ASCII, `\b` hoạt động đúng vì chuỗi đã là ASCII. Cần test hồi quy rằng thông điệp lỗi do CHÍNH hệ thống sinh ra (sau khi thêm dấu) không vô tình khớp mẫu vĩnh viễn: lấy mọi chuỗi `new RegistrarError(...)` trong `client.ts` (ví dụ "Không kết nối được API P.A Việt Nam: ...", "Nhà đăng ký không trả về mã EPP...", "Cần tối thiểu 2 nameserver.") và khẳng định `isPermanent` trả `false` như trước. Để làm được, `isPermanent` được `export` (thay đổi duy nhất về giao diện hàm, không đổi hành vi).

Hai lỗi P.A "Lệnh thực thi không được hỗ trợ" và "IP không được phép truy cập" là lỗi cấu hình. Spec KHÔNG đưa chúng vào `PERMANENT_PATTERNS` (giữ hành vi: thử lại tối đa 3 lần rồi mới báo lỗi và hoàn tiền), vì sau khi quản trị sửa whitelist thì lần thử lại có thể thành công. Xem điểm cần chủ duyệt D3.

### 3.3 Sửa L1 và L2

**L1, `src/pavietnam/client.ts:59-66`:**

```ts
const sandbox = sandboxEnabled();
if (!sandbox && (!cred.username || !cred.apikey)) {
  throw new RegistrarError('Chưa cấu hình username/API Key của P.A Việt Nam. ...', 'NO_CREDENTIALS');
}
// ...
query.set('username', cred.username || 'sandbox');
query.set('apikey', cred.apikey || 'sandbox');
// ...
if (sandbox) { raw = sandboxResponse(action, params); } else if ...
```

Chế độ thật không đổi gì: vẫn ném `NO_CREDENTIALS` khi thiếu key. `npm run kiem-tra` đã cảnh báo khi bật sandbox ở môi trường thật (`preflight.ts:115`), không cần thêm.

**L2, `package.json:18`:** đổi đúng một dòng `"test"` và thêm một dòng `"kiem-dau"`:

```json
"test": "node scripts/chay-test.mjs",
"kiem-dau": "node scripts/kiem-dau.mjs",
```

`scripts/chay-test.mjs`:
- Nếu chưa có `DATABASE_FILE` trong môi trường: tạo thư mục bằng `fs.mkdtempSync(path.join(os.tmpdir(), 'api-pavietnam-test-'))`, đặt `DATABASE_FILE=<thư mục>/test.sqlite`, xoá thư mục khi chạy xong. Nếu đã có thì dùng giá trị đó (để tiêu chí 4 trong intent vẫn chạy được bằng cú pháp cũ).
- Luôn đặt `PAVIETNAM_SANDBOX=1`: test không bao giờ gọi P.A thật. `dotenv` không ghi đè biến đã có, nên `.env` trên máy dev không làm lệch.
- Liệt kê `test/*.test.ts` bằng `fs.readdirSync` (sắp xếp), không dựa vào glob của shell (cmd.exe không mở rộng glob) và không dựa vào glob của `node --test` (Node 20 chưa hỗ trợ, `engines` là `>=20`).
- `spawn(process.execPath, ['--test', '--import', 'tsx', ...thamSoThem, ...tep], { stdio: 'inherit', cwd: gốc repo })`; `thamSoThem` lấy từ `process.argv.slice(2)` để `npm test -- --test-reporter=spec` vẫn dùng được; thoát với mã của tiến trình con.
- Không thêm phụ thuộc mới (không `cross-env`), nên không đụng `package-lock.json`.

Đã đo lại ngày 15/10/2026: `DATABASE_FILE=<tạm> node --test --import tsx test/*.test.ts` cho 171 test, 165 đạt, 6 hỏng (cả 6 ở `transfer-out.test.ts`); chỉ bật `PAVIETNAM_SANDBOX=1` mà chưa sửa L1 thì vẫn 6 hỏng. Cần cả hai thay đổi.

**Thay đổi chưa commit ở `package.json` (khối `allowScripts`):** B1 phải sửa `package.json` nên chạm vào tệp đang dở. Cách làm: chỉ đưa vào commit B1 hai dòng script, để nguyên khối `allowScripts` ở trạng thái chưa commit. Vì môi trường không dùng được `git add -p`, làm bằng: `git diff package.json > <scratch>/pkg.diff`, sửa bản vá chỉ giữ hunk `scripts`, rồi `git apply --cached <bản vá>`. Kiểm sau khi commit: `git diff package.json` chỉ còn đúng khối `allowScripts`. Phương án gọn hơn cần chủ duyệt: xem D1.

### 3.4 Chuỗi máy đọc tuyệt đối không đổi

Người thực hiện KHÔNG được sửa các chuỗi sau, kể cả khi chúng trông như chữ tiếng Việt không dấu. Các mục có trong `kiem-dau.cho-phep.json` được ghi chú "(cho phép)".

| Loại | Ví dụ, vị trí | Lý do | Cách khoá |
|---|---|---|---|
| Đường dẫn URL | `'/dang-nhap'`, `'/gio-hang'`, `'/admin/xuat/don-hang'`; `href="..."`, `action="..."` trong view; đích `res.redirect(...)` | Liên kết, SEO, webhook. Từ B3 mọi `href`/`action`/`src` tĩnh có thêm `<%= base %>` đứng trước; phần sau `<%= base %>` vẫn phải giữ nguyên từng ký tự | Mã băm tiêu chí 5 + mã băm `href` `e7e154ddd0273ebd9c257a12665bfccf` (94), `action` `f87296a1d2a085fab9398b31ef68209e` (63), `src` `4997d2ed9140533604c454334fbfc162` (3), đo sau khi xoá `<%= base %>` |
| Tên trường form | 176 `name="..."` | Route đọc theo tên | Mã băm tiêu chí 6 |
| Giá trị và móc nối form | `value="..."` (146, không cái nào là chữ hiển thị), `id=` (19), `for=` (15), `class=`, `data-copy=` | CSS, JS, giá trị gửi về máy chủ | Mã băm `value` `73dc6011a8cd1f2fdc615fe2d3961496`, `id` `adc98f92fd168fae471f44648df7bdce`, `for` `6a1e55df323863919a948c39fadfbfd5` |
| Khoá cấu hình | `site.tagline`, `pa.sandbox`, `zns.tpl.*`, `key: '...'` trong danh sách trường `admin.ts`, `settingKey` | Khoá trong bảng `settings` | Mã băm `grep -rhoE "settingKey: '[^']+'\|key: '[^']+'" src` = `71aa4f47da269d8356a08a90e3be958c` (71) |
| Mã trạng thái, mã sự kiện, mã lỗi | `pending_payment`, khoá của `map` trong `partials/order-status.ejs`, loại job, mã audit (`domain.auth_code_issued`), `NO_CREDENTIALS`, `NETWORK`, `VALIDATION`, `NO_AUTH_CODE`, khoá log (`mail_skipped_no_smtp`), `template: 'admin_alert'` | CSDL, log, so sánh trong mã | Test hiện có |
| Tên tham số ZNS | `order_code`, `amount`, `domain`, `expires_at`, `days_left` (`znsEvents.ts`) | Hợp đồng với mẫu Zalo | Test `zns.test.ts` |
| Mã đơn và nội dung chuyển khoản | `DH` + 6 ký tự, `ORDER_CODE_RE` (`sepay.ts:26`), `refCode`, tham số `des` của QR SePay | Ngân hàng không nhận dấu; đối soát tự động | `test/sepay.test.ts` |
| Chuỗi gửi MoMo | `momo.ts:27` `orderInfo = 'Thanh toan don hang ...'` (cho phép), `momo.ts:32-35` chuỗi ký, `momo.ts:40` `partnerName: 'Domain'` | Nằm trong chuỗi ký HMAC | `git diff` theo dòng |
| Chuỗi gửi ZaloPay | `zalopay.ts:38` `itemname: 'Ten mien'` (cho phép), `zalopay.ts:48` `description` (cho phép), `zalopay.ts:54-57` chuỗi `mac` | Nằm trong chuỗi ký hoặc chưa thử với cổng thật | `git diff` theo dòng |
| Phản hồi webhook cho cổng | Mọi `message` trong `verifyIpn` của `sepay.ts:81-101`, `momo.ts`, `zalopay.ts` (cho phép) | Gửi lại cho máy của cổng, không ai là khách đọc; `webhooks.ts:51` dựa vào chữ `Token` | `test/sepay.test.ts` |
| Tên chủ tài khoản ngân hàng | Giá trị `SEPAY_ACCOUNT_NAME` ("CONG TY TNHH PHAN MEM MIENTAY MEDIA") | Phải khớp đúng tên ngân hàng hiện trong app ngân hàng của khách | Là dữ liệu cấu hình, không phải chuỗi mã |
| Mã tiền tệ | `currency: 'VND'` (`pricing.ts:55, 99`, JSON API); nhãn đơn vị ô nhập "(VND)" ở `admin/coupons.ejs`, `admin.ts:94` | Mã ISO, không phải từ thiếu dấu | (cho phép) |
| Hằng số API P.A | `ACTIONS`, `FIELDS`, `RESPONSE_KEYS`, `SUCCESS_TOKENS` (có `'thanhcong'`), dữ liệu giả lập `client.ts:571-621` | Đọc phản hồi của bên thứ ba | (cho phép) |
| Biểu thức chính quy so khớp chữ | `provisioning.ts:25-34`, `client.ts:132, 180, 182, 380` | Chạy trên chuỗi đã `boDau` nên phải giữ ASCII | (cho phép) |
| Dấu che mã EPP | `'***DA-CHE***'` (`client.ts:149`) | Dấu hiệu kỹ thuật trong nhật ký API | (cho phép) |
| Tên tệp CSV | `don-hang-<ngày>.csv`, `ten-mien-...`, `doanh-thu-...` | Header `Content-Disposition` chỉ an toàn với ASCII khi không dùng `filename*` | (cho phép) |
| Ngoài phạm vi theo intent | Chú thích, tên biến, tên hàm, `README.md`, `docs/*.md`, chú thích `.env.example`, `src/preflight.ts`, dòng `console.*` của `seed.ts`, `probe.ts`, `server.ts:14`, mô tả trong `test('...')` | Intent mục 4, C6 | Công cụ quét bỏ qua chú thích; danh sách tệp loại trừ |

### 3.5 Công cụ quét `scripts/kiem-dau.mjs`

- **Tệp TS (`src/**/*.ts` trừ `src/preflight.ts`, `src/pavietnam/probe.ts`, `src/server.ts`):** dùng `ts.createSourceFile` duyệt `StringLiteral`, `NoSubstitutionTemplateLiteral`, phần chữ của `TemplateExpression`. Bỏ qua: đối số đầu của `log.*(...)`, đường dẫn `import`, chuỗi không có khoảng trắng và không có chữ hoa đầu (định danh, khoá), đối số của `console.*` trong `seed.ts`.
- **Tệp EJS (`src/views/**/*.ejs`):** tách khối `<% %>`; phần ngoài khối: lấy chữ giữa các thẻ và các thuộc tính `placeholder`, `title`, `aria-label`, `alt`, `data-confirm`; phần trong khối: lấy chuỗi trong nháy đơn/kép (bắt được `partials/order-status.ejs`).
- **`public/js/app.js`:** chuỗi trong nháy.
- **Từ điển** (so khớp theo từ, không phân biệt hoa thường): `khong, duoc, dang ky, dang nhap, ten mien, thanh toan, vui long, tai khoan, mat khau, gio hang, don hang, chua, nhap, quan tri, cua, nguoi, thong tin, thong bao, cau hinh, gia han, het han, kich hoat, xac nhan, xac thuc, huy, loi, thu lai, that bai, thanh cong, tim kiem, kiem tra, so du, hoan tien, chuyen khoan, ngan hang, dia chi, dien thoai, mien phi, nam, ngay, gio, phut, tiep tuc, quay lai, luu, xoa, sua, them, tra cuu, bang gia, ho tro, lien he, chu the, ma so thue, khoa, mo khoa, da, dang, se, voi, cho, tu dong, hien tai, toi thieu, toi da`. Từ ngắn dễ trùng tiếng Anh (`da`, `se`, `cho`, `nam`) chỉ tính khi chuỗi có từ 2 từ trở lên và không có chữ cái nào mang dấu tiếng Việt.
- **Kiểm mã hoá:** mọi tệp trong `src`, `public`, `test`, `scripts`: giải mã UTF-8 nghiêm ngặt (`new TextDecoder('utf-8', { fatal: true })`), không có BOM, không có U+0300..U+036F, bằng chính nó sau `normalize('NFC')`.
- **Danh sách cho phép** `scripts/kiem-dau.cho-phep.json`: mảng `{ "tep": "...", "chua": "<chuỗi con>", "ly_do": "..." }`; khớp theo tệp và chuỗi con, không theo số dòng (để không vỡ khi dòng xê dịch). Mục không còn khớp gì thì công cụ báo "mục thừa" để danh sách không phình.
- Đầu ra: `tệp:dòng: "chuỗi"  [từ: dang ky]`, cuối cùng in tổng; mã thoát 1 nếu có kết quả. Chạy được trên một phần tệp: `node scripts/kiem-dau.mjs src/views/auth src/routes/auth.ts`.

### 3.6 Bảng 12 câu so khớp chữ trong test (R3)

Đổi trong cùng commit với chữ nguồn. Không nới lỏng; nếu biểu thức cũ có `/i` thì giữ `/i`.

| Test | Hiện tại | Sau | Chữ nguồn | Bước |
|---|---|---|---|---|
| `cart-orders.test.ts:27` | `/EPP\|xac thuc/i` | `/EPP\|xác thực/i` | `services/cart.ts` | B7 |
| `cart-orders.test.ts:96` | `/khong con duoc ho tro/i` | `/không còn được hỗ trợ/i` | `services/orders.ts` | B7 |
| `domain-contact.test.ts:59, 107` | `/ma so thue/i` | `/mã số thuế/i` | `services/domainContact.ts` | B8 |
| `domain-contact.test.ts:88` | `/chua xu ly xong/i` | `/chưa xử lý xong/i` | `services/domainContact.ts` | B8 |
| `transfer-out.test.ts:28` | `/mo khoa/i` | `/mở khoá/i` | `services/transferOut.ts:39` | B8 |
| `two-factor.test.ts:84` | `/Chua bat dau/` | `/Chưa bắt đầu/` | `services/twoFactor.ts` | B6 |
| `two-factor.test.ts:220` | `/chua duoc bat/` | `/chưa được bật/` | `services/twoFactor.ts` | B6 |
| `zns.test.ts:32` | `/khong khop/i` | `/không khớp/i` | `lib/zns.ts:325-360` | B11 |
| `zns.test.ts:33` | `/chan\|tuong tac/i` | `/chặn\|tương tác/i` | `lib/zns.ts` | B11 |
| `zns.test.ts:34` | `/so du/i` | `/số dư/i` | `lib/zns.ts` | B11 |
| `zns.test.ts:35` | `/ma loi/i` | `/mã lỗi/i` | `lib/zns.ts` | B11 |

(`zns.test.ts:31` `/token/i` không đổi.) Lưu ý: `/i` với ký tự có dấu vẫn đúng trong JavaScript cho chữ thường/hoa Unicode cơ bản (ví dụ `Đ`/`đ`), nhưng nên viết đúng kiểu chữ như nguồn để không phụ thuộc vào điều đó.

### 3.7 Mã hoá UTF-8 cho email

- `src/lib/mailer.ts`: không cần đổi cấu hình. nodemailer tự mã hoá header có ký tự ngoài ASCII thành dạng `=?UTF-8?Q?...?=` hoặc `=?UTF-8?B?...?=` và đặt `Content-Type: text/html; charset=utf-8` cho phần thân. Người gửi `MienTay Media <no-reply@mientaymedia.com>` là ASCII nên không có rủi ro ở `From`.
- `src/services/notifications.ts:24` (hàm `layout`): thêm `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>` để trình đọc thư nào bỏ qua header MIME vẫn hiển thị đúng. Câu chân thư dòng 34 thêm dấu.
- `test/email-encoding.test.ts`: (a) dựng thư bằng `nodemailer.createTransport({ streamTransport: true, buffer: true })` với tiêu đề "Tên miền vidu.vn đã được kích hoạt", khẳng định có dòng `^Subject: =\?UTF-8\?[BQ]\?` và `charset=utf-8`; (b) gọi một hàm gửi thật trong `notifications.ts` khi chưa cấu hình SMTP (đường `skipped`), đọc `email_logs.subject` và khẳng định đúng chữ có dấu, dạng NFC.

### 3.8 ZNS

- Chỉ đổi chữ hiển thị (`label`, `sample` trong `znsEvents.ts:22-59`, giải thích mã lỗi `lib/zns.ts:325-360`, flash trong `admin.ts`) và giá trị tham số (đơn vị tiền "đ" qua `formatVnd`, giá trị mẫu `'thu-nghiem'` ở `admin.ts:315` thành `'thử nghiệm'`, `'100.000 d'` ở `admin.ts:311` thành `formatVnd(100_000)`). Tên tham số giữ nguyên.
- KHÔNG chuyển `src/lib/zns.ts` sang Mineflow (intent mục 7, dự án riêng làm sau). Không đổi cách gọi API Zalo, không đổi chữ ký hàm `sendZns`.
- Ghi chú cho dự án Mineflow: hiện có hai chỗ gọi `sendZns` là `notifications.ts:530` (qua hàm nội bộ `notifyZns`) và `admin.ts:318` (nút gửi thử). Đợt này không gom lại để giữ phạm vi; dự án Mineflow nên đưa cả hai về một cổng duy nhất (ví dụ `notifyZns` hoặc một `ZnsProvider` có `send(input)`), rồi thay phần thân `sendZns` bằng lời gọi Mineflow. Spec này không làm gì khiến việc đó khó hơn.
- R6 (giới hạn độ dài tham số): "830.000 đ" dài hơn "830.000 d" 1 byte UTF-8, không đáng kể. Khi soạn mẫu ở Zalo/Mineflow, khai `amount` kiểu chuỗi, không phải kiểu số/tiền tệ, vì giá trị đã có đơn vị.

### 3.9 Giao diện

Không đổi bố cục, chỉ đổi chữ. Ví dụ đầu trang sau khi đổi:

```
+----------------------------------------------------------------------------+
| MienTay Media    Bảng giá   WHOIS   Chuyển tên miền   Giỏ hàng (2)          |
|                                                     Đăng nhập   Đăng ký    |
+----------------------------------------------------------------------------+
|           Đăng ký tên miền Việt Nam & Quốc tế                              |
|   [ nhập tên miền bạn muốn...                    ]  [ Kiểm tra ]           |
|   .vn 830.000 đ    .com.vn 690.000 đ    .com ...                           |
+----------------------------------------------------------------------------+
```

Lưu ý độ rộng: chữ có dấu không làm dài chuỗi về số ký tự hiển thị, nhưng các nút hẹp (`btn-link tiny` "chép tất cả") cần nhìn lại trên điện thoại ở B12.

### 3.10 Tiền tố đường dẫn `BASE_PATH` (bước B3)

**Hiện trạng đã đo:** mọi router mount ở gốc (`src/app.ts:85-94`); `express.static` ở gốc (`app.ts:47`); 122 lời gọi `res.redirect(` trong `src` (gồm cả vài lời gọi tới URL ngoài như MoMo, Zalo); link tuyệt đối trong view (`href` 94, `action` 63, `src` 3 thuộc tính dạng chuỗi tĩnh, cộng các link dựng trong khối `<% %>`); `public/js/app.js:61` gọi `fetch('/don-hang/...')`; cookie `sid` có `path: '/'` (`session.ts:82, 122, 130`); `robots.txt`, `sitemap.xml` ở `home.ts:77-120`; link tuyệt đối dựng từ `config.appUrl` ở `notifications.ts:55`, `payments/index.ts:68-69`, `admin.ts:184, 697, 739`, `home.ts:93, 112`. Có route nội bộ tên `'/ten-mien'` và `'/ten-mien/:id/dong-bo'`, nên URL hợp lệ có thể có dạng `/ten-mien/ten-mien/...`: mọi cơ chế "đã có tiền tố thì bỏ qua" đều sai và bị cấm.

**Cấu hình (`src/config.ts`):** thêm `basePath: chuanHoaBasePath(str('BASE_PATH', ''))`. Quy tắc: rỗng hoặc `/` thành `''`; còn lại phải khớp `^(/[a-z0-9._~-]+)+$`, bỏ `/` cuối; sai thì dừng khởi động với thông báo rõ. Kiểm chéo khi khởi động: `new URL(APP_URL).pathname` (bỏ `/` cuối) phải bằng `basePath`, nếu khác thì dừng với thông báo "APP_URL và BASE_PATH không khớp". Với cấu hình hiện tại (`APP_URL` không có đường dẫn, `BASE_PATH` rỗng) điều kiện luôn đúng, nên không ai đang chạy bị ảnh hưởng. Đây là biến môi trường mới duy nhất; không đổi tên biến cũ.

**Thư viện (`src/lib/basePath.ts`, mới):**
- `BASE` = `config.basePath`.
- `withBase(p)`: nếu `p` bắt đầu bằng đúng một `/` (không phải `//`, không phải `/\`) thì trả `BASE + p`; ngược lại (URL đầy đủ, `mailto:`, rỗng) trả nguyên `p`.
- `stripBase(p)`: nếu `BASE` rỗng trả `p`; nếu `p === BASE` trả `/`; nếu `p` bắt đầu bằng `BASE + '/'` trả phần sau; ngược lại trả `null` (đường dẫn nằm ngoài ứng dụng). So khớp theo cả đoạn, nên `/ten-mien-khac` không bị coi là thuộc `/ten-mien`.

**Lắp ráp (`src/app.ts`):**
1. Cấp `app`: `trust proxy`, view engine, `x-powered-by`, các header bảo mật, và middleware bọc `res.redirect` (dưới đây). Giữ nguyên thứ tự còn lại.
2. Tạo `const site = express.Router()`; chuyển vào đó, đúng thứ tự cũ: `express.json`, `urlencoded`, `cookieParser`, `express.static(public)`, `sessionMiddleware`, middleware biến dùng chung (thêm `res.locals.base = BASE` và `res.locals.url = withBase`), `csrfMiddleware`, 10 lệnh `site.use(...)` route với ĐÚNG các đường dẫn cũ, `notFound`, `errorHandler`.
3. `app.use(BASE || '/', site)`. Vì mọi middleware nằm trong router con, `req.path` bên trong đã bỏ tiền tố: `currentPath` (đánh dấu menu), `EXEMPT_PREFIXES` của CSRF, `wantsJson` của `error.ts`, giới hạn tần suất (`ratelimit.ts:32`) chạy y như cũ mà không sửa.
4. Khi `BASE` khác rỗng, thêm ở cấp `app` sau router con: `GET /` chuyển hướng 302 tới `BASE + '/'`; mọi yêu cầu khác ngoài tiền tố trả 404 chữ thuần (không render view, vì các biến `site`, `currentUser` chỉ có trong router con). Trên VPS thật, các đường dẫn ngoài `/ten-mien` do site Next.js phục vụ nên nhánh này chỉ gặp khi truy cập thẳng vào cổng của app.

**Chuyển hướng:** middleware cấp `app` thay `res.redirect` bằng bản bọc: lấy đối số URL (hỗ trợ cả `redirect(url)` và `redirect(status, url)`), đi qua `withBase`, rồi gọi bản gốc. Nhờ vậy 122 lời gọi trong route KHÔNG phải sửa (mã băm URL tiêu chí 5 giữ nguyên, các bước thêm dấu sau không bị va chạm). URL ngoài (MoMo `payUrl`, `buildPermissionUrl` của Zalo) không bắt đầu bằng `/` nên đi qua nguyên vẹn. Build phải `grep -rn "res.location\|res.setHeader('Location'\|'Refresh'" src` để chắc không có đường chuyển hướng nào khác ngoài `res.redirect` (đo ngày 15/10: không có).

**Hai nguồn đường dẫn đã chứa tiền tố, phải bỏ trước khi chuyển hướng** (nếu không sẽ thành `/ten-mien/ten-mien/...`):
- `src/middleware/auth.ts:11` dùng `req.originalUrl` (có tiền tố) để dựng `?next=`. Đổi thành `stripBase(req.originalUrl) ?? '/dashboard'`. `next` từ đây luôn là đường dẫn bên trong ứng dụng.
- `src/routes/cart.ts:17-27` `quayLai` lấy `pathname` từ `Referer`. Sau khi kiểm cùng origin, thêm `stripBase(u.pathname)`; `null` (trang ngoài ứng dụng trên cùng tên miền, ví dụ trang Next.js) thì về mặc định `/gio-hang`.
- `safeNext` (`auth.ts:43-55`) giữ nguyên logic chống open redirect: vẫn loại `//`, `/\`, khác origin, và vẫn trả đường dẫn bên trong ứng dụng; tiền tố được thêm duy nhất một lần ở bản bọc `res.redirect`. Test bắt buộc: `next=//evil.com`, `next=/\evil.com`, `next=https://evil.com`, `next=%2F%2Fevil.com` đều về `/ten-mien/dashboard`; `next=/gio-hang` về `/ten-mien/gio-hang`.

**View EJS:** chèn `<%= base %>` ngay trước `/` đầu của mọi `href`, `action`, `src` tuyệt đối: `href="/gio-hang"` thành `href="<%= base %>/gio-hang"`, `href="/domains/<%= d.id %>"` thành `href="<%= base %>/domains/<%= d.id %>"`. Link dựng trong khối `<% %>` (chuỗi `'/...'` nối với biến) dùng `url('/...')`. Ưu tiên chèn `<%= base %>` thay vì bọc `url('...')` cho chuỗi tĩnh vì phép đổi là chèn thuần: `sed 's/<%= base %>//g'` trả lại đúng tệp cũ, nên kiểm được bằng mã băm. `base` là chuỗi cấu hình đã kiểm theo regex ở trên nên dùng `<%=` (có escape) là an toàn. `head.ejs`: `href="<%= base %>/css/app.css"`, và `<body data-base="<%= base %>">`. Không đổi `href` ngoài (`https://`, `mailto:`, `#`).

**JavaScript phía trình duyệt (`public/js/app.js:61`):** `var base = document.body.getAttribute('data-base') || '';` rồi `fetch(base + '/don-hang/' + ...)`. Không dùng script nội tuyến (CSP chặn).

**Cookie phiên (`src/middleware/session.ts:82, 122, 130`):** `path: BASE || '/'` ở cả ba chỗ (đặt, làm mới, xoá). Tên cookie `sid` giữ nguyên. Hệ quả: trình duyệt chỉ gửi cookie cho `/ten-mien/...`, không lộ sang site Next.js cùng tên miền.

**robots.txt và sitemap (`src/routes/home.ts:77-120`):** các dòng `Disallow:` dựng bằng `withBase` (ví dụ `Disallow: /ten-mien/admin`); `Sitemap:` và `<loc>` đã dựng từ `config.appUrl` nên tự đúng. Lưu ý: máy tìm kiếm chỉ đọc `robots.txt` ở gốc tên miền, nên `/ten-mien/robots.txt` không có tác dụng; các dòng `Disallow` và `Sitemap: https://mientaymedia.com/ten-mien/sitemap.xml` phải được thêm vào `robots.txt` của site Next.js (repo mientay-web) ở giai đoạn Deploy. Spec này chỉ ghi lại, không sửa repo đó.

**Link tuyệt đối:** email (`notifications.ts:55`), `returnUrl`/`ipnUrl` thanh toán, URL webhook hiện trong trang cấu hình, callback ZNS, sitemap đều dựng từ `APP_URL`, nên chỉ cần `APP_URL=https://mientaymedia.com/ten-mien`. Không sửa mã. Webhook SePay thành `https://mientaymedia.com/ten-mien/webhooks/sepay`, khai lại trong my.sepay.vn ở giai đoạn Deploy. Callback ZNS `.../ten-mien/admin/zns/callback` phải khai lại ở Zalo nếu đã khai.

**CSP (`src/lib/csp.ts`):** chỉ gồm `'self'` và origin của cổng thanh toán, không chứa đường dẫn, nên không cần sửa; test khẳng định header CSP vẫn có trên trang dưới tiền tố và `script-src` không đổi.

**Header bảo mật cần lưu ý:** `app.ts:54` gửi `Strict-Transport-Security: max-age=31536000; includeSubDomains` khi chạy production. Khi app chạy dưới `mientaymedia.com`, header này áp cho TOÀN BỘ tên miền và mọi tên miền con trong một năm. Spec không đổi hành vi này; xem D7.

**Proxy:** giai đoạn Deploy phải chuyển `/ten-mien/*` sang app mà KHÔNG cắt tiền tố (app tự xử lý tiền tố), và chuyển header `X-Forwarded-Proto`/`Host` để `quayLai` so origin đúng (`TRUST_PROXY=1`).

### 3.11 Bảng chính tả thống nhất

Người thực hiện đọc ngữ cảnh từng câu, không thay hàng loạt. Quy ước:

| Trường hợp | Chọn | Ghi chú |
|---|---|---|
| khóa / khoá, hòa / hoà, thủy / thuỷ, hủy / huỷ, tùy / tuỳ | **kiểu cũ: khoá, hoà, huỷ, tuỳ, thuỷ** (dấu đặt trên nguyên âm thứ hai) | Khớp với chính tả intent đang dùng ("khoá cấu hình", "tuỳ"). Test `transfer-out` dùng `/mở khoá/i`. Công cụ quét báo cảnh báo nếu gặp `khóa`, `hủy`, `tùy`, `hòa`, `thủy`. Xem D2. |
| "dang" | **đang** (tiếp diễn: "đang xử lý", "đang khoá") hoặc **đăng** ("đăng ký", "đăng nhập", "đăng xuất") | Không bao giờ "dang ký" |
| "ma" | **mã** (mã đơn, mã EPP, mã lỗi, mã xác thực, mã số thuế) hoặc **mà** (liên từ) | |
| "Da" | **Đã** (thời: "Đã thanh toán") hoặc **Da** (hiếm, gần như không có) | |
| "chu" | **chủ** (chủ thể, chủ tài khoản, chủ sở hữu) hoặc **chữ** (chữ ký) | |
| "ky" | **ký** (đăng ký, chữ ký, kỳ hạn là **kỳ**) | "ký" viết với y |
| "mien" | **miền** (tên miền), **miễn** (miễn phí) | |
| "gia" | **giá** (bảng giá), **gia** (gia hạn) | |
| "het han" | **hết hạn** | |
| "huy" | **huỷ** | theo dòng khoá/huỷ |
| "so du" | **số dư** | |
| "thue" | **thuế** | |
| "tro" | **trỏ** (trỏ tên miền), **trợ** (hỗ trợ) | |
| "dia chi" | **địa chỉ** | |
| "Viet Nam" | **Việt Nam** | trừ hằng số API và dữ liệu sandbox |
| "P.A Viet Nam" | **P.A Việt Nam** | |
| "Email", "OTP", "DNS", "WHOIS", "EPP", "API Key", "Control Panel" | giữ nguyên | thuật ngữ |
| Tiền | `formatVnd` ("830.000 đ", chữ "đ" U+0111 thường, có khoảng trắng thường) | không dùng "₫", "VNĐ" |
| Ngày | giữ định dạng hiện có | không thuộc phạm vi |
| Xưng hô | "bạn" | C5 |
| Viết hoa | chỉ viết hoa chữ đầu câu, đầu nhãn và tên riêng | giữ như hiện tại |

## 4. Danh sách tệp sẽ tạo hoặc sửa

Không tệp nào là tệp của bản gốc upstream (repo không có upstream). Cột "Bước" là bước Build ở mục 7.

**Tạo mới**

| Tệp | Lý do | Bước |
|---|---|---|
| `scripts/kiem-dau.mjs` | Công cụ quét chữ không dấu, NFD, BOM (tiêu chí 1, 2) | B0 |
| `scripts/kiem-dau.cho-phep.json` | Danh sách cho phép có lý do | B0 |
| `scripts/chay-test.mjs` | `npm test` chạy được trên Windows, DB tạm, sandbox bật (L2) | B1 |
| `test/sandbox.test.ts` | Sandbox chạy không cần key; chế độ thật vẫn ném `NO_CREDENTIALS` (L1) | B1 |
| `src/lib/text.ts` | `boDau()` dùng cho so khớp | B2 |
| `test/text-match.test.ts` | `isPermanent`, `interpret`, `checkDomain`, `whois` khớp cả có dấu lẫn không dấu; chữ của hệ thống không khớp nhầm | B2 |
| `test/money.test.ts` | `formatVnd(830000) === '830.000 đ'`, NFC | B4 |
| `test/email-encoding.test.ts` | Header `Subject` dạng `=?UTF-8?..?=`, `email_logs.subject` có dấu | B11 |
| `src/lib/basePath.ts` | `withBase`, `stripBase` (mục 3.10) | B3 |
| `test/base-path.test.ts` | Tiêu chí 13, chống open redirect dưới tiền tố, cookie path, webhook | B3 |
| `scripts/kiem-base.mjs` | Bò toàn bộ trang, tìm link gốc thiếu tiền tố (tiêu chí 13) | B3 |

**Sửa (lõi, logic, cấu hình)**

| Tệp | Lý do | Bước |
|---|---|---|
| `package.json` | Chỉ dòng `"test"` và thêm `"kiem-dau"`; giữ nguyên khối `allowScripts` chưa commit | B0/B1 |
| `src/pavietnam/client.ts` | L1 (dòng 59-66, 85); so khớp qua `boDau` (132, 180-182, 380); thêm dấu cho thông điệp lỗi hiển thị (63, 114, 350-351, 413, ...) | B1, B2, B9 |
| `src/services/provisioning.ts` | `isPermanent` dùng `boDau`, export để test; thêm dấu cho thông điệp | B2, B7 |
| `src/config.ts` | `basePath` từ `BASE_PATH`, kiểm khớp với `APP_URL` (B3); `APP_NAME` mặc định "MienTay Media" (dòng 39, B4) | B3, B4 |
| `src/app.ts` | Router con mount tại `BASE_PATH`, bọc `res.redirect`, `res.locals.base`/`url`, xử lý yêu cầu ngoài tiền tố | B3 |
| `src/middleware/session.ts` | `path` cookie `sid` theo tiền tố (dòng 82, 122, 130) | B3 |
| `src/middleware/auth.ts` | `next=` dựng từ `stripBase(req.originalUrl)` (dòng 11) | B3 (chữ ở B6) |
| `src/routes/cart.ts` | `quayLai` bỏ tiền tố khỏi `Referer` (dòng 17-27) | B3 (chữ ở B7) |
| `src/routes/home.ts` | `Disallow:` trong robots.txt qua `withBase` | B3 (chữ ở B5) |
| `src/views/**/*.ejs` (44) | Chèn `<%= base %>` trước link tuyệt đối; `url()` cho link dựng trong khối mã; `head.ejs` thêm `data-base` | B3 (chữ ở B4 đến B9) |
| `.env.example` | Thêm `BASE_PATH=` (rỗng, chú thích ví dụ `/ten-mien` và quy tắc khớp `APP_URL`) ở B3; `APP_NAME=MienTay Media`, `MAIL_FROM="MienTay Media <...>"`, mẫu SePay: `SEPAY_BANK_CODE=MB`, `SEPAY_BANK_NAME=MB`, `SEPAY_ACCOUNT_NUMBER=45688840`, `SEPAY_ACCOUNT_NAME=CONG TY TNHH PHAN MEM MIENTAY MEDIA` (chú thích giữ nguyên) | B4 |
| `src/lib/money.ts` | `d` thành `đ` (dòng 10) | B4 |
| `src/lib/settings.ts` | Khẩu hiệu mặc định (dòng 86) | B4 |
| `src/db/seed.ts` | Khẩu hiệu (98), nhãn 19 đuôi (53-75), "Quản trị viên" (36); không đổi dòng `console.*` | B4 |
| `src/middleware/error.ts` | Trang 404/500 và JSON lỗi | B4 |
| `public/js/app.js` | `fetch` theo `data-base` (B3); "Đã chép!" (B4) | B3, B4 |

**Sửa (giao diện và route theo cụm)**

| Tệp | Lý do | Bước |
|---|---|---|
| `src/views/partials/head.ejs`, `header.ejs`, `footer.ejs`, `admin-nav.ejs`, `order-status.ejs`, `contact-form.ejs`; `src/views/error.ejs` | Khung dùng chung | B4 |
| `src/views/home.ejs`, `pricing.ejs`, `search.ejs`, `whois.ejs`, `transfer.ejs`; `src/routes/home.ts` | Trang công khai | B5 |
| `src/views/auth/*.ejs` (6); `src/routes/auth.ts`; `src/lib/validate.ts`; `src/middleware/auth.ts`, `csrf.ts`, `ratelimit.ts`, `session.ts` (nếu có chữ); `src/services/twoFactor.ts`, `verification.ts`; `test/two-factor.test.ts` | Đăng nhập, đăng ký, 2FA, xác thực email | B6 |
| `src/views/cart.ejs`, `checkout/index.ejs`, `orders/*.ejs` (3); `src/routes/cart.ts`, `checkout.ts`, `orders.ts`; `src/services/cart.ts`, `orders.ts`, `pricing.ts`, `refunds.ts`, `provisioning.ts`; `src/payments/*.ts` (chỉ `label`, `description`, nhãn hướng dẫn, lỗi hiển thị); `test/cart-orders.test.ts` | Giỏ, thanh toán, đơn | B7 |
| `src/views/dashboard.ejs`, `account/*.ejs` (3), `domains/*.ejs` (2); `src/routes/account.ts`, `controlPanel.ts`; `src/services/dns.ts`, `domainContact.ts`, `domains.ts`, `domainRepo.ts`, `transferOut.ts`; `test/domain-contact.test.ts`, `test/transfer-out.test.ts` | Khu vực khách và quản lý tên miền | B8 |
| `src/views/admin/*.ejs` (14); `src/routes/admin.ts`; `src/services/reports.ts` (tiêu đề cột CSV), `audit.ts`; `src/jobs/handlers.ts`, `worker.ts`/`queue.ts` (nếu có chữ hiện trên trang quản trị) | Quản trị | B9 |
| `src/routes/api.ts` | Thông điệp JSON (`error`), không đổi khoá JSON | B10 |
| `src/services/notifications.ts`, `znsEvents.ts`; `src/lib/zns.ts`, `mailer.ts` (`'Chưa cấu hình SMTP'`), `qrcode.ts` (nếu có chữ hiển thị); `test/zns.test.ts` | Email, ZNS | B11 |

**Không sửa (khoá cứng)**: `src/routes/webhooks.ts`, `src/payments/momo.ts` dòng 27, 32-35, 40, `src/payments/zalopay.ts` dòng 38, 48, 54-57, `src/pavietnam/actions.ts`, `src/pavietnam/parse.ts`, `src/preflight.ts`, `src/pavietnam/probe.ts`, `src/server.ts`, `README.md`, `docs/*.md`, `package-lock.json`.

## 5. Dữ liệu và cấu hình mới, di chuyển dữ liệu cũ

- **Biến môi trường mới duy nhất: `BASE_PATH`** (mặc định rỗng, chạy ở gốc như hiện nay; ví dụ `/ten-mien`; phải khớp phần đường dẫn của `APP_URL`, lệch thì app dừng khi khởi động). Không có bảng, cột hay khoá cấu hình mới. Biến `PAVIETNAM_SANDBOX` và `DATABASE_FILE` đã có; `chay-test.mjs` chỉ đặt chúng cho tiến trình test.
- **Giá trị mặc định đổi:** `APP_NAME` (`config.ts:39`), khẩu hiệu `site.tagline` (`settings.ts:86`, `seed.ts:98`, hai chỗ phải giống hệt nhau), nhãn đuôi tên miền, tên quản trị viên khởi tạo.
- **Dữ liệu cũ:** intent xác nhận `data/` trống, chưa triển khai, không có gì để chuyển. Nếu có CSDL thử nghiệm nào đã chạy `seed` (ví dụ trên máy khác), `seed` không ghi đè giá trị đã có, nên `site.name`, `site.tagline`, nhãn đuôi và tên quản trị viên trong CSDL đó vẫn là chữ cũ. Cách xử lý: xoá CSDL thử nghiệm và chạy lại `npm run migrate && npm run seed`, hoặc sửa tay trong `/admin/cau-hinh` và trang bảng giá. Không viết script chuyển đổi.
- **Cấu hình triển khai** (ghi lại để giai đoạn Deploy dùng, không làm ở Build): trên VPS đặt `APP_NAME=MienTay Media`, `APP_URL=https://mientaymedia.com/ten-mien`, `BASE_PATH=/ten-mien`, `TRUST_PROXY=1`, `MAIL_FROM` theo hộp thư thật, SePay MB như intent mục 7 với webhook `https://mientaymedia.com/ten-mien/webhooks/sepay`; khai lại callback ZNS `https://mientaymedia.com/ten-mien/admin/zns/callback` nếu đã khai. Proxy chuyển `/ten-mien/*` sang app, không cắt tiền tố. Thêm `Disallow`/`Sitemap` của app vào `robots.txt` gốc của mientay-web (D6).

## 6. Kế hoạch test

Không có CI và không có lượt gộp hằng đêm cho repo này; mọi kiểm tra chạy local trong Git Bash và PowerShell tại `D:\api-pavietnam`.

### 6.1 Cổng chặn cho mỗi commit (B1 trở đi)

```bash
npm run typecheck                                   # tiêu chí 3
npm test                                            # tiêu chí 4: tất cả đạt, 0 hỏng
node scripts/kiem-dau.mjs <các tệp vừa sửa>          # tiêu chí 1, 2 cho phần đã làm
grep -rhoE "'/[a-z0-9/:._-]*'" src/routes src/app.ts | sort | md5sum   # 13c96761...
grep -rhoE 'name="[^"]+"' src/views | sort | md5sum                    # a78750c5...
for a in value action href src id for; do sed 's/<%= base %>//g' $(find src/views -name '*.ejs') | grep -oE " $a=\"[^\"]*\"" | sort | md5sum; done
grep -rhoE "settingKey: '[^']+'|key: '[^']+'" src | sort | md5sum      # 71aa4f47...
```

Giá trị gốc đo tại `55b3a60` ngày 15/10/2026: `value` 73dc6011a8cd1f2fdc615fe2d3961496, `action` f87296a1d2a085fab9398b31ef68209e, `href` e7e154ddd0273ebd9c257a12665bfccf, `id` adc98f92fd168fae471f44648df7bdce, `for` 6a1e55df323863919a948c39fadfbfd5, `src` 4997d2ed9140533604c454334fbfc162 (3). Từ B3, các mã băm thuộc tính được đo sau khi xoá `<%= base %>` (lệnh trên đã làm), nên vẫn phải ra đúng giá trị gốc. Lệnh chạy được cả trên Windows (`npm test` trong PowerShell) lẫn Git Bash; B1 phải kiểm cả hai.

### 6.2 Kiểm chứng thanh toán (tiêu chí 10)

```bash
git diff 55b3a60 -- src/payments/momo.ts src/payments/zalopay.ts src/payments/sepay.ts src/routes/webhooks.ts
```
Không có dòng nào thay đổi trong các vùng khoá ở mục 3.4. `webhooks.ts` phải không có diff. `test/sepay.test.ts` đạt.

### 6.3 Kiểm thử chạy thật (B12)

1. `PAVIETNAM_SANDBOX=1 DATABASE_FILE=<tạm>/app.sqlite npm run migrate && npm run seed && npm run dev`.
2. `curl -si http://localhost:3000/` có `Content-Type: text/html; charset=utf-8` và chứa "Đăng ký tên miền Việt Nam".
3. Với `/`, `/bang-gia`, `/whois`, `/chuyen-ten-mien`, `/gio-hang`, `/dang-nhap`, `/dang-ky`, `/quen-mat-khau` và `/admin` (đăng nhập bằng cookie): mã 200, lọc thẻ HTML rồi so với từ điển của `kiem-dau` (chế độ `--html` đọc từ stdin), 0 kết quả.
   Lặp lại bước 1 đến 3 với `BASE_PATH=/ten-mien APP_URL=http://localhost:3000/ten-mien` (mọi đường dẫn thêm tiền tố), rồi chạy `node scripts/kiem-base.mjs`: 0 link gốc thiếu tiền tố (tiêu chí 13). Thử tay: đăng nhập từ một trang cần đăng nhập rồi được đưa về đúng trang đó; thêm vào giỏ rồi quay lại đúng trang; trang thanh toán SePay tự cập nhật trạng thái (đường `fetch` trong `app.js`).
4. Email (tiêu chí 8): cấu hình SMTP thật trong `.env`, gửi khôi phục mật khẩu và kích hoạt tên miền (qua đơn sandbox) tới Gmail; xem "Hiển thị bản gốc" để thấy `Subject: =?UTF-8?...`. Mở thêm bằng Outlook nếu có.
5. CSV (tiêu chí 9): tải `/admin/xuat/don-hang`, `/admin/xuat/ten-mien`, `/admin/xuat/doanh-thu`, mở bằng Excel trên Windows.
6. Điện thoại: mở trang chủ, giỏ hàng, chi tiết tên miền trên một máy Android và một iPhone (hoặc chế độ thiết bị của Chrome), xem nút và nhãn không vỡ dòng.
7. Bảng kiểm duyệt chính tả (tiêu chí 12): danh sách 44 trang EJS và 18 email, mỗi dòng có đường dẫn để mở, ô "đạt/sửa"; đặt trong tài liệu kiểm thử của giai đoạn 4 (`docs/mtm/api-pavietnam/test.md`), không thuộc spec này.

### 6.4 Test mới

| Test | Nội dung chính | Chạy ở |
|---|---|---|
| `test/sandbox.test.ts` | Bật sandbox, không key: `getAuthCode` trả mã; tắt sandbox, không key: ném `NO_CREDENTIALS` | `npm test` local |
| `test/text-match.test.ts` | `boDau('Lỗi: Lệnh thực thi không được hỗ trợ') === 'loi: lenh thuc thi khong duoc ho tro'`; `isPermanent` đúng với "Tên miền đã được đăng ký", "Tài khoản không đủ số dư", cả bản không dấu; sai với mọi thông điệp `RegistrarError` của `client.ts`; `interpret` coi "Lỗi: ..." và "IP không được phép truy cập" là thất bại (dùng phản hồi giả lập qua đường gọi nội bộ, xuất `interpret` để test nếu cần); `checkDomain`/`whois` với chữ có dấu | `npm test` local |
| `test/money.test.ts` | `formatVnd` | `npm test` local |
| `test/email-encoding.test.ts` | Mục 3.7 | `npm test` local |
| `test/base-path.test.ts` | Đặt `process.env.BASE_PATH='/ten-mien'`, `APP_URL='http://127.0.0.1/ten-mien'` TRƯỚC khi `await import` helper và `createApp` (không import tĩnh, vì `config.ts` đọc biến lúc nạp); chạy `app.listen(0)` và `fetch`. Khẳng định: `GET /ten-mien/` 200, mọi `href`/`action`/`src` bắt đầu bằng `/` đều có tiền tố; `GET /ten-mien/css/app.css` và `/ten-mien/js/app.js` 200; `GET /` chuyển tới `/ten-mien/`; `GET /gio-hang` (thiếu tiền tố) 404; trang cần đăng nhập chuyển tới `/ten-mien/dang-nhap?next=%2F...` (next không chứa tiền tố); bốn biến thể `next` độc hại về `/ten-mien/dashboard`; `quayLai` với `Referer` cùng origin ngoài tiền tố về `/ten-mien/gio-hang`; cookie `sid` có `Path=/ten-mien`; `robots.txt` có `Disallow: /ten-mien/admin`; `sitemap.xml` có `<loc>http://127.0.0.1/ten-mien/...`; `POST /ten-mien/webhooks/sepay` không token trả 401 (tới đúng handler, không bị CSRF chặn); header CSP có mặt; `config` dừng khi `APP_URL` và `BASE_PATH` lệch (kiểm qua hàm chuẩn hoá được export) | `npm test` local |
| `scripts/kiem-base.mjs` | Khởi động app với `BASE_PATH=/ten-mien`, sandbox, CSDL tạm, tạo quản trị viên thử; đi qua mọi route GET không có tham số trong `src/routes` (lấy từ chính các chuỗi đường dẫn) cùng vài trang có tham số (đơn, tên miền thử) với tư cách khách và quản trị viên; quét `href`, `action`, `src`, `Location`; in mọi giá trị gốc `/` thiếu tiền tố; mã thoát 1 nếu có | Local, B3 và B12 (tiêu chí 13) |

## 7. Kế hoạch triển khai (Build từng bước) và lùi bản

Làm trên nhánh `feat/tieng-viet-co-dau` từ `main @ 55b3a60`, mở PR vào `main` khi xong B12 (quy trình 6 bước: Deploy qua PR). Mỗi bước một commit (B5 đến B9 có thể tách nhỏ thêm theo tệp nếu dài), lời commit tiếng Việt có dấu. Mỗi commit qua cổng 6.1.

| Bước | Nội dung | Ghi chú |
|---|---|---|
| B0 | `scripts/kiem-dau.mjs`, `kiem-dau.cho-phep.json`; chạy ở chế độ báo cáo, lưu số đếm ban đầu vào lời commit | Không đổi chữ nào. Dòng `"kiem-dau"` vào `package.json` gộp ở B1 |
| B1 | L2 (`chay-test.mjs`, dòng `"test"`, `"kiem-dau"`) và L1 (`client.ts:59-66, 85`) + `test/sandbox.test.ts` | Sau bước này: 171 + test mới, 0 hỏng, trên cả PowerShell và Git Bash. Xử lý `allowScripts` theo 3.3 / D1 |
| B2 | `src/lib/text.ts`, so khớp qua `boDau` ở `provisioning.ts` và `client.ts` + `test/text-match.test.ts` | Chưa thêm dấu cho chữ nào, để thay đổi hành vi được tách riêng |
| B3 | Tiền tố đường dẫn (3.10): `config.ts` (`basePath`, kiểm khớp `APP_URL`), `src/lib/basePath.ts`, `app.ts` (router con, bọc `res.redirect`, xử lý ngoài tiền tố), `session.ts` (path cookie), `middleware/auth.ts:11`, `routes/cart.ts` (`quayLai`), `routes/home.ts` (robots), chèn `<%= base %>` vào mọi view, `head.ejs` (`data-base`), `public/js/app.js:61`, `.env.example` (thêm `BASE_PATH=`, chú thích ví dụ `/ten-mien`) + `test/base-path.test.ts`, `scripts/kiem-base.mjs` | Làm TRƯỚC mọi bước thêm dấu vì cùng chạm link trong view. Không đổi chữ hiển thị nào. Có thể tách 2 commit: (a) hạ tầng + test, (b) view. Sau bước này: mã băm route và thuộc tính không đổi, `kiem-base` = 0 |
| B4 | Lõi dùng chung: `config.ts` (MienTay Media), `.env.example`, `money.ts` (đ), `settings.ts`, `seed.ts`, partials, `error.ejs`, `middleware/error.ts`, `public/js/app.js` + `test/money.test.ts` | Mọi trang thấy khung có dấu từ đây |
| B5 | Trang công khai: `home`, `pricing`, `search`, `whois`, `transfer` + `routes/home.ts` | |
| B6 | Đăng nhập/đăng ký/2FA: `views/auth/*`, `routes/auth.ts`, `lib/validate.ts`, middleware, `twoFactor.ts`, `verification.ts`, `two-factor.test.ts` | |
| B7 | Giỏ, thanh toán, đơn: views, routes, services, phần hiển thị `payments/*`, `cart-orders.test.ts` | Chạy 6.2 ngay sau bước này |
| B8 | Khách và tên miền: `dashboard`, `account/*`, `domains/*`, `account.ts`, `controlPanel.ts`, `dns.ts`, `domainContact.ts`, `domains.ts`, `domainRepo.ts`, `transferOut.ts`, hai test | `domains/detail.ejs` (khoảng 115 đoạn) có thể là commit riêng |
| B9 | Quản trị: `views/admin/*`, `routes/admin.ts` (gồm `admin.ts:311, 315`), `reports.ts`, `audit.ts`, `jobs/*`, thông điệp hiển thị trong `client.ts` | `admin/settings.ejs` + nhãn cấu hình trong `admin.ts` có thể là commit riêng |
| B10 | API JSON: `routes/api.ts` | Chỉ giá trị `error`/`message`, không đổi khoá JSON, mã HTTP |
| B11 | Email và ZNS: `notifications.ts` (18 tiêu đề, khung, chân thư), `znsEvents.ts`, `lib/zns.ts`, `mailer.ts`, `zns.test.ts`, `test/email-encoding.test.ts` | Không chuyển sang Mineflow |
| B12 | Kiểm chứng cuối: `npm run kiem-dau` toàn bộ = 0, `grep -rnP "[\x{0300}-\x{036F}]" src public test` = 0, mã băm, `kiem-base` = 0, 6.2, 6.3, rút gọn danh sách cho phép (không còn "mục thừa"), lập bảng kiểm cho chủ duyệt | Mở PR |

**Lùi bản:** chưa có gì chạy thật, nên lùi bản là `git revert` commit tương ứng (mỗi bước độc lập, revert theo thứ tự ngược) hoặc bỏ PR. Nếu đã triển khai mà phát hiện chữ sai: sửa tiếp (đổi chữ không ảnh hưởng dữ liệu). Nếu B3 gây lỗi đường dẫn: đặt `BASE_PATH` rỗng là chạy ở gốc như cũ (lùi bằng cấu hình, không cần revert); revert B3 chỉ cần khi lỗi xảy ra cả lúc `BASE_PATH` rỗng, và vì các bước sau chèn chữ quanh `<%= base %>`, revert B3 sau B4 sẽ xung đột, nên ưu tiên sửa tiếp. Nếu B2 gây phân loại lỗi P.A sai trên môi trường thật: revert riêng B2 (không phụ thuộc các bước chữ, vì regex vẫn là ASCII). L1 chỉ ảnh hưởng chế độ sandbox. Không có thay đổi CSDL nên không cần lùi dữ liệu.

## 8. Phương án đã cân nhắc nhưng không chọn

| Phương án | Vì sao không chọn |
|---|---|
| Thêm thư viện i18n (i18next) hoặc từ điển khoá `t('auth.login')` | Phải đổi khoảng 1.600 chỗ thành khoá, tăng khối lượng và rủi ro gấp nhiều lần; chỉ có một ngôn ngữ; intent yêu cầu gọn, không mở rộng |
| Thêm dấu tự động bằng công cụ hoặc mô hình rồi duyệt sau | R1: "dang", "ma", "Da" đa nghĩa; sai hàng loạt khó phát hiện. Được dùng công cụ để gợi ý, nhưng người thực hiện phải đọc ngữ cảnh từng câu |
| Viết lại regex trong `provisioning.ts`/`client.ts` thành lớp ký tự có dấu (`[aàáạảã...]`) | Khó đọc, dễ sót; chuẩn hoá chuỗi trước khi so khớp ngắn hơn và dùng lại được ở 4 chỗ |
| Dùng `cross-env` cho L2 | Thêm phụ thuộc, phải sửa `package-lock.json` và `package.json` nhiều hơn trong lúc tệp này đang có thay đổi dở; vẫn phải xử lý glob trên cmd.exe và Node 20. Script Node giải quyết cả ba |
| Đặt biến môi trường trong `test/helpers/db.ts` | ES module nạp `config.ts` (đọc `DATABASE_FILE`) trước khi thân helper chạy, và không phải test nào cũng nạp helper; muốn đúng phải thêm một tệp nạp trước bằng `--import`, vẫn không giải quyết glob trên Windows |
| Sửa L1 bằng cách đặt key giả trong test | Che lỗi thay vì sửa; người dùng chạy sandbox trên máy dev vẫn gặp `NO_CREDENTIALS` |
| Đổi chuỗi MoMo/ZaloPay/webhook sang có dấu luôn | Nằm trong chuỗi ký hoặc là phản hồi máy; cần thử với môi trường thật của từng cổng (intent mục 4) |
| Bọc mọi link tĩnh bằng `url('/gio-hang')` | Đổi cả chuỗi nên không kiểm được bằng mã băm trước-sau; chèn `<%= base %>` là phép chèn thuần, xoá đi ra đúng tệp cũ. `url()` vẫn có cho link dựng trong khối `<% %>` |
| Sửa tay từng `res.redirect` (122 chỗ) thêm tiền tố | Nhiều chỗ, dễ sót, va chạm với các bước thêm dấu ở cùng tệp route; bọc một lần ở middleware cho kết quả giống hệt |
| Thẻ `<base href="/ten-mien/">` | Chỉ áp cho link tương đối, không áp cho link bắt đầu bằng `/` như toàn bộ view hiện có |
| Để proxy cắt tiền tố, app vẫn chạy ở gốc | App vẫn sinh link, redirect, cookie path thiếu tiền tố; vẫn phải sửa đủ các chỗ trên |
| Tự nhận diện "đã có tiền tố thì bỏ qua" trong bản bọc redirect | Sai với route nội bộ có thật `'/ten-mien'`, `'/ten-mien/:id/dong-bo'` (URL hợp lệ `/ten-mien/ten-mien/...`) |
| Đổi URL sang có dấu hoặc thống nhất lại | Ngoài phạm vi, phá liên kết và webhook |
| Viết script chuyển đổi dữ liệu `settings`/`tlds` cũ | Không có dữ liệu thật; tốn công cho trường hợp không tồn tại |
| Gom mọi lời gọi `sendZns` về một hàm ngay đợt này | Hợp lý cho dự án Mineflow nhưng là thay đổi cấu trúc, không phải đổi chữ; để dành cho intent Mineflow (ghi chú ở 3.8) |
| Dịch cả `npm run kiem-tra` và dòng in của `seed` | C6: ngoài phạm vi |

## 9. Điểm cần chủ duyệt

- **D1. Thay đổi `allowScripts` chưa commit trong `package.json`.** Mặc định của spec: giữ nguyên chưa commit, B1 chỉ đưa hai dòng `scripts` vào commit bằng `git apply --cached`. Đề xuất gọn hơn: chủ cho phép commit khối `allowScripts` thành một commit riêng ("chore: cho phép script cài đặt của better-sqlite3 và esbuild") trước B1. Cần chủ chọn.
- **D2. Kiểu đặt dấu "khoá/huỷ/tuỳ" (kiểu cũ) hay "khóa/hủy/tùy" (kiểu mới).** Spec chọn kiểu cũ cho khớp intent; nếu chủ chọn kiểu mới, đổi bảng 3.11 và câu test `transfer-out.test.ts:28` thành `/mở khóa/i`.
- **D3. Lỗi cấu hình của P.A** ("IP không được phép truy cập", "Lệnh thực thi không được hỗ trợ"): spec sửa để những phản hồi này không còn bị coi là thành công (lỗi có sẵn), nhưng không xếp vào loại lỗi vĩnh viễn, nên đơn vẫn được thử lại tối đa 3 lần trước khi báo lỗi và hoàn tiền tự động. Nếu chủ muốn dừng ngay và báo quản trị thay vì thử lại, đó là thay đổi hành vi nằm ngoài đợt này.
- **D4. Nhãn đơn vị "(VND)" trên ô nhập ở trang mã giảm giá và cấu hình làm tròn giá:** spec giữ "VND" (mã ISO). Nếu chủ muốn đồng bộ với "đ", đổi thành "(đ)".
- **D6. Ghép với site Next.js tại `/ten-mien`:** `mientaymedia.com/ten-mien` hiện là trang giới thiệu trong repo mientay-web. Khi proxy chuyển `/ten-mien/*` sang app, trang chủ của app (`/ten-mien/`, "Đăng ký tên miền Việt Nam & Quốc tế") sẽ thay trang giới thiệu đó. Spec không chặn việc này (tiền tố là cấu hình), nhưng chủ cần chốt ở giai đoạn Deploy: thay hẳn, hay đặt app ở tiền tố khác (ví dụ `/dang-ky-ten-mien`, chỉ cần đổi `BASE_PATH` và `APP_URL`). Đồng thời `robots.txt` gốc của mientay-web cần thêm `Disallow` và `Sitemap` của app; nếu site Next.js có cookie tên `sid` với `path=/` sẽ đè cookie phiên của app.
- **D7. HSTS `includeSubDomains`:** khi chạy production app gửi `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Dưới `mientaymedia.com`, header này buộc mọi tên miền con của mientaymedia.com phải chạy HTTPS trong một năm. Nếu có tên miền con nào chỉ chạy HTTP thì sẽ hỏng. Spec giữ nguyên; đề xuất xác minh ở Deploy hoặc cho phép bỏ `includeSubDomains` khi `BASE_PATH` khác rỗng (thay đổi một dòng, cần chủ đồng ý).
- **D5. Thông điệp phản hồi webhook cho SePay/MoMo/ZaloPay** giữ không dấu (máy đọc, `webhooks.ts:51` dựa vào chữ `Token`). Khách không thấy các thông điệp này.

## 10. Quyết định duyệt của chủ (15/10/2026)

- Spec đã duyệt, cho giai đoạn Build chạy trên nhánh `mtm/api-pavietnam`.
- D1: commit khối `allowScripts` trong `package.json` thành một commit riêng đầu nhánh, trước B1.
- D2: dùng kiểu dấu mới "khóa, hủy, tùy, hóa đơn, thỏa" (dấu đặt ở nguyên âm chính); cập nhật bảng chính tả và câu so khớp trong test theo kiểu này.
- D3, D4, D5: theo mặc định của spec.
- D6: app thay trang giới thiệu Next.js đang có, chạy tại `BASE_PATH=/ten-mien`. Phần ghép với site mientay-web (robots, cookie `sid`) xử lý ở Deploy.
- D7: chủ KHÔNG chọn bỏ `includeSubDomains` trong đợt này; giữ nguyên code, đưa vào danh sách kiểm ở Deploy.
