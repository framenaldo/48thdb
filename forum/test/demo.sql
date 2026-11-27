-- A board with people on it, for looking at the design (screenshots, reviews) — never for the live board.
--   npx wrangler d1 migrations apply 48thforum --local
--   npx wrangler d1 execute 48thforum --local --file test/demo.sql
-- Times are counted back from now. Nobody can sign in as these members (their password field is not a hash).

INSERT INTO users (id, name, name_key, pass, role, oshi, sig, color, created_at, last_seen) VALUES
 (1, 'framenaldo',        'framenaldo',        'x', 'admin', 'Fame',   'ไปทุกโรดโชว์ ตั้งแต่ปี 2019', 0, strftime('%s','now') - 86400*40, strftime('%s','now') - 60),
 (2, 'ชาเย็นหวานน้อย',     'ชาเย็นหวานน้อย',     'x', 'user',  'Fame',   'ชาเย็นหวานน้อย แต่รักโอชิมาก', 3, strftime('%s','now') - 86400*38, strftime('%s','now') - 120),
 (3, 'มะม่วงน้ำปลาหวาน',   'มะม่วงน้ำปลาหวาน',   'x', 'user',  'Marine', '', 1, strftime('%s','now') - 86400*30, strftime('%s','now') - 200),
 (4, 'ปลาทูทอดกรอบ',       'ปลาทูทอดกรอบ',       'x', 'user',  'Hoop',   '', 6, strftime('%s','now') - 86400*25, strftime('%s','now') - 3000),
 (5, 'แมวส้มกินจุ',         'แมวส้มกินจุ',         'x', 'user',  'Monet',  'แลกโฟโต้ทักได้ตลอด', 3, strftime('%s','now') - 86400*20, strftime('%s','now') - 7200),
 (6, 'ฟ้าใสไลท์สติ๊ก',     'ฟ้าใสไลท์สติ๊ก',     'x', 'user',  'Janry',  '', 4, strftime('%s','now') - 86400*12, strftime('%s','now') - 100),
 (7, 'ส้มตำไม่ใส่ปู',       'ส้มตำไม่ใส่ปู',       'x', 'mod',   'Praew',  '', 2, strftime('%s','now') - 86400*39, strftime('%s','now') - 86400),
 (8, 'น้องใหม่หัดติ่ง',     'น้องใหม่หัดติ่ง',     'x', 'user',  '',       '', 5, strftime('%s','now') - 86400*1,  strftime('%s','now') - 400);

INSERT INTO topics (id, forum_id, user_id, title, tag, kind, locked, status, last_post_at, created_at) VALUES
 (1, 1, 1, 'กติกาการใช้บอร์ด 48thForum (อ่านก่อนโพสต์)',               '',       2, 1, 'ok', 0, strftime('%s','now') - 86400*39),
 (2, 2, 2, 'รีวิวมินิคอนเสิร์ตโรดโชว์วันเสาร์ ใครไปบ้าง มาเล่ากัน',     'review', 0, 0, 'ok', 0, strftime('%s','now') - 3600*5),
 (3, 2, 5, '[โรดโชว์เชียงใหม่] หาเพื่อนไปด้วย 2 คน ออกจากกรุงเทพฯ',      'friend', 0, 0, 'ok', 0, strftime('%s','now') - 3600*9),
 (4, 2, 8, 'ไฮทัชรอบเย็นปิดรับบัตรกี่โมงครับ',                            'q',      0, 0, 'ok', 0, strftime('%s','now') - 86400*1),
 (5, 1, 6, 'เพลงไหนฟังแล้วร้องไห้ทุกที',                                  '',       0, 0, 'ok', 0, strftime('%s','now') - 86400*2),
 (6, 1, 4, 'ไปงานครั้งแรก ควรเตรียมอะไรบ้าง',                              'q',      1, 0, 'ok', 0, strftime('%s','now') - 86400*6),
 (7, 3, 6, 'จัดอันดับซิงเกิลที่ชอบที่สุด (ห้ามเกิน 5)',                     '',       0, 0, 'ok', 0, strftime('%s','now') - 86400*3),
 (8, 3, 3, 'สเตจเธียเตอร์รอบนี้ เพลงที่สามคือเพลงอะไร',                    'q',      0, 0, 'ok', 0, strftime('%s','now') - 86400*8),
 (9, 4, 7, 'ย้อนดูผล GE2026 ทั้ง 36 อันดับ',                               'news',   0, 0, 'ok', 0, strftime('%s','now') - 86400*12),
 (10, 5, 5, 'แลกโฟโต้เซ็ต Hoop ↔ Monet ใบไหนก็ได้ นัดรับที่งานได้',         'swap',   0, 0, 'ok', 0, strftime('%s','now') - 3600*20),
 (11, 5, 4, 'ขายผ้าเชียร์ Fame มือสอง สภาพดี',                              'sell',   0, 0, 'ok', 0, strftime('%s','now') - 86400*4),
 (12, 6, 3, 'อยากให้มีโหมดมืด',                                             '',       0, 0, 'ok', 0, strftime('%s','now') - 86400*5);

