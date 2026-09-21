import { test, expect, type Page } from '@playwright/test';

/**
 * Slide 2 — סקירת הכשל, the card (DIA-381, DIA-413, spec §5).
 *
 * The first body slide, and the pattern slides 3 and 4 reuse. Most of what is
 * asserted here is therefore not about this screen: it is about the rules
 * being set for three screens at once - the card, the cut, the type scale and
 * the citation glyph. The sheet those rules continue into is sheet.spec.ts.
 *
 * t01 is authored past the frame on purpose, so the cut is a measurement and
 * not a hope; t03 fits, carries a two-item list and an inline hyperlink; t05
 * carries no list at all. t02 is the floor — one claim, one span.
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

/** Open an item on slide 2 and let the deck settle on the snap point. */
async function open(page: Page, id: string) {
  await page.goto(`/item/${id}/#2`);
  await page.waitForSelector('.deck-card[data-card="ov"]');
  // The cut is a measurement, and it is re-taken once the fonts have landed.
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(300);
}

const CARD = '.deck-card[data-card="ov"]';

test.describe('the card', () => {
  test('three parts, in order, and the card never scrolls', async ({ page }) => {
    // The cheapest assertion that notices a collision: .chip, .lead and .prose
    // all have bare rules in this stylesheet, and a gate screen once rendered
    // as nothing while every data assertion passed.
    await open(page, 't03');
    const card = await rect(page, CARD);
    const label = await rect(page, `${CARD} .deck-label`);
    const read = await rect(page, `${CARD} .deck-read`);
    const button = await rect(page, `${CARD} .deck-more`);

    expect(card.height).toBeGreaterThan(400);
    expect(label.height).toBeGreaterThan(14);
    expect(read.height).toBeGreaterThan(200);

    // In order, nothing overlapping its neighbour, and §5's 14px between.
    expect(Math.round(read.top - label.bottom)).toBe(14);
    expect(Math.round(button.top - read.bottom)).toBe(14);
    // The card fills the frame between the chrome and stops there.
    expect(Math.round(button.bottom)).toBeLessThanOrEqual(Math.round(card.bottom) + 1);
  });

  test('nothing in the track is a reading scroller, on any fixture', async ({ page }) => {
    // The whole point of DIA-413: a vertical scroller inside a horizontal one
    // is where every fault of these screens came from. Asserted on the
    // computed overflow rather than on scrollHeight, because a clipped card
    // still has content past its box - it is cut, which is the design.
    //
    // The stage stack is the one exception and is not a reading scroller: it
    // is a pager of one-frame pages, which is what §6 turned it into.
    for (const id of ['t01', 't03', 't05'] as const) {
      await open(page, id);
      const scrollers = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.deck-track *')]
          .filter((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
          .map((e) => e.className));
      expect(scrollers.filter((c) => !c.includes('deck-stack')),
        `${id}: nothing in the track may scroll down`).toEqual([]);
      // And the card's own reading is clipped, not scrollable.
      expect(await page.evaluate((sel) =>
        getComputedStyle(document.querySelector(`${sel} .deck-read`)!).overflowY, CARD)).toBe('hidden');
    }
  });

  test('the label is the slide name in muted ink, and no longer a pill', async ({ page }) => {
    await open(page, 't03');
    const css = await page.evaluate((sel) => {
      const el = document.querySelector(`${sel} .deck-label`)!;
      const s = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').trim(),
        size: s.fontSize, weight: s.fontWeight,
        radius: parseFloat(s.borderTopLeftRadius),
        ground: s.backgroundColor,
      };
    }, CARD);
    expect(css.text).toBe('סקירת הכשל');
    expect(css.size).toBe('13px');
    expect(css.weight).toBe('600');
    // §5: the fully-rounded chip survives in exactly one place, the sheet's bar.
    expect(css.radius).toBe(0);
    expect(css.ground).toBe('rgba(0, 0, 0, 0)');
  });

  test('the label starts where the reading does', async ({ page }) => {
    // The slide gives up its side padding so the sheet's carousel can reach
    // the edge; the card carries it instead. In RTL "starts" is the physical
    // right, so it is asserted on the box and not on a property name.
    await open(page, 't03');
    const label = await rect(page, `${CARD} .deck-label`);
    const ink = await rect(page, `${CARD} .deck-read > p:first-child`);
    expect(Math.round(label.right)).toBe(Math.round(ink.right));
  });
});

