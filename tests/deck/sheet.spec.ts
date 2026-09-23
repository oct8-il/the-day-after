import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

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
  await arrived(page);
  await page.evaluate(() => { location.hash = '#2'; });
  await arrived(page);
  await page.waitForSelector('.deck-card[data-card="ov"]');
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(600);
}

/** Slide 3, on whichever stage it opens. Returns that page's card id. */
async function open3(page: Page, id = 't01') {
  await page.goto(`/item/${id}/`);
  await arrived(page);
  await page.evaluate(() => { location.hash = '#3'; });
  await arrived(page);
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

  test('the locator stays where it was, and becomes the way between stages', async ({ page }) => {
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
        jumps: loc.querySelectorAll('.deck-loc-jump').length,
        drawn: loc.querySelectorAll('.deck-loc-rung[data-drawn]').length,
        seen: !!(r.width && r.height),
      };
    }, `#sheet-${id}`);
    expect(m.seen).toBe(true);
    // The same ladder, in the same place: it did not move when it learnt to
    // be pressed (DIA-430).
    expect({ top: m.top, right: m.right }).toEqual(slide);
    expect(m.rings).toBe(1);
    // Here, and only here, every drawn rung is a control - the reading is the
    // surface, so the ladder is the way off it.
    expect(m.controls).toBe(m.jumps);
    expect(m.jumps).toBe(m.drawn);
    expect(m.jumps).toBeGreaterThan(1);
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

      // Back down, in the same gesture: the finger carries the reading with
      // it both ways. Anchored to the opening point instead, this clamped at
      // 0 and then did nothing at all, however far the finger went — which
      // is what DIA-428 felt like.
      await send('touchMove', 440);
      await page.waitForTimeout(60);
      expect(await scrollTop(page)).toBeCloseTo(0, -1);
      await send('touchMove', 340);
      await page.waitForTimeout(60);
      expect(await scrollTop(page)).toBeCloseTo(100, -1);

      await send('touchEnd', 340);
      await cdp.detach();
    });

    test('a sheet opened by a finger does not paint a ring on the ×', async ({ page }) => {
      // DIA-429. Focus still moves - a screen reader needs it to - but there
      // is no keyboard to show a ring to.
      await open2(page);
      const cdp = (await drag(page, { x: 195, y: 500 }, { x: 195, y: 400 }, { hold: true }))!;
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const el = document.querySelector('#sheet-ov')!;
        const x = el.querySelector('.deck-sheet-x')!;
        return {
          quiet: el.hasAttribute('data-quiet'),
          focused: document.activeElement === x,
          // getComputedStyle takes a pseudo-*element*, not a pseudo-class,
          // so this is the outline actually painted on the focused ×.
          outline: getComputedStyle(x).outlineStyle,
        };
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] } as never);
      await cdp.detach();
      expect(m.quiet).toBe(true);
      expect(m.focused).toBe(true);
      expect(m.outline).toBe('none');

      // A key is used: the ring is a ring again.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() =>
        document.querySelector('#sheet-ov')!.hasAttribute('data-quiet'))).toBe(false);
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

/**
 * The whole cited passage is the target (DIA-414).
 *
 * The glyph is 20px: the right size to look at and the wrong size to hit. So
 * the words it ends take the tap, and the glyph stays the one control - which
 * is why every assertion here is made twice over, once about what a finger
 * reaches and once about what the accessibility tree contains.
 *
 * The clicks are the mouse's rather than the touchscreen's on purpose: this is
 * about hit-testing and not about a gesture, and a real click carries the
 * element the point actually landed on, which is the whole claim being tested.
 */
const CARD_P = '.deck-card[data-card="ov"] .deck-read p:has(.chip)';
const SHEET_P = '#sheet-ov .deck-read p:has(.chip)';

/** A point in the words of a passage, well clear of the glyph that ends it. */
const words = (page: Page, sel: string, n = 0) => page.evaluate(({ s, i }) => {
  const p = [...document.querySelectorAll<HTMLElement>(s)][i]!;
  const r = p.getBoundingClientRect();
  const chip = p.querySelector('.chip')!;
  return {
    x: Math.round(r.right - 30),
    y: Math.round(r.top + 10),
    cite: (chip.getAttribute('data-cite') ?? chip.getAttribute('aria-controls'))!,
  };
}, { s: sel, i: n });

/**
 * The passages a finger can actually reach right now, in order: the words of
 * each, and the drawer each one answers to. A passage is a paragraph or a list
 * item, and since DIA-419 an overview is mostly list items - so a test that
 * picked the nth paragraph would be picking whatever the fixture's shape
 * happened to put there, and clicking at a point off the bottom of the frame.
 */
