import { Annotated } from '@/app/components/Annotated';
import { EvidenceMap, pinsOf } from '@/app/components/EvidenceMap';
import { citedIds } from '@/lib/annotation';
import { STAGES, TYPES, type Claim, type Incident } from '@/lib/data';
import { stageDefinition, stageAge } from '@/lib/deck';
import { daysAfter } from '@/lib/days';
import { reached as reachedStages, stageDate, stageOf, type Stage } from '@/lib/stage';
import { StagesShell, type Rung, type StagePage } from './StagesShell';
import type { SourceCard } from './SourceRail';

/**
 * Slide 3 - docs/mobile-item.html §6, מה נעשה מאז.
 *
 * The stages the item actually reached, one page each. The ones it has not are
 * slide 4: the same component with the opposite filter, which is why nothing
 * here asks whether a stage was reached - the caller has already decided.
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

export function Stages({ inc, slide }: { inc: Incident; slide: number }) {
  const has = new Set<number>(reachedStages(inc));
  const current = stageOf(inc);

  // Five slots, plus a sixth only where the item has regressed into it. The
  // ones this slide does not draw keep their place as invisible spacers, so a
  // rung never moves between slide 3 and slide 4.
  const rail: Rung[] = STAGES
    .filter((x) => x.n <= 5 || has.has(x.n))
    .map((x) => ({ n: x.n, color: x.color, drawn: has.has(x.n) }));

  const pages: StagePage[] = STAGES
    .filter((x) => has.has(x.n))
    .map((x) => {
      const mine = inc.claims.filter((c) => c.asserts_stage === x.n);
      const summary = inc.summaries?.find((s) => s.stage === x.n)?.text ?? null;

      // With an overview, the rail carries the sources it cites, in the order
      // the chips are met. Without one, it carries the stage's own - the body
      // gives the words and the card gives the link.
      const ids = summary ? citedIds(summary) : mine.map((c) => c.id);
      const cards = ids
        .map((id) => inc.claims.find((c) => c.id === id))
        .filter((c): c is Claim => !!c && !!c.quote)
        .map(cardOf);

      const on = stageDate(inc, x.n as Stage);
      const pins = x.n === 1 ? pinsOf(mine) : [];

      return {
        head: {
          n: x.n,
          he: x.he,
          color: x.color,
          definition: stageDefinition(x.n),
          age: stageAge(on, on ? daysAfter(on) : null),
          current: x.n === current,
        },
        cards,
        body: (
          <>
            {summary
              ? <Annotated text={summary} claims={inc.claims} chip="named" />
              : <Claims claims={mine} />}
            {pins.length > 0 && (
              <div className="deck-stage-map"><EvidenceMap pins={pins} /></div>
            )}
          </>
        ),
      };
    });

  if (!pages.length) return null;
  return <StagesShell slide={slide} pages={pages} rail={rail} current={current} />;
}
