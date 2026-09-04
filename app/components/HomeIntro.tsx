'use client';

import { useEffect } from 'react';
import { daysSince } from '@/lib/days';

declare global {
  interface Window { __hyRedirecting?: boolean }
}

/**
 * The opening sequence, on a reader's first visit only.
 *
 * The strip lifts to the middle of the screen and its four rubrics roll in one
 * after another, each counting its own numbers up as it arrives; then the strip
 * settles into place and the grid comes in behind it. The point is that the
 * four numbers are read before the map is, which is the order the argument
 * needs.
 *
 * A port of the prototype's runHomeIntro. Two things it also owns: the day
 * count, which a static build bakes in and which must be corrected in the
 * reader's browser, and the promise that none of this runs for anyone who has
 * asked for reduced motion, or who has been here before.
 *
 * A third guard exists only in the port: a first-time visitor's very first
 * load of "/" can hydrate this page for a moment before the first-visit
 * gate's redirect to about actually takes over the tab (see layout.tsx). If
 * this ran then, it would burn the reader's one-time animation on a page
 * they never actually saw, and it would never play when they arrived at the
 * matrix for real. __hyRedirecting, set synchronously by that gate script,
 * says a redirect is already under way.
 */
export function HomeIntro() {
  useEffect(() => {
    if (window.__hyRedirecting) return;
    const strip = document.querySelector<HTMLElement>('.strip');
    if (!strip) return;

    // The day count first, whether or not the sequence runs: a wrong number is
    // worse than a still one.
    const dayNode = strip.querySelector<HTMLElement>('.days .v')?.firstChild;
    if (dayNode) dayNode.textContent = daysSince().toLocaleString('he-IL');

    const seen = (() => { try { return localStorage.getItem('hy_home_intro') === '1'; } catch { return true; } })();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (seen || reduced) return;
    try { localStorage.setItem('hy_home_intro', '1'); } catch {}

    const head = document.querySelector<HTMLElement>('.pagehead');
    const matrix = document.querySelector<HTMLElement>('.matrix');
    if (!head || !matrix) return;

    head.classList.add('prehide');
    matrix.classList.add('prehide');

    const r = strip.getBoundingClientRect();
    const scale = Math.min(1.3, (window.innerWidth - 48) / r.width);
    const ty = window.innerHeight / 2 - (r.top + (r.height * scale) / 2);
    strip.style.transform = `translateY(${ty}px) scale(${scale})`;
    strip.style.opacity = '1';

    const CELL_GAP = 1600, CELL_DUR = 1900, COUNT_DUR = 1500;
    const cells = [...strip.children] as HTMLElement[];

    const numbers = cells.map((cell) => {
      const list: { node: ChildNode; target: number }[] = [];
      const add = (node: ChildNode | null | undefined) => {
        if (!node) return;
        const t = parseInt((node.textContent ?? '').replace(/\D/g, ''), 10);
        if (!Number.isNaN(t)) list.push({ node, target: t });
      };
      cell.querySelectorAll('.v').forEach((v) => add(v.firstChild));
      cell.querySelectorAll('#pcount').forEach((p) => add(p.firstChild));
      cell.querySelectorAll('.ladder6 .c').forEach((c) => add(c.firstChild));
      return list;
    });

    for (const c of cells) {
      c.style.transition = 'none';
      c.style.opacity = '0';
      c.style.transform = 'translateY(14px)';
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (f: () => void, ms: number) => timers.push(setTimeout(f, ms));

    const revealCell = (i: number) => {
      const cell = cells[i];
      requestAnimationFrame(() => {
        cell.style.transition = `opacity ${CELL_DUR}ms ease, transform ${CELL_DUR}ms cubic-bezier(.2,.7,.15,1)`;
        cell.style.opacity = '1';
        cell.style.transform = 'none';
      });
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / COUNT_DUR);
        const eased = 1 - Math.pow(1 - k, 3);
        for (const { node, target } of numbers[i]) {
          node.textContent = Math.round(target * eased).toLocaleString('he-IL');
        }
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    cells.forEach((_, i) => later(() => revealCell(i), i * CELL_GAP));

    const moveStart = (cells.length - 1) * CELL_GAP + Math.max(CELL_DUR, COUNT_DUR) + 700;
    const moveEnd = moveStart + 1150;

    later(() => {
      strip.style.transition = 'transform 1.15s cubic-bezier(.2,.7,.15,1)';
      strip.style.transform = 'none';
    }, moveStart);
    later(() => { head.classList.remove('prehide'); head.classList.add('reveal'); }, moveEnd + 100);
    later(() => {
      [...matrix.children].forEach((c, i) =>
        (c as HTMLElement).style.setProperty('--d', `${Math.floor(i / 4) * 0.5}s`),
      );
      matrix.classList.remove('prehide');
      matrix.classList.add('reveal');
    }, moveEnd + 300);
    later(() => {
      strip.style.transition = ''; strip.style.transform = ''; strip.style.opacity = '';
      for (const c of cells) { c.style.transition = ''; c.style.opacity = ''; c.style.transform = ''; }
    }, moveEnd + 600);

    return () => timers.forEach(clearTimeout);
  }, []);

  return null;
}
