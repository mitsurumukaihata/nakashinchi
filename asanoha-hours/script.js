/* ===========================================
   麻ノ葉 — 営業時間・定休日
   - localStorage 'manoha-hours-v1' に保存
   - 現在時刻と照らして「営業中／営業時間外」を判定
   - 公開ページ (asanoha-hero-bg) で同じ判定を使用
   =========================================== */
(function () {
  'use strict';

  var STORAGE_KEY       = 'manoha-hours-v1';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var DEFAULT = { open: '17:00', close: '01:00', crossDay: true, closedDays: [] };
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];

  var openInput    = document.getElementById('open-time');
  var closeInput   = document.getElementById('close-time');
  var crossDay     = document.getElementById('cross-day');
  var dayChecks    = document.querySelectorAll('[data-day]');
  var statusPrev   = document.getElementById('status-preview');
  var statusTxt    = document.getElementById('status-text');
  var statusHours  = document.getElementById('status-hours');
  var statusReason = document.getElementById('status-reason');
  var saveBtn      = document.getElementById('save-btn');
  var resetBtn     = document.getElementById('reset-btn');
  var toast        = document.getElementById('toast');
  var themeToggle  = document.getElementById('theme-toggle');

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

  // ---- DATA ----
  function readData() {
    try {
      var v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return v || JSON.parse(JSON.stringify(DEFAULT));
    } catch (_) { return JSON.parse(JSON.stringify(DEFAULT)); }
  }
  function writeData(d) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (_) {}
  }
  function readForm() {
    var closed = [];
    for (var i = 0; i < dayChecks.length; i++) {
      if (dayChecks[i].checked) closed.push(+dayChecks[i].dataset.day);
    }
    return {
      open:       openInput.value || '17:00',
      close:      closeInput.value || '01:00',
      crossDay:   crossDay.checked,
      closedDays: closed,
      updatedAt:  new Date().toISOString()
    };
  }
  function writeForm(d) {
    openInput.value  = d.open  || '17:00';
    closeInput.value = d.close || '01:00';
    crossDay.checked = !!d.crossDay;
    for (var i = 0; i < dayChecks.length; i++) {
      dayChecks[i].checked = (d.closedDays || []).indexOf(+dayChecks[i].dataset.day) !== -1;
    }
  }

  // ---- 状態判定 ----
  function isOpenNow(now, d) {
    var dow = now.getDay();
    if ((d.closedDays || []).indexOf(dow) !== -1) {
      return { open: false, reason: '今日は定休日（' + DOW[dow] + '曜日）として設定されています' };
    }
    var op = d.open.split(':');
    var cl = d.close.split(':');
    var openM  = (+op[0]) * 60 + (+op[1]);
    var closeM = (+cl[0]) * 60 + (+cl[1]);
    var nowM   = now.getHours() * 60 + now.getMinutes();

    var isOpen;
    if (d.crossDay) {
      isOpen = nowM >= openM || nowM < closeM;
    } else {
      isOpen = nowM >= openM && nowM < closeM;
    }
    return {
      open: isOpen,
      reason: isOpen
        ? '現在は営業時間内です（' + d.open + ' — ' + d.close + (d.crossDay ? ' 翌' : '') + '）'
        : '現在は営業時間外です（次の開店：' + d.open + '）'
    };
  }

  function updatePreview() {
    var d = readForm();
    var r = isOpenNow(new Date(), d);
    statusPrev.setAttribute('data-status', r.open ? 'open' : 'closed');
    statusTxt.textContent  = r.open ? '営業中' : '営業時間外';
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

  saveBtn.addEventListener('click', function () {
    var d = readForm();
    writeData(d);
    showToast('営業時間を保存しました。公開ページに反映されます。');
  });
  resetBtn.addEventListener('click', function () {
    writeForm(JSON.parse(JSON.stringify(DEFAULT)));
    updatePreview();
    showToast('初期値（17:00 — 01:00 / 定休日なし）に戻しました');
  });

  // ---- INIT ----
  writeForm(readData());
  updatePreview();
  // 1分ごとに現在の判定を更新
  setInterval(updatePreview, 60 * 1000);

  // 別タブ同期
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) { writeForm(readData()); updatePreview(); }
    else if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });
})();
