#!/usr/bin/env node
// Builds the ExampleFables puzzle bank: node example/tools/make-bank.js
//
// Each puzzle is eight numbers that follow one rule, with exactly one number changed. The player
// taps the number that breaks the pattern. Before a puzzle is kept, a solvability check confirms
// that changing that one number is the only single change that makes the sequence fit any rule
// the game uses, so every puzzle has exactly one defensible answer.
//
// The bank is written once with explicit serial numbers and IDs. Rerunning with the same seed
// reproduces it exactly; to add puzzles later, extend the bank rather than renumbering it.

'use strict';
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const Fables = require('../fables-core/fables.js');

const SEED = 'examplefables-v1';
const FIRST_MONDAY = '2026-11-23';
const WEEKS = 16;
const UNLIMITED = 60;
const LENGTH = 8;

// ---------- seeded random numbers (mulberry32 over a string hash)
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

// ---------- the rules (concepts)
const CONCEPTS = {
  add: { label: 'Adding the same amount', base: 1 },
  multiply: { label: 'Multiplying by the same amount', base: 2 },
  squares: { label: 'Square numbers', base: 2.5 },
  fib: { label: 'Adding the two before', base: 3 },
  alternate: { label: 'Two patterns taking turns', base: 4 },
};

function makeSequence(concept, r, level) {
  const big = level >= 2;
  switch (concept) {
    case 'add': {
      const a = r.int(1, big ? 60 : 12);
      const d = r.int(2, big ? 13 : 6) * (level >= 3 && r.next() < 0.4 ? -1 : 1);
      const start = d < 0 ? a + 8 * -d : a;
      return { seq: Array.from({ length: LENGTH }, (_, k) => start + k * d), why: d > 0 ? `Each number is ${d} more than the one before` : `Each number is ${-d} less than the one before` };
    }
    case 'multiply': {
      const a = r.int(1, big ? 4 : 2);
      const m = level >= 3 ? 3 : 2;
      return { seq: Array.from({ length: LENGTH }, (_, k) => a * m ** k), why: `Each number is ${m === 2 ? 'double' : 'three times'} the one before` };
    }
    case 'squares': {
      const s = r.int(1, big ? 9 : 3);
      return { seq: Array.from({ length: LENGTH }, (_, k) => (s + k) ** 2), why: `Each number is a square: ${s}×${s}, ${s + 1}×${s + 1}, and so on` };
    }
    case 'fib': {
      const x = [r.int(1, big ? 9 : 3), r.int(1, big ? 9 : 4)];
      while (x.length < LENGTH) x.push(x[x.length - 1] + x[x.length - 2]);
      return { seq: x, why: 'Each number is the sum of the two before it' };
    }
    case 'alternate': {
      const a = r.int(1, 9);
      const b = r.int(20, 60);
      const d1 = r.int(2, 5);
      const d2 = r.int(-6, -2);
      return { seq: Array.from({ length: LENGTH }, (_, k) => (k % 2 === 0 ? a + (k / 2) * d1 : b + ((k - 1) / 2) * d2)), why: `Two patterns take turns: one goes up by ${d1} and the other goes down by ${-d2}` };
    }
    default:
      throw new Error(concept);
  }
}

// ---------- the solvability check
// Does the sequence, with position `hole` treated as unknown, fit `concept` for some value there?
function fitsWithHole(x, hole, concept) {
  const known = x.map((v, i) => (i === hole ? null : v));
  const arithmetic = (vals) => {
    const pts = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (pts.length < 3) return false; // two points always fit a line, which proves nothing
    const [[p, xp], [q, xq]] = pts;
    const d = (xq - xp) / (q - p);
    if (!Number.isInteger(d) || d === 0) return false;
    return pts.every(([i, v]) => v === xp + (i - p) * d);
  };
  switch (concept) {
    case 'add':
      return arithmetic(known);
    case 'multiply': {
      const pts = known.map((v, i) => [i, v]).filter(([, v]) => v != null);
      const [p, xp] = pts[0];
      return [2, 3].some((m) => {
        const a = xp / m ** p;
        return Number.isInteger(a) && a > 0 && pts.every(([i, v]) => v === a * m ** i);
      });
    }
    case 'squares': {
      const pts = known.map((v, i) => [i, v]).filter(([, v]) => v != null);
      const [p, xp] = pts[0];
      const root = Math.round(Math.sqrt(xp));
      if (root * root !== xp) return false;
      return pts.every(([i, v]) => v === (root - p + i) ** 2) && root - p >= 1;
    }
    case 'fib': {
      let v;
      if (hole >= 2) v = x[hole - 1] + x[hole - 2];
      else if (hole === 1) v = x[2] - x[0];
      else v = x[2] - x[1];
      const y = [...x];
      y[hole] = v;
      return y.every((n, i) => i < 2 || n === y[i - 1] + y[i - 2]) && y[0] > 0 && y[1] > 0;
    }
    case 'alternate': {
      const evens = known.filter((_, i) => i % 2 === 0);
      const odds = known.filter((_, i) => i % 2 === 1);
      return arithmetic(evens) && arithmetic(odds);
    }
    default:
      return false;
  }
}

