/** 7 October 2023, 06:29 Asia/Jerusalem — the minute the day began. */
export const START = Date.UTC(2023, 9, 7, 3, 29);
export const daysSince = () => Math.floor((Date.now() - START) / 864e5);

/**
 * How many days after 7 October a published date falls — the first half of the
 * gate's age line, `18 ימים אחרי 7.10 · 25.10.2023` (spec §4).
 *
 * The ledger publishes two shapes, and only one of them can be counted:
 *
 *   25.10.2023   a day. Counted.
 *   03.2024      a month, because the source dated itself no more precisely
 *                than that. Returns null, and the line prints the date alone
 *                rather than inventing a day inside the month to subtract.
 *
 * Anything else is null too. A date the ledger cannot parse is not a reason to
 * print a wrong number.
 */
export function daysAfter(date: string): number | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const at = Date.UTC(Number(y), Number(mo) - 1, Number(d), 3, 29);
  if (Number.isNaN(at)) return null;
  const days = Math.round((at - START) / 864e5);
  return days < 0 ? null : days;
}

/**
 * How long the item has been where it is: days from the date a stage was
 * reached to today.
 *
 * Expressed as the difference of two counts from 7.10 rather than from a
 * second Date.now(), so the numeral on slide 4 and the age line on slide 3 can
 * never disagree about which day it is.
 */
export function daysWaiting(date: string | null): number | null {
  if (!date) return null;
  const after = daysAfter(date);
  return after === null ? null : Math.max(0, daysSince() - after);
}
