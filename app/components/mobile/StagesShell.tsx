'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SourceRail, type SourceCard } from './SourceRail';

/**
 * Slide 3's stack - docs/mobile-item.html §6.
 *
 * One page per stage, chronological downward, opening on the current one. A
 * stage page is not required to fit the frame: it scrolls, and the same
 * gesture carries the reader between stages. One axis, one gesture, no
 * separate control to find.
 *
 * The boundary is a property of the stack rather than of a listener - nested
 * scroll-snap, the way §11 calls it - so whatever DIA-383 eventually does to
 * the deck's axis decision does not have to be done here as well.
 */

export type StageHead = {
  n: number;
  he: string;
  color: string;
  definition: string;
  /** The date and its distance from 7.10, already composed. Null where the
   *  earliest claim carries no date at all. */
  age: string | null;
  current: boolean;
};

export type StagePage = { head: StageHead; body: ReactNode; cards: SourceCard[] };

/** A rung, drawn or held as an invisible spacer so nothing ever moves. */
export type Rung = { n: number; color: string; drawn: boolean };

const CHEVRON = { down: 'M6 9l6 6 6-6', up: 'M18 15l-6-6-6 6' };

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

/** One page. Its own rail, because a stack has several on screen at once. */
function Page({ page, index }: { page: StagePage; index: number }) {
  const { head } = page;
  return (
    <section
      className="deck-stage"
      data-stage={head.n}
      data-index={index}
      aria-label={`שלב ${head.n} · ${head.he}`}
    >
      <div className="deck-stage-kicker">מה נעשה מאז</div>

      <div className="deck-stage-head">
        <div className="deck-stage-tags">
          <span className="deck-stage-tag" style={{ ['--c' as string]: head.color }}>
            {head.n} · {head.he}
          </span>
          {head.current && <span className="deck-stage-now">סטטוס נוכחי</span>}
        </div>
        <div className="deck-stage-def">{head.definition}</div>
        {head.age && <div className="deck-stage-age">{head.age}</div>}
      </div>

      <div className="deck-stage-body">{page.body}</div>
      <SourceRail cards={page.cards} />
    </section>
  );
}

