/* Screenshot every main view and record what the page rendered.
 *
 * Refactors here are mechanical — moving code between files, swapping a base64
 * photo for a file — so the question is always "does it still look and behave
 * the same", which a diff cannot answer. This drives the real page in Chromium
 * against tools/firebase-stub.js and writes both PNGs and a JSON fingerprint
 * (element counts, first member names, console errors) per view.
 *
 *   node tools/smoke.mjs before        # snapshot the current state
 *   ...refactor...
 *   node tools/smoke.mjs after         # snapshot again
 *   node tools/smoke.mjs --diff before after
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

const VIEWS = [
  { name: '01-feed', url: '?v=feed' },
  { name: '02-browse', url: '?v=browse' },
  { name: '03-member', url: '?m=bnk-fame' },
  { name: '04-groups', url: '?v=groups' },
  { name: '05-org', url: '?v=org' },
  { name: '06-discography', url: '?v=discography' },
  { name: '07-stats', url: '?v=stats' },
  { name: '08-feed-dark', url: '?v=feed', dark: true },
];

function serve() {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    try {
      const body = await readFile(path.join(ROOT, rel));
      res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function capture(label) {
  const outDir = path.join(ROOT, '.smoke', label);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const report = {};

  for (const view of VIEWS) {
    const ctx = await browser.newContext({
      viewport: { width: 414, height: 896 },
      deviceScaleFactor: 2,
      colorScheme: view.dark ? 'dark' : 'light',
      locale: 'th-TH',
      timezoneId: 'Asia/Bangkok',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(String(e)));

    // The three gstatic SDKs become one local stub; everything else off-origin
    // (fonts, Firestore) is answered with an empty 200 so runs neither depend
    // on the network nor log failures that would drown out real errors.
    const stub = fs.readFileSync(path.join(ROOT, 'tools/firebase-stub.js'), 'utf8');
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (new URL(url).hostname === '127.0.0.1') return route.continue();
      if (url.includes('/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: stub });
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    });

    await page.goto(base + view.url, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.querySelector('#app .loading'), null, { timeout: 15000 })
      .catch(() => errors.push('TIMEOUT: app never rendered'));
    await page.waitForTimeout(600);   // let entrance animations settle

    report[view.name] = {
      errors,
      title: await page.title(),
      text: (await page.locator('#app').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400),
      counts: await page.evaluate(() => ({
        elements: document.querySelectorAll('#app *').length,
        images: document.images.length,
        brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')?.slice(0, 80)),
        buttons: document.querySelectorAll('button').length,
      })),
    };

    await page.screenshot({ path: path.join(outDir, `${view.name}.png`), fullPage: true });
    await ctx.close();
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  const failed = Object.entries(report).filter(([, r]) => r.errors.length || r.counts.brokenImages.length);
  console.log(`\n${label}: ${Object.keys(report).length} views → .smoke/${label}/`);
  for (const [name, r] of Object.entries(report)) {
    console.log(`  ${r.errors.length || r.counts.brokenImages.length ? '✗' : '✓'} ${name}  ` +
      `${r.counts.elements} el, ${r.counts.images} img` +
      (r.counts.brokenImages.length ? `, ${r.counts.brokenImages.length} BROKEN` : '') +
      (r.errors.length ? `\n      ${r.errors.slice(0, 3).join('\n      ')}` : ''));
  }
  process.exitCode = failed.length ? 1 : 0;
}

function diff(a, b) {
  const read = l => JSON.parse(fs.readFileSync(path.join(ROOT, '.smoke', l, 'report.json'), 'utf8'));
  const [A, B] = [read(a), read(b)];
  let same = true;
  for (const name of Object.keys(A)) {
    const x = A[name], y = B[name] || {};
    const problems = [];
    if (x.text !== y.text) problems.push('text differs');
    if (x.counts?.elements !== y.counts?.elements) problems.push(`elements ${x.counts?.elements} → ${y.counts?.elements}`);
    if (x.counts?.images !== y.counts?.images) problems.push(`images ${x.counts?.images} → ${y.counts?.images}`);
    if ((y.counts?.brokenImages || []).length) problems.push(`broken: ${y.counts.brokenImages.join(', ')}`);
    if ((y.errors || []).length > (x.errors || []).length) problems.push(`errors: ${y.errors.join(' | ')}`);
    console.log(problems.length ? `✗ ${name}: ${problems.join('; ')}` : `✓ ${name}`);
    if (problems.length) same = false;
  }
  if (!same) process.exitCode = 1;
  console.log(same ? '\nทุกหน้าเหมือนเดิม' : '\nมีหน้าที่เปลี่ยนไป — เปิด PNG ใน .smoke/ เทียบดู');
}

const args = process.argv.slice(2);
if (args[0] === '--diff') diff(args[1], args[2]);
else await capture(args[0] || 'run');
