'use client';

import type { ReactNode } from 'react';
import { SourceRail, type SourceCard } from './SourceRail';

/**
 * Slide 2's frame - docs/mobile-item.html §5.
 *
 * Three parts in a column: the title chip, the body, and the sources carousel.
 * The chip stays put and everything under it scrolls, because §5's drawn
 * density needs 474px and the column has 529px at 844 but 352px on an iPhone
 * SE. The frame stopped being a ceiling on 20 September (§11).
 *
 * The carousel travels with the text rather than being docked to the frame: it
 * is the end of the reading, not a permanent shelf. margin-top:auto against a
 * min-height:100% inner column still drops it to the foot of the column when
 * the text is short enough to leave room - which is how §5's screen draws it -
 * but on a long item it waits below the last sentence.
 *
 * The rail is SourceRail's, shared with every stage page on slide 3. Since
 * DIA-386 it is no longer what a chip points at - a chip opens a drawer under
 * its own passage, and the deck owns that interaction for every slide.
 */

export type { SourceCard };

export function OverviewShell({ title, cards, children }: {
  title: string;
  cards: SourceCard[];
  children: ReactNode;
}) {
  return (
    <div className="deck-ov">
      <div className="deck-ov-head"><span className="deck-ov-title">{title}</span></div>

      {/* Everything below the chip moves together. overscroll-behavior keeps a
          flick at the end of the text from becoming a swipe to the next slide. */}
      <div className="deck-ov-scroll">
        <div className="deck-ov-inner">
          <div className="deck-ov-body">{children}</div>
          <SourceRail cards={cards} />
        </div>
      </div>
    </div>
  );
}
