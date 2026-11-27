'use strict';
// Multi-part days, the shape DataFables' daily sets need: parts played in order, each with its own
// guess limit, the day shared once at the end, and the streak counted only when every part is done.
const { test, expect } = require('@playwright/test');
const { default: AxeBuilder } = require('@axe-core/playwright');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

const PAGE = `${pathToFileURL(join(__dirname, 'sets/index.html')).href}?date=2026-11-23`;

async function open(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(PAGE);
  await expect(page.locator('.fables-step')).toHaveCount(3);
}
const answerOf = (page, k) => page.evaluate((i) => window.EXAMPLE_BANK.daily[0].parts[i].answer, k);
const wrongOf = async (page, k) => ((await answerOf(page, k)) + 3) % 8;
const choice = (page, i) => page.locator('.fables-choice').nth(i);
const steps = (page) => page.locator('.fables-step');

test('parts unlock in order, each with its own limit, and the day is shared once', async ({ page }) => {
  await open(page);
  await expect(steps(page).nth(0)).toHaveAttribute('aria-current', 'step');
  await expect(steps(page).nth(1)).toBeDisabled();
  await expect(steps(page).nth(2)).toBeDisabled();
  await expect(page.locator('.fables-kicker')).toHaveText(/^#1a v1 · Nov 23 · Find · /);
  await expect(page.locator('.fables-pip')).toHaveCount(4);

  // Part a: one miss, then the answer. No share yet; the next part is offered and unlocked.
  await choice(page, await wrongOf(page, 0)).click();
  await expect(page.locator('[aria-live="polite"]')).toHaveText('Not yet. 1 try used, 3 tries left.');
  await choice(page, await answerOf(page, 0)).click();
  await expect(page.locator('.fables-share')).toHaveCount(0);
  await expect(page.locator('.fables-streak')).toHaveCount(0);
  await expect(steps(page).nth(1)).toBeEnabled();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  // Part b: two tries only; miss both.
  await page.getByRole('button', { name: /^Next: part b, Audit/ }).click();
  await expect(page.locator('.fables-kicker')).toHaveText(/^#1b v1 · /);
  await expect(page.locator('.fables-pip')).toHaveCount(2);
  const wrongB = await wrongOf(page, 1);
  await choice(page, wrongB).click();
  await choice(page, (wrongB + 1) % 8 === (await answerOf(page, 1)) ? (wrongB + 2) % 8 : (wrongB + 1) % 8).click();
  await expect(page.locator('.fables-result')).toHaveClass(/is-lost/);

  // Part c: solve it. Now the whole day is shared, one row per part, with the streak.
  await page.getByRole('button', { name: /^Next: part c, Rule/ }).click();
  await choice(page, await answerOf(page, 2)).click();
  await expect(page.locator('.fables-share-text')).toHaveText(/^ExampleFables #1 v1 · Mon Nov 23 · 2\/3 · Streak 1\n.*\?p=set-1\n🟥🟩\n🟥🟥\n🟩$/);
  await expect(page.locator('.fables-streak')).toHaveText('Streak: 1 day');
  await expect(page.getByRole('heading', { name: 'Nice work, 2 of 3 solved' })).toBeVisible();
  await expect(page.locator('.fables-message')).toContainText('A fresh set arrives tomorrow.');
  await expect(page.locator('.fables-outcomes li')).toHaveText([/Part a, Find: solved in two tries/, /Part b, Audit: not solved/, /Part c, Rule: solved in one try/]);
  await expect(page.locator('.fables-part-heading')).toHaveText('Part c, Rule'); // whose explanation this is
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  // A part's link goes back to that part; from there the results are one tap away.
  await page.getByRole('link', { name: 'Part a, Find' }).click();
  await expect(page.locator('.fables-kicker')).toHaveText(/^#1a v1 · /);
  await expect(page.locator('.fables-step.solved')).toHaveCount(2);
  await expect(page.locator('.fables-step.missed')).toHaveCount(1);

  // Every part's record is kept; the a/b/c steps let the player look back at any of them.
  await steps(page).nth(1).click();
  await expect(page.locator('.fables-kicker')).toHaveText(/^#1b v1 · /);
  await expect(page.locator('.fables-result')).toHaveClass(/is-lost/);
  await page.getByRole('link', { name: 'See your results' }).click();
  await expect(page.getByRole('heading', { name: 'Nice work, 2 of 3 solved' })).toBeVisible();
});

test('a day with every part solved congratulates, and one with none encourages', async ({ page }) => {
  for (const solve of [true, false]) {
    await open(page);
    for (const k of [0, 1, 2]) {
      const a = await answerOf(page, k);
      const tries = await page.locator('.fables-pip').count();
      const taps = solve ? [a] : [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== a).slice(0, tries);
      for (const i of taps) await choice(page, i).click();
      if (k < 2) await page.getByRole('button', { name: /^Next: part/ }).click();
    }
    await expect(page.getByRole('heading', { name: solve ? 'Congratulations!' : 'Good try, next time!' })).toBeVisible();
    await expect(page.locator('.fables-score')).toHaveText(solve ? '3 of 3 parts solved.' : 'None of the 3 parts solved.');
  }
});

test('an unfinished day does not count toward the streak, and reloading resumes it', async ({ page }) => {
  await open(page);
  await choice(page, await answerOf(page, 0)).click();
  await page.reload();
  await expect(page.locator('.fables-kicker')).toHaveText(/^#1b v1 · /, { timeout: 2000 });
  await page.getByRole('link', { name: 'Stats', exact: true }).click();
  await expect(page.locator('.fables-tile').nth(2)).toContainText('0');
});

test('a shared link to one part opens that part', async ({ page }) => {
  await open(page);
  for (const k of [0, 1]) {
    await choice(page, await answerOf(page, k)).click();
    if (k === 0) await page.getByRole('button', { name: /^Next: part b/ }).click();
  }
  await page.goto(PAGE.replace('?date=2026-11-23', '?date=2026-11-23&p=set-1a'));
  await expect(page.locator('.fables-kicker')).toHaveText(/^#1a v1 · /);
});

test('a game can keep its own storage through a store adapter, and tag records', async ({ page }) => {
  await open(page);
  await page.goto(`${PAGE}&store=legacy`);
  await choice(page, await answerOf(page, 0)).click();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toContain('legacy:records');
  expect(keys.filter((k) => k.startsWith('fables:examplefables:records'))).toEqual([]);
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('legacy:records'))['set-1a']);
  expect(record).toMatchObject({ set: 'set-1', part: 'a', parts: 3, solved: true, savedBy: 'legacy adapter', classCode: 'TEST1' });
});
