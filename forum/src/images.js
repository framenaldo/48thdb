// Pictures in posts. The browser shrinks a picture (long side 1,600 px, JPEG — which also drops the
// phone's location and other EXIF) and sends its bytes to POST /upload; the file goes to R2 as p/<key>
// and is shown at /i/<key>. A post shows it as [img=WxH]key[/img] (see markup.js).
import { now, randomToken } from './util.js';
import { overLimit, isBanned, isMod } from './auth.js';

import { IMG_TAG, PER_POST } from './markup.js';

export const MAX_BYTES = 2 * 1024 * 1024;   // after shrinking a photo is ~0.2–0.4 MB; a GIF is sent as it is

export const imageKeys = (body) => [...new Set([...String(body ?? '').matchAll(IMG_TAG)].map((m) => m[3]))].slice(0, PER_POST);

// what the bytes say the file is — never what the browser says
function sniff(b) {
  if (b.length < 12) return '';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}

const json = (c, obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: c.headers({ 'Content-Type': 'application/json; charset=utf-8' }) });

export async function upload(c) {
  const { env, user, req, url } = c;
  if (!env.IMAGES) return json(c, { error: 'ยังไม่ได้เปิดระบบแนบรูป' }, 503);
  if (!user) return json(c, { error: 'เข้าสู่ระบบก่อนแนบรูป' }, 401);
  if (isBanned(user)) return json(c, { error: 'บัญชีนี้ถูกระงับการโพสต์' }, 403);
  if (+(req.headers.get('Content-Length') || 0) > MAX_BYTES) return json(c, { error: 'รูปใหญ่เกิน 2 MB' }, 413);
  if (!isMod(user) && await overLimit(env, `img:${user.id}`, 30, 3600)) {
    return json(c, { error: 'แนบรูปถี่เกินไป พักสักครู่นะ (ได้ 30 รูปต่อชั่วโมง)' }, 429);
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return json(c, { error: 'ไม่ได้รับไฟล์' }, 400);
  if (bytes.length > MAX_BYTES) return json(c, { error: 'รูปใหญ่เกิน 2 MB' }, 413);
  const type = sniff(bytes);
  if (!type) return json(c, { error: 'ไฟล์นี้ไม่ใช่รูป (รับ JPG, PNG, GIF และ WebP)' }, 415);
  // the size is only for laying the page out before the picture arrives
  const side = (v) => Math.min(8000, Math.max(1, parseInt(v, 10) || 1));
  const w = side(url.searchParams.get('w')), h = side(url.searchParams.get('h'));
  const key = randomToken(12);
  await env.IMAGES.put(`p/${key}`, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare('INSERT INTO images (key, user_id, type, bytes, w, h, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(key, user.id, type, bytes.length, w, h, now()).run();
  return json(c, { key, w, h, tag: `[img=${w}x${h}]${key}[/img]` });
}

// GET /i/<key>: straight from R2, no database. A picture of a deleted post is gone from R2 already.
export async function serve(req, env, ctx, key) {
  if (!env.IMAGES) return new Response('Not found', { status: 404 });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(req.url);
    if (hit) return hit;
  }
  const obj = await env.IMAGES.get(`p/${key}`);
  if (!obj) return new Response('Not found', { status: 404 });
  const res = new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(obj.size),
      // an hour: a picture taken down stays at most that long in caches that already hold it
      'Cache-Control': 'public, max-age=3600',
      ETag: obj.httpEtag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
  if (cache) ctx.waitUntil(cache.put(req.url, res.clone()));
  return res;
}

// After a post is saved: the pictures it shows (its writer's, or the editing moderator's) belong to it,
// and any it no longer shows are let go, for the nightly job to clear. Returns how many it shows.
export async function linkImages(env, postId, body, userIds) {
  const keys = imageKeys(body);
  const who = [...new Set(userIds)].slice(0, 2);
  while (who.length < 2) who.push(who[0]);
  const stmts = [];
  if (keys.length) {
    stmts.push(env.DB.prepare(`UPDATE images SET post_id = ? WHERE key IN (${keys.map(() => '?').join(',')})
      AND (post_id IS NULL OR post_id = ?) AND user_id IN (?, ?)`).bind(postId, ...keys, postId, ...who));
  }
  stmts.push(env.DB.prepare(`UPDATE images SET post_id = NULL WHERE post_id = ?${keys.length ? ` AND key NOT IN (${keys.map(() => '?').join(',')})` : ''}`)
    .bind(postId, ...keys));
  await env.DB.batch(stmts);
  return keys.length;
}

// A deleted post's pictures go from R2 and from the table, now, and from the edge cache here (`origin` is
// the board's own address). Other Cloudflare locations let their copy go within the hour serve() gives it.
export async function dropImages(env, postIds, origin = '') {
  const ids = [...new Set(postIds)].filter(Boolean).slice(0, 90);
  if (!ids.length || !env.IMAGES) return;
  const { results } = await env.DB.prepare(`SELECT key FROM images WHERE post_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  await dropKeys(env, results.map((r) => r.key), origin);
}

async function dropKeys(env, keys, origin = '') {
  for (let i = 0; i < keys.length; i += 90) {           // D1 takes at most 100 bound values a statement
    const part = keys.slice(i, i + 90);
    await env.IMAGES.delete(part.map((k) => `p/${k}`));
    await env.DB.prepare(`DELETE FROM images WHERE key IN (${part.map(() => '?').join(',')})`).bind(...part).run();
    if (origin && typeof caches !== 'undefined') await Promise.all(part.map((k) => caches.default.delete(`${origin}/i/${k}`)));
  }
}

// A member's own picture: one they uploaded themselves, not yet in a post. The old one goes.
export async function setAvatar(env, user, key, origin = '') {
  if (!env.IMAGES || !/^[A-Za-z0-9_-]{16,32}$/.test(String(key))) return false;
  const img = await env.DB.prepare('SELECT key FROM images WHERE key = ? AND user_id = ? AND (post_id IS NULL OR post_id = ?)')
    .bind(key, user.id, -user.id).first();
  if (!img) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE images SET post_id = ? WHERE key = ?').bind(-user.id, key),
    env.DB.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(key, user.id),
  ]);
  if (user.avatar && user.avatar !== key) await dropKeys(env, [user.avatar], origin);
  return true;
}

export async function clearAvatar(env, userId, origin = '') {
  const u = await env.DB.prepare('SELECT avatar FROM users WHERE id = ?').bind(userId).first();
  if (!u?.avatar) return;
  await env.DB.prepare("UPDATE users SET avatar = '' WHERE id = ?").bind(userId).run();
  if (env.IMAGES) await dropKeys(env, [u.avatar], origin);
}

// nightly: pictures uploaded but never posted, a day on
export async function dropLoose(env) {
  if (!env.IMAGES) return;
  const { results } = await env.DB.prepare('SELECT key FROM images WHERE post_id IS NULL AND created_at < ? LIMIT 900')
    .bind(now() - 86400).all();
  await dropKeys(env, results.map((r) => r.key));
}
