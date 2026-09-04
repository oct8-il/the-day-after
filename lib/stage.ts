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
