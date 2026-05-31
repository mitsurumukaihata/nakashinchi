/* ===========================================
   中新地 飲食店ガイド — 共通設定
   ----------------------------------------
   API URL とアクティブな STORE_ID を設定。
   STORE_ID は URL から自動判定（asanoha-*, ivory-* など）。
   個別ページで window.NAKASHINCHI_STORE_ID を override 可能。
   =========================================== */

window.NAKASHINCHI_API = 'https://nakashinchi-api.33322666666mm.workers.dev';

// LINE Login Channel ID (公開情報、OAuth URL に含まれる)
window.NAKASHINCHI_LINE_CHANNEL_ID = '2010172690';

// LINE OAuth コールバック URL (LINE Developer Console と一致させる)
window.NAKASHINCHI_LINE_CALLBACK = window.location.origin + '/nakashinchi/auth/line-callback/';

// LINE 通知ボットの Basic ID (@xxxxxxx 形式)
// LINE Official Account Manager → アカウント設定 → 基本情報 → ベーシックID
// (友だち追加 QR 用。設定しなくても登録は可能、QR だけ手動案内になる)
window.NAKASHINCHI_BOT_BASIC_ID = '';  // 例: '@123abcde'

// 店舗マスタ（landing 等から参照可能）
// categories: ['bar', 'lounge', 'standing', 'darts', 'snack', 'izakaya', 'club', 'other'] から複数選択可
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
    categories: ['snack', 'bar'],
    area:     '中新地',
    imageUrl: 'asanoha-hero-bg/public/images/hero-japanese.jpg',
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
    categories: ['bar', 'darts'],   // Bar + Gun Arena
    area:     '流川',
    imageUrl: 'ivory-hero-bg/public/images/hero-ivory.jpg',
    heroUrl:  'ivory-hero-bg/',
    adminUrl: null   // 管理画面は今後対応
  },

  /* ==========================================================
     ↓↓↓ デモ用テスト店舗 13件 (demo:true) ↓↓↓
     本番公開前に この demo:true の店を一括削除すること。
     写真は Unsplash (バー系)、heroUrl は未設定 (カードは '#')
     ========================================================== */
  { demo:true, id:'tsukuyomi', name:'BAR 月読', yomi:'つくよみ', romaji:'TSUKUYOMI',
    lat:34.3918, lng:132.4648, hours:{open:'19:00',close:'03:00',crossDay:true,closedDays:[]},
    seats:null, categories:['bar'], area:'薬研堀',
    imageUrl:'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'akari', name:'スナック 灯り', yomi:'あかり', romaji:'AKARI',
    lat:34.3929, lng:132.4538, hours:{open:'18:00',close:'00:00',crossDay:true,closedDays:[]},
    seats:null, categories:['snack'], area:'中新地',
    imageUrl:'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'rasen', name:'BAR 螺旋', yomi:'らせん', romaji:'RASEN',
    lat:34.3912, lng:132.4625, hours:{open:'20:00',close:'04:00',crossDay:true,closedDays:[]},
    seats:null, categories:['bar'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'tsubaki', name:'ラウンジ 椿', yomi:'つばき', romaji:'TSUBAKI',
    lat:34.3909, lng:132.4631, hours:{open:'20:00',close:'02:00',crossDay:true,closedDays:[]},
    seats:null, categories:['lounge'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'kujira', name:'立ち呑み 鯨', yomi:'くじら', romaji:'KUJIRA',
    lat:34.3922, lng:132.4641, hours:{open:'16:00',close:'23:00',crossDay:false,closedDays:[]},
    seats:null, categories:['standing'], area:'薬研堀',
    imageUrl:'https://images.unsplash.com/photo-1574096079513-d8259312b785?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'bullseye', name:'DARTS & BAR Bullseye', short:'Bullseye', yomi:'ブルズアイ', romaji:'BULLSEYE',
    lat:34.3935, lng:132.4612, hours:{open:'19:00',close:'05:00',crossDay:true,closedDays:[]},
    seats:null, categories:['darts','bar'], area:'銀山町',
    imageUrl:'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'homura', name:'炭火 火群', yomi:'ほむら', romaji:'HOMURA',
    lat:34.3927, lng:132.4533, hours:{open:'17:00',close:'00:00',crossDay:true,closedDays:[]},
    seats:null, categories:['izakaya'], area:'中新地',
    imageUrl:'https://images.unsplash.com/photo-1525268323446-0505b6fe7778?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'yasou', name:'BAR 夜想', yomi:'やそう', romaji:'YASOU',
    lat:34.3916, lng:132.4652, hours:{open:'20:00',close:'03:00',crossDay:true,closedDays:[]},
    seats:null, categories:['bar'], area:'薬研堀',
    imageUrl:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'miyabi', name:'スナック みやび', yomi:'みやび', romaji:'MIYABI',
    lat:34.3911, lng:132.4628, hours:{open:'18:30',close:'01:00',crossDay:true,closedDays:[]},
    seats:null, categories:['snack'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'verde', name:'Lounge Verde', short:'Verde', yomi:'ヴェルデ', romaji:'VERDE',
    lat:34.3908, lng:132.4634, hours:{open:'20:00',close:'02:00',crossDay:true,closedDays:[0]},
    seats:null, categories:['lounge'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'daikoku', name:'角打ち 大黒', yomi:'だいこく', romaji:'DAIKOKU',
    lat:34.3930, lng:132.4536, hours:{open:'15:00',close:'22:00',crossDay:false,closedDays:[]},
    seats:null, categories:['standing'], area:'中新地',
    imageUrl:'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'aria', name:'CLUB Aria', short:'Aria', yomi:'アリア', romaji:'ARIA',
    lat:34.3907, lng:132.4637, hours:{open:'21:00',close:'05:00',crossDay:true,closedDays:[]},
    seats:null, categories:['club','lounge'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1485182708500-e8f1f318ba72?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'ebisu', name:'酒場 ゑびす', yomi:'えびす', romaji:'EBISU',
    lat:34.3937, lng:132.4615, hours:{open:'17:00',close:'23:30',crossDay:false,closedDays:[]},
    seats:null, categories:['izakaya'], area:'銀山町',
    imageUrl:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop&q=70', heroUrl:'' },

  /* キャバクラ デモ 4件 */
  { demo:true, id:'rin', name:'CLUB 凛', short:'凛', yomi:'りん', romaji:'RIN',
    lat:34.3905, lng:132.4640, hours:{open:'20:00',close:'01:00',crossDay:true,closedDays:[]},
    seats:null, categories:['cabaret'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'oiran', name:'CLUB 花魁', short:'花魁', yomi:'おいらん', romaji:'OIRAN',
    lat:34.3903, lng:132.4644, hours:{open:'20:00',close:'02:00',crossDay:true,closedDays:[]},
    seats:null, categories:['cabaret'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'diamond', name:'Club Diamond', short:'Diamond', yomi:'ダイヤモンド', romaji:'DIAMOND',
    lat:34.3906, lng:132.4646, hours:{open:'19:00',close:'01:00',crossDay:true,closedDays:[]},
    seats:null, categories:['cabaret','lounge'], area:'流川',
    imageUrl:'https://images.unsplash.com/photo-1574391884720-bbc049ec09ad?w=600&h=400&fit=crop&q=70', heroUrl:'' },
  { demo:true, id:'mai', name:'CLUB 舞', short:'舞', yomi:'まい', romaji:'MAI',
    lat:34.3919, lng:132.4655, hours:{open:'20:00',close:'00:00',crossDay:true,closedDays:[0]},
    seats:null, categories:['cabaret'], area:'薬研堀',
    imageUrl:'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&h=400&fit=crop&q=70', heroUrl:'' }
];

// ジャンル定義 (タブ表示順 + ラベル)
window.NAKASHINCHI_CATEGORIES = [
  { id: 'all',      label: '全て',         romaji: 'ALL' },
  { id: 'bar',      label: 'バー',         romaji: 'BAR' },
  { id: 'lounge',   label: 'ラウンジ',     romaji: 'LOUNGE' },
  { id: 'standing', label: 'スタンド',     romaji: 'STANDING' },
  { id: 'darts',    label: 'ダーツバー',   romaji: 'DARTS' },
  { id: 'snack',    label: 'スナック',     romaji: 'SNACK' },
  { id: 'izakaya',  label: '居酒屋',       romaji: 'IZAKAYA' },
  { id: 'club',     label: 'クラブ',       romaji: 'CLUB' },
  { id: 'cabaret',  label: 'キャバクラ',   romaji: 'CABARET' },
  { id: 'other',    label: 'その他',       romaji: 'OTHER' }
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
