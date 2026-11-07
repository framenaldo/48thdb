// node scripts/scenes/make.mjs <scene.html> <bg/out.jpg> <folder of pictures> [filename regex]
// Draws a page background in headless Chrome from a scene page and real pictures (handed in one by one as data URLs, the scene's
// drawScene(urls) does the rest) and writes a 1920×1200 JPEG. A remade picture needs a new file name: the service worker serves
// images stale-first. Needs Google Chrome on this Mac.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const [scene, out, dir, re] = process.argv.slice(2), port = 9778, sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { jpg:'jpeg', jpeg:'jpeg', png:'png', webp:'webp' }, rx = new RegExp(re || '\\.(jpe?g|png|webp)$', 'i');
const urls = dir ? readdirSync(dir).filter(f => rx.test(f) && MIME[f.split('.').pop().toLowerCase()]).sort()
  .map(f => `data:image/${MIME[f.split('.').pop().toLowerCase()]};base64,` + readFileSync(join(dir, f)).toString('base64')) : [];
console.log(urls.length, 'pictures');
const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sc-'))}`, '--window-size=1920,1200', 'about:blank'], { stdio:'ignore' });
let tab; for (let i = 0; i < 100 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page'); } catch {} if (!tab) await sleep(150); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const wait = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.navigate', { url:'file://' + resolve(scene) + '?wait' });
for (let i = 0; i < 100; i++) { const t = await send('Runtime.evaluate', { expression:"typeof drawScene === 'function'", returnByValue:true }); if (t.result && t.result.result && t.result.result.value) break; await sleep(200); }   // wait for the scene page to be ready
await send('Runtime.evaluate', { expression:'window.__u = []' });
for (const u of urls) await send('Runtime.evaluate', { expression:`window.__u.push(${JSON.stringify(u)})` });
const ran = await send('Runtime.evaluate', { expression:'drawScene(window.__u).then(() => "ok", e => String(e))', awaitPromise:true, returnByValue:true });
console.log('draw:', JSON.stringify(ran).slice(0, 300));
// a drawing that failed leaves a black canvas, and a black picture once went live: check it is not before writing
const bright = await send('Runtime.evaluate', { expression:"(() => { const c = document.getElementById('c'), t = document.createElement('canvas'); t.width = t.height = 16; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 16, 16); const d = x.getImageData(0, 0, 16, 16).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; })()", returnByValue:true });
if (!(bright.result.result.value > 12)) { console.error('the picture came out black (' + bright.result.result.value + '): not written'); ws.close(); proc.kill(); process.exit(1); }
const r = await send('Runtime.evaluate', { expression:"document.getElementById('c').toDataURL('image/jpeg', .8)", returnByValue:true });
writeFileSync(resolve(out), Buffer.from(r.result.result.value.split(',')[1], 'base64')); console.log('wrote', out); ws.close(); proc.kill();
