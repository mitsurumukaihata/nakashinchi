/* ===========================================
   麻ノ葉 — Hero Section
   最小限のJSのみ:
   - タブが非表示のとき floater の animation を停止（バッテリ節約）
   =========================================== */
(function () {
  'use strict';

  var floaters = document.querySelectorAll('.floater');
  if (!floaters.length) return;

  document.addEventListener('visibilitychange', function () {
    var state = document.hidden ? 'paused' : 'running';
    for (var i = 0; i < floaters.length; i++) {
      floaters[i].style.animationPlayState = state;
    }
  });
})();
