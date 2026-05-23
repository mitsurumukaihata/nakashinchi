/* ===========================================
   麻ノ葉 — Hero (公開トップ)
   - お知らせ・営業時間・受付状態・空席表示設定 を読み込み
   - タブ非表示時に floater アニメを止める
   =========================================== */
(function () {
  'use strict';

  var NEWS_KEY    = 'manoha-news-v1';
  var HOURS_KEY   = 'manoha-hours-v1';
  var DISPLAY_KEY = 'manoha-display-v1';
  var SEATS_KEY   = 'manoha-seats-v1';
  var DEFAULT_HOURS   = { open: '17:00', close: '01:00', crossDay: true, closedDays: [], reception: 'normal', receptionDate: '' };
  var DEFAULT_DISPLAY = { showBadge: true, showSeats: true, showSeatsDetail: false, showWhenFull: false };
  var TOTAL_SEATS = 11;
  var BOX_SEATS   = 5;
  var COUNTER_SEATS = 6;

  var statusEl    = document.getElementById('hero-status');
  var statusTxt   = statusEl ? statusEl.querySelector('.hero__status-text') : null;
  var seatsEl     = document.getElementById('hero-seats');
  var seatsTxt    = document.getElementById('hero-seats-text');
  var newsEl      = document.getElementById('hero-news');
  var newsTxtEl   = document.getElementById('hero-news-text');
  var floaters    = document.querySelectorAll('.floater');

  // ---- お知らせ ----
  function showNews(data) {
    if (!newsEl || !newsTxtEl) return;
    if (data && data.message && data.message.trim()) {
      newsTxtEl.textContent = data.message;
      newsEl.hidden = false;
    } else {
      newsEl.hidden = true;
    }
  }
  function refreshNewsLocal() {
    // 旧localStorage (manoha-news-v1) または APIキャッシュ (manoha-cache:news) のどちらでも読める
    try {
      var c = JSON.parse(localStorage.getItem('manoha-cache:news') || 'null');
      if (c && c.value) { showNews(c.value); return; }
      var legacy = JSON.parse(localStorage.getItem(NEWS_KEY) || 'null');
      if (legacy) { showNews(legacy); return; }
      showNews(null);
    } catch (_) { showNews(null); }
  }
  async function refreshNewsFromApi() {
    if (!window.nakashinchiApi) return;
    try {
      var res = await window.nakashinchiApi.fetchKey('news');
      if (res && res.value) showNews(res.value);
      else if (res === null) showNews(null);
    } catch (_) {}
  }

  // ---- データ読込 (API キャッシュ優先 → 旧 localStorage フォールバック) ----
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function readCacheOrLegacy(cacheKey, legacyKey, defaults) {
    try {
      var c = JSON.parse(localStorage.getItem('manoha-cache:' + cacheKey) || 'null');
      if (c && c.value) return Object.assign({}, defaults, c.value);
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem(legacyKey) || 'null');
      if (v) return Object.assign({}, defaults, v);
    } catch (_) {}
    return Object.assign({}, defaults);
  }
  function readHours() {
    var merged = readCacheOrLegacy('hours', HOURS_KEY, DEFAULT_HOURS);
    if (merged.reception !== 'normal' && merged.receptionDate !== todayStr()) {
      merged.reception = 'normal';
    }
    return merged;
  }
  function readDisplay() {
    return readCacheOrLegacy('display', DISPLAY_KEY, DEFAULT_DISPLAY);
  }
  function readSeats() {
    try {
      var c = JSON.parse(localStorage.getItem('manoha-cache:seats') || 'null');
      if (c && c.value) return c.value;
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem(SEATS_KEY) || 'null');
      if (v) return v;
    } catch (_) {}
    return {};
  }
  // API から最新を取得しキャッシュ更新 (バックグラウンド)
  async function refreshFromApi() {
    if (!window.nakashinchiApi || !window.nakashinchiApi.isOnline()) return;
    try {
      var all = await window.nakashinchiApi.fetchAll();
      // fetchAll はキャッシュも更新する。ここでは fresh data を即反映するだけ
      refresh();
    } catch (_) {}
  }
  function countSeats(seats) {
    var total = 0, taken = 0, boxTaken = 0, counterTaken = 0;
    Object.keys(seats).forEach(function (id) {
      total++;
      if (seats[id]) {
        taken++;
        if (id.charAt(0) === 'B') boxTaken++;
        else if (id.charAt(0) === 'C') counterTaken++;
      }
    });
    return {
      taken: taken,
      open: TOTAL_SEATS - taken,
      boxOpen: BOX_SEATS - boxTaken,
      counterOpen: COUNTER_SEATS - counterTaken
    };
  }

  // ---- 営業判定 ----
  function isOpenNow(now, h) {
    if (h.reception === 'closed')  return { open: false, state: 'ended',   label: '本日終了' };
    if (h.reception === 'stopped') return { open: false, state: 'stopped', label: '受付停止中' };
    var dow = now.getDay();
    if ((h.closedDays || []).indexOf(dow) !== -1) {
      return { open: false, state: 'closed', label: '本日 定休日' };
    }
    var op = h.open.split(':'), cl = h.close.split(':');
    var nowM   = now.getHours() * 60 + now.getMinutes();
    var openM  = (+op[0]) * 60 + (+op[1]);
    var closeM = (+cl[0]) * 60 + (+cl[1]);
    var open = h.crossDay ? (nowM >= openM || nowM < closeM) : (nowM >= openM && nowM < closeM);
    return {
      open: open,
      state: open ? 'open' : 'closed',
      label: (open ? '営業中 ' : '営業時間外 ') + h.open + ' — ' + h.close
    };
  }

  // ---- 表示更新 ----
  function refresh() {
    var h = readHours();
    var d = readDisplay();
    var seats = readSeats();
    var counts = countSeats(seats);
    var st = isOpenNow(new Date(), h);

    // 営業バッジ
    if (statusEl && statusTxt) {
      if (d.showBadge) {
        statusEl.hidden = false;
        statusEl.setAttribute('data-status', st.state);
        statusTxt.textContent = st.label;
      } else {
        statusEl.hidden = true;
      }
    }

    // 空席バッジ — 営業中のみ表示（時間外/受付停止/本日終了/定休日は非表示）
    // 例外: 「満席の時もはっきり表示」(showWhenFull) が ON で実際に満席なら時間外でも表示
    if (seatsEl && seatsTxt) {
      var showByOpen     = st.open;
      var showByFullFlag = d.showWhenFull && counts.open === 0
                        && st.state !== 'stopped' && st.state !== 'ended';
      var shouldShow = d.showSeats && (showByOpen || showByFullFlag);
      if (shouldShow) {
        seatsEl.hidden = false;
        if (counts.open === 0) {
          seatsEl.setAttribute('data-state', 'full');
          seatsTxt.textContent = '本日 満席';
        } else {
          seatsEl.removeAttribute('data-state');
          if (d.showSeatsDetail) {
            seatsTxt.textContent = 'BOX 残' + counts.boxOpen + ' / カウンター 残' + counts.counterOpen;
          } else {
            seatsTxt.textContent = '空席 残り ' + counts.open + ' 席';
          }
        }
      } else {
        seatsEl.hidden = true;
      }
    }
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
    if (e.key === NEWS_KEY || e.key === 'manoha-cache:news') refreshNewsLocal();
    if (e.key === HOURS_KEY || e.key === DISPLAY_KEY || e.key === SEATS_KEY
        || e.key === 'manoha-cache:hours' || e.key === 'manoha-cache:display' || e.key === 'manoha-cache:seats') {
      refresh();
    }
  });

  // ---- INIT ----
  refreshNewsLocal();              // キャッシュ即時表示
  refreshNewsFromApi();             // 裏で API から最新取得
  refresh();
  refreshFromApi();                 // 裏で API から hours/display/seats も取得
  setInterval(refresh, 60 * 1000);          // 1分ごと営業判定更新（キャッシュ参照）
  setInterval(refreshNewsFromApi, 60 * 1000);
  setInterval(refreshFromApi, 30 * 1000);   // 30秒ごとに API から最新取得
})();
