'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

export function Deck({ crumbs }: { crumbs: { ancestors: string[]; leaf: string } }) {
  const track = useRef<HTMLDivElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [armed, setArmed] = useState(false);
  /** The live index, for the handlers that a scrub re-enters faster than React
   *  re-subscribes them. Kept in step with `at` by every setter below. */
  const atRef = useRef(0);

  /**
   * Whether the deck has already put its one entry on the history stack. Reset
   * by popstate: a Back that pops our entry leaves the stack as it was on
   * arrival, and the next move is a first move again.
   */
  const pushed = useRef(false);
  /** The slide the reader arrived on. Returning to it is a Back, not a write. */
  const entrySlide = useRef(0);
  /** Set while we are moving the track ourselves, so the scroll handler does
   *  not write a hash for a position the hash already caused. */
  const driving = useRef(false);

  /** Scroll the track to a slide. RTL runs scrollLeft negative in most engines,
   *  so the sign comes from the computed direction rather than an assumption. */
  const scrollTo = useCallback((i: number, smooth: boolean) => {
    const el = track.current;
    if (!el) return;
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
    const left = dir * i * el.clientWidth;
    driving.current = true;
    if (smooth) el.scrollTo({ left, behavior: 'smooth' });
    else el.scrollLeft = left;
    atRef.current = i;
    setAt(i);
    window.setTimeout(() => { driving.current = false; }, smooth ? 420 : 60);
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

  /* --------------------------------------------------- following the finger */
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let queued = false;
    const read = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const i = Math.min(LAST, Math.max(0, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
        atRef.current = i;
        setAt(i);
        if (!driving.current) writeHash(i, null);
      });
    };
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [writeHash]);

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
    setArmed((was) => {
      if (was) {
        const i = atRef.current;
        scrollTo(i, false);
        writeHash(i, null);
      }
      return false;
    });
  }, [scrollTo, writeHash]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = e.pointerId;
    const timer = window.setTimeout(() => {
      setArmed(true);
      dots.current?.setPointerCapture?.(id);
    }, 400);
    press.current = { timer, x: e.clientX, y: e.clientY, id };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    // Before arming, a finger that travels is a swipe and not a press.
    if (p && !armed) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { clearTimeout(p.timer); press.current = null; }
      return;
    }
    if (!armed) return;
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
    ? <span className="deck-credit" />
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
      {/* §3: one path, top right, never split across two corners. */}
      <nav className="deck-crumbs" aria-label="מיקום">
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
            {/* Phase 2 renders no incident data. Each slide names itself so the
                chrome, the gestures and the history can be judged on their own,
                which is the whole point of taking this phase first. */}
            <div className="deck-placeholder">
              <span className="deck-placeholder-n">{s.n}</span>
              <span className="deck-placeholder-he">{s.he}</span>
            </div>
          </section>
        ))}
      </div>

      {/* §3: six dots, first slide rightmost, and no numeric counter anywhere -
          the dots are the counter. The row is also jump mode's strip. */}
      <div
        className="deck-dots"
        ref={dots}
        role="tablist"
        aria-label="שקופיות"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => { if (armed) e.preventDefault(); }}
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
        <div className="deck-mid" />
        <div className="deck-next">{next}</div>
      </footer>
    </div>
  );
}
