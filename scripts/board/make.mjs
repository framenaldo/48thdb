// node scripts/board/make.mjs  (the calendar's cork board, from the small copies of the event posters in posters/)  → bg/cork-board-1.jpg (a new name each time it changes: the service worker serves images stale-first) (1920×1200); needs Google Chrome on this Mac.
// The thumbnails are the groups' own MVs (ids in data/youtube.json), fetched once with
//   mkdir -p /tmp/cdthumbs && cd /tmp/cdthumbs && node -e "console.log(Object.keys(require('<repo>/data/youtube.json').videos).join('\\n'))" | xargs -P 12 -I{} curl -s -o {}.jpg https://i.ytimg.com/vi/{}/hqdefault.jpg
// and are not kept in the repo; without a folder the covers are invented.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), port = 9777, sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cd-'))}`, '--window-size=1920,1200', 'about:blank'], { stdio:'ignore' });
let tab; for (let i = 0; i < 100 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page'); } catch {} if (!tab) await sleep(150); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const wait = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const MIME = { jpg:'jpeg', jpeg:'jpeg', png:'png', webp:'webp' };
const read = dir => dir ? readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
  .map(f => `data:image/${MIME[f.split('.').pop().toLowerCase()]};base64,` + readFileSync(join(dir, f)).toString('base64')) : [];
// first folder: the real covers, all of them used; second (optional): MV thumbnails to fill the rest of the shelves
const postersDir = join(here, '..', '..', 'posters');
const urls = readdirSync(postersDir).filter(f => /-s\.jpg$/.test(f)).sort().map(f => 'data:image/jpeg;base64,' + readFileSync(join(postersDir, f)).toString('base64')), more = [];
console.log(urls.length, 'posters');
await send('Page.navigate', { url:'file://' + join(here, 'scene.html') + '?wait' });
await sleep(500);
// handed in one at a time: a single message with every picture in it was too big for the browser to take
await send('Runtime.evaluate', { expression:'window.__u = []; window.__v = []' });
for (const u of urls) await send('Runtime.evaluate', { expression:`window.__u.push(${JSON.stringify(u)})` });
for (const u of more) await send('Runtime.evaluate', { expression:`window.__v.push(${JSON.stringify(u)})` });
const ran = await send('Runtime.evaluate', { expression:'drawScene(window.__u, window.__v).then(() => "ok", e => String(e))', awaitPromise:true, returnByValue:true });
console.log('draw:', ran.result && ran.result.result && ran.result.result.value);
for (let i = 0; i < 100; i++) { const r = await send('Runtime.evaluate', { expression:'window.done === true', returnByValue:true }); if (r.result.result.value) break; await sleep(200); }
const r = await send('Runtime.evaluate', { expression:"document.getElementById('c').toDataURL('image/jpeg', .8)", returnByValue:true });
const out = join(here, '..', '..', 'bg', 'cork-board-1.jpg'); writeFileSync(out, Buffer.from(r.result.result.value.split(',')[1], 'base64'));
console.log('wrote', out); ws.close(); proc.kill();
