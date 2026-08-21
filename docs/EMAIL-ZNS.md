# Email va ZNS - hai kenh thong bao cho khach

He thong gui thong bao qua **email** (bat buoc) va **Zalo ZNS** (tuy chon).
Ca hai deu la kenh phu tro: gui that bai khong bao gio lam hong luong dat hang
hay dang ky ten mien - moi ket qua duoc ghi nhat ky de xu ly sau.

## 1. Cau hinh SMTP

Dien tai _Quan tri > Cau hinh Control Panel > Email (SMTP)_, roi bam
**Gui email thu** de kiem tra ngay.

### Dung Gmail / Google Workspace

Ba loi hay gap khien email khong toi noi:

| Muc | Phai dien | Loi thuong gap |
|---|---|---|
| Username | **Dia chi email day du**: `hello@congty.com` | Dien ten tai khoan (`congty`) - Gmail tu choi dang nhap |
| Password | **Mat khau ung dung** 16 ky tu | Dien mat khau dang nhap - Google chan |
| From Mail | Dia chi **da khai** trong Gmail | Gmail se tu doi nguoi gui thanh dia chi that, email de vao spam |

Mat khau ung dung tao tai: Tai khoan Google > Bao mat > Xac minh 2 buoc > Mat khau ung dung.
Phai bat xac minh 2 buoc truoc thi muc nay moi hien ra.

Neu `From Mail` khac dia chi dang nhap, vao Gmail > Settings > Accounts and Import >
**Send mail as** > them va xac nhan dia chi do truoc.

Cong: `465` di voi **SSL**, `587` di voi **TLS**. Chon sai cap se treo den khi het thoi gian cho.

### Email he thong gui ra

| Mau | Khi nao |
|---|---|
| `email_verification` | Ngay khi dang ky tai khoan |
| `welcome` | Sau khi xac thuc email thanh cong |
| `password_reset` | Khach quen mat khau |
| `order_created` | Tao giao dich thanh toan - kem so tai khoan, noi dung CK, ma QR |
| `payment_received` | Ghi nhan duoc tien |
| `domain_activated` | **Ten mien kich hoat - kem thong tin quan tri** |
| `transfer_submitted` | Da gui yeu cau chuyen ten mien ve |
| `provision_failed` | Dang ky that bai (gui ca cho quan tri) |
| `renewal_reminder` | Truoc han 30/15/7/1 ngay |
| `auto_renew_charged` | Da tu dong tru vi va gia han |
| `auto_renew_needs_payment` | Den han gia han tu dong nhung so du khong du |

Xem nhat ky trong bang `email_logs`.

## 2. Xac thuc email khi dang ky

Vi sao can: email la kenh giao **thong tin quan tri ten mien**. Email sai dong nghia
khach mat lien lac voi tai san cua chinh ho khi den han gia han.

Luong hoat dong:

1. Dang ky xong -> he thong gui ngay email xac thuc (hieu luc **24 gio**)
2. Truoc khi xac thuc, moi trang deu hien dai nhac kem nut **Gui lai**
3. Bam lien ket -> xac thuc xong, luc nay moi gui email chao mung
   (co y de khach khong nhan hai email cung luc)

Cac truong hop da xu ly:

| Tinh huong | Ket qua |
|---|---|
| Bam lai chinh lien ket do | Bao "da xac thuc roi", khong bao loi |
| Lien ket qua 24 gio | Bao het han, huong dan gui lai |
| Cap token moi | Token cu bi vo hieu ngay |
| Doi email sau khi gui | Lien ket cu het y nghia |
| Gui lai lien tuc | Chan sau 5 lan/gio (sua duoc trong cau hinh) |

**Bat buoc xac thuc truoc khi dat hang:** mac dinh **tat** - khach van mua duoc ngay,
de khong can duong nguoi dung. Bat trong _Cau hinh Control Panel > Xac thuc tai khoan_
neu ban muon chat che hon.

## 3. Zalo ZNS

Gui thong bao vao Zalo cua khach qua Official Account cua doanh nghiep.

### Chuan bi

