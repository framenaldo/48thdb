#!/usr/bin/env node
/* Spinning 3D poster clips for posting (TikTok, Reels, X): 1080×1920, 30fps,
 * about 7 seconds, one per GE2026 candidate, drawn frame by frame by the
 * page's own renderer (gp3Scene) and joined into an MP4 by ffmpeg.
 * The clips are for the owner to post; they are not part of the site.
 *
 * Needs the site served locally (port 8823), Chrome and ffmpeg (brew install ffmpeg).
 *   node scripts/make-poster-clips.mjs <out dir> [id ...]      (no ids: all 58)
 * For the copies the site serves (posters/ge2026/clips/<id>.mp4, shared from the
 * poster viewer) name them by id and squeeze them a little:
 *   NAMES=id CRF=26 node scripts/make-poster-clips.mjs posters/ge2026/clips
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2];
if(!OUT){ console.error('usage: make-poster-clips.mjs <out dir> [id ...]'); process.exit(1); }
const SITE = process.env.SITE || 'http://localhost:8823/';
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const FPS = 30, SECONDS = 7, CRF = process.env.CRF || '18', BY_ID = process.env.NAMES === 'id';
const PORT = 9566, sleep = ms => new Promise(r => setTimeout(r, ms));
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

// the clip, as a function of time: fades in turned away, swings round a full
// turn with its back showing on the way, and comes to rest turned slightly
await run(`window._clip = async id => {
  const m = getMember(id), grp = getGroup(m.groupId) || {}, team = getTeam(m.teamId);
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), layer = document.createElement('canvas');
  const tex = gp3Textures(await shareLoad(gePoster(id)), 1700), logo = await shareLogo('#ffffff');
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const clamp = x => Math.max(0, Math.min(1, x));
  window._frame = t => {
    const spin = ease(clamp((t - .9) / 4.4));
    const a = -38 + spin * 360 + (1 - clamp(t / 1.1)) * -30 + clamp((t - 5.3) / 1.2) * 14;
    const b = 7 * Math.cos(t * 1.3) - 1;
    g.fillStyle = '#08060C'; g.fillRect(0, 0, W, H);
    shareGlow(g, W / 2, 700, 900, grp.color || '#E4457E', .24);
    gp3Scene(g, tex, { W, H, a, b, h:1120, cx:W / 2, cy:790, keepBg:true, layer });
    const txt = clamp((t - .4) / .8);
    g.globalAlpha = txt; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#FF8A93'; g.font = '800 34px "Noto Sans Thai", sans-serif';
    g.fillText('SENBATSU GENERAL ELECTION 2026', W / 2, 150);
    g.fillStyle = '#fff'; g.font = '800 110px "Noto Sans Thai", sans-serif'; g.fillText(m.name, W / 2, 1600);
    g.fillStyle = 'rgba(255,255,255,.76)'; g.font = '600 40px "Noto Sans Thai", sans-serif';
    g.fillText((grp.name || '') + (team ? ' · ' + team.name : '') + ' · ผู้สมัคร', W / 2, 1672);
    if(logo) g.drawImage(logo, W / 2 - 250, 1760, 128, 74);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '700 38px "Noto Sans Thai", sans-serif'; g.textAlign = 'left';
    g.fillText('48thdb.com', W / 2 - 100, 1810);
    g.globalAlpha = 1;
    if(t < .5){ g.fillStyle = 'rgba(0,0,0,' + (1 - t / .5).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }   // in from black
    return c.toDataURL('image/jpeg', .9);
  };
  return m.name + ' (' + (grp.name || '') + ')';
}`);

const ids = process.argv.slice(3).length ? process.argv.slice(3) : await run('GE_CANDIDATES.slice()');
mkdirSync(OUT, { recursive: true });
for(const id of ids){
  const label = await run(`_clip(${JSON.stringify(id)})`);
  const file = join(OUT, `${BY_ID ? id : label}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', CRF, '-preset', 'slow', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  for(let f = 0; f < FPS * SECONDS; f++){
    const url = await run(`_frame(${f / FPS})`);
    if(!ff.stdin.write(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  process.stdout.write(label + '\n');
}
ws.close(); chrome.kill();
