import { test, expect, type Page } from '@playwright/test';

/**
 * Slide 2 — סקירת הכשל (DIA-381, spec §5).
 *
 * The first body slide, and the pattern slides 3 and 4 reuse. Most of what is
 * asserted here is therefore not about this screen: it is about the rules that
 * are being set for three screens at once.
 *
 * t01 is authored past the column on purpose, so the scroll is a measurement
 * and not a hope; t03 fits, carries a two-item list and an inline hyperlink;
 * t05 carries no list at all. t02 is the floor — one claim, one span.
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

/**
 * Open an item at the gate and walk to slide 2, the way a reader arrives.
 *
 * For the gesture tests only. A cold deep link to #2 makes slide 2 the entry
 * slide, and §11's push-once rule then turns a swipe back onto it into
 * history.back() - which, in a fixture with nothing behind the page, leaves it
 * for about:blank and the assertion reads a torn-down document rather than a
 * bug. Arriving with something behind you is the honest case anyway.
 */
async function walkTo2(page: Page, id: string) {
  await page.goto(`/item/${id}/`);
  await page.waitForSelector('.deck-gate-rail');
  await page.evaluate(() => { location.hash = '#2'; });
  await page.waitForSelector('.deck-ov-scroll');
  await page.waitForTimeout(500);
}

/** Open an item on slide 2 and let the deck settle on the snap point. */
async function open(page: Page, id: string) {
  await page.goto(`/item/${id}/#2`);
  await page.waitForSelector('.deck-ov-scroll');
  await page.waitForTimeout(300);
}

test.describe('the column', () => {
  test('three parts, in order, filling the frame between the chrome', async ({ page }) => {
    // The cheapest assertion that notices a collision: .chip, .lead and .prose
    // all have bare rules in this stylesheet, and a gate screen once rendered
    // as nothing while every data assertion passed.
    await open(page, 't03');
    const ov = await rect(page, '.deck-ov');
    const title = await rect(page, '.deck-ov-title');
    const scroll = await rect(page, '.deck-ov-scroll');
    const body = await rect(page, '.deck-ov-body');
    const rail = await rect(page, '.deck-ov .deck-ov-sources');

    expect(ov.height).toBeGreaterThan(400);
    expect(title.height).toBeGreaterThan(18);
    expect(body.height).toBeGreaterThan(200);
    expect(rail.height).toBeGreaterThan(60);

    // In order, and nothing overlapping its neighbour.
    expect(title.bottom).toBeLessThanOrEqual(scroll.top + 0.5);
    expect(body.bottom).toBeLessThanOrEqual(rail.top + 0.5);
    // §5: 14px between the parts. The gap under the body is a floor rather
    // than a figure, because the carousel falls to the foot of a short item.
    expect(Math.round(scroll.top - title.bottom)).toBe(14);
    expect(Math.round(body.top - scroll.top)).toBe(0);
    expect(rail.top - body.bottom).toBeGreaterThanOrEqual(13.5);
  });

  test('the title is a chip, and its radius is always half its height', async ({ page }) => {
    await open(page, 't03');
    const r = await rect(page, '.deck-ov-title');
    const css = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.deck-ov-title')!);
      return { radius: s.borderTopLeftRadius, weight: s.fontWeight, size: s.fontSize, spacing: s.letterSpacing };
    });
    // 999px is a radius no box here can reach, which is what makes the corner
    // always half the height. getComputedStyle reports the specified length,
    // not the used one, so the assertion is "far past half" rather than "half".
    expect(parseFloat(css.radius)).toBeGreaterThanOrEqual(r.height / 2);
    expect(parseFloat(css.radius)).toBeGreaterThan(100);
    expect(css.weight).toBe('700');
    expect(css.size).toBe('11.5px');
    expect(parseFloat(css.spacing)).toBeCloseTo(11.5 * 0.08, 1);
  });

  test('the chip hugs its words rather than filling the row', async ({ page }) => {
    // align-self:flex-start in the spec's screen. In RTL a stretched chip is
    // the kind of thing that reads as "about right" until it is measured.
    await open(page, 't03');
    const slide = await rect(page, '.deck-ov');
    const chip = await rect(page, '.deck-ov-title');
    const ink = await rect(page, '.deck-ov-body > p:first-child');
    expect(chip.width).toBeLessThan(slide.width * 0.75);
    // And it starts where the text does. The slide gives up its side padding
    // so the carousel can reach the edge, so the reference is the ink and not
    // the box - and in RTL "starts" is the physical right.
    expect(Math.round(chip.right)).toBe(Math.round(ink.right));
  });
});

