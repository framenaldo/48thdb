// Pages for reading: the board's front page, a forum, a topic, a member, the member list,
// search, unread topics and the rules.
import { esc, num, now, when, dateTh, clockTh } from './util.js';
import { isMod, isAdmin, isBanned } from './auth.js';
import { render, plain } from './markup.js';
import { forumBySlug, topicById, canSee, UNREAD_DAYS } from './db.js';
import {
  layout, message, pager, miniPager, tagHtml, rankHtml, avatar, userLink, oshiHtml, userPanel, editor, icon,
  PER_FORUM, PER_TOPIC,
} from './views.js';

const pageOf = (c) => Math.max(1, parseInt(c.url.searchParams.get('page'), 10) || 1);
const notFound = (c) => message(c, 'ไม่พบหน้านี้', 'ลิงก์อาจผิด หรือกระทู้นี้ถูกลบไปแล้ว', { status: 404 });
// What counts as new: for a member, what they have not read since it last changed (or since they pressed
// "อ่านแล้วทั้งหมด"), within the last UNREAD_DAYS — older read marks are cleared every night; for a guest, the last day.
const markOf = (c) => (c.user ? Math.max(c.user.mark_all_at, c.user.created_at, now() - UNREAD_DAYS * 86400) : now() - 86400);

// ---------------- the front page ----------------
export async function index(c) {
  const { env, user } = c;
  const t = now();
  const [forums, stats, online, best] = await env.DB.batch([
    env.DB.prepare(`
      SELECT f.*, c.title AS cat_title,
        p.created_at AS lp_at, p.id AS lp_id, lt.title AS lp_title, lu.id AS lp_uid, lu.name AS lp_user, lu.role AS lp_role,
        CASE WHEN ?1 = 0 THEN COALESCE(p.created_at, 0) > ?2
             ELSE EXISTS(SELECT 1 FROM topics t2 WHERE t2.forum_id = f.id AND t2.status = 'ok' AND t2.last_post_at > ?2
                          AND NOT EXISTS(SELECT 1 FROM reads r WHERE r.user_id = ?1 AND r.topic_id = t2.id AND r.at >= t2.last_post_at))
        END AS unread
      FROM forums f JOIN categories c ON c.id = f.cat_id
      LEFT JOIN posts p ON p.id = f.last_post_id
      LEFT JOIN topics lt ON lt.id = p.topic_id
      LEFT JOIN users lu ON lu.id = p.user_id
      ORDER BY c.sort, f.sort`).bind(user?.id || 0, markOf(c)),
    // no account is ever deleted, so the highest id is how many there are (and costs one row, not all of them)
    env.DB.prepare(`SELECT (SELECT COALESCE(MAX(id), 0) FROM users) AS users,
      (SELECT id FROM users ORDER BY id DESC LIMIT 1) AS nid, (SELECT name FROM users ORDER BY id DESC LIMIT 1) AS nname`),
    env.DB.prepare('SELECT id, name, role FROM users WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 60').bind(t - 300),
    env.DB.prepare("SELECT v FROM meta WHERE k = 'max_online'"),
  ]);
  const st = stats.results[0];
  const on = online.results;
  let [maxN, maxAt] = (best.results[0]?.v || '0|0').split('|').map(Number);
  if (on.length > maxN) {
    [maxN, maxAt] = [on.length, t];
    c.ctx.waitUntil(env.DB.prepare("INSERT INTO meta (k, v) VALUES ('max_online', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
      .bind(`${maxN}|${maxAt}`).run());
  }

  const cats = [];
  for (const f of forums.results) {
    if (!cats.length || cats.at(-1).id !== f.cat_id) cats.push({ id: f.cat_id, title: f.cat_title, forums: [] });
    cats.at(-1).forums.push(f);
  }
  const totalPosts = forums.results.reduce((a, f) => a + f.posts, 0);
  const totalTopics = forums.results.reduce((a, f) => a + f.topics, 0);

  const table = (cat) => `<section class="tbl forums">
  <div class="thd"><span>${esc(cat.title)}</span><span>กระทู้</span><span>ข้อความ</span><span>ล่าสุด</span></div>
  ${cat.forums.map((f) => `<div class="tr">
    <div class="main"><span class="ic${f.unread ? ' new' : ''}">${icon('forum')}</span><div>
      <div class="tt"><a href="/f/${f.slug}">${esc(f.title)}</a>${f.unread ? '<span class="newtag">ใหม่</span>' : ''}</div><div class="desc">${esc(f.descr)}</div>
      <div class="mstats">${num(f.topics)} กระทู้ · ${num(f.posts)} ข้อความ</div></div></div>
    <div class="n">${num(f.topics)}</div><div class="n">${num(f.posts)}</div>
    <div class="last">${f.lp_id ? `<a href="/p/${f.lp_id}">${esc(f.lp_title)}</a><br>${userLink(f.lp_uid, f.lp_user, f.lp_role)} · ${when(f.lp_at, t)}` : '<span class="muted">ยังไม่มีกระทู้</span>'}</div>
  </div>`).join('')}
</section>`;

  return layout(c, {
    desc: 'เว็บบอร์ดแฟนคลับไอดอล BNK48 และ CGM48 พูดคุย รีวิวงาน แลกเปลี่ยนโฟโต้เซ็ต',
    body: `${user ? `<div class="mark-read"><form method="post" action="/markread" class="inline"><button class="linkbtn">อ่านแล้วทั้งหมด</button></form></div>` : ''}
${cats.map(table).join('\n')}
<section class="stats">
  <h2>ใครออนไลน์อยู่บ้าง</h2>
  <div class="sec">สมาชิกออนไลน์ใน 5 นาทีที่ผ่านมา <b>${num(on.length)}</b> คน${maxN > 1 ? ` · มากที่สุด ${num(maxN)} คน เมื่อ ${clockTh(maxAt)}` : ''}
  <div class="online">${on.length ? on.map((u) => userLink(u.id, u.name, u.role)).join(' ') : '<span class="muted">ยังไม่มีใคร</span>'}</div></div>
  <div class="sec">กระทู้ <b>${num(totalTopics)}</b> · ข้อความ <b>${num(totalPosts)}</b> · สมาชิก <b>${num(st.users)}</b>${
    st.nid ? ` · สมาชิกใหม่ล่าสุด ${userLink(st.nid, st.nname)}` : ''}</div>
  <div class="sec legend"><span class="ic new">${icon('forum')}</span>มีข้อความใหม่ <span class="ic">${icon('forum')}</span>ไม่มีข้อความใหม่
    <span class="ic pin">${icon('pin')}</span>ปักหมุด <span class="ic lock">${icon('lock')}</span>ล็อกแล้ว</div>
</section>`,
  });
}

// ---------------- a forum ----------------
const TOPIC_COLS = `t.*, u.name AS author, u.role AS arole,
  lp.created_at AS lp_at, lu.id AS lp_uid, lu.name AS lp_user, lu.role AS lp_role,
  (t.last_post_at > MAX(COALESCE(r.at, 0), ?3)) AS unread`;
const TOPIC_FROM = `topics t JOIN users u ON u.id = t.user_id
  LEFT JOIN posts lp ON lp.id = t.last_post_id LEFT JOIN users lu ON lu.id = lp.user_id
  LEFT JOIN reads r ON r.topic_id = t.id AND r.user_id = ?2`;

function topicRow(t, at) {
  const [name, cls] = t.kind === 2 ? ['announce', 'ann'] : t.kind === 1 ? ['pin', 'pin'] : t.locked ? ['lock', 'lock'] : ['topic', t.unread ? 'new' : ''];
  const st = t.status === 'pending' ? '<span class="stl pending">รอตรวจ</span>' : t.status === 'hidden' ? '<span class="stl hidden">ถูกซ่อน</span>' : '';
  return `<div class="tr${t.status !== 'ok' ? ' dim' : ''}">
    <div class="main"><span class="ic ${cls}">${icon(name)}</span>
      <div class="tbody"><div class="tt">${tagHtml(t.tag)}<a href="/t/${t.id}">${esc(t.title)}</a>${t.unread && !t.kind ? '<span class="newtag">ใหม่</span>' : ''}${t.pics ? `<span class="pics">(${t.pics} รูป)</span>` : ''}${st}${miniPager(t.id, t.replies + 1)}</div>
      <div class="by">${userLink(t.user_id, t.author, t.arole)} · ${when(t.created_at, at)}</div>
      <div class="mstats">ตอบ ${num(t.replies)} · อ่าน ${num(t.views)}${t.lp_at && t.replies ? ` · ล่าสุด ${when(t.lp_at, at)}` : ''}</div></div></div>
    <div class="n">${num(t.replies)}</div><div class="n">${num(t.views)}</div>
    <div class="last">${t.last_post_id ? `<a href="/p/${t.last_post_id}" title="ไปที่ความคิดเห็นล่าสุด">${when(t.lp_at, at)}</a><br>${userLink(t.lp_uid, t.lp_user, t.lp_role)}` : '<span class="muted">-</span>'}</div>
  </div>`;
}
const topicTable = (head, rows, at) => `<section class="tbl topics">
  <div class="thd"><span>${head}</span><span>ตอบ</span><span>อ่าน</span><span>ล่าสุด</span></div>
  ${rows.map((t) => topicRow(t, at)).join('')}
</section>`;

export async function forum(c, slug) {
  const { env, user } = c;
  const f = await forumBySlug(env, slug);
  if (!f) return notFound(c);
  const mod = isMod(user) ? 1 : 0;
  const uid = user?.id || 0;
  const at = now();
  const mark = markOf(c);
  const [pinned, waiting, mods] = await env.DB.batch([
    env.DB.prepare(`SELECT ${TOPIC_COLS} FROM ${TOPIC_FROM} WHERE t.forum_id = ?1 AND t.status = 'ok' AND t.kind > 0
      ORDER BY t.kind DESC, t.last_post_at DESC`).bind(f.id, uid, mark),
    // topics waiting for a moderator or hidden: a moderator sees them all, a member their own; few, so read apart
    env.DB.prepare(`SELECT ${TOPIC_COLS} FROM ${TOPIC_FROM} WHERE t.forum_id = ?1 AND t.status IN ('pending','hidden') AND (?4 OR t.user_id = ?2)
      ORDER BY t.last_post_at DESC LIMIT 50`).bind(f.id, uid, mark, mod),
    env.DB.prepare("SELECT id, name, role FROM users WHERE role IN ('admin','mod') ORDER BY role, id"),
  ]);
  // forums.topics counts the approved topics, pinned ones too
  const total = Math.max(0, f.topics - pinned.results.length);
  const pages = Math.max(1, Math.ceil(total / PER_FORUM));
  const page = Math.min(pageOf(c), pages);
  const { results: approved } = await env.DB.prepare(`SELECT ${TOPIC_COLS} FROM ${TOPIC_FROM}
      WHERE t.forum_id = ?1 AND t.status = 'ok' AND t.kind = 0 ORDER BY t.last_post_at DESC LIMIT ?4 OFFSET ?5`)
    .bind(f.id, uid, mark, PER_FORUM, (page - 1) * PER_FORUM).all();
  const rows = page === 1 ? [...waiting.results, ...approved] : approved;

  const canPost = user && !isBanned(user);
  const newBtn = canPost ? `<a class="btn new" href="/new/${f.slug}">ตั้งกระทู้</a>`
    : user ? '' : `<a class="btn new" href="/login?back=${encodeURIComponent(`/new/${f.slug}`)}">ตั้งกระทู้</a>`;
  const bar = (where) => `<div class="actions">${newBtn}${where === 'top'
    ? `<form class="inline find" action="/search"><input type="hidden" name="f" value="${f.slug}"><input name="q" placeholder="ค้นหาในห้องนี้" aria-label="ค้นหาในห้องนี้"><button class="btn">ค้นหา</button></form>` : ''}
    <span class="sp"></span><span class="muted">${num(total)} กระทู้${pages > 1 ? ` · หน้า ${page}/${pages}` : ''}</span>${pager(`/f/${f.slug}`, page, pages)}</div>`;

  return layout(c, {
    title: f.title, desc: f.descr, crumbs: [{ label: f.title }],
    body: `<h1 class="ft">${esc(f.title)}</h1>
<div class="mods">${esc(f.descr)} · ผู้ดูแล ${mods.results.length ? mods.results.map((m) => userLink(m.id, m.name, m.role)).join(', ') : '-'}</div>
${f.rules ? `<div class="rules"><b>กฎของห้อง</b>${esc(f.rules)}</div>` : ''}
${bar('top')}
${pinned.results.length ? topicTable('ประกาศ / ปักหมุด', pinned.results, at) : ''}
${rows.length ? topicTable('กระทู้', rows, at)
  : `<section class="tbl topics"><div class="thd"><span>กระทู้</span></div><div class="empty">ยังไม่มีกระทู้ในห้องนี้</div></section>`}
${rows.length > 10 ? bar('bottom') : ''}`,
  });
}

// ---------------- a topic ----------------
const POST_SEEN = `(p.status = 'ok' OR (?2 AND p.status IN ('pending','hidden')) OR (p.user_id = ?3 AND p.status IN ('pending','hidden')))`;

export async function topic(c, id) {
  const { env, user, ctx } = c;
  const t = await topicById(env, +id);
  const mod = isMod(user);
  if (!t || !canSee(user, t, mod)) return notFound(c);
  const uid = user?.id || 0;
  // approved posts are counted on the topic already (replies + the first); what waits or was hidden is counted here
  const total = t.status === 'ok'
    ? t.replies + 1 + (await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE p.topic_id = ?1 AND p.status IN ('pending','hidden') AND (?2 OR p.user_id = ?3)`)
      .bind(t.id, mod ? 1 : 0, uid).first()).n
    : (await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE p.topic_id = ?1 AND ${POST_SEEN}`).bind(t.id, mod ? 1 : 0, uid).first()).n;
  const pages = Math.max(1, Math.ceil(total / PER_TOPIC));
  const page = c.url.searchParams.get('page') === 'last' ? pages : Math.min(pageOf(c), pages);
  const { results: posts } = await env.DB.prepare(`
    SELECT p.*, u.id AS uid, u.name, u.role, u.oshi, u.sig, u.color, u.avatar, u.posts AS uposts, u.created_at AS joined
      FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.topic_id = ?1 AND ${POST_SEEN} ORDER BY p.id LIMIT ?4 OFFSET ?5`)
    .bind(t.id, mod ? 1 : 0, uid, PER_TOPIC, (page - 1) * PER_TOPIC).all();

  ctx.waitUntil(env.DB.batch([
    env.DB.prepare('UPDATE topics SET views = views + 1 WHERE id = ?').bind(t.id),
    ...(user ? [env.DB.prepare(`INSERT INTO reads (user_id, topic_id, at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, topic_id) DO UPDATE SET at = excluded.at`).bind(user.id, t.id, now())] : []),
  ]));

  const at = now();
  const here = encodeURIComponent(c.url.pathname + c.url.search);
  const canReply = user && !isBanned(user) && t.status === 'ok' && (!t.locked || mod);
  const postHtml = (p, i) => {
    const n = (page - 1) * PER_TOPIC + i + 1;
    const mine = user && p.user_id === user.id;
    const canEdit = user && !isBanned(user) && (mine || mod) && (!t.locked || mod);
    const acts = [
      canReply ? `<a class="b" href="/t/${t.id}/reply?quote=${p.id}">อ้างอิง</a>` : '',
      canEdit ? `<a class="b" href="/p/${p.id}/edit">แก้ไข</a>` : '',
      canEdit ? `<form method="post" action="/p/${p.id}/delete" class="inline" data-confirm="${p.id === t.first_post_id ? 'ลบกระทู้นี้ทั้งกระทู้?' : 'ลบข้อความนี้?'}"><button class="b">ลบ</button></form>` : '',
      user && !mine && p.status === 'ok' ? `<a class="b" href="/p/${p.id}/report">แจ้งลบ</a>` : '',
      mod && p.status !== 'ok' ? `<form method="post" action="/mod/act" class="inline"><input type="hidden" name="act" value="approve"><input type="hidden" name="post" value="${p.id}"><input type="hidden" name="back" value="${esc(c.url.pathname + c.url.search)}#p${p.id}"><button class="b ok">ให้ผ่าน</button></form>` : '',
    ].join('');
    const note = p.status === 'pending' ? `<div class="stnote pending">รอผู้ดูแลตรวจ${p.flag ? ` (${esc(p.flag)})` : ''} ตอนนี้เห็นแค่คุณกับผู้ดูแล</div>`
      : p.status === 'hidden' ? `<div class="stnote hidden">ถูกซ่อนไว้ระหว่างตรวจสอบ (แจ้งลบ ${p.reports} ครั้ง)</div>` : '';
    const first = p.id === t.first_post_id;
    return `<article class="post${p.status !== 'ok' ? ' dim' : ''}" id="p${p.id}">
  <div class="phead"><span class="lab${first ? ' first' : ''}">${first ? 'เจ้าของกระทู้' : `ความคิดเห็นที่ ${n - 1}`}</span><span>${when(p.created_at, at)}${p.edited_at ? ` · <span title="แก้ไขเมื่อ ${clockTh(p.edited_at)}">แก้ไขแล้ว</span>` : ''}</span><a href="/p/${p.id}" class="pn">#${n}</a></div>
  ${userPanel({ uid: p.uid, name: p.name, role: p.role, oshi: p.oshi, color: p.color, avatar: p.avatar, posts: p.uposts, joined: p.joined })}
  <div class="pbody">
    ${note}
    <div class="ptext">${render(p.body)}</div>
    ${p.sig ? `<div class="sig">${esc(p.sig)}</div>` : ''}
    ${acts ? `<div class="pacts">${acts}</div>` : ''}
  </div>
</article>`;
  };

  const forums = mod ? (await env.DB.prepare('SELECT id, title FROM forums ORDER BY cat_id, sort').all()).results : [];
  const modBar = mod ? `<form method="post" action="/mod/act" class="modbar">
    <input type="hidden" name="topic" value="${t.id}"><input type="hidden" name="back" value="${esc(c.url.pathname + c.url.search)}">
    <b>จัดการกระทู้</b>
    <select name="act" aria-label="การจัดการ">
      <option value="${t.locked ? 'unlock' : 'lock'}">${t.locked ? 'ปลดล็อก' : 'ล็อกกระทู้'}</option>
      ${t.kind !== 0 ? '<option value="normal">เลิกปักหมุด</option>' : ''}${t.kind !== 1 ? '<option value="sticky">ปักหมุด</option>' : ''}${t.kind !== 2 ? '<option value="announce">ทำเป็นประกาศ</option>' : ''}
      <option value="move">ย้ายไปห้อง</option>
      <option value="deltopic">ลบทั้งกระทู้</option>
    </select>
    <select name="forum" aria-label="ห้องที่จะย้ายไป">${forums.map((f) => `<option value="${f.id}"${f.id === t.forum_id ? ' selected' : ''}>${esc(f.title)}</option>`).join('')}</select>
    <button class="btn">ตกลง</button></form>` : '';

  const replyBtn = canReply ? `<a class="btn new" href="/t/${t.id}/reply">ตอบกระทู้</a>`
    : !user ? `<a class="btn new" href="/login?back=${here}">ตอบกระทู้</a>` : t.locked ? '<span class="btn dis">กระทู้นี้ล็อกแล้ว</span>' : '';
  const bar = `<div class="actions">${replyBtn}<span class="sp"></span><span class="muted">${num(Math.max(0, total - 1))} ความคิดเห็น${pages > 1 ? ` · หน้า ${page}/${pages}` : ''}</span>${pager(`/t/${t.id}`, page, pages)}</div>`;
  const first = posts.find((p) => p.id === t.first_post_id);

  return layout(c, {
    title: t.title, desc: first ? plain(first.body).slice(0, 150) : '',
    crumbs: [{ href: `/f/${t.slug}`, label: t.ftitle }, { label: t.title }],
    body: `<h1 class="ft">${tagHtml(t.tag)}${esc(t.title)}${t.locked ? ' <span class="muted">(ล็อกแล้ว)</span>' : ''}</h1>
${t.status !== 'ok' ? `<div class="stnote ${t.status}">${t.status === 'pending' ? 'กระทู้นี้รอผู้ดูแลตรวจ ตอนนี้เห็นแค่คุณกับผู้ดูแล' : 'กระทู้นี้ถูกซ่อนไว้ระหว่างตรวจสอบ'}</div>` : ''}
${bar}
${modBar}
${posts.map(postHtml).join('\n')}
${posts.length > 3 ? bar : ''}
${canReply ? `<section class="reply"><h2>ตอบกระทู้</h2>${editor({ action: `/t/${t.id}/reply`, quick: true, forum: t, submit: 'ส่งความคิดเห็น', pics: !!c.env.IMAGES })}</section>`
  : !user ? `<div class="box center">อยากร่วมคุยด้วย <a href="/login?back=${here}">เข้าสู่ระบบ</a> หรือ <a href="/register">สมัครสมาชิก</a> ก่อนนะ</div>`
  : isBanned(user) ? `<div class="box center">บัญชีนี้ถูกระงับการโพสต์ถึง ${dateTh(user.banned_until)}</div>` : ''}`,
  });
}

