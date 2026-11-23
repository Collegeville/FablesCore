'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fables-core/fables.js');

const rec = (date, solved = true, track = 'daily') => ({ id: `${track}-${date}`, date, solved, track, attempts: 1, maxAttempts: 3 });

test('streaks count consecutive days whose daily puzzle was finished, solved or not', () => {
  const records = [rec('2026-11-20'), rec('2026-11-21', false), rec('2026-11-22')];
  assert.equal(F.currentStreak(records, '2026-11-23'), 3, 'not yet played today; a missed puzzle still counts');
  assert.equal(F.currentStreak([...records, rec('2026-11-23', false)], '2026-11-23'), 4);
  assert.equal(F.currentStreak(records, '2026-11-24'), 0, 'skipped a day');
});

test('a daily puzzle played late, from a shared link, does not fill in a past day', () => {
  const records = [rec('2026-11-21'), { ...rec('2026-11-22'), onTime: false }];
  assert.equal(F.currentStreak(records, '2026-11-23'), 0);
  assert.equal(F.maxStreak(records), 1);
});

test('unlimited puzzles never touch the streak', () => {
  const records = [rec('2026-11-21'), rec('2026-11-22', true, 'unlimited')];
  assert.equal(F.currentStreak(records, '2026-11-22'), 1);
  assert.equal(F.maxStreak(records), 1);
});

test('max streak and per-track stats', () => {
  const records = [rec('2026-11-01'), rec('2026-11-02'), rec('2026-11-03'), rec('2026-11-10'), rec('2026-11-11', false),
    { ...rec('2026-11-11', true, 'unlimited'), attempts: 2 }];
  assert.equal(F.maxStreak(records), 3);
  assert.equal(F.currentStreak(records, '2026-11-11'), 2, 'the unsolved 11th still extends the 10th');
  assert.deepEqual(F.trackStats(records, 'daily'), { played: 5, solved: 4, winRate: 80, distribution: { 1: 4 } });
  assert.deepEqual(F.trackStats(records, 'unlimited'), { played: 1, solved: 1, winRate: 100, distribution: { 2: 1 } });
});

test('the store records each puzzle once, namespaced per game', () => {
  const storage = F.memoryStorage();
  const a = F.createStore('alpha', storage);
  const b = F.createStore('beta', storage);
  assert.equal(a.record(rec('2026-11-23')), true);
  assert.equal(a.record({ ...rec('2026-11-23'), solved: false }), false, 'second record ignored');
  assert.equal(a.records()[0].solved, true);
  assert.equal(b.records().length, 0);
  assert.deepEqual([...a.solvedIds()], ['daily-2026-11-23']);
  a.saveState('p1', { answers: [2] });
  assert.deepEqual(a.loadState('p1'), { answers: [2] });
  assert.equal(a.settings().sound, false, 'sound is off by default');
});

test('migrations run once, in order, and keep existing progress', () => {
  const storage = F.memoryStorage();
  const v1 = F.createStore('game', storage);
  v1.record(rec('2026-11-22'));
  const seen = [];
  const migrations = [({ read, write }) => { seen.push('to v2'); write('records', read('records', {})); }];
  F.createStore('game', storage, migrations);
  const again = F.createStore('game', storage, migrations);
  assert.deepEqual(seen, ['to v2']);
  assert.equal(again.records().length, 1);
});

test('blocked storage falls back to memory without throwing', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const store = F.createStore('game', broken);
  assert.equal(store.record(rec('2026-11-23')), false);
  assert.deepEqual(store.records(), []);
});

test('daily stats leave out archive practice; unlimited counts everything', () => {
  const records = [rec('2026-11-20'), { ...rec('2026-11-19'), onTime: false }, { ...rec('2026-11-18', false), onTime: false }];
  assert.deepEqual(F.trackStats(records, 'daily'), { played: 1, solved: 1, winRate: 100, distribution: { 1: 1 } });
});
