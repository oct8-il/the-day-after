import { test, expect, type Page } from '@playwright/test';

/**
 * The deck's shell, chrome and gestures (DIA-377, spec §2, §3 and §11).
 *
 * §11: "Proof is a frozen set of 390×844 baselines, plus assertions on measured
 * geometry and on the gestures. Pixels cannot see a rule; rules cannot see a
 * screen." This file is the second half. The baselines are Phase 9.
 *
 * Everything edge-anchored is asserted on a measured getBoundingClientRect
 * rather than on a CSS property, because §2's RTL trap is precisely that the
 * property you wrote and the edge you got are different things:
 * padding-inline-end and align-items:flex-end resolve to the LEFT in this
 * frame. A test that reads the stylesheet back would pass while the element sat
 * against the wrong edge. It has cost two review rounds already.
 *
 * The pool is data/test, so `t01` is a fixture and its id is stable.
 */

const ITEM = '/item/t01/';
const PHONE = { width: 390, height: 844 };

/** The global config runs reduced-motion for the fidelity baselines. The deck's
 *  ordinary behaviour is the un-reduced one, so these ask for that explicitly
 *  and the reduced-motion case gets its own describe block below. */
test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

const slideNow = (page: Page) => page.evaluate(() => {
  const t = document.querySelector('.deck-track')!;
  return Math.round(Math.abs(t.scrollLeft) / t.clientWidth);
});

const rect = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  }, sel);

/**
 * Nothing may write to the console.
 *
 * React's most useful warnings - "Cannot update a component while rendering a
 * different component" among them - exist only in a development build and are
 * stripped from the export this suite usually runs against. A deck that calls
 * history inside a setState updater is therefore silently wrong in production
 * and loud in dev, which is the wrong way round for a suite to find it. So the
 * guard is here, and CI runs the whole file a second time against `next dev`
 * where those warnings exist. Point FIDELITY_BASE_URL at a dev server and this
 * catches them locally too.
 */
const IGNORE = [
  /fonts\.googleapis\.com/,        // the CDN, when the runner has no egress to it
  /ERR_TUNNEL_CONNECTION_FAILED/,
  /_next\/hmr/,                     // the dev server's own socket
  /Download the React DevTools/,
];

test.beforeEach(async ({ page }, testInfo) => {
  const noise: string[] = [];
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (IGNORE.some((r) => r.test(text))) return;
    noise.push(`${m.type()}: ${text}`);
  });
  testInfo.attach; // keep the collector alive for the assertion below
  (testInfo as unknown as { _noise: string[] })._noise = noise;
});

test.afterEach(async ({}, testInfo) => {
  const noise = (testInfo as unknown as { _noise?: string[] })._noise ?? [];
  expect(noise, 'the deck wrote to the console').toEqual([]);
});

async function open(page: Page, hash = '') {
  await page.goto(ITEM + hash);
  await page.waitForSelector('.deck-track');
  await page.waitForTimeout(250);
}

test.describe('the breakpoint', () => {
  test('the deck is the item page on a portrait phone, and nowhere else', async ({ page }) => {
    await open(page);
    await expect(page.locator('.deck')).toBeVisible();
    await expect(page.locator('.item-desktop')).toBeHidden();

    // 600 tall is the guard: a landscape phone cannot hold a frame whose
    // vertical rhythm is drawn at 844, so the desktop page takes it back.
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(page.locator('.deck')).toBeHidden();
    await expect(page.locator('.item-desktop')).toBeVisible();

    // 599 is the last phone width; 600 is where tablets start.
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(page.locator('.deck')).toBeHidden();
    await page.setViewportSize({ width: 599, height: 900 });
    await expect(page.locator('.deck')).toBeVisible();
  });

  test('both trees ship in the one HTML, at the one URL', async ({ page }) => {
    // §11: a static export has no server to sniff a device. The desktop tree is
    // in the document at phone width - hidden, not absent - and the deck is in
    // it at desktop width. Anything that removed one would be a route split.
    await open(page);
    await expect(page.locator('.item-desktop')).toHaveCount(1);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('.deck')).toHaveCount(1);
    await expect(page.locator('.deck')).toBeHidden();
  });
});

