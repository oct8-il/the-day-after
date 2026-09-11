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
  /** i.. for the real ledger, t.. for fixtures - see lib/pool.ts */
  id: z.string().regex(/^[it]\d{2,}-c\d{2,}$/),
  asserts_stage: ASSERTS_STAGE,
  source_type: SOURCE_TYPE,
  /** The publication, institution or report — never a person. */
  source: z.string().min(3),
  date: DATE,
  /** Required to publish. null only while the incident is not yet published. */
  url: z.string().url().nullable(),
  archive_url: z.string().url().nullable().default(null),
  /** id of the claim this one disputes; set together with asserts_stage 0. */
  contests: z.string().nullable().default(null),
  /** Geography belongs to the evidence, not to the incident. */
  place: z.string().nullable().default(null),
  quote: z.string().max(280).optional(),
});

/**
 * An editor-written overview of what the sources say at one stage: the wording
 * of the acknowledgement, what the announced plan actually covers, what was
 * implemented. Optional - an incident without one is complete, just terser.
 *
 * One authored text carrying the annotation of docs/annotations.html. The cite
 * spans inside it are what tie each statement to the claims it rests on, so the
 * overview stays a convenience and the sources remain the authority.
 *
 * Sourcing is NOT enforced here. Until DIA-371 this object carried
 * `cites.min(1, 'a summary sentence with no citation is an opinion')` and the
 * schema itself was the guarantee. The cite boundary is now authored inside the
 * text, where Zod cannot see it, so the guarantee moved to the coverage rule in
 * scripts/validate.ts. It did not go away.
 */
export const Summary = z.object({
  stage: STAGE,
  text: z.string().min(10),
});

/** One photo crop and the credit it may not ship without. */
const Crop = z.object({
  file: z.string().min(1),
  photographer: z.string().min(1),
  source: z.string().min(1),
  licence: z.string().min(1),
  place: z.string().min(1),
  year: z.string().regex(/^\d{4}$/, 'year must be YYYY'),
});

/**
 * Two crops per incident, each optional: portrait for the gate, landscape for
 * the share card. Dimensions are not validated - the crop is trusted. Where the
 * photos come from is DIA-366; this is only their shape.
 */
export const Photo = z.object({
  portrait: Crop.optional(),
  landscape: Crop.optional(),
});

/**
 * The head of slide 5: the standing question, and the three lines that set it
 * up. Annotated like the overviews, with one difference - `question` and
 * `caveat` are exempt from the coverage rule, because a question is put to the
 * reader rather than asserted and a caveat states an absence. See
 * docs/annotations.html §4.
 */
export const Poll = z.object({
  question: z.string().min(8),
  failure: z.string().min(8),
  status: z.string().min(8),
  caveat: z.string().min(8),
});

/**
 * The pass (docs/method/pass.md): the per-incident checklist as data. One
 * search entry per stage 2-6, a counter-evidence search, the responsible body,
 * and the stage before the pass so the movement is visible. The stage after is
 * computed from the claims and never stored.
 *
 * Optional until 1 October 2026; validated whenever present. From that date
 * scripts/validate.ts requires it on every published incident (REQUIRE_PASS).
 */
const PASS_DATE = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, 'a search date is a day: DD.MM.YYYY');
export const SEARCH_OUTCOME = z.enum(['found', 'not_found', 'unreachable']);

export const StageSearch = z.object({
  /** 2 acknowledged .. 6 regressed. Stage 1 is covered by stage1_origins. */
  stage: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  /** Bodies, outlets, channels and query terms actually used - names, not categories. */
  where: z.array(z.string().min(2)).min(1, 'a search that names nowhere was not a search'),
  date: PASS_DATE,
  outcome: SEARCH_OUTCOME,
  /** Ids of the claims authored for this stage; required when found. */
  claims: z.array(z.string()).default([]),
  note: z.string().max(400).optional(),
});

