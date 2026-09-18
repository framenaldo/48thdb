// ============================= RENDER: PIECES =============================
function renderHeader(){
  return `
  <header class="top">
    <div class="wordmark" data-action="nav-select" data-value="feed" style="cursor:pointer;">48thDB<small>48 THAILAND DATABASE</small></div>
    <input class="search-box" id="search-input" type="text" placeholder="ค้นหาสมาชิก เพลง งาน..." value="${escapeAttr(state.query)}">
    <button class="theme-btn" data-action="toggle-theme" aria-label="สลับธีมสว่าง/มืด">${state.theme==='dark'?ICONS.sun:ICONS.moon}</button>
    <button class="lang-btn" data-action="toggle-lang" aria-label="เปลี่ยนภาษา">${isEN()?'ไทย':'EN'}</button>
    <button class="btn-add" data-action="add-new">+ เพิ่มสมาชิก</button>
    <div id="profile-slot"></div>
  </header>`;
}

function renderProfileSlot(){
  const slot = document.getElementById('profile-slot');
  if(!slot) return;
  const loggedIn = state.account && state.account.loggedIn;
  if(!loggedIn){
    slot.innerHTML = `<button class="signin-btn" data-action="nav" data-view="auth">${isEN() ? 'Sign in' : 'เข้าสู่ระบบ'}</button>`;
    return;
  }
  const initial = state.account.name ? state.account.name[0].toUpperCase() : '?';
  slot.innerHTML = `
    <div class="profile-slot-wrap">
      <button class="mini-avatar-btn" data-action="toggle-profile-menu"><span class="mini-avatar">${initial}</span></button>
      ${state.profileMenuOpen ? `
      <div class="profile-dropdown">
        <div class="dropdown-name">${escapeHtml(state.account.name)}</div>
        <div class="dropdown-email">${escapeHtml(state.account.email)}</div>
        <button data-action="nav" data-view="profile">ดูโปรไฟล์</button>
        <button data-action="nav" data-view="editprofile">แก้ไขข้อมูลส่วนตัว</button>
        <button data-action="sign-out" class="danger">ออกจากระบบ</button>
      </div>` : ''}
    </div>`;
}

const NAV_OPTIONS = [
  { value:'feed',        view:'feed', fav:false, icon:ICONS.home, iconActive:ICONS.homeFilled },
  { value:'groups',      view:'groups', fav:false, icon:ICONS.groups, iconActive:ICONS.groupsFilled },
  { value:'discography', view:'discography', fav:false, icon:ICONS.works, iconActive:ICONS.worksFilled },
  { value:'stats',       view:'stats', fav:false, icon:ICONS.stats, iconActive:ICONS.statsFilled },
  { value:'profile',     view:'profile', fav:false, icon:ICONS.profile, iconActive:ICONS.profileFilled }
];
function currentNavValue(){
  if(state.view==='feed') return 'feed';
  if(state.view==='browse') return state.favoritesOnly ? 'oshi' : 'groups';
  if(state.view==='groups' || state.view==='org') return 'groups';
  if(state.view==='discography' || state.view==='single') return 'discography';
  if(state.view==='stats') return 'stats';
  if(state.view==='profile') return 'profile';
  return 'browse';
}
function renderNav(){
  const current = currentNavValue();
  return `<nav class="glass-nav">${NAV_OPTIONS.map(o=>{
    const isActive = o.value===current;
    return `<button data-action="nav-select" data-value="${o.value}" class="${isActive?'active':''}">
      <span class="gnav-icon">${isActive?o.iconActive:o.icon}</span>
    </button>`;
  }).join('')}</nav>`;
}

/* Updates the nav in place so the active pill can animate between tabs
   instead of being thrown away and rebuilt on every render. */
function syncNav(navContainer){
  if(NAV_HIDDEN_VIEWS.includes(state.view)){
    if(navContainer.firstChild) navContainer.innerHTML = '';
    return;
  }
  if(!navContainer.querySelector('.glass-nav')){
    navContainer.innerHTML = renderNav();
    return;
  }
  const current = currentNavValue();
  navContainer.querySelectorAll('.glass-nav button').forEach(btn=>{
    const isActive = btn.dataset.value === current;
    if(btn.classList.contains('active') === isActive) return;
    const opt = NAV_OPTIONS.find(o=>o.value === btn.dataset.value);
    btn.classList.toggle('active', isActive);
    const ico = btn.querySelector('.gnav-icon');
    if(ico && opt) ico.innerHTML = isActive ? opt.iconActive : opt.icon;
  });
}

function renderGroupPills(){
  const ids = ['all', ...GROUPS.map(g=>g.id)];
  return ids.map(gid=>{
    const isAll = gid==='all';
    const g = isAll ? null : getGroup(gid);
    const label = isAll ? 'ทั้งหมด' : g.name;
    const active = state.groupFilter===gid;
    const bg = isAll ? 'var(--ink)' : g.color;
    // The "all" pill inverts against the page, so its label has to follow the
    // palette rather than being hard-coded white.
    const fg = isAll ? 'var(--paper)' : '#fff';
    return `<button class="pill" data-action="filter-group" data-value="${gid}" style="${active?`background:${bg};color:${fg};border-color:transparent;`:''}">${label}</button>`;
  }).join('');
}

// The graduated roster lives behind its own pill rather than in the main list.
function renderGraduatedPill(){
  const on = state.showGraduated;
  return `<button class="pill pill-grad ${on?'active':''}" data-action="toggle-graduated">
    <span class="grad-cap">${ICONS.cap}</span>จบการศึกษา
  </button>`;
}

// ============================= RENDER: VIEWS =============================
const CAPTAIN_LABELS = { 'group-captain':'กัปตันวง', 'group-vc':'รองกัปตันวง', 'team-captain':'กัปตันทีม', 'team-vc':'รองกัปตันทีม' };
function isCaptainType(m, type){
  const g = getGroup(m.groupId);
  const t = getTeam(m.teamId);
  if(type==='group-captain') return g.captain===m.name;
  if(type==='group-vc') return g.viceCaptain===m.name;
  if(type==='team-captain') return t && t.captain===m.name;
  if(type==='team-vc') return t && t.viceCaptain===m.name;
  return false;
}

