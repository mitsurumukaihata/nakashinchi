/* ===========================================
   中新地 API — Cloudflare Worker
   - POST /api/auth                          PIN 認証 → トークン発行
   - GET  /api/store/:storeId/:key           公開読み取り
   - PUT  /api/store/:storeId/:key           編集（要認証）
   - GET  /api/store/:storeId/all            全データ一括取得（公開）
   =========================================== */

const ALLOWED_ORIGINS = [
  'https://mitsurumukaihata.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

const TOKEN_TTL_SECONDS = 8 * 3600;  // 8時間
const ALLOWED_KEYS = ['news', 'hours', 'display', 'seats'];

// ---------- CORS ----------
function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
    'Vary': 'Origin'
  };
}

// ---------- JSON ヘルパー ----------
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

// ---------- ハッシュ・署名 ----------
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPin(storedHash, pin) {
  // 形式: "salt$hash"
  const parts = (storedHash || '').split('$');
  if (parts.length !== 2) return false;
  const [salt, expected] = parts;
  const computed = await sha256Hex(pin + salt);
  // 簡易タイミング攻撃対策（長さが同じなら expected と computed をXORで比較）
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function issueToken(storeId, secret) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${storeId}.${exp}`;
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [storeId, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = await hmacSign(`${storeId}.${expStr}`, secret);
  return expected === sig ? storeId : null;
}

// ---------- ルーティング ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const path = url.pathname;

      // POST /api/auth
      if (path === '/api/auth' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { storeId, pin } = body;
        if (!storeId || !pin) {
          return json({ error: 'storeId と pin は必須です' }, 400, cors);
        }
        const row = await env.DB
          .prepare('SELECT pin_hash FROM stores WHERE id = ?')
          .bind(storeId)
          .first();
        if (!row) return json({ error: '店舗が見つかりません' }, 404, cors);
        if (row.pin_hash === 'CHANGE_ME') {
          return json({ error: 'PIN 未設定です（管理者に連絡してください）' }, 503, cors);
        }
        const ok = await verifyPin(row.pin_hash, String(pin));
        if (!ok) return json({ error: 'PIN が違います' }, 401, cors);

        const token = await issueToken(storeId, env.JWT_SECRET);
        return json({ token, storeId, expiresIn: TOKEN_TTL_SECONDS }, 200, cors);
      }

      // GET /api/store/:storeId/all  （公開、全keyまとめて返す）
      const allMatch = path.match(/^\/api\/store\/([^\/]+)\/all$/);
      if (allMatch && request.method === 'GET') {
        const [, storeId] = allMatch;
        const rows = await env.DB
          .prepare('SELECT data_key, data_value, updated_at FROM store_data WHERE store_id = ?')
          .bind(storeId)
          .all();
        const result = {};
        (rows.results || []).forEach(r => {
          try { result[r.data_key] = { value: JSON.parse(r.data_value), updatedAt: r.updated_at }; }
          catch { result[r.data_key] = { value: r.data_value, updatedAt: r.updated_at }; }
        });
        return json({ storeId, data: result }, 200, cors);
      }

      // GET / PUT /api/store/:storeId/:key
      const kvMatch = path.match(/^\/api\/store\/([^\/]+)\/([^\/]+)$/);
      if (kvMatch) {
        const [, storeId, key] = kvMatch;

        if (!ALLOWED_KEYS.includes(key)) {
          return json({ error: '許可されていない key です' }, 400, cors);
        }

        if (request.method === 'GET') {
          const row = await env.DB
            .prepare('SELECT data_value, updated_at FROM store_data WHERE store_id = ? AND data_key = ?')
            .bind(storeId, key)
            .first();
          if (!row) return json({ value: null, updatedAt: null }, 200, cors);
          try {
            return json({ value: JSON.parse(row.data_value), updatedAt: row.updated_at }, 200, cors);
          } catch {
            return json({ value: row.data_value, updatedAt: row.updated_at }, 200, cors);
          }
        }

        if (request.method === 'PUT') {
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
          if (!verifiedStoreId || verifiedStoreId !== storeId) {
            return json({ error: '認証が必要です（PIN で再認証してください）' }, 401, cors);
          }
          const body = await request.json().catch(() => undefined);
          if (body === undefined) return json({ error: '本文の JSON が不正です' }, 400, cors);

          // null/undefined を入れた場合は削除扱い
          if (body === null) {
            await env.DB
              .prepare('DELETE FROM store_data WHERE store_id = ? AND data_key = ?')
              .bind(storeId, key)
              .run();
            return json({ ok: true, deleted: true }, 200, cors);
          }

          const now = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO store_data (store_id, data_key, data_value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(store_id, data_key) DO UPDATE
              SET data_value = excluded.data_value,
                  updated_at = excluded.updated_at
          `).bind(storeId, key, JSON.stringify(body), now).run();

          return json({ ok: true, storeId, key, updatedAt: now }, 200, cors);
        }

        if (request.method === 'DELETE') {
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace(/^Bearer\s+/i, '').trim();
          const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
          if (!verifiedStoreId || verifiedStoreId !== storeId) {
            return json({ error: '認証が必要です' }, 401, cors);
          }
          await env.DB
            .prepare('DELETE FROM store_data WHERE store_id = ? AND data_key = ?')
            .bind(storeId, key)
            .run();
          return json({ ok: true, deleted: true }, 200, cors);
        }
      }

      // ヘルスチェック
      if (path === '/api/health' && request.method === 'GET') {
        return json({ ok: true, time: new Date().toISOString() }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'internal_error', detail: String(err && err.message || err) }, 500, cors);
    }
  }
};
