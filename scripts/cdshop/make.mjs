// node scripts/cdshop/make.mjs  → bg/cd-shop.jpg (1920×1200); needs Google Chrome on this Mac
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), port = 9777, sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--allow-file-access-from-files', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cd-'))}`, '--window-size=1920,1200', 'about:blank'], { stdio:'ignore' });
let tab; for (let i = 0; i < 100 && !tab; i++) { try { tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x => x.type === 'page'); } catch {} if (!tab) await sleep(150); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const wait = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.navigate', { url:'file://' + join(here, 'scene.html') });
for (let i = 0; i < 100; i++) { const r = await send('Runtime.evaluate', { expression:'window.done === true', returnByValue:true }); if (r.result.result.value) break; await sleep(200); }
const r = await send('Runtime.evaluate', { expression:"document.getElementById('c').toDataURL('image/jpeg', .8)", returnByValue:true });
const out = join(here, '..', '..', 'bg', 'cd-shop.jpg'); writeFileSync(out, Buffer.from(r.result.result.value.split(',')[1], 'base64'));
console.log('wrote', out); ws.close(); proc.kill();