test.describe('the two states of the card', () => {
  test('t01 overruns and is cut; t03 and t05 fit and are not', async ({ page }) => {
    for (const [id, over] of [['t01', true], ['t03', true], ['t05', false], ['t04', false]] as const) {
      await open(page, id);
      const m = await page.evaluate((sel) => {
        const card = document.querySelector(sel)!;
        const read = card.querySelector('.deck-read')!;
        return {
          cut: card.hasAttribute('data-cut'),
          room: read.scrollHeight - read.clientHeight,
          mask: getComputedStyle(read).webkitMaskImage,
        };
      }, CARD);
      expect(m.cut, `${id} should ${over ? '' : 'not '}be cut`).toBe(over);
      expect(m.room > 1, `${id}: the measurement and the attribute must agree`).toBe(over);
      // The fade is the cut. Nothing is masked on a card that fits.
      expect(m.mask === 'none').toBe(!over);
    }
  });

  test('the button says which state it is in, and how many sources', async ({ page }) => {
    const say = (page: Page) => page.evaluate((sel) => {
      const b = document.querySelector(`${sel} .deck-more`)!;
      return {
        label: getComputedStyle(b.querySelector('.deck-more-say')!, '::before').content,
        n: (b.querySelector('.deck-more-n')?.textContent ?? '').trim(),
      };
    }, CARD);

    await open(page, 't01');
    expect((await say(page)).label).toContain('יותר מידע');
    expect((await say(page)).n).toMatch(/^\d+ מקורות$/);

    await open(page, 't05');
    expect((await say(page)).label).toContain('המקורות');
    expect((await say(page)).n).toMatch(/^\d+ מקורות$/);
  });

  test('the cut decision is re-taken at 844, 664 and 600 tall', async ({ page }) => {
    // §5's fit problem, measured rather than argued: the same design at the
    // same size on every phone from the 600 guard up, with more or less of the
    // reading on the first screen. t05 fits a tall frame and not a short one.
    await open(page, 't05');
    const seen: { h: number; cut: boolean; room: number }[] = [];
    for (const h of [844, 664, 600]) {
      await page.setViewportSize({ width: 390, height: h });
      await page.waitForTimeout(250);
      seen.push(await page.evaluate((sel) => {
        const card = document.querySelector(sel)!;
        const read = card.querySelector('.deck-read')!;
        return { h: window.innerHeight, cut: card.hasAttribute('data-cut'), room: read.scrollHeight - read.clientHeight };
      }, CARD));
    }
    for (const s of seen) expect(s.cut, `${s.h}: the attribute must follow the measurement`).toBe(s.room > 1);
    // And the card itself never grows past the frame at any of them.
    expect(seen.map((s) => s.h)).toEqual([844, 664, 600]);
    expect(seen[0]!.cut).toBe(false);
    expect(seen[2]!.cut).toBe(true);
  });

  test('a card with nothing to continue is never cut', async ({ page }) => {
    // §7's slide is composed rather than authored: no button, no sheet, and a
    // fade over a reading that cannot be continued is a promise it cannot keep.
    await page.goto('/item/t02/#4');
    await page.waitForSelector('.deck-stack');
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(4) .deck-card')];
      return {
        cards: cards.length,
        buttons: cards.filter((c) => c.querySelector('.deck-more')).length,
        cut: cards.filter((c) => c.hasAttribute('data-cut')).length,
      };
    });
    expect(m.cards).toBeGreaterThan(0);
    expect(m.buttons).toBe(0);
    expect(m.cut).toBe(0);
  });
});