1. Tai [business.zalo.me](https://business.zalo.me): tao va **xac thuc Zalo Official Account**
   (OA chua xac thuc thi khong gui ZNS duoc)
2. Tai [developers.zalo.me](https://developers.zalo.me): tao ung dung, **lien ket voi OA vua tao**,
   lay **App ID** va **Secret Key**
3. Dien App ID + Secret Key vao _Cau hinh Control Panel > Zalo ZNS_
4. Vao _Quan tri > ZNS_ bam **Ket noi Zalo OA** - Zalo hoi cap quyen, dong y la xong.
   He thong tu lay va tu duy tri token, **khong phai sao chep refresh token bang tay**
5. Tao mau tin tai business.zalo.me va **cho Zalo duyet**
6. Dan template ID vao _Cau hinh Control Panel > Mau tin ZNS_
7. Bam **Gui ZNS thu** de kiem tra

> **Zalo Mini App khong phai ZNS.** Mini App la chuong trinh chay trong Zalo, dung ID rieng.
> ZNS gui tin qua Official Account. Chi co **App ID** va **Secret Key** cua ung dung tren
> developers.zalo.me la dung chung - Mini App ID khong dung den o day.

### Nut "Ket noi Zalo OA" lam gi

Bam nut -> Zalo hoi ban co cho phep ung dung truy cap Official Account khong -> dong y ->
Zalo chuyen ve `/admin/zns/callback` kem ma cap quyen -> he thong doi ma do lay cap token
dau tien va luu lai (da ma hoa).

Duong dan callback duoc hien san tren trang de ban khai bao ben Zalo neu duoc hoi.

Chi can **ket noi lai** khi: nhat ky bao loi `-124`/`-125` lien tuc (token bi he thong khac
dung mat), hoac ban doi sang Official Account khac.

### Refresh token xoay moi lan dung - dieu can biet nhat

Zalo tra ve mot `refresh_token` **moi** moi lan doi `access_token`, va vo hieu ban cu ngay.
He thong tu luu ban moi vao CSDL trong cung mot buoc, nen ban khong phai lam gi.

Hai he qua:

- Gia tri `ZNS_REFRESH_TOKEN` trong `.env` **se cu di** sau lan chay dau. Day la binh thuong -
  nen dung nut **Ket noi Zalo OA** thay vi dien tay vao `.env`.
- **Khong dung chung mot refresh_token cho hai he thong.** He thong nay doi token thi
  he thong kia mat quyen ngay lap tuc.

Refresh token het han sau khoang **3 thang** neu khong dung. Khi do phai vao Zalo Developers
cap lai - he thong se bao loi ro rang trong _Nhat ky ZNS_.

### Mau tin va tham so

ZNS chi gui duoc mau **da duoc duyet**. Ten tham so trong mau phai **trung y** voi cot
"Tham so" o trang cau hinh - sai ten thi Zalo tra loi `-213`.

| Su kien | Tham so bat buoc |
|---|---|
| Don hang moi | `order_code`, `amount`, `domain` |
| Da nhan thanh toan | `order_code`, `amount` |
| Ten mien kich hoat | `domain`, `expires_at` |
| Nhac gia han | `domain`, `expires_at`, `days_left` |
| Da tu dong gia han | `domain`, `amount`, `expires_at` |
| Dang ky that bai | `domain`, `order_code` |

### Nhung truong hop ZNS tu bo qua (khong bao loi)

- Khach khong co so dien thoai, hoac so khong phai di dong Viet Nam
- Chua bat ZNS, hoac chua khai template ID cho su kien do

Deu duoc ghi vao _Nhat ky ZNS_ voi trang thai **Bo qua** kem ly do.

### Ma loi Zalo hay gap

| Ma | Y nghia | Cach xu ly |
|---|---|---|
| `-124` | Access token het han | He thong tu lay token moi va gui lai - khong can lam gi |
| `-211` | Template khong ton tai / chua duyet | Kiem tra lai template ID |
| `-213` | Du lieu khong khop mau | Ten tham so trong mau khac voi bang tren |
| `-216` | Ung dung chua lien ket OA | Lien ket lai tai Zalo Developers |
| `-226` | Khach chua tuong tac hoac da chan OA | Khong khac phuc duoc - email van la kenh chinh |
| `-230` | Het so du ZNS | Nap them tai Zalo Business |

## 4. Xu ly su co

| Hien tuong | Kiem tra o dau |
|---|---|
| Khach bao khong nhan duoc email | Bang `email_logs` - xem `status` va `error` |
| Email vao spam | `MAIL_FROM` da khai trong Gmail chua; cau hinh SPF/DKIM cho ten mien |
| ZNS khong den | _Quan tri > Nhat ky ZNS_ - doc cot Ket qua |
| ZNS bao `-124` lien tuc | Refresh token da bi he thong khac dung mat |
