import { test, expect, type Page } from '@playwright/test';

/**
 * Slide 1 — the gate (DIA-378, spec §4).
 *
 * The geometry half of the proof. The screens are judged by eye against the
 * two embedded in the spec; these assert the things an eye reads as "about
 * right" and a measurement reads as wrong - and the things that have already
 * gone wrong once.
 *
 * t01 carries a portrait crop and t04 deliberately does not, which is the pair
 * the phase's gate sets side by side.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

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

const rect = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  }, sel);

async function open(page: Page, id: string) {
  await page.goto(`/item/${id}/`);
  await page.waitForSelector('.deck-gate-rail');
  await page.waitForTimeout(250);
}

test.describe('the ground', () => {
  test('it is painted, and it covers the whole frame', async ({ page }) => {
    // Not a tautology. `.gate` collided with an unscoped `.gate{display:none
    // !important}` in the prototype's stylesheet and the entire screen rendered
    // as nothing while every data assertion still passed. A height is the
    // cheapest thing that notices.
    await open(page, 't01');
    const f = await rect(page, '.deck');
    const g = await rect(page, '.deck-ground');
    expect(Math.round(g.height)).toBe(Math.round(f.height));
    expect(Math.round(g.width)).toBe(Math.round(f.width));

    // And it runs under the docked chrome rather than stopping at the track:
    // the footer sits on the field, as it does in the spec's screen.
    const foot = await rect(page, '.deck-foot');
    expect(g.bottom).toBeGreaterThanOrEqual(foot.bottom);
    expect(g.top).toBeLessThanOrEqual((await rect(page, '.deck-crumbs')).top);
  });

  test('the ground belongs to the gate alone', async ({ page }) => {
    await open(page, 't01');
    await expect(page.locator('.deck-ground')).toHaveCSS('opacity', '1');
    await page.locator('.deck-dot').nth(2).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.deck-ground')).toHaveCSS('opacity', '0');
  });

  test('a photograph renders as a duotone; without one, the field and the ghost', async ({ page }) => {
    await open(page, 't01');
    await expect(page.locator('.deck-gate-photo')).toHaveCount(1);
    await expect(page.locator('.deck-gate-tint')).toHaveCSS('mix-blend-mode', 'color');
    await expect(page.locator('.deck-gate-ghost')).toHaveCount(0);

    await open(page, 't04');
    await expect(page.locator('.deck-gate-photo')).toHaveCount(0);
    await expect(page.locator('.deck-gate-field')).toHaveCount(1);
    // Nothing on the screen announces that a photo is missing.
    expect(await page.locator('.deck-gate').innerText()).not.toMatch(/תמונה|צילום/);
  });
});

test.describe('the stage rail', () => {
  test('it stands against the physical right edge', async ({ page }) => {
    // §2's RTL trap: padding-inline-end and align-items:flex-end resolve LEFT
    // in this frame. The rail is the element that trap costs the most.
    await open(page, 't01');
    const f = await rect(page, '.deck');
    const rungs = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-gate-rung > i')].map((r) => {
        const b = r.getBoundingClientRect();
        return { right: b.right, left: b.left, w: b.width, h: b.height, top: b.top };
      }));
    expect(rungs.length).toBe(5);
    for (const r of rungs) {
      expect(Math.round(f.right - r.right), 'every rung 20px off the right edge').toBe(20);
      expect(Math.round(r.h)).toBe(30);
      expect(Math.round(r.w)).toBe(4);
    }
  });

  test('a deliberate gap precedes the first unreached rung, and only that one', async ({ page }) => {
    await open(page, 't01');   // reaches 1-4, so the gap sits before stage 5
    const tops = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-gate-rung > i')].map((r) => r.getBoundingClientRect().top));
    const steps = tops.slice(1).map((t, i) => Math.round(t - tops[i]));
    // 30px rung + 7px row gap = 37 between reached rungs; +18 before the first
    // unreached one.
    expect(steps.slice(0, 3)).toEqual([37, 37, 37]);
    expect(steps[3]).toBe(55);
  });

  test('the current stage is the one carrying the age line', async ({ page }) => {
    await open(page, 't01');
    const now = page.locator('.deck-gate-rung > span.now');
    await expect(now).toHaveCount(1);
    await expect(now.locator('b')).toHaveCount(1);
    expect(await now.locator('b').innerText()).toMatch(/^\d+ ימים אחרי 7\.10 · \d{2}\.\d{2}\.\d{4}$/);
    // And no other rung carries one.
    await expect(page.locator('.deck-gate-rung > span b')).toHaveCount(1);
  });
});

test.describe('the title block', () => {
  test('it is anchored to the bottom, above the dots', async ({ page }) => {
    await open(page, 't01');
    const f = await rect(page, '.deck');
    // The ink, not the block: .deck-gate-title spans the frame and carries the
    // gutter as padding, so its own right edge is the frame's.
    const title = await rect(page, '.deck-gate-title h1');
    const dots = await rect(page, '.deck-dots');
    expect(Math.round(f.right - title.right)).toBe(20);
    expect(title.bottom).toBeLessThanOrEqual(dots.top + 1);
    // Bottom-anchored: the block sits in the lower half whatever its length.
    expect(title.top).toBeGreaterThan(f.height / 2);
  });

  test('the source line fits on one line', async ({ page }) => {
    // The overflow rule's reason for existing. The line's own box must not be
    // taller than one line of 13px type.
    for (const id of ['t01', 't03', 't04', 't05', 't06']) {
      await open(page, id);
      const p = await rect(page, '.deck-gate-title p');
      expect.soft(Math.round(p.height), `${id} source line`).toBeLessThanOrEqual(20);
    }
  });

  test('the credit sits in the footer on the gate, and is empty without a photo', async ({ page }) => {
    await open(page, 't01');
    expect(await page.locator('.deck-credit').innerText()).toMatch(/^צילום: .+ · .+ · .+$/);
    await open(page, 't04');
    expect(await page.locator('.deck-credit').innerText()).toBe('');
  });
});

test('the title is set in the display face, not the body sans', async ({ page }) => {
  // The prototype names its display face with a bare `.serif`, and every rule
  // carrying it is scoped to a desktop component - so the class arrived here
  // meaning nothing and the title rendered in Assistant. A class that does not
  // exist looks exactly like a class that does until someone reads the screen.
  await open(page, 't01');
  const face = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.deck-gate-title h1')!).fontFamily);
  expect(face).toMatch(/Frank Ruhl Libre/);

  const body = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.deck-gate-title p')!).fontFamily);
  expect(body, 'the source line stays in the body face').not.toMatch(/Frank Ruhl Libre/);
});

test('the number ghost is set in the display face too', async ({ page }) => {
  await open(page, 't04');
  const face = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.deck-gate-ghost .serif')!).fontFamily);
  expect(face).toMatch(/Frank Ruhl Libre/);
});

test('the breadcrumb leaf carries the item number', async ({ page }) => {
  await open(page, 't01');
  expect(await page.locator('.deck-crumbs b').innerText()).toMatch(/^כשל מס׳ \d+$/);
});
