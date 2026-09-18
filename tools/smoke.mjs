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
import { createHash } from 'node:crypto';
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
  // Rendering a view is only half of it: the handlers live in a different file
  // from the markup now, and a name that failed to carry across would only show
  // up on a click.
  {
    name: '09-interactions',
    url: '?v=browse',
    async drive(page) {
      // A row of the member table, not just the first match: the earlier ones
      // are links inside the birthday ticker, which scrolls and so never holds
      // still long enough to be clicked.
      await page.locator('.row[data-action="open-member"]').first().click({ timeout: 5000 });
      await page.waitForTimeout(400);
      // The X, not the backdrop: a backdrop click lands on the card sitting on
      // top of it, which the handler deliberately ignores.
      await page.locator('.modal-close-btn').first().click({ timeout: 5000 });
      await page.waitForTimeout(300);
      await page.fill('#search-input', 'เฟม');
      await page.waitForTimeout(400);
      await page.fill('#search-input', '');
      await page.click('[data-action="toggle-theme"]');
      await page.waitForTimeout(300);
    },
  },
  // The other half of the schedule move: with events in the database, the feed
  // has to show those and not the seed's. Nothing else proves the read path —
  // every case above renders identically whether it worked or fell back.
  {
    name: '10-events-from-db',
    url: '?v=feed',
    fixture: {
      meta: [{ id: 'version', data: 7 }],
      events: [
        { id: 'stub-ev-1', title: 'งานทดสอบจากฐานข้อมูล', start: '2026-09-18', end: '2026-09-18',
          time: '18:00', venue: 'ลานทดสอบ', members: [] },
        { id: 'stub-ev-2', title: 'งานทดสอบใบที่สอง', start: '2026-12-24', end: '2026-12-24',
          venue: 'ลานทดสอบ', members: [] },
      ],
    },
    expect: ['งานทดสอบจากฐานข้อมูล', 'งานทดสอบใบที่สอง'],
  },
];

/* Playwright expects the exact browser build its own version pins, and the
 * web container ships one that was installed for the pinned version. If the
 * two ever drift apart, fall back to whatever Chromium the image does have
 * rather than downloading 150 MB to discover it was there all along. */
async function launchChromium() {
  try {
    return await chromium.launch();
  } catch (err) {
    const fallback = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
    if (!fs.existsSync(fallback)) throw err;
    console.warn(`playwright ไม่เจอเบราว์เซอร์ของตัวเอง — ใช้ ${fallback} แทน`);
    return chromium.launch({ executablePath: fallback });
  }
}

function serve() {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    let body;
    try {
      body = await readFile(path.join(ROOT, rel));
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    // Hosting answers with an ETag per file and the app's update check reads
    // them, so the test server has to have them too or that path goes untested.
    res.writeHead(200, {
      'content-type': TYPES[path.extname(rel)] || 'application/octet-stream',
      etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function capture(label) {
  const outDir = path.join(ROOT, '.smoke', label);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchChromium();
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
    if (view.fixture) await page.addInitScript(data => { window.__STUB_DATA__ = data; }, view.fixture);
    const errors = [];
    // "Failed to load resource" on its own never says which one, so the status
    // line is recorded next to it.
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => r.status() >= 400 &&
      errors.push(`HTTP ${r.status()} ${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '')}`));

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
    if (view.drive) await view.drive(page).catch(e => errors.push(`DRIVE: ${e.message.split('\n')[0]}`));

    const body = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
    for (const wanted of view.expect || []) {
      if (!body.includes(wanted)) errors.push(`EXPECT: ไม่เจอ "${wanted}" ในหน้า`);
    }

    report[view.name] = {
      errors,
      title: await page.title(),
      text: (await page.locator('#app').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400),
      // Not part of the fingerprint — it changes whenever a file does. What
      // matters is that the update check still resolves to something.
      deployTag: Boolean(await page.evaluate(() => fetchDeployTag())),
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

  const failed = Object.entries(report).filter(([, r]) =>
    r.errors.length || r.counts.brokenImages.length || !r.deployTag);
  console.log(`\n${label}: ${Object.keys(report).length} views → .smoke/${label}/`);
  for (const [name, r] of Object.entries(report)) {
    console.log(`  ${r.errors.length || r.counts.brokenImages.length ? '✗' : '✓'} ${name}  ` +
      `${r.counts.elements} el, ${r.counts.images} img` +
      (r.deployTag ? '' : ', NO DEPLOY TAG') +
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
