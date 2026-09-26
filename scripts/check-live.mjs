// Is the group actually on air right now? The site's LIVE badge otherwise
// goes by the printed start time, which is wrong the moment a show runs late.
//
// Writes data/live-now.json: what was found and when it was looked for. The
// page reads that file and, where a stream is confirmed, links straight to it.
//
// Two things keep this cheap. A search.list call costs 100 of the 10,000
// daily quota units, so a call is made only inside the hours an event with a
// `stream` is expected — on a day with nothing scheduled the job checks the
// calendar, writes nothing and stops. YouTube refuses plain page requests
// from GitHub's servers, so the API is the only way in from the workflow.
//
// Run: node scripts/check-live.mjs   (needs YOUTUBE_API_KEY; the "Live now"
// workflow has it as a secret). Safe to run by hand.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/live-now.json', ROOT);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const KEY = process.env.YOUTUBE_API_KEY || '';

// The window a stream may turn up in: a show can start early, or run over.
const EARLY_MIN = 45;
const LATE_MIN = 180;

/* The same literal-lifting the calendar build uses: the schedule lives in the
   page, and nothing here needs a second copy of it. */
function literal(name){
  const start = html.indexOf(`const ${name} = [`);
  if(start < 0) throw new Error(`${name} not found`);
  let i = html.indexOf('[', start), depth = 0, quote = null;
  for(; i < html.length; i++){
    const ch = html[i];
    if(quote){ if(ch === '\\'){ i++; continue; } if(ch === quote) quote = null; continue; }
    // comments are prose: an apostrophe in one must not read as the start of a string
    if(ch === '/' && html[i + 1] === '/'){ i = html.indexOf('\n', i); continue; }
    if(ch === '/' && html[i + 1] === '*'){ i = html.indexOf('*/', i) + 1; continue; }
    if(ch === "'" || ch === '"' || ch === '`'){ quote = ch; continue; }
    if(ch === '[' || ch === '{') depth++;
    if(ch === ']' || ch === '}'){ depth--; if(depth === 0) break; }
  }
  return new Function(`return ${html.slice(html.indexOf('[', start), i + 1)};`)();
}

const CHANNELS = {
  cgm48: { id:'UCxk6_F4aXUG6EkVvjFj0Ryg', name:'CGM48 OFFICIAL' },
  bnk48: { id:'UC6-Sq3IlCiNQtAsVHZpDeuw', name:'BNK48 Official' },
};

// Bangkok, where every time in the schedule is written.
const TZ_OFFSET = 7 * 3600000;
const nowBkk = () => new Date(Date.now() + TZ_OFFSET);
const bkkYmd = () => nowBkk().toISOString().slice(0, 10);
/** Minutes since midnight in Bangkok for an HH:MM written in the schedule. */
const hhmm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

function lastDay(ev){ return ev.end || (ev.slots ? ev.slots.map(s => s.date).sort().pop() : ev.start); }
/** The latest HH:MM–HH:MM written into an event, which is when it really ends. */
function untilOf(ev){
  if(ev.until) return ev.until;
  let last = null;
  for(const line of [...(ev.detail || []), ...(ev.info || [])])
    for(const m of String(line).matchAll(/(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})/g)){
      const t = `${m[3].padStart(2, '0')}:${m[4]}`;
      if(!last || t > last) last = t;
    }
  return last;
}

/** Which channels could be on air right now, going by the schedule alone. */
function channelsDue(){
  const today = bkkYmd();
  const mins = nowBkk().getUTCHours() * 60 + nowBkk().getUTCMinutes();
  const due = new Map();
  for(const ev of literal('SEED_SCHEDULE')){
    if(!ev.stream || !ev.time || ev.cancelled) continue;
    if(ev.start > today || lastDay(ev) < today) continue;
    const from = hhmm(ev.time) - EARLY_MIN;
    const to = hhmm(untilOf(ev) || ev.time) + LATE_MIN;
    if(mins < from || mins > to) continue;
    const key = ev.stream.channel || (ev.groups || [])[0];
    const ch = CHANNELS[key];
    if(ch) due.set(ch.id, { ...ch, group:key, eventId:ev.id, eventTitle:ev.title });
  }
  return [...due.values()];
}

async function liveOn(ch){
  const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
    + `&eventType=live&channelId=${ch.id}&maxResults=1&key=${KEY}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`YouTube said ${res.status} for ${ch.name}`);
  const item = ((await res.json()).items || [])[0];
  if(!item) return null;
  return {
    group: ch.group, channel: ch.name, eventId: ch.eventId,
    videoId: item.id.videoId,
    title: item.snippet.title,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    startedAt: item.snippet.publishedAt || null,
  };
}

/* FORCE=cgm48|bnk48|all asks anyway, whatever the schedule says — the manual
   run in the Actions tab uses it to answer "is anything on right now?". */
function forced(){
  const want = (process.env.FORCE || '').trim().toLowerCase();
  if(!want) return [];
  return Object.entries(CHANNELS)
    .filter(([k]) => want === 'all' || want === k)
    .map(([k, ch]) => ({ ...ch, group:k, eventId:null, eventTitle:null }));
}

const due = forced().length ? forced() : channelsDue();
let live = [], checked = true;
if(!due.length){
  console.log('Nothing scheduled to be on air — no call made.');
} else if(!KEY){
  console.log('No YOUTUBE_API_KEY — cannot ask.');
  checked = false;
} else {
  for(const ch of due){
    try{
      const found = await liveOn(ch);
      if(found){ live.push(found); console.log(`LIVE: ${ch.name} — ${found.title}`); }
      else console.log(`not live: ${ch.name}`);
    }catch(err){
      // A refusal must not be read as "the stream ended".
      checked = false;
      console.log(String(err.message || err));
    }
  }
}

// When the ask failed, yesterday's answer is better than a wrong "not live".
let before = null;
try{ before = JSON.parse(readFileSync(OUT, 'utf8')); }catch(e){}
if(!checked && before && (before.live || []).length){
  console.log('Keeping the last answer — this round could not be checked.');
  process.exit(0);
}
const next = { checked: new Date().toISOString(), live };
const same = before && JSON.stringify(before.live || []) === JSON.stringify(live);
// A rewrite with the same answer is only a new timestamp; leave the file be so
// the workflow has nothing to commit and the site is not rebuilt for nothing.
if(same){ console.log('No change.'); process.exit(0); }
writeFileSync(OUT, JSON.stringify(next, null, 2) + '\n');
console.log(`Wrote data/live-now.json — ${live.length} live`);
