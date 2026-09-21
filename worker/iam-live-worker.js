/* Who is live right now — on iAM48, and on the groups' YouTube channels.
 *
 * The site cannot ask either host itself: app.bnk48.com sends no CORS header,
 * so a visitor's browser is turned away, and youtube.com the same. The GitHub
 * jobs work around it by committing data/iam-live.json and data/live-now.json,
 * but GitHub's cron is best-effort and in practice fires a few percent of the
 * time it is asked to — a live that lasts twenty minutes is over long before a
 * badge appears.
 *
 * This Worker sits in the middle instead: it asks, adds the CORS header, and
 * answers in a second or two. The page polls it directly and falls back to the
 * committed files whenever it cannot be reached.
 *
 * Deploy: see worker/README.md.
 */

const SITE = 'https://framenaldo.github.io/48thdb';
const APP = 'https://app.bnk48.com';

/* A channel's /live page says plainly whether it is carrying a stream, which
 * costs no API quota at all — unlike search.list, at 100 of the 10,000 daily
 * units a call. (The GitHub job has to use the API: YouTube turns away plain
 * page requests from GitHub's runners. Cloudflare's are not GitHub's, and if
 * YouTube ever refuses these too the page still has the committed file.) */
const YT_CHANNELS = {
  cgm48: { handle: 'CGM48OFFICIAL', name: 'CGM48 OFFICIAL' },
  bnk48: { handle: 'bnk48official', name: 'BNK48 Official' },
};
const YT_KEY = 'https://iam-live.state/youtube-v1';
const YT_TTL_MS = 60000;              // one look per channel per minute, shared by everyone

/* The free plan allows 50 subrequests per invocation and there are 58 members,
 * so a single pass cannot reach everyone. Each invocation checks one slice and
 * merges it with what the last ones found; with the slices taking turns every
 * bucket, every member is asked about roughly once a minute. */
const PER_RUN = 24;
const BUCKET_MS = 20000;

/* A member found live stops being reported if nobody has managed to confirm it
 * for this long — better a badge that disappears than one stuck on all night. */
const CLAIM_TTL_MS = 6 * 60 * 1000;

const ROSTER_TTL_S = 6 * 3600;
const ROSTER_KEY = 'https://iam-live.state/roster-v1';
const STATE_KEY = 'https://iam-live.state/members-v1';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  // browsers may reuse an answer this old; the page polls more often than this
  'cache-control': 'public, max-age=15',
};

/* Cache API entries are not subrequests, so state costs nothing against the
 * budget. They are per-colocation, which is fine: a colo that has not seen a
 * member yet simply asks about them on its next turn. */
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

/* The member ids come from the site's own data/lives.json, which the nightly
 * job rebuilds — so a new member needs no change here. */
async function roster() {
  const cached = await readCache(ROSTER_KEY);
  if (cached && cached.length) return cached;
  const res = await fetch(`${SITE}/data/lives.json`, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error(`roster: site said ${res.status}`);
  const data = await res.json();
  const list = Object.entries(data.members || {})
    .filter(([, m]) => m && m.iam)
    .map(([id, m]) => ({ id, iam: m.iam }))
    .sort((a, b) => a.iam - b.iam);          // a stable order, so slices are stable
  if (!list.length) throw new Error('roster: no members');
  await writeCache(ROSTER_KEY, list, ROSTER_TTL_S);
  return list;
}

/** The member's newest catch-up entry: ~400 bytes, and it says whether it is live. */
async function newest(member) {
  const url = `${APP}/member/${member.iam}/videocontent?skip=0&take=1`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (48thDb live badge; github.com/framenaldo/48thdb)',
      'accept': 'application/json',
    },
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`iAM48 said ${res.status}`);
  const rows = await res.json();
  return rows && rows[0] ? rows[0] : null;
}

function entryOf(member, row, now) {
  const v = (row && row.videoContent) || {};
  if (!v.isLive) return { id: member.id, iam: member.iam, live: false, at: now };
  return {
    id: member.id, iam: member.iam, live: true, at: now,
    since: v.publishedAt || null,
    caption: String(v.content || '').trim().slice(0, 120),
    url: row.url ? APP + row.url : `${APP}/member/${member.iam}`,
  };
}

/* Is this channel carrying a stream right now? The live page only names a
   video and says "isLiveNow" while one is actually on air. */
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

/* Both channels, at most once a minute between them however many people ask. */
async function youtubeNow(now, force) {
  const cached = (await readCache(YT_KEY)) || { at: 0, live: [] };
  if (!force && now - cached.at < YT_TTL_MS) return { live: cached.live, fresh: false };
  const found = [];
  for (const key of Object.keys(YT_CHANNELS)) {
    try {
      const l = await youtubeLive(key);
      if (l) found.push(l);
    } catch (e) {
      // keep whatever was last known for that channel rather than denying it
      const before = cached.live.find((x) => x.group === key);
      if (before && now - cached.at < 5 * 60 * 1000) found.push(before);
    }
  }
  await writeCache(YT_KEY, { at: now, live: found }, 300);
  return { live: found, fresh: true };
}

async function check(request) {
  const url = new URL(request.url);
  const now = Date.now();
  const list = await roster();

  // Which slice this invocation is responsible for.
  const slices = Math.max(1, Math.ceil(list.length / PER_RUN));
  const forced = url.searchParams.get('slice');
  const slice = forced !== null
    ? (Math.abs(parseInt(forced, 10) || 0) % slices)
    : Math.floor(now / BUCKET_MS) % slices;
  const size = Math.ceil(list.length / slices);
  const mine = list.slice(slice * size, slice * size + size);

  const state = (await readCache(STATE_KEY)) || {};
  const answers = await Promise.all(mine.map(async (m) => {
    try { return entryOf(m, await newest(m), now); }
    // A refusal is not an answer: leave whatever was known about them standing.
    catch (e) { return { id: m.id, error: String(e.message || e) }; }
  }));

  let asked = 0, failed = 0;
  for (const a of answers) {
    if (a.error) { failed++; continue; }
    asked++;
    state[a.id] = a;
  }
  await writeCache(STATE_KEY, state, 3600);

  const live = Object.values(state)
    .filter((m) => m.live && now - m.at < CLAIM_TTL_MS)
    .map(({ id, iam, since, caption, url: link }) => ({
      id, iam, at: since, caption: caption || '', url: link,
    }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const yt = await youtubeNow(now, url.searchParams.get('force') === 'yt');

  const body = {
    checked: new Date(now).toISOString(),
    live,
    youtube: yt.live,
    source: 'worker',
    // how much of the roster the answer actually rests on
    known: Object.values(state).filter((m) => now - m.at < CLAIM_TTL_MS).length,
    members: list.length,
  };
  if (url.searchParams.get('debug')) {
    body.debug = { slice, slices, asked, failed, ytFresh: yt.fresh, sliceIds: mine.map((m) => m.id) };
  }
  return body;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...JSON_HEADERS, 'access-control-max-age': '86400' } });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: JSON_HEADERS });
    }
    try {
      const body = await check(request);
      return new Response(JSON.stringify(body), { headers: JSON_HEADERS });
    } catch (err) {
      // The page falls back to the committed file, so say so plainly and stop.
      return new Response(JSON.stringify({ error: String(err && err.message || err), live: [] }),
        { status: 502, headers: JSON_HEADERS });
    }
  },

  /* A cron trigger keeps the slices turning even when nobody is on the site, so
   * the first visitor of the evening gets a warm answer rather than a third of
   * one. Optional: the Worker is correct without it. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(check(new Request('https://iam-live.internal/')).catch(() => {}));
  },
};
