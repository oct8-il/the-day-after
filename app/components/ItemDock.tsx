'use client';

import { useEffect } from 'react';

/**
 * The docked failure header and the chapter rail. A port of the prototype's
 * buildOrientation: once the hero scrolls past the site header, the dock takes
 * over and tells you which failure you are inside and which chapter you are in.
 *
 * Rendered as markup on the server; this component only attaches the scroll
 * behaviour, so the page is complete and readable before any JavaScript runs.
 */
export function ItemDock({ chapters }: { chapters: { n: number; color: string; d: string }[] }) {
  useEffect(() => {
    const root = document.documentElement;
    const dock = document.getElementById('dock');
    const toc = document.getElementById('toc');
    const sub = document.getElementById('docksub');
    if (!dock || !toc || !sub) return;

    const measure = () => {
      const h = document.querySelector('header.top') as HTMLElement | null;
      if (h) root.style.setProperty('--hdrh', `${h.offsetHeight}px`);
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const hero = document.querySelector('.itemhero');
        if (!hero) return;
        const hdr = parseInt(getComputedStyle(root).getPropertyValue('--hdrh')) || 60;
        dock.classList.toggle('on', hero.getBoundingClientRect().bottom < hdr + 4);

        let cur = 1;
        const line = hdr + 90;
        for (const c of chapters) {
          const s = document.getElementById(`chap-${c.n}`);
          if (s && s.getBoundingClientRect().top <= line) cur = c.n;
        }
        toc.querySelectorAll('a').forEach((a) =>
          a.classList.toggle('on', (a as HTMLElement).dataset.ch === String(cur)),
        );
        const cc = chapters[cur - 1];
        sub.style.setProperty('--c', cc.color);
        sub.querySelector('.no')!.textContent = String(cc.n);
        sub.querySelector('.nm')!.textContent = cc.d;
      });
    };

    // The rail scrolls to a chapter with the header's height allowed for, which
    // the browser's own anchor jump does not know about.
    const onClick = (e: Event) => {
      const a = (e.target as HTMLElement).closest('a[data-ch]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      const t = document.getElementById(`chap-${a.dataset.ch}`);
      if (!t) return;
      const off = (parseInt(getComputedStyle(root).getPropertyValue('--hdrh')) || 60) + 60;
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
    };

    measure();
    onScroll();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    toc.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll);
      toc.removeEventListener('click', onClick);
    };
  }, [chapters]);

  return null;
}
