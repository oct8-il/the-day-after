/**
 * Every claim points at something a reader can open. This asks each source URL
 * whether it still answers, and runs on promotion to staging — a dead link in
 * the ledger is the one failure the project cannot argue its way out of.
 *
 * Claims with url:null are skipped here; validate --strict is what refuses to
 * let those reach staging in the first place.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'data', 'incidents');
const claims = readdirSync(DIR).filter((f) => f.endsWith('.json')).flatMap((f) => {
  const inc = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  return inc.claims.filter((c) => c.url).map((c) => ({ incident: inc.id, id: c.id, url: c.url }));
});

if (claims.length === 0) {
  console.log('\n  no claim carries a URL yet — nothing to check.\n');
  process.exit(0);
}

const UA = 'the-next-day link check (+https://github.com/)';
const dead = [];

async function probe({ id, url }) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return;
      if (method === 'GET') dead.push(`${id} → ${res.status} ${url}`);
    } catch (e) {
      if (method === 'GET') dead.push(`${id} → ${e.name === 'TimeoutError' ? 'timeout' : e.message} ${url}`);
    }
  }
}

const queue = [...claims];
await Promise.all(Array.from({ length: 6 }, async () => { let c; while ((c = queue.shift())) await probe(c); }));

console.log(`\n  checked ${claims.length} source links\n`);
for (const d of dead) console.log(`  DEAD  ${d}`);
if (dead.length) { console.log(`\n  ${dead.length} link${dead.length > 1 ? 's' : ''} did not answer.\n`); process.exit(1); }
console.log('  all live.\n');
