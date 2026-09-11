/**
 * The pass report (docs/method/pass.md). Which published incidents have been
 * rebuilt by a pass, which have not, and where each one moved.
 *
 *   npm run check:passes
 *
 * A report, not a gate: it always exits 0. The gate is validate:strict once
 * REQUIRE_PASS in scripts/validate.ts is flipped (1 October 2026), after which
 * an unpassed incident cannot be published.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Incident } from '../data/schema/index.ts';
import { stageOf } from '../lib/stage.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const read = (rel: string) => JSON.parse(readFileSync(join(DATA, rel), 'utf8'));

const published: string[] = read('published.json');
const rows: string[] = [];
let passed = 0;

for (const id of published) {
  const r = Incident.safeParse(read(`incidents/${id}.json`));
  if (!r.success) { rows.push(`  ${id}  INVALID - run npm run validate`); continue; }
  const inc = r.data;
  const after = stageOf(inc);
  if (!inc.pass) { rows.push(`  ${id}  -        stage ${after}   not passed`); continue; }
  passed++;
  const before = inc.pass.stage_before;
  const move = before == null ? 'new' : before === after ? 'held' : before < after ? `up from ${before}` : `DOWN from ${before}`;
  const open = inc.pass.searches.filter((s) => s.outcome === 'unreachable').map((s) => s.stage);
  const flags = [
    open.length ? `unreachable at stage ${open.join(',')}` : '',
    inc.pass.counter.outcome === 'found' ? 'contested' : '',
  ].filter(Boolean).join(' · ');
  rows.push(`  ${id}  ${inc.pass.date}  stage ${after}   ${move}${flags ? '   ' + flags : ''}`);
}

console.log(`\n  hayom-shaacharei . the pass . ${passed} of ${published.length} published incidents passed\n`);
for (const row of rows) console.log(row);
const left = published.length - passed;
console.log(left
  ? `\n  ${left} still to pass before 1 October 2026 - an unpassed incident leaves published.json (docs/method/pass.md).\n`
  : '\n  every published incident has been passed.\n');