// /p/<id>: the page of its topic where a post sits
export async function post(c, id) {
  const { env, user } = c;
  const p = await env.DB.prepare('SELECT id, topic_id, user_id, status FROM posts WHERE id = ?').bind(+id).first();
  const mod = isMod(user);
  if (!p || !canSee(user, p, mod)) return notFound(c);
  const before = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE p.topic_id = ?1 AND p.id < ?4 AND ${POST_SEEN}`)
    .bind(p.topic_id, mod ? 1 : 0, user?.id || 0, p.id).first()).n;
  const page = Math.floor(before / PER_TOPIC) + 1;
  const m = c.url.searchParams.get('m');
  const q = [page > 1 ? `page=${page}` : '', m ? `m=${encodeURIComponent(m)}` : ''].filter(Boolean).join('&');
  return Response.redirect(`${c.url.origin}/t/${p.topic_id}${q ? `?${q}` : ''}#p${p.id}`, 302);
}

// ---------------- a member ----------------
export async function profile(c, id) {
  const { env, user } = c;
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(+id).first();
  if (!u) return notFound(c);
  const { results: recent } = await env.DB.prepare(`
    SELECT p.id, p.body, p.created_at, t.id AS tid, t.title FROM posts p JOIN topics t ON t.id = p.topic_id
     WHERE p.user_id = ? AND p.status = 'ok' AND t.status = 'ok' ORDER BY p.id DESC LIMIT 15`).bind(u.id).all();
  const at = now();
  const back = esc(`/u/${u.id}`);
  const modTools = isMod(user) && user.id !== u.id && (isAdmin(user) || u.role === 'user') ? `<section class="box">
    <h2>สำหรับผู้ดูแล</h2>
    ${u.avatar ? `<form method="post" action="/mod/act" data-confirm="ลบรูปโปรไฟล์ของ ${esc(u.name)}?"><input type="hidden" name="act" value="unavatar"><input type="hidden" name="user" value="${u.id}"><input type="hidden" name="back" value="${back}"><button class="btn">ลบรูปโปรไฟล์</button></form>` : ''}
    ${u.banned_until > at ? `<p>ระงับการโพสต์ถึง <b>${clockTh(u.banned_until)}</b>${u.ban_reason ? ` · ${esc(u.ban_reason)}` : ''}</p>
      <form method="post" action="/mod/act"><input type="hidden" name="act" value="unban"><input type="hidden" name="user" value="${u.id}"><input type="hidden" name="back" value="${back}"><button class="btn">ยกเลิกการระงับ</button></form>`
    : `<form method="post" action="/mod/act" class="row">
      <input type="hidden" name="act" value="ban"><input type="hidden" name="user" value="${u.id}"><input type="hidden" name="back" value="${back}">
      <select name="days" aria-label="ระยะเวลา"><option value="1">1 วัน</option><option value="7" selected>7 วัน</option><option value="30">30 วัน</option><option value="36500">ถาวร</option></select>
      <input name="reason" maxlength="100" placeholder="เหตุผล (ไม่บังคับ)" aria-label="เหตุผล"><button class="btn new">ระงับการโพสต์</button></form>`}
    ${isAdmin(user) ? `<form method="post" action="/mod/act" class="row">
      <input type="hidden" name="act" value="role"><input type="hidden" name="user" value="${u.id}"><input type="hidden" name="back" value="${back}">
      <select name="role" aria-label="บทบาท">${[['user', 'สมาชิก'], ['mod', 'ผู้ดูแล'], ['admin', 'แอดมิน']].map(([k, th]) => `<option value="${k}"${u.role === k ? ' selected' : ''}>${th}</option>`).join('')}</select>
      <button class="btn">เปลี่ยนบทบาท</button></form>` : ''}
  </section>` : '';

  return layout(c, {
    title: u.name, crumbs: [{ href: '/members', label: 'รายชื่อสมาชิก' }, { label: u.name }],
    body: `<section class="profile box">
  ${avatar(u, 'big')}
  <div><h1 class="ft">${esc(u.name)}</h1>${rankHtml(u)} ${oshiHtml(u.oshi)}
  <p class="facts"><span>โพสต์ <b>${num(u.posts)}</b></span><span>สมาชิกตั้งแต่ ${dateTh(u.created_at)}</span><span>เข้ามาล่าสุด ${u.last_seen ? when(u.last_seen, at) : '-'}</span></p>
  ${u.sig ? `<p class="sig">${esc(u.sig)}</p>` : ''}</div>
</section>
${modTools}
<section class="tbl list">
  <div class="thd"><span>โพสต์ล่าสุด</span></div>
  ${recent.length ? recent.map((p) => `<div class="tr1"><a href="/p/${p.id}">${esc(p.title)}</a><span class="muted"> · ${when(p.created_at, at)}</span><div class="snip">${esc(plain(p.body).slice(0, 160))}</div></div>`).join('')
    : '<div class="empty">ยังไม่มีโพสต์</div>'}
</section>`,
  });
}

