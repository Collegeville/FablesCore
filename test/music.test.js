'use strict';
// The music area: data model, what the ear hears, standard notation, seeded generation and the
// generate-and-check harness, the audio timeline, and the engraver (by SVG snapshot).
const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const M = require('../fables-core/music/model.js');
const { renderScore } = require('../fables-core/music/notation.js');
const { timeline, silentWav } = require('../fables-core/music/audio.js');
const F = require('../fables-core/fables.js');

const C = M.makeKey('C');
const piece = (text, time = [4, 4], key = C, tempo = 90) => M.decode(text, { key, time, tempo });

test('keys spell their scales, and degrees above and below the tonic', () => {
  const scale = (tonic, mode) => [0, 1, 2, 3, 4, 5, 6, 7].map((d) => M.degreePitch(M.makeKey(tonic, mode), d).name).join(' ');
  assert.equal(scale('C'), 'C4 D4 E4 F4 G4 A4 B4 C5');
  assert.equal(scale('D'), 'D4 E4 F#4 G4 A4 B4 C#5 D5');
  assert.equal(scale('Bb'), 'Bb3 C4 D4 Eb4 F4 G4 A4 Bb4');
  assert.equal(scale('E', 'minor'), 'E4 F#4 G4 A4 B4 C5 D5 E5');
  assert.equal(scale('C', 'minor'), 'C4 D4 Eb4 F4 G4 Ab4 Bb4 C5');
  assert.equal(M.degreePitch(M.makeKey('A', 'minor'), 6, 1).name, 'G#4', 'the raised seventh in minor');
  assert.equal(M.degreePitch(C, -1).name, 'B3');
  assert.equal(M.degreePitch(C, 3, 1).name, 'F#4');
  assert.deepEqual([M.makeKey('Eb').fifths, M.makeKey('F#', 'minor').fifths, M.keyByFifths(-1, 'minor').tonic], [-3, 3, 'D']);
  assert.equal(M.signatureAlter(M.makeKey('A'), 'G'), 1);
  assert.equal(M.signatureAlter(M.makeKey('Ab'), 'D'), -1);
  assert.equal(M.parsePitch('C4').midi, 60);
  assert.equal(M.parsePitch('Bb3').midi, 58);
  assert.equal(M.spell(61, M.makeKey('F')), 'Db4');
  assert.equal(M.spell(61, M.makeKey('D')), 'C#4');
});

test('the text form reads and writes the same piece', () => {
  const text = 'D4:q E4:e F#4:e~ F#4:h | F#4:q r:q A4:h';
  const p = piece(text, [4, 4], M.makeKey('D'));
  assert.equal(M.encode(p), text);
  assert.deepEqual(p.bars[0].map((e) => e.start), [0, 1, 1.5, 2]);
  assert.throws(() => piece('C4:z'), /Bad token/);
});

test('the audible form joins ties, drops rests, and treats a tie and a longer note alike', () => {
  const tied = piece('C4:e~ C4:e D4:h. | C4:w');
  const plain = piece('C4:q D4:h. | C4:w');
  assert.deepEqual(M.audible(tied), [[0, 1, 60], [1, 3, 62], [4, 4, 60]]);
  assert.ok(M.sameToTheEar(tied, plain));
  // A note held over the barline sounds like one long note.
  const across = piece('C4:h D4:h~ | D4:h E4:h');
  assert.deepEqual(M.audible(across)[1], [2, 4, 62]);
  // Onsets only, for a percussive click: a quarter and an eighth plus an eighth rest sound alike.
  const a = piece('x:q x:q x:h', [4, 4]);
  const b = piece('x:e r:e x:q x:h', [4, 4]);
  assert.ok(!M.sameToTheEar(a, b));
  assert.ok(M.sameToTheEar(a, b, { onsets: true }));
  assert.deepEqual(M.audible(b, { onsets: true }), [0, 1, 2]);
});

test('notes crossing a barline are split into tied notes', () => {
  const bars = M.splitBars([{ name: 'C4', midi: 60, at: 3, dur: 2 }, { rest: true, at: 5, dur: 3 }], [4, 4]);
  assert.equal(bars.length, 2);
  assert.deepEqual(bars[0].map((e) => [e.start, e.dur, e.tie]), [[3, 1, true]]);
  assert.deepEqual(bars[1].map((e) => [e.start, e.dur, e.tie ?? null]), [[0, 1, false], [1, 3, null]]);
});

