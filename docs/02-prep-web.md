# 02 — จัดบ้านโค้ดเว็บ ก่อนห่อเป็นแอป

ทำไมต้องทำก่อน: `index.html` ตอนนี้ 1.4 MB เพราะรูปเมมเบอร์ทุกใบเป็น base64
ฝังอยู่ในไฟล์ (58 จุด, แต่ละบรรทัดยาว 13,000–18,000 ตัวอักษร) ผลคือ

- เปิดแอปครั้งแรกต้องโหลด 1.4 MB ก่อนเห็นอะไรเลย — บนเน็ตมือถือคือ 3–6 วินาทีจอขาว
- แก้รูปคนเดียว = ไฟล์ทั้งก้อนเปลี่ยน = ผู้ใช้ทุกคนโหลดใหม่ 1.4 MB
- Apple/Google ไม่ได้ห้าม แต่รีวิวเวอร์เปิดแล้วค้าง = ความประทับใจแรกเสีย

## ขั้นที่ 1 — แยกไฟล์ ✅ ทำแล้ว

หน้าตาโปรเจกต์ตอนนี้:

```
48thdb/
├── index.html      ← เหลือ 50 บรรทัด (โครง + แท็ก script/link)
├── css/app.css     ← ทุกอย่างที่เคยอยู่ใน <style>  (107 KB)
├── js/
│   ├── firebase.js ← config + init
│   ├── data.js     ← GROUPS, TEAMS, SEED_* ทั้งหมด  (177 KB)
│   ├── state.js    ← state + applyTheme + getter สั้น ๆ
│   ├── i18n.js     ← EN, การแปลง TH↔EN, ฟอร์แมตวันที่  (71 KB)
│   ├── storage.js  ← ทุกอย่างที่คุยกับ Firestore
│   ├── render.js   ← การ์ด โมดัล ปฏิทิน เปรียบเทียบ  (48 KB)
│   ├── feed.js     ← หน้าฟีด งาน วันเกิด  (98 KB)
│   └── app.js      ← render root, history, event, init  (48 KB)
├── assets/members/ ← รูปเมมเบอร์ 58 ไฟล์
└── tools/          ← สคริปต์ช่วยงาน (ดูข้างล่าง)
```

ไฟล์ JS ทุกอันเป็นสคริปต์ธรรมดา (ไม่ใช่ ES module) โหลดเรียงกันใน `index.html`
ตัวแปรและฟังก์ชันจึงยังเห็นกันหมดเหมือนตอนอยู่ไฟล์เดียว — **ลำดับของแท็ก
`<script>` สำคัญ** ถ้าสลับ `data.js` ไปไว้หลัง `app.js` แอปจะพัง

### ตัวช่วยที่ได้มาด้วย: `tools/smoke.mjs`

การแก้แบบย้ายโค้ดไปมาแบบนี้ ดู diff ไม่ได้ว่าหน้าตาเปลี่ยนไหม เลยมีตัวทดสอบให้:

```bash
node tools/smoke.mjs before     # ถ่ายภาพ 8 หน้าหลักไว้ก่อนแก้
# ...แก้โค้ด...
node tools/smoke.mjs after      # ถ่ายอีกรอบ
node tools/smoke.mjs --diff before after
```

มันเปิดหน้าเว็บจริงใน Chromium ถ่ายสกรีนช็อตลง `.smoke/` และเทียบจำนวนอิลิเมนต์
ข้อความ รูปที่โหลดไม่ขึ้น และ error ใน console ให้
สำคัญ: มันรันกับ `tools/firebase-stub.js` **ไม่ใช่ Firebase จริง** จะได้ไม่ไปเขียนทับ
ข้อมูลโอชิของผู้ใช้จริงตอนทดสอบ

> ต้องมี playwright: `npm i -D playwright` (Chromium มีในเครื่องอยู่แล้วถ้าลง Chrome)

## ขั้นที่ 2 — เอารูปออกจาก base64 ✅ ทำแล้ว (เหลือขั้นบีบรูป)

รูปเมมเบอร์ 58 ใบ (604 KB) ออกมาอยู่ที่ `assets/members/<id>.jpg` แล้ว
`index.html` จาก 1,376 KB เหลือ 559 KB และหลังแยกไฟล์ JS/CSS ออกไปอีก เหลือ 2.7 KB

สคริปต์ที่ใช้คือ `tools/extract-images.mjs` (เก็บไว้เผื่อมีรูป base64 หลุดเข้ามาอีก)
และ `<img>` ของอวาตาร์ทุกจุดได้ `loading="lazy" decoding="async"` แล้ว
= รูปของเมมเบอร์ที่ยังไม่เลื่อนไปถึงจะไม่ถูกโหลด

**สิ่งที่ยังควรทำต่อบนเครื่อง Mac** (ทำในคอนเทนเนอร์นี้ไม่ได้ ไม่มี imagemagick):
บีบรูปให้เล็กลงอีก ดูขั้นที่ 2.2 ข้างล่าง — ตอนนี้เฉลี่ยใบละ ~10 KB ซึ่งโอเคอยู่แล้ว
ทำหรือไม่ทำก็ได้

<details>
<summary>รายละเอียดวิธีทำ (เผื่ออยากรู้ว่าทำยังไง / ทำซ้ำในอนาคต)</summary>

### 2.1 สคริปต์แปลง base64 → ไฟล์จริง

```bash
node tools/extract-images.mjs
```

