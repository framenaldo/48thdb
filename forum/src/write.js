// Writing: a new topic, a reply, an edit, deleting, reporting, "mark everything read".
import { esc, now, clean, oneLine, len, clockTh, when } from './util.js';
import { isMod, isBanned, overLimit, reviewReason } from './auth.js';
import { render, quoteOf } from './markup.js';
import { forumBySlug, topicById, postById, canSee, refreshTopic } from './db.js';
import { layout, message, editor, TAGS, tagHtml, userLink } from './views.js';
import { linkImages, dropImages } from './images.js';

const go = (c, path) => Response.redirect(c.url.origin + path, 303);

function gate(c) {
  if (!c.user) return Response.redirect(`${c.url.origin}/login?back=${encodeURIComponent(c.url.pathname + c.url.search)}`, 302);
  if (isBanned(c.user)) {
    return message(c, 'บัญชีนี้ถูกระงับการโพสต์',
      `ถึง ${clockTh(c.user.banned_until)}${c.user.ban_reason ? ` · เหตุผล: ${esc(c.user.ban_reason)}` : ''}`, { status: 403 });
  }
  return null;
}
const notFound = (c) => message(c, 'ไม่พบหน้านี้', 'ลิงก์อาจผิด หรือกระทู้นี้ถูกลบไปแล้ว', { status: 404 });
const slow = (c) => message(c, 'โพสต์ถี่เกินไป', 'พักสักครู่แล้วค่อยโพสต์ใหม่นะ (ตั้งกระทู้ได้ 3 กระทู้ และตอบได้ 20 ข้อความต่อชั่วโมง)', { status: 429 });

function readBody(form) {
  const body = clean(form.get('body')).trim();
  const n = len(body);
  if (n < 2) return { body, error: 'ข้อความสั้นเกินไป' };
  if (n > 10000) return { body, error: 'ข้อความยาวเกิน 10,000 ตัวอักษร' };
  return { body, error: '' };
}
function readTitle(form) {
  const title = oneLine(form.get('title'));
  const n = len(title);
  if (n < 4) return { title, error: 'หัวข้อสั้นเกินไป (อย่างน้อย 4 ตัวอักษร)' };
  if (n > 120) return { title, error: 'หัวข้อยาวเกิน 120 ตัวอักษร' };
  return { title, error: '' };
}
const previewHtml = (body) => `<section class="preview"><div class="plabel">ตัวอย่าง</div><div class="ptext">${render(body)}</div></section>`;

// the same text from the same person within a minute is a double press: go to the first one
const sameAgain = (c, body) => c.env.DB.prepare('SELECT id FROM posts WHERE user_id = ? AND body = ? AND created_at > ?')
  .bind(c.user.id, body, now() - 60).first();

// ---------------- new topic ----------------
function newTopicPage(c, f, { title = '', tag = '', body = '', error = '', preview = false } = {}) {
  return layout(c, {
    title: `ตั้งกระทู้ - ${f.title}`, noindex: true,
    crumbs: [{ href: `/f/${f.slug}`, label: f.title }, { label: 'ตั้งกระทู้' }],
    body: `<h1 class="ft">ตั้งกระทู้ในห้อง ${esc(f.title)}</h1>
${f.rules ? `<div class="rules"><b>กฎของห้อง</b>${esc(f.rules)}</div>` : ''}
${preview ? previewHtml(body) : ''}
<section class="box">${editor({ action: `/new/${f.slug}`, title, tag, body, forum: f, submit: 'ตั้งกระทู้', error, pics: !!c.env.IMAGES })}</section>
<p class="muted center">อ่าน<a href="/faq#rules">กติกา</a>ก่อนโพสต์นะ</p>`,
  });
}

export async function newTopicForm(c, slug) {
  const g = gate(c); if (g) return g;
  const f = await forumBySlug(c.env, slug);
  return f ? newTopicPage(c, f) : notFound(c);
}

