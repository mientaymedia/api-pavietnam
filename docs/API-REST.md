# REST API cho khach hang

Cho phep khach hang tu xay giao dien rieng (website, ung dung, landing page) tren nen tang nay.

- Duong dan goc: `https://<ten-mien-cua-ban>/api/v1`
- Du lieu vao/ra: JSON (`content-type: application/json`)
- Gioi han: 120 request/phut moi IP (mot so endpoint chat hon)
- Loi luon tra ve dang `{"error": "mo ta bang tieng Viet"}`

## Xac thuc

Tao token tai **Tai khoan cua toi > API token**. Token chi hien thi **mot lan** khi tao;
he thong chi luu ban bam SHA-256, khong the xem lai.

```
Authorization: Bearer pat_xxxxxxxxxxxxxxxxxxxx
```

Quyen: `read` (chi doc) hoac `read,write` (doc va ghi). Thu hoi token bat ky luc nao.

---

## Endpoint cong khai (khong can token)

### `GET /tlds` - Danh sach duoi va gia

```json
{ "data": [ {
  "tld": "com.vn", "kind": "vn", "label": "Doanh nghiep, thuong mai",
  "requiresVnContact": true, "minYears": 1, "maxYears": 10,
  "price": { "register": { "total": 690000, "vat": 0, "currency": "VND" }, "renew": {...}, "transfer": {...} }
} ] }
```

### `GET /check?domain=<ten-mien-hoac-tu-khoa>&years=<n>`

Nhap **ten mien day du** -> kiem tra chinh xac ten do:

```bash
curl "https://<site>/api/v1/check?domain=congtyabc.vn"
```
```json
{ "data": { "domain": "congtyabc.vn", "available": true, "price": { "total": 830000, "..." : "..." } } }
```

Nhap **tu khoa** (khong co dau cham) -> tra ve goi y tren nhieu duoi:

```bash
curl "https://<site>/api/v1/check?domain=congtyabc"
```
```json
{ "query": "congtyabc", "data": [
  { "domain": "congtyabc.vn", "tld": "vn", "available": true, "unknown": false, "price": {...} },
  { "domain": "congtyabc.com", "tld": "com", "available": false, "unknown": false, "price": null }
] }
```

> `unknown: true` nghia la **chua kiem tra duoc** (loi API / IP chua whitelist) - khac han
> voi `available: false` (da co nguoi dang ky). Giao dien nen phan biet ro hai truong hop nay.

### `GET /whois?domain=<ten-mien>`

Tra ve thong tin WHOIS da chuan hoa (`registrar`, `createdAt`, `expiresAt`, `nameservers`)
kem van ban goc.

---

## Endpoint can token

### `GET /me` - Thong tin tai khoan

### `GET /payment-methods` - Cac phuong thuc thanh toan dang bat

### `POST /orders` - Dat hang

```json
{
  "items": [
    { "domain": "congtyabc.vn", "action": "register", "years": 2 },
    { "domain": "congtyabc.com", "action": "register", "years": 1 }
  ],
  "contactId": 12,
  "coupon": "SALE10",
  "payWith": "sepay"
}
```

| Truong | Bat buoc | Ghi chu |
|---|---|---|
| `items[].domain` | co | Ten mien day du |
| `items[].action` | khong | `register` (mac dinh), `renew`, `transfer` |
| `items[].years` | khong | Mac dinh 1, toi da 10 |
| `items[].authCode` | khi `transfer` | Ma EPP/Auth Code tu nha dang ky cu |
| `contactId` | khong | Ho so chu the; bo trong se dung ho so mac dinh |
| `coupon` | khong | Ma giam gia |
| `payWith` | khong | `sepay`, `momo`, `zalopay`, `balance` - tao luon giao dich thanh toan |

Phan hoi (`201`):

