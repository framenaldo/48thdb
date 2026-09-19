// Builds the subscribable calendars (calendar*.ics, birthdays.ics) from the
// events and members written in index.html. A phone subscribed to one of these
// picks up every change on its next refresh, so nothing is ever re-imported.
// Run: node scripts/build-calendar.mjs   (the "Calendar feeds" workflow runs it
// whenever index.html changes).
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://framenaldo.github.io/48thdb/';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Pull a top-level `const NAME = [ ... ];` literal out of the page and evaluate it.
function literal(name){
  const start = html.indexOf(`const ${name} = [`);
  if(start < 0) throw new Error(`${name} not found`);
  let i = html.indexOf('[', start), depth = 0, quote = null;
  for(; i < html.length; i++){
    const ch = html[i];
    if(quote){ if(ch === '\\'){ i++; continue; } if(ch === quote) quote = null; continue; }
    if(ch === "'" || ch === '"' || ch === '`'){ quote = ch; continue; }
    if(ch === '[' || ch === '{') depth++;
    if(ch === ']' || ch === '}'){ depth--; if(depth === 0) break; }
  }
  return new Function(`return ${html.slice(html.indexOf('[', start), i + 1)};`)();
}
const EVENTS = literal('SEED_SCHEDULE');
const MEMBERS = [...literal('SEED_MEMBERS'), ...literal('SEED_GRADUATED')];
const GROUP_NAME = { bnk48: 'BNK48', cgm48: 'CGM48' };
const nick = id => (MEMBERS.find(m => m.id === id) || {}).name || id;
const groupOfMember = id => (MEMBERS.find(m => m.id === id) || {}).groupId;
const groupsOf = ev => ev.groups && ev.groups.length ? ev.groups : [...new Set((ev.members || []).map(groupOfMember).filter(Boolean))];

