/**
 * One-off: lift the prototype's illustrative dataset out of docs/prototype.html
 * into data/ as JSON. The shape it produces is the first draft of the schema.
 *
 * Everything it writes is marked illustrative:true. Real, sourced data replaces
 * it incident by incident; validate.mjs refuses to let illustrative records
 * reach staging or prod.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs', 'prototype.html');
const OUT = join(ROOT, 'data');

const html = readFileSync(SRC, 'utf8');
const lines = html.split('\n');

// The dataset block runs from `const STAGES=` to the first function declaration.
const start = lines.findIndex(l => l.startsWith('const STAGES='));
const end = lines.findIndex((l, i) => i > start && /^function\s/.test(l));
if (start < 0 || end < 0) throw new Error('dataset block not found in prototype.html');
const src = lines.slice(start, end).join('\n');

const ctx = createContext({});
runInContext(src + '\n;globalThis.__out={STAGES,TYPES,Q,ICONS,DOMAINS,PHASES,PARENTS,PLACES,INCIDENTS,PEOPLE,ARGS};', ctx);
const P = ctx.__out;

const write = (rel, obj) => {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  return rel;
};

// ---- taxonomy: the vocabulary the ledger is written in -------------------
const taxonomy = {
  stages: P.STAGES.filter(Boolean).map(s => ({ n: s.n, he: s.he, color: s.c })),
  source_types: Object.entries(P.TYPES).map(([id, t]) => ({ id, he: t.he, color: t.c })),
  domains: P.DOMAINS,
  phases: P.PHASES,
  questions: Object.fromEntries(
    Object.entries(P.Q).map(([stage, q]) => [stage, { ...q }])
  ),
};

// ---- parents -------------------------------------------------------------
const parents = P.PARENTS.map(p => ({
  id: p.id,
  short: p.short,
  he: p.he,
  description: p.d,
  domain: p.dom,
  phase: p.ph,
  icon: p.icon,
  illustrative: true,
}));

// ---- places --------------------------------------------------------------
const places = Object.entries(P.PLACES).map(([id, v]) => ({
  id, he: v.he, lat: v.lat, lon: v.lon, ...(v.left ? { labelLeft: true } : {}),
}));

// ---- incidents -----------------------------------------------------------
// claim tuple in the prototype:
//   [stage, source_type, source, date, contests(idx|null), place(key|null), quote?]
//   stage 0 marks a claim that contests another claim rather than asserting a stage.
const claimId = (incidentId, idx) => `${incidentId}-c${String(idx + 1).padStart(2, '0')}`;
const CLAIM_KEYS = ['asserts_stage', 'source_type', 'source', 'date', 'contests', 'place', 'quote'];
const incidents = P.INCIDENTS.map(i => ({
  id: i.id,
  parent: i.p,
  he: i.he,
  summary: i.sum,
  illustrative: true,
  claims: i.claims.map((c, idx) => {
    const o = { id: claimId(i.id, idx) };
    CLAIM_KEYS.forEach((k, n) => { if (c[n] !== undefined && c[n] !== null) o[k] = c[n]; });
    // the prototype points at the contested claim by array index; the ledger
    // points at it by id, so a claim can be reordered without breaking the link
    o.contests = c[4] == null ? null : claimId(i.id, c[4]);
    o.place = c[5] ?? null;
    o.url = null;          // no claim is publishable until this is a real link
    o.archive_url = null;  // post-launch
    return o;
  }),
}));

// The illustrative opinion distributions are not part of the ledger. They are
// kept aside so the ported UI has something to render before voting exists.
const opinion = Object.fromEntries(P.INCIDENTS.map(i => [i.id, i.op]));

if (existsSync(OUT)) rmSync(join(OUT, 'incidents'), { recursive: true, force: true });
const written = [
  write('taxonomy.json', taxonomy),
  write('parents.json', parents),
  write('places.json', places),
  ...incidents.map(i => write(`incidents/${i.id}.json`, i)),
  write('illustrative/opinion.json', opinion),
  write('illustrative/people.json', P.PEOPLE),
  write('illustrative/arguments.json', P.ARGS),
  write('illustrative/icons.json', P.ICONS),
];

console.log(`parents: ${parents.length}  incidents: ${incidents.length}  claims: ${incidents.reduce((n, i) => n + i.claims.length, 0)}  places: ${places.length}`);
console.log(`wrote ${written.length} files under data/`);
