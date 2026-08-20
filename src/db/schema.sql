-- ============================================================================
--  LUOC DO CSDL - Nen tang ban ten mien (SQLite)
--  Quy uoc:
--   * Moi moc thoi gian luu chuoi ISO-8601 UTC ('2026-08-20T10:00:00Z')
--   * Moi so tien luu SO NGUYEN VND (dong)
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- nguoi dung
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','staff','admin')),
  status          TEXT NOT NULL DEFAULT 'active'   CHECK (status IN ('active','suspended')),
  balance         INTEGER NOT NULL DEFAULT 0,          -- so du vi (VND)
  email_verified_at TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid         TEXT PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  data        TEXT NOT NULL DEFAULT '{}',
  ip          TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Token cho REST API rieng cua khach hang (de ho tu build front-end)
CREATE TABLE IF NOT EXISTS api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  token_prefix TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  scopes       TEXT NOT NULL DEFAULT 'read',
  last_used_at TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

-- --------------------------------------------------------- ho so chu the domain
-- .VN bat buoc thong tin chu the theo quy dinh VNNIC (CMND/CCCD hoac MST)
CREATE TABLE IF NOT EXISTS contacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','organization')),
  full_name    TEXT NOT NULL,
  org_name     TEXT NOT NULL DEFAULT '',
  id_number    TEXT NOT NULL DEFAULT '',   -- CMND/CCCD/Ho chieu (ca nhan)
  tax_code     TEXT NOT NULL DEFAULT '',   -- Ma so thue (to chuc)
  email        TEXT NOT NULL,
  phone        TEXT NOT NULL,
  address      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  province     TEXT NOT NULL DEFAULT '',
  postal_code  TEXT NOT NULL DEFAULT '',
  country      TEXT NOT NULL DEFAULT 'VN',
  birth_date   TEXT NOT NULL DEFAULT '',
  gender       TEXT NOT NULL DEFAULT '',
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

-- ------------------------------------------------------------------ bang gia
CREATE TABLE IF NOT EXISTS tlds (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tld                TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- luu khong co dau cham: 'vn', 'com.vn', 'com'
  kind               TEXT NOT NULL DEFAULT 'intl' CHECK (kind IN ('vn','intl')),
  label              TEXT NOT NULL DEFAULT '',
  cost_register      INTEGER NOT NULL DEFAULT 0,  -- gia von tu P.A (tham khao)
  cost_renew         INTEGER NOT NULL DEFAULT 0,
  price_register     INTEGER NOT NULL DEFAULT 0,  -- gia ban le nam dau
  price_renew        INTEGER NOT NULL DEFAULT 0,
  price_transfer     INTEGER NOT NULL DEFAULT 0,
  setup_fee          INTEGER NOT NULL DEFAULT 0,  -- phi khoi tao (.vn thu nam dau)
  vat_percent        INTEGER NOT NULL DEFAULT 0,
  min_years          INTEGER NOT NULL DEFAULT 1,
  max_years          INTEGER NOT NULL DEFAULT 10,
  requires_vn_contact INTEGER NOT NULL DEFAULT 0, -- .vn: bat buoc ho so chu the day du
  is_active          INTEGER NOT NULL DEFAULT 1,
  is_featured        INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 100,
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  value        INTEGER NOT NULL DEFAULT 0,
  min_amount   INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER NOT NULL DEFAULT 0,   -- 0 = khong gioi han
  tld_filter   TEXT NOT NULL DEFAULT '',     -- rong = ap dung tat ca; hoac 'vn,com.vn'
  max_uses     INTEGER NOT NULL DEFAULT 0,   -- 0 = khong gioi han
  used_count   INTEGER NOT NULL DEFAULT 0,
  starts_at    TEXT,
  expires_at   TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ------------------------------------------------------------------ gio hang
CREATE TABLE IF NOT EXISTS cart_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_key    TEXT NOT NULL,               -- session id hoac 'user:<id>'
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL DEFAULT 'register' CHECK (action IN ('register','renew','transfer')),
  domain      TEXT NOT NULL COLLATE NOCASE,
  tld         TEXT NOT NULL COLLATE NOCASE,
  years       INTEGER NOT NULL DEFAULT 1,
  unit_price  INTEGER NOT NULL DEFAULT 0,
  amount      INTEGER NOT NULL DEFAULT 0,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (cart_key, domain, action)
);
CREATE INDEX IF NOT EXISTS idx_cart_key ON cart_items(cart_key);

