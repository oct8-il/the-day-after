import { test, expect, type Page } from '@playwright/test';

/**
 * Slide 4 — מה עוד לא נעשה (DIA-387, spec §7).
 *
 * The same component as slide 3 with the opposite filter, so most of what is
 * worth asserting is what *differs*: the outline tag, the centred column, the
 * hourglass, the four things the slide does not grow, and the one item that
 * does not have this slide at all.
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

async function open(page: Page, id: string, hash = '#4') {
  await page.goto(`/item/${id}/${hash}`);
  await page.waitForSelector('.deck-slide');
  await page.waitForTimeout(450);
}

/** Slide 4's own subtree, so slide 3's stack cannot answer for it. */
const four = '.deck-track > .deck-slide:nth-child(4)';

test.describe('the item that has no slide 4', () => {
  test('t05 is a five-slide post with five dots', async ({ page }) => {
    // §7: there is no "nothing left" screen, because a slide with nothing to
    // say is not shown. t05 has reached every stage.
    await open(page, 't05', '');
    const m = await page.evaluate(() => ({
      slides: document.querySelectorAll('.deck-slide').length,
      dots: document.querySelectorAll('.deck-dot').length,
      labels: [...document.querySelectorAll('.deck-slide')].map((s) => s.getAttribute('aria-label')),
      gaps: document.querySelectorAll('.deck-gap').length,
    }));
    expect(m.slides).toBe(5);
    expect(m.dots).toBe(5);
    expect(m.gaps).toBe(0);
    // The sections count off this item's own list, not off the canonical six.
    expect(m.labels.every((l) => l?.includes('מתוך 5'))).toBe(true);
    expect(m.labels.some((l) => l?.includes('מה עוד לא נעשה'))).toBe(false);
  });

  test('the hash counts off the item, so #4 is a different slide on t05', async ({ page }) => {
    await open(page, 't01');
    expect(await page.evaluate(() =>
      (document.querySelector('.deck-slide[aria-current]')?.getAttribute('aria-label') ?? ''))).toContain('מה עוד לא נעשה');

    await open(page, 't05');
    expect(await page.evaluate(() =>
      (document.querySelector('.deck-slide[aria-current]')?.getAttribute('aria-label') ?? ''))).toContain('דעת הציבור');
  });

  test('the footer chain skips it rather than pointing at nothing', async ({ page }) => {
    await open(page, 't05', '#3');
    const m = await page.evaluate(() => ({
      next: (document.querySelector('.deck-next')?.textContent ?? '').trim(),
      prev: (document.querySelector('.deck-prev')?.textContent ?? '').trim(),
    }));
    expect(m.next).toContain('דעת הציבור');
    expect(m.next).not.toContain('מה עוד לא נעשה');
    expect(m.prev).toContain('סקירת הכשל');
  });
});

test.describe('the stack', () => {
  test('it holds the stages the item has not reached, opening at the next', async ({ page }) => {
    await open(page, 't01');
    expect(await page.evaluate((s) =>
      [...document.querySelector(s)!.querySelectorAll('.deck-stage')].map((x) => x.getAttribute('data-stage')),
    four)).toEqual(['5']);

    await open(page, 't02');
    expect(await page.evaluate((s) =>
      [...document.querySelector(s)!.querySelectorAll('.deck-stage')].map((x) => x.getAttribute('data-stage')),
    four)).toEqual(['2', '3', '4', '5']);
    expect(await page.evaluate(() =>
      document.querySelector<HTMLElement>('.deck')!.dataset.stage3)).toBe('2');
  });

  test('a regressed item keeps its current stage on slide 3', async ({ page }) => {
    // §7 spends a paragraph on this and no screen shows it. t06 is at stage 6,
    // having reached 1, 3, 4 and 6 - so slide 4 holds only 2 and 5, and the
    // gold pill stays on slide 3 whatever route the item took.
    await open(page, 't06');
    const m = await page.evaluate(() => ({
      three: [...document.querySelectorAll('.deck-slide')[2]!.querySelectorAll('.deck-stage')]
        .map((s) => s.getAttribute('data-stage')),
      four: [...document.querySelectorAll('.deck-slide')[3]!.querySelectorAll('.deck-stage')]
        .map((s) => s.getAttribute('data-stage')),
      pillOnThree: document.querySelectorAll('.deck-slide')[2]!.querySelectorAll('.deck-stage-now').length,
      pillOnFour: document.querySelectorAll('.deck-slide')[3]!.querySelectorAll('.deck-stage-now').length,
    }));
    expect(m.three).toEqual(['1', '3', '4', '6']);
    expect(m.four).toEqual(['2', '5']);
    expect(m.pillOnThree).toBe(1);
    expect(m.pillOnFour).toBe(0);
  });

  test('the centre arrows appear only when the stack holds more than one page', async ({ page }) => {
    await open(page, 't01');
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-mid .deck-stage-arrows').length)).toBe(0);

    await open(page, 't02');
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-mid .deck-stage-arrows button').length)).toBe(2);
    await page.click('.deck-mid button[aria-label="השלב הבא"]');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.querySelector<HTMLElement>('.deck')!.dataset.stage3)).toBe('3');
  });
});

