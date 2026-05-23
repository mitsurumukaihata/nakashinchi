/* ===========================================
   中新地 — 店舗管理 ログイン
   - 試験段階：認証ロジックは未実装。スキップで bypass
   - 本格運用時はメールアドレスから店舗を自動特定
   =========================================== */
(function () {
  'use strict';

  // メアド → 店舗ID マッピング（本格運用時は API/D1 で解決）
  // 試験段階の暫定マッピング
  var EMAIL_TO_STORE = {
    // 例：'store-owner@manoha.jp' : 'asanoha'
  };

  var STORE_ADMIN_URL = {
    asanoha: '../asanoha-admin/',
    ivory:   '../ivory-admin/'  // 未実装
  };
  var LAST_STORE_KEY = 'last-admin-store';

  var form     = document.getElementById('login-form');
  var emailEl  = document.getElementById('email');
  var passEl   = document.getElementById('password');
  var loginBtn = document.getElementById('login-btn');
  var skipBtn  = document.getElementById('skip-btn');
  var errorEl  = document.getElementById('form-error');
  var forgotLink = document.getElementById('forgot');
  var toast    = document.getElementById('toast');

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function clearError()   { errorEl.hidden = true; }
  function showToast(msg, durMs) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, durMs || 2200);
  }
  function rememberStore(id) { try { localStorage.setItem(LAST_STORE_KEY, id); } catch (_) {} }
  function readLastStore() { try { return localStorage.getItem(LAST_STORE_KEY); } catch (_) { return null; } }

  function navigateTo(storeId) {
    var url = STORE_ADMIN_URL[storeId];
    if (!url) {
      showError('「' + storeId + '」の管理画面はまだ準備中です。準備でき次第ご案内します。');
      return;
    }
    rememberStore(storeId);
    window.location.href = url;
  }

  function resolveStoreFromEmail(email) {
    if (email && EMAIL_TO_STORE[email]) return EMAIL_TO_STORE[email];
    return null;
  }
  function resolveSkipStore() {
    return readLastStore() || 'asanoha';  // フォールバック: 麻ノ葉
  }

  // ----- ログイン処理 (試験段階：実認証なし、入力チェックのみ) -----
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    var email = (emailEl.value || '').trim();
    var pass  = (passEl.value || '').trim();
    if (!email) { showError('メールアドレスを入力してください'); return; }
    if (!pass)  { showError('パスワードを入力してください'); return; }

    var resolvedStore = resolveStoreFromEmail(email) || resolveSkipStore();
    loginBtn.disabled = true;
    loginBtn.textContent = 'ログイン中…';
    setTimeout(function () {
      showToast('試験段階のため、入力チェックのみで進めます');
      navigateTo(resolvedStore);
    }, 500);
  });

  // ----- スキップ -----
  skipBtn.addEventListener('click', function () {
    clearError();
    var storeId = resolveSkipStore();
    showToast('スキップで管理画面に入ります');
    setTimeout(function () { navigateTo(storeId); }, 300);
  });

  // ----- パスワード忘れた (未実装) -----
  forgotLink.addEventListener('click', function (e) {
    e.preventDefault();
    showToast('準備中です。本格運用時にメール再発行を実装します');
  });
})();
