// Signing in with a 48thDb account, end to end against `wrangler dev`, with nothing of the real 48thDb touched:
// a signing key made here stands in for Google's (FB_JWKS), and a small server here stands in for Firestore
// (FB_FIRESTORE) with one reader's 48thDb record. Both go into .dev.vars, which only `wrangler dev` reads.
//   node test/sso.js     (applies the migrations locally, then starts and stops its own `wrangler dev` on port 8792)
import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 8792, STUB = 8793, BASE = `http://127.0.0.1:${PORT}`;
const PROJECT = 'thdatabase';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
function token(uid, over = {}, { key = privateKey, kid = KID } = {}) {
  const t = Math.floor(Date.now() / 1000);
  const body = { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, iat: t - 5, exp: t + 3600,
    auth_time: t - 5, name: 'Mango Lover', email: 'someone@example.com', firebase: { sign_in_provider: 'google.com' }, ...over };
  const head = b64u({ alg: 'RS256', kid, typ: 'JWT' }), pay = b64u(body);
  const sig = createSign('RSA-SHA256').update(`${head}.${pay}`).sign(key).toString('base64url');
  return `${head}.${pay}.${sig}`;
}

// ---- the stand-in Firestore: users/<uid> only for its own token, members/<id> for anyone signed in ----
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z', 'base64');
// each run its own 48thDb accounts: the local database keeps the board's accounts from run to run
const stamp = randomBytes(3).toString('hex');
const NEW = `uid-new-${stamp}`, LINK = `uid-link-${stamp}`, NOSHI = `uid-noshi-${stamp}`;
const USERS = {
  [NEW]: { oshi: ['bnk-fame', 'cgm-marine'], kamiOshi: 'bnk-fame', avatar: `data:image/jpeg;base64,${JPEG.toString('base64')}` },
  [LINK]: { oshi: ['bnk-pancake'], kamiOshi: null },
  [NOSHI]: { oshi: [] },
};
const MEMBERS = { 'bnk-fame': 'Fame', 'cgm-marine': 'Marine', 'bnk-pancake': 'Pancake' };
let membersDown = false;
const seen = [];
const val = (v) => (v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: v });
const stub = createServer((req, res) => {
  const auth = (req.headers.authorization || '').replace(/^Bearer /, '');
  let who = '';
  try { who = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url')).sub; } catch {}
  seen.push(`${req.method} ${req.url}`);
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const m = req.url.match(/\/documents\/users\/([^/?]+)$/);
  if (req.method === 'GET' && m) {
    const uid = decodeURIComponent(m[1]);
    if (uid !== who) return send(403, { error: { code: 403, message: 'Missing or insufficient permissions.' } });
    if (!USERS[uid]) return send(404, { error: { code: 404 } });
    return send(200, { name: `projects/${PROJECT}/databases/(default)/documents/users/${uid}`,
      fields: Object.fromEntries(Object.entries(USERS[uid]).map(([k, v]) => [k, val(v)])) });
  }
  if (req.method === 'POST' && req.url.endsWith('/documents:batchGet')) {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      if (membersDown || !who) return send(403, { error: { code: 403 } });
      const { documents } = JSON.parse(raw);
      send(200, documents.map((d) => {
        const id = d.split('/').pop();
        return MEMBERS[id] ? { found: { name: d, fields: { name: { stringValue: MEMBERS[id] } } } } : { missing: d };
      }));
    });
    return;
  }
  send(404, {});
});
await new Promise((ok) => stub.listen(STUB, '127.0.0.1', ok));

// ---- the board, with the stand-ins: its tables brought up to date, and the rate limits of earlier runs let go ----
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', '48thforum', '--local'], { stdio: 'pipe' });
execFileSync('npx', ['wrangler', 'd1', 'execute', '48thforum', '--local', '--command', 'DELETE FROM hits'], { stdio: 'pipe' });

