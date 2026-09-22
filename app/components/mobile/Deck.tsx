'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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

/**
 * §3's names, in order - the canonical six. An item does not always have all
 * of them: §7 skips slide 4 for an item at the last stage, which makes that
 * item a five-slide post with five dots. So this is the vocabulary, and the
 * deck's own list is a property of the item.
 */
const ALL = [
  { n: 1, he: 'השער' },
  { n: 2, he: 'סקירת הכשל' },
  { n: 3, he: 'מה נעשה מאז' },
  { n: 4, he: 'מה עוד לא נעשה' },
  { n: 5, he: 'דעת הציבור' },
  { n: 6, he: 'הלאה' },
] as const;

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
 * The slides this item actually has.
 *
 * The hash counts off *this* list, not off the canonical six, so `#4` is
 * "מה עוד לא נעשה" on most items and "דעת הציבור" on one that is at the last
 * stage. Deep links are per item, so nothing breaks - but it is the kind of
 * thing that is better written down than discovered.
 */
export type SlideName = { n: number; he: string };
export const slidesOf = (omit: readonly number[] = []): SlideName[] =>
  ALL.filter((s) => !omit.includes(s.n)).map((s) => ({ n: s.n, he: s.he }));

/**
 * The gate is the bare item URL, never `#1`. §9 wants every shared link to be
 * the bare URL, and a reader who copies what is in the address bar is sharing
 * whatever the deck last wrote there.
 */
const hashFor = (i: number, stage: number | null) =>
  i === 0 && !stage ? '' : `#${i + 1}${stage ? `-s${stage}` : ''}`;

/**
 * How long a photo credit can be before the gate's footer gives it two rows.
 *
 * A measurement rather than a taste: at 10.5px in the footer's left slot about
 * 48 characters fit on one row at 390, and the fixtures sit either side of it -
 * t01's credit is 43 and fits, the three PikiWiki ones are 71 to 78 and do not.
 * Counting characters is the crude version of asking whether it fits, which is
 * what §3 asked for: the alternative is measuring on the client and moving the
 * footer after it has been drawn (DIA-404).
 */
const ONE_ROW = 48;

/**
 * §5's two entrances, in milliseconds, and the same two exits.
 *
 * The fade is short because the reader pressed a button and nothing travels;
 * the cover is long enough to be seen, because a tap on a citation is not a
 * request to change mode and the cover is what says the mode changed.
 *
 * The fade was dropped on 21 September, on the reasoning that it is invisible
 * by construction - the sheet's ground is the slide's ground and it opens with
 * the same lines in the same places. It is back on the 22nd (Roy). Almost
 * nothing is what a deliberate act should cost, and what makes it legible is
 * having the cover to be unlike.
 *
 * The cover is 300 rather than 400: 400 was chosen while the travel still
 * stuttered, because a stutter makes any duration read as a jump. It does not
 * stutter any more - the entrance moves only `transform`, on a sheet that is
 * already laid out and painted (see openSheet) - and at that point 400 was
 * simply long enough to wait through.
 *
 * They are here rather than only in the stylesheet because the exit has to be
 * timed before the sheet is hidden, and two numbers that must agree are
 * better written once.
 */
const FADE = 160;
const COVER = 300;

/**
 * How long a gesture's flight off the screen takes (DIA-427), and how long
 * the card takes to drop back when a swipe up did not reach the sheet.
 */
const FLIGHT = 220;