test.describe('the type scale', () => {
  test('the lead is the first paragraph, and only the first', async ({ page }) => {
    await open(page, 't03');
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-ov-body > p')].map((p) => getComputedStyle(p).fontSize));
    expect(sizes[0]).toBe('18px');
    expect(sizes.slice(1).every((s) => s === '15px')).toBe(true);
    expect(sizes.length).toBeGreaterThan(1);
  });

  test('a list draws an em-dash, not a disc', async ({ page }) => {
    await open(page, 't03');
    const list = await page.evaluate(() => {
      const ul = document.querySelector('.deck-ov-body ul');
      if (!ul) return null;
      const li = ul.querySelector('li')!;
      const before = getComputedStyle(li, '::before');
      return {
        items: ul.querySelectorAll('li').length,
        listStyle: getComputedStyle(ul).listStyleType,
        marker: before.content,
        colour: before.color,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--t-press').trim(),
      };
    });
    expect(list).not.toBeNull();
    expect(list!.items).toBe(2);
    expect(list!.listStyle).toBe('none');
    expect(list!.marker).toContain('—');
  });

  test('consecutive items are one list, not a run of one-item lists', async ({ page }) => {
    // The renderer half of this is DIA-382; here it is what the reader sees.
    await open(page, 't01');
    const shape = await page.evaluate(() => ({
      lists: document.querySelectorAll('.deck-ov-body ul').length,
      items: document.querySelectorAll('.deck-ov-body ul li').length,
    }));
    expect(shape).toEqual({ lists: 1, items: 3 });
  });
});

test.describe('the source chips', () => {
  test('a chip names its type on the phone, where the desktop draws a dot alone', async ({ page }) => {
    await open(page, 't03');
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-ov-body button.chip')].map((a) => ({
        text: (a.textContent ?? '').trim(),
        dot: !!a.querySelector('.chip-dot'),
        n: a.querySelector('.chip-n')?.textContent ?? null,
      })));
    expect(chips.length).toBeGreaterThan(3);
    expect(chips.every((c) => c.dot)).toBe(true);
    expect(chips.every((c) => c.text.length > 0)).toBe(true);
  });

  test('a span resting on two claims says +1', async ({ page }) => {
    await open(page, 't01');
    const ns = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-ov-body button.chip .chip-n')].map((e) => e.textContent));
    expect(ns).toEqual(['+1']);
  });

  test('the chip carries its type colour, and every type is distinguishable', async ({ page }) => {
    await open(page, 't01');
    const colours = await page.evaluate(() =>
      [...document.querySelectorAll('.deck-ov-body button.chip .chip-dot')]
        .map((e) => getComputedStyle(e).backgroundColor));
    expect(new Set(colours).size).toBeGreaterThan(1);
    expect(colours.every((c) => c !== 'rgba(0, 0, 0, 0)')).toBe(true);
  });
});