const reachable = (page: Page, root: string) => page.evaluate((r) => {
  const blocks = [...document.querySelectorAll<HTMLElement>(
    `${r} .deck-read p:has(.chip), ${r} .deck-read li:has(.chip)`)];
  return blocks.map((b) => {
    const words = b.matches('li') ? b.querySelector('span')! : b;
    const box = words.getBoundingClientRect();
    const chip = b.querySelector('.chip')!;
    const x = Math.round(box.right - 30);
    const y = Math.round(box.top + 10);
    // Asking the page rather than the geometry: a block clipped by the card's
    // cut still reports a rectangle, and the point inside it may belong to the
    // button standing over it. A finger would hit the button, so a test that
    // "clicks the passage" there is testing nothing.
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      on: box.width > 40 && !!hit && b.contains(hit),
      cite: (chip.getAttribute('data-cite') ?? chip.getAttribute('aria-controls'))!,
    };
  }).filter((p) => p.on);
}, root);

/** One citation's state in the sheet: its drawer, its chip and its passage. */
const cited = (page: Page, id: string) => page.evaluate((cite) => {
  const sheet = document.getElementById('sheet-ov')!;
  const d = document.getElementById(cite)!;
  const chip = sheet.querySelector(`[aria-controls="${CSS.escape(cite)}"]`)!;
  return {
    drawer: !d.hasAttribute('hidden'),
    expanded: chip.getAttribute('aria-expanded'),
    hot: !!chip.closest('.deck-read p,.deck-read li')?.hasAttribute('data-hot'),
    open: sheet.querySelectorAll('.deck-drawer:not([hidden])').length,
    hots: sheet.querySelectorAll('.deck-read [data-hot]').length,
  };
}, id);

