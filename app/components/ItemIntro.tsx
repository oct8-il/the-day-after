'use client';

import { useEffect } from 'react';

declare global {
  interface Window { itemIntroRevealUpTo?: ((n: number) => void) | null }
}

/**
 * The first drill-down into a failure, once per reader.
 *
 * The evidence rolls in; the map waits until the reader has actually scrolled
 * to it; the later chapters do not exist until the reader reaches the bottom of
 * the one before, so each is met on its own. In chapter 2 the ladder climbs one
 * stage at a time to where the sources put it, and the full ledger opens itself
 * when the reader arrives at it.
 *
 * A port of the prototype's runItemIntro, minus the parts that animate the vote.
 * Nothing here runs for a reader who has asked for reduced motion or who has
 * read an item before, and nothing here gates content for them either: the page
 * is complete in the HTML, and this only choreographs how it is met.
 */
export function ItemIntro({
  stage, peak, stages,
}: {
  stage: number;
  peak: number;
  stages: { n: number; he: string; color: string }[];
}) {
  useEffect(() => {
    const seen = (() => { try { return localStorage.getItem('hy_item_intro') === '1'; } catch { return true; } })();
    if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try { localStorage.setItem('hy_item_intro', '1'); } catch {}

    const story = document.querySelector('.story');
    if (!story) return;
    const [c1, c2, c3, c4] = [...story.querySelectorAll<HTMLElement>('section.chap')];
    if (!c1 || !c2 || !c3) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const observers: IntersectionObserver[] = [];
    const later = (f: () => void, ms: number) => timers.push(setTimeout(f, ms));
    const hold = (x?: Element | null) => x?.classList.add('hold');
    const unhold = (x?: Element | null) => x?.classList.remove('hold');
    const meta = (n: number) => stages.find((s) => s.n === n)!;

    const hint = document.createElement('div');
    hint.className = 'morehint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = 'המשך ↓';

    let done = false;
    let next = 2;
    const complete: Record<number, boolean> = { 1: false, 2: false, 3: false };

    /**
     * Fires once the element's top has passed the lower third of the viewport -
     * the reader has really arrived at it.
     *
     * Deliberately not an IntersectionObserver. A reader who jumps to the
     * bottom of the page, or arrives on a hash, can take an element from below
     * the viewport to above it inside one frame, and an observer that only
     * reports intersection then never fires at all - leaving whatever it was
     * guarding hidden for good. This asks a simpler question, "is it at or
     * above the line", which is true whether the reader arrived at it or shot
     * past it.
     */
    const watchers: (() => void)[] = [];
    const whenReached = (el: Element | null | undefined, f: () => void) => {
      if (!el) { f(); return; }
      let fired = false;
      const check = () => {
        if (fired || done) return;
        const top = el.getBoundingClientRect().top;
        // "Reached" is the top passing the lower third - or the page having no
        // more scroll to give. A short chapter can leave an element permanently
        // below the line, and waiting for a scroll that cannot happen is how a
        // sequence stalls with content still hidden.
        const atBottom =
          window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        if (top < window.innerHeight * 0.68 || (atBottom && top < window.innerHeight)) {
          fired = true;
          f();
        }
      };
      watchers.push(check);
      check();
    };

    /**
     * Tear the sequence down and leave the page whole. Choreography must never
     * be the reason a reader cannot see something, so every gate and every hold
     * comes off here - on unmount, on the safety timeout, and any other way out.
     */
    const stop = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      clearInterval(ticker);
      observers.forEach((o) => o.disconnect());
      story.querySelectorAll('.gate').forEach((x) => x.classList.remove('gate'));
      story.querySelectorAll('.hold').forEach((x) => x.classList.remove('hold'));
      hint.remove();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('touchmove', onScroll);
      window.itemIntroRevealUpTo = null;
    };

    const finish = (n: number) => { complete[n] = true; later(pump, 50); };

    // ---- chapter 1: the evidence rolls in; the map waits for the scroll ----
    const evidence = [...c1.querySelectorAll<HTMLElement>('.ev li')];
    const STEP = 280;
    evidence.forEach((li, k) => {
      li.classList.add('roll');
      li.style.setProperty('--d', `${((k * STEP) / 1000).toFixed(2)}s`);
    });
    const mapBlock = c1.querySelector('.evmap')?.closest('.block');
    if (mapBlock) {
      hold(mapBlock);
      later(() => whenReached(mapBlock, () => {
        unhold(mapBlock);
        mapBlock.classList.add('chapin');
        later(() => finish(1), 700);
      }), evidence.length * STEP);
    } else {
      later(() => finish(1), evidence.length * STEP + 300);
    }

    // ---- the later chapters do not exist yet ----
    for (const c of [c2, c3, c4]) c?.classList.add('gate');
    later(() => { if (!done && next <= 3) document.body.append(hint); }, evidence.length * STEP + 400);

    const nearEnd = () =>
      window.scrollY + window.innerHeight > document.documentElement.scrollHeight - window.innerHeight * 0.35;

    let ticking = false;
    function onScroll() {
      if (done || ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; pump(); });
    }

    /**
     * Advance the sequence. Driven by scroll, but also by a slow ticker,
     * because revealing a chapter changes the layout underneath a reader who
     * may already be at the bottom of the page and therefore scrolling no
     * further - no scroll event, no progress, and a chapter left half drawn.
     */
    function pump() {
      if (done) return;
      for (const w of [...watchers]) w();
      if (next <= 3 && complete[next - 1] && nearEnd()) reveal(next);
    }
    const ticker = setInterval(pump, 250);

    function reveal(n: number, force = false) {
      if (n !== next) return;
      if (!force && !complete[n - 1]) return;
      next = n + 1;
      const c = n === 2 ? c2 : c3;
      if (!c) return;
      c.classList.remove('gate');
      c.classList.add('chapin');
      if (n === 2) armClimb();
      else { c4?.classList.remove('gate'); finish(3); }
      if (next > 3) later(() => hint.remove(), 300);
    }

    // ---- chapter 2: the ladder climbs when the reader reaches it ----
    function armClimb() {
      const row = c2.querySelector<HTMLElement>('.stagerow');
      const ladder = c2.querySelector('.ladder');
      const rungs = [...c2.querySelectorAll<HTMLElement>('.ladder span')];
      if (!row) { finish(2); return; }

      const big = row.children[0] as HTMLElement;
      const name = row.children[1] as HTMLElement;
      const chip = row.children[2] as HTMLElement | undefined;
      const rest = [...c2.children].filter(
        (x) => x !== row && x !== ladder && !x.classList.contains('eyebrow')
          && x.tagName !== 'H3' && !x.classList.contains('chaplead'),
      );

      rest.forEach(hold);
      if (chip) hold(chip);
      rungs.forEach((sp) => { sp.classList.remove('on'); sp.style.background = ''; });
      big.textContent = '·';
      name.textContent = '';

      const setStage = (k: number) => {
        big.textContent = String(k);
        name.textContent = meta(k).he;
        name.style.color = meta(k).color;
        big.style.color = meta(k).color;
      };

      whenReached(ladder, () => {
        let t = 400;
        const STEPMS = 460;
        for (let k = 1; k <= peak; k++) {
          later(() => {
            setStage(k);
            rungs[k - 1].style.background = meta(k).color;
            rungs[k - 1].classList.add('on');
          }, t);
          t += STEPMS;
        }
        if (stage === 6) {
          t += 500;
          later(() => {
            rungs.forEach((sp, k) => { if (k < 5) { sp.classList.remove('on'); sp.style.background = ''; } });
            setStage(6);
            rungs[5].style.background = meta(6).color;
            rungs[5].classList.add('on');
          }, t);
          t += STEPMS;
        }
        later(() => {
          rungs.forEach((sp) => { sp.style.background = ''; });
          big.style.color = '';
          name.style.color = meta(stage).color;
          if (chip) { unhold(chip); chip.classList.add('popin'); }
          rest.forEach((x, k) => {
            unhold(x);
            x.classList.add('roll');
            (x as HTMLElement).style.setProperty('--d', `${(k * 0.25).toFixed(2)}s`);
          });
          later(() => finish(2), rest.length * 250 + 500);
        }, t + 300);

        // the full ledger opens itself when the reader reaches it
        const ledger = [...c2.querySelectorAll<HTMLDetailsElement>('details.trace')].pop();
        if (ledger) {
          later(() => whenReached(ledger, () => {
            if (!ledger.open) { ledger.classList.add('autoopen'); ledger.open = true; }
          }), t + 600);
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('touchmove', onScroll, { passive: true });
    // The chapter rail can jump ahead of the sequence; it must not land on a
    // chapter that has not been revealed yet.
    window.itemIntroRevealUpTo = (n: number) => { while (!done && next <= n) reveal(next, true); };

    // Last resort. If anything about the sequence goes wrong - an element that
    // never scrolls into view, a timer that never lands - the page returns to
    // being an ordinary page rather than a half-drawn one.
    later(stop, 90_000);

    return stop;
  }, [stage, peak, stages]);

  return null;
}
