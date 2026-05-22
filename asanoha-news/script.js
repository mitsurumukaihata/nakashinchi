/* ===========================================
   麻ノ葉 — お知らせ・今日の一言
   - メッセージを localStorage 'manoha-news-v1' に保存
   - 公開ページ (asanoha-hero-bg) で読み込み表示される
   =========================================== */
(function () {
  'use strict';

  var STORAGE_KEY       = 'manoha-news-v1';
  var THEME_STORAGE_KEY = 'manoha-theme';
  var MAX_LEN = 120;

  var textarea     = document.getElementById('news-text');
  var charNow      = document.getElementById('char-now');
  var lastUpdated  = document.getElementById('last-updated');
  var previewText  = document.getElementById('preview-text');
  var saveBtn      = document.getElementById('save-btn');
  var clearBtn     = document.getElementById('clear-btn');
  var toast        = document.getElementById('toast');
  var themeToggle  = document.getElementById('theme-toggle');

  // ---- THEME ----
  function applyTheme(theme) { document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light'); }
  function loadTheme() { try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch (_) { return 'light'; } }
  function saveTheme(t)  { try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch (_) {} }
  themeToggle.addEventListener('click', function () {
    var cur = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var nxt = cur === 'dark' ? 'light' : 'dark';
    applyTheme(nxt); saveTheme(nxt);
  });
  applyTheme(loadTheme());

  // ---- LOAD ----
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (data && data.message) {
        textarea.value = data.message;
        if (data.updatedAt) lastUpdated.textContent = '最終更新：' + formatDate(data.updatedAt);
      }
    } catch (_) {}
    updatePreview();
  }

  function updatePreview() {
    var text = textarea.value.trim();
    charNow.textContent = textarea.value.length;
    previewText.textContent = text || '（メッセージ未設定）';
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate()
         + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 2800);
  }

  // ---- INPUT ----
  textarea.addEventListener('input', updatePreview);

  // ---- SAVE ----
  saveBtn.addEventListener('click', function () {
    var message = textarea.value.trim();
    if (message.length > MAX_LEN) {
      showToast('文字数が上限を超えています');
      return;
    }
    var data = { message: message, updatedAt: new Date().toISOString() };
    try {
      if (message) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        lastUpdated.textContent = '最終更新：' + formatDate(data.updatedAt);
        showToast('保存しました。公開ページに反映されます。');
      } else {
        localStorage.removeItem(STORAGE_KEY);
        lastUpdated.textContent = '';
        showToast('メッセージを空にしました（非表示）。');
      }
    } catch (_) {
      showToast('保存に失敗しました');
    }
  });

  // ---- CLEAR ----
  clearBtn.addEventListener('click', function () {
    textarea.value = '';
    updatePreview();
    textarea.focus();
  });

  // ---- 同一テーマの別タブ同期 ----
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) load();
    else if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });

  // ---- INIT ----
  load();
})();
