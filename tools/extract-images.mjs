/* Lift the inlined member photos out of index.html into assets/members/.
 *
 * Every member carried its portrait as a base64 data URI, which put roughly
 * half of index.html's weight in front of the first paint: nothing renders
 * until the whole document has arrived, photos of members nobody scrolled to
 * included. As files they are fetched lazily, cached individually, and a
 * changed portrait no longer invalidates the document for everyone.
 *
 * Run once: node tools/extract-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'assets/members');

const EXT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' };

// The id always precedes the photo inside the same member literal. Barring
// braces from the gap keeps the match inside one literal: without that, an
// `id:` in an earlier object (groups, teams) pairs with a later member's
// photo and swallows everything in between.
const PHOTO = /id:\s*'([a-z0-9-]+)'([^{}]*?)photo:\s*'data:image\/(\w+);base64,([^']+)'/g;

const before = fs.readFileSync(HTML, 'utf8');
fs.mkdirSync(OUT, { recursive: true });

let count = 0, bytes = 0;
const after = before.replace(PHOTO, (whole, id, between, type, b64) => {
  // A stray `id:` further up would make `between` span half the file; a real
  // member literal keeps its photo within a few hundred characters.
  if (between.length > 2000) return whole;
  const ext = EXT[type.toLowerCase()] || type.toLowerCase();
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(OUT, `${id}.${ext}`), buf);
  count++; bytes += buf.length;
  return `id:'${id}'${between}photo:'assets/members/${id}.${ext}'`;
});

fs.writeFileSync(HTML, after);

const kb = n => `${(n / 1024).toFixed(0)} KB`;
console.log(`แยกรูป ${count} ไฟล์ (${kb(bytes)}) ไปที่ assets/members/`);
console.log(`index.html: ${kb(Buffer.byteLength(before))} → ${kb(Buffer.byteLength(after))}`);
