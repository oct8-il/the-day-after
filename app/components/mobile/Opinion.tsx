import { Annotated } from '@/app/components/Annotated';
import { plainText } from '@/lib/annotation';
import { NEWSLETTER } from '@/lib/channels';
import type { Poll } from '@/lib/data';
import { cardAndSheet, type Parts } from './Card';

/**
 * Slide 5 - docs/mobile-item.html §8, דעת הציבור (DIA-394, DIA-443).
 *
 * The slide where the reader is addressed, and the only one on the item page
 * that asks rather than tells. Four things, top to bottom, in one frame that
 * never scrolls: the failure and what has been reported since, the caveat, the
 * question, and a ballot that is sealed.
 *
 * Two rules shape the whole file.
 *
 *   The head cites nothing. Its two lines are slides 2 and 3 condensed, so
 *   what ends each is not a citation but a way back to the slide it condenses
 *   - the evidence is one slide and one tap away, and this slide stays a
 *   question rather than becoming a third reading surface. Which is also why
 *   there is no reading sheet here, no drawer and no swipe-up: there is
 *   nothing on this slide for a sheet to continue.
 *
 *   Nothing on the card is live. The ballot is drawn, dashed, and answers a
 *   tap by going amber for a moment; it writes nowhere, because a static
 *   export has nowhere to write. The one thing that does act is the pill at
 *   the foot, and it opens a sheet rather than doing anything itself - the
 *   updates sheet, which is the deck's (DIA-447). With no newsletter account
 *   configured the pill is not drawn at all and the slide ends at the ballot,
 *   because a control that cannot do what it says should not be on a page
 *   whose whole subject is promises that were not kept.
 *
 * The three lines are authored per incident in `poll`, and the editorial rule
 * is that they may only say what slides 2 and 3 say, or the pointer lies.
 */

/** §8: the slide's own name, as a label like every reading slide's. */
const TITLE = 'דעת הציבור';

/**
 * The back-reference arrow: a sideways U-turn, tail on the left, head pointing
 * right - "back" in a deck a reader swipes leftwards through.
 *
 * A path rather than a character, for the same reason every chevron in this
 * deck is one: an arrow glyph carries the Unicode mirrored property and the
 * bidi algorithm turns it around inside a Hebrew line (DIA-398).
 */
const UTURN = 'M9 18H6a4 4 0 0 1 0-8h12M14 6l4 4-4 4';

/** The legend's clock, in the one warning colour the item page allows itself. */
const CLOCK = 'M12 7v5l3 2';

/**
 * What ends a line that condenses another slide: the old source chip's
 * chassis, holding the arrow and that slide's own name. No chevron, no number
 * and no colour - it is not a citation and must not read as one.
 */
function Ref({ he }: { he: string }) {
  return (
    <span className="deck-op-ref">
      <svg className="deck-op-ut" viewBox="0 0 24 24" aria-hidden="true"><path d={UTURN} /></svg>
      {he}
    </span>
  );
}

/**
 * One of the two pointing lines.
 *
 * The whole line is the target, not the chip that ends it - the chip is 13px
 * of arrow and a word, the right size to read and the wrong size to hit, and
 * the same rule already governs a cited passage on slides 2 and 3 (DIA-414).
 * So the line is a `role="button"` wrapper around the paragraph rather than a
 * real button: a `button` may hold phrasing content only, and this holds a
 * paragraph whose annotation may hold a link.
 *
 * `data-back` names the slide in the canonical six, never a position in this
 * item's deck - an item with nothing unreached shows slide 5 fourth, and the
 * pointer has to survive that (DIA-422). The deck resolves it and does the
 * scrolling: every interaction on these screens is Deck.tsx's.
 */
function Line({ text, to, he, stage }: {
  text: string; to: number; he: string;
  /** Slide 3 holds a stage per page, and this line summarises the stage the
   *  item is standing on - so the stack walks there rather than staying
   *  wherever the reader last left it (DIA-394). */
  stage?: boolean;
}) {
  return (
    <div
      className="deck-op-line"
      role="button"
      tabIndex={0}
      data-back={to}
      data-back-stage={stage ? '' : undefined}
    >
      {/* No claims, and no chip: this slide cites nothing, and handing the
          renderer the incident's claims would be inviting it to draw one. The
          lines still carry bold and highlight, which is why they go through
          the interpreter at all rather than being printed. */}
      <Annotated text={text} claims={[]} chip="none" end={<Ref he={he} />} />
    </div>
  );
}

/**
 * The card - §8's MVP screen, which is the whole of slide 5 at launch.
 *
 * It is composed rather than authored, like §7's: it fits the frame by
 * construction, so there is nothing to cut, no button to continue with and no
 * sheet behind it. When a long-enough set of lines would overflow a short
 * frame, the deck sheds in the order §8 gives - the ballot's circles become
 * dots, then the caveat goes, then the question drops a size - and the lines,
 * the question and the legend never go.
 */
function Opinion({ poll }: { poll: Poll }) {
  return (
    <div className="deck-op">
      <div className="deck-op-lines">
        <Line text={poll.failure} to={2} he="סקירת הכשל" />
        <Line text={poll.status} to={3} he="מה נעשה מאז" stage />
        {/* No pointer: an absence has nowhere to point. */}
        <div className="deck-op-cav">
          <Annotated text={poll.caveat} claims={[]} chip="none" />
        </div>
      </div>

      {/* The one centred thing on the slide. Generic in substance and phrased
          in this item's context - an item-specific curiosity would make the
          answers uncomparable across the ledger. */}
      {/* The question is one heading, so it is one run of words: `h2` holds
          phrasing content, and the interpreter's output is paragraphs. The
          marks §4 lets the field carry are stripped rather than printed -
          nothing in this design puts a highlight inside a 22px centred
          question, and a literal `**` on screen would be worse than either. */}
      <h2 className="deck-op-q">{plainText(poll.question)}</h2>

      {/* A real fieldset and legend, because that is what this is: a set of
          choices with a caption saying it is not open. Nothing is dimmed or
          blurred - the dashes are the seal - and there is no paragraph under
          it explaining itself. A tap anywhere in the box is answered by the
          deck, and answers nothing. */}
      <fieldset className="deck-op-poll">
        <legend>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d={CLOCK} />
          </svg>
          <span>המענה ייפתח בהמשך</span>
        </legend>
        {/* Latin numerals in a row of their own, so the run is not reordered
            around the Hebrew either side of it. 1 sits at the reading end. */}
        <div className="deck-op-scale" dir="ltr" aria-hidden="true">
          {[5, 4, 3, 2, 1].map((n) => <i key={n}>{n}</i>)}
        </div>
        <div className="deck-op-anch">
          <span>בכלל לא</span>
          <span>במידה מלאה</span>
        </div>
      </fieldset>

      {/* The card's full-width outlined pill, the same object slide 4's door
          is. `data-in-place` because a control the reader pressed deliberately
          gets the fade and not the cover, and `data-from` because the sheet's
          way back names the slide it was opened from (§5, DIA-439). */}
      {NEWSLETTER ? (
        <button
          type="button"
          className="deck-op-do"
          data-open="nl"
          data-in-place=""
          data-from={TITLE}
          aria-haspopup="dialog"
          aria-controls="sheet-nl"
        >
          עדכנו אותי כשהמענה ייפתח
          <i dir="ltr" aria-hidden="true">←</i>
        </button>
      ) : null}
    </div>
  );
}

export function opinionParts({ poll }: { poll: Poll }): Parts {
  return cardAndSheet({
    id: 'op',
    label: TITLE,
    card: <Opinion poll={poll} />,
  });
}
