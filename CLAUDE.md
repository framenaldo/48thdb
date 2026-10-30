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
is deployed by hand with wrangler. An event whose stream link is one YouTube video
follows that video (`/stream`, `STREAMS` in the page): it closes when the stream
ends and stays on while it runs late. Firebase holds the shared member list,
sign-in, the review queue, flash announcements, election results and event-link
corrections. The Firestore rules are **not in this repo** and are deployed with
the Firebase CLI from the owner's machine.

## Shape of index.html

- Every view has a clean address — 48thdb.com/gallery, /vote, /results,
  /stats, /members, /works, /ge2026 … (`VIEW_SLUG`, `urlForSnapshot`,
  `applyUrlToState`). The host hands any address that is not a file to
  index.html (`not_found_handling` in site.wrangler.toml); the older `?v=<view>`
  links still open and are rewritten. An event, member, song or tag is /event/<id>,
  /member/<id>, /song/<id>, /tag/<name> (a GE candidate's poster /ge2026/<id>); the old `?e=` `?m=` `?s=`
  `?t=` `?p=` forms still open and are rewritten. /m/<id> is the static profile page for search engines. Don't name a folder after a view slug unless it has no index.html.
  Each view sets its own title, description and canonical (`PAGE_META`,
  `applyPageMeta`); index.html carries no static canonical. A new view needs
  a `PAGE_META` row and a place in `VIEWS` in scripts/make-member-pages.mjs,
  which writes sitemap.xml.

- A page's tab is in its address so a reload lands on it: `/works/film`, `/works/concert`, `/works/event`, `/works/series`, `/works/special`,
  `/works/mv`, `/works/ad` for the Works categories (`WORKS_SLUGS`; the songs are `/works/songs`; `/works` still opens), `/works/songs/albums` (its list), `/stats/songs` (the stats tab; the old
  `?d=` `?c=` `?st=` forms still open and are rewritten) (`urlForSnapshot`, `applyUrlToState`).
  A new tab on a page needs the same.
- `state` + `render()` / `renderMain()`, one delegated `data-action` click
  handler, and views switched on `state.view`. Sheets (member, event, day,
  poster…) are drawn into `.ov-layer` at the end of `#main`; when only a sheet
  opens or closes over a page that has not changed (`pageSig`, which leaves out
  what refreshes itself in place: the "x minutes ago" and the home page's live
  vote, plus the saved arrangement), `renderMain` swaps the sheets alone and runs
  only their set-up — never while a page is being arranged (zones move on screen
  without a draw, so ค่าเดิม and hiding need the full draw) — and
  going back from a sheet calls `renderMain`, not `render`. Rebuilding the page
  under a sheet was the stutter on opening one. On phones sheets are solid, with
  no backdrop blur: blurring the page under a moving sheet cost every frame.
- **The header** is the logo, the search and one menu button (`renderSetMenu`:
  GE2026, calendar, gallery and shop, then light/dark and the language), with the
  season's pill and sign-in under it. "+ เพิ่มสมาชิก" lives on the members page.
  The home page opens on a slim date-and-share card (its "วันนี้ที่ 48" heading is
  kept only for search engines and screen readers), the live vote, then the
  **dashboard** (`renderHomeDash`, zone `dash`): between election rounds the
  latest round as a square with its top three, and tiles for หาโอชิจากดวง (it took
  the square that counted down to the concert and results), the next 7 days'
  events, the open shops and the gallery.
  While a round is read out, the results card takes its full size and the tiles
  sit under it in one row.
- **My layout.** A signed-in reader can move, hide or add zones on the home
  page and their profile, pick the bottom menu's four tabs (profile is always
  last), a background and their profile's colour (`LAYOUT_ZONES`,
  `applyLayout`, `renderMyStyleCard`). It lives in `users/<uid>.layout` with a
  copy in localStorage for the first paint; guests get the site as it comes.
  Zones are matched by class (home) or `data-zone` (profile) and ordered with
  CSS `order`, so a new home section needs a row in `LAYOUT_ZONES.home` or it
  can't be moved.
