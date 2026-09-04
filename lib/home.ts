/**
 * Everything the matrix home needs, computed at build time from the ledger.
 *
 * The prototype computed some of this from illustrative opinion data. Public
 * confidence is Phase 5, so anything derived from votes is absent here rather
 * than faked: what is left is what the sources alone can support.
 */
import { taxonomy, parents, visibleIncidents, stageOf, isContested, type Incident } from './data';

export type ParentCell = {
  id: string; short: string; he: string; description: string; icon: string;
  stage: number; color: string; stageHe: string;
  count: number; implemented: number;
  distribution: { stage: number; color: string; share: number }[];
  children: {
    id: string; he: string; stage: number; color: string; stageHe: string;
    contested: boolean; places: string[];
    claims: number;
    /** The most recent date any source in this incident carries, as ISO. */
    lastSource: string | null;
  }[];
  /** What the distribution actually says, for the drawer's header line. */
  verified: number;
  regressed: number;
  atStageOne: number;
};

/**
 * A claim's date as published: a year, a month, or a day. Resolved to the END
 * of whatever period it names, so "how long since anything moved" understates
 * rather than overstates - the project should never make the gap look worse
 * than the sources support.
 */
function claimDate(date: string): Date | null {
  const parts = date.split('.').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 1) return new Date(Date.UTC(parts[0], 11, 31));
  if (parts.length === 2) return new Date(Date.UTC(parts[1], parts[0], 0));
  return new Date(Date.UTC(parts[2], parts[1] - 1, parts[0]));
}

/** The most recent thing any source said about this incident. */
function lastSourceOf(inc: Incident): string | null {
  const dates = inc.claims.map((c) => claimDate(c.date)).filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString();
}

/**
 * Worst first. A failure that regressed leads, then the ones furthest from
 * being fixed, and within a stage the one nothing has been said about for
 * longest. A drawer that opens on what is stuck answers a question; one in
 * file order only lists.
 */
const worstFirst = (a: { stage: number; lastSource: string | null }, b: typeof a) => {
  const rank = (s: number) => (s === 6 ? -1 : s);
  if (rank(a.stage) !== rank(b.stage)) return rank(a.stage) - rank(b.stage);
  return (a.lastSource ?? '').localeCompare(b.lastSource ?? '');
};

/** A parent's stage is the mean of its children's, never below 1, 6 capped to 5. */
function aggregate(kids: Incident[]): number {
  if (!kids.length) return 1;
  const mean = kids.reduce((a, i) => a + Math.min(stageOf(i), 5), 0) / kids.length;
  return Math.max(1, Math.round(mean));
}

export function buildMatrix(placeName: (id: string) => string | undefined): {
  domains: { id: string; he: string }[];
  phases: { id: string; he: string }[];
  cells: Record<string, ParentCell[]>;
} {
  const cells: Record<string, ParentCell[]> = {};
  for (const p of parents) {
    const kids = visibleIncidents.filter((i) => i.parent === p.id);
    const stage = aggregate(kids);
    const counts = new Map<number, number>();
    for (const i of kids) counts.set(stageOf(i), (counts.get(stageOf(i)) ?? 0) + 1);

    const cell: ParentCell = {
      id: p.id, short: p.short, he: p.he, description: p.description, icon: p.icon,
      stage,
      color: taxonomy.stages.find((s) => s.n === stage)!.color,
      stageHe: taxonomy.stages.find((s) => s.n === stage)!.he,
      count: kids.length,
      implemented: kids.filter((i) => stageOf(i) >= 4 && stageOf(i) < 6).length,
      distribution: [...counts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([s, n]) => ({
          stage: s,
          color: taxonomy.stages.find((x) => x.n === s)!.color,
          share: kids.length ? (n / kids.length) * 100 : 0,
        })),
      verified: kids.filter((i) => stageOf(i) === 5).length,
      regressed: kids.filter((i) => stageOf(i) === 6).length,
      atStageOne: kids.filter((i) => stageOf(i) === 1).length,
      children: kids.map((i) => {
        const st = stageOf(i);
        return {
          id: i.id, he: i.he, stage: st,
          color: taxonomy.stages.find((s) => s.n === st)!.color,
          stageHe: taxonomy.stages.find((s) => s.n === st)!.he,
          contested: isContested(i),
          places: [...new Set(i.claims.filter((c) => c.place).map((c) => placeName(c.place!)).filter(Boolean) as string[])],
          claims: i.claims.length,
          lastSource: lastSourceOf(i),
        };
      }).sort(worstFirst),
    };
    const key = `${p.domain}/${p.phase}`;
    cells[key] = [...(cells[key] ?? []), cell];
  }
  return { domains: taxonomy.domains, phases: taxonomy.phases, cells };
}

/** The headline strip. Every number here comes from the ledger. */
export function buildStrip() {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const i of visibleIncidents) counts[stageOf(i)]++;
  return {
    incidents: visibleIncidents.length,
    parents: parents.length,
    ladder: [1, 2, 3, 4, 5, 6].map((s) => ({
      stage: s,
      he: (['', 'זוהה', 'הוכר', 'תוכנית', 'יושם', 'אומת', 'נסוג'])[s],
      full: taxonomy.stages.find((x) => x.n === s)!.he,
      color: taxonomy.stages.find((x) => x.n === s)!.color,
      count: counts[s],
    })),
    // The prototype's fourth cell counted the gap between "reported implemented"
    // and what the public thinks of it. That needs votes, which are Phase 5, so
    // until then the fourth number is one the sources can answer on their own:
    // failures whose sources contradict each other.
    contested: visibleIncidents.filter(isContested).length,
  };
}
