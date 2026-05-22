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
    } catch (_) { newsEl.hidden = true; }
  }

  // ---- データ読込 ----
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function readHours() {
    try {
      var v = JSON.parse(localStorage.getItem(HOURS_KEY) || 'null');
      var merged = Object.assign({}, DEFAULT_HOURS, v || {});
      // 日付が変わったら受付状態を通常に戻す（公開ページ側でも反映）
      if (merged.reception !== 'normal' && merged.receptionDate !== todayStr()) {
        merged.reception = 'normal';
      }
      return merged;
    } catch (_) { return Object.assign({}, DEFAULT_HOURS); }
  }
  function readDisplay() {
    try {
      var v = JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null');
      return Object.assign({}, DEFAULT_DISPLAY, v || {});
    } catch (_) { return Object.assign({}, DEFAULT_DISPLAY); }
  }
  function readSeats() {
    try {
      var v = JSON.parse(localStorage.getItem(SEATS_KEY) || 'null');
      return v || {};
    } catch (_) { return {}; }
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

    // 空席バッジ
    if (seatsEl && seatsTxt) {
      var shouldShow = d.showSeats && (st.open || (d.showWhenFull && st.state === 'closed' && counts.open === 0));
      // 営業時間外なら基本非表示。ただし「満席表示する」が ON で実際に満席なら出す
      if (!st.open && !(d.showWhenFull && counts.open === 0)) shouldShow = false;
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
    if (e.key === NEWS_KEY) refreshNews();
    if (e.key === HOURS_KEY || e.key === DISPLAY_KEY || e.key === SEATS_KEY) refresh();
  });

  // ---- INIT ----
  refreshNews();
  refresh();
  setInterval(refresh, 60 * 1000);  // 1分ごと営業判定更新
})();