test.describe('the frame and its edges', () => {
  test('the frame is the visible viewport, not 100vh', async ({ page }) => {
    await open(page);
    const f = await rect(page, '.deck');
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.round(f.height)).toBe(vh);
  });

  test('the breadcrumb sits 20px from the RIGHT edge and 16px from the top', async ({ page }) => {
    await open(page);
    const f = await rect(page, '.deck');
    // The first crumb, not the container: the container spans the frame and it
    // is the ink whose distance to the edge the design specifies.
    const ink = await rect(page, '.deck-crumbs span');
    expect(Math.round(f.right - ink.right)).toBe(20);
    expect(Math.round(ink.top - f.top)).toBe(16);
    // ...and it is one path in one corner, never split across two.
    expect(Math.round(f.right - ink.right)).toBeLessThan(Math.round(ink.left - f.left));
  });

  test('the footer clears the home indicator by 26px', async ({ page }) => {
    await open(page);
    const f = await rect(page, '.deck');
    const ink = await rect(page, '.deck-prev');
    expect(Math.round(f.bottom - ink.bottom)).toBe(26);
  });

  test('every landing sits exactly on its snap point', async ({ page }) => {
    // A programmatic scroll ends where it is put and is not re-snapped, so a
    // target computed from i * clientWidth lands a fraction off and stays
    // there - the slide that sits a little to one side until a finger nudges
    // it straight. Measured, not eyeballed: the distance between the slide's
    // leading edge and the track's must be zero after every move.
    await open(page);
    const offBy = () => page.evaluate(() => {
      const t = document.querySelector('.deck-track')!;
      const base = t.getBoundingClientRect().left;
      let gap = Infinity;
      for (const s of document.querySelectorAll('.deck-slide')) {
        gap = Math.min(gap, Math.abs(s.getBoundingClientRect().left - base));
      }
      return gap;
    });
    for (const i of [2, 5, 1, 3, 0]) {
      await page.locator('.deck-dot').nth(i).click();
      await page.waitForTimeout(700);
      expect.soft(await slideNow(page), `dot ${i + 1} lands on its own slide`).toBe(i);
      expect.soft(await offBy(), `dot ${i + 1} lands on the snap point`).toBeLessThan(0.5);
    }
  });

  test('the track is the same height on every slide', async ({ page }) => {
    // The scroll container's size is the one thing a swipe cannot survive
    // changing mid-flight: resizing it makes the engine recompute its snap
    // positions, and the in-flight snap pays for that as an overshoot. It used
    // to share a flex column with the chrome, which is not the same height on
    // every slide - the gate gives the dots more air, and a footer with a
    // previous-slide link is taller than one without. Exactly those two
    // transitions overshot on the phone, and no others. (DIA-379.)
    //
    // This is the half of that bug a headless browser can see.
    await open(page);
    const heights: number[] = [];
    for (let i = 0; i < 6; i++) {
      await page.locator('.deck-dot').nth(i).click();
      await page.waitForTimeout(450);
      heights.push(await page.evaluate(() =>
        Math.round(document.querySelector('.deck-track')!.getBoundingClientRect().height)));
    }
    expect(new Set(heights).size, `track heights: ${heights.join(',')}`).toBe(1);

    // ...and it is the frame's, because the chrome overlays it rather than
    // taking a share of the column.
    const frame = await rect(page, '.deck');
    expect(heights[0]).toBe(Math.round(frame.height));
  });

  test('nothing in the chrome moves between slides', async ({ page }) => {
    // The track's height being constant is not enough: the chrome's own
    // halves were still sizing themselves to what each slide gave them, and a
    // reader swiping saw the dots drop 2px at the gate and the footer's rule
    // step up 3.4px at slide 3. Assert the positions a reader actually looks
    // at, not the container that used to carry the fault.
    await open(page);
    const seen: { dot: number; rule: number; foot: number }[] = [];
    for (let i = 0; i < 6; i++) {
      await page.locator('.deck-dot').nth(i).click();
      await page.waitForTimeout(450);
      seen.push(await page.evaluate(() => {
        const d = document.querySelector('.deck-dot')!.getBoundingClientRect();
        const f = document.querySelector('.deck-foot')!.getBoundingClientRect();
        return { dot: Math.round((d.top + d.bottom) / 2), rule: Math.round(f.top), foot: Math.round(f.height) };
      }));
    }
    for (const k of ['dot', 'rule', 'foot'] as const) {
      expect.soft(new Set(seen.map((x) => x[k])).size, `${k}: ${seen.map((x) => x[k]).join(',')}`).toBe(1);
    }
  });

  test('the chrome still clears the slides it sits over', async ({ page }) => {
    // The room the chrome needs comes out of each slide's padding now. If that
    // stopped tracking the chrome, content would slide under the footer - so
    // assert the clearance rather than the mechanism.
    for (const hash of ['', '#2', '#3', '#6']) {
      await open(page, hash);
      const gap = await page.evaluate(() => {
        const slide = [...document.querySelectorAll('.deck-slide')].find((s) => {
          const t = document.querySelector('.deck-track')!;
          return Math.abs(s.getBoundingClientRect().left - t.getBoundingClientRect().left) < 2;
        })!;
        const cs = getComputedStyle(slide);
        const bottom = document.querySelector('.deck-bottom')!.getBoundingClientRect().height;
        const top = document.querySelector('.deck-crumbs')!.getBoundingClientRect().height;
        return { padBottom: parseFloat(cs.paddingBottom), bottom, padTop: parseFloat(cs.paddingTop), top };
      });
      expect.soft(gap.padBottom, `${hash || 'gate'} bottom clearance`).toBeGreaterThanOrEqual(gap.bottom - 1);
      expect.soft(gap.padTop, `${hash || 'gate'} top clearance`).toBeGreaterThanOrEqual(gap.top - 1);
    }
  });

  test('a landing that comes to rest off the snap point is straightened', async ({ page }) => {
    // The deck corrects itself rather than trusting any one scroll API: three
    // separate causes have put a slide a fraction off its snap point so far,
    // and the fourth is on a phone and does not reproduce here. This nudges
    // the track off true and asserts that settling puts it back.
    await open(page, '#3');
    await page.evaluate(() => {
      const t = document.querySelector('.deck-track')!;
      t.scrollLeft += 9;              // nine pixels of wrong, deliberately
      t.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(700);
    const off = await page.evaluate(() => {
      const t = document.querySelector('.deck-track')!;
      const base = t.getBoundingClientRect().left;
      let gap = Infinity;
      for (const s of document.querySelectorAll('.deck-slide')) {
        gap = Math.min(gap, Math.abs(s.getBoundingClientRect().left - base));
      }
      return gap;
    });
    expect(off).toBeLessThan(0.5);
  });

  test('the dots are six, 6px, 7px apart, centred, first slide rightmost', async ({ page }) => {
    await open(page);
    const f = await rect(page, '.deck');
    const row = await rect(page, '.deck-dots');
    expect(Math.round((row.left - f.left) - (f.right - row.right))).toBe(0);

    const dots = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-dot')].map((d) => {
        const r = d.getBoundingClientRect();
        return { left: r.left, right: r.right, w: r.width, h: r.height };
      }));
    expect(dots).toHaveLength(6);
    for (const d of dots) { expect(Math.round(d.w)).toBe(6); expect(Math.round(d.h)).toBe(6); }
    // RTL: the first dot is the rightmost, so lefts descend across the array.
    for (let i = 1; i < dots.length; i++) {
      expect(dots[i].left).toBeLessThan(dots[i - 1].left);
      expect(Math.round(dots[i - 1].left - dots[i].right)).toBe(7);
    }
  });

  test('no numeric counter has crept in anywhere on the chrome', async ({ page }) => {
    await open(page);
    // §3: "No numeric counter anywhere — the dots are the counter." The slide
    // labels carry "1 מתוך 6" for a screen reader, which is why this reads the
    // rendered text of the chrome rather than the accessibility tree.
    for (const sel of ['.deck-crumbs', '.deck-dots', '.deck-foot']) {
      const text = await page.locator(sel).innerText();
      expect(text).not.toMatch(/\d\s*(\/|מתוך|of)\s*6/);
    }
  });
});

