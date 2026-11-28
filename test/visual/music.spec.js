'use strict';
// The music area in the browser: pick-the-score cards (look, accessibility, keyboard, feedback,
// nothing given away before the answer), the player, a generated Unlimited track with named
// levels, and the listen count in the share.
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

const BASE = pathToFileURL(join(__dirname, 'music/index.html')).href;
const at = (date, extra = '') => `${BASE}?date=${date}${extra}`;
const sizes = { phone: { width: 375, height: 760 }, desktop: { width: 1100, height: 820 } };
const card = (page, i) => page.locator('.fm-card').nth(i);

async function open(page, url) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await expect(page.locator('.fm-card').first()).toBeVisible();
}
async function axe(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

for (const [size, viewport] of Object.entries(sizes)) {
  for (const colorScheme of ['light', 'dark']) {
    test.describe(`${size} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme, reducedMotion: 'reduce' });
      const name = (state) => `music-${state}-${size}-${colorScheme}.png`;

      test('melody cards: choosing, a miss, and the settled puzzle', async ({ page }) => {
        await open(page, at('2026-11-23'));
        await expect(page).toHaveScreenshot(name('cards'), { fullPage: true });
        await axe(page);
        await card(page, 1).locator('.fm-choose').click();
        await expect(card(page, 1)).toHaveClass(/is-selected/);
        await page.locator('.fm-check').click();
        await expect(card(page, 1)).toHaveClass(/is-tried/);
        await expect(card(page, 1)).toContainText('Not this one');
        await page.locator('.fables-result').evaluate((e) => Promise.all(e.getAnimations({ subtree: true }).map((a) => a.finished)));
        await axe(page);
        await card(page, 0).locator('.fm-choose').click();
        await page.locator('.fm-check').click();
        await expect(page.locator('.fables-results')).toBeVisible();
        await page.getByRole('link', { name: 'See the puzzle' }).click();
        await expect(page.locator('.fm-card.is-answer')).toHaveCount(1);
        await expect(page).toHaveScreenshot(name('settled'), { fullPage: true });
        await axe(page);
      });

      test('rhythm cards on a one-line staff', async ({ page }) => {
        await open(page, at('2026-11-24'));
        await expect(page.locator('.fm-score.fm-percussion')).toHaveCount(3);
        await expect(page.locator('.fm-beat')).toBeVisible();
        await expect(page).toHaveScreenshot(name('rhythm'), { fullPage: true });
        await axe(page);
      });
    });
  }
}

test('nothing describes a score before the answer; afterwards each one is described', async ({ page }) => {
  await open(page, at('2026-11-23'));
  await expect(page.locator('.fm-score[aria-label]')).toHaveCount(0);
  await expect(page.locator('.fm-score[aria-hidden="true"]')).toHaveCount(4);
  for (const label of await page.locator('.fm-choose').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) {
    expect(label).toMatch(/^Choice \d of 4$/);
  }
  await card(page, 0).locator('.fm-choose').click();
  await page.locator('.fm-check').click();
  await page.getByRole('link', { name: 'See the puzzle' }).click();
  await expect(page.locator('.fm-score[aria-label]')).toHaveCount(4);
  await expect(page.locator('.fm-score').first()).toHaveAttribute('aria-label', /^four bars in C major, 4\/4\. bar 1: C quarter, D quarter, E half;/);
  await expect(page.getByRole('button', { name: 'Hear choice 2' })).toBeVisible();
});

test('the keyboard: Space plays, numbers and arrows choose, Enter checks', async ({ page }) => {
  await open(page, at('2026-11-23'));
  await page.keyboard.press(' ');
  await expect(page.locator('.fm-listens')).toHaveText('Listened once');
  await expect(page.locator('.fm-play')).toHaveText(/Replay/);
  await page.keyboard.press('3');
  await expect(card(page, 2)).toHaveClass(/is-selected/);
  await expect(page.locator('.fm-check')).toHaveText('Check choice 3');
  await page.keyboard.press('Enter');
  await expect(card(page, 2)).toHaveClass(/is-tried/);
  await expect(page.locator('.fables-result')).toContainText('Not yet');
  // Arrows skip the score already ruled out.
  await page.keyboard.press('2');
  await page.keyboard.press('ArrowDown');
  await expect(card(page, 3)).toHaveClass(/is-selected/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(card(page, 0)).toHaveClass(/is-selected/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.fables-results')).toBeVisible();
  await expect(page.locator('.fables-share-text')).toContainText('MusicTest #1 v1 · Mon Nov 23 · 2/3 · 🎧 1');
});

test('a listen counts once per press, and replays after the answer do not count', async ({ page }) => {
  await open(page, at('2026-11-23'));
  await page.locator('.fm-play').click();
  await page.locator('.fm-play').click();
  await expect(page.locator('.fm-listens')).toHaveText('Listened 2 times');
  await page.reload();
  await expect(page.locator('.fm-listens')).toHaveText('Listened 2 times');
  await card(page, 0).locator('.fm-choose').click();
  await page.locator('.fm-check').click();
  await page.getByRole('link', { name: 'See the puzzle' }).click();
  await page.locator('.fm-play').click();
  await page.getByRole('button', { name: 'Hear choice 2' }).click();
  await expect(page.locator('.fm-listens')).toHaveText('Listened 2 times');
});

test('Unlimited from a generator: named levels, no empty concept picker, numbers without end', async ({ page }) => {
  await open(page, at('2026-11-23', '#unlimited'));
  await expect(page.locator('.fables-kicker')).toHaveText('U-1 v1 · melody · Monday');
  await expect(page.locator('select[name="concept"]')).toHaveCount(0);
  await expect(page.locator('select[name="level"] option')).toHaveText(['Any level', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday capstone']);
  await page.locator('select[name="level"]').selectOption({ label: 'Sunday capstone' });
  await expect(page.locator('.fables-kicker')).toHaveText('U-7 v1 · melody · Sunday capstone');
});
