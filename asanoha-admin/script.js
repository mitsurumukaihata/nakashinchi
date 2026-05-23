/* ===========================================
   麻ノ葉 — 管理ダッシュボード
   - 時計・曜日表示
   - 営業時間判定 (17:00 - 25:00)
   - 席管理の現在状態を localStorage から読み込み
   - 準備中カードはモーダルで対応予定を表示
   =========================================== */
(function () {
  'use strict';

  // ---------- 来店通知 待機数 + 新着検出 ----------
  var _arrPrevCount = -1;
  var _arrAudio = null;
  function ensureAudio() {
    if (!_arrAudio) {
      try { _arrAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    return _arrAudio;
  }
  document.addEventListener('click', function () {
    var a = ensureAudio(); if (a && a.state === 'suspended') a.resume();
  }, { once: true });
  function dingAdmin() {
    var ac = ensureAudio(); if (!ac) return;
    var now = ac.currentTime;
    [880, 1320].forEach(function (freq, i) {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain).connect(ac.destination);
      var start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }
  function flashArrivalsCard(n) {
    var card = document.querySelector('a[href="../asanoha-arrivals/"]');
    if (!card) return;
    card.style.boxShadow = '0 0 0 0 rgba(200,16,46,0.6)';
    card.animate(
      [
        { boxShadow: '0 0 0 0 rgba(200,16,46,0.55)' },
        { boxShadow: '0 0 0 18px rgba(200,16,46,0)' }
      ],
      { duration: 1400, iterations: 2, easing: 'ease-out' }
    );
  }
  async function updateArrivalsCount() {
    var info = document.getElementById('card-arrivals-info');
    if (!info || !window.nakashinchiApi || !window.nakashinchiApi.isOnline()) return;
    var token = window.nakashinchiApi.getToken();
    if (!token) return;
    try {
      var r = await fetch(window.NAKASHINCHI_API + '/api/store/asanoha/arrivals?status=pending', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!r.ok) return;
      var data = await r.json();
      var n = (data.arrivals || []).length;
      // 新着検出 (初回ロード時は通知しない)
      if (_arrPrevCount >= 0 && n > _arrPrevCount) {
        dingAdmin();
        flashArrivalsCard(n);
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('麻ノ葉 — 来店通知', {
              body: 'あと ' + (n - _arrPrevCount) + ' 件のお客様が向かっています',
              icon: '../icons/icon-192.png'
            });
          }
        } catch (_) {}
      }
      _arrPrevCount = n;
      info.textContent = n === 0 ? '待機 0 件' : n + ' 件 待機中';
      if (n > 0) info.style.color = 'var(--accent)';
      else       info.style.color = '';
    } catch (_) {}
  }
  // ブラウザ通知の許可を最初の操作で要求
  document.addEventListener('click', function () {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(function(){});
    }
  }, { once: true });
  setTimeout(updateArrivalsCount, 500);
  setInterval(updateArrivalsCount, 5000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updateArrivalsCount();
  });

  // ストレージキー
  var SEATS_STORAGE_KEY = 'manoha-seats-v1';
  var HOURS_STORAGE_KEY = 'manoha-hours-v1';
  var NEWS_STORAGE_KEY  = 'manoha-news-v1';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var TOTAL_SEATS = 11;
  var DEFAULT_HOURS = { open: '17:00', close: '01:00', crossDay: true, closedDays: [], reception: 'normal', receptionDate: '' };

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
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next    = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveTheme(next);
    });
  }
  applyTheme(loadTheme());

  // 各「準備中」カードのモーダル内容（店主向けの言葉で）
  var FEATURE_PLANS = {
    reservation: {
      title: '予約・お問い合わせ',
      desc:  '電話やLINEで入った予約を、ひとつの画面で一覧管理できる画面です。',
      plan:  '日付・時間・人数・席・備考をまとめて管理でき、当日の予定が一目でわかるようになります。前日にお客様へリマインドを自動でお送りする機能や、ホームページから直接ご予約をいただける窓口もご用意する予定です。'
    },
    menu: {
      title: 'お品書き',
      desc:  'お料理・お酒のメニューを写真付きで登録・編集できる画面です。',
      plan:  'カテゴリー（前菜・お酒・〆 など）ごとに料理を登録でき、写真・価格・「本日 品切れ」「期間限定」といったタグも付けられます。トップページのお品書き欄に、書き換えたその場で反映されます。'
    },
    photos: {
      title: '写真ギャラリー',
      desc:  '店内・お料理・季節の装飾の写真を、いつでも追加・差し替えできる画面です。',
      plan:  'スマホで撮った写真をそのままアップロードでき、並び順も自由に変えられます。トップページの背景画像も、季節や雰囲気に合わせて切り替えられるようになります。'
    },
    info: {
      title: '店舗情報',
      desc:  '住所・電話番号・地図・SNSリンクなど、お店の基本情報を編集できる画面です。',
      plan:  '電話番号や定休日を変えるとき、ここを書き換えるだけでトップページ・お問い合わせ画面の全部に自動で反映されます。Instagram・LINE・食べログ などの外部リンクも一括管理できます。'
    },
    stats: {
      title: 'お店の数字',
      desc:  '来店動向・席の使われ方を「見える化」する画面です。',
      plan:  '曜日ごとのピーク時間、月ごとの来店数、よく出る席や残りやすい席などを、自動で記録してグラフにします。仕入れの量や、人手の入れ方を判断する材料、調子の良い日と悪い日の比較に使えます。'
    },
    settings: {
      title: '設定',
      desc:  'スタッフ・通知・画面表示などの細かい設定を行う画面です。',
      plan:  'スタッフのアカウント追加（誰がどの画面まで触れるか）、お知らせの通知方法（LINE・メール）、お店が暗いときの夜モードなど、お店ごとの運用に合わせた設定ができます。'
    }
  };

  // ---------- 時計・日付 ----------
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];
  var timeEl = document.getElementById('time');
  var dateEl = document.getElementById('date');
  function tickTime() {
    var d  = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    timeEl.textContent = hh + ':' + mm;
    dateEl.textContent = (d.getMonth() + 1) + '月 ' + d.getDate() + '日 (' + DOW[d.getDay()] + ')';
    updateOpenStatus(d);
  }

  // ---------- 営業時間 設定読込 & 状態判定 ----------
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function readHours() {
    // 新キャッシュ (API 経由) → 旧 key
    try {
      var c = JSON.parse(localStorage.getItem('store-cache:asanoha:hours') || 'null');
      if (c && c.value) {
        var m1 = Object.assign({}, DEFAULT_HOURS, c.value);
        if (m1.reception !== 'normal' && m1.receptionDate !== todayStr()) m1.reception = 'normal';
        return m1;
      }
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem(HOURS_STORAGE_KEY) || 'null');
      var m = Object.assign({}, DEFAULT_HOURS, v || {});
      if (m.reception !== 'normal' && m.receptionDate !== todayStr()) m.reception = 'normal';
      return m;
    } catch (_) { return Object.assign({}, DEFAULT_HOURS); }
  }
  async function refreshFromApi() {
    if (!window.nakashinchiApi || !window.nakashinchiApi.isOnline()) return;
    try { await window.nakashinchiApi.fetchAll(); } catch (_) {}
  }
  function isOpenNow(d, hours) {
    if (hours.reception === 'closed')  return { open: false, label: '本日終了' };
    if (hours.reception === 'stopped') return { open: false, label: '受付停止中' };
    var dow = d.getDay();
    if ((hours.closedDays || []).indexOf(dow) !== -1) return { open: false, label: '本日 定休日' };
    var op = hours.open.split(':'),  oh = +op[0], om = +op[1];
    var cl = hours.close.split(':'), ch = +cl[0], cm = +cl[1];
    var now = d.getHours() * 60 + d.getMinutes();
    var openM = oh * 60 + om;
    var closeM = ch * 60 + cm;
    var open;
    if (hours.crossDay) open = now >= openM || now < closeM;
    else                open = now >= openM && now < closeM;
    return { open: open, label: open ? '営業中' : '営業時間外' };
  }

  var openDot      = document.getElementById('open-dot');
  var openSt       = document.getElementById('open-status');
  var cardHoursInfo = document.getElementById('card-hours-info');
  function updateOpenStatus(d) {
    var hours = readHours();
    var st    = isOpenNow(d, hours);
    openSt.textContent = st.label;
    openDot.classList.toggle('is-open',   st.open);
    openDot.classList.toggle('is-closed', !st.open);
    if (cardHoursInfo) {
      cardHoursInfo.textContent = hours.reception !== 'normal'
        ? (hours.reception === 'closed' ? '本日終了' : '受付停止中')
        : hours.open + ' — ' + hours.close;
    }
  }

  // ---------- お知らせ ----------
  var cardNewsInfo = document.getElementById('card-news-info');
  function readCacheOrLegacy(cacheKey, legacyKey) {
    try {
      var c = JSON.parse(localStorage.getItem('store-cache:asanoha:' + cacheKey) || 'null');
      if (c && c.value) return c.value;
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem(legacyKey) || 'null');
      if (v) return v;
    } catch (_) {}
    return null;
  }
  function refreshNews() {
    if (!cardNewsInfo) return;
    var data = readCacheOrLegacy('news', NEWS_STORAGE_KEY);
    if (data && data.message) {
      var t = data.message;
      cardNewsInfo.textContent = t.length > 18 ? t.substring(0, 18) + '…' : t;
    } else {
      cardNewsInfo.textContent = '未投稿';
    }
  }

  // ---------- 席管理の状態を読込 ----------
  var seatsOpen     = document.getElementById('seats-open');
  var seatsTaken    = document.getElementById('seats-taken');
  var cardSeatsInfo = document.getElementById('card-seats-info');
  function refreshSeats() {
    var data = readCacheOrLegacy('seats', SEATS_STORAGE_KEY) || {};
    var taken = 0;
    Object.keys(data).forEach(function (k) { if (data[k]) taken++; });
    var open = TOTAL_SEATS - taken;
    seatsOpen.textContent  = open;
    seatsTaken.textContent = taken;
    cardSeatsInfo.textContent = '空席 ' + open + ' / 着 ' + taken;
  }

  // ---------- 「準備中」カードのモーダル ----------
  var modal    = document.getElementById('modal');
  var modalNum   = document.getElementById('modal-num');
  var modalTitle = document.getElementById('modal-title');
  var modalDesc  = document.getElementById('modal-desc');
  var modalPlan  = document.getElementById('modal-plan');
  function openModal(featureId, num) {
    var info = FEATURE_PLANS[featureId];
    if (!info) return;
    modalNum.textContent   = String(num).padStart(2, '0');
    modalTitle.textContent = info.title;
    modalDesc.textContent  = info.desc;
    modalPlan.textContent  = info.plan;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  document.querySelectorAll('.card--coming').forEach(function (card) {
    card.addEventListener('click', function () {
      var feature = card.dataset.feature;
      var num     = card.querySelector('.card__num').textContent;
      openModal(feature, num);
    });
  });
  modal.addEventListener('click', function (e) {
    if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // ---------- 初期化 ----------
  tickTime();
  refreshSeats();
  refreshNews();
  setInterval(tickTime,    30 * 1000);
  setInterval(refreshSeats,  5 * 1000);
  setInterval(refreshNews, 10 * 1000);

  // API から最新を取得 (バックグラウンド)
  refreshFromApi();
  setInterval(refreshFromApi, 20 * 1000);

  // 別タブ更新の同期
  window.addEventListener('storage', function (e) {
    if (e.key === SEATS_STORAGE_KEY || e.key === 'store-cache:asanoha:seats')   refreshSeats();
    else if (e.key === HOURS_STORAGE_KEY || e.key === 'store-cache:asanoha:hours') { tickTime(); refreshSeats(); }
    else if (e.key === NEWS_STORAGE_KEY  || e.key === 'store-cache:asanoha:news')  refreshNews();
    else if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });
})();
