/* ===========================================
   麻ノ葉 — Hero (公開トップ)
   - お知らせ・営業時間を localStorage から読み込み表示
   - タブ非表示時に floater アニメを止める
   =========================================== */
(function () {
  'use strict';

  var NEWS_KEY  = 'manoha-news-v1';
  var HOURS_KEY = 'manoha-hours-v1';
  var DEFAULT_HOURS = { open: '17:00', close: '01:00', crossDay: true, closedDays: [] };

  var statusEl    = document.getElementById('hero-status');
  var statusTxt   = statusEl ? statusEl.querySelector('.hero__status-text') : null;
  var newsEl      = document.getElementById('hero-news');
  var newsTxtEl   = document.getElementById('hero-news-text');
  var floaters    = document.querySelectorAll('.floater');

  // ---- お知らせ ----
  function refreshNews() {
    if (!newsEl || !newsTxtEl) return;
    try {
      var data = JSON.parse(localStorage.getItem(NEWS_KEY) || 'null');
      if (data && data.message && data.message.trim()) {
        newsTxtEl.textContent = data.message;
        newsEl.hidden = false;
      } else {
        newsEl.hidden = true;
      }
    } catch (_) {
      newsEl.hidden = true;
    }
  }

  // ---- 営業時間 ----
  function readHours() {
    try {
      var v = JSON.parse(localStorage.getItem(HOURS_KEY) || 'null');
      return v || DEFAULT_HOURS;
    } catch (_) { return DEFAULT_HOURS; }
  }
  function isOpenNow(now, h) {
    var dow = now.getDay();
    if ((h.closedDays || []).indexOf(dow) !== -1) return false;
    var op = h.open.split(':'),  oh = +op[0], om = +op[1];
    var cl = h.close.split(':'), ch = +cl[0], cm = +cl[1];
    var nowM   = now.getHours() * 60 + now.getMinutes();
    var openM  = oh * 60 + om;
    var closeM = ch * 60 + cm;
    if (h.crossDay) return nowM >= openM || nowM < closeM;
    return nowM >= openM && nowM < closeM;
  }
  function refreshStatus() {
    if (!statusEl || !statusTxt) return;
    var h = readHours();
    var open = isOpenNow(new Date(), h);
    statusEl.setAttribute('data-status', open ? 'open' : 'closed');
    statusTxt.textContent = open
      ? '営業中 ' + h.open + ' — ' + h.close
      : '営業時間外 ' + h.open + ' — ' + h.close;
  }

  // ---- floater アニメをタブ非表示時に停止 ----
  if (floaters.length) {
    document.addEventListener('visibilitychange', function () {
      var state = document.hidden ? 'paused' : 'running';
      for (var i = 0; i < floaters.length; i++) floaters[i].style.animationPlayState = state;
    });
  }

  // ---- 同じ端末の別タブ更新を反映 ----
  window.addEventListener('storage', function (e) {
    if (e.key === NEWS_KEY)  refreshNews();
    if (e.key === HOURS_KEY) refreshStatus();
  });

  // ---- INIT ----
  refreshNews();
  refreshStatus();
  // 1分ごとに営業判定を更新
  setInterval(refreshStatus, 60 * 1000);
})();
