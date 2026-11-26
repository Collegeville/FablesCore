'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fables-core/fables.js');

const day = (serial, date, extra = {}) => ({
  id: `d${serial}`, serial, date, difficulty: serial, capstone: F.weekday(date) === 0,
  parts: ['a', 'b', 'c'].map((l, k) => ({ id: `d${serial}${l}`, maxAttempts: [4, 2, 2][k], label: ['Find', 'Audit', 'Rule'][k] })),
  ...extra,
});

test('multi-part days validate, and part IDs share the bank-wide ID space', () => {
  assert.ok(F.validateBank({ daily: [day(1, '2026-11-23'), day(2, '2026-11-24')] }).ok);
  const clash = day(1, '2026-11-23');
  clash.parts[1].id = 'd1a';
  assert.ok(F.validateBank({ daily: [clash] }).errors.some((e) => /id "d1a" is also used/.test(e)));
  assert.ok(F.validateBank({ daily: [day(1, '2026-11-23', { parts: [] })] }).errors.some((e) => /non-empty/.test(e)));
  const badLimit = day(1, '2026-11-23');
  badLimit.parts[0].maxAttempts = 0;
  assert.ok(F.validateBank({ daily: [badLimit] }).errors.some((e) => /maxAttempts/.test(e)));
  assert.ok(F.validateBank({ unlimited: [{ id: 'u', serial: 1, concept: 'x', level: 1, difficulty: 1, parts: [{ id: 'p' }] }] })
    .errors.some((e) => /only daily puzzles can have parts/.test(e)));
});

test('findPuzzle finds a part and says which one', () => {
  const bank = { daily: [day(1, '2026-11-23')] };
  assert.deepEqual(F.findPuzzle(bank, 'd1b'), { puzzle: bank.daily[0], track: 'daily', part: 1 });
});

const part = (set, letter, date, extra = {}) => ({ id: `${set}${letter}`, set, part: letter, parts: 3, track: 'daily', date, solved: false, ...extra });

test('a multi-part day counts toward the streak only when every part is finished on time', () => {
  const full = (n, date) => ['a', 'b', 'c'].map((l) => part(`d${n}`, l, date));
  const records = [...full(1, '2026-11-21'), ...full(2, '2026-11-22'), part('d3', 'a', '2026-11-23'), part('d3', 'b', '2026-11-23')];
  assert.equal(F.currentStreak(records, '2026-11-23'), 2, 'today is two-thirds done: still pending');
  assert.equal(F.currentStreak([...records, part('d3', 'c', '2026-11-23')], '2026-11-23'), 3);
  assert.equal(F.currentStreak([...records, part('d3', 'c', '2026-11-23', { onTime: false })], '2026-11-23'), 2);
  assert.equal(F.maxStreak(records), 2);
});

test('a multi-part day shares its own score: parts solved out of parts', () => {
  const text = F.shareText({ game: 'G', puzzle: { id: 'd5', serial: 5, date: '2026-11-23' }, track: 'daily',
    rows: [['miss', 'hit'], ['miss', 'miss'], ['hit']], solved: true, score: '2/3', streak: 4 });
  assert.equal(text, 'G #5 v1 · Mon Nov 23 · 2/3 · Streak 4\n🟥🟩\n🟥🟥\n🟩');
});
