// The moderators' desk: posts waiting, posts reported, members kept from posting — and every
// moderator action, which all come through /mod/act.
import { esc, now, num, when, clockTh, oneLine, localPath } from './util.js';
import { isMod, isAdmin } from './auth.js';
import { plain } from './markup.js';
import { imageKeys, dropImages, clearAvatar } from './images.js';
import { refreshTopic, refreshForum, postById } from './db.js';
import { layout, message, userLink } from './views.js';

const BACK = '/mod';
const hidden = (k, v) => `<input type="hidden" name="${k}" value="${esc(v)}">`;
const btn = (act, label, cls, fields, confirm) => `<form method="post" action="/mod/act" class="inline"${confirm ? ` data-confirm="${esc(confirm)}"` : ''}>
  ${hidden('act', act)}${Object.entries(fields).map(([k, v]) => hidden(k, v)).join('')}${hidden('back', BACK)}<button class="mb ${cls}">${label}</button></form>`;

export async function queue(c) {
  const { env, user } = c;
  if (!isMod(user)) return message(c, 'สำหรับผู้ดูแลเท่านั้น', 'หน้านี้เปิดได้เฉพาะผู้ดูแลบอร์ด', { status: 403 });
  const at = now();
  const [pending, reported, banned] = await env.DB.batch([
    env.DB.prepare(`SELECT p.*, u.name, u.role, u.posts AS uposts, t.title, t.first_post_id, f.title AS ftitle
      FROM posts p JOIN users u ON u.id = p.user_id JOIN topics t ON t.id = p.topic_id JOIN forums f ON f.id = t.forum_id
      WHERE p.status = 'pending' ORDER BY p.id LIMIT 50`),
    env.DB.prepare(`SELECT p.*, u.name, u.role, t.title, f.title AS ftitle,
        (SELECT GROUP_CONCAT(reason, ' · ') FROM reports WHERE post_id = p.id AND done = 0) AS reasons,
        (SELECT COUNT(*) FROM reports WHERE post_id = p.id AND done = 0) AS open
      FROM posts p JOIN users u ON u.id = p.user_id JOIN topics t ON t.id = p.topic_id JOIN forums f ON f.id = t.forum_id
      WHERE p.status = 'hidden' OR (p.status = 'ok' AND p.id IN (SELECT post_id FROM reports WHERE done = 0))
      ORDER BY p.status = 'hidden' DESC, p.id DESC LIMIT 50`),
    env.DB.prepare('SELECT id, name, role, banned_until, ban_reason FROM users WHERE banned_until > ? ORDER BY banned_until LIMIT 50').bind(at),
  ]);

  const card = (p, kind) => {
    const excerpt = plain(p.body);
    const banBtn = p.role === 'user' ? btn('ban', 'ระงับ 7 วัน', 'ghost', { user: p.user_id, days: 7, reason: kind === 'r' ? (p.reasons || '').slice(0, 100) : '' }, `ระงับการโพสต์ของ ${p.name} 7 วัน?`) : '';
    const buttons = kind === 'p'
      ? `${btn('reject', 'ไม่ผ่าน', 'no', { post: p.id })}${banBtn}${btn('approve', 'ผ่าน', 'ok', { post: p.id })}`
      : `${btn('delete', 'ลบโพสต์', 'no', { post: p.id }, 'ลบโพสต์นี้?')}${banBtn}${btn('keep', p.status === 'hidden' ? 'คืนโพสต์' : 'ไม่ผิดกติกา', 'ok', { post: p.id })}`;
    return `<article class="mcard">
  <div class="mtop">${kind === 'p'
    ? `<span class="flag ${p.flag.startsWith('บัญชีใหม่') ? 'new' : 'money'}">${esc(p.flag || 'รอตรวจ')}</span>`
    : `<span class="flag rep">แจ้งลบ ${p.open} ครั้ง${p.status === 'hidden' ? ' · ซ่อนอยู่' : ''}</span>`}<span class="sp"></span><span>${when(p.created_at, at)}</span></div>
  <div class="mwhere">${p.id === p.first_post_id ? 'ตั้งกระทู้' : 'ตอบใน'} <a href="/p/${p.id}">${esc(p.title)}</a> · ${esc(p.ftitle)} · ${userLink(p.user_id, p.name, p.role)}</div>
  <div class="mq">“${esc(excerpt.slice(0, 400))}${excerpt.length > 400 ? '…' : ''}”</div>
  ${imageKeys(p.body).length ? `<div class="mpics">${imageKeys(p.body).map((k) => `<a href="/i/${k}" target="_blank" rel="noopener"><img src="/i/${k}" alt="รูปในโพสต์" loading="lazy"></a>`).join('')}</div>` : ''}
  ${kind === 'r' && p.reasons ? `<div class="why">เหตุผล: ${esc(p.reasons)}</div>` : ''}
  <div class="mbtns">${buttons}</div>
</article>`;
  };

  const P = pending.results, R = reported.results, B = banned.results;
  return layout(c, {
    title: 'งานผู้ดูแล', noindex: true, crumbs: [{ label: 'งานผู้ดูแล' }],
    body: `<section class="moddesk">
  <h1 class="ft">งานผู้ดูแล</h1>
  <div class="counts">แจ้งลบ <b>${num(R.length)}</b> · รอตรวจ <b>${num(P.length)}</b> · ระงับอยู่ <b>${num(B.length)}</b></div>
  <section class="tbl list"><div class="thd"><span>โพสต์ที่ถูกแจ้งลบ (${num(R.length)})</span></div>
  ${R.length ? R.map((p) => card(p, 'r')).join('') : '<p class="mnone">ไม่มีโพสต์ที่ถูกแจ้งลบ</p>'}</section>
  <section class="tbl list"><div class="thd"><span>โพสต์รอตรวจ (${num(P.length)})</span></div>
  ${P.length ? P.map((p) => card(p, 'p')).join('') : '<p class="mnone">ไม่มีโพสต์รอตรวจ</p>'}</section>
  <section class="tbl list"><div class="thd"><span>ระงับการโพสต์อยู่ (${num(B.length)})</span></div>
  ${B.length ? B.map((u) => `<div class="mrow">${userLink(u.id, u.name, u.role)} <span>ถึง ${clockTh(u.banned_until)}${u.ban_reason ? ` · ${esc(u.ban_reason)}` : ''}</span><span class="sp"></span>${btn('unban', 'ยกเลิก', 'ghost', { user: u.id })}</div>`).join('') : '<p class="mnone">ไม่มี</p>'}</section>
</section>`,
  });
}