-- ----------------------------------------------------------------- don hang
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,        -- ma don, cung la noi dung chuyen khoan
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending_payment'
               CHECK (status IN ('pending_payment','paid','processing','completed','partially_completed','failed','cancelled','refunded')),
  subtotal     INTEGER NOT NULL DEFAULT 0,
  discount     INTEGER NOT NULL DEFAULT 0,
  vat          INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  coupon_code  TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  ip           TEXT NOT NULL DEFAULT '',
  paid_at      TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action       TEXT NOT NULL DEFAULT 'register' CHECK (action IN ('register','renew','transfer')),
  domain       TEXT NOT NULL COLLATE NOCASE,
  tld          TEXT NOT NULL COLLATE NOCASE,
  years        INTEGER NOT NULL DEFAULT 1,
  unit_price   INTEGER NOT NULL DEFAULT 0,
  amount       INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','active','failed','refunded')),
  domain_id    INTEGER REFERENCES domains(id) ON DELETE SET NULL,
  provider_ref TEXT NOT NULL DEFAULT '',
  error        TEXT NOT NULL DEFAULT '',
  attempts     INTEGER NOT NULL DEFAULT 0,
  meta         TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- --------------------------------------------------------------- thanh toan
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider      TEXT NOT NULL CHECK (provider IN ('sepay','momo','zalopay','balance','manual')),
  ref_code      TEXT NOT NULL,             -- noi dung chuyen khoan / orderId gui cong TT
  amount        INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','failed','expired','refunded')),
  provider_txn  TEXT NOT NULL DEFAULT '',  -- ma giao dich ben cong TT
  pay_url       TEXT NOT NULL DEFAULT '',
  qr_url        TEXT NOT NULL DEFAULT '',
  request_body  TEXT NOT NULL DEFAULT '',
  response_body TEXT NOT NULL DEFAULT '',
  paid_at       TEXT,
  expires_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_ref   ON payments(ref_code);
-- Chong ghi nhan trung 1 giao dich cua cong thanh toan
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_txn
  ON payments(provider, provider_txn) WHERE provider_txn <> '';

-- Nhat ky giao dich ngan hang nhan tu webhook (de doi soat & tranh xu ly trung)
CREATE TABLE IF NOT EXISTS bank_transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider       TEXT NOT NULL DEFAULT 'sepay',
  external_id    TEXT NOT NULL,
  account_number TEXT NOT NULL DEFAULT '',
  amount         INTEGER NOT NULL DEFAULT 0,
  content        TEXT NOT NULL DEFAULT '',
  matched_code   TEXT NOT NULL DEFAULT '',
  payment_id     INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','matched','unmatched','duplicate','amount_mismatch')),
  raw            TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (provider, external_id)
);

-- Bien dong so du vi khach hang
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,            -- duong = cong, am = tru
  balance_after INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL,               -- topup | order_payment | refund | adjustment
  ref         TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id);

-- ------------------------------------------------------------------- domain
CREATE TABLE IF NOT EXISTS domains (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contact_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  domain         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tld            TEXT NOT NULL COLLATE NOCASE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','active','expired','suspended','transferred_out','cancelled','failed')),
  provider       TEXT NOT NULL DEFAULT 'pavietnam',
  provider_ref   TEXT NOT NULL DEFAULT '',
  nameservers    TEXT NOT NULL DEFAULT '[]',   -- JSON mang chuoi
  auto_renew     INTEGER NOT NULL DEFAULT 1,
  registered_at  TEXT,
  expires_at     TEXT,
  last_sync_at   TEXT,
  renew_notified_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_domains_user    ON domains(user_id);
CREATE INDEX IF NOT EXISTS idx_domains_expires ON domains(expires_at);

-- Ban ghi DNS (cache cuc bo; nguon su that la API P.A)
CREATE TABLE IF NOT EXISTS dns_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id    INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  remote_id    TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '@',
  content      TEXT NOT NULL,
  ttl          INTEGER NOT NULL DEFAULT 3600,
  priority     INTEGER,
  synced_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_dns_domain ON dns_records(domain_id);

-- --------------------------------------------------------- hang doi & nhat ky
CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  locked_at    TEXT,
  last_error   TEXT NOT NULL DEFAULT '',
  dedupe_key   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(status, run_after);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_dedupe ON jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');

CREATE TABLE IF NOT EXISTS api_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL DEFAULT 'pavietnam',
  action      TEXT NOT NULL DEFAULT '',
  domain      TEXT NOT NULL DEFAULT '',
  request     TEXT NOT NULL DEFAULT '',
  response    TEXT NOT NULL DEFAULT '',
  ok          INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs(created_at);

CREATE TABLE IF NOT EXISTS email_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  template   TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

-- Cau hinh Control Panel (ghi de gia tri .env qua giao dien admin)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  is_secret  INTEGER NOT NULL DEFAULT 0,   -- 1 = value da duoc ma hoa AES-GCM
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Cache ket qua kiem tra ten mien (giam so lan goi API)
CREATE TABLE IF NOT EXISTS domain_check_cache (
  domain     TEXT PRIMARY KEY COLLATE NOCASE,
  available  INTEGER NOT NULL DEFAULT 0,
  raw        TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
