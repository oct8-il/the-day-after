import { test, expect, type Page } from '@playwright/test';

/**
 * The reading sheet (DIA-413, spec §5) and pulling it down (DIA-417).
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

test.describe('the entrance', () => {
  /**
   * The entrance is read off the animation rather than sampled after a wait.
   * An ease-out does most of its travel early, so "60ms in" is a race with
   * the harness; the animation's own name, duration and keyframes are facts.
   *
   * The cover starts two frames after the tap, not on it: the sheet is
   * unhidden parked below the frame (`data-in="pre"`) and set moving once it
   * has been laid out and painted, so the first frames of the animation are
   * not lost to the layout of a screen of reading. The read waits for that.
   */
  const entrance = async (page: Page, sel: string) => {
    await page.evaluate((s) => document.querySelector<HTMLElement>(s)!.click(), sel);
    await page.waitForFunction(() => document.querySelector('#sheet-ov')?.getAttribute('data-in') === 'cover');
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
        // Only `transform` is in the keyframes: the edge and its shadow are a
        // lip above the box that never animates, so the compositor moves the
        // sheet and nothing is repainted per frame.
        props: Object.keys(kf[0] ?? {}).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
        lip: { shadow: lip.boxShadow, radius: lip.borderTopLeftRadius, bottom: lip.bottom, height: el.getBoundingClientRect().height },
        dim: document.querySelector('.deck')!.hasAttribute('data-dim'),
      };
    });
  };

  /**
   * One entrance, whichever control opened it (Roy, 21 September). §5 ruled a
   * second, quieter one from the button; it was built and dropped, because the
   * sheet's ground is the slide's ground and its first lines are in the same
   * places, so a short opacity fade between two near-identical screens is
   * invisible by construction.
   */
  for (const [what, sel] of [
    ['the button', '.deck-card[data-card="ov"] .deck-more'],
    ['a passage', '.deck-card[data-card="ov"] .deck-read .chip'],
  ] as const) {
    test(`from ${what} it covers from the bottom up, shadowed, and dims the slide`, async ({ page }) => {
      await open2(page);
      const m = await entrance(page, sel);
      expect(m.how).toBe('cover');
      expect(m.name).toBe('deck-sheet-cover');
      expect(m.ms).toBe(400);
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
  }

  test('the curve is an ease-out over the whole duration, not a jump', async ({ page }) => {
    // The first curve put both control points' y near 1 by x = .3, so the
    // sheet travelled the whole frame in the first fifth of its 340ms and sat
    // still for the rest. At real speed that reads as a cut, not a cover.
    await open2(page);
    await page.evaluate(() => document.querySelector<HTMLElement>('.deck-card[data-card="ov"] .deck-read .chip')!.click());
    await page.waitForFunction(() => document.querySelector('#sheet-ov')?.getAttribute('data-in') === 'cover');
    const by = await page.evaluate(() => {
      const el = document.querySelector('#sheet-ov')!;
      const a = el.getAnimations()[0]!;
      a.pause();
      const frame = el.getBoundingClientRect().height;
      return [0.25, 0.5, 0.75].map((f) => {
        a.currentTime = 400 * f;
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

  test('it leaves the way it came', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    const out = await page.evaluate(async () => {
      document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-x')!.click();
      // One frame, so the exit's animation has been created - and well short
      // of the 400ms it runs for, so nothing here is a race with the clock.
      await new Promise((r) => requestAnimationFrame(r));
      const el = document.querySelector('#sheet-ov')!;
      const a = el.getAnimations()[0] as (Animation & { animationName?: string }) | undefined;
      const kf = (a?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      return {
        out: el.getAttribute('data-out'),
        name: a?.animationName ?? null,
        ms: (a?.effect?.getTiming().duration ?? null) as number | null,
        from: (kf[0] as Record<string, string> | undefined)?.transform ?? null,
        to: (kf[kf.length - 1] as Record<string, string> | undefined)?.transform ?? null,
      };
    });
    // A reversed *direction* on the same keyframes is not a new animation, so
    // the exit is its own: the sheet has to leave, not sit at the end of an
    // animation that already finished.
    expect(out.out).toBe('cover');
    expect(out.name).toBe('deck-sheet-uncover');
    expect(out.ms).toBe(400);
    expect(out.from).toBe('translateY(0px)');
    expect(out.to).toBe('translateY(100%)');

    await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(true);
  });

  test('reduced motion makes it instant', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce', hasTouch: true });
    const page = await ctx.newPage();
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-read .chip');
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
    expect(m).toEqual({ how: 'still', top: 0, animations: 0, dim: false });

    await page.evaluate(() => document.querySelector<HTMLElement>('#sheet-ov .deck-sheet-x')!.click());
    expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(true);
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
test.describe('pull down to dismiss', () => {
  /** A one-finger drag down the sheet, in steps, so the handler sees it move. */
  async function pull(page: Page, from: { x: number; y: number }, dy: number, ms = 500) {
    const steps = 10;
    const cdp = await page.context().newCDPSession(page);
    const send = (type: string, y: number) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: from.x, y }],
    } as never);
    await send('touchStart', from.y);
    for (let i = 1; i <= steps; i += 1) {
      await send('touchMove', from.y + (dy * i) / steps);
      await page.waitForTimeout(ms / steps);
    }
    await send('touchEnd', from.y + dy);
    await cdp.detach();
  }

  test('a long pull from the top dismisses it, and a short one springs back', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);

    // Short of the threshold — a quarter of the frame is 211px here.
    await pull(page, { x: 195, y: 300 }, 80);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => ({
      hidden: document.querySelector('#sheet-ov')!.hasAttribute('hidden'),
      top: Math.round(document.querySelector('#sheet-ov')!.getBoundingClientRect().top),
      pull: document.querySelector('.deck')!.hasAttribute('data-pull'),
    }))).toEqual({ hidden: false, top: 0, pull: false });

    await pull(page, { x: 195, y: 300 }, 320);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(true);
    // A close like any other: the entry is given back and focus returns.
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('deck-more');
    expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('1');
  });

  test('it follows the finger, and the dim goes with it', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-read .chip');
    await page.waitForTimeout(600);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 300 }] } as never);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 330 }] } as never);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 420 }] } as never);
    await page.waitForTimeout(80);
    const mid = await page.evaluate(() => ({
      top: Math.round(document.querySelector('#sheet-ov')!.getBoundingClientRect().top),
      dim: parseFloat(getComputedStyle(document.querySelector('.deck-dim')!).opacity),
      pulling: document.querySelector('.deck')!.hasAttribute('data-pull'),
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] } as never);
    await cdp.detach();

    expect(mid.pulling).toBe(true);
    // 1:1 with the finger.
    expect(mid.top).toBeCloseTo(120, -1);
    // And the slide behind un-dims as it goes, so the gesture explains itself.
    expect(mid.dim).toBeLessThan(1);
    expect(mid.dim).toBeGreaterThan(0);
  });

  test('below the top of the reading a downward drag is an ordinary scroll', async ({ page }) => {
    await open2(page);
    await openFrom(page, '.deck-card[data-card="ov"] .deck-more');
    await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('#sheet-ov .deck-sheet-scroll')!.scrollTop = 200; });
    await page.waitForTimeout(200);

    await pull(page, { x: 195, y: 300 }, 320);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.querySelector('#sheet-ov')!.hasAttribute('hidden'))).toBe(false);
  });
});
