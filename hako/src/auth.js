// Accounts: passwords (PBKDF2), sessions (a random token in an HttpOnly cookie, its hash in D1),
// rate limits and the trust rules that decide which posts wait for a moderator.
import { b64, unb64, now, randomToken, sha256hex, sameBytes, cookie } from './util.js';

const ITER = 100000;                       // the most Workers' PBKDF2 allows
const COOKIE = 'hk_s';
const SESSION_DAYS = 30;
export const TRUST_AFTER = 3;              // a new account's first posts wait for a moderator

async function derive(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pw, salt, ITER))}`;
}
export async function checkPassword(pw, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  return sameBytes(await derive(pw, unb64(salt), +iter), unb64(hash));
}

export async function startSession(env, userId) {
  const token = randomToken();
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(userId, t),
    env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256hex(token), userId, t + SESSION_DAYS * 86400),
  ]);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export async function endSession(req, env) {
  const token = cookie(req, COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256hex(token)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export async function currentUser(req, env, ctx) {
  const token = cookie(req, COOKIE);
  if (!token) return null;
  const t = now();
  const u = await env.DB.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?')
    .bind(await sha256hex(token), t).first();
  if (u && t - u.last_seen > 60) {
    ctx.waitUntil(env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(t, u.id).run());
    u.last_seen = t;
  }
  return u;
}

export const isMod = (u) => !!u && (u.role === 'mod' || u.role === 'admin');
export const isAdmin = (u) => !!u && u.role === 'admin';
export const isBanned = (u) => !!u && u.banned_until > now();

// ---- rate limits: at most `max` in `secs` seconds for a key ----
export async function overLimit(env, key, max, secs) {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO hits (k, n, until) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n     = CASE WHEN hits.until < ?3 THEN 1  ELSE hits.n + 1 END,
       until = CASE WHEN hits.until < ?3 THEN ?2 ELSE hits.until END
     RETURNING n`).bind(key, t + secs, t).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM hits WHERE until < ?').bind(t).run();
  return (row?.n || 0) > max;
}

// A visitor's address, hashed with a salt kept in the database, so rate limits never store it.
let salt = '';
export async function ipKey(req, env) {
  if (!salt) {
    const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'salt'").first();
    salt = row?.v || '';
    if (!salt) {
      salt = randomToken(24);
      await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('salt', ?)").bind(salt).run();
      salt = (await env.DB.prepare("SELECT v FROM meta WHERE k = 'salt'").first()).v;
    }
  }
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  return (await sha256hex(salt + ip)).slice(0, 24);
}

// ---- which posts wait for a moderator ----
// a phone number or a bank account (10–12 digits, spaces or dashes between), or the words for one
const MONEY = /(?:\d[\s-]?){9,11}\d|พร้อมเพย์|promptpay|prompt pay|เลขบัญชี|เลขที่บัญชี/i;
export function reviewReason(user, text) {
  if (isMod(user)) return '';
  if (MONEY.test(text)) return 'มีเลขบัญชีหรือเบอร์โทร';
  if ((user.posts || 0) < TRUST_AFTER) return `บัญชีใหม่ · โพสต์ที่ ${(user.posts || 0) + 1}/${TRUST_AFTER}`;
  return '';
}

// ---- names ----
const RESERVED = /^(admin|administrator|mod|moderator|root|system|staff|hako|48thhako|48thdb|official|แอดมิน|ผู้ดูแล.*|ทีมงาน.*|เจ้าของเว็บ.*)$/i;
export function nameProblem(name) {
  const n = [...name].length;
  if (n < 3 || n > 20) return 'ชื่อต้องยาว 3–20 ตัวอักษร';
  if (!/^[\p{L}\p{M}\p{N}_.-]+$/u.test(name)) return 'ชื่อใช้ได้เฉพาะตัวอักษร ตัวเลข และ _ . - (ไม่มีช่องว่าง)';
  if (RESERVED.test(name)) return 'ชื่อนี้สงวนไว้ เลือกชื่ออื่นนะ';
  return '';
}
export const nameKey = (name) => name.normalize('NFC').toLowerCase();
