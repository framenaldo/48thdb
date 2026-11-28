/* Fans seeing each other without a feed: numbers only, never who.
 *
 *   GET  /social?e=<event ids, comma>&m=1
 *        -> { going:{ <event>:n }, ck:{ <event>:n }, oshi?:{ <member>:n } }   (kept at the edge for a minute)
 *        going: how many signed-in readers said "ไปงานนี้"; ck: how many checked in by photo (checkin.js keeps
 *        ck:<event>:<uid>); oshi (with m=1): how many readers have each member among their oshi.
 *   POST /social/going  { e, on }   Authorization: Bearer <Firebase ID token>  -> { n }
 *   POST /social/oshi   { ids:[…] } Authorization: Bearer <Firebase ID token>  -> { ok:true }
 *   POST /social/view   { m }   a member's sheet was opened (anyone; once a day per address and member counts)
 *   GET  /social/trend  -> { now:{ m:n }, before:{ m:n }, oshiNow:{…}, oshiThen:{…} }   for กำลังมาแรง (kept an edge 10 minutes):
 *        sheet opens in the last 7 days and the 7 before, and the oshi counts now and about a week ago
 *
 * Kept in KV IAM: gs:<event> = the going readers as short hashes of their uid (a list, so a reader counts once);
 * os:<uid hash> = that reader's oshi ids; osc = { member: n } worked out from them. No uid, name or e-mail is kept,
 * and nothing here says who is going or whose oshi is whom. Signed-in readers only, 60 writes an hour each.
 * Sheet opens: mv:<Thai date> = { member: n }, kept 30 days; vv:<date>:<address hash>:<member> marks one count a day;
 * osc:<date> keeps a copy of osc once a day so a week's change can be told.
 */

const EV = /^ev-[\w-]{1,100}$/, MEM = /^[a-z]+-[\w-]{1,40}$/;
const KEEP = 400 * 86400, PER_HOUR = 60;