const safeBack = (b) => localPath(b, BACK);

export async function act(c) {
  const { env, user } = c;
  if (!isMod(user)) return message(c, 'สำหรับผู้ดูแลเท่านั้น', 'ทำรายการนี้ไม่ได้', { status: 403 });
  const form = await c.req.formData();
  const a = String(form.get('act') || '');
  const back = safeBack(form.get('back'));
  const done = () => {
    const [path, hash = ''] = back.split('#');
    return Response.redirect(`${c.url.origin}${path}${path.includes('?') ? '&' : '?'}m=done${hash ? `#${hash}` : ''}`, 303);
  };
  const t = now();

  // ---- a post ----
  if (['approve', 'reject', 'delete', 'keep'].includes(a)) {
    const p = await postById(env, parseInt(form.get('post'), 10));
    if (!p) return message(c, 'ไม่พบโพสต์', 'อาจถูกลบไปแล้ว', { status: 404 });
    const status = a === 'approve' || a === 'keep' ? 'ok' : 'deleted';
    await env.DB.batch([
      env.DB.prepare(`UPDATE posts SET status = ?, flag = '', reports = CASE WHEN ? THEN 0 ELSE reports END WHERE id = ?`).bind(status, a === 'keep' ? 1 : 0, p.id),
      env.DB.prepare('UPDATE reports SET done = 1 WHERE post_id = ?').bind(p.id),
    ]);
    if (status === 'deleted') await dropImages(env, [p.id], c.url.origin);
    await refreshTopic(env, p.topic_id, [p.user_id]);
    return done();
  }

  // ---- a member ----
  if (['ban', 'unban', 'role', 'unavatar'].includes(a)) {
    const u = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(parseInt(form.get('user'), 10)).first();
    if (!u || u.id === user.id) return message(c, 'ทำรายการนี้ไม่ได้', 'ไม่พบสมาชิก หรือเป็นบัญชีของคุณเอง', { status: 400 });
    if (a === 'role') {
      if (!isAdmin(user)) return message(c, 'สำหรับแอดมินเท่านั้น', 'เปลี่ยนบทบาทได้เฉพาะแอดมิน', { status: 403 });
      const role = ['user', 'mod', 'admin'].includes(form.get('role')) ? form.get('role') : 'user';
      await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, u.id).run();
      return done();
    }
    if (u.role !== 'user' && !isAdmin(user)) return message(c, 'ทำรายการนี้ไม่ได้', 'ผู้ดูแลระงับผู้ดูแลด้วยกันไม่ได้', { status: 403 });
    if (a === 'unavatar') {
      await clearAvatar(env, u.id, c.url.origin);
      return done();
    }
    if (a === 'unban') {
      await env.DB.prepare("UPDATE users SET banned_until = 0, ban_reason = '' WHERE id = ?").bind(u.id).run();
    } else {
      const days = Math.min(36500, Math.max(1, parseInt(form.get('days'), 10) || 7));
      await env.DB.prepare('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?')
        .bind(t + days * 86400, oneLine(form.get('reason')).slice(0, 100), u.id).run();
    }
    return done();
  }

  // ---- a topic ----
  const topic = await env.DB.prepare('SELECT * FROM topics WHERE id = ?').bind(parseInt(form.get('topic'), 10)).first();
  if (!topic) return message(c, 'ไม่พบกระทู้', 'อาจถูกลบไปแล้ว', { status: 404 });
  const set = {
    lock: 'locked = 1', unlock: 'locked = 0', normal: 'kind = 0', sticky: 'kind = 1', announce: 'kind = 2',
  }[a];
  if (set) {
    await env.DB.prepare(`UPDATE topics SET ${set} WHERE id = ?`).bind(topic.id).run();
    return done();
  }
  if (a === 'move') {
    const f = await env.DB.prepare('SELECT id FROM forums WHERE id = ?').bind(parseInt(form.get('forum'), 10)).first();
    if (!f) return message(c, 'ไม่พบห้อง', 'เลือกห้องใหม่อีกครั้ง', { status: 400 });
    if (f.id !== topic.forum_id) {
      await env.DB.prepare('UPDATE topics SET forum_id = ? WHERE id = ?').bind(f.id, topic.id).run();
      await refreshForum(env, topic.forum_id);
      await refreshForum(env, f.id);
    }
    return done();
  }
  if (a === 'deltopic') {
    await env.DB.batch([
      env.DB.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?").bind(topic.first_post_id),
      env.DB.prepare('UPDATE reports SET done = 1 WHERE post_id IN (SELECT id FROM posts WHERE topic_id = ?)').bind(topic.id),
    ]);
    await dropImages(env, [topic.first_post_id], c.url.origin);
    await refreshTopic(env, topic.id, [topic.user_id]);
    const f = await env.DB.prepare('SELECT slug FROM forums WHERE id = ?').bind(topic.forum_id).first();
    return Response.redirect(`${c.url.origin}/f/${f.slug}?m=deleted`, 303);
  }
  return message(c, 'ไม่รู้จักคำสั่งนี้', esc(a), { status: 400 });
}
