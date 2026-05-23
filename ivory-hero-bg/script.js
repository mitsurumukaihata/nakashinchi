/* ===========================================
   Innocent Base Ivory — Hero
   - 昼/夜テーマ切替
   - お知らせ・営業時間・受付状態を API キャッシュから取得
   =========================================== */
(function () {
  'use strict';

  var THEME_KEY = 'manoha-theme';
  var STORE_ID  = 'ivory';
  var DEFAULT_HOURS   = { open: '21:00', close: '05:00', crossDay: true, closedDays: [2], reception: 'normal', receptionDate: '' };
  var DEFAULT_DISPLAY = { showBadge: true, showSeats: false, showSeatsDetail: false, showWhenFull: false };

  var statusEl  = document.getElementById('hero-status');
  var statusTxt = statusEl ? statusEl.querySelector('.hero__status-text') : null;
  var newsEl    = document.getElementById('hero-news');
  var newsTxt   = document.getElementById('hero-news-text');
  var themeBtn  = document.getElementById('theme-toggle');

  // ---- THEME ----
  function applyTheme(t) { document.body.setAttribute('data-theme', t === 'light' ? 'light' : 'dark'); }
  function loadTheme()   { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) { return 'dark'; } }
  function saveTheme(t)  { try { localStorage.setItem(THEME_KEY, t); } catch (_) {} }
  applyTheme(loadTheme());
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var nxt = cur === 'light' ? 'dark' : 'light';
      applyTheme(nxt); saveTheme(nxt);
    });
  }

  // ---- データ読込 ----
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function readCache(key, defaults) {
    try {
      var c = JSON.parse(localStorage.getItem('store-cache:' + STORE_ID + ':' + key) || 'null');
      if (c && c.value) return Object.assign({}, defaults || {}, c.value);
    } catch (_) {}
    return Object.assign({}, defaults || {});
  }
  function readHours()   {
    var m = readCache('hours', DEFAULT_HOURS);
    if (m.reception !== 'normal' && m.receptionDate !== todayStr()) m.reception = 'normal';
    return m;
  }
  function readDisplay() { return readCache('display', DEFAULT_DISPLAY); }
  function readNews()    {
    try {
      var c = JSON.parse(localStorage.getItem('store-cache:' + STORE_ID + ':news') || 'null');
      if (c && c.value) return c.value;
    } catch (_) {}
    return null;
  }

  // ---- 状態判定 ----
  function isOpenNow(now, h) {
    if (h.reception === 'closed')  return { open: false, state: 'ended',   label: '本日終了' };
    if (h.reception === 'stopped') return { open: false, state: 'stopped', label: '受付停止中' };
    if ((h.closedDays || []).indexOf(now.getDay()) !== -1) return { open: false, state: 'closed', label: '本日 定休日' };
    var op = h.open.split(':'), cl = h.close.split(':');
    var nowM   = now.getHours() * 60 + now.getMinutes();
    var openM  = (+op[0]) * 60 + (+op[1]);
    var closeM = (+cl[0]) * 60 + (+cl[1]);
    var open = h.crossDay ? (nowM >= openM || nowM < closeM) : (nowM >= openM && nowM < closeM);
    return { open: open, state: open ? 'open' : 'closed', label: (open ? 'OPEN ' : 'CLOSED ') + h.open + ' — ' + h.close };
  }

  function refresh() {
    var h  = readHours();
    var d  = readDisplay();
    var st = isOpenNow(new Date(), h);

    if (statusEl && statusTxt && d.showBadge) {
      statusEl.hidden = false;
      statusEl.setAttribute('data-status', st.state);
      statusTxt.textContent = st.label;
    } else if (statusEl) {
      statusEl.hidden = true;
    }

    var nd = readNews();
    if (newsEl && newsTxt) {
      if (nd && nd.message && nd.message.trim()) {
        newsTxt.textContent = nd.message;
        newsEl.hidden = false;
      } else {
        newsEl.hidden = true;
      }
    }
  }

  // ---- API から定期取得 ----
  async function refreshFromApi() {
    if (!window.nakashinchiApi || !window.nakashinchiApi.isOnline()) return;
    try {
      await window.nakashinchiApi.fetchAll();
      refresh();
    } catch (_) {}
  }

  // 別タブ更新
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf('store-cache:' + STORE_ID) === 0) refresh();
    else if (e.key === THEME_KEY) applyTheme(e.newValue || 'dark');
  });

  refresh();
  refreshFromApi();
  setInterval(refresh, 60 * 1000);
  setInterval(refreshFromApi, 30 * 1000);
})();
