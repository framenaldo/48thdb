-- Ready for a busy board: indexes that let the front page, a forum and a topic read only
-- the rows they show, and a search index over the posts and the topic titles.

-- topics touched lately, per forum: the "new posts" rings look only at these
CREATE INDEX topics_fresh ON topics(forum_id, status, last_post_at);
-- a topic's posts in order, whatever their status: a page reads only its own rows
CREATE INDEX posts_thread ON posts(topic_id, id);
-- old "read" marks are cleared every night (see `scheduled` in src/index.js)
CREATE INDEX reads_at ON reads(at);

-- Search. Thai has no spaces between words, so the index is of every three letters
-- (the trigram tokenizer): any piece of three letters or more is found inside a word,
-- in Thai and English alike, case aside. The index holds no copy of the text — it points
-- at posts.body and topics.title — and triggers keep it in step.
CREATE VIRTUAL TABLE post_fts USING fts5(body, content='posts', content_rowid='id', tokenize='trigram');
CREATE VIRTUAL TABLE topic_fts USING fts5(title, content='topics', content_rowid='id', tokenize='trigram');

CREATE TRIGGER posts_fts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO post_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER posts_fts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO post_fts(post_fts, rowid, body) VALUES ('delete', old.id, old.body);
END;
CREATE TRIGGER posts_fts_au AFTER UPDATE OF body ON posts BEGIN
  INSERT INTO post_fts(post_fts, rowid, body) VALUES ('delete', old.id, old.body);
  INSERT INTO post_fts(rowid, body) VALUES (new.id, new.body);
END;

CREATE TRIGGER topics_fts_ai AFTER INSERT ON topics BEGIN
  INSERT INTO topic_fts(rowid, title) VALUES (new.id, new.title);
END;
CREATE TRIGGER topics_fts_ad AFTER DELETE ON topics BEGIN
  INSERT INTO topic_fts(topic_fts, rowid, title) VALUES ('delete', old.id, old.title);
END;
CREATE TRIGGER topics_fts_au AFTER UPDATE OF title ON topics BEGIN
  INSERT INTO topic_fts(topic_fts, rowid, title) VALUES ('delete', old.id, old.title);
  INSERT INTO topic_fts(rowid, title) VALUES (new.id, new.title);
END;

-- whatever was posted before this migration
INSERT INTO post_fts(post_fts) VALUES ('rebuild');
INSERT INTO topic_fts(topic_fts) VALUES ('rebuild');
