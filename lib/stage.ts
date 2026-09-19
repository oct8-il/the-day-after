/**
 * Stage is computed, never typed in. This is the only place the rule lives, and
 * the methodology page describes exactly what it does.
 *
 *   stage = the highest stage any claim asserts
 *   a claim asserting 6 (regressed) overrides that, however high the peak was
 *   asserts_stage 0 asserts nothing — it contests another claim
 *
 * Mirrors stageOf() in the frozen prototype so the port cannot silently change
 * what a tile says.
 */
import type { Claim, Incident } from '../data/schema/index.ts';
import { INDEPENDENT_TYPES } from '../data/schema/index.ts';

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function stageOf(incident: { claims: Pick<Claim, 'asserts_stage'>[] }): Stage {
  let peak = 0;
  let regressed = false;
  for (const c of incident.claims) {
    if (c.asserts_stage === 6) regressed = true;
    else if (c.asserts_stage > peak) peak = c.asserts_stage;
  }
  return (regressed ? 6 : peak) as Stage;
}

export function isContested(incident: { claims: Pick<Claim, 'contests'>[] }): boolean {
  return incident.claims.some((c) => c.contests != null);
}

/** Stage 5 means someone other than the implementer checked. */
export function hasIndependentVerification(incident: { claims: Pick<Claim, 'asserts_stage' | 'source_type'>[] }): boolean {
  return incident.claims.some(
    (c) => c.asserts_stage === 5 && (INDEPENDENT_TYPES as readonly string[]).includes(c.source_type),
  );
}

/** A parent shows the distribution of its children's stages — never an average. */
export function stageDistribution(incidents: Incident[]): Record<Stage, number> {
  const d = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<Stage, number>;
  for (const i of incidents) d[stageOf(i)]++;
  return d;
}

/**
 * Dates are published as YYYY, MM.YYYY or DD.MM.YYYY - never invented
 * precision. Sorting is by year then month, and a date that carries neither
 * sorts after every date in its year rather than breaking the page.
 */
function dateKey(d: string): [number, number] {
  const m = d.match(/(\d{2})\.(\d{4})/);
  return m ? [Number(m[2]), Number(m[1])] : [parseInt(d, 10) || 9999, 13];
}

/**
 * The date a stage was reached: the earliest claim asserting it, as published.
 * null when nothing asserts that stage - which is the normal case for every
 * stage on slide 4, where there is no date to print.
 */
export function stageDate(
  incident: { claims: Pick<Claim, 'asserts_stage' | 'date'>[] },
  n: Stage,
): string | null {
  const dated = incident.claims
    .filter((c) => c.asserts_stage === n && c.date)
    .map((c) => [...dateKey(c.date), c.date] as [number, number, string]);
  if (!dated.length) return null;
  dated.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return dated[0][2];
}

/**
 * The stages the item actually reached - the distinct stages its claims
 * assert, ascending. Not "every stage up to the current one": an item may
 * hold 1, 3, 4 and 6 with nothing at 2 or 5, and the ladder draws that gap
 * rather than papering over it. asserts_stage 0 is not a stage; it contests.
 *
 * The current stage is always in here, because stageOf() only ever returns a
 * stage some claim asserts - regression included.
 */
export function reached(incident: { claims: Pick<Claim, 'asserts_stage'>[] }): Stage[] {
  const seen = new Set<number>();
  for (const c of incident.claims) if (c.asserts_stage !== 0) seen.add(c.asserts_stage);
  return [...seen].sort((a, b) => a - b) as Stage[];
}

/**
 * The stages it has not - slide 4's stack, ascending, opening at the first.
 *
 * Only 1-5. Stage 6 (נסוג) is not a goal an item is failing to reach, so it is
 * never "not yet done"; it appears on the ladder only when it has happened.
 */
export function unreached(incident: { claims: Pick<Claim, 'asserts_stage'>[] }): Stage[] {
  const has = new Set<number>(reached(incident));
  const all: Stage[] = [1, 2, 3, 4, 5];
  return all.filter((n) => !has.has(n));
}
