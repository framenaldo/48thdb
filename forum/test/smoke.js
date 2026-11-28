// A walk through the board in a real browser, against `wrangler dev` with a fresh local database:
//   npx wrangler d1 migrations apply 48thforum --local && npx wrangler dev --port 8790 --var GUEST_CACHE:0
// (the guest cache off: the test's guest must see each change at once)
//   node test/smoke.js [http://localhost:8790] [folder for screenshots]
// It signs three members up, makes the first an admin (through wrangler d1 execute --local),
// and goes through posting, the moderators' queue, quoting, reporting, pinning and search.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

// a w×h PNG (a colour ramp) made here, so the test needs no picture file
function png(w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x % 256; raw[o + 1] = y % 256; raw[o + 2] = 160; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const BIG = { name: 'concert.png', mimeType: 'image/png', buffer: png(2400, 1200) };

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const BASE = process.argv[2] || 'http://localhost:8790';
const SHOTS = process.argv[3] || '';
const WRANGLER = process.env.WRANGLER || 'npx';
const sql = (q) => execFileSync(WRANGLER, [...(WRANGLER === 'npx' ? ['wrangler'] : []), 'd1', 'execute', '48thforum', '--local', '--command', q], { stdio: 'pipe' });

const stamp = Date.now().toString(36).slice(-4);
const A = `ชาเย็น${stamp}`, B = `mango_${stamp}`, C = `ปลาทู${stamp}`;
const PW = 'test-password-123';
const errors = [];

const browser = await chromium.launch();
async function member(name, mobile = false) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  // Google's fonts and Firebase (the 48thDb sign-in) may not be reachable where the test runs: the page works on without them
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|status of 404/.test(m.text()) && !/gstatic\.com|googleapis\.com/.test(m.location()?.url || '')) errors.push(`${name}: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  return page;
}
async function register(page, name) {
  await page.goto(`${BASE}/register`);
  await page.fill('#r-name', name);
  await page.fill('#r-pass', PW);
  await page.fill('#r-pass2', PW);
  await page.check('input[name=rules]');
  await page.click('form[action="/register"] button.big');   // not the 48thDb button above it
  await page.waitForURL(/m=welcome/);
}
const shot = async (page, file, full = true) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${file}.png`, fullPage: full }); };
const text = (page) => page.locator('main').innerText();

sql('DELETE FROM hits');
const a = await member(A), b = await member(B), c = await member(C, true);
await register(a, A); await register(b, B); await register(c, C);
sql(`UPDATE users SET role = 'admin' WHERE name = '${A}'`);
console.log('✓ three members signed up, the first made admin');

// a guest is turned away from posting
const guest = await member('guest');
await guest.goto(`${BASE}/new/events`);
assert.match(guest.url(), /\/login\?back=/);
// a fourth sign-up from the same address today is refused
await guest.goto(`${BASE}/register`);
await guest.fill('#r-name', `extra${stamp}`); await guest.fill('#r-pass', PW); await guest.fill('#r-pass2', PW); await guest.check('input[name=rules]');
await guest.click('form[action="/register"] button.big');
assert.match(await text(guest), /หลายบัญชีเกินไป/);
console.log('✓ guests must sign in; a fourth sign-up from one address is refused');

// B's first topic waits for a moderator
await b.goto(`${BASE}/new/events`);
await b.selectOption('select[name=tag]', 'review');
await b.fill('#f-title', 'รีวิวมินิคอนเสิร์ตโรดโชว์วันเสาร์ ใครไปบ้าง มาเล่ากัน!');
await b.fill('#f-body', 'เพลงเปิดคือดีมาก [b]ไฟเวทีสวย[/b]\nยืนโซนซ้ายเห็นชัดมาก แนะนำไปก่อนเวลาสักชั่วโมง\nแผนที่ https://example.com/map');
await b.click('button[name=preview]');
assert.match(await b.locator('.preview').innerText(), /ไฟเวทีสวย/);
await b.click('button.btn.new');
await b.waitForURL(/\/t\/\d+\?m=pending/);
const topicUrl = b.url().split('?')[0];
assert.match(await text(b), /รอผู้ดูแลตรวจ/);
await guest.goto(topicUrl);
assert.match(await text(guest), /ไม่พบหน้านี้/);
console.log('✓ a new member\'s topic waits, and guests cannot see it yet');

