/* ===========================================
   麻ノ葉 — 席管理 UI
   - タップで個別 toggle
   - ゾーン一括 (BOX / カウンター)
   - 全体一括 (空 / 着)
   - 元に戻す (直前 1 回)
   - localStorage で永続化
   =========================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'manoha-seats-v1';
  var UNDO_TIMEOUT_MS = 6000;

  var seats     = Array.prototype.slice.call(document.querySelectorAll('.seat'));
  var cntOpen   = document.getElementById('cnt-open');
  var cntTaken  = document.getElementById('cnt-taken');
  var timeEl    = document.getElementById('time');
  var undoBar   = document.getElementById('undo-bar');
  var undoText  = document.getElementById('undo-text');
  var undoBtn   = document.getElementById('undo-btn');

  var previousState = null;
  var undoTimer     = null;

  // -------- state I/O --------
  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { /* quota / private mode 等は黙殺 */ }
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
      var id = el.dataset.id;
      el.dataset.occupied = state[id] ? 'true' : 'false';
    });
  }

  // -------- counter / persist --------
  function updateCounter() {
    var taken = 0;
    seats.forEach(function (el) { if (el.dataset.occupied === 'true') taken++; });
    cntTaken.textContent = taken;
    cntOpen.textContent  = seats.length - taken;
  }
  function persist() {
    writeState(captureState());
  }

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
    applyState(previousState);
    updateCounter();
    persist();
    flashAll();
    hideUndo();
  });

  // -------- flash animation --------
  function flashAll() {
    seats.forEach(function (el) {
      el.classList.remove('is-flash');
      // reflow to restart animation
      void el.offsetWidth;
      el.classList.add('is-flash');
    });
  }
  function flashZone(zone) {
    seats.forEach(function (el) {
      if (el.dataset.zone !== zone) return;
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
    });
  }

  // -------- individual toggle --------
  seats.forEach(function (el) {
    el.addEventListener('click', function () {
      el.dataset.occupied = el.dataset.occupied === 'true' ? 'false' : 'true';
      updateCounter();
      persist();
      // 個別操作は地味なのでundoバーは出さない
    });
  });

  // -------- group / global actions --------
  function setZone(zone, occupied) {
    previousState = captureState();
    seats.forEach(function (el) {
      if (el.dataset.zone !== zone) return;
      el.dataset.occupied = occupied ? 'true' : 'false';
    });
    flashZone(zone);
    updateCounter();
    persist();
    showUndo((zone === 'box' ? 'BOX' : 'カウンター') + 'を一括' + (occupied ? '着席' : '空席') + 'にしました');
  }
  function setAll(occupied) {
    previousState = captureState();
    seats.forEach(function (el) { el.dataset.occupied = occupied ? 'true' : 'false'; });
    flashAll();
    updateCounter();
    persist();
    showUndo('全席を' + (occupied ? '着席' : '空席') + 'にしました');
  }

  document.querySelectorAll('[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;
      var zone   = btn.dataset.zone;
      if (action === 'zone-fill')  setZone(zone, true);
      else if (action === 'zone-clear') setZone(zone, false);
      else if (action === 'all-fill')   setAll(true);
      else if (action === 'all-clear')  setAll(false);
    });
  });

  // -------- live clock --------
  function tickTime() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    timeEl.textContent = hh + ':' + mm;
  }
  tickTime();
  setInterval(tickTime, 30 * 1000);

  // -------- init --------
  applyState(readState());
  updateCounter();
})();
