import { test, expect } from '@playwright/test';

/**
 * The document's head, and the one thing that must not be in it - DIA-410.
 *
 * ## What this is guarding
 *
 * There used to be a blocking script in `<head>` that bounced a bare `/` to
 * `/about/`. `location.replace()` does not stop the browser mid-flight: the
 * matrix page kept arriving while the new document loaded, and if the
 * redirect landed while React's payload was still streaming, React reported
 * the cut stream - minified error #412, "Connection closed". The gate is
 * retired (DIA-441) and the race with it; the head rule below is worth
 * keeping on its own merits, and DIA-442 brings the gate back.
 *
 * It fired on every repeat visit until DIA-433, and stopped firing for a
 * reason that had nothing to do with it: that issue moved the type off
 * `fonts.googleapis.com`, and the render-blocking stylesheet it removed was
 * what had been holding the document open long enough to lose the race.
 * Measured on one build, with a single slow blocking stylesheet put back into
 * `<head>`: the error returns in two visits out of three.
 *
 * So the console is silent today by luck, and the luck is one `<link>` wide.
 * A race is not a thing a test can pin - but its trigger is, and this is that
 * test: nothing render-blocking from anywhere else may stand in `<head>`.
 * That rule is DIA-433's anyway, for its own reasons; this is the second
 * reason, and the one that bites quietly.
 *
 * If a stylesheet ever has to go back, the gate has to stop being a blocking
 * redirect first - see the issue for what that costs.
 */

const ENTRY = ['/', '/about/', '/gap/'];

test.describe('the head carries nothing that blocks the first paint', () => {
  for (const path of ENTRY) {
    test(`${path} loads no external stylesheet, and no blocking third-party script`, async ({ page }) => {
      await page.goto(path);
      const m = await page.evaluate(() => {
        const here = location.origin;
        const links = [...document.querySelectorAll<HTMLLinkElement>('head link[rel~="stylesheet"]')];
        const scripts = [...document.querySelectorAll<HTMLScriptElement>('head script[src]')];
        return {
          offsite: links.map((l) => l.href).filter((h) => !h.startsWith(here)),
          blocking: scripts
            .filter((s) => !s.defer && !s.async)
            .map((s) => s.src)
            .filter((h) => !h.startsWith(here)),
        };
      });
      // The type is served from here (DIA-433). Anything else in this list is
      // a document the browser waits for before it paints - and every
      // millisecond it waits is a millisecond the first-visit redirect has to
      // cut React's stream in half (DIA-410).
      expect(m.offsite).toEqual([]);
      expect(m.blocking).toEqual([]);
    });
  }

  test('nothing in the head redirects, and / is the failures page', async ({ page, request }) => {
    // There was a first-visit gate here: a blocking script that sent a bare
    // "/" to the about page. It is retired (DIA-441) because it never meant
    // "first visit" - a hard load of "/" was redirected before the component
    // that recorded the visit could run, so the bounce repeated forever for
    // anyone who did not happen to follow a link. DIA-442 is its return.
    const html = await (await request.get('/')).text();
    expect(html).not.toContain('location.replace');
    expect(html).not.toContain('hy_seen');

    // And the address does what it says, on a browser that has never been
    // here and on one that has.
    for (const visit of [1, 2]) {
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForTimeout(700);
      expect(new URL(page.url()).pathname, `visit ${visit}`).toBe('/');
      expect(await page.locator('.matrix').count(), `visit ${visit}`).toBeGreaterThan(0);
    }
  });

  test('an item is never redirected, and its breadcrumb root reaches the matrix', async ({ page }) => {
    // The reader this was costing: in from a post, tap 7 באוקטובר, and until
    // DIA-441 they got the about page instead of the failures matrix - every
    // time, not once. A phone, because that breadcrumb is the deck's and the
    // deck is behind §2's breakpoint - which is also where that reader is.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/item/t01/');
    await page.waitForSelector('.deck[data-live]');
    expect(new URL(page.url()).pathname).toBe('/item/t01/');

    await page.evaluate(() => document.querySelector<HTMLElement>('.deck-crumb-root')!.click());
    await page.waitForTimeout(1200);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(await page.locator('.matrix').count()).toBeGreaterThan(0);
  });
});

test.describe('the entry pages are quiet', () => {
  for (const path of ENTRY) {
    test(`${path} writes nothing to the console, first visit and repeat`, async ({ page }) => {
      // The state this used to fail in. It passes because of the head rule
      // above, not on its own - which is why that one is the real guard.
      const noise: string[] = [];
      page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        if (/_next\/hmr|React DevTools|ERR_TUNNEL/.test(m.text())) return;
        noise.push(`${m.type()}: ${m.text()}`);
      });
      for (const visit of [1, 2, 3]) {
        await page.goto(path, { waitUntil: 'load' });
        await page.waitForTimeout(900);
        expect(noise, `visit ${visit} to ${path}`).toEqual([]);
      }
    });
  }
});
