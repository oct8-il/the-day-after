import { defineConfig, devices } from '@playwright/test';

/**
 * The fidelity gate.
 *
 * One pinned browser, one operating system. Baselines are captured by CI on the
 * Linux runner and committed from there — never from a laptop, because font
 * rasterisation differs between machines and a baseline captured locally fails
 * for everyone else forever.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  snapshotPathTemplate: '{testDir}/fidelity/baseline/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      // Enough tolerance for antialiasing noise, tight enough that a moved
      // element, a wrong colour or a changed font size fails.
      maxDiffPixelRatio: 0.005,
      threshold: 0.15,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: process.env.FIDELITY_BASE_URL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    trace: 'off',
  },
  projects: [
    { name: 'phone',   use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
