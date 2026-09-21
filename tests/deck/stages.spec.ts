import { test, expect, type Page } from '@playwright/test';

/**
 * Slide 3 — מה נעשה מאז (DIA-384, spec §6).
 *
 * The stages the item reached, one page each. Most of what is asserted here is
 * not about this screen: it is the pattern slide 4 inherits in Phase 6, so a
 * wrong measure here is a wrong measure twice.
 *
 * t01 reaches four stages and has an overview on two of them, so both branches
 * of the body live in one item. t03 reaches two and has neither. t02 reaches
 * one, which is the floor: a stack with nothing to move between.
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

async function open(page: Page, id: string, hash = '#3') {
  await page.goto(`/item/${id}/${hash}`);
  await page.waitForSelector('.deck-stack');
  await page.waitForTimeout(400);
}

/**
 * Everything below reads slide 3's own subtree, spelled out in full inside
 * each `evaluate` because the page cannot see this file's constants. Since
 * Phase 6 there are two stacks in the deck, and the second one answers to
 * every selector this file used to spell bare.
 */

/** Which stage number the stack is showing, as the deck itself reports it. */
const here = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>('.deck')!.dataset.stage2);

test.describe('the stack', () => {
  test('one page per reached stage, and it opens on the current one', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => ({
      pages: [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-stage')].map((s) => s.getAttribute('data-stage')),
      top: Math.round(document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!.scrollTop),
    }));
    // t01 reached 1-4. The unreached ones are slide 4's, not this slide's.
    expect(m.pages).toEqual(['1', '2', '3', '4']);
    expect(await here(page)).toBe('4');
    // Opening on the current stage means the stack is not at its own top.
    expect(m.top).toBeGreaterThan(0);
  });

  test('the whole stack is one scroller, and it never scrolls sideways', async ({ page }) => {
    // §11's boundary is a property of the scroller rather than of a listener,
    // and a vertical scroller that also scrolls sideways is what DIA-383 came
    // from - the carousel reaches the edges by padding, not by bleeding out.
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const st = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!;
      return {
        x: st.scrollWidth - st.clientWidth,
        snap: getComputedStyle(st).scrollSnapType,
        stop: getComputedStyle(document.querySelector('.deck-stage')!).scrollSnapStop,
        scrollers: document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-stage').length,
      };
    });
    expect(m.x).toBe(0);
    // Proximity, not mandatory: a remembered position part-way down a page is
    // not a snap point, and mandatory left the scroller floating there until
    // the next touch - which read as the arrows undershooting. The engine
    // normalises "y proximity" to "y", proximity being the initial value.
    expect(m.snap).toContain('y');
    expect(m.snap).not.toContain('mandatory');
    expect(m.stop).toBe('always');
  });

  test('a page is at least a frame tall, so a short stage still fills one', async ({ page }) => {
    await open(page, 't03');
    const m = await page.evaluate(() => {
      const st = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!;
      return [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-stage')]
        .map((s) => Math.round(s.getBoundingClientRect().height) >= st.clientHeight - 1);
    });
    expect(m.every(Boolean)).toBe(true);
  });

  test('the floor: one reached stage still makes a stack', async ({ page }) => {
    await open(page, 't02');
    expect(await page.evaluate(() => document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-stage').length)).toBe(1);
    expect(await here(page)).toBe('1');
  });
});

test.describe('where a stage opens', () => {
  test('a deep link is a first visit — the top of that stage, no memory', async ({ page }) => {
    await open(page, 't01', '#3-s1');
    expect(await here(page)).toBe('1');
    const top = await page.evaluate(() => Math.round(document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!.scrollTop));
    expect(top).toBe(0);
  });

  test('a stage only passed through opens at its top', async ({ page }) => {
    // Recording the position every frame looked like "where they left it" and
    // was not: scrolling straight through a stage wrote its foot, so coming
    // back by the arrows landed at its end with its title above the fold.
    await open(page, 't01', '#3-s1');
    // Scroll on, through stage 2, and come to rest in stage 3.
    await page.evaluate(() => {
      const st = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!;
      const three = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="3"]')!;
      st.scrollTop += three.getBoundingClientRect().top - st.getBoundingClientRect().top;
    });
    await page.waitForTimeout(500);
    expect(await here(page)).toBe('3');

    await page.click('.deck-mid button[aria-label="השלב הקודם"]');
    await page.waitForTimeout(800);
    expect(await here(page)).toBe('2');
    const into = await page.evaluate(() => {
      const st = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!;
      const two = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="2"]')!;
      return Math.round(st.getBoundingClientRect().top - two.getBoundingClientRect().top);
    });
    expect(Math.abs(into)).toBeLessThan(2);
  });

  test('a stage already read reopens where it was left', async ({ page }) => {
    // §6: that is what makes scrolling back up bearable - the reader returns
    // to the foot of the stage they just read rather than above all of it.
    await open(page, 't01', '#3-s1');
    const stackTop = await page.evaluate(() => {
      const st = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!;
      st.scrollTop += 260;
      return st.scrollTop;
    });
    await page.waitForTimeout(300);

    // Away, and back by the footer's arrows rather than by scrolling.
    await page.click('.deck-mid button[aria-label="השלב הבא"]');
    await page.waitForTimeout(700);
    expect(await here(page)).toBe('2');
    await page.click('.deck-mid button[aria-label="השלב הקודם"]');
    await page.waitForTimeout(700);

    expect(await here(page)).toBe('1');
    const back = await page.evaluate(() => Math.round(document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!.scrollTop));
    expect(Math.abs(back - Math.round(stackTop))).toBeLessThan(12);
  });

  test('the URL follows the page, and a refresh lands back on it', async ({ page }) => {
    await open(page, 't01', '#3-s1');
    await page.click('.deck-mid button[aria-label="השלב הבא"]');
    await page.waitForTimeout(700);
    expect(page.url()).toContain('#3-s2');

    await page.reload();
    await page.waitForSelector('.deck-stack');
    await page.waitForTimeout(500);
    expect(await here(page)).toBe('2');
    expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('2');
  });
});

