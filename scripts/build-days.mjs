// Writes data/days.json: what is on each day, for the morning summary on the
// home page (สรุปวันนี้). The Worker at api.48thdb.com reads it every morning,
// adds what only it knows (the night's iAM48 posts) and has Workers AI put it
// into a few sentences. It cannot read index.html itself, so this does it here.
// Run: node scripts/build-days.mjs   (the "Calendar feeds" workflow runs it
// whenever index.html changes, beside build-calendar.mjs).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Pull a top-level `const NAME = [ ... ];` literal out of the page and evaluate
// it (the same reader as build-calendar.mjs).
function literal(name){
  const start = html.indexOf(`const ${name} = [`);
  if(start < 0) throw new Error(`${name} not found`);
  let i = html.indexOf('[', start), depth = 0, quote = null;
  for(; i < html.length; i++){
    const ch = html[i];
    if(quote){ if(ch === '\\'){ i++; continue; } if(ch === quote) quote = null; continue; }
    if(ch === '/' && html[i + 1] === '/'){ i = html.indexOf('\n', i); continue; }
    if(ch === '/' && html[i + 1] === '*'){ i = html.indexOf('*/', i) + 1; continue; }
    if(ch === "'" || ch === '"' || ch === '`'){ quote = ch; continue; }
    if(ch === '[' || ch === '{') depth++;
    if(ch === ']' || ch === '}'){ depth--; if(depth === 0) break; }
  }
  return new Function(`return ${html.slice(html.indexOf('[', start), i + 1)};`)();
}
const EVENTS = literal('SEED_SCHEDULE');
const MEMBERS = literal('SEED_MEMBERS');            // the current members; graduates are SEED_GRADUATED
const byId = new Map(MEMBERS.map(m => [m.id, m]));
const GROUPS = ['bnk48', 'cgm48'];

const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const span = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
const thaiToday = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
const FROM = addDays(thaiToday, -2), TO = addDays(thaiToday, 150);

// the page's rule: every current member of a group (or of both) is named as such, not listed
function whole(ids){
  const set = new Set(ids);
  const groups = GROUPS.filter(g => { const gm = MEMBERS.filter(m => m.groupId === g); return gm.length && gm.every(m => set.has(m.id)); });
  return groups.length === GROUPS.length ? 'all' : groups[0] || null;
}
// "17 ต.ค." in memberDays → 2026-10-17, for the year the event runs
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function dayOf(label, year){
  const m = String(label).match(/(\d{1,2})\s*([ก-๙.]+)/);
  const mi = m ? TH_MONTHS.indexOf(m[2]) : -1;
  return mi < 0 ? null : `${year}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
// who is on that day: the day's line-up, the members named for it, a rota's slots, or everyone on the event
function whoOn(ev, day){
  if(ev.lineup && ev.lineup[day]) return [...new Set(Object.values(ev.lineup[day]).flat())];
  if(ev.slots) return [...new Set(ev.slots.filter(s => s.date === day).flatMap(s => s.members || []))];
  const ids = ev.members || [];
  if(ev.memberDays) return ids.filter(id => !ev.memberDays[id] || dayOf(ev.memberDays[id], day.slice(0, 4)) === day);
  return ids;
}

// the page's eventShortName: its short:, else the title without the groups and the release in front
const shortName = e => e.short || String(e.title || '').replace(/^(BNK48 & CGM48|BNK48|CGM48)\s+/, '')
  .replace(/^(\d+(st|nd|rd|th)\s+)?(Special\s+)?(Single|Album)\s+["“][^"”]+["”]\s+/i, '') || e.title || '';
// "LG FLOOR - CARIBBEAN VILLAGE, TERMINAL21 RAMA3, Bangkok" → the place people know it by, and the city
const CITY = /^(bangkok|chiang ?mai|กรุงเทพฯ?|เชียงใหม่|thailand|ประเทศไทย)$/i;
function placeOf(venue){
  const segs = String(venue).split(/\s*,\s*/).filter(Boolean);
  const city = segs.length > 1 && CITY.test(segs[segs.length - 1]) ? segs.pop() : '';
  return [segs[segs.length - 1] || '', city];
}

const days = {};
const dayRow = d => (days[d] = days[d] || { ev: [], bd: [] });
for(const ev of EVENTS){
  const last = ev.end || ev.start;
  if(!ev.start || last < FROM || ev.start > TO) continue;
  const n = span(ev.start, last);
  for(let d = ev.start < FROM ? FROM : ev.start; d <= last && d <= TO; d = addDays(d, 1)){
    const k = span(ev.start, d);
    // a run of weeks (ticket sales, voting) is news on its first and last day only
    if(n > 7 && k !== 1 && k !== n) continue;
    const slot = ev.slots ? ev.slots.filter(s => s.date === d) : null;
    if(slot && !slot.length) continue;                       // a rota's day off
    const ids = ev.allMembers ? MEMBERS.map(m => m.id) : whoOn(ev, d);
    const on = ev.allMembers ? 'all' : whole(ids);
    const rest = on === 'all' ? [] : on ? ids.filter(id => (byId.get(id) || {}).groupId !== on) : ids;
    const row = { id: ev.id, t: ev.title, n: shortName(ev) };
    const time = slot ? slot[0].time : ev.time, until = slot ? slot[slot.length - 1].until : ev.until;
    if(time) row.time = time;
    if(until) row.until = until;
    if(ev.venue){ const [p, c] = placeOf(ev.venue); row.p = p; if(c) row.c = c; } else if(ev.online) row.online = 1;
    if(on) row.on = on;
    if(rest.length) row.m = rest;
    if(ev.lineupTba) row.tba = 1;
    if(n > 1) row.d = [k, n];
    if(ev.cancelled) row.x = 1;
    dayRow(d).ev.push(row);
  }
}
for(const d of Object.keys(days)) days[d].ev.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
// birthdays of the current members, with the age they turn
for(let d = FROM; d <= TO; d = addDays(d, 1))
  for(const m of MEMBERS) if(m.birthday && m.birthday.slice(5) === d.slice(5)){
    dayRow(d).bd.push([m.id, +d.slice(0, 4) - +m.birthday.slice(0, 4)]); }
for(const d of Object.keys(days)) if(!days[d].ev.length && !days[d].bd.length) delete days[d];

const evById = id => EVENTS.find(e => e.id === id) || {};
const out = {
  from: FROM, to: TO,
  // the night the GE results are read out, and the concert the same day
  ge: { results: evById('ev-election-results').start || null, concert: evById('ev-concert-2026').start || null },
  // [English name, Thai name, group] for every current member: the days name some of them, and the
  // Worker checks a summary names nobody in words (only as tokens the page links)
  names: Object.fromEntries(MEMBERS.map(m => [m.id, [m.name || m.id, m.nameTh || m.name || m.id, m.groupId || '']])),
  days: Object.fromEntries(Object.keys(days).sort().map(d => [d, days[d]])),
};
writeFileSync(new URL('../data/days.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`data/days.json: ${Object.keys(out.days).length} days from ${FROM} to ${TO}`);
