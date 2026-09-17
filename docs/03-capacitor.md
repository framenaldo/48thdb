# 03 — ห่อเป็นแอป iOS + Android ด้วย Capacitor

ทำตามทีละบล็อก อย่าข้าม รันคำสั่งจากโฟลเดอร์รากของโปรเจกต์

## 3.1 ติดตั้ง

```bash
cd ~/Documents/48TH/48thdb        # หรือที่ที่คุณเก็บโปรเจกต์นี้

npm init -y                        # ถ้ายังไม่มี package.json
npm i @capacitor/core
npm i -D @capacitor/cli
npx cap init
```

มันจะถาม 3 ข้อ ตอบแบบนี้:

```
App name ................ 48thDB
App Package ID .......... app.48thdb.fan          ← ห้ามซ้ำกับใครในโลก เปลี่ยนทีหลังยาก
Web asset directory ..... www
```

> **Package ID ตั้งให้ดีตั้งแต่แรก** มันคือ bundle identifier ที่ผูกกับแอปบนสโตร์ตลอดชีวิต
> รูปแบบนิยม: โดเมนกลับหลัง เช่น `app.48thdb.fan`, `com.framenaldo.thdb48`
> (ขึ้นต้นด้วยตัวเลขไม่ได้ใน Android — `com.48thdb` **ใช้ไม่ได้**)

## 3.2 จัดไฟล์เว็บให้อยู่ใน `www/`

Capacitor จะก๊อบทุกอย่างใน `www/` เข้าไปในแอป

```bash
mkdir -p www
# ถ้ายังไม่ได้แยกไฟล์ตาม 02: ก๊อบตรง ๆ ไปก่อนก็รันได้
cp index.html sw.js manifest.webmanifest icon-*.png apple-touch-icon.png www/
cp -R posters assets www/ 2>/dev/null
```

ทำให้เป็นอัตโนมัติ ใส่ใน `package.json`:

```json
{
  "scripts": {
    "build": "rm -rf www && mkdir -p www && cp -R index.html sw.js manifest.webmanifest icon-*.png apple-touch-icon.png posters assets www/",
    "sync": "npm run build && npx cap sync",
    "ios": "npm run sync && npx cap open ios",
    "android": "npm run sync && npx cap open android",
    "deploy:web": "npm run build && firebase deploy --only hosting"
  }
}
```

## 3.3 ตั้งค่า Capacitor

สร้าง/แก้ `capacitor.config.json`

```json
{
  "appId": "app.48thdb.fan",
  "appName": "48thDB",
  "webDir": "www",
  "ios": {
    "contentInset": "never",
    "backgroundColor": "#FFF3F7"
  },
  "android": {
    "backgroundColor": "#FFF3F7"
  },
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchAutoHide": false,
      "backgroundColor": "#FFF3F7",
      "showSpinner": false
    },
    "StatusBar": {
      "style": "DEFAULT",
      "overlaysWebView": true
    }
  }
}
```

## 3.4 เพิ่มแพลตฟอร์ม

```bash
npm i @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
npx cap sync
```

ได้โฟลเดอร์ `ios/` และ `android/` เพิ่มมา — **commit เข้า git ด้วย**
(เพราะในนั้นมีไฟล์ตั้งค่าที่คุณจะแก้เอง เช่น Info.plist, ไอคอน)

## 3.5 รันบนเครื่องจริง/ซิมูเลเตอร์

### iOS

```bash
npm run ios          # เปิด Xcode
```

ใน Xcode:
1. เลือก target `App` → แท็บ **Signing & Capabilities**
2. ติ๊ก *Automatically manage signing* → เลือก Team (Apple ID ของคุณ — ใช้บัญชีฟรีทดสอบบนเครื่องตัวเองได้ ยังไม่ต้องจ่าย $99)
3. เลือกอุปกรณ์ด้านบน (iPhone 16 Simulator หรือเสียบ iPhone จริง)
4. กด ▶

### Android

```bash
npm run android      # เปิด Android Studio
```
กดปุ่ม ▶ เลือก emulator หรือมือถือที่เปิด USB debugging

## 3.6 ปัญหาที่ต้องแก้แน่ ๆ (เจอทุกโปรเจกต์)

### ก) Safe area — ไอโฟนมีติ่ง/แถบล่าง

CSS ของคุณใช้ `viewport-fit=cover` อยู่แล้ว (บรรทัด 5 ของ index.html) เหลือแค่ใช้ตัวแปร

```css
.app-header { padding-top: calc(12px + env(safe-area-inset-top)); }
.bottom-nav { padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
.modal      { padding-bottom: env(safe-area-inset-bottom); }
```

### ข) ปุ่ม Back ของ Android

ถ้าไม่ดัก กดปุ่ม back ครั้งเดียวแอปปิดทันที (ทั้งที่ควรปิดโมดัลก่อน)

```bash
npm i @capacitor/app
```

```js
import { App } from '@capacitor/app';

App.addListener('backButton', ({ canGoBack }) => {
  // ปิดของที่เปิดอยู่ก่อนตามลำดับ
  if (closeTopmostSheet()) return;      // ฟังก์ชันของคุณเอง: ปิด modal/position sheet
  if (state.view !== 'home') { goHome(); return; }
  App.exitApp();
});
```

