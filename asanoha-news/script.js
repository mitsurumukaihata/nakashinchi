/* ===========================================
   麻ノ葉 — お知らせ・今日の一言
   - API 連携（あれば）: nakashinchiApi を使用
   - API 未設定なら localStorage キャッシュのみで動作（オフラインモード）
   - 保存時に未認証なら PIN モーダルを表示
   =========================================== */
(function () {
  'use strict';

  var KEY               = 'news';
  var LEGACY_LOCAL_KEY  = 'manoha-news-v1';
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
  var noteText     = document.getElementById('note-text');

  // ---- THEME ----
  function applyTheme(theme) { document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light'); }
  function loadTheme()       { try { return localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch (_) { return 'light'; } }
  function saveTheme(t)      { try { localStorage.setItem(THEME_STORAGE_KEY, t); } catch (_) {} }
  themeToggle.addEventListener('click', function () {
    var cur = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var nxt = cur === 'dark' ? 'light' : 'dark';
    applyTheme(nxt); saveTheme(nxt);
  });
  applyTheme(loadTheme());

  // ---- API クライアント (api-client.js が読み込まれていない場合の保険) ----
  function api() { return window.nakashinchiApi || null; }
  function isOnline() { return api() && api().isOnline(); }

  // ---- 旧形式（localStorage 直書き）からの移行 ----
  function migrateLegacy() {
    try {
      var raw = localStorage.getItem(LEGACY_LOCAL_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      // 新キャッシュにコピーして旧キーは消す
      if (data && data.message) {
        localStorage.setItem('manoha-cache:' + KEY, JSON.stringify({
          value: { message: data.message, updatedAt: data.updatedAt || new Date().toISOString() },
          updatedAt: data.updatedAt || new Date().toISOString()
        }));
      }
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    } catch (_) {}
  }

  // ---- UTILS ----
  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate()
         + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function showToast(msg, durMs) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, durMs || 2800);
  }
  function updatePreview() {
    var text = textarea.value.trim();
    charNow.textContent = textarea.value.length;
    previewText.textContent = text || '（メッセージ未設定）';
  }
  function applyDataToForm(data) {
    if (!data) return;
    var v = data.value || data;  // {value, updatedAt} or raw object
    if (v && v.message != null) {
      textarea.value = v.message;
      if (v.updatedAt || data.updatedAt) {
        lastUpdated.textContent = '最終更新：' + formatDate(v.updatedAt || data.updatedAt);
      }
    }
    updatePreview();
  }
  function updateNoteText() {
    if (isOnline()) {
      noteText.innerHTML = '✓ クラウド同期 ON。お客様の端末でも同じ内容が表示されます。';
      noteText.style.color = 'var(--color-success)';
    } else {
      noteText.innerHTML = '※ API 接続先が未設定です。現在は同一端末のみに反映されます（保存先：このブラウザ）。';
      noteText.style.color = '';
    }
  }

  // ---- LOAD ----
  async function load() {
    if (api()) {
      var result = await api().fetchKey(KEY);
      if (result) applyDataToForm(result);
    } else {
      // api-client.js が未読込のとき：localStorage キャッシュから直接
      try {
        var c = JSON.parse(localStorage.getItem('manoha-cache:' + KEY) || 'null');
        if (c) applyDataToForm(c);
      } catch (_) {}
    }
  }

  // ---- SAVE ----
  async function save() {
    var message = textarea.value.trim();
    if (message.length > MAX_LEN) {
      showToast('文字数が上限を超えています');
      return;
    }
    var payload = { message: message, updatedAt: new Date().toISOString() };

    // オフライン（API未設定）→ ローカル保存のみ
    if (!isOnline()) {
      try {
        localStorage.setItem('manoha-cache:' + KEY, JSON.stringify({
          value: payload, updatedAt: payload.updatedAt
        }));
        lastUpdated.textContent = '最終更新：' + formatDate(payload.updatedAt);
        showToast(message ? '保存しました（この端末のみ）' : 'メッセージを空にしました');
      } catch (_) { showToast('保存に失敗しました'); }
      return;
    }

    saveBtn.disabled = true;
    var orig = saveBtn.textContent;
    saveBtn.textContent = '保存中…';

    try {
      try {
        var res = await api().saveKey(KEY, message ? payload : null);
        lastUpdated.textContent = '最終更新：' + formatDate(res.updatedAt || payload.updatedAt);
        showToast(message ? '保存しました。公開ページに反映されます。' : 'メッセージを削除しました');
      } catch (e1) {
        if (e1.message === 'AUTH_REQUIRED') {
          // PIN を求めて再試行
          var token = await window.promptPin();
          if (!token) { showToast('キャンセルしました'); return; }
          var res2 = await api().saveKey(KEY, message ? payload : null);
          lastUpdated.textContent = '最終更新：' + formatDate(res2.updatedAt || payload.updatedAt);
          showToast(message ? '保存しました。公開ページに反映されます。' : 'メッセージを削除しました');
        } else {
          throw e1;
        }
      }
    } catch (e) {
      console.error(e);
      showToast('保存できませんでした（' + (e.message || 'error') + '）', 4500);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = orig;
    }
  }

  // ---- EVENTS ----
  textarea.addEventListener('input', updatePreview);
  saveBtn.addEventListener('click', save);
  clearBtn.addEventListener('click', function () {
    textarea.value = '';
    updatePreview();
    textarea.focus();
  });

  // theme の別タブ同期
  window.addEventListener('storage', function (e) {
    if (e.key === THEME_STORAGE_KEY) applyTheme(e.newValue || 'light');
  });

  // ---- INIT ----
  migrateLegacy();
  updateNoteText();
  // api-client.js が後から読み込まれてもいいよう少し待ってからロード
  function start() {
    updateNoteText();
    load();
  }
  if (api()) start();
  else setTimeout(start, 100);
})();
