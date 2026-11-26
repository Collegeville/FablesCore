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
        await expect(page.locator('.fables-results')).toHaveClass(/is-solved/);
        await expect(page.locator('.fables-result .fables-verdict')).toHaveScreenshot(name('success'));
        await expect(page).toHaveScreenshot(name('results'), { fullPage: true });
        await expect(page.locator('.fables-share')).toHaveScreenshot(name('share'));
        await axe(page);

        await page.getByRole('link', { name: 'See the puzzle' }).click();
        await expect(page.locator('.fables-choice.is-answer')).toHaveCount(1);
        await expect(page).toHaveScreenshot(name('settled'), { fullPage: true });
        await axe(page);
      });

      test('the results screen after a miss', async ({ page }) => {
        await open(page);
        for (const i of [0, 1, 2]) await choice(page, i).click();
        await expect(page.locator('.fables-results')).toHaveClass(/is-lost/);
        await expect(page).toHaveScreenshot(name('results-missed'), { fullPage: true });
        await axe(page);
      });

      test('stats, help, about and unlimited pass accessibility checks', async ({ page }) => {
        await open(page);
        for (const tab of ['Unlimited', 'Stats', 'Help', 'About']) {
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
    await expect(page.locator('[aria-live="polite"]')).toHaveText(/^Congratulations! .* Solved in two tries\. Moral: /);
    await expect(page.locator('.fables-results')).toBeFocused();
    await expect(page.locator('.fables-share-text')).toHaveText(/^ExampleFables #1 · Mon Nov 23 · 2\/3 · Streak 1\n🟥🟩\n.*\?p=ex-d-0001$/);
  });

  test('the success animation plays, and stops under reduced motion', async ({ browser }) => {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ reducedMotion });
      await open(page);
      await choice(page, RIGHT).click();
      const animation = await page.locator('.fables-results').evaluate((el) => getComputedStyle(el).animationName);
      expect(animation).toBe(reducedMotion === 'reduce' ? 'none' : 'fables-pop');
      await page.close();
    }
  });

  test('progress survives a reload and the settled state stays', async ({ page }) => {
    await open(page);
    await choice(page, RIGHT).click();
    await expect(page.locator('.fables-results')).toBeVisible();
    await page.reload();
    await expect(page.locator('.fables-results')).toHaveClass(/is-solved/);
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    await expect(page.locator('.fables-result')).toHaveClass(/is-solved/);
    await expect(page.locator('.fables-choice.is-answer')).toHaveCount(1);
    await page.getByRole('link', { name: 'See your results' }).click();
    await expect(page.locator('.fables-results')).toContainText('Congratulations!');
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

  test('a solve congratulates and links to the Games page; Back returns to the puzzle', async ({ page }) => {
    await open(page);
    await choice(page, RIGHT).click();
    await expect(page).toHaveURL(/#result\/ex-d-0001$/);
    await expect(page.getByRole('heading', { name: 'Congratulations!' })).toBeVisible();
    await expect(page.locator('.fables-score')).toHaveText('Solved in one try.');
    await expect(page.locator('.fables-choice')).toHaveCount(0); // a screen of its own
    await expect(page.locator('.fables-tabs [aria-current]')).toHaveText(['Today']);
    await expect(page.getByRole('link', { name: 'Play more Fables?' })).toHaveAttribute('href', 'https://collegeville.github.io/games/');
    const line = await page.locator('.fables-message').textContent();
    await page.goBack();
    await expect(page.locator('.fables-choice.is-answer')).toHaveCount(1);
    await page.goForward();
    await expect(page.locator('.fables-message')).toHaveText(line); // the same line each time
    await page.reload();
    await expect(page.locator('.fables-message')).toHaveText(line);
  });

  test('a miss encourages', async ({ page }) => {
    await open(page);
    for (const i of [0, 1, 2]) await choice(page, i).click();
    await expect(page.getByRole('heading', { name: 'Good try, next time!' })).toBeVisible();
    await expect(page.locator('.fables-score')).toHaveText('Not solved. All three tries used.');
    await expect(page.getByRole('link', { name: 'Play more Fables?' })).toBeVisible();
  });

  test('a result left open gives way to the next day, and an unfinished one never shows', async ({ page }) => {
    await open(page);
    await page.goto(`${PAGE}#result/ex-d-0001`);
    await page.reload();
    await expect(page.locator('.fables-choice')).toHaveCount(8); // not finished: the puzzle, not a result
    await choice(page, RIGHT).click();
    await expect(page.locator('.fables-results')).toBeVisible();
    await page.goto(`${PAGE.replace('2026-11-23', '2026-11-24')}#result/ex-d-0001`);
    await expect(page.locator('.fables-kicker')).toHaveText(/^#2 · /);
    await page.goto(`${PAGE}#result/%E0%A4%A`);
    await expect(page.locator('.fables-kicker')).toHaveText(/^#1 · /);
  });

  test('after Back to a finished Unlimited puzzle, Next puzzle and reload move on', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'Unlimited', exact: true }).click();
    await expect(page.locator('.fables-kicker')).toHaveText(/^U-1 · /);
    await choice(page, 3).click(); // U-1's answer
    await expect(page.locator('.fables-results-tag')).toHaveText('U-1 · Results');
    await expect(page.locator('.fables-tabs [aria-current]')).toHaveText(['Unlimited']);
    await page.goBack();
    await expect(page.locator('.fables-kicker')).toHaveText(/^U-1 · /);
    await page.getByRole('button', { name: 'Next puzzle' }).click();
    await expect(page.locator('.fables-kicker')).toHaveText(/^U-2 · /);
    await page.reload();
    await expect(page.locator('.fables-kicker')).toHaveText(/^U-2 · /);
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
    const first = (await page.locator('.fables-results-tag').textContent()).split(' ')[0];
    await page.getByRole('button', { name: 'Next puzzle' }).click();
    await expect(page.locator('.fables-kicker')).not.toHaveText(new RegExp(`^${first} `));
    await page.getByRole('link', { name: 'Stats', exact: true }).click();
    await expect(page.locator('.fables-tile').nth(2)).toContainText('0');
  });

  test('unlimited: a missed puzzle is not served again until the rest are played, then comes back playable', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'Unlimited', exact: true }).click();
    await page.locator('select[name="concept"]').selectOption('squares');
    await page.locator('select[name="level"]').selectOption('1'); // four puzzles
    const current = async () => (await page.locator('.fables-kicker').waitFor()) ?? page.evaluate(() => {
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

  test('About comes after Help, with the game’s own text and a link to the family', async ({ page }) => {
    await open(page);
    await expect(page.locator('.fables-tabs a')).toHaveText(['Today', 'Unlimited', 'Stats', 'Help', 'About']);
    const tops = await page.locator('.fables-tabs a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1); // one line, even on a phone
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Why these puzzles' })).toBeVisible();
    await expect(page.locator('.fables-tabs [aria-current]')).toHaveText(['About']);
    await expect(page.getByRole('link', { name: 'Play more Fables?' })).toHaveAttribute('href', 'https://collegeville.github.io/games/');
  });

  test('a date with no puzzle says so and offers Unlimited', async ({ page }) => {
    await page.goto(PAGE.replace('2026-11-23', '2026-11-01'));
    await expect(page.getByRole('heading', { name: 'No puzzle today' })).toBeVisible();
  });

  test('past the end of the collection, puzzles come around again, fresh, under their own numbers', async ({ page }) => {
    await page.goto(PAGE.replace('2026-11-23', '2027-03-15')); // the Monday after the last first play
    await expect(page.locator('.fables-kicker')).toHaveText(/^#\d+ · Mar 15 · Monday · level 1 of 6$/);
    const p = await page.evaluate(() => window.Fables.dailyFor(window.Fables.withRepeats(window.EXAMPLE_BANK, '2027-03-15'), '2027-03-15'));
    expect(p.id).toBe(`${p.of}@2`);
    await choice(page, p.answer).click();
    await expect(page.locator('.fables-results')).toContainText('Streak: 1 day');
    await expect(page.locator('.fables-share-text')).toContainText(`?p=${p.of}%402`);
    await expect(page.locator('.fables-results')).toContainText(`Report a problem with ${p.of}`);
    await expect(page.locator('.fables-report')).not.toContainText('@');
    await page.reload();
    await expect(page.locator('.fables-results')).toContainText('Congratulations!');
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