export function Deck({ crumbs, slides, sheets, mid, omit, credit, ground }: {
  /**
   * §3's path, as three parts rather than a list, because the three behave
   * differently: the root is a link home, the parent is inert until a page
   * exists for it to point at (DIA-400), and only the parent gives way when
   * the path does not fit (DIA-407).
   */
  crumbs: { root: string; parent: string; leaf: string };
  /**
   * The slides that have been built, by index. A hole is a placeholder naming
   * itself, which is how the deck shipped in Phase 2 and how slides 2-6 still
   * stand. They arrive as nodes rather than being imported here because they
   * are server-rendered: the gate is the first thing a reader sees and should
   * not wait for hydration, and this component is a client one.
   */
  slides?: (ReactNode | null)[];
  /**
   * The reading sheets, by slide index (DIA-413).
   *
   * They are rendered beside the track rather than in it, and that is the
   * whole point of the sheet: a plain vertical scroller with no horizontal
   * ancestor. `inert` decides it on its own - it is inherited and cannot be
   * lifted off a subtree, so a sheet inside the track could never be the one
   * surface a screen reader is allowed to see while the deck behind is not.
   * A slide may hand back several: slide 3 has one sheet per stage.
   */
  sheets?: (ReactNode | null)[];
  /**
   * What a slide puts in the middle of the footer, by index. Slides 3 and 4
   * use it for the vertical arrows - §6's route for a reader who does not
   * scroll. It lives here rather than in the slide because the footer is
   * docked chrome and is rendered once, not per slide.
   */
  mid?: (ReactNode | null)[];
  /**
   * Canonical slide numbers this item does not have. §7 omits slide 4 from an
   * item at the last stage: there is no "nothing left" screen, because a slide
   * with nothing to say is not shown.
   */
  omit?: number[];
  /** The gate's photo credit, which §3 gives the footer's left slot on slide 1. */
  credit?: string | null;
  /**
   * The gate's ground. It is rendered inside slide 1 and travels with it, so
   * the photograph leaves with the cover on one clean edge rather than lying
   * behind the whole deck and fading out at the swipe's midpoint (DIA-385).
   * It still covers the whole frame, breadcrumb and footer included, because
   * the track is inset:0 and the chrome overlays it.
   */
  ground?: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const crumbBar = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sheetHost = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  /**
   * Which pair of slides the footer's labels are showing.
   *
   * `floor` of the track's position in slide units, so it changes only where a
   * swipe ends - never under the finger. The pair is [base, base + 1] and the
   * mix between them is `--p` (DIA-401).
   */
  const [base, setBase] = useState(0);
  const baseRef = useRef(0);
  const SLIDES = useMemo(() => slidesOf(omit), [omit]);
  const LAST = SLIDES.length - 1;

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

  /** The frame. Everything the sheet measures is measured against it. */
  const deckEl = () => (crumbBar.current?.parentElement ?? null) as HTMLElement | null;

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
   * showing, and neither has to import the other to agree. The key carries the
   * slide's index - `data-stage2` is slide 3's page, `data-stage3` is slide 4's.
   * One key for all of them read whichever stack mounted last, which since
   * slide 4 arrived is never the slide the reader is on.
   */
  const stageNow = useCallback((i: number) => {
    const d = crumbBar.current?.parentElement as HTMLElement | undefined;
    if (!d) return null;
    const n = Number(d.dataset[`stage${i}`]);
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
   * The source drawer - docs/mobile-item.html §5, DIA-386.
   *
   * A chip opens the evidence under its own passage, on every slide that has
   * chips. It lives here rather than in a slide because it is one interaction
   * shared by three of them, and because "one drawer at a time" and "leaving
   * the slide closes it" are both facts about the deck rather than about any
   * one screen.
   *
   * Delegated: the chips and drawers are server-rendered markup inside slides
   * this component only receives as nodes, so the state is the DOM's.
   */
  useEffect(() => {
    const deck = crumbBar.current?.parentElement as HTMLElement | undefined;
    if (!deck) return;

    const shut = (d: Element) => {
      d.setAttribute('hidden', '');
      deck.querySelector(`[aria-controls="${CSS.escape(d.id)}"]`)?.setAttribute('aria-expanded', 'false');
    };
    const shutAll = () => deck.querySelectorAll('.deck-drawer:not([hidden])').forEach(shut);

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const close = t.closest('.deck-drawer-x');
      if (close) {
        const d = close.closest('.deck-drawer');
        if (d) { shut(d); e.preventDefault(); }
        return;
      }
      // Not the card's copy: that chip carries `data-open` and its
      // aria-controls names a sheet, not a drawer (§5, DIA-413).
      const chip = t.closest<HTMLElement>('button.chip[aria-controls]:not([data-open])');
      if (!chip) return;
      e.preventDefault();

      const d = deck.querySelector<HTMLElement>(`#${CSS.escape(chip.getAttribute('aria-controls')!)}`);
      if (!d) return;
      const wasOpen = !d.hasAttribute('hidden');
      shutAll();
      if (wasOpen) return;

      d.removeAttribute('hidden');
      chip.setAttribute('aria-expanded', 'true');

      // §5: if it would open below the fold the column scrolls the minimum
      // needed to show it, never more, so the passage above stays on screen.
      const box = d.closest<HTMLElement>('.deck-sheet-scroll,.deck-stack');
      if (!box) return;
      const r = d.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const over = r.bottom + 8 - b.bottom;
      if (over <= 0) return;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollBy({ top: Math.min(over, Math.max(0, r.top - b.top)), behavior: still ? 'instant' : 'smooth' });
    };

    deck.addEventListener('click', onClick);
    return () => deck.removeEventListener('click', onClick);
  }, []);

  /** Leaving the slide closes it: an open drawer is a question already answered. */
  useEffect(() => {
    const deck = crumbBar.current?.parentElement as HTMLElement | undefined;
    deck?.querySelectorAll('.deck-drawer:not([hidden])').forEach((d) => {
      d.setAttribute('hidden', '');
      deck.querySelector(`[aria-controls="${CSS.escape(d.id)}"]`)?.setAttribute('aria-expanded', 'false');
    });
  }, [at]);

  /**
   * A slide asking to be left. Slide 4's back pill walks back a slide rather
   * than a page (§7), and the slide it walks to is named by its canonical
   * number, not by an index this deck happens to give it.
   */
  useEffect(() => {
    const onSlide = (e: Event) => {
      const n = (e as CustomEvent<{ to: number }>).detail?.to;
      const i = SLIDES.findIndex((s) => s.n === n);
      if (i >= 0) go(i);
    };
    window.addEventListener('deck:slide', onSlide);
    return () => window.removeEventListener('deck:slide', onSlide);
  }, [SLIDES, go]);

  /**
   * A slide that owns pages moved between them. The deck owns the URL, so it
   * rewrites the tail; the stack only says that there is a new one.
   */
  useEffect(() => {
    const onStage = () => writeHash(atRef.current, stageNow(atRef.current));
    window.addEventListener('deck:stagechange', onStage);
    return () => window.removeEventListener('deck:stagechange', onStage);
  }, [writeHash, stageNow]);

  /* ------------------------------------------------- the chrome's own ink */
  /**
   * The gate is dark in both themes and slides 2-6 follow the theme, so on a
   * light phone one chrome sits over two grounds. §3's answer (DIA-403) is
   * that the ink travels with the cover: the gate's `#e9e6df` while the gate
   * is in view, the theme's by the time slide 2 is, and a mix of the two in
   * between, set by where the track is rather than by a clock. Stop mid-swipe
   * and it holds.
   *
   * On a dark phone the two inks are the same colour, so none of this shows.
   *
   * The property is removed rather than set to the theme's ink past slide 2,
   * so every chrome rule's `var(--ck, var(--text))` falls back to exactly what
   * it read before this existed - which is what keeps slides 2-6 untouched.
   *
   * This is the deck's reading of the track's position between two slides.
   * The footer's label crossfade (DIA-401) wants the same number and should
   * take it from here rather than add a second listener.
   */
  const frame = useCallback(() => {
    const el = track.current;
    const deck = crumbBar.current?.parentElement as HTMLElement | undefined;
    if (!el || !deck) return;
    const one = el.clientWidth || 1;
    // RTL runs scrollLeft negative from 0 at the gate; the sign is the
    // engine's business, so only the distance is read here.
    const f = Math.min(LAST, Math.max(0, Math.abs(el.scrollLeft) / one));
    const soft = !reduced();

    /* The chrome's ink, over the gate and off it (DIA-403). */
    let ck = Math.min(1, f);
    if (!soft) ck = ck > 0.5 ? 1 : 0;
    // Quantised, because a custom property written sixty times a second
    // invalidates style on every frame of a scroll for changes no eye reads.
    const q = Math.round(ck * 50) / 50;
    if (q >= 1) deck.style.removeProperty('--ck');
    else if (q <= 0) deck.style.setProperty('--ck', 'var(--gate-ink)');
    else deck.style.setProperty('--ck', `color-mix(in srgb,var(--text) ${q * 100}%,var(--gate-ink))`);

    /* The footer's labels (DIA-401). The pair on show is the interval the
       track is inside - floor(f) - which changes only where a swipe ends, so
       React re-renders the layers at rest and never mid-gesture. `--p` is the
       mix inside that interval; the two opacities are `--p` and `1 - --p`, so
       they sum to 1 by construction rather than by arithmetic done twice. */
    const b = Math.min(LAST - 1, Math.floor(f));
    if (b !== baseRef.current) { baseRef.current = b; setBase(b); }
    let p = f - b;
    if (!soft) p = p > 0.5 ? 1 : 0;
    const fp = Math.round(Math.min(1, Math.max(0, p)) * 100) / 100;
    foot.current?.style.setProperty('--p', String(fp));
    // §3: the layer above half strength is the one a thumb can reach.
    if (foot.current) foot.current.dataset.lead = fp < 0.5 ? 'a' : 'b';
  }, []);

  useEffect(() => { frame(); }, [frame, at, base]);

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
      // Every scroll, the deck's own included: the ink and the footer's mix
      // are functions of where the track is, not of who moved it.
      frame();
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
  }, [indexNow, settle, scrollTo, frame]);

  /* -------------------------------------------------------------- the nudge */
  /**
   * One nudge, five seconds in, if the reader has not moved (DIA-398).
   *
   * The gate is the front door for someone arriving cold from a post, and a
   * still screen says nothing about which way it opens. So the track slides
   * about 38px toward slide 2 and comes back - enough to show the edge of the
   * next slide and which side it is on.
   *
   * This is the deck's only timer, and it is deliberately not a pacing device:
   * it runs once per page view, never on a return to the gate, never on a deep
   * link that opened elsewhere, and any touch before it fires cancels it for
   * good. A touch while it runs stops it and puts the track back.
   *
   * It moves the track and nothing else. The dots and `data-at` are untouched
   * - 38px is nowhere near the midpoint - and the footer's labels blend with
   * it exactly as they do for any other movement, which is Roy's ruling of
   * 21 September rather than an oversight.
   *
   * Scroll-snap is off while it runs, or the engine pulls against every frame.
   */
  const nudged = useRef(false);
  useEffect(() => {
    const el = track.current;
    // Not on a deep link that opened elsewhere, and not under reduced motion,
    // where the pointing hint carries the job alone.
    if (!el || nudged.current || atRef.current !== 0 || reduced()) return;

    let raf = 0;
    let timer = 0;
    // Whether the animation is actually in flight. Everything below that puts
    // the track back has to ask first: a cancel that fires before the nudge
    // ever ran would yank the track home from wherever the reader had got to
    // by then, which is how the first version of this broke the arrow keys.
    let running = false;
    const snap = el.style.scrollSnapType;
    const home = el.scrollLeft;
    const done = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      el.style.scrollSnapType = snap;
      el.scrollLeft = home;
    };
    // The direction is read off the second slide rather than assumed: in RTL
    // it sits to the left and scrollLeft runs negative, and the sign of that
    // is the engine's business, not this component's.
    const two = el.children[1] as HTMLElement | undefined;
    const dir = two
      ? Math.sign(two.getBoundingClientRect().left - el.getBoundingClientRect().left) || -1
      : -1;

    const run = () => {
      nudged.current = true;
      // "Has done nothing" means the screen has not moved, whoever moved it:
      // a reader who left the gate by the keyboard, by a footer link or by
      // jump mode has found the way on, and a hint after that would fire on
      // whatever slide they are reading. Cancelling on touch alone missed
      // every one of those.
      if (atRef.current !== 0 || Math.abs(el.scrollLeft - home) > 1) return;
      running = true;
      el.style.scrollSnapType = 'none';
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 900);
        // A half-sine: nothing at both ends, 38px at the middle. No easing to
        // tune and no chance of ending anywhere but where it started.
        el.scrollLeft = home + dir * 38 * Math.sin(Math.PI * k);
        if (k < 1) raf = requestAnimationFrame(step);
        else done();
      };
      raf = requestAnimationFrame(step);
    };

    timer = window.setTimeout(run, 5000);

    // Any touch anywhere on the deck, before or during: the reader has found
    // the screen, and a hint after that is noise.
    const stop = () => {
      nudged.current = true;
      clearTimeout(timer);
      done();
    };
    const deck = el.parentElement;
    deck?.addEventListener('pointerdown', stop, { passive: true, capture: true });
    deck?.addEventListener('keydown', stop, { passive: true, capture: true });

    return () => {
      clearTimeout(timer);
      done();
      deck?.removeEventListener('pointerdown', stop, { capture: true } as EventListenerOptions);
      deck?.removeEventListener('keydown', stop, { capture: true } as EventListenerOptions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------- the card and the sheet */
  /**
   * Does the reading fit? (§5, DIA-413.)
   *
   * A card never scrolls, so a reading that overruns is cut with a fade and
   * the button says `יותר מידע` instead of `המקורות`. Which of the two it is
   * is a measurement, not a guess about the text: it is re-taken when the
   * frame changes size and again once the fonts have loaded, because a
   * fallback face and the real one do not wrap in the same place.
   */
  const measure = useCallback(() => {
    deckEl()?.querySelectorAll<HTMLElement>('.deck-card').forEach((card) => {
      const read = card.querySelector<HTMLElement>('.deck-read');
      // A card with no way on is never cut. §7's slide is composed rather than
      // authored and has no sheet, and a fade over a reading that cannot be
      // continued is a promise the page has no way to keep.
      if (!read || !card.querySelector('.deck-more')) { card.removeAttribute('data-cut'); return; }
      if (read.scrollHeight - read.clientHeight > 1) card.setAttribute('data-cut', '');
      else card.removeAttribute('data-cut');
    });
  }, []);

  useEffect(() => {
    measure();
    const deck = deckEl();
    const ro = new ResizeObserver(measure);
    if (deck) ro.observe(deck);
    // A fallback face and the real one do not wrap in the same place, so a
    // reading that fits at first paint may not fit once the font lands.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);

  /**
   * The reading sheet (DIA-413).
   *
   * It is the deck's rather than the slide's because everything it has to get
   * right is the deck's already: one history entry at a time, what the arrow
   * keys do, and which surface a screen reader is allowed to see. The slides
   * only render it (Card.tsx), beside the track rather than inside it.
   *
   * Alignment is measured, not calculated: the bar's height and the body's two
   * gutters are read off the card the sheet belongs to, so every line lands
   * where it was. Arithmetic here would be alignment until someone changes the
   * label - and on slide 3 the column is inset 36px on one side and 20 on the
   * other, so there is no single number to hard-code anyway.
   */
  type Entrance = 'fade' | 'cover' | 'still';
  const sheet = useRef<{ el: HTMLElement; mode: Entrance; opener: HTMLElement | null } | null>(null);
  /** The exit's timer: an entrance that interrupts one must cancel it. */
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * `silent`: the caller is already animating the sheet off the screen and
   * only wants it hidden - a gesture's flight out (DIA-427), which starts
   * from wherever the finger left it and so cannot be an exit animation of
   * ours starting from landed.
   */
  const closeSheet = useCallback((opts?: { history?: boolean; silent?: boolean }) => {
    const open = sheet.current;
    if (!open) return;
    sheet.current = null;
    const deck = deckEl();
    const el = open.el;

    // Closing the sheet closes its drawer: an open drawer is a question the
    // reader has already answered (§5).
    el.querySelectorAll('.deck-drawer:not([hidden])').forEach((d) => {
      d.setAttribute('hidden', '');
      el.querySelector(`[aria-controls="${CSS.escape(d.id)}"]`)?.setAttribute('aria-expanded', 'false');
    });
    deck?.removeAttribute('data-sheet');
    deck?.removeAttribute('data-dim');
    track.current?.removeAttribute('inert');
    // Parked but not yet moving (openSheet's two frames): there is no
    // entrance to reverse, so it is hidden as `still` is.
    const wasPre = (el.getAttribute('data-in') ?? '').startsWith('pre');
    el.removeAttribute('data-in');

    // It leaves the way it came. Under reduced motion both ways are instant,
    // and a gesture has already flown it off the screen itself.
    if (leaving.current) clearTimeout(leaving.current);
    if (open.mode === 'still' || wasPre || opts?.silent) {
      el.setAttribute('hidden', '');
    } else {
      const ms = open.mode === 'cover' ? COVER : FADE;
      el.setAttribute('data-out', open.mode);
      leaving.current = setTimeout(() => {
        el.removeAttribute('data-out');
        el.setAttribute('hidden', '');
        leaving.current = null;
      }, ms);
    }

    open.opener?.focus?.();
    // Give the entry back, so §2's push-once rule is whole again afterwards.
    if ((opts?.history ?? true) && window.history.state?.deckSheet) window.history.back();
  }, []);

  const openSheet = useCallback((
    id: string,
    opener: HTMLElement | null,
    mode: 'fade' | 'cover',
    /**
     * Opened by a finger rather than by a key. Focus still moves into the
     * sheet - a screen reader needs it to - but the × does not paint a focus
     * ring, which is what `:focus-visible` is for and what the engine guesses
     * wrong when the focus is script-driven after a touch (DIA-429).
     */
    quiet?: boolean,
  ) => {
    const deck = deckEl();
    const el = sheetHost.current?.querySelector<HTMLElement>(`#sheet-${CSS.escape(id)}`);
    const card = track.current?.querySelector<HTMLElement>(`.deck-card[data-card="${CSS.escape(id)}"]`);
    if (!deck || !el || !card) return;
    if (leaving.current) { clearTimeout(leaving.current); leaving.current = null; }
    el.removeAttribute('data-out');

    // Where the card's content begins is where the bar has to end, and the
    // card's column is the sheet's column - the locator's gutter included.
    const frame = deck.getBoundingClientRect();
    const first = card.querySelector<HTMLElement>(':scope > :not(.deck-label)') ?? card;
    const box = first.getBoundingClientRect();
    el.style.setProperty('--bar', `${Math.round(box.top - frame.top)}px`);
    el.style.setProperty('--gut-r', `${Math.round(frame.right - box.right)}px`);
    el.style.setProperty('--gut-l', `${Math.round(box.left - frame.left)}px`);

    const how: Entrance = reduced() ? 'still' : mode;
    // The cover does not start on the frame the sheet is unhidden. Unhiding a
    // display:none sheet lays out and paints a screen of reading, and when
    // the animation was applied in that same frame its clock started before
    // the first frame could be drawn - so the first frames were lost to the
    // layout and the sheet appeared already part way up, then stuttered as
    // the paint caught up. Instead: park it laid out below the frame (`pre`,
    // no transition), force the layout now, and start the cover two frames
    // later, once there is a painted sheet for the compositor to move. The
    // parking is the cover's own animation, paused (globals.css): setting a
    // transform here instead would start the pull-back transition under the
    // cover, and the two on one property hitched near the end.
    el.removeAttribute('hidden');
    // Both entrances park first: an opacity ramp whose first frames are eaten
    // by the layout of a screen of reading is as lost as a travel's.
    el.setAttribute('data-in', how === 'still' ? 'still' : how === 'cover' ? 'pre' : 'pre-fade');
    const scroll = el.querySelector<HTMLElement>('.deck-sheet-scroll');
    if (scroll) scroll.scrollTop = 0;

    deck.setAttribute('data-sheet', id);
    if (quiet) el.setAttribute('data-quiet', ''); else el.removeAttribute('data-quiet');
    // The deck behind is not a second reading for a screen reader to find.
    track.current?.setAttribute('inert', '');

    sheet.current = { el, mode: how, opener };
    // preventScroll: the × is inside a frame that clips, and a focus that
    // tried to reveal it would scroll the frame itself.
    const x = el.querySelector<HTMLElement>('.deck-sheet-x');
    window.history.pushState({ ...window.history.state, deckSheet: true }, '');

    if (how === 'still') {
      x?.focus({ preventScroll: true });
      return;
    }
    void el.offsetHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // Closed again before it started: nothing to animate.
      if (sheet.current?.el !== el || !(el.getAttribute('data-in') ?? '').startsWith('pre')) return;
      el.setAttribute('data-in', how);
      // Only the cover dims: a fade the reader asked for announces nothing.
      if (how === 'cover') deck.setAttribute('data-dim', '');
      x?.focus({ preventScroll: true });
    }));
  }, []);

  /** Back closes the sheet and nothing else. */
  useEffect(() => {
    const onPop = () => { if (sheet.current) closeSheet({ history: false }); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [closeSheet]);

  useEffect(() => {
    const deck = deckEl();
    if (!deck) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const btn = t.closest<HTMLElement>('[data-open]');
      if (btn) {
        e.preventDefault();
        // §5's two entrances. The button is a deliberate act and the sheet
        // appears in place; a tap on a citation is not, so the sheet covers
        // from the bottom up - the cover is what says the mode changed.
        // `detail` is 0 when a button was activated from the keyboard, and
        // the count of clicks when it was pressed.
        openSheet(btn.getAttribute('data-open')!, btn, btn.classList.contains('deck-more') ? 'fade' : 'cover', e.detail > 0);
        return;
      }
      if (t.closest('.deck-sheet-x')) { e.preventDefault(); closeSheet(); }
    };
    deck.addEventListener('click', onClick);
    return () => deck.removeEventListener('click', onClick);
  }, [openSheet, closeSheet]);

  /**
   * The sheet under a finger (DIA-427). Four gestures, one model.
   *
   *   1 · a swipe up on the card opens the sheet and keeps scrolling it
   *   2 · a swipe up at the end of the reading closes it
   *   3 · a swipe sideways closes it, from anywhere
   *   4 · a swipe down at the top closes it (what DIA-417 was)
   *
   * Touch events rather than pointer ones throughout: cancelling a scroll
   * needs a non-passive `touchmove`, which is the one listener that can take
   * a gesture back from a scroller. Nothing here is gesture-only - the
   * button, the ×, Escape and Back all still do what they did.
   *
   * Under reduced motion nothing follows the finger. The gestures still
   * count: crossing a threshold closes the sheet, it simply does not travel
   * to get there.
   */

  /**
   * Gesture 1: a swipe up on the card opens the sheet mid-gesture.
   *
   * A touch that began on the slide cannot be handed to the sheet's own
   * scroller once the sheet exists - the browser has already picked what this
   * touch scrolls - so from the moment it opens, this handler *is* the
   * scroller, and a flick on release is integrated here rather than by the
   * engine.
   *
   * It follows the finger's *deltas*. It used to be anchored -
   * `scrollTop = openY - y` - which is the same thing going up and a trap
   * coming back down: the anchor clamps at 0, so a finger that returns below
   * where the sheet opened pins the reading at its top and then does nothing
   * at all, however far it goes. That is DIA-428's "down scrolling stuck
   * after entering from the up swipe": the reading had already been yanked to
   * the top, and there was no way to re-grip it without lifting.
   *
   * Not on a card inside a stack that scrolls: there the vertical axis is the
   * stage stack's, and a slide cannot have two things answering one finger
   * (§6, DIA-416).
   */
  useEffect(() => {
    // On the deck rather than on the track: `openSheet` makes the track inert
    // while this very gesture is still running, and a listener inside an inert
    // subtree is not one to rely on.
    const el = deckEl();
    if (!el) return;
    let sx = 0, sy = 0, lastY = 0;
    let card: HTMLElement | null = null;
    let axis: 'x' | 'y' | null = null;
    let opened = false;
    let hist: [number, number][] = [];
    let raf = 0;

    const scroller = () => sheet.current?.el.querySelector<HTMLElement>('.deck-sheet-scroll') ?? null;

    /** The flick, integrated by hand: px/ms, 16ms a frame, 5% off each one. */
    const flick = (v0: number) => {
      cancelAnimationFrame(raf);
      let v = v0;
      const step = () => {
        const sc = scroller();
        if (!sc) return;
        sc.scrollTop += v * 16;
        v *= 0.95;
        if (Math.abs(v) > 0.02) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const drop = () => {
      if (!card) return;
      const c = card;
      c.removeAttribute('data-lift');
      c.setAttribute('data-drop', '');
      c.style.transform = '';
      setTimeout(() => c.removeAttribute('data-drop'), FLIGHT);
    };

    const start = (e: TouchEvent) => {
      card = null; axis = null; opened = false; hist = [];
      cancelAnimationFrame(raf);
      if (e.touches.length !== 1 || sheet.current) return;
      const t = e.touches[0]!;
      const c = (t.target as HTMLElement | null)?.closest<HTMLElement>('.deck-card[data-card]') ?? null;
      if (!c) return;
      const id = c.getAttribute('data-card')!;
      if (!sheetHost.current?.querySelector(`#sheet-${CSS.escape(id)}`)) return;
      // The stack owns this axis wherever it has somewhere to go.
      const stack = c.closest<HTMLElement>('.deck-stack');
      if (stack && stack.scrollHeight - stack.clientHeight > 1) return;
      card = c; sx = t.clientX; sy = t.clientY;
      c.setAttribute('data-lift', '');
      c.removeAttribute('data-drop');
    };

    const move = (e: TouchEvent) => {
      if (!card) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Vertical has to win clearly: a swipe between slides is the deck's,
        // and it is the gesture a reader makes far more often.
        axis = Math.abs(dy) > Math.abs(dx) * 1.3 ? 'y' : 'x';
      }
      if (axis !== 'y') return;
      if (e.cancelable) e.preventDefault();
      hist.push([performance.now(), t.clientY]);
      if (hist.length > 6) hist.shift();

      if (!opened) {
        if (dy < 0 && !reduced()) card.style.transform = `translateY(${dy * 0.35}px)`;
        if (dy < -40) {
          opened = true;
          lastY = t.clientY;
          card.style.transform = '';
          card.removeAttribute('data-lift');
          openSheet(card.getAttribute('data-card')!, card, 'fade', true);
        }
        return;
      }
      const sc = scroller();
      if (sc) sc.scrollTop -= t.clientY - lastY;
      lastY = t.clientY;
    };

    const end = () => {
      if (!card) return;
      if (opened) {
        // The flick the engine would have given the scroller, had the touch
        // ever belonged to it.
        if (hist.length > 1) {
          const [t0, y0] = hist[0]!;
          const [t1, y1] = hist[hist.length - 1]!;
          const v = (y0 - y1) / Math.max(1, t1 - t0);
          if (Math.abs(v) > 0.1) flick(v);
        }
      } else {
        drop();
      }
      card = null; axis = null; opened = false;
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [openSheet]);

  /**
   * Gestures 2, 3 and 4: the three ways out from inside the sheet.
   *
   * One handler, one mode chosen once per touch and then held. A drag that is
   * none of the three is an ordinary scroll, and the origin is reset on every
   * such move so that a finger which *reaches* the end mid-scroll can still
   * arm the swipe-up without lifting.
   */
  useEffect(() => {
    const host = sheetHost.current;
    if (!host) return;
    let sx = 0, sy = 0, ox = 0, oy = 0;
    let mode: 'x' | 'up' | 'down' | null = null;
    let armed = false;

    const scroller = () => sheet.current?.el.querySelector<HTMLElement>('.deck-sheet-scroll') ?? null;
    const room = (sc: HTMLElement) => sc.scrollHeight - sc.clientHeight;

    const start = (e: TouchEvent) => {
      mode = null;
      armed = false;
      if (e.touches.length !== 1 || !sheet.current) return;
      // The carousel is the one thing in here with an axis of its own.
      if ((e.touches[0]!.target as HTMLElement | null)?.closest('.deck-ov-sources')) return;
      sx = e.touches[0]!.clientX; sy = e.touches[0]!.clientY;
      armed = true;
    };

    const move = (e: TouchEvent) => {
      if (!armed) return;
      const open = sheet.current;
      const sc = scroller();
      const t = e.touches[0];
      if (!open || !sc || !t) return;
      const x = t.clientX, y = t.clientY;
      const dx = x - sx, dy = y - sy;

      if (!mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.4) { mode = 'x'; ox = x; }
        else if (dy < 0 && sc.scrollTop >= room(sc) - 1) { mode = 'up'; oy = y; }
        else if (dy > 0 && sc.scrollTop <= 0) { mode = 'down'; oy = y; }
        else {
          // An ordinary scroll. Re-origin, so that arriving at the end or the
          // top during this same touch still arms a gesture.
          sx = x; sy = y;
          return;
        }
        open.el.setAttribute('data-drag', '');
      }
      if (e.cancelable) e.preventDefault();
      if (reduced()) return;

      const el = open.el;
      if (mode === 'x') {
        const d = x - ox;
        el.style.transform = `translateX(${d}px)`;
        el.style.opacity = String(Math.max(0, 1 - Math.abs(d) / 200));
      } else if (mode === 'up') {
        const d = Math.min(0, y - oy);
        el.style.transform = `translateY(${d * 0.6}px)`;
        el.style.opacity = String(Math.max(0, 1 + d / 180));
      } else {
        // Down is 1:1 and does not fade: this is the cover leaving the way
        // it came.
        el.style.transform = `translateY(${Math.max(0, y - oy)}px)`;
      }
    };

    const end = (e: TouchEvent) => {
      if (!armed) return;
      armed = false;
      const open = sheet.current;
      const was = mode;
      mode = null;
      if (!open || !was) return;
      const el = open.el;
      const t = e.changedTouches[0];
      const dx = (t?.clientX ?? ox) - ox;
      const dy = (t?.clientY ?? oy) - oy;

      const go = was === 'x' ? Math.abs(dx) > 90 : was === 'up' ? dy < -90 : dy > 110;
      const clear = () => { el.style.transform = ''; el.style.opacity = ''; };

      if (!go) {
        // Short of it: clearing what the finger wrote is the spring back.
        el.removeAttribute('data-drag');
        clear();
        return;
      }
      if (reduced()) { el.removeAttribute('data-drag'); clear(); closeSheet(); return; }

      // Past it: out the way it was going, and hidden when it arrives.
      el.removeAttribute('data-drag');
      el.setAttribute('data-go', '');
      if (was === 'x') { el.style.transform = `translateX(${dx < 0 ? -220 : 220}px)`; el.style.opacity = '0'; }
      else if (was === 'up') { el.style.transform = 'translateY(-140px)'; el.style.opacity = '0'; }
      else { el.style.transform = 'translateY(100%)'; }
      setTimeout(() => {
        closeSheet({ silent: true });
        el.removeAttribute('data-go');
        clear();
      }, FLIGHT);
    };

    host.addEventListener('touchstart', start, { passive: true });
    host.addEventListener('touchmove', move, { passive: false });
    host.addEventListener('touchend', end);
    host.addEventListener('touchcancel', end);
    return () => {
      host.removeEventListener('touchstart', start);
      host.removeEventListener('touchmove', move);
      host.removeEventListener('touchend', end);
      host.removeEventListener('touchcancel', end);
    };
  }, [closeSheet]);

  /* ---------------------------------------------------------- arrow keys */
  // §11: arrow keys on a hardware keyboard. The mapping is spatial, so in this
  // RTL frame ArrowLeft goes forward - the next slide is the one to the left.
  const onKey = (e: React.KeyboardEvent) => {
    // A key is used: the sheet is being driven from a keyboard after all, so
    // the × may paint its ring again (DIA-429).
    sheet.current?.el.removeAttribute('data-quiet');
    // While the sheet is open the deck is not what the keyboard is talking to.
    if (sheet.current) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
      return;
    }
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
  /** The slide the reader armed on, which is where abandoning puts them back. */
  const origin = useRef(0);
  /** Above the strip by enough to mean "not this after all" (§3, DIA-399). */
  const OUT = 70;
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const [label, setLabel] = useState<string | null>(null);
  const reduced = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Hold the dot under the thumb still while the row opens around it.
   *
   * §3's strip goes from a 13px pitch to 30px. A dot `i` sits `(i - c) × pitch`
   * from the row's centre, where `c` is the middle index - 2.5 on a six-slide
   * deck, 2 on a five-slide one, which is why the number is derived and not
   * written down. Widening moves it by `(i - c) × (30 - 13)`, so the row is
   * translated back by exactly that. The sign is the axis's: in RTL the dots
   * run leftwards from the first, so the shift is positive x.
   */
  const spread = (i: number) => {
    const row = dots.current;
    if (!row) return;
    const c = (SLIDES.length - 1) / 2;
    row.style.setProperty('--shift', `${(i - c) * (30 - 13)}px`);
  };

  /**
   * Put the label over the dot it names, and keep it inside the frame.
   *
   * Measured rather than computed: by the time a dot is being scrubbed the row
   * has finished opening, so its position is a fact. The clamp is what stops
   * the first and last dots pushing the pill off the screen.
   */
  const place = (i: number) => {
    const row = dots.current;
    const deck = crumbBar.current?.parentElement as HTMLElement | undefined;
    const dot = row?.querySelectorAll('.deck-dot')[i] as HTMLElement | undefined;
    if (!row || !deck || !dot) return;
    const r = dot.getBoundingClientRect();
    const f = deck.getBoundingClientRect();
    deck.style.setProperty('--lx', `${Math.round(r.left + r.width / 2 - f.left)}px`);
  };

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
    setLabel(null);
    dots.current?.style.removeProperty('--shift');
    // Abandoned: the reader took the finger up above the strip, so the deck
    // goes back to the slide they armed on and the URL is not touched. It is
    // not a landing, so there is nothing to record.
    if (awayRef.current) {
      awayRef.current = false;
      setAway(false);
      const home = origin.current;
      atRef.current = home;
      setAt(home);
      scrollTo(home, false);
      return;
    }
    const i = atRef.current;
    scrollTo(i, false);
    writeHash(i, null);
  }, [scrollTo, writeHash]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = e.pointerId;
    // Read off the event now rather than inside the timer: the press's own x
    // is what the row has to open around, 400ms later.
    const x = e.clientX;
    const timer = window.setTimeout(() => {
      armedRef.current = true;
      origin.current = atRef.current;
      setArmed(true);
      // The strip opens around the dot under the thumb, which is not always
      // the slide being read: a reader can press anywhere on the row. So the
      // held dot is adopted here the way a move would adopt it - otherwise
      // the label names one slide and a release lands on another, and the
      // row's shift is computed about the wrong dot.
      const held = nearestDot(x);
      if (held !== atRef.current) {
        atRef.current = held;
        if (reduced()) setAt(held); else scrollTo(held, false);
      }
      // The strip opens around whichever dot the thumb is on, so that dot has
      // to stay under it: the row is shifted by as much as the widening moved
      // it (DIA-399). Computed rather than measured, because at the moment it
      // is needed the gap is mid-transition and a measurement would read the
      // closed row or something in between.
      spread(held);
      setLabel(SLIDES[held]?.he ?? null);
      place(held);
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

    // Up is out. Far enough above the strip and the jump is abandoned: the
    // deck goes back to where it was armed, the strip closes, and the label
    // says what releasing will do. Coming back down resumes the scrub, so a
    // reader can change their mind about changing their mind.
    const row = dots.current?.getBoundingClientRect();
    const out = !!row && row.top - e.clientY >= OUT;
    if (out !== awayRef.current) {
      awayRef.current = out;
      setAway(out);
      if (out) {
        setLabel('שחררו לביטול');
        const home = origin.current;
        atRef.current = home;
        if (reduced()) setAt(home); else scrollTo(home, false);
      } else {
        spread(atRef.current);
        setLabel(SLIDES[atRef.current]?.he ?? null);
      }
    }
    if (out) return;

    const i = nearestDot(e.clientX);
    if (i === atRef.current) return;
    setLabel(SLIDES[i]?.he ?? null);
    // The label follows the dot it names, clamped inside the frame.
    place(i);
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
  //
  // Both are functions of a slide index rather than of `at`, because the
  // footer shows two slides at once while a swipe is in flight (DIA-401): the
  // labels of the slide being left and of the one being arrived at, mixed by
  // where the track is.
  const prevFor = (i: number) =>
    i === 0
      // §3: the hint points at where the next slide is, with the same chevron
      // the next-slide links carry - drawn as a path, because a character
      // would be mirrored by the bidi algorithm (DIA-398).
      ? <span className="deck-hint">החליקו להמשך<Chevron d={CHEVRON.left} /></span>
      : i === 1
        ? null
        : <a className="deck-link" href={hashFor(i - 1, null)} onClick={(e) => { e.preventDefault(); go(i - 1); }}>
            <Chevron d={CHEVRON.right} />{SLIDES[i - 1]!.he}
          </a>;
  const nextFor = (i: number) =>
    i === 0
      ? <span className="deck-credit" data-rows={credit && credit.length > ONE_ROW ? '2' : undefined}>{credit ?? ''}</span>
      : i < LAST
        ? <a className="deck-link" href={hashFor(i + 1, null)} onClick={(e) => { e.preventDefault(); go(i + 1); }}>
            {SLIDES[i + 1]!.he}<Chevron d={CHEVRON.left} />
          </a>
        : null;

  return (
    <div
      className="deck"
      data-at={at}
      data-armed={armed ? '' : undefined}
      data-away={away ? '' : undefined}
      role="region"
      aria-roledescription="מצגת"
      aria-label="הכשל, שקופית אחר שקופית"
      tabIndex={-1}
      onKeyDown={onKey}
    >
      {/* §3: one path, top right, never split across two corners.
          The chevrons are the nav's own rather than each crumb's, so the
          parent can be truncated without taking its separator with it. */}
      <nav className="deck-crumbs" aria-label="מיקום" ref={crumbBar}>
        <a className="deck-crumb-root" href="/">{crumbs.root}</a>
        <i aria-hidden="true">›</i>
        {/* Inert on purpose: there is no category page yet, and a crumb that
            looks tappable and does nothing is worse than one that does not
            (DIA-400). The full name is the element's text - the shortening is
            CSS - so a screen reader reads it whole whatever the width. */}
        <span className="deck-crumb-mid" title={crumbs.parent}>{crumbs.parent}</span>
        <i aria-hidden="true">›</i>
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
            {s.n === 1 && ground ? (
              <div className="deck-ground" aria-hidden="true">{ground}</div>
            ) : null}
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

      {/* The reading sheets, above the track and outside it (§5, DIA-413).
          A sheet inside the horizontal scroller is the crossing every fault
          of these screens came from, and `inert` is inherited: the track
          cannot be made invisible to a screen reader while something inside
          it stays visible. The dim comes up with the cover and un-fades with
          a pull. */}
      <div className="deck-sheets" ref={sheetHost}>
        <div className="deck-dim" aria-hidden="true" />
        {sheets}
      </div>

      {/* §3: six dots, first slide rightmost, and no numeric counter anywhere -
          the dots are the counter. The row is also jump mode's strip. */}
      <div className="deck-bottom" ref={bottom}>
      {/* §3: while the strip is armed, a pill above it names where releasing
          will land - the slide's name and nothing else, since the dots are
          still the counter. It is above the strip because the thumb is on it
          (DIA-399). */}
      {label !== null && <div className="deck-jump" aria-hidden="true">{label}</div>}
      {/* Not six buttons: §3 says neither strip is tappable, because a dot is
          6px and the rungs are 5px - under any touch target worth offering -
          and a long press is what both of them take instead. So the row is a
          counter that jump mode happens to press on, and it is presentational:
          tab roles whose activation does nothing are worse than no roles, and
          the count it carries is already in each slide's own label. Every
          route it briefly offered is still there - the footer's links, the
          arrow keys, a swipe, a deep link (DIA-397). */}
      <div
        className="deck-dots"
        ref={dots}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => { if (armedRef.current) e.preventDefault(); }}
      >
        {SLIDES.map((s, i) => (
          <span key={s.n} className="deck-dot" data-on={i === at ? '' : undefined} />
        ))}
      </div>

      {/* Each side slot holds two layers in one cell - the slide being left and
          the one being arrived at - and the deck sets their mix from the
          track's position. The cell is as wide as the wider of the two, so
          nothing in the row moves while they trade places (DIA-401). */}
      <footer className="deck-foot" ref={foot}>
        <div className="deck-prev">
          <span className="deck-lyr" data-lyr="a">{prevFor(base)}</span>
          <span className="deck-lyr" data-lyr="b">{prevFor(base + 1)}</span>
        </div>
        {/* §3's centre slot carries ↑↓ שלבים on slides 3 and 4, and only when
            that stack holds more than one page. It is the stack's own control
            rather than a label about a neighbour, so it does not cross-fade:
            it belongs to the slide the reader is on. */}
        <div className="deck-mid">{mid?.[at] ?? null}</div>
        <div className="deck-next">
          <span className="deck-lyr" data-lyr="a">{nextFor(base)}</span>
          <span className="deck-lyr" data-lyr="b">{nextFor(base + 1)}</span>
        </div>
      </footer>
      </div>
    </div>
  );
}
