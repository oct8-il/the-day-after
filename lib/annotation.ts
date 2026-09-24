/**
 * The annotation, as code reads it.
 *
 * The contract is docs/annotations.html - seven features, one chip syntax, one
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
    | 'heading-empty'
    | 'heading-cited'
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
 * A section heading (DIA-419). It lives in the gaps between cite spans,
 * because it asserts nothing and therefore cites nothing - the same reasoning
 * that exempts poll.question from coverage, said once rather than twice.
 *
 * One level. The reading system has exactly one heading style, so `#` through
 * `######` all mean the same heading; refusing five of them would be pedantry
 * about a difference the page cannot show.
 */
const HEADING = /^[ \t]*#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;
const headingText = (line: string) => {
  const m = HEADING.exec(line);
  return m ? (m[1] ?? '').trim() : null;
};

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

  // A heading with no words of its own. Usually that is a cite written into
  // the heading line: the pre-pass cut the span out before this ran, so what
  // is left of the line is the hashes and nothing else.
  for (const [n, gap] of gaps.entries()) {
    const lines = gap.split('\n');
    for (const [k, line] of lines.entries()) {
      if (headingText(line) !== '') continue;
      const cited = k === lines.length - 1 && n < spans.length;
      issues.push(cited
        ? { code: 'heading-cited', message: `a heading carries the cite for "${snip(spans[n]!.text)}" - a heading asserts nothing, so it may not cite` }
        : { code: 'heading-empty', message: 'a heading has no words' });
    }
  }

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

/** Outside a cite span, only whitespace, list markers and headings may appear. */
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
      // A heading states nothing, so there is nothing for it to rest on. The
      // exemption is the field-level one of poll.question, applied to a line.
      if (headingText(line) !== null) continue;
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
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ render */
/**
 * The same spans, shaped for a screen (DIA-372).
 *
 * parseAnnotation answers "is this well formed"; this answers "what does a
 * reader see". They share the pre-pass deliberately: the chip a reader taps
 * covers exactly the span the validator checked, so CI and the page can never
 * disagree about where a citation begins and ends.
 *
 * Everything outside the annotation set is dropped rather than shown. Where the
 * unsupported mark wraps prose - a heading, a blockquote - the prose survives
 * and only the mark goes; where it has no prose to keep, like an image, the
 * whole thing goes. A reader is never shown a syntax error (docs/annotations
 * .html §5); the validator is where the author hears about it.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'mark'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export type Block =
  | { kind: 'p'; children: Inline[] }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'ol'; items: Inline[][] };

/**
 * One cite span as it is drawn: its blocks, and the claims its chip names.
 *
 * `marker` is set when a bare list marker stood in the gap before this span -
 * the per-item list form of docs/annotations.html §3. The span is then one
 * item of a list, and consecutive marked spans of the same kind are one list
 * rather than a run of one-item lists. The marker itself is not in `blocks`,
 * because a citation covers a claim and not the glyph in front of it.
 */
export type RenderSpan = { kind: 'span'; blocks: Block[]; ids: string[]; marker?: 'ul' | 'ol' };

/**
 * A section heading between passages (DIA-419). It carries no ids, because it
 * asserts nothing; it is a part of the field rather than a part of a span, and
 * that is the whole of why the render output is a flat list of parts.
 */
export type RenderHeading = { kind: 'heading'; children: Inline[] };

/** The field in order: its passages, and the headings standing between them. */
export type RenderPart = RenderSpan | RenderHeading;

const LIST_ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/;
/**
 * Marks that wrap prose: the mark goes, the words stay. Hashes are still here
 * because inside a cite span they are not a heading - a heading asserts
 * nothing and a cite span asserts everything, so a hash written in one is a
 * mistake whose words are worth keeping (docs/annotations.html §2, §5).
 */
const STRIP_PREFIX = /^\s*(?:#{1,6}\s+|>\s?)/;
/** Marks with nothing to keep. */
const DROP_INLINE = /!\[[^\]\n]*\]\([^)\n]*\)/g;

/** Inline marks, innermost last so the outer pair wins on a tie. */
function inlines(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src.replace(DROP_INLINE, '');
  while (rest) {
    const link = rest.match(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/);
    const bold = rest.match(/\*\*([\s\S]+?)\*\*/);
    const mark = rest.match(/==([\s\S]+?)==/);
    const first = [link, bold, mark]
      .filter((m): m is RegExpMatchArray => !!m)
      .sort((a, b) => a.index! - b.index!)[0];
    if (!first) { out.push({ kind: 'text', text: clean(rest) }); break; }

    if (first.index! > 0) out.push({ kind: 'text', text: clean(rest.slice(0, first.index!)) });
    if (first === link) out.push({ kind: 'link', href: first[2], children: inlines(first[1]) });
    else if (first === bold) out.push({ kind: 'bold', children: inlines(first[1]) });
    else out.push({ kind: 'mark', children: inlines(first[1]) });
    rest = rest.slice(first.index! + first[0].length);
  }
  return out.filter((n) => n.kind !== 'text' || n.text !== '');
}

