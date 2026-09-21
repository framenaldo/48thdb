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

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...JSON_HEADERS, 'access-control-max-age': '86400' } });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: JSON_HEADERS });
    }
    const url = new URL(request.url);
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

  /* A cron keeps an answer warm for the first visitor of the evening. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(check(true).catch(() => {}));
  },
};
