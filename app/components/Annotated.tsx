import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { renderAnnotation, type Block, type Inline, type RenderSpan } from '@/lib/annotation';
import { TYPES, type Claim } from '@/lib/data';

/**
 * The interpreter, on screen (DIA-372).
 *
 * One component for every annotated field, on both item pages - the contract is
 * docs/annotations.html and it has one renderer, so a mark can never mean one
 * thing on the phone and another on the desktop.
 *
 * It renders the six features of the set and nothing else. Whatever the author
 * wrote that is not in the set has already been dropped by renderAnnotation; a
 * reader is never shown a syntax error, because by the time a record ships the
 * validator has already refused the ones that matter.
 */

/**
 * How much a chip says out loud. The desktop draws a coloured dot and lets the
 * ledger below name the source; the phone deck has no ledger, so its chip names
 * the type as well - docs/mobile-item.html §5. It is a declared prop and not a
 * media query on purpose: the difference between the surfaces is content, and a
 * mark may not quietly mean one thing here and another there.
 */
export type ChipVariant = 'dot' | 'named' | 'glyph';

/**
 * §5's citation mark on the phone: a link glyph in a 20px round, and `+N`
 * beside it when the passage rests on more than one claim. No type name and no
 * colour - naming the type in Hebrew made the mark ~90px wide, so it wrapped
 * below its own sentence instead of ending it, and a coloured named pill after
 * every sentence turned the page into a legend. The type is said where the
 * source is shown: the drawer and the carousel card (DIA-412).
 */
const LINK = 'M10.6 13.4a3.4 3.4 0 0 0 5.1.4l2-2a3.4 3.4 0 0 0-4.8-4.8l-1.1 1.1M13.4 10.6a3.4 3.4 0 0 0-5.1-.4l-2 2a3.4 3.4 0 0 0 4.8 4.8l1.1-1.1';

function Nodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === 'text') return <span key={i}>{n.text}</span>;
        if (n.kind === 'bold') return <strong key={i}><Nodes nodes={n.children} /></strong>;
        if (n.kind === 'mark') return <mark key={i}><Nodes nodes={n.children} /></mark>;
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            <Nodes nodes={n.children} />
          </a>
        );
      })}
    </>
  );
}

/**
 * The mark a cite span draws at its end: the source type of the first claim it
 * names, and +N when it rests on more than one. It links to the first claim in
 * the ledger below, which CitationLinks opens and scrolls to - the same
 * gesture the old footnote numbers had, so nothing a reader learned is lost.
 *
 * The id is latin inside a Hebrew run, so the chip isolates its own direction
 * and the surrounding punctuation does not reorder around it.
 */
const cite = (ids: string[], claims: Claim[]) =>
  ids.map((id) => claims.find((c) => c.id === id)).filter((c): c is Claim => !!c);

function Chip({ ids, claims, variant, drawer, opens, cites }: {
  ids: string[]; claims: Claim[]; variant: ChipVariant; drawer: string | null;
  /** The sheet this chip opens, where there is no drawer beside it (§5). */
  opens?: string;
  /**
   * The drawer this chip answers to, named even on the card where there is no
   * drawer to name yet (DIA-414). The card and the sheet are the same text, so
   * a passage on the card knows which drawer its tap will open once the sheet
   * has landed; without it the deck would have to count glyphs, and a span
   * that cites nothing draws no glyph, so the count would be wrong.
   */
  cites?: string | null;
}) {
  const cited = cite(ids, claims);
  if (!cited.length) return null;
  const label = cited.map((c) => `${TYPES[c.source_type].he} · ${c.source}`).join(' · ');
  const skin = { ['--c' as string]: TYPES[cited[0]!.source_type].color };
  const inner = variant === 'glyph' ? (
    <>
      <svg className="chip-link" viewBox="0 0 24 24" aria-hidden="true"><path d={LINK} /></svg>
      {cited.length > 1 && <span className="chip-n" dir="ltr">+{cited.length - 1}</span>}
    </>
  ) : (
    <>
      <span className="chip-dot" aria-hidden="true" />
      {variant === 'named' && <span className="chip-type">{TYPES[cited[0]!.source_type].he}</span>}
      {cited.length > 1 && <span className="chip-n" dir="ltr">+{cited.length - 1}</span>}
    </>
  );

  // The mark means one thing on both surfaces; what it *does* is the surface's
  // answer (§5, DIA-386). The desktop has a ledger under the text to jump to;
  // the phone has neither a ledger nor - since 21 September - a carousel to
  // point at, so the chip is a disclosure and the evidence comes to the reader.
  if (drawer) {
    return (
      <button
        type="button"
        className={variant === 'glyph' ? 'chip chip-g' : 'chip'}
        aria-expanded="false"
        aria-controls={drawer}
        aria-label={`המקורות למשפט: ${label}`}
        style={skin}
      >{inner}</button>
    );
  }

  // On a card the evidence is not on the slide at all: the same mark opens the
  // reading sheet, where the drawer is. A link to a claim id would be a link
  // to nothing - the deck has no ledger under it (§5, DIA-413).
  if (opens) {
    return (
      <button
        type="button"
        className={variant === 'glyph' ? 'chip chip-g' : 'chip'}
        data-open={opens}
        data-cite={cites ?? undefined}
        aria-haspopup="dialog"
        aria-controls={`sheet-${opens}`}
        aria-label={`המקורות למשפט: ${label}`}
        style={skin}
      >{inner}</button>
    );
  }

  return (
    <a className={variant === 'glyph' ? 'chip chip-g' : 'chip'} href={`#${cited[0]!.id}`} aria-label={`המקורות למשפט: ${label}`} style={skin}>
      {inner}
    </a>
  );
}