/** Leftover markers from syntax the set does not carry, taken off quietly. */
const clean = (s: string) => s.replace(/\*\*|==|`/g, '').replace(/[ \t]+/g, ' ');

/** One span's text as blocks: blank lines separate, list markers gather. */
function blocks(src: string): Block[] {
  const out: Block[] = [];
  for (const chunk of src.split(/\n[ \t]*\n/)) {
    let para: string[] = [];
    let list: { kind: 'ul' | 'ol'; items: Inline[][] } | null = null;
    const flushPara = () => {
      if (!para.length) return;
      const kids = inlines(para.join(' ').trim());
      if (kids.length) out.push({ kind: 'p', children: kids });
      para = [];
    };
    const flushList = () => { if (list) { out.push(list); list = null; } };

    for (const raw of chunk.split('\n')) {
      const line = raw.replace(STRIP_PREFIX, '');
      if (!line.trim()) continue;
      const item = line.match(LIST_ITEM);
      if (item) {
        flushPara();
        const kind = item[1] ? 'ol' : 'ul';
        if (!list || list.kind !== kind) { flushList(); list = { kind, items: [] }; }
        list.items.push(inlines(item[2]));
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    flushPara();
    flushList();
  }
  return out;
}

/**
 * A list marker standing alone in the gap before a span. The coverage rule has
 * always allowed it (§3, and uncoveredText implements it), and it is how a list
 * whose items each rest on a different source is written. Only the gap's last
 * line can be the marker for the span that follows it.
 */
function gapMarker(gap: string): 'ul' | 'ol' | null {
  const lines = gap.split('\n');
  const m = /^[ \t]*(?:([-*+])|\d+[.)])[ \t]*$/.exec(lines[lines.length - 1] ?? '');
  if (!m) return null;
  return m[1] ? 'ul' : 'ol';
}

/**
 * The whole field, ready to draw.
 *
 * Gaps carry no prose, so they are not here - but they may carry the one glyph
 * the coverage rule lets out of a span, so they are read for it. parseAnnotation
 * pushes exactly one gap before each span it records, so gaps[i] is the text
 * immediately before spans[i] however the parse ends.
 */
export function renderAnnotation(src: string): RenderPart[] {
  const { spans, gaps } = parseAnnotation(src);
  const out: RenderPart[] = [];

  /** Every heading a gap holds, in the order it holds them. */
  const headings = (gap: string) => {
    for (const line of gap.split('\n')) {
      const text = headingText(line);
      if (!text) continue;
      const children = inlines(text);
      if (children.length) out.push({ kind: 'heading', children });
    }
  };

  /**
   * The prose a gap holds, as a span that cites nothing.
   *
   * Almost everywhere there is none: the coverage rule keeps prose inside a
   * cite span, and uncoveredText is what refuses a field that breaks it. The
   * exceptions are the two fields docs/annotations.html §4 exempts - a poll's
   * question and its caveat - where the *whole field* is a gap. Dropping it
   * was the renderer answering a writing rule by deleting writing that is not
   * breaking one, and §8's caveat line was the first field to be drawn empty
   * by it (DIA-443).
   *
   * It carries no ids, so it draws no chip and opens no drawer - there is
   * nothing under it to open. `marked` is the gap whose last line is the list
   * marker for the span that follows it: that line belongs to the span, not
   * to the prose above it.
   */
  const spill = (gap: string, marked: boolean) => {
    const lines = gap.split('\n');
    if (marked) lines.pop();
    const prose = lines.filter((l) => l.trim() && headingText(l) === null).join('\n');
    if (!prose.trim()) return;
    const bs = blocks(prose);
    if (bs.length) out.push({ kind: 'span', blocks: bs, ids: [] });
  };

  spans.forEach((s, i) => {
    const gap = gaps[i] ?? '';
    const marker = gapMarker(gap);
    headings(gap);
    spill(gap, marker !== null);
    out.push({ kind: 'span', blocks: blocks(s.text), ids: s.ids, ...(marker ? { marker } : {}) });
  });
  // A heading after the last passage is still the author's words, so it is
  // drawn. The validator is where that shape is called out (DIA-419); the
  // renderer does not answer a writing problem by deleting the writing.
  const tail = gaps[spans.length] ?? '';
  headings(tail);
  // A field with no spans at all has its own last line still to place, and no
  // span for a marker to belong to - so nothing is held back from it.
  spill(tail, spans.length > 0 && gapMarker(tail) !== null);

  return out;
}
