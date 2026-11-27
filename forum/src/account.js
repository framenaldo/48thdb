// Sign up, sign in, sign out, and a member's own settings.
import { esc, now, clean, oneLine, len, localPath } from './util.js';
import {
  hashPassword, checkPassword, startSession, endSession, overLimit, ipKey, nameProblem, nameKey,
} from './auth.js';
import { layout, avatar, oshiHtml, ASSET_V } from './views.js';
import { setAvatar, clearAvatar } from './images.js';
import { fbOn, verifyIdToken, syncFrom48thdb, suggestName } from './fb.js';

const safeBack = (b) => { const p = localPath(b); return p.startsWith('/login') || p.startsWith('/register') ? '/' : p; };
const go = (path, cookieHeader) => new Response(null, {
  status: 303, headers: { Location: path, ...(cookieHeader ? { 'Set-Cookie': cookieHeader } : {}) },
});

// ---------------- a 48thDb account ----------------
// The buttons sign in to 48thDb's Firebase in the browser (public/fb.js) and hand the token to POST /auth/48thdb.
// The block stays hidden until Firebase has loaded, so without it the page is the plain name-and-password one.
const FB_LABEL = {
  login: ['เข้าด้วย Google', 'เข้าด้วยบัญชี 48thDb'],
  link:  ['เชื่อมด้วย Google', 'เชื่อมบัญชี'],
  sync:  ['ยืนยันด้วย Google', 'ยืนยันแล้วดึงโอชิ'],
};
function fbBlock(c, mode, back = '/') {
  const { env } = c;
  if (!fbOn(env)) return '';
  const [google, email] = FB_LABEL[mode];
  return `<div class="fbsign" hidden data-fb="${mode}" data-key="${esc(env.FIREBASE_API_KEY)}" data-domain="${esc(env.FIREBASE_AUTH_DOMAIN)}" data-project="${esc(env.FIREBASE_PROJECT)}">
  <button type="button" class="btn big gbtn" data-fb-google><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>${google}</button>
  <details class="fbmail"><summary>ใช้อีเมลกับรหัสผ่านของ 48thDb</summary>
    <form class="stack" method="post" action="/auth/48thdb" data-fb-email>
      <label class="lbl" for="fb-email">อีเมล</label><input id="fb-email" name="email" type="email" required autocomplete="email">
      <label class="lbl" for="fb-pass">รหัสผ่าน 48thDb</label><input id="fb-pass" name="password" type="password" required autocomplete="current-password">
      <div class="actions end"><button class="btn new">${email}</button></div>
    </form></details>
  <div class="err" hidden data-fb-err role="alert"></div>
  <div class="hint" hidden data-fb-inapp>เบราว์เซอร์ในแอปนี้เปิดหน้าล็อกอินของ Google ไม่ได้ · <a href="#" data-fb-out>เปิดในเบราว์เซอร์</a> แล้วลองใหม่ หรือใช้อีเมลแทน</div>
  <form method="post" action="/auth/48thdb" hidden data-fb-post><input type="hidden" name="token"><input type="hidden" name="mode" value="${mode}"><input type="hidden" name="back" value="${esc(back)}"></form>
</div>
<script src="/fb.js?v=${ASSET_V}" defer></script>`;
}

// the box on the sign-in and sign-up pages: 48thDb first, the board's own name and password under it
const fbIntro = (c, back, what) => (fbOn(c.env) ? `<div class="fbwrap" data-fb-wrap hidden>
  <p class="fbnote"><b>มีบัญชี 48thdb.com อยู่แล้ว?</b> ${what}ด้วยบัญชีเดียวกันได้เลย โอชิกับรูปโปรไฟล์ตามมาด้วย</p>
  ${fbBlock(c, 'login', back)}
  <div class="or"><span>หรือ${what === 'สมัคร' ? 'สมัครด้วยชื่อในบอร์ด' : 'ใช้ชื่อในบอร์ด'}</span></div>
</div>` : '');