test.describe('the type scale', () => {
  test('the lead is the first paragraph, and only the first', async ({ page }) => {
    await open(page, 't03');
    const sizes = await page.evaluate((sel) =>
      [...document.querySelectorAll(`${sel} .deck-read > p`)].map((p) => getComputedStyle(p).fontSize), CARD);
    // §2: the lead is distinguished by size, not by weight — 21 against 17.
    expect(sizes[0]).toBe('21px');
    expect(sizes.slice(1).every((s) => s === '17px')).toBe(true);
    expect(sizes.length).toBeGreaterThan(1);
  });

  test('the lead is not bold', async ({ page }) => {
    // Supersedes DIA-365's "the opening sentence is bold" and the ruling that
    // replaced it: size carries the lead, and bold is the lead-in of a list
    // item and nothing else.
    await open(page, 't03');
    const weight = await page.evaluate((sel) =>
      getComputedStyle(document.querySelector(`${sel} .deck-read > p:first-child`)!).fontWeight, CARD);
    expect(weight).toBe('400');
  });

  test('a list draws a plain disc in the muted ink, not an em-dash', async ({ page }) => {
    await open(page, 't03');
    const list = await page.evaluate((sel) => {
      const ul = document.querySelector(`${sel} .deck-read ul`);
      if (!ul) return null;
      const li = ul.querySelector('li')!;
      const before = getComputedStyle(li, '::before');
      return {
        items: ul.querySelectorAll('li').length,
        listStyle: getComputedStyle(ul).listStyleType,
        marker: before.content,
        radius: before.borderTopLeftRadius,
        width: before.width,
      };
    }, CARD);
    expect(list).not.toBeNull();
    expect(list!.items).toBe(2);
    expect(list!.listStyle).toBe('none');
    // The coloured em-dash is gone (§2, DIA-412).
    expect(list!.marker).not.toContain('—');
    expect(parseFloat(list!.width)).toBeCloseTo(5, 0);
    expect(parseFloat(list!.radius)).toBeGreaterThan(0);
  });

  test('consecutive items are one list, not a run of one-item lists', async ({ page }) => {
    // The renderer half of this is DIA-382; here it is what the reader sees.
    await open(page, 't01');
    const shape = await page.evaluate((sel) => ({
      lists: document.querySelectorAll(`${sel} .deck-read ul`).length,
      items: document.querySelectorAll(`${sel} .deck-read ul li`).length,
    }), CARD);
    expect(shape).toEqual({ lists: 1, items: 3 });
  });

  test('one highlight at most, and it is the accent tint', async ({ page }) => {
    // §5's whole emphasis budget: one ==mark== and bold only as a list item's
    // lead-in. Where the mark sits is a writing rule and the content issue's
    // to enforce; that there is at most one, and that it is the soft accent
    // tint rather than a colour of its own, is this screen's.
    await open(page, 't01');
    const m = await page.evaluate((sel) => {
      const marks = [...document.querySelectorAll(`${sel} .deck-read mark`)];
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      return {
        n: marks.length,
        ground: marks[0] ? getComputedStyle(marks[0]).backgroundColor : null,
        radius: marks[0] ? getComputedStyle(marks[0]).borderTopLeftRadius : null,
        accent,
      };
    }, CARD);
    expect(m.n).toBe(1);
    expect(m.ground).not.toBe('rgba(0, 0, 0, 0)');
    expect(parseFloat(m.radius!)).toBe(3);
  });
});

