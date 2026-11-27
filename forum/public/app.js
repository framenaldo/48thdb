// 48thForum's only script: the editor's style buttons, pictures, "are you sure?" on deleting, and no
// double sends. Every page works without it, except attaching a picture.
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
  // ---- pictures: shrink in the browser (long side 1,600 px, JPEG on white), which also drops the photo's
  // EXIF — the phone's location among it; a small GIF goes as it is, to keep moving. Then POST /upload.
  var MAX_SIDE = 1600, MAX_BYTES = 2 * 1024 * 1024;
  function loadImage(file) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('เปิดไฟล์นี้ไม่ได้ ลองบันทึกเป็น JPG แล้วแนบใหม่')); };
      img.src = url;
    });
  }
  function shrink(file) {
    return loadImage(file).then(function (r) {
      var w = r.img.naturalWidth, h = r.img.naturalHeight;
      if (file.type === 'image/gif' && file.size <= MAX_BYTES) {
        URL.revokeObjectURL(r.url);
        return { blob: file, w: w, h: h };
      }
      var k = Math.min(1, MAX_SIDE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);   // a see-through PNG on white, not black
      g.drawImage(r.img, 0, 0, cw, ch);
      URL.revokeObjectURL(r.url);
      return new Promise(function (ok, no) {
        cv.toBlob(function (b) { b ? ok({ blob: b, w: cw, h: ch }) : no(new Error('ย่อรูปไม่สำเร็จ')); }, 'image/jpeg', 0.82);
      });
    });
  }
  function insertAt(ta, text) {
    var s = ta.selectionStart, v = ta.value;
    var before = v.slice(0, s), after = v.slice(ta.selectionEnd);
    var pre = before && !/\n$/.test(before) ? '\n' : '';
    ta.value = before + pre + text + '\n' + after;
    ta.selectionStart = ta.selectionEnd = (before + pre + text + '\n').length;
  }
  function uploadAll(form, files) {
    var ta = form.querySelector('textarea'), say = form.querySelector('.upl'), btn = form.querySelector('[data-pic]');
    var have = (ta.value.match(/\[img[=\]]/g) || []).length;
    var list = Array.prototype.slice.call(files, 0, Math.max(0, 10 - have));
    if (!list.length) { say.textContent = 'โพสต์ละไม่เกิน 10 รูป'; return; }
    var done = 0, failed = '';
    btn.disabled = true;
    var next = function (i) {
      if (i >= list.length) {
        btn.disabled = false;
        say.textContent = failed || ('แนบแล้ว ' + done + ' รูป');
        ta.focus();
        return;
      }
      say.textContent = 'กำลังส่งรูป ' + (i + 1) + '/' + list.length + '…';
      shrink(list[i]).then(function (p) {
        return fetch('/upload?w=' + p.w + '&h=' + p.h, { method: 'POST', body: p.blob, headers: { 'Content-Type': p.blob.type || 'application/octet-stream' }, credentials: 'same-origin' });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (!res.ok || !j.tag) throw new Error(j.error || 'ส่งรูปไม่สำเร็จ (' + res.status + ')');
          insertAt(ta, j.tag);
          done++;
        });
      }).catch(function (e) { failed = e.message; }).then(function () { next(i + 1); });
    };
    next(0);
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-pic]');
    if (!b) return;
    ev.preventDefault();
    b.closest('form').querySelector('[data-pic-input]').click();
  });
  document.addEventListener('change', function (ev) {
    var inp = ev.target.closest('[data-pic-input]');
    if (!inp || !inp.files.length) return;
    uploadAll(inp.closest('form'), inp.files);
    inp.value = '';
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
