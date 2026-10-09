/* Is a group's YouTube channel on air right now?
 *
 * The page cannot ask youtube.com itself — no CORS header — so this Worker
 * asks and passes the answer on. data/live-now.json, written by a GitHub job,
 * is the fallback for when this is unreachable; that job's cron fires only a
 * few percent of the time it is asked to, which is why the Worker exists.
 *
 * It used to answer for iAM48 lives too. It cannot: app.bnk48.com publishes
 * the Catch-up archive, where an entry appears only once a live has ended,
 * and the `isLive` flag on it is never true. The lives themselves happen in
 * the iAM48 mobile app, over an API that is not public. Checked 21 Sep 2026
 * against a live in progress: the member's own page carried no sign of it.
 *
 * Deploy: see worker/README.md.
 */

/* A channel's /live page says plainly whether it is carrying a stream, which
 * costs no API quota at all — unlike search.list, at 100 of the 10,000 daily
 * units a call. (The GitHub job has to use the API: YouTube turns away plain
 * page requests from GitHub's runners. Cloudflare's are not GitHub's, and if
 * YouTube ever refuses these too the page still has the committed file.) */
const YT_CHANNELS = {
  cgm48: { handle: 'CGM48OFFICIAL', name: 'CGM48 OFFICIAL' },
  bnk48: { handle: 'bnk48official', name: 'BNK48 Official' },
};
const YT_KEY = 'https://live.state/youtube-v1';
const YT_TTL_MS = 30000;              // one look per channel per half minute, shared by everyone
const KEEP_MS = 5 * 60 * 1000;        // how long a refused check may stand on the last answer

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  // browsers may reuse an answer this old; the page asks more often than this
  'cache-control': 'public, max-age=15',
};

/* Cache API entries are not subrequests, so keeping the last answer costs
 * nothing against the budget. They are per-colocation, which is fine: a colo
 * that has not looked yet simply looks on the next request. */
async function readCache(key) {
  const hit = await caches.default.match(new Request(key));
  if (!hit) return null;
  try { return await hit.json(); } catch (e) { return null; }
}
function writeCache(key, value, ttl) {
  return caches.default.put(new Request(key), new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` },
  }));
}

/* The live page only names a video and says "isLiveNow" while one is on air. */
async function youtubeLive(key) {
  const ch = YT_CHANNELS[key];
  const res = await fetch(`https://www.youtube.com/@${ch.handle}/live`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'accept-language': 'en',
    },
    redirect: 'follow',
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`YouTube said ${res.status}`);
  const html = await res.text();
  if (!/"isLiveNow":true/.test(html) && !/"isLive":true/.test(html)) return null;
  const id = (html.match(/"videoId":"([\w-]{11})"/) || [])[1] || null;
  let title = (html.match(/<meta name="title" content="([^"]+)"/) || [])[1] || null;
  if (title) title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return {
    group: key, channel: ch.name, title: title || ch.name,
    videoId: id,
    url: id ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/@${ch.handle}/live`,
  };
}

/* Both channels, at most once a bucket between them however many people ask. */
async function check(force) {
  const now = Date.now();
  const cached = (await readCache(YT_KEY)) || { at: 0, live: [] };
  if (!force && now - cached.at < YT_TTL_MS) return { live: cached.live, at: cached.at, fresh: false };

  const found = [];
  let failed = 0;
  for (const key of Object.keys(YT_CHANNELS)) {
    try {
      const l = await youtubeLive(key);
      if (l) found.push(l);
    } catch (e) {
      // A refusal is not an answer: leave the last one standing for a while.
      failed++;
      const before = cached.live.find((x) => x.group === key);
      if (before && now - cached.at < KEEP_MS) found.push(before);
    }
  }
  await writeCache(YT_KEY, { at: now, live: found }, 300);
  return { live: found, at: now, fresh: true, failed };
}

/* Videos' own live state, for events whose stream link is one video.
 *
 * videos.list with liveStreamingDetails gives actualStartTime and, once the
 * stream is over, actualEndTime (1 unit of quota for up to 50 videos). The
 * watch page says the same for free, but YouTube answers Cloudflare's
 * requests for it with 429. The page uses this to close the event the moment
 * the stream ends, and to keep it open while a stream runs late. An ended
 * stream never changes again, so that answer is kept a day; a live or
 * upcoming one a minute. */
const STREAM_KEY = 'https://live.state/stream-v2/';
const STREAM_TTL_S = 60;
const STREAM_MAX = 6;

async function streamStates(ids, env) {
  const out = {}, ask = [], old = {};
  for (const id of ids) {
    const hit = await readCache(STREAM_KEY + id);
    if (hit && Date.now() - hit.at < (hit.state.end ? 86400000 : STREAM_TTL_S * 1000)) out[id] = hit.state;
    else { ask.push(id); if (hit) old[id] = hit; }
  }
  if (!ask.length) return { streams: out };
  try {
    if (!env.YOUTUBE_API_KEY) throw new Error('no-key');
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${ask.join(',')}&key=${env.YOUTUBE_API_KEY}`,
      { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error(`YouTube said ${res.status}`);
    const d = await res.json();
    const got = {};
    for (const it of d.items || []) {
      const l = it.liveStreamingDetails;
      got[it.id] = !l ? { live: false, vod: true }
        : { live: !!l.actualStartTime && !l.actualEndTime, start: l.actualStartTime || null,
            end: l.actualEndTime || null, planned: l.scheduledStartTime || null };
    }
    for (const id of ask) {
      if (!got[id]) continue;   // private or removed: no answer
      out[id] = got[id];
      await writeCache(STREAM_KEY + id, { at: Date.now(), state: got[id] }, got[id].end ? 86400 : 600);
    }
    return { streams: out };
  } catch (e) {
    // a refusal is not an answer: the last one stands a while, else none
    for (const id of ask) if (old[id] && Date.now() - old[id].at < KEEP_MS) out[id] = old[id].state;
    return { streams: out, error: String((e && e.message) || e) };
  }
}

