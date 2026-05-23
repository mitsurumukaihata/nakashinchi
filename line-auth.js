/* ===========================================
   中新地 — LINE Login クライアント
   - window.nakashinchiLineAuth を公開
     .login(returnTo?)              → LINE OAuth に飛ばす
     .logout()                       → トークン削除
     .getToken()                     → 現在の客トークン
     .getCustomer()                  → 現在の客プロフィール {id, name, picture}
     .isLoggedIn()
     .refreshCustomer()              → サーバから最新プロフィール取得
   ----------------------------------------
   config.js が先に読まれている前提:
     window.NAKASHINCHI_API
     window.NAKASHINCHI_LINE_CHANNEL_ID
     window.NAKASHINCHI_LINE_CALLBACK
   =========================================== */
(function () {
  'use strict';

  var API_BASE         = (window.NAKASHINCHI_API || '').replace(/\/$/, '');
  var LINE_CHANNEL_ID  = window.NAKASHINCHI_LINE_CHANNEL_ID || '';
  var LINE_CALLBACK    = window.NAKASHINCHI_LINE_CALLBACK || (window.location.origin + '/nakashinchi/auth/line-callback/');

  var TOKEN_KEY    = 'customer-token';
  var CUSTOMER_KEY = 'customer-info';
  var STATE_KEY    = 'line-auth-state';      // CSRF 対策 (sessionStorage)
  var RETURN_KEY   = 'line-auth-return';     // ログイン後の戻り先

  function getToken()    { try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } }
  function setToken(t)   { try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {} }
  function clearToken()  { try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} }
  function getCustomer() {
    try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function setCustomer(c) { try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c)); } catch (_) {} }
  function clearCustomer() { try { localStorage.removeItem(CUSTOMER_KEY); } catch (_) {} }

  function isLoggedIn() { return !!getToken() && !!getCustomer(); }

  function randomState() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function login(returnTo) {
    if (!LINE_CHANNEL_ID) {
      alert('LINE 認証が設定されていません。');
      return;
    }
    var state = randomState();
    var ret   = returnTo || (location.pathname + location.search + location.hash);
    try {
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(RETURN_KEY, ret);
    } catch (_) {}
    var params = new URLSearchParams({
      response_type: 'code',
      client_id:     LINE_CHANNEL_ID,
      redirect_uri:  LINE_CALLBACK,
      state:         state,
      scope:         'profile openid',
      nonce:         state
    });
    window.location.href = 'https://access.line.me/oauth2/v2.1/authorize?' + params.toString();
  }

  function logout() {
    clearToken();
    clearCustomer();
  }

  async function refreshCustomer() {
    var t = getToken();
    if (!t || !API_BASE) return null;
    try {
      var r = await fetch(API_BASE + '/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + t }
      });
      if (r.status === 401) { logout(); return null; }
      if (!r.ok) return null;
      var data = await r.json();
      if (data && data.customer) {
        setCustomer(data.customer);
        return data.customer;
      }
    } catch (_) {}
    return null;
  }

  // コールバックページから呼ぶ用ヘルパー (内部)
  async function exchange(code, redirectUri) {
    var r = await fetch(API_BASE + '/api/auth/line/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, redirectUri: redirectUri })
    });
    if (!r.ok) throw new Error('exchange_failed');
    var data = await r.json();
    if (data && data.token && data.customer) {
      setToken(data.token);
      setCustomer(data.customer);
      return data;
    }
    throw new Error('invalid_response');
  }

  window.nakashinchiLineAuth = {
    login:           login,
    logout:          logout,
    getToken:        getToken,
    getCustomer:     getCustomer,
    setCustomer:     setCustomer,
    isLoggedIn:      isLoggedIn,
    refreshCustomer: refreshCustomer,
    _exchange:       exchange,        // コールバックページ内部用
    _stateKey:       STATE_KEY,
    _returnKey:      RETURN_KEY,
    _callbackUrl:    LINE_CALLBACK
  };
})();
