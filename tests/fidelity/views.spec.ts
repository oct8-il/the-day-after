import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

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

/**
 * Which comparisons the gate makes.
 *
 * `ported` lists the views whose port is finished and must match the prototype
 * from now on. `exempt` lists the view x width pairs that have deliberately
 * left it - the phone item is the deck from docs/mobile-item.html, which the
 * prototype has no counterpart for, so there is nothing there to match.
 */
const GATE: {
  ported: string[];
  exempt: { view: string; project: string; why: string }[];
} = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fidelity', 'ported.json'), 'utf8'));

const exempt = (view: string, project: string) =>
  GATE.exempt.find((e) => e.view === view && e.project === project);

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
        // Views are ported one at a time. A view counts as ported only when its
        // name is added to ported.json, so switching the gate on for a view is a
        // deliberate line in a commit rather than a side effect of a route
        // existing. Until then the app renders a shell there and comparing it
        // against the prototype would be noise.
        test.skip(!GATE.ported.includes(view.name), `${view.name} is not ported yet`);
        const off = exempt(view.name, testInfo.project.name);
        test.skip(!!off, off?.why ?? '');
        await page.goto(view.path);
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
