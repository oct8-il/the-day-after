'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Slide 3's stack - docs/mobile-item.html §6.
 *
 * One page per stage, chronological downward, opening on the current one.
 * A stage page is a card exactly one frame tall (DIA-413), so since DIA-416
 * this stack is what the deck already is on the other axis: uniform pages,
 * mandatory snap, one stage per gesture, never at rest between two.
 *
 * Everything that made a stage bearable while it could be taller than the
 * frame is gone with the scrolling stage itself - the per-stage memory, the
 * driven-scroll bookkeeping and the landing correction. A page has no inside
 * to remember, and a stage opens at its top, always.
 *
 * The boundary is a property of the stack rather than of a listener - nested
 * scroll-snap, the way §11 calls it - so whatever DIA-383 eventually does to
 * the deck's axis decision does not have to be done here as well.
 */

/**
 * One page of the stack. Since DIA-413 the page's content is a card built by
 * Card.tsx - the head group, the reading, the button - and the stack owns only
 * where a page sits and which one is showing.
 */
export type StagePage = {
  n: number;
  he: string;
  current: boolean;
  /** The card, already built: this file does not know what is on it. */
  card: ReactNode;
};

/**
 * Which half of the split this stack is. Slide 3 holds the stages an item
 * reached, slide 4 the ones it has not: the same component with the opposite
 * filter, which is why almost nothing below branches on it.
 */
export type StackKind = 'reached' | 'unreached';

/** A rung, drawn or held as an invisible spacer so nothing ever moves. */
export type Rung = {
  n: number;
  /** The stage's name, for the rung's label where the rung is a control. */
  he: string;
  color: string;
  drawn: boolean;
  reached: boolean;
  /**
   * The reading sheet this rung jumps to, where there is one (DIA-430). Only
   * the copy inside a sheet uses it; slide 4 has no sheets, so none of its
   * rungs carry it and the rule has nowhere to apply there.
   */
  sheet?: string;
};

const CHEVRON = { down: 'M6 9l6 6 6-6', up: 'M18 15l-6-6-6 6', right: 'M9 5l7 7-7 7' };

/** §7: how close the definition box may come to the lead or the age group. */
const CLEAR = 14;

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

/**
 * §6's locator. Drawn twice: once on the slide, and once inside the stage's
 * reading sheet, which covers the frame - "it stays visible while the reading
 * sheet is open". A copy rather than a lift, because the sheet is outside the
 * track and the slide's own locator is inside it: two stacking contexts that
 * cannot be reconciled.
 *
 * The two copies read the same and do not do the same thing. On the slide it
 * is an indicator: the stack under it is what the reader moves, so a control
 * there would be a second way to do one thing. In the sheet the stack is
 * inert, and the ladder is how the reader moves between stages without
 * leaving the reading at all (DIA-430).
 */
