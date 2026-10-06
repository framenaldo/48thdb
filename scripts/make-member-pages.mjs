#!/usr/bin/env node
/* A page of her own for every member, at /m/<id>:
 *   m/<id>.html            her profile as plain HTML — what search engines index
 *                          and what LINE, X and Facebook read for a link preview
 *   m/index.html           every member, by group, linking to each page
 *   photos/og/<id>.jpg     the 1200×630 preview image
 *   sitemap.xml            /, /m/ and every member page
 * The site itself is one page drawn by script, which crawlers barely see, and
 * its canonical is the home page — so without these a member's name finds
 * nothing. A shared link carries ?go and sends people straight on to her sheet
 * on the site; the bare /m/<id> stays a real page, for search.
 *
 * Reads the member list the site itself shows (seed + Firestore), so run it
 * after members change. Needs the site served locally (.claude/launch.json,
 * port 8823) and Chrome. Files that come out the same are left untouched.
 *   node scripts/make-member-pages.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE || 'http://localhost:8823/';
const ORIGIN = 'https://48thdb.com';
const PORT = 9556, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
await send('Page.navigate', { url: SITE + '?sw=off' }); await sleep(3000);
await send('Page.navigate', { url: SITE }); await sleep(6000);   // Firestore's member list has time to land
await run(`new Promise(r => { const w = () => (typeof shareLoad === 'function' && document.readyState === 'complete') ? r() : setTimeout(w, 200); w(); })`);
await run(`Promise.all(['600','700','800'].map(w => document.fonts.load(w + ' 40px "Noto Sans Thai"', 'กขABC')))`);
await run(`state.lang = 'th'; 0`);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const M_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const day = s => { if(!s) return ''; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return `${d} ${M_TH[m - 1]} ${y}`; };
let wrote = 0;
function put(rel, data){
  const f = join(ROOT, rel);
  if(existsSync(f) && Buffer.compare(readFileSync(f), Buffer.from(data)) === 0) return;
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); wrote++;
}

const people = JSON.parse(await run(`JSON.stringify(state.members.map(m => {
  const g = getGroup(m.groupId) || {}, t = getTeam(m.teamId);
  return { id:m.id, name:m.name, nick:nickName(m), th:m.nameTh || '', real:m.realName || '', realTh:m.realNameTh || '', group:g.name || '', color:g.color || '#E4457E',
    team:t ? t.name : '', gen:m.gen || null, birthday:m.birthday || '', height:m.height || null, blood:m.blood || '', hometown:m.hometown || '',
    hobby:m.hobby || '', likes:m.likes || '', facts:(m.facts || []).filter(Boolean), graduated:m.graduated || '', photo:m.photo || '',
    ge:(typeof GE_CANDIDATES !== 'undefined' && GE_CANDIDATES.includes(m.id)) };
}))`));

// preview images: her photo in a ring, her names, group and team
for(const p of people){
  const jpg = await run(`(async () => {
    const p = ${JSON.stringify(p)};
    const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#0E0A12'; g.fillRect(0, 0, W, H);
    shareGlow(g, 300, 315, 520, p.color, .38);
    shareGlow(g, 1050, 80, 420, '#2E8C82', .18);
    const cx = 300, cy = 315, r = 200;
    g.beginPath(); g.arc(cx, cy, r + 10, 0, Math.PI * 2); g.fillStyle = p.color; g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2A2230'; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    const im = p.photo ? await shareLoad(p.photo) : null;
    if(im){ const s = Math.max(r * 2 / im.width, r * 2 / im.height); g.drawImage(im, cx - im.width * s / 2, cy - im.height * s / 2, im.width * s, im.height * s); }
    else { g.fillStyle = '#fff'; g.font = '800 150px "Noto Sans Thai", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.name.slice(0, 1), cx, cy + 6); }
    g.restore();
    const x = 560, fit = (t, px, weight, max) => { let f = px; do { g.font = weight + ' ' + f + 'px "Noto Sans Thai", sans-serif'; f -= 2; } while(g.measureText(t).width > max && f > 20); };
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = p.color; g.font = '800 26px "Noto Sans Thai", sans-serif';
    g.fillText([p.group, p.team].filter(Boolean).join(' · ').toUpperCase(), x, 190);
    g.fillStyle = '#fff'; fit(p.name, 108, '800', 590); g.fillText(p.name, x, 300);
    g.fillStyle = 'rgba(255,255,255,.82)'; fit([p.th, p.realTh].filter(Boolean).join(' · '), 34, '700', 590);
    g.fillText([p.th, p.realTh].filter(Boolean).join(' · '), x, 356);
    const line = p.graduated ? 'จบการศึกษา ' + p.graduated.slice(0, 4) : (p.gen ? 'รุ่น ' + p.gen : '');
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 28px "Noto Sans Thai", sans-serif'; g.fillText(line, x, 404);
    const logo = await shareLogo('#ffffff');
    if(logo) g.drawImage(logo, x, 480, 118, 68);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 26px "Noto Sans Thai", sans-serif'; g.fillText('48thdb.com', x + 136, 524);
    return c.toDataURL('image/jpeg', .86);
  })()`);
  put(`photos/og/${p.id}.jpg`, Buffer.from(jpg.split(',')[1], 'base64'));
}

const CSS = `:root{--pink:#E4457E;--teal:#2E8C82;--ink:#231B2B;--soft:#6E6478;--line:#EADDE6;--card:#fff;--bg:#FBF5F8}
@media (prefers-color-scheme:dark){:root{--ink:#F4EEF6;--soft:#B6AABD;--line:#3A2F42;--card:#1E1824;--bg:#141018}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 'Noto Sans Thai',system-ui,sans-serif}
a{color:inherit}.wrap{max-width:720px;margin:0 auto;padding:20px 16px 48px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.top a{font-weight:800;text-decoration:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:0 4px 0 var(--line);padding:22px}
.hero{display:flex;gap:20px;align-items:center;flex-wrap:wrap}.hero img,.hero .ph{width:132px;height:132px;border-radius:50%;object-fit:cover;border:5px solid var(--c);background:var(--line);flex:none}
h1{margin:0;font-size:34px;line-height:1.15}.sub{margin:4px 0 10px;color:var(--soft)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{display:inline-block;padding:3px 12px;border-radius:99px;font-size:14px;font-weight:700;border:1px solid var(--line)}
.chip.g{background:var(--c);color:#fff;border-color:transparent}
.go{display:block;margin:20px 0 0;padding:14px 18px;border-radius:16px;background:var(--pink);color:#fff;text-align:center;font-weight:800;text-decoration:none;box-shadow:0 4px 0 #B32F60}
.go:active{transform:translateY(3px);box-shadow:0 1px 0 #B32F60}.go.alt{background:var(--card);color:var(--ink);border:1px solid var(--line);box-shadow:0 4px 0 var(--line);margin-top:10px}
dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;margin:18px 0 0;border:1px solid var(--line);border-radius:16px;overflow:hidden}
dl div{padding:10px 14px;border-bottom:1px solid var(--line)}dl div:nth-child(odd){border-right:1px solid var(--line)}dl div.w{grid-column:1/-1;border-right:0}
dt{font-size:13px;color:var(--soft)}dd{margin:0;font-weight:700}
h2{font-size:18px;margin:22px 0 8px}ul{margin:0;padding-left:20px}
.grp{margin-top:20px}.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.list a{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:14px;background:var(--card);text-decoration:none;box-shadow:0 2px 0 var(--line)}
.list img,.list .ph{width:36px;height:36px;border-radius:50%;object-fit:cover;background:var(--line);flex:none}.list b{display:block;line-height:1.2}.list small{color:var(--soft);font-size:12px}
.foot{margin-top:28px;font-size:13px;color:var(--soft);text-align:center}`;
const HEAD = (title, desc, url, img) => `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- Made by scripts/make-member-pages.mjs from the site's member list. -->
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="48thDb">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="th_TH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>`;
const photoSrc = p => !p.photo ? '' : p.photo.startsWith('data:') ? p.photo : '/' + p.photo.replace(/^\//, '');

for(const p of people){
  const url = `${ORIGIN}/m/${p.id}`, site = `/?m=${p.id}`;
  const who = `${p.name}${p.th ? ` (${p.th})` : ''}`;
  const unit = [p.group, p.team].filter(Boolean).join(' ');
  const desc = [`${who} ${p.graduated ? 'อดีตสมาชิก' : 'สมาชิก'} ${unit}${p.gen ? ` รุ่น ${p.gen}` : ''}`,
    p.realTh || p.real ? `ชื่อจริง ${[p.realTh, p.real && `(${p.real})`].filter(Boolean).join(' ')}` : '',
    p.birthday ? `เกิด ${day(p.birthday)}` : '', p.hometown ? `บ้านเกิด ${p.hometown}` : '',
    p.graduated ? `จบการศึกษา ${day(p.graduated)}` : ''].filter(Boolean).join(' · ');
  const rows = [['ชื่อเล่น', p.th], ['ชื่อจริง', p.realTh], ['ชื่อจริง (อังกฤษ)', p.real], ['วันเกิด', day(p.birthday)],
    ['ส่วนสูง', p.height ? p.height + ' ซม.' : ''], ['กรุ๊ปเลือด', p.blood], ['บ้านเกิด', p.hometown], ['รุ่น', p.gen],
    ['งานอดิเรก', p.hobby, 1], ['ชอบ', p.likes, 1], ['จบการศึกษา', day(p.graduated)]].filter(r => r[1]);
  const ld = { '@context':'https://schema.org', '@type':'Person', name:p.name, alternateName:[p.th, p.realTh, p.real].filter(Boolean),
    url, image: p.photo && !p.photo.startsWith('data:') ? ORIGIN + photoSrc(p) : `${ORIGIN}/photos/og/${p.id}.jpg`,
    ...(p.birthday ? { birthDate:p.birthday } : {}), ...(p.hometown ? { birthPlace:p.hometown } : {}),
    memberOf:{ '@type':'MusicGroup', name:p.group } };
  const img = photoSrc(p);
  put(`m/${p.id}.html`, `${HEAD(`${who} ${p.group} — โปรไฟล์ | 48thDb`, desc, url, `${ORIGIN}/photos/og/${p.id}.jpg`)}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>if(/[?&]go\\b/.test(location.search)) location.replace(${JSON.stringify(site)});</script>
</head><body><div class="wrap" style="--c:${esc(p.color)}">
<div class="top"><a href="/">48thDb</a><a href="/m/">สมาชิกทั้งหมด</a></div>
<main class="card">
  <div class="hero">${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" width="132" height="132">` : '<span class="ph"></span>'}
    <div><h1>${esc(p.name)}</h1><p class="sub">${esc([p.th, p.realTh].filter(Boolean).join(' · '))}</p>
    <div class="chips"><span class="chip g">${esc(p.group)}</span>${p.team ? `<span class="chip">${esc(p.team)}</span>` : ''}${p.gen ? `<span class="chip">รุ่น ${p.gen}</span>` : ''}${p.graduated ? '<span class="chip">จบการศึกษาแล้ว</span>' : ''}</div></div></div>
  <a class="go" href="${site}">ดูโปรไฟล์เต็ม งาน และสถิติบน 48thDb →</a>
  <dl>${rows.map(r => `<div${r[2] ? ' class="w"' : ''}><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>
  ${p.facts.length ? `<h2>เกร็ดน่ารู้</h2><ul>${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
  ${p.ge ? `<a class="go alt" href="/p/${p.id}">โปสเตอร์ Senbatsu General Election 2026 →</a>` : ''}
</main>
<p class="foot">48thDb · เว็บฐานข้อมูล BNK48 และ CGM48 ที่จัดทำโดยแฟนคลับ ไม่ใช่เว็บทางการ</p>
</div></body></html>
`);
}

// every member, by group: current first, graduates after
const groups = [...new Set(people.map(p => p.group))];
const sect = (title, list) => list.length ? `<section class="grp"><h2>${esc(title)} (${list.length})</h2><div class="list">${list.map(p =>
  `<a href="/m/${p.id}">${photoSrc(p) && !p.photo.startsWith('data:') ? `<img src="${esc(photoSrc(p))}" alt="" loading="lazy" width="36" height="36">` : '<span class="ph"></span>'}<span><b>${esc(p.name)}</b><small>${esc(p.th)}${p.team && !p.graduated ? ' · ' + esc(p.team) : ''}</small></span></a>`).join('')}</div></section>` : '';
const byName = (a, b) => a.name.localeCompare(b.name);
put('m/index.html', `${HEAD('สมาชิก BNK48 และ CGM48 ทั้งหมด — 48thDb', 'รายชื่อสมาชิกและอดีตสมาชิก BNK48 และ CGM48 พร้อมโปรไฟล์ วันเกิด ส่วนสูง บ้านเกิด ทีม และรุ่น', `${ORIGIN}/m/`, `${ORIGIN}/og-image2.jpg`)}
</head><body><div class="wrap">
<div class="top"><a href="/">48thDb</a><a href="/members">เปิดในเว็บ →</a></div>
<h1>สมาชิก BNK48 และ CGM48</h1>
${groups.map(g => sect(g, people.filter(p => p.group === g && !p.graduated).sort(byName))).join('')}
${groups.map(g => sect(`อดีตสมาชิก ${g}`, people.filter(p => p.group === g && p.graduated).sort(byName))).join('')}
<p class="foot">48thDb · เว็บฐานข้อมูล BNK48 และ CGM48 ที่จัดทำโดยแฟนคลับ ไม่ใช่เว็บทางการ</p>
</div></body></html>
`);

put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${ORIGIN}/</loc></url>
<url><loc>${ORIGIN}/m/</loc></url>
${people.map(p => `<url><loc>${ORIGIN}/m/${p.id}</loc></url>`).join('\n')}
</urlset>
`);
console.log(`${people.length} members · ${wrote} files written`);
ws.close(); chrome.kill();
