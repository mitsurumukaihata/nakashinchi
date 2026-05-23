/* ===========================================
   中新地 — 店舗管理 ログイン
   - 試験段階：認証ロジックは未実装。スキップで bypass
   - 本格運用時は D1 の stores テーブルに credentials を持たせて検証
   =========================================== */
(function () {
  'use strict';

  var STORE_ADMIN_URL = {
    asanoha: '../asanoha-admin/',
    ivory:   '../ivory-admin/'  // 未実装。フォールバックで asanoha 経由
  };
  var LAST_STORE_KEY = 'last-admin-store';

  var form     = document.getElementById('login-form');
  var storeSel = document.getElementById('store');
  var emailEl  = document.getElementById('email');
  var passEl   = document.getElementById('password');
  var rememberEl = document.getElementById('remember');
  var loginBtn = document.getElementById('login-btn');
  var skipBtn  = document.getElementById('skip-btn');
  var errorEl  = document.getElementById('form-error');
  var forgotLink = document.getElementById('forgot');
  var toast    = document.getElementById('toast');

  // 直前に選んでいた店舗を復元
  try {
    var last = localStorage.getItem(LAST_STORE_KEY);
    if (last) storeSel.value = last;
  } catch (_) {}

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function clearError() { errorEl.hidden = true; }

  function showToast(msg, durMs) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, durMs || 2200);
  }

  function rememberStore(id) {
    try { localStorage.setItem(LAST_STORE_KEY, id); } catch (_) {}
  }

  function navigateTo(storeId) {
    var url = STORE_ADMIN_URL[storeId];
    if (!url) {
      // 未実装ストアの場合の暫定処理
      showError('「' + storeId + '」の管理画面はまだ準備中です。準備でき次第ご案内します。');
      return;
    }
    rememberStore(storeId);
    window.location.href = url;
  }

  // ----- ログイン処理 (試験段階：実認証なし、入力チェックのみ) -----
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    var storeId = storeSel.value;
    var email   = (emailEl.value || '').trim();
    var pass    = (passEl.value || '').trim();
    if (!storeId) { showError('店舗を選択してください'); return; }
    if (!email)   { showError('メールアドレスを入力してください'); return; }
    if (!pass)    { showError('パスワードを入力してください'); return; }

    // 試験段階：実際の認証は行わずスキップと同じ動作
    loginBtn.disabled = true;
    loginBtn.textContent = 'ログイン中…';
    setTimeout(function () {
      showToast('試験段階のため、入力チェックのみで進めます');
      navigateTo(storeId);
    }, 500);
  });

  // ----- スキップ -----
  skipBtn.addEventListener('click', function () {
    clearError();
    var storeId = storeSel.value;
    if (!storeId) {
      showError('店舗を選択してください（スキップでも店舗の指定は必要です）');
      storeSel.focus();
      return;
    }
    showToast('スキップで管理画面に入ります');
    setTimeout(function () { navigateTo(storeId); }, 300);
  });

  // ----- パスワード忘れた (未実装) -----
  forgotLink.addEventListener('click', function (e) {
    e.preventDefault();
    showToast('準備中です。本格運用時にメール再発行を実装します');
  });

  // store 選択変更時にエラークリア
  storeSel.addEventListener('change', clearError);
})();
