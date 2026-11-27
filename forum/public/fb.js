// Signing in with a 48thDb account. Only on the pages that offer it (sign in, sign up, settings).
// Firebase is loaded from Google, signs the reader in to 48thDb's own project — the Google pop-up, or the
// e-mail and password they use on 48thdb.com — and its ID token goes to POST /auth/48thdb, which checks it.
// Nothing of Firebase is kept on this site: the session lives in memory only and is signed out at once.
(function () {
  var box = document.querySelector('[data-fb]');
  if (!box) return;
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var post = box.querySelector('[data-fb-post]');
  var err = box.querySelector('[data-fb-err]');
  var auth = null;

  function load(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = no;
      document.head.appendChild(s);
    });
  }
  function say(t) { err.textContent = t || ''; err.hidden = !t; }
  function busy(on) {
    box.querySelectorAll('button').forEach(function (b) { b.disabled = on; });
    box.classList.toggle('is-busy', on);
  }
  var WORDS = {
    'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่างล็อกอินไว้ อนุญาตป๊อปอัปของเว็บนี้แล้วลองใหม่',
    'auth/unauthorized-domain': '48thDb ยังไม่ได้อนุญาตให้บอร์ดนี้ใช้ล็อกอินของ Google (ผู้ดูแลกำลังตั้งค่า) ใช้อีเมลแทนได้',
    'auth/operation-not-supported-in-this-environment': 'เบราว์เซอร์นี้เปิดหน้าล็อกอินของ Google ไม่ได้ ลองเปิดใน Safari หรือ Chrome',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-login-credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/wrong-password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชี 48thDb ที่ใช้อีเมลนี้',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/user-disabled': 'บัญชี 48thDb นี้ถูกปิดไว้',
    'auth/too-many-requests': 'ลองหลายครั้งเกินไป รอสักครู่แล้วค่อยลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่',
    'auth/account-exists-with-different-credential': 'อีเมลนี้ใช้กับ 48thDb ด้วยวิธีอื่น ลองอีกแบบหนึ่ง'
  };
  function fail(e) {
    busy(false);
    var code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return;
    say(WORDS[code] || 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง' + (code ? ' (' + code.replace('auth/', '') + ')' : ''));
  }
  function hand(cred) {
    return cred.user.getIdToken().then(function (token) {
      post.querySelector('[name=token]').value = token;
      auth.signOut().catch(function () {});
      post.submit();
    });
  }

  // the browsers inside LINE, Facebook, Instagram and the like cannot open Google's sign-in
  var inapp = /\bLine\/|FBAN|FBAV|Instagram|; wv\)/.test(navigator.userAgent);
  if (inapp) {
    var note = box.querySelector('[data-fb-inapp]');
    var out = box.querySelector('[data-fb-out]');
    if (note && out) {
      out.href = location.href.replace(/#.*$/, '') + (location.search ? '&' : '?') + 'openExternalBrowser=1';
      note.hidden = false;
    }
  }

  box.querySelector('[data-fb-google]').addEventListener('click', function () {
    if (!auth) return;
    say(''); busy(true);
    // called straight from the tap, so the pop-up is allowed to open
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(hand).catch(fail);
  });
  var mail = box.querySelector('[data-fb-email]');
  mail.addEventListener('submit', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();               // not a form for the board itself: app.js need not hold it
    if (!auth) return;
    say(''); busy(true);
    auth.signInWithEmailAndPassword(mail.email.value.trim(), mail.password.value).then(hand).catch(fail);
  });

  load(SDK + 'firebase-app-compat.js').then(function () {
    return load(SDK + 'firebase-auth-compat.js');
  }).then(function () {
    var app = firebase.initializeApp({ apiKey: box.dataset.key, authDomain: box.dataset.domain, projectId: box.dataset.project }, 'fb48');
    auth = app.auth();
    return auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
  }).then(function () {
    box.hidden = false;
    var wrap = box.closest('[data-fb-wrap]');
    if (wrap) wrap.hidden = false;
  }).catch(function () { /* Firebase did not load: the page stays as it was, with the board's own sign-in */ });
})();
