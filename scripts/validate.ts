/**
 * The gate. CI runs this on every push; nothing invalid reaches a deployment.
 *
 *   npm run validate          shape + rules (dev)
 *   npm run validate:strict   + publishable (staging, prod)
 *
 * strict is what staging and prod run. It judges what the site PUBLISHES, not
 * what happens to sit in data/: an incident appears on the site only if its id
 * is in data/published.json, and every published incident must be fully sourced
 * - a live URL on every claim. Incidents not yet published may be as rough as
 * they like, because nobody can see them.
 *
 * So Phase 2 is a loop: source an incident, add its id to published.json,
 * promote. That commit is the "published" event the corrections page reads.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Incident, Parent, Place, Taxonomy, INDEPENDENT_TYPES } from '../data/schema/index.ts';
import { stageOf, hasIndependentVerification } from '../lib/stage.ts';
import { checkAnnotated, citedIds, plainText } from '../lib/annotation.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * NOTE (DIA-371): with `illustrative` gone, --strict no longer gates any rule -
 * the published-with-no-URL check was always unconditional. The flag and the
 * CI job are kept because staging and prod are supposed to be judged harder
 * than dev; what that means now is an open question, not a settled one.
 */
const STRICT = process.argv.includes('--strict');

/**
 * Which pool to judge. Both are checked on every push, by the same schema, so
 * a change to data/schema/index.ts that the fixtures do not satisfy turns the
 * build red on the commit that makes it - not weeks later when someone next
 * opens dev and finds it broken.
 */
const flag = process.argv.find((a) => a.startsWith('--pool='))?.slice('--pool='.length);
const POOL = flag ?? 'live';
if (POOL !== 'live' && POOL !== 'test') {
  console.error(`\n  --pool=${flag} is not a pool; expected "live" or "test".\n`);
  process.exit(2);
}
/** Fixture ids start with t, real ones with i. Checked below, both ways. */
const PREFIX = POOL === 'test' ? 't' : 'i';

const SHARED = join(ROOT, 'data');
const DATA = join(SHARED, POOL);

const errors: string[] = [];
const warnings: string[] = [];
const fail = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const warn = (where: string, msg: string) => warnings.push(`${where}: ${msg}`);
const read = (rel: string) => JSON.parse(readFileSync(join(DATA, rel), 'utf8'));
/** The taxonomy is not pool data: both pools render the same stages. */
const readShared = (rel: string) => JSON.parse(readFileSync(join(SHARED, rel), 'utf8'));

/** The incidents the site shows. Everything else is work in progress. */
const published: string[] = read('published.json');
const isPublished = (id: string) => published.includes(id);
const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) =>
  e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');

const taxonomy = Taxonomy.parse(readShared('taxonomy.json'));

const parents = (read('parents.json') as unknown[]).map((raw, n) => {
  const r = Parent.safeParse(raw);
  if (!r.success) { fail(`parents[${n}]`, issues(r.error)); return null; }
  return r.data;
}).filter(Boolean) as ReturnType<typeof Parent.parse>[];

// Each systemic parent occupies one cell of the who x when matrix.
const cells = new Map<string, string[]>();
for (const p of parents) {
  const key = `${p.domain}/${p.phase}`;
  cells.set(key, [...(cells.get(key) ?? []), p.id]);
}

const places = (read('places.json') as unknown[]).map((raw, n) => {
  const r = Place.safeParse(raw);
  if (!r.success) { fail(`places[${n}]`, issues(r.error)); return null; }
  return r.data;
}).filter(Boolean) as ReturnType<typeof Place.parse>[];
const placeIds = new Set(places.map((p) => p.id));
const parentIds = new Set(parents.map((p) => p.id));

// The naming rule: institutions, units and systems only. A denylist of names
// would be a list of people in a public repo, which is the thing the rule
// exists to avoid, so this looks for the shape in which a name actually
// arrives -- a rank, title or office followed by a proper name.
const TITLES = ['רב״ט','סמ״ר','סרן','רס״ן','סא״ל','אל״מ','תא״ל','אלוף','רב־אלוף','רמטכ״ל','שר','השר','ח״כ','ראש הממשלה','מפכ״ל','ניצב','תנ״צ','סנ״צ','פרופ׳','ד״ר','עו״ד','מר','גב׳'];
const ALT = TITLES.map((t) => t.replace(/״/g, '"').replace(/׳/g, "'"));
const ESC = [...new Set([...TITLES, ...ALT])].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const NAME_AFTER_TITLE = new RegExp(`(?:^|[\\s(,])(?:${ESC.join('|')})\\s+[\\u0590-\\u05FF]{2,}\\s+[\\u0590-\\u05FF]{2,}`, 'u');

function checkNames(where: string, text: string) {
  const m = text.match(NAME_AFTER_TITLE);
  if (m) fail(where, `looks like it names an individual: "${m[0].trim()}" - the naming rule allows institutions, units and systems only`);
}

/**
 * An authored field, judged against docs/annotations.html.
 *
 * `coverage` is what varies between fields, and only that: a chip is checked
 * wherever it is written. The naming rule runs on the text with the annotation
 * taken off, so a claim id can never be mistaken for a person.
 */
