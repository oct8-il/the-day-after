'use client';

import { useEffect } from 'react';

declare global {
  interface Window { __hyRedirecting?: boolean }
}

/**
 * Marks that the reader has been past the first-visit gate, so a later
 * reload of "/" does not send them back to the about page. Ported from the
 * prototype's markSeen() - called wherever the prototype's route() called
 * it: on landing on the failures matrix or the gap view, never on about
 * itself. See the redirect in app/layout.tsx for the other half.
 *
 * On "/" specifically, a first-time visitor's browser can still be
 * mid-hydration on the matrix page while the gate script's redirect to
 * about is already in flight (see the comment in layout.tsx). If this ran
 * during that window it would mark the reader "seen" for a page they never
 * actually landed on, so it no-ops while __hyRedirecting is set.
 */
export function MarkSeen() {
  useEffect(() => {
    if (window.__hyRedirecting) return;
    try { localStorage.setItem('hy_seen', '1'); } catch {}
  }, []);

  return null;
}
