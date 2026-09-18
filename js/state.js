// ============================= STATE =============================
let state = {
  view:'feed', pastOpen:false, selectedEvent:null, membersTab:'about', members:[], oshi:[], kamiOshi:null,
  compareWith:null, comparePicking:false, compareQuery:'',
  calMonth:null, calDay:null, posterOf:null,
  lang:'th',
  query:'', groupFilter:'all', teamFilter:'all', sortBy:'name', sortDir:'asc',
  favoritesOnly:false, oshiOnly:false, selectedId:null, editingId:null,
  account:null, profileMenuOpen:false, _justToggledOshi:null, genFilter:'all', captainFilter:'all',
  showGraduated:false,
  statsTab:'overview', advOpen:false, selectedSingle:null, discTab:'singles', stagesOpen:{},
  ageMin:'', ageMax:'', heightMin:'', heightMax:'', birthMonth:'all',
  theme: document.documentElement.dataset.theme || 'light',
  // Null until Firestore answers. Everything reads the schedule through
  // allEvents(), which falls back to the seed, so the page renders the same
  // whether the collection has been filled in yet or not.
  events: null,
  // Set from the admins collection after sign-in. The editing screens are
  // hidden unless it is true — the rules refuse the write either way, so an
  // ungated button was only ever an offer the database would turn down.
  isAdmin: false, editingEvent: null
};

function applyTheme(theme){
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  try{ localStorage.setItem('48thdb-theme', theme); }catch(e){}
  const btn = document.querySelector('.theme-btn');
  if(btn) btn.innerHTML = theme==='dark' ? ICONS.sun : ICONS.moon;
}

// ============================= HELPERS =============================
function getGroup(id){ return GROUPS.find(g=>g.id===id); }
function getTeam(id){ return TEAMS.find(t=>t.id===id); }
function getTeamsForGroup(gid){ return TEAMS.filter(t=>t.groupId===gid); }
function getMember(id){ return state.members.find(m=>m.id===id); }

/* The schedule, from wherever it currently lives.
   A new event used to mean editing js/data.js and deploying, which put a
   fixture change behind a code release — and, once the app is in a store,
   behind a review. The events collection is the editable copy; the seed stays
   as the offline fallback and as what a fresh project starts from. */
function allEvents(){ return state.events && state.events.length ? state.events : SEED_SCHEDULE; }
function getEvent(id){ return allEvents().find(e => e.id === id); }

/* ============================ LANGUAGE ============================
   Thai is the source: every string in this file is written in Thai, and English
   is produced from it by one table. Nothing that has no entry is touched, which
   is what keeps song titles, venues and people's names in their own language.

   Translation happens on the rendered page rather than at each of the ~580
   places a string is written, so there is one place to correct a wording rather
   than a hunt through the markup. Whole text nodes are matched, never fragments,
   so a phrase can never be half-replaced inside a longer sentence. */
