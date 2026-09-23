import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * The submission sheet - docs/mobile-item.html §7, DIA-421, built in DIA-439.
 *
 * One sheet for the whole deck, opened here from slide 4's pill because that
 * is its first door. What is asserted is what makes it that sheet rather than
 * a reading: it names nothing about the item, it carries the page's link in
 * the two places a reader can use it, and the way back knows where they came
 * from. The form has no endpoint in this build, so what is asserted about it
 * is that nothing points at it.
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

/** Slide 4, with the sheet's door on screen. */
async function door(page: Page, id = 't01') {
  await page.goto(`/item/${id}/#4`);
  await arrived(page);
  await page.waitForSelector('.deck-gap-do');
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
}

const open = async (page: Page) => {
  await page.evaluate(() => document.querySelector<HTMLElement>('.deck-gap-do')!.click());
  await page.waitForTimeout(700);
};

test.describe('the door', () => {
  test('slide 4\'s pill is a real control, and it points at the sheet', async ({ page }) => {
    // It was a span that was drawn as a button and was not one, because there
    // was nowhere for it to go (DIA-425).
    await door(page);
    expect(await page.evaluate(() => {
      const b = document.querySelector('.deck-gap-do')!;
      return {
        tag: b.tagName,
        opens: b.getAttribute('data-open'),
        controls: b.getAttribute('aria-controls'),
        popup: b.getAttribute('aria-haspopup'),
        // The sheet is in the HTML from the first paint, hidden.
        sheet: !!document.getElementById('sheet-send'),
        hidden: document.getElementById('sheet-send')!.hasAttribute('hidden'),
        // Beside the track, never inside it: everything a sheet has to be is
        // false within the horizontal scroller (Card.tsx).
        inTrack: !!document.getElementById('sheet-send')!.closest('.deck-track'),
      };
    })).toEqual({
      tag: 'BUTTON', opens: 'send', controls: 'sheet-send', popup: 'dialog',
      sheet: true, hidden: true, inTrack: false,
    });
  });

  test('it opens in place, as a button entrance does', async ({ page }) => {
    await door(page);
    await open(page);
    expect(await page.evaluate(() => {
      const s = document.getElementById('sheet-send')!;
      return {
        sheet: document.querySelector('.deck')!.getAttribute('data-sheet'),
        hidden: s.hasAttribute('hidden'),
        // A fade, not a cover: the reader pressed a control.
        entrance: s.getAttribute('data-in'),
        modal: s.getAttribute('aria-modal'),
        // And the deck behind it is not a second surface to find.
        track: document.querySelector('.deck-track')!.hasAttribute('inert'),
        bottom: document.querySelector('.deck-bottom')!.hasAttribute('inert'),
      };
    })).toEqual({
      sheet: 'send', hidden: false, entrance: 'fade', modal: 'true',
      track: true, bottom: true,
    });
  });
});

test.describe('what the sheet says', () => {
  test('it names neither the item nor the stage', async ({ page }) => {
    // The whole reason it is one sheet: what it offers is the same wherever
    // it was opened, so it says nothing about where that was.
    await door(page);
    await open(page);
    expect(await page.evaluate(() => {
      const s = document.getElementById('sheet-send')!;
      const text = s.textContent ?? '';
      return {
        pill: s.querySelector('.deck-send-pill')?.textContent,
        stage: text.includes('אומת עצמאית'),
        item: text.includes('כשל מס'),
        // No locator, no carousel, no end-of-reading line: it is not a reading.
        loc: s.querySelectorAll('.deck-loc').length,
        rail: s.querySelectorAll('.deck-ov-sources').length,
        end: s.querySelectorAll('.deck-sheet-end').length,
      };
    })).toEqual({ pill: 'הגשת מקור', stage: false, item: false, loc: 0, rail: 0, end: 0 });
  });

  test('the two channels, and the address as the link\'s own text', async ({ page }) => {
    await door(page);
    await open(page);
    const m = await page.evaluate(() => {
      const s = document.getElementById('sheet-send')!;
      const ig = s.querySelector<HTMLAnchorElement>('a[href*="ig.me"]')!;
      const mail = s.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!;
      return {
        lead: s.querySelector('.deck-send-lead')?.textContent,
        heads: [...s.querySelectorAll('.deck-sheet-h')].map((h) => h.textContent),
        ig: ig.getAttribute('href'),
        igText: ig.textContent?.trim(),
        mail: decodeURIComponent(mail.getAttribute('href') ?? ''),
        mailText: mail.textContent?.trim(),
        fine: s.querySelector('.deck-send-fine')?.textContent,
      };
    });
    expect(m.lead).toBe('מכירים מקור שלא מופיע כאן, או שמשהו שגוי? שלחו לנו.');
    // Two, not three: the form has no endpoint in this build, so it is not
    // drawn at all - nothing here may point at a form that does not exist.
    expect(m.heads).toEqual(['הודעה באינסטגרם', 'מייל']);
    expect(m.ig).toBe('https://ig.me/m/oct8.co.il');
    expect(m.igText).toBe('@oct8.co.il');
    // The address is the link text, so it survives a mail link that opens
    // nothing - which is most of them inside an in-app browser.
    expect(m.mailText).toContain('info@oct8.co.il');
    expect(m.mail).toContain('subject=מקור / הערה — היום שאחרי');
    // The page the reader is on rides in the body.
    expect(m.mail).toContain('/item/t01/');
    expect(m.mail).toContain('קישור למקור:');
    expect(m.fine).toBe('כל מקור נבדק לפני שהוא מופיע באתר. לא צריך שם או חשבון.');
  });

  test('with no endpoint, nothing in the sheet points at a form', async ({ page }) => {
    await door(page);
    await open(page);
    expect(await page.evaluate(() => {
      const s = document.getElementById('sheet-send')!;
      return {
        form: s.querySelectorAll('form').length,
        inputs: s.querySelectorAll('input,textarea').length,
        says: (s.textContent ?? '').includes('טופס'),
      };
    })).toEqual({ form: 0, inputs: 0, says: false });
  });
});