export async function members(c) {
  const { env } = c;
  const total = (await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM users').first()).n;   // no account is ever deleted
  const per = 50;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pageOf(c), pages);
  const { results } = await env.DB.prepare('SELECT id, name, role, oshi, posts, color, avatar, created_at FROM users ORDER BY posts DESC, id LIMIT ? OFFSET ?')
    .bind(per, (page - 1) * per).all();
  return layout(c, {
    title: 'รายชื่อสมาชิก', crumbs: [{ label: 'รายชื่อสมาชิก' }],
    body: `<h1 class="ft">รายชื่อสมาชิก</h1>
<div class="actions"><span class="muted">${num(total)} คน</span><span class="sp"></span>${pager('/members', page, pages)}</div>
<section class="tbl members">
  <div class="thd"><span>สมาชิก</span><span>โอชิ</span><span>โพสต์</span><span>สมาชิกตั้งแต่</span></div>
  ${results.map((u) => `<div class="tr">
    <div class="main">${avatar(u)}<div><div class="tt">${userLink(u.id, u.name, u.role)}</div>${rankHtml(u)}</div></div>
    <div class="n">${esc(u.oshi) || '<span class="muted">-</span>'}</div><div class="n">${num(u.posts)}</div><div class="n">${dateTh(u.created_at)}</div></div>`).join('')}
</section>`,
  });
}

