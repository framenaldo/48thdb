#!/usr/bin/env node
/* One-time: lets api.48thdb.com read 48thdb.com's Google Search Console numbers.
 *
 * The owner signs in with their own Google account in the browser and allows
 * read-only access to Search Console; the refresh token that comes back goes
 * straight into the Worker secret GSC_OAUTH (with the client id and secret) and
 * is never printed or written to disk.
 *
 *   node scripts/gsc-auth.mjs ~/Downloads/client_secret_….json
 *
 * The JSON is the "Desktop app" OAuth client downloaded from Google Cloud →
 * Google Auth Platform → Clients. Delete it afterwards.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const file = process.argv[2];
if (!file) { console.error('ใช้แบบนี้: node scripts/gsc-auth.mjs ~/Downloads/client_secret_….json'); process.exit(1); }
const raw = JSON.parse(readFileSync(file.replace(/^~/, homedir()), 'utf8'));
const client = raw.installed || raw.web;
if (!client || !client.client_id || !client.client_secret) { console.error('ไฟล์นี้ไม่ใช่ OAuth client แบบ Desktop app'); process.exit(1); }

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const SITE = 'sc-domain:48thdb.com';
const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..', 'worker');
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/') { res.writeHead(404).end(); return; }
  const done = (msg) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<p style="font:18px sans-serif;padding:40px">${msg}</p>`); };
  try {
    if (u.searchParams.get('state') !== state) throw new Error('state ไม่ตรง ลองรันใหม่');
    if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error'));
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code'), client_id: client.client_id,
        client_secret: client.client_secret, redirect_uri: redirect, code_verifier: verifier }) });
    const t = await r.json();
    if (!t.refresh_token) throw new Error(t.error_description || t.error || 'Google ไม่ได้ให้ refresh token');
    // can this account read the property?
    const s = await (await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: { authorization: `Bearer ${t.access_token}` } })).json();
    const site = (s.siteEntry || []).find((x) => x.siteUrl === SITE);
    if (!site) throw new Error(`บัญชีนี้ไม่เห็น ${SITE} ใน Search Console — ล็อกอินด้วยบัญชีที่เป็นเจ้าของ property`);
    done('เรียบร้อย กลับไปที่เทอร์มินัลได้เลย ปิดแท็บนี้ได้');
    console.log(`อ่าน ${SITE} ได้ (${site.permissionLevel}) กำลังเก็บเข้า Worker…`);
    const put = spawn('npx', ['--yes', 'wrangler', 'secret', 'put', 'GSC_OAUTH'], { cwd: WORKER, stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, npm_config_cache: join(homedir(), '.npm-wrangler') } });
    put.stdin.end(JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: t.refresh_token }));
    put.on('close', (code) => { console.log(code === 0 ? 'เสร็จแล้ว ลบไฟล์ client_secret ทิ้งได้ แล้วกดรีเฟรชที่การ์ดผู้เข้าชมเว็บ' : 'เก็บเข้า Worker ไม่สำเร็จ'); server.close(); process.exit(code); });
  } catch (e) {
    done('ไม่สำเร็จ: ' + String(e.message || e).replace(/[<>&]/g, ''));
    console.error('ไม่สำเร็จ:', e.message || e); server.close(); process.exit(1);
  }
});
let redirect;
server.listen(0, '127.0.0.1', () => {
  redirect = `http://127.0.0.1:${server.address().port}`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect,
    response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' });
  console.log('กำลังเปิดเบราว์เซอร์ให้ล็อกอิน Google… ถ้าไม่เปิดเอง คัดลอกลิงก์นี้ไปเปิด:\n' + url);
  spawn('open', [url], { stdio: 'ignore' }).on('error', () => {});
});
