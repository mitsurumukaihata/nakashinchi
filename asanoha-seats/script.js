/* ===========================================
   麻ノ葉 — 席管理 UI (D1 連携版)
   - タップで個別 toggle (即時 UI 更新 + デバウンス API 保存)
   - ゾーン一括 / 全体一括
   - 元に戻す (直前 1 回、上部トースト、4秒で自動消滅)
   - 昼/夜テーマ切替 (manoha-theme で同期)
   - API 連携: nakashinchiApi 経由で D1 へ書込/読取
     - API 未設定なら localStorage キャッシュのみ（オフラインモード）
     - 1秒のデバウンスで連打を1回にまとめて送信
   =========================================== */
(function () {
  'use strict';

  var KEY                = 'seats';
  var LEGACY_KEY         = 'manoha-seats-v1';
  var THEME_STORAGE_KEY  = 'manoha-theme';
  var UNDO_TIMEOUT_MS    = 4000;
  var SAVE_DEBOUNCE_MS   = 1000;

  var seats        = Array.prototype.slice.call(document.querySelectorAll('.seat'));
  var cntOpen      = document.getElementById('cnt-open');
  var cntTaken     = document.getElementById('cnt-taken');
  var timeEl       = document.getElementById('time');
  var undoBar      = document.getElementById('undo-bar');
  var undoText     = document.getElementById('undo-text');
  var undoBtn      = document.getElementById('undo-btn');
  var undoClose    = document.getElementById('undo-close');
  var themeToggle  = document.getElementById('theme-toggle');

  var previousState = null;
  var undoTimer     = null;
  var saveTimer     = null;

  function api()      { return window.nakashinchiApi || null; }
  function isOnline() { return api() && api().isOnline(); }

  // ---- THEME ----
  function applyTheme(theme) { document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light'); }
  function loadTheme() { try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch (_) { return 'light'; } }
  function saveTheme(theme) { try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (_) {} }
  themeToggle.addEventListener('click', function () {
    var current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next); saveTheme(next);
  });

  // ---- 旧キー (manoha-seats-v1) からの自動移行 ----
  function migrateLegacy() {
    try {
      var raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        localStorage.setItem('manoha-cache:' + KEY, JSON.stringify({
          value: data,
          updatedAt: new Date().toISOString()
        }));
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch (_) {}
  }

  // ---- state ----
  function captureState() {
    var s = {};
    seats.forEach(function (el) {
      s[el.dataset.id] = el.dataset.occupied === 'true';
    });
    return s;
  }
  function applyState(state) {
    seats.forEach(function (el) {
      el.dataset.occupied = state[el.dataset.id] ? 'true' : 'false';
    });
  }
  function updateCounter() {
    var taken = 0;
    seats.forEach(function (el) { if (el.dataset.occupied === 'true') taken++; });
    cntTaken.textContent = taken;
    cntOpen.textContent  = seats.length - taken;
  }

  // ---- 永続化 (debounced) ----
  function persistLocal() {
    try {
      localStorage.setItem('manoha-cache:' + KEY, JSON.stringify({
        value: captureState(),
        updatedAt: new Date().toISOString()
      }));
    } catch (_) {}
  }

  function schedulePersistRemote() {
    if (!isOnline()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(performRemoteSave, SAVE_DEBOUNCE_MS);
  }

  async function performRemoteSave() {
    if (!isOnline()) return;
    var snapshot = captureState();
    try {
      await api().saveKey(KEY, snapshot);
    } catch (e) {
      if (e.message === 'AUTH_REQUIRED') {
        var token = await window.promptPin();
        if (!token) { /* 認証されない間はローカルのみ */ return; }
        try { await api().saveKey(KEY, snapshot); }
        catch (_) { /* それでもダメなら静かに諦め */ }
      }
    }
  }

  function persist() {
    persistLocal();         // ローカル即時
    schedulePersistRemote(); // D1 デバウンス送信
  }

  // ---- undo ----
  function showUndo(message) {
    if (undoTimer) clearTimeout(undoTimer);
    undoText.textContent = message;
    undoBar.hidden = false;
    undoTimer = setTimeout(hideUndo, UNDO_TIMEOUT_MS);
  }
  function hideUndo() {
    undoBar.hidden = true;
    if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
    previousState = null;
  }
  undoBtn.addEventListener('click', function () {
    if (!previousState) return;
    var currentState = captureState();
    applyState(previousState);
    seats.forEach(function (el) {
      var id = el.dataset.id;
      if (previousState[id] !== currentState[id]) {
        flashSeat(el, previousState[id] ? 'fill' : 'clear');
      }
    });
    updateCounter();
    persist();
    hideUndo();
  });
  undoClose.addEventListener('click', hideUndo);

  // ---- flash ----
  function flashSeat(el, direction) {
    el.classList.remove('is-flash', 'is-flash--clear', 'is-flash--fill');
    void el.offsetWidth;
    el.classList.add('is-flash', direction === 'clear' ? 'is-flash--clear' : 'is-flash--fill');
  }
  function flashAll(direction) {
    seats.forEach(function (el) { flashSeat(el, direction); });
  }
  function flashZone(zone, direction) {
    seats.forEach(function (el) {
      if (el.dataset.zone === zone) flashSeat(el, direction);
    });
  }

  // ---- individual toggle ----
  seats.forEach(function (el) {
    el.addEventListener('click', function () {
      var wasOccupied = el.dataset.occupied === 'true';
      el.dataset.occupied = wasOccupied ? 'false' : 'true';
      flashSeat(el, wasOccupied ? 'clear' : 'fill');
      updateCounter();
      persist();
    });
  });

  // ---- group / global ----
  function setZone(zone, occupied) {
    previousState = captureState();
    seats.forEach(function (el) {
      if (el.dataset.zone !== zone) return;
      el.dataset.occupied = occupied ? 'true' : 'false';
    });
    flashZone(zone, occupied ? 'fill' : 'clear');
    updateCounter();
    persist();
    showUndo((zone === 'box' ? 'BOX' : 'カウンター') + 'を一括' + (occupied ? '着席' : '空席') + 'にしました');
  }
  function setAll(occupied) {
    previousState = captureState();
    seats.forEach(function (el) { el.dataset.occupied = occupied ? 'true' : 'false'; });
    flashAll(occupied ? 'fill' : 'clear');
    updateCounter();
    persist();
    showUndo('全席を' + (occupied ? '着席' : '空席') + 'にしました');
  }

  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;
      var zone   = btn.dataset.zone;
      if (action === 'zone-fill')       setZone(zone, true);
      else if (action === 'zone-clear') setZone(zone, false);
      else if (action === 'all-fill')   setAll(true);
      else if (action === 'all-clear')  setAll(false);
    });
  });

  // ---- live clock ----
  function tickTime() {
    var d  = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    timeEl.textContent = hh + ':' + mm;
  }
  tickTime();
  setInterval(tickTime, 30 * 1000);

  // ---- LOAD (API 優先) ----
  async function load() {
    var data = null;
    if (api()) {
      var res = await api().fetchKey(KEY);
      if (res && res.value) data = res.value;
    }
    if (!data) {
      try {
        var c = JSON.parse(localStorage.getItem('manoha-cache:' + KEY) || 'null');
        if (c && c.value) data = c.value;
      } catch (_) {}
    }
    if (data) {
      applyState(data);
      updateCounter();
    }
  }

  // ---- cross-tab sync ----
  window.addEventListener('storage', function (e) {
    if (e.key === 'manoha-cache:' + KEY) load();
    else if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });

  // ---- 定期的に API から再取得 (他の端末で変更された分を取り込む) ----
  function startPolling() {
    if (!api()) return;
    setInterval(async function () {
      if (saveTimer) return;  // 保存中は取得しない (上書き競合回避)
      var res = await api().fetchKey(KEY);
      if (res && res.value) {
        applyState(res.value);
        updateCounter();
      }
    }, 30 * 1000);
  }

  // ---- INIT ----
  applyTheme(loadTheme());
  migrateLegacy();
  load().then(function () { startPolling(); });
})();
