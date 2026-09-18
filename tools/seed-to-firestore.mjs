/* Copy the schedule out of js/data.js and into Firestore, once.
 *
 * After this the events collection is the live copy: the admin screen edits it
 * and every reader sees the change without a deploy. The seed stays in the
 * repo as the offline fallback, so running this is additive — nothing breaks
 * if it is never run, and nothing breaks if it is run twice.
 *
 *   node tools/seed-to-firestore.mjs            # แสดงว่าจะเขียนอะไรบ้าง ไม่เขียนจริง
 *   node tools/seed-to-firestore.mjs --yes      # เขียนจริง
 *
 * ต้องมี tools/serviceAccount.json (Firebase Console → Project settings →
 * Service accounts → Generate new private key) และห้าม commit ไฟล์นั้น
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const KEY = path.join(ROOT, 'tools/serviceAccount.json');
const WRITE = process.argv.includes('--yes');

// js/data.js is a plain script, not a module, so it is run in a sandbox rather
// than imported. `const` at the top level of a script lands in the context's
// lexical scope and never on the sandbox object, so the value is read back by
// evaluating its name in the same context.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(ROOT, 'js/data.js'), 'utf8'), sandbox);
const events = vm.runInContext('SEED_SCHEDULE', sandbox);

if (!Array.isArray(events) || !events.length) {
  console.error('อ่าน SEED_SCHEDULE จาก js/data.js ไม่ได้');
  process.exit(1);
}

const missing = events.filter(e => !e.id || !e.start);
if (missing.length) {
  console.error(`งาน ${missing.length} รายการไม่มี id หรือ start — แก้ js/data.js ก่อน`);
  console.error(missing.map(e => `  ${e.id || '(ไม่มี id)'} · ${e.title}`).join('\n'));
  process.exit(1);
}

console.log(`เจองาน ${events.length} รายการใน js/data.js`);
console.log(events.map(e => `  ${e.start}  ${e.id.padEnd(28)} ${e.title}`).join('\n'));

if (!WRITE) {
  console.log('\nนี่คือการซ้อมเฉย ๆ ยังไม่ได้เขียนอะไรลง Firestore');
  console.log('ถ้าถูกต้องแล้ว รันซ้ำด้วย:  node tools/seed-to-firestore.mjs --yes');
  process.exit(0);
}

if (!existsSync(KEY)) {
  console.error(`ไม่เจอ ${path.relative(ROOT, KEY)} — ดูวิธีสร้างในหัวไฟล์นี้`);
  process.exit(1);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, 'utf8'))) });
const db = getFirestore();

let batch = db.batch(), n = 0;
for (const event of events) {
  // merge, so a field edited in the app is not overwritten by the seed's copy
  batch.set(db.collection('events').doc(event.id), event, { merge: true });
  if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
}
await batch.commit();

// Readers cache by this counter; bumping it is what tells them to refetch.
await db.doc('meta/version').set(
  { data: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);

console.log(`\nเขียนแล้ว ${events.length} รายการลงคอลเล็กชัน events และบวกเลขเวอร์ชันข้อมูลแล้ว`);
console.log('เปิดเว็บแล้วกดรีเฟรช ควรเห็นงานชุดเดิมทุกอย่าง — ต่อจากนี้แก้จากหน้าแอดมินได้เลย');
