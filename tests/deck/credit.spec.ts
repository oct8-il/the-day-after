import { test, expect, type Page } from '@playwright/test';

/**
 * The gate's photo credit (DIA-404, spec §3).
 *
 * It was one nowrap line in the footer's left slot. A PikiWiki credit is
 * around 75 characters - t03, t05 and t06 carry real ones - and it ran off
 * the left edge of the screen and under the swipe hint. A licence credit
 * cannot be truncated, so it takes two rows instead, inside the 22px the slot
 * already has.
 *
 * What this file is really guarding is the footer's height. A footer taller on
 * the gate than on slide 2 makes the whole chrome jump on the first swipe.
 */
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

async function open(page: Page, id: string, hash = '') {
  await page.goto(`/item/${id}/${hash}`);
  await page.waitForSelector('.deck-track');
  await page.waitForTimeout(300);
}

/** The footer's own geometry, which is what must not move. */
const chrome = (page: Page) =>
  page.evaluate(() => {
    const foot = document.querySelector('.deck-foot')!.getBoundingClientRect();
    const dot = document.querySelector('.deck-dot')!.getBoundingClientRect();
    return { footTop: Math.round(foot.top), footHeight: Math.round(foot.height), dotTop: Math.round(dot.top) };
  });

const credit = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.deck-credit') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const hint = document.querySelector('.deck-hint')!.getBoundingClientRect();
    return {
      text: (el.textContent ?? '').trim(),
      rows: el.getAttribute('data-rows'),
      size: cs.fontSize,
      height: Math.round(r.height),
      left: Math.round(r.left),
      right: Math.round(r.right),
      hintLeft: Math.round(hint.left),
      // What the text wants against what it got: a cut credit is a data
      // problem the validator warns about, not something to discover here.
      cut: el.scrollHeight > Math.ceil(r.height) + 1,
    };
  });

test.describe('a long credit takes two rows', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const id of ['t06', 't05', 't03']) {
    test(`${id}: the whole credit, in two rows, clear of the hint`, async ({ page }) => {
      await open(page, id);
      const c = (await credit(page))!;
      expect(c.rows).toBe('2');
      expect(c.size).toBe('9.5px');
      expect(c.text.length).toBeGreaterThan(60);
      expect(c.cut, `${id}: the credit is cut`).toBe(false);
      // Two 11px rows, inside the slot's own 22px.
      expect(c.height).toBeLessThanOrEqual(22);
      // Left-aligned against the gutter, and it does not reach the hint.
      expect(c.left).toBeGreaterThanOrEqual(20);
      expect(c.right).toBeLessThan(c.hintLeft);
    });
  }

  test('a credit that fits is exactly what it was', async ({ page }) => {
    await open(page, 't01');
    const c = (await credit(page))!;
    expect(c.rows).toBeNull();
    expect(c.size).toBe('10.5px');
    expect(c.height).toBeLessThanOrEqual(17);
  });
});

test.describe('the footer does not move', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('one row and two rows give the same chrome', async ({ page }) => {
    await open(page, 't01');
    const one = await chrome(page);
    await open(page, 't06');
    const two = await chrome(page);
    expect(two).toEqual(one);
  });

  test('and the first swipe does not move it either', async ({ page }) => {
    await open(page, 't06');
    const gate = await chrome(page);
    await open(page, 't06', '#2');
    expect(await chrome(page)).toEqual(gate);
  });

  test('360 wide: still two rows, still 22px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await open(page, 't06');
    const c = (await credit(page))!;
    expect(c.rows).toBe('2');
    expect(c.height).toBeLessThanOrEqual(22);
    expect(c.left).toBeGreaterThanOrEqual(20);
    expect(c.right).toBeLessThan(c.hintLeft);
  });
});
