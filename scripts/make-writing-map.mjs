// usage: node scripts/make-writing-map.mjs <logo url on the local server> <out.png> [line breaks as y values, "[120,190]"] [min piece area] [debug sheet.png] [overlap 0..1]
// the three in logos/ were made so: journey-of-dreams "[120,190,390]" 40 · kimi-…-wavy "[400]" 120 · ge2026-logo "[30,128,270]" 120 (overlap .55 .5 .45)
// A "writing" time map for a logo: for every pixel, when (0..1) a pen drawing the logo would reach it.
// Strokes (connected pieces of ink) are taken in reading order — line by line, left to right — and in each the
// pen starts at its top-left end and runs along it, so time is the distance along the shape from that start.
// Output: a grayscale PNG (half size, smooth, filled out into the background so it can be filtered) + a debug sheet.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [SRC, OUT, BANDS = '[]', MINAREA = '40', DBG = '', OVL = '0.55'] = process.argv.slice(2);
const PORT = 9666, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
let tab; for(let i = 0; i < 80 && !tab; i++){ try{ tab = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(x => x.type === 'page'); }catch{} if(!tab) await sleep(200); }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if(m.id && waiting.has(m.id)){ waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.navigate', { url: new URL(SRC).origin + '/robots.txt' }); await sleep(1200);
const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const im = new Image(); im.src = ${JSON.stringify(SRC)}; await im.decode();
  const w = im.width, h = im.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const src = g.getImageData(0, 0, w, h), P = src.data, N = w * h;
  const ink = new Uint8Array(N); for(let i = 0; i < N; i++) ink[i] = P[i * 4 + 3] > 110 ? 1 : 0;
  const bands = ${BANDS}, minArea = ${+MINAREA};
  // connected pieces of ink
  const comp = new Int32Array(N).fill(-1), comps = [];
  const nb = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let s = 0; s < N; s++){ if(!ink[s] || comp[s] >= 0) continue;
    const id = comps.length, q = [s]; comp[s] = id; let area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, best = Infinity, bi = s;
    for(let k = 0; k < q.length; k++){ const p = q[k], x = p % w, y = (p / w) | 0; area++;
      if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
      const sc = x + 0.8 * y; if(sc < best){ best = sc; bi = p; }
      for(const [dx, dy] of nb){ const xx = x + dx, yy = y + dy; if(xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const pp = yy * w + xx; if(ink[pp] && comp[pp] < 0){ comp[pp] = id; q.push(pp); } } }
    comps.push({ id, area, x0, x1, y0, y1, start: bi, px: q }); }
  const big = comps.filter(k => k.area >= minArea);
  // reading order: by band (a line of the logo), then by where the pen starts
  const bandOf = k => { const cy = (k.start / w) | 0; let b = 0; for(const y of bands) if(cy > y) b++; return b; };
  big.forEach(k => { k.band = bandOf(k); k.sx = k.start % w; k.sy = (k.start / w) | 0; });
  big.sort((a, b) => a.band - b.band || a.sx - b.sx || a.sy - b.sy);
  // distance along each piece from its start (Dijkstra, diagonals cost more), laid end to end
  const T = new Float32Array(N).fill(-1); const GAP = 24, OVERLAP = +(${+OVL});
  const heapOps = (heap) => ({
    push: (d, p) => { heap.push([d, p]); let i = heap.length - 1; while(i > 0){ const j = (i - 1) >> 1; if(heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } },
    pop: () => { const t = heap[0], l = heap.pop(); if(heap.length){ heap[0] = l; let i = 0; for(;;){ let a = 2 * i + 1, b = a + 1, m = i; if(a < heap.length && heap[a][0] < heap[m][0]) m = a; if(b < heap.length && heap[b][0] < heap[m][0]) m = b; if(m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return t; } });
  for(const k of big){
    const dist = new Map(); dist.set(k.start, 0); const heap = [[0, k.start]], H = heapOps(heap); let far = 0;
    while(heap.length){ const [d, p] = H.pop(); if(d > dist.get(p)) continue; far = Math.max(far, d); const x = p % w, y = (p / w) | 0;
      for(const [dx, dy] of nb){ const xx = x + dx, yy = y + dy; if(xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const pp = yy * w + xx; if(!ink[pp] || comp[pp] !== k.id) continue; const nd = d + (dx && dy ? 1.414 : 1);
        if(!dist.has(pp) || nd < dist.get(pp)){ dist.set(pp, nd); H.push(nd, pp); } } }
    k.dist = dist; k.len = far; }
  // line by line; inside a line a piece starts when the pen has got as far across as its own start (OVERLAP 0 = one after another)
  let clock = 0;
  const nBands = Math.max(...big.map(k => k.band)) + 1;
  for(let b = 0; b < nBands; b++){
    const row = big.filter(k => k.band === b); if(!row.length) continue;
    const sum = row.reduce((s, k) => s + k.len, 0), minX = Math.min(...row.map(k => k.sx)), maxX = Math.max(...row.map(k => k.sx));
    const span = sum * (1 - OVERLAP) - row[row.length - 1].len * (1 - OVERLAP);
    let end = clock, seq = clock;
    for(const k of row){
      const byX = (k.sx - minX) / Math.max(1, maxX - minX) * Math.max(0, span);
      k.t0 = OVERLAP ? clock + byX : seq; seq = k.t0 + k.len + GAP * (OVERLAP ? 0 : 1);
      for(const [p, d] of k.dist) T[p] = k.t0 + d;
      end = Math.max(end, k.t0 + k.len); }
    clock = end + GAP; }
  const total = clock - GAP;
  // everything else — specks, soft edges, the background — takes the time of the nearest timed pixel
  const out = new Float32Array(N); const q = [];
  for(let i = 0; i < N; i++){ if(T[i] >= 0){ out[i] = T[i] / total; q.push(i); } else out[i] = -1; }
  for(let k = 0; k < q.length; k++){ const p = q[k], x = p % w, y = (p / w) | 0;
    for(const [dx, dy] of nb){ const xx = x + dx, yy = y + dy; if(xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const pp = yy * w + xx; if(out[pp] < 0){ out[pp] = out[p]; q.push(pp); } } }
  // half size, boxed, 8 bit
  const W = Math.ceil(w / 2), H = Math.ceil(h / 2), oc = document.createElement('canvas'); oc.width = W; oc.height = H;
  const og = oc.getContext('2d'), od = og.createImageData(W, H);
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){ let s = 0, n = 0;
    for(let dy = 0; dy < 2; dy++) for(let dx = 0; dx < 2; dx++){ const xx = x * 2 + dx, yy = y * 2 + dy; if(xx < w && yy < h){ s += out[yy * w + xx]; n++; } }
    const v = Math.round(Math.min(1, Math.max(0, s / n)) * 255), o = (y * W + x) * 4; od.data[o] = od.data[o + 1] = od.data[o + 2] = v; od.data[o + 3] = 255; }
  og.putImageData(od, 0, 0);
  // a debug sheet: the logo at six moments of the writing, on dark
  const ts = [0.12, 0.3, 0.5, 0.7, 0.88, 1.05], fade = 0.09, sc = 0.5, dw = Math.round(w * sc), dh = Math.round(h * sc);
  const dbg = document.createElement('canvas'); dbg.width = dw * 3; dbg.height = dh * 2; const dg = dbg.getContext('2d'); dg.fillStyle = '#3a1410'; dg.fillRect(0, 0, dbg.width, dbg.height);
  ts.forEach((t, n) => { const f = document.createElement('canvas'); f.width = w; f.height = h; const fg = f.getContext('2d'); const fd = fg.createImageData(w, h);
    for(let i = 0; i < N; i++){ const a = Math.min(1, Math.max(0, (t - out[i]) / fade)); fd.data[i * 4] = P[i * 4]; fd.data[i * 4 + 1] = P[i * 4 + 1]; fd.data[i * 4 + 2] = P[i * 4 + 2]; fd.data[i * 4 + 3] = P[i * 4 + 3] * a; }
    fg.putImageData(fd, 0, 0); dg.drawImage(f, (n % 3) * dw, ((n / 3) | 0) * dh, dw, dh); });
  return { map: oc.toDataURL('image/png'), dbg: dbg.toDataURL('image/png'), pieces: big.map(k => ({ band: k.band, area: k.area, box: [k.x0, k.y0, k.x1, k.y1], len: Math.round(k.len) })), specks: comps.length - big.length, total: Math.round(total) };
})()` });
const v = r.result.result.value;
if(!v){ console.log(JSON.stringify(r.result).slice(0, 600)); process.exit(1); }
writeFileSync(OUT, Buffer.from(v.map.split(',')[1], 'base64'));
if(DBG) writeFileSync(DBG, Buffer.from(v.dbg.split(',')[1], 'base64'));
console.log(JSON.stringify({ pieces: v.pieces.length, specks: v.specks, total: v.total }));
if(process.env.LIST) console.log(JSON.stringify(v.pieces));
ws.close(); chrome.kill();
