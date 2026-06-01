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
const ALLOWED_KEYS = ['news', 'hours', 'display', 'seats', 'info'];

// LINE OAuth
const LINE_TOKEN_URL   = 'https://api.line.me/oauth2/v2.1/token';
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile';

// LINE Messaging API (push 通知用 — Worker secrets で設定)
//   env.LINE_BOT_TOKEN           = Messaging API のチャネルアクセストークン
//   env.STORE_ADMIN_LINE_IDS_JSON = '{"asanoha":["U...","U..."], "ivory":[...]}' のJSON
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

// 客の予約信用度を計算 (Phase 0: シンプル線形式)
// 基準 5.0 から cancelled は -0.1、timeout は -0.5、下限 1.0
function computeTrustScore(arrivedN, cancelledN, timeoutN) {
  const penalty = (cancelledN || 0) * 0.1 + (timeoutN || 0) * 0.5;
  const raw = Math.max(1.0, Math.min(5.0, 5.0 - penalty));
  return {
    score: Math.round(raw * 10) / 10,    // 5.0 / 4.9 / 4.8 …
    stars: Math.round(raw)                // 整数 1〜5
  };
}

async function pushLineNotification(env, storeId, text) {
  if (!env.LINE_BOT_TOKEN) return;            // 未設定なら何もしない

  // D1 の subscribers を最優先で取得
  let ids = [];
  try {
    const rows = await env.DB
      .prepare('SELECT customer_id FROM store_notify_subscribers WHERE store_id = ?')
      .bind(storeId).all();
    ids = (rows.results || []).map(r => r.customer_id);
  } catch (_) {}

  // フォールバック: env の JSON map (古い設定)
  if (ids.length === 0) {
    try {
      const map = JSON.parse(env.STORE_ADMIN_LINE_IDS_JSON || '{}');
      ids = map[storeId] || [];
    } catch (_) {}
  }
  if (ids.length === 0) return;

  await Promise.all(ids.map(uid =>
    fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.LINE_BOT_TOKEN
      },
      body: JSON.stringify({
        to: uid,
        messages: [{ type: 'text', text: text.slice(0, 1000) }]
      })
    }).catch(() => {})
  ));
}

// ---------- CORS ----------
function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
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