test.describe('the sources carousel', () => {
  test('212px cards, outlet, a two-line quote and a date', async ({ page }) => {
    await open(page, 't03');
    const card = await page.evaluate(() => {
      const li = document.querySelector('.deck-ov .deck-ov-card')!;
      const q = li.querySelector('.deck-ov-card-quote')!;
      return {
        width: li.getBoundingClientRect().width,
        head: (li.querySelector('.deck-ov-card-head')?.textContent ?? '').trim(),
        clamp: getComputedStyle(q).webkitLineClamp,
        quoteSize: getComputedStyle(q).fontSize,
        date: (li.querySelector('.deck-ov-card-date')?.textContent ?? '').trim(),
        label: li.querySelector('a,span[aria-label]')?.getAttribute('aria-label') ?? '',
      };
    });
    expect(card.width).toBeCloseTo(212, 0);
    expect(card.head.length).toBeGreaterThan(0);
    expect(card.clamp).toBe('2');
    expect(card.quoteSize).toBe('12.5px');
    expect(card.date).toMatch(/\d{2}\.\d{2}\.\d{4}|\d{2}\.\d{4}|\d{4}/);
    // §5: the card is the link. No קישור label anywhere on it.
    expect(card.label).not.toContain('קישור');
  });

  test('one card per cited claim, in the order the chips are met', async ({ page }) => {
    // The rail is deduplicated by first appearance. The drawers disagree with
    // it on purpose - they answer what one sentence rests on, in the order it
    // was argued - so the order is read off the body rather than off a chip.
    await open(page, 't01');
    const order = await page.evaluate(() => {
      const cited: string[] = [];
      for (const d of document.querySelectorAll('.deck-ov .deck-drawer')) {
        for (const s of d.querySelectorAll('.deck-drawer-name')) {
          const q = s.parentElement?.parentElement;
          void q;
        }
      }
      return {
        cards: [...document.querySelectorAll('.deck-ov .deck-ov-card')].map((c) => c.getAttribute('data-claim')),
        drawers: [...document.querySelectorAll('.deck-ov .deck-drawer')].map((d) => d.id),
        chips: [...document.querySelectorAll('.deck-ov-body button.chip')].map((c) => c.getAttribute('aria-controls')),
        cited,
      };
    });
    // A chip per span, a drawer per chip, in the same order.
    expect(order.chips).toEqual(order.drawers);
    expect(order.cards.length).toBeGreaterThan(0);
    expect(new Set(order.cards).size).toBe(order.cards.length);
  });

  test('the first card sits against the physical right edge', async ({ page }) => {
    // §2's RTL trap: the rail is RTL, so "first" is right. Asserted on the box
    // rather than on a property name that resolves differently per direction.
    await open(page, 't03');
    const rail = await rect(page, '.deck-ov .deck-ov-sources');
    const first = await rect(page, '.deck-ov .deck-ov-card');
    // The rail runs the full width and pads 20px, so the card's right edge
    // lands where the text's does while a card can still reach the edge.
    const ink = await rect(page, '.deck-ov-body > p:first-child');
    expect(Math.round(first.right)).toBe(Math.round(ink.right));
    expect(first.right).toBeLessThanOrEqual(rail.right + 0.5);
  });
});

/**
 * DIA-386, 21 September. A chip stopped moving the carousel and started
 * opening a drawer under its own passage - an answer slide 5 can give too,
 * having chips and no carousel. The carousel keeps its place and its cards
 * and loses only its job as a target.
 */
