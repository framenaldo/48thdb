#!/usr/bin/env node
/* The colour wash of every event sheet with a poster, worked out once and kept
 * in data/poster-grads.json. The page can work it out itself from the poster's
 * small copy, but Safari on the iPhone will not let a page read a canvas back,
 * so there the file is what colours the sheet. Run it after adding a poster
 * (after scripts/make-event-thumbs.sh, which makes the small copies it reads).
 * Needs the site served locally (.claude/launch.json, port 8823) and Chrome.
 *   node scripts/make-poster-grads.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE || 'http://localhost:8823/';
const OUT = join(ROOT, 'data', 'poster-grads.json');
const PORT = 9557, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
await send('Runtime.enable');
await send('Page.navigate', { url: SITE + '?sw=off' }); await sleep(2500);
await send('Page.navigate', { url: SITE }); await sleep(3000);
await run(`new Promise(r => { const w = () => (typeof sheetGrad === 'function' && document.readyState === 'complete') ? r() : setTimeout(w, 200); w(); })`);

// the page's own sums, on every poster a sheet would wash
const grads = await run(`(async () => {
  const out = {};
  const imgs = [...new Set(SEED_SCHEDULE.filter(e => e.poster && e.poster.img && !e.poster.scene).map(e => e.poster.img))].sort();
  for(const src of imgs){ const g = await sheetGrad(src); if(g) out[src] = g; }
  return out;
})()`);
const body = JSON.stringify(grads, null, 1) + '\n';
const before = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
if(body !== before) writeFileSync(OUT, body);
console.log(`${Object.keys(grads).length} posters${body === before ? ', unchanged' : ' written to data/poster-grads.json'}`);
ws.close(); chrome.kill();
