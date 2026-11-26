// Small helpers shared by every page: escaping, Thai dates, crypto, cookies.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const now = () => Math.floor(Date.now() / 1000);

export const num = (n) => String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- dates, in Thai time (UTC+7, no daylight saving) ----
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TZ = 7 * 3600;
const parts = (ts) => {
  const d = new Date((ts + TZ) * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes() };
};
const hm = (p) => `${String(p.H).padStart(2, '0')}:${String(p.M).padStart(2, '0')}`;
const day = (ts) => Math.floor((ts + TZ) / 86400);

export function when(ts, at = now()) {
  if (!ts) return '';
  const diff = at - ts;
  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  const p = parts(ts);
  if (day(ts) === day(at)) return `วันนี้ ${hm(p)}`;
  if (day(at) - day(ts) === 1) return `เมื่อวาน ${hm(p)}`;
  return `${p.d} ${MON[p.m]} ${p.y} ${hm(p)}`;
}
export const dateTh = (ts) => { const p = parts(ts); return `${p.d} ${MON[p.m]} ${p.y}`; };
export const monthTh = (ts) => { const p = parts(ts); return `${MON[p.m]} ${p.y}`; };
export const clockTh = (ts) => { const p = parts(ts); return `${p.d} ${MON[p.m]} ${p.y} ${hm(p)}`; };

// ---- crypto ----
const enc = new TextEncoder();
export const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256hex(s) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---- cookies ----
export function cookie(req, name) {
  const all = req.headers.get('Cookie') || '';
  for (const part of all.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) {
      try { return decodeURIComponent(part.slice(i + 1)); } catch { return ''; }
    }
  }
  return '';
}

// A path on this site to send someone back to after a form: "/x", never "//host" or "/\\host".
export const localPath = (b, fallback = '/') =>
  (typeof b === 'string' && /^\/(?![\/\\])[^\\\s\u0000-\u001F]*$/.test(b) ? b : fallback);

// ---- text ----
// Drop control characters (keeping new lines and tabs) and the odd invisible ones people paste in.
export const clean = (s) => String(s ?? '').normalize('NFC').replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2028\u2029\uFEFF]/g, '');
export const oneLine = (s) => clean(s).replace(/\s+/g, ' ').trim();
export const len = (s) => [...String(s)].length;

// The letter on a member's round avatar: the first consonant (a Thai leading vowel is skipped).
export function initial(name) {
  const ch = [...String(name)].find((c) => !'เแโใไ'.includes(c)) || '?';
  return ch.toUpperCase();
}
