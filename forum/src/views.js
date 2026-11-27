// The frame every page sits in, and the pieces pages share.
import { esc, num, dateTh, monthTh, initial } from './util.js';
import { isMod } from './auth.js';

export const ASSET_V = '4';                // bump when style.css or app.js changes
export const PER_FORUM = 25;
export const PER_TOPIC = 20;

export const TAGS = {
  q:      { th: 'ถาม',     c: 'tg-q' },
  review: { th: 'รีวิว',    c: 'tg-rv' },
  friend: { th: 'หาเพื่อน',  c: 'tg-fr' },
  news:   { th: 'ข่าว',     c: 'tg-nw' },
  swap:   { th: 'แลก',     c: 'tg-sw' },
  sell:   { th: 'ขาย',     c: 'tg-sl' },
  buy:    { th: 'ซื้อ',     c: 'tg-by' },
};
export const tagHtml = (t) => (TAGS[t] ? `<span class="tg ${TAGS[t].c}">${TAGS[t].th}</span>` : '');

const FLASH = {
  pending:  'ส่งแล้ว · โพสต์นี้จะขึ้นหลังผู้ดูแลตรวจ (3 โพสต์แรกของบัญชีใหม่ และโพสต์ที่มีเลขบัญชีหรือเบอร์โทร รอตรวจก่อนเสมอ)',
  welcome:  'ยินดีต้อนรับสู่ 48thForum! อ่านกติกาสักนิดก่อนโพสต์นะ · 3 โพสต์แรกจะรอผู้ดูแลตรวจก่อนขึ้น',
  login:    'เข้าสู่ระบบแล้ว',
  logout:   'ออกจากระบบแล้ว',
  saved:    'บันทึกแล้ว',
  reported: 'ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลบอร์ด',
  deleted:  'ลบแล้ว',
  done:     'เรียบร้อย',
  read:     'ทำเครื่องหมายว่าอ่านแล้วทั้งหมด',
};

export function rank(u) {
  if (u.role === 'admin') return { th: '👑 แอดมิน', c: 'rk-admin' };
  if (u.role === 'mod') return { th: '🛡️ ผู้ดูแล', c: 'rk-mod' };
  const n = u.posts || 0;
  if (n >= 500) return { th: '🏆 ตำนาน', c: 'rk-4' };
  if (n >= 100) return { th: '⭐ ขาประจำ', c: 'rk-3' };
  if (n >= 10) return { th: '🎫 แฟนคลับ', c: 'rk-2' };
  return { th: '🌱 สมาชิกใหม่', c: 'rk-1' };
}
export const avatar = (u, cls = '') => `<span class="ava av-${(u.color ?? 0) % 8} ${cls}">${esc(initial(u.name || '?'))}</span>`;
export const userLink = (id, name, role) =>
  `<a href="/u/${id}" class="${role === 'admin' ? 'nm-admin' : role === 'mod' ? 'nm-mod' : ''}">${esc(name)}</a>`;
export const oshiHtml = (o) => (o ? `<span class="oshi"><i></i>${esc(o)}</span>` : '');

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
  const crumbHtml = [`<a href="/">หน้าแรกบอร์ด</a>`, ...crumbs.map((x) => (x.href ? `<a href="${x.href}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`))]
    .join('<i class="sep">‹</i>');
  const me = u
    ? `<span>👤 ${userLink(u.id, u.name, u.role)}</span><a href="/unread">กระทู้ที่ยังไม่ได้อ่าน</a><a href="/settings">ตั้งค่า</a>${
        isMod(u) ? `<a href="/mod" class="modlink">🛡️ จัดการ${c.modCount ? ` <b>${c.modCount}</b>` : ''}</a>` : ''}`
    : `<a href="/login?back=${back}">เข้าสู่ระบบ</a><a href="/register">สมัครสมาชิก</a>`;
  const right = `<a href="/faq">กติกา & FAQ</a><a href="/members">รายชื่อสมาชิก</a>${
    u ? `<form method="post" action="/logout" class="inline"><button class="linkbtn">ออกจากระบบ</button></form>` : ''}`;
  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} · 48thForum` : '48thForum · เว็บบอร์ดแฟนคลับไอดอล')}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#3A2799">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=Bai+Jamjuree:wght@600;700&display=swap">
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
<script src="/app.js?v=${ASSET_V}" defer></script>
</head><body><div class="wrap">
<header class="head">
  <a href="/" class="logo" aria-label="48thForum หน้าแรก"><img class="mark" src="/mark.svg" width="40" height="40" alt=""><span>48th<b>Forum</b></span></a>
  <div class="tagline"><div class="t">เว็บบอร์ดแฟนคลับไอดอล BNK48 · CGM48</div><div class="d">ที่คุยของแฟนทุกโอชิ · ทำโดยแฟน เพื่อแฟน</div></div>
  <form class="search" action="/search" role="search"><input name="q" placeholder="ค้นหาในบอร์ด…" aria-label="ค้นหาในบอร์ด" value="${esc(c.url.pathname === '/search' ? c.url.searchParams.get('q') || '' : '')}"><button>ค้นหา</button></form>
</header>
<nav class="navbar">
  <div class="r1 crumb">⌂ ${crumbHtml}</div>
  <div class="r2"><div class="me">${me}</div><div class="links">${right}</div></div>
</nav>
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<main>${body}</main>
<footer class="foot">48thForum · เว็บบอร์ดที่แฟนทำกันเอง ไม่ใช่ช่องทางทางการของวงหรือต้นสังกัด · <a href="/faq">กติกา & คำถามที่พบบ่อย</a></footer>
</div></body></html>`;
  return new Response(html, { status, headers: c.headers({ 'Content-Type': 'text/html; charset=utf-8' }) });
}

