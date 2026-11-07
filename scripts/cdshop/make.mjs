// node scripts/cdshop/make.mjs [folder of MV thumbnails <video id>.jpg]  → bg/cd-shop-2.jpg (a new name each time it changes: the service worker serves images stale-first) (1920×1200); needs Google Chrome on this Mac.
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
const dir = process.argv[2], urls = dir ? readdirSync(dir).filter(f => /\.jpe?g$/i.test(f)).sort().map(f => 'data:image/jpeg;base64,' + readFileSync(join(dir, f)).toString('base64')) : [];
await send('Page.navigate', { url:'file://' + join(here, 'scene.html') + '?wait' });
await sleep(500);
await send('Runtime.evaluate', { expression:`drawScene(${JSON.stringify(urls)})`, awaitPromise:true });
for (let i = 0; i < 100; i++) { const r = await send('Runtime.evaluate', { expression:'window.done === true', returnByValue:true }); if (r.result.result.value) break; await sleep(200); }
const r = await send('Runtime.evaluate', { expression:"document.getElementById('c').toDataURL('image/jpeg', .8)", returnByValue:true });
const out = join(here, '..', '..', 'bg', 'cd-shop-2.jpg'); writeFileSync(out, Buffer.from(r.result.result.value.split(',')[1], 'base64'));
console.log('wrote', out); ws.close(); proc.kill();