test.describe('the citation glyph', () => {
  test('a 20px round carrying a link mark, with no type name and no colour', async ({ page }) => {
    // This reverses the earlier ruling that a chip names its type: the name
    // made the mark ~90px wide, so it wrapped below its own sentence instead
    // of ending it (§5, DIA-412).
    await open(page, 't03');
    const chips = await page.evaluate((sel) => {
      const all = [...document.querySelectorAll<HTMLElement>(`${sel} .deck-read .chip`)];
      const one = all[0]!;
      const s = getComputedStyle(one);
      return {
        n: all.length,
        glyph: all.every((c) => !!c.querySelector('svg.chip-link')),
        named: all.some((c) => !!c.querySelector('.chip-type')),
        dots: all.some((c) => !!c.querySelector('.chip-dot')),
        height: one.getBoundingClientRect().height,
        radius: parseFloat(s.borderTopLeftRadius),
        ground: s.backgroundColor,
      };
    }, CARD);
    expect(chips.n).toBeGreaterThan(2);
    expect(chips.glyph).toBe(true);
    expect(chips.named).toBe(false);
    expect(chips.dots).toBe(false);
    expect(chips.height).toBeCloseTo(20, 0);
    expect(chips.radius).toBeGreaterThan(chips.height / 2);
    expect(chips.ground).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('a span resting on two claims says +1', async ({ page }) => {
    await open(page, 't01');
    const ns = await page.evaluate((sel) =>
      [...document.querySelectorAll(`${sel} .deck-read .chip .chip-n`)].map((e) => e.textContent), CARD);
    expect(ns).toEqual(['+1']);
  });

  test('on the card the glyph opens the sheet rather than linking to nothing', async ({ page }) => {
    // The deck has no ledger under it, so `href="#c01"` would be a link to
    // nowhere. The evidence is in the sheet, and the mark goes there (§5).
    await open(page, 't01');
    const m = await page.evaluate((sel) => {
      const all = [...document.querySelectorAll(`${sel} .deck-read .chip`)];
      return {
        anchors: all.filter((c) => c.tagName === 'A').length,
        buttons: all.filter((c) => c.tagName === 'BUTTON').length,
        opens: all.every((c) => c.getAttribute('data-open') === 'ov'),
        popup: all.every((c) => c.getAttribute('aria-haspopup') === 'dialog'),
        labelled: all.every((c) => (c.getAttribute('aria-label') ?? '').startsWith('המקורות למשפט')),
      };
    }, CARD);
    expect(m.anchors).toBe(0);
    expect(m.buttons).toBeGreaterThan(0);
    expect(m.opens).toBe(true);
    expect(m.popup).toBe(true);
    expect(m.labelled).toBe(true);
  });
});

test.describe('what is no longer on the slide', () => {
  test('no carousel, no pill and no drawer on the card', async ({ page }) => {
    await open(page, 't01');
    const gone = await page.evaluate((sel) => ({
      carousel: document.querySelectorAll(`${sel} .deck-ov-sources`).length,
      cards: document.querySelectorAll(`${sel} .deck-ov-card`).length,
      drawers: document.querySelectorAll(`${sel} .deck-drawer`).length,
    }), CARD);
    expect(gone).toEqual({ carousel: 0, cards: 0, drawers: 0 });
  });

  test('the page itself never scrolls', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => ({
      y: window.scrollY,
      doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }));
    expect(m.y).toBe(0);
    expect(m.doc).toBeLessThanOrEqual(0);
    expect(m.at).toBe('1');
  });
});

test.describe('the floor', () => {
  test('one claim and one span still make a screen', async ({ page }) => {
    await open(page, 't02');
    const m = await page.evaluate((sel) => ({
      chips: document.querySelectorAll(`${sel} .deck-read .chip`).length,
      cards: document.querySelectorAll('#sheet-ov .deck-ov-card').length,
      read: document.querySelector(`${sel} .deck-read`)!.textContent!.trim().length,
      n: (document.querySelector(`${sel} .deck-more-n`)?.textContent ?? '').trim(),
    }), CARD);
    expect(m.chips).toBe(1);
    expect(m.cards).toBe(1);
    expect(m.read).toBeGreaterThan(40);
    expect(m.n).toBe('מקור אחד');
  });
});
