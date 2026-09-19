/**
 * The ledger, as the site reads it.
 *
 * Everything here comes from files in data/. There is no database and no API:
 * the site is built from the repository, which is what makes "every change to
 * the ledger is recorded and checkable" a fact about the project rather than a
 * promise. (The record readers can check is the public data mirror, not this
 * repository, which stays private - see DIA-370.)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV } from '@/app/env';
import { POOL } from '@/lib/pool';
import taxonomyJson from '@/data/taxonomy.json';
import { stageOf, isContested, stageDate, reached, unreached, type Stage } from './stage';
import { itemNumber, siblings, sourceLine, splitSource } from './deck';

/**
 * Everything except the taxonomy comes from the pool this build reads -
 * data/live for staging and prod, data/test for dev unless told otherwise.
 * See lib/pool.ts. The taxonomy is shared: stages, colours and question
 * wording are the product, not the content, and fixtures that invented their
 * own would be testing a site nobody ships.
 *
 * These are read rather than imported because the path is chosen at build
 * time. A static export has no runtime, so this happens once, on the machine
 * that builds the site.
 */
const DIR = join(process.cwd(), 'data', POOL);
const readPool = <T,>(file: string): T => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as T;

export type Claim = {
  id: string;
  asserts_stage: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  source_type: 'official' | 'oversight' | 'press' | 'research' | 'civil';
  source: string;
  date: string;
  url: string | null;
  archive_url: string | null;
  contests: string | null;
  place: string | null;
  quote?: string;
};
/** One authored overview. `text` carries the annotation - see lib/annotation.ts. */
export type Summary = { stage: number; text: string };
export type Crop = {
  file: string; photographer: string; source: string;
  licence: string; place: string; year: string;
};
export type Photo = { portrait?: Crop; landscape?: Crop };
/** The head of slide 5: the standing question and the three lines above it. */
export type Poll = { question: string; failure: string; status: string; caveat: string };
export type Incident = {
  id: string; parent: string; he: string; summary: string;
  card_line?: string; poll?: Poll; photo?: Photo; feedback_strip?: boolean;
  claims: Claim[]; summaries?: Summary[];
};
export type Parent = {
  id: string; short: string; he: string; description: string;
  domain: 'mil' | 'civ' | 'soc'; phase: 'before' | 'during' | 'after';
  icon: string;
};
export type Place = { id: string; he: string; lat: number; lon: number; labelLeft?: boolean };

export const parents = readPool<Parent[]>('parents.json');
export const places = readPool<Place[]>('places.json');
export const taxonomy = taxonomyJson;
export const published = readPool<string[]>('published.json');

const INCIDENTS_DIR = join(DIR, 'incidents');
export const incidents: Incident[] = readdirSync(INCIDENTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(INCIDENTS_DIR, f), 'utf8')) as Incident);

/**
 * Which incidents this build renders pages for.
 *
 * staging and prod show only what is published, because staging exists to be
 * the site exactly as it would go out. dev shows everything in its pool,
 * because that is where the work is done and a half-finished record is still a
 * layout worth looking at. On the fixture pool that is the whole point; on
 * DATA_POOL=live it is the per-incident authoring loop.
 */
export const visibleIncidents: Incident[] =
  ENV === 'dev' ? incidents : incidents.filter((i) => published.includes(i.id));

export const byId = (id: string) => incidents.find((i) => i.id === id);
export const parentById = (id: string) => parents.find((p) => p.id === id);
export const placeById = (id: string) => places.find((p) => p.id === id);
export const childrenOf = (pid: string) => visibleIncidents.filter((i) => i.parent === pid);

export const STAGES = taxonomy.stages;
export const stageMeta = (n: number) => taxonomy.stages.find((s) => s.n === n)!;
export const TYPES = Object.fromEntries(
  taxonomy.source_types.map((t) => [t.id, t]),
) as Record<Claim['source_type'], { id: string; he: string; color: string }>;

export const QUESTIONS = taxonomy.questions as Record<
  string,
  { type: 'scale' | 'ypn'; he: string; sub: string; lo?: string; hi?: string; label: string }
>;

export { stageOf, isContested, stageDate, reached, unreached, sourceLine, splitSource };
export type { Stage };

/**
 * The deck's rules, bound to the pool this build reads. lib/deck.ts holds them
 * pure - taking the ledger as an argument - so they can be tested without one
 * on disk; these are the versions the pages call.
 */
export const itemNumberOf = (id: string) => itemNumber(id, published);
export const itemTotal = published.length;
export const siblingsOf = (incident: Incident, n: number) =>
  siblings(incident, n, { published, byId });

/**
 * The earliest source date among an incident's stage-1 ("identified") claims -
 * printed under the failure description as "תועד לראשונה · <date>".
 *
 * This is stageDate(incident, 1) with an em dash for "nothing yet". The sort
 * it used to inline now lives in lib/stage.ts, where every stage uses it - the
 * gate's age line asks the same question about stage 4 that this asks about
 * stage 1, and two copies of that rule would drift.
 */
export function firstDocumented(incident: { claims: Pick<Claim, 'asserts_stage' | 'date'>[] }): string {
  return stageDate(incident, 1) ?? '—';
}

/**
 * Does this build contain anything not fully sourced?
 *
 * On dev it does - every incident is rendered, including the ones still being
 * worked on. On staging and prod it must not, because only published incidents
 * are built and the validator refuses to publish one with a claim that has no
 * link. The banner warning readers that the data is provisional is shown only
 * when this is true, so the site never tells a reader its data is provisional
 * when it is not - or that it is sound when it is not.
 *
 * A claim without a link is the whole test. There used to be an `illustrative`
 * flag beside it, from before the pool split; it had been false on every record
 * for a long time, and DIA-371 removed it.
 */
export const hasUnsourcedData = visibleIncidents.some(
  (i) => i.claims.some((c) => !c.url),
);
