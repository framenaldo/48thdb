-- Signing in with a 48thDb account (the same Firebase account as 48thdb.com). fb_uid is that account's id; a
-- board account made this way has no password of its own ('!' never matches). oshi_ids keeps the 48thDb member
-- ids the oshi came from, so the names link to their pages there; typing an oshi by hand clears it.
-- No e-mail address is kept.
ALTER TABLE users ADD COLUMN fb_uid TEXT;
ALTER TABLE users ADD COLUMN oshi_ids TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX users_fb ON users(fb_uid) WHERE fb_uid IS NOT NULL;