export function StagesShell({ slide, pages, rail, current }: {
  /** This slide's index in the deck, so the stack can claim the URL's tail. */
  slide: number;
  pages: StagePage[];
  rail: Rung[];
  /** The stage the item is actually at, which the pill walks back to. */
  current: number;
}) {
  const stack = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(() => Math.max(0, pages.findIndex((p) => p.head.current)));
  const atRef = useRef(at);
  /**
   * Where the reader left each stage, for as long as the page is open. It is
   * what makes scrolling back up bearable: they return to the foot of the
   * stage they just read rather than above everything in it. Not a stored
   * preference, and it does not survive a reload.
   */
  const seen = useRef(new Map<number, number>());
  /**
   * True while the stack is scrolling itself. The memory is the reader's, so
   * the positions a driven scroll passes through on its way somewhere are not
   * recorded - otherwise walking away from a stage overwrites the place it was
   * left with the place the animation happened to be at.
   */
  const driving = useRef(false);
  /** What a driven scroll asked for, so its landing can be checked against it. */
  const want = useRef<{ page: number; into: number } | null>(null);

  const pageEls = useCallback(
    () => [...(stack.current?.querySelectorAll<HTMLElement>('.deck-stage') ?? [])], []);

  /** Measured, not calculated: a page's height is its content's. */
  const indexNow = useCallback(() => {
    const box = stack.current;
    if (!box) return 0;
    const top = box.getBoundingClientRect().top;
    let best = 0, gap = Infinity;
    pageEls().forEach((el, i) => {
      const g = Math.abs(el.getBoundingClientRect().top - top);
      if (g < gap) { gap = g; best = i; }
    });
    return best;
  }, [pageEls]);

  /**
   * Open a stage. A stage the reader has not been to opens at its top; one
   * they have already read reopens where they left it.
   */
  const open = useCallback((i: number, opts?: { top?: boolean; smooth?: boolean }) => {
    const box = stack.current;
    const el = pageEls()[i];
    if (!box || !el) return;
    const remembered = opts?.top ? 0 : (seen.current.get(i) ?? 0);
    const dy = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    atRef.current = i;
    setAt(i);
    if (opts?.top) seen.current.set(i, 0);

    const room = box.scrollHeight - box.clientHeight;
    const to = Math.max(0, Math.min(room, box.scrollTop + dy + remembered));
    // A scroll that is already there fires no scroll event, so nothing would
    // ever clear the intent - and the reader's next scroll would be pulled
    // back to it. Arriving on the stage you are already on is the common case.
    if (Math.abs(to - box.scrollTop) < 1) return;

    driving.current = true;
    want.current = { page: i, into: remembered };
    box.scrollTo({ top: to, behavior: opts?.smooth ? 'smooth' : 'instant' });
  }, [pageEls]);

  /* ------------------------------------------------ arrival and the URL tail */
  useEffect(() => {
    const deck = stack.current?.closest<HTMLElement>('.deck');
    const read = () => {
      const m = /^#([1-6])(?:-s([1-6]))?$/.exec(location.hash);
      if (!m || Number(m[1]) - 1 !== slide || !m[2]) return false;
      const i = pages.findIndex((p) => p.head.n === Number(m[2]));
      // A deep link is a first visit: the top of that stage, no memory.
      if (i >= 0) { open(i, { top: true }); return true; }
      return false;
    };
    if (!read()) open(atRef.current, { top: true });
    // The deck owns the URL; the stack owns which page it is showing. It
    // publishes here rather than reaching into the deck to write a hash.
    if (deck) deck.dataset.stageAt = String(slide);
    window.addEventListener('popstate', read);
    return () => {
      window.removeEventListener('popstate', read);
      if (deck) { delete deck.dataset.stageAt; delete deck.dataset.stage; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const deck = stack.current?.closest<HTMLElement>('.deck');
    if (deck) deck.dataset.stage = String(pages[at]?.head.n ?? '');
    // The deck writes the URL; it cannot know the tail moved unless told.
    window.dispatchEvent(new CustomEvent('deck:stagechange'));
  }, [at, pages]);

  /* --------------------------------------------------------- the two arrows */
  useEffect(() => {
    const onStep = (e: Event) => {
      const dir = (e as CustomEvent<{ dir: number }>).detail?.dir ?? 0;
      const next = Math.min(pages.length - 1, Math.max(0, atRef.current + dir));
      if (next !== atRef.current) open(next, { smooth: true });
    };
    window.addEventListener('deck:stage', onStep);
    return () => window.removeEventListener('deck:stage', onStep);
  }, [open, pages.length]);

  /* ------------------------------------------------- following the scroll */
  /**
   * Where the scroll came to rest, and only there.
   *
   * Recording every frame looked like the same thing and was not: scrolling
   * straight through a stage on the way to the next one wrote that stage's
   * foot into the memory, so coming back to it by the arrows landed at its
   * end with its title above the fold. A stage the reader passed through is
   * not a stage they left off in.
   *
   * Debounced rather than hung off `scrollend`, which is young enough that a
   * phone may not have it - and the memory going missing is the kind of fault
   * that looks like nothing until someone tries to come back.
   */
  const rest = useCallback(() => {
    const box = stack.current;
    if (!box) return;
    driving.current = false;
    const i = indexNow();
    const el = pageEls()[i];
    if (!el) return;
    const dy = Math.round(box.getBoundingClientRect().top - el.getBoundingClientRect().top);

    // What a driven scroll asked for and where the engine put it can differ by
    // a snap. Corrected here rather than hoped for - the same self-correction
    // the deck learned in Phase 2, and the reason a nudge used to fix this.
    const asked = want.current;
    want.current = null;
    if (asked && asked.page === i && Math.abs(dy - asked.into) > 1) {
      box.scrollTo({ top: box.scrollTop + (asked.into - dy), behavior: 'instant' });
      return;
    }

    seen.current.set(i, Math.max(0, dy));
  }, [indexNow, pageEls]);

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback(() => {
    const i = indexNow();
    if (i !== atRef.current) { atRef.current = i; setAt(i); }
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(rest, 140);
  }, [indexNow, rest]);

  const here = pages[at]?.head.n ?? current;
  const off = here !== current;
  const back = pages.findIndex((p) => p.head.n === current);

  return (
    <div className="deck-stages">
      <ol className="deck-loc" aria-hidden="true">
        {rail.map((r) => (
          <li
            key={r.n}
            className="deck-loc-rung"
            data-drawn={r.drawn ? '' : undefined}
            data-on={r.drawn && r.n === here ? '' : undefined}
            style={{ ['--c' as string]: r.color }}
          />
        ))}
      </ol>

      <div className="deck-stack" ref={stack} onScroll={onScroll}>
        {pages.map((p, i) => <Page key={p.head.n} page={p} index={i} />)}
      </div>

      {/* The row keeps its height whether or not the pill is in it: a chrome
          that resizes the scroller is what DIA-379 was. */}
      <div className="deck-stage-backrow">
        <button
          type="button"
          className="deck-stage-back"
          hidden={!off}
          onClick={() => back >= 0 && open(back, { smooth: true })}
        >
          <Chevron d={here < current ? CHEVRON.down : CHEVRON.up} />
          חזרה לשלב הנוכחי
        </button>
      </div>
    </div>
  );
}

/**
 * The footer's vertical arrows - §6's route for a reader who does not scroll,
 * and the reason nothing on the deck is gesture-only.
 *
 * It lives in the docked footer, which the deck renders once, so it talks to
 * the stack through an event rather than a prop. Same control on slide 4 in
 * Phase 6, with no second implementation.
 */
export function StageArrows() {
  const step = (dir: number) =>
    window.dispatchEvent(new CustomEvent('deck:stage', { detail: { dir } }));
  // Drawn as §6 draws it - the glyph pair, left of the word, isolated so the
  // latin arrows do not reorder the Hebrew around them - but each glyph is a
  // real button, because the label is also the route.
  return (
    <span className="deck-stage-arrows">
      <i dir="ltr">
        <button type="button" aria-label="השלב הקודם" onClick={() => step(-1)}>↑</button>
        <button type="button" aria-label="השלב הבא" onClick={() => step(1)}>↓</button>
      </i>
      <span>שלבים</span>
    </span>
  );
}
