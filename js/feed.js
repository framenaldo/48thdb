// ============================== FEED ==============================

function todayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function toYmd(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
    + '-' + String(d.getDate()).padStart(2,'0');
}

/* Days until the next occurrence, so December birthdays surface in January.
   The feed and the stats page must agree, so they share this. */
function daysUntilBirthday(m, today){
  const [, mo, d] = m.birthday.split('-').map(Number);
  let next = new Date(today.getFullYear(), mo-1, d);
  if(next < today) next = new Date(today.getFullYear()+1, mo-1, d);
  return Math.round((next - today)/86400000);
}

function eventLastDay(ev){ return ev.end || ev.start; }

/* "28-30 ส.ค." for a run, "5 ก.ย." for a single day. */
function eventDateLabel(ev){
  const M = monthsShort();
  const [, m1, d1] = ev.start.split('-').map(Number);
  if(!ev.end) return d1 + ' ' + M[m1-1];
  const [, m2, d2] = ev.end.split('-').map(Number);
  return m1===m2 ? d1 + '-' + d2 + ' ' + M[m1-1]
                 : d1 + ' ' + M[m1-1] + ' - ' + d2 + ' ' + M[m2-1];
}

/* Everything that says "today" or "in N days" is worked out once, when the
   screen is drawn. Left open overnight the app keeps yesterday's answer: the
   birthdays of the new day never arrive, and a run that has started still reads
   as upcoming. A ticker notices the date has turned and redraws — and on the way
   past, moves the hours-and-minutes countdown on whatever is on today. */
let _drawnDay = null;

function startsInLabel(ms){
  const mins = Math.floor(ms / 60000);
  if(mins >= 60){
    const h = Math.floor(mins / 60), m = mins % 60;
    return `เริ่มใน ${h} ชม.` + (m ? ` ${m} นาที` : '');
  }
  return `เริ่มใน ${Math.max(1, mins)} นาที`;
}

/** Today's start time for an event running today and carrying a time. A run
    over several days repeats its time each day — the roadshow is the same
    programme on both dates — so every day of it counts down, not only the first. */
/* Rotas. A slot is { date, time, until, members }. */
const slotsOn = (ev, iso) => (ev.slots || []).filter(s => s.date === iso)
  .sort((a, b) => a.time.localeCompare(b.time));
const slotsFor = (ev, id) => (ev.slots || []).filter(s => s.members.includes(id))
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const slotTime = (iso, hhmm) => { const d = parseYmd(iso); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m || 0, 0, 0); return d.getTime(); };

/** Today's slots and where the clock is among them: the one on now, the next
    one to start, or null for both once the day's last has ended. */
function slotNow(ev, iso){
  const today = slotsOn(ev, iso);
  const now = Date.now();
  return {
    today,
    current: today.find(s => slotTime(iso, s.time) <= now && now < slotTime(iso, s.until)) || null,
    next: today.find(s => slotTime(iso, s.time) > now) || null,
  };
}

/* When today's part of an event is over. A rota ends with its last turn of
   the day; an event can say `until:'HH:MM'`; one with only a start time is
   taken to run two hours; one with no time at all runs all day (null). */
const DEFAULT_RUN_MS = 2 * 3600000;
function endsAtToday(ev, iso){
  if(ev.slots){
    const today = slotsOn(ev, iso);
    return today.length ? slotTime(iso, today[today.length - 1].until) : slotTime(iso, '00:00');
  }
  if(ev.until) return slotTime(iso, ev.until);
  if(ev.time) return slotTime(iso, ev.time) + DEFAULT_RUN_MS;
  return null;
}
const doneForToday = (ev, iso) => { const end = endsAtToday(ev, iso); return end != null && end <= Date.now(); };

function startsAt(ev, todayIso){
  if(ev.slots){
    const { next } = slotNow(ev, todayIso);
    return next ? slotTime(todayIso, next.time) : null;
  }
  if(!ev.time || ev.start > todayIso || eventLastDay(ev) < todayIso) return null;
  const [hh, mm] = ev.time.split(':').map(Number);
  if(!Number.isFinite(hh)) return null;
  const d = parseYmd(todayIso);
  d.setHours(hh, mm || 0, 0, 0);
  return d.getTime();
}

/** The same words whether the screen was just drawn or the clock just ticked. */
function startsLabel(at){
  const left = at - Date.now();
  return left > 0 ? startsInLabel(left) : 'เริ่มแล้ว';
}

let _feedLiveKey = null;
function tickClock(){
  syncTicker();
  document.querySelectorAll('[data-starts-at]').forEach(el=>{
    el.textContent = startsLabel(Number(el.dataset.startsAt));
    localize(el.parentElement || el);
  });

  const now = toYmd(new Date());
  if(state.view === 'feed' && !state.query && !state.selectedId && !state.selectedEvent && !state.posterOf) {
    const iso = toYmd(todayStart());
    const live = allEvents().filter(e => (!filteringByOshi() || hasMyOshi(e)) && !e.period
      && e.start <= iso && eventLastDay(e) >= iso && !doneForToday(e, iso)).sort((a,b) => a.start.localeCompare(b.start)).map(e => e.id).join(',');
    if(_feedLiveKey !== null && live !== _feedLiveKey){ renderMain(); return; }
  }
  if(!_drawnDay || now === _drawnDay) return;
  // Redrawing under someone loses their place, so the date is left unturned
  // until they have nothing open — the next tick finds it again.
  if(state.selectedId || state.selectedEvent || state.posterOf || state.comparePicking) return;
  if(document.activeElement && document.activeElement.tagName === 'INPUT') return;
  render();
}

function startClock(){
  setInterval(tickClock, 20000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') tickClock();
  });
}

function eventWhenLabel(ev, todayIso){
  const last = eventLastDay(ev);
  if(ev.start <= todayIso && last >= todayIso){
    if(!ev.period) return 'วันนี้';
    const left = Math.round((parseYmd(last) - parseYmd(todayIso)) / 86400000);
    return left === 0 ? 'วันสุดท้าย' : `เหลือ ${left} วัน`;
  }
  const days = Math.round((parseYmd(ev.start) - parseYmd(todayIso)) / 86400000);
  if(days === 1) return 'พรุ่งนี้';
  if(days > 1) return 'อีก ' + days + ' วัน';
  return '';
}
function parseYmd(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }

function renderEventCard(ev, todayIso){
  const runsToday = ev.start <= todayIso && eventLastDay(ev) >= todayIso;
  const over = runsToday && !ev.period && doneForToday(ev, todayIso);
  const when = over ? 'จบแล้ว' : eventWhenLabel(ev, todayIso);
  const isNow = runsToday && !over;
  // a rota on the day it ran: the people who were there, not the whole run
  const ids = over && ev.slots ? [...new Set(slotsOn(ev, todayIso).flatMap(s => s.members))] : (ev.members || []);
  const people = ids.map(getMember).filter(Boolean);
  const mine = people.filter(m => state.oshi.includes(m.id));
  const groupTags = (ev.groups || []).map(getGroup).filter(Boolean);
  const accent = ev.poster ? ev.poster.accent
    : groupTags.length === 1 ? groupTags[0].color
    : (people.length ? getGroup(people[0].groupId).color : 'var(--ink-soft)');
  const theme = ev.poster ? `; --pc:${ev.poster.accent}; --sheet-bg:${ev.poster.surface}; --sheet-ink:${ev.poster.ink}` : '';
  const hasMore = eventHasMore(ev);
  const shown = people.slice(0, 6);
  const rest = people.length - shown.length;
  return `
  <article class="ev-card${isNow?' is-now':''}${hasMore?' is-openable':''}${ev.poster?' is-themed':''}" style="--c:${accent}${theme}"
    ${hasMore ? `data-action="open-event" data-id="${ev.id}"` : ''}>
    <div class="ev-date">
      <span class="ev-d">${eventDateLabel(ev)}</span>
      ${ev.time ? `<span class="ev-time">${ev.time}</span>` : ''}
      ${when ? `<span class="ev-when">${when}</span>` : ''}
    </div>
    <div class="ev-body">
      ${(()=>{ const at = over ? null : startsAt(ev, todayIso);
        return at ? `<span class="ev-starts" data-starts-at="${at}">${startsLabel(at)}</span>` : ''; })()}
      <h3 class="ev-title">${ev.tag==='media'?'<span class="ev-tag">Media</span>':''}${escapeHtml(ev.title)}</h3>
      ${ev.venue ? `<p class="ev-venue">${escapeHtml(ev.venue)}</p>` : ''}
      ${groupTags.length ? `<div class="ev-groups">${groupTags.map(g=>
        groupTag(g)).join('')}</div>` : ''}
      ${ev.lineupTba ? `<p class="ev-tba">รอประกาศรายชื่อ</p>` : ''}
      ${shown.length ? `<div class="ev-people">${shown.map(m=>{
        const g = getGroup(m.groupId);
        return `<button class="ev-person${state.oshi.includes(m.id)?' is-oshi':''}" style="--c:${g.color}"
          data-action="open-member" data-id="${m.id}" title="${escapeAttr(m.name)}">
          ${renderAvatar(m,'avatar-sm',g.color)}<span>${escapeHtml(m.nameTh||m.name)}</span>
        </button>`; }).join('')}${rest>0?`<span class="ev-more-people">+${rest}</span>`:''}</div>` : ''}
      ${mine.length ? `<p class="ev-mine">มีโอชิของคุณ ${mine.length} คน</p>` : ''}
      ${hasMore ? `<p class="ev-open">ดูรายละเอียด</p>` : ''}
    </div>
  </article>`;
}

/* Today's events, as the first thing under the date: the whole poster where
   there is one, a band in the event's colour where there is not. Posters keep
   their own shape — the image sits whole over a blurred copy of itself rather
   than being cropped to fit a box. */
function renderTodayHero(ev, todayIso){
  // A rota shows only who is on today, and today's hours.
  const rota = ev.slots ? slotNow(ev, todayIso) : null;
  const people = (rota ? [...new Set(rota.today.flatMap(s => s.members))] : (ev.members || []))
    .map(getMember).filter(Boolean);
  const groupTags = (ev.groups || []).map(getGroup).filter(Boolean);
  const accent = (ev.poster && ev.poster.accent)
    || (groupTags.length === 1 ? groupTags[0].color
    : (people.length ? getGroup(people[0].groupId).color : 'var(--accent)'));
  const img = ev.poster && ev.poster.img;
  const at = startsAt(ev, todayIso);
  const dayOf = ev.end ? Math.round((parseYmd(todayIso) - parseYmd(ev.start)) / 86400000) + 1 : 0;
  const days = ev.end ? Math.round((parseYmd(ev.end) - parseYmd(ev.start)) / 86400000) + 1 : 0;
  const status = rota && rota.current ? 'อยู่ที่บูธตอนนี้'
    : at ? `<span data-starts-at="${at}">${startsLabel(at)}</span>`
    : rota && rota.today.length ? 'รอบวันนี้จบแล้ว'
    : (ev.time ? 'กำลังจัดอยู่' : 'วันนี้');
  const hours = rota ? rota.today.map(s => `${s.time}–${s.until}`).join(', ') : (ev.time || '');
  const shown = people.slice(0, 8);
  const rest = people.length - shown.length;
  const open = eventHasMore(ev);
  return `
  <article class="today-hero${open ? ' is-openable' : ''}${ev.poster ? ' is-themed' : ''}" style="--c:${accent}${ev.poster ? `; --pc:${ev.poster.accent}; --sheet-bg:${ev.poster.surface}; --sheet-ink:${ev.poster.ink}` : ''}"
    ${open ? `data-action="open-event" data-id="${ev.id}"` : ''}>
    <div class="today-hero-body">
      <p class="today-hero-status"><span class="today-live" aria-hidden="true"></span>${status}${days > 1 ? ` · วันที่ ${dayOf} จาก ${days}` : ''}</p>
      <h3 class="today-hero-title">${escapeHtml(ev.title)}</h3>
      <p class="today-hero-meta">${hours ? `${hours} น.` : ''}${hours && ev.venue ? ' · ' : ''}${ev.venue ? escapeHtml(ev.venue) : ''}</p>
    </div>
    ${img ? `<div class="today-hero-art" style="--art:url('${escapeAttr(cssUrl(img))}')">
      <img src="${escapeAttr(img)}"${ev.poster.w ? ` width="${ev.poster.w}" height="${ev.poster.h}"` : ''} alt="โปสเตอร์งาน ${escapeAttr(ev.title)}" decoding="async">
    </div>` : (ev.theme === 'birthday' ? `<div class="today-hero-band">${renderBirthdayBanner(ev)}</div>` : '')}
    <div class="today-hero-body today-hero-foot">
      ${groupTags.length ? `<div class="ev-groups">${groupTags.map(g => groupTag(g)).join('')}</div>` : ''}
      ${shown.length ? `<div class="ev-people">${shown.map(m => {
        const g = getGroup(m.groupId);
        return `<button class="ev-person${state.oshi.includes(m.id)?' is-oshi':''}" style="--c:${g.color}"
          data-action="open-member" data-id="${m.id}" title="${escapeAttr(m.name)}">
          ${renderAvatar(m,'avatar-sm',g.color)}<span>${escapeHtml(m.nameTh||m.name)}</span>
        </button>`; }).join('')}${rest > 0 ? `<span class="ev-more-people">+${rest}</span>` : ''}</div>` : ''}
      ${open ? `<p class="today-hero-open">ดูรายละเอียด</p>` : ''}
    </div>
  </article>`;
}