async function uidHash(uid) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('48thdb-social:' + uid));
  return [...new Uint8Array(d)].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const readJson = async (env, k, dflt) => { try { const v = await env.IAM.get(k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } };

async function ckCount(env, e) {
  let n = 0, cursor;
  for (let i = 0; i < 5; i++) {
    const r = await env.IAM.list({ prefix: `ck:${e}:`, cursor, limit: 1000 });
    n += r.keys.length;
    if (r.list_complete) break;
    cursor = r.cursor;
  }
  return n;
}


const thDay = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
async function ipHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('48thdb-view:' + ip));
  return [...new Uint8Array(d)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function trend(env) {
  const now = Date.now(), cur = {}, prev = {};
  const days = await Promise.all(Array.from({ length: 14 }, (_, i) => readJson(env, `mv:${thDay(now - i * 86400e3)}`, {})));
  days.forEach((d, i) => { const to = i < 7 ? cur : prev; for (const [m, n] of Object.entries(d)) to[m] = (to[m] || 0) + n; });
  const oshiNow = await readJson(env, 'osc', {}), today = thDay(now);
  if (!(await env.IAM.get(`osc:${today}`))) await env.IAM.put(`osc:${today}`, JSON.stringify(oshiNow), { expirationTtl: 30 * 86400 });
  let oshiThen = null;
  for (let i = 7; i >= 1 && !oshiThen; i--) oshiThen = await readJson(env, `osc:${thDay(now - i * 86400e3)}`, null);
  return { now: cur, before: prev, oshiNow, oshiThen: oshiThen || oshiNow };
}

export async function socialRoute(request, env, url, o) {
  if (url.pathname !== '/social' && !url.pathname.startsWith('/social/')) return null;
  const H = { ...o.headers, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  const say = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...H, 'cache-control': 'no-store', ...extra } });
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...H, 'access-control-max-age': '86400' } });
  try {
    if (url.pathname === '/social' && request.method === 'GET') {
      const cache = caches.default, key = new Request(url.toString(), { method: 'GET' });
      const hit = await cache.match(key);
      if (hit) return hit;
      const ids = [...new Set(String(url.searchParams.get('e') || '').split(',').filter((x) => EV.test(x)))].slice(0, 60);
      const going = {}, ck = {};
      await Promise.all(ids.map(async (e) => {
        const list = await readJson(env, `gs:${e}`, []);
        if (list.length) going[e] = list.length;
        const n = await ckCount(env, e);
        if (n) ck[e] = n;
      }));
      const out = { going, ck };
      if (url.searchParams.get('m') === '1') out.oshi = await readJson(env, 'osc', {});
      const res = new Response(JSON.stringify(out), { headers: { ...H, 'cache-control': 'public, max-age=60' } });
      await cache.put(key, res.clone());
      return res;
    }
    if (url.pathname === '/social/trend' && request.method === 'GET') {
      const cache = caches.default, key = new Request(url.origin + '/social/trend', { method: 'GET' });
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = new Response(JSON.stringify(await trend(env)), { headers: { ...H, 'cache-control': 'public, max-age=600' } });
      await cache.put(key, res.clone());
      return res;
    }
    if (url.pathname === '/social/view' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})), m = String(body.m || '');
      if (!MEM.test(m)) return say({ error: 'bad' }, 400);
      const day = thDay(Date.now()), mark = `vv:${day}:${await ipHash(request)}:${m}`;
      if (await env.IAM.get(mark)) return say({ ok: true });
      await env.IAM.put(mark, '1', { expirationTtl: 2 * 86400 });
      const d = await readJson(env, `mv:${day}`, {});
      d[m] = (d[m] || 0) + 1;
      await env.IAM.put(`mv:${day}`, JSON.stringify(d), { expirationTtl: 30 * 86400 });
      return say({ ok: true });
    }
    if (request.method !== 'POST') return say({ error: 'POST only' }, 405);
    const claims = await o.claims(request);
    if (!claims || (claims.firebase && claims.firebase.sign_in_provider === 'anonymous')) return say({ error: 'sign in' }, 401);
    const who = await uidHash(claims.sub);
    const rk = `sr:${who}`, used = Number(await env.IAM.get(rk)) || 0;
    if (used >= PER_HOUR) return say({ error: 'busy' }, 429);
    await env.IAM.put(rk, String(used + 1), { expirationTtl: 3600 });
    const body = await request.json().catch(() => ({}));

    if (url.pathname === '/social/going') {
      const e = String(body.e || '');
      if (!EV.test(e)) return say({ error: 'bad' }, 400);
      const list = await readJson(env, `gs:${e}`, []);
      const has = list.includes(who), on = !!body.on;
      if (on && !has) list.push(who);
      if (!on && has) list.splice(list.indexOf(who), 1);
      if (on !== has) await env.IAM.put(`gs:${e}`, JSON.stringify(list), { expirationTtl: KEEP });
      return say({ n: list.length, on });
    }
    if (url.pathname === '/social/oshi') {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((x) => typeof x === 'string' && MEM.test(x)))].slice(0, 80);
      const before = await readJson(env, `os:${who}`, []);
      const gone = before.filter((x) => !ids.includes(x)), added = ids.filter((x) => !before.includes(x));
      if (gone.length || added.length) {
        const c = await readJson(env, 'osc', {});
        gone.forEach((x) => { c[x] = Math.max(0, (c[x] || 0) - 1); if (!c[x]) delete c[x]; });
        added.forEach((x) => { c[x] = (c[x] || 0) + 1; });
        await env.IAM.put('osc', JSON.stringify(c));
        if (ids.length) await env.IAM.put(`os:${who}`, JSON.stringify(ids), { expirationTtl: KEEP });
        else await env.IAM.delete(`os:${who}`);
      }
      return say({ ok: true });
    }
    return say({ error: 'not found' }, 404);
  } catch (err) {
    return say({ error: String((err && err.message) || err) }, 502);
  }
}
