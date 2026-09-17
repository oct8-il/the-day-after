import { renderAnnotation, type Block, type Inline } from '@/lib/annotation';
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
function Span({ blocks, ids, claims, k }: { blocks: Block[]; ids: string[]; claims: Claim[]; k: number }) {
  const last = blocks.length - 1;
  return (
    <>
      {blocks.map((b, i) => {
        const chip = i === last ? <Chip ids={ids} claims={claims} /> : null;
        if (b.kind === 'p') {
          return <p key={`${k}-${i}`}><Nodes nodes={b.children} />{chip}</p>;
        }
        const List = b.kind === 'ol' ? 'ol' : 'ul';
        return (
          <List key={`${k}-${i}`}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Nodes nodes={item} />
                {j === b.items.length - 1 ? chip : null}
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export function Annotated({ text, claims }: { text: string; claims: Claim[] }) {
  const spans = renderAnnotation(text);
  if (!spans.length) return null;
  return (
    <>
      {spans.map((s, k) => (
        <Span key={k} blocks={s.blocks} ids={s.ids} claims={claims} k={k} />
      ))}
    </>
  );
}
