// The frame every page sits in, and the pieces pages share.
import { esc, num, dateTh, monthTh, initial } from './util.js';
import { isMod } from './auth.js';

export const ASSET_V = '6';                // bump when style.css or app.js changes
export const PER_FORUM = 25;
export const PER_TOPIC = 20;

// A topic's label, written in front of its title the way Thai boards do: [ถาม] …
export const TAGS = {
  q:      { th: 'ถาม',     c: 'tg-q' },
  review: { th: 'รีวิว',    c: 'tg-rv' },
  friend: { th: 'หาเพื่อน',  c: 'tg-fr' },
  news:   { th: 'ข่าว',     c: 'tg-nw' },
  swap:   { th: 'แลก',     c: 'tg-sw' },
  sell:   { th: 'ขาย',     c: 'tg-sl' },
  buy:    { th: 'ซื้อ',     c: 'tg-by' },
};
export const tagHtml = (t) => (TAGS[t] ? `<span class="tg ${TAGS[t].c}">[${TAGS[t].th}]</span>` : '');

// One set of small line icons, drawn for the board (no emoji in the board's own chrome).
const SPRITE = `<svg class="sprite" aria-hidden="true">
<symbol id="i-forum" viewBox="0 0 24 24"><path d="M4 4h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M16 8.5h4a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-1v3l-4-3h-4a2 2 0 0 1-2-2v-1"/></symbol>
<symbol id="i-topic" viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M7.5 9h9M7.5 12.5h6"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/></symbol>
<symbol id="i-announce" viewBox="0 0 24 24"><path d="M3 10v4h3l7 4V6L6 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
</svg>`;
export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const FLASH = {
  pending:  'ส่งแล้ว รอผู้ดูแลตรวจก่อนขึ้นนะ',
  welcome:  'สมัครเรียบร้อย ยินดีต้อนรับ · 3 โพสต์แรกจะรอผู้ดูแลตรวจก่อนขึ้น',
  login:    'เข้าสู่ระบบแล้ว',
  logout:   'ออกจากระบบแล้ว',
  saved:    'บันทึกแล้ว',
  reported: 'แจ้งลบแล้ว ผู้ดูแลจะเข้ามาดู',
  deleted:  'ลบแล้ว',
  done:     'เรียบร้อย',
  read:     'อ่านแล้วทั้งหมด',
};

// Ranks by posts, shown as words and five little bars, as boards always have.
export function rank(u) {
  if (u.role === 'admin') return { th: 'แอดมิน', c: 'rk-admin', lv: 5 };
  if (u.role === 'mod') return { th: 'ผู้ดูแล', c: 'rk-mod', lv: 5 };
  const n = u.posts || 0;
  if (n >= 500) return { th: 'ตำนาน', c: 'rk-4', lv: 4 };
  if (n >= 100) return { th: 'ขาประจำ', c: 'rk-3', lv: 3 };
  if (n >= 10) return { th: 'แฟนคลับ', c: 'rk-2', lv: 2 };
  return { th: 'สมาชิกใหม่', c: 'rk-1', lv: 1 };
}
export const rankHtml = (u) => {
  const r = rank(u);
  return `<span class="rank ${r.c}">${r.th}<i class="bars lv-${r.lv}" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b></i></span>`;
};
// a member's own picture, or a plain square with their first letter
export const avatar = (u, cls = '') => (u.avatar
  ? `<img class="ava ${cls}" src="/i/${esc(u.avatar)}" alt="" loading="lazy">`
  : `<span class="ava av-${(u.color ?? 0) % 8} ${cls}" aria-hidden="true">${esc(initial(u.name || '?'))}</span>`);
export const userLink = (id, name, role) =>
  `<a href="/u/${id}" class="${role === 'admin' ? 'nm-admin' : role === 'mod' ? 'nm-mod' : ''}">${esc(name)}</a>`;
export const oshiHtml = (o) => (o ? `<span class="oshi">โอชิ <b>${esc(o)}</b></span>` : '');