// base64url helpers
function b64urlEncode(str) {
  // str は UTF-8 文字列。バイト列に変換してから base64 化。
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeToString(b64) {
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// state を HMAC で署名 (クライアントは触らないので tamper 不可。10分 TTL)
async function signState(payload, secret) {
  const b64 = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(b64, secret);
  return b64 + '.' + sig;
}
async function verifyState(state, secret) {
  if (!state) return null;
  const dot = state.lastIndexOf('.');
  if (dot < 0) return null;
  const b64 = state.substring(0, dot);
  const sig = state.substring(dot + 1);
  const expected = await hmacSign(b64, secret);
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(b64urlDecodeToString(b64));
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch (_) { return null; }
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
  async fetch(request, env, ctx) {
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

      // GET / PUT /api/store/:storeId/:key  (news/hours/display/seats のみ)
      // それ以外の key (arrivals 等) は下流のハンドラに任せる
      const kvMatch = path.match(/^\/api\/store\/([^\/]+)\/([^\/]+)$/);
      if (kvMatch && ALLOWED_KEYS.includes(kvMatch[2])) {
        const [, storeId, key] = kvMatch;

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

      // POST /api/auth/line/start — 署名済み state + LINE 認可 URL を返す
      //   Body: { returnTo, redirectUri, pickup?: boolean }
      //   Response: { authUrl, pickupId?, expiresIn }
      if (path === '/api/auth/line/start' && request.method === 'POST') {
        if (!env.LINE_CHANNEL_ID || !env.LINE_CHANNEL_SECRET) {
          return json({ error: 'LINE 認証が設定されていません' }, 503, cors);
        }
        const body = await request.json().catch(() => ({}));
        const returnTo    = typeof body.returnTo === 'string'    ? body.returnTo    : '/';
        const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';
        const usePickup   = !!body.pickup;
        if (!redirectUri) return json({ error: 'redirectUri は必須です' }, 400, cors);

        const exp = Math.floor(Date.now() / 1000) + 600;  // 10分
        const nonceBytes = new Uint8Array(8);
        crypto.getRandomValues(nonceBytes);
        const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // pickup_id: PWA とブラウザ間でセッションを受け渡すための一時 ID
        let pickupId = null;
        if (usePickup) {
          const pickupBytes = new Uint8Array(18);
          crypto.getRandomValues(pickupBytes);
          pickupId = Array.from(pickupBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        const state = await signState({
          ret: returnTo, rd: redirectUri, n: nonce, exp,
          pu: pickupId || undefined
        }, env.JWT_SECRET);
        const params = new URLSearchParams({
          response_type:         'code',
          client_id:             env.LINE_CHANNEL_ID,
          redirect_uri:          redirectUri,
          state:                 state,
          scope:                 'profile openid',
          nonce:                 nonce,
          disable_ios_app_login: 'true'
        });
        return json({
          authUrl: 'https://access.line.me/oauth2/v2.1/authorize?' + params.toString(),
          pickupId: pickupId,
          expiresIn: 600
        }, 200, cors);
      }

      // POST /api/auth/line/exchange — LINE から受け取った code を access_token + id_token に交換
      //   Body: { code, state }     ← 新: state を Worker で検証
      //   旧: { code, redirectUri }  ← 後方互換のため残す
      //   Response: { token, customer, returnTo }
      if (path === '/api/auth/line/exchange' && request.method === 'POST') {
        if (!env.LINE_CHANNEL_ID || !env.LINE_CHANNEL_SECRET) {
          return json({ error: 'LINE 認証が設定されていません' }, 503, cors);
        }
        const body = await request.json().catch(() => ({}));
        let { code, state, redirectUri } = body;
        let returnTo = '/';

        // 新方式: state を verify して redirectUri / returnTo / pickup_id を取り出す
        let pickupId = null;
        if (state) {
          const parsed = await verifyState(state, env.JWT_SECRET);
          if (!parsed) {
            return json({ error: 'state が不正または期限切れです' }, 401, cors);
          }
          redirectUri = parsed.rd;
          returnTo    = parsed.ret || '/';
          pickupId    = parsed.pu || null;
        }

        if (!code || !redirectUri) {
          return json({ error: 'code と state (または redirectUri) は必須です' }, 400, cors);
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
        const customer = { id: userId, name: displayName, picture: pictureUrl };

        // pickup_id が指定されていた場合は、PWA 側が引き取りに来るための一時保管
        if (pickupId) {
          const pickupExp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await env.DB.prepare(`
            INSERT INTO auth_pickups (id, token, customer_json, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              token         = excluded.token,
              customer_json = excluded.customer_json,
              expires_at    = excluded.expires_at
          `).bind(pickupId, appToken, JSON.stringify(customer), pickupExp).run();
        }

        return json({
          token: appToken,
          customer: customer,
          returnTo: returnTo,
          pickup: !!pickupId,
          expiresIn: CUSTOMER_TOKEN_TTL_SECONDS
        }, 200, cors);
      }

      // GET /api/auth/line/pickup/:id — 受け渡し用 (取得後は削除)
      const pickupMatch = path.match(/^\/api\/auth\/line\/pickup\/([0-9a-f]{8,64})$/);
      if (pickupMatch && request.method === 'GET') {
        const [, pid] = pickupMatch;
        // 期限切れの一括掃除 (低頻度なのでここでまとめて)
        await env.DB.prepare(`DELETE FROM auth_pickups WHERE expires_at < ?`)
          .bind(new Date().toISOString()).run();

        const row = await env.DB
          .prepare('SELECT token, customer_json, expires_at FROM auth_pickups WHERE id = ?')
          .bind(pid).first();
        if (!row) return json({ pending: true }, 200, cors);  // まだ届いてない (or 期限切れ)

        // 取得したら即削除 (one-shot)
        await env.DB.prepare('DELETE FROM auth_pickups WHERE id = ?').bind(pid).run();
        let customer = null;
        try { customer = JSON.parse(row.customer_json); } catch (_) {}
        return json({ token: row.token, customer: customer }, 200, cors);
      }

      // GET /api/auth/me — 自分の客プロフィールを返す (要 Bearer)
      if (path === '/api/auth/me' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const row = await env.DB
          .prepare("SELECT id, display_name, picture_url, COALESCE(privacy_mode,'public') AS privacy_mode FROM customers WHERE id = ?")
          .bind(userId).first();
        if (!row) return json({ error: '客が見つかりません' }, 404, cors);
        return json({
          customer: {
            id: row.id, name: row.display_name, picture: row.picture_url,
            privacyMode: row.privacy_mode
          }
        }, 200, cors);
      }

      // GET /api/customer/score — 自分の予約信用度・実績集計
      if (path === '/api/customer/score' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);

        const row = await env.DB.prepare(`
          SELECT
            (SELECT COUNT(*) FROM arrivals WHERE customer_id = ? AND status = 'arrived')   AS arrived,
            (SELECT COUNT(*) FROM arrivals WHERE customer_id = ? AND status = 'cancelled') AS cancelled,
            (SELECT COUNT(*) FROM arrivals WHERE customer_id = ? AND status = 'timeout')   AS timeout,
            (SELECT COUNT(*) FROM arrivals WHERE customer_id = ? AND status = 'pending')   AS pending,
            (SELECT COUNT(*) FROM favorites WHERE customer_id = ?)                          AS favorites_count,
            (SELECT MAX(created_at) FROM arrivals WHERE customer_id = ?)                    AS last_arrival_at
        `).bind(userId, userId, userId, userId, userId, userId).first();

        const score = computeTrustScore(row.arrived || 0, row.cancelled || 0, row.timeout || 0);
        return json({
          score: score.score,
          stars: score.stars,
          arrived:        row.arrived || 0,
          cancelled:      row.cancelled || 0,
          timeout:        row.timeout || 0,
          pending:        row.pending || 0,
          favoritesCount: row.favorites_count || 0,
          lastArrivalAt:  row.last_arrival_at
        }, 200, cors);
      }

      // PATCH /api/customer/me — プロフィール設定変更 (現状は privacy_mode のみ)
      if (path === '/api/customer/me' && request.method === 'PATCH') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const body = await request.json().catch(() => ({}));
        const allowed = ['public', 'anonymous'];
        if (body.privacyMode === undefined) {
          return json({ error: '更新項目が指定されていません' }, 400, cors);
        }
        if (!allowed.includes(body.privacyMode)) {
          return json({ error: 'privacyMode は public か anonymous' }, 400, cors);
        }
        await env.DB.prepare('UPDATE customers SET privacy_mode = ? WHERE id = ?')
          .bind(body.privacyMode, userId).run();
        return json({ ok: true, privacyMode: body.privacyMode }, 200, cors);
      }

      // ===== 来店通知 (arrivals) =====

      // POST /api/store/:storeId/arrivals  ── 客が「今から向かう」を作成
      //   要 customer Bearer
      //   Body: { etaMinutes: number, note?: string }
      const arrCreateMatch = path.match(/^\/api\/store\/([^\/]+)\/arrivals$/);
      if (arrCreateMatch && request.method === 'POST') {
        const [, storeId] = arrCreateMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: 'ログインが必要です' }, 401, cors);

        const store = await env.DB.prepare('SELECT id FROM stores WHERE id = ?').bind(storeId).first();
        if (!store) return json({ error: '店舗が見つかりません' }, 404, cors);

        const body = await request.json().catch(() => ({}));
        const eta = Number(body.etaMinutes);
        if (!Number.isFinite(eta) || eta < 0 || eta > 240) {
          return json({ error: 'etaMinutes は 0〜240 の数値で指定してください' }, 400, cors);
        }
        const note = (typeof body.note === 'string') ? body.note.slice(0, 200) : null;
        // 紹介元店舗 (Phase 0: 送客の記録のみ。お金は動かさない)
        let referrerStoreId = (typeof body.referrerStoreId === 'string' && body.referrerStoreId.trim())
          ? body.referrerStoreId.trim().slice(0, 64) : null;
        if (referrerStoreId === storeId) referrerStoreId = null;   // 自店紹介は無効
        let referrerName = null;
        if (referrerStoreId) {
          const rr = await env.DB.prepare('SELECT name FROM stores WHERE id = ?').bind(referrerStoreId).first();
          if (rr) referrerName = rr.name || referrerStoreId;
          else referrerStoreId = null;   // 未登録の店は記録しない
        }
        const now  = new Date();
        const arrAt = new Date(now.getTime() + eta * 60 * 1000).toISOString();
        const idBytes = new Uint8Array(12);
        crypto.getRandomValues(idBytes);
        const id = 'arr-' + Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        await env.DB.prepare(`
          INSERT INTO arrivals (id, store_id, customer_id, eta_minutes, arriving_at, note, referrer_store_id, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).bind(id, storeId, userId, eta, arrAt, note, referrerStoreId, now.toISOString(), now.toISOString()).run();

        // 客側に返す
        const cust = await env.DB
          .prepare("SELECT display_name, picture_url, COALESCE(privacy_mode,'public') AS privacy_mode FROM customers WHERE id = ?")
          .bind(userId).first();

        // 店舗管理者の LINE に push 通知 (設定されていれば)
        const storeRow = await env.DB.prepare('SELECT name FROM stores WHERE id = ?').bind(storeId).first();
        const storeName = (storeRow && storeRow.name) || storeId;
        const isAnonCust = cust && cust.privacy_mode === 'anonymous';
        const custName  = isAnonCust ? '匿名のお客様' : ((cust && cust.display_name) || 'お客様');
        const arrHHMM   = new Date(arrAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });
        const msg = '【' + storeName + '】来店通知\n'
                  + custName + ' さんが向かっています\n'
                  + '到着予定: ' + arrHHMM + '（あと ' + eta + ' 分）'
                  + (referrerName ? '\n紹介元: ' + referrerName : '')
                  + (note ? '\nメモ: ' + note : '');
        // fire-and-forget (失敗してもAPIレスポンスは返す)
        try { ctx.waitUntil(pushLineNotification(env, storeId, msg)); } catch (_) {}
        return json({
          arrival: {
            id, storeId, customerId: userId,
            customerName:    isAnonCust ? '匿名さん' : (cust ? cust.display_name : null),
            customerPicture: isAnonCust ? null      : (cust ? cust.picture_url  : null),
            privacyMode:     cust ? cust.privacy_mode : 'public',
            referrerStoreId, referrerStoreName: referrerName,
            etaMinutes: eta, arrivingAt: arrAt, note, status: 'pending',
            createdAt: now.toISOString(), updatedAt: now.toISOString()
          }
        }, 200, cors);
      }

      // GET /api/store/:storeId/arrivals/heading-count  ── 公開: 向かい中の人数
      //   過去1時間以内に作成 + pending + 到着予定が未来 or 直近1時間以内 のみ
      const headingMatch = path.match(/^\/api\/store\/([^\/]+)\/arrivals\/heading-count$/);
      if (headingMatch && request.method === 'GET') {
        const [, storeId] = headingMatch;
        const now = new Date();
        const cutoffPast = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const r = await env.DB.prepare(`
          SELECT COUNT(*) AS n
            FROM arrivals
           WHERE store_id = ?
             AND status = 'pending'
             AND created_at >= ?
        `).bind(storeId, cutoffPast).first();
        return json({ storeId, headingCount: (r && r.n) || 0 }, 200, cors);
      }

      // GET /api/store/:storeId/arrivals?status=pending|all  ── 店側ダッシュボード
      //   要 store PIN Bearer
      if (arrCreateMatch && request.method === 'GET') {
        const [, storeId] = arrCreateMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
        if (!verifiedStoreId || verifiedStoreId !== storeId) {
          return json({ error: '認証が必要です' }, 401, cors);
        }
        // lazy timeout: ETA + 30分過ぎても pending のまま → timeout に変更
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const nowIso = new Date().toISOString();
        await env.DB.prepare(`
          UPDATE arrivals
             SET status = 'timeout', updated_at = ?
           WHERE store_id = ?
             AND status = 'pending'
             AND arriving_at < ?
        `).bind(nowIso, storeId, cutoff).run();

        const statusParam = (url.searchParams.get('status') || 'pending').toLowerCase();
        let q = `
          SELECT a.id, a.store_id, a.customer_id, a.eta_minutes, a.arriving_at,
                 a.note, a.seat_id, a.status, a.created_at, a.updated_at,
                 a.referrer_store_id, rs.name AS referrer_store_name, a.fee_exempt,
                 c.display_name AS customer_name, c.picture_url AS customer_picture,
                 COALESCE(c.privacy_mode, 'public') AS privacy_mode,
                 (SELECT COUNT(*) FROM arrivals a2
                   WHERE a2.customer_id = a.customer_id
                     AND a2.store_id = a.store_id
                     AND a2.status = 'arrived') AS visit_count,
                 (SELECT COUNT(*) FROM arrivals ap
                   WHERE ap.customer_id = a.customer_id
                     AND ap.store_id = a.store_id
                     AND ap.status = 'arrived'
                     AND ap.created_at < a.created_at) AS prior_arrived,
                 (SELECT COUNT(*) FROM arrivals a3
                   WHERE a3.customer_id = a.customer_id
                     AND a3.status = 'arrived') AS arrived_total,
                 (SELECT COUNT(*) FROM arrivals a4
                   WHERE a4.customer_id = a.customer_id
                     AND a4.status = 'cancelled') AS cancelled_total,
                 (SELECT COUNT(*) FROM arrivals a5
                   WHERE a5.customer_id = a.customer_id
                     AND a5.status = 'timeout') AS timeout_total
          FROM arrivals a
          LEFT JOIN customers c ON c.id = a.customer_id
          LEFT JOIN stores rs ON rs.id = a.referrer_store_id
          WHERE a.store_id = ?
        `;
        const args = [storeId];
        if (statusParam === 'pending') {
          q += ' AND a.status = ? ';
          args.push('pending');
        }
        q += ' ORDER BY a.created_at DESC LIMIT 50';
        const rows = await env.DB.prepare(q).bind(...args).all();
        return json({
          arrivals: (rows.results || []).map(r => {
            const isAnon = r.privacy_mode === 'anonymous';
            const score = computeTrustScore(r.arrived_total || 0, r.cancelled_total || 0, r.timeout_total || 0);
            return {
              id: r.id, storeId: r.store_id, customerId: r.customer_id,
              customerName:    isAnon ? '匿名さん' : r.customer_name,
              customerPicture: isAnon ? null      : r.customer_picture,
              privacyMode:     r.privacy_mode,
              referrerStoreId:   r.referrer_store_id || null,
              referrerStoreName: r.referrer_store_name || null,
              feeExempt:         !!r.fee_exempt,
              isNewToStore:      (r.prior_arrived || 0) === 0,   // この店で初めて (= 紹介料の対象になり得る)
              visitCount:      r.visit_count || 0,
              trustScore:      score.score,
              trustStars:      score.stars,
              arrivedTotal:    r.arrived_total || 0,
              cancelledTotal:  r.cancelled_total || 0,
              timeoutTotal:    r.timeout_total || 0,
              etaMinutes: r.eta_minutes, arrivingAt: r.arriving_at,
              note: r.note, seatId: r.seat_id, status: r.status,
              createdAt: r.created_at, updatedAt: r.updated_at
            };
          })
        }, 200, cors);
      }

      // GET /api/store/:storeId/referrals/summary?month=YYYY-MM  ── 送客/受客 集計 (Phase 0)
      //   要 store PIN Bearer。月省略時は JST 当月。
      const refSumMatch = path.match(/^\/api\/store\/([^\/]+)\/referrals\/summary$/);
      if (refSumMatch && request.method === 'GET') {
        const [, storeId] = refSumMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
        if (!verifiedStoreId || verifiedStoreId !== storeId) {
          return json({ error: '認証が必要です' }, 401, cors);
        }
        const monthStr = url.searchParams.get('month') || '';
        let y, m;
        if (/^\d{4}-\d{2}$/.test(monthStr)) { y = +monthStr.slice(0, 4); m = +monthStr.slice(5, 7); }
        else { const n = new Date(Date.now() + 9 * 3600 * 1000); y = n.getUTCFullYear(); m = n.getUTCMonth() + 1; }
        // JST 月初/翌月初 を UTC ISO に変換 (JST = UTC+9)
        const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000).toISOString();
        const end   = new Date(Date.UTC(y, m,     1) - 9 * 3600 * 1000).toISOString();
        const label = y + '-' + String(m).padStart(2, '0');

        // 送客 (この店が紹介元): referrer = storeId → 送った先の店ごと
        const sentRows = await env.DB.prepare(`
          SELECT a.store_id AS partner_id, s.name AS partner_name,
                 COUNT(*) AS total,
                 SUM(CASE WHEN a.status = 'arrived' THEN 1 ELSE 0 END) AS arrived,
                 SUM(CASE WHEN a.status = 'arrived' AND a.fee_exempt = 0 AND NOT EXISTS (
                       SELECT 1 FROM arrivals b
                        WHERE b.customer_id = a.customer_id AND b.store_id = a.store_id
                          AND b.status = 'arrived' AND b.created_at < a.created_at
                     ) THEN 1 ELSE 0 END) AS chargeable
            FROM arrivals a LEFT JOIN stores s ON s.id = a.store_id
           WHERE a.referrer_store_id = ? AND a.created_at >= ? AND a.created_at < ?
           GROUP BY a.store_id
           ORDER BY chargeable DESC, arrived DESC, total DESC
        `).bind(storeId, start, end).all();

        // 受客 (この店が紹介を受けた): store = storeId かつ referrer あり → 紹介元の店ごと
        const recvRows = await env.DB.prepare(`
          SELECT a.referrer_store_id AS partner_id, s.name AS partner_name,
                 COUNT(*) AS total,
                 SUM(CASE WHEN a.status = 'arrived' THEN 1 ELSE 0 END) AS arrived,
                 SUM(CASE WHEN a.status = 'arrived' AND a.fee_exempt = 0 AND NOT EXISTS (
                       SELECT 1 FROM arrivals b
                        WHERE b.customer_id = a.customer_id AND b.store_id = a.store_id
                          AND b.status = 'arrived' AND b.created_at < a.created_at
                     ) THEN 1 ELSE 0 END) AS chargeable
            FROM arrivals a LEFT JOIN stores s ON s.id = a.referrer_store_id
           WHERE a.store_id = ? AND a.referrer_store_id IS NOT NULL
             AND a.created_at >= ? AND a.created_at < ?
           GROUP BY a.referrer_store_id
           ORDER BY chargeable DESC, arrived DESC, total DESC
        `).bind(storeId, start, end).all();

        const summarize = (rows) => {
          const byStore = (rows.results || []).map(r => ({
            storeId: r.partner_id, storeName: r.partner_name || r.partner_id,
            total: r.total || 0, arrived: r.arrived || 0, chargeable: r.chargeable || 0
          }));
          return {
            total:      byStore.reduce((a, b) => a + b.total, 0),
            arrived:    byStore.reduce((a, b) => a + b.arrived, 0),
            chargeable: byStore.reduce((a, b) => a + b.chargeable, 0),   // 紹介料 対象 (新規かつ非対象外)
            byStore
          };
        };
        return json({ storeId, month: label, sent: summarize(sentRows), received: summarize(recvRows) }, 200, cors);
      }

      // PATCH /api/store/:storeId/arrivals/:id  ── 店側: ステータス変更
      //   要 store PIN Bearer
      //   Body: { status: 'arrived'|'cancelled'|'timeout', seatId?: string }
      const arrUpdMatch = path.match(/^\/api\/store\/([^\/]+)\/arrivals\/([^\/]+)$/);
      if (arrUpdMatch && (request.method === 'PATCH' || request.method === 'PUT')) {
        const [, storeId, arrId] = arrUpdMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();

        // 店舗 PIN なら全状態に変更可。客 Bearer なら自分のレコードを cancelled のみ可。
        const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
        const verifiedUserId  = await verifyCustomerToken(token, env.JWT_SECRET);
        const isStoreAdmin = verifiedStoreId === storeId;
        const isCustomer   = !!verifiedUserId;
        if (!isStoreAdmin && !isCustomer) {
          return json({ error: '認証が必要です' }, 401, cors);
        }

        const body = await request.json().catch(() => ({}));
        const allowed = ['pending', 'arrived', 'cancelled', 'timeout'];
        const hasStatus = body.status !== undefined && body.status !== null && body.status !== '';
        const newStatus = String(body.status || '');
        const hasFee = typeof body.feeExempt === 'boolean';
        if (!hasStatus && !hasFee) {
          return json({ error: 'status か feeExempt を指定してください' }, 400, cors);
        }
        if (hasStatus && !allowed.includes(newStatus)) {
          return json({ error: 'status が不正です' }, 400, cors);
        }

        if (isCustomer && !isStoreAdmin) {
          // 客は status=cancelled のみ、かつ自分のレコードのみ。feeExempt(対象外)設定は不可。
          if (hasFee || !hasStatus || newStatus !== 'cancelled') {
            return json({ error: 'お客様からはキャンセルのみ可能です' }, 403, cors);
          }
          const row = await env.DB
            .prepare('SELECT customer_id FROM arrivals WHERE id = ? AND store_id = ?')
            .bind(arrId, storeId).first();
          if (!row) return json({ error: '通知が見つかりません' }, 404, cors);
          if (row.customer_id !== verifiedUserId) {
            return json({ error: '権限がありません' }, 403, cors);
          }
        }

        const seatId = (typeof body.seatId === 'string') ? body.seatId : null;
        // fee_exempt(紹介料 対象外)は店舗側のみ設定可
        const feeVal    = (hasFee && isStoreAdmin) ? (body.feeExempt ? 1 : 0) : null;
        const statusVal = hasStatus ? newStatus : null;
        const now = new Date().toISOString();
        const r = await env.DB.prepare(`
          UPDATE arrivals
             SET status     = COALESCE(?, status),
                 seat_id    = COALESCE(?, seat_id),
                 fee_exempt = COALESCE(?, fee_exempt),
                 updated_at = ?
           WHERE id = ? AND store_id = ?
        `).bind(statusVal, seatId, feeVal, now, arrId, storeId).run();
        return json({ ok: true, changes: r.meta && r.meta.changes }, 200, cors);
      }

      // GET /api/customer/arrivals  ── 客自身の最近の通知一覧
      if (path === '/api/customer/arrivals' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const rows = await env.DB.prepare(`
          SELECT id, store_id, eta_minutes, arriving_at, note, seat_id, status, created_at, updated_at
            FROM arrivals
           WHERE customer_id = ?
           ORDER BY created_at DESC LIMIT 20
        `).bind(userId).all();
        return json({
          arrivals: (rows.results || []).map(r => ({
            id: r.id, storeId: r.store_id, etaMinutes: r.eta_minutes,
            arrivingAt: r.arriving_at, note: r.note, seatId: r.seat_id,
            status: r.status, createdAt: r.created_at, updatedAt: r.updated_at
          }))
        }, 200, cors);
      }

      // GET /api/customer/visits  ── 客自身の「行った店」(店ごとの来店回数・最終来店日)
      //   来店確認(arrived)済みのみを集計
      if (path === '/api/customer/visits' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const rows = await env.DB.prepare(`
          SELECT a.store_id,
                 COUNT(*)           AS visit_count,
                 MAX(a.arriving_at) AS last_arriving_at,
                 MAX(a.updated_at)  AS last_updated_at,
                 s.name             AS store_name
            FROM arrivals a LEFT JOIN stores s ON s.id = a.store_id
           WHERE a.customer_id = ? AND a.status = 'arrived'
           GROUP BY a.store_id
           ORDER BY last_updated_at DESC
        `).bind(userId).all();
        return json({
          visits: (rows.results || []).map(r => ({
            storeId:       r.store_id,
            storeName:     r.store_name || r.store_id,
            visitCount:    r.visit_count || 0,
            lastVisitedAt: r.last_updated_at || r.last_arriving_at || null
          }))
        }, 200, cors);
      }

      // ===== 通知購読 (店舗スタッフの自己登録) =====

      // POST /api/store/:storeId/notify-subscribers
      //   要 customer Bearer (LINEログイン済) + body.pin で店舗認証
      //   Body: { pin: "1234", label?: "麻ノ葉 店主" }
      const subMatch = path.match(/^\/api\/store\/([^\/]+)\/notify-subscribers$/);
      if (subMatch && request.method === 'POST') {
        const [, storeId] = subMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: 'LINE ログインが必要です' }, 401, cors);

        const storeRow = await env.DB
          .prepare('SELECT pin_hash FROM stores WHERE id = ?')
          .bind(storeId).first();
        if (!storeRow) return json({ error: '店舗が見つかりません' }, 404, cors);

        const body = await request.json().catch(() => ({}));
        const pin = String(body.pin || '');
        if (!pin) return json({ error: 'PIN は必須です' }, 400, cors);
        if (storeRow.pin_hash === 'CHANGE_ME') return json({ error: 'PIN 未設定の店舗です' }, 503, cors);
        const ok = await verifyPin(storeRow.pin_hash, pin);
        if (!ok) return json({ error: 'PIN が違います' }, 401, cors);

        const label = (typeof body.label === 'string') ? body.label.slice(0, 100) : null;
        const now = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO store_notify_subscribers (store_id, customer_id, label, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(store_id, customer_id) DO UPDATE SET
            label = excluded.label
        `).bind(storeId, userId, label, now).run();
        return json({ ok: true, storeId, customerId: userId }, 200, cors);
      }

      // GET /api/store/:storeId/notify-subscribers — 店側のリスト
      if (subMatch && request.method === 'GET') {
        const [, storeId] = subMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
        if (!verifiedStoreId || verifiedStoreId !== storeId) {
          return json({ error: '認証が必要です' }, 401, cors);
        }
        const rows = await env.DB.prepare(`
          SELECT s.customer_id, s.label, s.created_at,
                 c.display_name, c.picture_url
            FROM store_notify_subscribers s
            LEFT JOIN customers c ON c.id = s.customer_id
           WHERE s.store_id = ?
           ORDER BY s.created_at ASC
        `).bind(storeId).all();
        return json({
          subscribers: (rows.results || []).map(r => ({
            customerId: r.customer_id,
            label: r.label,
            name: r.display_name,
            picture: r.picture_url,
            createdAt: r.created_at
          }))
        }, 200, cors);
      }

      // GET /api/customer/notify-subscribers  ── 客側: 自分が購読中の店一覧
      if (path === '/api/customer/notify-subscribers' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const rows = await env.DB.prepare(`
          SELECT s.store_id, s.label, s.created_at, st.name AS store_name
            FROM store_notify_subscribers s
            LEFT JOIN stores st ON st.id = s.store_id
           WHERE s.customer_id = ?
           ORDER BY s.created_at ASC
        `).bind(userId).all();
        return json({
          subscriptions: (rows.results || []).map(r => ({
            storeId: r.store_id, storeName: r.store_name,
            label: r.label, createdAt: r.created_at
          }))
        }, 200, cors);
      }

      // DELETE /api/store/:storeId/notify-subscribers/:customerId
      //   要 store PIN Bearer  (店主が他のスタッフを削除) または
      //   要 customer Bearer (自分自身を削除)
      const subDelMatch = path.match(/^\/api\/store\/([^\/]+)\/notify-subscribers\/([^\/]+)$/);
      if (subDelMatch && request.method === 'DELETE') {
        const [, storeId, customerId] = subDelMatch;
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const verifiedStoreId = await verifyToken(token, env.JWT_SECRET);
        const verifiedUserId  = await verifyCustomerToken(token, env.JWT_SECRET);
        const isStoreAdmin = verifiedStoreId === storeId;
        const isSelf       = verifiedUserId === customerId;
        if (!isStoreAdmin && !isSelf) {
          return json({ error: '権限がありません' }, 401, cors);
        }
        await env.DB
          .prepare('DELETE FROM store_notify_subscribers WHERE store_id = ? AND customer_id = ?')
          .bind(storeId, customerId).run();
        return json({ ok: true }, 200, cors);
      }

      // ===== お気に入り =====

      // GET /api/customer/favorites — 自分のお気に入り店舗 ID 一覧
      if (path === '/api/customer/favorites' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const rows = await env.DB
          .prepare('SELECT store_id, created_at FROM favorites WHERE customer_id = ? ORDER BY created_at DESC')
          .bind(userId).all();
        return json({
          favorites: (rows.results || []).map(r => ({ storeId: r.store_id, createdAt: r.created_at }))
        }, 200, cors);
      }

      // PUT/DELETE /api/customer/favorites/:storeId
      const favMatch = path.match(/^\/api\/customer\/favorites\/([^\/]+)$/);
      if (favMatch) {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const [, storeId] = favMatch;

        // 店舗存在チェック
        const store = await env.DB.prepare('SELECT id FROM stores WHERE id = ?').bind(storeId).first();
        if (!store) return json({ error: '店舗が見つかりません' }, 404, cors);

        if (request.method === 'PUT') {
          const now = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO favorites (customer_id, store_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(customer_id, store_id) DO NOTHING
          `).bind(userId, storeId, now).run();
          return json({ ok: true, storeId, createdAt: now }, 200, cors);
        }

        if (request.method === 'DELETE') {
          await env.DB
            .prepare('DELETE FROM favorites WHERE customer_id = ? AND store_id = ?')
            .bind(userId, storeId).run();
          return json({ ok: true, deleted: true }, 200, cors);
        }
      }

      // POST /api/customer/favorites/merge — 匿名時にローカルに溜めたお気に入りを一括登録
      //   Body: { storeIds: [...] }
      if (path === '/api/customer/favorites/merge' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const userId = await verifyCustomerToken(token, env.JWT_SECRET);
        if (!userId) return json({ error: '認証されていません' }, 401, cors);
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.storeIds) ? body.storeIds.filter(s => typeof s === 'string') : [];
        if (ids.length === 0) return json({ ok: true, merged: 0 }, 200, cors);

        const now = new Date().toISOString();
        const stmts = ids.map(sid => env.DB.prepare(`
          INSERT INTO favorites (customer_id, store_id, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(customer_id, store_id) DO NOTHING
        `).bind(userId, sid, now));
        await env.DB.batch(stmts);
        return json({ ok: true, merged: ids.length }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'internal_error', detail: String(err && err.message || err) }, 500, cors);
    }
  }
};
