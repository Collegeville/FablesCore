'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fables-core/fables.js');

const weekOf = (monday, start = 1) => F.assignSerials(F.planWeek([
  ...[1, 2, 3, 4, 5, 6].map((d) => ({ id: `d-${monday}-${d}`, difficulty: d })),
  { id: `d-${monday}-cap`, difficulty: 8, capstone: true },
], monday), start);
const unlimited = [1, 2, 3].map((n) => ({ id: `u-${n}`, serial: n, concept: 'loops', level: n, difficulty: n }));

test('a good bank passes', () => {
  const bank = { daily: [...weekOf('2026-11-23'), ...weekOf('2026-11-30', 8)], unlimited };
  assert.deepEqual(F.validateBank(bank), { ok: true, errors: [] });
  assert.equal(F.dailyFor(bank, '2026-11-29').id, 'd-2026-11-23-cap');
  assert.equal(F.dailyFor(bank, '2027-01-01'), null);
  assert.equal(F.findPuzzle(bank, 'u-2').track, 'unlimited');
});

test('missing and duplicate IDs and serial numbers are caught', () => {
  const daily = weekOf('2026-11-23');
  daily[1] = { ...daily[1], id: daily[0].id };
  daily[2] = { ...daily[2], serial: daily[0].serial };
  delete daily[3].id;
  const { ok, errors } = F.validateBank({ daily, unlimited: [{ ...unlimited[0], id: daily[0].id, serial: undefined }] });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /id ".*" is also used/.test(e)));
  assert.ok(errors.some((e) => /serial \d+ is used twice/.test(e)));
  assert.ok(errors.some((e) => /daily\[3\]: missing id/.test(e)));
  assert.ok(errors.some((e) => /unlimited\[0\]: missing serial/.test(e)));
});

test('IDs must be unique across both tracks, serials only within a track', () => {
  const daily = weekOf('2026-11-23');
  assert.ok(F.validateBank({ daily, unlimited }).ok, 'daily #1 and U-1 may share the number 1');
  const clash = F.validateBank({ daily, unlimited: [{ ...unlimited[0], id: daily[0].id }] });
  assert.ok(!clash.ok);
});

test('serials run in sequence and increase with the date', () => {
  const gap = weekOf('2026-11-23').map((p, i) => (i === 6 ? { ...p, serial: 9 } : p));
  assert.ok(F.validateBank({ daily: gap }).errors.some((e) => /no gaps/.test(e)));
  const backwards = weekOf('2026-11-23').map((p, i) => ({ ...p, serial: 7 - i }));
  assert.ok(F.validateBank({ daily: backwards }).errors.some((e) => /increase with the date/.test(e)));
});

test('Sundays must be capstones and the week must climb', () => {
  const daily = weekOf('2026-11-23');
  daily[6] = { ...daily[6], capstone: false };
  daily[2] = { ...daily[2], difficulty: 0.5 };
  const { errors } = F.validateBank({ daily });
  assert.ok(errors.some((e) => /Sunday, so it must be a capstone/.test(e)));
  assert.ok(errors.some((e) => /gets easier before Saturday/.test(e)));
});

test('assertBank throws with every problem listed', () => {
  assert.throws(() => F.assertBank({ daily: [{ serial: 1 }] }), /missing id[\s\S]*missing difficulty/);
});
