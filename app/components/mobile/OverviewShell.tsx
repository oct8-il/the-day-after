'use client';

import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Slide 2's frame - docs/mobile-item.html §5.
 *
 * Three parts in a column: the title chip, the body, and the sources carousel.
 * The chip and the carousel stay put; only the body moves, because §5's drawn
 * density needs 474px and the column has 582px at 844 but 405px on an iPhone
 * SE. The frame stopped being a ceiling on 20 September (§11).
 *
 * It is a client component for one reason: a chip moves the carousel rather
 * than leaving the deck. Most readers arrive inside an in-app browser, where
 * leaving is close to one-way, so the chip lands its source's card and the card
 * itself carries the outbound link one tap further on. That is what makes the
 * carousel load-bearing, and why it is never shed.
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

export function OverviewShell({ title, cards, children }: {
  title: string;
  cards: SourceCard[];
  children: ReactNode;
}) {
  const rail = useRef<HTMLOListElement>(null);

  /**
   * A chip's href is the claim id, the same target it carries on the desktop.
   * Here it moves the rail instead of the page: measured, because the rail is
   * RTL and scrollLeft's sign is not something to reason about from memory.
   */
  const onChip = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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

  return (
    <div className="deck-ov">
      <div><span className="deck-ov-title">{title}</span></div>

      {/* The only part that moves. overscroll-behavior keeps a flick at the
          end of the text from becoming a swipe to the next slide. */}
      <div className="deck-ov-body" onClick={onChip}>{children}</div>

      <ol className="deck-ov-sources" ref={rail} dir="rtl" aria-label="המקורות לסקירה">
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
          return (
            <li
              key={c.id}
              className="deck-ov-card"
              data-claim={c.id}
              style={{ ['--c' as string]: c.color }}
            >
              {c.url
                ? <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`${c.type} · ${c.outlet} · ${c.date}`}>{inner}</a>
                : <span aria-label={`${c.type} · ${c.outlet} · ${c.date}`}>{inner}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
