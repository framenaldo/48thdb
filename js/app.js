// ============================= RENDER: ROOT =============================
const ADV_INPUTS = { 'age-min':'ageMin', 'age-max':'ageMax', 'height-min':'heightMin', 'height-max':'heightMax' };
const NAV_HIDDEN_VIEWS = ['auth','editprofile','form'];
/* The running sign under the header: whatever is worth knowing right now,
   most pressing first, never more than four at a time. Each item names what it
   is about and opens it. Built on every draw, but only swapped in when its
   words change, so the scroll does not jump back to the start on a tap. */
const TICKER_KINDS = {
  live:   { th:'LIVE',     en:'LIVE',     color:'#1E9E57' },
  today:  { th:'วันนี้',     en:'TODAY',    color:'#138A8A' },
  news:   { th:'ประกาศ',    en:'NEWS',     color:'#3A66D6' },
  hbd:    { th:'HBD',      en:'HBD',      color:'#E0457B' },
  ticket: { th:'บัตร',      en:'TICKETS',  color:'#C8961E' },
  vote:   { th:'โหวต',      en:'VOTE',     color:'#C8231A' },
  result: { th:'ผลโหวต',    en:'RESULTS',  color:'#C8231A' },
};
const TICKER_MAX = 4;

/* Folded or open is the reader's choice and stays that way until they change
   it; folded, the sign keeps a slim bar saying how many updates are waiting. */
function tickerFolded(){
  try{ return localStorage.getItem('48thdb-ticker-folded') === '1'; }catch(e){ return false; }
}

function tickerItems(){
  const iso = toYmd(todayStart());
  const en = isEN();
  const now = Date.now();
  const mine = filteringByOshi();
  const day = s => { const [, m, d] = s.slice(0,10).split('-').map(Number); return `${d} ${monthsShort()[m-1]}`; };
  const daysTo = s => Math.round((parseYmd(s.slice(0,10)) - parseYmd(iso)) / 86400000);
  const hm = s => s.slice(11, 16);
  const nick = m => m.nameTh && !en ? m.nameTh : m.name;
  const ev = (e) => ({ action:'open-event', id:e.id });
  const items = [];

  // 1. on now, or on later today
  for(const e of allEvents().filter(e => !e.period && e.start <= iso && eventLastDay(e) >= iso)){
    if(e.slots){
      const { current, next } = slotNow(e, iso);
      const s = current || next;
      if(!s) continue;
      const who = s.members.map(getMember).filter(Boolean);
      if(mine && !who.some(isMyOshi)) continue;
      items.push({ kind: current ? 'live' : 'today', to: ev(e), parts: [
        current ? (en ? `Now at ${e.title}` : `ตอนนี้ที่ ${e.title}`) : (en ? `${s.time} · ${e.title}` : `${s.time} น. · ${e.title}`),
        who.map(nick).join(' · '),
        current ? (en ? `until ${s.until}` : `ถึง ${s.until} น.`) : null ] });
      continue;
    }
    if(mine && !hasMyOshi(e)) continue;
    if(doneForToday(e, iso)) continue;
    const at = e.time ? slotTime(iso, e.time) : null;
    const started = !at || at <= now;
    items.push({ kind: started ? 'live' : 'today', to: ev(e), parts: [
      started ? e.title : (en ? `${e.time} · ${e.title}` : `${e.time} น. · ${e.title}`),
      e.venue || null ] });
  }

  // what is on right now goes ahead of what is only later today (sort is stable)
  items.sort((a, b) => (a.kind === 'today') - (b.kind === 'today'));

  // 2. announcements written into an event: { from, to, th, en }
  for(const e of allEvents().filter(e => e.announce)){
    if(mine && !hasMyOshi(e)) continue;
    for(const a of e.announce.filter(a => a.from <= iso && a.to >= iso))
      items.push({ kind:'news', to: ev(e), parts: [en ? (a.en || a.th) : a.th] });
  }

  // 3. birthdays today
  const born = activeMembers().filter(m => m.birthday && m.birthday.slice(5) === iso.slice(5))
    .filter(m => !mine || isMyOshi(m));
  if(born.length) items.push({ kind:'hbd', parts: [
    en ? 'Happy birthday' : 'สุขสันต์วันเกิด',
    ...born.map(m => { const a = calcAge(m.birthday);
      return { text: `${nick(m)}${a != null ? (en ? ` (${a})` : ` อายุ ${a} ปี`) : ''}`, action:'open-member', id:m.id }; }) ] });

  // 4. ticket sales opening today, or closing within three days
  for(const e of allEvents().filter(e => e.sales && !e.bookClosed)){
    if(mine && !hasMyOshi(e)) continue;
    const { from, to } = e.sales;
    if(from && from.slice(0,10) === iso && slotTime(iso, hm(from)) > now - 3600000)
      items.push({ kind:'ticket', to: ev(e), parts: [e.title, en ? `Tickets on sale today ${hm(from)}` : `เปิดขายบัตรวันนี้ ${hm(from)} น.`] });
    if(to){
      const k = daysTo(to);
      if(k >= 0 && k <= 3 && slotTime(to.slice(0,10), hm(to)) > now)
        items.push({ kind:'ticket', to: ev(e), parts: [e.title,
          k === 0 ? (en ? `Ticket sales close today ${hm(to)}` : `ปิดขายบัตรวันนี้ ${hm(to)} น.`)
                  : (en ? `Ticket sales close in ${k} ${k === 1 ? 'day' : 'days'} (${day(to)} ${hm(to)})` : `ปิดขายบัตรอีก ${k} วัน (${day(to)} ${hm(to)} น.)`)] });
    }
  }

  // 5. a vote: open, on its last day, or waiting on results
  for(const e of allEvents().filter(e => e.ticker)){
    const results = getEvent(e.ticker.results);
    const last = eventLastDay(e);
    const res = results ? (en ? `Results ${day(results.start)}` : `ประกาศผล ${day(results.start)}`) : null;
    if(e.start <= iso && last >= iso){
      const left = daysTo(last);
      items.push({ kind:'vote', to: ev(e), parts: left === 0
        ? [en ? 'Last day to vote!' : 'วันสุดท้าย! ปิดโหวตวันนี้', e.ticker.name, res]
        : [en ? 'Voting is open' : 'เปิดโหวตแล้ว', e.ticker.name,
           en ? `${left} ${left === 1 ? 'day' : 'days'} left` : `เหลืออีก ${left} วัน`, res] });
    } else if(results && last < iso && results.start >= iso){
      const k = daysTo(results.start);
      items.push({ kind:'result', to: ev(results), parts: [e.ticker.name,
        k === 0 ? (en ? 'Results today!' : 'ประกาศผลวันนี้!')
                : (en ? `Voting has closed · results in ${k} ${k === 1 ? 'day' : 'days'}` : `ปิดโหวตแล้ว · ประกาศผลอีก ${k} วัน`)] });
    }
  }

  return items.map(it => ({ ...it, parts: it.parts.filter(Boolean) })).slice(0, TICKER_MAX);
}

