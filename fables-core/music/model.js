/*!
 * FablesCore music: the data model, seeded random numbers and the generate-and-check harness.
 * © 2026 Michael A. Heroux. MIT License (code).
 *
 * Plain script, no modules: in the browser it adds to window.FablesMusic; under Node it is a
 * CommonJS module. Times and durations are in quarter notes (a dotted quarter is 1.5), always
 * multiples of a sixteenth (0.25), so they are exact in floating point.
 *
 *   Note   { midi, name: 'F#4', start, dur, tie }   tie: tied to the next note (same pitch)
 *   Rest   { rest: true, start, dur }
 *   Piece  { key, time: [3, 4], tempo, bars: [[event, ...], ...] }   start is within the bar
 *   Key    { tonic: 'D', mode: 'major' | 'minor', fifths: 2 }
 *
 * A percussion piece uses notes with `name: 'x'` (no pitch); `midi` is ignored.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FablesMusic = Object.assign(root.FablesMusic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---------------------------------------------------------------- pitch and keys
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  const ACC = { '': 0, '#': 1, b: -1, '##': 2, bb: -2 };

  // Keys by their signature: fifths from -6 (six flats) to 6 (six sharps).
  const MAJOR_BY_FIFTHS = { '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#' };
  const MINOR_BY_FIFTHS = { '-6': 'Eb', '-5': 'Bb', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', 0: 'A', 1: 'E', 2: 'B', 3: 'F#', 4: 'C#', 5: 'G#', 6: 'D#' };

  function makeKey(tonic, mode = 'major') {
    const table = mode === 'minor' ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS;
    const entry = Object.entries(table).find(([, t]) => t === tonic);
    if (!entry) throw new Error(`No ${mode} key on ${tonic} with six or fewer sharps or flats`);
    return { tonic, mode, fifths: Number(entry[0]) };
  }
  const keyByFifths = (fifths, mode = 'major') => makeKey((mode === 'minor' ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS)[fifths], mode);

  // The alteration the key signature gives a letter: +1, -1 or 0.
  function signatureAlter(key, letter) {
    if (key.fifths > 0) return SHARP_ORDER.slice(0, key.fifths).includes(letter) ? 1 : 0;
    if (key.fifths < 0) return FLAT_ORDER.slice(0, -key.fifths).includes(letter) ? -1 : 0;
    return 0;
  }
  const keyName = (key) => `${key.tonic.replace('b', '♭').replace('#', '♯')} ${key.mode}`;

  // 'F#4' -> { letter: 'F', alter: 1, octave: 4, midi: 66 }
  const NAME = /^([A-G])(##|#|bb|b|)(-?\d)$/;
  function parsePitch(name) {
    const m = NAME.exec(name);
    if (!m) throw new Error(`Not a pitch: ${name}`);
    const alter = ACC[m[2]];
    const octave = Number(m[3]);
    return { letter: m[1], alter, octave, midi: 12 * (octave + 1) + LETTER_PC[m[1]] + alter };
  }
  const pitchName = (letter, alter, octave) => `${letter}${Object.keys(ACC).find((k) => ACC[k] === alter)}${octave}`;
  // Diatonic step number (C4 = 28), for staff positions and stepwise motion.
  const stepOf = (name) => { const p = parsePitch(name); return p.octave * 7 + LETTERS.indexOf(p.letter); };

  // The tonic's octave: tonics from C to F# sit in octave 4, higher ones in octave 3, so melodies
  // around the tonic stay on the treble staff.
  const tonicOctave = (key) => (LETTERS.indexOf(key.tonic[0]) <= 3 ? 4 : 3);

  // Scale degree to pitch. Degree 0 is the tonic in its home octave; 7 is an octave up, -1 the
  // leading tone below. `chroma` raises (+1) or lowers (-1) the note from the scale.
  function degreePitch(key, degree, chroma = 0) {
    const tLetter = LETTERS.indexOf(key.tonic[0]);
    const tAlter = ACC[key.tonic.slice(1)];
    const octShift = Math.floor(degree / 7);
    const d = ((degree % 7) + 7) % 7;
    const letterIdx = tLetter + d;
    const letter = LETTERS[letterIdx % 7];
    const octave = tonicOctave(key) + octShift + Math.floor(letterIdx / 7);
    const tonicMidi = 12 * (tonicOctave(key) + 1) + LETTER_PC[key.tonic[0]] + tAlter;
    const midi = tonicMidi + 12 * octShift + SCALES[key.mode][d] + chroma;
    const natural = 12 * (octave + 1) + LETTER_PC[letter];
    const alter = midi - natural;
    if (Math.abs(alter) > 2) throw new Error(`Cannot spell degree ${degree} in ${keyName(key)}`);
    return { name: pitchName(letter, alter, octave), midi };
  }

  // ---------------------------------------------------------------- durations and meters
  // Written values a single note or rest may take, in quarters.
  const VALUES = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, 'e.': 0.75, e: 0.5, s: 0.25 };
  const VALUE_NAMES = { 4: 'whole', 3: 'dotted half', 2: 'half', 1.5: 'dotted quarter', 1: 'quarter', 0.75: 'dotted eighth', 0.5: 'eighth', 0.25: 'sixteenth' };
  const codeOf = (dur) => Object.keys(VALUES).find((k) => VALUES[k] === dur);

  const barLength = (time) => (time[0] * 4) / time[1];
  const compound = (time) => time[1] === 8 && time[0] % 3 === 0;
  // The beat, in quarters: a quarter in simple meters, a dotted quarter in 6/8.
  const beatLength = (time) => (compound(time) ? 1.5 : 4 / time[1]);
  const timeName = (time) => `${time[0]}/${time[1]}`;

  // ---------------------------------------------------------------- pieces
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isRest = (e) => !!e.rest;

  // Every note with its absolute start (in quarters from the start of the piece).
  function events(piece) {
    const len = barLength(piece.time);
    return piece.bars.flatMap((bar, b) => bar.map((e) => ({ ...e, bar: b, at: b * len + e.start })));
  }

  // Puts events with absolute times into bars, splitting anything that crosses a barline into
  // tied notes (a rest is simply split).
  function splitBars(list, time) {
    const len = barLength(time);
    const total = list.reduce((end, e) => Math.max(end, e.at + e.dur), 0);
    const bars = Array.from({ length: Math.ceil(total / len - 1e-9) }, () => []);
    for (const e of list) {
      let at = e.at;
      let left = e.dur;
      while (left > 1e-9) {
        const b = Math.floor(at / len + 1e-9);
        const inBar = Math.min(left, (b + 1) * len - at);
        const piece = { ...e, start: at - b * len, dur: inBar };
        delete piece.at;
        delete piece.bar;
        if (!isRest(e)) piece.tie = inBar < left - 1e-9 ? true : !!e.tie;
        bars[b].push(piece);
        at += inBar;
        left -= inBar;
      }
    }
    return bars;
  }

  // Moves every pitched note by `degrees` steps of the key (diatonic transposition), keeping
  // chromatic notes chromatic. Needs notes with `deg` (set by degree-based generators).
  function shiftDegrees(bar, key, degrees) {
    return bar.map((e) => (isRest(e) || e.deg == null ? e : { ...e, ...degreePitch(key, e.deg + degrees, e.chroma ?? 0), deg: e.deg + degrees }));
  }

  // Transposes a whole piece by semitones into the key `toKey`, spelling each note in the new key.
  function transpose(piece, semitones, toKey) {
    const out = clone(piece);
    out.key = toKey;
    for (const bar of out.bars) {
      for (const e of bar) {
        if (isRest(e) || e.name === 'x') continue;
        if (e.deg != null) Object.assign(e, degreePitch(toKey, e.deg, e.chroma ?? 0));
        else {
          const p = parsePitch(e.name);
          e.midi = p.midi + semitones;
          e.name = spell(e.midi, toKey);
        }
      }
    }
    return out;
  }

  // The usual spelling of a MIDI pitch in a key: the scale note if there is one, otherwise a
  // raised note in sharp keys and a lowered one in flat keys.
  function spell(midi, key) {
    for (let d = -14; d <= 21; d++) {
      const p = degreePitch(key, d);
      if (p.midi === midi) return p.name;
    }
    for (let d = -14; d <= 21; d++) {
      const p = degreePitch(key, d, key.fifths < 0 ? -1 : 1);
      if (p.midi === midi) return p.name;
    }
    throw new Error(`Cannot spell ${midi}`);
  }

  // ---------------------------------------------------------------- what the ear hears
  // The canonical audible form: each sounded note as [onset, duration, midi], with tied notes
  // joined and rests gone. Two pieces sound the same exactly when these are equal. With
  // `{ onsets: true }` it is just the onset times, which is all a percussive click carries.
  function audible(piece, { onsets = false } = {}) {
    const out = [];
    let open = null;
    for (const e of events(piece)) {
      if (isRest(e)) { open = null; continue; }
      if (open && open.midi === e.midi && Math.abs(open.end - e.at) < 1e-9) {
        open.dur += e.dur;
        open.end += e.dur;
      } else {
        open = { at: e.at, dur: e.dur, end: e.at + e.dur, midi: e.name === 'x' ? 0 : e.midi };
        out.push(open);
      }
      if (!e.tie) open = null;
    }
    return onsets ? out.map((n) => n.at) : out.map((n) => [n.at, n.dur, n.midi]);
  }
  const sameToTheEar = (a, b, opts) => JSON.stringify(audible(a, opts)) === JSON.stringify(audible(b, opts));
  // What a listener can pick out: where notes start and what they are, without lengths.
  const heardShape = (piece) => audible(piece).map(([at, , midi]) => [at, midi]);

  // ---------------------------------------------------------------- standard notation
  // Whether a bar is written the standard way for its meter, so a player reads familiar shapes:
  // every value is a plain or dotted note the meter normally uses at that spot, nothing hides the
  // middle of a 4/4 bar, a rest is never dotted in simple time, and a tie inside a bar is used
  // only where one written note could not do the job. Returns a list of problems.
  function notationProblems(bar, time) {
    const problems = [];
    const len = barLength(time);
    const beat = beatLength(time);
    const total = bar.reduce((s, e) => s + e.dur, 0);
    if (Math.abs(total - len) > 1e-9) problems.push(`the bar holds ${total} quarters, not ${len}`);
    let pos = 0;
    for (const [i, e] of bar.entries()) {
      if (Math.abs(e.start - pos) > 1e-9) problems.push(`event ${i} starts at ${e.start}, not ${pos}`);
      pos = e.start + e.dur;
      if (!codeOf(e.dur)) { problems.push(`event ${i} has no written value (${e.dur})`); continue; }
      const s = e.start;
      const end = s + e.dur;
      const on = (grid) => Math.abs(s / grid - Math.round(s / grid)) < 1e-9;
      if (isRest(e)) {
        if (e.dur === len) continue; // a whole-bar rest
        if (!compound(time) && [3, 1.5, 0.75].includes(e.dur)) problems.push(`event ${i}: a dotted rest`);
        if (compound(time) && e.dur === 1.5 && !on(1.5)) problems.push(`event ${i}: a dotted-quarter rest off the beat`);
        if (e.dur >= 1 && !on(Math.min(e.dur, beat))) problems.push(`event ${i}: a ${VALUE_NAMES[e.dur]} rest off its beat`);
        if (len === 4 && e.dur === 2 && s !== 0 && s !== 2) problems.push(`event ${i}: a half rest across the middle of the bar`);
        if (compound(time) && e.dur === 1 && Math.floor(s / 1.5) !== Math.floor((end - 1e-9) / 1.5)) problems.push(`event ${i}: a rest across the beat`);
        continue;
      }
      if (compound(time)) {
        // 6/8: nothing but a dotted half or dotted quarter crosses the middle of the bar.
        const crosses = Math.floor(s / 1.5) !== Math.floor((end - 1e-9) / 1.5);
        if (crosses && !(e.dur === 3 && s === 0)) problems.push(`event ${i}: a ${VALUE_NAMES[e.dur]} across the beat`);
        if (e.dur === 1.5 && !on(1.5)) problems.push(`event ${i}: a dotted quarter off the beat`);
        if ([2, 4].includes(e.dur)) problems.push(`event ${i}: a ${VALUE_NAMES[e.dur]} in 6/8`);
      } else {
        if (e.dur === 4 && len !== 4) problems.push(`event ${i}: a whole note in ${timeName(time)}`);
        if (e.dur === 3 && !(s === 0 || (len === 4 && s === 1))) problems.push(`event ${i}: a dotted half off the beat`);
        if (e.dur === 2 && !on(1)) problems.push(`event ${i}: a half note off the beat`);
        if (e.dur === 1.5 && !(on(1) && (len !== 4 || s !== 1) && end <= len)) problems.push(`event ${i}: a dotted quarter in an unusual place`);
        if (e.dur === 1 && !on(0.5)) problems.push(`event ${i}: a quarter off the eighth-note grid`);
        if (e.dur === 1 && !on(1) && len === 4 && s === 1.5) problems.push(`event ${i}: a quarter across the middle of the bar`);
        if (e.dur === 0.75 && !on(1)) problems.push(`event ${i}: a dotted eighth off the beat`);
        if (e.dur <= 0.75 && Math.floor(s + 1e-9) !== Math.floor(end - 1e-9) && e.dur !== 0.75) problems.push(`event ${i}: a ${VALUE_NAMES[e.dur]} across the beat`);
      }
      // A tie inside the bar is fine only when no single value at that spot would say the same.
      const next = bar[i + 1];
      if (e.tie && next && !isRest(next) && next.midi === e.midi) {
        const merged = { ...e, dur: e.dur + next.dur, tie: next.tie };
        if (codeOf(merged.dur) && notationProblems([...bar.slice(0, i), merged, ...bar.slice(i + 2)].map((x, k, arr) => ({ ...x, start: arr.slice(0, k).reduce((t, y) => t + y.dur, 0) })), time).length === 0) {
          problems.push(`event ${i}: tied where one ${VALUE_NAMES[merged.dur]} would do`);
        }
      }
    }
    return problems;
  }

  // Beam groups: runs of eighths and shorter within one beat (simple time) or one dotted-quarter
  // beat (6/8). Returns arrays of event indexes, each with two or more notes.
  function beamGroups(bar, time) {
    const beat = beatLength(time);
    const groups = [];
    let cur = [];
    let curBeat = null;
    const flush = () => { if (cur.length > 1) groups.push(cur); cur = []; };
    for (const [i, e] of bar.entries()) {
      const b = Math.floor(e.start / beat + 1e-9);
      const beamable = !isRest(e) && e.dur < 1 && Math.floor((e.start + e.dur - 1e-9) / beat) === b;
      if (!beamable || b !== curBeat) flush();
      if (beamable) { cur.push(i); curBeat = b; } else curBeat = null;
    }
    flush();
    return groups;
  }

  // ---------------------------------------------------------------- compact text form
  // One token per event: pitch (or x for a click, r for a rest), a colon, the written value, and
  // ~ when tied to the next note. Bars are separated by |. "D4:q E4:e F#4:e~ | F#4:h r:q"
  function encode(piece) {
    return piece.bars.map((bar) => bar.map((e) => `${isRest(e) ? 'r' : e.name}:${codeOf(e.dur)}${e.tie ? '~' : ''}`).join(' ')).join(' | ');
  }
  function decode(text, { key, time, tempo }) {
    const bars = text.split('|').map((bt) => {
      let start = 0;
      return bt.trim().split(/\s+/).filter(Boolean).map((tok) => {
        const m = /^([^:]+):([a-z.]+)(~?)$/.exec(tok);
        if (!m || !VALUES[m[2]]) throw new Error(`Bad token: ${tok}`);
        const dur = VALUES[m[2]];
        let e;
        if (m[1] === 'r') e = { rest: true, start, dur };
        else if (m[1] === 'x') e = { name: 'x', midi: 0, start, dur, tie: !!m[3] };
        else e = { name: m[1], midi: parsePitch(m[1]).midi, start, dur, tie: !!m[3] };
        start += dur;
        return e;
      });
    });
    return { key, time, tempo, bars };
  }

  // ---------------------------------------------------------------- words, for screen readers
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  function describe(piece, { percussion = false } = {}) {
    const n = piece.bars.length;
    const head = percussion
      ? `${NUMBER_WORDS[n] ?? n} bar${n === 1 ? '' : 's'} of rhythm in ${timeName(piece.time)}`
      : `${NUMBER_WORDS[n] ?? n} bar${n === 1 ? '' : 's'} in ${keyName(piece.key)}, ${timeName(piece.time)}`;
    const bars = piece.bars.map((bar, b) => `bar ${b + 1}: ${bar.map((e) => {
      const what = isRest(e) ? `${VALUE_NAMES[e.dur]} rest` : `${percussion ? 'clap' : e.name.slice(0, -1).replace('#', ' sharp').replace(/b$/, ' flat')} ${VALUE_NAMES[e.dur]}`;
      return `${what}${e.tie ? ' tied' : ''}`;
    }).join(', ')}`);
    return `${head}. ${bars.join('; ')}.`;
  }

  // ---------------------------------------------------------------- seeded random numbers
  // mulberry32 over a string hash: the same seed text always gives the same sequence.
  function hashText(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function rng(seedText) {
    let a = hashText(String(seedText));
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    const pick = (arr) => arr[Math.floor(next() * arr.length)];
    // weighted([[value, weight], ...])
    const weighted = (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [v, w] of pairs) if ((x -= w) < 0) return v;
      return pairs[pairs.length - 1][0];
    };
    const shuffle = (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    return { next, int, pick, weighted, shuffle, chance: (p) => next() < p };
  }

  // ---------------------------------------------------------------- generate and check
  // Calls make(rng, attempt) until a candidate passes every check, each attempt with its own seed
  // derived from `seed`, so the result depends only on the seed. A check returns a problem
  // (string) or nothing. Throws, listing the problems seen, if no attempt passes.
  function generate(seed, make, checks, { attempts = 200 } = {}) {
    const seen = {};
    for (let k = 0; k < attempts; k++) {
      const candidate = make(rng(`${seed}#${k}`), k);
      if (!candidate) { seen['no candidate'] = (seen['no candidate'] ?? 0) + 1; continue; }
      const problems = [];
      for (const [name, check] of Object.entries(checks)) {
        const p = check(candidate);
        if (p) problems.push(`${name}: ${p}`);
      }
      if (!problems.length) return { ...candidate, attempt: k };
      for (const p of problems) seen[p.split(':')[0]] = (seen[p.split(':')[0]] ?? 0) + 1;
    }
    throw new Error(`No candidate for ${seed} passed its checks in ${attempts} attempts: ${JSON.stringify(seen)}`);
  }

  // The checks every pick-the-score puzzle shares: one answer, every choice sounding different
  // from every other, no two written alike, each distractor audibly different in what a listener
  // picks out, and standard notation. `opts.onsets` judges by onsets only (percussion).
  function choiceChecks({ onsets = false } = {}) {
    const ear = (p) => JSON.stringify(onsets ? audible(p, { onsets: true }) : audible(p));
    const shape = (p) => JSON.stringify(onsets ? audible(p, { onsets: true }) : heardShape(p));
    return {
      solvability: (c) => (Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.choices.length ? null : 'no single answer'),
      audible: (c) => (new Set(c.choices.map(ear)).size === c.choices.length ? null : 'two choices sound the same'),
      visual: (c) => (new Set(c.choices.map(encode)).size === c.choices.length ? null : 'two choices are written the same'),
      fair: (c) => (!c.choices[c.answer] || c.choices.every((p, i) => i === c.answer || shape(p) !== shape(c.choices[c.answer])) ? null : 'a distractor differs only in note lengths a listener cannot pick out'),
      notation: (c) => {
        for (const [i, p] of c.choices.entries()) {
          for (const [b, bar] of p.bars.entries()) {
            const probs = notationProblems(bar, p.time);
            if (probs.length) return `choice ${i}, bar ${b + 1}: ${probs[0]}`;
          }
        }
        return null;
      },
    };
  }

  // Hides which choice is right from a casual look at the puzzle file: the stored key is the
  // answer shifted by a number made from the puzzle's ID and the game's salt.
  const hideAnswer = (answer, n, id, salt) => (answer + hashText(`${salt}:${id}`)) % n;
  const revealAnswer = (keyNumber, n, id, salt) => (((keyNumber - hashText(`${salt}:${id}`)) % n) + n) % n;

  return {
    LETTERS, SCALES, VALUES, VALUE_NAMES,
    makeKey, keyByFifths, signatureAlter, keyName, parsePitch, pitchName, stepOf, degreePitch, spell,
    barLength, beatLength, compound, timeName, codeOf,
    events, splitBars, shiftDegrees, transpose, clone,
    audible, sameToTheEar, heardShape,
    notationProblems, beamGroups,
    encode, decode, describe,
    hashText, rng, generate, choiceChecks, hideAnswer, revealAnswer,
  };
});
