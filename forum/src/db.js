// Queries more than one page needs. Counters are worked out again from the posts after
// every change, rather than added to and taken from, so they can never drift.

export async function refreshTopic(env, topicId, userIds = []) {
  const db = env.DB;
  const t = await db.prepare('SELECT forum_id FROM topics WHERE id = ?').bind(topicId).first();
  if (!t) return;
  await db.batch([
    db.prepare(`UPDATE topics SET status = COALESCE((SELECT status FROM posts WHERE id = topics.first_post_id), status) WHERE id = ?1`).bind(topicId),
    db.prepare(`UPDATE topics SET
        replies      = MAX(0, (SELECT COUNT(*) FROM posts WHERE topic_id = ?1 AND status = 'ok') - 1),
        last_post_id = (SELECT MAX(id) FROM posts WHERE topic_id = ?1 AND status = 'ok'),
        last_post_at = COALESCE((SELECT created_at FROM posts WHERE id = (SELECT MAX(id) FROM posts WHERE topic_id = ?1 AND status = 'ok')), created_at)
      WHERE id = ?1`).bind(topicId),
    ...[...new Set(userIds)].map((uid) => db.prepare(
      `UPDATE users SET posts = (SELECT COUNT(*) FROM posts WHERE user_id = ?1 AND status = 'ok') WHERE id = ?1`).bind(uid)),
  ]);
  await refreshForum(env, t.forum_id);
}

export async function refreshForum(env, forumId) {
  await env.DB.prepare(`UPDATE forums SET
      topics       = (SELECT COUNT(*) FROM topics WHERE forum_id = ?1 AND status = 'ok'),
      posts        = (SELECT COUNT(*) FROM posts p JOIN topics t ON t.id = p.topic_id WHERE t.forum_id = ?1 AND t.status = 'ok' AND p.status = 'ok'),
      last_post_id = (SELECT MAX(p.id) FROM posts p JOIN topics t ON t.id = p.topic_id WHERE t.forum_id = ?1 AND t.status = 'ok' AND p.status = 'ok')
    WHERE id = ?1`).bind(forumId).run();
}

export const forumBySlug = (env, slug) => env.DB.prepare('SELECT * FROM forums WHERE slug = ?').bind(slug).first();

export const topicById = (env, id) => env.DB.prepare(
  `SELECT t.*, f.slug, f.title AS ftitle, f.trade, f.rules
     FROM topics t JOIN forums f ON f.id = t.forum_id WHERE t.id = ?`).bind(id).first();

export const postById = (env, id) => env.DB.prepare(
  `SELECT p.*, t.title, t.forum_id, t.first_post_id, t.locked, t.status AS tstatus, u.name, u.role AS urole
     FROM posts p JOIN topics t ON t.id = p.topic_id JOIN users u ON u.id = p.user_id WHERE p.id = ?`).bind(id).first();

// Who may see a post or a topic: everyone sees approved ones; the writer also sees their own
// that wait or were hidden; moderators see everything but the deleted.
export function canSee(user, row, mod) {
  if (row.status === 'ok') return true;
  if (row.status === 'deleted') return false;
  return mod || (!!user && user.id === row.user_id);
}

// what the moderators' badge counts: posts waiting, hidden, or reported and not yet looked at
export const MOD_COUNT_SQL = `SELECT COUNT(*) AS n FROM posts
  WHERE status IN ('pending','hidden') OR (status = 'ok' AND id IN (SELECT post_id FROM reports WHERE done = 0))`;
