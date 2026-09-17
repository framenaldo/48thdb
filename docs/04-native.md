# 04 — ฟีเจอร์เนทีฟ: ด่านที่ตัดสินว่าแอปจะผ่านรีวิวไหม

## 4.0 ทำไมขั้นนี้ห้ามข้าม

App Store Review Guideline **4.2 Minimum Functionality** เขียนไว้ตรง ๆ ว่า

> "แอปของคุณควรมีฟีเจอร์ เนื้อหา และ UI ที่มากพอจะเป็นประสบการณ์แบบแอป
> ไม่ใช่แค่เว็บไซต์ที่ถูกห่อมา (repackaged website)"

แอปแฟนเมดที่เอาเว็บมาห่อเฉย ๆ โดนตีกลับด้วยข้อนี้เยอะที่สุด ข้อความที่จะได้รับคือ
*"We found that the value of your app is limited because it primarily consists of web content."*

วิธีผ่านมีทางเดียว: **ใส่ของที่เว็บทำไม่ได้ และเขียนอธิบายให้รีวิวเวอร์อ่านตอนส่ง**
เรียงตามผลต่อการรีวิว มากไปน้อย:

| ฟีเจอร์ | ผลต่อรีวิว | แรงที่ต้องลง |
|---|---|---|
| Push แจ้งเตือนวันเกิด/งาน | สูงมาก | กลาง |
| Widget หน้าโฮม (วันเกิดวันนี้ / งานถัดไป) | สูงมาก | สูง |
| ใช้งานออฟไลน์เต็มรูปแบบ | สูง | ต่ำ (มีเกือบครบแล้ว) |
| เพิ่มงานเข้าปฏิทินเครื่อง | กลาง | ต่ำ |
| แชร์การ์ดเมมเบอร์เป็นรูป | กลาง | กลาง |
| Haptics (สั่นตอบตอนกดโอชิ) | ต่ำ แต่รู้สึกได้ | ต่ำมาก |
| Live Activity / Dynamic Island (นับถอยหลังงาน) | สูง | สูงมาก |

**ทำอย่างน้อย 4 อันแรก** แล้วโอกาสผ่านรอบแรกสูงมาก

---

## 4.1 Push แจ้งเตือน (ชิ้นสำคัญที่สุด)

ไอเดียที่เข้ากับแอปนี้:
- "วันนี้วันเกิดเอ็มมี่ 🎂" ตอน 8 โมงเช้า
- "พรุ่งนี้ 10:00 บัตรงาน Roadshow เปิดขาย" เตือนล่วงหน้า 1 วัน
- "โอชิของคุณติดเซมบัตสึซิงเกิลใหม่" ตอนอัปเดตข้อมูล

### ติดตั้ง

```bash
npm i @capacitor/push-notifications @capacitor/local-notifications
npx cap sync
```

### ฝั่ง iOS ต้องมี

1. Xcode → target App → Signing & Capabilities → **+ Capability** → `Push Notifications`
2. เพิ่ม `Background Modes` → ติ๊ก *Remote notifications*
3. Apple Developer Portal → Keys → สร้าง **APNs Auth Key (.p8)** → ดาวน์โหลด (โหลดได้ครั้งเดียว!)
4. Firebase Console → Project settings → Cloud Messaging → iOS → อัป `.p8` + ใส่ Key ID + Team ID

### โค้ดขอสิทธิ์ + รับ token

```js
import { PushNotifications } from '@capacitor/push-notifications';

async function setupPush() {
  // อย่าขอตอนเปิดแอปครั้งแรกทันที — คนส่วนใหญ่กดปฏิเสธ
  // ขอตอนที่คนกด "เตือนฉันตอนวันเกิดโอชิ" จะได้ yes เยอะกว่ามาก
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== 'granted') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async ({ value }) => {
    const u = fbAuth.currentUser;
    if (!u) return;
    // เก็บ token ไว้ยิงหาเครื่องนี้
    await fbDb.collection('users').doc(u.uid).set({
      pushTokens: { [value]: { platform: Capacitor.getPlatform(), at: Date.now() } }
    }, { merge: true });
  });

  // กดที่แจ้งเตือน → เปิดหน้าที่เกี่ยวข้อง
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const { type, id } = notification.data || {};
    if (type === 'birthday') openMember(id);
    if (type === 'event') openEvent(id);
  });

  return true;
}
```

### ฝั่งเซิร์ฟเวอร์ — Cloud Function ยิงทุกเช้า

ต้องอัปเกรด Firebase เป็นแพลน **Blaze** (จ่ายตามใช้ แต่ระดับนี้แทบไม่เสียเงิน)

```bash
firebase init functions      # เลือก JavaScript หรือ TypeScript
cd functions && npm i firebase-admin firebase-functions
```

`functions/index.js`

