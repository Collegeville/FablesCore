'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fables-core/fables.js');

const u = (solved, at) => ({ id: at, track: 'unlimited', solved, at });

test('Unlimited runs count solves in a row, in the order played', () => {
  // Out of order on purpose: runs follow the time played, not storage order.
  const records = [u(true, '2026-11-23T10:03'), u(true, '2026-11-23T10:01'), u(false, '2026-11-23T10:02'), u(true, '2026-11-23T10:04'),
    { id: 'd', track: 'daily', solved: false, at: '2026-11-23T10:05' }];
  assert.deepEqual(F.unlimitedRuns(records), { current: 2, best: 2, played: 4 });
  assert.deepEqual(F.unlimitedRuns([]), { current: 0, best: 0, played: 0 });
});

test('levels rise every few solves and stop at the top', () => {
  assert.deepEqual([0, 2, 3, 5, 6, 12, 40].map((r) => F.levelForRun(r)), [1, 1, 2, 2, 3, 5, 5]);
  assert.deepEqual([0, 1, 2, 4, 9].map((r) => F.levelForRun(r, { levels: 3, perLevel: 2 })), [1, 1, 2, 3, 3]);
});

test('the bank provider picks by level, says when a level is used up, and repeats last', async () => {
  const list = [1, 1, 2].map((level, i) => ({ id: `u${i}`, serial: i + 1, concept: 'c', level, difficulty: 1 }));
  const p = F.bankProvider({ unlimited: list });
  assert.equal((await p.unlimited({ level: 1 })).puzzle.id, 'u0');
  assert.equal((await p.unlimited({ level: 1, avoid: new Set(['u0']) })).puzzle.id, 'u1');
  const usedUp = await p.unlimited({ level: 1, avoid: new Set(['u0', 'u1']) });
  assert.deepEqual([usedUp.puzzle.id, /Level 1 is used up/.test(usedUp.notice)], ['u2', true]);
  const repeat = await p.unlimited({ avoid: new Set(['u0', 'u1', 'u2']) });
  assert.match(repeat.notice, /repeat/);
  assert.deepEqual(p.levels(), [1, 2]);
  assert.equal((await p.byId('u2')).track, 'unlimited');
});

test('a game without a weekly ramp may have ordinary Sundays and any difficulty order', () => {
  const daily = [
    { id: 'a', serial: 1, date: '2026-11-28', difficulty: 5 },
    { id: 'b', serial: 2, date: '2026-11-29', difficulty: 1 },
  ];
  assert.equal(F.validateBank({ daily }).ok, false);
  assert.deepEqual(F.validateBank({ daily }, { ramp: false }), { ok: true, errors: [] });
});
