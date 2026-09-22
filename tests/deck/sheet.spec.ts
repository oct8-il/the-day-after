import { test, expect, type Page } from '@playwright/test';

/**
 * The reading sheet (DIA-413, spec §5) and its four gestures (DIA-427).
 *
 * A slide never scrolls. The reading continues in a sheet that opens above the
 * deck, aligned to the card it came from, and the whole reason it is not
 * inside the track is that everything below would be false there: one plain
 * vertical scroller, one surface a screen reader can see, one history entry
 * that is given back.
 *
 * Slide 2 is the pattern; a stage page is the same sheet with a head group
 * above the reading and a locator beside it, so both are asserted here rather
 * than the rule being written twice.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' }, hasTouch: true });

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

/** Slide 2, arrived at the way a reader arrives: with something behind them. */
async function open2(page: Page, id = 't01') {
  await page.goto(`/item/${id}/`);
  await page.waitForSelector('.deck-gate-rail');
  await page.evaluate(() => { location.hash = '#2'; });
  await page.waitForSelector('.deck-card[data-card="ov"]');
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(600);
}

/** Slide 3, on whichever stage it opens. Returns that page's card id. */
async function open3(page: Page, id = 't01') {
  await page.goto(`/item/${id}/`);
  await page.waitForSelector('.deck-gate-rail');
  await page.evaluate(() => { location.hash = '#3'; });
  await page.waitForSelector('.deck-stack');
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const stack = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!;
    const i = Math.round(stack.scrollTop / stack.clientHeight);
    return [...stack.querySelectorAll('.deck-stage')][i]!.querySelector('.deck-card')!.getAttribute('data-card')!;
  });
}

/** The first three blocks of a column, as boxes. */
const blocks = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const root = document.querySelector(s)!;
    return [...root.children]
      .filter((e) => !(e as HTMLElement).hidden)
      .slice(0, 3)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName, top: Math.round(r.top), right: Math.round(r.right), width: Math.round(r.width) };
      });
  }, sel);

const openFrom = (page: Page, sel: string) => page.evaluate((s) => {
  document.querySelector<HTMLElement>(s)!.click();
}, sel);

test.describe('it is not inside the track', () => {
  test('the sheets are rendered beside the track, not in a slide', async ({ page }) => {
    await open2(page);
    const where = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll('.deck-sheet')];
      return {
        n: sheets.length,
        inTrack: sheets.filter((s) => s.closest('.deck-track')).length,
        host: sheets.every((s) => s.parentElement?.classList.contains('deck-sheets')),
        hidden: sheets.every((s) => s.hasAttribute('hidden')),
      };
    });
    expect(where.n).toBeGreaterThan(1);
    expect(where.inTrack).toBe(0);
    expect(where.host).toBe(true);
    // A cold load never opens on a sheet.
    expect(where.hidden).toBe(true);
  });

  test('its scroller has no horizontal ancestor, and does not scroll sideways', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-scroll')!;
      let e: HTMLElement | null = sc.parentElement;
      const across: string[] = [];
      while (e) {
        if (e.scrollWidth - e.clientWidth > 1) across.push(e.className);
        e = e.parentElement;
      }
      return {
        across,
        y: sc.scrollHeight - sc.clientHeight,
        x: sc.scrollWidth - sc.clientWidth,
        contain: getComputedStyle(sc).overscrollBehaviorY,
        snap: getComputedStyle(sc).scrollSnapType,
      };
    });
    expect(m.across).toEqual([]);
    expect(m.y).toBeGreaterThan(0);
    expect(m.x).toBe(0);
    expect(m.contain).toBe('contain');
    expect(m.snap).toBe('none');
  });
});

