import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { arrived, at } from './alive';

/**
 * The swipe (spec §3), in a file of its own.
 *
 * The swipe is the main way between slides and it has to work from the middle
 * of the screen, so the gesture has to be real touch dispatched over CDP - a
 * mouse drag does not pan a scroll container and proves nothing.
 *
 * It lives apart from slide 2's spec because of the `channel` below. CI
 * installs both Chromium builds and Playwright picks the headless shell for a
 * headless run; the shell delivers a synthetic touch pan to an ordinary
 * vertical scroller and does not deliver one to the deck's horizontal
 * scroll-snap track, which simply never moves - so the build failed here on
 * every push while the swipe was fine on a phone and in a full browser at 8x
 * CPU throttle. These tests need the full browser; `channel` may only be set
 * at the top level of a file or in the config; and the config is where the
 * fidelity baselines' binary is decided, which is a Phase 9 question and not
 * this one's. Hence a file (DIA-408).
 */
const PHONE = { width: 390, height: 844 };
test.use({
  viewport: PHONE,
  contextOptions: { reducedMotion: 'no-preference' },
  hasTouch: true,
  channel: 'chromium',
});

const IGNORE = [/fonts\.googleapis\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /_next\/hmr/, /React DevTools/];

test.beforeEach(async ({ page }, testInfo) => {
  const noise: string[] = [];
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (IGNORE.some((r) => r.test(m.text()))) return;
    noise.push(`${m.type()}: ${m.text()}`);
  });
  (testInfo as unknown as { _noise: string[] })._noise = noise;
});

test.afterEach(async ({}, testInfo) => {
  expect((testInfo as unknown as { _noise?: string[] })._noise ?? []).toEqual([]);
});

/**
 * Open an item at the gate and walk to slide 2, the way a reader arrives.
 *
 * A cold deep link to #2 makes slide 2 the entry slide, and §11's push-once
 * rule then turns a swipe back onto it into history.back() - which, in a
 * fixture with nothing behind the page, leaves it for about:blank and the
 * assertion reads a torn-down document rather than a bug.
 */
async function walkTo2(page: Page, id: string) {
  await page.goto(`/item/${id}/`);
  // Alive before the hash is touched, and arrived before anything is measured.
  // The 500ms sleep this replaces was the whole of DIA-409: long enough for a
  // static export to hydrate in, and not for `next dev`.
  await arrived(page);
  await page.evaluate(() => { location.hash = '#2'; });
  await arrived(page);
  await page.waitForSelector('.deck-card[data-card="ov"]');
}

/** One finger, dispatched through CDP: Playwright has taps, not pans. */
async function drag(
  page: Page, cdp: CDPSession,
  from: { x: number; y: number }, to: { x: number; y: number }, steps = 10,
) {
  const touch = (type: string, x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: x === undefined ? [] : [{ x, y: y! }],
    } as never);
  await touch('touchStart', from.x, from.y);
  for (let i = 1; i <= steps; i += 1) {
    await touch('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd');
}

/** The middle of the reading - the bezel is not a control. */
const middle = (page: Page) => page.evaluate(() => {
  const r = document.querySelector('.deck-card[data-card="ov"] .deck-read')!.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});

/**
 * Anything on the slide the reader is on that has been scrolled down.
 *
 * Scoped to that slide on purpose: slide 3's stack rests wherever its current
 * stage is, which is a scroll position and not a fault.
 */
const scrolledHere = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('.deck-slide[aria-current="true"] *')]
    .filter((e) => e.scrollTop > 0).map((e) => e.className));

test.describe('a swipe starts anywhere', () => {
  test('a horizontal drag from the middle of the text changes slide', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    expect(await at(page)).toBe('1');

    const mid = await middle(page);
    const cdp = await context.newCDPSession(page);
    // Dragging the content leftwards uncovers what is to its right, and in
    // RTL what is to the right is the slide before - so this lands on the
    // gate. Started in the middle of the text on purpose: nothing under the
    // finger may take the gesture.
    await drag(page, cdp, { x: mid.x + 120, y: mid.y }, { x: mid.x - 120, y: mid.y });
    await page.waitForTimeout(900);

    expect(await at(page)).toBe('0');
  });

  test('a vertical drag in the same place moves nothing at all', async ({ page, context, browserName }) => {
    // Since DIA-413 a slide never scrolls, so a reading drag has nothing to
    // take and nothing to give. Before, it scrolled the column - which is
    // what put a vertical scroller inside a horizontal one in the first place.
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    const mid = await middle(page);
    const before = await page.evaluate(() =>
      Math.round(document.querySelector('.deck-card[data-card="ov"] .deck-read')!.getBoundingClientRect().top));

    const cdp = await context.newCDPSession(page);
    await drag(page, cdp, { x: mid.x, y: mid.y + 150 }, { x: mid.x, y: mid.y });
    await page.waitForTimeout(600);

    expect(await at(page)).toBe('1');
    expect(await page.evaluate(() =>
      Math.round(document.querySelector('.deck-card[data-card="ov"] .deck-read')!.getBoundingClientRect().top)))
      .toBe(before);
    expect(await scrolledHere(page)).toEqual([]);
  });

  test('a sloppy diagonal drag changes slide or does nothing, never half of each', async ({ page, context, browserName }) => {
    // DIA-383, closed by structure rather than by an axis lock: there is no
    // second scroller left to take half of the gesture.
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    const mid = await middle(page);
    const cdp = await context.newCDPSession(page);
    await drag(page, cdp, { x: mid.x + 110, y: mid.y + 70 }, { x: mid.x - 110, y: mid.y - 70 });
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => {
      const t = document.querySelector('.deck-track')!.getBoundingClientRect();
      const one = document.querySelectorAll('.deck-track > .deck-slide')[0]!.getBoundingClientRect();
      const off = Math.abs(one.left - t.left);
      return {
        at: document.querySelector('.deck')!.getAttribute('data-at'),
        // At rest on a snap point, whichever of the two it chose.
        resting: off < 1.5 || Math.abs(off - t.width) < 1.5,
      };
    });
    expect(['0', '1']).toContain(after.at);
    expect(after.resting).toBe(true);
    expect(await scrolledHere(page)).toEqual([]);
  });
});
