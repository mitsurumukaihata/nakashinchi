/* ===========================================
   麻ノ葉 — 席管理 UI
   - タップで個別 toggle
   - ゾーン一括 (BOX / カウンター)
   - 全体一括 (空 / 着)
   - 元に戻す (直前 1 回、上部トースト、4秒で自動消滅)
   - 昼/夜テーマ切替 (localStorage 'manoha-theme' で同期)
   - localStorage で席状態永続化
   =========================================== */
(function () {
  'use strict';

  var STORAGE_KEY       = 'manoha-seats-v1';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var UNDO_TIMEOUT_MS   = 4000;

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

  // -------- THEME --------
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }
  function loadTheme() {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; }
    catch (_) { return 'light'; }
  }
  function saveTheme(theme) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); }
    catch (_) {}
  }
  themeToggle.addEventListener('click', function () {
    var current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
  });

  // -------- SEATS state I/O --------
  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) {}
  }
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

  // -------- counter --------
  function updateCounter() {
    var taken = 0;
    seats.forEach(function (el) { if (el.dataset.occupied === 'true') taken++; });
    cntTaken.textContent = taken;
    cntOpen.textContent  = seats.length - taken;
  }
  function persist() { writeState(captureState()); }

  // -------- undo --------
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
    // 「元に戻す」で各席が空→着 or 着→空 になった方向を判定して個別にフラッシュ
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

  // -------- flash (方向別: clear/fill) --------
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

  // -------- individual toggle --------
  seats.forEach(function (el) {
    el.addEventListener('click', function () {
      var wasOccupied = el.dataset.occupied === 'true';
      el.dataset.occupied = wasOccupied ? 'false' : 'true';
      flashSeat(el, wasOccupied ? 'clear' : 'fill');
      updateCounter();
      persist();
    });
  });

  // -------- group / global --------
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

  // -------- live clock --------
  function tickTime() {
    var d  = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    timeEl.textContent = hh + ':' + mm;
  }
  tickTime();
  setInterval(tickTime, 30 * 1000);

  // -------- cross-tab sync --------
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      applyState(readState());
      updateCounter();
    } else if (e.key === THEME_STORAGE_KEY) {
      applyTheme(e.newValue || 'light');
    }
  });

  // -------- init --------
  applyTheme(loadTheme());
  applyState(readState());
  updateCounter();
})();