test.describe('it opens in place, aligned', () => {
  test('slide 2: the first three blocks land exactly where they were', async ({ page }) => {
    await open2(page);
    const before = await blocks(page, '.deck-card[data-card="ov"] .deck-read');
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const after = await blocks(page, '#sheet-ov .deck-sheet-body .deck-read');
    expect(before).toHaveLength(3);
    expect(after).toEqual(before);
  });

  test("a stage page: the same, with the head group and the locator's gutter", async ({ page }) => {
    const id = await open3(page);
    const before = await blocks(page, `.deck-card[data-card="${id}"]`);
    await openFrom(page, `.deck-card[data-card="${id}"] .deck-more`);
    await page.waitForTimeout(600);
    const after = await blocks(page, `#sheet-${id} .deck-sheet-body`);
    // The card's first child is the label, which becomes the bar's chip; the
    // blocks that must agree are the ones after it.
    expect(before.slice(1)).toEqual(after.slice(0, before.length - 1));
    // §6's column: 36px on the physical right to clear the locator, 20 left.
    expect(390 - before[1]!.right).toBe(36);
  });

  test("the bar ends where the card's content begins, and it opens unscrolled", async ({ page }) => {
    await open2(page);
    const first = await page.evaluate(() =>
      Math.round(document.querySelector('.deck-card[data-card="ov"] .deck-read')!.getBoundingClientRect().top));
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('#sheet-ov .deck-sheet-bar')!.getBoundingClientRect();
      const sc = document.querySelector('#sheet-ov .deck-sheet-scroll')!;
      return { bottom: Math.round(bar.bottom), top: Math.round(bar.top), scrollTop: sc.scrollTop };
    });
    expect(m.top).toBe(0);
    expect(m.bottom).toBe(first);
    expect(m.scrollTop).toBe(0);
  });

  test('the locator stays where it was, and stays an indicator', async ({ page }) => {
    const id = await open3(page);
    const slide = await page.evaluate(() => {
      const r = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-loc')!.getBoundingClientRect();
      return { top: Math.round(r.top), right: Math.round(r.right) };
    });
    await openFrom(page, `.deck-card[data-card="${id}"] .deck-more`);
    await page.waitForTimeout(600);
    const m = await page.evaluate((s) => {
      const loc = document.querySelector(`${s} .deck-loc`)!;
      const r = loc.getBoundingClientRect();
      return {
        top: Math.round(r.top), right: Math.round(r.right),
        rings: loc.querySelectorAll('.deck-loc-rung[data-on]').length,
        controls: loc.querySelectorAll('button,a,[role="button"]').length,
        seen: !!(r.width && r.height),
      };
    }, `#sheet-${id}`);
    expect(m.seen).toBe(true);
    expect({ top: m.top, right: m.right }).toEqual(slide);
    expect(m.rings).toBe(1);
    expect(m.controls).toBe(0);
  });
});

test.describe('the bar', () => {
  test('slide 2 keeps its pill; a stage wears its own tag in its own colour', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const pill = await page.evaluate(() => {
      const c = document.querySelector('#sheet-ov .deck-sheet-chip > *')!;
      const s = getComputedStyle(c);
      return { text: (c.textContent ?? '').trim(), radius: parseFloat(s.borderTopLeftRadius) };
    });
    expect(pill.text).toBe('סקירת הכשל');
    expect(pill.radius).toBeGreaterThanOrEqual(999);

    const id = await open3(page);
    await openFrom(page, `.deck-card[data-card="${id}"] .deck-more`);
    await page.waitForTimeout(600);
    const tag = await page.evaluate((s) => {
      const c = document.querySelector(`${s} .deck-sheet-chip > *`)!;
      const st = getComputedStyle(c);
      return {
        text: (c.textContent ?? '').trim(),
        radius: st.borderTopLeftRadius,
        size: st.fontSize,
        weight: st.fontWeight,
        ground: st.backgroundColor,
      };
    }, `#sheet-${id}`);
    expect(tag.text).toMatch(/^\d · /);
    expect(tag.radius).toBe('3px');
    expect(tag.size).toBe('16px');
    expect(tag.weight).toBe('700');
    expect(tag.ground).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the × is at the physical left, and it is a 44px target', async ({ page }) => {
    // §2's RTL trap: inset-inline-end resolves to the left here, so the
    // placement is asserted on the measured box and not on a property name.
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const x = document.querySelector('#sheet-ov .deck-sheet-x')!.getBoundingClientRect();
      const chip = document.querySelector('#sheet-ov .deck-sheet-chip')!.getBoundingClientRect();
      return {
        left: Math.round(x.left), width: Math.round(x.width), height: Math.round(x.height),
        clear: x.right <= chip.left + 0.5,
        centred: Math.abs((chip.left + chip.right) / 2 - 195),
      };
    });
    expect(m.left).toBeLessThan(16);
    expect(m.width).toBe(44);
    expect(m.height).toBe(44);
    expect(m.clear).toBe(true);
    // The chip is centred on the frame, not on what the × leaves over.
    expect(m.centred).toBeLessThan(2);
  });
});