/* iAM48 lives that ended since last night.
 *
 * data/lives.json is rebuilt once a night from every member's catch-up list.
 * Between those runs this keeps watching the same lists: a cron comes every
 * five minutes and looks at a third of the members each time, so everyone is
 * looked at every quarter of an hour (a third keeps each run well under the
 * free plan's 50 requests). Whatever each of them published in the last three
 * days is kept in KV, and the page adds the lives newer than its own copy of
 * lives.json. The list of members and their iAM ids comes from lives.json
 * itself, so the two never disagree about who is counted. */
const IAM_SLICES = 3;
const IAM_KEEP_MS = 3 * 86400000;
const IAM_KEY = 'https://live.state/iam-v1';
const IDS_FROM = ['https://48thdb.com/data/lives.json',
  'https://raw.githubusercontent.com/framenaldo/48thdb/main/data/lives.json'];

async function iamIds(env) {
  const got = await env.IAM.get('ids', 'json');
  if (got && Date.now() - got.at < 12 * 3600000) return got.ids;
  for (const url of IDS_FROM) {
    try {
      const res = await fetch(url, { cf: { cacheTtl: 0 } });
      if (!res.ok) continue;
      const d = await res.json();
      const ids = {};
      // graduates are in the file for their history; they no longer go live
      for (const [id, v] of Object.entries(d.members || {})) if (v && v.iam && !v.grad) ids[id] = v.iam;
      if (!Object.keys(ids).length) continue;
      await env.IAM.put('ids', JSON.stringify({ at: Date.now(), ids }));
      return ids;
    } catch (e) { /* try the next copy */ }
  }
  if (got) return got.ids;
  throw new Error('no member list');
}

