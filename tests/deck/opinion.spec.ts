import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * Slide 5 — דעת הציבור (DIA-443, spec §8, UX DIA-394).
 *
 * The slide that asks rather than tells, and the only one whose head cites
 * nothing. So what is worth asserting is the three things that are unlike the
 * rest of the deck: no citation mark anywhere on it, two lines that point back
 * at the slides they condense, and a ballot that answers a tap without acting.
 * Plus the one that has bitten this deck twice already — that a slide is found
 * by its identity and not by its position.
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

async function open(page: Page, id: string, hash = '#5') {
  await page.goto(`/item/${id}/${hash}`);
  await arrived(page);
  await page.waitForSelector('.deck-op');
  await page.waitForTimeout(450);
}

/** The card, wherever in this item's deck it happens to sit. */
const op = '.deck-op';

test.describe('what is on the slide', () => {
  test('label, three lines, question and a sealed ballot — and no button', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const card = document.querySelector('.deck-op')!.closest('.deck-card')!;
      const o = document.querySelector('.deck-op')!;
      return {
        label: card.querySelector('.deck-label')?.textContent,
        lines: o.querySelectorAll('.deck-op-line').length,
        caveat: !!o.querySelector('.deck-op-cav'),
        refs: [...o.querySelectorAll('.deck-op-ref')].map((r) => r.textContent?.trim()),
        legend: o.querySelector('.deck-op-poll legend')?.textContent?.trim(),
        circles: o.querySelectorAll('.deck-op-scale i').length,
        fieldset: o.querySelector('.deck-op-poll')?.tagName,
        // DIA-435 rule 6: no provider is chosen, so the newsletter pill does
        // not ship dead — the slide ends at the ballot.
        buttons: card.querySelectorAll('button,a,.deck-more').length,
        // §8: the head cites nothing, and there is no sheet behind this card.
        chips: o.querySelectorAll('.chip').length,
        sheet: !!document.querySelector('.deck-sheet[id="sheet-op"]'),
      };
    });
    expect(m.label).toBe('דעת הציבור');
    expect(m.lines).toBe(2);
    expect(m.caveat).toBe(true);
    expect(m.refs).toEqual(['סקירת הכשל', 'מה נעשה מאז']);
    expect(m.legend).toBe('המענה ייפתח בהמשך');
    expect(m.circles).toBe(5);
    expect(m.fieldset).toBe('FIELDSET');
    expect(m.buttons).toBe(0);
    expect(m.chips).toBe(0);
    expect(m.sheet).toBe(false);
  });

  test('the question is the one centred thing, and nothing else is', async ({ page }) => {
    await open(page, 't01');
    // Measured, not read off the keyword: `text-align:start` computes to
    // `start` and resolves to right only once the direction is applied, and a
    // block's own box is full-width whatever its text does inside it. So each
    // one is asked where its *words* are, with a Range - the same measurement
    // that settled §7's numeral.
    const m = await page.evaluate(() => {
      const o = document.querySelector('.deck-op')!;
      const where = (sel: string) => {
        const el = o.querySelector(sel)!;
        const r = document.createRange();
        r.selectNodeContents(el);
        const box = r.getBoundingClientRect();
        const own = el.getBoundingClientRect();
        r.detach();
        return {
          // Positive: the words stop short of the block's own start (right).
          start: Math.round(own.right - box.right),
          end: Math.round(box.left - own.left),
        };
      };
      return {
        q: where('.deck-op-q'),
        line: where('.deck-op-line p'),
        cav: where('.deck-op-cav p'),
        size: getComputedStyle(o.querySelector('.deck-op-q')!).fontSize,
      };
    });
    // The question sits in from both edges by about the same amount, which is
    // what being centred means and what `text-align:center` alone would not
    // prove on a block whose text happens to fill it.
    expect(m.q.start).toBeGreaterThan(4);
    expect(Math.abs(m.q.start - m.q.end)).toBeLessThanOrEqual(2);
    // The lines begin at the reading edge and are ragged at the other.
    expect(m.line.start).toBeLessThanOrEqual(1);
    expect(m.cav.start).toBeLessThanOrEqual(1);
    expect(m.size).toBe('22px');
  });

  test('the chip ends its line rather than standing below it', async ({ page }) => {
    await open(page, 't01');
    // The whole point of threading the back-reference through the annotation
    // renderer instead of putting it after the paragraph: it has to sit in the
    // last line's own flow, and in RTL that is the left end of that line.
    const m = await page.evaluate(() => {
      const line = document.querySelector('.deck-op-line')!;
      const p = line.querySelector('p')!.getBoundingClientRect();
      const ref = line.querySelector('.deck-op-ref')!.getBoundingClientRect();
      return { inside: ref.bottom <= p.bottom + 1 && ref.top >= p.top - 1, ref: ref.width };
    });
    expect(m.inside).toBe(true);
    expect(m.ref).toBeGreaterThan(40);
  });
});

