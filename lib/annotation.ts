/**
 * The annotation, as code reads it.
 *
 * The contract is docs/annotations.html - six features, one chip syntax, one
 * coverage rule. This file is the only parser for it. The validator uses it to
 * refuse a record; the renderer (DIA-372) builds its output on the same spans,
 * so an author can never be told one thing by CI and shown another on screen.
 *
 * The one idea worth carrying in your head: cites are a PRE-PASS, above
 * markdown. Spans are cut out first, and markdown is parsed inside each span,
 * never across one. So a span may hold paragraphs, lists, bold, highlight and
 * hyperlinks, and a construct that opens in one span and closes in another is
 * an error rather than a puzzle for the renderer to solve.
 */

/** A stretch of text a single chip covers, and the claims it rests on. */
export type CiteSpan = {
  /** The text between [[ and ]], markdown still unparsed. */
  text: string;
  /** Claim ids, in the order written. */
  ids: string[];
  start: number;
  end: number;
};

export type AnnotationIssue = {
  /** Stable name, so a caller can group or ignore without matching prose. */
  code:
    | 'cite-unclosed'
    | 'cite-nested'
    | 'cite-empty'
    | 'cite-no-ids'
    | 'cite-duplicate-id'
    | 'span-crossing'
    | 'uncovered';
  message: string;
};

export type Parsed = {
  spans: CiteSpan[];
  /** The text between and around the spans - what the coverage rule judges. */
  gaps: string[];
  issues: AnnotationIssue[];
};

const OPEN = '[[';
const CLOSE = ']](';

/**
 * Cut the text into cite spans and the gaps between them.
 *
 * Structural problems are reported here; the coverage rule is not, because it
 * applies to some fields and not others (docs/annotations.html §4). Call
 * checkAnnotated for the whole judgement.
 */
export function parseAnnotation(src: string): Parsed {
  const spans: CiteSpan[] = [];
  const gaps: string[] = [];
  const issues: AnnotationIssue[] = [];
  const snip = (s: string) => {
    const one = s.trim().replace(/\s+/g, ' ');
    return one.length > 48 ? `${one.slice(0, 48)}...` : one;
  };

  let i = 0;
  while (i < src.length) {
    const open = src.indexOf(OPEN, i);
    if (open === -1) { gaps.push(src.slice(i)); break; }
    gaps.push(src.slice(i, open));

    const close = src.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) {
      issues.push({ code: 'cite-unclosed', message: `a cite opens at "${snip(src.slice(open, open + 60))}" and never closes` });
      gaps.push(src.slice(open));
      break;
    }
    const inner = src.slice(open + OPEN.length, close);
    if (inner.includes(OPEN)) {
      issues.push({ code: 'cite-nested', message: `a cite opens inside another cite, near "${snip(inner)}"` });
    }

    const idsEnd = src.indexOf(')', close + CLOSE.length);
    if (idsEnd === -1) {
      issues.push({ code: 'cite-unclosed', message: `the claim list after "${snip(inner)}" never closes` });
      gaps.push(src.slice(open));
      break;
    }
    const ids = src.slice(close + CLOSE.length, idsEnd).split(',').map((s) => s.trim()).filter(Boolean);

    if (!inner.trim()) {
      issues.push({ code: 'cite-empty', message: 'a cite covers no text' });
    }
    if (!ids.length) {
      issues.push({ code: 'cite-no-ids', message: `the cite covering "${snip(inner)}" names no claim` });
    }
    for (const [n, id] of ids.entries()) {
      if (ids.indexOf(id) !== n) {
        issues.push({ code: 'cite-duplicate-id', message: `the cite covering "${snip(inner)}" names ${id} twice` });
      }
    }

    spans.push({ text: inner, ids, start: open, end: idsEnd + 1 });
    i = idsEnd + 1;
  }

  for (const s of spans) issues.push(...crossing(s.text, `the cite covering "${snip(s.text)}"`));
  for (const g of gaps) issues.push(...crossing(g, 'text outside any cite'));

  return { spans, gaps, issues };
}

/**
 * A markdown construct that opens in one span and closes in another shows up
 * here as an odd marker count, because a span is parsed on its own. The message
 * says "crosses a span boundary or never closes" because from inside one span
 * those are the same fact.
 */
function crossing(text: string, where: string): AnnotationIssue[] {
  const out: AnnotationIssue[] = [];
  const pairs: [string, RegExp, string][] = [
    ['bold', /\*\*/g, '**'],
    ['highlight', /==/g, '=='],
  ];
  for (const [what, re, mark] of pairs) {
    if ((text.match(re) ?? []).length % 2 !== 0) {
      out.push({ code: 'span-crossing', message: `${where} leaves a ${what} run (${mark}) open - a markdown construct may not cross a span boundary` });
    }
  }
  // Hyperlinks, once the well-formed ones are taken out of the picture.
  const rest = text.replace(/\[[^\]\n]*\]\([^)\n]*\)/g, '');
  if (rest.includes('](')) {
    out.push({ code: 'span-crossing', message: `${where} leaves a hyperlink open - a markdown construct may not cross a span boundary` });
  }
  return out;
}

/** Outside a cite span, only whitespace and list markers may appear. */
const LIST_MARKER_ONLY = /^\s*(?:[-*+]|\d+[.)])\s*$/;

/**
 * The coverage rule. Returns what breaks it, so the caller can print the text
 * that is not carried by a source rather than the predicate that caught it.
 */
export function uncoveredText(gaps: string[]): string[] {
  const out: string[] = [];
  for (const gap of gaps) {
    for (const line of gap.split('\n')) {
      if (!line.trim()) continue;
      if (LIST_MARKER_ONLY.test(line)) continue;
      out.push(line.trim());
    }
  }
  return out;
}

/**
 * The whole judgement on one field.
 *
 * `coverage` is false for the two fields docs/annotations.html §4 exempts -
 * poll.question and poll.caveat. Everything else is checked either way: a chip
 * written in an exempt field is still a chip.
 */
export function checkAnnotated(src: string, { coverage }: { coverage: boolean }): AnnotationIssue[] {
  const parsed = parseAnnotation(src);
  const issues = [...parsed.issues];
  if (coverage) {
    for (const line of uncoveredText(parsed.gaps)) {
      issues.push({ code: 'uncovered', message: `"${line}" is not covered by any cite - every statement must rest on a source` });
    }
  }
  return issues;
}

/** Every claim id the text cites, in order of first appearance. */
export function citedIds(src: string): string[] {
  const seen: string[] = [];
  for (const span of parseAnnotation(src).spans) {
    for (const id of span.ids) if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}

/**
 * The text with the annotation taken off - what a name check or a word count
 * should look at, and what a reader would hear read aloud.
 */
export function plainText(src: string): string {
  return src
    .replace(/\[\[/g, '')
    .replace(/\]\]\([^)\n]*\)/g, '')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/==/g, '')
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
