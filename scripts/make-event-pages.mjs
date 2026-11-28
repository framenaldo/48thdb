#!/usr/bin/env node
/* A plain page for every event and every release, for search engines and link previews:
 *   e/<id>.html     an event: its date, time, place, who is on, the timetable and details, the poster
 *   e/index.html    every event, upcoming first, then the past by month
 *   s/<id>.html     a release: its songs, who sings each, centres, and the YouTube, Spotify and Apple Music links
 *   s/index.html    every release, by group
 *   sitemap-pages.xml   all of the above (robots.txt names it beside sitemap.xml)
 * The site is one page drawn by script, which crawlers barely see: before these, Google sent
 * 27 visits a week. Like /m/<id> (scripts/make-member-pages.mjs) a shared link with ?go goes
 * straight on to the sheet on the site; the bare page stays a real page, for search.
 *
 * Reads what the site itself shows, so run it after the schedule or the songs change.
 * Needs the site served locally (.claude/launch.json, port 8823) and Chrome. Files that come out the same are left untouched.
 *   node scripts/make-event-pages.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE || 'http://localhost:8823/';
const ORIGIN = 'https://48thdb.com';
const PORT = 9557, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox'] : []),
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
await send('Page.navigate', { url: SITE + '?sw=off' }); await sleep(3000);
await send('Page.navigate', { url: SITE }); await sleep(6000);   // Firestore's member list and event-link corrections land
await run(`new Promise(r => { const w = () => (typeof SEED_SCHEDULE !== 'undefined' && document.readyState === 'complete') ? r() : setTimeout(w, 200); w(); })`);
await run(`state.lang = 'mix'; 0`);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const M_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const ymd = s => s.slice(0, 10).split('-').map(Number);
const day = s => { if(!s) return ''; const [y, m, d] = ymd(s); return `${d} ${M_TH[m - 1]} ${y}`; };
const dow = s => { const [y, m, d] = ymd(s); return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
const span = (a, b) => { if(!b || b === a) return `วัน${dow(a)}ที่ ${day(a)}`;
  const [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b);
  return y1 !== y2 ? `${day(a)} – ${day(b)}` : m1 !== m2 ? `${d1} ${M_TH[m1 - 1]} – ${d2} ${M_TH[m2 - 1]} ${y2}` : `${d1}–${d2} ${M_TH[m1 - 1]} ${y1}`; };
let wrote = 0;
function put(rel, data){
  const f = join(ROOT, rel);
  if(existsSync(f) && Buffer.compare(readFileSync(f), Buffer.from(data)) === 0) return;
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); wrote++;
}

const data = JSON.parse(await run(`JSON.stringify((() => {
  const gName = id => (getGroup(id) || {}).name || id;
  const who = ids => { const L = lineupGroups(ids || []);
    const head = L.all ? ['All Members'] : L.whole.map(g => 'All ' + g.name + ' Members');
    return { head, people: (L.rest || []).map(getMember).filter(Boolean).map(m => ({ id:m.id, name:nickName(m), group:gName(m.groupId) })) }; };
  const flat = v => (v == null ? [] : Array.isArray(v) ? v : [v]).map(x => typeof x === 'string' ? x : (x && (x.th || x.text || x.line)) || '').filter(Boolean);
  const events = SEED_SCHEDULE.filter(ev => ev && ev.id && ev.start).map(ev => ({
    id:ev.id, title:ev.title || '', start:ev.start, end:ev.end || '', time:ev.time || '', until:ev.until || '',
    venue:ev.venue || '', online:ev.online || '', period:!!ev.period, cancelled:!!ev.cancelled, postponed:!!ev.postponed,
    groups:(ev.groups || []).map(gName), who:who(ev.members), price:ev.price || '',
    poster: ev.poster && ev.poster.img ? { img:ev.poster.img, w:ev.poster.w, h:ev.poster.h, accent:ev.poster.accent || '' } : null,
    detail:flat(ev.detail), info:flat(ev.info),
    sections:(ev.sections || []).map(s => ({ head:s.head || '', lines:flat(s.lines) })).filter(s => s.lines.length),
    links:(typeof eventLinksFor === 'function' ? eventLinksFor(ev) : (ev.links || [])).filter(l => l && l.url).map(l => ({ label:l.label || l.url, url:l.url })),
    shop: ev.shop ? { name:ev.shop.name || '', price:ev.shop.price || '', from:ev.shop.from || '', to:ev.shop.to || '', where:ev.shop.shopName || '' } : null,
    related:(ev.related || []).filter(id => SEED_SCHEDULE.some(e => e.id === id)) }));
  const yt = (id, i) => (SEED_YOUTUBE[id + '#' + i] || [])[0] || '';
  const works = [...ALL_WORKS(), ...SEED_SPECIALS].filter(w => SEED_SENBATSU[w.id]).map(w => ({
    id:w.id, title:w.title || '', alt:w.alt || '', group:gName(w.groupId), kind:WORK_KIND(w) || '', num:w.num || null,
    date:w.date || '', year:w.year || '', note:typeof w.note === 'string' ? w.note : '',
    tracks:(SEED_SENBATSU[w.id] || []).map((t, i) => ({ name:t.track, centers:(t.centers || []).map(getMember).filter(Boolean).map(nickName),
      members:who(t.members), yt:yt(w.id, i), sp:(typeof SEED_SPOTIFY !== 'undefined' && SEED_SPOTIFY[w.id + '#' + i]) || '',
      am:(typeof SEED_APPLEMUSIC !== 'undefined' && SEED_APPLEMUSIC[w.id + '#' + i]) || '' })) }));
  return { events, works, today: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) };
})())`));

const CSS = `:root{--pink:#E4457E;--teal:#2E8C82;--ink:#231B2B;--soft:#6E6478;--line:#EADDE6;--card:#fff;--bg:#FBF5F8}
@media (prefers-color-scheme:dark){:root{--ink:#F4EEF6;--soft:#B6AABD;--line:#3A2F42;--card:#1E1824;--bg:#141018}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 'Noto Sans Thai',system-ui,sans-serif}
a{color:inherit}.wrap{max-width:760px;margin:0 auto;padding:20px 16px 48px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.top a{font-weight:800;text-decoration:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:0 4px 0 var(--line);padding:22px}
h1{margin:0 0 6px;font-size:28px;line-height:1.25}.sub{margin:0 0 4px;color:var(--soft);font-weight:700}
.poster{display:block;width:100%;height:auto;border-radius:16px;margin:0 0 18px;background:var(--line)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}.chip{display:inline-block;padding:3px 12px;border-radius:99px;font-size:14px;font-weight:700;border:1px solid var(--line);text-decoration:none}
.chip.g{background:var(--c);color:#fff;border-color:transparent}.chip.x{background:#B3261E;color:#fff;border-color:transparent}
.go{display:block;margin:18px 0 0;padding:14px 18px;border-radius:16px;background:var(--pink);color:#fff;text-align:center;font-weight:800;text-decoration:none;box-shadow:0 4px 0 #B32F60}
.go:active{transform:translateY(3px);box-shadow:0 1px 0 #B32F60}
h2{font-size:18px;margin:22px 0 8px}ul{margin:0;padding-left:20px}li{margin:2px 0}
.tl{list-style:none;padding:0;border:1px solid var(--line);border-radius:14px;overflow:hidden}.tl li{margin:0;padding:8px 12px;border-bottom:1px solid var(--line)}.tl li:last-child{border-bottom:0}
.trk{border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin:0 0 10px}.trk h3{margin:0 0 4px;font-size:17px}
.trk p{margin:2px 0;color:var(--soft);font-size:14px}.trk .ln{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.list{list-style:none;padding:0}.list li{padding:8px 0;border-bottom:1px solid var(--line)}.list a{text-decoration:none;font-weight:700}.list small{color:var(--soft);display:block}
.foot{margin-top:28px;font-size:13px;color:var(--soft);text-align:center}`;
const HEAD = (title, desc, url, img, type) => `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- Made by scripts/make-event-pages.mjs from the site's own schedule and song list. -->
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${type || 'website'}">
<meta property="og:site_name" content="48thDb">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="th_TH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>`;
const FOOT = '<p class="foot">48thDb · เว็บฐานข้อมูล BNK48 และ CGM48 ที่จัดทำโดยแฟนคลับ ไม่ใช่เว็บทางการ</p>';
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const goScript = to => `<script>if(/[?&]go\\b/.test(location.search)) location.replace(${JSON.stringify(to)});</script>`;
const peopleHtml = w => [...w.head.map(h => `<span class="chip">${esc(h)}</span>`),
  ...w.people.map(p => `<a class="chip" href="/m/${esc(p.id)}">${esc(p.name)}</a>`)].join('');
const peopleText = w => [...w.head, ...w.people.map(p => p.name)].join(', ');
const COLOR = { BNK48:'#CB96C2', CGM48:'#5DC2B5' };

// ---- events
const evById = Object.fromEntries(data.events.map(e => [e.id, e]));
const when = e => span(e.start, e.end) + (e.time && !e.period ? ` · ${e.time}${e.until ? '–' + e.until : ''} น.` : '');
const where = e => e.venue || (e.online ? `ออนไลน์ · ${e.online}` : '');
for(const e of data.events){
  const url = `${ORIGIN}/e/${e.id}`, site = `/event/${e.id}`;
  const lineup = peopleText(e.who);
  const desc = [when(e), where(e), lineup && 'เมมเบอร์: ' + lineup, e.shop && e.shop.price && 'ราคา ' + e.shop.price].filter(Boolean).join(' · ').slice(0, 300);
  const img = e.poster ? `${ORIGIN}/${e.poster.img}` : `${ORIGIN}/og-image2.jpg`;
  const tStart = e.time && !e.period ? `${e.start}T${e.time}:00+07:00` : e.start;
  const schema = { '@context':'https://schema.org', '@type':'Event', name:e.title, startDate:tStart, ...(e.end ? { endDate:e.end } : {}),
    eventStatus: e.cancelled ? (e.postponed ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventCancelled') : 'https://schema.org/EventScheduled',
    eventAttendanceMode: e.venue ? 'https://schema.org/OfflineEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode',
    location: e.venue ? { '@type':'Place', name:e.venue, address:e.venue } : { '@type':'VirtualLocation', url:site.startsWith('http') ? site : ORIGIN + site },
    image:[img], description:desc, url,
    performer:e.groups.map(g => ({ '@type':'MusicGroup', name:g })),
    organizer:{ '@type':'Organization', name:'iAM (Independent Artist Management)', url:'https://www.bnk48.com' } };
  const related = e.related.map(id => evById[id]).filter(Boolean);
  put(`e/${e.id}.html`, `${HEAD(`${e.title} — ${span(e.start, e.end)} | 48thDb`, desc, url, img, 'article')}
${ld(schema)}
${goScript(site)}
</head><body><div class="wrap">
<div class="top"><a href="/">48thDb</a><a href="/e/">งานทั้งหมด</a></div>
<main class="card">
  ${e.poster ? `<img class="poster" src="/${esc(e.poster.img)}" alt="${esc(e.title)}" width="${e.poster.w || ''}" height="${e.poster.h || ''}">` : ''}
  <h1>${esc(e.title)}</h1>
  <p class="sub">${esc(when(e))}</p>
  ${where(e) ? `<p class="sub">${esc(where(e))}</p>` : ''}
  <div class="chips">${e.cancelled ? `<span class="chip x">${e.postponed ? 'เลื่อน' : 'ยกเลิก'}</span>` : ''}${e.groups.map(g => `<span class="chip g" style="--c:${COLOR[g] || '#E4457E'}">${esc(g)}</span>`).join('')}</div>
  ${lineup ? `<h2>เมมเบอร์</h2><div class="chips">${peopleHtml(e.who)}</div>` : ''}
  ${e.shop ? `<h2>สั่งซื้อ</h2><ul>${[e.shop.name, e.shop.price && 'ราคา ' + e.shop.price, e.shop.from && `สั่งซื้อ ${day(e.shop.from)} ${e.shop.from.slice(11, 16)} – ${day(e.shop.to)} ${e.shop.to.slice(11, 16)} น.`, e.shop.where && 'ทาง ' + e.shop.where].filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
  ${e.detail.length ? `<h2>กำหนดการ</h2><ul class="tl">${e.detail.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
  ${e.info.length ? `<h2>รายละเอียด</h2><ul>${e.info.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
  ${e.sections.map(s => `<h2>${esc(s.head)}</h2><ul>${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
  ${e.links.length ? `<h2>ลิงก์</h2><ul>${e.links.map(l => `<li><a href="${esc(l.url)}" rel="noopener" target="_blank">${esc(l.label)}</a></li>`).join('')}</ul>` : ''}
  <a class="go" href="${site}">ดูตารางเวลา รอบเมมเบอร์ และผังงานบน 48thDb →</a>
  ${related.length ? `<h2>งานที่เกี่ยวข้อง</h2><ul class="list">${related.map(r => `<li><a href="/e/${esc(r.id)}">${esc(r.title)}</a><small>${esc(span(r.start, r.end))}</small></li>`).join('')}</ul>` : ''}
</main>
${FOOT}
</div></body></html>
`);
}
const upcoming = data.events.filter(e => (e.end || e.start) >= data.today).sort((a, b) => a.start.localeCompare(b.start));
const past = data.events.filter(e => (e.end || e.start) < data.today).sort((a, b) => b.start.localeCompare(a.start));
const byMonth = list => { const out = []; for(const e of list){ const k = e.start.slice(0, 7); let g = out.find(x => x.k === k); if(!g) out.push(g = { k, list:[] }); g.list.push(e); } return out; };
const evRow = e => `<li><a href="/e/${esc(e.id)}">${esc(e.title)}</a><small>${esc([when(e), where(e)].filter(Boolean).join(' · '))}</small></li>`;
put('e/index.html', `${HEAD('ตารางงาน BNK48 และ CGM48 — 48thDb', 'ตารางงาน อีเวนต์ คอนเสิร์ต โรดโชว์ ป๊อปอัป และพรีออเดอร์สินค้าของ BNK48 และ CGM48 พร้อมวันเวลา สถานที่ และเมมเบอร์ที่ร่วมงาน', `${ORIGIN}/e/`, `${ORIGIN}/og-image2.jpg`)}
</head><body><div class="wrap">
<div class="top"><a href="/">48thDb</a><a href="/calendar">ปฏิทินในเว็บ →</a></div>
<h1>ตารางงาน BNK48 และ CGM48</h1>
${upcoming.length ? `<h2>งานที่กำลังจะมาถึง</h2><ul class="list">${upcoming.map(evRow).join('')}</ul>` : ''}
${byMonth(past).map(g => { const [y, m] = g.k.split('-').map(Number); return `<h2>${M_TH[m - 1]} ${y}</h2><ul class="list">${g.list.map(evRow).join('')}</ul>`; }).join('')}
${FOOT}
</div></body></html>
`);

// ---- releases
const KIND = { single:'ซิงเกิล', album:'อัลบั้ม', digital:'ดิจิทัลซิงเกิล', special:'ซิงเกิลพิเศษ' };
const kindOf = w => w.kind ? (KIND[w.kind] || w.kind) : (/-a\d/.test(w.id) ? 'อัลบั้ม' : 'ซิงเกิล');
const wName = w => w.alt ? `${w.title} (${w.alt})` : w.title;
for(const w of data.works){
  const url = `${ORIGIN}/s/${w.id}`, site = `/song/${w.id}`;
  const label = `${w.group} · ${kindOf(w)}${w.num ? ' ที่ ' + w.num : ''}${w.year ? ' · ' + w.year : ''}`;
  const lead = w.tracks[0];
  const desc = [`${wName(w)} — ${label}`, lead && lead.centers.length && 'เซ็นเตอร์ ' + lead.centers.join(', '),
    `${w.tracks.length} เพลง: ` + w.tracks.map(t => t.name).join(', ')].filter(Boolean).join(' · ').slice(0, 300);
  const thumb = w.tracks.map(t => t.yt).find(Boolean);
  const img = thumb ? `https://i.ytimg.com/vi/${thumb}/hqdefault.jpg` : `${ORIGIN}/og-image2.jpg`;
  const schema = { '@context':'https://schema.org', '@type':'MusicAlbum', name:wName(w), url, image:img,
    byArtist:{ '@type':'MusicGroup', name:w.group }, ...(w.date || w.year ? { datePublished:w.date || String(w.year) } : {}),
    numTracks:w.tracks.length, track:w.tracks.map((t, i) => ({ '@type':'MusicRecording', name:t.name, position:i + 1,
      ...(t.yt ? { url:`https://www.youtube.com/watch?v=${t.yt}` } : {}) })) };
  put(`s/${w.id}.html`, `${HEAD(`${wName(w)} — ${w.group} | 48thDb`, desc, url, img, 'music.album')}
${ld(schema)}
${goScript(site)}
</head><body><div class="wrap">
<div class="top"><a href="/">48thDb</a><a href="/s/">ผลงานทั้งหมด</a></div>
<main class="card">
  <h1>${esc(wName(w))}</h1>
  <p class="sub">${esc(label)}${w.date ? ' · ออก ' + esc(day(w.date)) : ''}</p>
  ${w.note ? `<p>${esc(w.note)}</p>` : ''}
  <h2>เพลง</h2>
  ${w.tracks.map((t, i) => `<div class="trk"><h3>${i + 1}. ${esc(t.name)}</h3>
    ${t.centers.length ? `<p>เซ็นเตอร์: ${esc(t.centers.join(', '))}</p>` : ''}
    ${peopleText(t.members) ? `<p>ร้องโดย: ${esc(peopleText(t.members))}</p>` : ''}
    ${t.yt || t.sp || t.am ? `<div class="ln">${t.yt ? `<a class="chip" href="https://www.youtube.com/watch?v=${esc(t.yt)}" rel="noopener" target="_blank">YouTube</a>` : ''}${t.sp ? `<a class="chip" href="https://open.spotify.com/track/${esc(t.sp)}" rel="noopener" target="_blank">Spotify</a>` : ''}${t.am ? `<a class="chip" href="https://music.apple.com/th/song/${esc(t.am)}" rel="noopener" target="_blank">Apple Music</a>` : ''}</div>` : ''}
  </div>`).join('')}
  <a class="go" href="${site}">ดูตำแหน่ง ยอดวิว และสถิติเพลงบน 48thDb →</a>
</main>
${FOOT}
</div></body></html>
`);
}
const groupsOf = [...new Set(data.works.map(w => w.group))];
put('s/index.html', `${HEAD('ผลงานเพลง BNK48 และ CGM48 ทั้งหมด — 48thDb', 'ซิงเกิล อัลบั้ม ดิจิทัลซิงเกิล และซิงเกิลพิเศษของ BNK48 และ CGM48 พร้อมรายชื่อเพลง เซ็นเตอร์ เมมเบอร์ที่ร้อง และลิงก์ฟังเพลง', `${ORIGIN}/s/`, `${ORIGIN}/og-image2.jpg`)}
</head><body><div class="wrap">
<div class="top"><a href="/">48thDb</a><a href="/works/songs">เปิดในเว็บ →</a></div>
<h1>ผลงานเพลง BNK48 และ CGM48</h1>
${groupsOf.map(g => `<h2>${esc(g)}</h2><ul class="list">${data.works.filter(w => w.group === g).map(w => `<li><a href="/s/${esc(w.id)}">${esc(wName(w))}</a><small>${esc(kindOf(w))}${w.num ? ' ที่ ' + w.num : ''}${w.year ? ' · ' + w.year : ''}</small></li>`).join('')}</ul>`).join('')}
${FOOT}
</div></body></html>
`);

put('sitemap-pages.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${ORIGIN}/e/</loc></url>
${data.events.map(e => `<url><loc>${ORIGIN}/e/${e.id}</loc></url>`).join('\n')}
<url><loc>${ORIGIN}/s/</loc></url>
${data.works.map(w => `<url><loc>${ORIGIN}/s/${w.id}</loc></url>`).join('\n')}
</urlset>
`);
console.log(`${data.events.length} events · ${data.works.length} releases · ${wrote} files written`);
ws.close(); chrome.kill();