test.describe('the whole cited passage is the target', () => {
  test('the card names, on every chip, the drawer the sheet will open', async ({ page }) => {
    // The card has no drawers under its text, but it is the same text as the
    // sheet's, so each chip can say which drawer its passage answers to.
    await open2(page);
    const m = await page.evaluate(() => {
      const cites = [...document.querySelectorAll('.deck-card[data-card="ov"] .deck-read .chip')]
        .map((c) => c.getAttribute('data-cite'));
      return {
        n: cites.length,
        found: cites.filter((c) => !!c && !!document.querySelector(`#sheet-ov #${CSS.escape(c)}`)).length,
      };
    });
    expect(m.n).toBeGreaterThan(2);
    expect(m.found).toBe(m.n);
  });

  test('a stage card names its own sheet’s drawers, not another stage’s', async ({ page }) => {
    // Every stage on the stack, not only the one it rests on: the two copies
    // of a stage's summary used to be given different prefixes, which no
    // single stage could show.
    await open3(page);
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('.deck-stage .deck-card[data-card]')]
        .filter((c) => c.querySelector('.deck-read .chip'));
      let n = 0; let found = 0;
      for (const card of cards) {
        const id = card.getAttribute('data-card')!;
        for (const chip of card.querySelectorAll('.deck-read .chip')) {
          const cite = chip.getAttribute('data-cite');
          n += 1;
          if (cite && document.querySelector(`#sheet-${CSS.escape(id)} #${CSS.escape(cite)}`)) found += 1;
        }
      }
      return { cards: cards.length, n, found };
    });
    expect(m.cards).toBeGreaterThan(0);
    expect(m.n).toBeGreaterThan(0);
    expect(m.found).toBe(m.n);
  });

  test('slide 2: a tap in the middle of a sentence opens the sheet at it', async ({ page }) => {
    await open2(page);
    const w = await words(page, CARD_P);
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(800);

    expect(await page.evaluate(() =>
      !document.getElementById('sheet-ov')!.hasAttribute('hidden'))).toBe(true);
    expect(await cited(page, w.cite)).toEqual({
      drawer: true, expanded: 'true', hot: true, open: 1, hots: 1,
    });
    // Aligned and unscrolled: the sentence is where it was on the slide.
    expect(await page.evaluate(() =>
      document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-scroll')!.scrollTop)).toBe(0);
  });

  test('the sheet lands first and the drawer arrives after it', async ({ page }) => {
    // Two events in sequence, not at once: opening both together would move
    // the reading twice inside 300ms.
    await open2(page);
    const w = await words(page, CARD_P);
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(140);
    const during = await page.evaluate(() => ({
      mode: document.getElementById('sheet-ov')!.getAttribute('data-in'),
      open: document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden])').length,
    }));
    await page.waitForTimeout(700);
    const after = await page.evaluate(() =>
      document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden])').length);
    expect(during.mode).toBe('cover');
    expect(during.open).toBe(0);
    expect(after).toBe(1);
  });

  test('a passage low on the card: it lands aligned, then scrolls the minimum', async ({ page }) => {
    // The one exception to "do not scroll on open". Without it a tap near the
    // floor of the card appears to have done nothing at all.
    await open2(page);
    const all = await reachable(page, '.deck-card[data-card="ov"]');
    const w = all[all.length - 1]!;
    expect(all.length).toBeGreaterThan(2);

    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(1000);
    const m = await page.evaluate((cite) => {
      const sc = document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-scroll')!;
      const b = sc.getBoundingClientRect();
      const p = document.querySelector(`#sheet-ov [aria-controls="${CSS.escape(cite)}"]`)!
        .closest('.deck-read p,.deck-read li')!;
      return {
        below: document.getElementById(cite)!.getBoundingClientRect().bottom - b.bottom,
        passage: p.getBoundingClientRect().top - b.top,
      };
    }, w.cite);
    // The drawer is on the screen, and the sentence it belongs to still is too.
    expect(m.below).toBeLessThanOrEqual(1);
    expect(m.passage).toBeGreaterThanOrEqual(-1);
    expect((await cited(page, w.cite)).hot).toBe(true);
  });

  test('in the sheet a tap on the words toggles the drawer', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);

    const w = await words(page, SHEET_P, 1);
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(500);
    const on = await cited(page, w.cite);

    const again = await words(page, SHEET_P, 1);
    await page.mouse.click(again.x, again.y);
    await page.waitForTimeout(500);
    const off = await cited(page, w.cite);

    expect(on).toEqual({ drawer: true, expanded: 'true', hot: true, open: 1, hots: 1 });
    expect(off).toEqual({ drawer: false, expanded: 'false', hot: false, open: 0, hots: 0 });
  });

  test('the tint moves with the drawer: one passage marked, never two', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);

    const first = await reachable(page, '#sheet-ov');
    const a = first[0]!;
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(500);
    // Re-measured: the first drawer has pushed everything under it down.
    const then = await reachable(page, '#sheet-ov');
    const b = then.find((p) => p.cite !== a.cite)!;
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(500);

    expect(await cited(page, a.cite)).toEqual({
      drawer: false, expanded: 'false', hot: false, open: 1, hots: 1,
    });
    expect(await cited(page, b.cite)).toEqual({
      drawer: true, expanded: 'true', hot: true, open: 1, hots: 1,
    });
  });

  test('a bullet is a passage too, and its words carry the mark', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);

    const w = await page.evaluate(() => {
      const li = document.querySelector<HTMLElement>('#sheet-ov .deck-read li:has(.chip)')!;
      const r = li.querySelector('span')!.getBoundingClientRect();
      return {
        x: Math.round(r.right - 30), y: Math.round(r.top + 8),
        cite: li.querySelector('.chip')!.getAttribute('aria-controls')!,
      };
    });
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(500);
    const m = await page.evaluate((cite) => {
      const li = document.querySelector(`#sheet-ov [aria-controls="${CSS.escape(cite)}"]`)!.closest('li')!;
      return {
        tag: li.tagName,
        hot: li.hasAttribute('data-hot'),
        tint: getComputedStyle(li.querySelector('span')!).backgroundColor,
        drawer: !document.getElementById(cite)!.hasAttribute('hidden'),
      };
    }, w.cite);
    expect(m.tag).toBe('LI');
    expect(m.hot).toBe(true);
    expect(m.drawer).toBe(true);
    // The tint is the words', not the row's: the bullet stands in its own gutter.
    expect(m.tint).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('it tints while it is held, before anything has opened', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);

    const w = await words(page, SHEET_P, 1);
    const flat = await page.evaluate((s) =>
      getComputedStyle(document.querySelectorAll(s)[1]!).backgroundColor, SHEET_P);
    await page.mouse.move(w.x, w.y);
    await page.mouse.down();
    const held = await page.evaluate((s) =>
      getComputedStyle(document.querySelectorAll(s)[1]!).backgroundColor, SHEET_P);
    await page.mouse.up();
    expect(flat).toBe('rgba(0, 0, 0, 0)');
    expect(held).not.toBe(flat);
  });

  test('a tap inside an open drawer is not a passage tap', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const w = await words(page, SHEET_P, 1);
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(500);

    await page.evaluate((cite) => {
      document.querySelector<HTMLElement>(`#${CSS.escape(cite)} .deck-drawer-quote`)!.click();
    }, w.cite);
    await page.waitForTimeout(400);
    // The quote is a paragraph in the same column, and it is evidence, not a claim.
    expect(await cited(page, w.cite)).toEqual({
      drawer: true, expanded: 'true', hot: true, open: 1, hots: 1,
    });
  });

  test('a link inside a passage keeps its own behaviour', async ({ page }) => {
    await open2(page, 't03');
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const n = await page.evaluate(() => {
      const a = document.querySelector<HTMLElement>('#sheet-ov .deck-read p a')!;
      a.addEventListener('click', (e) => e.preventDefault(), { once: true });
      a.click();
      return document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden])').length;
    });
    expect(n).toBe(0);
  });

  test('the passage is a pointer convenience, not a second control', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const ps = [...document.querySelectorAll(
        '#sheet-ov .deck-read p:has(.chip),#sheet-ov .deck-read li:has(.chip)')];
      return {
        n: ps.length,
        roles: ps.filter((p) => p.hasAttribute('role')).length,
        tabbed: ps.filter((p) => p.hasAttribute('tabindex')).length,
        labelled: ps.filter((p) => p.hasAttribute('aria-label')).length,
        controls: document.querySelectorAll('#sheet-ov .deck-read [aria-controls]').length,
        chips: document.querySelectorAll('#sheet-ov .deck-read .chip').length,
        pointer: ps.every((p) => getComputedStyle(p.matches('li') ? p.querySelector('span')! : p).cursor === 'pointer'),
      };
    });
    expect(m.n).toBeGreaterThan(2);
    expect(m.roles).toBe(0);
    expect(m.tabbed).toBe(0);
    expect(m.labelled).toBe(0);
    expect(m.controls).toBe(m.chips);
    expect(m.pointer).toBe(true);
  });
});