// Positions where one change would make the sequence fit some rule. A good puzzle has exactly one.
// (A sequence that already fits a rule would fit with any position changed, so it fails this too.)
function defensibleAnswers(x) {
  const out = new Set();
  for (let hole = 0; hole < x.length; hole++) {
    for (const concept of Object.keys(CONCEPTS)) if (fitsWithHole(x, hole, concept)) out.add(hole);
  }
  return [...out];
}

// ---------- one puzzle
const MORALS = {
  add: ['A steady step is easy to check; check it anyway.', 'One wrong step hides best in a long, steady walk.', 'Count the gaps, not the numbers.'],
  multiply: ['Growth that doubles makes small slips look big.', 'When things multiply, compare each to the one before.'],
  squares: ['Know the familiar numbers by sight.', 'A pattern you know well is still worth one more look.'],
  fib: ['Some patterns depend on more than one step back.', 'Check each number against all the numbers it depends on.'],
  alternate: ['Two patterns can share one line; read them apart.', 'When a pattern seems broken everywhere, look for two at once.'],
};

function makePuzzle(r, concept, level) {
  for (let tries = 0; tries < 500; tries++) {
    const { seq, why } = makeSequence(concept, r, level);
    // Errors in the first two places are hard to defend for some rules, so start at 2.
    const wrong = r.int(2, LENGTH - 1);
    const right = seq[wrong];
    const nudge = level >= 3 ? r.pick([-1, 1]) : r.pick([-3, -2, 2, 3, 4]) * (concept === 'multiply' && level >= 2 ? 2 : 1);
    const shown = [...seq];
    shown[wrong] = right + nudge;
    if (shown[wrong] <= 0 || shown.some((v, i) => i !== wrong && v === shown[wrong])) continue;
    const positions = defensibleAnswers(shown);
    if (positions.length !== 1 || positions[0] !== wrong) continue;
    const subtlety = Math.abs(nudge) === 1 ? 3 : Math.abs(nudge) <= 2 ? 2 : 1;
    const digits = String(Math.max(...shown)).length;
    const inputs = { concept: CONCEPTS[concept].base, digits, subtlety };
    const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][wrong];
    return {
      title: 'Which number breaks the pattern?',
      concept,
      level,
      sequence: shown,
      answer: wrong,
      difficultyInputs: inputs,
      difficulty: Fables.difficultyScore(inputs, { concept: 1, digits: 0.5, subtlety: 0.75 }),
      explanation: `${why}, so the ${ordinal} number should be ${right}, not ${shown[wrong]}.`,
      moral: r.pick(MORALS[concept]),
    };
  }
  throw new Error(`Could not make a defensible ${concept} puzzle at level ${level}`);
}

// ---------- the bank
function build() {
  const r = rng(SEED);
  const regular = ['add', 'multiply', 'squares', 'fib'];
  const daily = [];
  for (let w = 0; w < WEEKS; w++) {
    const monday = Fables.addDays(FIRST_MONDAY, 7 * w);
    // Weekly theme: two concepts, so Sunday's capstone mixes what the week practiced.
    const theme = [regular[w % 4], regular[(w + 1) % 4]];
    const week = [1, 1, 2, 2, 3, 3].map((level, i) => makePuzzle(r, theme[i % 2], level));
    const capstone = { ...makePuzzle(r, 'alternate', 3), capstone: true };
    capstone.difficulty = Math.round((capstone.difficulty + 2) * 100) / 100; // capstone bonus: two patterns at once
    daily.push(...Fables.planWeek([...week, capstone], monday));
  }
  const unlimited = [];
  const all = [...regular, 'alternate'];
  for (let k = 0; k < UNLIMITED; k++) unlimited.push(makePuzzle(r, all[k % all.length], 1 + (Math.floor(k / all.length) % 3)));

  const number = (list, prefix) => Fables.assignSerials(list).map((p) => ({ id: `${prefix}-${String(p.serial).padStart(4, '0')}`, ...p }));
  const bank = { game: 'ExampleFables', seed: SEED, generator: 'make-bank.js v1', daily: number(daily, 'ex-d'), unlimited: number(unlimited, 'ex-u') };
  Fables.assertBank(bank);
  return bank;
}

module.exports = { build, defensibleAnswers, fitsWithHole, CONCEPTS };

if (require.main === module) {
  const bank = build();
  const out = join(__dirname, '..', 'puzzles', 'bank.js');
  writeFileSync(out, `// Generated by example/tools/make-bank.js. Do not edit by hand.\nwindow.EXAMPLE_BANK = ${JSON.stringify(bank, null, 1)};\n`);
  console.log(`Wrote ${bank.daily.length} daily and ${bank.unlimited.length} unlimited puzzles to ${out}`);
}
