# Nen tang ban ten mien tu dong (P.A Viet Nam)

Website ban ten mien hoan chinh: khach tu tim kiem, dang ky tai khoan, dat mua,
thanh toan, va ten mien duoc **dang ky tu dong** qua API dai ly cua P.A Viet Nam.
Khach quan ly DNS trong Control Panel rieng; ban quan tri toan bo trong khu vuc Admin.

```
Tim ten mien -> Gio hang -> Dat hang -> Quet QR chuyen khoan
     -> SePay bao webhook -> He thong dang ky ten mien qua API P.A
     -> Gui email thong tin quan tri -> Khach vao Control Panel cau hinh DNS
```

Toan bo chuoi tren chay **khong can thao tac thu cong**.

---

## 1. Chay thu trong 5 phut

```bash
npm install
cp .env.example .env          # roi mo .env dien thong tin
npm run migrate               # tao cau truc CSDL
npm run seed                  # tao tai khoan admin + bang gia mau
npm run dev                   # mo http://localhost:3000
```

Sinh hai chuoi bi mat bat buoc cho `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
```

Muon xem giao dien chay day du **truoc khi** co API that: dat `PAVIETNAM_SANDBOX=1`.
He thong se tra du lieu gia lap, khong goi mang, khong phat sinh chi phi.

Chay that:

```bash
npm run build && npm start
```

---

## 2. Ba viec phai lam truoc khi mo ban

### 2.1. Dang ky IP cua **may chu** voi P.A

API dai ly chi chap nhan request tu IP nam trong danh sach whitelist. IP can dang ky la
**IP cong khai cua may chu chay website nay**, khong phai IP may tinh ca nhan hay IP van phong.

Kiem tra IP that cua may chu:

```bash
curl -s https://api.ipify.org; echo
```

Gui IP do cho P.A de them vao whitelist. Neu dung Cloudflare/proxy, IP **di ra** (outbound)
moi la IP can dang ky - thuong khac IP tro ve ten mien.

> Danh sach whitelist hien tai cua tai khoan dai ly co the dang khac voi IP may chu.
> Neu goi API bao loi "not allowed" hoac tra ve rong, hay kiem tra muc nay dau tien.

### 2.2. Xac nhan ten `action` cua API

Tai lieu API dai ly (kb.pavietnam.vn) chi truy cap duoc tu mang cua ban. Vi vay ten `action`
va ten tham so duoc khai bao **tap trung** tai [`src/pavietnam/actions.ts`](src/pavietnam/actions.ts)
va co the ghi de bang bien moi truong - **khong can sua code**.

Chay cong cu do tu may co IP da whitelist:

```bash
npm run pa:probe -- --domain tenmien-thu.com
```

Cong cu goi lan luot cac ten action ung vien (chi cac lenh **chi doc**, khong bao gio thu
`register`/`renew` vi chung phat sinh chi phi that) va in phan hoi tho. Chon ten nao tra ve
du lieu hop le roi ghi vao `.env`:

```env
PA_ACTION_CHECK=checkdomain
PA_ACTION_REGISTER=regdomain
PA_ACTION_RENEW=renewdomain
PA_ACTION_WHOIS=whois
PA_ACTION_DNS_GET=getdns
PA_ACTION_DNS_SET=updatedns
PA_ACTION_NS_SET=changens
```

Chi tiet: [docs/API-PAVIETNAM.md](docs/API-PAVIETNAM.md).

Ban cung co the bam **Kiem tra ket noi API** ngay trong _Quan tri > Cau hinh Control Panel_.

### 2.3. Cap nhat bang gia that

`npm run seed` tao bang gia **mau** de he thong chay duoc ngay. Truoc khi mo ban, vao
_Quan tri > Bang gia_ va nhap dung gia von / gia ban theo bang gia dai ly cua ban.

---

## 3. Thanh toan tu dong qua SePay

