# 10 — ย้ายมาทำงานบนคลาวด์ (Claude Code on the web)

ตั้งค่าไว้ให้หมดแล้ว ไฟล์นี้อธิบายว่ามีอะไรบ้าง ทำงานยังไง และ **สิ่งเดียวที่คุณต้องกดเอง**

## 10.1 เวิร์กโฟลว์ใหม่

```
คุณสั่งงานจากมือถือ/เว็บ
        │
        ▼
เซสชันบนคลาวด์  ── โคลนรีโปสด ๆ ── แก้โค้ด ── npm run lint + npm run smoke
        │
        ▼
   push ขึ้นแบรนช์ (ไม่ใช่ main)
        │
        ▼
   GitHub Actions: CI รัน lint + smoke + เก็บสกรีนช็อตไว้ให้ดู
        │
        ▼
   คุณดูแล้วโอเค → merge เข้า main
        │
        ▼
   GitHub Actions: deploy ขึ้น Firebase Hosting อัตโนมัติ  ← ไม่ต้องเปิด Mac
```

## 10.2 สิ่งที่ต้องกดเอง (ครั้งเดียว) — ใส่กุญแจให้ GitHub deploy แทนคุณได้

ตอนนี้ไฟล์ `.github/workflows/deploy.yml` พร้อมแล้ว แต่มันยัง deploy ไม่ได้
จนกว่าจะมี service account ของ Firebase เก็บไว้ใน GitHub

**วิธีที่ 1 — ให้ Firebase CLI ทำให้ (ง่ายสุด ทำบน Mac)**

```bash
cd ~/path/to/48thdb
firebase login
firebase init hosting:github
```
มันจะถามชื่อรีโป (`framenaldo/48thdb`) แล้วจัดการสร้าง service account
ใส่ secret ให้ใน GitHub เอง — ตอบ **No** ตอนที่มันถามว่าจะให้เขียนไฟล์ workflow ทับไหม
เพราะเรามีของเราแล้ว

**วิธีที่ 2 — ทำมือ**

1. [Firebase Console](https://console.firebase.google.com/project/thdatabase/settings/serviceaccounts/adminsdk)
   → Service accounts → **Generate new private key** → ได้ไฟล์ JSON
2. GitHub → รีโป `framenaldo/48thdb` → Settings → Secrets and variables → Actions
   → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: วางเนื้อหาไฟล์ JSON ทั้งก้อน
3. **ลบไฟล์ JSON ทิ้งจากเครื่อง** — มันคือกุญแจที่เขียนฐานข้อมูลได้ทั้งโปรเจกต์
   ห้ามเก็บไว้ในโฟลเดอร์รีโปเด็ดขาด

เสร็จแล้วทดสอบ: GitHub → Actions → Deploy → **Run workflow**
ถ้าเขียวแปลว่าตั้งแต่นี้ไป merge เข้า main = เว็บอัปเดตเอง

> ถ้าไม่อยากให้ deploy อัตโนมัติ ลบ `.github/workflows/deploy.yml` ทิ้งได้เลย
> CI (`ci.yml`) ยังทำงานต่อโดยไม่ต้องใช้ secret อะไร

## 10.3 hook ตอนเปิดเซสชัน

`.claude/hooks/session-start.sh` รันอัตโนมัติทุกครั้งที่เปิดเซสชันบนคลาวด์
หน้าที่: `npm install` ให้เรียบร้อยก่อนเริ่มงาน จะได้ไม่ต้องเสียเวลาต้นเซสชันไปกับมัน
และบอก Playwright ว่า Chromium อยู่ที่ไหนในอิมเมจ (จะได้ไม่โหลดใหม่ 150 MB)

- มันเช็ก `$CLAUDE_CODE_REMOTE` ก่อน ถ้ารันบน Mac ของคุณจะไม่ทำอะไรเลย
- รันแบบ synchronous คือเซสชันจะเริ่มหลังติดตั้งเสร็จ (ช้ากว่านิดหน่อย
  แต่ไม่มีปัญหาสั่งเทสต์แล้วเจอว่ายังติดตั้งไม่เสร็จ)
- **มันจะมีผลกับทุกเซสชันก็ต่อเมื่อ merge เข้า `main` แล้ว**

## 10.4 `CLAUDE.md`

โน้ตประจำโปรเจกต์ที่หน้าราก เซสชันใหม่อ่านอันนี้ก่อนเสมอ ในนั้นมี: โครงไฟล์,
กฎเรื่องลำดับสคริปต์, คำสั่ง lint/smoke, และกฎสำคัญสามข้อ —
ห้ามเทสต์ชน Firebase จริง, ต้อง push เสมอเพราะคอนเทนเนอร์หายได้, deploy ต้องขึ้นทั้งชุด

ถ้าทำอะไรแล้วรู้สึกว่า "ต้องบอกซ้ำทุกครั้ง" ให้เพิ่มลงไฟล์นี้

## 10.5 ข้อจำกัดที่ต้องรู้

| ทำได้บนคลาวด์ | ทำไม่ได้ ต้องใช้ Mac |
|---|---|
| แก้โค้ด รันเทสต์ ดูสกรีนช็อต | build แอป iOS/Android (ต้องมี Xcode) |
| push + เปิด PR | `firebase deploy` ด้วยมือ (แต่ Actions ทำแทนแล้ว) |
| เขียน/แก้เอกสาร | หยิบไฟล์จากโฟลเดอร์ในเครื่องคุณ |
| อ่านทุกไฟล์ที่อยู่ใน GitHub | เห็นรูปที่ยังไม่ commit |

**รูปใหม่**: ถ้าจะเพิ่มรูปเมมเบอร์หรือโปสเตอร์ ให้แนบในแชตได้เลย
หรือ commit เข้ารีโปจาก Mac ก่อน แล้วค่อยสั่งงานต่อบนคลาวด์

## 10.6 คำสั่งที่ใช้บ่อย

```bash
npm run lint                              # ตรวจไวยากรณ์ + ลำดับสคริปต์
npm run smoke before                      # ถ่ายภาพก่อนแก้
npm run smoke after                       # ถ่ายภาพหลังแก้
node tools/smoke.mjs --diff before after  # เทียบ
```