test('degree shifts and transposition keep the spelling right', () => {
  const D = M.makeKey('D');
  const bar = [0, 2, 4].map((deg, i) => ({ ...M.degreePitch(D, deg), deg, start: i, dur: 1 }));
  assert.deepEqual(M.shiftDegrees(bar, D, 1).map((e) => e.name), ['E4', 'G4', 'B4']);
  const p = { key: D, time: [3, 4], bars: [bar.map((e) => ({ ...e }))] };
  const up = M.transpose(p, 2, M.makeKey('E'));
  assert.deepEqual(up.bars[0].map((e) => e.name), ['E4', 'G#4', 'B4']);
});

test('standard notation: familiar shapes pass, odd ones are named', () => {
  const ok = (text, time = [4, 4]) => assert.deepEqual(M.notationProblems(piece(text, time).bars[0], time), [], text);
  const bad = (text, time, re) => assert.match(M.notationProblems(piece(text, time).bars[0], time).join('; '), re, text);
  ok('C4:q D4:q E4:h');
  ok('C4:q. D4:e E4:h');
  ok('C4:e D4:q E4:e F4:h'); // a syncopated quarter inside the first half
  ok('C4:q D4:h E4:q'); // quarter, half, quarter
  ok('C4:h. D4:q');
  ok('C4:e. D4:s E4:q r:h');
  ok('x:q x:e x:q.', [6, 8]);
  ok('r:q. x:e x:e x:e', [6, 8]);
  ok('r:w');
  ok('r:h.', [3, 4]);
  bad('C4:h.~ C4:q', [4, 4], /tied where one whole would do/);
  bad('C4:h~ C4:q D4:q', [4, 4], /dotted half would do/);
  bad('C4:q C4:q.', [4, 4], /holds 2\.5/);
  bad('C4:q C4:h C4:q', [3, 4], /holds 4/);
  bad('C4:e D4:q. E4:h', [4, 4], /dotted quarter/);
  bad('C4:q r:h. ', [4, 4], /dotted rest/);
  bad('C4:e D4:h. E4:e', [4, 4], /dotted half off the beat/);
  ok('r:q C4:h.');
  bad('C4:q C4:q', [6, 8], /across the beat/);
  bad('C4:e C4:h C4:e', [6, 8], /half in 6\/8|across the beat/);
  bad('C4:q D4:e E4:q F4:e G4:q', [4, 4], /across the middle|holds/);
});

test('beams group eighths and sixteenths by beat, or by dotted-quarter beat in 6/8', () => {
  assert.deepEqual(M.beamGroups(piece('x:e x:e x:q x:s x:s x:e r:e x:e').bars[0], [4, 4]), [[0, 1], [3, 4, 5]]);
  assert.deepEqual(M.beamGroups(piece('x:e x:e x:e x:q.', [6, 8]).bars[0], [6, 8]), [[0, 1, 2]]);
  assert.deepEqual(M.beamGroups(piece('x:e. x:s x:q x:h').bars[0], [4, 4]), [[0, 1]]);
});

test('seeded random numbers repeat exactly for the same seed', () => {
  const a = M.rng('ear-1');
  const b = M.rng('ear-1');
  const c = M.rng('ear-2');
  const take = (r) => Array.from({ length: 5 }, () => r.next());
  const first = take(a);
  assert.deepEqual(first, take(b));
  assert.notDeepEqual(first, take(c));
  const r = M.rng('x');
  for (let i = 0; i < 200; i++) {
    const v = r.int(2, 5);
    assert.ok(v >= 2 && v <= 5 && Number.isInteger(v));
  }
  assert.equal(M.rng('w').weighted([['a', 0], ['b', 1]]), 'b');
});

test('the harness keeps the first candidate that passes every check, and says why none did', () => {
  const made = M.generate('s', (r, k) => ({ k, v: r.int(0, 9) }), { even: (c) => (c.v % 2 ? 'odd' : null) });
  assert.equal(made.v % 2, 0);
  assert.deepEqual(M.generate('s', (r, k) => ({ k, v: r.int(0, 9) }), { even: (c) => (c.v % 2 ? 'odd' : null) }), made);
  assert.throws(() => M.generate('s', () => ({}), { never: () => 'no' }, { attempts: 5 }), /never/);
});

