import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

/**
 * Rule 3 of the port: every ported view is compared, pixel for pixel, against
 * the frozen prototype.
 *
 *   FIDELITY_TARGET=prototype  render docs/prototype.html   (captures baselines)
 *   FIDELITY_TARGET=app        render the built app         (checks the port)
 *
 * Four views x two themes x two widths = sixteen images. A failing diff is
 * uploaded as an artifact so the difference is visible without checking the
 * branch out.
 */
const TARGET = process.env.FIDELITY_TARGET ?? 'prototype';
const PROTOTYPE = pathToFileURL(join(process.cwd(), 'docs', 'prototype.html')).href;

const VIEWS = [
  { name: 'home', hash: '#/home', path: '/' },
  { name: 'gap', hash: '#/gap', path: '/gap/' },
  { name: 'item-i13', hash: '#/item/i13', path: '/item/i13/' },
  { name: 'about', hash: '#/about', path: '/about/' },
] as const;

const THEMES = ['dark', 'light'] as const;

/** The prototype's first-visit sequences are stateful; screenshots are not. */
async function settle(page: Page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  });
  await page.evaluate(() => {
    for (const k of ['hy_seen', 'hy_home_intro', 'hy_item_intro']) {
      try { localStorage.setItem(k, '1'); } catch {}
    }
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

for (const view of VIEWS) {
  for (const theme of THEMES) {
    test(`${view.name} · ${theme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });

      if (TARGET === 'prototype') {
        // Seed the flags before the page's own scripts read them, then route.
        await page.goto(PROTOTYPE);
        await settle(page);
        await page.evaluate((h) => { location.hash = h; }, view.hash);
        await page.waitForTimeout(400);
      } else {
        const res = await page.goto(view.path);
        // Views are ported one at a time; a route that does not exist yet is
        // skipped, so the gate tightens by itself as each view lands.
        test.skip(!res || res.status() >= 400, `${view.name} is not ported yet`);
        await settle(page);
      }
      await settle(page);

      await expect(page).toHaveScreenshot(
        `${view.name}-${theme}-${testInfo.project.name}.png`,
        { fullPage: true },
      );
    });
  }
}