/**
 * What the chip opens: the evidence, in flow beneath the block the chip ends,
 * so the text below moves down rather than being covered.
 *
 * Since v3.4 it is an excerpt rather than a box (DIA-426). Nothing is drawn
 * around it: a 2px rule in the source type's colour stands down its start
 * edge, and what ties it to the passage above is that passage staying tinted
 * while it is open (DIA-414), not a container holding the two together.
 *
 * The × is back (DIA-432). With no box there is no corner to put it in, so it
 * stands at the drawer's own top on the physical left - the side a right-to-
 * left reading never reaches - and the first excerpt's head keeps clear of it.
 * The passage still closes the drawer too; this is the second way, not the
 * only one, which is why it is a button and not the region's only control.
 *
 * Several claims stack in one drawer **in the order the author wrote them in
 * the cite**, not the carousel's order. The carousel is deduplicated by first
 * appearance; this answers what *this sentence* rests on, and the two are
 * meant to disagree.
 */
function Drawer({ id, ids, claims }: { id: string; ids: string[]; claims: Claim[] }) {
  const cited = cite(ids, claims);
  if (!cited.length) return null;
  return (
    <div className="deck-drawer" id={id} hidden role="region" aria-label="המקור">
      <button type="button" className="deck-drawer-x" aria-label="סגירת המקור">×</button>
      {cited.map((c) => (
        <div key={c.id} className="deck-drawer-src" style={{ ['--c' as string]: TYPES[c.source_type].color }}>
          <div className="deck-drawer-head">
            <b className="deck-drawer-name">{c.source}</b>
            {/* The separator is the design's, not a word: a screen reader
                reading "middle dot" between an outlet and its type is noise. */}
            <span aria-hidden="true">·</span>
            <span className="deck-drawer-type">{TYPES[c.source_type].he}</span>
            <i className="deck-drawer-date" dir="ltr">{c.date}</i>
          </div>
          {c.quote
            ? <p className="deck-drawer-quote">{`„${c.quote}“`}</p>
            : <p className="deck-drawer-noq">לא צוטט קטע מהמקור.</p>}
          {/* The way out is its own line, not a wrapper: a link around the
              clipping would make the quote unselectable, and a quote is what
              a reader copies. */}
          {c.url
            ? <a className="deck-drawer-go" href={c.url} target="_blank" rel="noopener noreferrer">
                לפתיחת המקור <span dir="ltr" aria-hidden="true">↗</span>
              </a>
            : <span className="deck-drawer-go" data-dead="">טרם קושר מקור</span>}
        </div>
      ))}
    </div>
  );
}

