'use strict';
// Playing the collection again: every puzzle once in order, then passes in a fixed, different order,
// with new puzzles going after unplayed ones and before repeats.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const F = require('../fables-core/fables.js');
const { siteBuilder } = require('../fables-core/build-site.js');

const FIRST = '2026-11-23';
// `weeks` weeks of puzzles from a Monday, numbered on from `serial`. Each week climbs, but the weeks
// differ, so one week's Monday can be harder than another's Wednesday (as in CodeFables).
function weeksOf(weeks, monday = FIRST, serial = 1) {
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const climb = Array.from({ length: 6 }, (_, i) => i + ((w * 5 + i * 3) % 7)).sort((a, b) => a - b);
    for (let i = 0; i < 7; i++) {
      const n = serial + w * 7 + i;
      out.push({ id: `t-d-${String(n).padStart(4, '0')}`, serial: n, date: F.addDays(monday, w * 7 + i), difficulty: i === 6 ? 20 : climb[i], capstone: i === 6 });
    }
  }
  return out;
}
const bankOf = (daily) => ({ game: 'T', seed: 'seed', daily, unlimited: [] });
const plan = (daily, through) => F.planRepeats(daily, through, { seed: 'seed' });

test('the first pass is the collection in order; repeats start the day after it', () => {
  const daily = weeksOf(4);
  assert.deepEqual(plan(daily, daily.at(-1).date), []);
  const after = plan(daily, F.addDays(daily.at(-1).date, 1));
  assert.equal(after.length, 1);
  assert.deepEqual([after[0].date, after[0].play], [F.addDays(FIRST, 28), 2]);
});

test('every pass plays every puzzle once, in a different order, on its own weekday level', () => {
  const daily = weeksOf(8);
  const repeats = plan(daily, F.addDays(FIRST, 56 * 5 - 1)); // four more passes
  assert.equal(repeats.length, 56 * 4);
  const orders = [0, 1, 2, 3].map((k) => repeats.slice(k * 56, (k + 1) * 56).map((r) => r.of));
  for (const order of orders) assert.equal(new Set(order).size, 56);
  assert.equal(new Set([daily.map((p) => p.id).join(), ...orders.map((o) => o.join())]).size, 5);
  repeats.forEach((r, i) => assert.equal(r.play, 2 + Math.floor(i / 56)));
  const bank = F.withRepeats(bankOf(daily), F.addDays(FIRST, 56 * 5 - 1));
  assert.deepEqual(F.validateBank(bank).errors, []); // capstones on Sundays, and every week climbs
  assert.equal(bank.daily.length, 56 * 5);
});

test('a puzzle does not come back soon after it was played', () => {
  const daily = weeksOf(52);
  const bank = F.withRepeats(bankOf(daily), F.addDays(FIRST, 364 * 4 - 1));
  const last = new Map();
  let least = Infinity;
  for (const p of bank.daily.sort((a, b) => F.dayNumber(a.date) - F.dayNumber(b.date))) {
    const id = p.of ?? p.id;
    if (last.has(id)) least = Math.min(least, F.dayNumber(p.date) - last.get(id));
    last.set(id, F.dayNumber(p.date));
  }
  assert.ok(least > 60, `came back after ${least} days`);
});

test('new puzzles play before any repeat, the pass then resumes, and the past never changes', () => {
  const daily = weeksOf(4);
  const today = F.addDays(FIRST, 28 + 9); // Wednesday, in the second week of the second pass
  const before = plan(daily, F.addDays(FIRST, 400));
  const monday = F.nextOpenMonday(daily, today);
  assert.equal(monday, F.addDays(FIRST, 42));
  const more = [...daily, ...weeksOf(2, monday, 29)];
  const after = plan(more, F.addDays(FIRST, 400));
  // Nothing through the week the puzzles were added in changes.
  const past = (list) => list.filter((r) => F.dayNumber(r.date) < F.dayNumber(monday));
  assert.deepEqual(past(after), past(before));
  // Their two weeks hold no repeats; the interrupted pass then goes on where it stopped.
  const inTheirWeeks = after.filter((r) => F.dayNumber(r.date) >= F.dayNumber(monday) && F.dayNumber(r.date) < F.dayNumber(monday) + 14);
  assert.deepEqual(inTheirWeeks, []);
  const rest = (list, from) => list.filter((r) => F.dayNumber(r.date) >= F.dayNumber(from)).slice(0, 14).map((r) => r.of);
  assert.deepEqual(rest(after, F.addDays(monday, 14)), rest(before, monday));
  // The next pass includes them.
  const third = after.filter((r) => F.dayNumber(r.date) >= F.dayNumber(monday) + 28).slice(0, 42).map((r) => r.of);
  assert.equal(new Set(third).size, 42);
  assert.deepEqual(F.validateBank(F.withRepeats(bankOf(more), F.addDays(FIRST, 400))).errors, []);
});

