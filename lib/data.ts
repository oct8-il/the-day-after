/**
 * The ledger, as the site reads it.
 *
 * Everything here comes from files in data/. There is no database and no API:
 * the site is built from the repository, which is what makes "the ledger is
 * public and diffable" a fact about the project rather than a promise.
 */
import { ENV } from '@/app/env';
import parentsJson from '@/data/parents.json';
import placesJson from '@/data/places.json';
import taxonomyJson from '@/data/taxonomy.json';
import publishedJson from '@/data/published.json';
import { stageOf, isContested, type Stage } from './stage';

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
export type SummaryLine = { text: string; cites: string[] };
export type Summary = { stage: number; lines: SummaryLine[] };
export type Incident = {
  id: string; parent: string; he: string; summary: string;
  illustrative: boolean; claims: Claim[]; summaries?: Summary[];
};
export type Parent = {
  id: string; short: string; he: string; description: string;
  domain: 'mil' | 'civ' | 'soc'; phase: 'before' | 'during' | 'after';
  icon: string; illustrative: boolean;
};
export type Place = { id: string; he: string; lat: number; lon: number; labelLeft?: boolean };

export const parents = parentsJson as Parent[];
export const places = placesJson as Place[];
export const taxonomy = taxonomyJson;
export const published = publishedJson as string[];

// Incident files are read at build time. A static export has no runtime, so
// this happens once, on the machine that builds the site.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'data', 'incidents');
export const incidents: Incident[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Incident);

/**
 * Which incidents this build renders pages for.
 *
 * staging and prod show only what is published, because staging exists to be
 * the site exactly as it would go out. dev shows everything, because that is
 * where the port is done and an unsourced incident is still a layout worth
 * looking at.
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

export { stageOf, isContested };
export type { Stage };

/**
 * The earliest source date among an incident's stage-1 ("identified") claims -
 * printed under the failure description as "תועד לראשונה · <date>".
 * Mirrors firstDocumented() in the frozen prototype: dates are "DD.MM.YYYY",
 * sorted by year then month: a claim whose date doesn't parse that way sorts
 * after any that do, rather than breaking the page.
 */
export function firstDocumented(incident: { claims: Pick<Claim, 'asserts_stage' | 'date'>[] }): string {
  const dated = incident.claims
    .filter((c) => c.asserts_stage === 1)
    .map((c) => c.date)
    .filter(Boolean)
    .map((d) => {
      const m = d.match(/(\d{2})\.(\d{4})/);
      return m ? ([Number(m[2]), Number(m[1]), d] as [number, number, string])
        : ([parseInt(d, 10) || 9999, 13, d] as [number, number, string]);
    });
  if (!dated.length) return '—';
  dated.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return dated[0][2];
}

/**
 * Does this build contain anything not fully sourced?
 *
 * On dev it does - every incident is rendered, including the ones still being
 * worked on. On staging and prod it must not, because only published incidents
 * are built and the validator refuses to publish one with a claim that has no
 * link. The banner warning readers that the data is illustrative is shown only
 * when this is true, so the site never tells a reader its data is provisional
 * when it is not - or that it is sound when it is not.
 */
export const hasUnsourcedData = visibleIncidents.some(
  (i) => i.illustrative || i.claims.some((c) => !c.url),
);
