'use client';

/**
 * The sources carousel, and the chip that lands a card in it.
 *
 * Written for slide 2 (docs/mobile-item.html §5) and reused by every stage
 * page on slide 3, which draws the same thing under the same rules: the card
 * is the link, and the rail is deduplicated in order of first appearance.
 *
 * It stopped being the chip's target on 21 September (DIA-386): a chip now
 * opens a drawer under its own passage, which is an answer slide 5 can give
 * too, having chips and no carousel. The rail is the slide's sources as a
 * set, for a reader who wants breadth without reading the body. Nothing in
 * the body points at it any more.
 */

export type SourceCard = {
  id: string;
  /** The source type's Hebrew name - what the chip says, and the card's head. */
  type: string;
  color: string;
  outlet: string;
  quote: string;
  date: string;
  url: string | null;
};

export function SourceRail({ cards }: { cards: SourceCard[] }) {
  if (!cards.length) return null;
  return (
    <ol className="deck-ov-sources" dir="rtl" aria-label="המקורות לסקירה">
      {cards.map((c) => {
        const inner = (
          <>
            <span className="deck-ov-card-head">
              <i className="deck-ov-dot" aria-hidden="true" />
              {c.outlet}
            </span>
            <span className="deck-ov-card-quote">{`„${c.quote}“`}</span>
            <span className="deck-ov-card-date" dir="ltr">{c.date}</span>
          </>
        );
        const label = `${c.type} · ${c.outlet} · ${c.date}`;
        return (
          <li
            key={c.id}
            className="deck-ov-card"
            data-claim={c.id}
            style={{ ['--c' as string]: c.color }}
          >
            {c.url
              ? <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={label}>{inner}</a>
              : <span aria-label={label}>{inner}</span>}
          </li>
        );
      })}
    </ol>
  );
}
