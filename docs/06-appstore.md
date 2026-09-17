# 06 — Apple: ตั้งแต่สมัครบัญชีจนแอปขึ้น App Store

## 6.1 สมัคร Apple Developer Program

1. ไป https://developer.apple.com/programs/enroll/
2. ล็อกอินด้วย Apple ID ที่**เปิด Two-Factor Authentication แล้ว** (ไม่เปิด = สมัครไม่ได้)
3. เลือกประเภท

| | Individual (บุคคล) | Organization (นิติบุคคล) |
|---|---|---|
| ชื่อผู้พัฒนาที่โชว์บนสโตร์ | ชื่อจริงของคุณ | ชื่อบริษัท |
| ต้องมี D-U-N-S Number | ไม่ต้อง | ต้องมี (ขอฟรี ใช้เวลา 5–14 วัน) |
| เวลาอนุมัติ | 1–3 วัน | 2–4 สัปดาห์ |

   → **เลือก Individual** เว้นแต่คุณมีบริษัทจดทะเบียนและอยากให้ชื่อบริษัทขึ้น
   ข้อควรรู้: ชื่อจริงคุณจะปรากฏบนหน้าแอปสโตร์ให้ทุกคนเห็น เปลี่ยนภายหลังยุ่งยาก
4. จ่าย 99 USD (บัตรเครดิต/เดบิตที่ทำรายการต่างประเทศได้)
5. รออีเมลยืนยัน แล้วค่อยทำขั้นต่อไป

ระหว่างรอ: ทำ `02`–`04` ต่อได้ ทดสอบบนเครื่องตัวเองได้ด้วย Apple ID ธรรมดา (ฟรี)

## 6.2 สร้าง App ID + ใบรับรอง

ถ้าใช้ Xcode "Automatically manage signing" มันจัดการให้เกือบหมด แค่:

1. Xcode → Settings → Accounts → **+** → ใส่ Apple ID ที่จ่าย $99 แล้ว
2. เลือกโปรเจกต์ → target `App` → Signing & Capabilities
   - Team = ทีมของคุณ
   - Bundle Identifier = `app.48thdb.fan` (ตรงกับ `capacitor.config.json`)
3. ถ้ามีข้อความแดง กด **Try Again** หนึ่งครั้ง มันจะสร้าง provisioning profile ให้

## 6.3 สร้างแอปใน App Store Connect

https://appstoreconnect.apple.com → My Apps → **+** → New App

| ช่อง | ใส่อะไร |
|---|---|
| Platform | iOS |
| Name | `48thDB` (ชื่อนี้จองทั่วโลก ถ้าซ้ำต้องเปลี่ยน — ลองสำรองไว้: `48thDB — 48 Thailand`) |
| Primary language | Thai |
| Bundle ID | เลือก `app.48thdb.fan` |
| SKU | อะไรก็ได้ที่คุณจำ เช่น `48THDB001` |
| User Access | Full Access |

> ชื่อแอปมีได้ 30 ตัวอักษร + Subtitle อีก 30 ตัว
> Subtitle แนะนำ: `ฐานข้อมูลไอดอล BNK48 · CGM48`

## 6.4 ของที่ต้องเตรียมสำหรับหน้าร้าน

### ไอคอน
- 1024×1024 PNG, **ห้ามมี alpha/โปร่งใส, ห้ามมุมโค้ง** (Apple โค้งให้เอง)
- ของคุณมี `icon-512.png` อยู่แล้ว ขยายเป็น 1024 หรือทำใหม่ให้คมกว่า

### สกรีนช็อต (ส่วนที่กินเวลาที่สุด)
- **บังคับ**: iPhone จอ 6.9 นิ้ว (1320×2868 หรือ 1290×2796 px) อย่างน้อย 1 รูป — ใส่ได้ถึง 10
- ถ้ารองรับ iPad ต้องมีชุด iPad 13" ด้วย → **ไม่อยากทำ ให้ตั้งแอปเป็น iPhone-only**
  (Xcode → target → General → Supported Destinations → เอา iPad ออก)
- ขนาดเปลี่ยนตามรุ่นใหม่ทุกปี ให้ยึดตามที่หน้า App Store Connect แจ้งตอนอัป

วิธีทำเร็ว:
```bash
# เปิด simulator รุ่นที่ใหญ่ที่สุดใน Xcode แล้วกด Cmd+S หรือ:
xcrun simctl io booted screenshot ~/Desktop/shot-01.png
```
แนะนำถ่าย 6 หน้า: หน้าแรก(วันเกิดวันนี้+พลุ) / โปรไฟล์เมมเบอร์ / ปฏิทิน /
รายละเอียดงาน / เพลง+เซมบัตสึกรอบทอง / โหมดมืด

