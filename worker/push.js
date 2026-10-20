/* Web push: "starting soon" notifications.
 *
 * A reader who has added the site to the home screen (iPhone) or allowed notifications (Chrome) sends their
 * browser's push address here with what they want (every event, or only those with their oshi). Every five
 * minutes pushTick looks at data/push-schedule.json (built from the page's events by scripts/build-calendar.mjs)
 * and, 30 minutes before a start, queues a short message and wakes the browser.
 *
 * The wake-up carries no payload, so nothing has to be encrypted: the service worker (sw.js) asks
 * POST /push/msg for its message and shows it. VAPID signs the wake-up (ES256 with the secret VAPID_PRIVATE;
 * the public half is the var VAPID_PUBLIC). Subscriptions live in KV as ps:<hash>, queued messages as pm:<hash>.
 */

const SITE = 'https://48thdb.com';
const SCHEDULE_URL = `${SITE}/data/push-schedule.json`;
const HEAD_MIN = 30, WINDOW = [25, 35];       // a start is announced when it is 25–35 minutes away, once per subscription
const SUB_TTL = 120 * 86400, MSG_TTL = 3600;
const MAX_SENDS = 40;                         // the free plan allows 50 subrequests a run
const HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const HEADERS = {
  'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store',
  'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hashOf(endpoint) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(d)].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const say = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

let signKey = null;
async function vapidKey(env) {
  if (signKey) return signKey;
  const pub = unb64u(env.VAPID_PUBLIC);                    // 0x04 | X | Y
  signKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env.VAPID_PRIVATE.trim(),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return signKey;
}
async function vapidHeader(endpoint, env) {
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(body));
  return `vapid t=${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
const configured = (env) => !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE);

/* wake a browser; its service worker then asks /push/msg what to show */
async function wake(sub, env) {
  const res = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(sub.endpoint, env), TTL: String(HEAD_MIN * 60), Urgency: 'high' } });
  return res.status;
}

const cleanPrefs = (p) => ({
  mode: p && p.mode === 'oshi' ? 'oshi' : 'all',
  oshi: (p && Array.isArray(p.oshi) ? p.oshi : []).filter((id) => typeof id === 'string' && /^[a-z]+-[\w-]{1,40}$/.test(id)).slice(0, 80),
});

export async function pushRoute(request, env, url) {
  if (!url.pathname.startsWith('/push/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { headers: { ...HEADERS, 'access-control-max-age': '86400' } });
  if (url.pathname === '/push/key') return configured(env) ? say({ key: env.VAPID_PUBLIC }) : say({ error: 'not-configured' }, 503);
  if (!configured(env) || !env.IAM) return say({ error: 'not-configured' }, 503);
  if (request.method !== 'POST') return say({ error: 'POST only' }, 405);
  const text = await request.text();
  if (text.length > 4096) return say({ error: 'too big' }, 413);
  let body; try { body = JSON.parse(text); } catch (e) { return say({ error: 'bad request' }, 400); }

  if (url.pathname === '/push/sub') {
    const sub = body && body.sub;
    let host = ''; try { host = new URL(sub.endpoint).hostname; } catch (e) { /* below */ }
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !HOSTS.some((r) => r.test(host)) || sub.endpoint.length > 1000) return say({ error: 'bad subscription' }, 400);
    const k = await hashOf(sub.endpoint), prefs = cleanPrefs(body.prefs);
    const old = await env.IAM.get(`ps:${k}`, 'json');
    await env.IAM.put(`ps:${k}`, JSON.stringify({ endpoint: sub.endpoint, prefs, sent: old && old.sent || {} }), { expirationTtl: SUB_TTL });
    return say({ ok: true, k });
  }
  if (url.pathname === '/push/unsub') {
    if (typeof body.k === 'string' && /^[0-9a-f]{32}$/.test(body.k)) await env.IAM.delete(`ps:${body.k}`);
    return say({ ok: true });
  }
  if (url.pathname === '/push/msg') {          // the service worker, right after a wake-up: take the next queued message
    if (typeof body.k !== 'string' || !/^[0-9a-f]{32}$/.test(body.k)) return say({ error: 'bad request' }, 400);
    const q = (await env.IAM.get(`pm:${body.k}`, 'json')) || [];
    const next = q.shift();
    if (next) { if (q.length) await env.IAM.put(`pm:${body.k}`, JSON.stringify(q), { expirationTtl: MSG_TTL }); else await env.IAM.delete(`pm:${body.k}`); }
    return say(next || { title: '48thDb', body: 'มีอะไรใหม่ในเว็บ', url: '/' });
  }
  return say({ error: 'not found' }, 404);
}

async function schedule(env) {
  const cached = await env.IAM.get('push-schedule', 'json');
  if (cached) return cached;
  const res = await fetch(SCHEDULE_URL, { cf: { cacheTtl: 300 } });
  if (!res.ok) throw new Error(`schedule ${res.status}`);
  const rows = await res.json();
  await env.IAM.put('push-schedule', JSON.stringify(rows), { expirationTtl: 600 });
  return rows;
}
const wants = (prefs, row) => prefs.mode !== 'oshi' || row.a || (row.m || []).some((id) => prefs.oshi.includes(id));

/* every five minutes: queue and send what is 25–35 minutes away */
export async function pushTick(env, now = Date.now()) {
  if (!configured(env) || !env.IAM) return { skipped: 'not-configured' };
  const due = (await schedule(env)).filter((r) => { const m = (r.t - now) / 60000; return m >= WINDOW[0] && m < WINDOW[1]; });
  if (!due.length) return { due: 0 };
  let sends = 0, gone = 0, cursor;
  do {
    const page = await env.IAM.list({ prefix: 'ps:', cursor, limit: 200 });
    for (const key of page.keys) {
      if (sends >= MAX_SENDS) return { due: due.length, sends, more: true };
      const sub = await env.IAM.get(key.name, 'json');
      if (!sub) continue;
      const k = key.name.slice(3), fresh = due.filter((r) => wants(sub.prefs, r) && !sub.sent[r.id]);
      if (!fresh.length) continue;
      const q = (await env.IAM.get(`pm:${k}`, 'json')) || [];
      for (const r of fresh) {
        const mins = Math.max(1, Math.round((r.t - now) / 60000));
        q.push({ title: r.n, body: `เริ่มอีก ${mins} นาที${r.w ? ' · ' + r.w : ''}`, url: `/event/${r.e || r.id}`, tag: r.id });
        sub.sent[r.id] = now;
      }
      for (const id of Object.keys(sub.sent)) if (now - sub.sent[id] > 2 * 86400000) delete sub.sent[id];
      await env.IAM.put(`pm:${k}`, JSON.stringify(q), { expirationTtl: MSG_TTL });
      let status = 0;
      for (let i = 0; i < fresh.length && sends < MAX_SENDS; i++) { status = await wake(sub, env).catch(() => 0); sends++; if (status === 404 || status === 410) break; }
      if (status === 404 || status === 410) { await env.IAM.delete(key.name); await env.IAM.delete(`pm:${k}`); gone++; continue; }
      await env.IAM.put(key.name, JSON.stringify(sub), { expirationTtl: SUB_TTL });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { due: due.length, sends, gone };
}
