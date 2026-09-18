/* Stand-in for the Firebase compat SDKs, for local testing only.
 *
 * The smoke test swaps this in for the three gstatic scripts so a test run
 * never touches the real project: the live Firestore holds everyone's oshi
 * lists and the members the app reconciles on every load, and a refactor is
 * not a good reason to write to it. An empty members collection is also the
 * most useful fixture — loadMembers() then falls back to the seed data in
 * index.html, which is exactly the data a refactor must not change.
 */
(function () {
  const store = { members: new Map(), users: new Map() };

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
        map.set(id, opts && opts.merge ? { ...(map.get(id) || {}), ...data } : data);
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
  let current = null;
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

  window.firebase = {
    initializeApp: () => {},
    auth,
    firestore,
  };
})();
