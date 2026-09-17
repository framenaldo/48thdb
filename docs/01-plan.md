# 01 — ภาพรวม: ตอนนี้อยู่ตรงไหน จะไปทางไหน

## 1.1 ของที่มีอยู่ตอนนี้

```
48thdb/
├── index.html          ← ทั้งแอปอยู่ในไฟล์นี้ไฟล์เดียว (~1.4 MB, 8,700 บรรทัด)
│                          HTML + CSS + JS + ข้อมูลเมมเบอร์ + รูป base64
├── sw.js               ← Service worker (ทำให้เปิดออฟไลน์ได้)
├── manifest.webmanifest← ทำให้ "Add to Home Screen" ได้ = PWA
├── firebase.json       ← ตั้งค่า Firebase Hosting (site: 48thdb)
├── .firebaserc         ← project: thdatabase
├── posters/            ← รูปโปสเตอร์งาน 8 ไฟล์
└── icon-*.png          ← ไอคอนแอป
```

ที่ต่อกับ Firebase อยู่แล้ว:

- **Auth** — anonymous, email/password, Google (โค้ดอยู่ราวบรรทัด 7850–7930)
- **Firestore `members/{id}`** — ข้อมูลเมมเบอร์ ซิงก์ข้ามเครื่อง
- **Firestore `users/{uid}`** — เก็บ `oshi` + `kamiOshi` ของแต่ละคน ← **นี่คือ bookmark ที่คุณอยากได้ มีแล้ว**
- **Hosting** — เว็บออนไลน์อยู่จริง

ที่ **ยังไม่ได้** อยู่ใน Firestore: ตารางงาน (`SEED_SCHEDULE`), เพลง (`SEED_SINGLES`,
`SEED_ALBUMS`), เซมบัตสึ (`SEED_SENBATSU`) — พวกนี้ยัง hard-code อยู่ใน `index.html`
แปลว่าทุกครั้งที่มีงานใหม่ ต้องแก้โค้ดแล้ว deploy ใหม่ (เรื่องนี้แก้ใน `05-updates.md`)

## 1.2 ทางเลือกสามทาง

| ทาง | คืออะไร | ต้องเขียนใหม่ไหม | ขึ้น App Store ได้ไหม | ความเสี่ยง |
|---|---|---|---|---|
| **A. PWA อย่างเดียว** | ให้คนกด "เพิ่มไปยังหน้าโฮม" | ไม่ต้อง | **ไม่ได้** | ไม่มี แต่คนส่วนใหญ่หาไม่เจอ |
| **B. Capacitor (แนะนำ)** | เอา `index.html` เดิม ใส่กล่องแอปเนทีฟ | แทบไม่ต้อง | ได้ | ต้องผ่าน Guideline 4.2 |
| **C. เขียนใหม่ด้วย React Native / Expo / Flutter** | ทำแอปเนทีฟจริงจากศูนย์ | เขียนใหม่ทั้งหมด (2–4 เดือน) | ได้ ง่ายสุด | เสียงานที่ทำมาทั้งหมด |

**เลือก B** เพราะ UI ที่คุณขัดมาเป็นสิบรอบ (กรอบทอง/เงิน, การ์ดวันเกิด, พลุ,
กระจกฝ้า, โหมดมืด) อยู่ใน CSS ของไฟล์นี้หมดแล้ว ถ้าเขียนใหม่ต้องมานั่งไล่ทำใหม่ทั้งหมด

Capacitor คืออะไร: มันคือแอปเนทีฟจริง (ไฟล์ `.ipa` / `.aab` จริง) ที่ข้างในมี
WebView เต็มจอโหลดเว็บของเรา แล้วเปิดสะพานให้ JS เรียกของเนทีฟได้ เช่น
แจ้งเตือน กล้อง สั่นตอบ แชร์ ปฏิทิน — Instagram Lite, แอปธนาคารหลายเจ้า,
แอปงานอีเวนต์ส่วนใหญ่ ก็ทำแบบนี้

## 1.3 สถาปัตยกรรมปลายทาง

```
                     ┌──────────────────────────────┐
                     │  โค้ดเว็บชุดเดียว (this repo) │
                     │  index.html / js / css       │
                     └───────────┬──────────────────┘
                 ┌───────────────┼────────────────┐
                 ▼               ▼                ▼
        Firebase Hosting    iOS (Capacitor)   Android (Capacitor)
        48thdb.web.app      → App Store       → Play Store
                 │               │                │
                 └───────────────┴────────────────┘
                                 ▼
                    Firebase (ตัวเดียวกันทั้งหมด)
                    ├── Auth        ← ล็อกอิน / bookmark ผูกกับ uid
                    ├── Firestore   ← members, events, songs, users
                    ├── Storage     ← รูปเมมเบอร์ + โปสเตอร์
                    └── FCM         ← push แจ้งเตือนวันเกิด/งาน
```

