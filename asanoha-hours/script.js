/* ===========================================
   麻ノ葉 — 営業時間・定休日・受付状態・表示設定
   - API 連携あり (nakashinchiApi)、未設定ならローカルキャッシュのみで動作
   - 「保存して公開」で D1 へ書込（PIN 認証）
   - 日付が変わると受付状態は自動で「通常」に戻る
   =========================================== */
(function () {
  'use strict';

  var KEY_HOURS         = 'hours';
  var KEY_DISPLAY       = 'display';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var LEGACY_HOURS_KEY   = 'manoha-hours-v1';
  var LEGACY_DISPLAY_KEY = 'manoha-display-v1';
  var DEFAULT_HOURS   = { open: '17:00', close: '01:00', crossDay: true, closedDays: [], reception: 'normal', receptionDate: '' };
  var DEFAULT_DISPLAY = { showBadge: true, showSeats: true, showSeatsDetail: false, showWhenFull: false };
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];

  var openInput     = document.getElementById('open-time');
  var closeInput    = document.getElementById('close-time');
  var crossDay      = document.getElementById('cross-day');
  var dayChecks     = document.querySelectorAll('[data-day]');
  var receptionRads = document.querySelectorAll('input[name="reception"]');
  var showBadge       = document.getElementById('show-badge');
  var showSeats       = document.getElementById('show-seats');
  var showSeatsDetail = document.getElementById('show-seats-detail');
  var showWhenFull    = document.getElementById('show-when-full');
  var statusPrev    = document.getElementById('status-preview');
  var statusTxt     = document.getElementById('status-text');
  var statusHours   = document.getElementById('status-hours');
  var statusReason  = document.getElementById('status-reason');
  var saveBtn       = document.getElementById('save-btn');
  var resetBtn      = document.getElementById('reset-btn');
  var toast         = document.getElementById('toast');
  var themeToggle   = document.getElementById('theme-toggle');
  var noteText      = document.getElementById('note-text');

  function api()      { return window.nakashinchiApi || null; }
  function isOnline() { return api() && api().isOnline(); }

  // ---- THEME ----
  function applyTheme(t) { document.body.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); }
  function loadTheme()   { try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch (_) { return 'light'; } }
  function saveTheme(t)  { try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch (_) {} }
  themeToggle.addEventListener('click', function () {
    var cur = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var nxt = cur === 'dark' ? 'light' : 'dark';
    applyTheme(nxt); saveTheme(nxt);
  });
  applyTheme(loadTheme());

  // ---- 旧形式 localStorage からの移行 ----
  function migrateLegacy() {
    try {
      var rawH = localStorage.getItem(LEGACY_HOURS_KEY);
      if (rawH) {
        var dh = JSON.parse(rawH);
        if (dh) {
          localStorage.setItem('manoha-cache:' + KEY_HOURS, JSON.stringify({ value: dh, updatedAt: dh.updatedAt || new Date().toISOString() }));
        }
        localStorage.removeItem(LEGACY_HOURS_KEY);
      }
      var rawD = localStorage.getItem(LEGACY_DISPLAY_KEY);
      if (rawD) {
        var dd = JSON.parse(rawD);
        if (dd) {
          localStorage.setItem('manoha-cache:' + KEY_DISPLAY, JSON.stringify({ value: dd, updatedAt: dd.updatedAt || new Date().toISOString() }));
        }
        localStorage.removeItem(LEGACY_DISPLAY_KEY);
      }
    } catch (_) {}
  }

  // ---- 受付状態の自動リセット ----
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function autoResetReception(d) {
    if (d.reception !== 'normal' && d.receptionDate !== todayStr()) {
      d.reception = 'normal';
      d.receptionDate = todayStr();
    }
    return d;
  }

  // ---- フォーム読み書き ----
  function readForm() {
    var closed = [];
    for (var i = 0; i < dayChecks.length; i++) {
      if (dayChecks[i].checked) closed.push(+dayChecks[i].dataset.day);
    }
    var reception = 'normal';
    for (var j = 0; j < receptionRads.length; j++) {
      if (receptionRads[j].checked) { reception = receptionRads[j].value; break; }
    }
    return {
      open:          openInput.value || '17:00',
      close:         closeInput.value || '01:00',
      crossDay:      crossDay.checked,
      closedDays:    closed,
      reception:     reception,
      receptionDate: reception === 'normal' ? '' : todayStr(),
      updatedAt:     new Date().toISOString()
    };
  }
  function readDisplayForm() {
    return {
      showBadge:       showBadge.checked,
      showSeats:       showSeats.checked,
      showSeatsDetail: showSeatsDetail.checked,
      showWhenFull:    showWhenFull.checked,
      updatedAt:       new Date().toISOString()
    };
  }
  function writeForms(hours, display) {
    openInput.value  = hours.open  || '17:00';
    closeInput.value = hours.close || '01:00';
    crossDay.checked = !!hours.crossDay;
    for (var i = 0; i < dayChecks.length; i++) {
      dayChecks[i].checked = (hours.closedDays || []).indexOf(+dayChecks[i].dataset.day) !== -1;
    }
    for (var j = 0; j < receptionRads.length; j++) {
      receptionRads[j].checked = receptionRads[j].value === (hours.reception || 'normal');
    }
    showBadge.checked       = !!display.showBadge;
    showSeats.checked       = !!display.showSeats;
    showSeatsDetail.checked = !!display.showSeatsDetail;
    showWhenFull.checked    = !!display.showWhenFull;
  }

  // ---- 状態判定 ----
  function isOpenNow(now, d) {
    if (d.reception === 'closed')  return { open: false, reason: '「本日終了」が選択されています。新規受付は停止中です。' };
    if (d.reception === 'stopped') return { open: false, reason: '「新規受付停止」が選択されています。席はあっても受付しない設定です。' };
    var dow = now.getDay();
    if ((d.closedDays || []).indexOf(dow) !== -1) {
      return { open: false, reason: '今日は定休日（' + DOW[dow] + '曜日）として設定されています' };
    }
    var op = d.open.split(':');
    var cl = d.close.split(':');
    var openM  = (+op[0]) * 60 + (+op[1]);
    var closeM = (+cl[0]) * 60 + (+cl[1]);
    var nowM   = now.getHours() * 60 + now.getMinutes();
    var open;
    if (d.crossDay) open = nowM >= openM || nowM < closeM;
    else            open = nowM >= openM && nowM < closeM;
    return {
      open: open,
      reason: open
        ? '現在は営業時間内です（' + d.open + ' — ' + d.close + (d.crossDay ? ' 翌' : '') + '）'
        : '現在は営業時間外です（次の開店：' + d.open + '）'
    };
  }

  function updatePreview() {
    var d = readForm();
    var r = isOpenNow(new Date(), d);
    var stateAttr = r.open ? 'open' : (d.reception === 'normal' ? 'closed' : 'stopped');
    statusPrev.setAttribute('data-status', stateAttr);
    if (d.reception === 'closed')      statusTxt.textContent = '本日終了';
    else if (d.reception === 'stopped') statusTxt.textContent = '受付停止中';
    else                                statusTxt.textContent = r.open ? '営業中' : '営業時間外';
    statusHours.textContent = d.open + ' — ' + d.close + (d.crossDay ? ' (翌日)' : '');
    statusReason.textContent = r.reason;
  }

  function showToast(msg, durMs) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, durMs || 2800);
  }
  function updateNoteText() {
    if (isOnline()) {
      noteText.innerHTML = '✓ クラウド同期 ON。お客様の端末でも同じ設定が反映されます。';
      noteText.style.color = 'var(--color-success)';
    } else {
      noteText.innerHTML = '※ API 接続先が未設定です。現在は同一端末のみに反映されます。';
      noteText.style.color = '';
    }
  }

  // ---- LOAD ----
  async function load() {
    var hours = DEFAULT_HOURS;
    var display = DEFAULT_DISPLAY;
    if (api()) {
      var hRes = await api().fetchKey(KEY_HOURS);
      var dRes = await api().fetchKey(KEY_DISPLAY);
      if (hRes && hRes.value) hours = Object.assign({}, DEFAULT_HOURS, hRes.value);
      if (dRes && dRes.value) display = Object.assign({}, DEFAULT_DISPLAY, dRes.value);
    } else {
      try {
        var ch = JSON.parse(localStorage.getItem('manoha-cache:' + KEY_HOURS) || 'null');
        if (ch && ch.value) hours = Object.assign({}, DEFAULT_HOURS, ch.value);
        var cd = JSON.parse(localStorage.getItem('manoha-cache:' + KEY_DISPLAY) || 'null');
        if (cd && cd.value) display = Object.assign({}, DEFAULT_DISPLAY, cd.value);
      } catch (_) {}
    }
    autoResetReception(hours);
    writeForms(hours, display);
    updatePreview();
  }

  // ---- SAVE ----
  async function save() {
    var hours   = readForm();
    var display = readDisplayForm();

    // オフライン (API未設定) なら localStorage キャッシュのみ
    if (!isOnline()) {
      try {
        localStorage.setItem('manoha-cache:' + KEY_HOURS,   JSON.stringify({ value: hours,   updatedAt: hours.updatedAt }));
        localStorage.setItem('manoha-cache:' + KEY_DISPLAY, JSON.stringify({ value: display, updatedAt: display.updatedAt }));
        showToast('保存しました（この端末のみ）');
      } catch (_) { showToast('保存に失敗しました'); }
      return;
    }

    saveBtn.disabled = true;
    var orig = saveBtn.textContent;
    saveBtn.textContent = '保存中…';

    async function doSave() {
      await api().saveKey(KEY_HOURS, hours);
      await api().saveKey(KEY_DISPLAY, display);
    }

    try {
      try { await doSave(); }
      catch (e1) {
        if (e1.message === 'AUTH_REQUIRED') {
          var token = await window.promptPin();
          if (!token) { showToast('キャンセルしました'); return; }
          await doSave();
        } else { throw e1; }
      }
      showToast('保存しました。公開ページに反映されます。');
    } catch (e) {
      showToast('保存できませんでした（' + (e.message || 'error') + '）', 4500);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = orig;
    }
  }

  // ---- EVENTS ----
  [openInput, closeInput, crossDay].forEach(function (el) {
    el.addEventListener('input',  updatePreview);
    el.addEventListener('change', updatePreview);
  });
  Array.prototype.forEach.call(dayChecks, function (cb) {
    cb.addEventListener('change', updatePreview);
  });
  Array.prototype.forEach.call(receptionRads, function (rd) {
    rd.addEventListener('change', updatePreview);
  });

  saveBtn.addEventListener('click', save);
  resetBtn.addEventListener('click', function () {
    writeForms(JSON.parse(JSON.stringify(DEFAULT_HOURS)), JSON.parse(JSON.stringify(DEFAULT_DISPLAY)));
    updatePreview();
    showToast('初期値に戻しました（保存はまだ未実行）');
  });

  // 別タブ同期
  window.addEventListener('storage', function (e) {
    if (e.key === 'manoha-cache:' + KEY_HOURS || e.key === 'manoha-cache:' + KEY_DISPLAY) load();
    else if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });

  // ---- INIT ----
  migrateLegacy();
  updateNoteText();
  function start() {
    updateNoteText();
    load();
    setInterval(updatePreview, 60 * 1000);
  }
  if (api()) start();
  else setTimeout(start, 100);
})();