// ---------------- search ----------------
const SEARCH_COLS = 'p.id, p.body, p.created_at, t.title, u.id AS uid, u.name, u.role';
// Three letters or more go through the trigram index (posts and titles, newest first); two letters, which the
// index cannot hold, are looked for in the latest 3,000 posts.
async function findPosts(env, q, fid) {
  if ([...q].length >= 3) {
    const phrase = `"${q.replace(/"/g, '""')}"`;
    const [byBody, byTitle] = await env.DB.batch([
      env.DB.prepare(`SELECT ${SEARCH_COLS}
        FROM (SELECT rowid FROM post_fts WHERE post_fts MATCH ?1 ORDER BY rowid DESC LIMIT 300) h
        JOIN posts p ON p.id = h.rowid JOIN topics t ON t.id = p.topic_id JOIN users u ON u.id = p.user_id
        WHERE p.status = 'ok' AND t.status = 'ok' AND (?2 = 0 OR t.forum_id = ?2) ORDER BY p.id DESC LIMIT 30`).bind(phrase, fid),
      env.DB.prepare(`SELECT ${SEARCH_COLS}
        FROM (SELECT rowid FROM topic_fts WHERE topic_fts MATCH ?1 ORDER BY rowid DESC LIMIT 100) h
        JOIN topics t ON t.id = h.rowid JOIN posts p ON p.id = t.first_post_id JOIN users u ON u.id = p.user_id
        WHERE p.status = 'ok' AND t.status = 'ok' AND (?2 = 0 OR t.forum_id = ?2) ORDER BY p.id DESC LIMIT 30`).bind(phrase, fid),
    ]);
    const seen = new Map();
    for (const r of [...byBody.results, ...byTitle.results]) seen.set(r.id, r);
    return [...seen.values()].sort((a, b) => b.id - a.id).slice(0, 30);
  }
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return (await env.DB.prepare(`SELECT ${SEARCH_COLS}
      FROM posts p JOIN topics t ON t.id = p.topic_id JOIN users u ON u.id = p.user_id
     WHERE p.id > (SELECT COALESCE(MAX(id), 0) FROM posts) - 3000 AND p.status = 'ok' AND t.status = 'ok' AND (?2 = 0 OR t.forum_id = ?2)
       AND (p.body LIKE ?1 ESCAPE '\\' OR (p.id = t.first_post_id AND t.title LIKE ?1 ESCAPE '\\'))
     ORDER BY p.id DESC LIMIT 30`).bind(like, fid).all()).results;
}