test.describe('the entrances', () => {
  /**
   * An entrance is read off the animation rather than sampled after a wait.
   * An ease-out does most of its travel early, so "60ms in" is a race with
   * the harness; the animation's own name, duration and keyframes are facts.
   *
   * Neither entrance starts on the frame of the tap: the sheet is unhidden
   * parked (`data-in="pre"` or `"pre-fade"`) and set going once it has been
   * laid out and painted, so the first frames are not lost to the layout of a
   * screen of reading. The read waits for that.
   */
  const entrance = async (page: Page, sel: string, how: 'fade' | 'cover') => {
    await page.evaluate((s) => document.querySelector<HTMLElement>(s)!.click(), sel);
    await page.waitForFunction(
      (h) => document.querySelector('#sheet-ov')?.getAttribute('data-in') === h, how);
    return page.evaluate(() => {
      const el = document.querySelector('#sheet-ov')!;
      const a = el.getAnimations()[0] as (Animation & { animationName?: string }) | undefined;
      const kf = (a?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      const lip = getComputedStyle(el, '::before');
      return {
        how: el.getAttribute('data-in'),
        name: a?.animationName ?? null,
        ms: (a?.effect?.getTiming().duration ?? null) as number | null,
        from: kf[0] as Record<string, string> | undefined,
        to: kf[kf.length - 1] as Record<string, string> | undefined,
        props: Object.keys(kf[0] ?? {}).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
        lip: { shadow: lip.boxShadow, radius: lip.borderTopLeftRadius, bottom: lip.bottom, height: el.getBoundingClientRect().height },
        top: Math.round(el.getBoundingClientRect().top),
        dim: document.querySelector('.deck')!.hasAttribute('data-dim'),
      };
    });
  };

  test('from the button it appears in place: a short fade, nothing travelling', async ({ page }) => {
    // §5. The reader pressed a button, so the sheet has nothing to announce -
    // and the slide behind is not dimmed, because nothing is covering it.
    await open2(page);
    const m = await entrance(page, '.deck-card[data-card="ov"] .deck-more', 'fade');
    expect(m.name).toBe('deck-sheet-fade');
    expect(m.ms).toBe(160);
    expect(m.props).toEqual(['opacity']);
    expect(m.from?.opacity).toBe('0');
    expect(m.to?.opacity).toBe('1');
    // Nothing travels: it is where it will be from the first frame.
    expect(m.top).toBe(0);
    expect(m.dim).toBe(false);
  });

  test('from a citation it covers from the bottom up, shadowed, and dims the slide', async ({ page }) => {
    await open2(page);
    const m = await entrance(page, '.deck-card[data-card="ov"] .deck-read .chip', 'cover');
    expect(m.name).toBe('deck-sheet-cover');
    expect(m.ms).toBe(300);
    // Up from the bottom, moving nothing but transform.
    expect(m.from?.transform).toBe('translateY(100%)');
    expect(m.to?.transform).toBe('translateY(0px)');
    expect(m.props).toEqual(['transform']);
    // The shadowed, rounded leading edge is the lip above the sheet's box;
    // it squares off by leaving the frame, not by animating.
    expect(m.lip.shadow).toContain('-14px');
    expect(m.lip.radius).toBe('18px');
    // bottom:100% - the whole lip sits above the sheet's box.
    expect(m.lip.bottom).toBe(`${m.lip.height}px`);
    expect(m.dim).toBe(true);

    await page.waitForTimeout(600);
    expect(await page.evaluate(() =>
      Math.round(document.querySelector('#sheet-ov')!.getBoundingClientRect().top))).toBe(0);
  });

  test('the cover is an ease-out over the whole duration, not a jump', async ({ page }) => {
    // The first curve put both control points' y near 1 by x = .3, so the
    // sheet travelled the whole frame in the first fifth of its duration and
    // sat still for the rest. At real speed that reads as a cut, not a cover.
    await open2(page);
    await page.evaluate(() => document.querySelector<HTMLElement>('.deck-card[data-card="ov"] .deck-read .chip')!.click());
    await page.waitForFunction(() => document.querySelector('#sheet-ov')?.getAttribute('data-in') === 'cover');
    const by = await page.evaluate(() => {
      const el = document.querySelector('#sheet-ov')!;
      const a = el.getAnimations()[0]!;
      a.pause();
      const frame = el.getBoundingClientRect().height;
      const ms = a.effect!.getTiming().duration as number;
      return [0.25, 0.5, 0.75].map((f) => {
        a.currentTime = ms * f;
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return Math.round(((frame - m.m42) / frame) * 100);
      });
    });
    // Decelerating: past halfway by a quarter of the time, and never done
    // before the duration is.
    expect(by[0]!).toBeGreaterThan(30);
    expect(by[0]!).toBeLessThan(65);
    expect(by[1]!).toBeGreaterThan(by[0]!);
    expect(by[1]!).toBeLessThan(90);
    expect(by[2]!).toBeLessThan(99);
  });

  /**
   * It leaves the way it came. A reversed *direction* on the same keyframes is
   * not a new animation, so each exit is its own: the sheet has to leave, not
   * sit at the end of an animation that already finished.
   */
  for (const [what, sel, how, name, ms] of [
    ['the button', '.deck-card[data-card="ov"] .deck-more', 'fade', 'deck-sheet-unfade', 160],
    ['a citation', '.deck-card[data-card="ov"] .deck-read .chip', 'cover', 'deck-sheet-uncover', 300],
  ] as const) {
    test(`opened from ${what}, it leaves the way it came`, async ({ page }) => {
      await open2(page);
      await openFrom(page, sel);
      await page.waitForFunction((h) =>
        document.querySelector('#sheet-ov')?.getAttribute('data-in') === h, how);
      await page.waitForTimeout(500);

      const out = await page.evaluate(async () => {
        document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-x')!.click();
        // One frame, so the exit's animation has been created - and well
        // short of the time it runs for, so nothing here races the clock.
        await new Promise((r) => requestAnimationFrame(r));
        const el = document.querySelector('#sheet-ov')!;
        const a = el.getAnimations()[0] as (Animation & { animationName?: string }) | undefined;
        const kf = (a?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
        return {
          out: el.getAttribute('data-out'),
          name: a?.animationName ?? null,
          ms: (a?.effect?.getTiming().duration ?? null) as number | null,
          first: kf[0] as Record<string, string> | undefined,
          last: kf[kf.length - 1] as Record<string, string> | undefined,
        };
      });
      expect(out.out).toBe(how);
      expect(out.name).toBe(name);
      expect(out.ms).toBe(ms);
      if (how === 'cover') {
        expect(out.first?.transform).toBe('translateY(0px)');
        expect(out.last?.transform).toBe('translateY(100%)');
      } else {
        expect(out.first?.opacity).toBe('1');
        expect(out.last?.opacity).toBe('0');
      }

      await page.waitForTimeout(600);
      expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(true);
    });
  }

  test('reduced motion makes both instant', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce', hasTouch: true });
    const page = await ctx.newPage();
    for (const sel of ['.deck-card[data-card="ov"] .deck-read .chip', '.deck-card[data-card="ov"] .deck-more']) {
      await open2(page);
      await openFrom(page, sel);
      // No wait at all: under reduced motion the sheet is simply there.
      const m = await page.evaluate(() => {
        const el = document.querySelector('#sheet-ov')!;
        return {
          how: el.getAttribute('data-in'),
          top: Math.round(el.getBoundingClientRect().top),
          animations: el.getAnimations().length,
          dim: document.querySelector('.deck')!.hasAttribute('data-dim'),
        };
      });
      expect(m, sel).toEqual({ how: 'still', top: 0, animations: 0, dim: false });

      await page.evaluate(() => document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-x')!.click());
      expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(true);
    }
    await ctx.close();
  });
});

test.describe('the ways out', () => {
  test('Back closes the sheet and nothing else, and gives the entry back', async ({ page }) => {
    await open2(page);
    const url = page.url();
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);

    await page.goBack();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(true);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('1');

    // And §2's own rule is whole again: the next Back is the deck's.
    await page.goBack();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('0');
  });

  test('the × and Escape close it, and focus returns to the opener', async ({ page }) => {
    await open2(page);
    await page.click('.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('deck-sheet-x');

    await page.click('#sheet-ov .deck-sheet-x');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('deck-more');

    await page.click('.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => ({
      hidden: document.querySelector('#sheet-ov')!.hasAttribute('hidden'),
      focus: document.activeElement?.className,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }));
    expect(m.hidden).toBe(true);
    expect(m.focus).toContain('deck-more');
    expect(m.at).toBe('1');
  });

  test('while it is open the deck behind is inert, and the arrows do nothing', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => ({
      inert: document.querySelector('.deck-track')!.hasAttribute('inert'),
      modal: document.querySelector('#sheet-ov')!.getAttribute('aria-modal'),
      role: document.querySelector('#sheet-ov')!.getAttribute('role'),
      labelled: document.getElementById(
        document.querySelector('#sheet-ov')!.getAttribute('aria-labelledby')!)?.textContent?.trim(),
    }));
    expect(m.inert).toBe(true);
    expect(m.modal).toBe('true');
    expect(m.role).toBe('dialog');
    expect(m.labelled).toBe('סקירת הכשל');

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('1');
  });
});

