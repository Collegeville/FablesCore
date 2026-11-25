'use strict';
// The pieces DataFables needs from the core: puzzles loaded on demand, no weekly ramp, an Archive
// played as practice, Unlimited levels that rise with the run, resuming, and the game hooks.
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

const BASE = pathToFileURL(join(__dirname, 'provider/index.html')).href;
const at = (date, extra = '') => `${BASE}?date=${date}${extra}`;
const choice = (page, i) => page.locator('.fables-choice').nth(i);
const answer = async (page) => (await page.locator('.fables-kicker').waitFor()) ?? page.evaluate(() => {
  const kicker = document.querySelector('.fables-kicker').textContent;
  const id = kicker.startsWith('U-') ? `pv-u-${kicker.match(/^U-(\d+)/)[1]}` : `pv-${kicker.match(/^#(\d+)([abc])/).slice(1).join('')}`;
  return window.__answers[id];
});

async function open(page, url) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    // Expose answers to the test only.
    window.addEventListener('DOMContentLoaded', () => {
      const s = window.EXAMPLE_BANK;
      window.__answers = {};
      for (let d = 0; d < 10; d++) for (let k = 0; k < 3; k++) window.__answers[`pv-${d + 1}${'abc'[k]}`] = s.unlimited[d * 3 + k].answer;
      s.unlimited.slice(30).forEach((p, i) => { window.__answers[`pv-u-${i + 1}`] = p.answer; });
    });
  });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test('a day loads from the provider, with no ramp labels, and the intro shows once', async ({ page }) => {
  await open(page, at('2026-11-29'));
  await expect(page.locator('.fables-kicker')).toHaveText('#7a · Nov 29 · Find · Sunday');
  await expect(page.locator('.fables-intro')).toContainText('How to play the test');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.reload();
  await expect(page.locator('.fables-kicker')).toBeVisible();
  await expect(page.locator('.fables-intro')).toHaveCount(0);
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.locator('.test-help')).toHaveText('Export and import go here.');
  await expect(page.getByRole('heading', { name: 'Daily and Unlimited' })).toBeVisible();
});

test('the Archive lists past days and plays them as practice, outside the streak', async ({ page }) => {
  await open(page, at('2026-11-26'));
  await page.getByRole('link', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.fables-archive li')).toHaveCount(3);
  await expect(page.locator('.fables-archive li').first()).toContainText('Wed Nov 25');
  await page.locator('.fables-archive a').first().click();
  await expect(page.locator('.fables-practice')).toContainText('Practice: Nov 25');
  await expect(page.locator('.fables-tabs [aria-current]')).toHaveText(['Archive']);
  await expect(page.getByRole('link', { name: 'Back to today' })).toHaveAttribute('href', /provider\/index\.html\?date=2026-11-26$/);
  for (const part of ['a', 'b', 'c']) {
    await choice(page, await answer(page)).click();
    await expect(page.locator('.test-note')).toHaveText(new RegExp(`^Got pv-3${part}$`));
    if (part !== 'c') await page.getByRole('button', { name: new RegExp(`^Next: part ${String.fromCharCode(part.charCodeAt(0) + 1)}`) }).click();
  }
  await expect(page.locator('.fables-results')).toContainText('Congratulations!');
  await expect(page.locator('.fables-practice')).toContainText('Practice: Nov 25');
  await expect(page.locator('.fables-tabs [aria-current]')).toHaveText(['Archive']);
  await expect(page.locator('.fables-streak')).toHaveCount(0);
  await expect(page.locator('.fables-share-text')).not.toContainText('Streak');
  await page.getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(page.locator('.fables-tile').nth(2)).toContainText('0');
  await expect(page.locator('.test-stats')).toHaveText('Records: 3');
  await page.getByRole('link', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.fables-archive li').first()).toContainText('Played · 3 of 3 solved');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('Unlimited levels rise with the run, a miss resets it, and an unfinished puzzle resumes', async ({ page }) => {
  await open(page, at('2026-11-23', '#unlimited'));
  await expect(page.locator('.fables-run')).toContainText('Run 0 · best 0 · level 1 of 3');
  for (let i = 0; i < 2; i++) {
    await choice(page, await answer(page)).click();
    await page.getByRole('button', { name: 'Next puzzle' }).click();
  }
  await expect(page.locator('.fables-run')).toContainText('Run 2 · best 2 · level 2 of 3');
  await expect(page.locator('.fables-kicker')).toHaveText(/level 2$/);
  // One wrong answer, then reload: the same puzzle comes back.
  const a = await answer(page);
  await choice(page, (a + 3) % 8).click();
  const kicker = await page.locator('.fables-kicker').textContent();
  await page.reload();
  await expect(page.locator('.fables-kicker')).toHaveText(kicker);
  // Miss it: the run resets to level 1.
  await choice(page, (a + 4) % 8).click();
  await choice(page, (a + 5) % 8).click();
  await page.getByRole('button', { name: 'Next puzzle' }).click();
  await expect(page.locator('.fables-run')).toContainText('Run 0 · best 2 · level 1 of 3');
  await page.getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(page.locator('.fables-tile').nth(4)).toContainText('0');
  await expect(page.locator('.fables-tile').nth(5)).toContainText('2');
});

test('a shared link opens an Unlimited puzzle or one part of a day through the provider', async ({ page }) => {
  await open(page, at('2026-11-23', '&p=pv-u-5'));
  await expect(page.locator('.fables-kicker')).toHaveText(/^U-5 · /);
  await page.goto(at('2026-11-25', '&p=pv-3b'));
  await expect(page.locator('.fables-kicker')).toHaveText(/^#3a · /); // part b is locked until a is done
});

test('a ramp that starts on a date labels only the days from then on', async ({ page }) => {
  await open(page, at('2026-11-29', '&ramp=2026-11-30'));
  await expect(page.locator('.fables-kicker')).toHaveText('#7a · Nov 29 · Find · Sunday');
  await page.goto(at('2026-12-01', '&ramp=2026-11-30'));
  await expect(page.locator('.fables-kicker')).toHaveText('#9a · Dec 1 · Find · Tuesday · level 2 of 6');
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How the week works' })).toBeVisible();
});
