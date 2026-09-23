import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

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
  await arrived(page);
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
    // Both numbers count off this item's own deck: a five-slide item has no
    // sixth slide for anyone to be on, and a reader used to hear "6 מתוך 5"
    // on the last one because the numerator came from the canonical six
    // (DIA-424).
    expect(m.labels.map((l) => (l ?? '').split(' · ')[0]))
      .toEqual(['1 מתוך 5', '2 מתוך 5', '3 מתוך 5', '4 מתוך 5', '5 מתוך 5']);
    expect(m.labels.some((l) => l?.includes('מה עוד לא נעשה'))).toBe(false);
  });

  test('a six-slide item still counts to six', async ({ page }) => {
    await open(page, 't01', '');
    expect(await page.evaluate(() => [...document.querySelectorAll('.deck-slide')]
      .map((s) => (s.getAttribute('aria-label') ?? '').split(' · ')[0])))
      .toEqual(['1 מתוך 6', '2 מתוך 6', '3 מתוך 6', '4 מתוך 6', '5 מתוך 6', '6 מתוך 6']);
  });

  test('the hash is the slide\'s identity, so #5 is דעת הציבור on every item', async ({ page }) => {
    // It used to count off this item's own list, so the same link opened
    // different screens on different items - and would change its own meaning
    // the day an item reached its last stage and lost slide 4 (DIA-422).
    const on = () => page.evaluate(() =>
      (document.querySelector('.deck-slide[aria-current]')?.getAttribute('aria-label') ?? ''));

    await open(page, 't01', '#5');
    expect(await on()).toContain('דעת הציבור');
    await open(page, 't05', '#5');
    expect(await on()).toContain('דעת הציבור');

    await open(page, 't01', '#4');
    expect(await on()).toContain('מה עוד לא נעשה');
  });

  test('a hash for a slide this item does not have opens the one before it, and says so', async ({ page }) => {
    // Not whatever happens to sit in that position. t05 has nothing
    // unreached, so `#4` is מה נעשה מאז - and the address bar is corrected,
    // because a number naming a screen the reader is not looking at is the
    // same fault in a quieter place.
    await open(page, 't05', '#4');
    const m = await page.evaluate(() => ({
      on: document.querySelector('.deck-slide[aria-current]')?.getAttribute('aria-label') ?? '',
      hash: location.hash,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }));
    expect(m.on).toContain('מה נעשה מאז');
    expect(m.at).toBe('2');
    // `#3`, and then its stack's own tail: slide 3 says which stage it is
    // showing, which is the one thing about the hash that did not change.
    expect(m.hash).toMatch(/^#3(-s[1-6])?$/);
  });

  test('the dots keep counting positions', async ({ page }) => {
    // Only the hash changed. t05 shows דעת הציבור fourth, so the dots have
    // five of them and the fourth is the lit one.
    await open(page, 't05', '#5');
    expect(await page.evaluate(() => ({
      dots: document.querySelectorAll('.deck-dot').length,
      lit: [...document.querySelectorAll('.deck-dot')].findIndex((d) => d.hasAttribute('data-on')),
      at: document.querySelector('.deck')!.getAttribute('data-at'),
    }))).toEqual({ dots: 5, lit: 3, at: '3' });
  });

  test('a stage tail still names the stage, under the slide\'s identity', async ({ page }) => {
    await open(page, 't05', '#3-s2');
    expect(await page.evaluate(() => ({
      hash: location.hash,
      at: document.querySelector('.deck')!.getAttribute('data-at'),
      stage: document.querySelector<HTMLElement>('.deck')!.dataset.stage2,
    }))).toEqual({ hash: '#3-s2', at: '2', stage: '2' });
  });

  test('the footer chain skips it rather than pointing at nothing', async ({ page }) => {
    await open(page, 't05', '#3');
    // The slot holds two layers since DIA-401; the one at full strength is
    // the label. Reading the slot whole would read the waiting one too.
    const m = await page.evaluate(() => {
      const shown = (slot: string) => {
        const layers = [...document.querySelectorAll(`${slot} [data-lyr]`)];
        const on = layers.find((l) => Number(getComputedStyle(l).opacity) > 0.5) ?? layers[0];
        return (on?.textContent ?? '').trim();
      };
      return {
        next: shown('.deck-next'),
        prev: shown('.deck-prev'),
      };
    });
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
      pillOnThree: document.querySelectorAll('.deck-slide')[2]!.querySelectorAll('.deck-shead-n em').length,
      pillOnFour: document.querySelectorAll('.deck-slide')[3]!.querySelectorAll('.deck-shead-n em').length,
    }));
    expect(m.three).toEqual(['1', '3', '4', '6']);
    expect(m.four).toEqual(['2', '5']);
    // §6: הסטטוס הנוכחי is small accent text beside the name, not a pill.
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
  test('the head names the stage, says it has not happened, and wears no tag', async ({ page }) => {
    // §6 took the filled tag, the definition and the hairline off the page
    // and left the name at 24px with the date under it; §7 inherits all of
    // that and puts טרם תועד where the date would be (DIA-412).
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!;
      const head = p.querySelector('.deck-shead')!;
      const name = head.querySelector('.deck-shead-n')!;
      const cs = getComputedStyle(name);
      return {
        name: (name.textContent ?? '').trim(),
        size: cs.fontSize,
        weight: cs.fontWeight,
        date: (head.querySelector('.deck-shead-d')?.textContent ?? '').trim(),
        current: head.querySelectorAll('.deck-shead-n em').length,
        tags: p.querySelectorAll('.deck-stage-tag').length,
        rule: parseFloat(getComputedStyle(head).borderBottomWidth),
      };
    }, four);
    expect(m.name).toBe('אומת עצמאית');
    expect(m.size).toBe('24px');
    expect(m.weight).toBe('700');
    expect(m.date).toBe('טרם תועד');
    // The current stage is never on this slide.
    expect(m.current).toBe(0);
    // The tag with its coloured fill reappears only in a sheet's bar, and
    // this slide has no sheet at all.
    expect(m.tags).toBe(0);
    expect(m.rule).toBe(0);
  });

  test('one frame at 844, 664 and 600, and it never scrolls', async ({ page }) => {
    // The fault this page had was slide 3's: a card taller than its frame
    // inside a snapping stack. §7's card is composed rather than authored,
    // so it fits by construction - at every height the deck supports, and on
    // the fixture whose stack is four pages deep as well as the one-page one.
    for (const h of [844, 664, 600]) {
      await page.setViewportSize({ width: 390, height: h });
      for (const id of ['t01', 't02']) {
        await open(page, id);
        const m = await page.evaluate((s) => {
          const four = document.querySelector(s)!;
          const stack = four.querySelector('.deck-stack')!;
          const pages = [...four.querySelectorAll('.deck-stage')];
          return {
            frame: Math.round(stack.clientHeight),
            pages: [...new Set(pages.map((x) => Math.round(x.getBoundingClientRect().height)))],
            // A card that ran past its page is what this is guarding.
            over: pages.map((x) => Math.round(
              x.querySelector('.deck-card')!.getBoundingClientRect().bottom
              - x.getBoundingClientRect().bottom)),
            // The stack scrolls by whole pages and by nothing else.
            slack: stack.scrollHeight - stack.clientHeight - (pages.length - 1) * stack.clientHeight,
          };
        }, four);
        expect(m.pages, `${id} at ${h}`).toEqual([m.frame]);
        expect(m.over.every((o) => o <= 0), `${id} at ${h}`).toBe(true);
        expect(m.slack, `${id} at ${h}`).toBe(0);
      }
    }
    await page.setViewportSize(PHONE);
  });

  test('the box sits at the centre of the screen, or as close as the clamp allows', async ({ page }) => {
    // Of the screen, not of the space it was given: what stands above it is
    // the label, the head and the lead, and what stands below is the age and
    // the button, and those two do not weigh the same. Only a measurement can
    // put it on the frame's centre, and StagesShell makes it.
    for (const h of [844, 664, 600]) {
      await page.setViewportSize({ width: 390, height: h });
      await open(page, 't01');
      const m = await page.evaluate((s) => {
        const p = document.querySelector(s)!.querySelector('.deck-stage')!;
        const deck = document.querySelector('.deck')!.getBoundingClientRect();
        const d = p.querySelector('.deck-gap-def')!.getBoundingClientRect();
        const lead = p.querySelector('.deck-gap-say')!.getBoundingClientRect();
        const foot = p.querySelector('.deck-gap-wait')!.getBoundingClientRect();
        return {
          off: Math.abs((d.top + d.height / 2) - (deck.top + deck.height / 2)),
          up: d.top - lead.bottom,
          down: foot.top - d.bottom,
        };
      }, four);
      expect(m.off, `at ${h}`).toBeLessThanOrEqual(1);
      // And never nearer than 14px to either neighbour.
      expect(m.up, `at ${h}`).toBeGreaterThanOrEqual(14);
      expect(m.down, `at ${h}`).toBeGreaterThanOrEqual(14);
    }
    await page.setViewportSize(PHONE);
  });

  test('the box is dim, dashed, headerless, and carries the two strings from the taxonomy', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!.querySelector('.deck-stage')!;
      const def = p.querySelector('.deck-gap-def')!;
      const cs = getComputedStyle(def);
      const ps = [...def.querySelectorAll('p')].map((x) => (x.textContent ?? '').trim());
      return {
        style: cs.borderTopStyle,
        width: cs.borderTopWidth,
        radius: cs.borderTopLeftRadius,
        // No header inside it: what it says is not a heading's worth of thing.
        heads: def.querySelectorAll('h1,h2,h3,h4,b,strong').length,
        ps,
        size: getComputedStyle(def.querySelector('p')!).fontSize,
      };
    }, four);
    expect(m.style).toBe('dashed');
    expect(m.width).toBe('1px');
    expect(m.radius).toBe('14px');
    expect(m.heads).toBe(0);
    expect(m.size).toBe('15px');
    expect(m.ps).toHaveLength(2);
    // ¶1 is the page's own frame completed by the stage's clause; ¶2 is the
    // stage's own sentence about why it matters. Both live in the taxonomy.
    expect(m.ps[0].startsWith('לא מצאנו תיעוד לכך ש')).toBe(true);
    expect(m.ps[0].endsWith('.')).toBe(true);
    expect(m.ps[1].startsWith('עד אז')).toBe(true);
  });

  test('the age group is at the foot, centred, with the hourglass beside the numeral', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!.querySelector('.deck-stage')!;
      const r = (q: string) => p.querySelector(q)!.getBoundingClientRect();
      const wait = r('.deck-gap-wait');
      const col = p.querySelector('.deck-read')!.getBoundingClientRect();
      const card = p.querySelector('.deck-card')!.getBoundingClientRect();
      // The *text's* box, not the block's: a full-width block reports the
      // column's edges whichever way its text is set, which is how a numeral
      // hanging off the wrong end passed this once already.
      const text = (q: string) => {
        const range = document.createRange();
        range.selectNodeContents(p.querySelector(q)!);
        return range.getBoundingClientRect();
      };
      const n = text('.deck-gap-age b');
      const since = text('.deck-gap-since');
      return {
        markSize: Math.round(r('.deck-gap-mark').width),
        glyph: Math.round(r('.deck-gap-mark svg').width),
        // Beside, not above: the mark and the numeral share a line.
        beside: r('.deck-gap-mark').top < n.bottom && n.top < r('.deck-gap-mark').bottom,
        // In RTL the mark is the right-hand end of the row.
        markFirst: r('.deck-gap-mark').right > n.right,
        size: getComputedStyle(p.querySelector('.deck-gap-age b')!).fontSize,
        ltr: p.querySelector('.deck-gap-age b')!.getAttribute('dir'),
        n: (p.querySelector('.deck-gap-age b')?.textContent ?? '').trim(),
        since: (p.querySelector('.deck-gap-since')?.textContent ?? '').trim(),
        // The numeral starts where its label starts, rather than being set
        // ltr and pushed to the left of it.
        aligned: Math.abs(n.right - since.right) <= 1,
        // Centred in the column, and at the foot of the card.
        centred: Math.abs((wait.left + wait.right) / 2 - (col.left + col.right) / 2) <= 1,
        toFoot: Math.round(card.bottom - wait.bottom),
        stroke: getComputedStyle(p.querySelector('.deck-gap-mark svg')!).stroke,
        bg: getComputedStyle(p.querySelector('.deck-gap-mark')!).backgroundColor,
      };
    }, four);
    expect(m.markSize).toBe(48);
    expect(m.glyph).toBe(24);
    expect(m.beside).toBe(true);
    expect(m.markFirst).toBe(true);
    expect(m.size).toBe('34px');
    expect(m.n).toMatch(/^[\d,]+$/);
    expect(m.since.startsWith('ימים מאז')).toBe(true);
    expect(m.aligned).toBe(true);
    expect(m.ltr).toBe(null);
    expect(m.centred).toBe(true);
    // Only the button stands between it and the bottom of the card.
    expect(m.toFoot).toBeLessThan(80);
    expect(m.stroke).toBe('rgb(217, 165, 79)');
    expect(m.bg).toContain('0.14');
  });

  test('the way to say we are wrong is a full-width pill, and not a control yet', async ({ page }) => {
    await open(page, 't01');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!.querySelector('.deck-stage')!;
      const cta = p.querySelector('.deck-gap-do')!;
      const read = p.querySelector('.deck-read')!.getBoundingClientRect();
      const r = cta.getBoundingClientRect();
      return {
        text: (cta.firstChild?.textContent ?? '').trim(),
        arrow: (cta.querySelector('i')?.textContent ?? '').trim(),
        full: Math.abs(r.width - read.width) <= 1,
        round: getComputedStyle(cta).borderTopLeftRadius,
        border: getComputedStyle(cta).borderTopWidth,
        // DIA-421 owns where it goes. Until it does, it is drawn as a button
        // and is not one - nothing here is focusable or clickable.
        tag: cta.tagName,
        controls: p.querySelectorAll('.deck-gap button,.deck-gap a').length,
        last: p.querySelector('.deck-gap')!.lastElementChild === cta,
      };
    }, four);
    expect(m.text).toBe('יודעים אחרת? הגישו מקור');
    // The arrow is the row's other end, not a word in the line.
    expect(m.arrow).toBe('←');
    expect(m.full).toBe(true);
    expect(m.round).toBe('999px');
    expect(m.border).toBe('1px');
    expect(m.tag).toBe('SPAN');
    expect(m.controls).toBe(0);
    expect(m.last).toBe(true);
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

  test('nothing on the page says who could fill the stage', async ({ page }) => {
    // It used to, under the lead. It answered how the stage could be filled;
    // a reader looking at an empty stage is asking what the stage is, which
    // is what the box now says (Roy, 21 September - §7).
    await open(page, 't01');
    expect(await page.evaluate((s) =>
      document.querySelector(s)!.querySelectorAll('.deck-gap-who').length, four)).toBe(0);

    await open(page, 't02');
    const m = await page.evaluate((s) => {
      const pages = [...document.querySelector(s)!.querySelectorAll('.deck-stage')];
      return pages.map((p) => ({
        stage: p.getAttribute('data-stage'),
        say: (p.querySelector('.deck-gap-say')?.textContent ?? '').trim().length,
        box: p.querySelectorAll('.deck-gap-def p').length,
      }));
    }, four);
    // Every unreached stage has the same shape, whatever it is.
    expect(m.every((x) => x.say > 0)).toBe(true);
    expect(m.map((x) => x.box)).toEqual([2, 2, 2, 2]);
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
  test('no accent, no chips, no carousel, no drawer - and no sheet', async ({ page }) => {
    await open(page, 't02');
    const m = await page.evaluate((s) => {
      const p = document.querySelector(s)!;
      const ids = [...p.querySelectorAll('.deck-card')].map((c) => c.getAttribute('data-card'));
      return {
        now: p.querySelectorAll('.deck-shead-n em').length,
        chips: p.querySelectorAll('.chip').length,
        rails: p.querySelectorAll('.deck-ov-sources').length,
        drawers: p.querySelectorAll('.deck-drawer').length,
        buttons: p.querySelectorAll('.deck-more').length,
        // §7: this slide's card is composed rather than authored. It fits the
        // frame by construction, so nothing is cut and there is no sheet.
        sheets: ids.filter((id) => document.getElementById(`sheet-${id}`)).length,
        cut: p.querySelectorAll('.deck-card[data-cut]').length,
      };
    }, four);
    // There is nothing to cite for something that has not happened, and the
    // statement is computed rather than authored.
    expect(m).toEqual({ now: 0, chips: 0, rails: 0, drawers: 0, buttons: 0, sheets: 0, cut: 0 });
  });

  test('there is no back pill, and the footer is the way back to the current stage', async ({ page }) => {
    // The pill said what the footer under it already said, one thumb-width
    // away and to the same place (DIA-423).
    await open(page, 't01');
    expect(await page.evaluate((s) =>
      document.querySelector(s)!.querySelectorAll('.deck-stage-back,.deck-stage-backrow').length, four))
      .toBe(0);
    // Slide 3 keeps its own pill: there it does a job nothing else does.
    expect(await page.evaluate(() =>
      document.querySelectorAll('.deck-track > .deck-slide:nth-child(3) .deck-stage-back').length))
      .toBe(1);

    // Leave slide 3 standing somewhere other than the current stage, so that
    // "lands on the current stage" is a claim about more than the default.
    await page.evaluate(() => { location.hash = '#3'; });
    await page.waitForTimeout(500);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('deck:stage', { detail: { slide: 2, dir: -1 } })));
    await page.waitForTimeout(700);
    expect(await page.evaluate(() =>
      document.querySelector<HTMLElement>('.deck')!.dataset.stage2)).not.toBe('4');

    await page.evaluate(() => { location.hash = '#4'; });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const link = [...document.querySelectorAll<HTMLElement>('.deck-link')]
        .find((a) => (a.textContent ?? '').includes('מה נעשה מאז'))!;
      link.click();
    });
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => ({
      at: document.querySelector('.deck')!.getAttribute('data-at'),
      stage: document.querySelector<HTMLElement>('.deck')!.dataset.stage2,
      tail: location.hash,
      // And the pill is not showing, because the reader is on the current
      // stage again.
      pill: !!document.querySelector(
        '.deck-track > .deck-slide:nth-child(3) .deck-stage-back:not([hidden])'),
    }))).toEqual({ at: '2', stage: '4', tail: '#3-s4', pill: false });
  });
});
