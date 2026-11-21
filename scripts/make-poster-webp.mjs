#!/usr/bin/env node
/* WebP small copies of the event posters, for their cards: <poster>-s.webp beside each <poster>-s.jpg, made from the
 * original poster at the small copy's size (WebP quality .86), and kept only when at least 15% lighter than the JPEG.
 * The names kept are written into POSTER_WEBP in index.html, which evThumb reads; the full posters are never touched.
 * Run it after scripts/make-event-thumbs.sh. Existing WebP copies are kept (a replaced poster has a new file name).
 * Needs the site served locally (.claude/launch.json, port 8823) and Chrome.
 *   node scripts/make-poster-webp.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE || 'http://localhost:8823/';
const PORT = 9558, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
await send('Page.navigate', { url: SITE + '?sw=off' }); await sleep(2500);

const dir = join(ROOT, 'posters'), files = readdirSync(dir);
const page = join(ROOT, 'index.html'); let html = readFileSync(page, 'utf8');
const m = html.match(/const POSTER_WEBP = new Set\((\[.*?\])\);/);
if(!m) throw new Error('POSTER_WEBP not found in index.html');
const kept = new Set(JSON.parse(m[1]));
for(const small of files.filter(f => f.endsWith('-s.jpg'))){
  const base = small.slice(0, -6), out = join(dir, base + '-s.webp');
  if(existsSync(out)){ kept.add(base); continue; }
  const src = files.find(f => f.startsWith(base + '.') && !f.includes('-s.'));
  if(!src) continue;
  const r = await run(`(async () => {
    const s = new Image(); s.src = '/posters/${small}'; await s.decode();
    const o = new Image(); o.src = '/posters/${src}'; await o.decode();
    const W = s.naturalWidth, H = s.naturalHeight; let cur = o, cw = o.naturalWidth, ch = o.naturalHeight;
    while(cw / 2 > W * 1.2){ const t = document.createElement('canvas'); t.width = Math.round(cw / 2); t.height = Math.round(ch / 2); const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, t.width, t.height); cur = t; cw = t.width; ch = t.height; }
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, W, H);
    const b = await new Promise(res => c.toBlob(res, 'image/webp', 0.86));
    const jpg = (await (await fetch('/posters/${small}')).blob()).size;
    const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    return { jpg, webp: b.size, data }; })()`).catch(e => ({ err: String(e).slice(0, 120) }));
  if(r.err){ console.log('skipped', small, r.err); continue; }
  if(r.webp <= r.jpg * 0.85){ writeFileSync(out, Buffer.from(r.data.split(',')[1], 'base64')); kept.add(base); console.log('made', base + '-s.webp', Math.round(r.jpg / 1024) + ' → ' + Math.round(r.webp / 1024) + ' KB'); }
  else console.log('kept the JPEG', small, Math.round(r.webp / r.jpg * 100) + '%');
}
html = html.replace(m[0], `const POSTER_WEBP = new Set(${JSON.stringify([...kept].sort())});`);
writeFileSync(page, html);
console.log(kept.size, 'posters have a WebP copy');
ws.close(); chrome.kill();
