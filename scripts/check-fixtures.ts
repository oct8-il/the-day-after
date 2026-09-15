/**
 * Are the fixtures still worth rendering?
 *
 * validate --pool=test proves the fixtures fit the schema. That is not the same
 * as proving they are useful. A pool can stay perfectly valid while quietly
 * losing the thing it exists for: someone deletes the regressed incident, or
 * adds a summary to the one record that had none, and dev stops exercising a
 * state the real site still has to survive. Nothing would fail; the gap would
 * only show up as a layout bug on a phone, weeks later.
 *
 * So the coverage the pool must keep is written down here, as assertions. When
 * the data shape changes and a new state appears, this file is where it is
 * added - one line - and every later session inherits the requirement.
 *
 *   npm run check:fixtures
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageOf } from '../lib/stage.ts';
import type { Incident, Parent } from '../data/schema/index.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'test');
const read = (rel: string) => JSON.parse(readFileSync(join(DIR, rel), 'utf8'));

const parents: Parent[] = read('parents.json');
const incidents: Incident[] = readdirSync(join(DIR, 'incidents'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, 'incidents', f), 'utf8')) as Incident);

const claims = incidents.flatMap((i) => i.claims);
const some = (fn: (i: Incident) => boolean) => incidents.some(fn);

/**
 * Each line is a state some page has to render. The wording is what a failure
 * prints, so it should say what is missing, not which predicate returned false.
 */
const required: [string, boolean][] = [
  ['an incident at every stage 1-6',
    [1, 2, 3, 4, 5, 6].every((n) => some((i) => stageOf(i) === n))],
  ['a contested claim (asserts_stage 0 pointing at another claim)',
    claims.some((c) => c.asserts_stage === 0 && c.contests != null)],
  ['the claim a contested claim contests',
    claims.filter((c) => c.contests).every((c) => claims.some((o) => o.id === c.contests))],
  ['an incident with no editor summaries at all',
    some((i) => !i.summaries || i.summaries.length === 0)],
  ['an incident that does have summaries',
    some((i) => (i.summaries?.length ?? 0) > 0)],
  ['an incident whose claims carry no place (the map has nothing to draw)',
    some((i) => i.claims.every((c) => c.place == null))],
  ['an incident whose claims do carry places',
    some((i) => i.claims.some((c) => c.place != null))],
  ['a title long enough to wrap on a phone (>= 60 characters)',
    some((i) => i.he.length >= 60)],
  ['a claim carrying an archive_url',
    claims.some((c) => c.archive_url != null)],
  ['an incident heavy enough to test a long ledger (>= 20 claims)',
    some((i) => i.claims.length >= 20)],
  ['an incident with a single claim',
    some((i) => i.claims.length === 1)],
  ['every source type used at least once',
    ['official', 'oversight', 'press', 'research', 'civil']
      .every((t) => claims.some((c) => c.source_type === t))],
  ['a parent with no incidents at all (an empty matrix cell)',
    parents.some((p) => !incidents.some((i) => i.parent === p.id))],
];

const missing = required.filter(([, ok]) => !ok).map(([what]) => what);

console.log(`\n  fixture coverage . ${incidents.length} incidents, ${claims.length} claims, ${parents.length} parents\n`);
for (const [what, ok] of required) console.log(`  ${ok ? ' ok ' : 'MISS'}  ${what}`);

if (missing.length) {
  console.log(`\n  ${missing.length} state${missing.length > 1 ? 's' : ''} the fixtures no longer cover.`);
  console.log(`  Either restore the fixture that covered it, or - if the shape changed and`);
  console.log(`  the state is genuinely gone - delete its line from scripts/check-fixtures.ts.\n`);
  process.exit(1);
}
console.log('\n  the fixtures still cover every state on the list.\n');
