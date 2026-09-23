import { Fragment } from 'react';
import { Annotated } from '@/app/components/Annotated';
import { EvidenceMap, pinsOf } from '@/app/components/EvidenceMap';
import { citedIds } from '@/lib/annotation';
import { STAGES, TYPES, stageCopy, type Claim, type Incident } from '@/lib/data';
import { stageAge, stageAbsence, notDocumented, sinceLabel, NOT_YET_DOCUMENTED } from '@/lib/deck';
import { daysAfter, daysWaiting } from '@/lib/days';
import {
  reached as reachedStages, unreached as unreachedStages, stageDate, stageOf, type Stage,
} from '@/lib/stage';
import { cardAndSheet, type Parts, type SourceCard } from './Card';
import { Locator, StagesShell, type Rung, type StackKind, type StagePage } from './StagesShell';

/**
 * Slides 3 and 4 - docs/mobile-item.html §6 and §7.
 *
 * One component, one filter, two screens: מה נעשה מאז holds the stages the
 * item reached and מה עוד לא נעשה the ones it has not. §7 is written as a list
 * of what differs, and almost all of it turns out to be what a page *holds*
 * rather than how the stack behaves.
 *
 * Since DIA-413 a stage page is §5's card, and its reading continues in the
 * same sheet slide 2 uses - so this file builds pairs and hands the sheets
 * back separately, because a sheet may not live inside the track (Card.tsx).
 *
 * This half runs on the server because the body reads the taxonomy and the
 * places off disk. The stack, the locator and the pill are StagesShell's.
 */

const cardOf = (c: Claim): SourceCard => ({
  id: c.id,
  type: TYPES[c.source_type].he,
  color: TYPES[c.source_type].color,
  outlet: c.source,
  quote: c.quote!,
  date: c.date,
  url: c.url,
});

/**
 * §6's head group. Four quiet lines and then the reading: no filled tag, no
 * definition and no hairline rule - colour stays in the locator, and the
 * head's job is to say which stage this is, not to decorate it (DIA-412).
 *
 * It is part of both columns. The sheet's body opens with the same group in
 * the place it has on the card, or the reading below would start 70px higher
 * than it did on the slide.
 */
function Head({ he, current, age }: { he: string; current: boolean; age: string | null }) {
  return (
    <div className="deck-shead">
      <h2 className="deck-shead-n">
        {he}
        {/* The only place the current stage is named on the page, now that
            the locator does not ring it. Small accent text, not a pill. */}
        {current && <em>הסטטוס הנוכחי</em>}
      </h2>
      {age && <div className="deck-shead-d">{age}</div>}
    </div>
  );
}

/**
 * A reached stage with no written overview falls back to its claims. An
 * overview improves a page; it does not gate one, and every published item has
 * to render from the first build - today that is most of them.
 */
