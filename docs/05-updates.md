# 05 — "อัปเดตยังไง" — คำตอบของคำถามข้อ 3

คุณถามว่า *"อัปเดตยังไงไม่เข้าใจ"* — คำตอบคือ **มันมีสองแบบ คนละเรื่องกันเลย**
และแยกให้ออกตั้งแต่ตอนนี้จะประหยัดชีวิตคุณไปมาก

---

## 5.1 อัปเดตสองชนิด

```
┌──────────────────────────────────────────────────────────────────┐
│ แบบที่ 1: อัปเดต "ข้อมูล"                                        │
│ เช่น มีงานใหม่ / เมมเบอร์จบการศึกษา / ซิงเกิลใหม่ / เปลี่ยนรูป    │
│                                                                  │
│ → แก้ใน Firestore → ผู้ใช้เห็นทันทีภายในไม่กี่วินาที             │
│ → ไม่ต้อง build ไม่ต้องส่ง Apple ไม่ต้องรอใครอนุมัติ            │
│ → ทำจากมือถือได้ นั่งรถไฟฟ้าอยู่ก็อัปเดตได้                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ แบบที่ 2: อัปเดต "ตัวแอป"                                        │
│ เช่น เพิ่มหน้าใหม่ / แก้บั๊ก / เปลี่ยนดีไซน์ / เพิ่มฟีเจอร์        │
│                                                                  │
│ → ต้อง build ใหม่ → อัปโหลด → Apple รีวิว 24–48 ชม.             │
│ → ผู้ใช้ต้องกดอัปเดตใน App Store (หรือรอ auto-update)            │
└──────────────────────────────────────────────────────────────────┘
```

**หัวใจของการออกแบบคือ: ดันของให้ไปอยู่ในแบบที่ 1 ให้มากที่สุด**
ตอนนี้ตารางงานของคุณอยู่ในโค้ด = เป็นแบบที่ 2 = มีงานใหม่ทีต้องรอ Apple รีวิว 2 วัน
ซึ่งใช้ไม่ได้เลยกับแอปที่ข้อมูลเปลี่ยนทุกสัปดาห์ → นี่คือเหตุผลที่ `02-prep-web.md`
ให้ย้าย `SEED_SCHEDULE` ขึ้น Firestore

---

## 5.2 แบบที่ 1 ลงมือทำจริง: หน้าแอดมิน

คุณมีระบบล็อกอินอยู่แล้ว และมีคอลเล็กชัน `admins/{uid}` ใน rules แล้ว
เหลือทำหน้าจอ เพิ่มเป็นแท็บที่โผล่เฉพาะแอดมิน

### เพิ่มตัวเองเป็นแอดมิน

1. ล็อกอินในแอปด้วยอีเมลของคุณ
2. Firebase Console → Authentication → ก๊อบ **User UID** ของตัวเอง
3. Firestore → สร้าง collection `admins` → สร้าง document ที่ **Document ID = UID นั้น**
   → ใส่ฟิลด์ `name: "frame"` (ใส่อะไรก็ได้ แค่ให้ doc มีตัวตน)

### หน้าฟอร์มเพิ่มงาน (ตัวอย่างย่อ)

```js
function adminEventForm(existing = {}) {
  return `
    <form id="ev-form" class="admin-form">
      <label>ชื่องาน <input name="title" value="${existing.title || ''}" required></label>
      <label>วันเริ่ม <input type="date" name="start" value="${existing.start || ''}" required></label>
      <label>วันจบ <input type="date" name="end" value="${existing.end || ''}"></label>
      <label>เวลา <input type="time" name="time" value="${existing.time || ''}"></label>
      <label>สถานที่ <input name="venue" value="${existing.venue || ''}"></label>
      <label>ลิงก์แผนที่ <input name="mapUrl" value="${existing.mapUrl || ''}"></label>
      <label>โปสเตอร์ <input type="file" name="poster" accept="image/*"></label>
      <label>เมมเบอร์ที่ร่วมงาน ${memberPicker(existing.members || [])}</label>
      <button type="submit">บันทึก</button>
    </form>`;
}

async function saveEvent(form) {
  const fd = new FormData(form);
  const id = form.dataset.id || `${fd.get('start')}-${slug(fd.get('title'))}`;

  let posterUrl = form.dataset.poster || '';
  const file = fd.get('poster');
  if (file && file.size) {
    const ref = firebase.storage().ref(`posters/${id}.jpg`);
    await ref.put(file);
    posterUrl = await ref.getDownloadURL();
  }

  await fbDb.collection('events').doc(id).set({
    id,
    title: fd.get('title'),
    start: fd.get('start'),
    end: fd.get('end') || fd.get('start'),
    time: fd.get('time') || null,
    venue: fd.get('venue') || null,
    mapUrl: fd.get('mapUrl') || null,
    poster: posterUrl || null,
    members: selectedMemberIds(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // สำคัญ: บอกทุกเครื่องว่าข้อมูลเปลี่ยนแล้ว (ตัวนับที่ใช้ในแคช §02-3.4)
  await fbDb.doc('meta/version').set(
    { data: firebase.firestore.FieldValue.increment(1), updatedAt: new Date() },
    { merge: true }
  );
}
```