test.describe('the one piece of state', () => {
  test('the copy chip carries this page\'s link, and says so for a moment', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await door(page);
    await open(page);
    const said = () => page.evaluate(() =>
      document.querySelector('#sheet-send .deck-send-copy')!.textContent);
    expect(await said()).toBe('העתקת הקישור לעמוד הזה');

    await page.evaluate(() => document.querySelector<HTMLElement>('#sheet-send .deck-send-copy')!.click());
    await page.waitForTimeout(250);
    expect(await said()).toBe('הועתק ✓');
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe(await page.evaluate(() => location.href));

    // 1.6s, and then it is a control again rather than a receipt.
    await page.waitForTimeout(1600);
    expect(await said()).toBe('העתקת הקישור לעמוד הזה');
  });

  test('the sheet learns where it was opened from, and only that', async ({ page }) => {
    await door(page);
    await open(page);
    expect(await page.evaluate(() => {
      const s = document.getElementById('sheet-send')!;
      return { name: s.getAttribute('data-from-name'), href: s.getAttribute('data-from-href') };
    })).toEqual({ name: 'אומת עצמאית', href: await page.evaluate(() => location.href) });
  });
});

test.describe('the ways out', () => {
  test('the × closes it and hands the focus back to the door', async ({ page }) => {
    await door(page);
    await open(page);
    await page.click('#sheet-send .deck-sheet-x');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => ({
      sheet: document.querySelector('.deck')!.getAttribute('data-sheet'),
      hidden: document.getElementById('sheet-send')!.hasAttribute('hidden'),
      focus: document.activeElement?.className,
      // It came from slide 4 and it goes back to slide 4, on the stage it
      // was opened from.
      hash: location.hash,
      track: document.querySelector('.deck-track')!.hasAttribute('inert'),
    }))).toEqual({
      sheet: null, hidden: true, focus: 'deck-gap-do', hash: '#4-s5', track: false,
    });
  });

  test('Back closes it, and the deck still costs one entry', async ({ page }) => {
    await door(page);
    await open(page);
    await page.goBack();
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => ({
      sheet: document.querySelector('.deck')!.getAttribute('data-sheet'),
      hash: location.hash,
    }))).toEqual({ sheet: null, hash: '#4-s5' });

    // One more and the reader is where they came in, not still in the deck.
    await page.goBack();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toBe('#4');
  });

  test('a second opening is a first visit', async ({ page, context }) => {
    // The sheet is one element, reused. A reader who copied a link last time
    // is not looking at their own receipt now.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await door(page);
    await open(page);
    await page.evaluate(() => document.querySelector<HTMLElement>('#sheet-send .deck-send-copy')!.click());
    await page.waitForTimeout(200);
    await page.click('#sheet-send .deck-sheet-x');
    await page.waitForTimeout(700);
    await open(page);
    expect(await page.evaluate(() =>
      document.querySelector('#sheet-send .deck-send-copy')!.textContent))
      .toBe('העתקת הקישור לעמוד הזה');
  });
});