async function iamLook(env, slice) {
  const ids = await iamIds(env);
  const mine = Object.keys(ids).sort().filter((_, i) => i % IAM_SLICES === slice);
  const before = (await env.IAM.get(`slice:${slice}`, 'json')) || { members: {} };
  const since = Date.now() - IAM_KEEP_MS;
  const members = {};
  let failed = 0;
  await Promise.all(mine.map(async (id) => {
    try {
      const res = await fetch(`https://app.bnk48.com/member/${ids[id]}/videocontent?skip=0&take=10`, {
        headers: { 'user-agent': 'Mozilla/5.0 (48thDb live stats; 48thdb.com)', accept: 'application/json' },
        cf: { cacheTtl: 0 },
      });
      if (!res.ok) throw new Error(`iAM48 said ${res.status}`);
      const list = await res.json();
      const recent = [];
      for (const x of list) {
        const v = x && x.videoContent;
        const at = v && new Date(v.publishedAt);
        if (!at || isNaN(at) || at.getTime() < since) continue;
        recent.push({ id: v.id, at: at.toISOString(), text: String(v.content || '').trim().slice(0, 120) });
      }
      if (recent.length) members[id] = recent;
    } catch (e) {
      // one bad answer should not make her lives vanish until the next look
      failed++;
      if (before.members[id]) members[id] = before.members[id];
    }
  }));
  await env.IAM.put(`slice:${slice}`, JSON.stringify({ at: Date.now(), members, failed }));
  return { looked: mine.length, failed };
}

async function iamRecent(env) {
  const hit = await readCache(IAM_KEY);
  if (hit) return hit;
  const slices = await Promise.all([...Array(IAM_SLICES).keys()].map((i) => env.IAM.get(`slice:${i}`, 'json')));
  const members = {};
  let checked = null;
  for (const s of slices) {
    if (!s) { checked = null; break; }
    Object.assign(members, s.members);
    if (!checked || s.at < checked) checked = s.at;      // everyone has been looked at since then
  }
  const body = { checked: checked ? new Date(checked).toISOString() : null, members, source: 'worker' };
  await writeCache(IAM_KEY, body, 60);
  return body;
}

/* How many people came: the owner's profile page asks, and this reads
 * Cloudflare Web Analytics (the beacon Cloudflare puts on 48thdb.com) through
 * its GraphQL API. That needs a read-only token, kept as the Worker secret
 * CF_ANALYTICS_TOKEN — set once by the owner, never in this repo.
 *
 * Only the owner may look. The page sends its Firebase ID token; this checks
 * Google's signature on it and that it names the owner's verified address,
 * kept as the Worker secret OWNER_EMAIL so it stays out of this repo — the
 * same test the Firestore rules apply. (Asking Firestore's REST API instead
 * was tried: it answers 429 to requests from here.) */