test.describe('the two pointers', () => {
  test('line one scrolls the deck to slide 2', async ({ page }) => {
    await open(page, 't01');
    await page.locator(`${op} .deck-op-line`).first().click();
    await page.waitForFunction(() => document.querySelector('.deck')?.getAttribute('data-at') === '1');
    expect(page.url()).toContain('#2');
  });

  test('line two scrolls to slide 3 and lands on the current stage', async ({ page }) => {
    await open(page, 't01', '#3');
    const cur = await page.evaluate(() =>
      (document.querySelector('.deck') as HTMLElement).dataset.stage2 ?? null);
    expect(cur).not.toBeNull();

    // Walk the stack off the current stage, so landing on it is a move and not
    // a coincidence.
    await page.evaluate(() => window.dispatchEvent(
      new CustomEvent('deck:stage', { detail: { slide: 2, dir: -1 } })));
    await page.waitForFunction(
      (c) => (document.querySelector('.deck') as HTMLElement).dataset.stage2 !== c, cur);

    await page.goto(`${page.url().split('#')[0]}#5`);
    await arrived(page);
    await page.waitForTimeout(300);
    await page.locator(`${op} .deck-op-line`).nth(1).click();
    await page.waitForFunction(() => document.querySelector('.deck')?.getAttribute('data-at') === '2');
    await page.waitForFunction(
      (c) => (document.querySelector('.deck') as HTMLElement).dataset.stage2 === c, cur);
  });

  test('the whole line is the target, not only the chip', async ({ page }) => {
    await open(page, 't01');
    // A tap on the words at the far end of the line, nowhere near the chip.
    const box = await page.locator(`${op} .deck-op-line`).first().boundingBox();
    await page.mouse.click(box!.x + box!.width - 8, box!.y + 8);
    await page.waitForFunction(() => document.querySelector('.deck')?.getAttribute('data-at') === '1');
  });

  test('a line answers Enter, because it is a button that is not a button', async ({ page }) => {
    await open(page, 't01');
    await page.locator(`${op} .deck-op-line`).first().focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.deck')?.getAttribute('data-at') === '1');
  });

  test('the deck adds at most one entry, pointer or not', async ({ page }) => {
    await page.goto('/item/t01/');
    await arrived(page);
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => history.length);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('deck:slide', { detail: { to: 5 } })));
    await page.waitForFunction(() => document.querySelector('.deck')?.getAttribute('data-at') === '4');
    await page.waitForTimeout(250);
    await page.locator(`${op} .deck-op-line`).first().click();
    await page.waitForFunction(() => document.querySelector('.deck')?.getAttribute('data-at') === '1');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
  });
});