// A blank bound means "no limit"; a member missing the value drops out only
// once a bound is actually set.
function applyRange(list, min, max, valueOf){
  const lo = min==='' ? null : Number(min);
  const hi = max==='' ? null : Number(max);
  if(lo===null && hi===null) return list;
  return list.filter(m=>{
    const v = valueOf(m);
    if(v==null || isNaN(v)) return false;
    return (lo===null || v>=lo) && (hi===null || v<=hi);
  });
}

// The roster as it stands before the advanced panel narrows it — kept so the
// panel can report data coverage instead of silently returning nothing.
let _advBase = [];
function applyAdvFilters(list){
  if(state.birthMonth!=='all') list = list.filter(m=>m.birthday && m.birthday.slice(5,7)===state.birthMonth);
  list = applyRange(list, state.ageMin, state.ageMax, m=>calcAge(m.birthday));
  list = applyRange(list, state.heightMin, state.heightMax, m=>m.height);
  return list;
}

function activeAdvCount(){
  return (state.ageMin!==''||state.ageMax!=='' ? 1 : 0)
       + (state.heightMin!==''||state.heightMax!=='' ? 1 : 0)
       + (state.birthMonth!=='all' ? 1 : 0);
}

function filterAndSort(){
  let list = state.members.slice();
  const q = state.query.trim();
  // Graduated members are hidden from the default roster. The "จบการศึกษา"
  // tab shows them on their own, and a search reaches them from anywhere so
  // they stay findable without leaving the main list.
  if(state.showGraduated) list = list.filter(m=>!!m.graduated);
  else if(!q && !state.favoritesOnly) list = list.filter(m=>!m.graduated);
  if(state.favoritesOnly) list = list.filter(m=>state.oshi.includes(m.id));
  if(state.groupFilter!=='all') list = list.filter(m=>m.groupId===state.groupFilter);
  if(state.teamFilter!=='all') list = list.filter(m=>m.teamId===state.teamFilter);
  if(state.genFilter!=='all') list = list.filter(m=>m.gen===state.genFilter);
  if(state.captainFilter!=='all') list = list.filter(m=>isCaptainType(m, state.captainFilter));
  _advBase = list.slice();
  list = applyAdvFilters(list);
  if(q){
    const ql = q.toLowerCase();
    list = list.filter(m=>
      (m.name||'').toLowerCase().includes(ql) ||
      (m.nameTh||'').includes(q) ||
      (m.realName||'').toLowerCase().includes(ql) ||
      (m.realNameTh||'').includes(q)
    );
  }
  const cmp = {
    name: (a,b)=>a.name.localeCompare(b.name),
    group: (a,b)=>getGroup(a.groupId).name.localeCompare(getGroup(b.groupId).name),
    team: (a,b)=>shortTeamLabel(getTeam(a.teamId)).localeCompare(shortTeamLabel(getTeam(b.teamId))),
    gen: (a,b)=>(a.gen||99)-(b.gen||99),
    age: (a,b)=>(a.birthday||'9999-99-99').localeCompare(b.birthday||'9999-99-99'),
    birthday: (a,b)=>{
      const norm = d => d ? d.slice(5) : '99-99'; // compare month-day only, ignore birth year
      return norm(a.birthday).localeCompare(norm(b.birthday));
    },
    height: (a,b)=> state.showGraduated
      ? (a.graduated||'').localeCompare(b.graduated||'')
      : (a.height||0)-(b.height||0),
  }[state.sortBy] || ((a,b)=>a.name.localeCompare(b.name));
  list.sort(cmp);
  if(state.sortDir==='desc') list.reverse();
  return list;
}

/** The quieter line under a member's name: their real name, in the language
    being read. Falls back to the other language, then to nothing at all. */
function secondName(m){
  return (isEN() ? (m.realName || m.realNameTh) : (m.realNameTh || m.realName)) || '';
}