test.describe('the footer chain', () => {
  // `next: null` is "no next-slide link here", which is not the same as an
  // empty slot: the gate's left slot belongs to the photo credit (§3), and it
  // carries one on any item that has a photograph.
  const chain: { slide: number; prev: string; next: string | null }[] = [
    { slide: 0, prev: 'החליקו לצדדים', next: null },
    { slide: 1, prev: '', next: 'מה נעשה מאז' },
    { slide: 2, prev: 'סקירת הכשל', next: 'מה עוד לא נעשה' },
    { slide: 3, prev: 'מה נעשה מאז', next: 'דעת הציבור' },
    { slide: 4, prev: 'מה עוד לא נעשה', next: 'הלאה' },
    { slide: 5, prev: 'דעת הציבור', next: null },
  ];

  test('§3’s table, including the two bare ends', async ({ page }) => {
    await open(page);
    for (const row of chain) {
      await page.locator('.deck-dot').nth(row.slide).click();
      await page.waitForTimeout(450);
      expect.soft(await page.locator('.deck-prev').innerText(), `slide ${row.slide + 1} prev`).toBe(row.prev);
      if (row.next === null) {
        expect.soft(await page.locator('.deck-next a').count(), `slide ${row.slide + 1} has no next link`).toBe(0);
      } else {
        expect.soft(await page.locator('.deck-next a').innerText(), `slide ${row.slide + 1} next`).toBe(row.next);
      }
    }
  });

  test('the chrome goes to the destination and stays there', async ({ page }) => {
    // The scroll handler used to report every position a smooth scroll passed
    // through, so the footer showed the destination, flashed the slide it had
    // come from as the animation crossed the midpoint, then settled. The
    // sequence of active dots across a navigation must be exactly two values:
    // where it was, then where it is.
    await open(page, '#3');
    // The click happens inside the sampler rather than beside it. Driving it
    // from the test raced the first sample - on a fast runner the navigation
    // landed before sampling began, the starting value was never recorded, and
    // a passing deck read as a failure.
    const seen: number[] = await page.evaluate(() => new Promise<number[]>((done) => {
      const read = () =>
        [...document.querySelectorAll('.deck-dot')].findIndex((d) => d.hasAttribute('data-on'));
      const saw: number[] = [read()];
      const id = setInterval(() => saw.push(read()), 16);
      (document.querySelector('.deck-next a') as HTMLElement).click();
      setTimeout(() => { clearInterval(id); done(saw); }, 1200);
    }));
    const changes = seen.filter((v, i) => i === 0 || v !== seen[i - 1]);

    // What must hold is that the chrome never goes backwards: it may take the
    // step in one sample or in two, but having left slide 3 it may not show it
    // again half way through the animation, which is what the flicker was.
    expect(changes[0], 'starts where it was').toBe(2);
    expect(changes[changes.length - 1], 'ends where it was sent').toBe(3);
    expect(changes, 'never returns to a slide it has left').toEqual([...changes].sort((a, b) => a - b));
    expect(new Set(changes).size, 'no slide appears twice').toBe(changes.length);
  });

  test('the footer labels are real links, not gesture handles', async ({ page }) => {
    // §11: nothing on the deck may be gesture-only. A screen reader's swipe
    // means "next element", so the way forward has to be in the tree.
    await open(page, '#3');
    await expect(page.locator('.deck-prev a')).toHaveAttribute('href', '#2');
    await expect(page.locator('.deck-next a')).toHaveAttribute('href', '#4');
  });

  test('six labelled sections in DOM order', async ({ page }) => {
    await open(page);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-slide')].map((s) => s.getAttribute('aria-label')));
    expect(labels).toEqual([
      '1 מתוך 6 · השער',
      '2 מתוך 6 · סקירת הכשל',
      '3 מתוך 6 · מה נעשה מאז',
      '4 מתוך 6 · מה עוד לא נעשה',
      '5 מתוך 6 · דעת הציבור',
      '6 מתוך 6 · הלאה',
    ]);
  });
});

