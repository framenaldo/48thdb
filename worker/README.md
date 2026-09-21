# โครงสร้างบน Cloudflare

## ตอนนี้มีอะไรอยู่บ้าง

| อะไร | ที่อยู่ | Worker | โค้ด |
|---|---|---|---|
| ตัวเว็บ | https://48thdb.com | `48thdb-site` (ไฟล์สแตติก) | `site.wrangler.toml` ที่รากโปรเจกต์ |
| ส่งต่อ www | https://www.48thdb.com → 48thdb.com | `48thdb-www` | `worker/www/` |
| ตัวเช็กไลฟ์ YouTube | https://api.48thdb.com | `48thdb-live` | `worker/live-worker.js` |

ส่วนข้อมูลสมาชิกกับระบบล็อกอินยังอยู่ที่ Firebase เหมือนเดิม

เว็บเดิมที่ framenaldo.github.io ยังเปิดอยู่ แต่ `index.html` จะพาคนที่เข้าทางนั้นมาที่ 48thdb.com ให้เอง

**deploy อัตโนมัติ** ทุกครั้งที่ push จะมี workflow "Deploy site" อัปเว็บขึ้น Cloudflare ให้ ต้องมี secret ชื่อ `CLOUDFLARE_API_TOKEN` ใน GitHub (ดูวิธีสร้างท้ายไฟล์นี้) ส่วน Worker สองตัวในโฟลเดอร์นี้ไม่ได้ deploy อัตโนมัติ แก้แล้วต้องรัน `wrangler deploy` เอง

## ตัวเช็กไลฟ์ YouTube ทำอะไร

เว็บถาม YouTube ตรง ๆ จากเบราว์เซอร์ไม่ได้ (ไม่มี CORS) Worker ตัวนี้จึงไปดูหน้า `/live` ของช่อง BNK48 และ CGM48 แล้วตอบกลับว่าช่องไหนกำลังถ่ายทอดสดอยู่ ไม่ใช้คีย์ API จึงไม่กินโควตา

หน้าเว็บถามทุกหนึ่งนาที ใช้คำตอบนี้ทำป้าย "กำลังไลฟ์อยู่" ในงานที่มีถ่ายทอดสด ถ้า Worker ล่ม เว็บจะถอยไปใช้ไฟล์ `data/live-now.json` ที่ GitHub Actions เขียนไว้แทนเอง

### ทำไมไม่เช็กไลฟ์ในแอป iAM48

เคยทำแล้ว แต่ใช้ไม่ได้จริง: ข้อมูลที่ `app.bnk48.com` เปิดให้ดึงคือรายการ **Catch-up** (ดูย้อนหลัง) ไลฟ์จะโผล่ในรายการนั้นก็ต่อเมื่อจบแล้ว ส่วนไลฟ์ที่กำลังเกิดขึ้นอยู่ในแอปมือถือ ใช้ API ที่ไม่เปิดสาธารณะ

ตรวจกับไลฟ์จริงเมื่อ 21 ก.ย. 2026: Shenae กำลังไลฟ์อยู่ในแอป แต่รายการของเธอบนเว็บล่าสุดยังเป็นวันที่ 17 ก.ย. และหน้าโปรไฟล์ของเธอก็ไม่มีสัญญาณอะไรบอกว่ากำลังไลฟ์

ข้อมูล Catch-up ยังใช้อยู่ตามเดิม คือสถิติไลฟ์ของแต่ละคนที่อัปเดตทุกเที่ยงคืน

## ตรวจว่าทำงานไหม

```bash
curl 'https://api.48thdb.com/?debug=1'
```

ควรได้แบบนี้

```json
{ "checked": "2026-09-21T15:52:00.473Z",
  "youtube": [ { "group": "cgm48", "title": "CGM48 POP UP LIVE ON TOUR", "url": "https://www.youtube.com/watch?v=..." } ],
  "source": "worker",
  "debug": { "fresh": true, "failed": 0 } }
```

- `youtube` ว่างแปลว่าไม่มีช่องไหนไลฟ์อยู่
- `failed` มากกว่า 0 แปลว่า YouTube ปฏิเสธคำขอ Worker จะใช้คำตอบล่าสุดต่อไปอีก 5 นาที

## แก้ไขหรือ deploy ใหม่

```bash
cd worker
npm_config_cache="$HOME/.npm-wrangler" npx wrangler deploy
```

(ใส่ `npm_config_cache` เพราะโฟลเดอร์ `~/.npm` ของเครื่องนี้มีไฟล์ของ root ค้างอยู่
npm จึงเขียนแคชปกติไม่ได้ ถ้าแก้ด้วย `sudo chown -R 501:20 "$HOME/.npm"` แล้ว
จะตัดส่วนนี้ออกก็ได้)

ชื่อโดเมน `api.48thdb.com` ผูกไว้ใน `wrangler.toml` แล้ว deploy ใหม่ก็ยังอยู่ที่เดิม

> **ระวังเรื่อง subdomain ของ workers.dev** wrangler อาจพิมพ์ชื่อที่คุณ**พิมพ์** ไม่ใช่ชื่อที่
> Cloudflare **จดให้จริง** (ตอนติดตั้งครั้งแรก: พิมพ์ `48thdb-fn` แต่ระบบจด `48thdb`)
> เช็กชื่อจริงด้วย `npm_config_cache="$HOME/.npm-wrangler" npx wrangler subdomain`

## สร้าง CLOUDFLARE_API_TOKEN (ทำครั้งเดียว)

จำเป็นสำหรับ deploy อัตโนมัติเวลา push — รวมถึงตอนที่บอทอัปเดตสถิติไลฟ์รายคืนและสร้างไฟล์ปฏิทินใหม่

1. ไปที่ https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. เลือกเทมเพลต **Edit Cloudflare Workers** → Continue → Create Token
3. คัดลอกค่าที่ได้ (แสดงครั้งเดียว)
4. ไปที่ https://github.com/framenaldo/48thdb/settings/secrets/actions → **New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Secret: วางค่าที่คัดลอกมา
5. เสร็จแล้วสั่งรันทดสอบได้ที่แท็บ Actions → Deploy site → Run workflow

> โทเค็นนี้ไม่ต้องส่งให้ใคร วางใน GitHub โดยตรงได้เลย
