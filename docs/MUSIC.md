# Music: the shared pieces for listening games

`fables-core/music/` holds what EarFables and ClapFables share, and what a later music game (chords, intervals) can reuse. Each file is a plain script like `fables.js`: in the browser it adds to `window.FablesMusic`; under Node (tests, bank builders) it is a CommonJS module. A game that doesn't use music simply doesn't load these files.

```html
<link rel="stylesheet" href="fables-core/music/music.css">
<script src="fables-core/music/model.js" defer></script>      <!-- data model, seeded random numbers, checks -->
<script src="fables-core/music/notation.js" defer></script>   <!-- the engraver -->
<script src="fables-core/music/audio.js" defer></script>      <!-- the Web Audio engine -->
<script src="fables-core/music/choices.js" defer></script>    <!-- the pick-the-score cards -->
```

## 1. Data model (`model.js`)

Times and durations are in quarter notes (a dotted quarter is 1.5), always multiples of a sixteenth, so they are exact.

- **Note** `{ midi, name: 'F#4', start, dur, tie }`, **Rest** `{ rest: true, start, dur }`; `start` is within the bar. A percussion note is named `x`.
- **Piece** `{ key, time: [3, 4], tempo, bars: [[...], ...] }`; **Key** `{ tonic, mode, fifths }` from `makeKey('D', 'minor')` or `keyByFifths(-2)`.
- **Helpers:** `degreePitch(key, degree, chroma)` (scale degree to a spelled pitch), `shiftDegrees`, `transpose`, `spell`, `splitBars` (notes over a barline become tied notes), `beamGroups`, `notationProblems(bar, time)` (is this bar written the standard way?).
- **Text form:** `encode(piece)` and `decode(text, { key, time, tempo })`: `"D4:q E4:e F#4:e~ | F#4:h r:q"`. Banks store scores this way.
- **What the ear hears:** `audible(piece)` is the canonical audible form, `[onset, length, midi]` for each sounded note, with ties joined and rests gone. Two pieces sound the same exactly when these are equal: two tied eighths and a quarter are one sound. `audible(piece, { onsets: true })` is onsets only, which is all a click carries. `describe(piece)` reads a score in words for screen readers.

## 2. Seeded generation and checks (`model.js`)

- `rng(seedText)`: the same seed always gives the same numbers (`next`, `int`, `pick`, `weighted`, `shuffle`, `chance`).
- `generate(seed, make, checks)`: calls `make(rng)` with seeds derived from `seed` until a candidate passes every check, so a puzzle number always gives the same puzzle; throws, naming the failing checks, if none does.
- `choiceChecks({ onsets })`: the checks every pick-the-score puzzle shares. **Solvability** (one answer), **audible** (no two choices sound alike), **visual** (no two written alike), **fair** (each wrong choice differs in where notes start or what they are, not only in lengths a listener can't pick out), and **notation** (standard writing).
- `hideAnswer` and `revealAnswer`: the stored key is the answer shifted by a number made from the puzzle ID and the game's salt, so a bank file doesn't show answers at a glance. (A static site can't keep a real secret; this keeps them out of casual view.)

## 3. The engraver (`notation.js`)

`renderScore(piece, { percussion, barsPerLine, label })` returns inline SVG: treble or one-line percussion staff, clef, key and time signatures, noteheads, stems, beams (by beat, or by dotted-quarter beat in 6/8), flags, rests, dots, ties (also across line breaks), accidentals (the key signature holds until a note changes it, for the rest of the bar), ledger lines and barlines. It draws in `currentColor`, so light and dark themes follow the page. Without `label` the SVG is hidden from screen readers, so nothing gives the answer away before it is revealed.

**Why a small engraver and not VexFlow:** VexFlow (MIT) is about a megabyte with its music font, and needs the font loaded before it draws. The games use a small subset of notation, so about 300 lines that draw exactly that subset are smaller and easier to keep correct. They are covered by SVG snapshots (`test/music/snapshots/`).

## 4. The audio engine (`audio.js`)

`createEngine()` gives `unlock()`, `play(piece, { voice, countIn, intro, metronome, tempo, onNote, onEnd })`, `stop()`, `setVolume()` and `plays` (a replay counter).

- **Sounds:** synthesized only, with no sample files: a soft piano-like voice, a woodblock click, a quieter count-in tick.
- **Timing:** a lookahead scheduler hands the audio clock (`AudioContext.currentTime`) every sound due in the next 120 ms, so a busy page never makes a note late. `timeline(piece, opts)` is the plan it plays, pure and tested.
- **Unlocking:** the context is created and resumed inside a tap or key press. On iPhone, Web Audio follows the silent switch, so a looping silent `<audio>` element plays too, and the audio session is set to playback where Safari allows it. The player always shows a small hint ("No sound? … check the silent switch"), and it turns bold if the audio context does not start.

## 5. Pick the score (`choices.js`)

```js
render(puzzle, el, play) {
  FablesMusic.pickTheScore(el, { id: puzzle.id, choices, piece: choices[answer], answer, play,
    percussion, sound: { countIn: true, intro, metronome }, metronomeToggle });
}
```

- **Player:** Play/Replay, a listen counter (saved per puzzle), a volume slider, and an optional **Click the beat underneath** switch.
- **Choosing:** one card per score. Tapping a card selects it, and **Check** submits it. Outcomes follow the core's style and never rely on color alone: a red card with "✕ Not this one", and after the end a green one with "✓ The answer".
- **After the end:** every card can be heard, its score is described for screen readers, and **Show each note as it plays** lights the notes as they sound. That highlight is off by default because, before the answer, it would give the notation away. Replays after the end don't count as listens.
- **Keyboard:** Space plays or replays, 1 to 5 or the arrow keys choose, and Enter checks.
- **Layout:** two bars to a line on phones and four on wider screens, so the staff stays readable.

`FablesMusic.listensFor(id)` gives a game the count, for `resultNote` and for `shareNote`, which adds it to the share line (`🎧 2`).

## Core options the music games use

These are general, and any game can use them (see the README):

- `unlimitedGenerator` makes Unlimited puzzles on demand, without end.
- `game.levelLabels` names levels in the picker and the kicker.
- `shareNote` adds a short note to the share line.