export async function search(c) {
  const { env } = c;
  const q = (c.url.searchParams.get('q') || '').trim().slice(0, 60);
  const slug = c.url.searchParams.get('f') || '';
  const f = slug ? await forumBySlug(env, slug) : null;
  let body = `<h1 class="ft">ค้นหา</h1>
<form class="actions find" action="/search"><input name="q" value="${esc(q)}" placeholder="คำที่ต้องการค้นหา" aria-label="คำค้นหา" autofocus>
  ${f ? `<input type="hidden" name="f" value="${f.slug}"><span class="muted">ในห้อง ${esc(f.title)} · <a href="/search?q=${encodeURIComponent(q)}">ค้นทั้งบอร์ด</a></span>` : ''}<button class="btn">ค้นหา</button></form>`;
  const qn = [...q].length;
  if (qn >= 2) {
    const results = await findPosts(env, q, f ? f.id : 0);
    const at = now();
    const mark = (txt) => {
      const lo = txt.toLowerCase(), ql = q.toLowerCase();
      let out = '', i = 0, j;
      while ((j = lo.indexOf(ql, i)) !== -1) { out += `${esc(txt.slice(i, j))}<mark>${esc(txt.slice(j, j + q.length))}</mark>`; i = j + q.length; }
      return out + esc(txt.slice(i));
    };
    const snip = (txt) => {
      const i = txt.toLowerCase().indexOf(q.toLowerCase());
      const from = Math.max(0, i - 60);
      return (from ? '…' : '') + txt.slice(from, from + 200) + (txt.length > from + 200 ? '…' : '');
    };
    body += `<section class="tbl list"><div class="thd"><span>พบ ${results.length}${results.length === 30 ? '+' : ''} ข้อความ</span></div>
      ${results.length ? results.map((r) => `<div class="tr1"><a href="/p/${r.id}">${mark(r.title)}</a><span class="muted"> · โดย ${userLink(r.uid, r.name, r.role)} · ${when(r.created_at, at)}</span>
        <div class="snip">${mark(snip(plain(r.body)))}</div></div>`).join('') : '<div class="empty">ไม่พบข้อความที่ตรงกัน</div>'}</section>`;
    if (qn === 2) body += '<p class="muted center">คำ 2 ตัวอักษรค้นได้เฉพาะโพสต์ล่าสุด พิมพ์ให้ยาวขึ้นเพื่อค้นทั้งบอร์ด</p>';
  } else if (q) body += '<div class="box center">พิมพ์อย่างน้อย 2 ตัวอักษร</div>';
  return layout(c, { title: q ? `ค้นหา: ${q}` : 'ค้นหา', crumbs: [{ label: 'ค้นหา' }], noindex: true, body });
}

