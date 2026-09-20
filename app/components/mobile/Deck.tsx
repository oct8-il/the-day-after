'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The phone deck's shell: the frame, the chrome and the gestures (DIA-377).
 *
 * Six slides on horizontal scroll-snap behind the breakpoint in §2. This file
 * renders no incident data at all - the slides name themselves and Phase 3
 * onwards fills them - so everything here is about position, history and
 * gesture, which is what gate 1 judges.
 *
 * Read with docs/mobile-item.html §2, §3 and §11 open. Where this file and the
 * spec disagree, the spec is right.
 *
 * Three rules from §11 shape the whole file:
 *
 *   Both trees ship at one URL and a media query picks one. There is no server
 *   to sniff a device and no JavaScript swap - the deck and the desktop page
 *   are both in this HTML, and CSS hides one. So this component always renders,
 *   even on a desktop, where it is display:none.
 *
 *   Nothing may be gesture-only. Every slide the long press can reach is also a
 *   footer link, an arrow key and a section in DOM order, because a screen
 *   reader's swipe means "next element" and not "next slide".
 *
 *   The deck contributes at most one history entry. Back returns to the gate
 *   from anywhere; a second Back leaves the page, which on a phone is usually
 *   how a reader gets out of Instagram's in-app browser.
 */

/** §3's names, in order. The footer chain and the section labels read from this. */
const SLIDES = [
  { n: 1, he: 'השער' },
  { n: 2, he: 'סקירת הכשל' },
  { n: 3, he: 'מה נעשה מאז' },
  { n: 4, he: 'מה עוד לא נעשה' },
  { n: 5, he: 'דעת הציבור' },
  { n: 6, he: 'הלאה' },
] as const;

const LAST = SLIDES.length - 1;

/**
 * Chevrons as paths, never as characters.
 *
 * A literal › or ‹ carries the Unicode mirrored property, so the bidi algorithm
 * flips it inside a Hebrew line and the footer points the wrong way in both
 * directions at once. A path has no directionality to mirror.
 */
const CHEVRON = {
  right: 'M9 5l7 7-7 7',
  left: 'M15 5l-7 7 7 7',
};

const Chevron = ({ d }: { d: string }) => (
  <svg className="deck-chev" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
);

/**
 * §2's hash grammar: `#3` is a slide, `#3-s2` a stage page inside one. The
 * stage half belongs to slide 3's stack, which is Phase 5 - it is parsed and
 * carried here rather than dropped, so a link written today still resolves when
 * that lands.
 */
export function parseHash(hash: string): { slide: number; stage: number | null } | null {
  const m = /^#?([1-6])(?:-s([1-6]))?$/.exec(hash.trim());
  if (!m) return null;
  return { slide: Number(m[1]) - 1, stage: m[2] ? Number(m[2]) : null };
}

/**
 * The gate is the bare item URL, never `#1`. §9 wants every shared link to be
 * the bare URL, and a reader who copies what is in the address bar is sharing
 * whatever the deck last wrote there.
 */
const hashFor = (i: number, stage: number | null) =>
  i === 0 && !stage ? '' : `#${i + 1}${stage ? `-s${stage}` : ''}`;

