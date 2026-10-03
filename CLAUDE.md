# 48thDb — working notes

A fan-made database for BNK48 and CGM48, live at https://48thdb.com. Everything
the visitor sees is one file, `index.html`: markup, styles, data and script
together. There is no build step.

## How a change reaches the site

Push to `main`. The "Deploy site" workflow uploads the repo (minus `scripts/`,
`worker/`, `.github/`, `.claude/`) to Cloudflare Workers static assets. A deploy
takes about a minute. Check it landed with
`curl -s https://48thdb.com/ | grep <something you changed>`.

Other pieces: `worker/` holds the YouTube live checker at api.48thdb.com, which
is deployed by hand with wrangler. Firebase holds the shared member list,
sign-in, the review queue, flash announcements, election results and event-link
corrections. The Firestore rules are **not in this repo** and are deployed with
the Firebase CLI from the owner's machine.

## Shape of index.html

- `state` + `render()` / `renderMain()`, one delegated `data-action` click
  handler, and views switched on `state.view`.
- `SEED_ALL_MEMBERS` draws the page immediately; Firebase catches up after and
  redraws only when something actually differs. Keep that first paint fast.
- `SEED_SCHEDULE` holds events; `TIMELINES` and `GE_PAGE` the election pages.
- An event poster (`poster.img`) shows on its card from a small copy,
  `<poster>-s.jpg`: run `sh scripts/make-event-thumbs.sh` after adding one.
  A line-up of every current member (or a whole group) prints as "All Members"
  / "All BNK48 Members" / "All CGM48 Members" by itself — still list the ids.
- Three languages: `EN/TH` (mix, the default), TH and EN. New Thai UI strings
  need an entry in the `EN` table.
- Member photos: files under `photos/<member id>.jpg`, about 400×400 (the
  owner's 1500px originals live in Documents/48TH/…/Profile). A few still carry
  a base64 `photo:` — either form works. A replaced photo needs a new file name.

## The GE vote on the chain

Public since 1 Oct 2026: the GE2026 page's "ยอดโหวตสด" tab (`?v=vote`) and a
teaser on its overview. `?v=gechain` is the owner's copy (price box, refresh).
A cold start reads `data/chain-ge2025.json` (final) and `data/chain-ge2026.json`
(left nightly by `scripts/collect-chain.mjs`, which runs the page's own
GEC-CORE block), then follows the chain. The home page shows a light card
(`data/chain-summary.json`, then votes since, every 15 s). Share cards draw on
the owner's art, `posters/ge2026/share-bg.jpg` (1080×1350); it then follows the chain: near the tip, one read of GE6
transfers a look updates both the votes and the token tally. It reads the iAM48 vote straight off TokenX in the browser
(`GEC_POLLS`, POST `eth_getLogs` to scan.tokenx.finance — its paged GET lists
are cached by its CDN and repeat page 1) and keeps running sums in
localStorage. The explorer's websocket (`GEC_WS`, Phoenix: `blocks:new_block` and the
poll's `addresses:` topic) only says *when* to look; the 3-second poll is the fallback. Each vote carries a salted hash, so there are no per-member
counts on the chain; don't promise them. A new election needs its poll
address and start/end blocks from the ElectionFactory's `createPoll`, and its
token's address and mint block in `GEC_TOKEN` (the supply card follows every
Transfer: mint → organiser's vault → the wallets the vault pays = sales channels
→ buyers; it checks out exactly against the votes).

## House rules

**Sources.** For current BNK48 members, bnk48.com wins outright — overwrite what
the database holds. Date a graduation by the member's last day with the group,
never the announcement day.

**Links.** Only use a stream, ticket or shop link that came from the owner or is
printed on the poster. If you must fill one in yourself, say so in your reply and
name the link, so it can be swapped before the event. The owner can also correct
any event link from the event sheet; those corrections live in Firestore
(`eventlinks/`) and are laid over what is written here — when you learn of one,
fix the code too so the two agree.

**Pop-ups.** A CGM48 Pop Up Live held on a Thursday is usually behind closed
doors — no audience, only the YouTube stream — so it is an online event (`online:`,
no venue); the ones on tour have a venue and an audience. Don't write on the page
that it is closed-door — the missing venue says enough.

**Language.** Member names in English; song titles exactly as the official MV
titles them (`SONG_MIX`); venue names in whatever language the poster uses, never
translated. Everything else in Thai.

**Election results.** The rounds are called **ผลด่วน 1 / ผลด่วน 2 / ผลสุดท้าย** —
never "เบื้องต้น". A rank whose score is known but whose name is not says
"กำลังประกาศ". Bands: Senbatsu 1–12, Under Girls 13–24, Next Girls 25–36, with
Senbatsu always on top.

**Design.** Keep the framed look: cards, pill buttons and chips with a visible
press effect. Flatter redesigns were previewed and rejected — don't propose them
again. Keep the pink (#E4457E) and teal (#2E8C82) accents; the official orchid
and mint appear only as a swatch on the group history card.

**Hidden on purpose.** Member-vs-member comparison stays reachable only by a
`?vs=` link — no buttons, no links to it. The site is web only; native apps were
cancelled over store fees, so don't re-pitch them.

**Stats.** A new stat on the stats page usually deserves a short card on the
ภาพรวม tab too (`ovCard()`), except anything counted from `SEED_SCHEDULE` —
events before September 2026 are missing, so such counts mislead.

**Screenshots.** "ตรงที่วง" means the owner drew red circles on the image. If
there are no circles, ask instead of guessing which part they meant.

**Analytics.** Cloudflare Web Analytics is set up with automatic injection —
never add a beacon snippet to the page, or every visit is counted twice.

## Service worker

`sw.js` keeps the page network-first so a deploy reaches everyone; Firestore is
never cached. Bump `VERSION` when editing it. Own images are served stale-first,
so **give a replaced image a new file name** rather than overwriting it, or
devices that already hold it keep showing the old picture. `?sw=off` unregisters
the worker and clears its caches — offer that link before suggesting anyone
clear browser data.

## Before you say it works

Serve the folder (`.claude/launch.json` starts a static server on port 8823) and
open `/?sw=off`. `node .claude/check-site.mjs` walks every view in three languages,
the sheets and the 3D poster headlessly and reports page errors. Walk every view in all three languages, plus a member sheet and
an event sheet, and check the console is clean. Take a screenshot for anything
visual — the owner reviews on a phone, so check it at phone width.
