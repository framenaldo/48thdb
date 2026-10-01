#!/usr/bin/env node
/* Leaves copies of the GE vote, read off the TokenX chain, in data/ so a
 * visitor's first look at the GE2026 vote tab starts from them instead of
 * reading every vote since voting opened:
 *   data/chain-ge2025.json   GE2025, final — written once
 *   data/chain-ge2026.json   GE2026 votes and the GE6 token tally, to now
 * It runs the very code the page runs (the GEC-CORE block of index.html), so
 * the two cannot drift apart. Each run carries on from the copy already there.
 *   node scripts/collect-chain.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const a = html.indexOf('/* GEC-CORE START'), b = html.indexOf('/* GEC-CORE END */');
if(a < 0 || b < a) throw new Error('GEC-CORE block not found in index.html');
// the explorer's CDN turns away requests without a browser-like agent
const fetchUA = (url, opt = {}) => fetch(url, { ...opt, headers:{ ...(opt.headers || {}),
  'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } });
const ctx = vm.createContext({ fetch:fetchUA, setTimeout, console });
const core = vm.runInContext(`var gecWallet = null; function gecPaintProgress(){}
${html.slice(a, b)}
({ gecData, gecSync, gecSyncToken, gecRpc, GEC_POLLS })`, ctx);

const read = f => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
const F25 = 'data/chain-ge2025.json', F26 = 'data/chain-ge2026.json';
const old25 = read(F25), old26 = read(F26);
if(old25) core.gecData.ge2025 = old25;
if(old26){ if(old26.ge2026) core.gecData.ge2026 = old26.ge2026; if(old26.tok) core.gecData.tok = old26.tok; }

const head = parseInt(await core.gecRpc('eth_blockNumber', []), 16);
const done25 = old25 && old25.to >= core.GEC_POLLS.ge2025.end;
if(!done25) await core.gecSync('ge2025', head);
await core.gecSync('ge2026', head);
await core.gecSyncToken(head);

const g = core.gecData;
if(!done25) writeFileSync(F25, JSON.stringify(g.ge2025));
writeFileSync(F26, JSON.stringify({ ge2026:g.ge2026, tok:g.tok }));
console.log(`GE2025 ${g.ge2025.n} votes to block ${g.ge2025.to}; GE2026 ${g.ge2026.n} votes, ${g.tok.n} transfers, to block ${g.ge2026.to}`);