export function Deck({ crumbs, slides, mid, credit, ground }: {
  crumbs: { ancestors: string[]; leaf: string };
  /**
   * The slides that have been built, by index. A hole is a placeholder naming
   * itself, which is how the deck shipped in Phase 2 and how slides 2-6 still
   * stand. They arrive as nodes rather than being imported here because they
   * are server-rendered: the gate is the first thing a reader sees and should
   * not wait for hydration, and this component is a client one.
   */
  slides?: (ReactNode | null)[];
  /**
   * What a slide puts in the middle of the footer, by index. Slides 3 and 4
   * use it for the vertical arrows - §6's route for a reader who does not
   * scroll. It lives here rather than in the slide because the footer is
   * docked chrome and is rendered once, not per slide.
   */
  mid?: (ReactNode | null)[];
  /** The gate's photo credit, which §3 gives the footer's left slot on slide 1. */
  credit?: string | null;
  /**
   * The gate's ground, painted behind the whole frame rather than inside slide
   * 1. The chrome is docked - it sits in the deck's own column, outside the
   * track - so a ground painted inside the slide would stop where the track
   * stops and leave a seam under the dots. It is shown only on the gate.
   */
  ground?: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const crumbBar = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [armed, setArmed] = useState(false);
  /** The live index, for the handlers that a scrub re-enters faster than React
   *  re-subscribes them. Kept in step with `at` by every setter below. */
  const atRef = useRef(0);
  /** Jump mode's live state. A React state setter cannot be read back inside
   *  the same handler, and its updater runs during the render phase - which is
   *  not somewhere history or the DOM may be touched. */
  const armedRef = useRef(false);

  /**
   * Whether the deck has already put its one entry on the history stack. Reset
   * by popstate: a Back that pops our entry leaves the stack as it was on
   * arrival, and the next move is a first move again.
   */
  const pushed = useRef(false);
  /** The slide the reader arrived on. Returning to it is a Back, not a write. */
  const entrySlide = useRef(0);
  /**
   * The slide the deck is currently scrolling itself towards, or null when the
   * track belongs to the reader.
   *
   * While it is set the scroll handler keeps its hands off the index entirely.
   * It used to only suppress the hash write, which left the handler free to
   * report intermediate positions during a smooth scroll: clicking the footer
   * showed the destination, then flashed the slide it had come from as the
   * animation crossed the midpoint, then settled. The chrome is the
   * destination's from the moment the destination is chosen.
   */
  const target = useRef<number | null>(null);

  const slideEls = () =>
    [...(track.current?.querySelectorAll<HTMLElement>('.deck-slide') ?? [])];

  /**
   * Which slide the track is showing, measured rather than calculated.
   *
   * `Math.round(scrollLeft / clientWidth)` looks equivalent and is not: the
   * frame is fluid between 320 and 599, so a slide's width is whatever the
   * viewport gives it, fractions included, and in RTL scrollLeft is negative
   * in some engines and zero-based-from-the-right in others. Asking the
   * elements where they are costs one layout read and is true everywhere.
   */
  const indexNow = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const base = el.getBoundingClientRect().left;
    let best = 0, gap = Infinity;
    slideEls().forEach((sl, i) => {
      const g = Math.abs(sl.getBoundingClientRect().left - base);
      if (g < gap) { gap = g; best = i; }
    });
    return best;
  }, []);

  /**
   * Scroll the track to a slide, by asking the slide to bring itself into view.
   *
   * Two separate traps sit behind this one line.
   *
   * `i * clientWidth` is not the slide's position. The frame is fluid between
   * 320 and 599, so a slide's width is whatever the viewport gives it,
   * fractions included; and a programmatic scroll ends exactly where it is put
   * and is not re-snapped afterwards. A target computed that way lands a
   * fraction off the snap point and stays there - the slide that sits a little
   * to one side until a finger nudges it straight.
   *
   * The obvious repair, scrollBy() with a delta measured off the two rects,
   * is worse: scroll-snap-stop:always stops any scroll operation at the first
   * snap point it meets, so scrollBy travels exactly one slide however far it
   * was asked to go. Measured in this browser: scrollBy to slide 4 arrives at
   * slide 2, with the property on, in both smooth and instant. scrollTo() to
   * an absolute offset and scrollIntoView() are not capped.
   *
   * scrollIntoView is the one that has neither problem: the browser computes
   * the offset, so there is no arithmetic to drift and no axis whose sign has
   * to be guessed in RTL.
   */
  const scrollTo = useCallback((i: number, smooth: boolean) => {
    const el = track.current;
    const sl = slideEls()[i];
    if (!el || !sl) return;
    atRef.current = i;
    setAt(i);
    const dx = sl.getBoundingClientRect().left - el.getBoundingClientRect().left;
    // Already there: scrollIntoView would fire no scroll event, and `target`
    // would sit set for a landing that never comes.
    if (Math.abs(dx) < 0.5) { target.current = null; return; }
    target.current = i;
    sl.scrollIntoView({ inline: 'start', block: 'nearest', behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  /**
   * §2: the first move pushes one entry, every move after it replaces. The
   * invariant is "the deck adds at most one entry to the stack", which is what
   * makes two Backs leave the page from anywhere in the deck.
   */
  const writeHash = useCallback((i: number, stage: number | null) => {
    const url = location.pathname + location.search + hashFor(i, stage);
    if (url === location.href.replace(location.origin, '')) return;
    // Walking back to where the reader came in spends our entry rather than
    // replacing it, so the deck never leaves a second copy of the arrival URL
    // on the stack for Back to stop at.
    if (pushed.current && i === entrySlide.current && !stage) { history.back(); return; }
    if (pushed.current) history.replaceState(null, '', url);
    else { history.pushState(null, '', url); pushed.current = true; }
  }, []);

  const go = useCallback((i: number, opts?: { smooth?: boolean; write?: boolean }) => {
    const n = Math.min(LAST, Math.max(0, i));
    scrollTo(n, opts?.smooth ?? true);
    if (opts?.write ?? true) writeHash(n, null);
  }, [scrollTo, writeHash]);

  /**
   * The track has stopped moving: adopt where it stopped, straighten it if it
   * stopped between two slides, and record it.
   *
   * The straightening is the important half. A slide landing a fraction off
   * its snap point has had three separate causes so far - index arithmetic
   * against a fractional width, scroll-snap-stop capping a scrollBy, and now
   * something on the glass that does not reproduce in a headless Chromium at
   * any width. Rather than chase a fourth, the deck measures where it actually
   * came to rest and corrects it. The correction is instant and its own
   * scrollend finds nothing left to do, so it cannot loop.
   */
  /**
   * The page a slide that owns pages is on, read off the deck's own root.
   *
   * A stage stack writes its position there rather than reaching into this
   * component: the deck owns the URL, and the stack owns which page it is
   * showing, and neither has to import the other to agree. The slide index is
   * written beside it so a stale value from another slide cannot be read.
   */
  const stageNow = useCallback((i: number) => {
    const d = crumbBar.current?.parentElement as HTMLElement | undefined;
    if (!d || d.dataset.stageAt !== String(i)) return null;
    const n = Number(d.dataset.stage);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, []);

  const settle = useCallback(() => {
    target.current = null;
    // A scrub stops between every pair of dots. The landing writes the hash,
    // once, when the finger lifts - not at each stage it passed through.
    if (armedRef.current) return;
    const i = indexNow();

    const el = track.current;
    const sl = slideEls()[i];
    if (el && sl) {
      const dx = sl.getBoundingClientRect().left - el.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) sl.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' });
    }

    if (i !== atRef.current) { atRef.current = i; setAt(i); }
    writeHash(i, stageNow(i));
  }, [indexNow, writeHash, stageNow]);

  /**
   * The chrome overlays the track rather than sharing a column with it, so the
   * track's height is the frame's and never changes. What does change is how
   * much room the chrome needs: the gate gives the dots more air than the other
   * slides, and a footer with a previous-slide link is taller than one without.
   *
   * That difference used to come out of the track's height, and resizing a
   * scroll container mid-scroll makes the engine recompute its snap positions -
   * which a swipe in flight pays for, as an overshoot. Now it comes out of the
   * slides' padding instead, which moves nothing the scroller cares about.
   *
   * Measured rather than tabulated: the numbers are the chrome's own, so they
   * cannot fall out of step with it.
   */
  useLayoutEffect(() => {
    const deck = crumbBar.current?.parentElement;
    if (!deck) return;
    const set = () => {
      deck.style.setProperty('--deck-top', `${Math.ceil(crumbBar.current?.offsetHeight ?? 0)}px`);
      deck.style.setProperty('--deck-bottom', `${Math.ceil(bottom.current?.offsetHeight ?? 0)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    if (crumbBar.current) ro.observe(crumbBar.current);
    if (bottom.current) ro.observe(bottom.current);
    return () => ro.disconnect();
  }, [at]);

  /* ---------------------------------------------------- arrival and history */
  useEffect(() => {
    const entry = parseHash(location.hash);
    if (entry) { entrySlide.current = entry.slide; scrollTo(entry.slide, false); }

    // A Back that lands anywhere re-reads the hash and moves without writing.
    // Our entry is gone once it is popped, so the next move pushes again.
    const onPop = () => {
      pushed.current = false;
      const t = parseHash(location.hash);
      scrollTo(t ? t.slide : 0, false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A slide that owns pages moved between them. The deck owns the URL, so it
   * rewrites the tail; the stack only says that there is a new one.
   */
  useEffect(() => {
    const onStage = () => writeHash(atRef.current, stageNow(atRef.current));
    window.addEventListener('deck:stagechange', onStage);
    return () => window.removeEventListener('deck:stagechange', onStage);
  }, [writeHash, stageNow]);

  /* --------------------------------------------------- following the finger */
  /**
   * Two jobs, deliberately split.
   *
   * `scroll` keeps the chrome under the reader's finger, so the dots move with
   * a swipe rather than after it - but only while the track is the reader's. A
   * scroll the deck started reports every position between here and there, and
   * following those is what made the footer flicker.
   *
   * `scrollend` records the landing. The hash is written once, when the track
   * stops, rather than on every frame of a momentum scroll: Next patches
   * history.replaceState to sync its Router, and calling that sixty times a
   * second during a touch scroll is felt on the glass.
   */
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let queued = false;
    let fallback = 0;

    const read = () => {
      if (target.current === null) {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const i = indexNow();
          if (i !== atRef.current) { atRef.current = i; setAt(i); }
        });
      }
      // Engines without scrollend still have to settle. The timer is also the
      // safety net for a smooth scroll that never reaches its target because
      // the reader grabbed the track half way.
      if (!('onscrollend' in el)) {
        clearTimeout(fallback);
        fallback = window.setTimeout(settle, 140);
      }
    };

    el.addEventListener('scroll', read, { passive: true });
    if ('onscrollend' in el) el.addEventListener('scrollend', settle, { passive: true });

    /**
     * The frame is 100dvh, and on iOS the visible viewport changes height as
     * the URL bar collapses - which fires a resize while the reader is part
     * way through a swipe. Put the current slide back where it belongs.
     */
    const onResize = () => scrollTo(atRef.current, false);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    // A finger on the track takes it back from whatever the deck was doing.
    const release = () => { target.current = null; };
    el.addEventListener('pointerdown', release, { passive: true });

    return () => {
      clearTimeout(fallback);
      el.removeEventListener('scroll', read);
      el.removeEventListener('scrollend', settle);
      el.removeEventListener('pointerdown', release);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [indexNow, settle, scrollTo]);

  /* ---------------------------------------------------------- arrow keys */
  // §11: arrow keys on a hardware keyboard. The mapping is spatial, so in this
  // RTL frame ArrowLeft goes forward - the next slide is the one to the left.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(LAST); }
  };

  /* ------------------------------------------------------------- jump mode */
  /**
   * §3. Press and hold ~400ms on the dot row, slide to scrub, release to land.
   * The mode ends with the finger, so nothing can be left switched on.
   *
   * The index comes from whichever dot's centre is nearest the pointer rather
   * than from arithmetic on the row's width, which keeps it correct in RTL
   * without the sign of the axis appearing anywhere.
   */
  const press = useRef<{ timer: number; x: number; y: number; id: number } | null>(null);
  const reduced = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nearestDot = (clientX: number) => {
    const row = dots.current;
    if (!row) return at;
    let best = at, gap = Infinity;
    [...row.querySelectorAll('.deck-dot')].forEach((d, i) => {
      const r = d.getBoundingClientRect();
      const g = Math.abs(clientX - (r.left + r.width / 2));
      if (g < gap) { gap = g; best = i; }
    });
    return best;
  };

  /**
   * Release. The mode ends with the finger, so there is nothing to dismiss and
   * nothing can be left switched on.
   *
   * The landing is where the scrub is committed: under reduced motion the track
   * did not follow the finger at all, so this is the jump; under ordinary
   * motion the track is already there and the scroll is a no-op. Either way the
   * hash is written here rather than by the scroll handler, which deliberately
   * stays quiet while the deck is driving itself.
   */
  const endPress = useCallback(() => {
    if (press.current) { clearTimeout(press.current.timer); press.current = null; }
    // Read the live flag, and do the work here rather than inside a setState
    // updater. React runs an updater during the render phase, where touching
    // history is touching another component's state: Next patches pushState to
    // sync its Router, so the deck was updating the Router while rendering
    // itself. The warning named the line; the cause was the shape.
    if (!armedRef.current) return;
    armedRef.current = false;
    setArmed(false);
    const i = atRef.current;
    scrollTo(i, false);
    writeHash(i, null);
  }, [scrollTo, writeHash]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = e.pointerId;
    const timer = window.setTimeout(() => {
      armedRef.current = true;
      setArmed(true);
      dots.current?.setPointerCapture?.(id);
    }, 400);
    press.current = { timer, x: e.clientX, y: e.clientY, id };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    // Before arming, a finger that travels is a swipe and not a press.
    if (p && !armedRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.timer); press.current = null; }
      return;
    }
    if (!armedRef.current) return;
    e.preventDefault();
    const i = nearestDot(e.clientX);
    if (i === atRef.current) return;
    // Reduced motion: no live scrub of the page, only the landing on release.
    // The dots still follow the finger - the dim and the moving dot are the
    // only feedback there is, since Safari has no haptics API.
    atRef.current = i;
    if (reduced()) setAt(i);
    else scrollTo(i, false);
  };

  const onPointerUp = () => endPress();

  useEffect(() => {
    if (!armed) return;
    const stop = () => endPress();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [armed, endPress]);

  /* -------------------------------------------------------------- footer */
  // §3's table. The two ends are bare on one side each: slide 2 carries no
  // previous-slide label because the item page does not refer back to the gate,
  // and the last slide carries no next label because there is nothing after it.
  // On the gate both slots are its own: the swipe hint, and the photo credit
  // that arrives with the photograph in Phase 3.
  const onGate = at === 0;
  const prev = onGate
    ? <span className="deck-hint">החליקו לצדדים</span>
    : at === 1
      ? null
      : <a className="deck-link" href={hashFor(at - 1, null)} onClick={(e) => { e.preventDefault(); go(at - 1); }}>
          <Chevron d={CHEVRON.right} />{SLIDES[at - 1].he}
        </a>;
  const next = onGate
    ? <span className="deck-credit">{credit ?? ''}</span>
    : at < LAST
      ? <a className="deck-link" href={hashFor(at + 1, null)} onClick={(e) => { e.preventDefault(); go(at + 1); }}>
          {SLIDES[at + 1].he}<Chevron d={CHEVRON.left} />
        </a>
      : null;

  return (
    <div
      className="deck"
      data-at={at}
      data-armed={armed ? '' : undefined}
      role="region"
      aria-roledescription="מצגת"
      aria-label="הכשל, שקופית אחר שקופית"
      tabIndex={-1}
      onKeyDown={onKey}
    >
      {ground && <div className="deck-ground" aria-hidden="true">{ground}</div>}

      {/* §3: one path, top right, never split across two corners. */}
      <nav className="deck-crumbs" aria-label="מיקום" ref={crumbBar}>
        {crumbs.ancestors.map((a) => (
          <span key={a}>{a}<i aria-hidden="true">›</i></span>
        ))}
        <b>{crumbs.leaf}</b>
      </nav>

      <div className="deck-track" ref={track} dir="rtl">
        {SLIDES.map((s, i) => (
          <section
            key={s.n}
            className="deck-slide"
            id={`slide-${s.n}`}
            aria-label={`${s.n} מתוך ${SLIDES.length} · ${s.he}`}
            aria-current={i === at ? 'true' : undefined}
          >
            {slides?.[i] ?? (
              // Not built yet: the slide names itself, as every slide did in
              // Phase 2 while the frame was being judged on its own.
              <div className="deck-placeholder">
                <span className="deck-placeholder-n">{s.n}</span>
                <span className="deck-placeholder-he">{s.he}</span>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* §3: six dots, first slide rightmost, and no numeric counter anywhere -
          the dots are the counter. The row is also jump mode's strip. */}
      <div className="deck-bottom" ref={bottom}>
      <div
        className="deck-dots"
        ref={dots}
        role="tablist"
        aria-label="שקופיות"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => { if (armedRef.current) e.preventDefault(); }}
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.n}
            type="button"
            className="deck-dot"
            role="tab"
            aria-selected={i === at}
            aria-controls={`slide-${s.n}`}
            data-on={i === at ? '' : undefined}
            onClick={() => go(i)}
          >
            <span className="deck-sr">{s.he}</span>
          </button>
        ))}
      </div>

      <footer className="deck-foot">
        <div className="deck-prev">{prev}</div>
        {/* §3's centre slot carries ↑↓ שלבים on slides 3 and 4, and only when
            that stack holds more than one page. The stack is Phase 5, so the
            slot is held open and empty rather than filled with a guess. */}
        <div className="deck-mid">{mid?.[at] ?? null}</div>
        <div className="deck-next">{next}</div>
      </footer>
      </div>
    </div>
  );
}
