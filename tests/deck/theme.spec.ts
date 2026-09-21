import { test, expect, type Page } from '@playwright/test';

/**
 * The chrome's ink over two grounds (DIA-403, spec §3).
 *
 * The gate is dark in both themes; slides 2-6 follow the theme. On a light
 * phone that is one chrome over two grounds, and until this landed the chrome
 * took the theme's dark ink on the gate too - the dots, the swipe hint and the
 * photo credit effectively gone against a dark photograph.
 *
 * The ruling is 1b: over the gate the chrome wears the gate's ink, over slide
 * 2 the theme's, and in between a mix set by where the track is. On a dark
 * phone the two inks are the same colour, so nothing here is visible at all -
 * which is why every assertion below runs in both schemes.
 */
const PHONE = { width: 390, height: 844 };
const GATE_INK = [233, 230, 223]; // #e9e6df
const THEME_INK_LIGHT = [29, 33, 38]; // #1d2126

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
 * Chrome reports a colour as `rgb()` (channels 0-255) or, once a `color-mix()`
 * is involved, as `color(srgb r g b / a)`, whose channels run 0-1. Reading the
 * second with the first's scale makes every ink nearly black, which is a wrong
 * answer that looks like a real one.
 */
const READ = `(v) => {
  const n = (v.match(/[\\d.]+/g) || []).map(Number);
  const k = v.startsWith('color(') ? 255 : 1;
  return { c: n.slice(0, 3).map((x) => x * k), a: n.length > 3 ? n[3] : 1 };
}`;

/** The leaf crumb is the one piece of chrome drawn in undiluted ink. */
const crumbInk = (page: Page) =>
  page.evaluate(`(() => {
    const read = ${READ};
    return read(getComputedStyle(document.querySelector('.deck-crumbs b')).color).c;
  })()`) as Promise<number[]>;

const near = (got: number[], want: number[], tol = 6) => {
  for (let i = 0; i < 3; i += 1) expect(Math.abs(got[i]! - want[i]!), `channel ${i}: ${got} vs ${want}`).toBeLessThanOrEqual(tol);
};

async function open(page: Page, hash = '') {
  await page.goto(`/item/t01/${hash}`);
  await page.waitForSelector('.deck-track');
  await page.waitForTimeout(350);
}

/**
 * Put the track part way between the gate and slide 2, and read the ink there.
 *
 * In one evaluate, on purpose. A position the deck did not arrive at does not
 * survive: the scroll is reported, and about 140ms later the deck straightens
 * a landing that came to rest off a snap point - which is the behaviour a
 * whole other test asserts. So the ink is read in the same turn the position
 * exists, right after the deck's own handler has run on the dispatched event.
 *
 * What a finger holding still holds is therefore a phone-gate check rather
 * than one for here; what this measures is the mapping from position to ink.
 */
const inkAt = (page: Page, p: number) =>
  page.evaluate(`((frac) => {
    const read = ${READ};
    const t = document.querySelector('.deck-track');
    // Snap off first, and not as a nicety: with x-mandatory snap on, Chrome pulls
    // a programmatic scrollLeft back to the nearest slide in the same turn, so
    // the assignment reads back as 0 and the measurement would be of the gate.
    t.style.scrollSnapType = 'none';
    void t.offsetHeight;
    const one = t.clientWidth;
    t.scrollLeft = t.scrollLeft <= 0 ? -one * frac : one * frac;
    t.dispatchEvent(new Event('scroll'));
    const ink = read(getComputedStyle(document.querySelector('.deck-crumbs b')).color).c;
    t.style.scrollSnapType = '';
    return ink;
  })(${p})`) as Promise<number[]>;

