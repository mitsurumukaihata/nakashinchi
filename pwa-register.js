/* ===========================================
   PWA — Service Worker 登録 (全ページから読み込まれる)
   - sw.js は サイトルートに置き、scope を全体に広げる
   - サブページ (asanoha-news 等) から呼び出されても自分の場所から
     ルートに向けて相対パスで sw.js を見つけにいく
   =========================================== */
(function () {
  if (!('serviceWorker' in navigator)) return;
  // file:// だと SW 登録不可
  if (location.protocol === 'file:') return;

  function resolveSwUrl() {
    // この script タグ自身の src から sw.js の URL を組み立てる
    var here = document.currentScript && document.currentScript.src;
    if (!here) {
      var nodes = document.querySelectorAll('script[src]');
      for (var i = 0; i < nodes.length; i++) {
        if (/pwa-register\.js/.test(nodes[i].src)) { here = nodes[i].src; break; }
      }
    }
    if (here) return here.replace(/pwa-register\.js[^\/]*$/, 'sw.js');
    return './sw.js';
  }

  window.addEventListener('load', function () {
    try {
      var swUrl = resolveSwUrl();
      // scope を自動推定 (sw.js が置いてあるディレクトリ)
      var scope = swUrl.replace(/sw\.js[^\/]*$/, '');
      navigator.serviceWorker
        .register(swUrl, { scope: scope })
        .then(function (reg) {
          // 新バージョンが見つかったら静かに更新
          if (reg && reg.update) {
            try { reg.update(); } catch (_) {}
          }
        })
        .catch(function () { /* 静かに失敗 */ });
    } catch (_) {}
  });
})();
