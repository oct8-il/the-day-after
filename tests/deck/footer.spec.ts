import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * The footer's labels cross-fade under the finger (DIA-401, spec §3).
 *
 * They used to be replaced in a single frame at the swipe's midpoint, while
 * the finger was still moving. Now both slides' labels are present and the
 * finger sets the mix: at 30% of the way, the slide being left is at 70% and
 * the one being arrived at is at 30%. The two always sum to 1 - that is what
 * makes it one cross-fade rather than two fades, and it is why the slot is
 * never empty and never doubled.
 *
 * Every measurement here is taken in the same turn that sets the position:
 * scroll-snap pulls a programmatic scrollLeft back, and the deck straightens
 * an off-snap landing 140ms later. A blend read a moment too late is a blend
 * read at rest, which passes and means nothing.
 */
const PHONE = { width: 390, height: 844 };

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

type Slot = { a: number; b: number; textA: string; textB: string; hitA: string; hitB: string };
type Read = { p: number; lead: string | null; prev: Slot; next: Slot; footHeight: number; dotTop: number };

const SLOT = `(sel) => {
  const layer = (k) => {
    const el = document.querySelector(sel + ' [data-lyr="' + k + '"]');
    const cs = getComputedStyle(el);
    return { o: Number(cs.opacity), t: (el.textContent || '').trim(), hit: cs.pointerEvents };
  };
  const a = layer('a'), b = layer('b');
  return { a: a.o, b: b.o, textA: a.t, textB: b.t, hitA: a.hit, hitB: b.hit };
}`;

const READ = `(() => {
  const slot = ${SLOT};
  const foot = document.querySelector('.deck-foot');
  return {
    p: Number(getComputedStyle(foot).getPropertyValue('--p') || 0),
    lead: foot.dataset.lead ?? null,
    prev: slot('.deck-prev'),
    next: slot('.deck-next'),
    footHeight: Math.round(foot.getBoundingClientRect().height),
    dotTop: Math.round(document.querySelector('.deck-dot').getBoundingClientRect().top),
  };
})()`;

const now = (page: Page) => page.evaluate(READ) as Promise<Read>;

/** Set the track part way between two slides and read the footer in that turn. */
const at = (page: Page, f: number) =>
  page.evaluate(`((frac) => {
    const slot = ${SLOT};
    const t = document.querySelector('.deck-track');
    t.style.scrollSnapType = 'none';
    void t.offsetHeight;
    const one = t.clientWidth;
    t.scrollLeft = t.scrollLeft <= 0 ? -one * frac : one * frac;
    t.dispatchEvent(new Event('scroll'));
    const foot = document.querySelector('.deck-foot');
    const out = {
      p: Number(getComputedStyle(foot).getPropertyValue('--p') || 0),
      lead: foot.dataset.lead ?? null,
      prev: slot('.deck-prev'),
      next: slot('.deck-next'),
      footHeight: Math.round(foot.getBoundingClientRect().height),
      dotTop: Math.round(document.querySelector('.deck-dot').getBoundingClientRect().top),
    };
    t.style.scrollSnapType = '';
    return out;
  })(${f})`) as Promise<Read>;

async function open(page: Page, hash = '') {
  await page.goto(`/item/t01/${hash}`);
  await arrived(page);
  await page.waitForSelector('.deck-foot');
  await page.waitForTimeout(350);
}

test.describe('the finger sets the mix', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

  test('at rest, one label at full strength and nothing else', async ({ page }) => {
    await open(page);
    const m = await now(page);
    expect(m.p).toBe(0);
    expect(m.prev.a).toBe(1);
    expect(m.prev.b).toBe(0);
    // The gate's own two slots: the hint, and the photo credit.
    expect(m.prev.textA).toBe('החליקו להמשך');
    expect(m.next.textA).toContain('צילום');
    // ...and the slide it is about to become.
    expect(m.next.textB).toBe('מה נעשה מאז');
  });

  test('at 0.3 the pair reads 0.7 and 0.3, and sums to 1 all the way across', async ({ page }) => {
    await open(page);
    const three = await at(page, 0.3);
    expect(three.p).toBeCloseTo(0.3, 2);
    expect(three.prev.a).toBeCloseTo(0.7, 2);
    expect(three.prev.b).toBeCloseTo(0.3, 2);
    expect(three.next.a).toBeCloseTo(0.7, 2);
    expect(three.next.b).toBeCloseTo(0.3, 2);

    for (const f of [0.1, 0.25, 0.5, 0.66, 0.9]) {
      const m = await at(page, f);
      expect.soft(m.prev.a + m.prev.b, `prev at ${f}`).toBeCloseTo(1, 2);
      expect.soft(m.next.a + m.next.b, `next at ${f}`).toBeCloseTo(1, 2);
      expect.soft(m.prev.a, `prev's outgoing layer at ${f}`).toBeCloseTo(1 - f, 1);
    }
  });

  test('the more visible layer is the one a thumb reaches', async ({ page }) => {
    await open(page);
    const early = await at(page, 0.3);
    expect(early.lead).toBe('a');
    expect(early.next.hitA).not.toBe('none');
    expect(early.next.hitB).toBe('none');

    const late = await at(page, 0.7);
    expect(late.lead).toBe('b');
    expect(late.next.hitB).not.toBe('none');
    expect(late.next.hitA).toBe('none');
  });

  test('nothing in the row moves while they trade places', async ({ page }) => {
    await open(page);
    const rest = await now(page);
    for (const f of [0.2, 0.5, 0.9]) {
      const m = await at(page, f);
      expect.soft(m.footHeight, `footer height at ${f}`).toBe(rest.footHeight);
      expect.soft(m.dotTop, `dots at ${f}`).toBe(rest.dotTop);
    }
  });

  test('the pair is the interval the track is in, on every slide', async ({ page }) => {
    await open(page, '#3');
    const m = await now(page);
    // Slide 3 at rest: its own labels at full strength, slide 4's waiting.
    expect(m.prev.textA).toBe('סקירת הכשל');
    expect(m.next.textA).toBe('מה עוד לא נעשה');
    expect(m.prev.textB).toBe('מה נעשה מאז');
    expect(m.next.textB).toBe('דעת הציבור');
    expect(m.prev.a).toBe(1);
    expect(m.next.a).toBe(1);
  });

  test('the ends fade to and from an empty slot', async ({ page }) => {
    // §3's two bare ends: slide 2 has no previous-slide label, and the last
    // slide has no next one. A slot with nothing in it still has to hold its
    // place while the other side of the pair fades through it.
    await open(page, '#2');
    const two = await now(page);
    expect(two.prev.textA).toBe('');
    expect(two.prev.textB).toBe('סקירת הכשל');

    await open(page, '#6');
    const last = await now(page);
    // There is no interval past the last slide, so the pair is the one before
    // it, at the far end: the showing layer is b, not a.
    expect(last.p).toBe(1);
    expect(last.next.b).toBe(1);
    expect(last.next.textB).toBe('');
    expect(last.prev.textB).toBe('דעת הציבור');
  });
});

test.describe('under reduced motion the labels swap at the midpoint', () => {
  test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } });

  test('the mix is only ever 0 or 1', async ({ page }) => {
    await open(page);
    for (const f of [0.2, 0.49]) {
      const m = await at(page, f);
      expect.soft(m.p, `${f}`).toBe(0);
      expect.soft(m.prev.a, `${f}`).toBe(1);
    }
    for (const f of [0.51, 0.8]) {
      const m = await at(page, f);
      expect.soft(m.p, `${f}`).toBe(1);
      expect.soft(m.prev.b, `${f}`).toBe(1);
    }
  });
});
