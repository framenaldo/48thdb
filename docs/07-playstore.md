# 07 — Google Play: ตั้งแต่สมัครจนปล่อยจริง

Play ง่ายกว่า Apple เรื่องรีวิว แต่**ยากกว่าเรื่องเงื่อนไขก่อนปล่อย** ถ้าเป็นบัญชีบุคคล
เพราะมีข้อบังคับให้ทดสอบแบบปิดก่อน — วางแผนเผื่อเวลาส่วนนี้ไว้ราวหนึ่งเดือน

## 7.1 สมัคร Play Console

1. https://play.google.com/console/signup
2. เลือก **Personal** หรือ **Organization**
3. จ่าย **25 USD ครั้งเดียว ตลอดชีพ**
4. ยืนยันตัวตน: บัตรประชาชน/พาสปอร์ต + ที่อยู่ (Google ตรวจ 1–3 วัน)
5. บัญชีบุคคลต้องยืนยันเบอร์โทรและที่อยู่ที่จะแสดงบนหน้าแอปด้วย

> **เงื่อนไขทดสอบก่อนปล่อย (บัญชีบุคคลที่สมัครใหม่)**
> Google กำหนดให้ต้องรัน *closed testing* กับผู้ทดสอบจำนวนหนึ่ง (ประมาณ 12 คน)
> ต่อเนื่องราว 14 วัน ก่อนจึงจะขอปล่อย production ได้
> เงื่อนไขนี้ Google ปรับตัวเลขบ่อย — **เช็กในหน้า Play Console ของคุณตอนสมัคร**
> เตรียมรายชื่ออีเมลเพื่อน ๆ ในกลุ่มแฟนคลับไว้ล่วงหน้าได้เลย เอาคนที่จะเปิดแอปจริง

## 7.2 สร้างแอป

Play Console → Create app

| ช่อง | ใส่ |
|---|---|
| App name | 48thDB |
| Default language | ไทย |
| App or game | App |
| Free or paid | Free (เปลี่ยนจากฟรีเป็นจ่ายเงินภายหลังไม่ได้) |

## 7.3 เซ็นแอป (App Signing)

```bash
# สร้าง keystore — ไฟล์นี้หายเมื่อไหร่ = อัปเดตแอปไม่ได้อีกเลย
keytool -genkey -v -keystore ~/48thdb-release.keystore \
  -alias 48thdb -keyalg RSA -keysize 2048 -validity 10000
```

**สำรอง keystore + รหัสผ่านไว้อย่างน้อย 2 ที่** (เช่น iCloud Drive + 1Password)
เก็บรหัสไว้ใน `android/keystore.properties` และ **ห้าม commit**:

```properties
storeFile=/Users/framenaldo/48thdb-release.keystore
storePassword=xxxx
keyAlias=48thdb
keyPassword=xxxx
```

```bash
echo "android/keystore.properties" >> .gitignore
echo "*.keystore" >> .gitignore
```

`android/app/build.gradle`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

**SHA-1 สำหรับ Google Sign-In** (ถ้าใช้ล็อกอินกูเกิลในแอป Android ต้องทำ):

```bash
keytool -list -v -keystore ~/48thdb-release.keystore -alias 48thdb | grep SHA
```
เอาค่า SHA-1 และ SHA-256 ไปใส่ที่ Firebase Console → Project settings → Android app
→ Add fingerprint แล้วโหลด `google-services.json` ใหม่มาวางทับที่ `android/app/`

> เมื่อเปิดใช้ **Play App Signing** (ค่าเริ่มต้น) Google จะเซ็นทับด้วยคีย์ของเขาเอง
> ต้องเอา SHA-1 ของ *app signing key* จาก Play Console → Setup → App integrity
> ไปใส่ใน Firebase เพิ่มอีกอันด้วย ไม่งั้นล็อกอินกูเกิลจะพังเฉพาะเวอร์ชันที่โหลดจาก Play

## 7.4 สร้างไฟล์อัปโหลด

```bash
npm run sync
cd android && ./gradlew bundleRelease
# ได้ไฟล์ที่ android/app/build/outputs/bundle/release/app-release.aab
```

(Play รับ `.aab` เท่านั้น ไม่รับ `.apk` สำหรับแอปใหม่แล้ว)

