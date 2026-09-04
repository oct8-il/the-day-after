'use client';

import { useEffect } from 'react';

/**
 * Footnote references in the AI-drafted stage summary ("[1]", "[2]"...) link
 * to their claim in the collapsed "כל הטענות במקורות" ledger below. Two
 * things make a plain fragment link unreliable here: the target only has
 * layout once its <details> is open, and relying on the browser to open an
 * ancestor <details> for a fragment link on its own is inconsistent across
 * browsers. So this opens the ledger and scrolls to the claim explicitly,
 * the same way ItemDock already does for the chapter rail.
 *
 * A quiet scroll-and-fade was not enough for a first-time reader to connect
 * "I clicked [1]" to "this is the row that lit up" - so the target is
 * centred in the view (not just nudged past the header) and, while it is
 * highlighted, carries a small "מקור 1" badge echoing the number that was
 * clicked, not just a colour change.
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

      const n = (a.textContent ?? '').replace(/\D/g, '') || '?';

      target.closest('details:not([open])')?.setAttribute('open', '');

      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        history.pushState(null, '', `#${id}`);

        target.dataset.citeNum = n;
        target.classList.add('flash');
        setTimeout(() => {
          target.classList.remove('flash');
          delete target.dataset.citeNum;
        }, 2800);
      });
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