export function pager(base, page, pages, cls = '') {
  if (pages <= 1) return '';
  const sep = base.includes('?') ? '&' : '?';
  const href = (p) => (p === 1 ? base : `${base}${sep}page=${p}`);
  const want = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  let out = '', last = 0;
  for (const p of [...want].sort((a, b) => a - b)) {
    if (p - last > 1) out += '<span class="gap">…</span>';
    out += p === page ? `<b class="on">${p}</b>` : `<a href="${href(p)}">${p}</a>`;
    last = p;
  }
  if (page < pages) out += `<a href="${href(page + 1)}" aria-label="หน้าถัดไป">›</a>`;
  return `<nav class="pg ${cls}" aria-label="เลือกหน้า">${out}</nav>`;
}

// the small page links on a topic's row in a forum
export function miniPager(topicId, posts) {
  const pages = Math.ceil(posts / PER_TOPIC);
  if (pages <= 1) return '';
  const list = pages <= 5 ? [...Array(pages)].map((_, i) => i + 1) : [1, 2, 0, pages - 1, pages];
  return `<span class="mini">${list.map((p) => (p ? `<a href="/t/${topicId}${p > 1 ? `?page=${p}` : ''}">${p}</a>` : '<i>…</i>')).join('')}</span>`;
}

export function layout(c, { title = '', crumbs = [], body = '', desc = '', noindex = false, status = 200 }) {
  const u = c.user;
  const back = encodeURIComponent(c.url.pathname + c.url.search);
  const flash = FLASH[c.url.searchParams.get('m')];
  const crumbHtml = [`<a href="/">หน้าแรก</a>`, ...crumbs.map((x) => (x.href ? `<a href="${x.href}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`))]
    .join('<i class="sep">›</i>');
  const mod = isMod(u) ? `<a href="/mod" class="modlink">งานผู้ดูแล${c.modCount ? `<b>${c.modCount}</b>` : ''}</a>` : '';
  const out = `<form method="post" action="/logout" class="inline"><button class="linkbtn">ออกจากระบบ</button></form>`;
  // wide screens: the links in a row; phones: the same links folded under one button
  const me = u
    ? `${userLink(u.id, u.name, u.role).replace('<a ', '<a class="who" ')}<a href="/unread">กระทู้ที่ยังไม่ได้อ่าน</a><a href="/settings">ตั้งค่า</a>${mod}<a href="/faq">กติกา</a><a href="/members">สมาชิก</a>${out}`
    : `<a href="/faq">กติกา</a><a href="/members">สมาชิก</a><a href="/login?back=${back}">เข้าสู่ระบบ</a><a href="/register"><b>สมัครสมาชิก</b></a>`;
  const menu = u
    ? `<details class="menu-m"><summary>${esc(u.name)} ▾</summary><div class="drop">
        <a href="/u/${u.id}">โปรไฟล์ของฉัน</a><a href="/unread">กระทู้ที่ยังไม่ได้อ่าน</a><a href="/settings">ตั้งค่า</a>${mod}
        <a href="/faq">กติกา</a><a href="/members">สมาชิก</a>${out}</div></details>`
    : `<details class="menu-m"><summary>${icon('menu')}</summary><div class="drop">
        <a href="/login?back=${back}">เข้าสู่ระบบ</a><a href="/register"><b>สมัครสมาชิก</b></a><a href="/faq">กติกา</a><a href="/members">สมาชิก</a></div></details>`;
  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} - 48thForum` : '48thForum บอร์ดแฟนคลับ BNK48 · CGM48')}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#1E5F58">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap">
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
<script src="/app.js?v=${ASSET_V}" defer></script>
</head><body>${SPRITE}
<header class="top"><div class="in">
  <a href="/" class="logo" aria-label="48thForum หน้าแรก"><img class="mark" src="/logo.svg" width="38" height="38" alt=""><span>48th<b>Forum</b></span></a>
  <span class="sub">บอร์ดแฟนคลับ BNK48 · CGM48</span>
  <form class="search" action="/search" role="search"><input name="q" placeholder="ค้นหาในบอร์ด" aria-label="ค้นหาในบอร์ด" value="${esc(c.url.pathname === '/search' ? c.url.searchParams.get('q') || '' : '')}"><button>ค้นหา</button></form>
  <a class="search-m" href="/search" aria-label="ค้นหา">${icon('search')}</a>
</div></header>
<nav class="bar"><div class="in">
  <div class="crumb">${crumbHtml}</div>
  <div class="me">${me}</div>
  ${menu}
</div></nav>
<main class="in">
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
${body}
</main>
<footer class="in foot">48thForum — บอร์ดที่แฟนทำกันเอง ไม่เกี่ยวข้องกับวงหรือต้นสังกัด · <a href="/faq">กติกา</a> · <a href="/f/feedback">แจ้งปัญหา</a></footer>
</body></html>`;
  return new Response(html, { status, headers: c.headers({ 'Content-Type': 'text/html; charset=utf-8' }) });
}