/**
 * The source drawer as an excerpt (DIA-426, §5 v3.4).
 *
 * The grey box is gone. What is left is set into the reading rather than laid
 * on top of it: a 2px rule in the source type's colour, a head line, the quote
 * as a newspaper clipping, and the way out. What ties it to its passage is
 * that passage staying tinted above it, which is why there is no container
 * around the two and no close button in the corner.
 *
 * t06's first passage carries two claims, one of them with no quote, so the
 * stacking and the missing quote are the same fixture; t02's one claim has no
 * URL, which is the other absence a drawer has to state rather than hide.
 */
const drawerOf = async (page: Page, id: string, pick = 0) => {
  await open2(page, id);
  await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
  await page.waitForTimeout(600);
  await page.evaluate((i) => {
    document.querySelectorAll<HTMLElement>('#sheet-ov .deck-read button.chip')[i]!.click();
  }, pick);
  await page.waitForTimeout(600);
};

test.describe('the drawer is an excerpt', () => {
  test('no box: a typed rule down the start edge, and nothing drawn around it', async ({ page }) => {
    await drawerOf(page, 't01', 1);
    const m = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden])')!;
      const s = getComputedStyle(d);
      const src = d.querySelector<HTMLElement>('.deck-drawer-src')!;
      const t = getComputedStyle(src);
      return {
        ground: s.backgroundColor,
        border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
        radius: s.borderTopLeftRadius,
        rule: t.borderRightWidth,
        ruleColour: t.borderRightColor,
        // The rule is the type's colour, and the head is drawn in the same one.
        headColour: getComputedStyle(d.querySelector('.deck-drawer-head')!).color,
        otherRules: [t.borderTopWidth, t.borderBottomWidth, t.borderLeftWidth],
        padRight: t.paddingRight,
        padLeft: t.paddingLeft,
      };
    });
    expect(m.ground).toBe('rgba(0, 0, 0, 0)');
    expect(m.border).toEqual(['0px', '0px', '0px', '0px']);
    expect(m.radius).toBe('0px');
    expect(m.rule).toBe('2px');
    expect(m.otherRules).toEqual(['0px', '0px', '0px']);
    expect(m.ruleColour).toBe(m.headColour);
    expect(m.ruleColour).not.toBe('rgba(0, 0, 0, 0)');
    expect(m.padRight).toBe('14px');
    expect(m.padLeft).toBe('0px');
  });

  test('it sits 12px under its passage, and two claims stack 14px apart', async ({ page }) => {
    await drawerOf(page, 't06', 0);
    const m = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden])')!;
      const src = [...d.querySelectorAll<HTMLElement>('.deck-drawer-src')];
      const passage = d.previousElementSibling!.getBoundingClientRect();
      return {
        n: src.length,
        under: Math.round(d.getBoundingClientRect().top - passage.bottom),
        between: Math.round(src[1]!.getBoundingClientRect().top - src[0]!.getBoundingClientRect().bottom),
      };
    });
    expect(m.n).toBe(2);
    expect(m.under).toBe(12);
    expect(m.between).toBe(14);
  });

  test('the head is the outlet, the type and the date, in that order', async ({ page }) => {
    await drawerOf(page, 't01', 1);
    const m = await page.evaluate(() => {
      const head = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden]) .deck-drawer-head')!;
      const kid = (sel: string) => {
        const e = head.querySelector<HTMLElement>(sel)!;
        const s = getComputedStyle(e);
        return { size: s.fontSize, weight: s.fontWeight, colour: s.color, text: e.textContent!.trim() };
      };
      return {
        order: [...head.children].map((e) => e.className || 'sep'),
        gap: getComputedStyle(head).columnGap,
        name: kid('.deck-drawer-name'),
        type: kid('.deck-drawer-type'),
        date: kid('.deck-drawer-date'),
        ltr: head.querySelector('.deck-drawer-date')!.getAttribute('dir'),
        // The middle dot is the design's, not a word for a screen reader.
        sep: head.querySelector('[aria-hidden="true"]')!.textContent,
      };
    });
    expect(m.order).toEqual(['deck-drawer-name', 'sep', 'deck-drawer-type', 'deck-drawer-date']);
    expect(m.gap).toBe('6px');
    expect(m.name.size).toBe('14px');
    // `<b>` inside a 700 head computes to `bolder`, which is 900 - and 900
    // has no face, so it is drawn with the 700 one. The spec's own screen says
    // the same thing, so the assertion is "at least bold" rather than a number.
    expect(Number(m.name.weight)).toBeGreaterThanOrEqual(700);
    expect(m.type.size).toBe('12.5px');
    expect(m.type.colour).toBe(m.type.colour);
    expect(m.date.size).toBe('12.5px');
    expect(m.date.weight).toBe('400');
    expect(m.ltr).toBe('ltr');
    expect(m.sep).toBe('·');
    // The outlet is the reading's ink; the type is the type's colour.
    expect(m.name.colour).not.toBe(m.type.colour);
  });

  test('the quote is a newspaper clipping: paper, black ink, italic serif', async ({ page }) => {
    await drawerOf(page, 't01', 1);
    const m = await page.evaluate(() => {
      const q = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden]) .deck-drawer-quote')!;
      const s = getComputedStyle(q);
      return {
        paper: s.backgroundColor,
        ink: s.color,
        family: s.fontFamily,
        style: s.fontStyle,
        size: s.fontSize,
        leading: s.lineHeight,
        pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
        margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft],
        torn: s.clipPath.startsWith('polygon('),
        // Unclamped: the schema caps a quote at 280 characters already.
        clamp: s.webkitLineClamp,
        marks: q.textContent!.trim(),
      };
    });
    expect(m.paper).toBe('rgb(232, 225, 211)');
    expect(m.ink).toBe('rgb(31, 28, 23)');
    expect(m.family).toContain('Frank Ruhl Libre');
    expect(m.style).toBe('italic');
    expect(m.size).toBe('16.5px');
    expect(m.leading).toBe('24.75px');
    expect(m.pad).toEqual(['13px', '12px', '13px', '12px']);
    expect(m.margin).toEqual(['0px', '0px', '0px', '0px']);
    expect(m.torn).toBe(true);
    expect(m.clamp === 'none' || m.clamp === '' || m.clamp === 'auto').toBe(true);
    expect(m.marks.startsWith('„')).toBe(true);
    expect(m.marks.endsWith('“')).toBe(true);
  });

  test('the tear is one fixed polygon, the same on every excerpt and every open', async ({ page }) => {
    // A tear that changed between two renders of the same quote would be an
    // animation nobody asked for.
    await drawerOf(page, 't06', 0);
    const first = await page.evaluate(() =>
      [...document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden]) .deck-drawer-quote')]
        .map((q) => getComputedStyle(q).clipPath));
    await page.evaluate(() => {
      const c = document.querySelectorAll<HTMLElement>('#sheet-ov .deck-read button.chip');
      c[0]!.click(); c[0]!.click();
    });
    await page.waitForTimeout(600);
    const again = await page.evaluate(() =>
      getComputedStyle(document.querySelector('#sheet-ov .deck-drawer:not([hidden]) .deck-drawer-quote')!).clipPath);
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('polygon(');
    expect(again).toBe(first[0]);
  });

  test('the way out is its own line, and the quote stays selectable', async ({ page }) => {
    await drawerOf(page, 't01', 1);
    const m = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden])')!;
      const go = d.querySelector<HTMLAnchorElement>('a.deck-drawer-go')!;
      const q = d.querySelector<HTMLElement>('.deck-drawer-quote')!;
      const s = getComputedStyle(go);
      return {
        text: go.textContent!.trim(),
        target: go.target,
        rel: go.rel,
        href: go.getAttribute('href')!.startsWith('http'),
        size: s.fontSize,
        weight: s.fontWeight,
        // A link wrapping the clipping would make the quote unselectable.
        wrapped: !!q.closest('a'),
        select: getComputedStyle(q).userSelect,
      };
    });
    expect(m.text.startsWith('לפתיחת המקור')).toBe(true);
    expect(m.target).toBe('_blank');
    expect(m.rel).toContain('noopener');
    expect(m.href).toBe(true);
    expect(m.size).toBe('12.5px');
    expect(m.weight).toBe('600');
    expect(m.wrapped).toBe(false);
    expect(m.select).not.toBe('none');
  });

  test('a claim with no quote still opens, and says the quote is missing', async ({ page }) => {
    await drawerOf(page, 't06', 0);
    const m = await page.evaluate(() => {
      const src = [...document.querySelectorAll<HTMLElement>('#sheet-ov .deck-drawer:not([hidden]) .deck-drawer-src')];
      const bare = src.find((s) => !s.querySelector('.deck-drawer-quote'))!;
      return {
        found: !!bare,
        said: bare.querySelector('.deck-drawer-noq')!.textContent!.trim(),
        rule: getComputedStyle(bare).borderRightWidth,
        head: !!bare.querySelector('.deck-drawer-name')!.textContent!.trim(),
        out: !!bare.querySelector('.deck-drawer-go'),
      };
    });
    expect(m.found).toBe(true);
    expect(m.said.length).toBeGreaterThan(4);
    expect(m.rule).toBe('2px');
    expect(m.head).toBe(true);
    expect(m.out).toBe(true);
  });

  test('a claim with no link says so rather than pointing nowhere', async ({ page }) => {
    await drawerOf(page, 't02', 0);
    const m = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden])')!;
      const go = d.querySelector<HTMLElement>('.deck-drawer-go')!;
      return { tag: go.tagName, dead: go.hasAttribute('data-dead'), text: go.textContent!.trim(), anchors: d.querySelectorAll('a').length };
    });
    expect(m.tag).toBe('SPAN');
    expect(m.dead).toBe(true);
    expect(m.text.length).toBeGreaterThan(4);
    expect(m.anchors).toBe(0);
  });

  test('the passage that opened it closes it', async ({ page }) => {
    await drawerOf(page, 't01', 1);
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('#sheet-ov .deck-read button.chip')[1]!.click());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({
      open: document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden])').length,
      hot: document.querySelectorAll('#sheet-ov .deck-read [data-hot]').length,
    }))).toEqual({ open: 0, hot: 0 });
  });

  test('the × is the second way out, and it hands the focus back', async ({ page }) => {
    // DIA-432. One × per drawer and not one per excerpt: the reader is
    // dismissing the answer, not one of the sources in it.
    await drawerOf(page, 't06', 0);
    const before = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>('#sheet-ov .deck-drawer:not([hidden])')!;
      const x = d.querySelector<HTMLElement>('.deck-drawer-x')!;
      const head = d.querySelector<HTMLElement>('.deck-drawer-head')!;
      return {
        n: d.querySelectorAll('.deck-drawer-x').length,
        tag: x.tagName,
        label: (x.getAttribute('aria-label') ?? '').length > 2,
        // It stands on the physical left, clear of a head that reads rightwards.
        left: Math.round(x.getBoundingClientRect().left - d.getBoundingClientRect().left),
        clear: x.getBoundingClientRect().right <= head.getBoundingClientRect().left
          + parseFloat(getComputedStyle(head).paddingLeft) + 1,
        // Out of flow: the column of excerpts does not know it is there.
        srcTop: Math.round(d.querySelector('.deck-drawer-src')!.getBoundingClientRect().top
          - d.getBoundingClientRect().top),
      };
    });
    expect(before.n).toBe(1);
    expect(before.tag).toBe('BUTTON');
    expect(before.label).toBe(true);
    expect(before.left).toBe(0);
    expect(before.clear).toBe(true);
    expect(before.srcTop).toBe(0);

    await page.click('#sheet-ov .deck-drawer:not([hidden]) .deck-drawer-x');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({
      open: document.querySelectorAll('#sheet-ov .deck-drawer:not([hidden])').length,
      hot: document.querySelectorAll('#sheet-ov .deck-read [data-hot]').length,
      expanded: document.querySelectorAll('#sheet-ov .deck-read .chip[aria-expanded="true"]').length,
      // The button the reader just dismissed is gone; the chip gets the focus.
      onChip: document.activeElement?.classList.contains('chip') ?? false,
    }))).toEqual({ open: 0, hot: 0, expanded: 0, onChip: true });
  });
});

