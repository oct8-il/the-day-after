/**
 * The ledger's shape, and the rules that decide what may be published.
 *
 * Imported by the app for typed data access and by scripts/validate.ts, which
 * CI runs on every push. If a record does not satisfy this file, it does not
 * ship — that is the whole guarantee the methodology page makes to a reader.
 */
import { z } from 'zod';

/** 1 identified · 2 acknowledged · 3 plan announced · 4 implemented · 5 independently verified · 6 regressed */
export const STAGE = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
]);
/** 0 is not a stage: it marks a claim that contests another claim. */
export const ASSERTS_STAGE = z.union([z.literal(0), STAGE]);

export const SOURCE_TYPE = z.enum(['official', 'oversight', 'press', 'research', 'civil']);
/** A stage-5 claim may not come from the body that did the implementing. */
export const INDEPENDENT_TYPES = ['oversight', 'research', 'press', 'civil'] as const;

export const DOMAIN = z.enum(['mil', 'civ', 'soc']);
export const PHASE = z.enum(['before', 'during', 'after']);

/** Dates as published: a year, a month, or a day. Never invented precision. */
const DATE = z.string().regex(/^(\d{2}\.)?(\d{2}\.)?\d{4}$/, 'date must be YYYY, MM.YYYY or DD.MM.YYYY');

export const Claim = z.object({
  id: z.string().regex(/^i\d{2,}-c\d{2,}$/),
  asserts_stage: ASSERTS_STAGE,
  source_type: SOURCE_TYPE,
  /** The publication, institution or report — never a person. */
  source: z.string().min(3),
  date: DATE,
  /** Required to publish. null only while a record is still illustrative. */
  url: z.string().url().nullable(),
  archive_url: z.string().url().nullable().default(null),
  /** id of the claim this one disputes; set together with asserts_stage 0. */
  contests: z.string().nullable().default(null),
  /** Geography belongs to the evidence, not to the incident. */
  place: z.string().nullable().default(null),
  quote: z.string().max(280).optional(),
});

/**
 * An editor-written summary of what the sources say at one stage: the wording
 * of the acknowledgement, what the announced plan actually covers, what was
 * implemented. Every sentence cites the claims it rests on, so the summary is a
 * convenience and the sources remain the authority. Optional - an incident
 * without one is complete, just terser.
 */
export const Summary = z.object({
  stage: STAGE,
  lines: z.array(z.object({
    text: z.string().min(10).max(400),
    cites: z.array(z.string()).min(1, 'a summary sentence with no citation is an opinion'),
  })).min(1),
});

export const Incident = z.object({
  id: z.string().regex(/^i\d{2,}$/),
  parent: z.string().regex(/^p\d+$/),
  he: z.string().min(8),
  summary: z.string().min(20),
  illustrative: z.boolean().default(false),
  claims: z.array(Claim).min(1, 'an incident with no claim is not a record of anything'),
  summaries: z.array(Summary).optional(),
});

export const Parent = z.object({
  id: z.string().regex(/^p\d+$/),
  short: z.string().min(2),
  he: z.string().min(4),
  description: z.string().min(10),
  domain: DOMAIN,
  phase: PHASE,
  icon: z.string().min(2),
  illustrative: z.boolean().default(false),
});

export const Place = z.object({
  id: z.string().min(2),
  he: z.string().min(1),
  lat: z.number().min(29).max(34),
  lon: z.number().min(33).max(36),
  labelLeft: z.boolean().optional(),
});

export const Taxonomy = z.object({
  stages: z.array(z.object({ n: STAGE, he: z.string(), color: z.string() })).length(6),
  source_types: z.array(z.object({ id: SOURCE_TYPE, he: z.string(), color: z.string() })),
  domains: z.array(z.object({ id: DOMAIN, he: z.string() })).length(3),
  phases: z.array(z.object({ id: PHASE, he: z.string() })).length(3),
  questions: z.record(z.string(), z.object({}).loose()),
});

export type Summary = z.infer<typeof Summary>;
export type Claim = z.infer<typeof Claim>;
export type Incident = z.infer<typeof Incident>;
export type Parent = z.infer<typeof Parent>;
export type Place = z.infer<typeof Place>;