## 7.5 กรอกข้อมูลที่ Play บังคับ

Play Console → Dashboard จะมีเช็กลิสต์ให้ตามทีละอัน

**Store listing**
- Short description (80 ตัวอักษร): `ฐานข้อมูลสมาชิก ตารางงาน และผลงานเพลงของไอดอลไทย`
- Full description (4,000): ใช้ตัวเดียวกับ App Store
- ไอคอน 512×512 PNG
- **Feature graphic 1024×500** (Play บังคับ — Apple ไม่มี ต้องทำเพิ่ม)
- สกรีนช็อตโทรศัพท์อย่างน้อย 2 รูป (แนะนำ 6–8)

**Content rating** — ตอบแบบสอบถาม ได้เรต Everyone

**Data safety** — เหมือน App Privacy ของ Apple ต้องตรงความจริง:
ประกาศ Email, Name, User ID, App interactions พร้อมระบุว่า
*"เข้ารหัสระหว่างส่ง"* และ *"ผู้ใช้ขอลบข้อมูลได้"* (คุณมีปุ่มลบบัญชีแล้ว)

**Ads** — ตอบ "ไม่มีโฆษณา"

**Target audience** — 13+ หรือ 18+ (ถ้าเลือกต่ำกว่า 13 จะโดนกฎ Families Policy ที่ยุ่งกว่ามาก)

**Privacy policy URL** — บังคับ ใช้ลิงก์เดียวกับฝั่ง Apple

## 7.6 ไล่ track ตามลำดับ

```
Internal testing  →  Closed testing  →  Open testing (ถ้าอยาก)  →  Production
(สูงสุด 100 คน)     (ตามเงื่อนไขข้อ 7.1)                          (ทุกคน)
ใช้ได้ทันที          ต้องครบเวลาก่อน                              รีวิว 1–7 วัน
```

1. **Internal testing** — อัป `.aab` แล้วใส่อีเมลตัวเอง เทสต์ก่อนวันสองวัน
2. **Closed testing** — สร้าง email list ใส่อีเมลเพื่อน แล้วส่ง opt-in link ให้
   ย้ำกับเพื่อนว่า **ต้องกดลิงก์ ติดตั้ง และเปิดใช้จริง** ไม่ใช่แค่ตอบรับ
3. ครบตามเงื่อนไขแล้วปุ่ม "Apply for production access" จะเปิดให้กด กรอกแบบสอบถามสั้น ๆ
4. **Production** — อัปบิลด์ เขียน release notes → Send for review

## 7.7 ปัญหาที่เจอบ่อยฝั่ง Android

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| หน้าขาวหลัง splash | โหลดไฟล์ผ่าน `file://` | ตั้ง `"androidScheme": "https"` ใน capacitor.config (ทำแล้วใน `03`) |
| ล็อกอินกูเกิลเด้งแล้วดับ | SHA-1 ไม่ตรง | เพิ่ม SHA-1 ทั้งของ upload key และ Play app signing key |
| รูปไม่ขึ้นบนเครื่องจริง | ชื่อไฟล์ตัวพิมพ์ใหญ่/เล็กไม่ตรง | Android เป็น case-sensitive — ตั้งชื่อไฟล์เป็นตัวเล็กทั้งหมด |
| ถูกตีกลับเรื่อง target API | Play บังคับ targetSdk ใหม่ทุกปี | แก้ `targetSdkVersion` ใน `android/variables.gradle` ให้เป็นเวอร์ชันล่าสุด |
| แอปใหญ่เกิน | รูป base64 ยังอยู่ | ทำตาม `02-prep-web.md` |

## 7.8 ข้อดีที่ควรใช้ให้คุ้ม

- ปล่อยแบบ **staged rollout** ได้ (ปล่อย 10% ของผู้ใช้ก่อน ถ้าพังก็หยุดทัน)
- อัปเดตเร็วกว่า Apple มาก ปกติรีวิวไม่กี่ชั่วโมงถึงวันเดียว
- ดูรายงานแครชได้ละเอียดใน Android vitals

ไปต่อ [08-legal.md](08-legal.md) — อ่านให้จบก่อนส่งรีวิวที่ไหนก็ตาม