- **Dashboard tiles** are arranged one by one while arranging the home page:
  `layout.dash = { order, hidden }` over `DASH_TILES` (results, quiz, calendar,
  shop, gallery), picked up where it is — a held press on a phone, a drag with a mouse —
  and carried over the others (`tileDown`…`tileDrop`), with an eye in its corner
  (`applyDash`, `dash-toggle`). Each small slot (quiz, cal, shop, gal) also takes
  another kind of tile — a way into another part of the site (members, singles,
  stats, groups, the GE2026 page, my oshi, member of the day, ask) and nothing the
  home page already shows — from a sheet behind the ⇄ button
  (`DASH_KINDS`, `openDashKindSheet`, `layout.dash.kinds`); the shop's slot shows the
  member of the day by default (`DASH_DEFAULT`); the big results square also
  takes a look of its own (`DASH_BIG`, `bigKinds`, `layout.dash.kinds.ge`): member of
  the day on her photo, my oshi, GE2026 countdown, all members, latest releases, the
  quiz; ค่าเดิม on the home page resets them too. A new tile needs a
  `data-tile` and a row in `DASH_TILES`.
- **Biographies.** Each member's sheet has a short biography (IMDb-style)
  that anyone signed in can write: the owner's goes up at once, everyone
  else's waits in `pending/` (kind `bio`). Stored in Firestore
  `bios/<member id>` as `{src, th, en, tags, at}` — `src` is the language it
  was written in, and the other is made by `api.48thdb.com/translate`
  (Workers AI) when the owner saves or approves; `bios/_tags` counts tags.
  The text is a small markup: `@{m:<id>|Name}` (or `w:` a release, `e:` an
  event) for mentions, which print in pink with no picture; `#{tag}` or
  `#{tag|label}` for tags; `[words](https://…)` for links. Nobody's name is
  shown as the writer, and a bio shows nothing about who mentions whom.
  Tag pages are `/tag/<tag>` (view `tag`). Bio text carries `data-noloc`, so
  the language passes leave it as written. Search engines read the bio from
  the static /m/<id> pages, so rerun `node scripts/make-member-pages.mjs`
  after bios change.
