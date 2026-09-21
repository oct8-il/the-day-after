import { test, expect, type Page } from '@playwright/test';

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
 * CPU throttle. These two tests need the full browser; `channel` may only be
 * set at the top level of a file or in the config; and the config is where the
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
  await page.waitForSelector('.deck-gate-rail');
  await page.evaluate(() => { location.hash = '#2'; });
  await page.waitForSelector('.deck-ov-scroll');
  await page.waitForTimeout(500);
}

test.describe('a swipe starts anywhere', () => {
  test('a horizontal drag from the middle of the text changes slide', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    const at = () => page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'));
    expect(await at()).toBe('1');

    const mid = await page.evaluate(() => {
      const r = document.querySelector('.deck-ov-body')!.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });

    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: x === undefined ? [] : [{ x, y: y! }],
      } as never);

    // Towards the physical right is backwards in RTL, so this lands on the
    // gate. Started in the middle of the text on purpose: the bezel is not a
    // control, and a body that scrolls sideways would swallow this.
    await touch('touchStart', mid.x - 120, mid.y);
    for (let i = 1; i <= 10; i += 1) {
      await touch('touchMove', mid.x - 120 + i * 24, mid.y);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(900);

    expect(await at()).toBe('0');
  });

  test('a vertical drag in the same place scrolls the text and stays on the slide', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    const mid = await page.evaluate(() => {
      const r = document.querySelector('.deck-ov-body')!.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });

    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: x === undefined ? [] : [{ x, y: y! }],
      } as never);

    await touch('touchStart', mid.x, mid.y + 150);
    for (let i = 1; i <= 10; i += 1) {
      await touch('touchMove', mid.x, mid.y + 150 - i * 15);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => ({
      top: document.querySelector('.deck-ov-scroll')!.scrollTop,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }));
    expect(after.top).toBeGreaterThan(0);
    expect(after.at).toBe('1');
  });
});
