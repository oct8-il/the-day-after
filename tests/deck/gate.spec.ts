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

  test('the ground belongs to the gate and leaves with it', async ({ page }) => {
    // It used to be the deck's, faded in and out on `data-at` - so slide 2
    // travelled across the photograph until the swipe's midpoint and then the
    // photograph dissolved under it. DIA-385: it is slide 1's own and moves
    // with slide 1, which is one object with one edge rather than two layers.
    await open(page, 't01');
    const at0 = await page.evaluate(() => {
      const g = document.querySelector('.deck-ground')!;
      return {
        inSlideOne: g.closest('.deck-slide') === document.querySelector('.deck-track > .deck-slide'),
        opacity: getComputedStyle(g).opacity,
        fade: getComputedStyle(g).transitionDuration,
        left: Math.round(g.getBoundingClientRect().left),
      };
    });
    expect(at0.inSlideOne).toBe(true);
    expect(at0.opacity).toBe('1');
    // No fade to time: the edge is the slide's own edge, wherever the finger is.
    expect(at0.fade).toBe('0s');
    expect(at0.left).toBe(0);

    // The dots are not buttons (DIA-397), and the gate carries no next-slide
    // link (§3's table gives its left slot to the photo credit), so the route
    // off the gate here is the deck's own arrow keys.
    await page.locator('.deck').focus();
    await page.locator('.deck').press('ArrowLeft');
    await page.waitForTimeout(450);
    await page.locator('.deck').press('ArrowLeft');
    await page.waitForTimeout(600);
    const at2 = await page.evaluate(() => {
      const el = document.querySelector('.deck-ground')!;
      const g = el.getBoundingClientRect();
      const f = document.querySelector('.deck')!.getBoundingClientRect();
      return {
        opacity: getComputedStyle(el).opacity,
        overlap: Math.min(g.right, f.right) - Math.max(g.left, f.left),
      };
    });
    // Still painted, and carried off the frame by its slide rather than left
    // lying under the deck at zero opacity.
    expect(at2.opacity).toBe('1');
    expect(at2.overlap).toBeLessThanOrEqual(1);
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
      expect(Math.round(r.w)).toBe(6);
    }
  });

  test('the ladder keeps one rhythm, wherever the unreached rungs fall', async ({ page }) => {
    // This replaces an assertion on the opposite rule - a deliberate 18px break
    // before the first unreached rung. That break was never decoration: it was
    // clearance for an age line that hung past its own row. The age line is a
    // two-line group inside its rung now, nothing overhangs, and the ladder
    // keeps one step throughout. (DIA-380.)
    //
    // Run on fixtures whose unreached rungs fall in different places, because
    // a rule about "wherever" is not tested by one ladder: t01 reaches 1-4 and
    // is missing only the last, t03's current stage is second so the gap is in
    // the middle, t05 is missing nothing, t06 regressed and has six rungs.
    for (const id of ['t01', 't03', 't05', 't06']) {
      await open(page, id);
      const tops = await page.evaluate(() =>
        [...document.querySelectorAll('.deck-gate-rung > i')].map((r) => r.getBoundingClientRect().top));
      const steps = tops.slice(1).map((t, i) => Math.round(t - tops[i]));
      // 30px rung + 10px row gap, every time.
      expect.soft(new Set(steps).size, `${id} steps: ${steps.join(',')}`).toBe(1);
      expect.soft(steps[0], `${id} step size`).toBe(40);
    }
  });

  test('the label and its age line are centred on the rung as one group', async ({ page }) => {
    // The reason for the rhythm change, and the only thing that would catch it
    // drifting back. Centring the label alone put the pair 9px below the centre
    // of its own rung, so the mark lined up with the first line and the date
    // hung off the bottom.
    await open(page, 't01');
    const off = await page.evaluate(() => {
      const row = document.querySelector('.deck-gate-rung > span.now')!;
      const rung = row.previousElementSibling!.getBoundingClientRect();
      const label = row.firstChild as Text;
      const r = document.createRange();
      r.selectNodeContents(row);
      const text = r.getBoundingClientRect();
      void label;
      return (text.top + text.bottom) / 2 - (rung.top + rung.bottom) / 2;
    });
    expect(Math.abs(off), 'group centre against rung centre').toBeLessThan(1.5);
  });

  test('an unreached rung is solid, not dashed', async ({ page }) => {
    await open(page, 't01');
    const off = page.locator('.deck-gate-rung > i.off').first();
    await expect(off).toHaveCSS('border-style', 'none');
    await expect(off).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.4)');
    // And it is the same width as a reached one - 6px, not 4.
    const w = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-gate-rung > i')].map((r) => Math.round(r.getBoundingClientRect().width)));
    expect(new Set(w).size).toBe(1);
    expect(w[0]).toBe(6);
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
