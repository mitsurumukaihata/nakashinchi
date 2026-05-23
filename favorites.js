/* ===========================================
   中新地 — お気に入り管理
   - 未ログイン時: localStorage に保存
   - ログイン後: D1 (サーバ) に同期、初回ログイン時にローカル分をマージ
   - window.nakashinchiFavorites を公開
     .list()                → ['asanoha', ...]    (現在のお気に入り storeId 一覧)
     .has(storeId)          → boolean
     .toggle(storeId)       → 'added' | 'removed'
     .add(storeId)          → Promise
     .remove(storeId)       → Promise
     .refresh()             → サーバから再取得
     .mergeLocalIfNeeded()  → ログイン直後の自動マージ
     .onChange(cb)          → 変更通知
   =========================================== */
(function () {
  'use strict';

  var API_BASE  = (window.NAKASHINCHI_API || '').replace(/\/$/, '');
  var LOCAL_KEY = 'nakashinchi-favorites';        // 未ログイン分
  var MERGED_KEY = 'nakashinchi-favorites-merged'; // マージ済みフラグ (userId)

  var _set = new Set();
  var _listeners = [];
  var _ready = false;

  function readLocal() {
    try {
      var s = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(s) ? s.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (_) { return []; }
  }
  function writeLocal(arr) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch (_) {}
  }

  function emit() {
    _listeners.forEach(function (cb) { try { cb(Array.from(_set)); } catch (_) {} });
  }

  function getAuth() {
    return window.nakashinchiLineAuth || null;
  }
  function isLoggedIn() {
    var auth = getAuth();
    return !!(auth && auth.isLoggedIn());
  }
  function authToken() {
    var auth = getAuth();
    return auth ? auth.getToken() : null;
  }
  function authHeaders() {
    var t = authToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  async function fetchServerList() {
    if (!API_BASE || !isLoggedIn()) return null;
    try {
      var r = await fetch(API_BASE + '/api/customer/favorites', { headers: authHeaders() });
      if (!r.ok) return null;
      var data = await r.json();
      return (data.favorites || []).map(function (f) { return f.storeId; });
    } catch (_) { return null; }
  }

  async function mergeLocalIfNeeded() {
    if (!isLoggedIn()) return;
    var auth = getAuth();
    var c = auth.getCustomer();
    if (!c) return;
    var mergedFor;
    try { mergedFor = localStorage.getItem(MERGED_KEY); } catch (_) { mergedFor = null; }
    if (mergedFor === c.id) return;        // 既にマージ済み
    var local = readLocal();
    if (local.length > 0 && API_BASE) {
      try {
        await fetch(API_BASE + '/api/customer/favorites/merge', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ storeIds: local })
        });
      } catch (_) {}
    }
    try { localStorage.setItem(MERGED_KEY, c.id); } catch (_) {}
    writeLocal([]);                        // ローカル分はクリア (サーバが SoT)
  }

  async function refresh() {
    if (isLoggedIn()) {
      await mergeLocalIfNeeded();
      var server = await fetchServerList();
      if (server) {
        _set = new Set(server);
        _ready = true;
        emit();
        return;
      }
    }
    _set = new Set(readLocal());
    _ready = true;
    emit();
  }

  function list()       { return Array.from(_set); }
  function has(storeId) { return _set.has(storeId); }

  async function add(storeId) {
    if (!storeId || _set.has(storeId)) return;
    _set.add(storeId);
    emit();
    if (isLoggedIn() && API_BASE) {
      try {
        await fetch(API_BASE + '/api/customer/favorites/' + encodeURIComponent(storeId), {
          method: 'PUT', headers: authHeaders()
        });
      } catch (_) {}
    } else {
      var l = readLocal();
      if (l.indexOf(storeId) < 0) { l.push(storeId); writeLocal(l); }
    }
  }

  async function remove(storeId) {
    if (!storeId || !_set.has(storeId)) return;
    _set.delete(storeId);
    emit();
    if (isLoggedIn() && API_BASE) {
      try {
        await fetch(API_BASE + '/api/customer/favorites/' + encodeURIComponent(storeId), {
          method: 'DELETE', headers: authHeaders()
        });
      } catch (_) {}
    } else {
      var l = readLocal().filter(function (s) { return s !== storeId; });
      writeLocal(l);
    }
  }

  async function toggle(storeId) {
    if (_set.has(storeId)) { await remove(storeId); return 'removed'; }
    await add(storeId); return 'added';
  }

  function onChange(cb) {
    if (typeof cb === 'function') {
      _listeners.push(cb);
      if (_ready) try { cb(list()); } catch (_) {}
    }
  }

  window.nakashinchiFavorites = {
    list:                list,
    has:                 has,
    add:                 add,
    remove:              remove,
    toggle:              toggle,
    refresh:             refresh,
    mergeLocalIfNeeded:  mergeLocalIfNeeded,
    onChange:            onChange
  };

  // 初期ロード
  refresh();
})();
