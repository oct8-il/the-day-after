import { Annotated } from '@/app/components/Annotated';
import { EvidenceMap, pinsOf } from '@/app/components/EvidenceMap';
import { citedIds } from '@/lib/annotation';
import { STAGES, TYPES, type Claim, type Incident } from '@/lib/data';
import {
  stageDefinition, stageAge, stageAbsence, checkingBody, sinceLabel, NOT_YET_DOCUMENTED,
} from '@/lib/deck';
import { daysAfter, daysWaiting } from '@/lib/days';
import {
  reached as reachedStages, unreached as unreachedStages, stageDate, stageOf, type Stage,
} from '@/lib/stage';
import { StagesShell, type Rung, type StackKind, type StagePage } from './StagesShell';
import type { SourceCard } from './SourceRail';

/**
 * Slides 3 and 4 - docs/mobile-item.html §6 and §7.
 *
 * One component, one filter, two screens: מה נעשה מאז holds the stages the
 * item reached and מה עוד לא נעשה the ones it has not. §7 is written as a list
 * of what differs, and almost all of it turns out to be what a page *holds*
 * rather than how the stack behaves.
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
 * What a stage that has not happened says - §7.
 *
 * Absence is the content, and nothing here apologises for it: a computed
 * statement, the line naming who would count as a checker where that is the
 * whole point of the stage, the wait, and a way to say we are wrong. The
 * hourglass is the only place in the item page where a warning colour appears.
 */
function Absence({ stage, current, days }: { stage: number; current: number; days: number | null }) {
  const who = checkingBody(stage);
  return (
    <div className="deck-gap">
      <p className="deck-gap-say"><b>{stageAbsence(stage)}</b></p>
      {who && <p className="deck-gap-who">{who}</p>}

      <div className="deck-gap-wait">
        <span className="deck-gap-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 3h10" /><path d="M7 21h10" />
            <path d="M8 3v4l4 5 4-5V3" /><path d="M8 21v-4l4-5 4 5v4" />
          </svg>
        </span>
        {days !== null && (
          <>
            <span className="deck-gap-n" dir="ltr">{days.toLocaleString('en-US')}</span>
            <span className="deck-gap-since">{sinceLabel(current)}</span>
          </>
        )}
      </div>

      <div className="deck-gap-ask">
        <b>יודעים אחרת?</b>
        <span>אם פורסמה בדיקה כזאת ולא מצאנו אותה — הגישו את המקור, והשלב ישתנה.</span>
        <span className="deck-gap-do">הגישו מקור</span>
      </div>
    </div>
  );
}

export function Stages({ inc, slide, kind }: { inc: Incident; slide: number; kind: StackKind }) {
  const has = new Set<number>(reachedStages(inc));
  const current = stageOf(inc);
  const mine = kind === 'reached' ? reachedStages(inc) : unreachedStages(inc);
  const shown = new Set<number>(mine);

  // Five slots, plus a sixth only where the item has regressed into it. The
  // ones this slide does not draw keep their place as invisible spacers, so a
  // rung never moves between slide 3 and slide 4.
  const rail: Rung[] = STAGES
    .filter((x) => x.n <= 5 || has.has(x.n))
    .map((x) => ({ n: x.n, color: x.color, drawn: shown.has(x.n), reached: has.has(x.n) }));

  // How long the item has been where it is. One number for the whole slide:
  // the wait belongs to the item, not to the stage that has not happened.
  const waited = daysWaiting(stageDate(inc, current));

  const pages: StagePage[] = STAGES
    .filter((x) => shown.has(x.n))
    .map((x) => {
      if (kind === 'unreached') {
        return {
          head: {
            n: x.n, he: x.he, color: null,
            definition: stageDefinition(x.n),
            age: NOT_YET_DOCUMENTED,
            current: false,
          },
          cards: [],
          body: <Absence stage={x.n} current={current} days={waited} />,
        };
      }

      const claims = inc.claims.filter((c) => c.asserts_stage === x.n);
      const summary = inc.summaries?.find((s) => s.stage === x.n)?.text ?? null;

      // With an overview, the rail carries the sources it cites, in the order
      // the chips are met. Without one, it carries the stage's own - the body
      // gives the words and the card gives the link.
      const ids = summary ? citedIds(summary) : claims.map((c) => c.id);
      const cards = ids
        .map((id) => inc.claims.find((c) => c.id === id))
        .filter((c): c is Claim => !!c && !!c.quote)
        .map(cardOf);

      const on = stageDate(inc, x.n as Stage);
      const pins = x.n === 1 ? pinsOf(claims) : [];

      return {
        head: {
          n: x.n, he: x.he, color: x.color,
          definition: stageDefinition(x.n),
          age: stageAge(on, on ? daysAfter(on) : null),
          current: x.n === current,
        },
        cards,
        body: (
          <>
            {summary
              ? <Annotated text={summary} claims={inc.claims} chip="named" drawers={`st${x.n}`} />
              : <Claims claims={claims} />}
            {pins.length > 0 && (
              <div className="deck-stage-map"><EvidenceMap pins={pins} /></div>
            )}
          </>
        ),
      };
    });

  if (!pages.length) return null;
  return <StagesShell slide={slide} kind={kind} pages={pages} rail={rail} current={current} />;
}
