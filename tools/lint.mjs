/* Parse every script the page loads, and check the page still loads them all.
 *
 * There is no build step and no framework here: a stray bracket in js/feed.js
 * reaches the browser exactly as written, and the only sign is a blank screen.
 * `node --check` catches that in a second, without a linter's opinions about
 * style, which this code does not need and did not ask for.
 *
 * It also guards the one rule the split introduced: index.html has to load
 * every file in js/, in an order where nothing is used before it exists.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const onDisk = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort();
const loaded = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1].slice(3));

let problems = 0;

for (const file of onDisk) {
  const full = path.join(ROOT, 'js', file);
  try {
    execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
  } catch (err) {
    console.error(`✗ js/${file}\n${(err.stderr || '').toString().trim()}`);
    problems++;
  }
}

for (const file of onDisk) {
  if (!loaded.includes(file)) {
    console.error(`✗ js/${file} มีอยู่ในโฟลเดอร์ แต่ index.html ไม่ได้โหลด`);
    problems++;
  }
}
for (const file of loaded) {
  if (!onDisk.includes(file)) {
    console.error(`✗ index.html โหลด js/${file} แต่ไม่มีไฟล์นี้`);
    problems++;
  }
}

// data.js declares what every other script reads, so it has to be parsed
// before them. firebase.js is exempt: it sits in <head> and only starts the
// SDK, which nothing in js/ touches at load time.
const order = loaded.filter(f => f !== 'firebase.js');
if (order.length && order[0] !== 'data.js') {
  console.error(`✗ js/data.js ต้องโหลดก่อนสคริปต์อื่นใน js/ (ตอนนี้ตัวแรกคือ js/${order[0]})`);
  problems++;
}

if (problems) {
  console.error(`\nเจอปัญหา ${problems} จุด`);
  process.exit(1);
}
console.log(`✓ ตรวจไวยากรณ์ ${onDisk.length} ไฟล์ และลำดับการโหลดใน index.html ผ่านหมด`);