test('the shared choice checks catch each kind of bad puzzle', () => {
  const checks = M.choiceChecks();
  const run = (c) => Object.entries(checks).map(([k, f]) => f(c) && k).filter(Boolean);
  const A = piece('C4:q D4:q E4:h | G4:w');
  const B = piece('C4:q E4:q E4:h | G4:w');
  const tiedA = piece('C4:q D4:q E4:q~ E4:q | G4:w'); // A, written with a needless tie
  const longer = piece('C4:q D4:q E4:q r:q | G4:w'); // only a length differs
  assert.deepEqual(run({ choices: [A, B], answer: 0 }), []);
  assert.deepEqual(run({ choices: [A, B], answer: 2 }), ['solvability']);
  assert.ok(run({ choices: [A, tiedA, B], answer: 0 }).includes('audible'));
  assert.ok(run({ choices: [A, tiedA, B], answer: 0 }).includes('notation'));
  assert.deepEqual(run({ choices: [A, A], answer: 0 }).sort(), ['audible', 'fair', 'visual']);
  assert.deepEqual(run({ choices: [A, longer], answer: 0 }), ['fair']);
  const perc = M.choiceChecks({ onsets: true });
  const x1 = piece('x:q x:q x:h');
  const x2 = piece('x:e r:e x:q x:h');
  assert.equal(perc.audible({ choices: [x1, x2], answer: 0 }), 'two choices sound the same');
});

test('the stored answer key hides the answer but gives it back', () => {
  for (let a = 0; a < 5; a++) {
    const stored = M.hideAnswer(a, 5, 'ef-d-0042', 'salt');
    assert.equal(M.revealAnswer(stored, 5, 'ef-d-0042', 'salt'), a);
  }
  const keys = Array.from({ length: 40 }, (_, i) => M.hideAnswer(0, 4, `x-${i}`, 'salt'));
  assert.ok(new Set(keys).size > 1, 'the same answer is stored differently from puzzle to puzzle');
});

test('a screen-reader description reads the notes, and percussion without pitch', () => {
  assert.equal(M.describe(piece('C4:q D4:q E4:h | F#4:w')),
    'two bars in C major, 4/4. bar 1: C quarter, D quarter, E half; bar 2: F sharp whole.');
  assert.equal(M.describe(piece('x:q r:q x:h', [4, 4], C), { percussion: true }),
    'one bar of rhythm in 4/4. bar 1: clap quarter, quarter rest, clap half.');
});

test('the audio timeline: intro, a count-in bar, then the notes, with ties joined', () => {
  const p = piece('C4:q D4:q E4:h~ | E4:q r:q G4:h', [4, 4], C, 120);
  const t = timeline(p, { countIn: true, intro: [{ at: 0, dur: 2, midi: [60, 64, 67] }] });
  assert.equal(t.bpm, 120);
  assert.deepEqual(t.events.filter((e) => e.kind === 'count').map((e) => e.at), [3, 4, 5, 6]);
  const notes = t.events.filter((e) => e.kind === 'note');
  assert.deepEqual(notes.map((e) => [e.at, e.dur, e.midi]), [[7, 1, 60], [8, 1, 62], [9, 3, 64], [13, 2, 67]]);
  assert.deepEqual(notes[2].events, [2, 3], 'a tied note lights both written notes');
  assert.equal(t.end, 15);
  const six = timeline(piece('x:q. x:q.', [6, 8]), { countIn: true, metronome: true });
  assert.deepEqual(six.events.filter((e) => e.kind === 'count').map((e) => e.at), [0, 1.5], '6/8 counts in two dotted-quarter beats');
  assert.ok(six.events.filter((e) => e.kind === 'click').length === 2);
  assert.match(silentWav(), /^data:audio\/wav;base64,UklGR/);
});