function renderTicker(){
  const items = tickerItems();
  if(!items.length) return '';
  const en = isEN();
  const chevron = up => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
  if(tickerFolded()){
    return `<button class="ticker is-folded" data-action="toggle-ticker" aria-expanded="false"
      aria-label="${en ? 'Show updates' : 'แสดงอัปเดต'}">
      <span class="ticker-badge"><span class="ticker-dot"></span>48</span>
      <span class="ticker-folded-text">${en ? `${items.length} ${items.length === 1 ? 'update' : 'updates'}` : `อัปเดต ${items.length} เรื่อง`}
        ${[...new Set(items.map(it => it.kind))].map(k => `<span class="ticker-kind" style="--k:${TICKER_KINDS[k].color}">${en ? TICKER_KINDS[k].en : TICKER_KINDS[k].th}</span>`).join('')}</span>
      <span class="ticker-close">${chevron(false)}</span>
    </button>`;
  }
  const part = (p, to) => {
    const text = typeof p === 'string' ? p : p.text;
    const act = typeof p === 'string' ? to : { action:p.action, id:p.id };
    return act
      ? `<button class="ticker-link" data-action="${act.action}" data-id="${escapeAttr(act.id)}">${escapeHtml(text)}</button>`
      : `<span>${escapeHtml(text)}</span>`;
  };
  const run = items.map(it => {
    const k = TICKER_KINDS[it.kind];
    return `<span class="ticker-item"><span class="ticker-kind" style="--k:${k.color}">${en ? k.en : k.th}</span>${
      it.parts.map(p => part(p, it.to)).join('<span class="ticker-dot-sep" aria-hidden="true">·</span>')}</span>`;
  }).join('<span class="ticker-sep" aria-hidden="true">✦</span>') + '<span class="ticker-sep" aria-hidden="true">✦</span>';
  const words = items.flatMap(it => it.parts.map(p => typeof p === 'string' ? p : p.text)).join(' ');
  const secs = Math.max(14, Math.round(words.length * 0.3));
  return `<div class="ticker" role="region" aria-label="${en ? 'Updates' : 'อัปเดต'}">
    <span class="ticker-badge"><span class="ticker-dot"></span>48</span>
    <span class="ticker-window"><span class="ticker-track" style="--dur:${secs}s">
      <span class="ticker-run">${run}</span><span class="ticker-run" aria-hidden="true">${run}</span>
    </span></span>
    <button class="ticker-close" data-action="toggle-ticker" aria-expanded="true" title="${en ? 'Fold' : 'หุบ'}" aria-label="${en ? 'Fold updates' : 'หุบอัปเดต'}">${chevron(true)}</button>
  </div>`;
}

function syncTicker(){
  const slot = document.getElementById('ticker-slot');
  if(!slot) return;
  const html = renderTicker();
  if(slot.dataset.html === html) return;
  slot.dataset.html = html;
  slot.innerHTML = html;
  localize(slot);
}

function render(){
  const app = document.getElementById('app');
  app.innerHTML = renderHeader() + '<div id="ticker-slot"></div><div id="nav-container"></div><main id="main"></main>';
  renderProfileSlot();
  renderMain();
}
function syncBodyScrollLock(){
  const shouldLock = !!state.selectedId || !!state.selectedEvent;
  const isLocked = document.body.classList.contains('modal-locked');
  if(shouldLock && !isLocked){
    state._savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('modal-locked');
    document.body.style.top = `-${state._savedScrollY}px`;
  } else if(!shouldLock && isLocked){
    const y = state._savedScrollY || 0;
    document.body.classList.remove('modal-locked');
    document.body.style.top = '';
    scrollPageTo(y);
  }
}

let _lastRenderedView = null;
function renderMain(){
  // selectedSingle only means anything on the single view. Clearing it here
  // rather than in each caller keeps it from lingering in a history snapshot
  // and making two identical screens look different to isSameScreen.
  if(state.view !== 'single') state.selectedSingle = null;
  const navContainer = document.getElementById('nav-container');
  if(navContainer) syncNav(navContainer);
  const main = document.getElementById('main');
  main.innerHTML =
    (state.query.trim() ? renderSearch() :
    state.view==='feed' ? renderFeed() :
    state.view==='browse' ? renderBrowse() :
    state.view==='groups' ? renderGroups() :
    state.view==='org' ? renderOrgChart() :
    state.view==='discography' ? renderDiscography() :
    state.view==='stats' ? renderStats() :
    state.view==='single' ? renderSingleDetail() :
    state.view==='profile' ? renderProfile() :
    state.view==='auth' ? renderAuth() :
    state.view==='editprofile' ? renderEditProfile() :
    renderForm())
    + (state.comparePicking ? renderComparePicker()
       : state.compareWith && state.selectedId ? renderCompareModal()
       : state.selectedId ? renderDetailModal() : '')
    + (state.selectedEvent ? renderEventModal() : '')
    // Last, because it opens over a sheet. Sharing z-index 60 with the sheets
    // meant whichever was written later won, and that was the sheet.
    + (state.posterOf ? renderPosterViewer() : '');
  if(state.view !== _lastRenderedView){
    main.classList.remove('view-fade-in');
    void main.offsetWidth;
    main.classList.add('view-fade-in');
    _lastRenderedView = state.view;
  }
  _drawnDay = toYmd(new Date());
  syncTicker();
  localize(document.getElementById('app'));
  syncBodyScrollLock();
  attachMainEvents();
  startBirthdayFireworks();
  bindEdgeFades();
  bindPosterZoom();
  bindOrgZoom();
}

