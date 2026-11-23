'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fables-core/fables.js');

const daily = { id: 'ex-d-0012', serial: 12, date: '2026-11-23', answer: 6, sequence: [1, 2, 3] };

test('daily share: header with name, number, date, attempts and streak, then the grid', () => {
  const text = F.shareText({ game: 'ExampleFables', puzzle: daily, track: 'daily', rows: [['miss', 'near', 'hit']],
    solved: true, attempts: 3, maxAttempts: 3, streak: 4, url: F.shareUrl('https://x.test/game/', daily) });
  assert.equal(text, 'ExampleFables #12 · Mon Nov 23 · 3/3 · Streak 4\n🟥🟨🟩\nhttps://x.test/game/?p=ex-d-0012');
});

test('unlimited share uses its own number and never a streak; misses show X', () => {
  const text = F.shareText({ game: 'G', puzzle: { id: 'u-7', serial: 7 }, track: 'unlimited', rows: [['miss', 'miss']],
    solved: false, attempts: 2, maxAttempts: 2, streak: 9 });
  assert.equal(text, 'G U-7 · Unlimited · X/2\n🟥🟥');
});

test('shares never contain the answer or the puzzle content', () => {
  const text = F.shareText({ game: 'G', puzzle: daily, track: 'daily', rows: [['hit']], solved: true, attempts: 1, maxAttempts: 3, streak: 1 });
  assert.ok(!text.includes('answer') && !/\b6\b/.test(text.split('\n').slice(1).join('')));
});

test('feedback links carry the puzzle ID and number', () => {
  assert.equal(F.feedbackLink('https://x.test/new?title=Puzzle {id} ({serial})', daily, 'daily'),
    'https://x.test/new?title=Puzzle ex-d-0012 (%2312)');
  assert.equal(F.feedbackLink('', daily, 'daily'), '');
});

test('difficulty is a weighted sum of a game’s own inputs, with a player-data hook', () => {
  assert.equal(F.difficultyScore({ lines: 6, concepts: 2 }, { lines: 0.5, concepts: 1 }), 5);
  assert.throws(() => F.difficultyScore({ lines: 6 }, { lines: 1, nesting: 1 }), /nesting/);
  const hook = (score, s) => score * (1.5 - s.solveRate);
  assert.equal(F.adjustDifficulty(4, { plays: 5, solveRate: 0.5 }, hook), 4, 'too few plays');
  assert.equal(F.adjustDifficulty(4, { plays: 50, solveRate: 0.5 }, hook), 4);
  assert.equal(F.adjustDifficulty(4, { plays: 50, solveRate: 0.25 }, hook), 5);
  assert.equal(F.adjustDifficulty(4, { plays: 50, solveRate: 0.25 }), 4, 'no hook');
});

test('unlimited picks prefer unsolved puzzles, honor filters, and repeat only when needed', () => {
  const list = [
    { id: 'a', serial: 1, concept: 'loops', level: 1 },
    { id: 'b', serial: 2, concept: 'loops', level: 2 },
    { id: 'c', serial: 3, concept: 'lists', level: 1 },
  ];
  assert.equal(F.pickUnlimited(list, new Set()).puzzle.id, 'a');
  assert.equal(F.pickUnlimited(list, new Set(['a'])).puzzle.id, 'b');
  assert.equal(F.pickUnlimited(list, new Set(), { concept: 'lists' }).puzzle.id, 'c');
  assert.equal(F.pickUnlimited(list, new Set(), { level: 2 }).puzzle.id, 'b');
  assert.equal(F.pickUnlimited(list, new Set(), { concept: 'graphs' }), null);
  const repeat = F.pickUnlimited(list, new Set(['c']), { concept: 'lists' });
  assert.deepEqual([repeat.puzzle.id, repeat.repeat], ['c', true]);
  const random = F.pickUnlimited(list, new Set(['a']), { mode: 'random', random: () => 0.99 });
  assert.equal(random.puzzle.id, 'c');
});