He thong dung [SePay](https://my.sepay.vn) de doi soat bien dong so du tai khoan ngan hang.
Khong can cong thanh toan trung gian, tien ve thang tai khoan doanh nghiep.

**Thiet lap:**

1. Dang ky my.sepay.vn, lien ket tai khoan ngan hang nhan tien.
2. Tao Webhook:
   - URL: `https://<ten-mien-cua-ban>/webhooks/sepay`
   - Header: `Authorization: Apikey <chuoi-bi-mat-ban-tu-dat>`
   - Su kien: giao dich tien vao
3. Dien cung chuoi bi mat do vao `SEPAY_WEBHOOK_TOKEN` (hoac o _Cau hinh Control Panel_).
4. Tao them **API Token** tai my.sepay.vn va dien vao `SEPAY_API_TOKEN` - dung cho
   viec doi soat bu.

**Cach hoat dong:** ma don hang (vi du `DHAB12CD`) chinh la noi dung chuyen khoan.
Khi SePay bao co tien vao, he thong do ma don trong noi dung, doi chieu so tien, roi day
don vao hang doi dang ky ten mien.

**Luoi an toan:** neu webhook that lac (dang deploy, mat mang), job `reconcile_sepay`
chay moi 10 phut se goi API SePay lay giao dich gan nhat va doi soat lai. Moi giao dich
nhan duoc - ke ca khong khop don - deu duoc luu tai _Quan tri > Doi soat_ de tra soat.

**Chong ghi nhan trung:** rang buoc `UNIQUE(provider, provider_txn)` o tang CSDL, nen du
webhook goi lai bao nhieu lan, mot giao dich chi duoc ghi nhan mot lan.

Ngoai SePay, he thong con ho tro **vi MoMo**, **ZaloPay** va **so du tai khoan**
(danh cho dai ly cap 2 nap tien truoc).

---

## 4. Cau hinh Control Panel (khu vuc Admin)

`/admin/cau-hinh` cho phep sua **truc tiep tren giao dien**, co hieu luc ngay, khong can
sua file `.env` va khong can khoi dong lai server:

| Nhom | Noi dung |
|---|---|
| Thuong hieu | Ten site, mau chu dao, logo, hotline, dia chi |
| API P.A Viet Nam | Endpoint, username, API Key, che do gia lap |
| DNS mac dinh | Nameserver gan cho ten mien ngay khi dang ky xong |
| Chinh sach gia | Markup (%), lam tron len boi so, VAT mac dinh |
| Quy trinh don hang | Tu dong dang ky, thoi gian giu don, moc nhac gia han |
| SePay / MoMo / ZaloPay | Tai khoan nhan tien, webhook token, khoa bi mat |
| SMTP | May chu gui email thong bao |

Gia tri bi mat (API Key, webhook token, khoa cong thanh toan) duoc **ma hoa AES-256-GCM**
truoc khi luu vao CSDL va luon hien thi dang che (`abcd****wxyz`).

Cac trang quan tri khac: **Bao cao**, Bang gia, **Ma giam gia**, Don hang, **Doi chu the**,
Ten mien, Khach hang, Doi soat ngan hang, Hang doi xu ly, Nhat ky ZNS, Nhat ky goi API.

**Ma giam gia** ho tro giam theo phan tram hoac so tien co dinh, tran giam toi da,
gioi han theo duoi ten mien, don toi thieu, so luot dung va khoang thoi gian hieu luc.

### Bao cao kinh doanh

He thong luu gia von (`cost_register`, `cost_renew`) tu dau, nen bao cao tinh duoc
**lai gop that**, khong chi doanh thu:

- Doanh thu / gia von / lai theo **12 thang** (bieu do cot chong)
- Doanh thu va **ty le lai theo tung duoi** ten mien - biet duoi nao thuc su co lai
- **Du kien doanh thu gia han** 30/60/90 ngay toi
- Tien thuc nhan theo tung phuong thuc thanh toan, tru di phan da hoan
- Khach hang dong gop nhieu nhat

**Cach tinh doanh thu:** chi tinh ten mien **da kich hoat** thuoc don **da thanh toan**.
Dong that bai hoac da hoan tien khong duoc tinh - neu tinh ca chung thi bao cao se cao
hon tien thuc nhan. Gia von lay tu bang gia **tai thoi diem xem**, nen sua gia von se
lam doi so lai cua ky cu.

**Xuat du lieu:** don hang, ten mien va doanh thu deu xuat duoc ra CSV mo bang Excel
(co BOM UTF-8 nen tieng Viet khong bi loi font).

---

## 5. Control Panel cua khach hang

- Danh sach ten mien, trang thai, ngay het han, canh bao sap het han
- Quan ly ban ghi DNS: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA
- Doi nameserver
- Bat/tat gia han tu dong, dat lenh gia han
- Tra cuu WHOIS, dong bo lai thong tin tu nha dang ky
- Ho so chu the ten mien (bat buoc voi `.vn` theo quy dinh VNNIC)
- Phieu thanh toan in duoc cho moi don da hoan tat

### Gia han tu dong hoat dong the nao

Voi ten mien da bat `Gia han tu dong`, moi 12 gio he thong quet cac ten mien
con duoi 14 ngay (sua duoc trong _Cau hinh Control Panel_) va:

1. Tao don gia han - **bo qua neu ten mien da co don dang cho**, nen job chay
   lai bao nhieu lan cung khong sinh don trung
2. **Du so du vi** -> tru tien, gia han ngay, gui email bao da tru
3. **Khong du** -> giu don lai, tao san ma QR va gui email kem link thanh toan

Khach chi nhan **mot** email cho moi lan gia han, khong bi gui lap.

### Chu the ten mien: hai viec khac nhau

Day la cho hay bi lam sai, nen he thong tach doi ro rang:

| Viec | Cach lam | Thoi gian |
|---|---|---|
| **Sua thong tin lien he** (email, dien thoai, dia chi cua *cung* mot chu the) | Goi API, khach tu lam trong Control Panel | Ngay lap tuc |
| **Doi chu the** (sang nguoi/to chuc *khac*) | Nop ho so, quan tri vien xu ly | Vai ngay |

Vi sao doi chu the khong tu dong: voi `.vn` day la **thu tuc phap ly** theo quy dinh VNNIC -
can ban khai co chu ky/con dau va giay to phap nhan cua ca hai ben. Voi ten mien quoc te,
doi chu the thuong keo theo khoa chuyen doi 60 ngay va can xac nhan tu ca chu cu lan chu moi
theo quy dinh ICANN. He thong nhan **ho so** roi theo doi tung buoc, thay vi gia vo rang no
la mot lenh API.

Ho so di qua cac trang thai: cho tiep nhan -> dang xem xet -> can bo sung giay to -> da duyet
-> hoan tat (hoac tu choi/huy). **Moi lan doi trang thai deu gui email cho khach** kem ghi chu
cua bo phan xu ly. Chi khi ho so **hoan tat** thi chu the cua ten mien moi thuc su doi.

Khi email chu the thay doi, he thong bao cho **ca dia chi cu va moi** - vi email chu the la
duong khoi phuc quyen kiem soat ten mien.

### Chuyen ten mien di (transfer-out)

Ten mien la tai san cua khach - ho co quyen mang di bat cu luc nao, va he thong
khong duoc gay kho de. Trong Control Panel, muc **Chuyen ten mien di** cho phep
khach tu **mo khoa** roi **lay ma EPP**, khong can lien he ho tro.

Ma EPP dong thoi la chia khoa chiem doat ten mien, nen moi lan lay deu:

- Yeu cau **mo khoa truoc** (khoa la trang thai an toan mac dinh)
- Chi hien **mot lan** tren man hinh, he thong khong luu lai
- **Gui email canh bao ngay** cho chu so huu, kem IP va thoi diem - de neu tai
  khoan bi chiem, chu that biet ngay va con kip doi mat khau + khoa lai
- Ghi nhat ky kiem toan (ai lay, IP nao) **nhung khong ghi ma**
- Che ma khoi nhat ky ky thuat `api_logs`
- Cho 5 phut giua hai lan lay, va toi da 5 lan moi 15 phut

### Chuyen ten mien ve (transfer-in)

Trang `/chuyen-ten-mien` nhan ten mien + **ma EPP/Auth Code** lay tu nha dang ky cu.
He thong bat buoc phai co ma nay truoc khi cho vao gio hang.

Sau khi thanh toan, yeu cau duoc gui sang nha dang ky. Vi ten mien quoc te mat
5-7 ngay moi ve, ten mien duoc ghi trang thai `pending` (khong phai `active`) va
duoc **xep lich tu dong kiem tra lai sau 6 gio**. Khach nhan email huong dan
duyet thu xac nhan tu nha dang ky cu.

**An toan du lieu DNS:** moi thao tac sua/xoa deu doc bo ban ghi hien tai tu P.A truoc.
Neu khong doc duoc, he thong **tu choi ghi** thay vi ghi de - tranh xoa mat ban ghi cua khach.

---

## 6. REST API cho khach hang

Khach co the tu xay giao dien rieng. Tao token tai _Tai khoan cua toi > API token_.

```bash
# Cong khai - khong can token
curl "https://<site>/api/v1/tlds"
curl "https://<site>/api/v1/check?domain=congtyabc"
curl "https://<site>/api/v1/whois?domain=vidu.vn"

# Can token
curl -H "Authorization: Bearer pat_xxx" https://<site>/api/v1/domains

# Dat hang + tao QR thanh toan trong mot lenh
curl -X POST https://<site>/api/v1/orders \
  -H "Authorization: Bearer pat_xxx" -H 'content-type: application/json' \
  -d '{"items":[{"domain":"congtyabc.vn","years":2}],"payWith":"sepay"}'
```

Danh sach day du: [docs/API-REST.md](docs/API-REST.md).

---

## 6b. Thong bao: Email va Zalo ZNS

**Email** la kenh chinh (bat buoc). **Zalo ZNS** la kenh phu, bat khi can.
Ca hai deu khong bao gio lam hong luong nghiep vu khi gui that bai.

- **Xac thuc email khi dang ky**: gui ngay luc tao tai khoan, hieu luc 24 gio,
  co dai nhac va nut gui lai (gioi han 5 lan/gio). Tuy chon **bat buoc xac thuc
  truoc khi dat hang** - mac dinh tat.
- **ZNS**: gui thong bao vao Zalo cho 6 su kien (don moi, da thanh toan, ten mien
  kich hoat, nhac gia han, tu dong gia han, dang ky that bai).

Ca SMTP lan ZNS deu co **nut gui thu ngay tren giao dien** _Cau hinh Control Panel_.

Huong dan chi tiet - ke ca ba loi hay gap khi dung Gmail va cach xu ly
refresh token cua Zalo: [docs/EMAIL-ZNS.md](docs/EMAIL-ZNS.md).

---

## 7. Kien truc

```
src/
├── pavietnam/     Tang tich hop nha dang ky (client, ban do action, parser, cong cu do)
├── payments/      SePay, MoMo, ZaloPay, so du vi - chung mot giao dien PaymentProvider
├── services/      Nghiep vu: tim kiem, gio hang, don hang, cap phat, DNS, email
├── jobs/          Hang doi trong CSDL + worker (cap phat, nhac gia han, doi soat)
├── routes/        Trang web + REST API
├── middleware/    Phien dang nhap, CSDL-backed session, CSRF, phan quyen, rate limit
├── views/         Giao dien EJS
└── db/            Luoc do SQLite + seed
```

**Vi sao dung hang doi?** Dang ky ten mien mat vai giay va co the loi tam thoi. Dua vao
hang doi giup: webhook phan hoi ngay (cong thanh toan khong goi lai), tu dong thu lai theo
cap so nhan khi API loi, va khong mat viec khi tien trinh khoi dong lai (job nam trong CSDL).

**Chong dang ky trung:** truoc khi goi API dang ky, dong don hang duoc chuyen sang
`processing` trong mot transaction. Hai tien trinh khong the cung dang ky mot ten mien.

**Loi vinh vien vs loi tam thoi:** "ten mien da co nguoi lay" hay "khong du so du" thi dung
ngay va bao cho khach + quan tri; loi mang/timeout thi tu thu lai (5s, 10s, 20s... toi da 30 phut).

**Hoan tien khi that bai:** khach da tra tien ma khong nhan duoc ten mien thi tien duoc
**tu dong hoan vao so du vi** ngay khi dong don that bai vinh vien (tat duoc trong cau hinh
neu muon duyet tay). So tien hoan chia theo ty le cua dong do trong don, da tinh ca giam gia
va VAT. Quan tri vien co nut hoan tay cho tung dong hoac ca don trong trang chi tiet don hang.

**Khong phu thuoc dich vu ngoai:** CSDL la SQLite, hang doi nam trong CSDL, phien dang nhap
cung vay. Khong can Redis, khong can dich vu phu tro nao khac.

**Dong bo dinh ky:** ngay het han co the doi ma he thong khong biet (khach gia han
thang tai P.A, nha dang ky dieu chinh, ten mien chuyen di). Ngay sai dan den nhac gia
han sai - nang nhat la ten mien het han ma khong ai hay. Moi 4 gio he thong quet va
lam moi: ten mien thuong doc lai sau 7 ngay, ten mien **sap het han trong 45 ngay** doc
lai moi 24 gio. Moi lan chi lam mot lo nho (mac dinh 50) de khong dap API nha dang ky.

**Tach worker khi can:** mac dinh worker chay chung tien trinh web cho don gian. Khi luu
luong lon, chay `node dist/jobs/worker.js` rieng va dat `WORKER_DISABLED=1` cho tien trinh
web de hai ben khong tranh cung mot job.

---

## 8. Bao mat

- Mat khau bam bang **scrypt** (co san trong Node, co salt rieng tung tai khoan)
- Phien dang nhap luu trong CSDL, cookie chi chua id da ky HMAC, **xoay id khi dang nhap**
- **CSRF token** cho moi form; webhook duoc mien tru vi da xac thuc bang chu ky/token rieng
- Webhook SePay xac thuc token bang so sanh **chong timing attack**
- Chu ky MoMo/ZaloPay xac thuc dung thu tu truong theo tai lieu goc
- Gioi han tan suat cho dang nhap, dang ky, tim kiem, API
- **API Key khong bao gio ghi vao log** - luon che truoc khi luu `api_logs`
- Quyen so huu duoc kiem tra o moi thao tac tren ten mien va don hang

### Viec can lam ngay

1. **Doi mat khau tai khoan dai ly P.A** neu API Key da tung duoc chia se qua chat/email.
   API Key cua P.A **thay doi theo mat khau**, nen doi mat khau la cach thu hoi key cu.
2. Khong bao gio commit file `.env` (da co trong `.gitignore`).
3. Doi `ADMIN_PASSWORD` ngay sau lan dang nhap dau tien.
4. Chay sau HTTPS va dat `TRUST_PROXY=1`.

---

## 9. Lenh thuong dung

| Lenh | Cong dung |
|---|---|
| `npm run dev` | Chay che do phat trien (tu khoi dong lai khi sua code) |
| `npm run build && npm start` | Chay production |
| `npm run migrate` | Tao/cap nhat cau truc CSDL |
| `npm run seed` | Tao admin + bang gia mau + cau hinh mac dinh |
| `npm run pa:probe -- --domain abc.com` | Do ten action cua API P.A |
| `node dist/jobs/worker.js` | Chay worker rieng (dat `WORKER_DISABLED=1` cho web) |
| `npm test` | Chay bo kiem thu |
| `npm run typecheck` | Kiem tra kieu TypeScript |

Trien khai len may chu that: [docs/DEPLOY.md](docs/DEPLOY.md).
