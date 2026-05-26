// 全 HTML/CSS ファイルの フォントウェイトを底上げ
// - Google Fonts URL に 700 / 800 ウェイトを含める
// - 各ファイルに body { font-weight: 500 } の底上げルールを追加
// - 明朝体は細いと夜の店で見辛い (酔っ払い対応)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const HTML_FILES = [
  'index.html',
  'account/index.html',
  'asanoha-admin/index.html',
  'asanoha-arrivals/index.html',
  'asanoha-hero-bg/index.html',
  'asanoha-hours/index.html',
  'asanoha-info/index.html',
  'asanoha-news/index.html',
  'asanoha-seats/index.html',
  'ivory-hero-bg/index.html',
  'login/index.html',
  'notify-subscribe/index.html',
  'auth/line-callback/index.html',
  'auth/test-login/index.html'
];

const CSS_FILES = [
  'asanoha-admin/style.css',
  'asanoha-arrivals/style.css',   // 存在しない場合は skip
  'asanoha-hours/style.css',
  'asanoha-info/style.css',
  'asanoha-news/style.css',
  'asanoha-seats/style.css',
  'asanoha-hero-bg/style.css',
  'ivory-hero-bg/style.css',
  'login/style.css',
  'pin-modal.css'
];

// 統一する Google Fonts URL (heavy weights)
const UNIFIED_FONT_URL = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@400;500;600;700;800&family=Noto+Serif+JP:wght@400;500;600;700;800;900&family=Yuji+Syuku&family=Cormorant+Garamond:wght@400;500;600;700&family=Bebas+Neue&display=swap';

// 追加する CSS スニペット (body font-weight bump)
const BOOST_RULE = `
/* ===== 全ページ共通 フォントウェイト底上げ (酔客向け視認性) ===== */
body { font-weight: 500; }
h1, h2, h3, h4 { font-weight: 600; }
strong, b { font-weight: 700; }
input, button, select, textarea { font-weight: 500; }
.fav-card__name, .genre-card__name, .store-card__name,
.brand, .hero__brand, .topbar__brand, .topbar__brand-name { font-weight: 500; }
`;

let touched = 0;

// HTML: link href の Google Fonts URL を統一 + style ブロックに boost を追加
for (const rel of HTML_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { console.log('skip (not found):', rel); continue; }
  let c = fs.readFileSync(fp, 'utf8');
  const before = c;

  // 既存の Google Fonts URL を統一版に置換
  c = c.replace(
    /<link\s+href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"\s+rel="stylesheet"\s*\/?>/g,
    `<link href="${UNIFIED_FONT_URL}" rel="stylesheet">`
  );

  // boost CSS をどこかに注入する
  // (a) <style>...</style> がある HTML → 末尾の </style> 直前に追加
  // (b) ない場合 → </head> 直前に <style> として注入
  if (!c.includes('全ページ共通 フォントウェイト底上げ')) {
    if (/<\/style>/.test(c)) {
      // 最初の </style> の直前に挿入
      c = c.replace(/<\/style>/, `${BOOST_RULE}\n</style>`);
    } else if (/<\/head>/.test(c)) {
      c = c.replace(/<\/head>/, `<style>${BOOST_RULE}</style>\n</head>`);
    }
  }

  if (c !== before) {
    fs.writeFileSync(fp, c, 'utf8');
    console.log('updated:', rel);
    touched++;
  } else {
    console.log('unchanged:', rel);
  }
}

// CSS: boost を末尾に追加
for (const rel of CSS_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { console.log('skip (not found):', rel); continue; }
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('全ページ共通 フォントウェイト底上げ')) {
    console.log('unchanged (already has boost):', rel);
    continue;
  }
  c += '\n' + BOOST_RULE + '\n';
  fs.writeFileSync(fp, c, 'utf8');
  console.log('updated:', rel);
  touched++;
}

console.log(`\nDone. ${touched} files updated.`);
