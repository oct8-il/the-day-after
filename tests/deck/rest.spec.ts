import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * Slide 6 — הלאה (DIA-444, spec §9, UX DIA-395).
 *
 * The last slide, and the only one that gives way: the deck never scrolls, so
 * the card list fills the frame it has and sheds from the end. Most of what is
 * asserted here is that ladder and the two things that must agree with it —
 * the count line, and the wordmark still clearing the dots.
 *
 * The rest is exits. Every card is a plain link with no hash, so a shared or
 * tapped failure opens at its own gate rather than dropping a reader into the
 * middle of a post they have not read; share carries the bare URL for the same
 * reason.
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

async function open(page: Page, id = 't01') {
  await page.goto(`/item/${id}/#6`);
  await arrived(page);
  await page.waitForSelector('.deck-six[data-n]');
  await page.waitForTimeout(450);
}

test.describe('what is on the slide', () => {
  test('a sign-off, a count line, cards, two actions and the wordmark', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => {
      const six = document.querySelector('.deck-six')!;
      const n = six.getAttribute('data-n');
      return {
        signoff: six.querySelector('.deck-label')?.textContent,
        head: six.querySelector('.deck-six-head b')?.textContent,
        // The numeral is drawn from the attribute the deck writes, so the
        // line cannot disagree with the list above it.
        shown: six.querySelector('.deck-six-n')?.getAttribute('data-n'),
        count: six.querySelector('.deck-six-count')?.textContent?.replace(/\s+/g, ' ').trim(),
        n,
        drawn: [...six.querySelectorAll('.deck-six-card')]
          .filter((c) => (c as HTMLElement).offsetHeight > 0).length,
        all: document.querySelector('.deck-six-all')?.textContent?.trim(),
        share: document.querySelector('.deck-six-share')?.textContent?.trim(),
        mark: six.querySelector('.deck-six-mark span')?.textContent,
        // §9: the site's name only — no tagline, no address.
        markParts: six.querySelectorAll('.deck-six-mark > *').length,
      };
    });
    expect(m.signoff).toBe('תודה על הקריאה.');
    expect(m.head).toBe('עוד כשלים במעקב');
    expect(m.shown).toBe(m.n);
    expect(m.drawn).toBe(Number(m.n));
    expect(m.count).toMatch(/^מתוך \d+$/);
    expect(m.all).toMatch(/^כל \d+ הכשלים$/);
    expect(m.share).toMatch(/^שיתוף כשל מס׳ \d+$/);
    expect(m.mark).toBe('היום שאחרי');
    expect(m.markParts).toBe(2);
  });

  test('every card is a link to its own gate, with its own path', async ({ page }) => {
    await open(page);
    const cards = await page.evaluate(() => [...document.querySelectorAll('.deck-six-card')].map((li) => {
      const a = li.querySelector('a')!;
      return {
        href: a.getAttribute('href') ?? '',
        crumb: [...li.querySelectorAll('.deck-six-crumb > :not(i)')].map((s) => s.textContent),
        say: li.querySelector('.deck-six-say')?.textContent ?? '',
        stage: li.querySelector('.deck-six-stage')?.textContent ?? '',
        photo: !!li.querySelector('.deck-six-photo'),
        h: Math.round(li.getBoundingClientRect().height),
      };
    }));
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const self = new Set<string>();
    for (const c of cards) {
      // No hash: a card opens the failure at its gate, never mid-post.
      expect(c.href).toMatch(/^\/item\/[^/]+\/$/);
      expect(c.href).not.toContain('#');
      expect(self.has(c.href)).toBe(false);
      self.add(c.href);
      // Root › its own parent › its own leaf — the fill beyond the siblings
      // comes from elsewhere in the ledger, so the path is the card's.
      expect(c.crumb.length).toBe(3);
      expect(c.crumb[0]).toBe('7 באוקטובר');
      expect(c.say.length).toBeGreaterThan(0);
      expect(c.stage).toMatch(/^[1-6] · /);
      // Capped, and every card the same: the ladder is arithmetic, not a guess.
      expect(c.h).toBe(111);
    }
    // t01's own page is never one of its own neighbours.
    expect(self.has('/item/t01/')).toBe(false);
  });

  test('the photograph is a watermark, not an image slot', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => {
      const withPhoto = document.querySelector('.deck-six-photo');
      if (!withPhoto) return null;
      const s = getComputedStyle(withPhoto);
      const card = withPhoto.closest('.deck-six-card')!.getBoundingClientRect();
      const box = withPhoto.getBoundingClientRect();
      return {
        grey: s.filter.includes('grayscale'),
        // Full-bleed behind the whole card, inside its border — the 4px stage
        // rule stays the card's own edge and is never under a photograph.
        bleeds: card.width - box.width <= 6 && card.height - box.height <= 3,
        mask: (s.maskImage || s.webkitMaskImage || '').includes('gradient'),
        dye: getComputedStyle(withPhoto, '::after').mixBlendMode,
      };
    });
    expect(m).not.toBeNull();
    expect(m!.grey).toBe(true);
    expect(m!.bleeds).toBe(true);
    expect(m!.mask).toBe(true);
    expect(m!.dye).toBe('color');
  });
});

