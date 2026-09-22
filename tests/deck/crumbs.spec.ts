import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * The breadcrumb (DIA-400 and DIA-407, spec §3).
 *
 * `7 באוקטובר › העורף האזרחי › כשל מס׳ 13` looked like navigation and was
 * three plain spans, and it was one nowrap line that overflowed to the left -
 * so the part that got cut was the leaf, the one thing the path is there to
 * say. Two rulings, one element:
 *
 *   the root is a link home; the parent is inert until a page exists for it
 *   to point at; the leaf is the current page and never a link, and
 *
 *   when the path does not fit, the parent is the only part that gives way.
 *
 * t06 carries the longest parent in the live ledger (37 characters), which is
 * why it is the fixture here: the test pool's other parents fit at 390 and
 * would prove nothing.
 */
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

async function open(page: Page, id = 't01', hash = '') {
  await page.goto(`/item/${id}/${hash}`);
  await arrived(page);
  await page.waitForSelector('.deck-crumbs');
  await page.waitForTimeout(300);
}

test.describe('what is a link and what is not', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the root is a real link home, the parent and the leaf are not', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => ({
      links: [...document.querySelectorAll('.deck-crumbs a')].map((a) => a.getAttribute('href')),
      // A real <a href> works without JavaScript and is a link to a screen
      // reader. The other two must not be anything of the kind.
      parentTag: document.querySelector('.deck-crumb-mid')!.tagName,
      parentRole: document.querySelector('.deck-crumb-mid')!.getAttribute('role'),
      parentTabbable: document.querySelector('.deck-crumb-mid')!.hasAttribute('tabindex'),
      parentCursor: getComputedStyle(document.querySelector('.deck-crumb-mid')!).cursor,
      leafTag: document.querySelector('.deck-crumbs b')!.tagName,
      inLandmark: !!document.querySelector('nav[aria-label="מיקום"] a'),
    }));
    expect(m.links).toEqual(['/']);
    expect(m.parentTag).toBe('SPAN');
    expect(m.parentRole).toBeNull();
    expect(m.parentTabbable).toBe(false);
    expect(m.parentCursor).toBe('auto');
    expect(m.leafTag).toBe('B');
    expect(m.inLandmark).toBe(true);
  });

  test('the root\'s touch target is 44px without moving anything', async ({ page }) => {
    await open(page);
    const before = await rect(page, '.deck-crumbs');
    const hit = await page.evaluate(() => {
      const a = document.querySelector('.deck-crumb-root')!;
      const ink = a.getBoundingClientRect();
      // The target is the overhanging box, which lays out as nothing: what a
      // thumb lands on, not what the row is tall.
      const style = getComputedStyle(a, '::after');
      const pad = (v: string) => Math.abs(parseFloat(v) || 0);
      return { tall: ink.height + pad(style.top) + pad(style.bottom), row: ink.height };
    });
    expect(hit.tall).toBeGreaterThanOrEqual(44);
    expect(hit.row).toBeLessThan(24);
    // The chrome's measured height is what every slide's top padding comes
    // from, so it cannot move for a touch target.
    expect(await rect(page, '.deck-crumbs')).toEqual(before);
  });

  test('tapping the root leaves the item, and Back returns to the slide', async ({ page }, testInfo) => {
    await open(page, 't01', '#3');
    await page.click('.deck-crumb-root');
    await page.waitForURL((u) => !u.pathname.includes('/item/'));
    // Where the root lands is the site's business, not the deck's: on the test
    // pool `/` sends the reader on to `/about/`, and that page's console is
    // not this spec's to judge. It also throws on every visit after the first
    // - DIA-410, found here and not this issue's to fix.
    (testInfo as unknown as { _noise: string[] })._noise = [];

    await page.goBack();
    await page.waitForSelector('.deck-track');
    await page.waitForTimeout(500);
    // §3: leaving by the crumb is an ordinary navigation, and Back returns to
    // the slide the reader left - which the hash already carries.
    expect(await page.evaluate(() => document.querySelector('.deck')!.getAttribute('data-at'))).toBe('2');
    expect(await page.evaluate(() => location.hash)).toMatch(/^#3(-s[1-6])?$/);
  });
});

test.describe('when the path does not fit, the parent gives way', () => {
  for (const width of [430, 390, 360, 320]) {
    test(`${width}: the leaf is whole and inside the gutter`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await open(page, 't06');
      const m = await page.evaluate(() => {
        const nav = document.querySelector('.deck-crumbs')!.getBoundingClientRect();
        const leaf = document.querySelector('.deck-crumbs b')!;
        const root = document.querySelector('.deck-crumb-root')!;
        const mid = document.querySelector('.deck-crumb-mid')!;
        return {
          leaf: leaf.getBoundingClientRect(),
          rootRight: root.getBoundingClientRect().right,
          nav,
          // A leaf that fits is a leaf whose ink is all there: compare what is
          // laid out against what the text wants.
          leafCut: leaf.scrollWidth > Math.ceil(leaf.getBoundingClientRect().width) + 1,
          midCut: mid.scrollWidth > Math.ceil(mid.getBoundingClientRect().width) + 1,
          full: mid.textContent,
          title: mid.getAttribute('title'),
          rows: Math.round(document.querySelector('.deck-crumbs')!.getBoundingClientRect().height),
        };
      });
      // 20px gutters hold on both sides, and the leaf is whole.
      expect.soft(Math.round(m.leaf.left - m.nav.left), `${width}: left gutter`).toBeGreaterThanOrEqual(20);
      expect.soft(Math.round(m.nav.right - m.rootRight), `${width}: right gutter`).toBe(20);
      expect.soft(m.leafCut, `${width}: the leaf is cut`).toBe(false);
      // The parent is the part that gives way - where giving way is needed.
      //
      // Which width that starts at is a property of one Hebrew string and one
      // typeface, not of the design, and pinning it made a coin toss of the
      // test: with the real Assistant this path wants 186px and gets exactly
      // 186 at 390, so a single extra character in a parent's name would flip
      // it (DIA-433). What §3 actually rules is asserted instead - the widest
      // width holds the whole path, the narrowest cannot and gives way - and
      // the middle two are free to fall either side of a boundary nobody
      // designed. The leaf being whole is asserted at every width above, which
      // is the half that matters.
      if (width === 430) expect.soft(m.midCut, '430: the path fits whole').toBe(false);
      if (width === 320) expect.soft(m.midCut, '320: the parent gives way').toBe(true);
      // Whole or shortened, the name in the DOM is the whole name.
      expect(m.full).toBe('פינוי התושבים, קליטתם ושיקום היישובים');
      expect(m.title).toBe(m.full);
    });
  }

  test('a short parent renders as it always did, and the row is one line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 't03');
    const short = await page.evaluate(() => ({
      cut: (() => {
        const mid = document.querySelector('.deck-crumb-mid')!;
        return mid.scrollWidth > Math.ceil(mid.getBoundingClientRect().width) + 1;
      })(),
      height: Math.round(document.querySelector('.deck-crumbs')!.getBoundingClientRect().height),
    }));
    expect(short.cut).toBe(false);

    await open(page, 't06');
    const long = await page.evaluate(() =>
      Math.round(document.querySelector('.deck-crumbs')!.getBoundingClientRect().height));
    // One line either way: --deck-top is measured off this row, and a second
    // line would move every slide's content down on one item and not another.
    expect(long).toBe(short.height);
  });
});