function renderAvatar(m, cls, bg, styleExtra){
  const first = isEN() ? (m.name || m.nameTh) : (m.nameTh || m.name);
  const initial = first ? first[0] : '?';
  return `<div class="${cls}" style="background:${bg};${styleExtra||''}">
    <span class="avatar-fallback">${initial}</span>
    ${m.photo ? `<img class="avatar-img" src="${escapeAttr(m.photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
  </div>`;
}

function getMemberTitle(m){
  const g = getGroup(m.groupId);
  const t = getTeam(m.teamId);
  if(g.captain===m.name) return 'กัปตันวง';
  if(g.viceCaptain===m.name) return 'รองกัปตันวง';
  if(t && t.captain===m.name) return 'กัปตันทีม';
  if(t && t.viceCaptain===m.name) return 'รองกัปตันทีม';
  return '-';
}

function getGroupCaptainBadge(m){
  const g = getGroup(m.groupId);
  if(g.captain===m.name) return 'C';
  if(g.viceCaptain===m.name) return 'VC';
  return null;
}

const ALL_WORKS = () => [...SEED_SINGLES, ...SEED_ALBUMS];
/* The id used to decide this with includes('-a'), which a special such as
   bnk-sp-all-the-way would have tripped. Specials say what they are. */
const WORK_KIND = w => w.kind || (/-a\d+$/.test(w.id) ? 'album' : 'single');
const isSpecialWork = w => ['special', 'digital'].includes(WORK_KIND(w));
const findWork = id => ALL_WORKS().find(w => w.id === id) || SEED_SPECIALS.find(w => w.id === id);
const workGroups = w => w.groups || [w.groupId];
const workGroupNames = w => workGroups(w).map(id => getGroup(id).name).join(' × ');

/** How a release is referred to: its number when it has one, its kind when not. */
function workLabel(w){
  const k = WORK_KIND(w);
  return k === 'album' ? `อัลบั้มที่ ${w.num}`
       : k === 'single' ? `ซิงเกิลที่ ${w.num}`
       : k === 'special' ? 'ซิงเกิลพิเศษ' : 'ซิงเกิลดิจิทัล';
}

/** Every track of the main releases; the statistics read only these. Pass
    true to take the special releases in as well. */
function allTracks(withSpecials){
  const out = [];
  for(const w of withSpecials ? [...ALL_WORKS(), ...SEED_SPECIALS] : ALL_WORKS()){
    for(const t of (SEED_SENBATSU[w.id] || [])) out.push({ work:w, ...t });
  }
  return out;
}

/** A member's tracks: 'main' (the default), 'special', or 'all'. */
function worksOf(id, which = 'main'){
  return allTracks(which !== 'main')
    .filter(t => t.members.includes(id))
    .filter(t => which === 'all' || (which === 'special') === isSpecialWork(t.work))
    .map(t => ({ work:t.work, track:t.track, centre:t.centers.includes(id) }))
    .sort((a,b) => b.work.year-a.work.year || (b.work.num||0)-(a.work.num||0)
      || String(b.work.date||'').localeCompare(String(a.work.date||'')));
}

function renderBarLink(label, value, max, color, action, data){
  const pct = max>0 ? Math.round(value/max*100) : 0;
  const attrs = Object.entries(data)
    .map(([k,v])=>`data-${k.replace(/[A-Z]/g, c=>'-'+c.toLowerCase())}="${escapeAttr(v)}"`).join(' ');
  return `<button class="bar-row" style="--c:${color}" data-action="${action}" ${attrs}>
    <span class="bar-label">${escapeHtml(label)}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
    <span class="bar-val">${value}</span></button>`;
}

function renderMemberWorks(m){
  const works = worksOf(m.id);
  const specials = worksOf(m.id, 'special');
  const row = w=>{
    // A title track shares its name with the release, so naming the release
    // again would just repeat the line above it.
    const sameName = w.track === w.work.title || w.track.startsWith(w.work.title + ' – ');
    const from = sameName
      ? `${workLabel(w.work)} · ${w.work.year}`
      : `${workLabel(w.work)} · ${escapeHtml(w.work.title)} · ${w.work.year}`;
    return `<button class="work-row${w.centre?' is-centre':''}" data-action="open-single" data-id="${w.work.id}">
      <span class="work-main">
        <span class="work-track">${escapeHtml(w.track)}</span>
        <span class="work-from">${from}</span>
      </span>
      ${w.centre?'<span class="work-centre">CENTER</span>':''}
    </button>`;
  };
  const count = list => {
    const c = list.filter(w=>w.centre).length;
    return `<p class="works-count">${list.length} เพลง${c?` · เซ็นเตอร์ ${c} เพลง`:''}</p>`;
  };
  // Kept apart so the count here agrees with the song statistics, which only
  // read the main releases.
  const extra = specials.length ? `<h3 class="section-label">เพลงพิเศษ</h3>
    ${count(specials)}
    <div class="work-list">${specials.map(row).join('')}</div>` : '';
  if(!works.length) return `<h3 class="section-label">ผลงานเพลง</h3>
    <p class="muted-note">ยังไม่มีเพลงที่บันทึกไว้</p>` + extra;
  return `<h3 class="section-label">ผลงานเพลง</h3>
    ${count(works)}
    <div class="work-list">${works.map(row).join('')}</div>` + extra;
}



/* The page is locked against zooming, which is what stops the app sliding
   around under a thumb. A poster is the one thing that has to zoom, so it does
   its own: pinch to scale, drag to move once it is larger than the screen,
   double tap to go in and out. A single tap still closes, but only at rest —
   otherwise letting go of a drag would shut the picture. */
/* An installed app has no address bar to pull on, so the gesture that means
   "refresh" everywhere else had nowhere to live here. It only arms at the very
   top of the page and only when nothing is open over it: a sheet fixes the body,
   which would otherwise look exactly like being scrolled to the top. */
function bindPullToRefresh(){
  const TRIGGER = 70;
  let startY = null, startX = 0, locked = false, pulled = 0;

  const pill = document.createElement('div');
  pill.className = 'ptr';
  pill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M21 4v5h-5"/></svg>`;
  document.body.appendChild(pill);

  // A pull that starts inside a frame scrolled away from its own top is that
  // frame's scroll, not a refresh — the zoomed position chart is one.
  const scrolledFrame = el => {
    for(; el && el !== document.body; el = el.parentElement) if(el.scrollTop > 0) return true;
    return false;
  };
  const armed = target => (window.scrollY || window.pageYOffset || 0) <= 0
    && !document.body.classList.contains('modal-locked')
    && !document.querySelector('.poster-viewer')
    && !scrolledFrame(target);

  // It slides out from under the sticky header rather than being drawn across
  // it, which is where the rest of the app's chrome already lives.
  const draw = (d) => {
    pulled = d;
    const hdr = document.querySelector('header.top');
    pill.style.top = ((hdr ? hdr.getBoundingClientRect().bottom : 0) - 40) + 'px';
    pill.style.transform = `translateX(-50%) translateY(${Math.min(d, TRIGGER + 16)}px) rotate(${d * 3}deg)`;
    pill.style.opacity = Math.max(0, Math.min(1, (d - 24) / 30));
    pill.classList.toggle('is-ready', d >= TRIGGER);
  };
  const settle = () => {
    pill.style.transition = 'transform .22s var(--ease-out), opacity .22s';
    draw(0);
    setTimeout(()=>{ pill.style.transition = ''; pill.classList.remove('is-ready'); }, 240);
  };

  // The screen's edges belong to the system: iOS swipes back from the left edge,
  // and every new screen opens scrolled to the top, which is exactly where a pull
  // arms. A thumb swiping back drifts down as it goes, so a pull that started at
  // the edge claimed the gesture and the back swipe was cancelled.
  const EDGE = 28;
  document.addEventListener('touchstart', (e)=>{
    const x = e.touches[0] ? e.touches[0].clientX : 0;
    const atEdge = x < EDGE || x > window.innerWidth - EDGE;
    startY = (!atEdge && armed(e.target) && e.touches.length === 1) ? e.touches[0].clientY : null;
    startX = startY === null ? 0 : x;
    locked = false; pulled = 0;
  }, { passive:true });

  document.addEventListener('touchmove', (e)=>{
    if(startY === null) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    // The top of the feed has rows that scroll sideways. A sideways swipe drifts
    // a few pixels down as a thumb moves, and without deciding which way the
    // gesture is going before claiming it, that drift was blocking the swipe.
    if(!locked){
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Only a clearly downward drag is a pull; anything diagonal is left alone.
      if(dy <= 0 || dy < Math.abs(dx) * 1.4){ startY = null; return; }
      locked = true;
    }
    if(dy <= 0 || !armed(e.target)){ if(pulled) settle(); startY = null; return; }
    // Half distance, so it takes a deliberate pull rather than a stray swipe.
    draw(dy * 0.5);
    // Deliberately passive, and never preventDefault: this only watches. Claiming
    // the drag is what cancelled iOS's back swipe, and at the top of the page
    // there is nothing to stop anyway — iOS simply rubber-bands, which is the
    // native look of a pull.
  }, { passive:true });

  document.addEventListener('touchend', ()=>{
    if(startY === null) return;
    const go = pulled >= TRIGGER;
    startY = null;
    if(go){ pill.classList.add('is-loading'); location.reload(); }
    else settle();
  });

  // A cancelled gesture is one the system took away — a call arriving, an edge
  // swipe winning — not a decision to refresh. It puts the indicator back and
  // reloads nothing.
  document.addEventListener('touchcancel', ()=>{
    if(startY === null) return;
    startY = null;
    settle();
  });
}

