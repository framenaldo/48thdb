// 48thForum: one Worker answers every address. Files in public/ are served before it runs.
import { currentUser, isMod, COOKIE } from './auth.js';
import { cookie } from './util.js';
import { message } from './views.js';
import { MOD_COUNT_SQL, UNREAD_DAYS } from './db.js';
import * as read from './read.js';
import * as write from './write.js';
import * as account from './account.js';
import * as mod from './mod.js';
import * as images from './images.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",                 // blob: — the browser shrinks a picture before sending it
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const ROUTES = [
  ['GET',  /^\/$/,                    read.index],
  ['GET',  /^\/f\/([a-z0-9-]+)$/,     read.forum],
  ['GET',  /^\/t\/(\d+)$/,            read.topic],
  ['GET',  /^\/p\/(\d+)$/,            read.post],
  ['GET',  /^\/u\/(\d+)$/,            read.profile],
  ['GET',  /^\/members$/,             read.members],
  ['GET',  /^\/search$/,              read.search],
  ['GET',  /^\/unread$/,              read.unread],
  ['GET',  /^\/faq$/,                 read.faq],
  ['GET',  /^\/new\/([a-z0-9-]+)$/,   write.newTopicForm],
  ['POST', /^\/new\/([a-z0-9-]+)$/,   write.newTopic],
  ['GET',  /^\/t\/(\d+)\/reply$/,     write.replyForm],
  ['POST', /^\/t\/(\d+)\/reply$/,     write.reply],
  ['GET',  /^\/p\/(\d+)\/edit$/,      write.editForm],
  ['POST', /^\/p\/(\d+)\/edit$/,      write.edit],
  ['POST', /^\/p\/(\d+)\/delete$/,    write.remove],
  ['GET',  /^\/p\/(\d+)\/report$/,    write.reportForm],
  ['POST', /^\/p\/(\d+)\/report$/,    write.report],
  ['POST', /^\/markread$/,            write.markRead],
  ['POST', /^\/upload$/,              images.upload],
  ['GET',  /^\/register$/,            account.registerForm],
  ['POST', /^\/register$/,            account.register],
  ['GET',  /^\/login$/,               account.loginForm],
  ['POST', /^\/login$/,               account.login],
  ['POST', /^\/logout$/,              account.logout],
  ['GET',  /^\/settings$/,            account.settingsForm],
  ['POST', /^\/settings$/,            account.settings],
  ['GET',  /^\/mod$/,                 mod.queue],
  ['POST', /^\/mod\/act$/,            mod.act],
];

// Pages a guest sees exactly as every other guest does: kept at Cloudflare's edge for GUEST_CACHE seconds
// (30 by default; 0 turns it off), so a crowd of readers costs the database one read each half minute.
// The Cache API keeps nothing on workers.dev — it starts working once the board has its own domain.
const GUEST_PAGES = /^\/($|f\/[a-z0-9-]+$|t\/\d+$|u\/\d+$|members$|faq$)/;

export default {
  // every night: clear read marks older than the "new posts" window, spent rate limits and old sessions
  async scheduled(event, env) {
    const t = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reads WHERE at < ?').bind(t - UNREAD_DAYS * 86400),
      env.DB.prepare('DELETE FROM hits WHERE until < ?').bind(t),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
    ]);
    await images.dropLoose(env);                  // pictures uploaded but never posted, a day on
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const c = {
      req, env, ctx, url, user: null, modCount: 0,
      headers: (extra = {}) => ({
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'no-store',
        ...extra,
      }),
    };
    try {
      // a form sent from another site never counts (the cookie is SameSite=Lax too)
      if (req.method === 'POST') {
        const origin = req.headers.get('Origin');
        if ((origin && new URL(origin).host !== url.host) || req.headers.get('Sec-Fetch-Site') === 'cross-site')
          return new Response('Forbidden', { status: 403 });
      }
      // a picture: straight from R2, before anything else (no session, no database)
      const pic = req.method === 'GET' && url.pathname.match(/^\/i\/([A-Za-z0-9_-]{16,32})$/);
      if (pic) return await images.serve(req, env, ctx, pic[1]);

      // a trailing slash goes to the address without it
      if (url.pathname.length > 1 && url.pathname.endsWith('/'))
        return Response.redirect(url.origin + url.pathname.replace(/\/+$/, '') + url.search, 301);

      const ttl = Math.max(0, parseInt(env.GUEST_CACHE ?? '30', 10) || 0);
      const shared = ttl > 0 && req.method === 'GET' && !cookie(req, COOKIE) && GUEST_PAGES.test(url.pathname) && typeof caches !== 'undefined';
      if (shared) {
        const hit = await caches.default.match(req.url);
        if (hit) {
          const tm = url.pathname.match(/^\/t\/(\d+)$/);
          if (tm) ctx.waitUntil(env.DB.prepare('UPDATE topics SET views = views + 1 WHERE id = ?').bind(+tm[1]).run());
          const res = new Response(hit.body, hit);
          res.headers.set('Cache-Control', 'no-store');
          res.headers.set('X-Board-Cache', 'hit');
          return res;
        }
      }

      c.user = await currentUser(req, env, ctx);
      if (isMod(c.user)) {
        c.modCount = (await env.DB.prepare(MOD_COUNT_SQL).first())?.n || 0;
      }
      for (const [method, re, fn] of ROUTES) {
        const m = url.pathname.match(re);
        if (!m) continue;
        if (req.method !== method && !(method === 'GET' && req.method === 'HEAD')) continue;
        const res = await fn(c, ...m.slice(1));
        if (shared && res.status === 200) {
          const copy = new Response(res.clone().body, res);
          copy.headers.set('Cache-Control', `public, max-age=${ttl}`);
          ctx.waitUntil(caches.default.put(req.url, copy));
        }
        return res;
      }
      return message(c, 'ไม่พบหน้านี้', 'ลิงก์อาจผิด หรือกระทู้นี้ถูกลบไปแล้ว', { status: 404 });
    } catch (e) {
      console.error(e?.stack || e);
      return message(c, 'ขออภัย มีบางอย่างผิดพลาด', 'ลองใหม่อีกครั้งในอีกสักครู่', { status: 500 });
    }
  },
};
