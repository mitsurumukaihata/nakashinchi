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

-- 初期登録：麻ノ葉（PINは scripts/set-pin.mjs で別途設定）
INSERT OR IGNORE INTO stores (id, name) VALUES ('asanoha', '麻ノ葉');
