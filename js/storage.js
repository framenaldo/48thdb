// ============================= STORAGE (Firestore) =============================
/* Hometown and hobbies used to be written as facts ("บ้านเกิดชลบุรี"). Copies
   saved to Firestore before they became fields still hold them that way, so
   they are lifted out on load — only into an empty field, and a fact that
   disagrees with a field already set is left where it is. */
/* Values the seed once held and has since corrected. A stored copy still
   holding one of these exact values takes the new one; anything else — an edit
   made in the app — is left alone. */
const SEED_REPLACES = {
  'bnk-mail':   { hobby:['ดูทีวี ท่องเที่ยว เล่นเกม'] },
  'bnk-marine': { hobby:['ร้องเพลง กินข้าว ดูอนิเมะ'] },
};

function liftProfileFacts(m){
  if(!Array.isArray(m.facts) || !m.facts.length) return false;
  let changed = false;
  const take = (field, value) => {
    if(!m[field]){ m[field] = value; return true; }
    return m[field] === value;
  };
  m.facts = m.facts.flatMap(f => {
    const born = /^เกิดที่(\S+) ภูมิลำเนา(.+)$/.exec(f);
    if(born && take('hometown', born[2])){ changed = true; return ['เกิดที่' + born[1]]; }
    if(f.startsWith('บ้านเกิด') && take('hometown', f.slice('บ้านเกิด'.length))){ changed = true; return []; }
    if(f.startsWith('งานอดิเรก') && take('hobby', f.slice('งานอดิเรก'.length))){ changed = true; return []; }
    return [f];
  });
  return changed;
}

async function loadMembers(){
  const snap = await fbDb.collection('members').get();
  let stored = snap.docs.map(d => d.data());

  if(stored.length === 0){
    const batch = fbDb.batch();
    SEED_ALL_MEMBERS.forEach(m => batch.set(fbDb.collection('members').doc(m.id), m));
    await batch.commit();
    return SEED_ALL_MEMBERS.slice();
  }

  // Reconcile with the current seed: add any brand-new members that weren't
  // there before, and push a fresh photo/data change out to everyone else's
  // saved copy — same idea as the old window.storage version, just backed
  // by Firestore now so it's shared across every device instead of per-browser.
  const byId = new Map(stored.map(m => [m.id, m]));
  const batch = fbDb.batch();
  let changed = false;
  for(const seedM of SEED_ALL_MEMBERS){
    const existing = byId.get(seedM.id);
    if(!existing){
      stored.push({ ...seedM });
      batch.set(fbDb.collection('members').doc(seedM.id), seedM);
      changed = true;
    } else {
      let touched = liftProfileFacts(existing);
      for(const [field, stale] of Object.entries(SEED_REPLACES[seedM.id] || {})){
        if(stale.includes(existing[field]) && existing[field] !== seedM[field]){
          existing[field] = seedM[field];
          touched = true;
        }
      }
      if(seedM.photo && existing.photo !== seedM.photo){
        existing.photo = seedM.photo;
        touched = true;
      }
      // Fill gaps the seed has since learned about — heights, Thai names,
      // last teams. A value the stored copy already holds always wins, so
      // anything edited in the app survives.
      for(const [k, v] of Object.entries(seedM)){
        const cur = existing[k];
        // An empty list counts as a gap too: facts that arrive after a member
        // was first saved would otherwise never reach the stored copy.
        const blank = cur === null || cur === undefined || cur === '' || (Array.isArray(cur) && !cur.length);
        const filled = v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
        if(blank && filled){
          existing[k] = v;
          touched = true;
        }
      }
      if(touched){
        batch.set(fbDb.collection('members').doc(seedM.id), existing);
        changed = true;
      }
    }
  }
  if(changed){ try{ await batch.commit(); }catch(e){} }
  return stored;
}
async function saveMembers(members){
  const batch = fbDb.batch();
  members.forEach(m => batch.set(fbDb.collection('members').doc(m.id), m));
  await batch.commit();
}
async function deleteMemberDoc(id){
  await fbDb.collection('members').doc(id).delete();
}
async function loadOshiData(){
  if(!fbAuth.currentUser) return {oshi:[], kamiOshi:null};
  try{
    const doc = await fbDb.collection('users').doc(fbAuth.currentUser.uid).get();
    const d = doc.exists ? doc.data() : {};
    return {oshi:d.oshi||[], kamiOshi:d.kamiOshi||null};
  }catch(e){ return {oshi:[], kamiOshi:null}; }
}
async function saveOshiData(){
  if(!fbAuth.currentUser) return;
  try{
    await fbDb.collection('users').doc(fbAuth.currentUser.uid).set(
      { oshi:state.oshi, kamiOshi:state.kamiOshi }, { merge:true }
    );
  }catch(e){}
}
