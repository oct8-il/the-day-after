'use client';

import { useEffect, useState } from 'react';
import { daysSince } from '@/lib/days';

/**
 * Days since 7.10.2023. The site is static, so a number baked in at build time
 * would go stale the next morning; this recomputes it in the reader's browser.
 * The build-time value renders first, so the number is right even with
 * JavaScript off — as right as the day the site was last built.
 */
export function DaysSince({ initial }: { initial: number }) {
  const [days, setDays] = useState(initial);
  useEffect(() => setDays(daysSince()), []);
  return <>{days.toLocaleString('he-IL')}</>;
}
