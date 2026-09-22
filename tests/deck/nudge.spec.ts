import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * The gate says which way to go (DIA-398, spec §3).
 *
 * A reader arriving cold from a post meets a still screen that says nothing
 * about which way it opens. Two answers, both ruled in: the hint points, and
 * once - five seconds in, if nothing has happened - the track shows the edge
 * of the next slide and comes back.
 *
 * The nudge is the deck's only timer, so most of this file is about the ways
 * it must NOT fire, and about it moving the track and nothing else.
 */
const PHONE = { width: 390, height: 844 };

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

async function open(page: Page, hash = '') {
  await page.goto(`/item/t01/${hash}`);
  await arrived(page);
  await page.waitForSelector('.deck-track');
  await page.waitForTimeout(300);
}

/**
 * Watch the track for a while and report what it did.
 *
 * Sampling rather than waiting and looking: the nudge is 900ms out and back,
 * so a test that only looks at the end sees a track that never moved - which
 * is also what a broken nudge looks like.
 */
const watch = (page: Page, ms: number) =>
  page.evaluate((span) => new Promise<{ peak: number; end: number; ats: string[]; dots: number[] }>((done) => {
    const t = document.querySelector('.deck-track')!;
    const deck = document.querySelector('.deck')!;
    const home = t.scrollLeft;
    let peak = 0;
    const ats = new Set<string>();
    const dots = new Set<number>();
    const id = setInterval(() => {
      peak = Math.max(peak, Math.abs(t.scrollLeft - home));
      ats.add(deck.getAttribute('data-at') ?? '');
      dots.add([...document.querySelectorAll('.deck-dot')].findIndex((d) => d.hasAttribute('data-on')));
    }, 16);
    setTimeout(() => {
      clearInterval(id);
      done({ peak: Math.round(peak), end: Math.round(Math.abs(t.scrollLeft - home)), ats: [...ats], dots: [...dots] });
    }, span);
  }), ms);

test.describe('the hint points', () => {
  test.use({ viewport: PHONE });

  test('it names the way on and draws the chevron as a path', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => {
      const layers = [...document.querySelectorAll('.deck-prev [data-lyr]')];
      const on = layers.find((l) => Number(getComputedStyle(l).opacity) > 0.5)!;
      const hint = on.querySelector('.deck-hint')!;
      return {
        text: (hint.textContent ?? '').trim(),
        svg: hint.querySelectorAll('svg path').length,
        // A character would be mirrored by the bidi algorithm; a path is a
        // path whatever the direction around it.
        chars: /[<>‹›]/.test(hint.textContent ?? ''),
      };
    });
    expect(m.text).toBe('החליקו להמשך');
    expect(m.svg).toBe(1);
    expect(m.chars).toBe(false);
  });
});

test.describe('the nudge', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('five seconds in, the track shows the edge and comes back', async ({ page }) => {
    await open(page);
    const m = await watch(page, 7000);
    // About 38px out, and exactly nothing left over: the half-sine ends where
    // it started, and the deck's own straightening never has to be involved.
    expect(m.peak).toBeGreaterThan(20);
    expect(m.peak).toBeLessThan(60);
    expect(m.end).toBe(0);
    // It moves the track and nothing else.
    expect(m.ats).toEqual(['0']);
    expect(m.dots).toEqual([0]);
    expect(await page.evaluate(() => location.hash)).toBe('');
    // And the snap the animation switched off is back.
    expect(await page.evaluate(() =>
      getComputedStyle(document.querySelector('.deck-track')!).scrollSnapType)).not.toBe('none');
  });

  test('it happens once, and never again on a return to the gate', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(6500);
    // Go on to slide 2 and come back the way a reader would.
    await page.evaluate(() => { location.hash = '#2'; });
    await page.waitForTimeout(700);
    await page.evaluate(() => { location.hash = ''; });
    await page.waitForTimeout(700);
    const again = await watch(page, 6500);
    expect(again.peak).toBe(0);
  });

  test('a touch before it fires cancels it for good', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(1200);
    // A tap on the frame, not on a control: the reader has found the screen.
    await page.mouse.move(195, 500);
    await page.mouse.down();
    await page.mouse.up();
    const m = await watch(page, 6500);
    expect(m.peak).toBe(0);
  });

  test('a deep link that opened elsewhere gets none', async ({ page }) => {
    await open(page, '#3');
    const m = await watch(page, 6500);
    expect(m.peak).toBe(0);
    expect(m.ats).toEqual(['2']);
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } });

  test('no nudge, and the hint still points', async ({ page }) => {
    await open(page);
    const m = await watch(page, 6500);
    expect(m.peak).toBe(0);
    const text = await page.evaluate(() => {
      const layers = [...document.querySelectorAll('.deck-prev [data-lyr]')];
      const on = layers.find((l) => Number(getComputedStyle(l).opacity) > 0.5)!;
      return (on.querySelector('.deck-hint')?.textContent ?? '').trim();
    });
    expect(text).toBe('החליקו להמשך');
  });
});
