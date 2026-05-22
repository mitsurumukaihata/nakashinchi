/* ===========================================
   PIN 入力モーダル（管理画面で共通利用）
   ----------------------------------------
   公開関数: window.promptPin() => Promise<token | null>
   pin-modal.html の要素 (#pin-modal …) を要求します。
   =========================================== */
(function () {
  'use strict';

  function getEl(id) { return document.getElementById(id); }

  function openModal() {
    var m = getEl('pin-modal'); if (m) m.hidden = false;
    var i = getEl('pin-input'); if (i) { i.value = ''; setTimeout(function () { i.focus(); }, 50); }
    var e = getEl('pin-error'); if (e) e.hidden = true;
  }
  function closeModal() {
    var m = getEl('pin-modal'); if (m) m.hidden = true;
  }
  function showError(msg) {
    var e = getEl('pin-error');
    if (e) { e.textContent = msg; e.hidden = false; }
    var i = getEl('pin-input');
    if (i) { i.value = ''; i.focus(); }
  }

  window.promptPin = function () {
    return new Promise(function (resolve) {
      var submitBtn = getEl('pin-submit');
      var cancelBtn = getEl('pin-cancel');
      var input     = getEl('pin-input');
      var backdrop  = document.querySelector('#pin-modal .pin-modal__backdrop');

      if (!submitBtn || !cancelBtn || !input) { resolve(null); return; }

      openModal();

      function cleanup() {
        closeModal();
        submitBtn.removeEventListener('click', onSubmit);
        cancelBtn.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        if (backdrop) backdrop.removeEventListener('click', onCancel);
      }

      async function onSubmit() {
        var pin = (input.value || '').trim();
        if (!pin) return;
        submitBtn.disabled = true;
        submitBtn.textContent = '確認中…';
        try {
          var res = await window.nakashinchiApi.authenticate(pin);
          cleanup();
          resolve(res.token);
        } catch (err) {
          if (err.message === 'INVALID_PIN')      showError('PIN が違います');
          else if (err.message === 'PIN_NOT_SET') showError('まだ PIN が設定されていません');
          else if (err.message === 'OFFLINE')     showError('API 接続先が設定されていません');
          else                                    showError('接続できませんでした');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = '認証';
        }
      }
      function onCancel() { cleanup(); resolve(null); }
      function onKey(e) {
        if (e.key === 'Enter')   onSubmit();
        if (e.key === 'Escape')  onCancel();
      }

      submitBtn.addEventListener('click', onSubmit);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
      if (backdrop) backdrop.addEventListener('click', onCancel);
    });
  };
})();
