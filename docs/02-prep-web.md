# 02 — จัดบ้านโค้ดเว็บ ก่อนห่อเป็นแอป

ทำไมต้องทำก่อน: `index.html` ตอนนี้ 1.4 MB เพราะรูปเมมเบอร์ทุกใบเป็น base64
ฝังอยู่ในไฟล์ (58 จุด, แต่ละบรรทัดยาว 13,000–18,000 ตัวอักษร) ผลคือ

- เปิดแอปครั้งแรกต้องโหลด 1.4 MB ก่อนเห็นอะไรเลย — บนเน็ตมือถือคือ 3–6 วินาทีจอขาว
- แก้รูปคนเดียว = ไฟล์ทั้งก้อนเปลี่ยน = ผู้ใช้ทุกคนโหลดใหม่ 1.4 MB
- Apple/Google ไม่ได้ห้าม แต่รีวิวเวอร์เปิดแล้วค้าง = ความประทับใจแรกเสีย

## ขั้นที่ 1 — แยกไฟล์ (ครึ่งวัน)

เป้าหมาย:

```
src/
├── index.html      ← เหลือแต่โครง HTML (~200 บรรทัด)
├── css/app.css     ← ทุกอย่างในแท็ก <style>
├── js/
│   ├── firebase.js ← config + init
│   ├── data.js     ← SEED_* ทั้งหมด (ชั่วคราว ก่อนย้ายขึ้น Firestore)
│   ├── i18n.js     ← EN, TH_*, localize()
│   ├── ui.js       ← render*, การ์ด, โมดัล
│   └── app.js      ← state, router, bootstrap
└── assets/         ← รูป
```

วิธีทำแบบไม่พัง: ทำทีละก้อน commit ทีละก้อน เปิดเว็บเช็กทุกครั้ง
ลำดับที่ปลอดภัยที่สุดคือ CSS ก่อน (ย้ายไม่กระทบ logic) → data → i18n → ui → app

> บอกผมได้ ผมแยกให้ในรีโปนี้ได้เลย ใช้เวลาไม่นาน และเช็กว่าหน้าตาไม่เพี้ยนให้ด้วย

## ขั้นที่ 2 — เอารูปออกจาก base64 ไป Firebase Storage (1 วัน)

### 2.1 เปิด Storage

Firebase Console → Build → Storage → Get started → เลือก region `asia-southeast1`
(สิงคโปร์ ใกล้ไทยสุด)

### 2.2 สคริปต์แปลง base64 → ไฟล์จริง

สร้าง `tools/extract-images.mjs`

```js
// ดึง data:image ทุกอันใน index.html ออกมาเป็นไฟล์ แล้วแทนที่ด้วย URL
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const BASE = 'https://firebasestorage.googleapis.com/v0/b/<BUCKET>/o/members%2F';
let out = html, n = 0;

// จับคู่ id ของเมมเบอร์กับรูปที่อยู่ในบล็อกเดียวกัน
out = out.replace(/id:\s*'([a-z0-9-]+)'([\s\S]{0,400}?)photo:\s*'data:image\/(\w+);base64,([^']+)'/g,
  (m, id, mid, ext, b64) => {
    fs.mkdirSync('assets/members', { recursive: true });
    fs.writeFileSync(`assets/members/${id}.${ext}`, Buffer.from(b64, 'base64'));
    n++;
    return `id: '${id}'${mid}photo: 'assets/members/${id}.${ext}'`;
  });

fs.writeFileSync('index.html', out);
console.log(`แยกรูปแล้ว ${n} ไฟล์`);
```

```bash
node tools/extract-images.mjs
ls -la assets/members | head          # ดูว่าได้รูปจริง
du -sh index.html                     # ควรเหลือ ~200–300 KB
```

### 2.3 บีบรูปก่อนอัปโหลด

```bash
brew install imagemagick webp
# ย่อให้กว้างสุด 600px + แปลงเป็น webp (เล็กกว่า jpg ~30%)
for f in assets/members/*; do
  cwebp -q 82 -resize 600 0 "$f" -o "${f%.*}.webp"
done
rm assets/members/*.png assets/members/*.jpg 2>/dev/null
du -sh assets/members    # รูป 60 คน ควรอยู่ราว 2–4 MB รวมกัน
```

