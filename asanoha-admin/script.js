/* ===========================================
   麻ノ葉 — 管理ダッシュボード
   - 時計・曜日表示
   - 営業時間判定 (17:00 - 25:00)
   - 席管理の現在状態を localStorage から読み込み
   - 準備中カードはモーダルで対応予定を表示
   =========================================== */
(function () {
  'use strict';

  // 営業時間（後で設定画面と連動予定）
  var OPEN_HOUR  = 17;
  var CLOSE_HOUR = 25;  // 翌日 1:00 まで
  var SEATS_STORAGE_KEY = 'manoha-seats-v1';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var TOTAL_SEATS = 11;

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

  // 各「準備中」カードのモーダル内容
  var FEATURE_PLANS = {
    hours: {
      title: '営業時間・定休日',
      desc:  '通常の営業時間、定休日、貸切日、特別営業時間（GW・年末年始）を登録できる画面。設定値は公開ページのヒーロー・営業バッジに自動連動します。',
      plan:  'Phase 2: 簡易フォーム + localStorage で開始 → Cloudflare D1 に移行'
    },
    reservation: {
      title: '予約・お問い合わせ',
      desc:  '電話・LINE・公式サイトのフォームから入った予約を一元管理。日付・人数・テーブル指定・備考まで一覧で確認。前日リマインド送信も視野に。',
      plan:  'Phase 3: フォーム + Cloudflare D1 + LINE Messaging API 連携'
    },
    menu: {
      title: 'お品書き',
      desc:  '料理・お酒のメニュー登録。カテゴリー分け、写真添付、価格、品切れフラグ、ランチ／ディナーの出し分け。公開ページに自動反映。',
      plan:  'Phase 2: 構造化JSON + localStorage → Cloudflare R2 で画像保存'
    },
    news: {
      title: 'お知らせ・今日の一言',
      desc:  '本日の特別メニュー、貸切のお知らせ、店主の一言など、公開ページのトップに表示する短文の編集。一発で「今日のおすすめ」を変えられる軽さを目指す。',
      plan:  'Phase 2: 簡易テキストエディタ + 公開反映'
    },
    photos: {
      title: '写真ギャラリー',
      desc:  '店内・料理・季節の演出など写真の追加・差替え・並び替え。トップヒーローの背景候補も含めて管理。',
      plan:  'Phase 2: アップロード UI + Cloudflare R2 (画像ストレージ)'
    },
    info: {
      title: '店舗情報',
      desc:  '住所・電話番号・アクセス・地図・SNS リンクの編集。公開ページのフッター・問い合わせ画面に自動反映。',
      plan:  'Phase 2: フォーム編集 + 公開反映'
    },
    stats: {
      title: '統計・分析',
      desc:  '着席タイムスタンプから滞在時間・回転率・曜日別ピーク時間を可視化。月次レポートも自動生成。',
      plan:  'Phase 3: D1 にイベントログ蓄積 → グラフ可視化'
    },
    settings: {
      title: '設定',
      desc:  'スタッフのアカウント追加、パスワード変更、通知設定（LINE/メール）、テーマ切替（昼/夜モード）、データのエクスポート。',
      plan:  'Phase 3: 認証 + マルチ端末同期 (Cloudflare D1 + KV)'
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

  // ---------- 営業状態 ----------
  var openDot = document.getElementById('open-dot');
  var openSt  = document.getElementById('open-status');
  function updateOpenStatus(d) {
    var h = d.getHours();
    // 営業時間: 17:00 〜 翌1:00 (CLOSE_HOUR=25)
    var isOpen = (h >= OPEN_HOUR && h < 24) || (CLOSE_HOUR > 24 && h < (CLOSE_HOUR - 24));
    openSt.textContent  = isOpen ? '営業中' : '営業時間外';
    openDot.classList.toggle('is-open',   isOpen);
    openDot.classList.toggle('is-closed', !isOpen);
  }

  // ---------- 席管理の状態を読込 ----------
  var seatsOpen     = document.getElementById('seats-open');
  var seatsTaken    = document.getElementById('seats-taken');
  var cardSeatsInfo = document.getElementById('card-seats-info');
  function refreshSeats() {
    var taken = 0;
    try {
      var data = JSON.parse(localStorage.getItem(SEATS_STORAGE_KEY) || '{}') || {};
      Object.keys(data).forEach(function (k) { if (data[k]) taken++; });
    } catch (_) {}
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
  setInterval(tickTime,   30 * 1000);
  setInterval(refreshSeats, 5 * 1000);

  // 別タブで席 / テーマ を更新したら反映
  window.addEventListener('storage', function (e) {
    if (e.key === SEATS_STORAGE_KEY) refreshSeats();
    else if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });
})();