test.describe('the head group', () => {
  test('the tag is the page title, and only the current stage wears the pill', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-stage')];
      const tag = pages[0]!.querySelector('.deck-stage-tag')!;
      const s = getComputedStyle(tag);
      return {
        text: (tag.textContent ?? '').trim(),
        size: s.fontSize,
        weight: s.fontWeight,
        radius: s.borderTopLeftRadius,
        pills: pages.map((p) => !!p.querySelector('.deck-stage-now')),
        defs: pages.map((p) => (p.querySelector('.deck-stage-def')?.textContent ?? '').trim()),
        ages: pages.map((p) => (p.querySelector('.deck-stage-age')?.textContent ?? '').trim()),
      };
    });
    expect(m.text).toBe('1 · זוהה');
    expect(m.size).toBe('19px');
    expect(m.weight).toBe('700');
    expect(m.radius).toBe('3px');
    // Only the last, because on this slide the current stage is always the last
    // one reached - which is also why the locator no longer rings it.
    expect(m.pills).toEqual([false, false, false, true]);
    expect(m.defs.every((d) => d.length > 0)).toBe(true);
    // A definition may not use its own term.
    expect(m.defs[3]).not.toContain('יושם');
    expect(m.ages.every((a) => /\d/.test(a))).toBe(true);
  });

  test('stages 3 and 6 still say their definition is unwritten', async ({ page }) => {
    // DIA-367. Rendered rather than left blank, so a review of the page can
    // see the hole instead of reading the gap as intentional.
    await open(page, 't01', '#3-s3');
    const def = await page.evaluate(() =>
      (document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="3"] .deck-stage-def')?.textContent ?? '').trim());
    expect(def).toBe('הגדרת השלב טרם נכתבה');
  });

  test('the hairline stops where the text does, not at the frame', async ({ page }) => {
    await open(page, 't01');
    const head = await rect(page, '.deck-stage-head');
    const body = await rect(page, '.deck-stage-body');
    const frame = await rect(page, '.deck');
    expect(Math.round(head.right)).toBe(Math.round(body.right));
    expect(head.right).toBeLessThan(frame.right - 20);
  });
});