จะใส่ข้อความบรรยายบนภาพก็ได้ (แนะนำ) ใช้ Figma หรือเว็บฟรีอย่าง
[screenshots.pro](https://screenshots.pro) / [previewed.app](https://previewed.app)

### คำบรรยาย (Description)
สูงสุด 4,000 ตัวอักษร เขียนไทยได้ ตัวอย่างโครง:

```
48thDB คือฐานข้อมูลสำหรับแฟน BNK48 และ CGM48 รวมโปรไฟล์สมาชิก
ตารางงาน ผลงานเพลง และตำแหน่งเซมบัตสึไว้ในที่เดียว

• โปรไฟล์สมาชิกทุกคน พร้อมประวัติทีมและโซเชียล
• ปฏิทินงาน พร้อมรายละเอียดและลิงก์แผนที่
• ผลงานเพลง พร้อมตำแหน่งยืนของแต่ละซิงเกิล
• บันทึกโอชิของคุณ และรับการแจ้งเตือนวันเกิด
• ใช้งานได้แม้ไม่มีอินเทอร์เน็ต
• รองรับภาษาไทยและอังกฤษ ทั้งโหมดสว่างและมืด

แอปนี้จัดทำโดยแฟนคลับ ไม่ใช่แอปทางการของ BNK48, CGM48 หรือบริษัท
อิสระในการจัดการศิลปิน จำกัด
```

บรรทัดสุดท้ายสำคัญมาก — อ่าน `08-legal.md`

### Keywords
100 ตัวอักษร คั่นด้วยจุลภาค ไม่ต้องเว้นวรรค ห้ามใส่ชื่อแบรนด์ที่ไม่ใช่ของตัวเอง
(ใส่ "BNK48" เสี่ยงโดนตีกลับเรื่องเครื่องหมายการค้า ถ้ายังไม่ได้รับอนุญาต)
```
ไอดอล,idol,ฐานข้อมูล,ตารางงาน,เซมบัตสึ,โอชิ,วันเกิด,คอนเสิร์ต,เพลง,แฟนคลับ
```

### อื่น ๆ ที่ต้องมี
- **Support URL** — ต้องมี ทำหน้าง่าย ๆ ที่ `48thdb.web.app/support` ก็ได้
- **Privacy Policy URL** — **บังคับ** ทำที่ `48thdb.web.app/privacy` (แบบร่างอยู่ใน `08-legal.md`)
- **Age Rating** — ตอบแบบสอบถาม น่าจะได้ 4+
- **Category** — Primary: Entertainment, Secondary: Music

## 6.5 App Privacy — ต้องตอบตรงความจริง

App Store Connect → แอปของคุณ → App Privacy → ประกาศให้ครบ:

| ข้อมูล | เก็บไหม | ผูกกับตัวตนไหม | ใช้ติดตามข้ามแอปไหม |
|---|---|---|---|
| Email Address | ✅ (ตอนสมัคร) | ใช่ | ไม่ |
| Name | ✅ (displayName) | ใช่ | ไม่ |
| User ID | ✅ (Firebase uid) | ใช่ | ไม่ |
| Product Interaction | ✅ (ถ้าเปิด Analytics — config คุณมี `measurementId`) | ใช่ | ไม่ |
| Crash Data / Performance | ✅ ถ้าใช้ Crashlytics | ไม่ | ไม่ |

> ประกาศไม่ตรงกับที่แอปทำจริง = ถูกถอดออกจากสโตร์ได้ Apple ตรวจเรื่องนี้จริงจัง
> ถ้าไม่อยากประกาศ Analytics ให้ปิดมันไปเลย (เอา `measurementId` ออกและไม่โหลด analytics SDK)

## 6.6 อัปโหลดบิลด์แรก

```bash
npm run sync
npx cap open ios
```

ใน Xcode:
1. เลือก device เป็น **Any iOS Device (arm64)** ด้านบน
2. Product → **Archive** (รอ 2–5 นาที)
3. หน้าต่าง Organizer เด้ง → **Distribute App** → *App Store Connect* → *Upload*
4. ติ๊ก *Manage Version and Build Number* ให้มันจัดการเลขให้ → Upload
5. รอ 10–30 นาที ให้บิลด์ขึ้นใน App Store Connect (จะมีเมลแจ้งถ้ามีปัญหา)

ปัญหาที่เจอบ่อย:
- `Missing Compliance` → ตอบคำถาม encryption: แอปนี้ใช้แค่ HTTPS ตอบ "ใช่ ใช้ encryption"
  → "ใช้เฉพาะ exempt (HTTPS มาตรฐาน)" → หรือใส่ใน `Info.plist`:
  ```xml
  <key>ITSAppUsesNonExemptEncryption</key><false/>
  ```
- `Invalid Bundle. Missing Info.plist value CFBundleIconName` → ไอคอนไม่ครบ
  รัน `npx capacitor-assets generate` ใหม่
- `Asset validation failed: alpha channel` → ไอคอน 1024 มีความโปร่งใส ต้องเอาออก
  ```bash
  magick icon-1024.png -background white -alpha remove -alpha off icon-1024.png
  ```

## 6.7 TestFlight — ทดสอบก่อนปล่อยจริง (ทำก่อนเสมอ)

1. App Store Connect → TestFlight → เลือกบิลด์
2. **Internal Testing** — เพิ่มได้ถึง 100 คนที่อยู่ในทีมคุณ ใช้ได้ทันที ไม่ต้องรีวิว
3. **External Testing** — เพิ่มได้ถึง 10,000 คน ต้องผ่าน Beta App Review (1–2 วัน)
   → ใช้อันนี้ชวนเพื่อนแฟนคลับมาลอง เก็บฟีดแบ็กก่อนปล่อยจริง **แนะนำมาก**
4. ผู้ทดสอบโหลดแอป TestFlight แล้วรับลิงก์เชิญทางอีเมล หรือ public link

ให้เทสต์อย่างน้อย 1 สัปดาห์ จดบั๊กแล้วแก้ ค่อยส่งรีวิวจริง

## 6.8 ส่งรีวิวจริง

1. ไปที่แท็บ **Distribution** → เลือกบิลด์
2. ตรวจว่าครบตาม `09-checklist.md`
3. ใส่ **App Review Information**:
   - บัญชีทดสอบ (username/password ที่ใช้ได้จริง)
   - Notes — ก๊อบจาก `04-native.md` §4.7
   - เบอร์ติดต่อ + อีเมล
4. Version Release: เลือก *Manually release this version* (จะได้เลือกวันปล่อยเอง)
5. **Add for Review** → **Submit**

ไทม์ไลน์ปกติ: `Waiting for Review` (2–24 ชม.) → `In Review` (1–24 ชม.) →
`Pending Developer Release` / `Rejected`

## 6.9 ถ้าโดนปฏิเสธ (ปกติมาก อย่าเพิ่งท้อ)

Apple จะเขียนมาใน Resolution Center ว่าผิดข้อไหน สามข้อที่แอปแบบนี้เจอบ่อยสุด:

| ข้อ | ความหมาย | ทางแก้ |
|---|---|---|
| **4.2** | เป็นแค่เว็บห่อกล่อง | เพิ่มฟีเจอร์เนทีฟตาม `04-native.md` แล้วตอบกลับพร้อมรายการที่เพิ่ม + วิดีโอสาธิต |
| **5.2.1 / 5.2.5** | ใช้ทรัพย์สินทางปัญญาของคนอื่น | ต้องมีหลักฐานว่าได้รับอนุญาต หรือเปลี่ยนไปไม่ใช้รูป/โลโก้ทางการ → `08-legal.md` |
| **2.1** | ข้อมูลไม่ครบ/บัญชีทดสอบใช้ไม่ได้ | ให้บัญชีที่ล็อกอินได้จริง + อธิบายเพิ่ม |
| **4.8** | มี Google Sign-In แต่ไม่มี Sign in with Apple | เพิ่ม Sign in with Apple → `02-prep-web.md` §5.1 |
| **5.1.1(v)** | ลบบัญชีในแอปไม่ได้ | เพิ่มปุ่มลบบัญชี → `02-prep-web.md` §5.2 |

วิธีตอบ: ตอบใน Resolution Center อย่างสุภาพ ตรงประเด็น แนบสกรีนช็อต/วิดีโอ
ถ้ามั่นใจว่าเขาเข้าใจผิด ยื่น **appeal** ได้ที่ Contact Us → App Review → Appeal
ส่วนใหญ่แก้แล้วส่งใหม่เร็วกว่า (ส่งใหม่ไม่เสียเงิน ไม่จำกัดจำนวนครั้ง)

ไปต่อ [07-playstore.md](07-playstore.md)
