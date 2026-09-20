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
function Chip({ ids, claims }: { ids: string[]; claims: Claim[] }) {
  const cited = ids.map((id) => claims.find((c) => c.id === id)).filter((c): c is Claim => !!c);
  if (!cited.length) return null;
  const label = cited.map((c) => `${TYPES[c.source_type].he} · ${c.source}`).join(' · ');

  return (
    <a
      className="chip"
      href={`#${cited[0].id}`}
      aria-label={`המקורות למשפט: ${label}`}
      style={{ ['--c' as string]: TYPES[cited[0].source_type].color }}
    >
      <span className="chip-dot" aria-hidden="true" />
      {cited.length > 1 && <span className="chip-n" dir="ltr">+{cited.length - 1}</span>}
    </a>
  );
}

/** One span's blocks, with the chip drawn into whatever ends it. */
function Span({ blocks, chip, k }: { blocks: Block[]; chip: ReactNode; k: number }) {
  const last = blocks.length - 1;
  return (
    <>
      {blocks.map((b, i) => {
        const end = i === last ? chip : null;
        if (b.kind === 'p') {
          return <p key={`${k}-${i}`}><Nodes nodes={b.children} />{end}</p>;
        }
        const List = b.kind === 'ol' ? 'ol' : 'ul';
        return (
          <List key={`${k}-${i}`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Nodes nodes={item} />
                {j === b.items.length - 1 ? end : null}
              </li>
            ))}
          </List>
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
function Item({ span, claims, k }: { span: RenderSpan; claims: Claim[]; k: number }) {
  const chip = <Chip ids={span.ids} claims={claims} />;
  const only = span.blocks.length === 1 && span.blocks[0]?.kind === 'p' ? span.blocks[0] : null;
  return (
    <li>
      {only ? <><Nodes nodes={only.children} />{chip}</> : <Span blocks={span.blocks} chip={chip} k={k} />}
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
export function Annotated({ text, claims }: { text: string; claims: Claim[] }) {
  const spans = renderAnnotation(text);
  if (!spans.length) return null;

  const out: ReactNode[] = [];
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i]!;
    if (!span.marker) {
      out.push(<Span key={i} blocks={span.blocks} chip={<Chip ids={span.ids} claims={claims} />} k={i} />);
      continue;
    }
    const kind = span.marker;
    const run: RenderSpan[] = [];
    while (i < spans.length && spans[i]!.marker === kind) { run.push(spans[i]!); i += 1; }
    i -= 1;
    const List = kind === 'ol' ? 'ol' : 'ul';
    out.push(
      <List key={i}>
        {run.map((r, j) => <Item key={j} span={r} claims={claims} k={j} />)}
      </List>,
    );
  }
  return <>{out}</>;
}
