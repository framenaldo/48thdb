/* The cats' shared room (ห้องรวมแมว): a Durable Object holding the WebSockets of everyone whose cat is in the room.
 * Each reader's own device moves their cat and says what she is doing ("st": the act, where from, where to); the room
 * passes it to the others, who draw her doing the same. Nothing is kept: a cat is in the room while her owner's page is
 * open on it, and leaves with them. Only the cat is shown — her name, look and collar — never who owns her; the id is
 * a hash of the account. Sockets hibernate, so an idle room costs nothing.
 *
 *   in   {t:'hi', cat:{n, sp, col, born}}      first, once
 *        {t:'st', a, x, tx, dir, d}            what she does now: x and tx are shares (0–1) of the floor
 *        {t:'pet', id}                         a stroke for somebody's cat
 *   out  {t:'room', me, cats:[{id, cat, st}]}  to the one who came in
 *        {t:'join', id, cat} · {t:'st', id, …} · {t:'pet', id, by} · {t:'bye', id} · {t:'full'}
 */
const ROOM_MAX = 30;
const ACTS = new Set(['sit', 'walk', 'jump', 'loaf', 'stand', 'sleep', 'purr', 'eat', 'bat']);
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

function cleanCat(c) {
  if (!c || typeof c !== 'object') return null;
  const n = String(c.n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const sp = String(c.sp || '');
  const col = String(c.col || '');
  if (!n || !/^[a-z0-9_-]{1,24}$/i.test(sp) || !/^#[0-9a-f]{6}$/i.test(col)) return null;
  return { n, sp, col, born: num(c.born, 0, 4e12, 0) };
}
function cleanSt(m) {
  if (!ACTS.has(m.a)) return null;
  return { a: m.a, x: num(m.x, 0, 1, .5), tx: num(m.tx, 0, 1, .5), dir: m.dir < 0 ? -1 : 1, d: num(m.d, 0, 120, 2), f: num(m.f, 0, 2, 0) | 0 };
}

export class CatRoom {
  constructor(state) { this.state = state; }
  others(ws) { return this.state.getWebSockets().filter((o) => o !== ws); }
  cast(msg, but) {
    const s = JSON.stringify(msg);
    for (const o of this.state.getWebSockets()) { if (o !== but) { try { o.send(s); } catch (e) {} } }
  }
  async fetch(request) {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response(JSON.stringify({ n: this.state.getWebSockets().filter((o) => (o.deserializeAttachment() || {}).cat).length, max: ROOM_MAX }),
        { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
    }
    const id = request.headers.get('x-cat-id') || '';
    const pair = new WebSocketPair();
    const all = this.state.getWebSockets();
    // the same account again (another tab, a reload): the newer page takes her over
    for (const o of all) { const a = o.deserializeAttachment(); if (a && a.id === id) { a.gone = true; o.serializeAttachment(a); try { o.close(4001, 'again'); } catch (e) {} } }
    this.state.acceptWebSocket(pair[1]);
    if (all.filter((o) => !(o.deserializeAttachment() || {}).gone).length >= ROOM_MAX) {
      pair[1].serializeAttachment({ id, gone: true });
      pair[1].send(JSON.stringify({ t: 'full' })); pair[1].close(4002, 'full');
    } else pair[1].serializeAttachment({ id, lt: 0 });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 600) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment(); if (!a || a.gone || !m) return;
    const now = Date.now();
    if (m.t === 'hi') {
      const cat = cleanCat(m.cat); if (!cat) { ws.close(4003, 'cat'); return; }
      a.cat = cat; ws.serializeAttachment(a);
      const cats = this.others(ws).map((o) => o.deserializeAttachment()).filter((b) => b && b.cat && !b.gone).map((b) => ({ id: b.id, cat: b.cat, st: b.st || null }));
      ws.send(JSON.stringify({ t: 'room', me: a.id, cats }));
      this.cast({ t: 'join', id: a.id, cat }, ws);
      return;
    }
    if (!a.cat) return;
    if (m.t === 'st') {
      if (now - (a.lt || 0) < 200) return;   // a cat does not change her mind five times a second
      const st = cleanSt(m); if (!st) return;
      a.lt = now; a.st = st; ws.serializeAttachment(a);
      this.cast({ t: 'st', id: a.id, ...st }, ws);
      return;
    }
    if (m.t === 'pet') {
      if (now - (a.pt || 0) < 700 || typeof m.id !== 'string' || m.id.length > 40) return;
      a.pt = now; ws.serializeAttachment(a);
      this.cast({ t: 'pet', id: m.id, by: a.id }, ws);
    }
  }
  left(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.cat && !a.gone) this.cast({ t: 'bye', id: a.id }, ws);
  }
  webSocketClose(ws, code) { this.left(ws); try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) {} }
  webSocketError(ws) { this.left(ws); }
}

/* /room — how many cats are in (GET), or the socket (GET with Upgrade, ?t=<Firebase ID token>: a WebSocket cannot carry
 * a header from a page). The token is checked here, and the room is given only a hash of the account. */
export async function roomRoute(request, env, url, claims) {
  if (url.pathname !== '/room') return null;
  if (!env.ROOM) return new Response(JSON.stringify({ error: 'not-configured' }), { status: 503, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  const stub = env.ROOM.get(env.ROOM.idFromName('room-1'));
  if (request.headers.get('upgrade') !== 'websocket') return stub.fetch('https://room/count');
  const tok = url.searchParams.get('t') || '';
  const c = await claims(new Request('https://x/', { headers: { authorization: `Bearer ${tok}` } })).catch(() => null);
  if (!c) return new Response('sign in first', { status: 401 });
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cat-room:${c.sub}`));
  const id = [...new Uint8Array(h)].slice(0, 9).map((b) => b.toString(16).padStart(2, '0')).join('');
  const fwd = new Request('https://room/ws', request); fwd.headers.set('x-cat-id', id);
  return stub.fetch(fwd);
}
