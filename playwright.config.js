// Visual, accessibility and motion checks for the core, run against the example game.
// The page is opened straight from disk (file://), exactly as Mike previews it from Finder.
// Baselines are kept per platform, because fonts render differently on macOS and Linux:
// test/visual/baselines/<platform>/. CI runs on Linux; see docs/TESTING.md to refresh them.
'use strict';
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/visual',
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{arg}{ext}',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { toHaveScreenshot: { maxDiffPixels: 20, animations: 'disabled' } },
  use: {
    // Locally, use the Chrome already on the Mac; CI installs Playwright's own Chromium.
    channel: process.env.CI ? undefined : 'chrome',
    timezoneId: 'America/Chicago',
    locale: 'en-US',
  },
});