const CF_ACCOUNT = '8e5e921b23884747506b07a3ba030dcf';
const SITE_HOST = '48thdb.com';
const FIREBASE_PROJECT = 'thdatabase';
const VISITS_KEY = 'https://live.state/visits-v1';
const VISITS_TTL = 120;
const GOOGLE_JWK = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const b64url = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
async function isOwner(request, env) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+([\w-]+)\.([\w-]+)\.([\w-]+)$/);
  if (!m || !env.OWNER_EMAIL) return false;
  const head = JSON.parse(new TextDecoder().decode(b64url(m[1])));
  const body = JSON.parse(new TextDecoder().decode(b64url(m[2])));
  const now = Date.now() / 1000;
  if (head.alg !== 'RS256' || body.aud !== FIREBASE_PROJECT || body.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}`
    || !(body.exp > now) || !(body.iat < now + 300) || body.email_verified !== true
    || String(body.email || '').toLowerCase() !== env.OWNER_EMAIL.trim().toLowerCase()) return false;
  const keys = await (await fetch(GOOGLE_JWK, { cf: { cacheTtl: 3600, cacheEverything: true } })).json();
  const jwk = (keys.keys || []).find((k) => k.kid === head.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
}

const VISITS_QUERY = `query ($a: String!, $host: String!, $s: Time!, $w: Time!, $f: Time!, $e: Time!) {
  viewer { accounts(filter: { accountTag: $a }) {
    hours: rumPageloadEventsAdaptiveGroups(limit: 1000, filter: { requestHost: $host, datetime_geq: $s, datetime_lt: $e }) {
      count sum { visits } dimensions { datetimeHour } }
    countries: rumPageloadEventsAdaptiveGroups(limit: 8, orderBy: [sum_visits_DESC], filter: { requestHost: $host, datetime_geq: $w, datetime_lt: $e }) {
      count sum { visits } dimensions { countryName } }
    referers: rumPageloadEventsAdaptiveGroups(limit: 8, orderBy: [sum_visits_DESC], filter: { requestHost: $host, datetime_geq: $w, datetime_lt: $e }) {
      count sum { visits } dimensions { refererHost } }
    devices: rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [sum_visits_DESC], filter: { requestHost: $host, datetime_geq: $w, datetime_lt: $e }) {
      count sum { visits } dimensions { deviceType } }
    refDays: rumPageloadEventsAdaptiveGroups(limit: 5000, filter: { requestHost: $host, datetime_geq: $f, datetime_lt: $e }) {
      sum { visits } dimensions { datetimeHour refererHost } }
  } }
}`;

/* Which screen people open. The site is one page and Web Analytics keeps the
 * path without its query, so every screen is "/" there; the page says which
 * screen it drew instead (/hit, below), and it is counted in Workers Analytics
 * Engine (the binding HITS). Only a screen's name and the member or event id
 * on it are kept — nothing about who looked. Read back with the SQL API under
 * the same CF_ANALYTICS_TOKEN. */
const HITS_DATASET = 'hits_48thdb';
const hitOk = (v, max) => typeof v === 'string' && v.length <= max && /^[a-z0-9:_.-]*$/i.test(v);
async function hitsSql(env, sql) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/analytics_engine/sql`, {
    method: 'POST', headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: `${sql} FORMAT JSON`,
  });
  if (!r.ok) throw new Error(`Analytics Engine ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).data || [];
}
async function hitsSummary(env) {
  const week = `timestamp > NOW() - INTERVAL '7' DAY`;
  const [pages, items, since] = await Promise.all([
    hitsSql(env, `SELECT blob1 AS p, SUM(_sample_interval) AS n FROM ${HITS_DATASET} WHERE ${week} GROUP BY p ORDER BY n DESC LIMIT 100`),
    hitsSql(env, `SELECT blob1 AS p, blob2 AS i, SUM(_sample_interval) AS n FROM ${HITS_DATASET} WHERE ${week} AND (blob1 = 'member' OR blob1 = 'event') AND blob2 != '' GROUP BY p, i ORDER BY n DESC LIMIT 20`),
    hitsSql(env, `SELECT MIN(timestamp) AS t FROM ${HITS_DATASET}`),
  ]);
  return {
    pages: pages.map((r) => [r.p, Number(r.n)]),                 // [screen, opens] over 7 days
    pageItems: items.map((r) => [r.p, r.i, Number(r.n)]),        // the members and events opened most
    pagesSince: (since[0] && since[0].t) || null,
  };
}

/* Google Search: what people searched before they found the site, how often it
 * showed in the results and how often they clicked. Read from the Search
 * Console API with the owner's own read-only consent: scripts/gsc-auth.mjs
 * runs the sign-in once and puts {client_id, client_secret, refresh_token} in
 * the Worker secret GSC_OAUTH (service-account keys are blocked by the owner's
 * Google Cloud organisation policy, so GSC_KEY, a service account's JSON key,
 * is only the fallback). Never in this repo. Google's numbers trail by two or
 * three days and change once a day, so they are kept half an hour. */
const GSC_SITE = 'sc-domain:48thdb.com';
const GSC_KEY_CACHE = 'https://live.state/gsc-v1';
const GSC_TOKEN_CACHE = 'https://live.state/gsc-token-v1';
const b64urlText = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function gscToken(env) {
  const hit = await readCache(GSC_TOKEN_CACHE);
  if (hit && hit.token) return hit.token;
  if (env.GSC_OAUTH) {
    const o = JSON.parse(env.GSC_OAUTH);
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: o.client_id, client_secret: o.client_secret, refresh_token: o.refresh_token }) });
    const d = await r.json();
    if (!d.access_token) throw new Error(`Google sign-in: ${d.error_description || d.error || r.status}`);
    await writeCache(GSC_TOKEN_CACHE, { token: d.access_token }, Math.max(60, (d.expires_in || 3600) - 300));
    return d.access_token;
  }
  const sa = JSON.parse(env.GSC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64urlText(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64urlText(sig)}` });
  const d = await r.json();
  if (!d.access_token) throw new Error(`Google sign-in: ${d.error_description || d.error || r.status}`);
  await writeCache(GSC_TOKEN_CACHE, { token: d.access_token }, Math.max(60, (d.expires_in || 3600) - 300));
  return d.access_token;
}
async function gscSummary(env) {
  if (!env.GSC_KEY && !env.GSC_OAUTH) return { searchErr: 'no-key' };
  const hit = await readCache(GSC_KEY_CACHE);
  if (hit) return hit;
  const token = await gscToken(env);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const end = day(Date.now()), start = day(Date.now() - 27 * 86400000);
  const ask = async (dimensions, rowLimit) => {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit, dataState: 'all' }) });
    const d = await r.json();
    if (!r.ok) throw new Error(`Search Console ${r.status}: ${(d.error && d.error.message) || ''}`.slice(0, 200));
    return d.rows || [];
  };
  const [tot, days, queries, pages] = await Promise.all([ask([], 1), ask(['date'], 60), ask(['query'], 15), ask(['page'], 10)]);
  const t = tot[0] || { clicks: 0, impressions: 0, position: 0 };
  const body = { search: {
    from: start, to: end,
    total: [t.clicks, t.impressions, Math.round((t.position || 0) * 10) / 10],
    days: days.map((r) => [r.keys[0], r.clicks, r.impressions]),           // [date, clicks, times shown]
    queries: queries.map((r) => [r.keys[0], r.clicks, r.impressions, Math.round(r.position * 10) / 10]),
    pages: pages.map((r) => [r.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/', r.clicks, r.impressions]),
  } };
  await writeCache(GSC_KEY_CACHE, body, 1800);
  return body;
}

async function visits(env) {
  const hit = await readCache(VISITS_KEY);
  if (hit) return hit;
  const now = Date.now(), hour = 3600000;
  // 31 Bangkok days back, whole hours, so the oldest day is complete
  const end = new Date(Math.ceil(now / hour) * hour);
  const start = new Date(end.getTime() - 31 * 24 * hour);
  const week = new Date(end.getTime() - 7 * 24 * hour);
  const fortnight = new Date(end.getTime() - 15 * 24 * hour);
  const hitsP = env.HITS ? hitsSummary(env).catch((e) => ({ pagesErr: String((e && e.message) || e) })) : Promise.resolve({ pagesErr: 'no-binding' });
  const searchP = gscSummary(env).catch((e) => ({ searchErr: String((e && e.message) || e) }));
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: JSON.stringify({ query: VISITS_QUERY, variables: {
      a: CF_ACCOUNT, host: SITE_HOST, s: start.toISOString(), w: week.toISOString(), f: fortnight.toISOString(), e: end.toISOString() } }),
  });
  const d = await res.json();
  if (d.errors && d.errors.length) throw new Error(d.errors.map((e) => e.message).join('; '));
  const acc = d.data && d.data.viewer && d.data.viewer.accounts && d.data.viewer.accounts[0];
  if (!acc) throw new Error('no analytics for this account');
  const rows = (list, key) => (list || []).map((r) => [r.dimensions[key] || '', r.sum.visits, r.count]);
  const body = {
    at: new Date(now).toISOString(),
    hours: rows(acc.hours, 'datetimeHour'),         // [hour (UTC), visits, page views]
    countries: rows(acc.countries, 'countryName'),  // the last 7 days
    referers: rows(acc.referers, 'refererHost'),
    devices: rows(acc.devices, 'deviceType'),
    // [hour (UTC), referring site, visits], only the hours someone arrived
    refDays: (acc.refDays || []).filter((r) => r.sum.visits > 0).map((r) => [r.dimensions.datetimeHour, r.dimensions.refererHost || '', r.sum.visits]),
    ...(await hitsP),
    ...(await searchP),
  };
  await writeCache(VISITS_KEY, body, VISITS_TTL);
  return body;
}