test.describe('the locator', () => {
  test('a rung is in the same place on slide 3 and slide 4', async ({ page }) => {
    // The promise Phase 5 made when it held the empty slots.
    await open(page, 't01', '#3');
    const three = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-slide')[2]!.querySelectorAll('.deck-loc-rung')]
        .map((r) => Math.round(r.getBoundingClientRect().top)));
    await open(page, 't01', '#4');
    const four = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-slide')[3]!.querySelectorAll('.deck-loc-rung')]
        .map((r) => Math.round(r.getBoundingClientRect().top)));
    expect(four).toEqual(three);
    expect(three.length).toBe(5);
  });

  test('only this slide’s stages are drawn, and the ring is the viewed one', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const rungs = [...document.querySelector(s)!.querySelectorAll('.deck-loc-rung')];
      return {
        drawn: rungs.map((r) => r.hasAttribute('data-drawn')),
        un: rungs.map((r) => r.hasAttribute('data-un')),
        on: rungs.findIndex((r) => r.hasAttribute('data-on')),
        rings: rungs.map((r) => getComputedStyle(r).boxShadow).filter((b) => b !== 'none').length,
      };
    }, four);
    expect(m.drawn).toEqual([false, false, false, false, true]);
    // Drawn but not reached: a grey bar, ringed in the same grey.
    expect(m.un).toEqual([false, false, false, false, true]);
    expect(m.on).toBe(4);
    expect(m.rings).toBe(1);
  });

  test('t02 draws four rungs and leaves the first slot empty', async ({ page }) => {
    await open(page, 't02');
    expect(await page.evaluate((s) =>
      [...document.querySelector(s)!.querySelectorAll('.deck-loc-rung')].map((r) => r.hasAttribute('data-drawn')),
    four)).toEqual([false, true, true, true, true]);
  });
});