```json
{
  "data": {
    "code": "DHAB12CD", "status": "pending_payment", "total": 1350000,
    "items": [ { "domain": "congtyabc.vn", "years": 2, "status": "pending" } ]
  },
  "payment": {
    "provider": "sepay", "refCode": "DHAB12CD", "amount": 1350000,
    "payUrl": null,
    "qrUrl": "https://qr.sepay.vn/img?acc=...&amount=1350000&des=DHAB12CD",
    "instructions": [ { "label": "So tai khoan", "value": "...", "copyable": true } ]
  }
}
```

Voi `sepay`: hien `qrUrl` cho khach quet. Voi `momo`/`zalopay`: chuyen huong khach sang `payUrl`.

Ten mien duoc dang ky **tu dong** ngay khi thanh toan duoc ghi nhan - khong can goi them lenh nao.

**Chuyen ten mien ve** can them `authCode`:

```json
{
  "items": [ { "domain": "tenmien-cua-ban.com", "action": "transfer", "years": 1, "authCode": "EPP-abc123" } ],
  "payWith": "sepay"
}
```

Sau khi thanh toan, `items[].status` chuyen sang `active` nghia la **da gui yeu cau** -
ten mien ve thuc su sau 5-7 ngay khi nha dang ky cu duyet. Trang thai ten mien trong
`GET /domains` se la `pending` cho den luc do.

### `GET /orders` va `GET /orders/{code}` - Theo doi don hang

Doc `data.items[].status`:

| Gia tri | Y nghia |
|---|---|
| `pending` | Cho xu ly |
| `processing` | Dang goi API dang ky |
| `active` | Da dang ky thanh cong |
| `failed` | That bai - xem `error` de biet ly do |

### `GET /domains` - Ten mien trong tai khoan

```json
{ "data": [ {
  "domain": "congtyabc.vn", "status": "active",
  "registeredAt": "2026-08-20T10:00:00Z", "expiresAt": "2028-08-20T00:00:00Z",
  "daysLeft": 730, "autoRenew": true,
  "nameservers": ["ns1.pavietnam.vn", "ns2.pavietnam.vn"]
} ] }
```

### `GET /domains/{domain}/dns` - Ban ghi DNS

```json
{ "data": [ { "id": "1", "type": "A", "name": "@", "content": "103.28.36.1", "ttl": 3600 } ],
  "stale": false, "error": null }
```

`stale: true` nghia la du lieu lay tu ban luu cuc bo do khong goi duoc API - **khong nen ghi de**
khi dang o trang thai nay.

### `POST /domains/{domain}/dns` - Them hoac ghi de ban ghi

Gui **mot object** -> them mot ban ghi:

```json
{ "type": "A", "name": "@", "content": "103.28.36.1", "ttl": 3600 }
```

Gui **mot mang** -> ghi de toan bo bo ban ghi:

```json
[ { "type": "A", "name": "@", "content": "103.28.36.1", "ttl": 3600 },
  { "type": "MX", "name": "@", "content": "mail.abc.com", "ttl": 3600, "priority": 10 } ]
```

Loai ho tro: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SRV`, `CAA`.
Ban ghi `MX` bat buoc co `priority`. Ban ghi `A` phai la dia chi IPv4 hop le.

### `DELETE /domains/{domain}/dns/{index}` - Xoa ban ghi theo vi tri

`index` la vi tri trong mang tra ve tu `GET /dns` (bat dau tu 0).
Nen goi `GET` ngay truoc de lay vi tri chinh xac.

### `PUT /domains/{domain}/nameservers` - Doi nameserver

```json
{ "nameservers": ["ns1.abc.com", "ns2.abc.com"] }
```

Toi thieu 2, toi da 6.

---

## Ma loi

| HTTP | Y nghia |
|---|---|
| `401` | Thieu token / token sai / da thu hoi |
| `404` | Khong tim thay, hoac tai nguyen khong thuoc tai khoan cua ban |
| `422` | Du lieu gui len khong hop le (`error` mo ta cu the) |
| `429` | Vuot gioi han tan suat |
| `502` | Khong goi duoc API nha dang ky |

Vi ly do bao mat, tai nguyen khong thuoc tai khoan cua ban tra ve `404` (khong phai `403`)
de khong tiet lo su ton tai cua no.