/* Song videos passing a round number of views — every 100,000 to a million,
 * then every million — noticed within minutes instead of whenever GitHub's
 * hourly job gets to run (it is throttled to every few hours). The cron asks
 * the YouTube Data API for every video the site links to (50 a call, about
 * four calls, a unit each), compares with the last round number seen, and
 * keeps what passed in KV. The page reads /yt and lays it over
 * data/youtube.json. Needs the Worker secret YOUTUBE_API_KEY (set by the
 * owner); without it this does nothing and the page has the file alone. */
const YT_VIEWS_KEY = 'https://live.state/yt-views-v1';
const YT_IDS_KEY = 'https://live.state/yt-ids-v1';
const ytMark = (n) => (n < 100000 ? 0 : n < 1000000 ? Math.floor(n / 100000) * 100000 : Math.floor(n / 1000000) * 1000000);
// "2026-10-05T14:23+07:00", the way the nightly script writes it
const bkkMinute = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 16) + '+07:00';

async function ytBase() {
  const hit = await readCache(YT_IDS_KEY);
  if (hit) return hit;
  for (const url of ['https://48thdb.com/data/youtube.json', 'https://raw.githubusercontent.com/framenaldo/48thdb/main/data/youtube.json']) {
    try {
      const r = await fetch(url, { cf: { cacheTtl: 0 } });
      if (!r.ok) continue;
      const d = await r.json();
      const views = {};
      for (const [vid, v] of Object.entries(d.videos || {})) views[vid] = v.views || 0;
      if (!Object.keys(views).length) continue;
      const body = { views };
      await writeCache(YT_IDS_KEY, body, 6 * 3600);
      return body;
    } catch (e) { /* the next copy */ }
  }
  return null;
}

