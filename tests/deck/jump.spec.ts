import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * Jump mode's strip (DIA-399, spec §3).
 *
 * Arming, the 400ms hold, the dim and the live scrub are Phase 2's and are
 * unchanged. What this file covers is what the strip does once it is armed:
 * it opens under the thumb, it names where a release will land, and it can be
 * abandoned by taking the finger up and away.
 *
 * Six 6px dots at a 13px pitch is about 71px for the whole deck, under the
 * thumb doing the scrubbing. Open, it is 150px - a movement rather than a
 * twitch - and the dot being held has to stay exactly where it was or the
 * opening throws the finger off its own target.
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

const dot = (page: Page, i: number) =>
  page.evaluate((n) => {
    const d = document.querySelectorAll('.deck-dot')[n]!.getBoundingClientRect();
    return { cx: d.left + d.width / 2, cy: d.top + d.height / 2, w: Math.round(d.width) };
  }, i);

const strip = (page: Page) =>
  page.evaluate(() => {
    const deck = document.querySelector('.deck')!;
    const row = document.querySelector('.deck-dots')!.getBoundingClientRect();
    const pill = document.querySelector('.deck-jump');
    const f = deck.getBoundingClientRect();
    return {
      armed: deck.hasAttribute('data-armed'),
      away: deck.hasAttribute('data-away'),
      at: deck.getAttribute('data-at'),
      hash: location.hash,
      gap: getComputedStyle(document.querySelector('.deck-dots')!).gap,
      label: pill ? (pill.textContent ?? '').trim() : null,
      pill: pill
        ? {
            left: Math.round(pill.getBoundingClientRect().left - f.left),
            right: Math.round(pill.getBoundingClientRect().right - f.left),
            bottom: Math.round(pill.getBoundingClientRect().bottom),
            cx: Math.round(pill.getBoundingClientRect().left + pill.getBoundingClientRect().width / 2),
          }
        : null,
      rowTop: Math.round(row.top),
    };
  });

async function open(page: Page, id = 't01', hash = '') {
  await page.goto(`/item/${id}/${hash}`);
  await arrived(page);
  await page.waitForSelector('.deck-dots');
  await page.waitForTimeout(400);
}

/** Press and hold on a dot until the strip arms. */
async function arm(page: Page, i: number) {
  const d = await dot(page, i);
  await page.mouse.move(d.cx, d.cy);
  await page.mouse.down();
  await page.waitForTimeout(600);
  return d;
}

test.describe('the strip opens under the thumb', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('the dot being held does not move while the rest open out', async ({ page }) => {
    await open(page, 't01', '#3');
    const before = await dot(page, 2);
    await arm(page, 2);
    const after = await dot(page, 2);

    // The assertion the issue asks for: same centre, within half a pixel.
    expect(Math.abs(after.cx - before.cx)).toBeLessThan(0.5);
    // ...and the row really did open.
    expect(before.w).toBe(6);
    expect(after.w).toBe(8);
    expect((await strip(page)).gap).toBe('22px');
    await page.mouse.up();
  });

  test('a five-dot deck holds its dot still too', async ({ page }) => {
    // t05 has no slide 4, so the middle index is 2 rather than 2.5. The shift
    // is derived from the deck's own length for exactly this reason.
    await open(page, 't05', '#3');
    const before = await dot(page, 1);
    await arm(page, 1);
    expect(Math.abs((await dot(page, 1)).cx - before.cx)).toBeLessThan(0.5);
    await page.mouse.up();
  });

  test('scrubbing to the far dot is a movement, not a twitch', async ({ page }) => {
    await open(page, 't01', '#3');
    await arm(page, 2);
    const first = await dot(page, 0);
    const last = await dot(page, 5);
    // §3's open pitch is 30px, so five gaps is about 150.
    expect(Math.abs(first.cx - last.cx)).toBeGreaterThan(130);
    await page.mouse.up();
  });
});

