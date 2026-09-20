'use client';

import { useCallback, useRef } from 'react';

/**
 * The sources carousel, and the chip that lands a card in it.
 *
 * Written for slide 2 (docs/mobile-item.html §5) and reused by every stage
 * page on slides 3 and 4, which draw the same thing under the same rules: the
 * card is the link, the chip moves the rail rather than leaving the deck, and
 * the rail is deduplicated in order of first appearance so a chip resting on
 * two claims lands two adjacent cards.
 *
 * One rail per page, each with its own ref, because a stage stack has several
 * on screen at once and a chip belongs to the page it was written in.
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

/**
 * The landing. A chip's href is the claim id, the same target it carries on
 * the desktop; here it moves the rail instead of the page. Measured, because
 * the rail is RTL and scrollLeft's sign there is not worth remembering.
 */
export function useSourceRail() {
  const rail = useRef<HTMLOListElement>(null);

  const onChip = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const chip = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.chip');
    const box = rail.current;
    if (!chip || !box) return;
    const id = chip.getAttribute('href')?.slice(1);
    const card = id ? box.querySelector<HTMLElement>(`[data-claim="${CSS.escape(id)}"]`) : null;
    if (!card) return;

    e.preventDefault();
    for (const el of box.querySelectorAll('[data-on]')) el.removeAttribute('data-on');
    card.setAttribute('data-on', '');

    const dx = card.getBoundingClientRect().left - box.getBoundingClientRect().left;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (Math.abs(dx) > 0.5) box.scrollBy({ left: dx, behavior: still ? 'instant' : 'smooth' });
  }, []);

  return { rail, onChip };
}

export function SourceRail({ cards, railRef }: {
  cards: SourceCard[];
  railRef: React.RefObject<HTMLOListElement | null>;
}) {
  if (!cards.length) return null;
  return (
    <ol className="deck-ov-sources" ref={railRef} dir="rtl" aria-label="המקורות לסקירה">
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