async function ytCheck(env) {
  if (!env.YOUTUBE_API_KEY) return { skipped: 'no-key' };
  const base = await ytBase();
  if (!base) return { skipped: 'no-list' };
  const ids = Object.keys(base.views), views = {};
  for (let i = 0; i < ids.length; i += 50) {
    const q = new URLSearchParams({ part: 'statistics', id: ids.slice(i, i + 50).join(','), key: env.YOUTUBE_API_KEY });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?${q}`);
    if (!r.ok) throw new Error(`YouTube said ${r.status}`);
    for (const it of (await r.json()).items || []) views[it.id] = +((it.statistics || {}).viewCount || 0);
  }
  const now = Date.now();
  const marks = (await env.IAM.get('yt-marks', 'json')) || {};
  const ms = (await env.IAM.get('yt-milestones', 'json')) || {};
  let changed = false;
  for (const [vid, n] of Object.entries(views)) {
    const was = marks[vid] != null ? marks[vid] : ytMark(base.views[vid] || 0);
    if (marks[vid] == null) { marks[vid] = was; changed = true; }
    const mark = ytMark(n);
    if (mark > was) { marks[vid] = mark; ms[vid] = { mark, at: bkkMinute(now) }; changed = true; }
  }
  for (const [vid, m] of Object.entries(ms)) {
    if (now - Date.parse(m.at) > 30 * 86400000) { delete ms[vid]; changed = true; }
  }
  if (changed) {
    await env.IAM.put('yt-marks', JSON.stringify(marks));
    await env.IAM.put('yt-milestones', JSON.stringify(ms));
  }
  const body = { at: new Date(now).toISOString(), views, milestones: ms };
  // the Cache API is per data centre, so the counts also go to KV — every
  // quarter hour, to stay well inside the free plan's 1,000 writes a day
  if (Math.floor(now / 300000) % 3 === 0) await env.IAM.put('yt-views', JSON.stringify({ at: body.at, views }));
  await writeCache(YT_VIEWS_KEY, body, 600);
  return { videos: Object.keys(views).length };
}

async function ytRecent(env) {
  const hit = await readCache(YT_VIEWS_KEY);
  if (hit) return hit;
  // a data centre the cron has not run in reads KV, then keeps it a minute
  const [ms, v] = await Promise.all([env.IAM.get('yt-milestones', 'json'), env.IAM.get('yt-views', 'json')]);
  const body = { at: (v && v.at) || null, views: (v && v.views) || {}, milestones: ms || {} };
  await writeCache(YT_VIEWS_KEY, body, 60);
  return body;
}

/* Members' biographies in the other language. When the owner saves or
 * approves one, the page sends it here and Workers AI writes it in the other
 * of Thai and English — SEA-LION first, a model made for the languages of
 * South-East Asia, Thai among them. The page's markup (@{…} mentions, #{…}
 * tags, [words](links)) is swapped for numbered placeholders before and put
 * back after, so names and addresses come through untouched and only words
 * are translated; an answer that loses or invents a placeholder is refused.
 * Owner only, like /visits. */
const TR_MODELS = ['@cf/aisingapore/gemma-sea-lion-v4-27b-it', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const TR_MAX = 6000;
const BIO_RE = /@\{([mwe]):([\w.-]+)(?:\|([^{}\n]*))?\}|#\{([^{}|\n]+)(?:\|([^{}\n]*))?\}|\[([^\[\]\n]{1,300})\]\((https?:\/\/[^\s()<>"]+)\)/g;
const trPrompt = (to) => `You translate short fan-written biographies of BNK48 and CGM48 members (Thai idol groups) into ${to === 'en' ? 'English' : 'Thai'}.
Rules:
- Translate the whole text naturally, in the neutral tone of an encyclopedia or a fan database.${to === 'th' ? '\n- Write Thai without polite particles (no ค่ะ, ครับ, นะคะ). A generation is รุ่น (รุ่นที่ 3), a team is ทีม, graduating is จบการศึกษา.' : '\n- A รุ่น is a generation ("3rd generation"), จบการศึกษา is graduating from the group.'}
- Placeholders like <m1/> stand for names of members, songs or events. Keep each one exactly once, where it fits in the translated sentence. Never translate, change or drop them.
- Paired tags like <t2>…</t2> (a hashtag) and <a3>…</a3> (a link) must stay, each exactly once. Translate only the words inside. Inside a <t…> tag write one short tag with no spaces and no # sign${to === 'en' ? ' (CamelCase)' : ''}; leave a name or a word that is already ${to === 'en' ? 'English' : 'Thai'} as it is.
- Keep group names (BNK48, CGM48) and proper nouns as they are usually written in ${to === 'en' ? 'English' : 'Thai'}.
- Keep every number, date and year exactly as written: never move a year to the Buddhist era (2026 stays 2026).
- Keep the line breaks and blank lines.
- Reply with the translation only.`;
function bioToTagged(text) {
  const slots = [null];
  const tagged = text.replace(BIO_RE, (all, k, id, fb, tag, lab, words, href) => {
    const i = slots.length;
    if (k) { slots.push({ kind: 'm', raw: all }); return `<m${i}/>`; }
    if (tag) { slots.push({ kind: 't', key: tag.trim() }); return `<t${i}>${(lab || tag).trim()}</t${i}>`; }
    slots.push({ kind: 'a', href }); return `<a${i}>${words}</a${i}>`;
  });
  return { tagged, slots };
}
function taggedToBio(out, slots) {
  for (let i = 1; i < slots.length; i++) {
    const k = slots[i].kind;
    const n = k === 'm' ? out.split(`<m${i}/>`).length - 1 : (out.match(new RegExp(`<${k}${i}>[\\s\\S]*?</${k}${i}>`, 'g')) || []).length;
    if (n !== 1) return null;
  }
  const rest = out.replace(/<m(\d+)\/>|<([ta])(\d+)>[\s\S]*?<\/\2\3>/g, '');
  if (/<\/?[mta]\d+\/?>/.test(rest)) return null;
  return out
    .replace(/<m(\d+)\/>/g, (a, i) => slots[i].raw)
    .replace(/<t(\d+)>([\s\S]*?)<\/t\1>/g, (a, i, w) => {
      const lab = w.replace(/[\s#{}|]+/g, '');
      return lab && lab !== slots[i].key ? `#{${slots[i].key}|${lab}}` : `#{${slots[i].key}}`;
    })
    .replace(/<a(\d+)>([\s\S]*?)<\/a\1>/g, (a, i, w) => `[${w.replace(/[\[\]\n]/g, '').trim() || slots[i].href}](${slots[i].href})`);
}
async function translateBio(env, text, to) {
  const { tagged, slots } = bioToTagged(text);
  for (const model of TR_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await env.AI.run(model, {
          messages: [{ role: 'system', content: trPrompt(to) }, { role: 'user', content: tagged }],
          max_tokens: 3000, temperature: attempt ? 0 : 0.2,
        });
        let out = String((r && (r.response ?? r.choices?.[0]?.message?.content)) || '');
        out = out.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^```\w*\n?|\n?```$/g, '').trim();
        const back = out && taggedToBio(out, slots);
        if (back) return { text: back.replace(/\n{3,}/g, '\n\n'), model };
      } catch (e) { /* the next try, or the next model */ }
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...JSON_HEADERS, 'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' } });
    }
    if (new URL(request.url).pathname === '/translate') {
      const own = { ...JSON_HEADERS, 'cache-control': 'private, no-store' };
      const say = (body, status) => new Response(JSON.stringify(body), { status, headers: own });
      if (request.method !== 'POST') return say({ error: 'POST only' }, 405);
      try {
        if (!(await isOwner(request, env))) return say({ error: 'owner only' }, 403);
        if (!env.AI) return say({ error: 'no-ai' }, 503);
        const body = await request.json().catch(() => ({}));
        const text = String(body.text || ''), to = body.to;
        if (!text.trim() || text.length > TR_MAX || !['th', 'en'].includes(to)) return say({ error: 'bad request' }, 400);
        const done = await translateBio(env, text, to);
        return done ? say(done, 200) : say({ error: 'translation-failed' }, 502);
      } catch (err) {
        return say({ error: String((err && err.message) || err) }, 502);
      }
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: JSON_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname === '/hit') {
      const p = url.searchParams.get('p') || '', i = url.searchParams.get('i') || '';
      if (env.HITS && p && hitOk(p, 40) && hitOk(i, 80)) env.HITS.writeDataPoint({ blobs: [p, i], indexes: [p] });
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/visits') {
      const own = { ...JSON_HEADERS, 'cache-control': 'private, no-store' };
      try {
        if (!(await isOwner(request, env))) return new Response(JSON.stringify({ error: 'owner only' }), { status: 403, headers: own });
        if (!env.CF_ANALYTICS_TOKEN) return new Response(JSON.stringify({ error: 'no-token' }), { status: 503, headers: own });
        return new Response(JSON.stringify(await visits(env)), { headers: own });
      } catch (err) {
        return new Response(JSON.stringify({ error: String((err && err.message) || err) }), { status: 502, headers: own });
      }
    }
    if (url.pathname === '/yt') {
      try {
        return new Response(JSON.stringify(await ytRecent(env)), { headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=60' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String((err && err.message) || err), milestones: {} }), { status: 502, headers: JSON_HEADERS });
      }
    }
    if (url.pathname === '/stream') {
      const ids = [...new Set((url.searchParams.get('v') || '').split(','))]
        .filter((v) => /^[\w-]{11}$/.test(v)).slice(0, STREAM_MAX);
      const got = ids.length ? await streamStates(ids, env) : { streams: {} };
      const body = { checked: new Date().toISOString(), streams: got.streams };
      if (got.error) body.error = got.error;
      return new Response(JSON.stringify(body),
        { headers: { ...JSON_HEADERS, 'cache-control': `public, max-age=${STREAM_TTL_S / 2}` } });
    }
    if (url.pathname === '/iam') {
      try {
        return new Response(JSON.stringify(await iamRecent(env)), { headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=60' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: String((err && err.message) || err), members: {} }),
          { status: 502, headers: JSON_HEADERS });
      }
    }
    try {
      const yt = await check(url.searchParams.get('force') === 'yt');
      const body = {
        checked: new Date(yt.at).toISOString(),
        youtube: yt.live,
        source: 'worker',
      };
      if (url.searchParams.get('debug')) body.debug = { fresh: yt.fresh, failed: yt.failed || 0 };
      return new Response(JSON.stringify(body), { headers: JSON_HEADERS });
    } catch (err) {
      // The page falls back to the committed file, so say so plainly and stop.
      return new Response(JSON.stringify({ error: String((err && err.message) || err), youtube: [] }),
        { status: 502, headers: JSON_HEADERS });
    }
  },

  /* Every five minutes: a third of the members' iAM48 lists, every song
     video's view count, and in the evening (Thailand) a YouTube answer kept
     warm for the first visitor. */
  async scheduled(event, env, ctx) {
    const at = new Date(event.scheduledTime);
    const h = at.getUTCHours();
    if (h >= 10 && h <= 16) ctx.waitUntil(check(true).catch(() => {}));
    ctx.waitUntil(iamLook(env, Math.floor(event.scheduledTime / 300000) % IAM_SLICES).catch(() => {}));
    ctx.waitUntil(ytCheck(env).catch(() => {}));
  },
};