INSERT INTO posts (topic_id, user_id, body, created_at) VALUES
 (1, 1, '[b]1. เคารพสมาชิกวง[/b]
วิจารณ์ผลงานได้ แต่ไม่ด่า ไม่ดูถูก ไม่วิจารณ์รูปร่างหน้าตา

[b]2. ไม่ละเมิดความเป็นส่วนตัวของสมาชิก[/b]
ห้ามโพสต์ที่อยู่ โรงเรียน ตารางชีวิตนอกงาน หรือรูปที่แอบถ่ายนอกงาน

อ่านกติกาเต็มได้ที่หน้า กติกา & FAQ', strftime('%s','now') - 86400*39),
 (2, 2, 'เพลงเปิดคือดีมาก ไฟเวทีสวยมาก ยืนโซนซ้ายเห็นชัดสุด ๆ
ช่วง MC ตลกสุด ใครไปบ้าง มาเล่ากันหน่อย
แนะนำว่ารอบหน้าไปก่อนเวลาสักชั่วโมงนะ คิวยาวมาก', strftime('%s','now') - 3600*5),
 (2, 3, '[quote="ชาเย็นหวานน้อย"]ยืนโซนซ้ายเห็นชัดสุด ๆ[/quote]
เห็นด้วย! รอบหน้าจะไปโซนซ้ายบ้าง ขอบคุณที่รีวิวนะ', strftime('%s','now') - 3600*4),
 (2, 4, 'ใครถ่ายช่วงเพลงสุดท้ายได้บ้าง อยากดูมาก เสียดายไปไม่ทัน', strftime('%s','now') - 3600*3),
 (2, 6, 'ไปมาค่ะ เสียงดีมาก โดยเฉพาะท่อนฮุคเพลงที่สอง', strftime('%s','now') - 3600*2),
 (2, 1, 'ปักหมุดไว้ก่อน รอบหน้าไปด้วยกัน', strftime('%s','now') - 60*25),
 (3, 5, 'ออกเช้าวันเสาร์ หารค่ารถกัน มีที่ว่าง 2 ที่ สนใจตอบในกระทู้ได้เลย', strftime('%s','now') - 3600*9),
 (3, 8, 'สนใจค่ะ ไปคนเดียว ขอไปด้วยได้ไหม', strftime('%s','now') - 3600*6),
 (4, 8, 'ไปครั้งแรก ไม่แน่ใจว่าต้องมาถึงกี่โมง', strftime('%s','now') - 86400*1),
 (4, 7, 'ปกติปิดรับก่อนเริ่มรอบประมาณครึ่งชั่วโมง ดูประกาศหน้างานอีกทีนะ', strftime('%s','now') - 3600*14),
 (5, 6, 'ของเราคือเพลงนี้ ท่อนฮุคคือที่สุด ฟังกี่รอบก็ขนลุก', strftime('%s','now') - 86400*2),
 (5, 2, 'เหมือนกันเลย ฟังทีไรน้ำตาไหล', strftime('%s','now') - 86400*2 + 3600),
 (6, 4, 'เตรียมเงินสด พาวเวอร์แบงก์ น้ำ และใจที่พร้อม', strftime('%s','now') - 86400*6),
 (7, 6, '1. …
2. …
3. …
ของทุกคนล่ะ', strftime('%s','now') - 86400*3),
 (7, 3, 'อันดับหนึ่งของเรายังไงก็เพลงแรกที่ทำให้เริ่มติ่ง', strftime('%s','now') - 86400*2),
 (8, 3, 'จำชื่อเพลงไม่ได้ ใครจำได้บอกหน่อย', strftime('%s','now') - 86400*8),
 (9, 7, 'สรุปผลทั้ง 36 อันดับไว้ในกระทู้นี้ ใครเห็นตรงไหนผิดทักได้', strftime('%s','now') - 86400*12),
 (10, 5, 'มีใบซ้ำของ Hoop 2 ใบ อยากได้ของ Monet ใบไหนก็ได้ นัดรับที่งานได้', strftime('%s','now') - 3600*20),
 (10, 4, 'มีของ Monet ค่ะ เดี๋ยวทักไปนะ', strftime('%s','now') - 3600*19),
 (11, 4, 'ใช้ไปสองงาน สภาพดี ราคาตามป้ายหน้างาน นัดรับได้', strftime('%s','now') - 86400*4),
 (12, 3, 'อ่านกลางคืนแล้วแสบตา อยากให้มีโหมดมืดค่ะ', strftime('%s','now') - 86400*5),
 (12, 1, 'รับไว้แล้ว จะทำให้นะ', strftime('%s','now') - 86400*4);

-- the counters the board keeps (as refreshTopic / refreshForum in src/db.js)
UPDATE topics SET
  first_post_id = (SELECT MIN(id) FROM posts WHERE topic_id = topics.id),
  last_post_id  = (SELECT MAX(id) FROM posts WHERE topic_id = topics.id),
  last_post_at  = (SELECT MAX(created_at) FROM posts WHERE topic_id = topics.id),
  replies       = (SELECT COUNT(*) FROM posts WHERE topic_id = topics.id) - 1,
  views         = 40 + (id * 37) % 300;
UPDATE forums SET
  topics       = (SELECT COUNT(*) FROM topics WHERE forum_id = forums.id AND status = 'ok'),
  posts        = (SELECT COUNT(*) FROM posts p JOIN topics t ON t.id = p.topic_id WHERE t.forum_id = forums.id),
  last_post_id = (SELECT MAX(p.id) FROM posts p JOIN topics t ON t.id = p.topic_id WHERE t.forum_id = forums.id);
UPDATE users SET posts = (SELECT COUNT(*) FROM posts WHERE user_id = users.id);
UPDATE users SET posts = posts + 140 WHERE id IN (1, 2);
UPDATE users SET posts = posts + 520 WHERE id = 7;