test.describe('the label names the landing', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('it appears with the dim, names the slide, and follows the scrub', async ({ page }) => {
    await open(page, 't01', '#3');
    expect((await strip(page)).label).toBeNull();

    await arm(page, 2);
    const armed = await strip(page);
    expect(armed.armed).toBe(true);
    expect(armed.label).toBe('מה נעשה מאז');
    // Above the strip, because the thumb is on the strip.
    expect(armed.pill!.bottom).toBeLessThan(armed.rowTop);
    // Centred on the dot it names.
    expect(Math.abs(armed.pill!.cx - (await dot(page, 2)).cx)).toBeLessThan(2);

    const five = await dot(page, 5);
    await page.mouse.move(five.cx, five.cy, { steps: 6 });
    await page.waitForTimeout(150);
    expect((await strip(page)).label).toBe('הלאה');

    await page.mouse.up();
    await page.waitForTimeout(500);
    // It leaves with the dim.
    expect((await strip(page)).label).toBeNull();
  });

  test('it stays inside the frame at both ends', async ({ page }) => {
    await open(page, 't01', '#3');
    await arm(page, 2);
    for (const i of [0, 5]) {
      const d = await dot(page, i);
      await page.mouse.move(d.cx, d.cy, { steps: 4 });
      await page.waitForTimeout(150);
      const m = await strip(page);
      expect.soft(m.pill!.left, `dot ${i + 1} from the left`).toBeGreaterThanOrEqual(0);
      expect.soft(m.pill!.right, `dot ${i + 1} from the right`).toBeLessThanOrEqual(PHONE.width);
    }
    await page.mouse.up();
  });

  test('no number: the dots are still the counter', async ({ page }) => {
    await open(page, 't01', '#3');
    await arm(page, 2);
    expect((await strip(page)).label).not.toMatch(/\d/);
    await page.mouse.up();
  });
});

test.describe('up is out', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('the deck goes back, the strip fades, and the label says so', async ({ page }) => {
    await open(page, 't01', '#3');
    const start = await strip(page);
    await arm(page, 2);

    const five = await dot(page, 5);
    await page.mouse.move(five.cx, five.cy, { steps: 6 });
    await page.waitForTimeout(150);
    expect((await strip(page)).at).toBe('5');

    // Up and away.
    await page.mouse.move(five.cx, five.cy - 120, { steps: 8 });
    await page.waitForTimeout(250);
    const away = await strip(page);
    expect(away.away).toBe(true);
    expect(away.label).toBe('שחררו לביטול');
    expect(away.at).toBe('2');
    // The strip fades rather than closing. A row that re-closed under a finger
    // that is still down would put a different dot where the thumb is, so
    // coming back down would resume somewhere the reader never scrubbed to.
    expect(away.gap).toBe('22px');
    expect(await page.evaluate(() =>
      Number(getComputedStyle(document.querySelector('.deck-dot')!).opacity))).toBeLessThan(0.5);

    // Releasing there lands on the slide the reader armed on, and the URL is
    // untouched: an abandoned jump is not a landing.
    await page.mouse.up();
    await page.waitForTimeout(700);
    const end = await strip(page);
    expect(end.at).toBe('2');
    expect(end.away).toBe(false);
    expect(end.hash).toBe(start.hash);
  });

  test('coming back down resumes the scrub', async ({ page }) => {
    await open(page, 't01', '#3');
    const d = await arm(page, 2);
    await page.mouse.move(d.cx, d.cy - 120, { steps: 6 });
    await page.waitForTimeout(200);
    expect((await strip(page)).away).toBe(true);

    const five = await dot(page, 5);
    await page.mouse.move(five.cx, five.cy, { steps: 8 });
    await page.waitForTimeout(250);
    const back = await strip(page);
    expect(back.away).toBe(false);
    expect(back.label).toBe('הלאה');
    expect(back.at).toBe('5');
    expect(back.gap).toBe('22px');

    await page.mouse.up();
    await page.waitForTimeout(700);
    expect((await strip(page)).at).toBe('5');
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } });

  test('the strip and the label are there; the page still waits for the release', async ({ page }) => {
    await open(page, 't01', '#3');
    await arm(page, 2);
    const armed = await strip(page);
    expect(armed.label).toBe('מה נעשה מאז');
    expect(armed.gap).toBe('22px');

    const five = await dot(page, 5);
    await page.mouse.move(five.cx, five.cy, { steps: 6 });
    await page.waitForTimeout(200);
    // The dots follow the finger; the track does not move until the release.
    expect((await strip(page)).label).toBe('הלאה');
    expect(await page.evaluate(() => Math.round(Math.abs(document.querySelector('.deck-track')!.scrollLeft)))).toBe(390 * 2);

    await page.mouse.up();
    await page.waitForTimeout(700);
    expect((await strip(page)).at).toBe('5');
  });
});
