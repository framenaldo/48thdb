# 48thDB

ฐานข้อมูลแฟนเมดของ BNK48 / CGM48 — เว็บ PWA ที่ deploy บน Firebase Hosting
(โปรเจกต์ `thdatabase`, site `48thdb`) ภาษาในแอปเป็นไทยเป็นหลัก มีสวิตช์ EN

## โครงไฟล์

ไม่มี build step — ไฟล์ในรีโปคือไฟล์ที่ browser โหลดตรง ๆ

```
index.html        โครง HTML + แท็ก script/link (50 บรรทัด)
css/app.css       สไตล์ทั้งหมด ใช้ CSS custom properties เป็นธีม
                  (โหมดมืดคือการนิยาม token ชุดเดิมใหม่ใต้ [data-theme="dark"])
js/firebase.js    config + init (อยู่ใน <head>)
js/data.js        GROUPS, TEAMS, SEED_* — ต้องโหลดก่อนสคริปต์อื่นใน js/
js/state.js       state กลาง + applyTheme + getter
js/i18n.js        คำแปล EN, การแปลงวันที่ไทย, escapeHtml/escapeAttr/cssUrl
js/storage.js     ทุกอย่างที่คุยกับ Firestore
js/render.js      การ์ด โมดัล ปฏิทิน หน้าเปรียบเทียบ
js/feed.js        ฟีด งาน วันเกิด
js/app.js         render root, history, event delegation, init()
assets/members/   รูปโปรไฟล์ <id>.jpg
posters/          โปสเตอร์งาน
docs/             คู่มือ 9 ตอน เรื่องทำเป็นแอปขึ้นสโตร์ (ภาษาไทย)
```

ไฟล์ใน `js/` เป็น **classic script ไม่ใช่ module** แชร์ global กันหมด
**ลำดับแท็ก `<script>` ใน index.html จึงสำคัญ** `npm run lint` เช็กให้

## คำสั่ง

```bash
npm run lint             # ตรวจไวยากรณ์ทุกไฟล์ใน js/ + ลำดับการโหลด
npm run smoke <label>    # เปิดหน้าเว็บจริงใน Chromium ถ่าย 9 สถานการณ์ลง .smoke/<label>/
node tools/smoke.mjs --diff before after
```

**ก่อนแก้โค้ดที่กระทบหน้าตา ให้ `npm run smoke before` ไว้ก่อนเสมอ แล้ว
`npm run smoke after` + `--diff` ตอนแก้เสร็จ** ไม่มี unit test ในโปรเจกต์นี้
ตัวนี้คือตาข่ายเดียวที่มี

## กฎที่ห้ามพลาด

- **ห้ามให้เทสต์วิ่งชน Firebase จริง** — `tools/smoke.mjs` ใช้ `tools/firebase-stub.js`
  เพราะ `loadMembers()` จะเขียนข้อมูลกลับเข้า Firestore ทุกครั้งที่ seed ไม่ตรงกับที่เก็บไว้
  และ `users/{uid}` คือรายการโอชิของผู้ใช้จริง
- **คอนเทนเนอร์บนคลาวด์หายได้ตลอด** งานทุกชิ้นต้องจบด้วย commit + push
- **push ขึ้นแบรนช์ที่ระบุไว้เท่านั้น** ห้าม push ตรงเข้า `main`
- **deploy ต้องขึ้นพร้อมกันทั้งชุด** (index.html + css/ + js/ + assets/)
  ตอนนี้ push เข้า `main` แล้ว GitHub Actions deploy ให้เอง
- ข้อความใน UI เขียนภาษาไทย คำแปลอังกฤษอยู่ใน `js/i18n.js` (ตาราง `EN`)
- รูปใหม่ใส่เป็นไฟล์ใน `assets/` ห้ามฝัง base64 กลับเข้าโค้ด

## สิ่งที่ยังค้าง

ดู `docs/README.md` หัวข้อ "ทำไปแล้วเท่าไหร่" — ขั้นถัดไปคือย้าย `SEED_SCHEDULE`
ขึ้น Firestore + ทำหน้าแอดมิน (`docs/02-prep-web.md` ขั้นที่ 3, `docs/05-updates.md`)