// ---- iCalendar text ----
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line){
  // lines are limited to 75 octets; continuation lines start with a space
  const out = []; let cur = '', bytes = 0;
  for(const ch of line){
    const b = Buffer.byteLength(ch);
    if(bytes + b > (out.length ? 74 : 75)){ out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const ymd = s => s.replace(/-/g, '');
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const days = (a, b) => { const out = []; for(let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
const hm = t => t.replace(':', '') + '00';
const plusHours = (t, h) => { const [H, M] = t.split(':').map(Number); const m = H * 60 + M + h * 60; return `${String(Math.min(23, Math.floor(m / 60))).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// the same rule the site uses: an explicit until, or the latest HH:MM–HH:MM in the event's own lines
function untilOf(ev){
  if(ev.until) return ev.until;
  let last = null;
  for(const line of [...(ev.detail || []), ...(ev.info || [])])
    for(const m of String(line).matchAll(/(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})/g)){
      const t = `${m[3].padStart(2, '0')}:${m[4]}`; if(!last || t > last) last = t; }
  return last && ev.time && last > ev.time ? last : null;
}

function describe(ev, extra){
  const lines = [];
  if(extra) lines.push(extra);
  if(ev.members && ev.members.length && !ev.lineupTba) lines.push('เมมเบอร์: ' + ev.members.map(nick).join(', '));
  if(ev.lineupTba) lines.push('รอประกาศรายชื่อ');
  if(ev.tba) lines.push('รายละเอียดและเวลายังไม่ประกาศ');
  for(const l of [...(ev.detail || []), ...(ev.info || [])]) lines.push('• ' + l);
  lines.push('', SITE + '?e=' + ev.id);
  return lines.join('\n');
}

function vevents(ev){
  const out = [];
  const where = ev.venue || ev.online || '';
  const base = (uid, extra) => [
    `UID:${uid}@48thdb`, `DTSTAMP:${ymd(ev.start)}T000000Z`,
    `SUMMARY:${esc(ev.bar || (ev.part ? `${ev.title} · ${ev.part}` : ev.title))}`,   // the short name the site's calendar uses, when there is one
    where ? `LOCATION:${esc(where)}` : null,
    `DESCRIPTION:${esc(describe(ev, extra))}`,
    `URL:${SITE}?e=${ev.id}`,
  ].filter(Boolean);
  const last = ev.end || ev.start;
  if(ev.slots && ev.slots.length){
    // a rota: one entry per round, with who is on
    ev.slots.forEach((s, i) => out.push([...base(`${ev.id}-${s.date}-${i}`, 'รอบนี้: ' + s.members.map(nick).join(', ')),
      `DTSTART;TZID=Asia/Bangkok:${ymd(s.date)}T${hm(s.time)}`, `DTEND;TZID=Asia/Bangkok:${ymd(s.date)}T${hm(s.until)}`]));
  } else if(ev.time && !ev.period){
    const until = untilOf(ev) || plusHours(ev.time, 2);
    for(const d of days(ev.start, last))
      out.push([...base(`${ev.id}-${d}`), `DTSTART;TZID=Asia/Bangkok:${ymd(d)}T${hm(ev.time)}`, `DTEND;TZID=Asia/Bangkok:${ymd(d)}T${hm(until)}`]);
  } else {
    // a whole-day outing, or a stretch you can buy or vote in all day
    out.push([...base(ev.id), `DTSTART;VALUE=DATE:${ymd(ev.start)}`, `DTEND;VALUE=DATE:${ymd(addDays(last, 1))}`,
      ev.period ? 'TRANSP:TRANSPARENT' : null].filter(Boolean));
  }
  return out;
}

const TZ = ['BEGIN:VTIMEZONE', 'TZID:Asia/Bangkok', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE'];
function calendar(name, desc, entries){
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//48thDb//Calendar//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, `X-WR-CALDESC:${esc(desc)}`, 'X-WR-TIMEZONE:Asia/Bangkok',
    'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H', ...TZ];
  for(const e of entries) lines.push('BEGIN:VEVENT', ...e, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Only the placeholders ("To be announced") are left out. A dated event whose
// details are still coming — the concert, the results — is in, as a whole day.
const all = EVENTS.filter(ev => ev.start && ev.title && !/^to be announced$/i.test(ev.title.trim()));
const feeds = {
  'calendar.ics': ['48thDb · BNK48 & CGM48', 'งานและกิจกรรมทั้งหมดของ BNK48 และ CGM48 จาก 48thDb', all],
  'calendar-bnk48.ics': ['48thDb · BNK48', 'งานและกิจกรรมของ BNK48 จาก 48thDb', all.filter(ev => groupsOf(ev).includes('bnk48'))],
  'calendar-cgm48.ics': ['48thDb · CGM48', 'งานและกิจกรรมของ CGM48 จาก 48thDb', all.filter(ev => groupsOf(ev).includes('cgm48'))],
};
for(const [file, [name, desc, list]] of Object.entries(feeds)){
  writeFileSync(new URL(`../${file}`, import.meta.url), calendar(name, desc, list.flatMap(vevents)));
  console.log(file, list.length, 'events');
}

// birthdays of the current members, every year
const bdays = MEMBERS.filter(m => !m.graduated && m.birthday).map(m => [
  `UID:bday-${m.id}@48thdb`, `DTSTAMP:${ymd(m.birthday)}T000000Z`,
  `SUMMARY:${esc(`🎂 ${m.name} ${GROUP_NAME[m.groupId] || ''}`.trim())}`,
  `DTSTART;VALUE=DATE:${ymd(m.birthday)}`, `DTEND;VALUE=DATE:${ymd(addDays(m.birthday, 1))}`,
  'RRULE:FREQ=YEARLY', 'TRANSP:TRANSPARENT',
  `DESCRIPTION:${esc(`วันเกิด ${m.nameTh || m.name} (${m.name})\n${SITE}?m=${m.id}`)}`, `URL:${SITE}?m=${m.id}`]);
writeFileSync(new URL('../birthdays.ics', import.meta.url), calendar('48thDb · วันเกิดเมมเบอร์', 'วันเกิดของเมมเบอร์ BNK48 และ CGM48 ปัจจุบัน', bdays));
console.log('birthdays.ics', bdays.length, 'members');