export function message(c, title, text, { status = 200, link = null } = {}) {
  return layout(c, {
    title, status, noindex: true,
    body: `<div class="box msg"><h1 class="ft">${esc(title)}</h1><p>${text}</p>${
      link ? `<p><a class="btn" href="${link.href}">${esc(link.label)}</a></p>` : '<p><a class="btn" href="/">กลับหน้าแรกบอร์ด</a></p>'}</div>`,
  });
}

// the editor used for a new topic, a reply and an edit
export function editor({ action, body = '', title = null, tag = '', forum = null, submit = 'ส่งข้อความ', quick = false, error = '', pics = false }) {
  const tools = `<div class="tools" role="toolbar" aria-label="จัดรูปแบบ">
    <button type="button" data-bb="b" title="ตัวหนา"><b>B</b></button><button type="button" data-bb="i" title="ตัวเอียง"><i>i</i></button>
    <button type="button" data-bb="u" title="ขีดเส้นใต้"><u>U</u></button><button type="button" data-bb="s" title="ขีดฆ่า"><s>S</s></button>
    <button type="button" data-bb="quote" title="อ้างอิง">“ ”</button><button type="button" data-bb="url" title="ใส่ลิงก์">🔗 ลิงก์</button>${
    pics ? `<button type="button" data-pic title="แนบรูป (ได้ครั้งละหลายรูป)">📷 รูป</button><input type="file" accept="image/*" multiple hidden data-pic-input><span class="upl" role="status" aria-live="polite"></span>` : ''}</div>`;
  return `<form method="post" action="${action}" class="editor${quick ? ' quick' : ''}">
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  ${forum?.trade ? `<div class="warn"><b>⚠️ ก่อนซื้อขาย</b>นัดรับที่งานปลอดภัยที่สุด อย่าโอนเงินก่อนได้ของ และห้ามขายบัตรเกินราคาหน้าบัตร · โพสต์ที่มีเลขบัญชีหรือเบอร์โทรจะรอผู้ดูแลตรวจก่อน</div>` : ''}
  ${title !== null ? `<label class="lbl" for="f-title">หัวข้อ</label>
  <div class="row"><select name="tag" aria-label="ป้ายหัวข้อ"><option value="">— ป้าย —</option>${
    Object.entries(TAGS).map(([k, t]) => `<option value="${k}"${k === tag ? ' selected' : ''}>${t.th}</option>`).join('')}</select>
  <input id="f-title" name="title" maxlength="120" required value="${esc(title)}" placeholder="หัวข้อกระทู้"></div>` : ''}
  ${quick ? '' : '<label class="lbl" for="f-body">ข้อความ</label>'}
  ${tools}
  <textarea id="f-body" name="body" rows="${quick ? 5 : 12}" maxlength="10000" required placeholder="พิมพ์ข้อความ…">${esc(body)}</textarea>
  <div class="hint">[b]หนา[/b] · [i]เอียง[/i] · [quote]อ้างอิง[/quote] · [url=https://…]ลิงก์[/url] · ลิงก์ที่วางไว้เฉย ๆ กดได้เอง${
    pics ? ' · 📷 รูปถูกย่อให้เล็กลงก่อนส่ง (ข้อมูลตำแหน่งในรูปถูกลบออก) ได้โพสต์ละ 10 รูป' : ''}</div>
  <div class="actions end"><button class="btn" name="preview" value="1">ดูตัวอย่าง</button><button class="btn new">${esc(submit)}</button></div>
</form>`;
}

export function userPanel(u) {
  const r = rank(u);
  return `<aside class="puser">${avatar(u, 'big')}<div class="who"><div class="uname">${userLink(u.uid, u.name, u.role)}</div>
  <span class="rank ${r.c}">${r.th}</span>${oshiHtml(u.oshi)}
  <div class="facts"><span>ข้อความ: ${num(u.posts)}</span><span>สมัครเมื่อ: ${monthTh(u.joined)}</span></div></div></aside>`;
}

export { dateTh };
