import { test, expect, type Page } from '@playwright/test';
import { arrived } from './alive';

/**
 * The updates sheet — §8, behind slide 5's pill (DIA-447).
 *
 * Three channels on one screen, and the rule over all of them is that nothing
 * ships dead: a control that cannot do what it says is not drawn. So most of
 * what is asserted here is a pair — the button and the sheet arrive together,
 * a row and its link arrive together — and the rest is the one trip a reader
 * can make: type, send, be told to check their mail, come back to the slide
 * they were on.
 *
 * What cannot be asserted is the send itself. The form posts into a hidden
 * frame on another origin, and nothing about that frame can be read back;
 * that is the whole reason the sheet says a confirmation mail follows rather
 * than claiming a subscription. The receipt is the frame's `load`, and these
 * tests fire it the way the browser would.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, contextOptions: { reducedMotion: 'no-preference' } });

const IGNORE = [
  /fonts\.googleapis\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /_next\/hmr/, /React DevTools/,
  // Anything the page reaches for off-site. A runner has no route to it, and
  // it is answered below rather than allowed out.
  /net::ERR_/, /Failed to load resource/,
];

/**
 * Everything that is not the site under test.
 *
 * The form's destination is configuration and no provider has been chosen
 * (DIA-435), so this suite must not know a host name - and it must not let
 * one out of the runner either. Whatever the endpoint turns out to be, it is
 * answered here.
 */
const OFFSITE = /^https?:\/\/(?!(127\.0\.0\.1|localhost)[:/])/;

test.beforeEach(async ({ page }, testInfo) => {
  const noise: string[] = [];
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (IGNORE.some((r) => r.test(m.text()))) return;
    noise.push(`${m.type()}: ${m.text()}`);
  });
  (testInfo as unknown as { _noise: string[] })._noise = noise;
  // Nothing in this suite wants the form to actually leave: the destination is
  // another origin and its answer is unreadable either way.
  await page.route(OFFSITE, (r) => r.fulfill({ status: 200, body: '' }));
});

test.afterEach(async ({}, testInfo) => {
  expect((testInfo as unknown as { _noise?: string[] })._noise ?? []).toEqual([]);
});

async function open(page: Page, id = 't01') {
  await page.goto(`/item/${id}/#5`);
  await arrived(page);
  await page.waitForSelector('.deck-op');
  await page.waitForTimeout(450);
}

const sheet = '#sheet-nl';
const pill = '.deck-op-do';

/** The sheet is only there to be tested where a newsletter is configured. */
const configured = (page: Page) => page.evaluate(() => !!document.querySelector('#sheet-nl'));

async function openSheet(page: Page) {
  await page.click(pill);
  await expect(page.locator(sheet)).not.toHaveAttribute('hidden', '');
  await page.waitForTimeout(350);
}

test.describe('nothing ships dead', () => {
  test('the button and the sheet arrive together, or neither does', async ({ page }) => {
    await open(page);
    const m = await page.evaluate(() => {
      const btn = document.querySelector('.deck-op-do');
      const sh = document.querySelector('#sheet-nl');
      return {
        btn: !!btn,
        sheet: !!sh,
        // A form with no action would post the page to itself. Which host it
        // names is DIA-435's decision and not this suite's business.
        action: sh?.querySelector('form')?.getAttribute('action') ?? '',
        opens: btn?.getAttribute('data-open') ?? null,
        controls: btn?.getAttribute('aria-controls') ?? null,
      };
    });
    expect(m.btn).toBe(m.sheet);
    if (!m.btn) return;
    expect(m.action).toMatch(/^https:\/\/\S+$/);
    expect(m.opens).toBe('nl');
    expect(m.controls).toBe('sheet-nl');
  });

  test('every row that is drawn has somewhere to go', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.deck-nl-row')].map((a) => ({
      href: a.getAttribute('href') ?? '',
      target: a.getAttribute('target'),
      rel: a.getAttribute('rel') ?? '',
      name: a.querySelector('b')?.textContent ?? '',
      say: a.querySelector('small')?.textContent ?? '',
      icon: !!a.querySelector('.deck-nl-ic'),
    })));
    // Instagram has no dependency and is always one of them; WhatsApp is
    // DIA-446's and is drawn only once there is a group to join.
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.href).toMatch(/^https:\/\//);
      expect(r.target).toBe('_blank');
      expect(r.rel).toContain('noopener');
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.say.length).toBeGreaterThan(0);
      expect(r.icon).toBe(true);
    }
    const ig = rows.find((r) => /instagram/.test(r.href));
    expect(ig?.name).toBe('@oct8.co.il');
    expect(ig?.say).toBe('נפרסם שם כשהמענה ייפתח.');
    const wa = rows.find((r) => !/instagram/.test(r.href));
    if (wa) {
      expect(wa.name).toBe('קבוצת עדכונים בוואטסאפ');
      expect(wa.say).toBe('שקטה. רק אנחנו כותבים, רק כשיש מה.');
    }
  });
});