function updateOshiButtonsFor(id){
  const m = getMember(id);
  if(!m) return;
  const isOshi = state.oshi.includes(id);
  const isKami = state.kamiOshi === id;
  const favInner = isKami ? `<span class="crown-ico" title="Kami Oshi">${ICONS.crown}</span>` : (isOshi?'\u2605':'\u2606');

  document.querySelectorAll(`.fav-btn-sm[data-id="${id}"]`).forEach(btn=>{
    btn.innerHTML = favInner;
    btn.classList.toggle('is-oshi', isOshi);
    btn.classList.remove('star-pop'); void btn.offsetWidth; btn.classList.add('star-pop');
  });
  document.querySelectorAll(`.oshi-btn[data-id="${id}"]`).forEach(btn=>{
    btn.innerHTML = `<span>${isOshi?'\u2605':'\u2606'}</span> ${isOshi?'เป็น Oshi ของคุณ':'เพิ่มเป็น Oshi'}`;
    localize(btn);
    btn.classList.toggle('active', isOshi);
    btn.classList.remove('star-pop'); void btn.offsetWidth; btn.classList.add('star-pop');
  });
  document.querySelectorAll(`.kami-btn[data-id="${id}"]`).forEach(btn=>{
    btn.innerHTML = `<span class="crown-ico">${ICONS.crown}</span> ${isKami?'เป็น Kami Oshi':'ตั้งเป็น Kami Oshi'}`;
    localize(btn);
    btn.classList.toggle('active', isKami);
    btn.classList.remove('star-pop'); void btn.offsetWidth; btn.classList.add('star-pop');
  });
}

function attachMainEvents(){
  const bodyWrap = document.getElementById('table-body-wrap');
  const theadTrack = document.getElementById('thead-track');
  if(bodyWrap && theadTrack){
    bodyWrap.addEventListener('scroll', ()=>{
      theadTrack.style.transform = `translateX(${-bodyWrap.scrollLeft}px)`;
    }, {passive:true});
  }
  const authBtn = document.getElementById('auth-submit-btn');
  if(authBtn){
    authBtn.addEventListener('click', async ()=>{
      const statusEl = document.getElementById('auth-status');
      if(statusEl){ statusEl.style.display='none'; statusEl.textContent=''; }
      const mode = state.authMode || 'signin';
      authBtn.disabled = true; authBtn.textContent = mode==='signup' ? 'กำลังสร้างบัญชี...' : 'กำลังเข้าสู่ระบบ...';
      try{
        const email = (document.getElementById('auth-email-input')||{}).value?.trim() || '';
        const password = (document.getElementById('auth-password-input')||{}).value || '';
        const cred = firebase.auth.EmailAuthProvider.credential(email, password);
        if(mode==='signup' && fbAuth.currentUser && fbAuth.currentUser.isAnonymous){
          try{
            await fbAuth.currentUser.linkWithCredential(cred);
          }catch(linkErr){
            if(linkErr.code === 'auth/credential-already-in-use' || linkErr.code === 'auth/email-already-in-use'){
              await fbAuth.signInWithEmailAndPassword(email, password);
            } else {
              throw linkErr;
            }
          }
        } else if(mode==='signup'){
          await fbAuth.createUserWithEmailAndPassword(email, password);
        } else {
          await fbAuth.signInWithEmailAndPassword(email, password);
        }
        state.view='profile';
        render();
      }catch(err){
        authBtn.disabled = false; authBtn.textContent = mode==='signup' ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
        if(statusEl){
          statusEl.textContent = 'เกิดข้อผิดพลาด: ' + (err && err.message ? err.message : String(err));
          statusEl.style.display = 'block';
        }
      }
    });
  }
  const googleBtn = document.getElementById('google-signin-btn');
  if(googleBtn){
    googleBtn.addEventListener('click', async ()=>{
      try{
        const provider = new firebase.auth.GoogleAuthProvider();
        if(fbAuth.currentUser && fbAuth.currentUser.isAnonymous){
          try{
            await fbAuth.currentUser.linkWithPopup(provider);
          }catch(linkErr){
            if(linkErr.code === 'auth/credential-already-in-use' && linkErr.credential){
              // This Google account already has its own real account from an
              // earlier sign-in — sign into that instead of treating it as an error.
              await fbAuth.signInWithCredential(linkErr.credential);
            } else {
              throw linkErr;
            }
          }
        } else {
          await fbAuth.signInWithPopup(provider);
        }
        state.view='profile';
        render();
      }catch(err){
        const statusEl = document.getElementById('auth-status');
        if(statusEl){ statusEl.textContent = 'เกิดข้อผิดพลาด: ' + (err && err.message ? err.message : String(err)); statusEl.style.display='block'; }
      }
    });
  }

  const editBtn = document.getElementById('edit-save-btn');
  if(editBtn){
    editBtn.addEventListener('click', async ()=>{
      const statusEl = document.getElementById('edit-status');
      if(statusEl){ statusEl.style.display='none'; statusEl.textContent=''; }
      editBtn.disabled = true; editBtn.textContent = 'กำลังบันทึก...';
      try{
        const nameInput = document.getElementById('edit-name-input');
        const name = (nameInput ? nameInput.value : '').trim() || 'ผู้ใช้';
        await fbAuth.currentUser.updateProfile({ displayName: name });
        state.account = { ...state.account, name };
        state.view='profile';
        render();
      }catch(err){
        editBtn.disabled = false; editBtn.textContent = 'บันทึก';
        if(statusEl){
          statusEl.textContent = 'เกิดข้อผิดพลาด: ' + (err && err.message ? err.message : String(err));
          statusEl.style.display = 'block';
        }
      }
    });
  }

  const form = document.getElementById('member-form');
  if(!form) return;
  const groupSelect = document.getElementById('form-group-select');
  if(groupSelect){
    groupSelect.addEventListener('change', ()=>{
      const teams = getTeamsForGroup(groupSelect.value);
      const teamSelect = document.getElementById('form-team-select');
      teamSelect.innerHTML = teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    });
  }
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const name = (fd.get('name')||'').trim();
    const nameTh = (fd.get('nameTh')||'').trim();
    if(!name || !nameTh){
      alert('กรุณากรอกชื่อเล่น (อังกฤษ และ ไทย) ก่อนบันทึก');
      return;
    }
    const data = {
      id: state.editingId || ('m-'+Date.now()),
      name,
      nameTh,
      realName: (fd.get('realName')||'').trim(),
      realNameTh: (fd.get('realNameTh')||'').trim(),
      groupId: fd.get('groupId'),
      teamId: fd.get('teamId'),
      gen: parseInt(fd.get('gen'))||null,
      birthday: fd.get('birthday')||null,
      height: parseInt(fd.get('height'))||null,
      blood: fd.get('blood')||'',
      hometown: (fd.get('hometown')||'').trim(),
      hobby: (fd.get('hobby')||'').trim(),
      likes: (fd.get('likes')||'').trim(),
      photo: (fd.get('photo')||'').trim() || null,
      facts: (fd.get('facts')||'').split('\n').map(s=>s.trim()).filter(Boolean)
    };
    if(state.editingId){
      const idx = state.members.findIndex(x=>x.id===state.editingId);
      if(idx>=0) state.members[idx] = data;
    } else {
      state.members.push(data);
    }
    await fbDb.collection('members').doc(data.id).set(data);
    state.view = 'browse';
    state.selectedId = data.id;
    state.editingId = null;
    state.favoritesOnly = false;
    renderMain(); replaceHistory();
  });
}