function bindPosterZoom(){
  const view = document.querySelector('.poster-viewer');
  const img = view && view.querySelector('.poster-full');
  if(!img) return;

  let scale = 1, tx = 0, ty = 0;
  let pinchFrom = 0, scaleFrom = 1, panFrom = null, dragged = false;

  const limits = () => ({
    x: Math.max(0, (img.clientWidth  * scale - view.clientWidth)  / 2),
    y: Math.max(0, (img.clientHeight * scale - view.clientHeight) / 2),
  });
  const apply = () => {
    scale = Math.min(5, Math.max(1, scale));
    const l = limits();
    tx = Math.min(l.x, Math.max(-l.x, tx));
    ty = Math.min(l.y, Math.max(-l.y, ty));
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    view.classList.toggle('is-zoomed', scale > 1.01);
  };
  const spread = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  img.addEventListener('touchstart', (e)=>{
    dragged = false;
    if(e.touches.length === 2){ pinchFrom = spread(e.touches); scaleFrom = scale; panFrom = null; }
    else if(e.touches.length === 1 && scale > 1.01){
      panFrom = { x:e.touches[0].clientX - tx, y:e.touches[0].clientY - ty };
    }
  }, { passive:true });

  img.addEventListener('touchmove', (e)=>{
    if(e.touches.length === 2 && pinchFrom){
      scale = scaleFrom * (spread(e.touches) / pinchFrom);
      dragged = true; apply();
      if(e.cancelable) e.preventDefault();
    } else if(e.touches.length === 1 && panFrom){
      tx = e.touches[0].clientX - panFrom.x;
      ty = e.touches[0].clientY - panFrom.y;
      dragged = true; apply();
      if(e.cancelable) e.preventDefault();
    }
  }, { passive:false });

  img.addEventListener('touchend', (e)=>{
    // Lifting one finger of a pinch leaves the other on the glass; it should
    // carry straight on as a drag instead of doing nothing until lifted too.
    if(e.touches.length === 1){
      pinchFrom = 0;
      if(scale > 1.01) panFrom = { x:e.touches[0].clientX - tx, y:e.touches[0].clientY - ty };
      return;
    }
    if(e.touches.length) return;
    pinchFrom = 0; panFrom = null;
    if(scale <= 1.01){ scale = 1; tx = ty = 0; apply(); }
  }, { passive:true });

  /* Double tap zooms; a single tap on the picture does nothing. Closing on a
     lone tap needed a timer to tell the two apart, and that timer kept winning
     the race and shutting the poster mid-gesture. Image viewers everywhere else
     work this way too: tap the surround to dismiss, never the picture.

     The moment of the last tap lives on the element rather than in this closure,
     so a re-render between the two halves of a double tap cannot forget it. */
  img.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(dragged){ dragged = false; return; }
    const now = Date.now();
    const prev = Number(img.dataset.tapAt || 0);
    if(now - prev < 320){
      img.dataset.tapAt = 0;
      if(scale > 1.01){ scale = 1; tx = ty = 0; } else scale = 2.5;
      apply();
      return;
    }
    img.dataset.tapAt = now;
  });

  // The dark surround dismisses, but only when it is itself what was tapped —
  // the close button sits on it and has its own handler.
  view.addEventListener('click', (e)=>{ if(e.target === view) closePoster(); });

  apply();
}

function closePoster(){ goBack(()=>{ state.posterOf = null; }); }

/* Opening a poster full screen. The larger copy is a second file fetched only
   here, so the sheet is not made to carry it just in case someone taps. */
function renderPosterViewer(){
  const ev = SEED_SCHEDULE.find(e => e.id === state.posterOf);
  if(!ev || !ev.poster || !ev.poster.img) return '';
  // One file for both: the poster as it was published, at its own size.
  const full = ev.poster.img;
  return `
  <div class="poster-viewer">
    <button class="poster-close" data-action="close-poster" title="ปิด" aria-label="ปิด">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <img class="poster-full" src="${escapeAttr(full)}" alt="โปสเตอร์งาน ${escapeAttr(ev.title)}" decoding="async">
  </div>`;
}

// ============================= CALENDAR =============================
// The feed answers "what is next". A month at a glance answers the other
// question — which days are busy, and what falls on the same day as what.

const THAI_DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function monthKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }

function shiftMonth(key, by){
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m-1+by, 1);
  return monthKey(d);
}

/** Every day an event covers, not only the day it starts. */
function eventDays(ev){
  const out = [];
  const last = eventLastDay(ev);
  for(let d = new Date(ev.start+'T00:00:00'); toYmd(d) <= last; d.setDate(d.getDate()+1))
    out.push(toYmd(d));
  return out;
}

/* With the filter on, the schedule narrows to the people the reader follows.
   An event whose line-up is still unannounced cannot be said to include them,
   so it drops out — the filter only ever claims what the data actually says. */
function hasMyOshi(ev){
  return (ev.members || []).some(id => state.oshi.includes(id));
}
function isMyOshi(m){ return state.oshi.includes(m.id); }
function filteringByOshi(){ return state.oshiOnly && state.oshi.length > 0; }

function calendarIndex(){
  const events = {}, births = {};
  const mine = filteringByOshi();
  SEED_SCHEDULE.filter(ev => !mine || hasMyOshi(ev))
    // A period marks the day it opens and the day it closes; a dot on every
    // day of a six-week vote would hide the days something actually happens.
    .forEach(ev => (ev.period ? [...new Set([ev.start, eventLastDay(ev)])] : eventDays(ev))
      .forEach(day => (events[day] ??= []).push(ev)));
  activeMembers().filter(m => m.birthday).filter(m => !mine || isMyOshi(m))
    .forEach(m => (births[m.birthday.slice(5)] ??= []).push(m));   // MM-DD, any year
  return { events, births };
}