test.describe('hash routing and history', () => {
  test('a cold deep link opens on its slide and survives a refresh', async ({ page }) => {
    await open(page, '#4');
    expect(await slideNow(page)).toBe(3);
    await page.reload();
    await page.waitForSelector('.deck-track');
    await page.waitForTimeout(400);
    expect(await slideNow(page)).toBe(3);
  });

  test('the gate is the bare URL, never #1', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => location.hash)).toBe('');
    await page.locator('.deck-dot').nth(2).click();
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => location.hash)).toBe('#3');
    await page.locator('.deck-dot').nth(0).click();
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('the deck adds one history entry, so two Backs leave the page', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => history.length);
    for (const n of [1, 2, 3, 4, 5]) {
      await page.locator('.deck-dot').nth(n).click();
      await page.waitForTimeout(400);
    }
    // §2: the first move pushes, every move after it replaces.
    expect(await page.evaluate(() => history.length)).toBe(before + 1);

    await page.goBack();
    await page.waitForTimeout(400);
    expect(await slideNow(page)).toBe(0);
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('#3-s2 resolves to slide 3 — the stage half is Phase 5, not a 404', async ({ page }) => {
    await open(page, '#3-s2');
    expect(await slideNow(page)).toBe(2);
  });
});

test.describe('the keyboard route', () => {
  test('arrow keys move the deck, mapped spatially in RTL', async ({ page }) => {
    await open(page);
    await page.locator('.deck').focus();
    await page.keyboard.press('ArrowLeft');   // forward: the next slide is to the left
    await page.waitForTimeout(450);
    expect(await slideNow(page)).toBe(1);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(450);
    expect(await slideNow(page)).toBe(0);
    // End crosses five slides, and a smooth scroll takes longer than one
    // fixed wait can honestly guess at.
    await page.keyboard.press('End');
    await expect.poll(() => slideNow(page), { timeout: 3000 }).toBe(5);
  });
});