export function Locator({ rail, on, slide }: { rail: Rung[]; on: number; slide?: number }) {
  /*
   * `slide` is passed only to the copy that lives inside a reading sheet,
   * where §6 makes the ladder the way between stages and the only one
   * (DIA-430). On the slide itself it is an indicator and nothing else, so it
   * stays out of the accessibility tree entirely - and an `aria-hidden` list
   * with focusable buttons inside it would be worse than either.
   */
  const jumps = slide !== undefined;
  return (
    <ol className="deck-loc" aria-hidden={jumps ? undefined : true}>
      {rail.map((r) => (
        <li
          key={r.n}
          className="deck-loc-rung"
          data-drawn={r.drawn ? '' : undefined}
          data-un={r.drawn && !r.reached ? '' : undefined}
          data-on={r.drawn && r.n === on ? '' : undefined}
          style={{ ['--c' as string]: r.color }}
        >
          {jumps && r.drawn && r.sheet ? (
            <button
              type="button"
              className="deck-loc-jump"
              data-jump={r.sheet}
              data-stage={r.n}
              data-slide={slide}
              aria-label={`שלב ${r.n} · ${r.he}`}
              aria-current={r.n === on ? 'true' : undefined}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** One page: a card, and where it sits in the stack. */
function Page({ page, index }: { page: StagePage; index: number }) {
  return (
    <section
      className="deck-stage"
      data-stage={page.n}
      data-index={index}
      aria-label={`שלב ${page.n} · ${page.he}`}
    >
      {page.card}
    </section>
  );
}

export function StagesShell({ slide, kind, pages, rail, current }: {
  /** This slide's index in the deck, so the stack can claim the URL's tail. */
  slide: number;
  kind: StackKind;
  pages: StagePage[];
  rail: Rung[];
  /** The stage the item is actually at, which the pill walks back to. */
  current: number;
}) {
  const stack = useRef<HTMLDivElement>(null);
  // Slide 3 opens on the current stage; slide 4 on the next one, which is its
  // first page because the filter is sorted.
  const [at, setAt] = useState(() =>
    kind === 'reached' ? Math.max(0, pages.findIndex((p) => p.current)) : 0);
  const atRef = useRef(at);
  const pageEls = useCallback(
    () => [...(stack.current?.querySelectorAll<HTMLElement>('.deck-stage') ?? [])], []);

  /**
   * Which page the stack is showing: the one whose top is nearest its own.
   *
   * This was the measure before DIA-416 and it was wrong then - 700px into a
   * 1261px page the *next* page's top was nearer, so the ring, the hash and
   * the pill all named a stage the reader had not reached. Nothing about it
   * changed; the pages became uniform under it, and a nearest-top measure on
   * uniform pages flips exactly at the halfway point of a drag.
   */
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

  /** Open a stage - at its top, which is the only place a page has. */
  const open = useCallback((i: number, opts?: { smooth?: boolean }) => {
    const box = stack.current;
    const el = pageEls()[i];
    if (!box || !el) return;
    const dy = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    atRef.current = i;
    setAt(i);

    const room = box.scrollHeight - box.clientHeight;
    const to = Math.max(0, Math.min(room, box.scrollTop + dy));
    if (Math.abs(to - box.scrollTop) < 1) return;
    box.scrollTo({ top: to, behavior: opts?.smooth ? 'smooth' : 'instant' });
  }, [pageEls]);

  /* ------------------------------------------------ arrival and the URL tail */
  useEffect(() => {
    const deck = stack.current?.closest<HTMLElement>('.deck');
    const read = () => {
      const m = /^#([1-6])(?:-s([1-6]))?$/.exec(location.hash);
      if (!m || Number(m[1]) - 1 !== slide || !m[2]) return false;
      // The deck marks the pop it causes when a reading sheet closes. That
      // pop rewinds the URL to before the sheet opened, so the tail it
      // carries is older than the jump the reader made inside it (DIA-430) -
      // and this stack is already standing where they left off. It stays
      // there and says so, rather than reading a hash that is behind it. The
      // mark is only read here; the deck clears it, last on that pop, so both
      // stacks see it.
      if (deck?.hasAttribute('data-popping')) {
        window.dispatchEvent(new CustomEvent('deck:stagechange'));
        return true;
      }
      const i = pages.findIndex((p) => p.n === Number(m[2]));
      if (i >= 0) { open(i); return true; }
      return false;
    };
    if (!read()) open(atRef.current);
    window.addEventListener('popstate', read);
    return () => {
      window.removeEventListener('popstate', read);
      if (deck) delete deck.dataset[`stage${slide}`];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const deck = stack.current?.closest<HTMLElement>('.deck');
    // The deck owns the URL; the stack owns which page it is showing, and
    // publishes it here under its own slide's key rather than reaching into
    // the deck to write a hash. Two stacks share this root, so the key has to
    // name the slide: a single `data-stage` had slide 4 answering for slide 3.
    if (deck) deck.dataset[`stage${slide}`] = String(pages[at]?.n ?? '');
    // The deck writes the URL; it cannot know the tail moved unless told.
    window.dispatchEvent(new CustomEvent('deck:stagechange'));
  }, [at, pages, slide]);

  /* --------------------------------------------------------- the two arrows */
  useEffect(() => {
    const onStep = (e: Event) => {
      const d = (e as CustomEvent<{ slide: number; dir?: number; to?: 'current'; stage?: number }>).detail;
      if (!d || d.slide !== slide) return;
      if (d.to === 'current') {
        const i = pages.findIndex((p) => p.current);
        if (i >= 0 && i !== atRef.current) open(i, { smooth: true });
        return;
      }
      // A jump from the ladder in a reading sheet (DIA-430). Instant and
      // unannounced: the reader is inside the sheet and has already seen the
      // stage change there; the stack is only making sure that closing the
      // sheet lands on what was read, and that the hash says so.
      if (typeof d.stage === 'number') {
        const j = pages.findIndex((p) => p.n === d.stage);
        if (j >= 0 && j !== atRef.current) open(j);
        return;
      }
      const next = Math.min(pages.length - 1, Math.max(0, atRef.current + (d.dir ?? 0)));
      if (next !== atRef.current) open(next, { smooth: true });
    };
    window.addEventListener('deck:stage', onStep);
    return () => window.removeEventListener('deck:stage', onStep);
  }, [open, pages, slide]);

  /* --------------------------------------------- slide 4 only (§7) */
  /**
   * The definition box sits at the vertical centre of the *screen*.
   *
   * CSS can centre it in the space it was given; that space is not symmetric
   * about the frame, because the label, the head and the lead stand above it
   * and only the age group and the button below. So the box is centred in its
   * own space by `margin-block:auto` and then nudged, once, by a measurement -
   * the same rule the sheet's alignment follows, and for the same reason:
   * arithmetic here would be alignment until someone changed the head.
   *
   * Every page is exactly one frame and snaps (DIA-416), so a page that is
   * showing has the stack's own top - which is what lets one measurement
   * place the box on every page, including the ones scrolled off.
   *
   * It is clamped to stay 14px clear of the lead above and the age below. At
   * 844, 664 and 600 with today's copy it never reaches the clamp.
   */
  useEffect(() => {
    const box = stack.current;
    const deck = box?.closest<HTMLElement>('.deck');
    if (kind !== 'unreached' || !box || !deck) return;

    const place = () => {
      const mid = deck.getBoundingClientRect().height / 2
        - (box.getBoundingClientRect().top - deck.getBoundingClientRect().top);
      for (const page of box.querySelectorAll<HTMLElement>('.deck-stage')) {
        const def = page.querySelector<HTMLElement>('.deck-gap-def');
        const lead = page.querySelector<HTMLElement>('.deck-gap-say');
        const foot = page.querySelector<HTMLElement>('.deck-gap-wait');
        if (!def || !lead || !foot) continue;
        // Measured with no shift on it, so the reading is of the layout and
        // not of the last answer.
        def.style.removeProperty('top');
        const top = page.getBoundingClientRect().top;
        const d = def.getBoundingClientRect();
        const want = mid - (d.top - top + d.height / 2);
        const up = d.top - lead.getBoundingClientRect().bottom - CLEAR;
        const down = foot.getBoundingClientRect().top - d.bottom - CLEAR;
        const shift = Math.max(-up, Math.min(down, want));
        def.style.top = `${Math.round(shift)}px`;
      }
    };

    place();
    // The frame changes height when a phone's URL bar comes and goes, and the
    // box is 15px type: both move it.
    const ro = new ResizeObserver(place);
    ro.observe(deck);
    void document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [kind, pages]);

  /**
   * Leaving slide 4 sends slide 3 back to the current stage (DIA-423).
   *
   * The footer's `מה נעשה מאז` is the only way back now that the pill is
   * gone, and §7 says it lands on the current stage rather than on whichever
   * page the reader last left. The deck owns the slide, so the only thing
   * this stack knows is that the deck stopped showing it - which the deck
   * writes on itself, and is enough.
   */
  useEffect(() => {
    const box = stack.current;
    const deck = box?.closest<HTMLElement>('.deck');
    if (kind !== 'unreached' || !deck) return;
    const mine = String(slide);
    // Leaving, not being elsewhere. A deck that was never on this slide has
    // not left it, and a deep link into `#3-s1` arrives with `data-at` going
    // straight from 0 to 2 - which, read as "not slide 4", would send slide 3
    // to its current stage and throw the link away.
    let was = deck.getAttribute('data-at');
    const watch = new MutationObserver(() => {
      const now = deck.getAttribute('data-at');
      if (now === was) return;
      const left = was === mine;
      was = now;
      if (!left) return;
      window.dispatchEvent(new CustomEvent('deck:stage', {
        detail: { slide: slide - 1, to: 'current' },
      }));
    });
    watch.observe(deck, { attributes: true, attributeFilter: ['data-at'] });
    return () => watch.disconnect();
  }, [kind, slide]);

  /* ------------------------------------------------- following the scroll */
  /**
   * Which page is showing, and nothing else.
   *
   * There used to be a debounced `rest` under this that recorded where the
   * reader left each stage and corrected a driven scroll's landing against
   * what it had asked for. Both existed because a page could be taller than
   * the frame. Neither has anything left to do: the snap lands the scroll on
   * a page by itself, and a page has no inside to remember (DIA-416).
   */
  const onScroll = useCallback(() => {
    const i = indexNow();
    if (i !== atRef.current) { atRef.current = i; setAt(i); }
  }, [indexNow]);

  const here = pages[at]?.n ?? current;
  // Slide 3 only. On slide 4 the pill said what the footer under it already
  // said, one thumb-width away and to the same place, so slide 4 has no pill
  // and the footer's `מה נעשה מאז` is the way back (DIA-423).
  const off = kind === 'reached' && here !== current;
  const back = pages.findIndex((p) => p.n === current);
  const walk = () => { if (back >= 0) open(back, { smooth: true }); };

  return (
    <div className="deck-stages">
      <Locator rail={rail} on={here} />

      <div className="deck-stack" ref={stack} onScroll={onScroll}>
        {pages.map((p, i) => (
          <Page key={p.n} page={p} index={i} />
        ))}
      </div>

      {/* The row keeps its height whether or not the pill is in it: a chrome
          that resizes the scroller is what DIA-379 was. Slide 4 has no pill
          at all, so it has no row either and its stack is 31px taller - the
          two slides' frames are their own, and the locator above them is what
          has to line up (DIA-423). */}
      {kind === 'reached' && (
        <div className="deck-stage-backrow">
          <button
            type="button"
            className="deck-stage-back"
            hidden={!off}
            onClick={walk}
          >
            <Chevron d={here < current ? CHEVRON.down : CHEVRON.up} />
            חזרה לשלב הנוכחי
          </button>
        </div>
      )}
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
export function StageArrows({ slide }: { slide: number }) {
  const step = (dir: number) =>
    window.dispatchEvent(new CustomEvent('deck:stage', { detail: { slide, dir } }));
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
