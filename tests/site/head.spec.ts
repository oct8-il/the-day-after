import { test, expect } from '@playwright/test';

/**
 * The document's head, and the one thing that must not be in it - DIA-410.
 *
 * ## What this is guarding
 *
 * A reader's first visit to `/` is bounced to `/about/` by a blocking script
 * in `<head>` (app/layout.tsx). `location.replace()` does not stop the
 * browser mid-flight: the matrix page keeps arriving while the new document
 * loads, and if the redirect lands while React's payload is still streaming,
 * React reports the cut stream - minified error #412, "Connection closed".
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

  test('the first-visit gate is one inline program, and it is what it says', async ({ page, request }) => {
    // Read from the served document, not from the DOM: by the time a browser
    // has a DOM here it is already standing on /about/, which carries the
    // same layout and so the same script. The source is also the only place
    // the gate's *size* is visible, and its size is the window the redirect
    // races against.
    const html = await (await request.get('/')).text();
    const gate = html.match(/try\{if\(location\.pathname===[^<]*?\}catch\(e\)\{\}/);
    expect(gate, 'the first-visit gate is in /\'s head').not.toBeNull();
    const src = gate![0];
    expect(src).toContain("localStorage.getItem('hy_seen')");
    expect(src).toContain("location.replace('/about/')");
    // One gate that runs, not two. The program appears twice in the document
    // and only one of those is executable: the other is inside the flight
    // payload, where it is the serialised React tree describing the same
    // <Script>, and is data rather than code.
    const runnable = html.split('__next_s=self.__next_s||[]').length - 1;
    expect(runnable).toBe(1);
    // And small enough to be over before anything else in the head is.
    expect(src.length).toBeLessThan(400);
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
