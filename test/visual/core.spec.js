'use strict';
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

// 2026-11-23 is a Monday. Puzzle #1: the seventh number (index 6) is the odd one out.
const PAGE = `${pathToFileURL(join(__dirname, '../../example/index.html')).href}?date=2026-11-23`;
const WRONG = 1;
const RIGHT = 6;

const sizes = { phone: { width: 375, height: 760 }, desktop: { width: 1100, height: 820 } };
const choice = (page, i) => page.locator('.fables-choice').nth(i);

async function open(page) {
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(PAGE);
  await expect(page.locator('.fables-choice')).toHaveCount(8);
}

async function axe(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

for (const [size, viewport] of Object.entries(sizes)) {
  for (const colorScheme of ['light', 'dark']) {
    test.describe(`${size} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme, reducedMotion: 'reduce' });
      const name = (state) => `${state}-${size}-${colorScheme}.png`;

      test('shell, miss, success, settled and share', async ({ page }) => {
        await open(page);
        await expect(page).toHaveScreenshot(name('shell'));
        await axe(page);

        await choice(page, WRONG).click();
        await expect(page.locator('.fables-result')).toHaveClass(/is-miss/);
        await expect(page.locator('.fables-result')).toHaveScreenshot(name('miss'));
        await axe(page);

        await choice(page, RIGHT).click();
        await expect(page.locator('.fables-result')).toHaveClass(/is-solved/);
        await expect(page.locator('.fables-result .fables-verdict')).toHaveScreenshot(name('success'));
        await expect(page).toHaveScreenshot(name('settled'), { fullPage: true });
        await expect(page.locator('.fables-share')).toHaveScreenshot(name('share'));
        await axe(page);
      });

      test('stats, help and unlimited pass accessibility checks', async ({ page }) => {
        await open(page);
        for (const tab of ['Unlimited', 'Stats', 'Help']) {
          await page.getByRole('link', { name: tab, exact: true }).click();
          await axe(page);
        }
      });
    });
  }
}

test.describe('behavior in the browser', () => {
  test('a miss is announced with tries used and left, and a solve moves focus to the result', async ({ page }) => {
    await open(page);
    await choice(page, WRONG).click();
    await expect(page.locator('[aria-live="polite"]')).toHaveText('Not yet. 1 try used, 2 tries left.');
    await expect(page.locator('.fables-pip.miss')).toHaveCount(1);
    await choice(page, RIGHT).click();
    await expect(page.locator('[aria-live="polite"]')).toHaveText(/^Solved in two tries\. Moral: /);
    await expect(page.locator('.fables-result')).toBeFocused();
    await expect(page.locator('.fables-share-text')).toHaveText(/^ExampleFables #1 · Mon Nov 23 · 2\/3 · Streak 1\n🟥🟩\n.*\?p=ex-d-0001$/);
  });

  test('the success animation plays, and stops under reduced motion', async ({ browser }) => {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ reducedMotion });
      await open(page);
      await choice(page, RIGHT).click();
      const animation = await page.locator('.fables-result').evaluate((el) => getComputedStyle(el).animationName);
      expect(animation).toBe(reducedMotion === 'reduce' ? 'none' : 'fables-pop');
      await page.close();
    }
  });

  test('progress survives a reload and the settled state stays', async ({ page }) => {
    await open(page);
    await choice(page, RIGHT).click();
    await page.reload();
    await expect(page.locator('.fables-result')).toHaveClass(/is-solved/);
    await expect(page.locator('.fables-choice.is-answer')).toHaveCount(1);
    await page.getByRole('link', { name: 'Stats', exact: true }).click();
    await expect(page.locator('.fables-tile').nth(2)).toContainText('1');
  });

  test('copy shows a visible confirmation', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await choice(page, RIGHT).click();
    await page.getByRole('button', { name: 'Copy result' }).click();
    await expect(page.locator('.fables-copied')).toHaveText(/Copied/);
  });

  test('Save picture downloads a 1200 x 630 card with no puzzle content', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }); });
    await open(page);
    await choice(page, WRONG).click();
    await choice(page, RIGHT).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save picture' }).click()]);
    expect(download.suggestedFilename()).toBe('examplefables-1.png');
    const bytes = require('node:fs').readFileSync(await download.path());
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
    await expect(page.locator('.fables-copied')).toHaveText('Picture saved.');
    require('node:fs').copyFileSync(await download.path(), require('node:path').join(__dirname, '../../test-results/share-card.png'));
  });

  test('a missed daily puzzle still keeps the streak', async ({ page }) => {
    await open(page);
    for (const i of [0, 1, 2]) await choice(page, i).click();
    await expect(page.locator('.fables-result')).toHaveClass(/is-lost/);
    await expect(page.locator('.fables-streak')).toHaveText('Streak: 1 day');
    await expect(page.locator('.fables-share-text')).toHaveText(/X\/3 · Streak 1/);
  });

  test('unlimited: own numbers, filters, next puzzle, and no effect on the streak', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'Unlimited', exact: true }).click();
    await expect(page.locator('.fables-kicker')).toHaveText(/^U-1 · /);
    await page.locator('select[name="concept"]').selectOption('squares');
    await expect(page.locator('.fables-kicker')).toHaveText(/Square numbers/);
    const answer = await page.evaluate(() => {
      const label = document.querySelector('.fables-kicker').textContent.match(/^U-(\d+)/)[1];
      return window.EXAMPLE_BANK.unlimited.find((p) => p.serial === Number(label)).answer;
    });
    await choice(page, answer).click();
    await expect(page.locator('.fables-share-text')).toHaveText(/^ExampleFables U-\d+ · Unlimited · 1\/3\n🟩/);
    const first = await page.locator('.fables-kicker').textContent();
    await page.getByRole('button', { name: 'Next puzzle' }).click();
    await expect(page.locator('.fables-kicker')).not.toHaveText(first);
    await page.getByRole('link', { name: 'Stats', exact: true }).click();
    await expect(page.locator('.fables-tile').nth(2)).toContainText('0');
  });

  test('unlimited: a missed puzzle is not served again until the rest are played, then comes back playable', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'Unlimited', exact: true }).click();
    await page.locator('select[name="concept"]').selectOption('squares');
    await page.locator('select[name="level"]').selectOption('1'); // four puzzles
    const current = () => page.evaluate(() => {
      const serial = Number(document.querySelector('.fables-kicker').textContent.match(/^U-(\d+)/)[1]);
      return window.EXAMPLE_BANK.unlimited.find((p) => p.serial === serial);
    });
    const missed = await current();
    const wrong = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== missed.answer).slice(0, 3);
    for (const i of wrong) await choice(page, i).click();
    await expect(page.locator('.fables-result')).toHaveClass(/is-lost/);
    const seen = new Set([missed.id]);
    for (let k = 0; k < 3; k++) {
      await page.getByRole('button', { name: 'Next puzzle' }).click();
      const next = await current();
      expect(seen.has(next.id)).toBe(false);
      seen.add(next.id);
      await choice(page, next.answer).click();
      await expect(page.locator('.fables-result')).toHaveClass(/is-solved/);
    }
    await page.getByRole('button', { name: 'Next puzzle' }).click();
    expect((await current()).id).toBe(missed.id);
    await expect(page.locator('.fables-picker .fables-notice')).toContainText('one you missed');
    await expect(choice(page, missed.answer)).toBeEnabled();
    await choice(page, missed.answer).click();
    await expect(page.locator('.fables-result')).toHaveClass(/is-solved/);
  });

  test('a date with no puzzle says so and offers Unlimited', async ({ page }) => {
    await page.goto(PAGE.replace('2026-11-23', '2030-01-01'));
    await expect(page.getByRole('heading', { name: 'No puzzle today' })).toBeVisible();
  });

  test('a broken bank is refused with a message, not a crash', async ({ page }) => {
    await page.route('**/*', (route) => route.continue());
    await page.addInitScript(() => {
      Object.defineProperty(window, 'EXAMPLE_BANK', {
        configurable: true,
        get: () => window.__bank,
        set: (b) => { window.__bank = { ...b, daily: b.daily.map((p, i) => (i === 1 ? { ...p, id: b.daily[0].id } : p)) }; },
      });
    });
    await page.goto(PAGE);
    await expect(page.locator('.fables-notice')).toHaveText(/failed their checks/);
  });
});