/**
 * The ladder jumps - DIA-430, spec §6.
 *
 * Inside the reading sheet the stage ladder stops being a picture of where the
 * reader is and becomes how they move: the stack behind is inert, so a rung is
 * the only way from one stage to the next without closing anything. Everything
 * below is about that one change and the things it drags with it - what the
 * reading does on the way, what the drawer does, where the focus lands, and
 * what the history says afterwards.
 */

/** Slide 3's sheet, opened from whichever stage the stack rests on. */
async function ladder(page: Page, id = 't01') {
  const card = await open3(page, id);
  await openFrom(page, `.deck-card[data-card="${card}"] .deck-more`);
  await page.waitForTimeout(600);
  return card;
}

/** Press the nth rung of the open sheet's ladder and let the swap land. */
const jumpTo = async (page: Page, i: number) => {
  await page.evaluate((n) => {
    document.querySelectorAll<HTMLElement>('.deck-sheet:not([hidden]) .deck-loc-jump')[n]!.click();
  }, i);
  await page.waitForTimeout(500);
};

/** What the deck is showing: the sheet, the stage under it, and the URL. */
const showing = (page: Page) => page.evaluate(() => {
  const deck = document.querySelector<HTMLElement>('.deck')!;
  const rungs = [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-loc-rung')];
  return {
    sheet: deck.getAttribute('data-sheet'),
    hash: location.hash,
    stage: rungs.findIndex((r) => r.hasAttribute('data-on')) + 1,
    chip: document.querySelector('.deck-sheet:not([hidden]) .deck-sheet-chip')?.textContent?.trim() ?? null,
  };
});

test.describe('the ladder is the way between stages', () => {
  test('on the slide it is a picture; in the sheet every drawn rung is a button', async ({ page }) => {
    const id = await ladder(page);
    const m = await page.evaluate((s) => {
      const slide = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-loc')!;
      const sheet = document.querySelector(`${s} .deck-loc`)!;
      const jumps = [...sheet.querySelectorAll('.deck-loc-jump')];
      return {
        slideHidden: slide.getAttribute('aria-hidden'),
        slideButtons: slide.querySelectorAll('button').length,
        sheetHidden: sheet.getAttribute('aria-hidden'),
        tags: [...new Set(jumps.map((j) => j.tagName))],
        // Each one says which stage it is, in words, so the ladder reads as a
        // list of places rather than four unlabelled dots.
        labels: jumps.map((j) => (j.getAttribute('aria-label') ?? '').trim()),
        current: jumps.filter((j) => j.getAttribute('aria-current') === 'true').length,
      };
    }, `#sheet-${id}`);
    expect(m.slideHidden).toBe('true');
    expect(m.slideButtons).toBe(0);
    expect(m.sheetHidden).toBe(null);
    expect(m.tags).toEqual(['BUTTON']);
    expect(m.labels.every((l) => /^שלב [1-6] · .+/.test(l))).toBe(true);
    expect(m.current).toBe(1);
  });

  test('the target is 36px, and reaches well past the rung it is drawn as', async ({ page }) => {
    const id = await ladder(page);
    const m = await page.evaluate((s) => {
      const j = document.querySelector<HTMLElement>(`${s} .deck-loc-jump`)!;
      const box = j.getBoundingClientRect();
      const a = getComputedStyle(j, '::after');
      const px = (v: string) => parseFloat(v) || 0;
      return {
        // The rung is a hairline by design; the target around it is not.
        drawn: { w: Math.round(box.width), h: Math.round(box.height) },
        target: {
          w: box.width - px(a.left) - px(a.right),
          h: box.height - px(a.top) - px(a.bottom),
        },
        // Asked of the page, not of the numbers: a finger landing above the
        // rung, and one landing inside the column beside it, both hit it.
        above: document.elementFromPoint(box.left + box.width / 2, box.top - 4) === j,
        beside: document.elementFromPoint(box.left - 20, box.top + box.height / 2) === j,
      };
    }, `#sheet-${id}`);
    expect(m.drawn.w).toBeLessThan(10);
    expect(m.target.h).toBeGreaterThanOrEqual(36);
    expect(m.target.w).toBeGreaterThanOrEqual(36);
    expect(m.above).toBe(true);
    expect(m.beside).toBe(true);
  });

  test('a rung swaps the reading, the tag and the ring, and starts it at the top', async ({ page }) => {
    await ladder(page);
    const before = await showing(page);
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.deck-sheet:not([hidden]) .deck-sheet-scroll')!.scrollTop = 200;
    });
    await jumpTo(page, 0);
    const after = await showing(page);
    expect(before.sheet).not.toBe(after.sheet);
    expect(after.sheet).toMatch(/-1$/);
    expect(after.hash).toBe('#3-s1');
    // The stack walked underneath: closing now lands on what was read.
    expect(after.stage).toBe(1);
    expect(after.chip).not.toBe(before.chip);
    expect(await page.evaluate(() => ({
      scrollTop: document.querySelector('.deck-sheet:not([hidden]) .deck-sheet-scroll')!.scrollTop,
      rings: document.querySelectorAll('.deck-sheet:not([hidden]) .deck-loc-jump[aria-current="true"]').length,
      ring: document.querySelector('.deck-sheet:not([hidden]) .deck-loc-jump[aria-current="true"]')
        ?.getAttribute('data-stage'),
    }))).toEqual({ scrollTop: 0, rings: 1, ring: '1' });
  });

  test('the focus follows the reader onto the same rung of the new ladder', async ({ page }) => {
    await ladder(page);
    await jumpTo(page, 0);
    expect(await page.evaluate(() => ({
      cls: document.activeElement?.className,
      stage: document.activeElement?.getAttribute('data-stage'),
      // Inside the sheet that is now showing, not the one that left.
      inSheet: !!document.activeElement?.closest('.deck-sheet:not([hidden])'),
    }))).toEqual({ cls: 'deck-loc-jump', stage: '1', inSheet: true });
  });

  test('the rung it is standing on does nothing at all', async ({ page }) => {
    await ladder(page);
    const before = await showing(page);
    const i = await page.evaluate(() => [...document.querySelectorAll('.deck-sheet:not([hidden]) .deck-loc-jump')]
      .findIndex((j) => j.getAttribute('aria-current') === 'true'));
    expect(i).toBeGreaterThanOrEqual(0);
    await jumpTo(page, i);
    expect(await showing(page)).toEqual(before);
  });

  test('the drawer goes with the sentence it answered', async ({ page }) => {
    // st2-2 is the stage whose reading is cited, so there is a drawer to open.
    await ladder(page);
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.deck-sheet:not([hidden]) .deck-loc-jump')[1]!.click();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('.deck-sheet:not([hidden]) .deck-read button.chip')!.click();
    });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ({
      open: document.querySelectorAll('.deck-sheet:not([hidden]) .deck-drawer:not([hidden])').length,
      hot: document.querySelectorAll('.deck-sheet:not([hidden]) .deck-read [data-hot]').length,
    }))).toEqual({ open: 1, hot: 1 });

    await jumpTo(page, 0);
    expect(await page.evaluate(() => ({
      anywhere: document.querySelectorAll('.deck-sheet .deck-drawer:not([hidden])').length,
      hot: document.querySelectorAll('.deck-sheet .deck-read [data-hot]').length,
      expanded: document.querySelectorAll('.deck-sheet .chip[aria-expanded="true"]').length,
    }))).toEqual({ anywhere: 0, hot: 0, expanded: 0 });

    // And coming back is a first visit, not a return to an answered question.
    await jumpTo(page, 1);
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-sheet .deck-drawer:not([hidden])').length)).toBe(0);
  });

  test('every sheet keeps its own ring, however many jumps it took to get back', async ({ page }) => {
    // The ring moves in the DOM on the sheet that is leaving, so that the
    // press is answered before the reading has finished going. React drew
    // that sheet ringed on its own stage and will not draw it again, so the
    // move has to be given back - otherwise a sheet returned to wears the
    // ring of wherever the reader went from it, while the reading under it is
    // right. That is invisible on the first jump and wrong on every one after.
    await ladder(page);
    const rings = () => page.evaluate(() => [...document.querySelectorAll('.deck-sheet[id^="sheet-st"]')]
      .map((s) => ({
        id: s.id,
        on: [...s.querySelectorAll('.deck-loc-jump[aria-current="true"]')]
          .map((b) => b.getAttribute('data-stage') ?? ''),
        lit: [...s.querySelectorAll('.deck-loc-rung[data-on]')].length,
      })));
    const own = (r: { id: string; on: string[]; lit: number }) =>
      r.on.length === 1 && r.on[0] === r.id.split('-').pop() && r.lit === 1;

    for (const i of [0, 3, 1, 0, 3, 2]) {
      await jumpTo(page, i);
      const now = await showing(page);
      // Every ladder in the deck, shown or hidden, rings its own stage.
      expect((await rings()).filter((r) => !own(r))).toEqual([]);
      // And the sheet on screen is the one the reader pressed for.
      expect(now.sheet).toBe(`st2-${i + 1}`);
    }
  });

  test('the reading leaves in the direction of travel, and arrives from it', async ({ page }) => {
    await ladder(page);
    const swap = () => page.evaluate(() =>
      document.querySelector('.deck-sheet:not([hidden]) .deck-sheet-scroll')?.getAttribute('data-swap') ?? null);
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.deck-sheet:not([hidden]) .deck-loc-jump')[0]!.click();
    });
    await page.waitForTimeout(60);
    expect(await swap()).toBe('out-up');
    await page.waitForTimeout(440);
    expect(await swap()).toBe('in-up');

    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.deck-sheet:not([hidden]) .deck-loc-jump')[3]!.click();
    });
    await page.waitForTimeout(60);
    expect(await swap()).toBe('out-down');
    await page.waitForTimeout(440);
    expect(await swap()).toBe('in-down');
  });

  test('nothing else on the deck can be reached while the sheet is open', async ({ page }) => {
    await ladder(page);
    expect(await page.evaluate(() => ({
      track: document.querySelector('.deck-track')?.hasAttribute('inert'),
      bottom: document.querySelector('.deck-bottom')?.hasAttribute('inert'),
      // The ladder is inside the sheet, so it is not under the inert subtree.
      jumps: [...document.querySelectorAll('.deck-sheet:not([hidden]) .deck-loc-jump')]
        .every((j) => !j.closest('[inert]')),
    }))).toEqual({ track: true, bottom: true, jumps: true });
  });

  test('closing after a jump lands on the stage that was jumped to', async ({ page }) => {
    await ladder(page);
    await jumpTo(page, 0);
    await page.click('.deck-sheet:not([hidden]) .deck-sheet-x');
    await page.waitForTimeout(700);
    const m = await showing(page);
    expect(m.sheet).toBe(null);
    expect(m.stage).toBe(1);
    expect(m.hash).toBe('#3-s1');
  });

  test('Back closes it on the jumped-to stage too, and the deck still costs one entry', async ({ page }) => {
    await ladder(page);
    await jumpTo(page, 0);
    await page.goBack();
    await page.waitForTimeout(700);
    const closed = await showing(page);
    expect(closed.sheet).toBe(null);
    expect(closed.stage).toBe(1);
    expect(closed.hash).toBe('#3-s1');

    // §2's invariant survives the jump: the sheet's entry is the one Back just
    // spent, and the deck's own is still the only other one it added - so one
    // more Back is standing where the reader came in, tail and all.
    await page.goBack();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => ({ hash: location.hash, path: location.pathname })))
      .toEqual({ hash: '#3', path: '/item/t01/' });
  });
});
