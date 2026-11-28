'use strict';
// The example game is the living test of the contract: its vendored core must match this repo's
// core, its bank must pass the core's checks, and every puzzle must have exactly one answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const F = require('../fables-core/fables.js');
const { build, defensibleAnswers } = require('../example/tools/make-bank.js');

const root = join(__dirname, '..');

test('VERSION file, script version and changelog agree', () => {
  const version = readFileSync(join(root, 'fables-core/VERSION'), 'utf8').trim();
  assert.equal(F.VERSION, version);
  assert.match(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), new RegExp(`## ${version.replace(/\./g, '\\.')}\\b`));
});

test('the example game vendors an exact copy of the core', () => {
  for (const file of readdirSync(join(root, 'fables-core'), { recursive: true }).filter((f) => f.includes('.') || f === 'VERSION')) {
    assert.equal(readFileSync(join(root, 'example/fables-core', file), 'utf8'), readFileSync(join(root, 'fables-core', file), 'utf8'),
      `example/fables-core/${file} is out of date; run: npm run vendor-example`);
  }
});

test('the committed example bank is exactly what the generator makes', () => {
  const sandbox = {};
  new Function('window', readFileSync(join(root, 'example/puzzles/bank.js'), 'utf8'))(sandbox);
  assert.deepEqual(sandbox.EXAMPLE_BANK, JSON.parse(JSON.stringify(build())));
  assert.ok(F.validateBank(sandbox.EXAMPLE_BANK).ok);
});

test('every example puzzle has exactly one defensible answer', () => {
  const bank = build();
  for (const p of [...bank.daily, ...bank.unlimited]) {
    assert.deepEqual(defensibleAnswers(p.sequence), [p.answer], `${p.id}: ${p.sequence.join(', ')}`);
  }
});

test('the icon tool rejects shapes outside the safe zone and missing alt text', () => {
  const { check } = require('../tools/make-icon.js');
  assert.throws(() => check({ color: '#123456', alt: 'x', symbol: [{ rect: [0, 0, 0.5, 0.5], fill: 'paper' }] }), /safe zone/);
  assert.throws(() => check({ color: '#123456', symbol: [] }), /alt text/);
  assert.doesNotThrow(() => check(JSON.parse(readFileSync(join(root, 'example/icon.json'), 'utf8'))));
});