/* Anything with a line-up or a write-up opens; the "to be announced"
   placeholders have nothing behind them yet, so they stay flat rather than
   leading to an empty sheet. */
function eventHasMore(ev){
  return !!(ev.info || ev.detail || (ev.members || []).length);
}


/* A birthday fanmeet gets a party header rather than the plain sheet: the
   celebrants' own portraits under hand-lettering, with the confetti drawn in
   CSS so it costs nothing to ship. */
function renderBirthdayBanner(ev){
  const faces = (ev.celebrants || []).map(getMember).filter(Boolean);
  if(!faces.length) return '';
  const confetti = [
    [6,14,-18],[17,52,24],[29,9,42],[41,64,-9],[52,20,15],
    [63,58,-33],[74,12,8],[85,46,29],[93,24,-14],[36,34,50],[58,38,-22],[81,66,12]
  ].map(([x,y,r],i)=>
    `<i class="cfi cfi${i%5}" style="left:${x}%;top:${y}%;transform:rotate(${r}deg)"></i>`).join('');
  return `
  <div class="evm-fest" aria-hidden="false">
    <span class="evm-fest-deco" aria-hidden="true">${confetti}</span>
    <span class="evm-fest-word">Birthday</span>
    <span class="evm-fest-sub">FANMEET</span>
    <span class="evm-fest-faces">${faces.map(m=>{
      const g = getGroup(m.groupId);
      return `<button class="evm-fest-face" style="--c:${g.color}" data-action="open-member" data-id="${m.id}"
        title="${escapeAttr(m.name)}">${renderAvatar(m,'evm-face-img',g.color)}
        <span class="evm-fest-name">${escapeHtml(m.nameTh||m.name)}</span></button>`;
    }).join('')}</span>
  </div>`;
}

/** Who is at the booth when: one row per slot, today's picked out, finished
    ones dimmed. Tapping a name opens that member. */
function renderSlotTable(ev){
  const iso = toYmd(todayStart());
  const now = Date.now();
  const M = monthsShort();
  const rows = ev.slots.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(s => {
    const [, mo, d] = s.date.split('-').map(Number);
    const done = slotTime(s.date, s.until) <= now;
    const on = !done && slotTime(s.date, s.time) <= now;
    const who = s.members.map(getMember).filter(Boolean).map(m => {
      const g = getGroup(m.groupId);
      return `<button class="ev-person${state.oshi.includes(m.id)?' is-oshi':''}" style="--c:${g.color}"
        data-action="open-member" data-id="${m.id}">${renderAvatar(m,'avatar-sm',g.color)}<span>${escapeHtml(m.nameTh||m.name)}</span></button>`;
    }).join('');
    return `<div class="slot-row${s.date === iso ? ' is-today' : ''}${done ? ' is-done' : ''}${on ? ' is-on' : ''}">
      <div class="slot-when"><span class="slot-date">${d} ${M[mo-1]}</span><span class="slot-time">${s.time}–${s.until}</span>
        ${on ? '<span class="slot-now">ตอนนี้</span>' : s.date === iso && !done ? '<span class="slot-now">วันนี้</span>' : ''}</div>
      <div class="slot-who">${who}</div>
    </div>`;
  }).join('');
  return `<h3 class="evm-head">ตารางสมาชิกประจำบูธ</h3><div class="slot-table">${rows}</div>`;
}