// ============================= NAVIGATION HISTORY =============================
// Each screen the user lands on becomes one history entry, so "back" always
// returns to wherever they came from rather than a hard-coded destination.
// This drives the back buttons, the modal close, the edge-swipe gesture and
// the browser/phone back button alike.
const NAV_KEYS = ['view','selectedId','selectedEvent','editingId','favoritesOnly','oshiOnly','query','groupFilter','compareWith','comparePicking','calMonth','calDay',
  'teamFilter','genFilter','captainFilter','showGraduated','sortBy','sortDir',
  'statsTab','advOpen','ageMin','ageMax','heightMin','heightMax','birthMonth','selectedSingle','discTab','posterOf'];

// A screen worth linking to gets a query string, so a shared link reopens
// exactly what the sender was looking at. Only the query changes — the path
// stays put, which is what lets this work on static hosting with no rewrites.
const SHAREABLE_VIEWS = ['feed','browse','groups','org','discography','stats'];

// Read at load time. The first history entry is written before the member list
// has arrived, and writing it derives the address from a state that is still
// empty — which erases the very query string this boot is supposed to honour.
const BOOT_QUERY = location.search;

function urlForSnapshot(snap){
  const p = new URLSearchParams();
  if(snap.selectedEvent)       p.set('e', snap.selectedEvent);
  else if(snap.selectedId){    p.set('m', snap.selectedId);
                               if(snap.compareWith) p.set('vs', snap.compareWith); }
  else if(snap.selectedSingle) p.set('s', snap.selectedSingle);
  else if(snap.view && snap.view !== 'feed' && SHAREABLE_VIEWS.includes(snap.view))
    p.set('v', snap.view);
  const q = p.toString();
  return location.pathname + (q ? '?' + q : '') ;
}

// Runs once at boot, after members are loaded so an id can be checked. An id
// that matches nothing is ignored rather than left to render a blank screen.
function applyUrlToState(){
  const p = new URLSearchParams(BOOT_QUERY);
  const ev = p.get('e'), mem = p.get('m'), sng = p.get('s'), view = p.get('v');

  if(ev && allEvents().some(x => x.id === ev)){ state.view='feed'; state.selectedEvent=ev; return; }
  if(mem && (state.members||[]).some(x => x.id === mem)){
    const m = getMember(mem);
    state.view = 'browse';
    state.showGraduated = !!(m && m.graduated);
    state.selectedId = mem;
    const vs = p.get('vs');
    if(vs && vs !== mem && (state.members||[]).some(x => x.id === vs)) state.compareWith = vs;
    return;
  }
  if(sng && findWork(sng)){
    state.view='single'; state.selectedSingle=sng; return;
  }
  if(view && SHAREABLE_VIEWS.includes(view)) state.view = view;
}

const BACKUP_FORMAT = '48thdb-oshi-1';

