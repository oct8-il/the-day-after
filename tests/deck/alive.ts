import type { Page } from '@playwright/test';

/**
 * Waiting for a deck that is alive, rather than one that is merely painted
 * (DIA-409).
 *
 * Every helper in these specs used to open a page, wait for a selector and
 * sleep. The selector is server-rendered markup, so it is satisfied before
 * React has hydrated; the sleep then had to be long enough to cover hydration,
 * which it was against the export and was not against `next dev`, where the
 * route compiles on demand. Two swipe tests failed in CI for a week having
 * never swiped anything - the deck was still on the gate when they measured.
 *
 * `data-at` is no good as the signal either: it ships in the HTML, so waiting
 * for it is the same mistake in a different attribute. The deck writes
 * `data-live` from an effect instead, which means its listeners are attached.
 */

/** The deck's JavaScript is running. */
export const alive = (page: Page) =>
  page.waitForSelector('.deck[data-live]', { state: 'attached' });

/** The slide the deck says it is on - an index, not the number in the hash. */
export const at = (page: Page) =>
  page.evaluate(() => document.querySelector('.deck')?.getAttribute('data-at') ?? null);

/**
 * Alive, and standing where the URL says it should stand.
 *
 * The number in the hash is the slide's identity, not its position (DIA-422),
 * and `data-at` is a position - so the two agree only on an item that has all
 * six slides. The slides carry their identity in their `id`, which is how
 * this resolves one to the other, including the fallback: a hash naming a
 * slide this item does not have opens the nearest earlier one that it does. A
 * hash the grammar does not recognise is the gate, which is index 0. Use it
 * after anything that changes the hash, the load included.
 */
export const arrived = (page: Page) => page.waitForFunction(() => {
  const deck = document.querySelector('.deck');
  if (!deck?.hasAttribute('data-live')) return false;
  const m = /^#?([1-6])(?:-s[1-6])?$/.exec(location.hash.trim());
  const want = m ? Number(m[1]) : 1;
  const ids = [...document.querySelectorAll('.deck-track > .deck-slide')]
    .map((s) => Number((s.id.split('-')[1]) ?? 0));
  let i = 0;
  ids.forEach((n, k) => { if (n <= want) i = k; });
  return deck.getAttribute('data-at') === String(i);
});