test.describe('jump mode', () => {
  const dotCentre = async (page: Page, i: number) => {
    const r = await page.locator('.deck-dot').nth(i).boundingBox();
    return { x: r!.x + r!.width / 2, y: r!.y + r!.height / 2 };
  };
  const armed = (page: Page) => page.evaluate(() => document.querySelector('.deck')!.hasAttribute('data-armed'));

  test('press and hold arms, the page scrubs, release lands', async ({ page }) => {
    await open(page);
    const a = await dotCentre(page, 0);
    const b = await dotCentre(page, 3);
    const c = await dotCentre(page, 5);

    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    expect(await armed(page), 'not armed before ~400ms').toBe(false);

    await page.waitForTimeout(400);
    expect(await armed(page), 'armed after the hold').toBe(true);
    // §3: the strip goes to full strength and the page behind drops to ~40%.
    // Waited for rather than sampled: the dim is a 120ms transition, and a
    // loaded runner can read it mid-flight.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.deck-track')!).opacity))
      .toBe('0.4');
    // Arming must cancel the deck's own snap or the two gestures fight.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.deck-track')!).scrollSnapType)).toBe('none');

    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.waitForTimeout(150);
    expect(await slideNow(page), 'the page scrubs live under the finger').toBe(3);

    await page.mouse.move(c.x, c.y, { steps: 6 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(350);

    // The mode ends with the finger: nothing to dismiss, nothing left on.
    expect(await armed(page)).toBe(false);
    expect(await slideNow(page)).toBe(5);
    expect(await page.evaluate(() => location.hash), 'the landing is recorded').toBe('#6');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.deck-track')!).opacity))
      .toBe('1');
  });

  test('a finger that travels before the hold is a swipe, not an arm', async ({ page }) => {
    await open(page);
    const a = await dotCentre(page, 0);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y, { steps: 4 });
    await page.waitForTimeout(500);
    expect(await armed(page)).toBe(false);
    await page.mouse.up();
  });

  test('the strip refuses the browser the drag and the selection', async ({ page }) => {
    await open(page);
    const css = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.deck-dots')!);
      return { select: s.userSelect, touch: s.touchAction };
    });
    // touch-action:none is what stops the browser claiming the drag before the
    // scrub can have it; user-select:none stops the hold selecting the row.
    expect(css.touch).toBe('none');
    expect(css.select).toBe('none');

    // The third part of §3's platform note - -webkit-touch-callout:none, which
    // suppresses iOS's selection callout and magnifier - cannot be asserted
    // here: the property is Safari's, and Chromium reports it as the empty
    // string whether or not it was declared. It is declared in globals.css and
    // it is gate 1's third check, on the phone, which is where the callout
    // exists to be seen.
  });
});

test.describe('jump mode under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the scrub becomes a jump on release, and the dim stays', async ({ page }) => {
    await open(page);
    const a = await (async () => { const r = await page.locator('.deck-dot').nth(0).boundingBox(); return { x: r!.x + r!.width / 2, y: r!.y + r!.height / 2 }; })();
    const c = await (async () => { const r = await page.locator('.deck-dot').nth(5).boundingBox(); return { x: r!.x + r!.width / 2, y: r!.y + r!.height / 2 }; })();

    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(550);
    // The dim is state rather than motion, so it stays.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.deck-track')!).opacity)).toBe('0.4');

    await page.mouse.move(c.x, c.y, { steps: 8 });
    await page.waitForTimeout(200);
    expect(await slideNow(page), 'the page does not scrub under the finger').toBe(0);

    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await slideNow(page), 'it jumps on release').toBe(5);
    expect(await page.evaluate(() => location.hash)).toBe('#6');
  });
});