function Claims({ claims }: { claims: Claim[] }) {
  return (
    <div className="deck-stage-claims">
      {claims.map((c) => (
        <div key={c.id} className="deck-stage-claim">
          {c.quote && <p className="deck-stage-quote">{`„${c.quote}“`}</p>}
          <p className="deck-stage-attrib">
            <i className="deck-ov-dot" aria-hidden="true" style={{ ['--c' as string]: TYPES[c.source_type].color }} />
            {c.source}
            <span dir="ltr"> · {c.date}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * What a stage that has not happened says - §7, redrawn (DIA-425).
 *
 * Four things, top to bottom, and the whole page is one frame: the computed
 * statement as the lead, the definition box, the age of the stage the item is
 * actually standing on, and the way to say we are wrong.
 *
 * The box is the one unsourced paragraph in the item page, which is why it is
 * dim and dashed rather than drawn like the reading around it - and why it
 * carries no header. Both of its strings come from the taxonomy: a stage
 * means the same thing on every item.
 *
 * It sits at the vertical centre of the *screen* rather than of the space it
 * was given, so the page reads the same on a 600px frame as on 844 even
 * though what is above it does not. CSS can centre it in the leftover space;
 * only a measurement can centre it in the frame, and StagesShell makes it.
 */
function Absence({ stage, current, days }: { stage: number; current: number; days: number | null }) {
  const { definition, why } = stageCopy(stage);
  return (
    <div className="deck-gap">
      <p className="deck-gap-say">{stageAbsence(stage)}</p>

      <div className="deck-gap-def">
        <p>{notDocumented(definition)}</p>
        {/* Dropped first if the card would ever overflow: it is the sentence
            that says why the absence matters, and the one above it is the one
            that says what is missing. */}
        {why && <p className="deck-gap-why">{why}</p>}
      </div>

      {/* The wait belongs to the item, not to the stage that has not happened:
          it counts from the stage the item is standing on. */}
      <div className="deck-gap-wait">
        <span className="deck-gap-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 3h10" /><path d="M7 21h10" />
            <path d="M8 3v4l4 5 4-5V3" /><path d="M8 21v-4l4-5 4 5v4" />
          </svg>
        </span>
        {days !== null && (
          <span className="deck-gap-age">
            {/* No `dir="ltr"`: digits run left-to-right on their own, and
                forcing the direction here would flip `text-align:start` to
                the left and hang the numeral off the wrong end of its own
                label. */}
            <b>{days.toLocaleString('en-US')}</b>
            <span className="deck-gap-since">{sinceLabel(current)}</span>
          </span>
        )}
      </div>

      {/* Not a control yet: where it goes is DIA-421, and a button that does
          nothing is worse than a line that does not claim to be one. */}
      <span className="deck-gap-do">
        יודעים אחרת? הגישו מקור
        <i dir="ltr" aria-hidden="true">←</i>
      </span>
    </div>
  );
}

export function stagesParts({ inc, slide, kind }: {
  inc: Incident;
  /** This slide's index in the deck, so the stack can claim the URL's tail. */
  slide: number;
  kind: StackKind;
}): Parts {
  const has = new Set<number>(reachedStages(inc));
  const current = stageOf(inc);
  const mine = kind === 'reached' ? reachedStages(inc) : unreachedStages(inc);
  const shown = new Set<number>(mine);

  // Five slots, plus a sixth only where the item has regressed into it. The
  // ones this slide does not draw keep their place as invisible spacers, so a
  // rung never moves between slide 3 and slide 4.
  const rail: Rung[] = STAGES
    .filter((x) => x.n <= 5 || has.has(x.n))
    .map((x) => ({
      n: x.n,
      he: x.he,
      color: x.color,
      drawn: shown.has(x.n),
      reached: has.has(x.n),
      // The sheet this rung jumps to, inside a sheet (DIA-430). Only a
      // reached stage has one: slide 4's pages are composed rather than
      // authored, so they have no sheet to jump to and no rung to jump from.
      sheet: kind === 'reached' && shown.has(x.n) ? `st${slide}-${x.n}` : undefined,
    }));

  // How long the item has been where it is. One number for the whole slide:
  // the wait belongs to the item, not to the stage that has not happened.
  const waited = daysWaiting(stageDate(inc, current));

  const label = kind === 'reached' ? 'מה נעשה מאז' : 'מה עוד לא נעשה';

  const built = STAGES
    .filter((x) => shown.has(x.n))
    .map((x) => {
      const id = `st${slide}-${x.n}`;
      const on = kind === 'reached' ? stageDate(inc, x.n as Stage) : null;
      const head = (
        <Head
          he={x.he}
          current={kind === 'reached' && x.n === current}
          age={kind === 'reached' ? stageAge(on, on ? daysAfter(on) : null) : NOT_YET_DOCUMENTED}
        />
      );

      // §7: no citations, no carousel and therefore no button and no sheet.
      // This slide's card is composed rather than authored - it fits the frame
      // by construction, so there is nothing to cut and nothing to continue.
      if (kind === 'unreached') {
        return {
          n: x.n, he: x.he, current: false,
          ...cardAndSheet({
            id, label, head,
            card: <Absence stage={x.n} current={current} days={waited} />,
            aside: <Locator rail={rail} on={x.n} />,
          }),
        };
      }

      const claims = inc.claims.filter((c) => c.asserts_stage === x.n);
      const summary = inc.summaries?.find((s) => s.stage === x.n)?.text ?? null;

      // With an overview, the carousel carries the sources it cites, in the
      // order the glyphs are met. Without one, it carries the stage's own -
      // the body gives the words and the card gives the link.
      const ids = summary ? citedIds(summary) : claims.map((c) => c.id);
      const cards = ids
        .map((cid) => inc.claims.find((c) => c.id === cid))
        .filter((c): c is Claim => !!c && !!c.quote)
        .map(cardOf);

      const pins = x.n === 1 ? pinsOf(claims) : [];

      return {
        n: x.n, he: x.he, current: x.n === current,
        ...cardAndSheet({
          id, label, head, cards, count: cards.length,
          chip: (
            <span className="deck-stage-tag" style={{ ['--c' as string]: x.color }}>
              {x.n} · {x.he}
            </span>
          ),
          card: summary
            ? <Annotated text={summary} claims={inc.claims} chip="glyph" opens={id} />
            : <Claims claims={claims} />,
          sheet: summary
            ? <Annotated text={summary} claims={inc.claims} chip="glyph" drawers={id} />
            : <Claims claims={claims} />,
          // The copy inside the sheet, where the ladder is the way between
          // stages (§6, DIA-430) - `slide` is what turns its rungs into
          // controls. The slide's own copy is StagesShell's, and stays an
          // indicator.
          aside: <Locator rail={rail} on={x.n} slide={slide} />,
          // §6: stage 1 hosts the evidence map, and the map comes before the
          // carousel - which puts it in the sheet, under מקורות.
          tail: pins.length > 0 ? <div className="deck-stage-map"><EvidenceMap pins={pins} /></div> : null,
        }),
      };
    });

  if (!built.length) return { card: null, sheet: null };

  const pages: StagePage[] = built.map((b) => ({ n: b.n, he: b.he, current: b.current, card: b.card }));

  // Both halves land in an array on the deck, so both need a key of their own -
  // and a shorthand fragment cannot carry one.
  const key = `st${slide}`;
  return {
    card: <StagesShell key={key} slide={slide} kind={kind} pages={pages} rail={rail} current={current} />,
    sheet: (
      <Fragment key={key}>
        {built.map((b) => <Fragment key={b.n}>{b.sheet}</Fragment>)}
      </Fragment>
    ),
  };
}
