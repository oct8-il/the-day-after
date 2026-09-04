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
  }[];
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
      children: kids.map((i) => {
        const st = stageOf(i);
        return {
          id: i.id, he: i.he, stage: st,
          color: taxonomy.stages.find((s) => s.n === st)!.color,
          stageHe: taxonomy.stages.find((s) => s.n === st)!.he,
          contested: isContested(i),
          places: [...new Set(i.claims.filter((c) => c.place).map((c) => placeName(c.place!)).filter(Boolean) as string[])],
        };
      }),
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
