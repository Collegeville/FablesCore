'use strict';
// A page left open learns about a new day or a new release by itself. Served over http (from disk,
// through page.route), because that is where version.json is.
const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join, extname } = require('node:path');

const EXAMPLE = join(__dirname, '../../example');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const URL_ = 'http://fables.test/';

// `site` is what the server has now: { build, day, offline }. The bank carries its build.
async function serve(page, site) {
  site.loads = 0;
  await page.route(`${URL_}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/version.json') {
      if (site.offline) return route.abort();
      if (site.none) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ json: { build: site.build, day: site.day, ...(site.version && { version: site.version }) } });
    }
    const file = path === '/' ? 'index.html' : path.slice(1);
    if (file === 'index.html') site.loads++;
    let body;
    try {
      body = readFileSync(join(EXAMPLE, file));
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
    if (file === 'puzzles/bank.js') {
      body = `${body}\nwindow.EXAMPLE_BANK.build = ${JSON.stringify(site.build)};window.EXAMPLE_BANK.version = ${JSON.stringify(site.version ?? null)};window.EXAMPLE_BANK.repeats = [];window.EXAMPLE_BANK.daily = window.EXAMPLE_BANK.daily.filter((p) => p.date <= ${JSON.stringify(site.published ?? site.day)});`;
    }
    return route.fulfill({ body, contentType: TYPES[extname(file)] ?? 'text/plain' });
  });
}
const at = (iso) => new Date(`${iso}-06:00`);
const kicker = (page) => page.locator('.fables-kicker');
const show = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function start(page, site, time = '2026-11-23T20:00:00') {
  await page.clock.install({ time: at(time) });
  await serve(page, site);
  await page.goto(URL_);
  await expect(kicker(page)).toHaveText(/^#1 v1 · Nov 23/);
  await page.clock.runFor(2000);
}

test('a page left open overnight shows the new day when it is looked at again', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23' };
  await start(page, site);
  expect(site.loads).toBe(1);
  Object.assign(site, { build: 'b', day: '2026-11-24' });
  await page.clock.setSystemTime(at('2026-11-24T07:00:00'));
  await show(page);
  await expect(kicker(page)).toHaveText(/^#2 v1 · Nov 24/);
  expect(site.loads).toBe(2);
});

test('a new release reloads an idle page, once', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23' };
  await start(page, site);
  site.build = 'b';
  await page.clock.runFor(6 * 60000); // the timer looks every five minutes
  await expect.poll(() => site.loads).toBe(2);
  await expect(kicker(page)).toBeVisible();
  await page.clock.runFor(20 * 60000);
  expect(site.loads).toBe(2);
});

test('a player in the middle of a puzzle is asked, not interrupted, and loses nothing', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23' };
  await start(page, site);
  await page.locator('.fables-choice').nth(1).click();
  site.build = 'b';
  await show(page);
  await expect(page.locator('.fables-update')).toContainText('A new version is ready.');
  expect(site.loads).toBe(1);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => site.loads).toBe(2);
  await expect(page.locator('.fables-choice.tried')).toHaveCount(1);
  await expect(page.locator('.fables-update')).toHaveCount(0);
});

test('just after midnight it waits for the new puzzle to be published, then shows it', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23' };
  await start(page, site);
  await page.clock.setSystemTime(at('2026-11-24T00:05:00'));
  await show(page);
  await page.waitForTimeout(200);
  expect(site.loads).toBe(1);
  Object.assign(site, { build: 'b', day: '2026-11-24' });
  await page.clock.runFor(6 * 60000);
  await expect(kicker(page)).toHaveText(/^#2 v1 · Nov 24/);
});

test('an old copy that comes back after the reload is not reloaded over and over', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23' };
  await start(page, site);
  // version.json says b, but the bank (an old copy) still says a.
  await page.route(`${URL_}version.json`, (route) => route.fulfill({ json: { build: 'b', day: '2026-11-23' } }));
  await show(page);
  await expect.poll(() => site.loads).toBe(2);
  await expect(kicker(page)).toBeVisible();
  for (let i = 0; i < 3; i++) await page.clock.runFor(2 * 60000);
  expect(site.loads).toBe(2);
});

test('offline, the page that works is kept', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23' };
  await start(page, site);
  site.offline = true;
  await page.clock.setSystemTime(at('2026-11-24T07:00:00'));
  await show(page);
  await page.waitForTimeout(200);
  expect(site.loads).toBe(1);
  await expect(kicker(page)).toBeVisible();
});

test('a site with no version.json still notices a new day', async ({ page }) => {
  const site = { build: undefined, day: '2026-11-30', none: true };
  await start(page, site);
  await page.clock.setSystemTime(at('2026-11-24T07:00:00'));
  await show(page);
  await expect(kicker(page)).toHaveText(/^#2 v1 · Nov 24/);
});

test('the header shows the game version, a new one is named when it arrives, and shares carry it', async ({ page }) => {
  const site = { build: 'a', day: '2026-11-23', version: '2026.11.23.1' };
  await start(page, site);
  await expect(page.locator('.fables-version')).toHaveText(/^Version 2026\.11\.23\.1 · FablesCore \d+\.\d+\.\d+$/);
  await page.locator('.fables-choice').nth(1).click(); // in the middle of a puzzle: offered, not reloaded
  Object.assign(site, { build: 'b', version: '2026.11.23.2' });
  await show(page);
  await expect(page.locator('.fables-update')).toContainText('Version 2026.11.23.2 is ready.');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.locator('.fables-version')).toHaveText(/^Version 2026\.11\.23\.2 /);
  await page.locator('.fables-choice').nth(6).click();
  await expect(page.locator('.fables-share-text')).toContainText('Game version 2026.11.23.2');
});
