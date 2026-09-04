'use client';

import { useEffect } from 'react';

/**
 * Marks that the reader has been past the first-visit gate, so a later
 * reload of "/" does not send them back to the about page. Ported from the
 * prototype's markSeen() - called wherever the prototype's route() called
 * it: on landing on the failures matrix or the gap view, never on about
 * itself. See the redirect in app/layout.tsx for the other half.
 */
export function MarkSeen() {
  useEffect(() => {
    try { localStorage.setItem('hy_seen', '1'); } catch {}
  }, []);

  return null;
}