// ---------------- sign up ----------------
function registerPage(c, { name = '', error = '' } = {}) {
  const site = c.env.TURNSTILE_SITE;
  return layout(c, {
    title: 'สมัครสมาชิก', noindex: true, crumbs: [{ label: 'สมัครสมาชิก' }],
    body: `${site ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
<section class="box narrow">
<h1 class="ft">สมัครสมาชิก</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}
${fbIntro(c, '/', 'สมัคร')}
<form method="post" action="/register" class="stack">
  <label class="lbl" for="r-name">ชื่อในบอร์ด</label>
  <input id="r-name" name="name" value="${esc(name)}" maxlength="20" required autocomplete="username" autocapitalize="off">
  <div class="hint">3–20 ตัวอักษร ไทยหรืออังกฤษ ตัวเลข และ _ . - ได้ · คนอื่นจะเห็นชื่อนี้ · เปลี่ยนภายหลังไม่ได้</div>
  <label class="lbl" for="r-pass">รหัสผ่าน</label>
  <input id="r-pass" name="password" type="password" minlength="8" maxlength="200" required autocomplete="new-password">
  <label class="lbl" for="r-pass2">ยืนยันรหัสผ่าน</label>
  <input id="r-pass2" name="password2" type="password" minlength="8" maxlength="200" required autocomplete="new-password">
  <div class="hint">อย่างน้อย 8 ตัว · บอร์ดไม่เก็บอีเมล ถ้าลืมรหัสผ่านต้องติดต่อผู้ดูแล จดไว้ให้ดีนะ</div>
  <label class="check"><input type="checkbox" name="rules" value="1" required> ฉันอ่านและยอมรับ<a href="/faq" target="_blank">กติกาบอร์ด</a>แล้ว</label>
  ${site ? `<div class="cf-turnstile" data-sitekey="${esc(site)}" data-language="th"></div>` : ''}
  <button class="btn new big">สมัครสมาชิก</button>
</form>
<p class="center muted">มีบัญชีแล้ว? <a href="/login">เข้าสู่ระบบ</a></p>
</section>`,
  });
}

export function registerForm(c) {
  if (c.user) return go('/');
  return registerPage(c);
}

async function turnstileOk(c, form) {
  const secret = c.env.TURNSTILE_SECRET;
  if (!c.env.TURNSTILE_SITE || !secret) return true;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', String(form.get('cf-turnstile-response') || ''));
  body.append('remoteip', c.req.headers.get('CF-Connecting-IP') || '');
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return !!(await r.json().catch(() => ({}))).success;
}