test.describe('the page', () => {
  test('the tag is an outline in muted ink, and the date says it has not happened', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!;
      const tag = p.querySelector('.deck-stage-tag')!;
      return {
        text: (tag.textContent ?? '').trim(),
        fill: getComputedStyle(tag).backgroundColor,
        border: parseFloat(getComputedStyle(tag).borderTopWidth),
        style: getComputedStyle(tag).borderTopStyle,
        age: (p.querySelector('.deck-stage-age')?.textContent ?? '').trim(),
        def: (p.querySelector('.deck-stage-def')?.textContent ?? '').trim().length,
        ink: getComputedStyle(tag).color,
        filledInk: getComputedStyle(
          document.querySelector('.deck-track > .deck-slide:nth-child(3) .deck-stage-tag')!,
        ).color,
      };
    }, four);
    expect(m.text).toBe('5 · אומת עצמאית');
    expect(m.fill).toBe('rgba(0, 0, 0, 0)');
    // A 1.5px border snaps to the device pixel, so the number says nothing at
    // dpr 1 - that it is drawn at all, and in muted ink rather than the dark
    // ink a filled tag carries, is the thing §7 asks for.
    expect(m.border).toBeGreaterThan(0);
    expect(m.ink).not.toBe(m.filledInk);
    // Solid, not dashed - the whole rail came off the dashes on 20 September.
    expect(m.style).toBe('solid');
    expect(m.age).toBe('טרם תועד');
    expect(m.def).toBeGreaterThan(0);
  });

  test('everything under the rule is one column, centred both ways', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const gap = document.querySelector(s)!.querySelector('.deck-gap')!;
      const g = gap.getBoundingClientRect();
      const kids = [...gap.children];
      const first = kids[0]!.getBoundingClientRect();
      const last = kids[kids.length - 1]!.getBoundingClientRect();
      const mid = (e: Element) => {
        const r = e.getBoundingClientRect();
        return Math.round(r.left + r.width / 2);
      };
      return {
        above: Math.round(first.top - g.top),
        below: Math.round(g.bottom - last.bottom),
        centres: [...new Set(kids.map(mid))],
        tall: g.height > 300,
      };
    }, four);
    expect(m.tall).toBe(true);
    // Centred vertically: the same air above the first child as below the last.
    expect(Math.abs(m.above - m.below)).toBeLessThanOrEqual(1);
    // And horizontally: every part shares one centre line.
    expect(m.centres.length).toBe(1);
  });

  test('the hourglass is above the numeral, and the numeral above the box', async ({ page }) => {
    // §7 draws the numeral beneath the mark, not beside it.
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!;
      const r = (q: string) => p.querySelector(q)!.getBoundingClientRect();
      const mark = p.querySelector('.deck-gap-mark')!;
      return {
        markSize: Math.round(r('.deck-gap-mark').width),
        glyph: Math.round(r('.deck-gap-mark svg').width),
        markAboveN: r('.deck-gap-mark').bottom <= r('.deck-gap-n').top,
        nAboveAsk: r('.deck-gap-n').bottom <= r('.deck-gap-ask').top,
        n: (p.querySelector('.deck-gap-n')?.textContent ?? '').trim(),
        since: (p.querySelector('.deck-gap-since')?.textContent ?? '').trim(),
        size: getComputedStyle(p.querySelector('.deck-gap-n')!).fontSize,
        stroke: getComputedStyle(p.querySelector('.deck-gap-mark svg')!).stroke,
        bg: getComputedStyle(mark).backgroundColor,
      };
    }, four);
    expect(m.markSize).toBe(58);
    expect(m.glyph).toBe(28);
    expect(m.markAboveN).toBe(true);
    expect(m.nAboveAsk).toBe(true);
    expect(m.size).toBe('38px');
    expect(m.n).toMatch(/^[\d,]+$/);
    expect(m.since.startsWith('ימים מאז')).toBe(true);
    // The only warning colour in the item page.
    expect(m.stroke).toBe('rgb(217, 165, 79)');
    expect(m.bg).toContain('0.14');
  });

  test('the warning colour is the hourglass\'s alone, on the whole page', async ({ page }) => {
    await open(page, 't01');
    const n = await page.evaluate(() => {
      const warn = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim();
      const out: string[] = [];
      for (const el of document.querySelectorAll('.deck *')) {
        const s = getComputedStyle(el);
        if (s.stroke !== 'rgb(217, 165, 79)' && s.color !== 'rgb(217, 165, 79)') continue;
        out.push(el.closest('.deck-gap-mark') ? 'mark' : `${el.tagName}.${el.className}`);
      }
      return { warn, out, marks: document.querySelectorAll('.deck-gap-mark').length };
    });
    expect(n.warn).toBe('#d9a54f');
    // `stroke` is inherited, so the svg and its four paths all report it. What
    // matters is that nothing outside the one mark does.
    expect(n.out.length).toBeGreaterThan(0);
    expect([...new Set(n.out)]).toEqual(['mark']);
    expect(n.marks).toBe(1);
  });

  test('stage 5 names who would count; the others go straight to the mark', async ({ page }) => {
    await open(page, 't01');
    expect(await page.evaluate((s) =>
      (document.querySelector(s)!.querySelector('.deck-gap-who')?.textContent ?? '').length, four))
      .toBeGreaterThan(20);

    await open(page, 't02');
    const m = await page.evaluate((s) => {
      const pages = [...document.querySelector(s)!.querySelectorAll('.deck-stage')];
      return pages.map((p) => ({
        stage: p.getAttribute('data-stage'),
        who: !!p.querySelector('.deck-gap-who'),
        say: (p.querySelector('.deck-gap-say')?.textContent ?? '').trim().length,
      }));
    }, four);
    expect(m.map((x) => x.who)).toEqual([false, false, false, true]);
    expect(m.every((x) => x.say > 0)).toBe(true);
  });

  test('an unwritten absence statement says so rather than showing nothing', async ({ page }) => {
    // DIA-367 again: stages 3 and 4 were never written.
    await open(page, 't02');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!.querySelector('.deck-stage[data-stage="3"]')!;
      return (p.querySelector('.deck-gap-say')?.textContent ?? '').trim();
    }, four);
    expect(m).toBe('ניסוח היעדר השלב טרם נכתב.');
  });
});

test.describe('the four things it does not grow', () => {
  test('no pill, no chips, no carousel, no drawer', async ({ page }) => {
    await open(page, 't02');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!;
      return {
        now: p.querySelectorAll('.deck-stage-now').length,
        chips: p.querySelectorAll('.chip').length,
        rails: p.querySelectorAll('.deck-ov-sources').length,
        drawers: p.querySelectorAll('.deck-drawer').length,
      };
    }, four);
    // There is nothing to cite for something that has not happened, and the
    // statement is computed rather than authored.
    expect(m).toEqual({ now: 0, chips: 0, rails: 0, drawers: 0 });
  });

  test('the back pill walks back a slide, and points at it', async ({ page }) => {
    await open(page, 't01');
    const shown = await page.evaluate((s) =>
      !!document.querySelector(s)!.querySelector('.deck-stage-back:not([hidden])'), four);
    expect(shown).toBe(true);

    await page.evaluate((s) =>
      (document.querySelector(s)!.querySelector('.deck-stage-back') as HTMLElement).click(), four);
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({
      at: document.querySelector('.deck')!.getAttribute('data-at'),
      stage: document.querySelector<HTMLElement>('.deck')!.dataset.stage2,
      tail: location.hash,
    }));
    // Slide 3, landing on its current stage - and the tail naming it, which a
    // single shared `data-stage` got wrong: slide 4's stack wrote it last.
    expect(after.at).toBe('2');
    expect(after.stage).toBe('4');
    expect(after.tail).toBe('#3-s4');
  });
});
