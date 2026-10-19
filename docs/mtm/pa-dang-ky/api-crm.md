---
type: dac-ta-api
du_an: pa-dang-ky
doi_tuong: CRM (crm-mientaymedia), người vận hành
cap_nhat: 19/10/2026
---

# Đặc tả: cổng nội bộ của web tên miền và sự kiện đẩy sang CRM

Hai chiều:

1. CRM gọi web: cổng máy duy nhất `/api/noi-bo/*` (dưới tiền tố web, ví dụ `https://mientaymedia.com/ten-mien/api/noi-bo/...`). Đợt này web có `trang-thai` và `kich-hoat`.
2. Web đẩy sự kiện sang CRM: `POST <CRM>/api/tich-hop/web-ten-mien/su-kien`, đúng hợp đồng `src/server/tich-hop/kiem-tra.ts` bên CRM.

## 1. Cổng nội bộ `/api/noi-bo/*`

### Xác thực và lỗi chung

| Mục | Giá trị |
|---|---|
| Khóa | `Authorization: Bearer <khóa>`; web nhận danh sách trong `WEB_TEN_MIEN_KEY` (cách nhau dấu phẩy để xoay vòng, khóa ngắn hơn 32 ký tự bị bỏ). CRM đặt cùng giá trị ở `WEB_TEN_MIEN_KEY` và `WEB_TEN_MIEN_URL` = URL web gồm tiền tố, ví dụ `https://mientaymedia.com/ten-mien` |
| So khóa | băm sha256 rồi `timingSafeEqual`, duyệt hết danh sách |
| Thân POST | `content-type: application/json`, khác thì 415 |
| Header nên gửi | `x-mtm-nguon: crm` (ghi vào nhật ký kiểm toán) |
| Giới hạn | 60 lần mỗi phút mỗi IP, quá thì 429 kèm `Retry-After` |
| Lỗi | thân `{ "error": "...", "ma_loi": "..." }`. 401 `khoa_khong_hop_le`, 503 `chua_bat` (web chưa đặt khóa), 415 `khong_phai_json`, 400 `du_lieu_khong_hop_le`, 404 `khong_tim_thay`. Mã 400/401/403/404/413/415/422 là vĩnh viễn (khớp `MA_VINH_VIEN` của `web-client.ts`), 429 và 5xx thử lại được |

Lưu ý cho CRM: `goiWeb()` trong `web-client.ts` hiện chỉ gửi POST. `trang-thai` là GET: thêm một hàm gọi GET cùng header (không có thân).

### GET `/api/noi-bo/trang-thai`

Trả 200:

```json
{
  "luc": "2026-10-19T03:00:00.000Z",
  "che_do": "that",
  "so_du": 3896,
  "cho_quy": {
    "so_dong": 1,
    "tong_can": 750000,
    "can_nap": 746104,
    "don": [
      { "ma_don": "DHAB12CD", "ma_dong": 41, "ten_mien": "vidu.vn", "loai": "register", "so_nam": 1, "can": 750000, "tu_luc": "2026-10-19T02:10:00Z" }
    ]
  },
  "don_loi": [
    { "ma_don": "DHEF34GH", "ma_dong": 42, "ten_mien": "abc.com", "loai_giu": "can_nguoi_xu_ly", "ma_pa": "606", "chi_tiet": "Lỗi: Đã trừ tiền ...", "tu_luc": "2026-10-19T01:00:00Z" }
  ]
}
```

- `che_do`: `that` | `thu` (lệnh ghi đi interface_test.php, không đăng ký thật) | `gia_lap`.
- `so_du`: số dư đại lý P.A (đồng) đọc trực tiếp bằng `check_account_still`; đọc lỗi thì `null` kèm `loi_so_du`.
- `can`: tiền đại lý cần cho dòng đó (giá vốn x số năm; chưa nhập giá vốn thì số tiền khách trả). `can_nap` = max(0, `tong_can` - `so_du`).
- `loai_giu`: `can_nguoi_xu_ly` (606 đã trừ tiền, 302 tạm khóa, lỗi cấu hình, lỗi lặp lại) hoặc `sai_ho_so` (2xxx, 6020 đến 6025...). `ma_pa` là ReturnCode P.A gần nhất.

### POST `/api/noi-bo/kich-hoat`

Thân (tùy chọn): `{ "ma_don": "DHAB12CD" }` hoặc `{ "order_id": 123 }`. Rỗng `{}` là kích hoạt mọi đơn chờ quỹ.

Việc làm: đọc số dư P.A, đăng ký các dòng chờ nạp quỹ cũ nhất trước trong phạm vi số dư. Dùng chung hàm với nút Telegram "Đã nạp, kích hoạt" và job 5 phút: gọi lặp hay gọi đồng thời không đăng ký hai lần (nhả dòng bằng một lệnh UPDATE có điều kiện, rồi cấp phát giành quyền bằng trạng thái `processing`).

Trả 200:

```json
{ "dang_chay": false, "so_du": 3146104, "da_chay": [ { "ma_don": "DHAB12CD", "ma_dong": 41, "ten_mien": "vidu.vn", "thanh_cong": true } ], "con_cho": 0, "can_nap": 0 }
```