### 2.4 เลือกที่เก็บ

มีสองทาง เลือกอย่างใดอย่างหนึ่ง

**ทาง A (ง่ายกว่า) — วางไว้ใน repo แล้ว deploy ไปกับ Hosting**
ข้อดี: ฟรี เร็ว (CDN ของ Firebase) ไม่ต้องเขียนโค้ดเพิ่มเลย นอกจากเปลี่ยน path
ข้อเสีย: เพิ่ม/เปลี่ยนรูป = ต้อง deploy ใหม่
→ **แนะนำอันนี้สำหรับรูปเมมเบอร์** เพราะไม่ค่อยเปลี่ยน

**ทาง B — Firebase Storage**
ข้อดี: อัปรูปใหม่จากหน้าแอดมินได้ ไม่ต้อง deploy (ดี ถ้าจะให้ทีมงานช่วยอัปเดต)
ข้อเสีย: ต้องตั้ง rules, นับเป็น quota
→ **แนะนำสำหรับโปสเตอร์งาน** ที่เพิ่มใหม่บ่อย

```bash
# ทาง B: อัปขึ้น Storage
npm i -g @google-cloud/storage    # หรือใช้หน้าเว็บ Console ลากไฟล์เข้าไปก็ได้
```

Storage Rules (อ่านได้ทุกคน เขียนได้แต่แอดมิน):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && firestore.get(/databases/(default)/documents/admins/$(request.auth.uid)) != null;
    }
  }
}
```

### 2.5 โหลดรูปแบบขี้เกียจ (lazy)

ในโค้ดที่สร้าง `<img>` ใส่สองอย่างนี้ทุกที่:

```html
<img src="assets/members/emmy.webp" loading="lazy" decoding="async"
     width="200" height="200" alt="เอ็มมี่">
```

`loading="lazy"` = รูปที่ยังไม่เลื่อนไปถึงจะไม่โหลด
`width/height` = กันจอกระตุก (layout shift) ตอนรูปเข้ามา

## ขั้นที่ 3 — ย้ายข้อมูลที่เปลี่ยนบ่อยขึ้น Firestore (2–3 วัน)

ตอนนี้ `SEED_SCHEDULE` (บรรทัด ~2844) อยู่ในโค้ด แปลว่ามีงานใหม่ทีต้องแก้โค้ด
ย้ายขึ้น Firestore แล้วจะอัปเดตจากมือถือได้ ไม่ต้องเปิดคอม (ดู `05-updates.md`)

### 3.1 โครงฐานข้อมูลที่ควรเป็น

```
members/{id}         ← มีแล้ว
events/{id}          ← ย้ายจาก SEED_SCHEDULE
songs/{id}           ← ย้ายจาก SEED_SINGLES + SEED_ALBUMS
senbatsu/{songId}    ← ย้ายจาก SEED_SENBATSU
users/{uid}          ← มีแล้ว: { oshi:[], kamiOshi, bookmarks:{} }
admins/{uid}         ← ว่างเปล่า แค่มี doc = เป็นแอดมิน
meta/version         ← { data: 12, updatedAt } ใช้เช็กว่าต้องโหลดใหม่ไหม
```

### 3.2 สคริปต์ย้ายข้อมูลครั้งเดียว

```bash
npm i firebase-admin
# ดาวน์โหลด service account key: Console → Project settings → Service accounts
#   → Generate new private key → เซฟเป็น tools/serviceAccount.json
echo "tools/serviceAccount.json" >> .gitignore   # ห้าม commit เด็ดขาด
```

`tools/seed-to-firestore.mjs`

```js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

initializeApp({ cert: JSON.parse(readFileSync('tools/serviceAccount.json', 'utf8')) });
const db = getFirestore();

// export SEED_SCHEDULE ออกมาจาก data.js ก่อน (ขั้นที่ 1)
const { SEED_SCHEDULE, SEED_SINGLES, SEED_ALBUMS, SEED_SENBATSU } =
  await import('../src/js/data.js');