// ---- engraving: snapshots of the SVG for every notation feature the games use. Run with
// UPDATE_SNAPSHOTS=1 after an intended change, and look at test/music/snapshots/index.html.
const SNAP = join(__dirname, 'music', 'snapshots');
const SAMPLES = {
  'c-major-44': [piece('C4:q D4:q E4:h | F4:q E4:q D4:h | E4:e F4:e G4:e A4:e B4:q C5:q | C5:w')],
  'd-major-34-dots-ties': [piece('D4:q. E4:e F#4:q | G4:h A4:q~ | A4:q B4:e C#5:e D5:q | D5:h.', [3, 4], M.makeKey('D'))],
  'bb-major-ledger-accidentals': [piece('Bb3:q C4:q D4:e Eb4:e F4:q | F#4:q G4:q Ab4:h | A5:e G5:e F5:q D5:h | Bb4:w', [4, 4], M.makeKey('Bb'))],
  'a-minor-68': [piece('A4:e B4:e C5:e B4:q. | A4:q G#4:e A4:q. | E5:e. D5:s C5:e B4:q A4:e | A4:h.', [6, 8], M.makeKey('A', 'minor'))],
  'e-major-24-rests-sixteenths': [piece('E4:q r:q | G#4:e r:e B4:s A4:s G#4:s F#4:s | E4:h | r:h', [2, 4], M.makeKey('E'))],
  'eb-major-eight-bars': [piece('Eb4:q F4:q G4:q Ab4:q | Bb4:h G4:h | C5:q Bb4:q Ab4:q G4:q | F4:w | Eb4:q G4:q Bb4:q C5:q | D5:h Bb4:h~ | Bb4:q Ab4:q F4:q D4:q | Eb4:w', [4, 4], M.makeKey('Eb'))],
  'f-sharp-minor-stems-down': [piece('C#5:q B4:q A4:q | G#4:h. | F#4:q A4:q C#5:q | F#5:h.', [3, 4], M.makeKey('F#', 'minor'))],
  'rhythm-44': [piece('x:q x:q x:e x:e x:q | x:h r:q x:e x:e'), { percussion: true }],
  'rhythm-34-dotted-sixteenths': [piece('x:e. x:s x:q r:q | x:s x:s x:e x:h', [3, 4]), { percussion: true }],
  'rhythm-68-tie-across-bar': [piece('x:q x:e x:e x:e x:e~ | x:e x:e x:e x:q.', [6, 8]), { percussion: true }],
  'rhythm-24-whole-bar-rest': [piece('x:e x:e x:q | r:h', [2, 4]), { percussion: true }],
};

test('the engraver draws every notation feature the same way each time (snapshots)', () => {
  if (!existsSync(SNAP)) mkdirSync(SNAP, { recursive: true });
  const index = [];
  for (const [name, [p, opts]] of Object.entries(SAMPLES)) {
    for (const bar of p.bars) assert.deepEqual(M.notationProblems(bar, p.time), [], `${name} is standard notation`);
    const svg = renderScore(p, { ...opts, label: M.describe(p, opts) });
    assert.match(svg, /^<svg class="fm-score/);
    assert.ok(!/NaN|undefined/.test(svg), `${name} has no NaN or undefined`);
    const file = join(SNAP, `${name}.svg`);
    if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) writeFileSync(file, svg);
    assert.equal(svg, readFileSync(file, 'utf8'), `${name}.svg changed; run UPDATE_SNAPSHOTS=1 npm test and look at test/music/snapshots/index.html`);
    index.push(`<h2>${name}</h2>${svg}`);
  }
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(join(SNAP, 'index.html'))) {
    writeFileSync(join(SNAP, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Notation snapshots</title><body style="max-width:800px;font:14px system-ui">${index.join('\n')}</body>`);
  }
});

test('before the answer is shown, a score carries no description at all', () => {
  const svg = renderScore(SAMPLES['c-major-44'][0]);
  assert.match(svg, /aria-hidden="true"/);
  assert.ok(!/aria-label|<title|<desc/.test(svg));
});

// ---- unlimited puzzles made on demand
test('a generated Unlimited track: endless, numbered, filtered by level, and found by ID', async () => {
  const levelOf = (n) => ((n - 1) % 3) + 1;
  const gen = {
    levels: [1, 2, 3],
    levelOf,
    idOf: (n) => `g-u-${n}`,
    serialOf: (id) => (/^g-u-(\d+)$/.exec(id) ? Number(RegExp.$1) : null),
    make: (n) => ({ id: `g-u-${n}`, serial: n, level: levelOf(n), concept: 'x', difficulty: 1 }),
  };
  const bank = { game: 'G', daily: [], unlimited: [] };
  const provider = F.generatedProvider(bank, gen);
  assert.deepEqual(provider.levels(), [1, 2, 3]);
  assert.equal((await provider.unlimited({})).puzzle.id, 'g-u-1');
  assert.equal((await provider.unlimited({ level: 2 })).puzzle.id, 'g-u-2');
  assert.equal((await provider.unlimited({ level: 2, avoid: new Set(['g-u-2', 'g-u-5']) })).puzzle.id, 'g-u-8');
  assert.deepEqual(await provider.byId('g-u-500'), { puzzle: gen.make(500), track: 'unlimited' });
  assert.equal(await provider.byId('nope'), null);
});