test.describe('the locator', () => {
  test('five slots, only the reached ones drawn, and the rest hold their place', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const rungs = [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-loc-rung')];
      return {
        slots: rungs.length,
        drawn: rungs.map((r) => r.hasAttribute('data-drawn')),
        visible: rungs.map((r) => getComputedStyle(r).visibility),
        tops: rungs.map((r) => Math.round(r.getBoundingClientRect().top)),
      };
    });
    expect(m.slots).toBe(5);
    expect(m.drawn).toEqual([true, true, true, true, false]);
    expect(m.visible[4]).toBe('hidden');
    // The held slot still takes its room: the gaps are even all the way down.
    const gaps = m.tops.slice(1).map((t, i) => t - m.tops[i]!);
    expect(new Set(gaps).size).toBe(1);
  });

  test('the viewed stage is the only ring, and it follows the page', async ({ page }) => {
    await open(page, 't01');
    const ringed = () => page.evaluate(() =>
      [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-loc-rung')].map((r) => r.hasAttribute('data-on')));
    expect(await ringed()).toEqual([false, false, false, true].concat([false]));

    await page.click('.deck-mid button[aria-label="השלב הקודם"]');
    await page.waitForTimeout(700);
    expect(await ringed()).toEqual([false, false, true, false, false]);

    // And nothing else on the locator is marked - the current stage lost its
    // gold ring on 20 September, because it is always the last rung drawn.
    const shadows = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-loc-rung')]
        .map((r) => getComputedStyle(r).boxShadow)
        .filter((b) => b !== 'none').length);
    expect(shadows).toBe(1);
  });

  test('it stands against the physical right edge', async ({ page }) => {
    // §2's RTL trap: inset-inline-end resolves left here. Asserted on the box.
    await open(page, 't01');
    const frame = await rect(page, '.deck');
    const loc = await rect(page, '.deck-loc');
    expect(Math.round(frame.right - loc.right)).toBe(14);
    expect(Math.round(loc.top)).toBe(112);
  });

  test('a rung is in the same place whatever the page', async ({ page }) => {
    await open(page, 't01');
    const at = () => page.evaluate(() =>
      [...document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-loc-rung')].map((r) => Math.round(r.getBoundingClientRect().top)));
    const before = await at();
    await page.click('.deck-mid button[aria-label="השלב הקודם"]');
    await page.waitForTimeout(700);
    expect(await at()).toEqual(before);
  });
});

test.describe('back to the current stage', () => {
  test('the pill appears only off the current stage, and its row never resizes', async ({ page }) => {
    await open(page, 't01');
    const row = await rect(page, '.deck-track > .deck-slide:nth-child(3) .deck-stage-backrow');
    expect(await page.evaluate(() =>
      !!document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage-back:not([hidden])'))).toBe(false);

    await page.click('.deck-mid button[aria-label="השלב הקודם"]');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() =>
      !!document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage-back:not([hidden])'))).toBe(true);

    // The row keeps its height either way. A chrome that resizes the scroller
    // mid-scroll is exactly what DIA-379 turned out to be.
    expect(await rect(page, '.deck-track > .deck-slide:nth-child(3) .deck-stage-backrow')).toEqual(row);
  });

  test('it walks back to the current stage', async ({ page }) => {
    await open(page, 't01', '#3-s1');
    await page.click('.deck-track > .deck-slide:nth-child(3) .deck-stage-back');
    await page.waitForTimeout(800);
    expect(await here(page)).toBe('4');
  });
});

test.describe('the page body', () => {
  test('a stage with an overview reads like slide 2', async ({ page }) => {
    await open(page, 't01', '#3-s2');
    const m = await page.evaluate(() => {
      const p = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="2"]')!;
      const lead = p.querySelector('.deck-stage-body > p:first-child');
      return {
        lead: lead ? getComputedStyle(lead).fontSize : null,
        chips: p.querySelectorAll('button.chip').length,
        named: [...p.querySelectorAll('button.chip')].every((a) => (a.textContent ?? '').trim().length > 0),
        cards: p.querySelectorAll('.deck-ov-card').length,
      };
    });
    // §6 draws the lead at 17px here and §5 draws it at 18px on slide 2. That
    // is the screens' own difference, and it is deliberate.
    expect(m.lead).toBe('17px');
    expect(m.chips).toBeGreaterThan(0);
    expect(m.named).toBe(true);
    expect(m.cards).toBeGreaterThan(0);
  });

  test('a reached stage with no overview falls back to its claims', async ({ page }) => {
    // An overview improves a page; it does not gate one. Most published items
    // have none today, and every one of them has to render.
    await open(page, 't03', '#3-s1');
    const m = await page.evaluate(() => {
      const p = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="1"]')!;
      return {
        fallback: p.querySelectorAll('.deck-stage-claim').length,
        quotes: [...p.querySelectorAll('.deck-stage-quote')].map((q) => (q.textContent ?? '').trim()),
        chips: p.querySelectorAll('button.chip').length,
        cards: p.querySelectorAll('.deck-ov-card').length,
      };
    });
    expect(m.fallback).toBeGreaterThan(0);
    expect(m.quotes.every((q) => q.startsWith('„') && q.endsWith('“'))).toBe(true);
    // No overview means no cite spans, so no chips - the card is the link.
    expect(m.chips).toBe(0);
    expect(m.cards).toBe(m.fallback);
  });

  test('a chip on a stage page opens its drawer, and the stack scrolls to it', async ({ page }) => {
    // The same interaction as slide 2 - DIA-386 gives it to every slide that
    // has chips, and the deck owns it rather than any one screen.
    await open(page, 't01', '#3-s2');
    const m = await page.evaluate(() => {
      const p = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="2"]')!;
      const chip = p.querySelector<HTMLElement>('button.chip')!;
      chip.click();
      const d = document.getElementById(chip.getAttribute('aria-controls')!)!;
      return {
        shown: !d.hasAttribute('hidden'),
        expanded: chip.getAttribute('aria-expanded'),
        inStage: d.closest('.deck-stage') === p,
        quote: (d.querySelector('.deck-drawer-quote')?.textContent ?? '').trim().length,
      };
    });
    expect(m.shown).toBe(true);
    expect(m.expanded).toBe('true');
    expect(m.inStage).toBe(true);
    expect(m.quote).toBeGreaterThan(0);

    await page.waitForTimeout(500);
    expect(await page.evaluate(() => {
      const d = document.querySelector('.deck-drawer:not([hidden])')!;
      const b = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stack')!.getBoundingClientRect();
      return d.getBoundingClientRect().bottom <= b.bottom + 1;
    })).toBe(true);
  });

  test('the carousel is no longer a target, on any slide', async ({ page }) => {
    await open(page, 't01', '#3-s2');
    await page.evaluate(() =>
      document.querySelector<HTMLElement>('.deck-stage[data-stage="2"] button.chip')!.click());
    await page.waitForTimeout(400);
    // Nothing in the body points at it any more: no card is marked.
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-ov-card[data-on]').length)).toBe(0);
  });

  test('the evidence map is on stage 1, and before the carousel', async ({ page }) => {
    await open(page, 't01', '#3-s1');
    const m = await page.evaluate(() => {
      const one = document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage[data-stage="1"]')!;
      const map = one.querySelector('.deck-stage-map');
      const rail = one.querySelector('.deck-ov-sources');
      return {
        onOne: !!map?.querySelector('svg'),
        before: !!map && !!rail &&
          map.getBoundingClientRect().top < rail.getBoundingClientRect().top,
        elsewhere: document.querySelectorAll('.deck-stage:not([data-stage="1"]) .deck-stage-map').length,
        width: map ? Math.round(map.getBoundingClientRect().width) : 0,
      };
    });
    expect(m.onOne).toBe(true);
    expect(m.before).toBe(true);
    expect(m.elsewhere).toBe(0);
    // It ships as the desktop component at 390 (§12, ruled 20 September), so
    // the only thing asserted is that it fits the column it was given.
    expect(m.width).toBeLessThanOrEqual(390 - 36 - 20);
  });
});

test.describe('the footer', () => {
  test('the arrows are real buttons, and they are only on this slide', async ({ page }) => {
    await open(page, 't01');
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-mid .deck-stage-arrows button').length)).toBe(2);

    await page.goto('/item/t01/#2');
    await page.waitForSelector('.deck-ov-scroll');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-mid .deck-stage-arrows').length)).toBe(0);
  });

  test('the slide chain still reads as §3 draws it', async ({ page }) => {
    await open(page, 't01');
    // The slot holds two layers since DIA-401; the one at full strength is
    // the label. Reading the slot whole would read the waiting one too.
    const m = await page.evaluate(() => {
      const shown = (slot: string) => {
        const layers = [...document.querySelectorAll(`${slot} [data-lyr]`)];
        const on = layers.find((l) => Number(getComputedStyle(l).opacity) > 0.5) ?? layers[0];
        return (on?.textContent ?? '').trim();
      };
      return {
        prev: shown('.deck-prev'),
        next: shown('.deck-next'),
        mid: (document.querySelector('.deck-mid')?.textContent ?? '').trim(),
      };
    });
    expect(m.prev).toContain('סקירת הכשל');
    expect(m.next).toContain('מה עוד לא נעשה');
    expect(m.mid).toContain('שלבים');
  });
});