ผลลัพธ์: **เปิดแอปในมือถือ → แท็บแอดมิน → กรอกงานใหม่ → กดบันทึก → คนอื่นเห็นทันที**
ไม่ต้องเปิดคอม ไม่ต้อง deploy ไม่ต้องรอใคร

### ให้เพื่อนช่วยอัปเดตได้

แค่เพิ่ม UID ของเขาใน `admins` เขาก็เห็นแท็บแอดมิน
อยากละเอียดกว่านั้น เพิ่มฟิลด์ `role: 'editor' | 'owner'` แล้วเช็กใน rules

---

## 5.3 แบบที่ 2: ปล่อยเวอร์ชันใหม่ของตัวแอป

### รอบการทำงาน

```bash
# 1. แก้โค้ด ทดสอบในเบราว์เซอร์
# 2. ขึ้นเวอร์ชัน
#    ios/App/App.xcodeproj → MARKETING_VERSION 1.1.0, CURRENT_PROJECT_VERSION +1
#    android/app/build.gradle → versionName "1.1.0", versionCode +1
# 3. sync + build
npm run sync
npx cap open ios          # Xcode → Product → Archive → Distribute
npx cap open android      # Build → Generate Signed Bundle (.aab)
# 4. อัปโหลดเข้า App Store Connect / Play Console
# 5. รอรีวิว (Apple 24–48 ชม. ปกติ, Google 1–7 วัน)
# 6. ปล่อย
```

**เลขเวอร์ชันสองตัว อย่าสับสน**
- `versionName` / `MARKETING_VERSION` = เลขที่คนเห็น เช่น `1.2.0` ซ้ำได้
- `versionCode` / `CURRENT_PROJECT_VERSION` = เลขที่ระบบใช้ **ต้องเพิ่มขึ้นทุกครั้ง ห้ามซ้ำเด็ดขาด**
  อัปโหลดเลขซ้ำ = โดนปฏิเสธทันทีตั้งแต่ตอนอัปโหลด

### เว็บกับแอปต้องไปด้วยกัน

```bash
npm run deploy:web     # เว็บอัปเดตทันที
# แต่คนที่โหลดแอปจากสโตร์ยังใช้โค้ดเวอร์ชันที่ฝังมา
```

เตรียมใจไว้ว่าจะมีผู้ใช้สามกลุ่มพร้อมกันเสมอ: คนเว็บ (ใหม่สุด),
คนที่อัปแอปแล้ว, คนที่ยังไม่อัป → **ข้อมูลใน Firestore ต้องเข้ากันได้กับโค้ดเก่า**
กฎ: เพิ่มฟิลด์ใหม่ได้ ห้ามลบ/เปลี่ยนความหมายฟิลด์เดิมทันที ให้ค่อย ๆ เลิกใช้

### บังคับอัปเดต เมื่อจำเป็นจริง ๆ

```js
// meta/appVersion = { min: '1.2.0', latest: '1.4.0' }
const { min } = (await fbDb.doc('meta/appVersion').get()).data() || {};
const { version } = await App.getInfo();
if (min && cmpVersion(version, min) < 0) {
  showBlockingDialog('เวอร์ชันนี้เก่าเกินไป กรุณาอัปเดตแอป', {
    action: () => Browser.open({ url: 'https://apps.apple.com/app/id<APP_ID>' })
  });
}
```