### ค) Google / Apple Sign-In — popup ใช้ไม่ได้ใน WebView

`signInWithPopup` จะค้างหรือพัง ต้องเปลี่ยนไปใช้ปลั๊กอินเนทีฟ

```bash
npm i @capacitor-firebase/authentication
npx cap sync
```

```js
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';

async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    const res = await FirebaseAuthentication.signInWithGoogle();
    const cred = firebase.auth.GoogleAuthProvider.credential(res.credential?.idToken);
    return fbAuth.signInWithCredential(cred);     // ให้ compat SDK รู้จัก user เดิมต่อ
  }
  return fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());  // บนเว็บใช้ของเดิม
}
```

ต้องทำเพิ่มฝั่งเนทีฟ:
- **iOS**: ดาวน์โหลด `GoogleService-Info.plist` จาก Firebase (เพิ่ม iOS app ก่อน)
  ลากเข้า Xcode ใต้ `App/App/` และเพิ่ม URL scheme = ค่า `REVERSED_CLIENT_ID` ในไฟล์นั้น
- **Android**: ดาวน์โหลด `google-services.json` วางที่ `android/app/`
  แล้วเอา SHA-1 ของ keystore ไปใส่ใน Firebase Console (ดู `07-playstore.md` §7.3)

### ง) ลิงก์ออกนอกแอป (Google Maps, Twitter, YouTube)

ในแอป ลิงก์พวกนี้ต้องเปิดเบราว์เซอร์ระบบ ไม่ใช่เปิดทับหน้าแอปตัวเอง

```bash
npm i @capacitor/browser
```

```js
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (!a || !Capacitor.isNativePlatform()) return;
  e.preventDefault();
  await Browser.open({ url: a.href, presentationStyle: 'popover' });
});
```

หมุดแผนที่ที่คุณทำไว้ก็จะเด้ง Google Maps ถูกต้อง

### จ) Service Worker

ในแอปเนทีฟ ไฟล์อยู่ในเครื่องอยู่แล้ว ไม่ต้องใช้ SW และมันอาจกวนด้วย

```js
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
```

### ฉ) ล็อกซูม/เลื่อนซ้ายขวา

คุณแก้ไปแล้วรอบก่อน (`maximum-scale=1, user-scalable=no`) ในแอปเพิ่มอีกชั้น:

```css
html, body { overscroll-behavior: none; overflow-x: hidden; }
```

และใน `capacitor.config.json` ฝั่ง iOS ตั้ง `"contentInset": "never"` แล้ว (ทำในข้อ 3.3)

## 3.7 Splash screen + ไอคอน

```bash
npm i -D @capacitor/assets
mkdir -p resources
# วางไฟล์สองอัน:
#   resources/icon.png    ← 1024×1024 ไม่มีมุมโค้ง ไม่มีโปร่งใส (Apple ห้าม alpha)
#   resources/splash.png  ← 2732×2732 โลโก้อยู่กลาง เผื่อขอบโดนตัดรอบด้าน
npx capacitor-assets generate
```

คำสั่งเดียวได้ไอคอนครบทุกขนาดทั้ง iOS/Android + splash โหมดสว่าง/มืด

ซ่อน splash เมื่อแอปวาดเสร็จ:

```bash
npm i @capacitor/splash-screen
```

```js
import { SplashScreen } from '@capacitor/splash-screen';
// เรียกท้ายสุดของ bootstrap หลัง render() ครั้งแรก
await SplashScreen.hide({ fadeOutDuration: 250 });
```

## 3.8 วงจรการทำงานประจำวันหลังจากนี้

```bash
# แก้โค้ดเว็บ → ดูผลในเบราว์เซอร์ (เร็วสุด)
npx serve www        # หรือ firebase serve

# แก้เสร็จ อยากดูในแอป
npm run sync         # ก๊อบ www เข้าทั้งสองแพลตฟอร์ม
npm run ios          # หรือ npm run android

# ปล่อยเว็บ
npm run deploy:web
```

**กฎทอง: แก้โค้ดเว็บเสร็จต้อง `npx cap sync` เสมอ** ไม่งั้นแอปยังเห็นของเก่า
(คนพลาดเรื่องนี้กันเยอะมาก นั่งงงว่าทำไมแก้แล้วไม่เปลี่ยน)

## 3.9 เช็กก่อนไปต่อ

- [ ] แอปเปิดขึ้นบน iPhone simulator และ Android emulator
- [ ] ไม่มีแถบขาว/ทับติ่งจอ
- [ ] ปุ่ม back ของ Android ปิดโมดัลก่อน ไม่ใช่ปิดแอป
- [ ] ล็อกอิน Google ได้ในแอป
- [ ] กดหมุดแผนที่แล้วเด้งไป Google Maps
- [ ] ไอคอนแอปบนหน้าโฮมถูกต้อง ไม่ใช่ไอคอนเปล่าของ Capacitor

ไปต่อ [04-native.md](04-native.md) — ส่วนที่ทำให้ "ไม่ใช่แค่เว็บห่อกล่อง"