async function push(name, rows, idOf) {
  let batch = db.batch(), i = 0;
  for (const row of rows) {
    batch.set(db.collection(name).doc(String(idOf(row))), row, { merge: true });
    if (++i % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`${name}: ${rows.length} รายการ`);
}

await push('events', SEED_SCHEDULE, e => e.id ?? `${e.start}-${e.title}`.slice(0, 80));
await push('songs', [...SEED_SINGLES, ...SEED_ALBUMS], s => s.id);
await push('senbatsu', Object.entries(SEED_SENBATSU).map(([id, v]) => ({ id, ...v })), s => s.id);
await db.doc('meta/version').set({ data: 1, updatedAt: new Date() });
process.exit(0);
```

```bash
node tools/seed-to-firestore.mjs
```

### 3.3 Firestore Rules (สำคัญ — ตอนนี้ยังหลวมอยู่)

Console → Firestore → Rules → วางทับ → Publish

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
             && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    // ข้อมูลสาธารณะ: ใครก็อ่านได้ แต่แก้ได้เฉพาะแอดมิน
    match /members/{id}  { allow read: if true; allow write: if isAdmin(); }
    match /events/{id}   { allow read: if true; allow write: if isAdmin(); }
    match /songs/{id}    { allow read: if true; allow write: if isAdmin(); }
    match /senbatsu/{id} { allow read: if true; allow write: if isAdmin(); }
    match /meta/{id}     { allow read: if true; allow write: if isAdmin(); }

    // ข้อมูลส่วนตัว: เจ้าของเท่านั้น ทั้งอ่านและเขียน
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // รายชื่อแอดมิน: แก้ได้จาก Console เท่านั้น
    match /admins/{uid} { allow read: if isAdmin(); allow write: if false; }
  }
}
```

> **เช็กเดี๋ยวนี้เลย**: ถ้า rules ปัจจุบันยังเป็น `allow read, write: if true`
> แปลว่าใครก็ลบข้อมูลเมมเบอร์ทั้งหมดได้จากคอนโซลเบราว์เซอร์ — เปลี่ยนก่อนเรื่องอื่น

### 3.4 แคชฝั่งผู้ใช้ ไม่ให้ยิง Firestore ทุกครั้งที่เปิด

```js
const CACHE_KEY = '48thdb-cache-v1';

async function loadData() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch {}

  // 1) มีแคช → วาดจอทันที ผู้ใช้ไม่ต้องรอ
  if (cached) render(cached);

  // 2) อ่านแค่ doc เดียว เช็กว่าข้อมูลใหม่กว่าไหม (อ่าน 1 ครั้ง ไม่ใช่ 60)
  const ver = (await fbDb.doc('meta/version').get()).data()?.data ?? 0;
  if (cached && cached.version === ver) return;

  // 3) ข้อมูลเปลี่ยนจริงค่อยโหลดเต็ม
  const [members, events, songs] = await Promise.all([
    fbDb.collection('members').get(),
    fbDb.collection('events').get(),
    fbDb.collection('songs').get(),
  ]);
  const fresh = {
    version: ver,
    members: members.docs.map(d => d.data()),
    events: events.docs.map(d => d.data()),
    songs: songs.docs.map(d => d.data()),
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch {}
  render(fresh);
}
```

ผลลัพธ์: เปิดแอปครั้งที่สองเป็นต้นไป = อ่าน Firestore **1 ครั้ง** แทนที่จะเป็น ~100 ครั้ง
โควตาฟรีจะรองรับคนได้เป็นหมื่น แทนที่จะเป็นหลักร้อย

## ขั้นที่ 4 — Bookmark ให้ครบ (คำตอบข้อ 2 ของคุณ)

ของเดิมมี oshi (ผูกใจเมมเบอร์) อยู่แล้ว ขยายเป็น bookmark ได้ทั้งงานและเพลง

```js
// users/{uid} → { oshi: [...], kamiOshi: 'x', bookmarks: { events: {...}, songs: {...} } }

async function toggleBookmark(kind, id) {
  const u = fbAuth.currentUser;
  if (!u) return;
  const on = !state.bookmarks?.[kind]?.[id];

  // อัปเดตจอก่อนเลย ไม่ต้องรอเน็ต (optimistic) — แอปจะรู้สึกไว
  state.bookmarks = state.bookmarks || {};
  state.bookmarks[kind] = state.bookmarks[kind] || {};
  if (on) state.bookmarks[kind][id] = Date.now();
  else delete state.bookmarks[kind][id];
  render();

  await fbDb.collection('users').doc(u.uid).set({
    bookmarks: {
      [kind]: { [id]: on ? firebase.firestore.FieldValue.serverTimestamp()
                         : firebase.firestore.FieldValue.delete() }
    }
  }, { merge: true });
}
```

จุดที่คนมักพลาด และต้องทำ:

1. **ผู้ใช้ที่ยังไม่ล็อกอิน** — โค้ดคุณ sign in anonymous ให้อยู่แล้ว ดีมาก
   bookmark จะเก็บได้ทันทีโดยไม่ต้องสมัคร แต่ต้องบอกผู้ใช้ว่า
   "ถ้าลบแอป ข้อมูลจะหาย — สมัครไว้เพื่อเก็บถาวร"
2. **ตอนสมัครทีหลัง** ต้อง `linkWithCredential` ไม่ใช่ `signIn` ใหม่
   ไม่งั้น bookmark ที่เก็บตอนเป็น anonymous จะหายหมด
   (โค้ดบรรทัด ~7860 ทำถูกแล้ว — ระวังอย่าไปแก้)
3. **ออฟไลน์** — เปิด persistence ของ Firestore ไว้ กด bookmark ตอนไม่มีเน็ตแล้วซิงก์เองทีหลัง

```js
fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
```

## ขั้นที่ 5 — สองอย่างที่ Apple บังคับ ถ้ามีระบบล็อกอิน

### 5.1 Sign in with Apple (Guideline 4.8)

**ถ้ามีปุ่ม "Sign in with Google" ต้องมี "Sign in with Apple" ด้วย** ไม่มี = โดนตีกลับแน่นอน

```bash
# Firebase Console → Authentication → Sign-in method → Apple → Enable
```

```js
const appleProvider = new firebase.auth.OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
await fbAuth.signInWithPopup(appleProvider);   // ในแอปจะเปลี่ยนเป็น native plugin (ดู 03)
```

### 5.2 ปุ่มลบบัญชีในแอป (Guideline 5.1.1(v))

แอปที่สมัครบัญชีได้ **ต้องลบบัญชีได้จากในแอป** จะให้ไปส่งอีเมลหาแอดมินไม่ได้

```js
async function deleteMyAccount() {
  const u = fbAuth.currentUser;
  if (!u) return;
  if (!confirm('ลบบัญชีและข้อมูลโอชิทั้งหมดถาวร ยืนยันไหม?')) return;
  await fbDb.collection('users').doc(u.uid).delete();
  try {
    await u.delete();
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      alert('เพื่อความปลอดภัย กรุณาเข้าสู่ระบบใหม่อีกครั้งแล้วลองใหม่');
      await fbAuth.signOut();
    }
  }
}
```

วางปุ่มไว้ในหน้าโปรไฟล์/ตั้งค่า ใต้ปุ่มออกจากระบบ ใช้สีแดง (`--danger` มีอยู่แล้วในธีม)

## เช็กก่อนไปขั้นต่อไป

- [ ] `index.html` เหลือไม่เกิน ~300 KB
- [ ] เปิดเว็บใน Safari/Chrome แล้วทุกหน้ายังทำงานเหมือนเดิม (ลองครบ: เมมเบอร์, เพลง, ปฏิทิน, วันเกิด, งาน, ค้นหา, โหมดมืด, EN/TH)
- [ ] Firestore Rules อัปเดตแล้ว ลองเปิดหน้าเว็บโดยไม่ล็อกอินยังอ่านได้ปกติ
- [ ] Bookmark ใช้ได้ ปิดแอปเปิดใหม่ยังอยู่
- [ ] มีปุ่ม Sign in with Apple และปุ่มลบบัญชี

ไปต่อ [03-capacitor.md](03-capacitor.md)