test.describe('a chip opens the evidence under its own passage', () => {
  test('the chip is a disclosure, and the drawer is in flow under its block', async ({ page }) => {
    await open(page, 't01');
    const before = await page.evaluate(() => ({
      anchors: document.querySelectorAll('.deck-ov a.chip').length,
      buttons: document.querySelectorAll('.deck-ov button.chip').length,
      open: document.querySelectorAll('.deck-ov .deck-drawer:not([hidden])').length,
    }));
    expect(before.anchors).toBe(0);
    expect(before.buttons).toBeGreaterThan(0);
    expect(before.open).toBe(0);

    const m = await page.evaluate(() => {
      const chip = document.querySelectorAll<HTMLElement>('.deck-ov button.chip')[1]!;
      chip.click();
      const d = document.getElementById(chip.getAttribute('aria-controls')!)!;
      const block = chip.closest('p, li')!;
      return {
        expanded: chip.getAttribute('aria-expanded'),
        shown: !d.hasAttribute('hidden'),
        // In flow directly beneath the block, so the text below moves down
        // rather than being covered.
        follows: block.parentElement === d.parentElement
          ? [...d.parentElement!.children].indexOf(d) - [...d.parentElement!.children].indexOf(block) === 1
          : d.getBoundingClientRect().top >= block.getBoundingClientRect().bottom - 1,
        role: d.getAttribute('role'),
        label: d.getAttribute('aria-label'),
      };
    });
    expect(m.expanded).toBe('true');
    expect(m.shown).toBe(true);
    expect(m.follows).toBe(true);
    expect(m.role).toBe('region');
    expect(m.label).toBeTruthy();
  });

  test('one at a time; the chip toggles it; the × closes it', async ({ page }) => {
    await open(page, 't01');
    const openNth = (n: number) => page.evaluate((i) => {
      document.querySelectorAll<HTMLElement>('.deck-ov button.chip')[i]!.click();
    }, n);
    const shown = () => page.evaluate(() =>
      document.querySelectorAll('.deck-ov .deck-drawer:not([hidden])').length);
    const expanded = () => page.evaluate(() =>
      document.querySelectorAll('.deck-ov button.chip[aria-expanded="true"]').length);

    await openNth(1); await page.waitForTimeout(250);
    expect(await shown()).toBe(1);
    // A second chip closes the first: two open drawers push the body twice.
    await openNth(2); await page.waitForTimeout(250);
    expect(await shown()).toBe(1);
    expect(await expanded()).toBe(1);
    // The same chip again closes it.
    await openNth(2); await page.waitForTimeout(250);
    expect(await shown()).toBe(0);
    expect(await expanded()).toBe(0);

    await openNth(1); await page.waitForTimeout(250);
    await page.click('.deck-ov .deck-drawer:not([hidden]) .deck-drawer-x');
    await page.waitForTimeout(250);
    expect(await shown()).toBe(0);
  });

  test('a scroll does not close it, and leaving the slide does', async ({ page }) => {
    await open(page, 't01');
    await page.evaluate(() => document.querySelectorAll<HTMLElement>('.deck-ov button.chip')[1]!.click());
    await page.waitForTimeout(250);

    // On a scrolling column, tapping elsewhere is a scroll - a reader would
    // lose the drawer by moving.
    await page.evaluate(() => { document.querySelector('.deck-ov-scroll')!.scrollTop += 90; });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-ov .deck-drawer:not([hidden])').length)).toBe(1);

    await page.goto('/item/t01/#3');
    await page.waitForSelector('.deck-stack');
    await page.waitForTimeout(400);
    await page.goto('/item/t01/#2');
    await page.waitForSelector('.deck-ov-scroll');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-drawer:not([hidden])').length)).toBe(0);
  });

  test('a +N chip stacks its claims in cite order, not the carousel order', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const chip = [...document.querySelectorAll<HTMLElement>('.deck-ov button.chip')]
        .find((c) => c.querySelector('.chip-n'))!;
      chip.click();
      const d = document.getElementById(chip.getAttribute('aria-controls')!)!;
      return {
        srcs: d.querySelectorAll('.deck-drawer-src').length,
        quotes: [...d.querySelectorAll('.deck-drawer-quote')].map((q) => (q.textContent ?? '').trim()),
        ways: d.querySelectorAll('.deck-drawer-go').length,
        rule: getComputedStyle(d.querySelectorAll('.deck-drawer-src')[1]!).borderTopWidth,
      };
    });
    expect(m.srcs).toBe(2);
    expect(m.ways).toBe(2);
    expect(m.quotes.every((q) => q.startsWith('„') && q.endsWith('“'))).toBe(true);
    expect(parseFloat(m.rule)).toBeGreaterThan(0);
  });

  test('the close control is placed physically, clear of the date', async ({ page }) => {
    // The trap the mock found: inset-inline-end and the date's
    // margin-inline-start:auto resolve to the same side on this page, so a
    // logical property would put the × on top of the date.
    await open(page, 't01');
    const m = await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.deck-ov button.chip')[1]!.click();
      const d = document.querySelector('.deck-drawer:not([hidden])')!;
      const r = d.getBoundingClientRect();
      const x = d.querySelector('.deck-drawer-x')!.getBoundingClientRect();
      const date = d.querySelector('.deck-drawer-date')!.getBoundingClientRect();
      return { fromLeft: Math.round(x.left - r.left), overlaps: x.right > date.left + 0.5 };
    });
    expect(m.fromLeft).toBeLessThan(12);
    expect(m.overlaps).toBe(false);
  });

  test('opening below the fold scrolls the minimum needed', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate(() => {
      const box = document.querySelector('.deck-ov-scroll')!;
      // A chip near the foot of the column, so its drawer would open off-screen.
      const chips = [...document.querySelectorAll<HTMLElement>('.deck-ov button.chip')];
      const chip = chips.reverse().find((c) => {
        const r = c.getBoundingClientRect();
        return r.bottom < box.getBoundingClientRect().bottom && r.bottom > box.getBoundingClientRect().bottom - 220;
      }) ?? chips[0]!;
      const passage = chip.closest('p, li')!.getBoundingClientRect().top;
      const before = box.scrollTop;
      chip.click();
      return { id: chip.getAttribute('aria-controls')!, before, passage };
    });
    await page.waitForTimeout(600);
    const after = await page.evaluate((id) => {
      const box = document.querySelector('.deck-ov-scroll')!;
      const d = document.getElementById(id)!;
      const b = box.getBoundingClientRect();
      const r = d.getBoundingClientRect();
      return { top: box.scrollTop, visible: r.bottom <= b.bottom + 1, drawerTop: r.top - b.top };
    }, m.id);
    expect(after.visible).toBe(true);
    // Never more than the minimum: the drawer's own top may not be pushed
    // above the column, because the passage above it has to stay on screen.
    expect(after.drawerTop).toBeGreaterThanOrEqual(-1);
  });
});

