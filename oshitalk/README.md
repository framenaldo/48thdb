# OshiTalk — a fans' web board

A classic web board (forum index → forums → topics, replies / views / last post, a
poster's box beside each post) for BNK48 and CGM48 fans. It is its own site: own
accounts, own database, nothing shared with 48thDb yet. It lives in this repo only
for now; the folder is self-contained and can move to a repo of its own as it is.

- **One Cloudflare Worker** renders every page on the server (`src/`), plain HTML forms,
  no build step. Works without JavaScript; `public/app.js` only adds the editor's style
  buttons, "are you sure?" on delete and no double sends.
- **D1** holds everything (`migrations/`). Counters are worked out again from the posts
  after every change (`refreshTopic`, `refreshForum` in `src/db.js`), so they can't drift.
- **Files in `public/`** (style.css, app.js, the icon, robots.txt) are served before the
  Worker runs. Bump `ASSET_V` in `src/views.js` when style.css or app.js changes.
- The 48thDb site deploy skips `oshitalk/` (see `.github/workflows/deploy.yml`).

## What it does

| | |
|---|---|
| Reading | forum index with "who is online" and stats · forums with announcements, stickies, pages · topics with numbered posts, the poster's box (rank by posts, oshi, joined) · unread markers (a red ring) · search (titles and posts) · member list · profiles · rules & FAQ |
| Writing | new topic with a label (ถาม, รีวิว, หาเพื่อน …) · reply, quick reply, quote · edit, delete own · preview · BBCode `[b] [i] [u] [s] [quote="name"] [url=…]`, bare links (`src/markup.js`, everything escaped first) |
| Accounts | sign-up with a board name and password (PBKDF2, 100k rounds) · a session cookie (HttpOnly, SameSite=Lax), its hash in D1 · settings: oshi, signature, password · **no e-mail is kept**, so a forgotten password is reset by an admin (below) |
| Safety | a new account's first 3 posts wait for a moderator · a post with a phone number, bank account or พร้อมเพย์ waits always · 3 reports from different members hide a post until a moderator looks · rate limits: 3 topics and 20 posts an hour, 3 sign-ups a day per address (hashed, never stored), 10 sign-in tries in 15 minutes · forms from another site are refused · strict CSP |
| Moderators | `/mod`: waiting posts, reported posts, banned members — pass, reject, delete, restore, ban 1/7/30 days or for good · on a topic: lock, pin, announce, move, delete · ✓ ผ่าน straight on a waiting post · admins set roles on a member's profile |

Optional: Cloudflare Turnstile on the sign-up form — set `TURNSTILE_SITE` in
`wrangler.toml` and `npx wrangler secret put TURNSTILE_SECRET`.

## Run it locally

```sh
cd oshitalk
npm install
npx wrangler d1 migrations apply oshitalk --local
npx wrangler dev --port 8790          # http://localhost:8790
npm test                              # the BBCode tests
node test/smoke.js                    # a browser walk through everything (needs Playwright and the dev server)
```

## Put it online

1. Merge to `main`, then GitHub → Actions → **Deploy OshiTalk** → Run workflow. The first
   run creates the D1 database `oshitalk`, applies the migrations and deploys to
   `oshitalk.<your-subdomain>.workers.dev`. The `CLOUDFLARE_API_TOKEN` secret needs
   **D1: Edit** as well as Workers Scripts: Edit.
2. Sign up on the live board with your own name, then make yourself admin:
   ```sh
   npx wrangler d1 execute oshitalk --remote --command "UPDATE users SET role='admin' WHERE name='YOUR NAME'"
   ```
   From then on, roles are set on a member's profile page.
3. A domain of its own later: add a `routes = [{ pattern = "…", custom_domain = true }]` to `wrangler.toml`.

Reset someone's password (they tell you a new one; nothing is e-mailed):

```sh
node -e "import('./src/auth.js').then(async a => console.log(await a.hashPassword(process.argv[1])))" 'new-password'
npx wrangler d1 execute oshitalk --remote --command "UPDATE users SET pass='<the line printed above>' WHERE name='THEIR NAME'"
```

## Not built yet

Pictures in posts (R2), private messages, notifications, sub-forums, a dark mode,
e-mail for password resets, and anything shared with 48thDb (one sign-in, oshi and
check-in stamps on the poster's box).