export async function unread(c) {
  const { env, user } = c;
  if (!user) return Response.redirect(`${c.url.origin}/login?back=%2Funread`, 302);
  const at = now();
  const { results } = await env.DB.prepare(`SELECT ${TOPIC_COLS} FROM ${TOPIC_FROM}
     WHERE t.status = 'ok' AND t.last_post_at > ?3 AND (r.at IS NULL OR r.at < t.last_post_at)
     ORDER BY t.last_post_at DESC LIMIT 50`).bind(0, user.id, markOf(c)).all();
  return layout(c, {
    title: 'กระทู้ที่ยังไม่ได้อ่าน', crumbs: [{ label: 'กระทู้ที่ยังไม่ได้อ่าน' }], noindex: true,
    body: `<h1 class="ft">กระทู้ที่ยังไม่ได้อ่าน</h1>
<div class="actions"><form method="post" action="/markread" class="inline"><button class="btn">อ่านแล้วทั้งหมด</button></form></div>
${results.length ? topicTable('กระทู้', results, at) : '<div class="box center">ไม่มีกระทู้ใหม่ที่ยังไม่ได้อ่าน</div>'}`,
  });
}

export function faq(c) {
  return layout(c, {
    title: 'กติกา & คำถามที่พบบ่อย', crumbs: [{ label: 'กติกา & FAQ' }],
    desc: 'กติกาการใช้บอร์ด 48thForum และวิธีโพสต์',
    body: `<h1 class="ft">กติกา & คำถามที่พบบ่อย</h1>
<section class="box prose">
<h2 id="rules">กติกาบอร์ด</h2>
<p>ยินดีต้อนรับสู่ 48thForum สร้างขึ้นเพื่อพูดคุย รีวิวงาน และแลกเปลี่ยนกันอย่างสบายใจ<br>48thForum <b>ไม่ใช่ช่องทางทางการ</b>ของวงหรือต้นสังกัด</p>
<ol>
<li><b>เคารพเมมเบอร์</b> ไม่พูดจาดูถูกหรือตั้งกระทู้และคอมเมนต์ในเชิงลบ</li>
<li><b>ไม่ละเมิดความเป็นส่วนตัวของเมมเบอร์</b> ห้ามโพสต์ที่อยู่ โรงเรียน ตารางชีวิตนอกงาน หรือรูปที่แอบถ่ายนอกงาน ห้ามชวนกันไปตามที่พักหรือสนามบิน</li>
<li><b>ไม่มีเนื้อหาทางเพศเกี่ยวกับเมมเบอร์</b> ทั้งข้อความ รูป และลิงก์ สมาชิกหลายคนยังอายุไม่ถึง 18 ปี ข้อนี้ระงับบัญชีถาวรทันที</li>
<li><b>เคารพแฟนคลับด้วยกัน</b> ชอบคนละคนได้ แต่ไม่ด่า ไม่แซะ ไม่ทะเลาะข้ามด้อม</li>
<li><b>ข่าวต้องมีที่มา</b> ข่าวลือให้บอกว่าเป็นข่าวลือ ข่าวจริงให้ใส่ลิงก์ที่มา ไม่ปล่อยข่าวปลอม</li>
<li><b>รูปและลิขสิทธิ์</b><ul>
  <li>ไม่ลงไฟล์เพลง วิดีโอ หรือลิงก์ละเมิดลิขสิทธิ์</li>
  <li>ไม่ลงคอนเทนต์ที่ต้องเสียเงินดูทั้งชุด</li>
  <li>รูปจากงานลงได้เฉพาะช่วงที่งานอนุญาตให้ถ่าย</li></ul></li>
<li><b>ซื้อขายแลกเปลี่ยน</b><ul>
  <li>โพสต์ในห้อง <a href="/f/trade">ซื้อขายแลกเปลี่ยน</a> เท่านั้น</li>
  <li>ขายของได้ทุกชนิด ของ Official, ของสะสมที่เกี่ยวข้อง, เทรดรูป</li>
  <li>ห้ามขายของปลอม</li>
  <li>นัดรับที่งานปลอดภัยที่สุด อย่าโอนเงินก่อนได้ของ</li>
  <li>บอร์ดไม่รับผิดชอบการซื้อขายระหว่างสมาชิก</li></ul></li>
<li><b>ไม่สแปม</b> ไม่ตั้งกระทู้ซ้ำ ไม่โฆษณาสิ่งที่ไม่เกี่ยวกับวง เลือกห้องให้ตรงเรื่อง และใช้ป้ายหัวข้อ (ถาม · รีวิว · หาเพื่อน …) ให้คนอื่นหาเจอง่าย</li>
<li><b>ดูแลข้อมูลของตัวเอง</b> ไม่ควรโพสต์เบอร์โทร เลขบัญชี หรือข้อมูลส่วนตัวไว้ให้ทุกคนเห็น โพสต์ที่มีข้อมูลพวกนี้จะรอผู้ดูแลตรวจก่อนขึ้นเสมอ</li>
</ol>
<h2>ระบบของบอร์ด</h2>
<ul>
<li>3 โพสต์แรกของบัญชีใหม่จะรอผู้ดูแลตรวจก่อนขึ้น ผ่านครบแล้วโพสต์จะขึ้นทันที</li>
<li>เจอโพสต์ผิดกติกา กด <b>แจ้งลบ</b> ใต้โพสต์นั้น ถ้ามีคนแจ้ง 3 คน โพสต์จะถูกซ่อนจนกว่าผู้ดูแลจะตรวจ</li>
<li>ผู้ดูแลลบโพสต์ ล็อกกระทู้ หรือระงับการโพสต์ได้ตามความหนักของเรื่อง: เตือน → ระงับ 1 / 7 / 30 วัน → ถาวร ข้อ 2 และข้อ 3 อาจระงับทันทีโดยไม่เตือนก่อน</li>
</ul>
<p>มีคำถามหรือข้อเสนอแนะ ตั้งกระทู้ในห้อง <a href="/f/feedback">ข้อเสนอแนะเว็บ</a> ได้เลย<br>ขอให้สนุกกับการพูดคุยนะ 💜</p>
<h2 id="format">จัดรูปแบบข้อความ</h2>
<table class="codes"><tr><td><code>[b]ตัวหนา[/b]</code></td><td><b>ตัวหนา</b></td></tr>
<tr><td><code>[i]ตัวเอียง[/i]</code></td><td><i>ตัวเอียง</i></td></tr>
<tr><td><code>[u]ขีดเส้นใต้[/u]</code></td><td><u>ขีดเส้นใต้</u></td></tr>
<tr><td><code>[s]ขีดฆ่า[/s]</code></td><td><s>ขีดฆ่า</s></td></tr>
<tr><td><code>[quote="ชื่อ"]ข้อความ[/quote]</code></td><td>กล่องอ้างอิง</td></tr>
<tr><td><code>[url=https://…]คำ[/url]</code></td><td>ลิงก์</td></tr></table>
<h2>แนบรูป</h2>
<p>กดปุ่ม แนบรูป ในช่องพิมพ์ เลือกได้ครั้งละหลายรูป โพสต์ละไม่เกิน 10 รูป รูปจะถูกย่อในเครื่องคุณก่อนส่ง และข้อมูลตำแหน่ง (GPS) ที่ติดมากับรูปถ่ายจะถูกลบออก
ห้ามโพสต์รูปที่ผิดกติกาข้อ 2, 3 และ 6 · รูปที่ไม่ได้ใช้ในโพสต์จะถูกลบภายในหนึ่งวัน และเมื่อโพสต์ถูกลบ รูปในโพสต์ก็ถูกลบด้วย</p>
<h2>ลืมรหัสผ่าน</h2>
<p>บอร์ดไม่เก็บอีเมล จึงยังรีเซ็ตเองไม่ได้ ติดต่อผู้ดูแลในห้อง “ข้อเสนอแนะเว็บ” จากบัญชีอื่น หรือช่องทางที่ผู้ดูแลประกาศไว้</p>
<h2>เกี่ยวกับ 48thForum</h2>
<p>บอร์ดที่แฟนทำกันเอง ไม่ใช่ช่องทางทางการของวงหรือต้นสังกัด · มีคำถามหรือข้อเสนอแนะ ตั้งกระทู้ในห้อง <a href="/f/feedback">ข้อเสนอแนะเว็บ</a> ได้เลย</p>
</section>`,
  });
}