test.describe('over the gate, the chrome is the gate\'s', () => {
  // The repo's config sets `reducedMotion: 'reduce'` for every project, and
  // under reduced motion there is no blend to measure - §3 swaps at the
  // midpoint instead. These blocks are about the blend, so they say so.
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  for (const scheme of ['dark', 'light'] as const) {
    test(`${scheme}: at rest on the gate it wears the gate's ink`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      near(await crumbInk(page), GATE_INK);
    });

    test(`${scheme}: the hint and the current dot hold against the ground`, async ({ page }) => {
      // The ground is a duotoned photograph over #0b0f0b, so the field is what
      // ink with alpha has actually been composited against. The inactive dots
      // are deliberately faint - a counter, not a control - and are not part
      // of this; what a reader must be able to see is where they are and that
      // there is more to the right.
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      const ratios = await page.evaluate(`(() => {
        const read = ${READ};
        const lum = (c) => {
          const [r, g, b] = c.map((n) => {
            const x = n / 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const field = read(getComputedStyle(document.querySelector('.deck-ground')).backgroundColor).c;
        const over = (ink) => {
          const { c, a } = read(ink);
          const mixed = c.map((n, i) => n * a + field[i] * (1 - a));
          const [x, y] = [lum(mixed), lum(field)].sort((p, q) => q - p);
          return (x + 0.05) / (y + 0.05);
        };
        return {
          hint: over(getComputedStyle(document.querySelector('.deck-prev')).color),
          dot: over(getComputedStyle(document.querySelector('.deck-dot[data-on]')).backgroundColor),
          credit: over(getComputedStyle(document.querySelector('.deck-credit')).color),
        };
      })()`) as { hint: number; dot: number; credit: number };
      expect.soft(ratios.hint, `${scheme}: the swipe hint`).toBeGreaterThanOrEqual(4.5);
      expect.soft(ratios.dot, `${scheme}: the current dot`).toBeGreaterThanOrEqual(4.5);
      // The credit is quieter by design (42%); it only has to be readable.
      expect.soft(ratios.credit, `${scheme}: the photo credit`).toBeGreaterThanOrEqual(3);
    });
  }
});

test.describe('off the gate, the chrome is the theme\'s', () => {
  // The repo's config sets `reducedMotion: 'reduce'` for every project, and
  // under reduced motion there is no blend to measure - §3 swaps at the
  // midpoint instead. These blocks are about the blend, so they say so.
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('light: at rest on slide 2 the ink is the theme\'s, as it was', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, '#2');
    near(await crumbInk(page), THEME_INK_LIGHT);
    // The property is removed rather than set, so every chrome rule falls back
    // to exactly the declaration it had before this issue existed.
    expect(await page.evaluate(() =>
      (document.querySelector('.deck') as HTMLElement).style.getPropertyValue('--ck'))).toBe('');
  });

  test('dark: slide 2 is unchanged, because both inks are the same colour', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '#2');
    near(await crumbInk(page), GATE_INK);
  });
});

test.describe('in between, the finger sets the mix', () => {
  // The repo's config sets `reducedMotion: 'reduce'` for every project, and
  // under reduced motion there is no blend to measure - §3 swaps at the
  // midpoint instead. These blocks are about the blend, so they say so.
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('light: at 0.3 the ink is 30% of the way from the gate\'s to the theme\'s', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    near(await crumbInk(page), GATE_INK);

    const mix = (f: number) => GATE_INK.map((g, i) => g + (THEME_INK_LIGHT[i]! - g) * f);
    near(await inkAt(page, 0.3), mix(0.3), 10);
    near(await inkAt(page, 0.8), mix(0.8), 10);
    // The two ends of the same function, read the same way.
    near(await inkAt(page, 0), GATE_INK);
    near(await inkAt(page, 1), THEME_INK_LIGHT);
  });

  test('dark: the mix is invisible, because it is a mix of one colour', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    near(await inkAt(page, 0.3), GATE_INK);
    near(await inkAt(page, 0.7), GATE_INK);
  });
});

test.describe('reduced motion swaps at the midpoint', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } });

  test('light: the ink is the gate\'s until half way, then the theme\'s', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    near(await inkAt(page, 0.3), GATE_INK);
    near(await inkAt(page, 0.7), THEME_INK_LIGHT);
  });
});
