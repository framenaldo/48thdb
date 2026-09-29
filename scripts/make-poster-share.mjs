#!/usr/bin/env node
/* Builds what a shared GE2026 poster link needs, from the page's own 3D renderer:
 *   posters/ge2026/og/<id>.jpg   1200×630 preview image, her poster turned in 3D
 *   p/<id>.html                  a tiny page with that preview for LINE, X and
 *                                Facebook, which sends people on to /?p=<id>
 * Crawlers do not run the site's script, so each link needs a page of its own.
 *
 * Needs the site served locally (.claude/launch.json, port 8823) and Chrome.
 *   node scripts/make-poster-share.mjs [id ...]      (no ids: all 58)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE || 'http://localhost:8823/';
const PORT = 9555, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
await send('Page.navigate', { url: SITE + '?sw=off' }); await sleep(3000);
await send('Page.navigate', { url: SITE }); await sleep(3000);
await run(`new Promise(r => { const w = () => (typeof gp3Scene === 'function' && document.readyState === 'complete') ? r() : setTimeout(w, 200); w(); })`);
await run(`Promise.all(['600','700','800'].map(w => document.fonts.load(w + ' 40px "Noto Sans Thai"', 'กขABC')))`);

const ids = process.argv.slice(2).length ? process.argv.slice(2) : await run('GE_CANDIDATES.slice()');
mkdirSync(join(ROOT, 'posters/ge2026/og'), { recursive: true });
mkdirSync(join(ROOT, 'p'), { recursive: true });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for(const id of ids){
  const out = JSON.parse(await run(`(async () => {
    const id = ${JSON.stringify(id)}, m = getMember(id), grp = getGroup(m.groupId) || {}, team = getTeam(m.teamId);
    const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#08060C'; g.fillRect(0, 0, W, H);
    shareGlow(g, 330, 240, 560, grp.color || '#E4457E', .3);
    const im = await shareLoad(gePoster(id));
    gp3Scene(g, gp3Textures(im, 1000), { W, H, a:-30, b:5, h:432, cx:318, cy:262, keepBg:true });
    const x = 624, fit = (t, px, weight, max) => { let f = px; do { g.font = weight + ' ' + f + 'px "Noto Sans Thai", sans-serif'; f -= 2; } while(g.measureText(t).width > max && f > 20); };
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#FF8A93'; g.font = '800 21px "Noto Sans Thai", sans-serif';
    g.fillText('SENBATSU GENERAL ELECTION 2026', x, 188);
    g.fillStyle = '#fff'; fit(m.name, 96, '800', 520); g.fillText(m.name, x, 290);
    g.fillStyle = 'rgba(255,255,255,.78)'; g.font = '600 30px "Noto Sans Thai", sans-serif';
    g.fillText((grp.name || '') + (team ? ' · ' + team.name : ''), x, 342);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 25px "Noto Sans Thai", sans-serif';
    g.fillText('ผู้สมัคร', x, 392);
    const logo = await shareLogo('#ffffff');
    if(logo) g.drawImage(logo, x, 486, 118, 68);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 25px "Noto Sans Thai", sans-serif'; g.fillText('48thdb.com', x + 136, 530);
    return JSON.stringify({ name: m.name, group: grp.name || '', team: team ? team.name : '', jpg: c.toDataURL('image/jpeg', .88) });
  })()`));
  writeFileSync(join(ROOT, `posters/ge2026/og/${id}.jpg`), Buffer.from(out.jpg.split(',')[1], 'base64'));
  const who = `${out.name} (${out.group}${out.team ? ' ' + out.team : ''})`;
  const to = `/?p=${id}`;
  writeFileSync(join(ROOT, `p/${id}.html`), `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(out.name)} · Senbatsu General Election 2026 — 48thDb</title>
<!-- Made by scripts/make-poster-share.mjs. Link previews read these tags;
     people are sent straight on to her poster on the site. -->
<link rel="canonical" href="https://48thdb.com${to}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="48thDb">
<meta property="og:url" content="https://48thdb.com/p/${id}">
<meta property="og:title" content="${esc(out.name)} · ผู้สมัคร Senbatsu General Election 2026">
<meta property="og:description" content="หมุนดูโปสเตอร์ 3D ของ ${esc(who)} บน 48thDb เว็บฐานข้อมูลที่จัดขึ้นโดยแฟนคลับ BNK48 และ CGM48">
<meta property="og:image" content="https://48thdb.com/posters/ge2026/og/${id}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="โปสเตอร์เลือกตั้งของ ${esc(out.name)} แบบ 3D">
<meta property="og:locale" content="th_TH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(out.name)} · ผู้สมัคร Senbatsu General Election 2026">
<meta name="twitter:image" content="https://48thdb.com/posters/ge2026/og/${id}.jpg">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)});</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08060C;color:#fff;font:600 16px system-ui,sans-serif}a{color:#fff}</style>
</head><body><a href="${to}">ดูโปสเตอร์ของ ${esc(out.name)} บน 48thDb</a></body></html>
`);
  process.stdout.write(id + ' ');
}
console.log('\n' + ids.length + ' done');
ws.close(); chrome.kill();
