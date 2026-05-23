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

  // standalone PWA か判定 (iOS Safari / Android Chrome PWA 共に検出)
  function isStandalonePWA() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator && window.navigator.standalone === true) return true;  // iOS
    } catch (_) {}
    return false;
  }

  // PWA 起動時に、もし前回ログイン中に pickup を待っている状態なら自動で引き取りに行く
  var PICKUP_PENDING_KEY = 'line-auth-pending-pickup';
  function getPendingPickup() {
    try { return JSON.parse(localStorage.getItem(PICKUP_PENDING_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function setPendingPickup(v) {
    try {
      if (v) localStorage.setItem(PICKUP_PENDING_KEY, JSON.stringify(v));
      else   localStorage.removeItem(PICKUP_PENDING_KEY);
    } catch (_) {}
  }

  async function tryPickup(pickupId) {
    if (!pickupId || !API_BASE) return null;
    try {
      var r = await fetch(API_BASE + '/api/auth/line/pickup/' + encodeURIComponent(pickupId));
      if (!r.ok) return null;
      var data = await r.json();
      if (data && data.token && data.customer) {
        setToken(data.token);
        setCustomer(data.customer);
        setPendingPickup(null);
        return data;
      }
    } catch (_) {}
    return null;  // pending or not found
  }

  // PWA 起動 / 復帰時に pickup を回収するためのバックグラウンド処理
  function startPickupPoll(pickupId, onDone) {
    var startedAt = Date.now();
    var TIMEOUT_MS = 10 * 60 * 1000;   // 10分
    var INTERVAL_MS = 2000;
    var timer = setInterval(async function () {
      var result = await tryPickup(pickupId);
      if (result) {
        clearInterval(timer);
        if (onDone) onDone(result);
        return;
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        clearInterval(timer);
        setPendingPickup(null);
        if (onDone) onDone(null);
      }
    }, INTERVAL_MS);
    // 可視性変化時にも即チェック (PWA に戻ってきた瞬間)
    document.addEventListener('visibilitychange', async function () {
      if (!document.hidden) {
        var result = await tryPickup(pickupId);
        if (result) { clearInterval(timer); if (onDone) onDone(result); }
      }
    });
    return function cancel() { clearInterval(timer); };
  }

  async function login(returnTo) {
    if (!API_BASE) {
      alert('API URL が設定されていません。');
      return;
    }
    var ret = returnTo || (location.pathname + location.search + location.hash);
    var standalone = isStandalonePWA();
    try {
      var r = await fetch(API_BASE + '/api/auth/line/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnTo: ret,
          redirectUri: LINE_CALLBACK,
          pickup: standalone   // PWA の時だけ pickup フロー
        })
      });
      if (!r.ok) throw new Error('start_failed_' + r.status);
      var data = await r.json();
      if (!data.authUrl) throw new Error('no_auth_url');

      if (standalone && data.pickupId) {
        // pickup を localStorage に保持しておくと、次回 PWA 起動時にも回収できる
        setPendingPickup({ id: data.pickupId, ts: Date.now() });
        // PWA 内のリスナに通知
        try {
          var ev = new CustomEvent('nakashinchi:pickup-started', { detail: { pickupId: data.pickupId } });
          window.dispatchEvent(ev);
        } catch (_) {}
      }
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
    isStandalonePWA: isStandalonePWA,
    getPendingPickup:getPendingPickup,
    setPendingPickup:setPendingPickup,
    tryPickup:       tryPickup,
    startPickupPoll: startPickupPoll,
    _exchange:       exchange,        // コールバックページ内部用
    _callbackUrl:    LINE_CALLBACK
  };

  // PWA 起動時に未回収の pickup があれば自動で引き取る
  (function autoResumePickup() {
    if (!API_BASE) return;
    var pending = getPendingPickup();
    if (!pending || !pending.id) return;
    // 15分以上前のは破棄
    if (Date.now() - (pending.ts || 0) > 15 * 60 * 1000) { setPendingPickup(null); return; }
    // 既にログイン済みなら何もしない
    if (isLoggedIn()) { setPendingPickup(null); return; }
    startPickupPoll(pending.id, function (result) {
      if (result) {
        try {
          var ev = new CustomEvent('nakashinchi:login-resumed', { detail: result });
          window.dispatchEvent(ev);
        } catch (_) {}
      }
    });
  })();
})();
