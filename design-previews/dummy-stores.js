/* ===========================================
   デザインプレビュー用 ダミー店舗 15件
   - 実在の麻ノ葉/Ivory + 架空13店
   - 写真は Unsplash (バー/居酒屋系)、失敗時 picsum フォールバック
   - status: available(空席あり) / full(満席) / closed(時間外) / stopped(受付停止)
   =========================================== */
window.DUMMY_STORES = [
  {
    id:'asanoha', name:'麻ノ葉', nameHtml:'麻<span class="ac">ノ</span>葉', yomi:'まのは', romaji:'MANOHA',
    genres:['snack','bar'], area:'中新地', open:'17:00', close:'25:00', closedNote:'',
    status:'available', seats:'残り 7 / 11 席', copy:'縁起の文様、語らいの席。',
    img:'../asanoha-hero-bg/public/images/hero-japanese.jpg'
  },
  {
    id:'ivory', name:'Innocent Base Ivory', nameHtml:'Innocent Base Ivory', yomi:'アイボリー', romaji:'IVORY',
    genres:['bar','darts'], area:'流川', open:'21:00', close:'05:00', closedNote:'火曜定休',
    status:'available', seats:'カウンター空席あり', copy:'Bar & Gun Arena. 撃つ夜、注ぐ夜。',
    img:'../ivory-hero-bg/public/images/hero-ivory.jpg'
  },
  {
    id:'tsukuyomi', name:'BAR 月読', nameHtml:'BAR 月読', yomi:'つくよみ', romaji:'TSUKUYOMI',
    genres:['bar'], area:'薬研堀', open:'19:00', close:'03:00', closedNote:'',
    status:'available', seats:'残り 4 席', copy:'月明かりとシングルモルト。',
    img:'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'akari', name:'スナック 灯り', nameHtml:'スナック 灯り', yomi:'あかり', romaji:'AKARI',
    genres:['snack'], area:'中新地', open:'18:00', close:'24:00', closedNote:'',
    status:'full', seats:'満席', copy:'ママの唄と、温かい灯り。',
    img:'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'rasen', name:'BAR 螺旋', nameHtml:'BAR 螺旋', yomi:'らせん', romaji:'RASEN',
    genres:['bar'], area:'流川', open:'20:00', close:'04:00', closedNote:'',
    status:'available', seats:'残り 6 席', copy:'静かに巡る、夜の螺旋階段。',
    img:'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'tsubaki', name:'ラウンジ 椿', nameHtml:'ラウンジ 椿', yomi:'つばき', romaji:'TSUBAKI',
    genres:['lounge'], area:'流川', open:'20:00', close:'02:00', closedNote:'',
    status:'available', seats:'ボックス空席あり', copy:'深紅の椿、上質なひととき。',
    img:'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'kujira', name:'立ち呑み 鯨', nameHtml:'立ち呑み 鯨', yomi:'くじら', romaji:'KUJIRA',
    genres:['standing'], area:'薬研堀', open:'16:00', close:'23:00', closedNote:'',
    status:'available', seats:'立ち呑みスペースあり', copy:'一杯ひっかけて、また次へ。',
    img:'https://images.unsplash.com/photo-1574096079513-d8259312b785?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'bullseye', name:'DARTS & BAR Bullseye', nameHtml:'DARTS & BAR Bullseye', yomi:'ブルズアイ', romaji:'BULLSEYE',
    genres:['darts','bar'], area:'銀山町', open:'19:00', close:'05:00', closedNote:'',
    status:'available', seats:'マシン 2 台 空き', copy:'狙え、ど真ん中。',
    img:'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'homura', name:'炭火 火群', nameHtml:'炭火 火群', yomi:'ほむら', romaji:'HOMURA',
    genres:['izakaya'], area:'中新地', open:'17:00', close:'24:00', closedNote:'',
    status:'available', seats:'残り 12 席', copy:'炭火の香り、串と地酒。',
    img:'https://images.unsplash.com/photo-1525268323446-0505b6fe7778?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'yasou', name:'BAR 夜想', nameHtml:'BAR 夜想', yomi:'やそう', romaji:'YASOU',
    genres:['bar'], area:'薬研堀', open:'20:00', close:'03:00', closedNote:'',
    status:'stopped', seats:'受付停止中', copy:'夜を想う、静寂のカウンター。',
    img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'miyabi', name:'スナック みやび', nameHtml:'スナック みやび', yomi:'みやび', romaji:'MIYABI',
    genres:['snack'], area:'流川', open:'18:30', close:'01:00', closedNote:'',
    status:'available', seats:'残り 3 席', copy:'雅な夜に、心ほどけて。',
    img:'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'verde', name:'Lounge Verde', nameHtml:'Lounge Verde', yomi:'ヴェルデ', romaji:'VERDE',
    genres:['lounge'], area:'流川', open:'20:00', close:'02:00', closedNote:'日曜定休',
    status:'closed', seats:'', copy:'緑のソファ、ゆるやかな時間。',
    img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'daikoku', name:'角打ち 大黒', nameHtml:'角打ち 大黒', yomi:'だいこく', romaji:'DAIKOKU',
    genres:['standing'], area:'中新地', open:'15:00', close:'22:00', closedNote:'',
    status:'closed', seats:'', copy:'酒屋の角で、一杯の幸せ。',
    img:'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'aria', name:'CLUB Aria', nameHtml:'CLUB Aria', yomi:'アリア', romaji:'ARIA',
    genres:['club','lounge'], area:'流川', open:'21:00', close:'05:00', closedNote:'',
    status:'available', seats:'VIP 席 空きあり', copy:'煌めく夜の主旋律。',
    img:'https://images.unsplash.com/photo-1485182708500-e8f1f318ba72?w=600&h=400&fit=crop&q=70'
  },
  {
    id:'ebisu', name:'酒場 ゑびす', nameHtml:'酒場 ゑびす', yomi:'えびす', romaji:'EBISU',
    genres:['izakaya'], area:'銀山町', open:'17:00', close:'23:30', closedNote:'',
    status:'available', seats:'残り 8 席', copy:'笑顔あふれる、福の酒場。',
    img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop&q=70'
  }
];

window.GENRE_LABELS = {
  bar:'バー', snack:'スナック', lounge:'ラウンジ', darts:'ダーツバー',
  izakaya:'居酒屋', standing:'スタンド', club:'クラブ'
};
window.GENRE_LABELS_EN = {
  bar:'BAR', snack:'SNACK', lounge:'LOUNGE', darts:'DARTS',
  izakaya:'IZAKAYA', standing:'STANDING', club:'CLUB'
};
window.STATUS_LABELS = {
  available:'営業中・空席あり', full:'営業中・満席', closed:'営業時間外', stopped:'受付停止中'
};
// 画像読込失敗時のフォールバック (picsum)
window.imgFallback = function (el, seed) {
  el.onerror = null;
  el.src = 'https://picsum.photos/seed/' + encodeURIComponent(seed) + '/600/400';
};