test.describe('what the sheet holds', () => {
  test('the whole reading, then מקורות, then the carousel', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const body = document.querySelector('#sheet-ov .deck-sheet-body')!;
      const read = body.querySelector('.deck-read')!;
      const h = body.querySelector('.deck-sheet-h')!;
      const rail = document.querySelector('#sheet-ov .deck-ov-sources')!;
      return {
        heading: (h.textContent ?? '').trim(),
        order: read.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 1
          && h.getBoundingClientRect().bottom <= rail.getBoundingClientRect().top + 1,
        cards: rail.querySelectorAll('.deck-ov-card').length,
        railX: rail.scrollWidth - rail.clientWidth,
        // The reading is not cut in the sheet: it is the reading.
        mask: getComputedStyle(read).webkitMaskImage,
      };
    });
    expect(m.heading).toBe('מקורות');
    expect(m.order).toBe(true);
    expect(m.cards).toBeGreaterThan(0);
    expect(m.railX).toBeGreaterThan(0);
    expect(m.mask).toBe('none');
  });

  test('the drawers are in the sheet, and only there', async ({ page }) => {
    await open2(page);
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-track .deck-drawer').length)).toBe(0);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const chip = document.querySelectorAll<HTMLElement>('#sheet-ov .deck-read button.chip')[1]!;
      chip.click();
      const d = document.getElementById(chip.getAttribute('aria-controls')!)!;
      return {
        expanded: chip.getAttribute('aria-expanded'),
        shown: !d.hasAttribute('hidden'),
        inSheet: !!d.closest('#sheet-ov'),
        quote: (d.querySelector('.deck-drawer-quote')?.textContent ?? '').trim().length,
      };
    });
    expect(m.expanded).toBe('true');
    expect(m.shown).toBe(true);
    expect(m.inSheet).toBe(true);
    expect(m.quote).toBeGreaterThan(0);
  });

  test('closing the sheet closes the drawer', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('#sheet-ov .deck-read button.chip')[1]!.click());
    await page.waitForTimeout(600);
    await page.click('#sheet-ov .deck-sheet-x');
    await page.waitForTimeout(600);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() =>
      document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden])').length)).toBe(0);
  });

  test('a stage sheet opens with the head group, so the reading does not jump', async ({ page }) => {
    const id = await open3(page);
    await openFrom(page, `.deck-card[data-card="${id}"] .deck-more`);
    await page.waitForTimeout(600);
    const m = await page.evaluate((s) => {
      const body = document.querySelector(`${s} .deck-sheet-body`)!;
      const head = body.querySelector('.deck-shead');
      return {
        head: !!head,
        first: body.firstElementChild === head,
        name: (head?.querySelector('.deck-shead-n')?.textContent ?? '').trim(),
      };
    }, `#sheet-${id}`);
    expect(m.head).toBe(true);
    expect(m.first).toBe(true);
    expect(m.name.length).toBeGreaterThan(1);
  });
});

