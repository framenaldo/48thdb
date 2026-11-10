// Independent check of the GE6 supply card ("โทเคน GE6 ทั้งหมดอยู่ที่ไหน"): replays every Transfer of the token with exact
// integers (BigInt), sorts the tokens the same way the card does, and checks the totals against the chain's own
// totalSupply() and balanceOf() for the vault, every sales channel, the poll and a sample of buyers. Also sums the poll's
// Voted events. node scripts/verify-ge6-supply.mjs
// through the site's own Worker (api.48thdb.com/chain: logs and the tip only); balanceOf checks run only where eth_call answers
const RPC = process.env.GE6_RPC || 'https://api.48thdb.com/chain';
const TOKEN = '0x2f5c60bde7a5ebd2b116bb03cb5232fa1ea55f1c', START = 48783515;
const POLL = '0x86a1f49e1b1cbd69971e99b66123264c75ac2c8f', POLL_START = 49475830, POLL_END = 50696530;
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const VOTED = '0xf851f974bf070e5929a90c01a09d3c8a0bcbc807f1b3abafbd5bf9d4855547c4';
const ZERO = '0x0000000000000000000000000000000000000000', DEAD = '0x000000000000000000000000000000000000dead';
const hex = n => '0x' + n.toString(16);
async function rpc(method, params) {
  for (let k = 0; ; k++) {
    if (method === 'eth_call' && k) throw new Error('no eth_call');
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
    } catch (e) { if (k >= 4) throw e; await new Promise(r => setTimeout(r, 1500 * (k + 1))); }
  }
}
async function logs(addr, from, to, topic) {
  const out = []; let a = from, step = 5000;
  while (a <= to) {
    const b = Math.min(to, a + step - 1);
    const got = await rpc('eth_getLogs', [{ address: addr, fromBlock: hex(a), toBlock: hex(b), topics: [topic] }]);
    if (got.length >= 1000 && step > 1) { step = Math.max(1, step >> 1); continue; }
    out.push(...got); a = b + 1; if (got.length < 300) step = Math.min(step * 2, 200000);
  }
  return out;
}
const call = async (data) => BigInt(await rpc('eth_call', [{ to: TOKEN, data }, 'latest']));
const balOf = a => call('0x70a08231' + a.slice(2).padStart(64, '0'));
const fmt = v => { const s = (v < 0n ? -v : v).toString().padStart(19, '0'); const i = s.slice(0, -18), d = s.slice(-18, -16); return (v < 0n ? '-' : '') + Number(i).toLocaleString('en-US') + '.' + d; };

const head = parseInt(await rpc('eth_blockNumber', []), 16);
const tl = await logs(TOKEN, START, head, TRANSFER);
const seen = new Set(), bal = {}, vault = [], chan = {}; let minted = 0n, burnt = 0n, dup = 0;
for (const l of tl) {
  const k = l.transactionHash + ':' + l.logIndex; if (seen.has(k)) { dup++; continue; } seen.add(k);
  const f = '0x' + l.topics[1].slice(26), to = '0x' + l.topics[2].slice(26), v = BigInt('0x' + l.data.slice(2, 66));
  if (f === ZERO) { minted += v; if (!vault.includes(to)) vault.push(to); } else bal[f] = (bal[f] || 0n) - v;
  if (to === ZERO || to === DEAD) { burnt += v; continue; }
  bal[to] = (bal[to] || 0n) + v;
  if (vault.includes(f) && !vault.includes(to) && to !== POLL) chan[to] = (chan[to] || 0n) + v;
}
const ONE = 10n ** 18n;
const chans = Object.keys(chan).filter(a => chan[a] >= 1000n * ONE);
const pos = a => (bal[a] > 0n ? bal[a] : 0n);
const vaultT = vault.reduce((s, a) => s + pos(a), 0n), chanT = chans.reduce((s, a) => s + pos(a), 0n), voted = pos(POLL);
const skip = new Set([...vault, ...chans, POLL]);
let buyers = 0n, holders = 0, neg = 0;
for (const [a, v] of Object.entries(bal)) { if (v < 0n) neg++; if (!skip.has(a) && v > 0n) { buyers += v; holders++; } }
console.log(`head block ${head}; ${tl.length} transfers (${dup} repeated in the explorer's answers), ${neg} negative balances`);
console.log(`minted ${fmt(minted)}  burnt ${fmt(burnt)}`);
console.log(`vault (${vault.join(',')}) ${fmt(vaultT)}`);
console.log(`channels ${chans.length}: ${fmt(chanT)}`);
console.log(`buyers ${holders} wallets: ${fmt(buyers)}`);
console.log(`voted (poll balance) ${fmt(voted)}`);
console.log(`sum of the four ${fmt(vaultT + chanT + buyers + voted)}; sold to buyers ${fmt(buyers + voted)}; voted share ${(Number(voted * 10000n / (buyers + voted)) / 100).toFixed(2)}%`);
// the chain's own numbers
let supply = null;
try { supply = await call('0x18160ddd'); } catch (e) { console.log('eth_call not available here (' + (e.message || e) + '): skipping the balanceOf checks'); }
if (supply != null) {
console.log(`totalSupply() ${fmt(supply)} ${supply === minted - burnt ? 'matches' : 'DIFFERS'}`);
let bad = 0;
const check = async (label, a) => { const c = await balOf(a); const r = bal[a] || 0n; if (c !== r) { bad++; console.log(`  MISMATCH ${label} ${a}: replay ${fmt(r)} chain ${fmt(c)}`); } return c; };
for (const a of vault) await check('vault', a);
for (const a of chans) await check('channel', a);
await check('poll', POLL);
const buyerList = Object.keys(bal).filter(a => !skip.has(a) && bal[a] > 0n).sort((x, y) => (bal[y] > bal[x] ? 1 : -1));
const sample = [...buyerList.slice(0, 20), ...buyerList.filter((_, i) => i % Math.max(1, Math.floor(buyerList.length / 40)) === 0)];
for (const a of new Set(sample)) await check('buyer', a);
console.log(`balanceOf checks: ${bad ? bad + ' MISMATCH(ES)' : 'all match'} (${vault.length + chans.length + 1 + new Set(sample).size} wallets)`);
}
// the poll's Voted events
const vl = await logs(POLL, POLL_START, Math.min(head, POLL_END), VOTED);
const vtx = new Set(); let vsum = 0n;
for (const l of vl) { if (vtx.has(l.transactionHash)) continue; vtx.add(l.transactionHash); vsum += BigInt('0x' + l.data.slice(2, 66)); }
console.log(`Voted events: ${vtx.size} votes, ${fmt(vsum)} tokens ${vsum === voted ? '= poll balance' : '(poll balance ' + fmt(voted) + ')'}`);
const last = tl.reduce((m, l) => Math.max(m, parseInt(l.blockNumber, 16)), 0);
console.log(`last transfer at block ${last}`);