function renderEventModal(){
  const ev = getEvent(state.selectedEvent);
  if(!ev) return '';
  const people = (ev.members || []).map(getMember).filter(Boolean);
  const groupTags = (ev.groups || []).map(getGroup).filter(Boolean);
  // A poster's own accent takes the sheet over from the group colour, so the
  // headings and the date pill belong to the same design as the band above them.
  const accent = ev.poster ? ev.poster.accent
    : groupTags.length === 1 ? groupTags[0].color
    : (people.length ? getGroup(people[0].groupId).color : 'var(--ink-soft)');
  const mine = people.filter(m => state.oshi.includes(m.id));
  return `
  <div class="modal-backdrop" data-action="close-modal">
    <div class="modal-glass-card is-wide is-event-sheet${ev.poster?' is-postered':''}${ev.poster&&ev.poster.img?' has-poster-img':''}" data-stop-close="1" style="--c:${accent}${ev.poster?`; --pc:${ev.poster.accent}; --sheet-bg:${ev.poster.surface}; --sheet-ink:${ev.poster.ink}`:''}">
      <button class="modal-share-btn" data-action="share" title="คัดลอกลิงก์" aria-label="คัดลอกลิงก์">${ICONS.link}</button>
      ${state.isAdmin ? `<button class="modal-edit-btn" data-action="edit-event" data-id="${escapeAttr(ev.id)}"
        title="แก้ไขงานนี้" aria-label="แก้ไขงานนี้">แก้ไข</button>` : ''}
      <button class="modal-close-btn" data-action="close-modal" title="ปิด" aria-label="ปิด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="modal-scroll">
        <div class="evm-layout${(ev.poster && ev.poster.img) || ev.theme==='birthday' ? ' has-media' : ''}">
        <div class="evm-media">
        ${ev.theme==='birthday' ? renderBirthdayBanner(ev) : ''}
        ${ev.poster && ev.poster.img ? `<button class="evm-poster-btn" data-action="open-poster" data-id="${ev.id}"
          title="ดูโปสเตอร์เต็ม" aria-label="ดูโปสเตอร์เต็ม">
          <img class="evm-poster" src="${escapeAttr(ev.poster.img)}"${ev.poster.w ? ` width="${ev.poster.w}" height="${ev.poster.h}"` : ''}
            alt="โปสเตอร์งาน ${escapeAttr(ev.title)}" loading="lazy" decoding="async">
        </button>` : ''}
        </div>
        <div class="evm-body">
        <div class="evm-meta">
          <p class="evm-date">${eventDateLabel(ev)} ${ev.start.slice(0,4)}${ev.time?' · '+ev.time+' น.':''}</p>
          ${(()=>{ const at = startsAt(ev, toYmd(todayStart()));
            return at ? `<span class="evm-starts" data-starts-at="${at}">${startsLabel(at)}</span>` : ''; })()}
          ${ev.bookClosed
            ? `<span class="evm-price is-closed">${ICONS.ticket}${ev.price
                 ? `<span class="evm-amount">${escapeHtml(ev.price)} บาท</span>` : ''}<span class="evm-closed">BOOK CLOSED</span></span>`
            : ev.price && ev.ticketUrl
            ? `<a class="evm-price is-link" href="${escapeAttr(ev.ticketUrl)}" target="_blank" rel="noopener noreferrer">
                 ${ICONS.ticket}<span class="evm-amount">${escapeHtml(ev.price)} บาท</span>
               </a>`
            : ev.price
            ? `<span class="evm-price">${ICONS.ticket}<span class="evm-amount">${escapeHtml(ev.price)} บาท</span></span>`
            : ''}
        </div>
        <h2 class="evm-title">${escapeHtml(ev.title)}</h2>
        <hr class="evm-rule">
        ${ev.venue ? `<a class="evm-venue evm-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.venue)}"
            target="_blank" rel="noopener noreferrer" title="เปิดใน Google Maps">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${escapeHtml(ev.venue)}</span></a>` : ''}
        ${groupTags.length ? `<div class="ev-groups">${groupTags.map(g=>
          groupTag(g)).join('')}</div>` : ''}

        ${ev.slots ? renderSlotTable(ev) : ''}

        ${ev.detail ? `
        <h3 class="evm-head">กำหนดการ</h3>
        <ul class="ev-detail">${ev.detail.map(d=>`<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}

        ${ev.info ? `
        <h3 class="evm-head">รายละเอียด</h3>
        <ul class="ev-detail">${ev.info.map(d=>`<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}

        ${ev.lineupTba ? `<p class="ev-tba">รอประกาศรายชื่อ</p>` : ''}

        ${(ev.links || []).length ? `<div class="evm-related">${ev.links.map(l =>
          `<a class="chip chip-link" href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)} ↗</a>`).join('')}</div>` : ''}

        ${(ev.related || []).map(id => getEvent(id)).filter(Boolean).length ? `
        <h3 class="evm-head">งานที่เกี่ยวข้อง</h3>
        <div class="evm-related">${ev.related.map(id => getEvent(id)).filter(Boolean).map(r =>
          `<button class="chip chip-link" data-action="open-event" data-id="${r.id}">${escapeHtml(r.title)} · ${eventDateLabel(r)}</button>`).join('')}</div>` : ''}

        ${people.length ? `
        <h3 class="evm-head">สมาชิกที่ร่วมงาน · ${people.length} คน</h3>
        ${mine.length ? `<p class="ev-mine">มีโอชิของคุณ ${mine.length} คน</p>` : ''}
        <div class="ev-people">${people.map(m=>{
          const g = getGroup(m.groupId);
          // A run that does not have the same line-up every day says so on the
          // chip itself; reading it off a note further up is easy to miss.
          const day = ev.memberDays && ev.memberDays[m.id];
          return `<button class="ev-person${state.oshi.includes(m.id)?' is-oshi':''}" style="--c:${g.color}"
            data-action="open-member" data-id="${m.id}">
            ${renderAvatar(m,'avatar-sm',g.color)}<span>${escapeHtml(m.nameTh||m.name)}</span>
            ${day ? `<span class="ev-person-day">${escapeHtml(day)}</span>` : ''}
          </button>`; }).join('')}</div>` : ''}
        </div>
        </div>
      </div>
    </div>
  </div>`;
}


/* A birthday only happens once a year, so the day's card gets fireworks.
   Rockets rise from the bottom and burst in the group's colours. One rAF
   loop that stops itself when the canvas leaves the page, so switching tabs
   does not leave it spinning. */
let _fxStop = null;
function startBirthdayFireworks(){
  if(_fxStop){ _fxStop(); _fxStop = null; }
  const canvas = document.querySelector('.bday-fx');
  if(!canvas) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  const COLOURS = GROUPS.map(g=>g.color).concat(['#E8C25A','#FFFFFF']);
  let w = 0, h = 0, dpr = 1, raf = 0, running = true;
  let rockets = [], sparks = [], next = 0;

  function size(){
    const r = canvas.getBoundingClientRect();
    if(!r.width) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  if(!size()) return;

  const rand = (a,b) => a + Math.random()*(b-a);

  function launch(){
    rockets.push({
      x: rand(w*0.15, w*0.85), y: h,
      vy: -rand(h*0.011, h*0.016),
      target: rand(h*0.16, h*0.46),
      colour: COLOURS[(Math.random()*COLOURS.length)|0]
    });
  }
  function burst(r){
    const n = 22 + ((Math.random()*10)|0);
    for(let i=0; i<n; i++){
      const a = (Math.PI*2*i)/n + rand(-0.09, 0.09);
      const sp = rand(0.9, 2.7);
      sparks.push({ x:r.x, y:r.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
        life:1, decay:rand(0.012, 0.024), colour:r.colour });
    }
  }

  function frame(t){
    if(!running) return;
    if(!canvas.isConnected){ stop(); return; }
    ctx.clearRect(0, 0, w, h);

    if(t > next){ launch(); next = t + rand(650, 1500); }

    rockets = rockets.filter(r=>{
      r.y += r.vy; r.vy += 0.045;
      const done = r.y <= r.target || r.vy >= 0;
      if(done){ burst(r); return false; }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = r.colour;
      ctx.beginPath(); ctx.arc(r.x, r.y, 1.8, 0, Math.PI*2); ctx.fill();
      return true;
    });

    sparks = sparks.filter(s=>{
      s.x += s.vx; s.y += s.vy;
      s.vy += 0.032; s.vx *= 0.985; s.vy *= 0.985;
      s.life -= s.decay;
      if(s.life <= 0) return false;
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.colour;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.9 * s.life + 0.5, 0, Math.PI*2); ctx.fill();
      return true;
    });

    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function onResize(){ size(); }
  function stop(){
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
  }
  window.addEventListener('resize', onResize);
  _fxStop = stop;
  raf = requestAnimationFrame(frame);
}

/* The search box reaches everything in the database, not just the member
   table it used to filter, so it renders its own screen over whichever view
   is current for as long as there is a query. */
function searchEverything(q){
  const ql = q.toLowerCase();
  const hit = s => !!s && (String(s).toLowerCase().includes(ql) || String(s).includes(q));
  const any = (...fields) => fields.some(hit);

  return {
    members: state.members.filter(m => any(m.name, m.nameTh, m.realName, m.realNameTh)),
    tracks:  allTracks(true).filter(t => hit(t.track)),
    works:   [...ALL_WORKS(), ...SEED_SPECIALS].filter(w => any(w.title, w.alt)),
    events:  allEvents().filter(e => any(e.title, e.venue)
               || (e.info || []).some(hit) || (e.detail || []).some(hit)),
    teams:   TEAMS.filter(t => hit(t.name)),
    groups:  GROUPS.filter(g => any(g.name, g.full, g.desc))
  };
}

function renderSearch(){
  const q = state.query.trim();
  const r = searchEverything(q);
  const total = r.members.length + r.tracks.length + r.works.length
    + r.events.length + r.teams.length + r.groups.length;
  const iso = toYmd(todayStart());

  // A broad query can match most of the database; showing every hit on every
  // keystroke is slow to draw and useless to read, so each group shows the
  // first few and says how many more there were.
  const section = (label, items, cap, draw) => {
    if(!items.length) return '';
    const shown = items.slice(0, cap);
    const rest = items.length - shown.length;
    return `
    <section class="feed-block">
      <h2 class="section-label">${label} · ${items.length}</h2>
      ${draw(shown)}
      ${rest ? `<p class="sr-more">และอีก ${rest} รายการ — พิมพ์ให้เจาะจงขึ้นเพื่อดูทั้งหมด</p>` : ''}
    </section>`;
  };

  const workRow = w => {
    const g = getGroup(w.groupId);
    return `<button class="sr-row" style="--c:${g.color}" data-action="open-single" data-id="${w.id}">
      <span class="sr-kind">${workLabel(w)}</span>
      <span class="sr-main">${escapeHtml(w.title)}</span>
      <span class="sr-sub">${escapeHtml(w.alt || '')}${w.alt?' · ':''}${workGroupNames(w)} · ${w.year}</span>
    </button>`;
  };

  return `
  <div class="feed-page">
    <header class="feed-head">
      <p class="feed-today">ผลการค้นหา</p>
      <h1 class="feed-title">${escapeHtml(q)}</h1>
      <p class="sr-count">${total ? 'พบ '+total+' รายการ' : 'ไม่พบอะไรที่ตรงกับคำนี้'}</p>
    </header>

    ${section('สมาชิก', r.members, 30, list =>
      `<div class="grid-mini grid-mini-oshi">${list.map(m => renderMiniCard(m)).join('')}</div>`)}

    ${section('เพลง', r.tracks, 15, list =>
      list.map(t => {
        const g = getGroup(t.work.groupId);
        return `<button class="sr-row" style="--c:${g.color}" data-action="open-single" data-id="${t.work.id}">
          <span class="sr-kind">เพลง</span>
          <span class="sr-main">${escapeHtml(t.track)}</span>
          <span class="sr-sub">${escapeHtml(t.work.title)} · ${workGroupNames(t.work)} · ${t.work.year}</span>
        </button>`; }).join(''))}

    ${section('ซิงเกิลและอัลบั้ม', r.works, 15, list => list.map(workRow).join(''))}

    ${section('ตารางงาน', r.events, 10, list =>
      list.map(e => renderEventCard(e, iso)).join(''))}

    ${section('วงและทีม', [...r.groups, ...r.teams], 12, () =>
      r.groups.map(g =>
        `<button class="sr-row" style="--c:${g.color}" data-action="filter-team-direct"
          data-group="${g.id}" data-team="all">
          <span class="sr-kind">วง</span>
          <span class="sr-main">${escapeHtml(g.name)}</span>
          <span class="sr-sub">${escapeHtml(g.full)}</span>
        </button>`).join('')
      + r.teams.map(t => {
        const g = getGroup(t.groupId);
        return `<button class="sr-row" style="--c:${g?g.color:'var(--ink-soft)'}" data-action="filter-team-direct"
          data-group="${t.groupId||'all'}" data-team="${t.id}">
          <span class="sr-kind">ทีม</span>
          <span class="sr-main">${escapeHtml(t.name)}</span>
          <span class="sr-sub">${g?g.name:''}</span>
        </button>`; }).join(''))}

    ${total ? '' : `<p class="muted-note">ลองค้นด้วยชื่อสมาชิก ชื่อเพลง ชื่อซิงเกิล ชื่องาน หรือสถานที่</p>`}
  </div>`;
}

function renderFeed(){
  const today = todayStart();
  const iso = toYmd(today);
  const dayName = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][today.getDay()];

  const mine = filteringByOshi();
  const withBday = activeMembers().filter(m => m.birthday).filter(m => !mine || isMyOshi(m));
  const todays = withBday.filter(m => m.birthday.slice(5) === iso.slice(5));
  const upcoming = withBday.map(m => ({ m, d: daysUntilBirthday(m, today) }))
    .filter(x => x.d > 0).sort((a,b) => a.d - b.d).slice(0, 10);

  const events = allEvents().filter(e => !mine || hasMyOshi(e))
    .slice().sort((a,b) => a.start.localeCompare(b.start));
  const running = events.filter(e => e.start <= iso && eventLastDay(e) >= iso);
  const nowOn = running.filter(e => !e.period && !doneForToday(e, iso));
  const overToday = running.filter(e => !e.period && doneForToday(e, iso));
  _feedLiveKey = nowOn.map(e => e.id).join(',');
  const periods = running.filter(e => e.period);
  const soon = events.filter(e => e.start > iso);
  const past = events.filter(e => eventLastDay(e) < iso).reverse();

  return `
  <div class="feed-page">
    <header class="feed-head">
      <p class="feed-today">วัน${dayName}ที่ ${today.getDate()} ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()+543}</p>
      <h1 class="feed-title">วันนี้ที่ 48</h1>
      ${state.isAdmin ? `<button class="btn-add feed-add-event" data-action="add-event">+ เพิ่มงาน</button>` : ''}
      ${state.oshi.length ? `
      <div class="feed-scope" role="group" aria-label="ขอบเขตที่แสดง">
        <button class="scope-btn${state.oshiOnly?'':' is-on'}" data-action="set-oshi-only" data-id="0">ทั้งหมด</button>
        <button class="scope-btn${state.oshiOnly?' is-on':''}" data-action="set-oshi-only" data-id="1">เฉพาะโอชิของฉัน</button>
      </div>` : ''}
    </header>

    <div class="feed-cols"><div class="feed-main">
    ${nowOn.length ? `
    <section class="feed-block today-hero-block">
      <h2 class="section-label">งานวันนี้</h2>
      ${nowOn.map(e => renderTodayHero(e, iso)).join('')}
    </section>` : ''}

    ${overToday.length ? `
    <section class="feed-block is-over-today">
      <h2 class="section-label">จบไปแล้ววันนี้</h2>
      ${overToday.map(e => renderEventCard(e, iso)).join('')}
    </section>` : ''}

    ${periods.length ? `
    <section class="feed-block is-periods">
      <h2 class="section-label">ช่วงที่เปิดอยู่</h2>
      ${periods.map(e => renderEventCard(e, iso)).join('')}
    </section>` : ''}



    <section class="feed-block is-schedule">
      <h2 class="section-label">ตารางงานที่จะถึง</h2>
      ${soon.length ? soon.map(e => renderEventCard(e, iso)).join('')
        : `<p class="muted-note">${mine
            ? 'ยังไม่มีงานที่โอชิของคุณไป — กด “ทั้งหมด” เพื่อดูทุกงาน'
            : 'ยังไม่มีงานที่ประกาศไว้ล่วงหน้า'}</p>`}
    </section>



    ${past.length ? `
    <section class="feed-block is-past">
      <button class="past-toggle" data-action="toggle-past" aria-expanded="${state.pastOpen?'true':'false'}">
        <span>งานที่ผ่านมา · ${past.length} งาน</span>
        <span class="stage-caret${state.pastOpen?' is-open':''}" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </button>
      ${state.pastOpen ? `<div class="past-list">${past.map(e => renderEventCard(e, iso)).join('')}</div>` : ''}
    </section>` : ''}
    </div>
    <aside class="feed-side">
    ${todays.length ? `
    <section class="feed-block is-birthday is-bday-today">
      <h2 class="section-label">วันเกิดวันนี้</h2>
      <div class="bday-today-wrap">
      <canvas class="bday-fx" aria-hidden="true"></canvas>
      <div class="bday-today-grid">
        ${todays.map(m => {
          const g = getGroup(m.groupId);
          const age = calcAge(m.birthday);
          return `<button class="bday-today" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
            ${renderAvatar(m,'bday-today-face',g.color)}
            <span class="bday-today-name">${escapeHtml(m.nameTh||m.name)}</span>
            <span class="bday-today-sub">${escapeHtml(m.name)}</span>
            ${age!=null ? `<span class="bday-today-age">อายุ ${age} ปี</span>` : ''}
            <span class="bday-today-group" style="--c:${g.color}">${g.name}</span>
          </button>`;
        }).join('')}
      </div>
      </div>
    </section>` : ''}
    <section class="feed-block is-birthday is-bday-next">
      <h2 class="section-label">วันเกิดที่ใกล้ถึง</h2>
      <div class="bday-next">
        ${upcoming.map(({m,d}) => {
          const g = getGroup(m.groupId);
          const a = calcAge(m.birthday);
          return `<button class="bday-chip" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
            ${renderAvatar(m,'avatar-sm',g.color)}
            <span><span class="when">${d===1?'พรุ่งนี้':'อีก '+d+' วัน'}${a!=null?` · <span class="age-step"><span class="from">${a}</span><span class="arrow">→</span><span class="to">${a+1}</span></span>`:''}</span>
            <span class="who" style="display:block;">${escapeHtml(m.nameTh||m.name)}</span></span>
          </button>`;
        }).join('')}
      </div>
    </section>
    <section class="feed-block is-calendar">
      <h2 class="section-label">ปฏิทิน</h2>
      ${renderCalendar()}
    </section>
    </aside></div>
  </div>`;
}

function renderBrowse(){
  const list = filterAndSort();
  const teamsAvailable = state.groupFilter==='all' ? TEAMS : getTeamsForGroup(state.groupFilter);
  return `
  ${renderMembersTabs()}
  <div class="filter-bar">
    ${renderGroupPills()}
    ${renderGraduatedPill()}
    ${(()=>{ const n=activeAdvCount();
      return `<button class="pill ${n?'adv-on':''}" data-action="toggle-adv">ตัวกรอง${n?' · '+n:''}</button>`; })()}
    <select class="filter-select" id="team-filter">
      <option value="all">ทุกทีม</option>
      ${teamsAvailable.map(t=>`<option value="${t.id}" ${state.teamFilter===t.id?'selected':''}>${t.name}</option>`).join('')}
    </select>
    <select class="filter-select" id="sort-filter">
      <option value="name" ${state.sortBy==='name'?'selected':''}>เรียงตามชื่อ</option>
      <option value="age" ${state.sortBy==='age'?'selected':''}>เรียงตามอายุ</option>
      <option value="gen" ${state.sortBy==='gen'?'selected':''}>เรียงตามรุ่น</option>
    </select>
    <span class="count-tag">${list.length} คน</span>
    ${state.genFilter!=='all' ? `<button class="gen-filter-chip" data-action="clear-gen-filter">รุ่น ${state.genFilter} \u2715</button>` : ''}
    ${state.captainFilter!=='all' ? `<button class="gen-filter-chip" data-action="clear-gen-filter">${CAPTAIN_LABELS[state.captainFilter]} \u2715</button>` : ''}
  </div>
  ${renderAdvFilters()}
  ${state.showGraduated ? `<div class="grad-note"><span class="grad-cap">${ICONS.cap}</span>สมาชิกที่จบการศึกษาไปแล้ว — ไม่แสดงในรายชื่อหลัก แต่ค้นหาเจอได้ตลอด</div>` : ''}
  ${list.length ? `
  <div class="thead-sticky-outer">
    <div class="thead-sticky-track" id="thead-track">
      <div class="dtable${state.showGraduated?' grad-mode':''}">${renderTableHeader()}</div>
    </div>
  </div>
  <div class="table-wrap" id="table-body-wrap">
    <div class="dtable${state.showGraduated?' grad-mode':''}">
      ${list.map(renderRow).join('')}
    </div>
  </div>` : `<div class="empty-state">
    <p>${state.favoritesOnly?'ยังไม่มี Oshi กดดาว ☆ เพื่อเพิ่ม':'ไม่พบสมาชิกที่ตรงกับเงื่อนไข'}</p>
    ${activeAdvCount() ? `<p class="muted-note" style="margin:8px 0 12px;">ตัวกรองที่ตั้งไว้กรองออกหมด${
        (state.heightMin!==''||state.heightMax!=='') && _advBase.some(m=>!m.height)
          ? ` — สมาชิก ${_advBase.filter(m=>!m.height).length} คนในรายชื่อนี้ไม่มีข้อมูลส่วนสูง จึงไม่เข้าเงื่อนไข` : ''}</p>
      <button class="btn-secondary" data-action="reset-adv">ล้างตัวกรอง</button>` : ''}
  </div>`}`;
}


function renderDetailModal(){
  const m = getMember(state.selectedId);
  if(!m) return '';
  const g = getGroup(m.groupId);
  const t = getTeam(m.teamId);
  const isOshi = state.oshi.includes(m.id);
  const isKami = state.kamiOshi === m.id;
  const age = calcAge(m.birthday);

  const badges = [
    `<button class="badge badge-link" style="background:${g.color}" data-action="filter-to" data-scope="group" data-id="${m.id}">${g.name}</button>`,
    t ? `<button class="badge badge-link" style="background:var(--ink-soft)" data-action="filter-to" data-scope="team" data-id="${m.id}">${t.name}</button>` : `<span class="badge" style="background:var(--ink-soft)">-</span>`,
    m.gen ? `<button class="badge badge-link" style="background:var(--ink-soft)" data-action="filter-to" data-scope="gen" data-id="${m.id}">รุ่น ${m.gen}</button>` : `<span class="badge" style="background:var(--ink-soft)">รุ่น -</span>`
  ];
  if(g.captain===m.name) badges.push(`<button class="badge badge-link" style="background:var(--gold)" data-action="filter-to" data-scope="captain" data-captain-type="group-captain" data-id="${m.id}">กัปตันวง</button>`);
  else if(g.viceCaptain===m.name) badges.push(`<button class="badge badge-link" style="background:var(--gold)" data-action="filter-to" data-scope="captain" data-captain-type="group-vc" data-id="${m.id}">รองกัปตันวง</button>`);
  if(t && t.captain===m.name) badges.push(`<button class="badge badge-link" style="background:var(--gold)" data-action="filter-to" data-scope="captain" data-captain-type="team-captain" data-id="${m.id}">กัปตันทีม</button>`);
  else if(t && t.viceCaptain===m.name) badges.push(`<button class="badge badge-link" style="background:var(--gold)" data-action="filter-to" data-scope="captain" data-captain-type="team-vc" data-id="${m.id}">รองกัปตันทีม</button>`);
  SHIHAININ.filter(r => r.memberId === m.id).forEach(r => {
    badges.push(`<button class="badge badge-link" style="background:var(--gold)" data-action="sub-tab" data-view="org">${r.current ? 'ชิไฮนิน' : 'อดีตชิไฮนิน'} ${getGroup(r.groupId).name}</button>`);
  });
  if(isKami) badges.push(`<span class="badge kami-badge">${ICONS.crown} Kami Oshi ของคุณ</span>`);

  return `
  <div class="modal-backdrop" data-action="close-modal">
    <div class="modal-glass-card is-wide is-member-sheet" data-stop-close="1">
      <button class="modal-share-btn" data-action="share" title="คัดลอกลิงก์" aria-label="คัดลอกลิงก์">${ICONS.link}</button>
      <button class="modal-close-btn" data-action="close-modal" title="ปิด" aria-label="ปิด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="modal-scroll">
        <div class="sheet-top">
        <div class="detail-head">
          ${renderAvatar(m, 'detail-avatar', g.color)}
          <div style="flex:1;min-width:200px;">
            <div class="detail-name-th">${m.nameTh}</div>
            <div class="detail-name-en">${isEN()
              ? (secondName(m) || m.name)
              : m.name + (m.realNameTh?' · '+m.realNameTh:'') + (m.realName?' ('+m.realName+')':'')}</div>
            <div>${badges.join('')}</div>
          </div>
        </div>
        ${m.transfer ? `<div class="grad-note transfer-note"><span class="grad-cap">${ICONS.transfer}</span>ย้ายวงจาก ${linkGroup(getGroup(m.transfer.fromGroupId))} (รุ่น ${m.transfer.fromGen}) เมื่อ ${formatDateShort(m.transfer.date)}</div>` : ''}
        ${m.graduated ? `<div class="grad-note"><span class="grad-cap">${ICONS.cap}</span>จบการศึกษาเมื่อ ${formatDateShort(m.graduated)}</div>` : ''}
        <div class="oshi-actions">
          <button class="oshi-btn ${isOshi?'active':''}" data-action="toggle-oshi" data-id="${m.id}">
            <span>${isOshi?'\u2605':'\u2606'}</span> ${isOshi?'เป็น Oshi ของคุณ':'เพิ่มเป็น Oshi'}
          </button>
          <button class="kami-btn ${isKami?'active':''}" data-action="toggle-kami-oshi" data-id="${m.id}">
            <span class="crown-ico">${ICONS.crown}</span> ${isKami?'เป็น Kami Oshi':'ตั้งเป็น Kami Oshi'}
          </button>
          <!-- The comparison stays in the code (and reachable by a ?vs= link) but has
               no button: the owner does not want visitors to see members compared. -->
        </div>
        ${renderSocial(m)}
        </div>
        <div class="sheet-body">
        <div class="sheet-col sheet-col-a">
        <div class="stat-grid sec-stats">
          <div class="stat-cell"><div class="label">วันเกิด</div><div class="value">${formatDate(m.birthday)}</div></div>
          <div class="stat-cell"><div class="label">อายุ</div><div class="value">${age!==null?age+' ปี':'-'}</div></div>
          <div class="stat-cell"><div class="label">ส่วนสูง</div><div class="value">${m.height?m.height+' ซม.':'-'}</div></div>
          <div class="stat-cell"><div class="label">กรุ๊ปเลือด</div><div class="value">${m.blood||'-'}</div></div>
          <div class="stat-cell"><div class="label">บ้านเกิด</div><div class="value">${escapeHtml(m.hometown||'-')}</div></div>
          <div class="stat-cell stat-wide"><div class="label">งานอดิเรก</div><div class="value">${escapeHtml(m.hobby||'-')}</div></div>
          <div class="stat-cell stat-wide"><div class="label">สิ่งที่ชอบ</div><div class="value">${escapeHtml(m.likes||'-')}</div></div>
        </div>
        <div class="sec-history">${renderTeamHistory(m)}</div>
        <div class="sec-facts">
        <h3 class="section-label">ข้อเท็จจริง</h3>
        ${m.facts && m.facts.length ? `<ul class="facts-list">${m.facts.map(f=>`<li>${f}</li>`).join('')}</ul>` : `<p class="muted-note">ยังไม่มีข้อมูลเพิ่มเติม — กด "แก้ไขข้อมูล" เพื่อเพิ่ม</p>`}
        </div>
        <div class="action-row sec-actions">
          <button class="btn-secondary" data-action="edit-member" data-id="${m.id}">แก้ไขข้อมูล</button>
          <button class="btn-danger" data-action="delete-member" data-id="${m.id}">ลบสมาชิก</button>
        </div>
        </div>
        <div class="sheet-col sheet-col-b"><div class="sec-events">${renderMemberEvents(m)}</div></div>
        <div class="sheet-col sheet-col-c"><div class="sec-works">${renderMemberWorks(m)}</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* The member list and the group profiles share the second nav tab, so both
   screens carry the same switch at the top. */
function renderMembersTabs(){
  const tab = (view, label) =>
    `<button class="sub-tab${state.view===view?' active':''}" data-action="sub-tab" data-view="${view}">${label}</button>`;
  return `<div class="sub-tabs">${tab('groups','ประวัติวง')}${tab('org','ตำแหน่ง')}${tab('browse','สมาชิกทั้งหมด')}</div>`;
}

function renderGroups(){
  return renderMembersTabs() + '<div class="group-cards">' + GROUPS.map(g=>{
    const teams = getTeamsForGroup(g.id);
    const count = activeMembers().filter(m=>m.groupId===g.id).length;
    const gradCount = state.members.filter(m=>m.groupId===g.id && m.graduated).length;
    return `
    <div class="group-card" style="--c:${g.color}">
      <div class="group-head">
        <h2 style="color:${g.color}">${g.name}</h2>
        <span class="mono" style="font-size:12px;color:var(--ink-soft);">เดบิวต์ ${formatDate(g.debut)}</span>
      </div>
      <p>${g.desc}</p>
      ${g.official ? `<div class="official-colour"><span class="official-swatch" style="background:${g.official.hex}"></span>
        <span>สีประจำวง <b>${isEN() ? g.official.en : g.official.th}</b> · ${g.official.en} ${g.official.hex}</span></div>` : ''}
      <div class="chip-row" style="margin-bottom:14px;">
        <span class="chip">กัปตัน: ${g.captain ? linkMember(memberNamed(g.captain, g.id), g.captain) : '-'}</span>
        ${g.viceCaptain?`<span class="chip">รองกัปตัน: ${linkMember(memberNamed(g.viceCaptain, g.id), g.viceCaptain)}</span>`:''}
        <button class="chip chip-link" data-action="drill" data-group="${g.id}">${count} คน</button>
        ${gradCount?`<button class="chip chip-link" data-action="drill" data-group="${g.id}" data-grad="1">จบแล้ว ${gradCount} คน</button>`:''}
      </div>
      ${teams.map(t=>{
        const tc = activeMembers().filter(m=>m.teamId===t.id).length;
        return `<button class="team-row" data-action="filter-team-direct" data-group="${g.id}" data-team="${t.id}">
          <span>${t.name}</span>
          <span class="mono">${tc} คน${t.captain?' · กัปตัน '+t.captain:''}</span>
        </button>`;
      }).join('')}
    </div>`;
  }).join('') + '</div>';
}

/* Who answers to whom, drawn as a family tree: the manager, the group's captain
   and vice, each team with its captain and vice over the rest of its members,
   then the trainees not yet placed in a team — everyone, once. Rank reads as
   colour as well as position: the higher the seat, the stronger its fill.
   Every person opens their profile.

   With everyone on it the tree is wider than a phone, so each is drawn at a
   fixed size inside its own frame and can be zoomed: pinched, with the
   buttons, or ctrl-scrolled on a trackpad. It opens fitted to the frame. */
const ORG_TEAM_W = 250, ORG_GAP = 12, ORG_PAD = 12;
const _orgZoom = {};

function renderOrgChart(){
  const node = (m, role, g, rank, term) => m
    ? `<button class="org-node rank-${rank}" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
        ${renderAvatar(m, 'org-avatar', g.color)}
        <span class="org-role">${role}</span>
        <span class="org-name">${escapeHtml(m.nameTh || m.name)}</span>
        ${term ? `<span class="org-term">${term}</span>` : ''}
      </button>`
    : `<div class="org-node rank-${rank} is-empty" style="--c:${g.color}">
        <span class="org-role">${role}</span>
        <span class="org-name">ยังไม่มีข้อมูล</span>
      </div>`;
  const tier = (slots, cls) => slots.length
    ? `<div class="org-tier${cls ? ' ' + cls : ''}">${slots.map(s => `<div class="org-slot">${s}</div>`).join('')}</div>`
    : '';
  const chips = (list, g) => list.map(m => `<button class="ev-person" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
      ${renderAvatar(m, 'avatar-sm', g.color)}<span>${escapeHtml(m.nameTh || m.name)}</span></button>`).join('');

  const tree = g => {
    const held = SHIHAININ.filter(r => r.groupId === g.id);
    const now = held.find(r => r.current);
    const before = held.filter(r => !r.current && getMember(r.memberId));
    const years = r => r.from ? ` <span class="org-term">${r.from.slice(0,4)}–${r.to ? r.to.slice(0,4) : ''}</span>` : '';
    const top = node(now && getMember(now.memberId), 'ชิไฮนิน', g, 1, now && now.from ? `ตั้งแต่ ${formatDate(now.from)}` : '')
      + (before.length ? `<div class="org-past">ก่อนหน้า ${before.map(r => linkMember(getMember(r.memberId)) + years(r)).join(' · ')}</div>` : '');

    const captains = [];
    if(g.captain) captains.push(node(memberNamed(g.captain, g.id), 'กัปตันวง', g, 2));
    if(g.viceCaptain) captains.push(node(memberNamed(g.viceCaptain, g.id), 'รองกัปตันวง', g, 2));

    // Everyone appears once, in the highest seat they hold: a group captain who
    // also belongs to a team is drawn as group captain, not again in that team.
    const placedAbove = new Set([memberNamed(g.captain, g.id), memberNamed(g.viceCaptain, g.id)].filter(Boolean));
    const teams = getTeamsForGroup(g.id).filter(t => !/trainee/.test(t.id));
    const teamCols = teams.map(t => {
      const cap = memberNamed(t.captain, g.id), vice = memberNamed(t.viceCaptain, g.id);
      const roster = activeMembers().filter(m => m.teamId === t.id);
      const rest = roster
        .filter(m => m !== cap && m !== vice && !placedAbove.has(m))
        .sort((a, b) => a.name.localeCompare(b.name));
      // A team with no vice on record still shows the seat, so the gap is visible.
      return `<div class="org-team">
        <div class="org-team-name">${linkTeam(t)} · ${roster.length} คน</div>
        <div class="org-leads">
          ${node(cap, 'กัปตันทีม', g, 3)}
          ${node(vice, 'รองกัปตันทีม', g, 3)}
        </div>
        ${rest.length ? `<div class="org-members"><div class="ev-people">${chips(rest, g)}</div></div>` : ''}
      </div>`;
    });

    const traineeTeam = getTeamsForGroup(g.id).find(t => /trainee/.test(t.id));
    const trainees = activeMembers().filter(m => m.groupId === g.id && /trainee/.test(m.teamId || ''))
      .sort((a, b) => a.name.localeCompare(b.name));
    const traineeBox = trainees.length ? `<div class="org-trainees">
        <div class="org-team-name">${traineeTeam ? linkTeam(traineeTeam, 'เด็กฝึก') : 'เด็กฝึก'} · ${trainees.length} คน</div>
        <div class="ev-people">${chips(trainees, g)}</div>
      </div>` : '';

    const width = Math.max(370, teams.length * ORG_TEAM_W + (teams.length - 1) * ORG_GAP) + ORG_PAD * 2;
    return `<div class="group-card org-tree" style="--c:${g.color}">
      <div class="group-head">
        <h2 style="color:${g.color}">${linkGroup(g)}</h2>
        <div class="org-zoom" data-group="${g.id}">
          <button type="button" data-org-zoom="out" aria-label="ซูมออก">−</button>
          <button type="button" data-org-zoom="fit" aria-label="พอดีกรอบ">พอดี</button>
          <button type="button" data-org-zoom="in" aria-label="ซูมเข้า">+</button>
        </div>
      </div>
      <div class="org-viewport" data-group="${g.id}">
        <div class="org-canvas" data-w="${width}" style="width:${width}px">
          ${tier([top], 'is-first')}
          ${tier(captains)}
          ${tier(teamCols, 'is-teams')}
          ${tier(traineeBox ? [traineeBox] : [], 'is-wide')}
        </div>
      </div>
    </div>`;
  };

  const legend = [['ชิไฮนิน', 1], ['กัปตันวง', 2], ['กัปตันทีม', 3], ['สมาชิกทีม', 4], ['เด็กฝึก', 5]];
  return renderMembersTabs() + `
    <div class="org-legend" style="--c:${GROUPS[0].color}">
      ${legend.map(([label, r]) => `<span class="org-key"><i class="rank-swatch rank-${r}"></i>${label}</span>`).join('<span class="org-key-arrow">›</span>')}
    </div>
    <p class="org-hint">บีบนิ้วหรือกด + − เพื่อซูม · แตะชื่อเพื่อดูโปรไฟล์</p>
    <div class="org-groups">${GROUPS.map(tree).join('')}</div>`;
}

function bindOrgZoom(){
  document.querySelectorAll('.org-viewport').forEach(vp => {
    const canvas = vp.querySelector('.org-canvas');
    const gid = vp.dataset.group;
    const w = Number(canvas.dataset.w);
    const fit = Math.min(1, vp.clientWidth / w);
    let z = Math.min(2, Math.max(fit, _orgZoom[gid] || fit));

    const apply = () => {
      canvas.style.zoom = z;
      _orgZoom[gid] = z;
    };
    // Zoom about a point in the frame, so what is under the fingers stays there.
    const zoomTo = (nz, fx, fy) => {
      nz = Math.min(2, Math.max(fit, nz));
      const cx = (vp.scrollLeft + fx) / z, cy = (vp.scrollTop + fy) / z;
      z = nz; apply();
      vp.scrollLeft = cx * z - fx;
      vp.scrollTop = cy * z - fy;
    };
    apply();

    let pinch = null;
    const spread = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    vp.addEventListener('touchstart', e => {
      if(e.touches.length !== 2) return;
      const r = vp.getBoundingClientRect();
      pinch = { d: spread(e.touches), z,
        fx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
        fy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top };
    }, { passive:true });
    vp.addEventListener('touchmove', e => {
      if(!pinch || e.touches.length !== 2) return;
      if(e.cancelable) e.preventDefault();
      zoomTo(pinch.z * spread(e.touches) / pinch.d, pinch.fx, pinch.fy);
    }, { passive:false });
    vp.addEventListener('touchend', e => { if(e.touches.length < 2) pinch = null; });
    vp.addEventListener('wheel', e => {
      if(!e.ctrlKey) return;                       // a trackpad pinch arrives as ctrl+wheel
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomTo(z * (1 - e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    }, { passive:false });

    const bar = document.querySelector(`.org-zoom[data-group="${gid}"]`);
    if(bar) bar.onclick = e => {
      const b = e.target.closest('[data-org-zoom]');
      if(!b) return;
      const cx = vp.clientWidth / 2, cy = Math.min(vp.clientHeight, 240) / 2;
      if(b.dataset.orgZoom === 'fit'){ zoomTo(fit, 0, 0); vp.scrollLeft = 0; vp.scrollTop = 0; }
      else zoomTo(z * (b.dataset.orgZoom === 'in' ? 1.25 : 0.8), cx, cy);
    };
  });
}

function renderMiniCard(m, isCentre, action){
  const g = getGroup(m.groupId);
  const isKami = state.kamiOshi === m.id;
  return `
  <div class="mini-card${isCentre?' is-centre':''}" style="--c:${g.color}"
    data-action="${action || 'open-member'}" data-id="${m.id}" title="${escapeAttr(m.name+' · '+(m.nameTh||''))}">
    <div class="avatar-sm" style="background:${g.color}">
      <span class="avatar-fallback">${(isEN() ? (m.name||m.nameTh) : (m.nameTh||m.name) || '?')[0]}</span>
      ${m.photo ? `<img class="avatar-img" src="${escapeAttr(m.photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
    </div>
    <span class="mini-names">
      <span class="mini-name">${escapeHtml(m.name)}</span>
      <span class="mini-name-th">${isEN() ? '' : escapeHtml(m.nameTh || '')}</span>
    </span>
    ${isKami ? `<span class="mini-crown">${ICONS.crown}</span>` : ''}
  </div>`;
}

function renderKamiOshiFeatured(m){
  const g = getGroup(m.groupId);
  const t = getTeam(m.teamId);
  return `
  <div class="kami-feature" data-action="open-member" data-id="${m.id}">
    ${renderAvatar(m, 'detail-avatar', g.color, 'width:60px;height:60px;font-size:24px;')}
    <div style="flex:1;min-width:0;">
      <div class="kami-feature-name">${m.name}${secondName(m) ? ` <span>· ${escapeHtml(secondName(m))}</span>` : ''}</div>
      <div class="chip-row"><span class="chip">${g.name}</span><span class="chip">${t?t.name:'-'}</span></div>
    </div>
  </div>`;
}

function renderProfile(){
  const loggedIn = state.account && state.account.loggedIn;
  const kamiMember = state.kamiOshi ? getMember(state.kamiOshi) : null;
  const oshiMembers = state.oshi.map(getMember).filter(Boolean);

  const accountBlock = loggedIn ? `
    <div class="account-card">
      <div class="acc-info">
        <div class="mini-avatar" style="width:52px;height:52px;font-size:20px;flex-shrink:0;">${state.account.name[0].toUpperCase()}</div>
        <div style="min-width:0;">
          <div class="account-name">${escapeHtml(state.account.name)}</div>
          <div class="account-email">${escapeHtml(state.account.email)}</div>
        </div>
      </div>
      <div class="account-actions">
        <button class="btn-secondary" data-action="nav" data-view="editprofile">แก้ไขข้อมูล</button>
        <button class="btn-danger" data-action="sign-out">ออกจากระบบ</button>
      </div>
    </div>` : `
    <div class="account-card guest">
      <div style="flex:1;min-width:200px;">
        <div class="account-name">ยังไม่ได้เข้าสู่ระบบ</div>
        <p class="muted-note" style="margin:4px 0 0;">เข้าสู่ระบบเพื่อบันทึกโปรไฟล์ของคุณไว้ถาวร</p>
      </div>
      <button class="btn-add" data-action="nav" data-view="auth">เข้าสู่ระบบ / สมัครสมาชิก</button>
    </div>`;

  return `
  ${accountBlock}
  <h3 class="section-label">Kami Oshi ของคุณ</h3>
  ${kamiMember ? renderKamiOshiFeatured(kamiMember) : `<p class="muted-note">ยังไม่ได้เลือก Kami Oshi — เปิดโปรไฟล์สมาชิกแล้วกดปุ่มมงกุฎเพื่อเลือก (เลือกได้คนเดียว)</p>`}
  <h3 class="section-label">Oshi ทั้งหมด (${oshiMembers.length})</h3>
  ${oshiMembers.length ? `<div class="grid-mini grid-mini-oshi">${oshiMembers.map(m => renderMiniCard(m)).join('')}</div>` : `<p class="muted-note">ยังไม่มี Oshi — กดดาว ☆ ที่รายชื่อสมาชิกเพื่อเพิ่ม</p>`}

  <h3 class="section-label">แอปของวง</h3>
  <a class="iam-link" href="https://app.bnk48.com/" target="_blank" rel="noopener noreferrer">
    <img class="iam-icon" src="iam48-icon.png" alt="" width="34" height="34">
    <span class="iam-text">
      <span class="iam-name">iAM48</span>
      <span class="iam-sub">ดูไลฟ์และเธียเตอร์ในแอปของวง</span>
    </span>
    <span class="iam-go" aria-hidden="true">↗</span>
  </a>

  <h3 class="section-label">สำรองข้อมูล</h3>
  <div class="backup-card">
    <p class="muted-note" style="margin:0 0 12px;">
      บันทึก Oshi และ Kami Oshi เป็นไฟล์ไว้กับตัว ย้ายเครื่องหรือเปลี่ยนเบราว์เซอร์แล้วนำกลับเข้ามาได้
    </p>
    <div class="backup-actions">
      <button class="btn-secondary" data-action="export-oshi">บันทึกเป็นไฟล์</button>
      <button class="btn-secondary" data-action="import-oshi">นำไฟล์เข้า</button>
    </div>
  </div>
  ${(()=>{
    // When the page was deployed, straight from the server's Last-Modified — so
    // "did my phone get the update?" can be answered by looking, not guessing.
    const d = new Date(document.lastModified);
    if(isNaN(d)) return '';
    const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
    return `<p class="app-version">เวอร์ชันเว็บ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear()+543} · ${hh}:${mm} น.</p>`;
  })()}
  `;
}

const STATS_TABS = [
  { id:'overview',  label:'ภาพรวม' },
  { id:'songs',     label:'เพลง' },
  { id:'birthdays', label:'วันเกิด' },
  { id:'timeline',  label:'ไทม์ไลน์' }
];

function renderBar(label, value, max, color, drill){
  const pct = max>0 ? Math.round(value/max*100) : 0;
  const inner = `<span class="bar-label">${escapeHtml(label)}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
    <span class="bar-val">${value}</span>`;
  const style = `--c:${color||'var(--ink)'}`;
  if(!drill || !value) return `<div class="bar-row" style="${style}">${inner}</div>`;
  // HTML attribute names are case-insensitive, so a camelCase key would arrive
  // as dataset.agemin. Emit kebab-case and the dataset camelCases it back.
  const attrs = Object.entries(drill)
    .map(([k,v])=>`data-${k.replace(/[A-Z]/g, c=>'-'+c.toLowerCase())}="${escapeAttr(v)}"`).join(' ');
  return `<button class="bar-row" style="${style}" data-action="drill" ${attrs}>${inner}</button>`;
}

function renderStatsOverview(){
  const active = activeMembers();
  const grads = state.members.filter(m=>m.graduated);
  const ages = active.map(m=>calcAge(m.birthday)).filter(a=>a!=null);
  const heights = active.map(m=>m.height).filter(Boolean);
  const avg = arr => arr.length ? Math.round(arr.reduce((s,n)=>s+n,0)/arr.length) : null;

  const buckets = [[0,15,'ต่ำกว่า 16'],[16,18,'16–18'],[19,21,'19–21'],[22,24,'22–24'],[25,99,'25 ขึ้นไป']];
  const maxBucket = Math.max(...buckets.map(([lo,hi])=>ages.filter(a=>a>=lo&&a<=hi).length), 1);

  return `
  <div class="stat-grid">
    <button class="stat-cell" data-action="drill"><div class="label">สมาชิกปัจจุบัน</div><div class="value">${active.length} คน</div></button>
    <button class="stat-cell" data-action="drill" data-grad="1"><div class="label">จบการศึกษาแล้ว</div><div class="value">${grads.length} คน</div></button>
    <div class="stat-cell"><div class="label">อายุเฉลี่ย</div><div class="value">${avg(ages)??'-'} ปี</div></div>
    <div class="stat-cell"><div class="label">ส่วนสูงเฉลี่ย</div><div class="value">${avg(heights)??'-'} ซม.</div></div>
  </div>

  <div class="group-cards">${GROUPS.map(g=>{
    const mine = active.filter(m=>m.groupId===g.id);
    const gradMine = grads.filter(m=>m.groupId===g.id);
    const gens = [...new Set(mine.map(m=>m.gen).filter(n=>n!=null))].sort((a,b)=>a-b);
    const teams = getTeamsForGroup(g.id);
    const maxGen = Math.max(...gens.map(n=>mine.filter(m=>m.gen===n).length), 1);
    const maxTeam = Math.max(...teams.map(t=>mine.filter(m=>m.teamId===t.id).length), 1);
    return `
    <div class="group-card" style="--c:${g.color}">
      <div class="group-head">
        <button class="link-h2" data-action="drill" data-group="${g.id}" style="color:${g.color}">${g.name}</button>
        <span class="mono" style="font-size:12px;color:var(--ink-soft);">
          <button class="link-inline" data-action="drill" data-group="${g.id}">${mine.length} คน</button> ·
          <button class="link-inline" data-action="drill" data-group="${g.id}" data-grad="1">จบแล้ว ${gradMine.length} คน</button>
        </span>
      </div>
      <h3 class="section-label" style="margin-top:6px;">แยกตามทีม</h3>
      ${teams.map(t=>renderBar(t.name, mine.filter(m=>m.teamId===t.id).length, maxTeam, g.color,
          {group:g.id, team:t.id})).join('')}
      <h3 class="section-label">แยกตามรุ่น</h3>
      ${gens.map(n=>renderBar('รุ่น '+n, mine.filter(m=>m.gen===n).length, maxGen, g.color,
          {group:g.id, gen:n})).join('')
        || '<p class="muted-note">ไม่มีข้อมูลรุ่น</p>'}
    </div>`;
  }).join('')}</div>

  ${(() => {
    const tracks = allTracks();
    const appearances = new Map();
    tracks.forEach(t=>t.members.forEach(id=>appearances.set(id,(appearances.get(id)||0)+1)));
    const top = [...appearances.entries()].filter(([id])=>getMember(id))
      .sort((a,b)=> b[1]-a[1] || getMember(a[0]).name.localeCompare(getMember(b[0]).name))
      .slice(0,5);
    if(!top.length) return '';
    const sizes = tracks.map(t=>t.members.length);
    const mean = Math.round(sizes.reduce((s,n)=>s+n,0)/sizes.length);
    return `
    <div class="group-card" style="--c:var(--gold)">
      <div class="group-head"><h2 style="font-size:21px;">เพลง</h2>
        <button class="link-inline" data-action="stats-tab" data-value="songs">ดูทั้งหมด →</button></div>
      <div class="stat-grid" style="margin-bottom:4px;">
        <button class="stat-cell" data-action="stats-tab" data-value="songs"><div class="label">เพลงทั้งหมด</div><div class="value">${tracks.length} เพลง</div></button>
        <button class="stat-cell" data-action="nav-select" data-value="discography"><div class="label">ผลงาน</div><div class="value">${SEED_SINGLES.length+SEED_ALBUMS.length} ชิ้น</div></button>
        <div class="stat-cell"><div class="label">เซ็มบัตสึเฉลี่ย</div><div class="value">${mean} คน</div></div>
        <div class="stat-cell"><div class="label">มีเพลงอย่างน้อย 1</div><div class="value">${appearances.size} คน</div></div>
      </div>
      <h3 class="section-label" style="margin-top:6px;">ติดเพลงมากที่สุด</h3>
      ${top.map(([id,n])=>renderBarLink(getMember(id).name+' · '+getMember(id).nameTh, n, top[0][1],
          getGroup(getMember(id).groupId).color, 'open-member', {id})).join('')}
    </div>`;
  })()}

  <div class="group-card" style="--c:var(--gold)">
    <div class="group-head"><h2 style="font-size:21px;">ช่วงอายุ (ทุกวง)</h2></div>
    ${buckets.map(([lo,hi,label])=>renderBar(label, ages.filter(a=>a>=lo&&a<=hi).length, maxBucket, 'var(--gold)',
        {ageMin:lo||'', ageMax:hi>=99?'':hi})).join('')}
    <p class="stats-note">นับจาก ${ages.length} คนที่มีข้อมูลวันเกิด</p>
  </div>`;
}

function renderStatsSongs(){
  const tracks = allTracks();
  const appearances = new Map(), centres = new Map();
  for(const t of tracks){
    for(const id of t.members) appearances.set(id, (appearances.get(id)||0)+1);
    for(const id of t.centers) centres.set(id, (centres.get(id)||0)+1);
  }
  // A track can be a solo or a duet, so the mean says more than the range alone.
  const sizes = tracks.map(t=>t.members.length);
  const mean = sizes.length ? Math.round(sizes.reduce((s,n)=>s+n,0)/sizes.length) : 0;

  const top = (map, n) => [...map.entries()]
    .filter(([id])=>getMember(id))
    .sort((a,b)=> b[1]-a[1] || getMember(a[0]).name.localeCompare(getMember(b[0]).name))
    .slice(0, n);
  const byAppearance = top(appearances, 12);
  const byCentre     = top(centres, 12);
  const biggest = [...tracks].sort((a,b)=> b.members.length-a.members.length).slice(0, 8);

  const label = t => `${t.track} · ${WORK_KIND(t.work)==='album'?'อัลบั้ม':'ซิงเกิล'}ที่ ${t.work.num}`;
  const colour = id => getGroup(getMember(id).groupId).color;

  return `
  <div class="stat-grid">
    <div class="stat-cell"><div class="label">เพลงทั้งหมด</div><div class="value">${tracks.length} เพลง</div></div>
    <button class="stat-cell" data-action="nav-select" data-value="discography"><div class="label">ผลงาน</div><div class="value">${SEED_SINGLES.length + SEED_ALBUMS.length} ชิ้น</div></button>
    <div class="stat-cell"><div class="label">มีเพลงอย่างน้อย 1</div><div class="value">${appearances.size} คน</div></div>
    <div class="stat-cell"><div class="label">เซ็มบัตสึเฉลี่ย</div><div class="value">${mean} คน</div></div>
  </div>

  <div class="group-card" style="--c:var(--gold)">
    <div class="group-head"><h2 style="font-size:21px;">ติดเพลงมากที่สุด</h2></div>
    ${byAppearance.map(([id,n])=>renderBarLink(getMember(id).name+' · '+getMember(id).nameTh,
        n, byAppearance[0][1], colour(id), 'open-member', {id})).join('')}
    <p class="stats-note">นับทุกเพลงทั้งเพลงหลักและเพลงรอง รวมสมาชิกที่จบการศึกษาแล้ว</p>
  </div>

  <div class="group-card" style="--c:var(--gold)">
    <div class="group-head"><h2 style="font-size:21px;">เป็นเซ็นเตอร์มากที่สุด</h2></div>
    ${byCentre.length
      ? byCentre.map(([id,n])=>renderBarLink(getMember(id).name+' · '+getMember(id).nameTh,
          n, byCentre[0][1], colour(id), 'open-member', {id})).join('')
      : '<p class="muted-note">ไม่มีข้อมูลเซ็นเตอร์</p>'}
    <p class="stats-note">เพลงที่มีเซ็นเตอร์ร่วมกันหลายคน นับให้ทุกคน</p>
  </div>

  <div class="group-card" style="--c:var(--gold)">
    <div class="group-head"><h2 style="font-size:21px;">เซ็มบัตสึมากที่สุด</h2></div>
    ${biggest.map(t=>renderBarLink(label(t), t.members.length, biggest[0].members.length,
        getGroup(t.work.groupId).color, 'open-single', {id:t.work.id})).join('')}
  </div>`;
}

function renderStatsBirthdays(){
  const today = new Date(); today.setHours(0,0,0,0);
  const withBday = activeMembers().filter(m=>m.birthday);

  // Days until the next occurrence, so December birthdays surface in January.
  const daysUntil = m => {
    const [, mo, d] = m.birthday.split('-').map(Number);
    let next = new Date(today.getFullYear(), mo-1, d);
    if(next < today) next = new Date(today.getFullYear()+1, mo-1, d);
    return Math.round((next - today)/86400000);
  };
  const upcoming = withBday.map(m=>({m, d:daysUntil(m)})).sort((a,b)=>a.d-b.d).slice(0,8);
  const whenLabel = d => d===0 ? 'วันนี้!' : d===1 ? 'พรุ่งนี้' : `อีก ${d} วัน`;
  // calcAge counts birthdays already had, so the next one is always one more —
  // except on the day itself, where it has just been counted.
  const ageStep = (m, d) => {
    const a = calcAge(m.birthday);
    if(a==null) return '';
    const [from, to] = d===0 ? [a-1, a] : [a, a+1];
    return `<span class="age-step"><span class="from">${from}</span><span class="arrow">→</span><span class="to">${to}</span></span>`;
  };

  // The headline figures count everyone, graduates included: the clustering
  // only shows up across all 158, while the lists below stay on the current
  // line-up because an upcoming birthday only means something for a member
  // who is still in the group.
  const everyone = state.members.filter(m=>m.birthday);
  const byMonth = MONTH_NAMES.map((name,i)=>({
    name, mm:String(i+1).padStart(2,'0'),
    n:everyone.filter(m=>+m.birthday.slice(5,7)===i+1).length }));
  const ranked = [...byMonth].filter(x=>x.n).sort((a,b)=>b.n-a.n);
  const busiest = ranked[0], quietest = ranked[ranked.length-1];
  const maxMonth = busiest ? busiest.n : 1;

  const byDate = new Map();
  everyone.forEach(m=>{
    const d = m.birthday.slice(5);
    if(!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(m);
  });
  const shared = [...byDate.entries()].filter(([,list])=>list.length>1)
    .sort((a,b)=> b[1].length-a[1].length || a[0].localeCompare(b[0]));
  const sharedPeople = shared.reduce((n,[,list])=>n+list.length, 0);
  const topShared = shared.filter(([,list])=>list.length>=3);
  const dateLabel = d => `${+d.slice(3)} ${THAI_MONTHS[+d.slice(0,2)-1]}`;

  return `
  <div class="stat-grid">
    <button class="stat-cell" data-action="drill" data-month="${busiest?busiest.mm:''}">
      <div class="label">เดือนที่เกิดมากที่สุด</div>
      <div class="value">${busiest?busiest.name:'-'}</div>
      <div class="sub">${busiest?busiest.n+' คน':''}</div></button>
    <button class="stat-cell" data-action="drill" data-month="${quietest?quietest.mm:''}">
      <div class="label">เดือนที่เกิดน้อยที่สุด</div>
      <div class="value">${quietest?quietest.name:'-'}</div>
      <div class="sub">${quietest?quietest.n+' คน':''}</div></button>
    <div class="stat-cell"><div class="label">วันเกิดตรงกับคนอื่น</div>
      <div class="value">${sharedPeople} คน</div>
      <div class="sub">${shared.length} วันที่ซ้ำกัน</div></div>
    <div class="stat-cell"><div class="label">ซ้ำกันมากที่สุด</div>
      <div class="value">${topShared.length?topShared[0][1].length+' คน':'-'}</div>
      <div class="sub">${topShared.length?topShared.length+' วัน':''}</div></div>
  </div>

  <div class="group-card" style="--c:var(--gold)">
    <div class="group-head"><h2 style="font-size:21px;">แยกตามเดือนเกิด</h2>
      <span class="mono" style="font-size:12px;color:var(--ink-soft);">${everyone.length} คน ทุกวง รวมที่จบแล้ว</span></div>
    ${byMonth.map(x=>renderBar(x.name, x.n, maxMonth, 'var(--gold)', {month:x.mm})).join('')}
  </div>

  ${topShared.length ? `
  <div class="group-card" style="--c:var(--gold)">
    <div class="group-head"><h2 style="font-size:21px;">วันเกิดซ้ำกันมากที่สุด</h2></div>
    ${topShared.map(([d,list])=>`
      <div class="shared-day">
        <div class="shared-date">${dateLabel(d)}<span>${list.length} คน</span></div>
        <div class="shared-who">
          ${list.map(m=>{ const g=getGroup(m.groupId);
            return `<button class="chip-link" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
              ${escapeHtml(m.nameTh||m.name)}</button>`; }).join('')}
        </div>
      </div>`).join('')}
    <p class="stats-note">24 กุมภาพันธ์ ตรงกับวันศิลปินแห่งชาติ ซึ่งกำหนดตามวันพระราชสมภพของรัชกาลที่ 2
      — และวาเลนไทน์เกิดวันที่ 14 กุมภาพันธ์ ตรงกับชื่อตัวเองพอดี</p>
  </div>` : ''}

  <h3 class="section-label" style="margin-top:4px;">วันเกิดที่ใกล้ถึง</h3>
  <div class="bday-next">
    ${upcoming.map(({m,d})=>{
      const g = getGroup(m.groupId);
      return `<button class="bday-chip ${d===0?'today':''}" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
        ${renderAvatar(m,'avatar-sm',g.color)}
        <span><span class="when">${whenLabel(d)} · ${ageStep(m, d)}</span><span class="who" style="display:block;">${escapeHtml(m.nameTh||m.name)}</span></span>
      </button>`;
    }).join('')}
  </div>

  ${MONTH_NAMES.map((name,i)=>{
    const mm = String(i+1).padStart(2,'0');
    const inMonth = withBday.filter(m=>m.birthday.slice(5,7)===mm)
      .sort((a,b)=>a.birthday.slice(8).localeCompare(b.birthday.slice(8)));
    if(!inMonth.length) return '';
    return `<div class="month-block">
      <div class="month-head">
        <button class="link-inline strong" data-action="drill" data-month="${mm}">${name}</button>
        <span class="n">${inMonth.length} คน</span>
      </div>
      ${inMonth.map(m=>{
        const g = getGroup(m.groupId);
        const d = daysUntil(m);
        return `<button class="bday-row ${d===0?'is-today':''}" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
          <span class="day">${+m.birthday.slice(8)}</span>
          ${renderAvatar(m,'avatar-sm',g.color)}
          <span>${escapeHtml(m.nameTh||m.name)}</span>
          <span class="age">${ageStep(m, d)}</span>
        </button>`;
      }).join('')}
    </div>`;
  }).join('')}`;
}

/* Wherever a group, team, member, release or event is named, it can be
   followed. These are the one way each kind of thing is linked, so a name looks
   and behaves the same on every screen it turns up on. */
function linkGroup(g, text){
  if(!g) return escapeHtml(text || '');
  return `<button class="link-inline" data-action="filter-team-direct" data-group="${g.id}" data-team="all">${escapeHtml(text ?? g.name)}</button>`;
}
function linkTeam(t, text){
  if(!t) return escapeHtml(text || '');
  return `<button class="link-inline" data-action="filter-team-direct" data-group="${t.groupId}" data-team="${t.id}">${escapeHtml(text ?? t.name)}</button>`;
}
function linkMember(m, text){
  if(!m) return escapeHtml(text || '');
  return `<button class="link-inline" data-action="open-member" data-id="${m.id}">${escapeHtml(text ?? (m.nameTh || m.name))}</button>`;
}
function linkWork(w, text){
  if(!w) return escapeHtml(text || '');
  return `<button class="link-inline" data-action="open-single" data-id="${w.id}">${escapeHtml(text ?? w.title)}</button>`;
}
/** Captains are stored by name rather than id. */
function memberNamed(name, groupId){
  if(!name) return null;
  const same = state.members.filter(m => m.name === name && (!groupId || m.groupId === groupId));
  return same.find(m => !m.graduated) || same[0] || null;
}
function groupTag(g){
  return `<button class="ev-group" style="--c:${g.color}" data-action="filter-team-direct" data-group="${g.id}" data-team="all">${g.name}</button>`;
}

/* Following a link out of a sheet goes to another screen, so nothing that was
   drawn over the old one may linger over the new one. Back still returns to it:
   the sheet is its own history entry. */
function leaveOverlays(){
  state.selectedId = null; state.selectedEvent = null; state.editingId = null;
  state.compareWith = null; state.comparePicking = false; state.posterOf = null;
}

/* The events a member is booked for, split by where they sit in time. An event
   happening today is neither upcoming nor past, so it gets its own heading at the
   top — with the live countdown to its start if it has a time, or which day of
   the run it is. When the day ends, the clock's redraw moves it to past. */
function renderMemberEvents(m){
  const iso = toYmd(todayStart());
  // On a rota what counts is her own turn, not the whole run: a booth that
  // opened on the 17th is not "today" for someone whose slot is the 22nd.
  const evs = allEvents().filter(e => (e.members || []).includes(m.id)).map(e => {
    if(!e.slots) return e;
    const mine = slotsFor(e, m.id);
    const next = mine.find(s => s.date >= iso) || mine[mine.length - 1];
    return Object.assign(Object.create(e), {
      start: next.date, end: undefined,
      memberDays: { [m.id]: mine.filter(s => s.date >= iso).map(s => {
        const [, mo, d] = s.date.split('-').map(Number);
        return `${d} ${monthsShort()[mo-1]} ${s.time}`; }).join(', ') || null },
    });
  });
  if(!evs.length) return '';
  const today = evs.filter(e => e.start <= iso && eventLastDay(e) >= iso);
  const upcoming = evs.filter(e => e.start > iso).sort((a,b) => a.start.localeCompare(b.start));
  const past = evs.filter(e => eventLastDay(e) < iso).sort((a,b) => b.start.localeCompare(a.start));

  const colour = e => {
    const g = (e.groups || []).length === 1 ? getGroup(e.groups[0]) : getGroup(m.groupId);
    return g ? g.color : 'var(--ink-soft)';
  };
  const dayOfRun = e => {
    if(!e.end) return 'วันนี้';
    const n = Math.round((parseYmd(iso) - parseYmd(e.start)) / 86400000) + 1;
    const total = Math.round((parseYmd(e.end) - parseYmd(e.start)) / 86400000) + 1;
    return `วันที่ ${n} จาก ${total}`;
  };
  const row = (e, kind) => {
    const at = kind === 'today' ? startsAt(e, iso) : null;
    const personal = e.memberDays && e.memberDays[m.id];
    const tag = kind === 'today'
      ? (at ? `<span class="cal-item-tag" data-starts-at="${at}">${startsLabel(at)}</span>`
            : `<span class="cal-item-tag">${dayOfRun(e)}</span>`)
      : `<span class="cal-item-tag">${personal || eventDateLabel(e)}</span>`;
    return `<button class="cal-item${kind === 'past' ? ' is-past' : ''}${kind === 'today' ? ' is-today' : ''}"
      style="--c:${colour(e)}" data-action="open-event" data-id="${e.id}">
      ${tag}<span>${escapeHtml(e.title)}</span>
    </button>`;
  };

  return `
    ${today.length ? `<h3 class="section-label">วันนี้</h3>${today.map(e => row(e, 'today')).join('')}` : ''}
    ${upcoming.length ? `<h3 class="section-label">งานที่จะถึง</h3>${upcoming.map(e => row(e, 'up')).join('')}`
      : today.length ? '' : `<h3 class="section-label">งานที่จะถึง</h3><p class="muted-note">ยังไม่มีงานที่จะถึง</p>`}
    ${past.length ? `<h3 class="section-label">งานที่ผ่านมา</h3>${past.map(e => row(e, 'past')).join('')}` : ''}`;
}

function renderStatsTimeline(){
  // One entry per year, merging what the database actually knows: group
  // debuts, single releases and graduations.
  const years = {};
  const slot = y => (years[y] = years[y] || { debuts:[], singles:[], grads:[] });
  GROUPS.forEach(g=> slot(+g.debut.slice(0,4)).debuts.push(g));
  SEED_SINGLES.forEach(s=> slot(s.year).singles.push(s));
  state.members.filter(m=>m.graduated).forEach(m=> slot(+m.graduated.slice(0,4)).grads.push(m));

  const sorted = Object.keys(years).map(Number).sort((a,b)=>b-a);
  return `
  <div class="timeline" style="margin-top:6px;">
    ${sorted.map(y=>{
      const e = years[y];
      const byGroup = gid => e.grads.filter(m=>m.groupId===gid);
      return `<div class="timeline-item" style="--c:var(--ink-soft)">
        <div class="year-head">${y}</div>
        ${e.debuts.map(g=>`<div class="ev-row" style="--c:${g.color}"><span class="ev-dot"></span>
          <span><b>${linkGroup(g)}</b> เดบิวต์ · ${formatDate(g.debut)}</span></div>`).join('')}
        ${e.singles.length ? GROUPS.map(g=>{
          const ss = e.singles.filter(s=>s.groupId===g.id).sort((a,b)=>a.num-b.num);
          if(!ss.length) return '';
          return `<div class="ev-row" style="--c:${g.color}"><span class="ev-dot"></span>
            <span>${linkGroup(g)} ปล่อย ${ss.length} ซิงเกิล <span class="ev-names">${ss.map(s=>linkWork(s)).join(' · ')}</span></span></div>`;
        }).join('') : ''}
        ${GROUPS.map(g=>{
          const gs = byGroup(g.id);
          if(!gs.length) return '';
          return `<div class="ev-row" style="--c:${g.color}"><span class="ev-dot"></span>
            <span>${gs.length} คนจบการศึกษาจาก ${linkGroup(g)}
            <span class="ev-names">${gs.map(m=>`<button class="link-inline" data-action="open-member" data-id="${m.id}">${escapeHtml(m.nameTh||m.name)}</button>`).join(' · ')}</span></span></div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function renderStats(){
  const body = state.statsTab==='birthdays' ? renderStatsBirthdays()
             : state.statsTab==='timeline'  ? renderStatsTimeline()
             : state.statsTab==='songs'     ? renderStatsSongs()
             : renderStatsOverview();
  return `
  <div class="filter-bar">
    <div class="subtab-bar">
      ${STATS_TABS.map(t=>`<button class="subtab ${state.statsTab===t.id?'active':''}"
        data-action="stats-tab" data-value="${t.id}">${t.label}</button>`).join('')}
    </div>
  </div>
  ${body}`;
}

function renderAuth(){
  const mode = state.authMode || 'signin';
  return `
  <button class="back-btn" data-action="go-back">\u2190 กลับ</button>
  <div class="auth-card">
    <h2 class="display" style="margin:0 0 4px;font-size:22px;">${mode==='signup'?'สร้างบัญชีใหม่':'เข้าสู่ระบบ'}</h2>
    <p class="muted-note" style="margin:0 0 20px;">เข้าสู่ระบบเพื่อบันทึก Oshi ของคุณไว้ถาวร และเข้าจากอุปกรณ์ไหนก็ได้</p>
    <button type="button" id="google-signin-btn" class="btn-secondary" style="width:100%;justify-content:center;display:flex;gap:8px;align-items:center;">
      <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.88 2.69-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.97H.96C.35 6.18 0 7.55 0 9s.35 2.82.96 4.03l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
      เข้าสู่ระบบด้วย Google
    </button>
    <div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--ink-soft);font-size:12px;">
      <div style="flex:1;height:1px;background:var(--line);"></div>หรือ<div style="flex:1;height:1px;background:var(--line);"></div>
    </div>
    <form id="auth-form" novalidate>
      <div class="form-field" style="margin-bottom:12px;"><label>อีเมล</label><input id="auth-email-input" name="email" type="email" autocomplete="email"></div>
      <div class="form-field" style="margin-bottom:6px;"><label>รหัสผ่าน</label><input id="auth-password-input" name="password" type="password" autocomplete="${mode==='signup'?'new-password':'current-password'}"></div>
      <p id="auth-status" class="auth-error" style="display:none;"></p>
      <button type="button" id="auth-submit-btn" class="btn-add" style="width:100%;justify-content:center;margin-top:12px;">${mode==='signup'?'สร้างบัญชี':'เข้าสู่ระบบ'}</button>
    </form>
    <p class="auth-switch">
      ${mode==='signup'
        ? `มีบัญชีอยู่แล้ว? <button type="button" data-action="auth-switch-mode" data-mode="signin">เข้าสู่ระบบ</button>`
        : `ยังไม่มีบัญชี? <button type="button" data-action="auth-switch-mode" data-mode="signup">สร้างบัญชีใหม่</button>`}
    </p>
  </div>`;
}

function renderEditProfile(){
  const acc = state.account || {name:'', email:''};
  return `
  <button class="back-btn" data-action="go-back">\u2190 กลับ</button>
  <h2 class="display" style="margin:0 0 18px;font-size:22px;">แก้ไขข้อมูลส่วนตัว</h2>
  <form id="editprofile-form" novalidate style="max-width:420px;">
    <div class="form-field" style="margin-bottom:14px;"><label>ชื่อที่แสดง</label><input id="edit-name-input" name="name" value="${escapeAttr(acc.name)}"></div>
    <div class="form-field" style="margin-bottom:6px;"><label>อีเมล</label><input value="${escapeAttr(acc.email)}" disabled style="opacity:.6;"></div>
    <p id="edit-status" class="auth-error" style="display:none;"></p>
    <div class="action-row">
      <button type="button" id="edit-save-btn" class="btn-add">บันทึก</button>
      <button type="button" class="btn-secondary" data-action="nav" data-view="profile">ยกเลิก</button>
    </div>
  </form>`;
}

function renderSingleDetail(){
  const s = findWork(state.selectedSingle);
  if(!s) return '';
  const isAlbum = WORK_KIND(s) === 'album';
  const g = getGroup(s.groupId);
  const tracks = SEED_SENBATSU[s.id];
  const card = (id, isCentre) => { const m = getMember(id); return m ? renderMiniCard(m, isCentre) : ''; };

  // The first track is the single's title song; the rest are its coupling songs.
  const renderTrack = (t, i) => {
    const rest = t.members.filter(id=>!t.centers.includes(id));
    const tag = isAlbum ? (i===0?'เพลงไตเติล':'เพลงในอัลบั้ม') : (i===0?'เพลงหลัก':'เพลงรอง');
    return `
    <div class="track-block${i===0?' is-lead':''}" style="--c:${getGroup(s.groupId).color}">
      <div class="track-head">
        <span class="track-tag ${i===0?'lead':''}">${tag}</span>
        <span class="track-name">${escapeHtml(t.track)}</span>
      </div>
      <div class="track-sub">${t.members.length} คน${t.centers.length
        ? ' · เซ็นเตอร์ ' + t.centers.map(id=>linkMember(getMember(id))).join(', ')
        : ''}</div>
      <div class="grid-mini">
        ${t.centers.map(id=>card(id, true)).join('')}
        ${rest.map(id=>card(id, false)).join('')}
      </div>
      ${renderStage(s, i, t)}
    </div>`;
  };

  return `
  <div class="release-page">
  <button class="back-btn" data-action="go-back">← กลับ</button>
  <div class="single-head" style="--c:${g.color}">
    <div class="timeline-year">${workGroups(s).map(id => linkGroup(getGroup(id))).join(' × ')} · ${workLabel(s)} · ${s.year}</div>
    <h2>${escapeHtml(s.title)}</h2>
    ${s.alt?`<p class="single-th">${escapeHtml(s.alt)}</p>`:''}
    ${s.note?`<p class="muted-note">${escapeHtml(s.note)}</p>`:''}
  </div>
  ${(()=>{ // an album lists its singles; a single should lead back to its album too
    if(isAlbum) return '';
    const albums = SEED_ALBUMS.filter(a => (a.singles || []).includes(s.id));
    return albums.length ? `
    <h3 class="section-label">อยู่ในอัลบั้ม</h3>
    <div class="album-singles">
      ${albums.map(a=>`<button class="chip chip-link" data-action="open-single" data-id="${a.id}">${escapeHtml(a.title)}</button>`).join('')}
    </div>` : ''; })()}
  ${isAlbum && s.singles.length ? `
    <h3 class="section-label">ซิงเกิลที่รวมอยู่ในอัลบั้ม</h3>
    <div class="album-singles">
      ${s.singles.map(sid=>{ const x=SEED_SINGLES.find(y=>y.id===sid); return x
        ? `<button class="chip chip-link" data-action="open-single" data-id="${x.id}">${escapeHtml(x.title)}</button>` : ''; }).join('')}
    </div>` : ''}
  ${!tracks || !tracks.length ? (isSpecialWork(s) ? `
    <div class="empty-state"><p>ยังไม่ทราบรายชื่อผู้ร้อง</p></div>` : `
    <div class="empty-state">
      <p>ยังไม่มีข้อมูลเซ็มบัตสึของซิงเกิลนี้</p>
      <p class="muted-note">เพิ่มได้ที่ SEED_SENBATSU ในไฟล์ index.html</p>
    </div>`)
  : tracks.map(renderTrack).join('')}</div>`;
}

const DISC_TABS = [{ id:'singles', label:'ซิงเกิล' }, { id:'albums', label:'อัลบั้ม' }, { id:'specials', label:'เพลงพิเศษ' }];

function renderWorkRow(w, kind){
  const g = getGroup(w.groupId);
  const tracks = SEED_SENBATSU[w.id];
  const lead = tracks && tracks[0];
  const nick = id => { const m = getMember(id); return escapeHtml(m ? (m.nameTh||m.name) : ''); };
  // Only a numbered single or a special single has a senbatsu; a digital
  // single just has the people who sang it.
  const who = kind==='album' ? 'เพลงประจำอัลบั้ม ' : kind==='digital' ? '' : 'เซ็มบัตสึ ';
  return `<button class="timeline-item single-row" style="--c:${g.color}" data-action="open-single" data-id="${w.id}">
    <div class="timeline-year">${w.year} · ${workGroupNames(w)} · ${workLabel(w)}</div>
    <div class="timeline-title">${escapeHtml(w.title)}${w.alt?` <span class="title-alt">${escapeHtml(w.alt)}</span>`:''}</div>
    <div class="single-meta">${lead
      ? `${who}${lead.members.length} คน`
        + (lead.centers.length?' · เซ็นเตอร์ '+lead.centers.map(nick).join(', '):'')
        + (tracks.length>1 ? ` · อีก ${tracks.length-1} เพลง` : '')
      : isSpecialWork(w) ? 'ยังไม่ทราบรายชื่อผู้ร้อง' : 'ยังไม่มีข้อมูลเซ็มบัตสึ'}</div>
  </button>`;
}

function renderDiscography(){
  const inGroup = x => state.groupFilter==='all' || workGroups(x).includes(state.groupFilter);
  const tabBar = `
  <div class="filter-bar">
    ${renderGroupPills()}
    <div class="subtab-bar disc-tabs" style="margin-left:auto;">
      ${DISC_TABS.map(t=>`<button class="subtab ${state.discTab===t.id?'active':''}"
        data-action="disc-tab" data-value="${t.id}">${t.label}</button>`).join('')}
    </div>
  </div>`;

  const singles = SEED_SINGLES.filter(inGroup).sort((a,b)=> b.year-a.year || b.num-a.num);
  const albums = SEED_ALBUMS.filter(inGroup).sort((a,b)=> b.year-a.year || b.num-a.num);
  const specials = SEED_SPECIALS.filter(inGroup).sort((a,b)=> b.date.localeCompare(a.date));
  const cols = {
    singles: { rows: singles.map(s=>renderWorkRow(s,'single')).join(''), note:'' },
    albums: { rows: albums.map(a=>renderWorkRow(a,'album')).join(''),
      note:'อัลบั้มรวมเพลงจากซิงเกิลที่ออกก่อนหน้า และมีเพลงเฉพาะอัลบั้มเพิ่มมา — แสดงเฉพาะเพลงเฉพาะอัลบั้ม' },
    specials: { rows: specials.map(w=>renderWorkRow(w, WORK_KIND(w))).join(''),
      note:'ซิงเกิลพิเศษและซิงเกิลดิจิทัลนอกเหนือจากซิงเกิลและอัลบั้มหลัก — ไม่นับรวมในสถิติเพลง' },
  };
  const counts = { singles: singles.length, albums: albums.length, specials: specials.length };

  // A phone shows the tab it is on; a wide screen shows all three side by side
  // and the tabs go away. Each column carries its own heading for that case.
  return tabBar + `
  <div class="disc-cols">
    ${DISC_TABS.map(t => `
    <section class="disc-col${state.discTab===t.id ? ' is-active' : ''}">
      <h2 class="section-label disc-col-head">${t.label} · ${counts[t.id]}</h2>
      <div class="timeline">${cols[t.id].rows}</div>
      ${cols[t.id].note ? `<p class="muted-note" style="margin-top:10px;">${cols[t.id].note}</p>` : ''}
    </section>`).join('')}
  </div>`;
}

function renderForm(){
  const editing = state.editingId ? getMember(state.editingId) : null;
  const m = editing || { name:'', nameTh:'', realName:'', realNameTh:'', groupId:GROUPS[0].id, teamId:getTeamsForGroup(GROUPS[0].id)[0].id, gen:'', birthday:'', height:'', blood:'', photo:'', facts:[] };
  const teamsForGroup = getTeamsForGroup(m.groupId);
  return `
  <button class="back-btn" type="button" data-action="cancel-form">\u2190 ยกเลิก</button>
  <h2 class="display" style="margin:0 0 18px;font-size:22px;">${editing?'แก้ไขข้อมูลสมาชิก':'เพิ่มสมาชิกใหม่'}</h2>
  <form id="member-form" novalidate>
    <div class="form-grid">
      <div class="form-field"><label>ชื่อเล่น (อังกฤษ)</label><input name="name" required value="${escapeAttr(m.name)}"></div>
      <div class="form-field"><label>ชื่อเล่น (ไทย)</label><input name="nameTh" required value="${escapeAttr(m.nameTh)}"></div>
      <div class="form-field"><label>ชื่อจริง (อังกฤษ)</label><input name="realName" value="${escapeAttr(m.realName)}"></div>
      <div class="form-field"><label>ชื่อจริง (ไทย)</label><input name="realNameTh" value="${escapeAttr(m.realNameTh)}"></div>
      <div class="form-field"><label>วง</label>
        <select name="groupId" id="form-group-select">
          ${GROUPS.map(g=>`<option value="${g.id}" ${m.groupId===g.id?'selected':''}>${g.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>ทีม</label>
        <select name="teamId" id="form-team-select">
          ${teamsForGroup.map(t=>`<option value="${t.id}" ${m.teamId===t.id?'selected':''}>${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>รุ่นที่</label><input name="gen" type="number" min="1" value="${m.gen||''}"></div>
      <div class="form-field"><label>วันเกิด</label><input name="birthday" type="date" value="${m.birthday||''}"></div>
      <div class="form-field"><label>ส่วนสูง (ซม.)</label><input name="height" type="number" value="${m.height||''}"></div>
      <div class="form-field"><label>กรุ๊ปเลือด</label>
        <select name="blood">
          <option value="">-</option>
          ${['A','B','AB','O'].map(b=>`<option value="${b}" ${m.blood===b?'selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>บ้านเกิด</label><input name="hometown" value="${escapeAttr(m.hometown||'')}"></div>
      <div class="form-field full"><label>งานอดิเรก</label><input name="hobby" value="${escapeAttr(m.hobby||'')}"></div>
      <div class="form-field full"><label>สิ่งที่ชอบ</label><input name="likes" value="${escapeAttr(m.likes||'')}"></div>
      <div class="form-field full"><label>ลิงก์รูปภาพ (วางลิงก์รูปที่คุณเลือกเอง — เว้นว่างได้)</label><input name="photo" type="url" placeholder="https://..." value="${escapeAttr(m.photo||'')}"></div>
      <div class="form-field full"><label>ข้อเท็จจริง (บรรทัดละ 1 ข้อ)</label><textarea name="facts" rows="4">${(m.facts||[]).join('\n')}</textarea></div>
    </div>
    <div class="action-row">
      <button type="submit" class="btn-add">บันทึก</button>
      <button type="button" class="btn-secondary" data-action="cancel-form">ยกเลิก</button>
    </div>
  </form>`;
}

/* ---------------------- Event editing (admins) ----------------------
   The whole point of moving the schedule into Firestore: this screen writes
   to it, and everyone else's copy follows within a refresh. It is deliberately
   the same shape as the member form — same field grid, same buttons — because
   it is the same job and does not need a second set of habits. */
function renderEventForm(){
  const editing = state.editingEvent ? getEvent(state.editingEvent) : null;
  const e = editing || { id:'', title:'', start:'', end:'', time:'', venue:'', mapUrl:'', members:[] };
  const chosen = new Set(e.members || []);
  const byGroup = GROUPS.map(g => ({
    group: g,
    members: activeMembers().filter(m => m.groupId === g.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  })).filter(x => x.members.length);

  return `
  <button class="back-btn" type="button" data-action="cancel-event-form">← ยกเลิก</button>
  <h2 class="display" style="margin:0 0 18px;font-size:22px;">${editing ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}</h2>
  <form id="event-form" novalidate>
    <div class="form-grid">
      <div class="form-field full"><label>ชื่องาน</label>
        <input name="title" required value="${escapeAttr(e.title)}"></div>
      <div class="form-field"><label>วันเริ่ม</label>
        <input name="start" type="date" required value="${escapeAttr((e.start || '').slice(0,10))}"></div>
      <div class="form-field"><label>วันจบ (เว้นว่างถ้าวันเดียว)</label>
        <input name="end" type="date" value="${escapeAttr((e.end || '').slice(0,10))}"></div>
      <div class="form-field"><label>เวลา</label>
        <input name="time" type="time" value="${escapeAttr(e.time || '')}"></div>
      <div class="form-field"><label>สถานที่</label>
        <input name="venue" value="${escapeAttr(e.venue || '')}"></div>
      <div class="form-field full"><label>ลิงก์แผนที่ (วางลิงก์จาก Google Maps — เว้นว่างได้)</label>
        <input name="mapUrl" type="url" placeholder="https://maps.app.goo.gl/..." value="${escapeAttr(e.mapUrl || '')}"></div>
      <div class="form-field full"><label>สมาชิกที่ร่วมงาน (${chosen.size} คน)</label>
        <div class="member-picker">
          ${byGroup.map(({ group, members }) => `
            <p class="member-picker-group" style="--c:${group.color}">${group.name}</p>
            ${members.map(m => `
              <label class="member-pick">
                <input type="checkbox" name="members" value="${escapeAttr(m.id)}" ${chosen.has(m.id) ? 'checked' : ''}>
                <span>${escapeHtml(m.name)}${m.nameTh ? ` · ${escapeHtml(m.nameTh)}` : ''}</span>
              </label>`).join('')}`).join('')}
        </div>
      </div>
    </div>
    <div class="action-row">
      <button type="submit" class="btn-add">บันทึก</button>
      <button type="button" class="btn-secondary" data-action="cancel-event-form">ยกเลิก</button>
      ${editing ? `<button type="button" class="btn-danger" data-action="delete-event"
        data-id="${escapeAttr(editing.id)}">ลบงานนี้</button>` : ''}
    </div>
  </form>`;
}

/* A readable id beats a timestamp when the next person is looking at the
   database by hand: the date sorts it, the title says what it is. */
function eventIdFrom(start, title){
  const slug = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙\s-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 40);
  return `${start}-${slug || 'event'}`;
}