export const Pass = z.object({
  /** The day the pass was completed. */
  date: PASS_DATE,
  /** The body or bodies whose own words count as stage 2 and whose report counts as stage 4. Institutions only. */
  responsible: z.array(z.string().min(2)).min(1),
  /** Computed stage before the pass; null if the incident was not published before. */
  stage_before: STAGE.nullable(),
  /** The distinct originating bodies behind the stage-1 claims - two where they exist. */
  stage1_origins: z.array(z.string().min(2)).min(1),
  searches: z.array(StageSearch).length(5, 'one search per stage 2-6, none skipped'),
  /** The counter-evidence search: a stage-less entry with the same shape. */
  counter: z.object({
    where: z.array(z.string().min(2)).min(1),
    date: PASS_DATE,
    outcome: SEARCH_OUTCOME,
    claims: z.array(z.string()).default([]),
    note: z.string().max(400).optional(),
  }),
  /** Pages that plausibly hold an answer but could not be fetched - for the editor's browser. */
  unreachable: z.array(z.string().url()).default([]),
  /** The Linear sub-issue of this pass. */
  issue: z.string().url().optional(),
});

export const Incident = z.object({
  /** i.. for the real ledger, t.. for fixtures. The prefix is the pool, and
   *  validate.ts refuses a record whose prefix disagrees with the pool it sits
   *  in, so a fixture can never be mistaken for a record of anything. */
  id: z.string().regex(/^[it]\d{2,}$/),
  parent: z.string().regex(/^p\d+$/),
  he: z.string().min(8),
  /**
   * Annotated, and SYSTEMIC: the failure invariant to the date. Had the attack
   * come on 8 October this text would not change, so the 7.10 manifestation
   * belongs to the stage-1 overview instead.
   */
  summary: z.string().min(20),
  /** A short authored statement for the share card - not a truncation of `he`. */
  card_line: z.string().min(8).optional(),
  poll: Poll.optional(),
  photo: Photo.optional(),
  /** Per-item override on the global star-strip flag. */
  feedback_strip: z.boolean().optional(),
  claims: z.array(Claim).min(1, 'an incident with no claim is not a record of anything'),
  summaries: z.array(Summary).optional(),
  /** The per-item checklist as data (docs/method/pass.md). Optional until 1 October 2026. */
  pass: Pass.optional(),
});

export const Parent = z.object({
  id: z.string().regex(/^p\d+$/),
  short: z.string().min(2),
  he: z.string().min(4),
  description: z.string().min(10),
  domain: DOMAIN,
  phase: PHASE,
  icon: z.string().min(2),
});

export const Place = z.object({
  id: z.string().min(2),
  he: z.string().min(1),
  lat: z.number().min(29).max(34),
  lon: z.number().min(33).max(36),
  labelLeft: z.boolean().optional(),
});

export const Taxonomy = z.object({
  /**
   * definition: a clause that completes "לא מצאנו תיעוד לכך ש" on slide 4 and
   * reads as a sentence on its own. why: the second paragraph of slide 4's box,
   * opening "עד אז" - only stages 2-5 can be an unreached page, so only they
   * carry one. Placeholder copy until DIA-420's final wording lands.
   */
  stages: z
    .array(
      z.object({
        n: STAGE,
        he: z.string(),
        color: z.string(),
        definition: z.string().min(1),
        why: z.string().startsWith('עד אז').optional(),
      }),
    )
    .length(6)
    .refine((ss) => ss.every((s) => (s.n >= 2 && s.n <= 5) === (s.why !== undefined)), {
      message: 'stages 2-5 carry a why, and only they do',
    }),
  source_types: z.array(z.object({ id: SOURCE_TYPE, he: z.string(), color: z.string() })),
  domains: z.array(z.object({ id: DOMAIN, he: z.string() })).length(3),
  phases: z.array(z.object({ id: PHASE, he: z.string() })).length(3),
  questions: z.record(z.string(), z.object({}).loose()),
});

export type StageSearch = z.infer<typeof StageSearch>;
export type Pass = z.infer<typeof Pass>;
export type Summary = z.infer<typeof Summary>;
export type Photo = z.infer<typeof Photo>;
export type Poll = z.infer<typeof Poll>;
export type Claim = z.infer<typeof Claim>;
export type Incident = z.infer<typeof Incident>;
export type Parent = z.infer<typeof Parent>;
export type Place = z.infer<typeof Place>;
