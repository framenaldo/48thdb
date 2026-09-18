/* Stand-in for the Firebase compat SDKs, for local testing only.
 *
 * The smoke test swaps this in for the three gstatic scripts so a test run
 * never touches the real project: the live Firestore holds everyone's oshi
 * lists and the members the app reconciles on every load, and a refactor is
 * not a good reason to write to it. An empty members collection is also the
 * most useful fixture — loadMembers() and loadEvents() then fall back to the
 * seed in js/data.js, which is exactly the data a refactor must not change.
 */
(function () {
  const store = { members: new Map(), users: new Map() };

  /* A test can hand the stub a database to start from — smoke.mjs sets this
     before any script runs. Without it the collections are empty, which is the
     state a project is in before anything has been migrated. */
  for (const [col, rows] of Object.entries(window.__STUB_DATA__ || {})) {
    store[col] = new Map(rows.map((row) => [row.id, row]));
  }

  /* Just enough FieldValue for what the app writes: an increment and a
     timestamp. Without them a save would throw where the real SDK succeeds,
     and the test would be passing on the wrong path. */
  const SENTINEL = Symbol('sentinel');
  const applySentinels = (data, previous = {}) => {
    const out = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (value && value[SENTINEL] === 'increment') out[key] = (previous[key] || 0) + value.by;
      else if (value && value[SENTINEL] === 'timestamp') out[key] = new Date().toISOString();
      else out[key] = value;
    }
    return out;
  };

  const snap = (data) => ({
    exists: data !== undefined,
    data: () => data,
  });

  function docRef(col, id) {
    return {
      id,
      async get() { return snap(store[col]?.get(id)); },
      async set(data, opts) {
        const map = (store[col] = store[col] || new Map());
        const previous = map.get(id) || {};
        const clean = applySentinels(data, previous);
        map.set(id, opts && opts.merge ? { ...previous, ...clean } : clean);
      },
      async delete() { store[col]?.delete(id); },
    };
  }

  function collectionRef(col) {
    return {
      doc: (id) => docRef(col, id),
      async get() {
        const map = store[col] = store[col] || new Map();
        const docs = [...map.entries()].map(([id, data]) => ({ id, ...snap(data) }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  const firestore = () => ({
    collection: collectionRef,
    doc: (path) => { const [c, id] = path.split('/'); return docRef(c, id); },
    batch() {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
        delete: (ref) => ops.push(() => ref.delete()),
        commit: async () => { for (const op of ops) await op(); },
      };
    },
    enablePersistence: async () => {},
  });

  const listeners = [];
  // A test can start already signed in — an admin, say, which is the only way
  // to reach the editing screens.
  let current = window.__STUB_USER__ || null;
  const emit = () => listeners.forEach((fn) => fn(current));

  const auth = () => ({
    get currentUser() { return current; },
    onAuthStateChanged(fn) { listeners.push(fn); fn(current); return () => {}; },
    async signInAnonymously() {
      current = { uid: 'stub-anon', isAnonymous: true, displayName: null, email: null };
      emit();
      return { user: current };
    },
    async signInWithEmailAndPassword(email) {
      current = { uid: 'stub-user', isAnonymous: false, displayName: 'ผู้ใช้ทดสอบ', email };
      emit();
      return { user: current };
    },
    async createUserWithEmailAndPassword(email) { return this.signInWithEmailAndPassword(email); },
    async signInWithPopup() { return this.signInWithEmailAndPassword('stub@example.com'); },
    async signInWithCredential() { return this.signInWithEmailAndPassword('stub@example.com'); },
    async signOut() { current = null; emit(); },
  });

  auth.GoogleAuthProvider = function () {};
  auth.EmailAuthProvider = { credential: (email, password) => ({ email, password }) };

  firestore.FieldValue = {
    increment: (by) => ({ [SENTINEL]: 'increment', by }),
    serverTimestamp: () => ({ [SENTINEL]: 'timestamp' }),
    delete: () => undefined,
  };

  window.firebase = {
    initializeApp: () => {},
    auth,
    firestore,
  };
})();
