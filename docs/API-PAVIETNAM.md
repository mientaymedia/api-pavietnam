# Tich hop API dai ly P.A Viet Nam

## Van de va cach giai quyet

Tai lieu API dai ly cua P.A (`kb.pavietnam.vn`) yeu cau dang nhap va chi truy cap duoc tu
mang cua ban. Vi khong the doi chieu tai lieu tu moi truong build, tang tich hop duoc thiet
ke theo huong **khong doan mo**:

1. Ten `action` va ten tham so khai bao **tap trung** o `src/pavietnam/actions.ts`
2. Moi ten deu **ghi de duoc bang bien moi truong** - khong phai sua code
3. Bo parse chap nhan **ca ba dinh dang** phan hoi (JSON / XML / `key=value`)
4. Co **cong cu do** (`npm run pa:probe`) de xac dinh ten dung tu may cua ban

Nho vay, khi ban mo duoc tai lieu, viec chinh sua chi mat vai phut va gioi han trong `.env`.

## Buoc 1: Chay cong cu do

Chay tu may co IP da duoc P.A whitelist:

```bash
npm run pa:probe -- --domain tenmien-thu.com
```

Ket qua mau:

```
# Nhom action: check   (dang cau hinh: "checkdomain")
  -> action=checkdomain         [OK ] 412ms
     status=OK&domain=tenmien-thu.com&available=0
  -> action=check               [LOI] 380ms
     ERROR: action not found
```

Ten nao tra ve du lieu hop le chinh la ten can dung.

Chi cac lenh **chi doc** duoc goi: `check`, `whois`, `info`, `dnsGet`, `list`, `balance`.
Cong cu **khong bao gio** goi `register`/`renew` vi chung phat sinh chi phi that.

Goi mot action bat ky de thu nghiem:

```bash
npm run pa:probe -- --action checkdomain --params domain=abc.com
npm run pa:probe -- --only check,whois --domain abc.vn
```

## Buoc 2: Ghi ket qua vao `.env`

```env
PA_ACTION_CHECK=checkdomain
PA_ACTION_REGISTER=regdomain
PA_ACTION_RENEW=renewdomain
PA_ACTION_TRANSFER=transferdomain
PA_ACTION_WHOIS=whois
PA_ACTION_DNS_GET=getdns
PA_ACTION_DNS_SET=updatedns
PA_ACTION_NS_SET=changens
PA_ACTION_LIST=listdomain
PA_ACTION_INFO=domaininfo
PA_ACTION_BALANCE=balance
```

Neu **ten tham so** khac tai lieu, ghi de tuong tu:

```env
PA_FIELD_DOMAIN=domain
PA_FIELD_YEARS=year
PA_FIELD_NS=ns
PA_FIELD_AUTH_CODE=authcode
PA_FIELD_RECORD_TYPE=type
PA_FIELD_RECORD_NAME=name
PA_FIELD_RECORD_VALUE=value
PA_FIELD_RECORD_TTL=ttl
PA_FIELD_RECORD_PRIORITY=priority
```

Ten truong **ho so chu the** (ho ten, CMND, ma so thue...) nam trong ham `contactParams()`
o `src/pavietnam/client.ts`. He thong gui kem nhieu bien the ten pho bien (`idnumber` va
`id_number`, `taxcode` va `tax_code`...) de tang kha nang tuong thich; API se bo qua tham so
no khong dung. Neu tai lieu cua ban dung ten khac han, sua tai mot cho duy nhat do.

## Bo parse phan hoi

`src/pavietnam/parse.ts` thu lan luot:

| Dinh dang | Vi du |
|---|---|
| JSON | `{"status":"OK","domain":"abc.com","available":1}` |
| XML | `<result><status>OK</status><domain>abc.com</domain></result>` |
| `key=value` | `status=OK`<br>`domain=abc.com` |

Ket qua duoc chuan hoa ve object phang, key ha ve chu thuong. Voi XML long nhau, du lieu
truy cap duoc theo **ca hai** cach: `data['result']` (giu cau truc) va `data['status']` (phang).

`pick(data, [...])` doc gia tri theo danh sach key uu tien, nen phan hoi dung `expiredate`,
`expire_date` hay `ngayhethan` deu doc duoc.

## Xac dinh thanh cong / that bai

Doc theo thu tu: `status` > `result` > `code` > `errorcode`.

Cac gia tri duoc coi la **thanh cong**: `ok`, `success`, `true`, `1`, `0`, `200`, `done`, `thanhcong`.

> Luu y ca `0` lan `1` deu nam trong danh sach: mot so API dung `code=0` nghia la thanh cong,
> so khac dung `status=1`. Vi vay he thong **uu tien doc truong dang chu** (`status`, `result`)
> truoc truong dang so (`code`).

Neu phan hoi khong co truong trang thai nao, he thong suy doan tu noi dung (tim tu khoa
`error`, `fail`, `invalid`, `denied`...).

## Kiem tra ten mien con trong

Uu tien doc truong `available` khi no la gia tri nhi phan ro rang (`0/1/true/false/yes/no`).
Neu khong, doc tu van ban:

- Coi la **da co nguoi dang ky**: `unavailable`, `taken`, `registered`, `da dang ky`
- Coi la **con trong**: `available`, `free`, `chua dang ky`, `con trong`

Khong xac dinh duoc thi mac dinh **khong con trong** - an toan hon la ban nham mot ten
mien da co chu.

## Che do gia lap (sandbox)

```env
PAVIETNAM_SANDBOX=1
```

Tra du lieu mau, khong goi mang, khong phat sinh chi phi. Ket qua **on dinh** theo ten mien
(bam SHA-256 tu ten), nen cung mot ten luon cho cung ket qua - tien cho demo va kiem thu.

Bat/tat duoc ngay tren _Quan tri > Cau hinh Control Panel_.

## Nhat ky goi API

Moi request/response duoc luu vao bang `api_logs`, xem tai _Quan tri > Nhat ky API_.

**API Key luon duoc che** truoc khi ghi (`f823****dae8`), khong bao gio luu dang goc.

Tat ghi log: `PAVIETNAM_LOG=0`.

## Xu ly su co

| Hien tuong | Nguyen nhan thuong gap |
|---|---|
| Moi action deu loi hoac tra ve rong | IP may chu chua duoc P.A whitelist |
| `NO_CREDENTIALS` | Chua dien username/API Key |
| Truoc chay duoc, nay bao sai key | API Key doi khi doi mat khau tai khoan dai ly |
| Check duoc nhung dang ky loi | Thieu ho so chu the, hoac tai khoan dai ly khong du so du |
| DNS doc duoc nhung khong sua duoc | Ten action `PA_ACTION_DNS_SET` chua dung |
| Chuyen ten mien ve bi tu choi | Ten mien dang khoa, chua qua 60 ngay, hoac ma EPP sai |

Kiem tra nhanh ngay tren giao dien: _Quan tri > Cau hinh Control Panel > Kiem tra ket noi API_.
