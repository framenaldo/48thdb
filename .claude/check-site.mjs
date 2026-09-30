#!/usr/bin/env node
/* Walks the site the way CLAUDE.md asks before saying a change works: every
 * view in all three languages, a member sheet, an event sheet, the GE poster
 * viewer and its share sheet, at phone width, and reports any page error.
 * Needs the local server (.claude/launch.json, port 8823) and Chrome.
 *   node .claude/check-site.mjs [base url]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.argv[2] || 'http://localhost:8823/';
const PORT = 9611, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map(), errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); }
  if(m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 240));
  if(m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 240)); });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async expr => { const r = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE + '?sw=off' }); await sleep(3000);
await send('Page.navigate', { url: BASE }); await sleep(3500);
await run(`new Promise(r => { const w = () => (typeof state !== 'undefined' && document.readyState === 'complete') ? r() : setTimeout(w, 200); w(); })`);

const problems = [];
const views = await run(`JSON.stringify(['feed','browse','groups','org','discography','stats','calendar','shop','timeline'])`);
for(const lang of ['mix', 'th', 'en']){
  for(const v of JSON.parse(views)){
    const r = await run(`(async () => { state.lang = '${lang}'; state.view = '${v}'; state.selectedId = null; state.selectedEvent = null; state.posterOf = null;
      render(); await new Promise(r => setTimeout(r, 250));
      const m = document.getElementById('main'); return { len: m.innerText.length, failed: !!m.querySelector('.render-failed') }; })()`);
    if(r.failed || r.len < 40) problems.push(`${lang}/${v}: ${r.failed ? 'render failed' : 'nearly empty'}`);
  }
  for(const t of ['overview', 'songs', 'birthdays', 'timeline', 'lives']){
    const r = await run(`(async () => { state.view = 'stats'; state.statsTab = '${t}'; render(); await new Promise(r => setTimeout(r, 400)); return !!document.querySelector('#main .render-failed'); })()`);
    if(r) problems.push(`${lang}/stats-${t}: render failed`);
  }
  const sheets = await run(`(async () => { const out = [];
    for(const id of ['bnk-arlee', 'cgm-nana', 'bnk-cherprang', 'bnk-jeje']){ state.view = 'browse'; state.selectedId = id; render(); await new Promise(r => setTimeout(r, 300));
      if(!document.querySelector('.modal-backdrop')) out.push('member sheet ' + id); }
    state.selectedId = null;
    for(const e of SEED_SCHEDULE.slice(-6)){ state.view = 'feed'; state.selectedEvent = e.id; render(); await new Promise(r => setTimeout(r, 200));
      if(!document.querySelector('.modal-backdrop')) out.push('event sheet ' + e.id); }
    state.selectedEvent = null; state.view = 'timeline'; state.posterOf = 'ge:bnk-arlee'; render(); await new Promise(r => setTimeout(r, 900));
    if(!document.querySelector('.gp3')) out.push('3D poster');
    const b = document.querySelector('.gev-btn.is-share'); if(b){ b.click(); await new Promise(r => setTimeout(r, 2500)); if(!document.querySelector('.share-preview img')) out.push('poster share card'); closeShareSheet(); }
    state.posterOf = null; render(); return out; })()`);
  sheets.forEach(x => problems.push(`${lang}: ${x}`));
}
await run(`state.lang = 'mix'; render()`);
console.log(problems.length ? 'problems:\n  ' + problems.join('\n  ') : 'views × 3 languages, sheets, 3D poster and share card: all fine');
console.log('page errors:', errors.length ? '\n  ' + [...new Set(errors)].join('\n  ') : 'none');
ws.close(); chrome.kill();