test('while unplayed puzzles remain, new ones go after them', () => {
  const daily = weeksOf(4);
  assert.equal(F.nextOpenMonday(daily, F.addDays(FIRST, 2)), F.addDays(FIRST, 28));
});

test('a schedule does not depend on how far ahead it is worked out', () => {
  const daily = weeksOf(5);
  const long = plan(daily, F.addDays(FIRST, 300));
  for (const d of [35, 38, 41, 100, 101]) {
    const through = F.addDays(FIRST, d);
    assert.deepEqual(plan(daily, through), long.filter((r) => F.dayNumber(r.date) <= F.dayNumber(through)));
  }
});

test('a repeat keeps its number, starts fresh under its own ID, and keeps its parts', () => {
  const daily = weeksOf(1).map((p) => ({ ...p, parts: [{ id: `${p.id}a` }, { id: `${p.id}b` }] }));
  const bank = F.withRepeats(bankOf(daily), F.addDays(FIRST, 13));
  const again = F.dailyFor(bank, F.addDays(FIRST, 13));
  assert.deepEqual([again.id, again.of, again.serial, again.parts.map((p) => p.id)], ['t-d-0007@2', 't-d-0007', 7, ['t-d-0007a@2', 't-d-0007b@2']]);
  assert.equal(F.findPuzzle(bank, 't-d-0007').puzzle.date, F.addDays(FIRST, 6));
  assert.equal(F.findPuzzle(bank, 't-d-0007b@2').puzzle.id, 't-d-0007@2');
});

