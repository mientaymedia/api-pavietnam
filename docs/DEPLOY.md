# Trien khai len may chu

## Yeu cau

- Node.js >= 20 (khuyen nghi 22 LTS)
- Mot ten mien tro ve may chu + chung chi HTTPS
- IP cong khai **co dinh** cua may chu (de dang ky whitelist voi P.A Viet Nam)

## 1. Cai dat

```bash
git clone <repo> /var/www/domain-shop
cd /var/www/domain-shop
npm ci --omit=dev || npm install --omit=dev
npm install --include=dev        # can devDependencies de build
npm run build
```

## 2. Cau hinh

```bash
cp .env.example .env
nano .env
```

Bat buoc dat:

```env
NODE_ENV=production
APP_URL=https://ten-mien-cua-ban.com
TRUST_PROXY=1
SESSION_SECRET=<chuoi ngau nhien 64 ky tu>
ENCRYPTION_KEY=<chuoi ngau nhien 64 ky tu>
DATABASE_FILE=/var/lib/domain-shop/app.sqlite
```

> `SESSION_SECRET` va `ENCRYPTION_KEY` la **bat buoc** o che do production - ung dung se
> tu choi khoi dong neu thieu. Doi `ENCRYPTION_KEY` sau khi da luu secret se lam **khong
> giai ma duoc** cac gia tri cu; hay giu no on dinh va sao luu can than.

```bash
mkdir -p /var/lib/domain-shop
chown www-data:www-data /var/lib/domain-shop
npm run migrate && npm run seed
```

## 3. Chay bang systemd

`/etc/systemd/system/domain-shop.service`:

```ini
[Unit]
Description=Domain shop
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/domain-shop
EnvironmentFile=/var/www/domain-shop/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/domain-shop

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now domain-shop
systemctl status domain-shop
```

## 4. Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name ten-mien-cua-ban.com;

    ssl_certificate     /etc/letsencrypt/live/ten-mien-cua-ban.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ten-mien-cua-ban.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name ten-mien-cua-ban.com;
    return 301 https://$host$request_uri;
}
```

`TRUST_PROXY=1` la bat buoc khi chay sau nginx - neu khong, gioi han tan suat va nhat ky
se ghi nham IP cua proxy thay vi IP that cua khach.

## 4b. Kiem tra truoc khi mo cho khach vao

Truoc khi tro ten mien that va nhan don dau tien, chay tren chinh may chu:

```bash
cd /opt/tenmien        # thu muc cai dat
npm run kiem-tra
```

Cong cu kiem tra: khoa bi mat, HTTPS, CSDL, ket noi that toi API P.A (goi thu
mot lenh chi doc), bang gia, cong thanh toan, ket noi may chu thu, tai khoan
quan tri (ke ca mat khau de doan va xac thuc hai lop), worker, ZNS.

Ma thoat khac 0 neu con muc `CHAN`, nen co the dat trong kich ban trien khai:

```bash
npm ci --omit=dev && npm run build && npm run kiem-tra && systemctl restart tenmien
```

Chay lai lenh nay moi lan doi cau hinh hoac nang cap phien ban.

---

## 5. Dang ky IP voi P.A Viet Nam

```bash
curl -s https://api.ipify.org; echo
```

Gui IP nay cho P.A. Luu y: neu may chu dung IP **outbound** khac IP tro ten mien
(thuong gap voi NAT, Cloudflare, hoac may chu nhieu IP), phai dang ky dung IP outbound.

Kiem tra sau khi P.A xac nhan:

```bash
npm run pa:probe -- --domain pavietnam.vn --only check
```

## 6. Webhook SePay

Vao my.sepay.vn > Cong ty > Webhooks:

- URL: `https://ten-mien-cua-ban.com/webhooks/sepay`
- Header: `Authorization: Apikey <SEPAY_WEBHOOK_TOKEN>`

Kiem tra duong dan da thong:

```bash
curl https://ten-mien-cua-ban.com/webhooks/health
# {"ok":true,"time":"..."}
```

Sau do chuyen khoan thu mot khoan nho vao tai khoan va xem
_Quan tri > Doi soat_ - giao dich phai xuat hien trong vai giay.

## 7. Sao luu

Toan bo du lieu nam trong mot file SQLite. Sao luu bang lenh `.backup` de an toan khi
ung dung dang ghi:

```bash
sqlite3 /var/lib/domain-shop/app.sqlite ".backup '/backup/app-$(date +%F).sqlite'"
```

Dat lich hang ngay trong `crontab`:

```cron
0 3 * * * sqlite3 /var/lib/domain-shop/app.sqlite ".backup '/backup/app-$(date +\%F).sqlite'"
```

**Sao luu ca file `.env`** (chua `ENCRYPTION_KEY`) o noi an toan tach biet - mat khoa nay
dong nghia voi mat toan bo secret da luu.

## 8. Cap nhat phien ban

```bash
cd /var/www/domain-shop
git pull
npm install
npm run build
npm run migrate          # an toan khi chay lai nhieu lan
systemctl restart domain-shop
```

## 9. Theo doi van hanh

| Kiem tra | O dau |
|---|---|
| Don hang khong tu kich hoat | _Quan tri > Hang doi_ - xem job that bai |
| API P.A tra loi | _Quan tri > Nhat ky API_ (loc "Chi loi") |
| Tien ve nhung khong khop don | _Quan tri > Doi soat_ |
| Email khong gui duoc | Bang `email_logs` trong CSDL |
| Nhat ky ung dung | `journalctl -u domain-shop -f` |

Ung dung ghi log dang JSON mot dong moi ban ghi, tien cho viec thu thap tap trung.

## 10. Tach worker (khi luu luong lon)

Mac dinh worker chay chung tien trinh web - don gian va du cho hau het truong hop.

De tach rieng: dat `WORKER_DISABLED=1` trong `.env` (tien trinh web se khong chay worker nua)
roi tao service thu hai:

```ini
[Unit]
Description=Domain shop worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/domain-shop
EnvironmentFile=/var/www/domain-shop/.env
Environment=WORKER_DISABLED=0
ExecStart=/usr/bin/node dist/jobs/worker.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Luu y `Environment=WORKER_DISABLED=0` o service worker - no ghi de gia tri trong
`EnvironmentFile`, de web tat worker con tien trinh nay van chay.

Chi chay **mot** tien trinh worker. Hai worker cung luc van an toan (job duoc gianh
quyen bang transaction) nhung khong nhanh hon dang ke va lam kho theo doi.
