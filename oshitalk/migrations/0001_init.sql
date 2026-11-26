-- OshiTalk: the board's tables and its first rooms.
-- Times are Unix seconds. A post's status is ok, pending (waits for a moderator),
-- hidden (reported three times, waits for a moderator) or deleted. A topic's status
-- always follows its first post's.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  name_key      TEXT    NOT NULL UNIQUE,          -- lower-cased, for "is this name taken"
  pass          TEXT    NOT NULL,                 -- pbkdf2$<iterations>$<salt>$<hash>
  role          TEXT    NOT NULL DEFAULT 'user',  -- user | mod | admin
  oshi          TEXT    NOT NULL DEFAULT '',
  sig           TEXT    NOT NULL DEFAULT '',
  color         INTEGER NOT NULL DEFAULT 0,       -- avatar colour, 0–7
  posts         INTEGER NOT NULL DEFAULT 0,       -- approved posts
  banned_until  INTEGER NOT NULL DEFAULT 0,
  ban_reason    TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL DEFAULT 0,
  mark_all_at   INTEGER NOT NULL DEFAULT 0        -- "mark everything read"
);
CREATE INDEX users_seen  ON users(last_seen);
CREATE INDEX users_posts ON users(posts);

CREATE TABLE sessions (
  token       TEXT    PRIMARY KEY,                -- sha-256 of the cookie's token
  user_id     INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE categories (
  id     INTEGER PRIMARY KEY,
  title  TEXT    NOT NULL,
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE forums (
  id            INTEGER PRIMARY KEY,
  cat_id        INTEGER NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  descr         TEXT    NOT NULL DEFAULT '',
  icon          TEXT    NOT NULL DEFAULT '💬',
  rules         TEXT    NOT NULL DEFAULT '',
  trade         INTEGER NOT NULL DEFAULT 0,       -- shows the buying-and-selling warning
  sort          INTEGER NOT NULL DEFAULT 0,
  topics        INTEGER NOT NULL DEFAULT 0,
  posts         INTEGER NOT NULL DEFAULT 0,
  last_post_id  INTEGER
);

CREATE TABLE topics (
  id             INTEGER PRIMARY KEY,
  forum_id       INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  title          TEXT    NOT NULL,
  tag            TEXT    NOT NULL DEFAULT '',
  kind           INTEGER NOT NULL DEFAULT 0,      -- 0 topic, 1 sticky, 2 announcement
  locked         INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'ok',
  replies        INTEGER NOT NULL DEFAULT 0,
  views          INTEGER NOT NULL DEFAULT 0,
  first_post_id  INTEGER,
  last_post_id   INTEGER,
  last_post_at   INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX topics_forum  ON topics(forum_id, status, kind, last_post_at);
CREATE INDEX topics_recent ON topics(status, last_post_at);
CREATE INDEX topics_user   ON topics(user_id);

CREATE TABLE posts (
  id          INTEGER PRIMARY KEY,
  topic_id    INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  body        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'ok',
  flag        TEXT    NOT NULL DEFAULT '',        -- why it waits for a moderator
  reports     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  edited_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX posts_topic  ON posts(topic_id, status, id);
CREATE INDEX posts_user   ON posts(user_id, status, id);
CREATE INDEX posts_status ON posts(status, id);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  reason      TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(post_id, user_id)
);
CREATE INDEX reports_open ON reports(done, post_id);

CREATE TABLE reads (
  user_id   INTEGER NOT NULL,
  topic_id  INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, topic_id)
);

-- rate limits: a counter per key that starts again once its window has passed
CREATE TABLE hits (
  k      TEXT    PRIMARY KEY,
  n      INTEGER NOT NULL,
  until  INTEGER NOT NULL
);

CREATE TABLE meta (
  k  TEXT PRIMARY KEY,
  v  TEXT NOT NULL
);

INSERT INTO categories (id, title, sort) VALUES
  (1, 'พูดคุย', 1),
  (2, 'ตลาด & เว็บ', 2);

INSERT INTO forums (cat_id, slug, title, descr, icon, rules, trade, sort) VALUES
  (1, 'general',  'พูดคุยทั่วไป',      'เรื่องอะไรก็ได้เกี่ยวกับวงและสมาชิก',            '💬', '', 0, 1),
  (1, 'events',   'งาน/อีเวนต์',       'รีวิวงาน ถามทาง หาเพื่อนไปงาน',                '🎫', 'ห้ามโพสต์ที่อยู่หรือตารางชีวิตส่วนตัวของสมาชิก · กระทู้หาเพื่อนไปงาน ใส่ชื่องานไว้ในหัวข้อ', 0, 2),
  (1, 'music',    'เพลง/ผลงาน',        'ซิงเกิล อัลบั้ม MV สเตจเธียเตอร์',              '🎵', '', 0, 3),
  (1, 'ge',       'GE / เลือกตั้ง',     'ผลด่วน ผลสุดท้าย และการเชียร์',                '🗳️', 'เชียร์คนที่ชอบได้เต็มที่ แต่ไม่ด่าหรือดูถูกสมาชิกคนอื่นและแฟนคลับของเขา', 0, 4),
  (2, 'trade',    'ซื้อขายแลกเปลี่ยน',  'โฟโต้เซ็ต ของที่ระลึก · ห้ามขายบัตรเกินราคา',     '🛍️', 'ห้ามขายบัตรเกินราคาหน้าบัตร · นัดรับที่งานปลอดภัยที่สุด · โพสต์ที่มีเลขบัญชีหรือเบอร์โทรจะรอผู้ดูแลตรวจก่อน', 1, 1),
  (2, 'feedback', 'ข้อเสนอแนะเว็บ',     'แจ้งปัญหา เสนอไอเดียให้ OshiTalk',             '💡', '', 0, 2);