test.describe('the body scrolls and the rest does not', () => {
  test('t01 overruns the column; t03 and t05 do not', async ({ page }) => {
    for (const [id, over] of [['t01', true], ['t03', false], ['t05', false]] as const) {
      await open(page, id);
      const room = await page.evaluate(() => {
        const b = document.querySelector('.deck-ov-scroll')!;
        return b.scrollHeight - b.clientHeight;
      });
      expect(over ? room > 0 : room === 0, `${id} should ${over ? '' : 'not '}overrun`).toBe(true);
    }
  });

  test('the carousel travels with the text, and waits below it on a long item', async ({ page }) => {
    // The reading ends at the sources. On an item that overruns the column they
    // are past the last sentence rather than sitting over it, so a reader meets
    // them by finishing rather than by looking down.
    await open(page, 't01');
    const hidden = await page.evaluate(() => {
      const sc = document.querySelector('.deck-ov-scroll')!.getBoundingClientRect();
      return document.querySelector('.deck-ov .deck-ov-sources')!.getBoundingClientRect().top >= sc.bottom;
    });
    expect(hidden, 'the carousel is below the fold before the text is read').toBe(true);

    const start = Math.round((await rect(page, '.deck-ov .deck-ov-sources')).top);
    await page.evaluate(() => { document.querySelector('.deck-ov-scroll')!.scrollTop = 99999; });
    await page.waitForTimeout(200);
    const end = await page.evaluate(() => {
      const sc = document.querySelector('.deck-ov-scroll')!.getBoundingClientRect();
      const r = document.querySelector('.deck-ov .deck-ov-sources')!.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), scBottom: Math.round(sc.bottom) };
    });
    expect(end.top).toBeLessThan(start);
    expect(end.bottom).toBeLessThanOrEqual(end.scBottom + 1);
  });

  test('on a short item it still falls to the foot of the column', async ({ page }) => {
    // §5's screen. margin-top:auto against a min-height:100% inner column, so
    // a thin record does not leave the sources floating under two sentences.
    await open(page, 't05');
    const scroll = await rect(page, '.deck-ov-scroll');
    const rail = await rect(page, '.deck-ov .deck-ov-sources');
    const body = await rect(page, '.deck-ov-body');
    expect(Math.round(rail.bottom)).toBe(Math.round(scroll.bottom));
    expect(rail.top - body.bottom).toBeGreaterThan(14);
  });

  test('scrolling leaves the chip and the chrome where they are', async ({ page }) => {
    await open(page, 't01');
    const where = async () => ({
      title: Math.round((await rect(page, '.deck-ov-title')).top),
      dots: Math.round((await rect(page, '.deck-dots')).top),
      foot: Math.round((await rect(page, '.deck-foot')).top),
    });
    const before = await where();

    await page.evaluate(() => { document.querySelector('.deck-ov-scroll')!.scrollTop = 1000; });
    await page.waitForTimeout(200);

    const moved = await page.evaluate(() => document.querySelector('.deck-ov-scroll')!.scrollTop);
    expect(moved).toBeGreaterThan(0);
    expect(await where()).toEqual(before);
  });

  test('the body scrolls down and never sideways', async ({ page }) => {
    // overflow-y:auto computes overflow-x to auto, so anything wider than the
    // scroller turns the body into a horizontal scroller - and then a swipe
    // started in the middle of the text scrolls nothing instead of changing
    // slide, because the browser hands the gesture to the nearest scroller.
    // The carousel keeps its own horizontal axis; it is a carousel.
    for (const id of ['t01', 't03', 't05'] as const) {
      await open(page, id);
      const axes = await page.evaluate(() => {
        const sc = document.querySelector('.deck-ov-scroll')!;
        const rail = document.querySelector('.deck-ov .deck-ov-sources')!;
        return {
          bodyX: sc.scrollWidth - sc.clientWidth,
          railX: rail.scrollWidth - rail.clientWidth,
        };
      });
      expect(axes.bodyX, `${id}: the body must not scroll sideways`).toBe(0);
      expect(axes.railX, `${id}: the carousel still does`).toBeGreaterThan(0);
    }
  });

  test('the page itself never scrolls, whatever the body does', async ({ page }) => {
    await open(page, 't01');
    await page.evaluate(() => { document.querySelector('.deck-ov-scroll')!.scrollTop = 1000; });
    await page.waitForTimeout(200);
    const page_ = await page.evaluate(() => ({
      y: window.scrollY,
      doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }));
    expect(page_.y).toBe(0);
    expect(page_.doc).toBeLessThanOrEqual(0);
    expect(page_.at).toBe('1');
  });
});

