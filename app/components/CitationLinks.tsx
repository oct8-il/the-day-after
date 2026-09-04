'use client';

import { useEffect } from 'react';

/**
 * Footnote references in the AI-drafted stage summary ("[1]", "[2]"...) link
 * to their claim in the collapsed "כל הטענות במקורות" ledger below. The
 * target only has layout once its <details> is open, and relying on the
 * browser to open an ancestor <details> for a fragment link on its own is
 * inconsistent across browsers - where it is not supported, the link just
 * scrolls toward the closed summary's position, which can land far from
 * the claim it was supposed to reveal. So this opens the ledger itself and
 * scrolls to the claim explicitly, the same way ItemDock already does for
 * the chapter rail.
 */
export function CitationLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]');
      if (!a || !a.closest('.aisum')) return;
      const id = a.getAttribute('href')!.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();

      target.closest('details:not([open])')?.setAttribute('open', '');

      requestAnimationFrame(() => {
        const root = document.documentElement;
        const hdr = parseInt(getComputedStyle(root).getPropertyValue('--hdrh')) || 60;
        const top = target.getBoundingClientRect().top + window.scrollY - (hdr + 16);
        window.scrollTo({ top, behavior: 'smooth' });
        history.pushState(null, '', `#${id}`);
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1600);
      });
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