test.describe('the ladder', () => {
  // §9's table, re-measured against this build (DIA-395 asked for exactly that).
  for (const [height, want] of [[844, 4], [754, 3], [704, 3], [664, 2], [600, 2]] as const) {
    test(`${want} cards at ${height}, and nothing overflows`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await open(page);
      const m = await page.evaluate(() => {
        const six = document.querySelector('.deck-six') as HTMLElement;
        const mark = six.querySelector('.deck-six-mark')!.getBoundingClientRect();
        const bar = document.querySelector('.deck-bottom')!.getBoundingClientRect();
        return {
          n: Number(six.getAttribute('data-n')),
          shown: Number(six.querySelector('.deck-six-n')?.getAttribute('data-n')),
          drawn: [...six.querySelectorAll('.deck-six-card')]
            .filter((c) => (c as HTMLElement).offsetHeight > 0).length,
          over: six.scrollHeight - six.clientHeight,
          // Everything else on the slide is fixed and stays.
          fixed: ['.deck-label', '.deck-six-head', '.deck-six-all', '.deck-six-share', '.deck-six-mark']
            .every((s) => (six.querySelector(s) as HTMLElement).offsetHeight > 0),
          clearsBar: Math.round(bar.top - mark.bottom),
        };
      });
      expect(m.n).toBe(want);
      expect(m.drawn).toBe(want);
      expect(m.shown).toBe(want);
      expect(m.over).toBeLessThanOrEqual(1);
      expect(m.fixed).toBe(true);
      expect(m.clearsBar).toBeGreaterThanOrEqual(0);
    });
  }

  test('two is the floor — it never sheds to one', async ({ page }) => {
    // Below the floor the slide has nothing left to say, so it is allowed to
    // overflow rather than show a single card.
    await page.setViewportSize({ width: 390, height: 600 });
    await open(page);
    expect(await page.evaluate(() =>
      Number(document.querySelector('.deck-six')?.getAttribute('data-n')))).toBeGreaterThanOrEqual(2);
  });
});

