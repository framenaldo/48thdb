// Sign up, sign in, sign out, and a member's own settings.
import { esc, now, clean, oneLine, len, localPath } from './util.js';
import {
  hashPassword, checkPassword, startSession, endSession, overLimit, ipKey, nameProblem, nameKey,
} from './auth.js';
import { layout } from './views.js';

const safeBack = (b) => { const p = localPath(b); return p.startsWith('/login') || p.startsWith('/register') ? '/' : p; };
const go = (path, cookieHeader) => new Response(null, {
  status: 303, headers: { Location: path, ...(cookieHeader ? { 'Set-Cookie': cookieHeader } : {}) },
});

// ---------------- sign up ----------------
function registerPage(c, { name = '', error = '' } = {}) {
  const site = c.env.TURNSTILE_SITE;
  return layout(c, {
    title: 'สมัครสมาชิก', noindex: true, crumbs: [{ label: 'สมัครสมาชิก' }],
    body: `${site ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
<section class="box narrow">
<h1 class="ft">สมัครสมาชิก</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}
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

// ---------------- settings ----------------
function settingsPage(c, { error = '', ok = '' } = {}) {
  const u = c.user;
  return layout(c, {
    title: 'ตั้งค่า', noindex: true, crumbs: [{ href: `/u/${u.id}`, label: u.name }, { label: 'ตั้งค่า' }],
    body: `<h1 class="ft">ตั้งค่า</h1>
${error ? `<div class="err">${esc(error)}</div>` : ''}${ok ? `<div class="flash">${esc(ok)}</div>` : ''}
<section class="box narrow">
<h2>โปรไฟล์</h2>
<form method="post" action="/settings" class="stack">
  <input type="hidden" name="what" value="profile">
  <label class="lbl" for="s-oshi">โอชิ</label>
  <input id="s-oshi" name="oshi" maxlength="40" value="${esc(u.oshi)}" placeholder="เช่น Fame, Marine">
  <div class="hint">แสดงข้างชื่อในทุกโพสต์</div>
  <label class="lbl" for="s-sig">ลายเซ็น</label>
  <input id="s-sig" name="sig" maxlength="120" value="${esc(u.sig)}" placeholder="ข้อความสั้น ๆ ใต้ทุกโพสต์">
  <div class="actions end"><button class="btn new">บันทึก</button></div>
</form>
</section>
<section class="box narrow">
<h2>เปลี่ยนรหัสผ่าน</h2>
<form method="post" action="/settings" class="stack">
  <input type="hidden" name="what" value="password">
  <input type="text" name="name" value="${esc(u.name)}" autocomplete="username" hidden>
  <label class="lbl" for="s-old">รหัสผ่านเดิม</label><input id="s-old" name="old" type="password" required autocomplete="current-password">
  <label class="lbl" for="s-new">รหัสผ่านใหม่</label><input id="s-new" name="new" type="password" minlength="8" maxlength="200" required autocomplete="new-password">
  <label class="lbl" for="s-new2">ยืนยันรหัสผ่านใหม่</label><input id="s-new2" name="new2" type="password" minlength="8" maxlength="200" required autocomplete="new-password">
  <div class="actions end"><button class="btn new">เปลี่ยนรหัสผ่าน</button></div>
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
  if (form.get('what') === 'password') {
    const fresh = String(form.get('new') || '');
    if (!(await checkPassword(String(form.get('old') || ''), user.pass))) return settingsPage(c, { error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    if (len(fresh) < 8) return settingsPage(c, { error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว' });
    if (fresh !== String(form.get('new2') || '')) return settingsPage(c, { error: 'รหัสผ่านใหม่สองช่องไม่ตรงกัน' });
    // every other device signs out
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass = ? WHERE id = ?').bind(await hashPassword(fresh), user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    ]);
    return go('/settings?m=saved', await startSession(env, user.id));
  }
  const oshi = oneLine(form.get('oshi')).slice(0, 40);
  const sig = oneLine(clean(form.get('sig'))).slice(0, 120);
  await env.DB.prepare('UPDATE users SET oshi = ?, sig = ? WHERE id = ?').bind(oshi, sig, user.id).run();
  return go('/settings?m=saved');
}