export function message(c, title, text, { status = 200, link = null } = {}) {
  return layout(c, {
    title, status, noindex: true,
    body: `<div class="box msg"><h1 class="ft">${esc(title)}</h1><p>${text}</p>${
      link ? `<p><a class="btn" href="${link.href}">${esc(link.label)}</a></p>` : '<p><a class="btn" href="/">กลับหน้าแรก</a></p>'}</div>`,
  });
}

// the editor used for a new topic, a reply and an edit
export function editor({ action, body = '', title = null, tag = '', forum = null, submit = 'ส่ง', quick = false, error = '', pics = false }) {
  const tools = `<div class="tools" role="toolbar" aria-label="จัดรูปแบบ">
    <button type="button" data-bb="b" title="ตัวหนา"><b>B</b></button><button type="button" data-bb="i" title="ตัวเอียง"><i>I</i></button>
    <button type="button" data-bb="u" title="ขีดเส้นใต้"><u>U</u></button><button type="button" data-bb="s" title="ขีดฆ่า"><s>S</s></button>
    <button type="button" data-bb="quote" title="อ้างอิง">อ้างอิง</button><button type="button" data-bb="url" title="ใส่ลิงก์">ลิงก์</button>${
    pics ? `<button type="button" data-pic title="แนบรูป เลือกได้หลายรูป">แนบรูป</button><input type="file" accept="image/*" multiple hidden data-pic-input><span class="upl" role="status" aria-live="polite"></span>` : ''}</div>`;
  return `<form method="post" action="${action}" class="editor${quick ? ' quick' : ''}">
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  ${forum?.trade ? `<div class="warn"><b>ก่อนซื้อขาย</b>นัดรับที่งานจะปลอดภัยที่สุด อย่าโอนเงินก่อนได้ของ และห้ามขายบัตรเกินราคาหน้าบัตร</div>` : ''}
  ${title !== null ? `<label class="lbl" for="f-title">หัวข้อ</label>
  <div class="row"><select name="tag" aria-label="ป้ายหน้าหัวข้อ"><option value="">ไม่มีป้าย</option>${
    Object.entries(TAGS).map(([k, t]) => `<option value="${k}"${k === tag ? ' selected' : ''}>[${t.th}]</option>`).join('')}</select>
  <input id="f-title" name="title" maxlength="120" required value="${esc(title)}"></div>` : ''}
  ${quick ? '' : '<label class="lbl" for="f-body">ข้อความ</label>'}
  ${tools}
  <textarea id="f-body" name="body" rows="${quick ? 5 : 12}" maxlength="10000" required>${esc(body)}</textarea>
  <div class="hint"><a href="/faq#format">วิธีจัดรูปแบบข้อความ</a>${pics ? ' · แนบรูปได้โพสต์ละ 10 รูป' : ''}</div>
  <div class="actions end"><button class="btn" name="preview" value="1">ดูตัวอย่าง</button><button class="btn new">${esc(submit)}</button></div>
</form>`;
}

export function userPanel(u) {
  return `<aside class="puser">${avatar(u, 'big')}<div class="who"><div class="uname">${userLink(u.uid, u.name, u.role)}</div>
  ${rankHtml(u)}${oshiHtml(u.oshi)}
  <div class="facts"><span>โพสต์ ${num(u.posts)}</span><span>สมาชิกตั้งแต่ ${monthTh(u.joined)}</span></div></div></aside>`;
}

export { dateTh };
