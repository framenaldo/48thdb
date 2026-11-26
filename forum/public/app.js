// 48thForum's only script: the editor's style buttons, "are you sure?" on deleting, and no double sends.
// Every page works without it.
(function () {
  function wrap(ta, tag) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var open = '[' + tag + ']', close = '[/' + tag + ']';
    var sel = v.slice(s, e);
    if (tag === 'url') {
      var u = window.prompt('ลิงก์ (https://…)', 'https://');
      if (!u || !/^https?:\/\/\S+$/.test(u)) return;
      open = '[url=' + u + ']';
      if (!sel) sel = 'ข้อความลิงก์';
    }
    ta.value = v.slice(0, s) + open + sel + close + v.slice(e);
    ta.focus();
    ta.selectionStart = s + open.length;
    ta.selectionEnd = s + open.length + sel.length;
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-bb]');
    if (!b) return;
    ev.preventDefault();
    var ta = b.closest('form').querySelector('textarea');
    if (ta) wrap(ta, b.getAttribute('data-bb'));
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    var ask = f.getAttribute('data-confirm');
    if (ask && !window.confirm(ask)) { ev.preventDefault(); return; }
    if (f.dataset.sent) { ev.preventDefault(); return; }
    f.dataset.sent = '1';
    setTimeout(function () { delete f.dataset.sent; }, 4000);
  });
  // the textarea with a quote in it opens with the cursor at its end
  var ta = document.querySelector('.editor textarea');
  if (ta && /\[\/quote\]\s*$/.test(ta.value) && !document.querySelector('.err')) {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }
})();
