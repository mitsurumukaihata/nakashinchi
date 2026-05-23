-- ===========================================
-- 中新地 API スキーマ
-- ===========================================

-- 店舗テーブル（1店舗1行、PINで認証）
CREATE TABLE IF NOT EXISTS stores (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pin_hash    TEXT NOT NULL DEFAULT 'CHANGE_ME',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 店舗ごとのデータ（key-value、value は JSON 文字列）
-- key 例: 'news', 'hours', 'display', 'seats'
CREATE TABLE IF NOT EXISTS store_data (
  store_id    TEXT NOT NULL,
  data_key    TEXT NOT NULL,
  data_value  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, data_key),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE INDEX IF NOT EXISTS idx_store_data_updated ON store_data(updated_at);

-- LINE Login で認証したお客様 (Phase 2)
CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,                              -- LINE user_id (U... 形式)
  display_name  TEXT NOT NULL,
  picture_url   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_last_seen ON customers(last_seen_at);

-- 来店通知 (お客様 "今から向かう" 機能用)
CREATE TABLE IF NOT EXISTS arrivals (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  eta_minutes   INTEGER NOT NULL,
  arriving_at   TEXT NOT NULL,                                  -- ISO 日時
  note          TEXT,
  seat_id       TEXT,                                           -- 店員が席を割当てた場合
  status        TEXT NOT NULL DEFAULT 'pending',                -- pending | arrived | cancelled | timeout
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id)    REFERENCES stores(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_arrivals_store_status ON arrivals(store_id, status);
CREATE INDEX IF NOT EXISTS idx_arrivals_customer    ON arrivals(customer_id);
CREATE INDEX IF NOT EXISTS idx_arrivals_arriving    ON arrivals(arriving_at);

-- お気に入り (LINE Login 済みの客が登録)
CREATE TABLE IF NOT EXISTS favorites (
  customer_id TEXT NOT NULL,
  store_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (customer_id, store_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (store_id)    REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_customer ON favorites(customer_id);
CREATE INDEX IF NOT EXISTS idx_favorites_store    ON favorites(store_id);

-- 店舗ごとの通知受信者 (LINE Bot push 先)
CREATE TABLE IF NOT EXISTS store_notify_subscribers (
  store_id    TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  label       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, customer_id),
  FOREIGN KEY (store_id)    REFERENCES stores(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS idx_store_notify_store ON store_notify_subscribers(store_id);

-- iOS PWA / 別ブラウザ間でログイン結果を受け渡すための一時テーブル (10分TTL)
CREATE TABLE IF NOT EXISTS auth_pickups (
  id            TEXT PRIMARY KEY,
  token         TEXT NOT NULL,
  customer_json TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_pickups_exp ON auth_pickups(expires_at);

-- 初期登録：麻ノ葉（PINは scripts/set-pin.mjs で別途設定）
INSERT OR IGNORE INTO stores (id, name) VALUES ('asanoha', '麻ノ葉');
-- 初期登録：Ivory
INSERT OR IGNORE INTO stores (id, name) VALUES ('ivory', 'Innocent Base Ivory');