export async function newTopic(c, slug) {
  const g = gate(c); if (g) return g;
  const { env, user } = c;
  const f = await forumBySlug(env, slug);
  if (!f) return notFound(c);
  const form = await c.req.formData();
  const { title, error: e1 } = readTitle(form);
  const { body, error: e2 } = readBody(form);
  const tag = TAGS[form.get('tag')] ? form.get('tag') : '';
  if (e1 || e2) return newTopicPage(c, f, { title, tag, body, error: e1 || e2 });
  if (form.get('preview')) return newTopicPage(c, f, { title, tag, body, preview: true });

  const dup = await sameAgain(c, body);
  if (dup) return go(c, `/p/${dup.id}`);
  if (!isMod(user) && (await overLimit(env, `t:${user.id}`, 3, 3600) || await overLimit(env, `p:${user.id}`, 20, 3600))) return slow(c);

  const why = reviewReason(user, `${title}\n${body}`);
  const status = why ? 'pending' : 'ok';
  const t = now();
  const topic = await env.DB.prepare(`INSERT INTO topics (forum_id, user_id, title, tag, status, last_post_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(f.id, user.id, title, tag, status, t, t).first();
  const post = await env.DB.prepare(`INSERT INTO posts (topic_id, user_id, body, status, flag, created_at)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(topic.id, user.id, body, status, why, t).first();
  const pics = await linkImages(env, post.id, body, [user.id]);
  await env.DB.prepare('UPDATE topics SET first_post_id = ?1, last_post_id = ?1, pics = ?3 WHERE id = ?2').bind(post.id, topic.id, pics).run();
  await refreshTopic(env, topic.id, [user.id]);
  return go(c, `/t/${topic.id}${status === 'pending' ? '?m=pending' : ''}`);
}

// ---------------- reply ----------------
async function replyable(c, id) {
  const t = await topicById(c.env, +id);
  const mod = isMod(c.user);
  if (!t || !canSee(c.user, t, mod)) return { stop: notFound(c) };
  if (t.status !== 'ok') return { stop: message(c, 'ยังตอบกระทู้นี้ไม่ได้', 'กระทู้นี้รอผู้ดูแลตรวจอยู่', { link: { href: `/t/${t.id}`, label: 'กลับไปที่กระทู้' } }) };
  if (t.locked && !mod) return { stop: message(c, 'กระทู้นี้ถูกล็อกแล้ว', 'ตอบกลับไม่ได้อีก', { link: { href: `/t/${t.id}`, label: 'กลับไปที่กระทู้' } }) };
  return { t };
}

async function replyPage(c, t, { body = '', error = '', preview = false } = {}) {
  const { results: last } = await c.env.DB.prepare(`SELECT p.body, p.created_at, u.id AS uid, u.name, u.role FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.topic_id = ? AND p.status = 'ok' ORDER BY p.id DESC LIMIT 5`).bind(t.id).all();
  const at = now();
  return layout(c, {
    title: `ตอบกระทู้ - ${t.title}`, noindex: true,
    crumbs: [{ href: `/f/${t.slug}`, label: t.ftitle }, { href: `/t/${t.id}`, label: t.title }, { label: 'ตอบกระทู้' }],
    body: `<h1 class="ft">ตอบกระทู้ <a href="/t/${t.id}">${tagHtml(t.tag)}${esc(t.title)}</a></h1>
${preview ? previewHtml(body) : ''}
<section class="box">${editor({ action: `/t/${t.id}/reply`, body, forum: t, submit: 'ส่งความคิดเห็น', error, pics: !!c.env.IMAGES })}</section>
${last.length ? `<section class="tbl list"><div class="thd"><span>ความคิดเห็นล่าสุดในกระทู้</span></div>${last.map((p) => `<div class="tr1">
  <span class="muted">${userLink(p.uid, p.name, p.role)} · ${when(p.created_at, at)}</span><div class="ptext small">${render(p.body)}</div></div>`).join('')}</section>` : ''}`,
  });
}

export async function replyForm(c, id) {
  const g = gate(c); if (g) return g;
  const { t, stop } = await replyable(c, id);
  if (stop) return stop;
  let body = '';
  const q = parseInt(c.url.searchParams.get('quote'), 10);
  if (q) {
    const p = await postById(c.env, q);
    if (p && p.topic_id === t.id && canSee(c.user, p, isMod(c.user))) body = quoteOf(p.name, p.body);
  }
  return replyPage(c, t, { body });
}

export async function reply(c, id) {
  const g = gate(c); if (g) return g;
  const { env, user } = c;
  const { t, stop } = await replyable(c, id);
  if (stop) return stop;
  const form = await c.req.formData();
  const { body, error } = readBody(form);
  if (error) return replyPage(c, t, { body, error });
  if (form.get('preview')) return replyPage(c, t, { body, preview: true });

  const dup = await sameAgain(c, body);
  if (dup) return go(c, `/p/${dup.id}`);
  if (!isMod(user) && await overLimit(env, `p:${user.id}`, 20, 3600)) return slow(c);

  const why = reviewReason(user, body);
  const status = why ? 'pending' : 'ok';
  const post = await env.DB.prepare(`INSERT INTO posts (topic_id, user_id, body, status, flag, created_at)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(t.id, user.id, body, status, why, now()).first();
  await linkImages(env, post.id, body, [user.id]);
  await refreshTopic(env, t.id, [user.id]);
  return go(c, `/p/${post.id}${status === 'pending' ? '?m=pending' : ''}`);
}

// ---------------- edit & delete ----------------
async function editable(c, id) {
  const p = await postById(c.env, +id);
  const mod = isMod(c.user);
  if (!p || !canSee(c.user, p, mod) || (p.first_post_id === p.id && p.tstatus === 'deleted')) return { stop: notFound(c) };
  if (p.user_id !== c.user.id && !mod) return { stop: message(c, 'แก้ไขไม่ได้', 'แก้ไขได้เฉพาะข้อความของตัวเอง', { status: 403 }) };
  if (p.locked && !mod) return { stop: message(c, 'กระทู้นี้ถูกล็อกแล้ว', 'แก้ไขหรือลบข้อความไม่ได้อีก', { status: 403 }) };
  return { p, first: p.first_post_id === p.id };
}

async function editPage(c, p, first, { title, tag, body, error = '', preview = false }) {
  const f = await c.env.DB.prepare('SELECT slug, title, trade FROM forums WHERE id = ?').bind(p.forum_id).first();
  return layout(c, {
    title: 'แก้ไขข้อความ', noindex: true,
    crumbs: [{ href: `/f/${f.slug}`, label: f.title }, { href: `/p/${p.id}`, label: p.title }, { label: 'แก้ไข' }],
    body: `<h1 class="ft">แก้ไขข้อความ</h1>
${preview ? previewHtml(body) : ''}
<section class="box">${editor({ action: `/p/${p.id}/edit`, title: first ? title : null, tag, body, forum: f, submit: 'บันทึก', error, pics: !!c.env.IMAGES })}</section>`,
  });
}

export async function editForm(c, id) {
  const g = gate(c); if (g) return g;
  const { p, first, stop } = await editable(c, id);
  if (stop) return stop;
  const t = first ? await c.env.DB.prepare('SELECT tag FROM topics WHERE id = ?').bind(p.topic_id).first() : null;
  return editPage(c, p, first, { title: p.title, tag: t?.tag || '', body: p.body });
}

export async function edit(c, id) {
  const g = gate(c); if (g) return g;
  const { env, user } = c;
  const { p, first, stop } = await editable(c, id);
  if (stop) return stop;
  const form = await c.req.formData();
  const { body, error: e2 } = readBody(form);
  const { title, error: e1 } = first ? readTitle(form) : { title: p.title, error: '' };
  const tag = TAGS[form.get('tag')] ? form.get('tag') : '';
  if (e1 || e2) return editPage(c, p, first, { title, tag, body, error: e1 || e2 });
  if (form.get('preview')) return editPage(c, p, first, { title, tag, body, preview: true });

  // an edit never brings back a hidden post, and from someone not yet trusted it goes back for checking
  let { status, flag } = p;
  if (!isMod(user) && status === 'ok') {
    const why = reviewReason(user, first ? `${title}\n${body}` : body);
    if (why) { status = 'pending'; flag = `แก้ไขแล้ว · ${why}`; }
  }
  const stmts = [env.DB.prepare('UPDATE posts SET body = ?, status = ?, flag = ?, edited_at = ? WHERE id = ?').bind(body, status, flag, now(), p.id)];
  await env.DB.batch(stmts);
  const pics = await linkImages(env, p.id, body, [p.user_id, user.id]);
  if (first) await env.DB.prepare('UPDATE topics SET title = ?, tag = ?, pics = ? WHERE id = ?').bind(title, tag, pics, p.topic_id).run();
  await refreshTopic(env, p.topic_id, [p.user_id]);
  return go(c, `/p/${p.id}${status === 'pending' && p.status === 'ok' ? '?m=pending' : ''}`);
}

export async function remove(c, id) {
  const g = gate(c); if (g) return g;
  const { env } = c;
  const { p, first, stop } = await editable(c, id);
  if (stop) return stop;
  await env.DB.batch([
    env.DB.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?").bind(p.id),
    env.DB.prepare('UPDATE reports SET done = 1 WHERE post_id = ?').bind(p.id),
  ]);
  await dropImages(env, [p.id], c.url.origin);
  await refreshTopic(env, p.topic_id, [p.user_id]);
  if (first) {
    const f = await env.DB.prepare('SELECT slug FROM forums WHERE id = ?').bind(p.forum_id).first();
    return go(c, `/f/${f.slug}?m=deleted`);
  }
  return go(c, `/t/${p.topic_id}?m=deleted`);
}

// ---------------- report ----------------
export const REASONS = ['ข้อมูลส่วนตัวของเมมเบอร์', 'เนื้อหาทางเพศ', 'ของปลอม / โกง', 'ด่าทอ ดูถูก', 'สแปม / โฆษณา', 'อื่น ๆ'];

async function reportable(c, id) {
  const p = await postById(c.env, +id);
  if (!p || p.status !== 'ok' || p.tstatus !== 'ok') return { stop: notFound(c) };
  if (p.user_id === c.user.id) return { stop: message(c, 'แจ้งลบไม่ได้', 'นี่เป็นโพสต์ของคุณเอง ลบเองได้จากปุ่ม ลบ', { status: 400 }) };
  return { p };
}

export async function reportForm(c, id) {
  const g = gate(c); if (g) return g;
  const { p, stop } = await reportable(c, id);
  if (stop) return stop;
  return layout(c, {
    title: 'แจ้งลบโพสต์', noindex: true, crumbs: [{ href: `/p/${p.id}`, label: p.title }, { label: 'แจ้งลบ' }],
    body: `<h1 class="ft">แจ้งลบโพสต์</h1>
<section class="box"><div class="quote small"><b>${esc(p.name)} เขียน:</b>${render(p.body)}</div>
<form method="post" action="/p/${p.id}/report" class="stack">
  <fieldset><legend class="lbl">ผิดกติกาเรื่องอะไร</legend>
  ${REASONS.map((r, i) => `<label class="radio"><input type="radio" name="reason" value="${i}"${i === 0 ? ' required' : ''}> ${esc(r)}</label>`).join('')}</fieldset>
  <label class="lbl" for="r-note">รายละเอียดเพิ่มเติม (ไม่บังคับ)</label><input id="r-note" name="note" maxlength="200">
  <p class="muted">เจ้าของโพสต์จะไม่รู้ว่าใครแจ้ง · ถ้ามีคนแจ้ง 3 คน โพสต์จะถูกซ่อนไว้ก่อนจนผู้ดูแลมาดู</p>
  <div class="actions end"><a class="btn" href="/p/${p.id}">ยกเลิก</a><button class="btn new">แจ้งลบ</button></div>
</form></section>`,
  });
}

export async function report(c, id) {
  const g = gate(c); if (g) return g;
  const { env, user } = c;
  const { p, stop } = await reportable(c, id);
  if (stop) return stop;
  const form = await c.req.formData();
  const reason = REASONS[parseInt(form.get('reason'), 10)];
  if (!reason) return reportForm(c, id);
  if (await overLimit(env, `r:${user.id}`, 20, 86400)) return slow(c);
  const note = oneLine(form.get('note')).slice(0, 200);
  await env.DB.prepare('INSERT OR IGNORE INTO reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)')
    .bind(p.id, user.id, note ? `${reason}: ${note}` : reason, now()).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE post_id = ? AND done = 0').bind(p.id).first()).n;
  const hide = n >= 3 && p.urole === 'user';
  await env.DB.prepare(`UPDATE posts SET reports = ?, status = CASE WHEN ? THEN 'hidden' ELSE status END WHERE id = ?`)
    .bind(n, hide ? 1 : 0, p.id).run();
  if (hide) await refreshTopic(env, p.topic_id, [p.user_id]);
  return go(c, `/p/${p.id}?m=reported`);
}

export async function markRead(c) {
  if (!c.user) return gate(c);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET mark_all_at = ? WHERE id = ?').bind(now(), c.user.id),
    c.env.DB.prepare('DELETE FROM reads WHERE user_id = ?').bind(c.user.id),
  ]);
  const ref = c.req.headers.get('Referer');
  const back = ref && new URL(ref).host === c.url.host ? new URL(ref).pathname : '/';
  return go(c, `${back}?m=read`);
}
