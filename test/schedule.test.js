'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fables-core/fables.js');

test('weekday and dates are time-zone independent', () => {
  assert.equal(F.weekday('2026-11-23'), 1); // Monday
  assert.equal(F.weekday('2026-11-29'), 0); // Sunday
  assert.equal(F.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(F.addDays('2028-02-28', 1), '2028-02-29');
  assert.ok(!F.isValidDate('2026-02-30'));
  assert.equal(F.today(new Date('2026-11-24T03:00:00Z'), 'America/Chicago'), '2026-11-23');
  assert.equal(F.today(new Date('2026-11-24T03:00:00Z'), 'Europe/Berlin'), '2026-11-24');
});

test('Monday to Saturday ramp from level 1 to 6, Sunday is the capstone', () => {
  const week = Array.from({ length: 7 }, (_, i) => F.rampSlot(F.addDays('2026-11-23', i)));
  assert.deepEqual(week.map((s) => s.level), [1, 2, 3, 4, 5, 6, null]);
  assert.deepEqual(week.map((s) => s.capstone), [false, false, false, false, false, false, true]);
  assert.equal(F.weekStart('2026-11-29'), '2026-11-23');
  assert.equal(F.weekStart('2026-11-23'), '2026-11-23');
  assert.equal(F.weekStart('2026-11-25'), '2026-11-23');
});

test('planWeek sorts the six regular puzzles by difficulty and puts the capstone on Sunday', () => {
  const regular = [5, 1, 4, 2, 6, 3].map((d) => ({ id: `r${d}`, difficulty: d }));
  const plan = F.planWeek([...regular, { id: 'cap', difficulty: 9, capstone: true }], '2026-11-23');
  assert.deepEqual(plan.map((p) => p.id), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'cap']);
  assert.equal(plan[6].date, '2026-11-29');
  assert.throws(() => F.planWeek(regular, '2026-11-24'), /Monday/);
  assert.throws(() => F.planWeek(regular, '2026-11-23'), /capstone/);
});

test('serial numbers are assigned once, in order', () => {
  assert.deepEqual(F.assignSerials([{}, {}, {}], 10).map((p) => p.serial), [10, 11, 12]);
});