function exportOshi(){
  const payload = {
    format: BACKUP_FORMAT,
    savedAt: new Date().toISOString(),
    kamiOshi: state.kamiOshi,
    oshi: state.oshi,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `48thdb-oshi-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
  toast(`บันทึก ${state.oshi.length} คนแล้ว`);
}

function importOshi(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async ()=>{
    const file = input.files && input.files[0];
    if(!file) return;
    let data;
    try{ data = JSON.parse(await file.text()); }
    catch(e){ toast('ไฟล์นี้อ่านไม่ออก'); return; }

    if(!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.oshi)){
      toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ 48thDB'); return;
    }

    // Only ids that match somebody are taken. A file naming members who have
    // since been removed would otherwise leave entries that render as blanks.
    const known = new Set((state.members || []).map(m => m.id));
    const incoming = data.oshi.filter(id => typeof id === 'string' && known.has(id));
    const skipped = data.oshi.length - incoming.length;

    const merged = [...new Set([...state.oshi, ...incoming])];
    const added = merged.length - state.oshi.length;
    state.oshi = merged;
    if(data.kamiOshi && known.has(data.kamiOshi)) state.kamiOshi = data.kamiOshi;

    await saveOshiData();
    renderMain();
    toast(added
      ? `เพิ่ม ${added} คน${skipped ? ` · ข้าม ${skipped} ที่ไม่รู้จัก` : ''}`
      : 'มีครบอยู่แล้ว ไม่มีอะไรเพิ่ม');
  });
  input.click();
}

let _toastTimer = null;
function toast(msg){
  let el = document.querySelector('.toast');
  if(!el){ el = document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg;
  localize(el);
  requestAnimationFrame(()=> el.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=> el.classList.remove('show'), 2000);
}

// Copies the link to whatever is on screen. navigator.share is offered first on
// the phones that have it, since it reaches the apps people actually send links
// through; the clipboard is the fallback everywhere else.
async function shareCurrent(label){
  const url = location.origin + urlForSnapshot(navSnapshot());
  try{
    if(navigator.share){ await navigator.share({ title:label || document.title, url }); return; }
  }catch(err){ if(err && err.name === 'AbortError') return; }
  try{
    await navigator.clipboard.writeText(url);
    toast('คัดลอกลิงก์แล้ว');
  }catch(err){
    // Clipboard access is refused on insecure origins and in some in-app
    // browsers; selecting the text lets the user copy it by hand.
    const ta = document.createElement('textarea');
    ta.value = url; ta.style.cssText = 'position:fixed;top:50%;left:50%;opacity:0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('คัดลอกลิงก์แล้ว'); }
    catch(e2){ toast('คัดลอกไม่สำเร็จ'); }
    ta.remove();
  }
}

function navSnapshot(){
  const snap = {};
  NAV_KEYS.forEach(k => snap[k] = state[k]);
  return snap;
}

// Filters and search refine a screen, they don't create a new one — only these
// fields decide whether the user has actually moved somewhere else.
function isSameScreen(a, b){
  return !!a && !!b && a.view===b.view && a.selectedId===b.selectedId
    && a.selectedEvent===b.selectedEvent
    && a.compareWith===b.compareWith && a.comparePicking===b.comparePicking
    && a.posterOf===b.posterOf
    && a.editingId===b.editingId && a.favoritesOnly===b.favoritesOnly && a.oshiOnly===b.oshiOnly
    && a.showGraduated===b.showGraduated && a.selectedSingle===b.selectedSingle;
}

let _navReady = false;
let _navDepth = 0;
let _urlApplied = false;

// The screen is already rebuilt by the time pushHistory runs, and replacing the
// content clamps the scroll to whatever the new, often shorter, page allows —
// so by then the position the user was at is gone. It is tracked as it changes
// instead. While a modal has the body fixed this stops updating, which is what
// we want: the value then still describes the page behind the modal.
let _scrollY = 0;
window.addEventListener('scroll', () => {
  if(!document.body.classList.contains('modal-locked')) _scrollY = window.scrollY || 0;
}, { passive:true });

/* Landing on a remembered position, for a page that may not be its full height
   yet. While the body was fixed behind a modal the document was only a viewport
   tall, and a screen rebuilt a moment ago has not been laid out at all: reading
   a layout value forces that first, or the scroll is clamped and lands at the
   top. Photos and fonts can still be settling after that, so the position is
   checked once more on the next frame. */
function scrollPageTo(y){
  void document.body.offsetHeight;
  window.scrollTo(0, y);
  requestAnimationFrame(() => {
    if(Math.abs((window.scrollY || 0) - y) > 2) window.scrollTo(0, y);
  });
}

function restoreScroll(y){
  _scrollY = y;
  if(document.body.classList.contains('modal-locked')){
    // The page behind the modal is fixed in place; putting the offset back on
    // the body is what makes closing the modal land where the user was.
    state._savedScrollY = y;
    document.body.style.top = `-${y}px`;
    return;
  }
  scrollPageTo(y);
}

function initHistory(){
  // The app restores scroll itself. Left on 'auto' the browser also restores
  // the position it recorded for the entry, a frame or two after popstate,
  // overwriting ours — and for an entry pushed while a modal had the body
  // fixed, the position it recorded is the top of the page.
  if('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ snap:navSnapshot(), depth:0, scrollY:0 }, '');
  _navReady = true;
  window.addEventListener('popstate', (e)=>{
    const snap = e.state && e.state.snap;
    if(!snap) return;
    _navDepth = (e.state && e.state.depth) || 0;
    NAV_KEYS.forEach(k => state[k] = snap[k]);
    state.profileMenuOpen = false;
    render();
    restoreScroll((e.state && e.state.scrollY) || 0);
  });
}

// Call after a state change that lands the user on a different screen.
function pushHistory(){
  if(!_navReady) return;
  const snap = navSnapshot();
  if(isSameScreen(history.state && history.state.snap, snap)){
    history.replaceState({ snap, depth:_navDepth, scrollY:_scrollY }, '', urlForSnapshot(snap));
    return;
  }
  // Record where this screen was before leaving it, so coming back lands there.
  if(history.state) history.replaceState({ ...history.state, scrollY:_scrollY }, '');

  // A modal is drawn over the screen rather than replacing it, so the page
  // behind it keeps its position; a new view starts at its own top.
  const overlaid = document.body.classList.contains('modal-locked');
  history.pushState({ snap, depth:++_navDepth, scrollY: overlaid ? _scrollY : 0 }, '', urlForSnapshot(snap));
  if(!overlaid){ _scrollY = 0; window.scrollTo(0, 0); }
}

// Same screen, changed filters — keep the entry current so going back later
// restores what was on screen instead of replaying every keystroke.
function replaceHistory(){
  if(!_navReady) return;
  const snap = navSnapshot();
  history.replaceState({ snap, depth:_navDepth, scrollY:_scrollY }, '', urlForSnapshot(snap));
}

function canGoBack(){ return _navDepth > 0; }

// `fallback` covers the case where this screen is the first thing the user
// saw (a shared link, say) and there is nothing of ours to go back to.
function goBack(fallback){
  if(canGoBack()){ history.back(); return; }
  if(fallback){ fallback(); render(); }
}

// Every mobile browser already has its own back gesture from the left edge,
// and on iOS that system gesture cannot be preventDefault()ed. Running our
// own on top of it meant one swipe fired both: history went back twice and
// landed on the home screen, looking like the page had reloaded itself. The
// platform gesture is left to do the job alone.

// iOS keeps :active on whatever the finger first touched while the page
// scrolls, so a row lit up as if pressed halfway through a swipe. The press
// styling is muted for as long as anything is scrolling.
/* The mask has to know which side still has chips past it, which only the
   scroll position can say. */
function bindEdgeFades(){
  document.querySelectorAll('.bday-next').forEach(row => {
    const sync = () => {
      const max = row.scrollWidth - row.clientWidth;
      row.classList.toggle('fade-start', row.scrollLeft > 4);
      row.classList.toggle('fade-end', max > 4 && row.scrollLeft < max - 4);
    };
    row.addEventListener('scroll', sync, {passive:true});
    sync();
  });
}

function bindScrollPressGuard(){
  let t;
  const mark = ()=>{
    document.body.classList.add('is-scrolling');
    clearTimeout(t);
    t = setTimeout(()=>document.body.classList.remove('is-scrolling'), 140);
  };
  document.addEventListener('scroll', mark, {passive:true, capture:true});
  document.addEventListener('touchmove', mark, {passive:true});
}

/* iOS Safari ignores user-scalable, so the pinch is refused here instead.
   Only multi-touch is blocked; one finger scrolls as normal. */
function lockPinchZoom(){
  ['gesturestart','gesturechange','gestureend'].forEach(type =>
    document.addEventListener(type, e => e.preventDefault(), {passive:false}));
  document.addEventListener('touchmove', e => {
    if(e.touches.length > 1) e.preventDefault();
  }, {passive:false});
}

// ============================= EVENTS (delegated) =============================
const RIPPLE_SEL = '.btn-add,.btn-secondary,.btn-danger,.signin-btn,.pill,.gen-filter-chip,'
  + '.oshi-btn,.kami-btn,.team-row,.modal-close-btn,.profile-dropdown button';

function bindRipple(){
  document.addEventListener('pointerdown', (e)=>{
    const btn = e.target.closest(RIPPLE_SEL);
    if(!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--rx', (e.clientX - r.left) + 'px');
    btn.style.setProperty('--ry', (e.clientY - r.top) + 'px');
    btn.style.setProperty('--rs', Math.min(Math.max(r.width, r.height) * 2.4, 600) + 'px');
    btn.classList.remove('rippling');
    void btn.offsetWidth;
    btn.classList.add('rippling');
  }, true);
  document.addEventListener('animationend', (e)=>{
    if(e.animationName === 'rippleOut') e.target.classList.remove('rippling');
  }, true);
}

function bindDelegatedEvents(){
  bindRipple();
  document.body.addEventListener('click', async (e)=>{
    const el = e.target.closest('[data-action]');
    if(!el){
      if(state.profileMenuOpen){ state.profileMenuOpen=false; renderProfileSlot(); }
      return;
    }
    const action = el.dataset.action;
    const id = el.dataset.id;

    // Search results stand in for the current screen, so following one to
    // somewhere else ends the search. Modals are not somewhere else: they
    // open over the results and going back should still find them.
    if(['nav-select','sub-tab','open-single','filter-team-direct','filter-to','drill'].includes(action)){
      state.query = '';
    }

    if(state.profileMenuOpen && action!=='toggle-profile-menu'){
      state.profileMenuOpen = false; renderProfileSlot();
    }

    if(action==='nav'){
      state.view = el.dataset.view;
      if(el.dataset.fav !== undefined) state.favoritesOnly = el.dataset.fav==='1';
      state.selectedId = null; state.editingId = null;
      render(); pushHistory();
    }
    else if(action==='go-back'){
      goBack(()=>{ state.view='browse'; state.selectedId=null; state.editingId=null; });
    }
    else if(action==='open-member'){
      // Two sheets stacked on top of each other is not a place to be, so a
      // member opened from inside an event replaces it. Going back returns
      // to the event, since that is the entry underneath.
      state.selectedId=id; state.editingId=null; state.selectedEvent=null;
      state.compareWith=null; state.comparePicking=false;
      renderMain(); pushHistory();
    }
    else if(action==='open-poster'){
      state.posterOf = id; renderMain(); pushHistory();
    }
    else if(action==='close-poster'){ closePoster(); }
    else if(action==='set-oshi-only'){
      state.oshiOnly = id === '1';
      state.calDay = null;   // the day that was open may not survive the filter
      renderMain(); replaceHistory();
    }
    else if(action==='toggle-ticker'){
      try{ localStorage.setItem('48thdb-ticker-folded', tickerFolded() ? '0' : '1'); }catch(err){}
      syncTicker();
    }
    else if(action==='toggle-lang'){
      state.lang = isEN() ? 'th' : 'en';
      try{ localStorage.setItem('48thdb-lang', state.lang); }catch(e){}
      applyDocumentLanguage();
      render();
    }
    else if(action==='cal-move'){
      const base = state.calMonth || toYmd(todayStart()).slice(0,7);
      state.calMonth = shiftMonth(base, Number(id));
      state.calDay = null;
      renderMain(); replaceHistory();
    }
    else if(action==='pick-day'){
      state.calDay = state.calDay === id ? null : id;
      renderMain(); replaceHistory();
    }
    else if(action==='open-compare'){
      state.comparePicking = true; state.compareQuery = '';
      renderMain(); pushHistory();
    }
    else if(action==='pick-compare'){
      state.compareWith = id; state.comparePicking = false;
      renderMain(); pushHistory();
    }
    else if(action==='close-compare'){
      const insideCard = e.target.closest('.modal-glass-card');
      const onBtn = e.target.closest('.modal-close-btn');
      if(insideCard && !onBtn) return;
      // Step back to the profile this started from rather than closing outright.
      goBack(()=>{ state.comparePicking = false; state.compareWith = null; });
    }
    else if(action==='export-oshi'){ exportOshi(); }
    else if(action==='import-oshi'){ importOshi(); }
    else if(action==='share'){
      const m = state.selectedId ? getMember(state.selectedId) : null;
      const ev = state.selectedEvent ? getEvent(state.selectedEvent) : null;
      shareCurrent(m ? `${m.nameTh} — 48thDB` : ev ? `${ev.title} — 48thDB` : '48thDB');
    }
    else if(action==='close-modal'){
      const insideCard = e.target.closest('.modal-glass-card');
      const onCloseBtn = e.target.closest('.modal-close-btn');
      if(insideCard && !onCloseBtn) return;
      goBack(()=>{ state.selectedId = null; state.selectedEvent = null; });
    }
    else if(action==='filter-to'){
      const m = getMember(id);
      if(m){
        const scope = el.dataset.scope;
        if(scope==='captain'){
          state.groupFilter = 'all';
          state.teamFilter = 'all';
          state.genFilter = 'all';
          state.captainFilter = el.dataset.captainType;
        } else {
          state.groupFilter = m.groupId;
          state.teamFilter = scope==='team' ? m.teamId : 'all';
          state.genFilter = scope==='gen' ? m.gen : 'all';
          state.captainFilter = 'all';
        }
        state.view = 'browse';
        state.selectedId = null;
        state.query = '';
        render(); pushHistory();
      }
    }
    else if(action==='clear-gen-filter'){
      state.genFilter = 'all';
      state.captainFilter = 'all';
      renderMain(); replaceHistory();
    }
    else if(action==='toggle-oshi'){
      if(state.oshi.includes(id)){
        state.oshi = state.oshi.filter(x=>x!==id);
        if(state.kamiOshi===id) state.kamiOshi=null;
      } else {
        state.oshi.push(id);
      }
      await saveOshiData();
      updateOshiButtonsFor(id);
    }
    else if(action==='toggle-kami-oshi'){
      if(state.kamiOshi===id){
        state.kamiOshi=null;
      } else {
        state.kamiOshi=id;
        if(!state.oshi.includes(id)) state.oshi.push(id);
      }
      await saveOshiData();
      updateOshiButtonsFor(id);
    }
    else if(action==='stats-tab'){
      state.statsTab = el.dataset.value;
      renderMain(); replaceHistory();
    }
    else if(action==='toggle-adv'){
      state.advOpen = !state.advOpen;
      renderMain(); replaceHistory();
    }
    else if(action==='reset-adv'){
      state.ageMin=''; state.ageMax=''; state.heightMin=''; state.heightMax=''; state.birthMonth='all';
      renderMain(); replaceHistory();
    }
    else if(action==='toggle-theme'){
      applyTheme(state.theme==='dark' ? 'light' : 'dark');
    }
    else if(action==='toggle-profile-menu'){
      state.profileMenuOpen = !state.profileMenuOpen;
      renderProfileSlot();
    }
    else if(action==='sign-out'){
      state.profileMenuOpen=false;
      state.view='browse';
      await fbAuth.signOut();
    }
    else if(action==='auth-switch-mode'){
      state.authMode = el.dataset.mode;
      renderMain();
    }
    else if(action==='add-new'){
      state.view='form'; state.editingId=null; render(); pushHistory();
    }
    else if(action==='edit-member'){
      state.view='form'; state.editingId=id; state.selectedId=null; render(); pushHistory();
    }
    else if(action==='delete-member'){
      const m = getMember(id);
      if(m && confirm(`ยืนยันการลบ ${m.nameTh}?`)){
        state.members = state.members.filter(x=>x.id!==id);
        await deleteMemberDoc(id);
        state.view='browse'; state.selectedId=null;
        render(); replaceHistory();
      }
    }
    else if(action==='cancel-form'){
      goBack(()=>{
        state.view = 'browse';
        state.selectedId = state.editingId || null;
        state.editingId = null;
      });
    }
    else if(action==='filter-group'){
      state.groupFilter = el.dataset.value;
      state.teamFilter = 'all';
      state.genFilter = 'all';
      state.captainFilter = 'all';
      renderMain(); replaceHistory();
    }
    else if(action==='toggle-graduated'){
      state.showGraduated = !state.showGraduated;
      // Team/gen filters rarely carry over meaningfully between the two
      // rosters, so start the switched-to view clean.
      state.teamFilter = 'all';
      state.genFilter = 'all';
      state.captainFilter = 'all';
      renderMain(); pushHistory();
    }
    else if(action==='disc-tab'){
      state.discTab = el.dataset.value;
      renderMain(); replaceHistory();
    }
    else if(action==='toggle-stage'){
      const k = el.dataset.key;
      // Closing takes the plot out from under the reader, and the page can
      // end up shorter than the current scroll, which the browser fixes by
      // yanking it upward. Keep the bar that was pressed where it was.
      const anchor = el.getBoundingClientRect().top;
      state.stagesOpen = { ...state.stagesOpen, [k]: !state.stagesOpen[k] };
      renderMain();
      const again = document.querySelector(`[data-action="toggle-stage"][data-key="${k}"]`);
      if(again){
        const drift = again.getBoundingClientRect().top - anchor;
        if(drift) window.scrollBy(0, drift);
      }
    }
    else if(action==='open-single'){
      state.selectedSingle = el.dataset.id;
      state.view = 'single';
      leaveOverlays();
      render(); pushHistory();
    }
    else if(action==='drill'){
      const d = el.dataset;
      state.groupFilter = d.group || 'all';
      state.teamFilter  = d.team  || 'all';
      state.genFilter   = d.gen ? +d.gen : 'all';
      state.captainFilter = 'all';
      state.ageMin = d.ageMin || '';
      state.ageMax = d.ageMax || '';
      state.heightMin = ''; state.heightMax = '';
      state.birthMonth = d.month || 'all';
      state.showGraduated = d.grad === '1';
      // Open the panel when the jump set something only it can show, so the
      // narrowing is visible rather than mysterious.
      state.advOpen = !!(d.ageMin || d.ageMax || d.month);
      state.view = 'browse'; state.favoritesOnly = false;
      leaveOverlays(); state.query = '';
      render(); pushHistory();
    }
    else if(action==='filter-team-direct'){
      state.groupFilter = el.dataset.group;
      state.teamFilter = el.dataset.team;
      state.view = 'browse'; state.favoritesOnly = false;
      state.showGraduated = false; state.genFilter = 'all'; state.captainFilter = 'all';
      leaveOverlays();
      render(); pushHistory();
    }
    else if(action==='nav-select'){
      const opt = NAV_OPTIONS.find(o=>o.value===el.dataset.value);
      if(opt){
        state.view = opt.view;
        state.favoritesOnly = opt.fav;
        leaveOverlays();
        render(); pushHistory();
      }
    }
    else if(action==='open-event'){
      state.selectedEvent = el.dataset.id;
      renderMain(); pushHistory();
    }
    else if(action==='sub-tab'){
      state.view = el.dataset.view;
      leaveOverlays();
      render(); pushHistory();
    }
    else if(action==='toggle-past'){
      state.pastOpen = !state.pastOpen;
      renderMain(); replaceHistory();
    }
    else if(action==='sort-column'){
      const col = el.dataset.column;
      const prevScroll = document.querySelector('.table-wrap')?.scrollLeft || 0;
      if(state.sortBy===col){ state.sortDir = state.sortDir==='asc' ? 'desc' : 'asc'; }
      else { state.sortBy = col; state.sortDir = 'asc'; }
      renderMain(); replaceHistory();
      const newWrap = document.querySelector('.table-wrap');
      if(newWrap) newWrap.scrollLeft = prevScroll;
    }
  });

  document.body.addEventListener('change', (e)=>{
    if(e.target.id==='birth-month'){ state.birthMonth = e.target.value; renderMain(); replaceHistory(); }
    else if(e.target.id==='team-filter'){ state.teamFilter = e.target.value; state.genFilter = 'all'; state.captainFilter = 'all'; renderMain(); replaceHistory(); }
    else if(e.target.id==='sort-filter'){ state.sortBy = e.target.value; state.sortDir = 'asc'; renderMain(); replaceHistory(); }
  });

  document.body.addEventListener('input', (e)=>{
    if(e.target.id==='search-input'){ state.query = e.target.value; renderMain(); replaceHistory(); }
    else if(e.target.id==='cmp-search'){
      state.compareQuery = e.target.value;
      const caret = e.target.selectionStart;
      renderMain();
      const again = document.getElementById('cmp-search');
      if(again){ again.focus(); try{ again.setSelectionRange(caret, caret); }catch(err){} }
    }
    else if(ADV_INPUTS[e.target.id]){
      state[ADV_INPUTS[e.target.id]] = e.target.value;
      const id = e.target.id, caret = e.target.selectionStart;
      renderMain(); replaceHistory();
      // renderMain rebuilds the panel, so put the user back where they were typing.
      const again = document.getElementById(id);
      if(again){ again.focus(); try{ again.setSelectionRange(caret, caret); }catch(err){} }
    }
  });
}

// Registered after load so it never competes with the first paint, and wrapped
// because a worker is a progressive extra: if it fails, the site still works.
/* Installed to a home screen, the app is not reloaded when you switch back to
   it — it is still the page you left. A deploy therefore sits unseen until the
   app is force-quit, which is what the owner was having to do every time. The
   ETags of the files the app is made of are recorded at startup and checked
   again whenever it comes back to the front.

   Every file is asked about, not just the page: once the code moved out of
   index.html, a deploy that only touched a stylesheet or a script left the
   page byte-identical, and watching the page alone would have called that
   no change at all. The requests are HEADs, so each answer is a few hundred
   bytes of headers. */
const DEPLOY_WATCHED = [
  './', './css/app.css',
  './js/data.js', './js/state.js', './js/i18n.js',
  './js/storage.js', './js/render.js', './js/feed.js', './js/app.js',
];

let _deployTag = null;

async function fetchDeployTag(){
  try{
    const tags = await Promise.all(DEPLOY_WATCHED.map(async (url) => {
      const res = await fetch(url, { method:'HEAD', cache:'no-store' });
      return res.headers.get('etag') || res.headers.get('last-modified') || '';
    }));
    // A round where nothing came back is not a version — treat it as unknown
    // rather than as a change, or one offline moment would force a reload.
    return tags.some(Boolean) ? tags.join('|') : null;
  }catch(e){ return null; }
}

async function watchForUpdates(){
  if(location.protocol !== 'https:') return;
  _deployTag = await fetchDeployTag();
  if(!_deployTag) return;   // nothing to compare against, so never guess

  document.addEventListener('visibilitychange', async ()=>{
    if(document.visibilityState !== 'visible') return;
    if(navigator.onLine === false) return;

    const tag = await fetchDeployTag();
    if(!tag || tag === _deployTag) return;

    // Reloading out from under someone loses their place, so it waits until
    // they have nothing open. The tag is deliberately left as it was, which
    // means the next time they come back the update is found again.
    const busy = state.selectedId || state.selectedEvent || state.posterOf
      || state.comparePicking || (document.activeElement && document.activeElement.tagName === 'INPUT');
    if(busy) return;

    _deployTag = tag;
    location.reload();
  });
}

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  // A way out that does not require clearing browser data: loading the site
  // with ?sw=off removes the worker and its caches.
  if(new URLSearchParams(location.search).get('sw') === 'off'){
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    if(window.caches) caches.keys().then(ks => ks.forEach(k => k.startsWith('48thdb-') && caches.delete(k)));
    return;
  }

  if(location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', ()=>{
    // updateViaCache:'none' keeps the browser's HTTP cache from serving an old
    // worker, which would pin users to whatever it was caching at the time.
    navigator.serviceWorker.register('sw.js', { updateViaCache:'none' }).catch(()=>{});
  });
}

// ============================= INIT =============================
async function init(){
  try{ const l = localStorage.getItem('48thdb-lang'); if(l) state.lang = l; }catch(e){}
  applyDocumentLanguage();
  registerServiceWorker();
  watchForUpdates();
  bindPullToRefresh();
  startClock();
  bindDelegatedEvents();
  initHistory();
  bindScrollPressGuard();
  lockPinchZoom();
  let checkedInitialAuth = false;

  fbAuth.onAuthStateChanged(async (user) => {
    if(!checkedInitialAuth){
      checkedInitialAuth = true;
      if(!user){
        // Truly no session at all (first-ever visit) — start one.
        // This triggers another onAuthStateChanged call with the new user,
        // so just return here and let that call handle loading/rendering.
        try{ await fbAuth.signInAnonymously(); }catch(e){ render(); }
        return;
      }
    }
    if(user && !user.isAnonymous){
      state.account = { name: user.displayName || user.email || 'ผู้ใช้', email: user.email || '', loggedIn:true, uid:user.uid };
    } else {
      state.account = null;
    }
    if(!state.members || !state.members.length){
      try{ state.members = await loadMembers(); }
      catch(e){ state.members = SEED_ALL_MEMBERS.slice(); }
      learnNames();
    }
    // Events are read alongside the members rather than after them: both are
    // needed for the first draw, and one after the other would show the feed
    // twice. A failure here leaves state.events null, which means the seed.
    if(state.events === null){
      try{ state.events = await loadEvents(); }catch(e){ state.events = null; }
    }
    const oshiData = await loadOshiData();
    state.oshi = oshiData.oshi;
    state.kamiOshi = oshiData.kamiOshi;
    if(!_urlApplied){ _urlApplied = true; applyUrlToState(); replaceHistory(); }
    render();
  });
}
init();