```js
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// ทุกวัน 08:00 เวลาไทย
exports.birthdayPush = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Bangkok', region: 'asia-southeast1' },
  async () => {
    const now = new Date(Date.now() + 7 * 3600 * 1000);       // เวลาไทย
    const mmdd = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

    const members = (await db.collection('members').get()).docs.map(d => d.data());
    const todays = members.filter(m => (m.birthday || '').slice(5) === mmdd);
    if (!todays.length) return;

    const users = await db.collection('users').get();
    const messages = [];

    for (const doc of users.docs) {
      const u = doc.data();
      const tokens = Object.keys(u.pushTokens || {});
      if (!tokens.length) continue;

      // ส่งเฉพาะคนที่โอชิคนนั้น — แจ้งทุกวันเกิดทุกคนคือทางลัดสู่การถูกปิดแจ้งเตือน
      const mine = todays.filter(m => (u.oshi || []).includes(m.id));
      if (!mine.length) continue;

      const name = mine[0].nickname || mine[0].name;
      for (const token of tokens) {
        messages.push({
          token,
          notification: { title: `สุขสันต์วันเกิด ${name} 🎂`, body: `วันนี้เป็นวันเกิดของ ${name} — เปิดดูการ์ดวันเกิดในแอป` },
          data: { type: 'birthday', id: mine[0].id },
          apns: { payload: { aps: { sound: 'default' } } },
        });
      }
    }

    // ส่งทีละ 500
    for (let i = 0; i < messages.length; i += 500) {
      await admin.messaging().sendEach(messages.slice(i, i + 500));
    }
  }
);
```

```bash
firebase deploy --only functions
```

### แจ้งเตือนแบบไม่ง้อเซิร์ฟเวอร์ (ทำก่อนได้เลย ฟรี)

ถ้ายังไม่อยากขึ้น Blaze ใช้ **Local Notification** ตั้งเวลาไว้ในเครื่องเลยก็ได้
เหมาะกับวันเกิด เพราะรู้วันล่วงหน้าอยู่แล้ว

```js
import { LocalNotifications } from '@capacitor/local-notifications';

async function scheduleOshiBirthdays() {
  await LocalNotifications.requestPermissions();
  await LocalNotifications.cancel({ notifications: (await LocalNotifications.getPending()).notifications });

  const list = state.members.filter(m => state.oshi.includes(m.id));
  const notifications = list.map((m, i) => {
    const [, mm, dd] = m.birthday.split('-').map(Number);
    return {
      id: 1000 + i,
      title: `สุขสันต์วันเกิด ${m.nickname} 🎂`,
      body: 'เปิดแอปดูการ์ดวันเกิดของน้อง',
      schedule: { on: { month: mm, day: dd, hour: 8, minute: 0 }, allowWhileIdle: true },  // ซ้ำทุกปี
      extra: { type: 'birthday', id: m.id },
    };
  });
  await LocalNotifications.schedule({ notifications });
}
// เรียกทุกครั้งที่ผู้ใช้เปลี่ยนโอชิ
```

---

## 4.2 Widget หน้าโฮม — ตัวที่ทำให้แอปดู "จริง" ที่สุด

Widget เขียนด้วยภาษาเนทีฟ (SwiftUI สำหรับ iOS, Glance/RemoteViews สำหรับ Android)
ห่อ WebView มาใส่ไม่ได้ ต้องเขียนจริง — แต่ของเราต้องการแค่แสดงข้อความ + รูปกลม

แนวคิด: แอปเขียนข้อมูลลง shared storage → widget อ่านไปวาด

```bash
npm i @capacitor/preferences
```

```js
import { Preferences } from '@capacitor/preferences';

// เรียกทุกครั้งที่ข้อมูลอัปเดต
await Preferences.set({
  key: 'widget-today',
  value: JSON.stringify({
    birthdays: todaysBirthdays.map(m => ({ name: m.nickname, age: ageOf(m), photo: m.photo })),
    nextEvent: { title: e.title, date: e.start, venue: e.venue },
  })
});
```

ฝั่ง iOS: Xcode → File → New → Target → **Widget Extension** → เขียน SwiftUI อ่านจาก
App Group เดียวกัน (ต้องเปิด capability *App Groups* ทั้งแอปหลักและ widget)

> เขียน widget เป็น Swift/Kotlin ผมช่วยเขียนให้ได้ตอนถึงขั้นนั้น — บอกมาว่าจะเอาแบบไหน
> (แนะนำ: วิดเจ็ตเล็ก = วันเกิดวันนี้, วิดเจ็ตกลาง = งานถัดไป + นับถอยหลัง)

---

## 4.3 ออฟไลน์เต็มรูปแบบ (ถูกที่สุด คุ้มที่สุด)

มีเกือบครบแล้ว เหลือ:

```js
fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
```