export async function register(c) {
  if (c.user) return go('/');
  const { env } = c;
  const form = await c.req.formData();
  const name = oneLine(form.get('name')).replace(/\s/g, '');
  const pw = String(form.get('password') || '');
  const fail = (error) => registerPage(c, { name, error });
  const bad = nameProblem(name);
  if (bad) return fail(bad);
  if (len(pw) < 8) return fail('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
  if (pw !== String(form.get('password2') || '')) return fail('รหัสผ่านสองช่องไม่ตรงกัน');
  if (form.get('rules') !== '1') return fail('ต้องยอมรับกติกาบอร์ดก่อนสมัคร');
  if (!(await turnstileOk(c, form))) return fail('ยืนยันว่าไม่ใช่บอทไม่ผ่าน ลองใหม่อีกครั้ง');
  if (await overLimit(env, `reg:${await ipKey(c.req, env)}`, 3, 86400)) return fail('สมัครจากเครื่องนี้หลายบัญชีเกินไปในวันนี้ ลองใหม่พรุ่งนี้');
  const key = nameKey(name);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE name_key = ?').bind(key).first()) return fail('ชื่อนี้มีคนใช้แล้ว');
  const t = now();
  let row;
  try {
    row = await env.DB.prepare(`INSERT INTO users (name, name_key, pass, color, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(name, key, await hashPassword(pw), Math.floor(Math.random() * 8), t, t).first();
  } catch {
    return fail('ชื่อนี้มีคนใช้แล้ว');
  }
  return go('/?m=welcome', await startSession(env, row.id));
}

// ---------------- sign in / out ----------------
function loginPage(c, { name = '', error = '', back = '/' } = {}) {
  return layout(c, {
    title: 'เข้าสู่ระบบ', noindex: true, crumbs: [{ label: 'เข้าสู่ระบบ' }],
    body: `<section class="box narrow">
<h1 class="ft">เข้าสู่ระบบ</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}
${fbIntro(c, back, 'เข้าสู่ระบบ')}
<form method="post" action="/login" class="stack">
  <input type="hidden" name="back" value="${esc(back)}">
  <label class="lbl" for="l-name">ชื่อในบอร์ด</label>
  <input id="l-name" name="name" value="${esc(name)}" required autocomplete="username" autocapitalize="off">
  <label class="lbl" for="l-pass">รหัสผ่าน</label>
  <input id="l-pass" name="password" type="password" required autocomplete="current-password">
  <button class="btn new big">เข้าสู่ระบบ</button>
</form>
<p class="center muted">ยังไม่มีบัญชี? <a href="/register">สมัครสมาชิก</a> · <a href="/faq">ลืมรหัสผ่าน?</a></p>
</section>`,
  });
}

export function loginForm(c) {
  const back = safeBack(c.url.searchParams.get('back'));
  if (c.user) return go(back);
  return loginPage(c, { back });
}

export async function login(c) {
  const { env } = c;
  const form = await c.req.formData();
  const name = oneLine(form.get('name')).replace(/\s/g, '');
  const back = safeBack(form.get('back'));
  if (await overLimit(env, `login:${await ipKey(c.req, env)}`, 10, 900)) {
    return loginPage(c, { name, back, error: 'ลองหลายครั้งเกินไป รอ 15 นาทีแล้วค่อยลองใหม่' });
  }
  const u = await env.DB.prepare('SELECT id, pass FROM users WHERE name_key = ?').bind(nameKey(name)).first();
  if (!u || !(await checkPassword(String(form.get('password') || ''), u.pass))) {
    return loginPage(c, { name, back, error: 'ชื่อหรือรหัสผ่านไม่ถูกต้อง' });
  }
  const sep = back.includes('?') ? '&' : '?';
  return go(`${back}${back === '/' ? '?m=login' : `${sep}m=login`}`, await startSession(env, u.id));
}

export async function logout(c) {
  return go('/?m=logout', await endSession(c.req, c.env));
}

// ---------------- signing in with a 48thDb account ----------------
// A 48thDb account seen here the first time picks its board name; the token rides along in the form
// (it is good for an hour) and nothing is kept until the name is taken.
function namePage(c, { token, name = '', back = '/', error = '' }) {
  return layout(c, {
    title: 'ตั้งชื่อในบอร์ด', noindex: true, crumbs: [{ label: 'ตั้งชื่อในบอร์ด' }],
    body: `<section class="box narrow">
<h1 class="ft">ตั้งชื่อในบอร์ด</h1>
<p>บัญชี 48thDb นี้ยังไม่เคยเข้า 48thForum ตั้งชื่อที่คนอื่นจะเห็นในบอร์ดก่อนนะ</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/auth/48thdb" class="stack">
  <input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="mode" value="login"><input type="hidden" name="back" value="${esc(back)}">
  <label class="lbl" for="n-name">ชื่อในบอร์ด</label>
  <input id="n-name" name="name" value="${esc(name)}" maxlength="20" required autocomplete="username" autocapitalize="off">
  <div class="hint">3–20 ตัวอักษร ไทยหรืออังกฤษ ตัวเลข และ _ . - ได้ · เปลี่ยนภายหลังไม่ได้ · โอชิกับรูปโปรไฟล์จาก 48thDb จะตามมาเอง</div>
  <label class="check"><input type="checkbox" name="rules" value="1" required> ฉันอ่านและยอมรับ<a href="/faq" target="_blank">กติกาบอร์ด</a>แล้ว</label>
  <button class="btn new big">เริ่มใช้บอร์ด</button>
</form>
<p class="center muted">มีชื่อในบอร์ดอยู่แล้ว? <a href="/login?back=%2Fsettings">เข้าด้วยชื่อกับรหัสผ่าน</a> แล้วกด “เชื่อมบัญชี 48thDb” ในหน้าตั้งค่า</p>
</section>`,
  });
}

const fbFail = (c, text, status = 400) => layout(c, {
  title: 'เข้าด้วยบัญชี 48thDb ไม่สำเร็จ', noindex: true, status,
  body: `<div class="box msg"><h1 class="ft">เข้าด้วยบัญชี 48thDb ไม่สำเร็จ</h1><p>${esc(text)}</p>
<p><a class="btn" href="${c.user ? '/settings' : '/login'}">ลองใหม่</a></p></div>`,
});

export async function auth48(c) {
  const { env, ctx } = c;
  if (!fbOn(env)) return fbFail(c, 'บอร์ดยังไม่ได้เปิดการเข้าด้วยบัญชี 48thDb', 404);
  const form = await c.req.formData();
  const mode = ['link', 'sync'].includes(form.get('mode')) ? form.get('mode') : 'login';
  const back = safeBack(form.get('back'));
  if (await overLimit(env, `fb:${await ipKey(c.req, env)}`, 20, 900)) return fbFail(c, 'ลองหลายครั้งเกินไป รอ 15 นาทีแล้วค่อยลองใหม่', 429);
  const token = String(form.get('token') || '');
  const claims = await verifyIdToken(env, token).catch((e) => { console.error(e); return null; });
  if (!claims) return fbFail(c, 'ยืนยันบัญชี 48thDb ไม่ผ่าน หรือหมดเวลาไปแล้ว ลองเข้าสู่ระบบใหม่อีกครั้ง');
  const uid = claims.sub;
  const owner = await env.DB.prepare('SELECT * FROM users WHERE fb_uid = ?').bind(uid).first();
  const sync = (u, opts) => syncFrom48thdb(env, u, token, opts).catch((e) => { console.error(e); return null; });

  // from the settings page: this board account takes the 48thDb account, or brings its oshi again
  if (mode !== 'login') {
    if (!c.user) return go('/login?back=%2Fsettings');
    if (owner && owner.id !== c.user.id) return settingsPage(c, { error: `บัญชี 48thDb นี้เชื่อมกับชื่อ “${owner.name}” ในบอร์ดอยู่แล้ว` });
    if (mode === 'sync' && c.user.fb_uid !== uid) return settingsPage(c, { error: 'ต้องยืนยันด้วยบัญชี 48thDb ที่เชื่อมไว้กับชื่อนี้' });
    if (mode === 'link' && c.user.fb_uid && c.user.fb_uid !== uid) return settingsPage(c, { error: 'ชื่อนี้เชื่อมกับบัญชี 48thDb อื่นอยู่แล้ว เลิกเชื่อมก่อนแล้วค่อยเชื่อมใหม่' });
    if (mode === 'link') {
      try {
        await env.DB.prepare('UPDATE users SET fb_uid = ? WHERE id = ?').bind(uid, c.user.id).run();
      } catch {
        return settingsPage(c, { error: 'บัญชี 48thDb นี้เชื่อมกับชื่ออื่นในบอร์ดอยู่แล้ว' });
      }
    }
    const done = await sync({ ...c.user, fb_uid: uid }, { force: true, picture: true });
    if (!done) return go(mode === 'link' ? '/settings?m=linked&fb=late' : '/settings?fb=late');
    return go(`/settings?m=${mode === 'link' ? 'linked' : 'synced'}`);
  }

  // signing in: an account that has been here before, its oshi brought again on the way
  if (owner) {
    ctx.waitUntil(sync(owner, {}));
    const sep = back.includes('?') ? '&' : '?';
    return go(`${back}${back === '/' ? '?m=login' : `${sep}m=login`}`, await startSession(env, owner.id));
  }
  if (c.user) return go(back);

  // a 48thDb account new to the board: first its name
  const typed = form.get('name');
  if (typed === null) return namePage(c, { token, back, name: suggestName(claims) });
  const name = oneLine(typed).replace(/\s/g, '');
  const fail = (error) => namePage(c, { token, back, name, error });
  const bad = nameProblem(name);
  if (bad) return fail(bad);
  if (form.get('rules') !== '1') return fail('ต้องยอมรับกติกาบอร์ดก่อนนะ');
  if (await overLimit(env, `reg:${await ipKey(c.req, env)}`, 3, 86400)) return fail('สมัครจากเครื่องนี้หลายบัญชีเกินไปในวันนี้ ลองใหม่พรุ่งนี้');
  const key = nameKey(name);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE name_key = ?').bind(key).first()) return fail('ชื่อนี้มีคนใช้แล้ว');
  const t = now();
  let row;
  try {
    // no password: '!' never matches one, so this account signs in through 48thDb until it sets one
    row = await env.DB.prepare(`INSERT INTO users (name, name_key, pass, color, created_at, last_seen, fb_uid)
      VALUES (?, ?, '!', ?, ?, ?, ?) RETURNING *`).bind(name, key, Math.floor(Math.random() * 8), t, t, uid).first();
  } catch {
    const again = await env.DB.prepare('SELECT id FROM users WHERE fb_uid = ?').bind(uid).first();
    if (again) return go(back, await startSession(env, again.id));    // the same form sent twice
    return fail('ชื่อนี้มีคนใช้แล้ว');
  }
  await sync(row, { force: true, picture: true });
  return go('/?m=welcome', await startSession(env, row.id));
}

// ---------------- settings ----------------
function settingsPage(c, { error = '', ok = '' } = {}) {
  const u = c.user;
  const noPass = u.pass === '!';
  const late = c.url.searchParams.get('fb') === 'late';
  const fb = !fbOn(c.env) && !u.fb_uid ? '' : u.fb_uid ? `<section class="box narrow">
<h2>บัญชี 48thDb</h2>
<p><span class="linked">เชื่อมกับบัญชี 48thdb.com แล้ว</span>${u.oshi_ids ? ` · ${oshiHtml(u.oshi, u.oshi_ids)}` : ''}</p>
${late ? '<div class="warn">ยังดึงโอชิจาก 48thDb ไม่ได้ในตอนนี้ ลองกดดึงอีกครั้งภายหลัง</div>' : ''}
<div class="hint">โอชิจะอัปเดตเองทุกครั้งที่เข้าสู่ระบบด้วยบัญชี 48thDb${u.oshi && !u.oshi_ids ? ' (ตอนนี้ใช้โอชิที่พิมพ์เอง กดดึงเพื่อกลับไปใช้จาก 48thDb)' : ''} · อยากได้ตอนนี้เลยก็ยืนยันอีกครั้งตรงนี้</div>
${fbBlock(c, 'sync', '/settings')}
${noPass ? '<div class="hint unlink">จะเลิกเชื่อมได้ต้องตั้งรหัสผ่านของบอร์ดก่อน (ด้านล่าง) ไม่อย่างนั้นจะเข้าบัญชีนี้ไม่ได้</div>'
  : `<form method="post" action="/settings" class="unlink" data-confirm="เลิกเชื่อมบัญชี 48thDb? โอชิที่มีอยู่จะยังอยู่ แต่จะไม่อัปเดตตาม 48thDb แล้ว"><input type="hidden" name="what" value="unlink"><button class="linkbtn">เลิกเชื่อมบัญชี 48thDb</button></form>`}
</section>` : `<section class="box narrow">
<h2>บัญชี 48thDb</h2>
<p>เชื่อมชื่อนี้กับบัญชี 48thdb.com แล้วเข้าบอร์ดด้วยบัญชีนั้นได้ โอชิจะดึงมาจาก 48thDb และอัปเดตตามเอง</p>
${fbBlock(c, 'link', '/settings')}
</section>`;
  return layout(c, {
    title: 'ตั้งค่า', noindex: true, crumbs: [{ href: `/u/${u.id}`, label: u.name }, { label: 'ตั้งค่า' }],
    body: `<h1 class="ft">ตั้งค่า</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}${ok ? `<div class="flash">${esc(ok)}</div>` : ''}
${c.env.IMAGES ? `<section class="box narrow">
<h2>รูปโปรไฟล์</h2>
<div class="avatar-set">${avatar(u, 'big')}
  <div><button type="button" class="btn" data-avatar>เลือกรูป</button><input type="file" accept="image/*" hidden data-avatar-input>
  ${u.avatar ? `<form method="post" action="/settings" data-confirm="ลบรูปโปรไฟล์?"><input type="hidden" name="what" value="noavatar"><button class="linkbtn">ลบรูป</button></form>` : ''}
  <div class="hint">รูปจะถูกตัดเป็นสี่เหลี่ยมจัตุรัส <span class="upl" role="status" aria-live="polite"></span></div></div></div>
<form method="post" action="/settings" id="avatar-form" hidden><input type="hidden" name="what" value="avatar"><input type="hidden" name="key"></form>
</section>` : ''}
<section class="box narrow">
<h2>โปรไฟล์</h2>
<form method="post" action="/settings" class="stack">
  <input type="hidden" name="what" value="profile">
  <label class="lbl" for="s-oshi">โอชิ</label>
  <input id="s-oshi" name="oshi" maxlength="40" value="${esc(u.oshi)}" placeholder="เช่น Fame, Marine">
  <div class="hint">แสดงข้างชื่อในทุกโพสต์${u.oshi_ids ? ' · ตอนนี้ตาม 48thDb ถ้าพิมพ์แก้ตรงนี้จะเลิกตาม' : ''}</div>
  <label class="lbl" for="s-sig">ลายเซ็น</label>
  <input id="s-sig" name="sig" maxlength="120" value="${esc(u.sig)}" placeholder="ข้อความสั้น ๆ ใต้ทุกโพสต์">
  <div class="actions end"><button class="btn new">บันทึก</button></div>
</form>
</section>
${fb}
<section class="box narrow">
<h2>${noPass ? 'ตั้งรหัสผ่าน' : 'เปลี่ยนรหัสผ่าน'}</h2>
${noPass ? '<div class="hint">ไม่ตั้งก็ได้ บัญชีนี้เข้าด้วยบัญชี 48thDb อยู่แล้ว ตั้งไว้ถ้าอยากเข้าด้วยชื่อในบอร์ดกับรหัสผ่านได้ด้วย</div>' : ''}
<form method="post" action="/settings" class="stack">
  <input type="hidden" name="what" value="password">
  <input type="text" name="name" value="${esc(u.name)}" autocomplete="username" hidden>
  ${noPass ? '' : '<label class="lbl" for="s-old">รหัสผ่านเดิม</label><input id="s-old" name="old" type="password" required autocomplete="current-password">'}
  <label class="lbl" for="s-new">รหัสผ่านใหม่</label><input id="s-new" name="new" type="password" minlength="8" maxlength="200" required autocomplete="new-password">
  <label class="lbl" for="s-new2">ยืนยันรหัสผ่านใหม่</label><input id="s-new2" name="new2" type="password" minlength="8" maxlength="200" required autocomplete="new-password">
  <div class="actions end"><button class="btn new">${noPass ? 'ตั้งรหัสผ่าน' : 'เปลี่ยนรหัสผ่าน'}</button></div>
</form>
</section>`,
  });
}

export function settingsForm(c) {
  if (!c.user) return Response.redirect(`${c.url.origin}/login?back=%2Fsettings`, 302);
  return settingsPage(c);
}

export async function settings(c) {
  if (!c.user) return Response.redirect(`${c.url.origin}/login?back=%2Fsettings`, 302);
  const { env, user } = c;
  const form = await c.req.formData();
  if (form.get('what') === 'avatar') {
    if (!(await setAvatar(env, user, String(form.get('key') || ''), c.url.origin))) return settingsPage(c, { error: 'ตั้งรูปไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง' });
    return go('/settings?m=saved');
  }
  if (form.get('what') === 'noavatar') {
    await clearAvatar(env, user.id, c.url.origin);
    return go('/settings?m=saved');
  }
  if (form.get('what') === 'password') {
    const fresh = String(form.get('new') || '');
    // an account made through 48thDb has no password to give; its session is the proof
    if (user.pass !== '!' && !(await checkPassword(String(form.get('old') || ''), user.pass))) return settingsPage(c, { error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    if (len(fresh) < 8) return settingsPage(c, { error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว' });
    if (fresh !== String(form.get('new2') || '')) return settingsPage(c, { error: 'รหัสผ่านใหม่สองช่องไม่ตรงกัน' });
    // every other device signs out
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass = ? WHERE id = ?').bind(await hashPassword(fresh), user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    ]);
    return go('/settings?m=saved', await startSession(env, user.id));
  }
  if (form.get('what') === 'unlink') {
    if (user.pass === '!') return settingsPage(c, { error: 'ตั้งรหัสผ่านของบอร์ดก่อน แล้วค่อยเลิกเชื่อมบัญชี 48thDb' });
    await env.DB.prepare("UPDATE users SET fb_uid = NULL, oshi_ids = '' WHERE id = ?").bind(user.id).run();
    return go('/settings?m=unlinked');
  }
  const oshi = [...oneLine(form.get('oshi'))].slice(0, 40).join('');
  const sig = [...oneLine(clean(form.get('sig')))].slice(0, 120).join('');
  // an oshi typed by hand no longer follows 48thDb
  const ids = oshi === user.oshi ? user.oshi_ids : '';
  await env.DB.prepare('UPDATE users SET oshi = ?, oshi_ids = ?, sig = ? WHERE id = ?').bind(oshi, ids, sig, user.id).run();
  return go('/settings?m=saved');
}