/** One span's blocks, with the chip drawn into whatever ends it. */
function Span({ blocks, chip, after, k }: {
  blocks: Block[]; chip: ReactNode; after?: ReactNode; k: number;
}) {
  const last = blocks.length - 1;
  return (
    <>
      {blocks.map((b, i) => {
        const end = i === last ? chip : null;
        const tail = i === last ? after : null;
        if (b.kind === 'p') {
          return (
            <Fragment key={`${k}-${i}`}>
              <p><Nodes nodes={b.children} />{end}</p>
              {tail}
            </Fragment>
          );
        }
        const List = b.kind === 'ol' ? 'ol' : 'ul';
        return (
          <Fragment key={`${k}-${i}`}>
            <List>
              {b.items.map((item, j) => (
                <li key={j}>
                  {/* The item's words get their own wrapper: `li` is a flex row
                      carrying the em-dash marker, and a chip dropped straight
                      into it becomes a flex item and stretches. */}
                  <span><Nodes nodes={item} />{j === b.items.length - 1 ? end : null}</span>
                </li>
              ))}
            </List>
            {tail}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * One span that is a list item, because a marker stood in the gap before it.
 *
 * The common case is a single paragraph, and it is unwrapped so the item is the
 * sentence rather than a paragraph inside a bullet. A span carrying more than
 * that keeps its blocks; the chip still ends the item either way.
 */
function Item({ span, claims, k, variant, drawer, opens, cites }: {
  span: RenderSpan; claims: Claim[]; k: number; variant: ChipVariant; drawer: string | null;
  opens?: string; cites?: string | null;
}) {
  const chip = <Chip ids={span.ids} claims={claims} variant={variant} drawer={drawer} opens={opens} cites={cites} />;
  const only = span.blocks.length === 1 && span.blocks[0]?.kind === 'p' ? span.blocks[0] : null;
  return (
    <li>
      {only
        ? <span><Nodes nodes={only.children} />{chip}</span>
        : <Span blocks={span.blocks} chip={chip} k={k} />}
    </li>
  );
}

/**
 * The field, drawn.
 *
 * Spans are laid out in order, except that a run of consecutive spans carrying
 * the same list marker is gathered into one list - docs/annotations.html §3's
 * per-item form. Each item keeps its own chip, because each rests on its own
 * claim; that is the whole reason the form exists.
 */
export function Annotated({ text, claims, chip = 'dot', drawers, opens }: {
  text: string;
  claims: Claim[];
  chip?: ChipVariant;
  /**
   * A prefix for the drawer ids, and the switch that turns them on. One page
   * can carry several of these - a stage stack has one per stage - so the
   * prefix is the caller's to keep unique.
   */
  drawers?: string;
  /**
   * The reading sheet this copy's chips open, for the copy on the card, which
   * has no drawers of its own. Ignored where `drawers` is set (§5, DIA-413).
   */
  opens?: string;
}) {
  const parts = renderAnnotation(text);
  if (!parts.length) return null;
  // One name for a passage's drawer, on both copies. The card has no drawers
  // under its text, but its chips still carry the name (DIA-414) - so the
  // prefix is whichever of the two this copy was given, and the two copies of
  // one field must be given the same one.
  const key = drawers ?? opens;
  const citeOf = (n: number) => (key ? `${key}-d${n}` : null);
  const idOf = (n: number) => (drawers ? citeOf(n) : null);

  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;

    // A section heading (DIA-419, §5). It cites nothing, so it draws no chip
    // and opens no drawer; `ann-h` is the hook both trees style it by, and on
    // the phone it is also what the card's cut looks for.
    if (part.kind === 'heading') {
      out.push(<h3 key={i} className="ann-h"><Nodes nodes={part.children} /></h3>);
      continue;
    }

    const span = part;
    if (!span.marker) {
      const id = idOf(i);
      out.push(
        <Span
          key={i}
          blocks={span.blocks}
          chip={<Chip ids={span.ids} claims={claims} variant={chip} drawer={id} opens={opens} cites={citeOf(i)} />}
          after={drawers && id ? <Drawer id={id} ids={span.ids} claims={claims} /> : null}
          k={i}
        />,
      );
      continue;
    }
    const kind = span.marker;
    const run: { span: RenderSpan; n: number }[] = [];
    while (i < parts.length) {
      const next = parts[i]!;
      if (next.kind !== 'span' || next.marker !== kind) break;
      run.push({ span: next, n: i });
      i += 1;
    }
    i -= 1;
    const List = kind === 'ol' ? 'ol' : 'ul';
    // The list stays one list; each item's drawer follows the whole list, in
    // the items' order, so a bullet's evidence never breaks the run apart.
    out.push(
      <Fragment key={i}>
        <List>
          {run.map((r, j) => (
            <Item key={j} span={r.span} claims={claims} k={j} variant={chip} drawer={idOf(r.n)} opens={opens} cites={citeOf(r.n)} />
          ))}
        </List>
        {run.map((r) => {
          const id = idOf(r.n);
          return drawers && id ? <Drawer key={r.n} id={id} ids={r.span.ids} claims={claims} /> : null;
        })}
      </Fragment>,
    );
  }
  return <>{out}</>;
}
