// Is the iAM48 timeline on the site keeping up with the app? node scripts/check-timeline.mjs [how many numbers past the newest to ask, default 400] [--no-wait]
// Reads api.48thdb.com/timeline, then asks app.bnk48.com for the numbers after the newest post it holds (and a stretch below it) and lists any
// member posts the site is missing. Exit 1 when some are missing. (The Worker's own walk is described in worker/README.md.)
const reach = +process.argv.slice(2).find(a => /^\d+$/.test(a)) || 400;
const API = 'https://api.48thdb.com/timeline', URL_OF = n => `https://app.bnk48.com/timeline/content-member-timeline/${n}`;
const t = await (await fetch(`${API}?c=${Date.now()}`)).json();
const have = new Set(t.posts.map(p => p.n)), top = Math.max(...have), lo = top - 120;
console.log(`site: ${t.posts.length} posts, newest ${top} (${t.posts[0].m}, ${t.posts[0].at}); walk at ${t.walk && t.walk.max}; checked ${t.checked}`);
const nums = []; for (let n = lo; n <= top + reach; n++) if (!have.has(n)) nums.push(n);
const found = [];
async function probe(n){
  try{
    const r = await fetch(URL_OF(n), { headers:{ 'user-agent':'Mozilla/5.0 (48thDb timeline check)', accept:'text/html' } });
    if(r.status === 404) return; if(!r.ok){ found.push({ n, err:r.status }); return; }
    const h = await r.text(), m = h.match(/img\.bnk48cdn\.net\/member\/(\d+)\/profile/);
    if(m) found.push({ n, iam:+m[1], locked:h.indexOf('class="post-card') < 0, ago:((h.match(/post-card-duration">\s*([^<]*?)\s*</) || [])[1] || '') });
  }catch(e){ found.push({ n, err:String(e.message || e).slice(0, 40) }); }
}
for (let i = 0; i < nums.length; i += 24) await Promise.all(nums.slice(i, i + 24).map(probe));
// the Worker keeps only members on its list (data/lives.json, graduates left out), so a page by anyone else is not a miss
const lives = await (await fetch(`https://48thdb.com/data/lives.json?c=${Date.now()}`)).json();
const listed = new Set(Object.values(lives.members || {}).filter(v => v && v.iam && !v.grad).map(v => v.iam));
let missing = found.filter(f => f.iam && listed.has(f.iam)).sort((a, b) => a.n - b.n);
const errs = found.filter(f => f.err);
// a post made in the last few minutes may simply not have been reached by the Worker's walk yet (it runs every five minutes): give it
// seven minutes and look again, and only what is still missing counts. --no-wait skips that.
if (missing.length && !process.argv.includes('--no-wait')) {
  console.log(`${missing.length} not on the site yet; asking again in 7 minutes…`);
  await new Promise(r => setTimeout(r, 7 * 60000));
  const t2 = await (await fetch(`${API}?c=${Date.now()}`)).json(), have2 = new Set(t2.posts.map(p => p.n));
  missing = missing.filter(f => !have2.has(f.n));
}
// a member's post that is on the app but not on the site; ones from graduates or accounts not on the list are not kept by the site on purpose
console.log(`asked ${nums.length} numbers (${lo}…${top + reach}): ${missing.length} member page(s) the site does not hold${errs.length ? `, ${errs.length} could not be asked` : ''}`);
for (const f of missing) console.log(`  ${f.n}  iAM member ${f.iam}  ${f.locked ? 'locked' : f.ago}`);
// most numbers could not be asked (the app refusing this machine, a network fault): that proves nothing, so it is a failure too
if (errs.length > nums.length * .2) { console.log('too many numbers could not be asked; the check is inconclusive'); process.exit(2); }
process.exit(missing.length ? 1 : 0);