`dang_chay: true` khi một lượt kích hoạt khác đang chạy trong tiến trình web: không làm gì thêm, gọi lại sau vài giây. `da_chay` rỗng nghĩa là không dòng nào đủ quỹ (xem `can_nap`). 404 nếu `ma_don` không có.

## 2. Sự kiện web đẩy sang CRM

Bật ở web: Quản trị > Cấu hình > "Đẩy sự kiện đơn hàng sang CRM" (`crm.bat`), địa chỉ `crm.url` (hoặc `CRM_URL`), khóa `crm.khoa` (hoặc `CRM_INTEGRATION_KEY`, một khóa trong `INTEGRATION_WEB_KEYS` của CRM). Mặc định tắt.

Gửi: `POST <crm.url>/api/tich-hop/web-ten-mien/su-kien`, header `Authorization: Bearer <khóa>`, `content-type: application/json`, `Idempotency-Key: <ma_su_kien>`, `x-mtm-nguon: web-ten-mien`. Thân có `phien_ban: 1`, `su_kien`, `ma_su_kien`, `luc` (ISO có `Z`), `don` (ảnh chụp đơn đúng `AnhChupDon` của `kiem-tra.ts`: tổng `thanh_tien_sau_thue` các dòng bằng `tong`; giảm giá và VAT của đơn chia theo tỷ lệ thành tiền, dòng cuối nhận phần dư).

Giao qua hàng đợi web: ảnh chụp lấy lúc gửi (trạng thái mới nhất), lỗi mạng / 5xx / 409 thử lại lũy thừa khoảng 2 giờ, 400/401/403/404/413/415/422 dừng ngay (ghi log `crm_su_kien_bi_tu_choi`).

| Khi nào ở web | `su_kien` | `ma_su_kien` | CRM hiện có? |
|---|---|---|---|
| Đơn chuyển sang đã thanh toán | `don_da_thanh_toan` | `don_da_thanh_toan:<ma_don>` | Có |
| Đăng ký / gia hạn xong một dòng | `ten_mien_doi_han` (kèm `ten_mien`, `nguoi_mua`, `don`) | `ten_mien_doi_han:<ten>:<het_han>:<trang_thai>` | Có |
| (cùng lúc trên) gửi lại ảnh chụp | `don_da_thanh_toan` | như trên, cùng mã | Có: CRM "trạng thái mới nhất thắng" |
| Dòng chuyển sang chờ nạp quỹ | `don_cho_quy` | `don_cho_quy:<ma_don>:<ma_dong>` | **CHƯA** |
| Dòng chuyển sang cần người xử lý / sai hồ sơ | `don_loi` | `don_loi:<ma_don>:<ma_dong>` | **CHƯA** |

Trạng thái dòng trong ảnh chụp: `thanh_cong` (đăng ký xong), `dang_xu_ly` (chờ cấp phát, gồm cả dòng đang giữ chờ quỹ / lỗi), `dang_chuyen`, `that_bai`, `da_hoan`.

### Đề xuất CRM bổ sung hai loại sự kiện (không sửa repo CRM trong dự án này)

`SU_KIEN` trong `kiem-tra.ts` hiện có 6 loại: `don_da_thanh_toan`, `don_hoan_tien`, `don_huy`, `ten_mien_doi_han`, `don_cho_24h`, `hoa_don_dien_tu`. Thiếu `don_cho_quy` và `don_loi`. Web chỉ gửi hai loại này khi chủ bật `crm.su_kien_mo_rong` (mặc định tắt), để CRM chưa nâng cấp không nhận 400 lặp lại. Hợp đồng đề xuất:

- Chung: `don` bắt buộc (ảnh chụp như trên). Khuôn mã ở cột bảng trên.
- `don_cho_quy`: thêm `cho_quy: { ma_dong: int, ten_mien: string, can: int (đồng), tu_luc: ISO }`. CRM nên hiện đơn ở dashboard "chờ nạp quỹ" kèm tổng cần nạp, và nút Kích hoạt gọi `POST /api/noi-bo/kich-hoat`.
- `don_loi`: thêm `loi: { ma_dong, ten_mien, loai_giu: "can_nguoi_xu_ly" | "sai_ho_so", ma_pa: string, chi_tiet: string, tu_luc: ISO }`.
- Hai loại này KHÔNG phải tiền vào hay ra: CRM không ghi phiếu thu, hóa đơn, chỉ ghi dòng thời gian / việc cần làm. Khi dòng đăng ký xong, web gửi `ten_mien_doi_han` và gửi lại `don_da_thanh_toan` (dòng thành `thanh_cong`): CRM đóng việc chờ tương ứng.

## 3. Chưa có ở web (để CRM biết)

`web-client.ts` của CRM còn gọi `POST /api/noi-bo/thong-bao` và `POST /api/noi-bo/gia-han` (spec dong-bo-don-hang 3.11). Nhánh này chưa làm hai đường dẫn đó (ngoài phạm vi pa-dang-ky); gọi bây giờ nhận 404 sau khi qua xác thực.