มันไล่หา `photo:'data:image/...;base64,...'` ทุกจุด เขียนออกเป็นไฟล์ตาม `id` ของเมมเบอร์
แล้วแทนที่ด้วย path — เขียนทับ `index.html` เลย ฉะนั้น **commit ก่อนรัน** จะได้ย้อนได้

จุดที่เกือบพลาด: ตอนแรกใช้ `[\s\S]*?` คั่นระหว่าง `id:` กับ `photo:` ทำให้ `id:` ของ
ก้อน `GROUPS` ด้านบนไปจับคู่กับรูปของเมมเบอร์คนแรก เลยข้ามรูปนั้นไปหนึ่งใบ
ตอนนี้ใช้ `[^{}]*?` คือห้ามข้ามปีกกา = ต้องอยู่ในอ็อบเจ็กต์เดียวกันเท่านั้น

### 2.2 บีบรูปก่อนอัปโหลด (ทำบน Mac, ยังไม่ได้ทำ)

```bash
brew install imagemagick webp
# ย่อให้กว้างสุด 600px + แปลงเป็น webp (เล็กกว่า jpg ~30%)
for f in assets/members/*; do
  cwebp -q 82 -resize 600 0 "$f" -o "${f%.*}.webp"
done
rm assets/members/*.png assets/members/*.jpg 2>/dev/null
du -sh assets/members    # รูป 60 คน ควรอยู่ราว 2–4 MB รวมกัน
```

### 2.3 เลือกที่เก็บ (ตอนนี้ใช้ทาง A อยู่)

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

### 2.4 โหลดรูปแบบขี้เกียจ (lazy) — ทำแล้ว

```html
<img class="avatar-img" src="assets/members/bnk-emmy.jpg" alt=""
     loading="lazy" decoding="async" onerror="this.remove()">
```

`loading="lazy"` = รูปที่ยังไม่เลื่อนไปถึงจะไม่โหลด
ถ้าจะทำต่อ: ใส่ `width`/`height` ให้รูปด้วย จะกันจอกระตุก (layout shift) ตอนรูปเข้ามา

</details>

## ขั้นที่ 3 — ย้ายตารางงานขึ้น Firestore ✅ โค้ดเสร็จแล้ว เหลือ 3 ขั้นที่คุณต้องกดเอง

โค้ดฝั่งแอปพร้อมหมดแล้ว: อ่านงานจาก Firestore ถ้ามี ถ้าไม่มีใช้ `SEED_SCHEDULE` เหมือนเดิม
และมีหน้าฟอร์มให้แอดมินเพิ่ม/แก้/ลบงานจากมือถือ **แต่ยังไม่มีผลจนกว่าจะทำ 3 ขั้นนี้**

1. **วาง Firestore Rules** (§3.3 ข้างล่าง) — ต้องทำก่อน ไม่งั้นใครก็เขียนได้
2. **เพิ่มตัวเองเป็นแอดมิน** — Firestore → สร้าง collection `admins` →
   document id = UID ของคุณ (ดู UID ได้ที่ Authentication) → ใส่ฟิลด์อะไรก็ได้ เช่น `name`
   ต้องล็อกอินด้วยอีเมล/Google ในแอปก่อน บัญชี anonymous เป็นแอดมินไม่ได้
3. **ย้ายข้อมูลครั้งแรก** — บนเครื่องที่มีคีย์:
   ```bash
   node tools/seed-to-firestore.mjs         # ซ้อมก่อน แสดงว่าจะเขียนอะไร 21 รายการ
   node tools/seed-to-firestore.mjs --yes   # เขียนจริง
   ```

เสร็จแล้วเปิดแอป จะเห็นปุ่ม **+ เพิ่มงาน** บนหน้าฟีด และปุ่ม **แก้ไข** ในหน้ารายละเอียดงาน
คนอื่นเห็นการแก้ภายในรีเฟรชเดียว ไม่ต้อง deploy

> ทำไมต้องมีทั้ง seed ในโค้ดและข้อมูลใน Firestore: seed คือของสำรอง
> เน็ตล่ม / rules ปฏิเสธ / ยังไม่ได้ย้าย — หน้าเว็บก็ยังมีตารางงานให้ดู ไม่ใช่หน้าว่าง

### เพลงกับเซมบัตสึล่ะ?

ยังอยู่ในโค้ด ตั้งใจไว้แบบนั้นก่อน เพราะซิงเกิลออกปีละไม่กี่ครั้ง ไม่เหมือนตารางงาน
ถ้าอยากย้ายด้วยบอกได้ ใช้แพตเทิร์นเดียวกันทั้งหมด

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
import vm from 'node:vm';

initializeApp({ cert: JSON.parse(readFileSync('tools/serviceAccount.json', 'utf8')) });
const db = getFirestore();

// js/data.js เป็นสคริปต์ธรรมดา ไม่ใช่ ES module (ตั้งใจ — เบราว์เซอร์โหลดเรียงกัน)
// ฝั่ง node เลยรันมันในแซนด์บ็อกซ์แล้วหยิบตัวแปรออกมา แทนที่จะ import
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(readFileSync('js/data.js', 'utf8'), ctx);
// `const` ในสคริปต์ไม่ได้ไปเกาะบนอ็อบเจ็กต์ ctx ต้องอ่านค่ากลับด้วยการ eval ชื่อมัน
const [SEED_SCHEDULE, SEED_SINGLES, SEED_ALBUMS, SEED_SENBATSU] =
  vm.runInContext('[SEED_SCHEDULE, SEED_SINGLES, SEED_ALBUMS, SEED_SENBATSU]', ctx);

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
