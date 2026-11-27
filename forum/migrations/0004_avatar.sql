-- A member's own picture: the key of an image in R2 (images.post_id is then minus the member's id,
-- so neither a post's deletion nor the nightly sweep of loose pictures touches it). Empty: a letter instead.
ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