// the admin sees it in the queue and lets it through
await a.goto(`${BASE}/mod`);
assert.match(await a.locator('.moddesk').innerText(), /บัญชีใหม่/);
await shot(a, 'mod-queue');
await a.locator('.mcard', { hasText: 'รีวิวมินิคอนเสิร์ต' }).locator('button.mb.ok').click();
await a.waitForURL(/m=done/);
await guest.goto(topicUrl);
assert.match(await text(guest), /ไฟเวทีสวย/);
assert.equal(await guest.locator('.ptext a[href="https://example.com/map"]').count(), 1);
console.log('✓ the admin approves it from the queue; now everyone sees it, links work');

// two more of B's posts, approved from the topic page itself; after three B is trusted
for (const words of ['ขอบคุณทุกคนที่มาคุยกันนะ', 'รอบหน้าเจอกันที่เชียงใหม่']) {
  await b.goto(`${topicUrl}/reply`);
  await b.fill('#f-body', words);
  await b.click('button.btn.new');
  await b.waitForURL(/m=pending/);
  await a.goto(topicUrl);
  await a.locator('.post', { hasText: words }).locator('button.b.ok').click();
  await a.waitForURL(/m=done/);
}
await b.goto(topicUrl);
await b.fill('.reply textarea', 'โพสต์ที่สี่ ขึ้นทันทีแล้ว 🎉');
await b.click('.reply button.btn.new');
await b.waitForURL(/\/t\/\d+(\?[^#]*)?#p\d+$/);
assert.doesNotMatch(b.url(), /pending/);
console.log('✓ after three approved posts a member posts straight away');

// a picture: shrunk in the browser to 1,600 px, sent, shown in the post, served as a JPEG
await b.setInputFiles('.reply [data-pic-input]', BIG);
await b.waitForFunction(() => /\[img=1600x800\][A-Za-z0-9_-]{16}\[\/img\]/.test(document.querySelector('.reply textarea').value));
const picKey = (await b.inputValue('.reply textarea')).match(/\](\S{16})\[/)[1];
await b.locator('.reply textarea').press('End');
await b.locator('.reply textarea').type('รูปจากหน้างาน');
await b.click('.reply button.btn.new');
await b.waitForURL(/#p\d+$/);
const pic = b.locator(`.ptext a.pic img[src="/i/${picKey}"]`);
await pic.waitFor();
assert.equal(await pic.evaluate((i) => i.decode().then(() => i.naturalWidth)), 1600);
const served = await b.request.get(`${BASE}/i/${picKey}`);
assert.equal(served.status(), 200);
assert.equal(served.headers()['content-type'], 'image/jpeg');
assert.equal((await served.body())[0], 0xff);
assert.equal((await b.request.post(`${BASE}/upload?w=1&h=1`, { data: 'not a picture', headers: { 'Content-Type': 'text/plain' } })).status(), 415);
assert.equal((await guest.request.post(`${BASE}/upload?w=1&h=1`, { data: BIG.buffer })).status(), 401);
console.log('✓ a picture is shrunk to 1,600 px, posted, shown and served; a non-picture and a guest are refused');

// deleting the post deletes its picture
await b.locator('.post', { hasText: 'รูปจากหน้างาน' }).locator('form[action$="/delete"] button').click();
await b.waitForURL(/m=deleted/);
assert.equal((await b.request.get(`${BASE}/i/${picKey}`)).status(), 404);
console.log('✓ a deleted post takes its picture with it');

// a profile picture: cut square, sent, shown beside the member's posts
await b.goto(`${BASE}/settings`);
await b.setInputFiles('[data-avatar-input]', { ...BIG, name: 'me.png' });
await b.waitForURL(/settings\?m=saved/);
await b.goto(topicUrl);
const face = b.locator('.post .puser img.ava').first();
assert.match(await face.getAttribute('src'), /^\/i\/[A-Za-z0-9_-]{16}$/);
assert.equal(await face.evaluate((i) => i.decode().then(() => i.naturalWidth)), 256);
console.log('✓ a profile picture is cut square, saved and shown beside the posts');

// a trusted member's post with a phone number still waits
await b.fill('.reply textarea', 'สนใจทักมาที่ 081-234-5678 ได้เลย');
await b.click('.reply button.btn.new');
await b.waitForURL(/m=pending/);
await a.goto(`${BASE}/mod`);
assert.match(await a.locator('.moddesk').innerText(), /มีเลขบัญชีหรือเบอร์โทร/);
await a.locator('.mcard', { hasText: '081-234-5678' }).locator('button.mb.no').click();
await a.waitForURL(/m=done/);
console.log('✓ a post with a phone number waits even from a trusted member; rejected');

// C (on a phone) quotes B
await c.goto(topicUrl);
await c.locator('.post').first().locator('a.b', { hasText: 'อ้างอิง' }).click();
assert.match(await c.inputValue('#f-body'), /^\[quote="mango_/);
await c.locator('#f-body').press('End');
await c.locator('#f-body').type('เห็นด้วยเรื่องไฟเวที! รอบหน้าจะไปโซนซ้ายบ้าง');
await c.setInputFiles('[data-pic-input]', { ...BIG, name: 'from-phone.png' });           // on a phone-sized screen
await c.waitForFunction(() => /\[img=1600x800\]/.test(document.querySelector('#f-body').value));
await c.click('button.btn.new');
await c.waitForURL(/m=pending/);
await a.goto(`${BASE}/mod`);
assert.equal(await a.locator('.mcard', { hasText: 'โซนซ้ายบ้าง' }).locator('.mpics img').count(), 1);   // a moderator sees the picture
await a.locator('.mcard', { hasText: 'โซนซ้ายบ้าง' }).locator('button.mb.ok').click();
await a.waitForURL(/m=done/);
await guest.goto(topicUrl);
assert.equal(await guest.locator('blockquote.quote cite').count(), 1);
console.log('✓ quoting works and shows as a quote box');

// reporting: C reports B's post
await c.goto(topicUrl);
await c.locator('.post').nth(1).locator('a.b', { hasText: 'แจ้งลบ' }).click();
await c.check('input[name=reason][value="4"]');
await c.click('button.btn.new');
await c.waitForURL(/m=reported/);
await a.goto(`${BASE}/mod`);
assert.match(await a.locator('.moddesk').innerText(), /แจ้งลบ 1 ครั้ง/);
await a.locator('.mcard', { hasText: 'สแปม' }).locator('button.mb.ok').click();
await a.waitForURL(/m=done/);
console.log('✓ a report reaches the queue and is cleared');

// the admin pins and locks the topic
await a.goto(topicUrl);
await a.selectOption('.modbar select[name=act]', 'sticky');
await a.click('.modbar button');
await a.waitForURL(/m=done/);
await a.selectOption('.modbar select[name=act]', 'lock');
await a.click('.modbar button');
await a.waitForURL(/m=done/);
await c.goto(topicUrl);
assert.equal(await c.locator('.reply').count(), 0);
assert.match(await text(c), /ล็อกแล้ว/);
await a.selectOption('.modbar select[name=act]', 'unlock');
await a.click('.modbar button');
await a.waitForURL(/m=done/);
console.log('✓ pin and lock work; a locked topic takes no replies');

// a few more topics so the lists look lived in
const more = [
  ['general', 'q', 'เพลงไหนฟังแล้วร้องไห้ทุกที', 'ของเราคือเพลงนี้ ท่อนฮุคคือที่สุด'],
  ['events', 'friend', '[โรดโชว์เชียงใหม่] หาเพื่อนไปด้วย 2 คน ออกจากกรุงเทพฯ', 'ออกเช้าวันเสาร์ หารค่ารถกัน'],
  ['music', '', 'จัดอันดับซิงเกิลที่ชอบที่สุด (ห้ามเกิน 5!)', '1. …\n2. …\n3. …'],
  ['trade', 'swap', 'แลกโฟโต้เซ็ต Hoop ↔ Monet ใบไหนก็ได้', 'นัดรับที่งานได้'],
];
for (const [slug, tag, title, body] of more) {
  await a.goto(`${BASE}/new/${slug}`);
  if (tag) await a.selectOption('select[name=tag]', tag);
  await a.fill('#f-title', title);
  await a.fill('#f-body', body);
  await a.click('button.btn.new');
  await a.waitForURL(/\/t\/\d+$/);
}
console.log('✓ the admin\'s topics go up straight away');

// a topic of pictures: two at once, and the forum's row says so
await a.goto(`${BASE}/new/events`);
await a.fill('#f-title', `ทริปเชียงใหม่ รูปเยอะมาก ${stamp}`);
await a.fill('#f-body', 'บรรยากาศหน้างาน');
await a.setInputFiles('[data-pic-input]', [BIG, { ...BIG, name: 'stage.png' }]);
await a.waitForFunction(() => (document.querySelector('#f-body').value.match(/\[img=/g) || []).length === 2);
await a.click('button.btn.new');
await a.waitForURL(/\/t\/\d+$/);
assert.equal(await a.locator('.ptext a.pic img').count(), 2);
await a.goto(`${BASE}/f/events`);
assert.match(await a.locator('.topics .tr', { hasText: `ทริปเชียงใหม่ รูปเยอะมาก ${stamp}` }).innerText(), /2 รูป/);
await shot(a, 'pics-forum');
await a.locator('.topics .tr a', { hasText: `ทริปเชียงใหม่ รูปเยอะมาก ${stamp}` }).click();
await a.locator('.ptext a.pic img').first().evaluate((i) => i.decode());
await shot(a, 'pics-topic');
console.log('✓ a topic with two pictures shows them, and its row says (2 รูป)');

// the red ring: B has not read the admin's new topic in พูดคุยทั่วไป; after reading it the ring goes
const ring = async () => { await b.goto(BASE); return b.locator('.forums .tr', { hasText: 'พูดคุยทั่วไป' }).locator('.ic.new').count(); };
assert.equal(await ring(), 1);
await b.goto(`${BASE}/f/general`);
await b.locator('.topics .tr a', { hasText: 'เพลงไหนฟังแล้วร้องไห้ทุกที' }).click();
await b.waitForURL(/\/t\/\d+$/);
assert.equal(await ring(), 0);
console.log('✓ a forum with an unread topic has its ring, and loses it once read');

// search, profile, members, unread, faq, 404
const found = async (q) => { await guest.goto(`${BASE}/search?q=${encodeURIComponent(q)}`); return guest.locator('.tr1').count(); };
assert.ok(await found('ไฟเวที') >= 1, 'a Thai word inside a sentence');           // the trigram index
assert.ok(await guest.locator('.tr1 mark').count() >= 1);
assert.ok(await found('HOOP') >= 1, 'a title, whatever the capitals');
assert.ok(await found('ไฟ') >= 1, 'two letters, from the latest posts');           // shorter than the index holds
assert.equal(await found('ไม่มีคำนี้แน่นอน'), 0);
await guest.goto(`${BASE}/members`);
assert.match(await text(guest), new RegExp(B));
await b.goto(`${BASE}/unread`);
await b.goto(`${BASE}/faq`);
const nf = await guest.goto(`${BASE}/t/99999`);
assert.equal(nf.status(), 404);
console.log('✓ search, members, unread, rules and 404 answer');

// pictures for the owner
await guest.goto(BASE); await shot(guest, 'index');
await guest.goto(`${BASE}/f/events`); await shot(guest, 'forum');
await a.goto(topicUrl); await shot(a, 'topic');
await c.goto(BASE); await shot(c, 'm-index');
await c.goto(`${BASE}/f/events`); await shot(c, 'm-forum');
await c.goto(topicUrl); await shot(c, 'm-topic');
await guest.goto(`${BASE}/register`); await shot(guest, 'register', false);

await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
console.log('✓ no page errors');