/**
 * DIA-417. An accelerator and nothing more: the × and Back remain, and
 * nothing here becomes gesture-only.
 */
/**
 * The sheet under a finger (DIA-427).
 *
 * Four gestures: a swipe up on the card opens it and keeps scrolling it, and
 * a swipe up at the end, sideways from anywhere, or down at the top closes
 * it. Every one is an accelerator - the button, the ×, Escape and Back all
 * still do what they did, which is asserted above and not repeated here.
 *
 * Real touch over CDP: Playwright has taps, not pans, and a mouse drag pans
 * nothing.
 */
test.describe('under a finger', () => {
  /** One finger, dispatched in steps so the handler sees it move. */
  async function drag(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    opts?: { steps?: number; ms?: number; hold?: boolean },
  ) {
    const steps = opts?.steps ?? 10;
    const ms = opts?.ms ?? 400;
    const cdp = await page.context().newCDPSession(page);
    const at = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    } as never);
    await at('touchStart', from.x, from.y);
    for (let i = 1; i <= steps; i += 1) {
      await at('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await page.waitForTimeout(ms / steps);
    }
    if (opts?.hold) return cdp;
    await at('touchEnd', to.x, to.y);
    await cdp.detach();
    return null;
  }

  const shown = (page: Page) => page.evaluate(() =>
    !document.querySelector('#sheet-ov')!.hasAttribute('hidden'));

  const box = (page: Page) => page.evaluate(() => {
    const el = document.querySelector('#sheet-ov')!;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), opacity: parseFloat(getComputedStyle(el).opacity) };
  });

  /**
   * A drag that arms a gesture, then travels a known distance, and reports
   * where the sheet was at each of the two moments.
   *
   * Two things make a naive drag unmeasurable. The gesture's origin is the
   * point at which the mode was chosen, not the touch's start - as in the
   * mock - so a follow ratio can only be read from the travel after it. And
   * the browser has a touch slop of its own: it reports no `touchmove` at all
   * until the finger has moved ~16px, so the arming move is never the small
   * one a test dispatches. Hence: arm, read, travel, read, and assert the
   * difference.
   */
  async function armThen(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
    const cdp = await page.context().newCDPSession(page);
    const at = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    } as never);
    const nx = by.x === 0 ? 0 : Math.sign(by.x) * 30;
    const ny = by.y === 0 ? 0 : Math.sign(by.y) * 30;
    await at('touchStart', from.x, from.y);
    await page.waitForTimeout(40);
    // Past the browser's slop: this move is the one that picks the mode.
    await at('touchMove', from.x + nx, from.y + ny);
    await page.waitForTimeout(80);
    const armed = await box(page);

    for (let i = 1; i <= 6; i += 1) {
      await at('touchMove', from.x + nx + (by.x * i) / 6, from.y + ny + (by.y * i) / 6);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(120);
    const moved = await box(page);
    return {
      armed,
      moved,
      end: async () => {
        await at('touchEnd', from.x + nx + by.x, from.y + ny + by.y);
        await cdp.detach();
      },
    };
  }

  const scrollTop = (page: Page) => page.evaluate(() =>
    document.querySelector('#sheet-ov .deck-sheet-scroll')!.scrollTop);

  test.describe('1 · a swipe up on the card opens it, on the move', () => {
    test('the card lifts, the sheet opens at 40px, and the same finger scrolls it', async ({ page }) => {
      await open2(page);
      const cdp = (await drag(page, { x: 195, y: 500 }, { x: 195, y: 470 }, { hold: true }))!;
      const at30 = await page.evaluate(() => ({
        lift: document.querySelector('.deck-card[data-card="ov"]')!.hasAttribute('data-lift'),
        y: new DOMMatrix(getComputedStyle(document.querySelector('.deck-card[data-card="ov"]')!).transform).m42,
        open: !document.querySelector('#sheet-ov')!.hasAttribute('hidden'),
      }));
      // 30px of finger, 0.35x of card, and not open yet.
      expect(at30.lift).toBe(true);
      expect(at30.y).toBeCloseTo(-10.5, 0);
      expect(at30.open).toBe(false);

      // Past 40 it opens, in place, while the finger is still down.
      const send = (type: string, y: number) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }],
      } as never);
      await send('touchMove', 440);
      await page.waitForTimeout(60);
      const opened = await page.evaluate(() => ({
        open: !document.querySelector('#sheet-ov')!.hasAttribute('hidden'),
        how: document.querySelector('#sheet-ov')!.getAttribute('data-in'),
        card: getComputedStyle(document.querySelector('.deck-card[data-card="ov"]')!).transform,
      }));
      expect(opened.open).toBe(true);
      // Parked, or already fading - the two frames in between are not a fact
      // a test can hold still.
      expect(['pre-fade', 'fade']).toContain(opened.how);
      // And the card is back where it was: the sheet is what travels now.
      expect(opened.card).toBe('none');

      // And from there the same finger is the scroller.
      await send('touchMove', 340);
      await page.waitForTimeout(60);
      expect(await scrollTop(page)).toBeCloseTo(100, -1);
      await send('touchMove', 240);
      await page.waitForTimeout(60);
      expect(await scrollTop(page)).toBeCloseTo(200, -1);

      await send('touchEnd', 240);
      await cdp.detach();
    });

    test("a sideways drag on the card is still the deck's, and opens nothing", async ({ page }) => {
      await open2(page);
      await drag(page, { x: 195, y: 500 }, { x: 60, y: 480 });
      await page.waitForTimeout(600);
      expect(await shown(page)).toBe(false);
    });

    test("on a stage that can page, the vertical axis stays the stack's", async ({ page }) => {
      // §6: slide 3's stack owns this finger, so the button is the only way
      // in there. Nothing lifts and nothing opens, in either direction.
      const id = await open3(page);
      for (const to of [380, 620]) {
        await drag(page, { x: 195, y: 500 }, { x: 195, y: to });
        await page.waitForTimeout(700);
        expect(await page.evaluate((s) => ({
          sheet: document.getElementById(`sheet-${s}`)!.hasAttribute('hidden'),
          lifted: document.querySelectorAll('.deck-card[data-lift],.deck-card[data-drop]').length,
        }), id)).toEqual({ sheet: true, lifted: 0 });
      }
    });
  });

  test.describe('2 · a swipe up at the end closes it', () => {
    const toEnd = (page: Page) => page.evaluate(() => {
      const sc = document.querySelector('#sheet-ov .deck-sheet-scroll')!;
      sc.scrollTop = sc.scrollHeight - sc.clientHeight;
    });

    test('it is armed only at the end, follows at 0.6x, and fades', async ({ page }) => {
      await open2(page);
      await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
      await page.waitForTimeout(600);

      // Not at the end: an ordinary scroll, and the sheet does not move.
      await drag(page, { x: 195, y: 500 }, { x: 195, y: 380 });
      await page.waitForTimeout(500);
      expect(await shown(page)).toBe(true);
      expect((await box(page)).top).toBe(0);

      await toEnd(page);
      const up = await armThen(page, { x: 195, y: 500 }, { x: 0, y: -60 });
      await up.end();
      // 60px of finger past the arming move moves the sheet 0.6x of that.
      expect(up.moved.top - up.armed.top).toBeCloseTo(-36, -1);
      // The fade is over the finger's own travel, not the sheet's: 1 + d/180.
      expect(up.moved.opacity).toBeCloseTo(1 - 60 / 180, 1);
    });

    test('past 90px it goes; short of it, it springs back', async ({ page }) => {
      await open2(page);
      await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
      await page.waitForTimeout(600);
      await toEnd(page);

      await drag(page, { x: 195, y: 500 }, { x: 195, y: 430 });
      await page.waitForTimeout(500);
      expect(await shown(page)).toBe(true);
      expect(await box(page)).toEqual({ top: 0, left: 0, opacity: 1 });

      await toEnd(page);
      await drag(page, { x: 195, y: 500 }, { x: 195, y: 380 });
      await page.waitForTimeout(700);
      expect(await shown(page)).toBe(false);
      expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('1');
    });
  });

  test.describe('3 · a sideways swipe closes it, either way', () => {
    for (const [way, to] of [['left', 60], ['right', 330]] as const) {
      test(`${way}, past 90px`, async ({ page }) => {
        await open2(page);
        await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
        await page.waitForTimeout(600);
        await drag(page, { x: 195, y: 400 }, { x: to, y: 400 });
        await page.waitForTimeout(700);
        expect(await shown(page)).toBe(false);
      });
    }

    test('it moves 1:1 and fades over 200px; short of 90 it springs back', async ({ page }) => {
      await open2(page);
      await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
      await page.waitForTimeout(600);
      const side = await armThen(page, { x: 195, y: 400 }, { x: -60, y: 0 });
      await side.end();
      expect(side.moved.left - side.armed.left).toBeCloseTo(-60, -1);
      expect(side.moved.opacity).toBeCloseTo(1 - 60 / 200, 1);

      await page.waitForTimeout(500);
      expect(await shown(page)).toBe(true);
      expect(await box(page)).toEqual({ top: 0, left: 0, opacity: 1 });
    });
  });

  test.describe('4 · a swipe down at the top closes it', () => {
    test('1:1, no fade, and past 110px it goes', async ({ page }) => {
      await open2(page);
      await openFrom(page, '.deck-card[data-card="ov"] .deck-read .chip');
      await page.waitForTimeout(700);

      const down = await armThen(page, { x: 195, y: 300 }, { x: 0, y: 80 });
      await down.end();
      expect(down.moved.top - down.armed.top).toBeCloseTo(80, -1);
      // This is the cover leaving the way it came: it does not fade.
      expect(down.moved.opacity).toBe(1);
      await page.waitForTimeout(500);
      expect(await shown(page)).toBe(true);

      await drag(page, { x: 195, y: 260 }, { x: 195, y: 400 });
      await page.waitForTimeout(700);
      expect(await shown(page)).toBe(false);
      expect(await page.evaluate(() => document.activeElement?.className)).toContain('chip');
    });

    test('below the top of the reading a downward drag is an ordinary scroll', async ({ page }) => {
      await open2(page);
      await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
      await page.waitForTimeout(600);
      await page.evaluate(() => { document.querySelector('#sheet-ov .deck-sheet-scroll')!.scrollTop = 200; });
      await page.waitForTimeout(200);

      await drag(page, { x: 195, y: 300 }, { x: 195, y: 440 });
      await page.waitForTimeout(700);
      expect(await shown(page)).toBe(true);
    });
  });

  test('reduced motion: nothing follows the finger, and the threshold still closes it', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce', hasTouch: true });
    const page = await ctx.newPage();
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(400);

    const held = await armThen(page, { x: 195, y: 300 }, { x: 0, y: 80 });
    await held.end();
    // Nothing travelled, at either moment.
    expect(held.armed.top).toBe(0);
    expect(held.moved.top).toBe(0);

    await drag(page, { x: 195, y: 260 }, { x: 195, y: 400 });
    await page.waitForTimeout(400);
    expect(await shown(page)).toBe(false);
    await ctx.close();
  });
});