test.describe('open and close', () => {
  test('the pill opens it in place, and the × closes it', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    const before = await page.evaluate(() => history.length);
    await openSheet(page);
    const m = await page.evaluate(() => {
      const s = document.querySelector('#sheet-nl')!;
      return {
        chip: s.querySelector('.deck-send-pill')?.textContent,
        lead: s.querySelector('.deck-send-lead')?.textContent,
        modal: s.getAttribute('aria-modal'),
        // A deliberate act gets the fade, not the cover (§5, DIA-413).
        entrance: s.getAttribute('data-in'),
        inert: document.querySelector('.deck-track')?.hasAttribute('inert'),
        // The deck's one entry, and the sheet's on top of it.
        grew: history.length,
      };
    });
    expect(m.chip).toBe('עדכונים');
    expect(m.lead).toBe('כשהמענה ייפתח — נכתוב. עד אז, שקט.');
    expect(m.modal).toBe('true');
    expect(m.entrance).not.toBe('cover');
    expect(m.inert).toBe(true);
    expect(m.grew).toBeGreaterThan(before);

    await page.click(`${sheet} .deck-sheet-x`);
    await page.waitForTimeout(400);
    await expect(page.locator(sheet)).toHaveAttribute('hidden', '');
    expect(await page.evaluate(() => document.querySelector('.deck-track')?.hasAttribute('inert'))).toBe(false);
  });

  test('Back closes it and leaves the reader on slide 5', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    await page.goBack();
    await page.waitForTimeout(400);
    await expect(page.locator(sheet)).toHaveAttribute('hidden', '');
    expect(await page.evaluate(() => document.querySelector('.deck')?.getAttribute('data-at'))).toBe('4');
  });

  test('a sideways swipe does not throw away what was typed', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    // DIA-427's exits are the sheet's, except on a page holding a field: the
    // deck is told to leave the axis alone, and the mark is how it is told.
    expect(await page.evaluate(() =>
      document.querySelector('#sheet-nl')?.hasAttribute('data-form'))).toBe(true);
  });
});