- **Seasons on the home page** (`FEST`): by the Thai date the home page wears a
  theme — Kimi to Doko ka e Ikitai to 23 Oct, Halloween 24 Oct – 1 Nov, the GE
  results night 2–15 Nov, Yi Peng 16–30 Nov (Loy Krathong 24 Nov 2026), winter in
  December, and the birthday theme on any current member's birthday (but 14 Nov,
  results night, stays GE: `FIRM`). A theme sets `data-fest` on the root and
  dresses whichever mode the reader picked — the light/dark switch keeps working:
  each theme has a sky and colours for both (`NIGHT` in the script; the night
  themes by day, the day themes at night, in the CSS beside each).
  Things on `.today-hero` and `.ev-card` move with the scroll. The meadow's grass is
  switched off (`GRASS_ON` false, its CSS display:none — Safari's bottom edge never let it sit right); it was
  its own strip at the foot of the screen (`#fest-grass`, in front of the page, under
  the menu bar): three depths of flat-coloured tapered blades on springs, a rolling
  breeze, passing gusts, the page's fling and a finger parting them, with daisies
  and dandelion clocks. Gradients inside every blade halved the frame rate on a
  slow phone — keep the blades flat. The theme's word
  and its off switch are a pill in the header beside "+ เพิ่มสมาชิก" (`#fest-slot`,
  the word shrinks to the room left), home page only; turned off it reads
  "เปิดธีม" (localStorage `48thdb-fest-off`). Keep it smooth on the iPhone:
  only the two canvases redraw (the sky one at 1×), the sky, stars, moon, beams and
  fog are CSS or drawn once, nothing blurs over the sky while a theme is on, and a
  height-only resize (Safari's toolbar) restarts nothing. `window.__festDay`
  pretends another day for testing. Next year's dated themes need new dates.
- Nothing on the home page may arrive late and push the page down under a finger: what comes from the network
  is drawn on the first paint from the copy the phone kept last time (localStorage: `48thdb-ge` the election
  rounds, `48thdb-tl` the iAM48 posts, `48thdb-gec-home` the vote card's figures), and on a first visit a
  placeholder of the same size holds its place (`is-wait`). A new home section that loads late needs the same.
- The GE2026 page's hero has no frame or box: the artwork runs edge to edge as the first screen's own backdrop, with
  no solid colour, and dissolves downward into the page (a mask, top and bottom only, so the text stays inside the
  solid part — mind the padding; the date pills carry their own dark wash for legibility), the picture drifts slowly, the logo glints, the countdown number breathes,
  and one canvas (`geHeroFx`) draws embers rising and a small firework now and then. It runs only while the hero is on
  screen and the tab visible, and not at all with reduced motion. Not drawn in the slim hero of a live results read-out. That dissolve is for dark mode only: in light mode a dark picture melting into a pale page was just fog, so there it is a clean banner (rounded corners, a soft shadow, no mask).
- `SEED_ALL_MEMBERS` draws the page immediately; Firebase catches up after and
  redraws only when something actually differs. Keep that first paint fast.
- `SEED_SCHEDULE` holds events; `TIMELINES` and `GE_PAGE` the election pages.
  Where room is tight (a member's card, the calendar's month cells and bars, a
  day's timeline) an event goes by `eventShortName`: its `short:` if it has one,
  else the title without the group names and the release in front ("Roadshow").
  The home page, the election timeline, the ticker and the event's own sheet
  keep the full title — the owner wants those read in full.
- A venue plan is `seatPlan` on the event (zones, colours, and a price, or a
  `note` for a free event) drawn from a hall in `SEAT_LAYOUTS` (3D SVG, turns
  and lies flat). Union Mall's roadshow floor is a sketch in metres (`SP_RM`,
  40 units to the metre) pieced together from the owner's photos and clips —
  keep it marked as a sketch (`source`) unless the organiser publishes one.
  A hall can carry its chairs (`seats` on the layout: a grid of x's a section,
  counted off the organiser's chart): drawn as little chairs in 3D, rings in
  2D, and counted on each zone's row. Chairs only, never what is sold. MCC
  Hall's are 2,350.
- The Works page (/works/songs, once /music; view `discography`) holds everything the groups made
  or took part in: the songs, then concerts, events, films, series, shows, other
  artists' MVs and ads from `SEED_MEDIA`, picked by category (`WORKS_CATS`). A
  concert or event carries its `date` (and `end`), venue as `by`, and `ev` when
  the schedule has it, so a new one in SEED_SCHEDULE can be linked from here. The same entries
  fill "ผลงานอื่น" on a member's sheet, so a credit only counts while she was
  in the group. `own` marks the group's own productions; `whole` a whole-group
  work with no names on record (ads, channel shows).
- A roadshow's mini concert setlist is `setlist` on the event, a day each
  (`renderSetlist`): sessions, the MCs between, a song's release to open and a
  unit song's members. It folds under the "Mini Concert" row of กำหนดการ
  (`slFolds`) — the row's เซ็ตลิสต์ pill opens it; an event with no such row
  shows it as its own section. The owner's own setlist card for
  the day is `setlists/<event>-<day>.jpg` (or `.png`, as the owner exported it), kept as
  the original file, with a small `-s.jpg` for the button. An `encore:true` part is the encore.
- An event's `detail` (กำหนดการ) lines that start with a time — "12:00–13:00
  Mini Concert", "15:00 …", "28 ส.ค. 10:00 …" — draw as a timetable that follows
  the clock on the day (`renderSchedule`, `schedTick` in `tickClock`): over,
  on now with time left, next. Keep writing them in that shape.
  Who is on in each part goes in `lineup` on the event, `{ day: { 'Mini Concert':[ids],
  'Group Hi-Touch':[ids] } }`: day pills over the timetable and faces under the
  rows whose name contains the key — not as text lines in `detail`.
- Every event sheet opens on a banner (`renderEventBanner`), made like the
  birthday one: a script word for the kind of event (`festKind`, `FEST_KINDS`),
  the release named in the title underneath, a scatter that suits the kind,
  and the faces of who is on. A poster lends it its colours. An event the title
  does not explain, or with its own wording, goes in `FEST_EVENT`.
  `poster.scene:'night'` makes the sheet and its home cards night black into red
  in either mode (the Halloween pop-up); its banner word is set in FC Jong Pen
  Suk (Fontcraft, free for non-commercial use), cut down to Thai and Latin in
  `fonts/fc-jong-pen-suk.woff2`.
  A roadshow's banner word is TT Ricordi Allegria from Adobe Fonts (kit
  `umx5wsc`, its stylesheet fetched only when a roadshow banner is drawn; the
  script stays as the fallback).
- A work in the Works page can carry `watch: [{svc, url}]` for a streaming service that still has it (`STREAM_NAME`, `STREAM_LOGO` (a service shows its name as text until its logo files are in `streaming/`; Prime Video's wordmark is `streaming/prime-wordmark.svg`; a small spot falls back to the name unless `STREAM_ICON` has the service); the owner's logo files in `streaming/` — `<svc>-wordmark.png` on a long button, `<svc>-n.png` in a round icon on a member's row); when the title leaves that service, take the entry out. It can carry `yt` (a trailer, a first episode, a live; not kept where `film` is set — the owner wants only the whole film there), `film` (the whole film, from the owner) and `chan` (a channel of its own, e.g. `@theskaxbnk4868`) on its SEED_MEDIA row, the id of a video
  on the groups' own YouTube channels (BNK48, CGM48, BNK48 and CGM48): a trailer for a
  film, the full live for a concert or election, the first episode of a show. They were
  found by searching YouTube by title and taken only from those channels (31 of 187 the
  first time); a TV show, ad or guest spot on another channel has none. Check a link
  before trusting one found this way. A show or series whose episodes sit in a
  playlist on the groups' own channels lists every one under its card
  ("ดูทุกตอน"): `data/episodes.json`, by the work's title, `[label, video id, length]`,
  read from the channels' playlists (BNK48's ids start PLPW9IgM1jwd, CGM48's PL8aEdSGJXUm)
  and loaded when the Works page is drawn (`mediaEps`). Add a new episode there; such a
  work carries no single `yt`.
- Who is on, wherever it is shown, is a photo tile with her name over it (`rotaTile`, `rt-f`); a tap lights her in every
  round of that block and a second tap opens her page (`rota-hl`). An event with rounds of several kinds and/or days
  carries `rota: { day?, head, where, kinds:[{k,th,en,c}], rounds:[{d?,k,n,a,b,ids}] }` (`renderRota`: day pills when the
  rounds span days, tabs by kind and "โอชิฉัน", rounds past or on now marked by the clock) — the Busking day and the
  Haunted Graveyard. A roadshow's `lineup` and a booth's `slots` keep their own tables but draw the same tiles.
- An event can carry more pictures to swipe through under its first: `poster.more = [{ img, w, h, th, en }]`
  (`posterSlides`, `fitTrack`: clear dots under it and the swipe takes the shown picture's height; `th`/`en` name each dot for screen readers, the first by `poster.th`/`poster.en`; each opens the viewer as
  `pm:<event>:<n>`). The card and the shop show the first only.
- An event poster (`poster.img`) shows on its card from a small copy,
  `<poster>-s.jpg`: run `sh scripts/make-event-thumbs.sh` after adding one,
  then `node scripts/make-poster-grads.mjs` for its sheet colours.
  A line-up of every current member (or a whole group) prints as "All Members"
  / "All BNK48 Members" / "All CGM48 Members" by itself — still list the ids.
- Three languages: `EN/TH` (mix, the default), TH and EN. New Thai UI strings
  need an entry in the `EN` table.
- Member photos: files under `photos/<member id>.jpg`, about 400×400 (the
  owner's 1500px originals live in Documents/48TH/…/Profile). A few still carry
  a base64 `photo:` — either form works. A replaced photo needs a new file name.

## iAM48 posts

The home page's "iAM48 ล่าสุด" row (zone `iamtl`, `renderTimelineZone`) shows what
members post in the iAM48 app, from `api.48thdb.com/timeline`. The Worker walks the
app's public post pages (`tlScan`, its own 5-minute cron — see worker/README.md):
there is no list of posts, only numbers shared with lives and everything else.
A card shows the first three lines and one small picture and opens the post on
iAM48; posts locked to the app ("Exclusive on iAM48") are a strip of names only and
their content is never asked for. Never show or keep the gift senders' pictures.

## Notifications: แจ้งเตือนงาน

A reminder about 30 minutes before an event starts, from the ☰ menu (`openPushSheet`, `pushSubscribe`; hidden
until `GET api.48thdb.com/push/key` answers, so the page can ship before the Worker). Web push: the browser's
subscription goes to the Worker (`POST /push/sub`, KV `ps:<hash>`, with `mode` all or oshi and the reader's oshi
ids); `scripts/build-calendar.mjs` writes `data/push-schedule.json` (every start time, from SEED_SCHEDULE) with the
calendars; the Worker's own cron (`4-59/5`, `pushTick` in worker/push.js) picks starts 25–35 minutes away, queues a
message (`pm:<hash>`) and wakes the browser with an empty VAPID-signed push — nothing is encrypted; `sw.js` then
`POST /push/msg` for the text and shows it. iPhone allows web push only from the Home Screen app, so there the
button first sends the reader to "เพิ่มเว็บไว้หน้าโฮม". Setting up: the private VAPID key is the Worker secret
`VAPID_PRIVATE` (file `worker/.vapid-private`, gitignored; `npx wrangler secret put VAPID_PRIVATE <
.vapid-private`), the public half `VAPID_PUBLIC` is in wrangler.toml. At most 40 pushes a run (the free plan's
subrequest limit). Not sent yet: live-now and election results.

## AI in the search: ถามเว็บได้

A question typed into the search (`renderAskBlock`, `askAnswer`). The Worker's
`/ask` (Workers AI) only turns it into a query (intent, names as typed, when,
month, group …); the page finds the answer in its own data and draws its own
cards, so nothing in it is made up. Names are found in the question first
(`askMembers` — the model misspells Thai names, and a two-letter Thai name or a
short English one counts only when the model read it as a name too). It answers
events, birthdays, members (group, generation, hometown, hobby, tallest, youngest)
and songs (who sings, centres, the latest single); anything else says so. Hidden
until `GET /ask` answers 405 (`checkAI`). A morning summary written by AI on the
home page (สรุปวันนี้) was tried and taken off at the owner's word — don't bring it
back unasked.

## หาโอชิจากดวง (/quiz)

A horoscope quiz, reached from the ☰ menu (`renderQuiz`, view `quiz`). The
reader's birthday (kept in localStorage only, never sent) against each current
member's by three systems Thai fans know: the birth weekday by ทักษา (คู่มิตร
1–5 2–4 3–6 7–8, คู่สมพล 1–6 2–8 3–5 4–7, คู่ศัตรู 1–3 2–5 4–8 6–7, 8 = ราหู =
Wednesday after 18:00 — members' Wednesdays count as by day), ราศีแบบไทย
(sidereal, เมษ from 13 Apr) and the year animal counted from ตรุษจีน (`QZ_CNY`,
1950–2026: extend it before 2027). Five questions on moments every fan knows
(fan type, three seconds at hi-touch, a late live, where to stand at a roadshow),
emoji tiles, each answer one of the four elements, then a grid of 64 emoji to tap
(sixteen sorted to each element); the most-picked element names the reader's fan type (`QZ_FAN`).
The last match is kept on the device (`48thdb-quiz-last`) for the home
dashboard's quiz tile (`renderQuizTile`): three faces of the day, or the member it
found with her % and, while the vote is open, the next good hour to vote for the
Kami Oshi. Only good reasons are printed about a
member, never a clash. It says it is for fun: no school of horoscope has been
shown to work, so don't call any "the accurate one". **Fan and artist, never a
couple**: no สมพงษ์, เนื้อคู่, สเปก or dates with her — the reader's stars are
ถูกโฉลก with a member, the questions are about watching and cheering her.
Under the result, ดวงวันประกาศผล (`renderResultsDay`, until the GE results
day): a shirt to cheer a member (her Kami Oshi first) in her เดช colour, else her
มนตรี or ศรี, the reader's own ศรี, and colours to skip — the results day's
กาลกิณี (green on a Saturday) and the reader's — by the ทักษา wheel 1 2 3 4 7 5 8 6
(`qzHouse`). Above it, while the vote is open, ฤกษ์ดีกดโหวต: the next good ยาม
by ยามอัฐกาล (`qzYams`: 1½-hour watches from 06:00 and 18:00 Thai time, by day
1 6 4 2 7 5 3, by night 1 5 2 6 3 7 4, from the day's planet) ruled by her เดช
planet or the reader's ศรี, none between midnight and 06:00. It says when, never
how much to vote: tokens cost money. แชร์ผล opens the share sheet with a card of
its own (`drawQuizCard`): the reader's fan type and stars, the member in a ring of
the eight ทักษา colours with her %, two reasons, the next two at her sides. The
finished answers are kept on the device (`48thdb-quiz-done`), so the page opens on
the last result; ทำใหม่ starts over, and leaving half way keeps the old result.

## The GE vote on the chain

Public since 1 Oct 2026: the GE2026 page's "ยอดโหวตสด" tab (`/vote`) and a
teaser on its overview. (`?v=gechain`, the owner's old copy, now opens that tab;
the baht figure is fixed at 68 a token — `gecPrice`.)
A cold start reads `data/chain-ge2025.json` (final) and `data/chain-ge2026.json`
(left nightly by `scripts/collect-chain.mjs`, which runs the page's own
GEC-CORE block), then follows the chain. The home page shows a light card
(`data/chain-summary.json`, then votes since, every 15 s). Share cards draw on
the owner's art, `posters/ge2026/share-bg.jpg` (1080×1350); it then follows the chain: near the tip, one read of GE6
transfers a look updates both the votes and the token tally. Since 13 Oct 2026 TokenX's explorer answers visitors from Thailand with 410,
so the browser reads it through the Worker (`POST api.48thdb.com/chain`,
`gecRpc` tries it first, the explorer straight second; the nightly job, abroad,
goes straight). It reads the iAM48 vote off TokenX
(`GEC_POLLS`, POST `eth_getLogs` to scan.tokenx.finance — its paged GET lists
are cached by its CDN and repeat page 1) and keeps running sums in
localStorage. The explorer's websocket (`GEC_WS`, Phoenix: `blocks:new_block` and the
poll's `addresses:` topic) only says *when* to look; the 3-second poll is the fallback. Each vote carries a salted hash, so there are no per-member
counts on the chain; don't promise them. A new election needs its poll
address and start/end blocks from the ElectionFactory's `createPoll`, and its
token's address and mint block in `GEC_TOKEN` (the supply card follows every
Transfer: mint → organiser's vault → sales channels → buyers; it checks out exactly
against the votes). A sales channel is a wallet the vault gave 1,000 tokens or more
(`GEC_CHAN_MIN`): the vault also sends a few tokens straight to fans, who are buyers.

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
that it is closed-door — the missing venue says enough. A Pop Up Live (and the Halloween "POP UP หลอน", on tour or not — any title with "pop up") runs an hour unless it
says `until:` (`eventUntil`); one that follows its YouTube video ends, on the
home page and in the calendar's day sheet, when the stream does.

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
and mint appear only as a swatch on the group history card. An event sheet with a
poster is washed top to bottom in that poster's colours (`sheetGrad`), kept in
`data/poster-grads.json` — run `node scripts/make-poster-grads.mjs` after
adding a poster, because Safari on the iPhone will not let the page read a
canvas back; `poster.scene` (MYO's meadow) is the hand-made exception.

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

## Chasing a flicker or a refresh on a phone

Open the site with `?dbg=1` (`dbgOverlay`): a small green log sits over the page — what loaded it (reload / navigate /
back_forward), how many times this visit it has loaded, and the last redraws with who asked for them. It stays on for
the visit (sessionStorage `dbg-on`, through a reload); `?dbg=0` turns it off. Nothing is sent anywhere.

## Before you say it works

Serve the folder (`.claude/launch.json` starts a static server on port 8823) and
open `/?sw=off`. `node .claude/check-site.mjs` walks every view in three languages,
the sheets and the 3D poster headlessly and reports page errors. Walk every view in all three languages, plus a member sheet and
an event sheet, and check the console is clean. Take a screenshot for anything
visual — the owner reviews on a phone, so check it at phone width.
