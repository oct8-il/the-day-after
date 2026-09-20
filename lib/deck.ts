/**
 * The rules the phone deck composes from - the ones that are computed rather
 * than authored (docs/mobile-item.html §4).
 *
 * Everything here is pure: the ledger is passed in rather than imported, so a
 * rule can be tested against a handful of literals without a pool on disk.
 * lib/data.ts binds these to the pool this build reads.
 */
/**
 * The types here are structural on purpose. There are two Incident types in
 * this repo - the Zod-inferred one in data/schema and the reading one in
 * lib/data.ts - and a rule about neighbours has no business caring which. A
 * helper takes the shape of the fields it reads and hands back what it was
 * given.
 */
export type SourceClaim = { source_type: string; source: string; date: string };

/**
 * A claim's `source` is published as "publisher — what it is":
 * `צה"ל — תחקיר הקרב בקיבוץ בארי`. The gate wants different halves of that
 * for different slots, so the split happens once, here. A source with no
 * separator is a publisher and nothing else.
 */
export function splitSource(source: string): { publisher: string; title: string | null } {
  const m = source.split(/\s+[—–-]\s+/);
  return m.length > 1
    ? { publisher: m[0].trim(), title: m.slice(1).join(' — ').trim() }
    : { publisher: source.trim(), title: null };
}

/**
 * Authority order for the gate's first slot. Oversight outranks official:
 * this is a failure tracker, and an external finding about a body outranks
 * that body's own statement about itself. (Roy, 19 September.)
 */
const AUTHORITY = ['oversight', 'official'] as const;

const byDate = (a: { date: string }, b: { date: string }) => {
  const k = (d: string) => {
    const m = d.match(/(\d{2})\.(\d{4})/);
    return m ? Number(m[2]) * 100 + Number(m[1]) : (parseInt(d, 10) || 9999) * 100 + 13;
  };
  return k(a.date) - k(b.date);
};

export type SourceLine = {
  /** The document the top official/oversight claim names, or null if there is none. */
  document: string | null;
  /** The publisher behind `document` — kept so a component may shorten the line. */
  documentPublisher: string | null;
  /** The outlet the earliest press claim names. */
  outlet: string | null;
  /** How many other sources the item rests on, counted as distinct publishers. */
  more: number;
};

/**
 * The gate's one-line attribution: `<document> · <outlet> · ועוד N מקורות`.
 *
 * The highest-authority official or oversight claim names the document, the
 * earliest press claim names the outlet, and the rest are counted. An item
 * with no official or oversight source names two outlets instead.
 *
 * `more` counts distinct publishers, not claims: the line says מקורות, and two
 * pieces from the same outlet are one source being counted twice.
 */
export function sourceLine<C extends SourceClaim>(incident: { claims: C[] }): SourceLine {
  const claims = incident.claims;
  const named: C[] = [];

  let doc: C | undefined;
  for (const type of AUTHORITY) {
    const tier = claims.filter((c) => c.source_type === type).sort(byDate);
    if (tier.length) { doc = tier[0]; break; }
  }
  if (doc) named.push(doc);

  const press = claims
    .filter((c) => c.source_type === 'press' && c !== doc)
    .sort(byDate);

  // No document: the line leads with two outlets instead of one.
  const outlets = press.slice(0, doc ? 1 : 2);
  named.push(...outlets);

  const publishersOf = (cs: C[]) => new Set(cs.map((c) => splitSource(c.source).publisher));
  const more = Math.max(0, publishersOf(claims).size - publishersOf(named).size);

  const head = doc ? splitSource(doc.source) : null;
  return {
    document: head ? (head.title ?? head.publisher) : (outlets[0] ? splitSource(outlets[0].source).publisher : null),
    documentPublisher: head ? head.publisher : null,
    outlet: outlets[doc ? 0 : 1] ? splitSource(outlets[doc ? 0 : 1].source).publisher : null,
    more,
  };
}

/**
 * `כשל מס׳ N` — the item's position in published.json, 1-based, never its file
 * id. The number and `מתוך 29` are read from the same list, so they cannot
 * disagree, and the share-post generator reads it too.
 *
 * null for an item that is not published: it has no number to show.
 */
export function itemNumber(id: string, published: readonly string[]): number | null {
  const i = published.indexOf(id);
  return i < 0 ? null : i + 1;
}

/**
 * Slide 6's neighbours: other failures under the same parent first, then a
 * walk on down the ledger from this item's own position, wrapping at the end.
 *
 * Filling from this item rather than from the top of the list is what stops
 * item 30's card row being identical to item 2's. (Roy, 19 September.)
 * Never the item itself, never a duplicate, and never an unpublished record.
 */
export function siblings<T extends { id: string; parent: string }>(
  incident: { id: string; parent: string },
  n: number,
  ledger: { published: readonly string[]; byId: (id: string) => T | undefined },
): T[] {
  const order = ledger.published
    .map((id) => ledger.byId(id))
    .filter((x): x is T => !!x && x.id !== incident.id);

  const taken: T[] = [];
  const push = (x: T) => {
    if (taken.length < n && !taken.includes(x)) taken.push(x);
  };

  for (const x of order) if (x.parent === incident.parent) push(x);

  const start = ledger.published.indexOf(incident.id);
  const from = start < 0 ? 0 : start;
  for (let i = 1; i <= order.length + 1 && taken.length < n; i++) {
    const id = ledger.published[(from + i) % ledger.published.length];
    const x = order.find((y) => y.id === id);
    if (x) push(x);
  }
  return taken;
}

/**
 * `<document> · <outlet> · ועוד N מקורות`.
 *
 * Overflow is the reason this is a function rather than a template: written
 * against the real ledger the line runs to 75 characters where the mock had 38,
 * and overflows one line on 11 of 29 published items. Where it fits, the slot
 * names the document, because naming it is what makes the attribution worth
 * reading; where it does not, it names that document's publisher instead, and
 * every line fits. (Roy, 19 September — spec §4.)
 *
 * The threshold is a character count rather than a measurement because the line
 * has to be chosen on the server, where there is no layout to measure. 13px
 * Assistant at 390 minus two 20px gutters fits about 46 characters; 44 is that
 * with a margin for the widest glyphs.
 */
const FITS = 44;

export function sourceLineText(s: SourceLine): string {
  const tail = [s.outlet, s.more > 0 ? `ועוד ${s.more} מקורות` : null].filter(Boolean);
  const line = (head: string | null) => [head, ...tail].filter(Boolean).join(' · ');

  const full = line(s.document);
  if (full.length <= FITS || !s.documentPublisher) return full;
  return line(s.documentPublisher);
}
