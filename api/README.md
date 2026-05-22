# nakashinchi API

中新地 飲食店ガイドの **店舗データ同期 API**。Cloudflare Workers + D1。

公開ページ（お客様用）は **読み取りのみ**、編集（管理画面）は **PIN 認証** で書き込み。

## 必要なもの

- Cloudflare アカウント
- Node.js 18 以上
- npm

## セットアップ（初回のみ・約10分）

このフォルダ（`api/`）で作業します。

### 1. 依存関係をインストール

```bash
cd api
npm install
```

### 2. Cloudflare にログイン

```bash
npx wrangler login
```

ブラウザが開いて認証 → 「Allow」をクリック。

### 3. D1 データベースを作成

```bash
npm run db:create
```

出力例：

```
✅ Successfully created DB 'nakashinchi'!
[[d1_databases]]
binding = "DB"
database_name = "nakashinchi"
database_id = "abc12345-6789-..."
```

**この `database_id` をコピーして、`wrangler.toml` の `database_id = "REPLACE_AFTER_D1_CREATE"` の部分を置換してください。**

### 4. スキーマを流し込む

```bash
npm run db:schema
```

`stores` と `store_data` テーブルが作成され、`asanoha`（麻ノ葉）レコードが1件入ります（PIN はまだ `CHANGE_ME`）。

### 5. 認証トークン用のシークレットを設定

```bash
npx wrangler secret put JWT_SECRET
```

プロンプトに **ランダム32文字以上の文字列** を貼り付けます（例：パスワードジェネレータで生成、または以下のコマンドで）：

```bash
# ランダム文字列を生成（コピーする値）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. 麻ノ葉の PIN を設定

PIN は店主が編集するときに使います（4〜6 桁推奨）。

```bash
node scripts/set-pin.mjs asanoha 1234
```

出力された `npx wrangler d1 execute …` のコマンドをコピーして実行。

（PIN を変えたい時はこの手順を再実行すれば上書きされます）

### 7. Worker をデプロイ

```bash
npm run deploy
```

デプロイ後、`https://nakashinchi-api.<your-subdomain>.workers.dev` が発行されます。

### 8. 動作確認

```bash
# ヘルスチェック
curl https://nakashinchi-api.<your-subdomain>.workers.dev/api/health

# 認証（PIN を入れて token を取得）
curl -X POST https://nakashinchi-api.<your-subdomain>.workers.dev/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"storeId":"asanoha","pin":"1234"}'

# 取得（初回は null）
curl https://nakashinchi-api.<your-subdomain>.workers.dev/api/store/asanoha/news
```

## フロントエンドへの API URL 伝達

デプロイした Worker の URL を、フロントエンド側で参照する必要があります。

各 HTML ファイルの `<head>` に以下を追加（または `index.html` に置いて全ページ共通化）：

```html
<script>
  window.NAKASHINCHI_API = 'https://nakashinchi-api.<your-subdomain>.workers.dev';
</script>
```

未設定の場合、フロントエンドは **localStorage のみ** で動作します（オフライン/開発時用のフォールバック）。

## API リファレンス

### `POST /api/auth`
PIN で認証 → 8時間有効なトークンを発行。

```json
リクエスト: { "storeId": "asanoha", "pin": "1234" }
レスポンス: { "token": "asanoha.1735200000.abc...", "storeId": "asanoha", "expiresIn": 28800 }
```

### `GET /api/store/:storeId/:key`
公開読み取り。key は `news` / `hours` / `display` / `seats`。

```json
レスポンス: { "value": <JSON>, "updatedAt": "ISO日時" } または { "value": null, "updatedAt": null }
```

### `GET /api/store/:storeId/all`
全 key を一括取得（公開ページの初期ロード用）。

```json
レスポンス: { "storeId": "asanoha", "data": { "news": { value, updatedAt }, "hours": { ... }, ... } }
```

### `PUT /api/store/:storeId/:key`
編集（要 `Authorization: Bearer <token>`）。本文は JSON 値。`null` を送ると削除。

```json
レスポンス: { "ok": true, "storeId": "asanoha", "key": "news", "updatedAt": "ISO日時" }
```

### `DELETE /api/store/:storeId/:key`
削除（要認証）。

## 開発（ローカル）

```bash
# ローカル D1 にスキーマを入れる
npm run db:schema:local

# ローカル開発サーバ起動
npm run dev
```

`http://localhost:8787` で待ち受け。

## 運用 Tips

- **ログ確認**: `npm run tail`
- **PIN 変更**: `node scripts/set-pin.mjs asanoha 新PIN` → 出力コマンド実行
- **店舗追加**: D1 に `INSERT INTO stores` で追加し、フロントエンドの店舗一覧にも反映
- **コスト**: 無料枠で十分（100,000 req/日、D1 は読5M/書100k）

## 制限・将来対応

- 1店舗 = 1 PIN（複数スタッフごとのアカウントは未対応）
- スキーマは key-value 単純構造（複雑な検索は将来 D1 のテーブルを増やす）
- 画像保存（メニュー写真等）は R2 を後で追加