จุดสำคัญ: **โค้ดชุดเดียว ออกสามที่** แก้ที่เดียว ได้ทั้งเว็บ ทั้ง iOS ทั้ง Android

## 1.4 ค่าใช้จ่ายจริง

| รายการ | ราคา | จำเป็นไหม |
|---|---|---|
| Apple Developer Program | **99 USD/ปี** (~3,400 บาท) | จำเป็น ถ้าจะขึ้น App Store |
| Google Play Console | **25 USD จ่ายครั้งเดียว** | จำเป็น ถ้าจะขึ้น Play Store |
| เครื่อง Mac | มีอยู่แล้ว (คุณใช้ macOS) | จำเป็นสำหรับ build iOS |
| Firebase Spark (ฟรี) | 0 บาท | พอสำหรับหลักพันคน |
| Firebase Blaze (จ่ายตามใช้) | ~0–300 บาท/เดือน | ถ้าคนใช้เยอะ + ต้องใช้ Cloud Functions ส่ง push |
| โดเมนของตัวเอง (ถ้าอยากได้) | ~350 บาท/ปี | ไม่จำเป็น |

รวมปีแรกประมาณ **4,000–5,000 บาท**

> Firebase ฟรีในระดับ Spark: Firestore อ่าน 50,000 ครั้ง/วัน, เขียน 20,000 ครั้ง/วัน
> แอปแบบนี้ผู้ใช้หนึ่งคนเปิดหนึ่งครั้ง = อ่านราว 60–100 ครั้ง (เท่าจำนวนเมมเบอร์)
> → ฟรีรองรับได้ราว 500–800 คน/วัน ถ้าทำแคชตาม `02-prep-web.md` จะขยายได้อีกมาก

## 1.5 ไทม์ไลน์ที่เป็นจริง (ทำคนเดียว ว่างวันละ 2–3 ชม.)

| สัปดาห์ | ทำอะไร | ไฟล์ |
|---|---|---|
| 1–2 | แยกไฟล์, ย้ายรูปออกจาก base64, ย้ายข้อมูลลง Firestore | `02-prep-web.md` |
| 3 | ทำ bookmark ให้ครบ (เมมเบอร์ + งาน + เพลง), เพิ่ม Sign in with Apple, ปุ่มลบบัญชี | `02-prep-web.md` |
| 4 | ติดตั้ง Capacitor, รันขึ้นเครื่องจริง iOS/Android | `03-capacitor.md` |
| 5–6 | Push แจ้งเตือนวันเกิด/งาน, widget, แชร์, haptics | `04-native.md` |
| 7 | ไอคอน, สกรีนช็อต, Privacy Policy, หน้าร้าน | `06/07` |
| 8 | TestFlight + Play closed testing (Play บังคับเทสต์ 14 วัน) | `06/07` |
| 9–10 | ส่งรีวิวจริง แก้ตามที่โดนตีกลับ | `09-checklist.md` |

**เริ่มติดต่อขออนุญาตค่ายตั้งแต่สัปดาห์ที่ 1** เพราะรออีเมลตอบนานที่สุด (`08-legal.md`)

## 1.6 ก่อนไปต่อ — สิ่งที่ต้องติดตั้งบนเครื่อง Mac

```bash
# 1. Homebrew (ถ้ายังไม่มี)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Node.js (LTS) — Capacitor ใช้
brew install node
node -v        # ควรได้ v20 ขึ้นไป

# 3. Xcode — ลงจาก Mac App Store (ใหญ่ ~10 GB ลงข้ามคืนไปเลย)
xcode-select --install
sudo xcodebuild -license accept

# 4. CocoaPods — ตัวจัดการไลบรารีของ iOS
brew install cocoapods

# 5. Android Studio — โหลดจาก developer.android.com/studio
#    เปิดครั้งแรก มันจะชวนลง SDK ให้กด Next รัวๆ

# 6. Firebase CLI (น่าจะมีแล้ว เพราะ deploy เว็บอยู่)
npm install -g firebase-tools
firebase --version
```

พร้อมแล้วไปต่อที่ [02-prep-web.md](02-prep-web.md)
