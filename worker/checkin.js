/* Event check-in by photo: a reader at an official event photographs a sign, a backdrop or a screen that carries the
 * BNK48 or CGM48 logo and sends it here; the answer is yes or no. The page then stamps the event in the reader's book
 * (users/<uid>.stamps) and gives the cat three snacks.
 *
 *   GET  /checkin   -> 405 "POST only". The page asks this once and shows the button only when it answers 405, so the
 *                      page can ship before the Worker (like /ask).
 *   POST /checkin   { e: <event id>, img: <base64 JPEG, no data: prefix> }, Authorization: Bearer <Firebase ID token>
 *                   -> { ok:true } | { ok:true, again:true } | { ok:false, why:'closed'|'nologo'|'dup'|'busy'|'bad' }
 *
 * What is checked, in this order, and none of it is explained to the reader:
 *   1. a signed-in account (the token is verified here, so the uid is real)
 *   2. the event is in data/push-schedule.json and now is within 45 minutes before its start and 7 hours after it
 *   3. this account has not checked in to this event yet, and has not asked too often this hour
 *   4. nobody else checked in to this event with the same picture
 *   5. a vision model says the picture shows the BNK48 or CGM48 logo or name on a sign, banner, backdrop or screen
 * The photo is never kept: only its SHA-256 (ckh:<event>:<hash> -> uid), and ck:<event>:<uid> -> time, both in KV IAM
 * for 120 days. The owner's account skips 2 and 3 so the check can be tried anywhere, any time, and gets the model's
 * raw answer back as `say`.
 */

const SITE = 'https://48thdb.com';
const SCHEDULE_URL = `${SITE}/data/push-schedule.json`;
const BEFORE = 45 * 60000, AFTER = 7 * 3600000;
const KEEP = 120 * 86400;
const MAX_B64 = 900000;                        // ~650 KB of JPEG: the page sends about 150 KB
const PER_HOUR = 8;
// tried in order until one answers; all take chat messages with an image
const MODELS = ['@cf/google/gemma-3-12b-it', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.2-11b-vision-instruct'];
const PROMPT = 'Look at this photo. Is there a sign, banner, backdrop, standee or screen showing the logo or name of BNK48 or CGM48 '
  + '(Thai idol groups; the logos read "BNK48" or "CGM48")? Answer with one word only: bnk48, cgm48, both or none.';

const HEADERS = (h) => ({ ...h, 'cache-control': 'no-store', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' });

let schedule = null, scheduleAt = 0;
async function starts(eventId) {
  if (!schedule || Date.now() - scheduleAt > 600000) {
    const r = await fetch(SCHEDULE_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) throw new Error('schedule');
    schedule = await r.json(); scheduleAt = Date.now();
  }
  // an online event has no backdrop to photograph
  return schedule.filter((x) => (x.e === eventId || x.id === eventId) && x.w && x.w !== 'ออนไลน์').map((x) => x.t).filter(Number.isFinite);
}
async function sha(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function textOf(r) {
  if (!r) return '';
  if (typeof r.response === 'string') return r.response;
  const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  return typeof c === 'string' ? c : '';
}
// the model's word: bnk48 | cgm48 | both | none, or '' if it was not understood or no model answered
async function readLogo(env, b64) {
  const url = `data:image/jpeg;base64,${b64}`;
  for (const model of MODELS) {
    try {
      const r = await env.AI.run(model, {
        messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url } }] }],
        max_tokens: 12, temperature: 0,
      });
      const t = textOf(r).toLowerCase();
      const hit = t.match(/\b(both|none|bnk48|cgm48)\b/);
      if (hit) return { word: hit[1], model };
    } catch (e) { /* the next model */ }
  }
  return { word: '', model: '' };
}

export async function checkinRoute(request, env, url, o) {
  if (url.pathname !== '/checkin') return null;
  const H = HEADERS(o.headers);
  const say = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: H });
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...H, 'access-control-max-age': '86400' } });
  if (request.method !== 'POST') return say({ error: 'POST only' }, 405);
  try {
    if (!env.AI) return say({ error: 'no-ai' }, 503);
    const claims = await o.claims(request);
    if (!claims || (claims.firebase && claims.firebase.sign_in_provider === 'anonymous')) return say({ ok: false, why: 'bad' }, 401);
    const uid = claims.sub, owner = await o.owner(request, env);
    const body = await request.json().catch(() => ({}));
    const e = String(body.e || ''), img = String(body.img || '');
    if (!e || e.length > 120 || !img || img.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(img)) return say({ ok: false, why: 'bad' });
    const bytes = Uint8Array.from(atob(img), (c) => c.charCodeAt(0));
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return say({ ok: false, why: 'bad' });

    let hash = '';
    if (!owner) {
      const t = await starts(e), now = Date.now();
      if (!t.some((s) => now >= s - BEFORE && now <= s + AFTER)) return say({ ok: false, why: 'closed' });
      if (await env.IAM.get(`ck:${e}:${uid}`)) return say({ ok: true, again: true });
      const rk = `ckr:${uid}`, n = Number(await env.IAM.get(rk)) || 0;
      if (n >= PER_HOUR) return say({ ok: false, why: 'busy' });
      await env.IAM.put(rk, String(n + 1), { expirationTtl: 3600 });
      const h = await sha(bytes), seen = await env.IAM.get(`ckh:${e}:${h}`);
      if (seen && seen !== uid) return say({ ok: false, why: 'dup' });
      hash = h;
    }

    const read = await readLogo(env, img);
    if (owner) return say({ ok: !!read.word && read.word !== 'none', say: read });   // the owner's try: the raw answer
    if (!read.word || read.word === 'none') return say({ ok: false, why: 'nologo' });
    await env.IAM.put(`ck:${e}:${uid}`, String(Date.now()), { expirationTtl: KEEP });
    await env.IAM.put(`ckh:${e}:${hash}`, uid, { expirationTtl: KEEP });
    return say({ ok: true });
  } catch (err) {
    return say({ error: String((err && err.message) || err) }, 502);
  }
}