test.describe('the floor', () => {
  test('one claim and one span still make a screen', async ({ page }) => {
    await open(page, 't02');
    const m = await page.evaluate(() => ({
      chips: document.querySelectorAll('.deck-ov-body button.chip').length,
      cards: document.querySelectorAll('.deck-ov .deck-ov-card').length,
      body: document.querySelector('.deck-ov-body')!.textContent!.trim().length,
    }));
    expect(m.chips).toBe(1);
    expect(m.cards).toBe(1);
    expect(m.body).toBeGreaterThan(40);
  });
});

/**
 * The swipe is the main way between slides, and it has to work from the middle
 * of the screen. A mouse drag cannot prove it: mice do not pan a scroll
 * container, so the gesture has to be real touch, dispatched over CDP.
 */
test.describe('a swipe starts anywhere', () => {
  /**
   * The real browser, not the headless shell.
   *
   * CI installs both and Playwright picks the shell for a headless run. The
   * shell delivers a synthetic touch pan to an ordinary vertical scroller -
   * the test below this one passes there - and does not deliver one to the
   * deck's horizontal scroll-snap track, which simply never moves. So this
   * test failed on every push from the day it landed while the swipe itself
   * was fine on a phone and in a full browser at 8x CPU throttle.
   *
   * Overriding the channel here rather than in playwright.config.ts on
   * purpose: the fidelity baselines were captured by the shell, and changing
   * the binary under them is a decision for Phase 9, when the gate that
   * compares them is switched on.
   */
  test.use({ hasTouch: true, channel: 'chromium' });

  test('a horizontal drag from the middle of the text changes slide', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    const at = () => page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'));
    expect(await at()).toBe('1');

    const mid = await page.evaluate(() => {
      const r = document.querySelector('.deck-ov-body')!.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });

    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: x === undefined ? [] : [{ x, y: y! }],
      } as never);

    // Towards the physical right is backwards in RTL, so this lands on the
    // gate. Started in the middle of the text on purpose: the bezel is not a
    // control, and a body that scrolls sideways would swallow this.
    await touch('touchStart', mid.x - 120, mid.y);
    for (let i = 1; i <= 10; i += 1) {
      await touch('touchMove', mid.x - 120 + i * 24, mid.y);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(900);

    expect(await at()).toBe('0');
  });

  test('a vertical drag in the same place scrolls the text and stays on the slide', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch dispatch');
    await walkTo2(page, 't01');
    const mid = await page.evaluate(() => {
      const r = document.querySelector('.deck-ov-body')!.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });

    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: x === undefined ? [] : [{ x, y: y! }],
      } as never);

    await touch('touchStart', mid.x, mid.y + 150);
    for (let i = 1; i <= 10; i += 1) {
      await touch('touchMove', mid.x, mid.y + 150 - i * 15);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => ({
      top: document.querySelector('.deck-ov-scroll')!.scrollTop,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }));
    expect(after.top).toBeGreaterThan(0);
    expect(after.at).toBe('1');
  });
});