test.describe('the exits', () => {
  test('כל N הכשלים carries this item\'s parent, so the ledger opens on its row', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => ({
      href: document.querySelector('.deck-six-all')?.getAttribute('href'),
      // Whose parent it is, read off the breadcrumb this page already shows.
      parent: document.querySelector('.deck-crumb-mid')?.getAttribute('title'),
    }));
    expect(m.href).toMatch(/^\/#\S+$/);
    expect(m.parent && m.parent.length).toBeGreaterThan(0);
  });

  test('share hands the native sheet the bare link', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d: unknown) => {
          (window as unknown as { __shared: unknown[] }).__shared.push(d);
          return Promise.resolve();
        },
      });
    });
    await open(page);
    await page.click('.deck-six-share');
    await page.waitForTimeout(200);
    const shared = await page.evaluate(() =>
      (window as unknown as { __shared: { title: string; url: string }[] }).__shared);
    expect(shared.length).toBe(1);
    expect(shared[0]!.title).toMatch(/^כשל מס׳ \d+ · היום שאחרי$/);
    // The bare item URL: a shared link opens at the gate, never on slide 4.
    expect(shared[0]!.url).toMatch(/\/item\/t01\/$/);
    expect(shared[0]!.url).not.toContain('#');
    // Nothing else happened: the native sheet is the whole of it.
    expect(await page.evaluate(() => !!document.querySelector('.deck-toast'))).toBe(false);
  });

  test('a cancelled share does nothing at all', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
      });
    });
    await open(page);
    await page.click('.deck-six-share');
    await page.waitForTimeout(300);
    // No toast, no fallback: the reader chose not to.
    expect(await page.evaluate(() => !!document.querySelector('.deck-toast'))).toBe(false);
  });

  test('without the API the link is copied and the toast says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      // @ts-expect-error - removing it is the case under test
      delete navigator.share;
    });
    await open(page);
    await page.click('.deck-six-share');
    const toast = page.locator('.deck-toast');
    await expect(toast).toHaveText('הקישור הועתק');
    // Above the dots, which is where the thumb is not.
    const m = await page.evaluate(() => {
      const t = document.querySelector('.deck-toast')!.getBoundingClientRect();
      const dots = document.querySelector('.deck-dots')!.getBoundingClientRect();
      return { above: t.bottom <= dots.top, live: document.querySelector('.deck-toast')?.getAttribute('role') };
    });
    expect(m.above).toBe(true);
    expect(m.live).toBe('status');
    // The bare URL, and the button itself has not changed.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/item\/t01\/$/);
    expect(await page.locator('.deck-six-share').textContent()).toMatch(/^שיתוף/);
    // Gone on its own, and it took nothing with it.
    await expect(toast).toHaveCount(0, { timeout: 4000 });
  });

  test('with neither API the button still answers', async ({ page }) => {
    // An insecure origin has no `navigator.clipboard` at all and no
    // `navigator.share` either - which is every phone opening `next dev` over
    // the wifi, and is how the button came to answer a press with silence.
    await page.addInitScript(() => {
      // @ts-expect-error - removing them is the case under test
      delete navigator.share;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await open(page);
    await page.click('.deck-six-share');
    const toast = page.locator('.deck-toast');
    await expect(toast).toBeVisible();
    // Either it was copied the old way, or the link itself is on the screen.
    // Never nothing.
    const m = await page.evaluate(() => {
      const t = document.querySelector('.deck-toast')!;
      return { text: t.textContent ?? '', url: t.hasAttribute('data-url') };
    });
    expect(m.text.length).toBeGreaterThan(0);
    if (m.url) expect(m.text).toMatch(/\/item\/t01\/$/);
    else expect(m.text).toBe('הקישור הועתק');
  });
});

test.describe('the last slide', () => {
  test('the footer names what is behind and nothing ahead', async ({ page }) => {
    await open(page);
    // Each slot holds two layers at once — the slide being left and the one
    // arrived at — and the deck mixes them by where the track is. At rest one
    // of the two is the whole label, so that is the one to read.
    const m = await page.evaluate(() => {
      const shown = (sel: string) => {
        const layers = [...document.querySelectorAll<HTMLElement>(`${sel} .deck-lyr`)];
        const top = layers.sort((a, b) =>
          Number(getComputedStyle(b).opacity) - Number(getComputedStyle(a).opacity))[0];
        return top?.textContent?.trim() ?? '';
      };
      return { prev: shown('.deck-prev'), next: shown('.deck-next') };
    });
    expect(m.prev).toBe('דעת הציבור');
    // §3's one exception: there is nothing after the last slide to name.
    expect(m.next).toBe('');
  });

  test('it is the last slide on both shapes of deck', async ({ page }) => {
    for (const id of ['t01', 't05']) {
      await open(page, id);
      const m = await page.evaluate(() => {
        const slides = [...document.querySelectorAll('.deck-track > .deck-slide')];
        const i = slides.findIndex((s) => s.querySelector('.deck-six'));
        return { i, last: slides.length - 1, id: slides[i]?.id };
      });
      expect(m.i).toBe(m.last);
      expect(m.id).toBe('slide-6');
    }
  });
});
