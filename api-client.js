/* ===========================================
   中新地 API クライアント (共通)
   - window.NAKASHINCHI_API が空なら localStorage のみで動作
   - read: API を試みて成功すれば localStorage にキャッシュ
   - write: API を試みて、認証切れなら PIN を再要求
   ----------------------------------------
   公開オブジェクト: window.nakashinchiApi
     .isOnline()                       => boolean (API設定あり)
     .getStoreId()                     => 'asanoha' 等
     .getToken() / .clearToken()
     .fetchKey(key)                    => Promise<{value, updatedAt} | null>
     .fetchAll()                       => Promise<{key: {value, updatedAt}}>
     .saveKey(key, value, options)     => Promise<{ok, updatedAt}>
     .authenticate(pin)                => Promise<{token, expiresIn}>
   =========================================== */
(function () {
  'use strict';

  var API_BASE = (window.NAKASHINCHI_API || '').replace(/\/$/, '');
  var STORE_ID = window.NAKASHINCHI_STORE_ID || 'asanoha';
  var TOKEN_KEY = 'manoha-auth-token';
  var CACHE_PREFIX = 'manoha-cache:';

  function isOnline()    { return API_BASE.length > 0; }
  function getStoreId()  { return STORE_ID; }
  function getToken()    { try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } }
  function setToken(t)   { try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {} }
  function clearToken()  { try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} }

  function cacheGet(key) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null'); }
    catch (_) { return null; }
  }
  function cacheSet(key, value, updatedAt) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ value: value, updatedAt: updatedAt })); }
    catch (_) {}
  }

  async function fetchKey(key) {
    if (!isOnline()) return cacheGet(key);
    try {
      var r = await fetch(API_BASE + '/api/store/' + STORE_ID + '/' + key, { cache: 'no-cache' });
      if (!r.ok) throw new Error('http ' + r.status);
      var json = await r.json();
      cacheSet(key, json.value, json.updatedAt);
      return json;
    } catch (_) {
      // フォールバック：キャッシュを返す
      return cacheGet(key);
    }
  }

  async function fetchAll() {
    if (!isOnline()) {
      // localStorage の全キャッシュをまとめて返す
      var result = {};
      ['news', 'hours', 'display', 'seats'].forEach(function (k) {
        var c = cacheGet(k);
        if (c) result[k] = c;
      });
      return { storeId: STORE_ID, data: result };
    }
    try {
      var r = await fetch(API_BASE + '/api/store/' + STORE_ID + '/all', { cache: 'no-cache' });
      if (!r.ok) throw new Error('http ' + r.status);
      var json = await r.json();
      // キャッシュも更新しておく
      Object.keys(json.data || {}).forEach(function (k) {
        cacheSet(k, json.data[k].value, json.data[k].updatedAt);
      });
      return json;
    } catch (_) {
      // フォールバック
      var fb = {};
      ['news', 'hours', 'display', 'seats'].forEach(function (k) {
        var c = cacheGet(k);
        if (c) fb[k] = c;
      });
      return { storeId: STORE_ID, data: fb, offline: true };
    }
  }

  async function saveKey(key, value, options) {
    options = options || {};
    // オフラインモード（API未設定）→ localStorage のみ
    if (!isOnline()) {
      cacheSet(key, value, new Date().toISOString());
      return { ok: true, offline: true, updatedAt: new Date().toISOString() };
    }
    var token = getToken();
    if (!token) {
      throw new Error('AUTH_REQUIRED');
    }
    var r = await fetch(API_BASE + '/api/store/' + STORE_ID + '/' + key, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(value)
    });
    if (r.status === 401) {
      clearToken();
      throw new Error('AUTH_REQUIRED');
    }
    if (!r.ok) {
      throw new Error('SAVE_FAILED');
    }
    var json = await r.json();
    cacheSet(key, value, json.updatedAt);
    return json;
  }

  async function authenticate(pin) {
    if (!isOnline()) throw new Error('OFFLINE');
    var r = await fetch(API_BASE + '/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: STORE_ID, pin: pin })
    });
    if (r.status === 401) throw new Error('INVALID_PIN');
    if (r.status === 503) throw new Error('PIN_NOT_SET');
    if (!r.ok) throw new Error('AUTH_FAILED');
    var json = await r.json();
    setToken(json.token);
    return json;
  }

  window.nakashinchiApi = {
    isOnline:    isOnline,
    getStoreId:  getStoreId,
    getToken:    getToken,
    clearToken:  clearToken,
    fetchKey:    fetchKey,
    fetchAll:    fetchAll,
    saveKey:     saveKey,
    authenticate: authenticate
  };
})();
