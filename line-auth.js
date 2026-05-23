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
  // ※ state/returnTo はサーバが HMAC 署名する方式に変わったので、ローカル保存は廃止

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

  async function login(returnTo) {
    if (!API_BASE) {
      alert('API URL が設定されていません。');
      return;
    }
    var ret = returnTo || (location.pathname + location.search + location.hash);
    try {
      var r = await fetch(API_BASE + '/api/auth/line/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: ret, redirectUri: LINE_CALLBACK })
      });
      if (!r.ok) throw new Error('start_failed_' + r.status);
      var data = await r.json();
      if (!data.authUrl) throw new Error('no_auth_url');
      window.location.href = data.authUrl;
    } catch (e) {
      alert('LINE ログインを開始できませんでした: ' + (e && e.message || e));
    }
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
  // 新方式: state を Worker に渡して検証 (redirectUri/returnTo は state に含まれる)
  async function exchange(code, state) {
    var r = await fetch(API_BASE + '/api/auth/line/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, state: state })
    });
    if (!r.ok) {
      var errText = '';
      try { errText = (await r.json()).error || ''; } catch (_) {}
      throw new Error('exchange_failed' + (errText ? ': ' + errText : ''));
    }
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
    _callbackUrl:    LINE_CALLBACK
  };
})();
