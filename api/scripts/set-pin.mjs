/* ===========================================
   PIN 設定ヘルパー
   使い方: node scripts/set-pin.mjs <storeId> <PIN>
   出力: D1 に流す UPDATE 文（コピペで wrangler に流す）
   =========================================== */
import crypto from 'node:crypto';

const [, , storeId, pin] = process.argv;

if (!storeId || !pin) {
  console.error('使い方: node scripts/set-pin.mjs <storeId> <PIN>');
  console.error('例: node scripts/set-pin.mjs asanoha 1234');
  process.exit(1);
}

if (pin.length < 3) {
  console.error('PIN は 3 文字以上にしてください');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(pin + salt).digest('hex');
const pinHash = `${salt}$${hash}`;

console.log(`\n[storeId] ${storeId}`);
console.log(`[pin]     ${pin}`);
console.log(`[hash]    ${pinHash}\n`);

console.log('=== 以下のコマンドを実行してください ===\n');
console.log(`npx wrangler d1 execute nakashinchi --remote --command "UPDATE stores SET pin_hash = '${pinHash}', updated_at = datetime('now') WHERE id = '${storeId}'"\n`);
console.log('（ローカル開発DBに設定する場合は --remote を --local に変えてください）\n');