test('the published site holds only puzzles and repeats through today, and says which release it is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fables-site-'));
  try {
    mkdirSync(join(dir, 'puzzles'));
    mkdirSync(join(dir, 'fables-core'));
    for (const f of ['fables.js', 'build-site.js']) writeFileSync(join(dir, 'fables-core', f), readFileSync(join(__dirname, '../fables-core', f)));
    writeFileSync(join(dir, 'index.html'), 'one');
    const daily = weeksOf(2);
    writeFileSync(join(dir, 'puzzles', 'bank.js'), `window.T_BANK = ${JSON.stringify(bankOf(daily))};`);
    const { buildSite } = siteBuilder({ root: dir, bank: 'T_BANK', files: ['index.html', 'fables-core'] });
    const out = join(dir, 'dist');
    const load = () => {
      const sandbox = {};
      new Function('window', readFileSync(join(out, 'puzzles/bank.js'), 'utf8'))(sandbox);
      return sandbox.T_BANK;
    };
    const version = () => JSON.parse(readFileSync(join(out, 'version.json'), 'utf8'));
    const early = buildSite(F.addDays(FIRST, 3), out);
    assert.deepEqual([load().daily.length, load().repeats.length, load().build], [4, 0, early.build]);
    assert.deepEqual(version(), { build: early.build, day: F.addDays(FIRST, 3) });
    assert.ok(!existsSync(join(out, 'fables-core/build-site.js')) && existsSync(join(out, 'fables-core/fables.js')));
    assert.equal(buildSite(F.addDays(FIRST, 3), out).build, early.build); // the same site, the same release
    assert.notEqual(buildSite(F.addDays(FIRST, 4), out).build, early.build);
    writeFileSync(join(dir, 'index.html'), 'two');
    assert.notEqual(buildSite(F.addDays(FIRST, 3), out).build, early.build);
    // A partial bank never invents repeats for its missing days; a later one lists those that are due.
    buildSite(F.addDays(FIRST, 15), out);
    const bank = load();
    assert.deepEqual([bank.daily.length, bank.repeats.length], [14, 2]);
    assert.equal(F.dailyFor(F.withRepeats(bank, '2030-01-01'), F.addDays(FIRST, 16)), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a puzzle keeps its version until what players see changes; moving it is not a change', () => {
  const day = (id, date, extra = {}) => ({ id, serial: 1, date, difficulty: 1, sequence: [1, 2, 3], answer: 1, ...extra });
  const v1 = F.versionPuzzles({ daily: [day('a', '2026-11-23')], unlimited: [{ id: 'u', serial: 1, concept: 'c', level: 1, text: 'x' }] });
  assert.deepEqual([v1.daily[0].puzzleVersion, v1.unlimited[0].puzzleVersion], [1, 1]);
  const moved = F.versionPuzzles({ daily: [day('a', '2027-01-04', { serial: 9, difficulty: 2 })], unlimited: v1.unlimited }, v1);
  assert.equal(moved.daily[0].puzzleVersion, 1);
  const changed = F.versionPuzzles({ daily: [day('a', '2026-11-23', { answer: 2 })], unlimited: [{ ...v1.unlimited[0], text: 'y' }] }, moved);
  assert.deepEqual([changed.daily[0].puzzleVersion, changed.unlimited[0].puzzleVersion], [2, 2]);
  assert.equal(F.versionPuzzles(changed, changed).daily[0].puzzleVersion, 2); // rebuilding changes nothing
  const counts = (p) => F.puzzleContent({ ...p, text: String(p.text).replace(/\d+/g, '#') });
  const noted = F.versionPuzzles({ unlimited: [{ ...changed.unlimited[0], text: 'took 41 steps' }] }, { unlimited: [{ ...changed.unlimited[0], text: 'took 40 steps' }] }, { content: counts });
  assert.equal(noted.unlimited[0].puzzleVersion, 2, 'counts that vary between machines are not a change');
  const parts = F.versionPuzzles({ daily: [day('s', '2026-11-23', { parts: [{ id: 's-a', text: 'p' }] })] }, { daily: [day('s', '2026-11-23', { parts: [{ id: 's-a', text: 'q' }] })] });
  assert.equal(parts.daily[0].puzzleVersion, 2);
  assert.match(F.validateBank({ daily: [day('a', '2026-11-23', { puzzleVersion: 0, capstone: false })] }, { ramp: false }).errors.join(), /puzzleVersion must be a whole number/);
});

test('the game version is the day of the change being published and which change of that day it is', () => {
  const { execFileSync } = require('node:child_process');
  const { gameVersion } = require('../fables-core/build-site.js');
  const dir = mkdtempSync(join(tmpdir(), 'fables-git-'));
  const git = (args, date) => execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' }, stdio: 'ignore' });
  try {
    git(['init', '-q', '-b', 'main']);
    assert.equal(gameVersion(dir), null);
    git(['commit', '-q', '--allow-empty', '-m', 'a'], '2026-11-25T23:30:00-06:00');
    git(['commit', '-q', '--allow-empty', '-m', 'b'], '2026-11-26T00:10:00-06:00'); // after midnight in Chicago
    assert.equal(gameVersion(dir), '2026.11.26.1');
    git(['commit', '-q', '--allow-empty', '-m', 'c'], '2026-11-26T09:00:00-06:00');
    assert.equal(gameVersion(dir), '2026.11.26.2');
    // Commits inside a merged branch don't count; the merge does.
    git(['checkout', '-q', '-b', 'side']);
    git(['commit', '-q', '--allow-empty', '-m', 'd'], '2026-11-26T10:00:00-06:00');
    git(['commit', '-q', '--allow-empty', '-m', 'e'], '2026-11-26T10:05:00-06:00');
    git(['checkout', '-q', 'main']);
    git(['merge', '-q', '--no-ff', '-m', 'merge', 'side'], '2026-11-26T11:00:00-06:00');
    assert.equal(gameVersion(dir), '2026.11.26.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