แล้วรูปเมมเบอร์ที่อยู่ใน `www/assets/` จะถูกฝังไปกับแอปอยู่แล้ว = เปิดดูได้ไม่ต้องมีเน็ตเลย
เขียนใน notes ตอนส่งรีวิวว่า "ใช้งานได้เต็มรูปแบบแบบออฟไลน์" — ช่วยเรื่อง 4.2 มาก

---

## 4.4 เพิ่มงานเข้าปฏิทินเครื่อง

```bash
npm i @ebarooni/capacitor-calendar
npx cap sync
```

```js
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';

async function addToCalendar(ev) {
  await CapacitorCalendar.requestFullCalendarAccess();
  await CapacitorCalendar.createEvent({
    title: ev.title,
    location: ev.venue,
    startDate: new Date(`${ev.start}T${ev.time || '00:00'}:00+07:00`).getTime(),
    endDate: new Date(`${ev.end || ev.start}T23:59:00+07:00`).getTime(),
    isAllDay: !ev.time,
  });
}
```

ใส่ปุ่ม "เพิ่มลงปฏิทิน" ในการ์ดรายละเอียดงานที่คุณทำไว้แล้ว
iOS ต้องเพิ่มใน `ios/App/App/Info.plist`:

```xml
<key>NSCalendarsWriteOnlyAccessUsageDescription</key>
<string>เพื่อเพิ่มกำหนดการงานที่คุณสนใจลงในปฏิทินของคุณ</string>
```

---

## 4.5 แชร์การ์ดเมมเบอร์เป็นรูป

```bash
npm i @capacitor/share @capacitor/filesystem html2canvas
```

```js
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

async function shareCard(el, filename = 'oshi-card.png') {
  const canvas = await html2canvas(el, { backgroundColor: null, scale: 2 });
  const base64 = canvas.toDataURL('image/png').split(',')[1];
  const { uri } = await Filesystem.writeFile({
    path: filename, data: base64, directory: Directory.Cache,
  });
  await Share.share({ title: '48thDB', text: 'โอชิของฉัน', files: [uri] });
}
```

ฟีเจอร์นี้คนชอบมาก และช่วยให้แอปโตเอง (คนแชร์ลง X/IG = โฆษณาฟรี)

---

## 4.6 Haptics — ของเล็กที่ทำให้รู้สึกว่าเป็นแอป

```bash
npm i @capacitor/haptics
```

```js
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

Haptics.impact({ style: ImpactStyle.Light });          // กดปุ่มทั่วไป
Haptics.impact({ style: ImpactStyle.Medium });         // กดโอชิ
Haptics.notification({ type: NotificationType.Success }); // กดแล้วสำเร็จ เช่น ตั้งกามิโอชิ
```

ใส่ตรงปุ่มหัวใจโอชิ, ปุ่มเปิด Position sheet, ตอนพลุวันเกิดยิง — ใช้เวลา 20 นาที ได้ความรู้สึกคุ้มมาก

---

## 4.7 เขียนอะไรใน "App Review Notes" ตอนส่ง

ช่องนี้สำคัญพอ ๆ กับตัวแอป เขียนภาษาอังกฤษ ตัวอย่าง:

```
48thDB is a native companion app for fans of the Thai idol groups BNK48 and CGM48.

Native functionality beyond web content:
• Local & push notifications for member birthdays and ticket on-sale times,
  personalised to the members the user follows.
• Home-screen widgets (small: today's birthdays, medium: next event countdown).
• Full offline use — member profiles, discography and schedules are bundled
  and browsable with no network connection.
• Add-to-Calendar integration for events using EventKit.
• Native share sheet for generated "oshi cards".
• Haptic feedback throughout.

Account: sign-in is optional. Use the "Continue as guest" button, or the demo
account below. Accounts can be deleted from Settings → Delete account.
   Email: review@48thdb.app
   Password: <ใส่รหัส>

Content rights: <ดู 08-legal.md — เขียนตามสถานะสิทธิ์จริงของคุณ>
```

**ต้องเตรียมบัญชีทดสอบให้เขาจริง ๆ** ไม่มีให้ = โดนตีกลับด้วย Guideline 2.1 ทันที

---

## เช็กก่อนไปต่อ

- [ ] แจ้งเตือนวันเกิดเด้งจริงบนเครื่องจริง (ตั้งวันเกิดปลอมทดสอบได้)
- [ ] เปิดโหมดเครื่องบินแล้วแอปยังใช้ได้ทุกหน้า
- [ ] มีปุ่มเพิ่มลงปฏิทินในหน้ารายละเอียดงาน
- [ ] แชร์การ์ดออกไป LINE/X ได้
- [ ] กดปุ่มแล้วสั่น
- [ ] (ถ้าไหว) widget ขึ้นบนหน้าโฮม

ไปต่อ [05-updates.md](05-updates.md)