test.describe('the one trip', () => {
  test('an address that is not one is refused, and the field says so', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    await page.fill(`${sheet} input[type="email"]`, 'nope');
    await page.click(`${sheet} button[type="submit"]`);
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const s = document.querySelector('#sheet-nl')!;
      const f = s.querySelector<HTMLInputElement>('input[type="email"]')!;
      return {
        say: s.querySelector('.deck-send-say')?.textContent,
        invalid: f.getAttribute('aria-invalid'),
        described: f.getAttribute('aria-describedby'),
        // Refused means it never left: the frame has not been navigated and
        // the button is not in the sending state.
        button: s.querySelector('button[type="submit"]')?.textContent,
        kept: f.value,
      };
    });
    expect(m.say).toBe('צריך כתובת מייל.');
    expect(m.invalid).toBe('true');
    expect(m.described).toBe('deck-nl-err');
    expect(m.button).toBe('עדכנו אותי');
    expect(m.kept).toBe('nope');

    // Typing clears it: the reader is answering, and being shouted at while
    // they answer is the thing the check-on-send rule exists to avoid.
    await page.fill(`${sheet} input[type="email"]`, 'roy@example.com');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() =>
      !!document.querySelector('#sheet-nl .deck-send-say'))).toBe(false);
  });

  test('a good address is sent, and the receipt is the frame loading', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    await page.fill(`${sheet} input[type="email"]`, 'roy@example.com');

    const carried = await page.evaluate(() => {
      const s = document.querySelector('#sheet-nl')!;
      const hidden = [...s.querySelectorAll<HTMLInputElement>('input[type="hidden"]')];
      return {
        // What the fields are called is configuration, so what is asserted is
        // what is carried: the address, and the page the reader was on.
        address: s.querySelector<HTMLInputElement>('input[type="email"]')?.name ?? '',
        page: hidden.map((i) => i.value).filter((v) => v.includes('/item/')),
        target: s.querySelector('form')?.getAttribute('target'),
        sink: s.querySelector('iframe')?.getAttribute('name'),
      };
    });
    expect(carried.address.length).toBeGreaterThan(0);
    // With its hash, so a mail sent later can say which failure it is about.
    // Empty where the endpoint has nowhere to put it, which is allowed.
    for (const v of carried.page) expect(v).toContain('#5');
    expect(carried.target).toBe('deck-nl-sink');
    expect(carried.sink).toBe('deck-nl-sink');

    // Held open long enough to see the sending state, because the receipt
    // otherwise arrives on the next frame: the form really is submitted, and
    // the frame really does load.
    await page.route(OFFSITE, async (r) => {
      await new Promise((go) => setTimeout(go, 400));
      await r.fulfill({ status: 200, body: '' });
    });
    await page.click(`${sheet} button[type="submit"]`);
    const going = page.locator(`${sheet} button[type="submit"]`);
    await expect(going).toHaveText('שולח…');
    await expect(going).toBeDisabled();

    // Nothing else happens: the frame loads, and that is the whole receipt.
    await expect(page.locator(`${sheet} .deck-send-done`)).toBeVisible();

    const done = await page.evaluate(() => {
      const s = document.querySelector('#sheet-nl')!;
      return {
        head: s.querySelector('.deck-send-lead')?.textContent,
        say: s.querySelector('.deck-send-done p:not(.deck-send-lead)')?.textContent,
        back: s.querySelector('.deck-send-go')?.textContent,
        form: !!s.querySelector('form'),
        rows: s.querySelectorAll('.deck-nl-row').length,
        // With nothing left to lose, the sideways exit is given back.
        form_mark: s.hasAttribute('data-form'),
      };
    });
    expect(done.head).toBe('כמעט. בדקו את המייל.');
    expect(done.say).toBe('שלחנו הודעת אישור — לחיצה אחת, ואתם ברשימה.');
    // The only place the sheet names where it was opened from.
    expect(done.back).toContain('חזרה ל״דעת הציבור״');
    expect(done.form).toBe(false);
    expect(done.rows).toBe(0);
    expect(done.form_mark).toBe(false);

    // And the way back closes it, onto the slide it was opened from.
    await page.click(`${sheet} .deck-send-go`);
    await page.waitForTimeout(400);
    await expect(page.locator(sheet)).toHaveAttribute('hidden', '');
    expect(await page.evaluate(() => document.querySelector('.deck')?.getAttribute('data-at'))).toBe('4');
  });

  test('a reader with no connection is told so, and keeps their address', async ({ page, context }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    await page.fill(`${sheet} input[type="email"]`, 'roy@example.com');
    await context.setOffline(true);
    await page.click(`${sheet} button[type="submit"]`);
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const s = document.querySelector('#sheet-nl')!;
      return {
        fail: s.querySelector('.deck-nl-fail')?.textContent,
        kept: s.querySelector<HTMLInputElement>('input[type="email"]')?.value,
        button: s.querySelector('button[type="submit"]')?.textContent,
        done: !!s.querySelector('.deck-send-done'),
      };
    });
    await context.setOffline(false);
    expect(m.fail).toBe('לא נשלח — אין חיבור כרגע. נסו שוב.');
    expect(m.kept).toBe('roy@example.com');
    expect(m.button).toBe('עדכנו אותי');
    // The one thing a false receipt would cost: being told an address went
    // somewhere it did not.
    expect(m.done).toBe(false);
  });

  test('every opening is a first visit', async ({ page }) => {
    await open(page);
    if (!await configured(page)) test.skip();
    await openSheet(page);
    await page.fill(`${sheet} input[type="email"]`, 'roy@example.com');
    await page.click(`${sheet} button[type="submit"]`);
    await expect(page.locator(`${sheet} .deck-send-done`)).toBeVisible();
    await page.click(`${sheet} .deck-send-go`);
    await page.waitForTimeout(400);

    await openSheet(page);
    // A reader who signed up last time is not looking at their own receipt now.
    const m = await page.evaluate(() => {
      const s = document.querySelector('#sheet-nl')!;
      return {
        done: !!s.querySelector('.deck-send-done'),
        value: s.querySelector<HTMLInputElement>('input[type="email"]')?.value,
      };
    });
    expect(m.done).toBe(false);
    expect(m.value).toBe('');
  });
});

test.describe('the card still fits', () => {
  for (const height of [844, 664, 600]) {
    test(`the pill is at the foot at ${height}, and nothing scrolls`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await open(page);
      if (!await configured(page)) test.skip();
      const m = await page.evaluate(() => {
        const o = document.querySelector('.deck-op')!;
        const read = o.parentElement!;
        const btn = o.querySelector('.deck-op-do')!.getBoundingClientRect();
        const poll = o.querySelector('.deck-op-poll')!.getBoundingClientRect();
        const box = read.getBoundingClientRect();
        return {
          over: read.scrollHeight - read.clientHeight,
          shed: o.getAttribute('data-shed'),
          // At the foot of the card, and clear of the ballot above it.
          foot: Math.round(box.bottom - btn.bottom),
          gap: Math.round(btn.top - poll.bottom),
          width: Math.round(box.width - btn.width),
        };
      });
      expect(m.over).toBeLessThanOrEqual(1);
      expect(m.foot).toBeLessThanOrEqual(6);
      expect(m.gap).toBeGreaterThanOrEqual(11);
      expect(m.width).toBe(0);
      // §8: nothing is shed at 844 or 664, even with the pill on the card.
      if (height >= 664) expect(m.shed).toBeNull();
    });
  }
});
