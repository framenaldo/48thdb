// Signing in with a 48thDb account: the same Firebase account (project thdatabase) a reader uses on 48thdb.com.
// The browser signs in to Firebase and hands us its ID token; we check the token ourselves (Google's public keys,
// as api.48thdb.com does in firebaseClaims), then read the reader's own 48thDb record — oshi, Kami Oshi, profile
// picture — from Firestore with that same token, so 48thDb's rules apply exactly as they do on 48thdb.com
// (users/<uid> is readable only by its owner; members/<id> by anyone signed in). Nothing new is asked of
// 48thDb's rules, and no e-mail address is kept here.
import { now, randomToken } from './util.js';

const GOOGLE_JWK = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const FIRESTORE = 'https://firestore.googleapis.com/v1';

export const fbOn = (env) => !!(env.FIREBASE_PROJECT && env.FIREBASE_API_KEY && env.FIREBASE_AUTH_DOMAIN);

const b64urlBytes = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

// The token's claims if Google signed it for this project and it is still good; otherwise null.
// FB_JWKS (a JSON key set) replaces Google's keys — only ever set for local tests.
export async function verifyIdToken(env, token) {
  const m = String(token || '').match(/^([\w-]+)\.([\w-]+)\.([\w-]+)$/);
  if (!m || !env.FIREBASE_PROJECT) return null;
  let head, body;
  try {
    head = JSON.parse(new TextDecoder().decode(b64urlBytes(m[1])));
    body = JSON.parse(new TextDecoder().decode(b64urlBytes(m[2])));
  } catch { return null; }
  const p = env.FIREBASE_PROJECT, t = Date.now() / 1000;
  if (head.alg !== 'RS256' || body.aud !== p || body.iss !== `https://securetoken.google.com/${p}`
    || !(body.exp > t) || !(body.iat < t + 300) || !body.sub || typeof body.sub !== 'string') return null;
  const keys = env.FB_JWKS ? JSON.parse(env.FB_JWKS)
    : await (await fetch(GOOGLE_JWK, { cf: { cacheTtl: 3600, cacheEverything: true } })).json();
  const jwk = (keys.keys || []).find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  // a 48thDb visitor who never signed in has an anonymous Firebase account: not an account here
  return ok && body.firebase?.sign_in_provider !== 'anonymous' ? body : null;
}

const base = (env) => `${env.FB_FIRESTORE || FIRESTORE}/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents`;
const str = (v) => (v && typeof v.stringValue === 'string' ? v.stringValue : '');

// The reader's own 48thDb record: { oshi: [member ids, Kami Oshi first], avatar: 'data:image/jpeg;base64,…' | '' }.
export async function read48thdb(env, token, uid) {
  const r = await fetch(`${base(env)}/users/${encodeURIComponent(uid)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return { oshi: [], avatar: '' };
  if (!r.ok) throw new Error(`48thDb answered ${r.status}`);
  const f = (await r.json()).fields || {};
  const list = (f.oshi?.arrayValue?.values || []).map(str).filter(Boolean);
  const kami = str(f.kamiOshi);
  const oshi = [...new Set([kami, ...list].filter((id) => /^[a-z0-9-]{2,40}$/.test(id)))].slice(0, 6);
  return { oshi, avatar: str(f.avatar) };
}

// The members' names, from 48thDb's own member list, in the order asked. A member the list does not give
// back keeps a name made from her id ("bnk-fame" → "Fame"), so an oshi is never lost to a slow answer.
const fromId = (id) => id.replace(/^(bnk|cgm)-/, '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export async function memberNames(env, token, ids) {
  const out = Object.fromEntries(ids.map((id) => [id, fromId(id)]));
  if (!ids.length) return out;
  const docs = ids.map((id) => `projects/${env.FIREBASE_PROJECT}/databases/(default)/documents/members/${id}`);
  try {
    const r = await fetch(`${base(env)}:batchGet`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: docs }),
    });
    if (r.ok) {
      for (const row of await r.json()) {
        const d = row.found, id = d?.name?.split('/').pop();
        const name = str(d?.fields?.name).replace(/,/g, ' ').trim();
        if (id && name && id in out) out[id] = name;
      }
    }
  } catch { /* the names from the ids stand */ }
  return out;
}

// Bring a reader's oshi (as names, kept with their ids for the links) and, if asked and they have none here,
// their 48thDb profile picture. The oshi is updated only while it still follows 48thDb (or is empty) unless
// `force`: one typed by hand stays. Whole names only, as many as fit the 40 characters the board shows.
export async function syncFrom48thdb(env, user, token, { force = false, picture = false } = {}) {
  const acc = await read48thdb(env, token, user.fb_uid);
  const names = await memberNames(env, token, acc.oshi);
  const ids = [];
  let text = '';
  for (const id of acc.oshi) {
    const next = text ? `${text}, ${names[id]}` : names[id];
    if ([...next].length > 40) break;
    text = next;
    ids.push(id);
  }
  // nothing on 48thDb clears only an oshi that was following it; one typed here stays
  if (ids.length ? force || user.oshi_ids || !user.oshi : !!user.oshi_ids) {
    await env.DB.prepare('UPDATE users SET oshi = ?, oshi_ids = ? WHERE id = ?').bind(text, ids.join(','), user.id).run();
  }
  const pic = picture && !user.avatar && env.IMAGES ? await importPicture(env, user, acc.avatar) : false;
  return { oshi: text, picture: pic };
}

// 48thDb keeps a profile picture as a JPEG data URL; it becomes this board's picture the same way an upload does.
async function importPicture(env, user, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return false;
  let bytes;
  try { bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch { return false; }
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return false;
  const key = randomToken(12);
  const type = `image/${m[1]}`;
  await env.IMAGES.put(`p/${key}`, bytes, { httpMetadata: { contentType: type } });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO images (key, user_id, post_id, type, bytes, w, h, created_at) VALUES (?, ?, ?, ?, ?, 256, 256, ?)')
      .bind(key, user.id, -user.id, type, bytes.length, now()),
    env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ? AND avatar = ''").bind(key, user.id),
  ]);
  return true;
}

// a board name from the 48thDb account: its display name, else the part of the e-mail before the @
export function suggestName(claims) {
  const raw = String(claims.name || String(claims.email || '').split('@')[0] || '');
  return [...raw.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}_.-]/gu, '')].slice(0, 20).join('');
}
