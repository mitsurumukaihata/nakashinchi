/* ===========================================
   麻ノ葉 — 営業時間・定休日・受付状態・表示設定
   - localStorage 'manoha-hours-v1'   : 営業時間 + 定休日 + 受付状態
   - localStorage 'manoha-display-v1' : お客様向け表示設定
   - 公開ページ (asanoha-hero-bg) で同じデータを読んで反映
   - 「受付停止」「本日終了」は日付が変わると自動で「通常」に戻る
   =========================================== */
(function () {
  'use strict';

  var HOURS_KEY         = 'manoha-hours-v1';
  var DISPLAY_KEY       = 'manoha-display-v1';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var DEFAULT_HOURS   = { open: '17:00', close: '01:00', crossDay: true, closedDays: [], reception: 'normal', receptionDate: '' };
  var DEFAULT_DISPLAY = { showBadge: true, showSeats: true, showSeatsDetail: false, showWhenFull: false };
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];

  // 営業時間 form
  var openInput     = document.getElementById('open-time');
  var closeInput    = document.getElementById('close-time');
  var crossDay      = document.getElementById('cross-day');
  var dayChecks     = document.querySelectorAll('[data-day]');
  var receptionRads = document.querySelectorAll('input[name="reception"]');
  // 表示設定 form
  var showBadge       = document.getElementById('show-badge');
  var showSeats       = document.getElementById('show-seats');
  var showSeatsDetail = document.getElementById('show-seats-detail');
  var showWhenFull    = document.getElementById('show-when-full');
  // プレビュー
  var statusPrev    = document.getElementById('status-preview');
  var statusTxt     = document.getElementById('status-text');
  var statusHours   = document.getElementById('status-hours');
  var statusReason  = document.getElementById('status-reason');
  // ボタン・トースト
  var saveBtn       = document.getElementById('save-btn');
  var resetBtn      = document.getElementById('reset-btn');
  var toast         = document.getElementById('toast');
  var themeToggle   = document.getElementById('theme-toggle');

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

  // ---- 受付状態の自動リセット（日付が変わったら通常に戻す） ----
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

  // ---- DATA ----
  function readHours() {
    try {
      var v = JSON.parse(localStorage.getItem(HOURS_KEY) || 'null');
      var merged = Object.assign({}, DEFAULT_HOURS, v || {});
      return autoResetReception(merged);
    } catch (_) { return Object.assign({}, DEFAULT_HOURS); }
  }
  function writeHours(d) {
    try { localStorage.setItem(HOURS_KEY, JSON.stringify(d)); } catch (_) {}
  }
  function readDisplay() {
    try {
      var v = JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null');
      return Object.assign({}, DEFAULT_DISPLAY, v || {});
    } catch (_) { return Object.assign({}, DEFAULT_DISPLAY); }
  }
  function writeDisplay(d) {
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(d)); } catch (_) {}
  }
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

  // ---- TOAST ----
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 2800);
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

  saveBtn.addEventListener('click', function () {
    writeHours(readForm());
    writeDisplay(readDisplayForm());
    showToast('設定を保存しました。公開ページに反映されます。');
  });
  resetBtn.addEventListener('click', function () {
    writeForms(Object.assign({}, DEFAULT_HOURS, { receptionDate: '' }), Object.assign({}, DEFAULT_DISPLAY));
    updatePreview();
    showToast('初期値に戻しました（保存はまだ未実行）');
  });

  // ---- INIT ----
  var initHours = readHours();
  var initDisplay = readDisplay();
  // 自動リセットが起きていたら静かに永続化
  if (initHours.receptionDate !== '' && initHours.receptionDate === todayStr()) {
    /* keep */
  } else if (initHours.reception !== 'normal') {
    writeHours(initHours);  // reset を永続化
  }
  writeForms(initHours, initDisplay);
  updatePreview();
  setInterval(updatePreview, 60 * 1000);

  // 別タブ同期
  window.addEventListener('storage', function (e) {
    if (e.key === HOURS_KEY || e.key === DISPLAY_KEY) {
      writeForms(readHours(), readDisplay());
      updatePreview();
    } else if (e.key === THEME_STORAGE_KEY) {
      applyTheme(e.newValue || 'light');
    }
  });
})();
