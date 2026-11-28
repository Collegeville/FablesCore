// A tiny music game for the browser tests: two daily puzzles (a melody and a rhythm) and an
// endless generated Unlimited track. The answer is stored plainly here; real games hide it.
(function () {
  const M = window.FablesMusic;
  const melody = ['C4:q D4:q E4:h | G4:q F4:q E4:h | D4:q E4:q F4:q D4:q | C4:w',
    'C4:q D4:q E4:h | G4:q A4:q E4:h | D4:q E4:q F4:q D4:q | C4:w',
    'C4:q D4:q E4:h | G4:q F4:q E4:h | D4:q E4:q F4:q D4:q | E4:w',
    'C4:q D4:q F4:h | G4:q F4:q E4:h | D4:q E4:q F4:q D4:q | C4:w'];
  const rhythm = ['x:q x:e x:e x:h | x:q r:q x:h', 'x:q x:q x:h | x:q r:q x:h', 'x:q x:e x:e x:h | x:q x:q x:h'];
  const day = (serial, date, choices, answer, extra = {}) => ({
    id: `mt-d-${serial}`, serial, date, difficulty: serial, capstone: false, maxAttempts: choices.length - 1,
    time: [4, 4], key: 'C', choices, answer, moral: 'Contour first, then intervals.', explanation: 'Each wrong choice changed one thing.', ...extra,
  });
  const bank = {
    game: 'MusicTest',
    daily: [day(1, '2026-11-23', melody, 0), day(2, '2026-11-24', rhythm, 2, { percussion: true })],
    unlimited: [],
  };
  const levelOf = (n) => ((n - 1) % 7) + 1;
  const loaded = new Map();
  const pieces = (p) => {
    if (!loaded.has(p.id)) loaded.set(p.id, p.choices.map((t) => M.decode(t, { key: M.makeKey(p.key ?? 'C'), time: p.time, tempo: 120 })));
    return loaded.get(p.id);
  };
  Fables.start({
    game: {
      id: 'musictest', name: 'MusicTest', tagline: 'Hear it, find it', color: '#15803d', colorDark: '#86efac',
      maxAttempts: 3, url: 'https://x.test/music/', weeklyRamp: false,
      levelLabels: { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday capstone' },
      help: '<h2>How to play</h2><p>Listen, then pick the score.</p>',
    },
    bank,
    unlimitedGenerator: {
      levels: [1, 2, 3, 4, 5, 6, 7], levelOf, idOf: (n) => `mt-u-${n}`,
      serialOf: (id) => (/^mt-u-(\d+)$/.exec(id) ? Number(RegExp.$1) : null),
      make: (n) => ({ id: `mt-u-${n}`, serial: n, level: levelOf(n), concept: 'melody', difficulty: 1, time: [4, 4], key: 'C', choices: melody.slice(0, 3), answer: n % 3, maxAttempts: 2 }),
    },
    render(puzzle, area, play) {
      const choices = pieces(puzzle);
      M.pickTheScore(area, {
        id: puzzle.id, choices, piece: choices[puzzle.answer], answer: puzzle.answer, play,
        percussion: !!puzzle.percussion, barsPerLine: puzzle.percussion ? 2 : undefined,
        sound: { countIn: true, tempo: 400 }, metronomeToggle: !!puzzle.percussion,
      });
    },
    check: (puzzle, answer) => (answer === puzzle.answer ? { correct: true, mark: 'hit' } : { correct: false, mark: 'miss' }),
    shareNote: (puzzle) => `🎧 ${M.listensFor(puzzle.id)}`,
  });
})();