function renderCalendar(){
  const today = toYmd(todayStart());
  const key = state.calMonth || today.slice(0,7);
  const [year, month] = key.split('-').map(Number);
  const { events, births } = calendarIndex();

  const first = new Date(year, month-1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = first.getDay();

  const cells = [];
  for(let i=0; i<lead; i++) cells.push('<div class="cal-cell is-empty"></div>');

  for(let day=1; day<=daysInMonth; day++){
    const iso = `${key}-${String(day).padStart(2,'0')}`;
    const evs = events[iso] || [];
    const bds = births[iso.slice(5)] || [];
    const classes = ['cal-cell'];
    if(iso === today) classes.push('is-today');
    if(state.calDay === iso) classes.push('is-picked');
    if(evs.length || bds.length) classes.push('has-any');

    // At most three dots: past that the row stops being readable and the count
    // below the grid carries the detail anyway.
    const dots = [
      ...evs.slice(0,3).map(ev => {
        const g = (ev.groups||[]).length===1 ? getGroup(ev.groups[0]) : null;
        return `<i style="background:${g?g.color:'var(--ink-soft)'}"></i>`;
      }),
      ...(bds.length ? [`<i class="is-bday"></i>`] : []),
    ].slice(0,4).join('');

    cells.push(`<button class="${classes.join(' ')}" ${evs.length||bds.length?`data-action="pick-day" data-id="${iso}"`:''}>
      <span class="cal-num">${day}</span>
      <span class="cal-dots">${dots}</span>
    </button>`);
  }

  const picked = state.calDay && state.calDay.startsWith(key) ? state.calDay : null;
  const pickedEvs = picked ? (events[picked] || []) : [];
  const pickedBds = picked ? (births[picked.slice(5)] || []) : [];

  return `
  <section class="cal-wrap">
    <div class="cal-head">
      <button class="cal-nav" data-action="cal-move" data-id="-1" aria-label="เดือนก่อนหน้า">‹</button>
      <div class="cal-title">${MONTH_NAMES[month-1]} ${year}</div>
      <button class="cal-nav" data-action="cal-move" data-id="1" aria-label="เดือนถัดไป">›</button>
    </div>
    <div class="cal-dow">${THAI_DOW.map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    ${picked ? `
      <div class="cal-day-detail">
        <div class="cal-day-title">${formatDate(picked)}</div>
        ${pickedBds.map(m=>{
          const g = getGroup(m.groupId);
          return `<button class="cal-item" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
            <span class="cal-item-tag">วันเกิด</span>
            <span>${escapeHtml(m.nameTh)} · ${escapeHtml(m.name)}</span>
          </button>`;
        }).join('')}
        ${pickedEvs.map(ev=>{
          const g = (ev.groups||[]).length===1 ? getGroup(ev.groups[0]) : null;
          return `<button class="cal-item" style="--c:${g?g.color:'var(--ink-soft)'}" data-action="open-event" data-id="${ev.id}">
            ${ev.time ? `<span class="cal-item-tag">${escapeHtml(ev.time)}</span>` : ''}
            <span>${escapeHtml(ev.title)}</span>
          </button>`;
        }).join('')}
      </div>` : `<p class="muted-note cal-hint">แตะวันที่มีจุดเพื่อดูว่ามีอะไร</p>`}
  </section>`;
}

// ============================= COMPARE =============================

/** Whole months between two dates, so a gap reads as "1 ปี 4 เดือน". */
function monthsBetween(aIso, bIso){
  const a = new Date(aIso), b = new Date(bIso);
  const [early, late] = a <= b ? [a, b] : [b, a];
  let months = (late.getFullYear()-early.getFullYear())*12 + (late.getMonth()-early.getMonth());
  if(late.getDate() < early.getDate()) months--;
  return Math.max(0, months);
}

function humanMonths(months){
  const y = Math.floor(months/12), mo = months%12;
  if(!y && !mo) return 'เท่ากัน';
  return [y ? `${y} ปี` : '', mo ? `${mo} เดือน` : ''].filter(Boolean).join(' ');
}

/** Earliest date the member is recorded as being with the group. */
function joinedOn(m){
  const hist = SEED_TEAM_HISTORY[m.id];
  if(hist && hist.length) return hist.map(r=>r.from).filter(Boolean).sort()[0] || null;
  return null;
}

function compareRows(a, b){
  const rows = [];
  const push = (label, left, right, note) => rows.push({ label, left, right, note });

  const ga = getGroup(a.groupId), gb = getGroup(b.groupId);
  push('วง', ga ? ga.name : '—', gb ? gb.name : '—',
    a.groupId === b.groupId ? 'วงเดียวกัน' : 'คนละวง');
  rows[rows.length-1].html = [ga ? linkGroup(ga) : '—', gb ? linkGroup(gb) : '—'];

  const ta = getTeam(a.teamId), tb = getTeam(b.teamId);
  push('ทีม', ta ? ta.name : '—', tb ? tb.name : '—',
    a.teamId && a.teamId === b.teamId ? 'ทีมเดียวกัน' : null);
  rows[rows.length-1].html = [ta ? linkTeam(ta) : '—', tb ? linkTeam(tb) : '—'];

  push('รุ่น', `รุ่น ${a.gen}`, `รุ่น ${b.gen}`,
    a.gen === b.gen ? 'รุ่นเดียวกัน' : `ห่างกัน ${Math.abs(a.gen-b.gen)} รุ่น`);

  const ageGap = monthsBetween(a.birthday, b.birthday);
  const older = a.birthday === b.birthday ? null : (a.birthday < b.birthday ? a : b);
  push('อายุ', `${calcAge(a.birthday)} ปี`, `${calcAge(b.birthday)} ปี`,
    older ? `${older.nameTh} โตกว่า ${humanMonths(ageGap)}` : 'เกิดวันเดียวกัน');

  push('วันเกิด', formatDateShort(a.birthday), formatDateShort(b.birthday), null);

  if(a.height && b.height){
    const d = Math.abs(a.height-b.height);
    const taller = a.height === b.height ? null : (a.height > b.height ? a : b);
    push('ส่วนสูง', `${a.height} ซม.`, `${b.height} ซม.`,
      taller ? `${taller.nameTh} สูงกว่า ${d} ซม.` : 'สูงเท่ากัน');
  } else {
    push('ส่วนสูง', a.height ? `${a.height} ซม.` : '—', b.height ? `${b.height} ซม.` : '—', null);
  }

  if(a.blood || b.blood)
    push('กรุ๊ปเลือด', a.blood || '—', b.blood || '—',
      a.blood && a.blood === b.blood ? 'กรุ๊ปเดียวกัน' : null);

  const ja = joinedOn(a), jb = joinedOn(b);
  if(ja && jb){
    const today = new Date().toISOString().slice(0,10);
    const gap = monthsBetween(ja, jb);
    push('อยู่กับวงมา', humanMonths(monthsBetween(ja, today)), humanMonths(monthsBetween(jb, today)),
      gap ? `เข้ามาห่างกัน ${humanMonths(gap)}` : 'เข้าวงพร้อมกัน');
  }

  const wa = worksOf(a.id, 'all'), wb = worksOf(b.id, 'all');
  push('ผลงานเพลง', `${wa.length} เพลง`, `${wb.length} เพลง`, null);

  const ca = wa.filter(w=>w.centre).length, cb = wb.filter(w=>w.centre).length;
  if(ca || cb) push('เซ็นเตอร์', `${ca} เพลง`, `${cb} เพลง`, null);

  // Songs both of them are on is the thing a list of two profiles cannot show.
  const shared = wa.filter(w => wb.some(x => x.work.id === w.work.id && x.track === w.track));
  rows.shared = shared;
  return rows;
}

function renderCompareHead(m){
  const g = getGroup(m.groupId);
  return `<div class="cmp-who" style="--c:${g?g.color:'var(--ink-soft)'}">
    <div class="cmp-face">${m.photo ? `<img src="${escapeAttr(m.photo)}" alt="" loading="lazy" decoding="async">` : ''}</div>
    <div class="cmp-name">${escapeHtml(m.nameTh)}</div>
    <div class="cmp-sub">${escapeHtml(m.name)}</div>
  </div>`;
}

function renderCompareModal(){
  const a = getMember(state.selectedId), b = getMember(state.compareWith);
  if(!a || !b) return '';
  const rows = compareRows(a, b);
  const shared = rows.shared || [];

  return `
  <div class="modal-backdrop" data-action="close-compare">
    <div class="modal-glass-card" data-stop-close="1">
      <button class="modal-share-btn" data-action="share" title="คัดลอกลิงก์" aria-label="คัดลอกลิงก์">${ICONS.link}</button>
      <button class="modal-close-btn" data-action="close-compare" title="ปิด" aria-label="ปิด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="modal-scroll">
        <div class="cmp-heads">
          ${renderCompareHead(a)}
          <div class="cmp-vs">เทียบ</div>
          ${renderCompareHead(b)}
        </div>
        <div class="cmp-rows">
          ${rows.map(r=>`
            <div class="cmp-row">
              <div class="cmp-val">${r.html ? r.html[0] : escapeHtml(String(r.left))}</div>
              <div class="cmp-label">${escapeHtml(r.label)}</div>
              <div class="cmp-val">${r.html ? r.html[1] : escapeHtml(String(r.right))}</div>
            </div>
            ${r.note ? `<div class="cmp-note">${escapeHtml(r.note)}</div>` : ''}
          `).join('')}
        </div>
        <h3 class="section-label" style="margin-top:22px;">เพลงที่อยู่ด้วยกัน</h3>
        ${shared.length
          ? `<p class="works-count">${shared.length} เพลง</p>
             <div class="work-list">${shared.map(w=>`
               <button class="work-row" data-action="open-single" data-id="${w.work.id}">
                 <span class="work-main">
                   <span class="work-track">${escapeHtml(w.track)}</span>
                   <span class="work-from">${workLabel(w.work)} · ${w.work.year}</span>
                 </span>
               </button>`).join('')}</div>`
          : `<p class="muted-note">ยังไม่เคยอยู่เพลงเดียวกัน</p>`}
      </div>
    </div>
  </div>`;
}

function renderComparePicker(){
  const a = getMember(state.selectedId);
  if(!a) return '';
  const q = (state.compareQuery || '').trim().toLowerCase();
  const list = (state.members || [])
    .filter(m => m.id !== a.id && !m.graduated)
    .filter(m => !q || [m.name, m.nameTh, m.realName, m.realNameTh].some(s => (s||'').toLowerCase().includes(q)))
    .sort((x,y) => x.name.localeCompare(y.name));

  return `
  <div class="modal-backdrop" data-action="close-compare">
    <div class="modal-glass-card" data-stop-close="1">
      <button class="modal-close-btn" data-action="close-compare" title="ปิด" aria-label="ปิด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="modal-scroll">
        <h3 class="section-label" style="margin-top:0;">เทียบ ${escapeHtml(a.nameTh)} กับใคร</h3>
        <input class="cmp-search" id="cmp-search" type="text" placeholder="พิมพ์ชื่อ..." value="${escapeAttr(state.compareQuery||'')}">
        ${list.length
          ? `<div class="grid-mini" style="margin-top:12px;">${list.map(m=>renderMiniCard(m, false, 'pick-compare')).join('')}</div>`
          : `<p class="muted-note">ไม่พบใครชื่อนี้</p>`}
      </div>
    </div>
  </div>`;
}

const SOCIAL = {
  instagram: { label:'Instagram', colour:'#E1306C', url:h=>'https://www.instagram.com/'+h,
    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none"/></svg>` },
  x: { label:'X', colour:'#111', url:h=>'https://x.com/'+h,
    icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.7 3h3.3l-7.2 8.3L22 21h-6.3l-4.4-5.7L6 21H2.7l7.5-8.6L2.3 3h6.4l4.1 5.4zm-1.1 16h1.8L7.5 4.9H5.6z"/></svg>` },
  tiktok: { label:'TikTok', colour:'#000', url:h=>'https://www.tiktok.com/@'+h,
    icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 2h-3v13.2a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .8.1V9.5a5.7 5.7 0 1 0 4.9 5.7V8.6a6.3 6.3 0 0 0 3.9 1.3V6.8a3.4 3.4 0 0 1-3.9-3z"/></svg>` },
  facebook: { label:'Facebook', colour:'#1877F2', url:h=>'https://www.facebook.com/'+h,
    icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.2-1.5 1.5-1.5h1.6V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.1H7.5v3h2.2V21z"/></svg>` },
  youtube: { label:'YouTube', colour:'#FF0000', url:h=>'https://www.youtube.com/'+h.replace(/^\//,''),
    icon:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12s0-3.2-.4-4.8zM10 15.5v-7l6 3.5z"/></svg>` },
};

function renderSocial(m){
  const links = SEED_SOCIAL[m.id];
  if(!links || !links.length) return '';
  return `<div class="social-row">
    ${links.map(([p, handle])=>{
      const s = SOCIAL[p];
      if(!s) return '';
      // A channel id is not a name, so show the platform instead of 24 characters
      // of base64. An @handle reads fine as it is.
      const shown = handle.startsWith('channel/') ? s.label : handle.replace(/^@/,'');
      // Just the logo: the handle is in the tooltip and read out by screen readers.
      return `<a class="social-chip" style="--c:${s.colour}" href="${escapeAttr(s.url(handle))}"
        target="_blank" rel="noopener noreferrer" title="${s.label}: ${escapeAttr(shown)}" aria-label="${s.label}: ${escapeAttr(shown)}">
        <span class="social-ico">${s.icon}</span>
      </a>`;
    }).join('')}
  </div>`;
}

// A stage seen from the audience: the floor recedes upstage, but the members
// standing on it are drawn upright rather than skewed with it, so faces and
// names stay readable. Depth is carried by how far in a row sits, how wide it
// spreads and how large its avatars are.
const STAGE = { front:{ y:71, w:95, s:1 }, back:{ y:24, w:64, s:0.66 } };
const lerp = (a, b, t) => a + (b - a) * t;

function renderStage(work, trackIndex, track){
  const grid = (SEED_FORMATION[work.id] || {})[trackIndex];
  if(!grid || !grid.length) return '';
  const n = grid.length;
  const depth = i => n > 1 ? i / (n - 1) : 0;          // 0 downstage, 1 upstage
  const at = (i, k) => lerp(STAGE.front[k], STAGE.back[k], depth(i));

  // floor edges, a touch outside the front and back rows
  const edge = (t, pad) => {
    const w = lerp(STAGE.front.w, STAGE.back.w, t) + pad;
    return [50 - w/2, 50 + w/2];
  };
  // The padding has to leave the floor inside the 0-100 viewBox: the SVG
  // clips anything past it, and since the outline is a stroke, a clipped
  // edge shows as a white sliver cutting the corner off.
  const [fl, fr] = edge(0, 3), [bl, br] = edge(1, 3);
  const yTop = STAGE.back.y - 14, yBot = STAGE.front.y + 17;
  const floorY = t => lerp(yBot, yTop, t);
  const floorX = (t, side) => lerp(side ? fr : fl, side ? br : bl, t);

  const divider = t => `<line x1="${floorX(t,0)}" y1="${floorY(t)}" x2="${floorX(t,1)}" y2="${floorY(t)}"
    stroke="rgba(255,255,255,.7)" stroke-width="1.3" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"/>`;
  const rowBands = grid.map((_, i) => i === 0 ? '' : divider((depth(i) + depth(i-1)) / 2)).join('');
  const columns = [0.2, 0.4, 0.6, 0.8].map(f => {
    const x0 = lerp(fl, fr, f), x1 = lerp(bl, br, f);
    return `<line x1="${x0}" y1="${floorY(0)}" x2="${x1}" y2="${floorY(1)}"
      stroke="rgba(255,255,255,.42)" stroke-width="1.1" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>`;
  }).join('');

  const rows = grid.map((row, i) => {
    const seats = row.map(id => {
      if(!id) return `<span class="seat is-gap" aria-hidden="true"></span>`;
      const m = getMember(id);
      if(!m) return '';
      const g = getGroup(m.groupId);
      const isCentre = track.centers.includes(id);
      return `<button class="seat${isCentre?' is-centre':''}" style="--c:${g.color}"
        data-action="open-member" data-id="${id}" title="${escapeAttr(m.name+' · '+m.nameTh)}">
        <span class="seat-badge">
          <span class="seat-face">${renderAvatar(m, 'seat-avatar', g.color)}</span>
          <span class="seat-name">${escapeHtml(m.nameTh || m.name)}</span>
        </span>
      </button>`;
    }).join('');
    return { i, html: `<div class="stage-row" style="top:${at(i,'y')}%;width:${at(i,'w')}%;
      --s:${at(i,'s').toFixed(3)};--seat:${(100 / row.length).toFixed(3)}%;
      z-index:${n - i};">${seats}</div>` };
  });

  const key = `${work.id}:${trackIndex}`;
  const open = !!state.stagesOpen[key];
  return `
  <button class="stage-toggle${open?' is-open':''}" data-action="toggle-stage" data-key="${key}"
    aria-expanded="${open}">
    <span class="stage-toggle-label">Position</span>
    <span class="stage-toggle-sub">${grid.length} แถว · ${grid.flat().filter(Boolean).length} คน</span>
    <span class="stage-caret" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </span>
  </button>
  ${!open ? '' : `
  <div class="stage-wrap">
    <div class="stage" style="--c:${getGroup(work.groupId).color}">
      <svg class="stage-floor" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="${fl},${floorY(0)} ${bl},${floorY(1)} ${br},${floorY(1)} ${fr},${floorY(0)}"
          fill="url(#stageGrad)" stroke="rgba(255,255,255,.85)" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
        ${columns}${rowBands}
        <defs><linearGradient id="stageGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="var(--c)" stop-opacity=".62"/>
          <stop offset="1" stop-color="var(--c)" stop-opacity=".18"/>
        </linearGradient></defs>
      </svg>
      ${rows.sort((a,b)=>a.i<b.i?1:-1).map(r=>r.html).join('')}
    </div>
  </div>`}`;
}

function renderTeamHistory(m){
  const spans = SEED_TEAM_HISTORY[m.id];
  if(!spans || !spans.length) return '';
  const rows = spans.map(s=>{
    const t = getTeam(s.team);
    const colour = t ? getGroup(t.groupId).color : 'var(--ink-soft)';
    const end = s.to ? formatDateShort(s.to) : `<span class="th-now">ปัจจุบัน</span>`;
    return `<li>
      <span class="th-dot" style="background:${colour}"></span>
      <span class="th-team">${t ? linkTeam(t) : escapeHtml(s.team)}</span>
      <span class="th-range mono">${formatDateShort(s.from)} – ${end}</span>
    </li>`;
  }).join('');
  return `<h3 class="section-label">ประวัติทีม</h3><ol class="team-history">${rows}</ol>`;
}

function getTeamCaptainBadge(m){
  const t = getTeam(m.teamId);
  if(t && t.captain===m.name) return 'C';
  if(t && t.viceCaptain===m.name) return 'VC';
  return null;
}

function shortTeamLabel(t){
  if(!t) return '-';
  return t.name === 'เด็กฝึก (Trainee)' ? 'Trainee' : t.name;
}

const SORTABLE_COLS = [
  { key:'name', cellClass:'sticky-name', label:'สมาชิก' },
  { key:'group', cellClass:'col-group', label:'วง' },
  { key:'team', cellClass:'col-team', label:'ทีม' },
  { key:'gen', cellClass:'col-gen', label:'รุ่น' },
  { key:'age', cellClass:'col-age', label:'อายุ' },
  { key:'birthday', cellClass:'col-birthday', label:'วันเกิด' },
  { key:'height', cellClass:'col-height', label:'ส่วนสูง' },
];
function renderTableHeader(){
  const cells = SORTABLE_COLS.map(c=>{
    const active = state.sortBy===c.key;
    const arrow = active ? (state.sortDir==='desc' ? ' \u25BC' : ' \u25B2') : '';
    // Graduated members have no recorded height, so that column carries the
    // graduation date instead and the team column keeps showing their team.
    const label = (c.key==='height' && state.showGraduated) ? 'จบการศึกษา' : c.label;
    return `<div class="cell ${c.cellClass} sortable-th ${active?'active-sort':''}" data-action="sort-column" data-column="${c.key}">${label}${arrow}</div>`;
  }).join('');
  return `
  <div class="row head">
    ${cells}
    <div class="cell col-fav">\u2605</div>
  </div>`;
}

function renderRow(m){
  const g = getGroup(m.groupId);
  const t = getTeam(m.teamId);
  const isOshi = state.oshi.includes(m.id);
  const isKami = state.kamiOshi === m.id;
  const age = calcAge(m.birthday);
  const favInner = isKami ? `<span class="crown-ico" title="Kami Oshi">${ICONS.crown}</span>` : (isOshi?'\u2605':'\u2606');
  const groupBadge = getGroupCaptainBadge(m);
  const teamBadge = getTeamCaptainBadge(m);
  const badgeHtml = (badge, color)=> badge?`<span class="captain-badge" style="--badge-c:${color}" title="${badge==='C'?'กัปตัน':'รองกัปตัน'}">${badge}</span>`:'';
  return `
  <div class="row" style="--c:${g.color}" data-action="open-member" data-id="${m.id}">
    <div class="cell sticky-name">
      ${renderAvatar(m, 'avatar-sm', g.color)}
      <div class="name-block">
        <div class="name-en">${m.name}${m.transfer?`<span class="grad-tag transfer-tag" title="ย้ายจาก ${getGroup(m.transfer.fromGroupId).name} เมื่อ ${formatDateShort(m.transfer.date)}">${ICONS.transfer}</span>`:''}${m.graduated?`<span class="grad-tag" title="จบการศึกษา ${formatDateShort(m.graduated)}">${ICONS.cap}</span>`:''}</div>
        <div class="name-th">${escapeHtml(secondName(m))}</div>
      </div>
    </div>
    <div class="cell col-group"><span class="group-chip" style="background:${g.color}">${g.name}</span>${badgeHtml(groupBadge, groupBadge==='C'?'#C08A2E':'#9AA0A8')}</div>
    <div class="cell col-team">${shortTeamLabel(t)}${badgeHtml(teamBadge, g.color)}</div>
    <div class="cell col-gen mono">${m.gen||'-'}</div>
    <div class="cell col-age mono">${age!==null?age:'-'}</div>
    <div class="cell col-birthday mono">${formatDateShort(m.birthday)}</div>
    <div class="cell col-height mono">${state.showGraduated ? formatDateShort(m.graduated) : (m.height?m.height+' ซม.':'-')}</div>
    <div class="cell col-fav"><button class="fav-btn-sm ${isOshi?'is-oshi':''}" data-action="toggle-oshi" data-id="${m.id}">${favInner}</button></div>
  </div>`;
}

function renderAdvFilters(){
  const n = activeAdvCount();
  if(!state.advOpen) return '';
  const total = _advBase.length;
  const withHeight = _advBase.filter(m=>m.height).length;
  const months = MONTH_NAMES.map((name,i)=>{
    const v = String(i+1).padStart(2,'0');
    return `<option value="${v}" ${state.birthMonth===v?'selected':''}>${name}</option>`;
  }).join('');
  return `
  <div class="adv-panel">
    <div class="adv-field">
      <label>อายุ (ปี)</label>
      <div class="adv-range">
        <input type="number" inputmode="numeric" id="age-min" placeholder="ต่ำสุด" value="${escapeAttr(state.ageMin)}">
        <span>–</span>
        <input type="number" inputmode="numeric" id="age-max" placeholder="สูงสุด" value="${escapeAttr(state.ageMax)}">
      </div>
    </div>
    <div class="adv-field">
      <label>ส่วนสูง (ซม.) ${withHeight<total ? `<span class="cover">มีข้อมูล ${withHeight}/${total} คน</span>` : ''}</label>
      <div class="adv-range">
        <input type="number" inputmode="numeric" id="height-min" placeholder="ต่ำสุด" value="${escapeAttr(state.heightMin)}">
        <span>–</span>
        <input type="number" inputmode="numeric" id="height-max" placeholder="สูงสุด" value="${escapeAttr(state.heightMax)}">
      </div>
    </div>
    <div class="adv-field">
      <label>เดือนเกิด</label>
      <select id="birth-month"><option value="all">ทุกเดือน</option>${months}</select>
    </div>
    <div class="adv-field adv-actions">
      <button class="btn-secondary" data-action="reset-adv" ${n?'':'disabled'} style="width:100%;">ล้างตัวกรอง</button>
    </div>
  </div>`;
}