ใช้เฉพาะตอนจำเป็น (เช่นเปลี่ยนโครงข้อมูลใหญ่) การเด้งบังคับอัปบ่อย ๆ คนเลิกใช้

---

## 5.4 ทางลัด: อัปเดตโค้ดโดยไม่ผ่านสโตร์ (OTA)

เพราะโค้ดเราเป็นเว็บ มันอัปเดตข้ามสโตร์ได้ Apple **อนุญาต**
เฉพาะกรณีที่โค้ดรันผ่าน WebView และไม่เปลี่ยนวัตถุประสงค์หลักของแอป
(Guideline 3.3.2 / 2.5.2) — วิธีที่ปลอดภัยสองทาง:

**ทาง A — Capacitor Live Updates (บริการของ Ionic, มีค่าใช้จ่าย)**
ปล่อยโค้ดเว็บใหม่ แอปดึงมาใช้ตอนเปิดครั้งถัดไป เหมือน hot-fix

**ทาง B — ทำเองแบบง่าย: ให้บางส่วนของ UI มาจาก Firestore**
อันนี้ฟรีและคุมได้เอง เช่นแบนเนอร์ประกาศ, ข้อความช่วยเหลือ, ลำดับแท็บ, ธีมสีตามเทศกาล

```js
// meta/config = { banner: { text: 'ยินดีต้อนรับสู่เวอร์ชันใหม่', until: '2026-10-01' },
//                 festiveTheme: 'sakura' }
const cfg = (await fbDb.doc('meta/config').get()).data() || {};
if (cfg.banner && cfg.banner.until > today()) showBanner(cfg.banner.text);
if (cfg.festiveTheme) document.documentElement.dataset.festive = cfg.festiveTheme;
```

**อย่าทำ**: โหลด JavaScript ก้อนใหม่จากเซิร์ฟเวอร์มา `eval()` — ผิดกฎชัดเจน โดนแบนบัญชีได้

---

## 5.5 ตารางสรุปให้จำ

| ต้องการทำอะไร | ใช้วิธีไหน | ผู้ใช้เห็นเมื่อไหร่ |
|---|---|---|
| เพิ่มงานใหม่ / แก้เวลา / แก้สถานที่ | หน้าแอดมิน → Firestore | ทันที |
| เพิ่มเมมเบอร์ใหม่ / เปลี่ยนรูป / จบการศึกษา | หน้าแอดมิน → Firestore | ทันที |
| เพิ่มซิงเกิล + เซมบัตสึ | หน้าแอดมิน → Firestore | ทันที |
| ประกาศ/แบนเนอร์ในแอป | `meta/config` | ทันที |
| แก้บั๊ก / เพิ่มหน้าใหม่ / เปลี่ยนดีไซน์ | build ใหม่ → สโตร์ | 1–3 วัน (รอรีวิว) |
| แก้บั๊กเว็บ | `firebase deploy` | ทันที (เฉพาะคนเล่นเว็บ) |

---

## 5.6 สำรองข้อมูล (ทำเถอะ อย่ารอให้พัง)

ข้อมูลที่คุณนั่งกรอกมาเป็นเดือน ๆ อยู่ใน Firestore ที่เดียว ถ้าเผลอลบ = จบ

```bash
# ตั้ง export อัตโนมัติวันละครั้ง (ต้องใช้แพลน Blaze)
gcloud firestore export gs://thdatabase-backups/$(date +%Y%m%d) --project=thdatabase
```

หรือง่ายกว่านั้น สคริปต์ดึงลงเครื่องแล้ว commit เข้า git:

```js
// tools/backup.mjs — รันเดือนละครั้ง เก็บไว้ใน repo เป็น JSON
for (const col of ['members', 'events', 'songs', 'senbatsu']) {
  const snap = await db.collection(col).get();
  fs.writeFileSync(`backup/${col}.json`, JSON.stringify(snap.docs.map(d => d.data()), null, 2));
}
```

ข้อดีของแบบหลัง: git เก็บประวัติให้ ย้อนดูได้ว่าข้อมูลเปลี่ยนอะไรไปบ้างเมื่อไหร่

ไปต่อ [06-appstore.md](06-appstore.md)
