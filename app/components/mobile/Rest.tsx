import Link from 'next/link';

/**
 * Slide 6 - docs/mobile-item.html §9, הלאה (DIA-395, DIA-444).
 *
 * The last slide, and the only place share lives. It closes the post rather
 * than continuing it: a sign-off, four other tracked failures, the way out to
 * the whole ledger, and the share action. No creed and no address.
 *
 * Version A ships - four cards and no star strip (Roy, 18 September). Version
 * B is specified in §9 and held as DIA-376, because the strip needs somewhere
 * to put an answer and that is the first non-static dependency in a project
 * whose standing claim is that the site is built from its repository.
 *
 * Everything here is a link or a button and nothing is a state: the trips out
 * are page loads, and the two that are not - share, and the door into §7's
 * submission sheet - are the deck's, like every interaction on these screens.
 *
 * The one thing this slide does that no other does is **shed**. The deck never
 * scrolls, so the card list fills the frame it is given and drops cards from
 * the end when it cannot; everything else is fixed and stays. Two is the
 * floor, and the count line says how many are actually there - which is why
 * the numeral is drawn from an attribute the deck writes rather than from
 * this render (globals.css §9).
 */

/** The ledger, as a window of tiles. */
const GRID = ['M3 3h18v18H3z', 'M9 3v18M15 3v18M3 9h18M3 15h18'];

/**
 * The repost loop, upright: two interleaved L arrows, up one column and down
 * the other. Not a share glyph and not an outward arrow - what this asks for
 * is that the failure travel, and the loop is the one mark that says so on
 * every platform a reader has come from.
 */
const REPOST = [
  'M12 5h2a3 3 0 0 1 3 3v9.5',
  'M14 14.5l3 3 3-3',
  'M12 20h-2a3 3 0 0 1-3-3V8.5',
  'M4 11.5l3-3 3 3',
];

export type RestCard = {
  id: string;
  /** `כשל מס׳ 14`, or `כשל` for one not yet in the published order. */
  leaf: string;
  parent: string;
  /** The authored one-liner, or the title where none has been written yet. */
  line: string;
  stage: string;
  color: string;
  /** The landscape crop, which stands behind the card rather than beside it. */
  photo: string | null;
};

export type RestProps = {
  root: string;
  cards: RestCard[];
  /** How many failures the ledger holds - the count line's denominator. */
  total: number;
  /** This item's parent, carried as the ledger's hash. */
  parent: string;
  /** `כשל מס׳ 13`, for the share button and the letter it sends. */
  leaf: string;
  /** The item's own page, bare - no hash, so a shared link opens at the gate. */
  href: string;
};

/**
 * One card: a plain link to that failure's page, opening at its own gate.
 *
 * The photograph is a watermark and not an image slot - full-bleed behind the
 * whole card, drained of its own colour, dyed in the stage's, and masked from
 * 30% at the top to nothing by the foot. The mask reaches zero rather than a
 * low value so that the stage chip is legible over any photograph, and the
 * chip carries its own dark ground besides (§9).
 *
 * Two lines are always reserved for the statement whether or not it needs
 * them, so every card measures the same and the shedding ladder is arithmetic
 * rather than a guess.
 */
function Card({ card, root }: { card: RestCard; root: string }) {
  return (
    <li className="deck-six-card" style={{ ['--c' as string]: card.color }}>
      <Link href={`/item/${card.id}/`}>
        {card.photo && (
          <i
            className="deck-six-photo"
            aria-hidden="true"
            style={{ ['--src' as string]: `url(/photos/${card.photo})` }}
          />
        )}
        <span className="deck-six-in">
          {/* Its own path, not this item's: the fill beyond the siblings comes
              from elsewhere in the ledger, and a breadcrumb that lied about
              where a card leads would be worse than an uneven row. */}
          <span className="deck-six-crumb">
            <span>{root}</span>
            <i aria-hidden="true">›</i>
            <span>{card.parent}</span>
            <i aria-hidden="true">›</i>
            <b>{card.leaf}</b>
          </span>
          <span className="deck-six-say">{card.line}</span>
          <span className="deck-six-stage">{card.stage}</span>
        </span>
      </Link>
    </li>
  );
}

export function Rest({ root, cards, total, parent, leaf, href }: RestProps) {
  return (
    <div className="deck-six">
      {/* The slide's own name slot, as every reading slide has one. §9 asks
          for "the same as סקירת הכשל and דעת הציבור", which is what this is -
          the label changed shape in v3.4 and this follows it rather than the
          older numbers §9 wrote down beside the rule. */}
      <div className="deck-label">תודה על הקריאה.</div>

      <div className="deck-six-head">
        <b>עוד כשלים במעקב</b>
        {/* The numeral is the deck's to write: how many cards fit is a
            measurement, and a count line that said four over three cards
            would be the slide contradicting itself. */}
        <span className="deck-six-count">
          <i className="deck-six-n" data-n={cards.length} /> מתוך {total}
        </span>
      </div>

      <ul className="deck-six-cards">
        {cards.map((c) => <Card key={c.id} card={c} root={root} />)}
      </ul>

      {/* Version A's single flexible gap. Version B splits it in two so that
          no one hole opens under the last card - DIA-376. */}
      <div className="deck-six-gap" />

      <div className="deck-six-do">
        <Link className="deck-six-all" href={`/#${parent}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {GRID.map((d) => <path key={d} d={d} />)}
          </svg>
          כל {total} הכשלים
        </Link>
        {/* The only gold-filled action on the item page. The deck does the
            sharing: the native sheet where there is one, the clipboard and a
            toast where there is not. */}
        <button
          type="button"
          className="deck-six-share"
          data-share=""
          data-share-title={`${leaf} · היום שאחרי`}
          data-share-url={href}
        >
          <svg viewBox="3 4 18 17" aria-hidden="true">
            {REPOST.map((d) => <path key={d} d={d} />)}
          </svg>
          שיתוף {leaf}
        </button>
      </div>

      {/* §9's prose puts DIA-436's control here in its smallest form - a line
          rather than a pill, because a second pill under share would fight
          it. It is not drawn: DIA-395 is the later ruling and puts it in
          DIA-436's round rather than this one, and version A's own artboard
          goes from the actions straight to the wordmark. It costs ~32px,
          which is most of a card at 844 - so where it lands is a question
          about the ladder as much as about the control.

          When it does land, it is a `.deck-six-src` button carrying
          `data-open="send"`, `data-in-place` and `data-from="הלאה"`, and the
          stylesheet already holds its rule. */}

      {/* The site's name and nothing else - no tagline, no address. */}
      <div className="deck-six-mark">
        <i aria-hidden="true" />
        <span>היום שאחרי</span>
      </div>
    </div>
  );
}
