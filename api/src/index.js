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

const TOKEN_TTL_SECONDS          = 8 * 3600;        // 店舗 PIN トークン: 8時間
const CUSTOMER_TOKEN_TTL_SECONDS = 30 * 24 * 3600;  // 客 LINE トークン: 30日
const ALLOWED_KEYS = ['news', 'hours', 'display', 'seats'];

// LINE OAuth
const LINE_TOKEN_URL   = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

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

// 客 (LINE 認証済み) のトークン: 'c:<userId>.<exp>.<sig>' の形式
async function issueCustomerToken(userId, secret) {
  const exp = Math.floor(Date.now() / 1000) + CUSTOMER_TOKEN_TTL_SECONDS;
  const payload = `c:${userId}.${exp}`;
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyCustomerToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [prefix, expStr, sig] = parts;
  if (!prefix.startsWith('c:')) return null;
  const userId = prefix.substring(2);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = await hmacSign(`c:${userId}.${expStr}`, secret);
  return expected === sig ? userId : null;
}

// base64url を JSON にデコード (LINE の id_token 解析用)
function decodeJwtPayload(jwt) {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const json = atob(b64 + pad);
    // CJK等を含む可能性があるので UTF-8 デコード
    const bytes = Uint8Array.from(json, c => c.charCodeAt(0));
    const text = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(text);
  } catch (_) { return null; }
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

      // ===== LINE Login =====

      // GET /api/auth/line/config — フロントが LINE の OAuth URL を組み立てるのに使う
      if (path === '/api/auth/line/config' && request.method === 'GET') {
        return json({
          channelId: env.LINE_CHANNEL_ID || null,
          configured: !!(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET)
        }, 200, cors);
      }

      // POST /api/auth/line/exchange — LINE から受け取った code を access_token + id_token に交換
      //   Body: { code, redirectUri }
      //   Response: { token, customer: { id, name, picture } }
      if (path === '/api/auth/line/exchange' && request.method === 'POST') {
        if (!env.LINE_CHANNEL_ID || !env.LINE_CHANNEL_SECRET) {
          return json({ error: 'LINE 認証が設定されていません' }, 503, cors);
        }
        const body = await request.json().catch(() => ({}));
        const { code, redirectUri } = body;
        if (!code || !redirectUri) {
          return json({ error: 'code と redirectUri は必須です' }, 400, cors);
        }

        // LINE のトークンエンドポイントに code を渡してトークン取得
        const tokenRes = await fetch(LINE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type:    'authorization_code',
            code,
            redirect_uri:  redirectUri,
            client_id:     env.LINE_CHANNEL_ID,
            client_secret: env.LINE_CHANNEL_SECRET
          }).toString()
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text().catch(() => '');
          return json({ error: 'LINE トークン取得失敗', detail: errText }, 401, cors);
        }
        const tokens = await tokenRes.json();

        // id_token からユーザー情報を取り出す
        let userId = null, displayName = '匿名', pictureUrl = null;
        if (tokens.id_token) {
          const payload = decodeJwtPayload(tokens.id_token);
          if (payload) {
            userId      = payload.sub;
            displayName = payload.name || '匿名';
            pictureUrl  = payload.picture || null;
          }
        }
        // id_token に name が含まれない場合は /v2/profile を叩く
        if (!userId || displayName === '匿名') {
          try {
            const profRes = await fetch(LINE_PROFILE_URL, {
              headers: { 'Authorization': 'Bearer ' + tokens.access_token }
            });
            if (profRes.ok) {
              const prof = await profRes.json();
              userId      = userId      || prof.userId;
              displayName = (displayName === '匿名' ? prof.displayName : displayName) || '匿名';
              pictureUrl  = pictureUrl  || prof.pictureUrl || null;
            }
          } catch (_) {}
        }

        if (!userId) {
          return json({ error: 'LINE ユーザー情報が取得できませんでした' }, 502, cors);
        }

        // D1 customers に upsert
        const now = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO customers (id, display_name, picture_url, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name,
            picture_url  = excluded.picture_url,
            last_seen_at = excluded.last_seen_at
        `).bind(userId, displayName, pictureUrl, now, now).run();

        // アプリ独自のトークン発行 (30日有効)
        const appToken = await issueCustomerToken(userId, env.JWT_SECRET);
        return json({
          token: appToken,
          customer: { id: userId, name: displayName, picture: pictureUrl },
          expiresIn: CUSTOMER_TOKEN_TTL_SECONDS
        }, 200, cors);
      }

      // GET /api/auth/me — 自分の客プロフィールを返す (要 Bearer)
      if (path === '/api/auth/me' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const row = await env.DB
          .prepare('SELECT id, display_name, picture_url FROM customers WHERE id = ?')
          .bind(userId).first();
        if (!row) return json({ error: '客が見つかりません' }, 404, cors);
        return json({
          customer: { id: row.id, name: row.display_name, picture: row.picture_url }
        }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'internal_error', detail: String(err && err.message || err) }, 500, cors);
    }
  }
};
