/* ===========================================
   中新地 飲食店ガイド — 共通設定
   ----------------------------------------
   API URL とアクティブな STORE_ID を設定。
   STORE_ID は URL から自動判定（asanoha-*, ivory-* など）。
   個別ページで window.NAKASHINCHI_STORE_ID を override 可能。
   =========================================== */

window.NAKASHINCHI_API = 'https://nakashinchi-api.33322666666mm.workers.dev';

// 店舗マスタ（landing 等から参照可能）
window.NAKASHINCHI_STORES = [
  {
    id:       'asanoha',
    name:     '麻ノ葉',
    yomi:     'まのは',
    romaji:   'MANOHA',
    address:  '広島市中新地',
    tel:      '',
    instagram:'',
    lat: 34.3925, lng: 132.4541,
    hours:    { open: '17:00', close: '01:00', crossDay: true, closedDays: [] },
    seats:    { box: 5, counter: 6, total: 11 },
    heroUrl:  'asanoha-hero-bg/',
    adminUrl: 'asanoha-admin/'
  },
  {
    id:       'ivory',
    name:     'Innocent Base Ivory',
    short:    'Ivory',
    yomi:     'アイボリー',
    romaji:   'IVORY',
    address:  '広島市中区流川町4-5 東邦ビル1 5F',
    tel:      '082-567-4403',
    instagram:'ivory0604',
    lat: 34.39163, lng: 132.46220,
    hours:    { open: '21:00', close: '05:00', crossDay: true, closedDays: [2] },
    seats:    null,  // Gun Arena + Bar (席管理は今後検討)
    heroUrl:  'ivory-hero-bg/',
    adminUrl: null   // 管理画面は今後対応
  }
];

// STORE_ID の自動判定 (URL パスから)
window.NAKASHINCHI_STORE_ID = (function () {
  var path = window.location.pathname;
  var ids = (window.NAKASHINCHI_STORES || []).map(function (s) { return s.id; });
  for (var i = 0; i < ids.length; i++) {
    if (path.indexOf('/' + ids[i] + '-') !== -1) return ids[i];
  }
  return 'asanoha';  // デフォルト
})();