function checkAnnotatedField(where: string, text: string, claimIds: Set<string>, coverage: boolean) {
  checkNames(where, plainText(text));
  for (const issue of checkAnnotated(text, { coverage })) fail(where, issue.message);
  for (const id of citedIds(text)) {
    if (!claimIds.has(id)) fail(where, `cites "${id}", which is not a claim of this incident`);
  }
}

const files = readdirSync(join(DATA, 'incidents')).filter((f) => f.endsWith('.json')).sort();
let claimCount = 0;
let publishable = 0;
const seen = new Set<string>();

for (const file of files) {
  const where = `incidents/${file}`;
  const r = Incident.safeParse(read(`incidents/${file}`));
  if (!r.success) { fail(where, issues(r.error)); continue; }
  const inc = r.data;

  if (`${inc.id}.json` !== file) fail(where, `id ${inc.id} does not match the filename`);
  if (seen.has(inc.id)) fail(where, `duplicate incident id ${inc.id}`);
  seen.add(inc.id);
  if (!parentIds.has(inc.parent)) fail(where, `parent ${inc.parent} does not exist`);

  checkNames(`${where} he`, inc.he);
  if (inc.card_line) checkNames(`${where} card_line`, inc.card_line);

  const claimIds = new Set(inc.claims.map((c) => c.id));
  checkAnnotatedField(`${where} summary`, inc.summary, claimIds, true);
  if (!inc.claims.some((c) => c.asserts_stage === 1)) {
    fail(where, 'no stage-1 claim: nothing establishes that this failure was identified');
  }

  for (const c of inc.claims) {
    claimCount++;
    const cw = `${where} ${c.id}`;
    checkNames(`${cw} source`, c.source);
    if (c.quote) {
      checkNames(`${cw} quote`, c.quote);
      const words = c.quote.trim().split(/\s+/).length;
      if (words > 40) fail(cw, `quote is ${words} words; the limit is 40`);
    }

    if (!c.url) {
      if (isPublished(inc.id)) fail(cw, 'published with no source URL - a claim without a link is not admissible');
      else warn(cw, 'no source URL (not published yet)');
    } else publishable++;

    if (c.place && !placeIds.has(c.place)) fail(cw, `unknown place "${c.place}"`);

    if (c.asserts_stage === 0 && !c.contests) {
      fail(cw, 'asserts_stage 0 marks a contesting claim, so it must name the claim it contests');
    }
    if (c.contests && !claimIds.has(c.contests)) {
      fail(cw, `contests "${c.contests}", which is not a claim of this incident`);
    }
    if (c.asserts_stage === 5 && !(INDEPENDENT_TYPES as readonly string[]).includes(c.source_type)) {
      fail(cw, `stage 5 asserted by a ${c.source_type} source - independent verification needs a source other than the implementer`);
    }
  }

  for (const sum of inc.summaries ?? []) {
    const sw = `${where} overview(stage ${sum.stage})`;
    if (!inc.claims.some((c) => c.asserts_stage === sum.stage)) {
      fail(sw, 'summarises a stage no claim asserts');
    }
    checkAnnotatedField(sw, sum.text, claimIds, true);
  }

  // The head of slide 5. question and caveat are exempt from the coverage rule
  // and from nothing else - docs/annotations.html §4.
  if (inc.poll) {
    checkAnnotatedField(`${where} poll.failure`, inc.poll.failure, claimIds, true);
    checkAnnotatedField(`${where} poll.status`, inc.poll.status, claimIds, true);
    checkAnnotatedField(`${where} poll.question`, inc.poll.question, claimIds, false);
    checkAnnotatedField(`${where} poll.caveat`, inc.poll.caveat, claimIds, false);
  }

  if (stageOf(inc) === 5 && !hasIndependentVerification(inc)) {
    fail(where, 'computed stage is 5 without an independent verifying source');
  }
}

for (const id of published) {
  if (!seen.has(id)) fail('published.json', `${id} is published but has no file in data/${POOL}/incidents/`);
  if (!id.startsWith(PREFIX)) {
    fail('published.json', `${id} is published from the ${POOL} pool but its id says otherwise - ids start with "${PREFIX}" here`);
  }
}

const label = STRICT ? 'strict (staging/prod)' : 'permissive (dev)';
console.log(`\n  hayom-shaacharei . data validation . ${POOL} pool . ${label}`);
console.log(`  ${parents.length} parents in ${cells.size} matrix cells | ${published.length} of ${files.length} incidents published | ${claimCount} claims, ${publishable} with a source URL | ${places.length} places | ${taxonomy.stages.length} stages\n`);
for (const w of warnings.slice(0, 6)) console.log(`  warn  ${w}`);
if (warnings.length > 6) console.log(`  warn  ... and ${warnings.length - 6} more`);
for (const e of errors) console.log(`  FAIL  ${e}`);
if (errors.length) { console.log(`\n  ${errors.length} error${errors.length > 1 ? 's' : ''}.\n`); process.exit(1); }
console.log(`\n  clean${warnings.length ? ` (${warnings.length} warnings)` : ''}.\n`);
