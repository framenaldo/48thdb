// How many Worker requests has the Cloudflare account used this month? Reads Cloudflare's GraphQL analytics
// (workersInvocationsAdaptive) day by day from the 1st of the month (UTC) and exits 1 — so the GitHub Actions run fails
// and GitHub emails the repo owner — when the month so far passes WARN_AT, or the pace so far would pass the plan's
// 10M included requests by the month's end. The billing period may not start on the 1st, so treat it as a guide.
// Needs a token that can read Account Analytics: CF_USAGE_TOKEN, else CLOUDFLARE_API_TOKEN.
const TOKEN = process.env.CF_USAGE_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
const INCLUDED = 10_000_000;
const WARN_AT = Number(process.env.WARN_AT || 8_000_000);
if (!TOKEN) { console.log('::error::No Cloudflare token (CF_USAGE_TOKEN or CLOUDFLARE_API_TOKEN).'); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function accountId() {
  if (process.env.CF_ACCOUNT_ID) return process.env.CF_ACCOUNT_ID;
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=5', { headers: H });
  const j = await r.json();
  if (!j.success || !j.result?.length) throw new Error('cannot list accounts: ' + JSON.stringify(j.errors || j).slice(0, 300));
  return j.result[0].id;
}

const Q = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
  workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$s,datetime_lt:$e}){sum{requests errors} dimensions{scriptName}}}}}`;

async function day(acc, s, e) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: H, body: JSON.stringify({ query: Q, variables: { a: acc, s: s.toISOString(), e: e.toISOString() } }),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error('GraphQL: ' + j.errors.map(x => x.message).join('; ').slice(0, 400));
  return j.data.viewer.accounts[0]?.workersInvocationsAdaptive || [];
}

const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const acc = await accountId();
let total = 0; const byScript = {}; const days = [];
for (let s = new Date(start); s < now; s = new Date(s.getTime() + 864e5)) {
  const e = new Date(Math.min(s.getTime() + 864e5, now.getTime()));
  let n = 0;
  for (const row of await day(acc, s, e)) {
    n += row.sum.requests;
    byScript[row.dimensions.scriptName] = (byScript[row.dimensions.scriptName] || 0) + row.sum.requests;
  }
  total += n; days.push([s.toISOString().slice(0, 10), n]);
}
const pace = total / ((now - start) / (end - start));
const f = n => Math.round(n).toLocaleString('en-US');
for (const [d, n] of days) console.log(`${d}  ${f(n)}`);
console.log('By Worker:', Object.entries(byScript).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f(v)}`).join(', '));
console.log(`This month so far: ${f(total)} of ${f(INCLUDED)} included; at this pace the month ends near ${f(pace)}.`);
if (total >= WARN_AT || pace >= INCLUDED) {
  console.log(`::error::Worker requests ${f(total)} this month (pace ${f(pace)}), over the warning line — extra requests cost $0.30 per million.`);
  process.exit(1);
}

// Also: what Web Analytics (the owner's visitors card) holds for the last three days, to tell a quiet site from a broken count.
try {
  const RQ = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
    rumPageloadEventsAdaptiveGroups(limit:200,filter:{requestHost:"48thdb.com",datetime_geq:$s,datetime_lt:$e}){count sum{visits} avg{sampleInterval} dimensions{date}}}}}`;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: H,
    body: JSON.stringify({ query: RQ, variables: { a: acc, s: new Date(now - 3 * 864e5).toISOString(), e: now.toISOString() } }) });
  const j = await r.json();
  if (j.errors?.length) console.log('Web Analytics:', j.errors.map(x => x.message).join('; ').slice(0, 300));
  else for (const g of (j.data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups || []).sort((a, b) => a.dimensions.date < b.dimensions.date ? -1 : 1))
    console.log(`Web Analytics ${g.dimensions.date}: visits ${f(g.sum.visits)}, page views ${f(g.count)}, sample interval ${g.avg.sampleInterval}`);
} catch (e) { console.log('Web Analytics: ' + (e.message || e)); }
// the visitors card asks for 31 days by the hour in one go: how heavily is that sampled?
try {
  const Q31 = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
    rumPageloadEventsAdaptiveGroups(limit:1000,filter:{requestHost:"48thdb.com",datetime_geq:$s,datetime_lt:$e}){count sum{visits} avg{sampleInterval} dimensions{datetimeHour}}}}}`;
  for (const days of [31, 7, 3]) {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: H,
      body: JSON.stringify({ query: Q31, variables: { a: acc, s: new Date(now - days * 864e5).toISOString(), e: now.toISOString() } }) });
    const j = await r.json();
    if (j.errors?.length) { console.log(`${days}d by hour:`, j.errors.map(x => x.message).join('; ').slice(0, 300)); continue; }
    const g = j.data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups || [];
    const v = g.reduce((s, x) => s + x.sum.visits, 0), c = g.reduce((s, x) => s + x.count, 0), si = g.length ? Math.max(...g.map(x => x.avg.sampleInterval)) : 0;
    console.log(`${days}d by hour: ${g.length} rows, visits ${f(v)}, page views ${f(c)}, largest sample interval ${si}`);
  }
} catch (e) { console.log('31d probe: ' + (e.message || e)); }