test.describe('the seal', () => {
  test('a tap is answered and nothing acts', async ({ page }) => {
    await open(page, 't01');
    const poll = page.locator(`${op} .deck-op-poll`);
    const url = page.url();
    await poll.click({ position: { x: 20, y: 40 } });
    await expect(poll).toHaveAttribute('data-said', '');
    // The one warning colour, on the caption and on nothing else.
    // The caption fades to the one warning colour, so the read has to be
    // after the transition and not on the frame the attribute landed.
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('.deck-op-poll legend')!).color
        === 'rgb(217, 165, 79)');
    await expect(poll).not.toHaveAttribute('data-said', '', { timeout: 2000 });
    // No toast, no text, and the deck has not moved.
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.querySelector('.deck')?.getAttribute('data-at'))).toBe('4');
  });

  test('at rest the amber is the clock\'s alone', async ({ page }) => {
    await open(page, 't01');
    // The second of the two places the item page allows a warning colour
    // (§7's hourglass is the other). Until a tap it is the clock and nothing
    // else: the legend's words are ink, and the box is ink.
    const m = await page.evaluate(() => {
      const poll = document.querySelector('.deck-op-poll')!;
      const amber = 'rgb(217, 165, 79)';
      return {
        clock: getComputedStyle(poll.querySelector('legend svg')!).stroke === amber,
        words: getComputedStyle(poll.querySelector('legend')!).color === amber,
        box: getComputedStyle(poll).borderTopColor === amber,
        said: poll.hasAttribute('data-said'),
      };
    });
    expect(m).toEqual({ clock: true, words: false, box: false, said: false });
  });

  test('the circles are dashed, and nothing on the box is blurred', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.deck-op-poll')!);
      const c = getComputedStyle(document.querySelector('.deck-op-scale i')!);
      return {
        box: s.borderTopStyle, radius: s.borderTopLeftRadius, filter: s.filter,
        circle: c.borderTopStyle, w: c.width,
      };
    });
    expect(m.box).toBe('dashed');
    expect(m.radius).toBe('14px');
    expect(m.filter).toBe('none');
    expect(m.circle).toBe('dashed');
    expect(m.w).toBe('52px');
  });
});

test.describe('fit', () => {
  for (const height of [844, 664, 600]) {
    test(`one frame at ${height}, and the card never scrolls`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await open(page, 't01');
      const m = await page.evaluate(() => {
        const o = document.querySelector('.deck-op')!;
        const read = o.parentElement!;
        return {
          over: read.scrollHeight - read.clientHeight,
          shed: o.getAttribute('data-shed'),
          // The lines, the question and the legend are in no shedding step.
          lines: [...o.querySelectorAll('.deck-op-line')]
            .every((l) => (l as HTMLElement).offsetHeight > 0),
          q: (o.querySelector('.deck-op-q') as HTMLElement).offsetHeight > 0,
          legend: (o.querySelector('.deck-op-poll legend') as HTMLElement).offsetHeight > 0,
          cav: (o.querySelector('.deck-op-cav') as HTMLElement | null)?.offsetHeight ?? 0,
          circle: (o.querySelector('.deck-op-scale i') as HTMLElement).offsetWidth,
        };
      });
      expect(m.over).toBeLessThanOrEqual(1);
      expect(m.lines).toBe(true);
      expect(m.q).toBe(true);
      expect(m.legend).toBe(true);
      if (height >= 664) {
        // §8: nothing is shed at 844 or 664.
        expect(m.shed).toBeNull();
        expect(m.cav).toBeGreaterThan(0);
        expect(m.circle).toBe(52);
      } else {
        // The order is what is asserted, not the step: how far it gets is a
        // property of the copy, and the copy is the editor's.
        expect(m.shed).not.toBeNull();
        expect(m.circle).toBe(12);
        if (m.shed !== '1') expect(m.cav).toBe(0);
      }
    });
  }
});

test.describe('position is not identity', () => {
  test('the item with no slide 4 shows דעת הציבור fourth, and it is slide 5', async ({ page }) => {
    // The trap: everything the deck is handed is indexed by position, so on
    // t05 slide 5's card would have landed in slide 4's frame (DIA-422).
    await open(page, 't05', '');
    const m = await page.evaluate(() => {
      const slides = [...document.querySelectorAll('.deck-track > .deck-slide')];
      const i = slides.findIndex((s) => s.querySelector('.deck-op'));
      return {
        i,
        id: slides[i]?.id,
        label: slides[i]?.getAttribute('aria-label'),
        gaps: document.querySelectorAll('.deck-gap').length,
        // And the two pointers still name slides, not positions.
        backs: [...document.querySelectorAll('[data-back]')].map((b) => b.getAttribute('data-back')),
      };
    });
    expect(m.i).toBe(3);
    expect(m.id).toBe('slide-5');
    expect(m.label).toBe('4 מתוך 5 · דעת הציבור');
    expect(m.gaps).toBe(0);
    expect(m.backs).toEqual(['2', '3']);
  });

  test('#5 opens it on both shapes of deck', async ({ page }) => {
    for (const id of ['t01', 't05']) {
      await open(page, id);
      expect(await page.evaluate(() => {
        const s = document.querySelector('.deck-op')!.closest('.deck-slide')!;
        return s.getAttribute('aria-current');
      })).toBe('true');
    }
  });
});
