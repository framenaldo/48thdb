// 48thHako: one Worker answers every address. Files in public/ are served before it runs.
import { currentUser, isMod } from './auth.js';
import { message } from './views.js';
import { MOD_COUNT_SQL } from './db.js';
import * as read from './read.js';
import * as write from './write.js';
import * as account from './account.js';
import * as mod from './mod.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
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

export default {
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
      // a trailing slash goes to the address without it
      if (url.pathname.length > 1 && url.pathname.endsWith('/'))
        return Response.redirect(url.origin + url.pathname.replace(/\/+$/, '') + url.search, 301);

      c.user = await currentUser(req, env, ctx);
      if (isMod(c.user)) {
        c.modCount = (await env.DB.prepare(MOD_COUNT_SQL).first())?.n || 0;
      }
      for (const [method, re, fn] of ROUTES) {
        const m = url.pathname.match(re);
        if (!m) continue;
        if (req.method !== method && !(method === 'GET' && req.method === 'HEAD')) continue;
        return await fn(c, ...m.slice(1));
      }
      return message(c, 'ไม่พบหน้านี้', 'ลิงก์อาจผิด หรือกระทู้นี้ถูกลบไปแล้ว', { status: 404 });
    } catch (e) {
      console.error(e?.stack || e);
      return message(c, 'ขออภัย มีบางอย่างผิดพลาด', 'ลองใหม่อีกครั้งในอีกสักครู่', { status: 500 });
    }
  },
};
