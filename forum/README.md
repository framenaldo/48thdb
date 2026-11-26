# 48thForum — a fans' web board

The logo is a speech bubble with a light stick: talk, and cheering.

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
- The 48thDb site deploy skips `forum/` (see `.github/workflows/deploy.yml`).

## What it does

| | |
|---|---|
| Reading | forum index with "who is online" and stats · forums with announcements, stickies, pages · topics with numbered posts, the poster's box (rank by posts, oshi, joined) · unread markers (a red ring, for 30 days) · search (titles and posts; any piece of 3+ letters, Thai or English) · member list · profiles · rules & FAQ |
| Writing | new topic with a label (ถาม, รีวิว, หาเพื่อน …) · reply, quick reply, quote · edit, delete own · preview · BBCode `[b] [i] [u] [s] [quote="name"] [url=…]`, bare links (`src/markup.js`, everything escaped first) |
| Accounts | sign-up with a board name and password (PBKDF2, 100k rounds) · a session cookie (HttpOnly, SameSite=Lax), its hash in D1 · settings: oshi, signature, password · **no e-mail is kept**, so a forgotten password is reset by an admin (below) |
| Safety | a new account's first 3 posts wait for a moderator · a post with a phone number, bank account or พร้อมเพย์ waits always · 3 reports from different members hide a post until a moderator looks · rate limits: 3 topics and 20 posts an hour, 3 sign-ups a day per address (hashed, never stored), 10 sign-in tries in 15 minutes · forms from another site are refused · strict CSP |
| Pictures | 📷 in the editor: several at once, 10 a post; the browser shrinks each (long side 1,600 px, JPEG on white — EXIF and the phone's location are dropped; a GIF up to 2 MB goes as it is) and sends it to `POST /upload` (30 an hour; the bytes must be a JPEG, PNG, GIF or WebP); kept in R2 as `p/<key>`, shown at `/i/<key>` straight from R2 (an hour in caches); a post holds `[img=WxH]key[/img]` — only our own pictures, never another site's · a topic's row shows 📷 and how many its first post has · the moderators' queue shows a waiting post's pictures · deleting a post deletes its pictures at once; pictures never posted go after a day (`src/images.js`, table `images`) |
| Busy days | every page reads only the rows it shows (counters kept on the forum and the topic, indexes for the rest) · search through a trigram index (`post_fts`, `topic_fts`, kept in step by triggers; 2-letter words look through the latest 3,000 posts) · guests' pages kept at the edge for `GUEST_CACHE` seconds (30; works once the board has its own domain — the Cache API keeps nothing on workers.dev) · every night at 03:17 a cron clears read marks older than 30 days, spent rate limits and old sessions |
| Moderators | `/mod`: waiting posts, reported posts, banned members — pass, reject, delete, restore, ban 1/7/30 days or for good · on a topic: lock, pin, announce, move, delete · ✓ ผ่าน straight on a waiting post · admins set roles on a member's profile |

Optional: Cloudflare Turnstile on the sign-up form — set `TURNSTILE_SITE` in
`wrangler.toml` and `npx wrangler secret put TURNSTILE_SECRET`.

## Run it locally

```sh
cd forum
npm install
npx wrangler d1 migrations apply 48thforum --local
npx wrangler dev --port 8790 --var GUEST_CACHE:0   # http://localhost:8790, guests' cache off
npm test                              # the BBCode tests
node test/smoke.js                    # a browser walk through everything (needs Playwright and the dev server)
# the nightly job: start dev with --test-scheduled, then  curl 'localhost:8790/__scheduled?cron=17+20+*+*+*'
```

## Put it online

1. Merge to `main`, then GitHub → Actions → **Deploy 48thForum** → Run workflow. The first
   run creates the D1 database `48thforum`, applies the migrations and deploys to
   `48thforum.<your-subdomain>.workers.dev`. It also creates the R2 bucket `48thforum-images` for
   pictures. The `CLOUDFLARE_API_TOKEN` secret needs **D1: Edit** and **Workers R2 Storage: Edit** as
   well as Workers Scripts: Edit, and R2 has to be turned on once in the Cloudflare dashboard.
2. Sign up on the live board with your own name, then make yourself admin:
   ```sh
   npx wrangler d1 execute 48thforum --remote --command "UPDATE users SET role='admin' WHERE name='YOUR NAME'"
   ```
   From then on, roles are set on a member's profile page.
3. A domain of its own later: add a `routes = [{ pattern = "…", custom_domain = true }]` to `wrangler.toml`.

Reset someone's password (they tell you a new one; nothing is e-mailed):

```sh
node -e "import('./src/auth.js').then(async a => console.log(await a.hashPassword(process.argv[1])))" 'new-password'
npx wrangler d1 execute 48thforum --remote --command "UPDATE users SET pass='<the line printed above>' WHERE name='THEIR NAME'"
```

## Not built yet

Private messages, notifications, sub-forums, a dark mode,
e-mail for password resets, and anything shared with 48thDb (one sign-in, oshi and
check-in stamps on the poster's box).
