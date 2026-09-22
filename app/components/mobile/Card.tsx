import type { ReactNode } from 'react';
import { SourceRail, type SourceCard } from './SourceRail';

/**
 * The card and its reading sheet - docs/mobile-item.html §5 (DIA-413).
 *
 * A slide's content is a card that fits the frame and never scrolls. When the
 * reading overruns, the card cuts it with a fade and the button says so; the
 * whole reading, and the sources after it, live in a sheet that opens above
 * the deck.
 *
 * Why this file hands back two nodes instead of rendering one tree: the sheet
 * may not be a descendant of the track. Everything the sheet has to be - a
 * plain vertical scroller with no horizontal ancestor, and the only surface a
 * screen reader can see while it is open - is false the moment it sits inside
 * the horizontal scroller. `inert` in particular is inherited and cannot be
 * lifted off a subtree, so a sheet inside the track could not be exempted from
 * the track's own inertness. The deck renders `sheets` beside the track.
 *
 * Why the reading is rendered twice rather than moved: the sheet has to land
 * with every line where it was on the card, and the surest way to have two
 * identical columns is to render the same blocks into the same column twice.
 * The copy in the sheet is the one that carries the source drawers, because
 * that is where a drawer can push the text down without anything to fight.
 *
 * Everything here is server-rendered - the reading and its sources are in the
 * HTML on the first paint, which for this site is the whole point. Opening,
 * closing, history and focus are the deck's: Deck.tsx owns every interaction
 * on this screen, as it already owned the drawer's.
 */

export type { SourceCard };

const X = 'M6 6l12 12M18 6L6 18';

export type Parts = { card: ReactNode; sheet: ReactNode };

export function cardAndSheet({
  id, label, head, card, sheet, chip, cards, count, aside, tail,
}: {
  /** Unique per card: the sheet's id, and what the button points at. */
  id: string;
  /** §5: the slide's own name, 13px/600 muted. Not a pill any more. */
  label: string;
  /** Slides 3 and 4's head group, which is part of both columns (§6). */
  head?: ReactNode;
  /** The reading, without drawers. */
  card: ReactNode;
  /**
   * The same reading, with its drawers - or null on a card with nothing to
   * continue. §7's slide is composed rather than authored: it fits the frame
   * by construction, so it has no button and no sheet.
   */
  sheet?: ReactNode;
  /** The sheet bar's chip: slide 2's neutral pill, or a stage's own tag. */
  chip?: ReactNode;
  cards?: SourceCard[];
  /** How many sources the card has, which the button says out loud. */
  count?: number;
  /** Drawn inside the sheet as well as on the slide - slides 3 and 4's
   *  locator, which stays visible and stays an indicator (§6). */
  aside?: ReactNode;
  /** After מקורות and before the carousel - stage 1's evidence map (§6). */
  tail?: ReactNode;
}): Parts {
  const has = sheet != null;
  const n = count ?? 0;

  return {
    card: (
      <div className="deck-card-wrap" key={id}>
        {/* `data-cut` is written by the deck once it has measured whether the
            reading fits; until then nothing is faded, which is the right
            thing to show if the measurement never runs. */}
        <div className="deck-card" data-card={id}>
          <div className="deck-label">{label}</div>
          {head}
          <div className="deck-read">{card}</div>
          {has && (
            <button
              type="button"
              className="deck-more"
              data-open={id}
              aria-haspopup="dialog"
              aria-controls={`sheet-${id}`}
            >
              <span className="deck-more-say" data-fits="המקורות" data-cut="יותר מידע" />
              {n > 0 && <span className="deck-more-n">{n === 1 ? 'מקור אחד' : `${n} מקורות`}</span>}
            </button>
          )}
        </div>
      </div>
    ),

    /* Hidden until the deck opens it: it is a second copy of the reading, and
       two copies in the accessibility tree would be read as two readings. */
    sheet: has ? (
      <div
        className="deck-sheet"
        key={id}
        id={`sheet-${id}`}
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby={`sheet-${id}-t`}
      >
        {aside}
        <div className="deck-sheet-bar">
          <button type="button" className="deck-sheet-x" aria-label="סגירה">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={X} /></svg>
          </button>
          <div className="deck-sheet-chip" id={`sheet-${id}-t`}>{chip}</div>
        </div>
        <div className="deck-sheet-scroll">
          <div className="deck-sheet-body">
            {head}
            <div className="deck-read">{sheet}</div>
            <h2 className="deck-sheet-h">מקורות</h2>
            {tail}
          </div>
          <SourceRail cards={cards ?? []} />
          {/* The end of the reading, and the place gesture 2 lives: a swipe up
              from here closes the sheet, so this line is what says there is an
              end to be at (DIA-427). */}
          <p className="deck-sheet-end">סוף הקריאה · החליקו למעלה לסגירה</p>
        </div>
      </div>
    ) : null,
  };
}
