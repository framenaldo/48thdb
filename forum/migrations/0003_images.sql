-- Pictures in posts. The files are in R2 (binding IMAGES) under p/<key>; this table knows whose
-- each one is and which post it belongs to. A picture belongs to no post until a post that shows it
-- is saved; one still loose after a day is cleared by the nightly job. Deleting a post deletes its
-- pictures from R2 at once.
CREATE TABLE images (
  id          INTEGER PRIMARY KEY,
  key         TEXT    NOT NULL UNIQUE,      -- 16 random letters: the file's name and its address /i/<key>
  user_id     INTEGER NOT NULL,
  post_id     INTEGER,
  type        TEXT    NOT NULL,             -- image/jpeg, image/png, image/gif or image/webp, read off the bytes
  bytes       INTEGER NOT NULL,
  w           INTEGER NOT NULL,
  h           INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX images_post  ON images(post_id);
CREATE INDEX images_loose ON images(created_at) WHERE post_id IS NULL;
CREATE INDEX images_user  ON images(user_id, created_at);

-- how many pictures a topic's first post shows: a 📷 on its row in the forum
ALTER TABLE topics ADD COLUMN pics INTEGER NOT NULL DEFAULT 0;