const VARS = '.dev.vars';
const kept = existsSync(VARS) ? readFileSync(VARS, 'utf8') : null;
writeFileSync(VARS, `FB_JWKS='${JSON.stringify({ keys: [jwk] })}'\nFB_FIRESTORE="http://127.0.0.1:${STUB}/v1"\n`);
const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', 'GUEST_CACHE:0'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = '';
dev.stdout.on('data', (d) => { log += d; });
dev.stderr.on('data', (d) => { log += d; });
const stop = () => {
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); }   // npx, wrangler and workerd under it
  stub.close();
  if (kept === null) rmSync(VARS, { force: true }); else writeFileSync(VARS, kept);
};
// a dev server left over from a run that was cut short would answer with the old key
try { await fetch(`${BASE}/faq`); stop(); throw new Error(`something already answers on port ${PORT}: stop it first`); } catch (e) { if (/already answers/.test(e.message)) throw e; }
for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/faq`)).ok) break; } catch {}
  if (i > 120) { stop(); console.error(log); throw new Error('wrangler dev did not start'); }
  await new Promise((r) => setTimeout(r, 500));
}

// a small browser: a cookie jar and forms
function agent() {
  let jar = '';
  const go = async (path, { form, method } = {}) => {
    const r = await fetch(BASE + path, {
      method: method || (form ? 'POST' : 'GET'), redirect: 'manual',
      headers: { ...(jar ? { Cookie: jar } : {}), ...(form ? { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) jar = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    return { status: r.status, at: r.headers.get('location') || '', html: await r.text(), headers: r.headers };
  };
  return { go, get signedIn() { return !!jar; } };
}

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log(`  ✓ ${name}`); };

try {
  const a = agent();
  await check('the sign-in page offers a 48thDb account, hidden until Firebase loads, and the policy lets Firebase in', async () => {
    const r = await a.go('/login');
    assert.match(r.html, /data-fb="login"/);
    assert.match(r.html, /data-fb-wrap hidden/);
    assert.match(r.html, /<script src="\/fb\.js\?v=\d+" defer>/);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src [^;]*https:\/\/www\.gstatic\.com/);
    assert.match(csp, /frame-src [^;]*https:\/\/thdatabase\.firebaseapp\.com/);
    assert.match(csp, /connect-src [^;]*identitytoolkit\.googleapis\.com/);
    assert.match((await a.go('/register')).html, /data-fb="login"/);
  });

  await check('a token that is not right is refused', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    for (const t of ['nonsense', token('x', { aud: 'another-project' }), token('x', { exp: 100 }),
      token('x', {}, { key: other }), token('x', {}, { kid: 'unknown' }), token('x', { firebase: { sign_in_provider: 'anonymous' } })]) {
      const r = await a.go('/auth/48thdb', { form: { token: t, mode: 'login' } });
      assert.equal(r.status, 400, t.slice(0, 30));
      assert.match(r.html, /ยืนยันบัญชี 48thDb ไม่ผ่าน/);
      assert.ok(!a.signedIn);
    }
  });

  await check('a form from another site is refused', async () => {
    const r = await fetch(`${BASE}/auth/48thdb`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: token(NEW) }), redirect: 'manual' });
    assert.equal(r.status, 403);
  });

  const name = `mango${stamp}`;
  let me = 0;
  await check('a 48thDb account new to the board picks a name first, then signs in with its oshi and picture', async () => {
    const t = token(NEW);
    const step = await a.go('/auth/48thdb', { form: { token: t, mode: 'login', back: '/faq' } });
    assert.equal(step.status, 200);
    assert.match(step.html, /ตั้งชื่อในบอร์ด/);
    assert.match(step.html, /value="MangoLover"/);           // the 48thDb display name, spaces taken out
    assert.ok(!a.signedIn);
    const bad = await a.go('/auth/48thdb', { form: { token: t, mode: 'login', name: 'ab', rules: '1' } });
    assert.match(bad.html, /ชื่อต้องยาว 3–20 ตัวอักษร/);
    const done = await a.go('/auth/48thdb', { form: { token: t, mode: 'login', name, rules: '1', back: '/faq' } });
    assert.equal(done.status, 303);
    assert.equal(done.at, '/?m=welcome');
    assert.ok(a.signedIn);
    const home = await a.go('/');
    me = +home.html.match(/class="who" href="\/u\/(\d+)"/)[1];
    const prof = await a.go(`/u/${me}`);
    assert.match(prof.html, /โอชิ <b><a href="https:\/\/48thdb\.com\/member\/bnk-fame"[^>]*>Fame<\/a>, <a href="https:\/\/48thdb\.com\/member\/cgm-marine"[^>]*>Marine<\/a><\/b>/);
    assert.match(prof.html, /<img class="ava big" src="\/i\/[A-Za-z0-9_-]{16,32}"/);
    const pic = await a.go(prof.html.match(/src="(\/i\/[^"]+)"/)[1]);
    assert.equal(pic.status, 200);
  });

  await check('the same form sent twice makes one account', async () => {
    const again = await a.go('/auth/48thdb', { form: { token: token(NEW), mode: 'login', name: `other${stamp}`, rules: '1' } });
    assert.equal(again.status, 303);
    const n = (await a.go('/members')).html.match(new RegExp(`other${stamp}`, 'g'));
    assert.equal(n, null);
  });

  await check('it signs in again without a name, and has no password to give', async () => {
    await a.go('/logout', { form: {} });
    assert.ok(!a.signedIn);
    const r = await a.go('/auth/48thdb', { form: { token: token(NEW), mode: 'login', back: '/faq' } });
    assert.equal(r.status, 303);
    assert.equal(r.at, '/faq?m=login');
    assert.ok(a.signedIn);
    const s = await a.go('/settings');
    assert.match(s.html, /เชื่อมกับบัญชี 48thdb\.com แล้ว/);
    assert.match(s.html, /<h2>ตั้งรหัสผ่าน<\/h2>/);
    assert.doesNotMatch(s.html, /name="old"/);
    assert.match(s.html, /จะเลิกเชื่อมได้ต้องตั้งรหัสผ่านของบอร์ดก่อน/);
    const no = await a.go('/settings', { form: { what: 'unlink' } });
    assert.match(no.html, /ตั้งรหัสผ่านของบอร์ดก่อน/);
  });

  await check('an oshi typed by hand stops following 48thDb, and a new sign-in leaves it', async () => {
    await a.go('/settings', { form: { what: 'profile', oshi: 'Fame อย่างเดียว', sig: '' } });
    await a.go('/logout', { form: {} });
    await a.go('/auth/48thdb', { form: { token: token(NEW), mode: 'login' } });
    await new Promise((r) => setTimeout(r, 300));
    const prof = await a.go(`/u/${me}`);
    assert.match(prof.html, /โอชิ <b>Fame อย่างเดียว<\/b>/);
    const sync = await a.go('/auth/48thdb', { form: { token: token(NEW), mode: 'sync' } });
    assert.equal(sync.at, '/settings?m=synced');
    assert.match((await a.go(`/u/${me}`)).html, /member\/bnk-fame/);
  });

  await check('a password set, it can be signed in by name and unlinked', async () => {
    const pw = `pw-${stamp}-123`;
    const r = await a.go('/settings', { form: { what: 'password', new: pw, new2: pw } });
    assert.equal(r.status, 303);
    const b = agent();
    const l = await b.go('/login', { form: { name, password: pw } });
    assert.equal(l.status, 303);
    const u = await a.go('/settings', { form: { what: 'unlink' } });
    assert.equal(u.at, '/settings?m=unlinked');
    const s = await a.go('/settings');
    assert.match(s.html, /data-fb="link"/);
    assert.match(s.html, /<h2>เปลี่ยนรหัสผ่าน<\/h2>/);
    assert.doesNotMatch((await a.go(`/u/${me}`)).html, /48thdb\.com\/member/);   // the names stay, the links go
    assert.match((await a.go(`/u/${me}`)).html, /โอชิ <b>Fame, Marine<\/b>/);
  });

  await check('a board account made with a password links a 48thDb account from its settings', async () => {
    const c = agent();
    const pw = 'another-password-1';
    const nm = `pla${stamp}`;
    await c.go('/register', { form: { name: nm, password: pw, password2: pw, rules: '1' } });
    assert.ok(c.signedIn);
    membersDown = true;                                       // 48thDb's member list does not answer: names from the ids
    const r = await c.go('/auth/48thdb', { form: { token: token(LINK), mode: 'link' } });
    membersDown = false;
    assert.equal(r.at, '/settings?m=linked');
    const s = await c.go('/settings');
    assert.match(s.html, /เชื่อมกับบัญชี 48thdb\.com แล้ว/);
    assert.match(s.html, /member\/bnk-pancake"[^>]*>Pancake</);
    // the first account's 48thDb account is free again, and this one cannot take a second
    const twice = await c.go('/auth/48thdb', { form: { token: token(NEW), mode: 'link' } });
    assert.match(twice.html, /เชื่อมกับบัญชี 48thDb อื่นอยู่แล้ว/);
    // nor can another board name take this 48thDb account
    const relink = await a.go('/auth/48thdb', { form: { token: token(LINK), mode: 'link' } });
    assert.match(relink.html, new RegExp(`เชื่อมกับชื่อ “${nm}” ในบอร์ดอยู่แล้ว`));
    // and a sync must be the linked account
    const wrong = await c.go('/auth/48thdb', { form: { token: token(NOSHI), mode: 'sync' } });
    assert.match(wrong.html, /ต้องยืนยันด้วยบัญชี 48thDb ที่เชื่อมไว้/);
  });

  await check('a 48thDb account with no oshi keeps an oshi typed here', async () => {
    const d = agent();
    const pw = 'third-password-12';
    await d.go('/register', { form: { name: `tu${stamp}`, password: pw, password2: pw, rules: '1' } });
    await d.go('/settings', { form: { what: 'profile', oshi: 'Kaning', sig: '' } });
    await d.go('/auth/48thdb', { form: { token: token(NOSHI), mode: 'link' } });
    assert.match((await d.go('/settings')).html, /value="Kaning"/);
  });

  await check('Firestore was asked with the reader\'s own token, and only for what the board needs', async () => {
    assert.ok(seen.every((s) => /\/documents\/users\/uid-[a-z]+-[0-9a-f]{6}$|\/documents:batchGet$/.test(s)), seen.join('\n'));
  });
  console.log(`\n${ok} checks passed`);
} catch (e) {
  console.error(e);
  console.error('\n--- wrangler dev ---\n' + log.split('\n').slice(-40).join('\n'));
  process.exitCode = 1;
} finally {
  stop();
}
