// Wraps ExampleFables so its puzzles come from an async provider, the way DataFables loads files.
(function () {
  const source = window.EXAMPLE_BANK;
  const wait = (v) => new Promise((resolve) => setTimeout(() => resolve(v), 40)); // like a fetch
  const days = Array.from({ length: 10 }, (_, d) => ({
    id: `pv-${d + 1}`, serial: d + 1, date: window.Fables.addDays('2026-11-23', d), difficulty: 1,
    parts: [0, 1, 2].map((k) => ({ ...source.unlimited[d * 3 + k], id: `pv-${d + 1}${'abc'[k]}`, maxAttempts: [3, 2, 2][k], label: ['Find', 'Audit', 'Rule'][k] })),
  }));
  // Unlimited: levels 1 to 3, numbered in order.
  const unlimited = source.unlimited.slice(30).map((p, i) => ({ ...p, id: `pv-u-${i + 1}`, serial: i + 1, concept: undefined }))
    .map((p) => ({ ...p, concept: 'table' }));
  const findPart = (id) => {
    for (const day of days) {
      const k = day.parts.findIndex((p) => p.id === id);
      if (k >= 0) return { puzzle: day, track: 'daily', part: k };
    }
    return null;
  };
  window.TEST_LOG = [];
  const start = window.Fables.start;
  window.Fables.start = (options) => start({
    ...options,
    bank: undefined,
    game: { ...options.game, icon: '../../../example/icons/icon.svg', weeklyRamp: new URLSearchParams(location.search).get('ramp') ? { from: new URLSearchParams(location.search).get('ramp') } : false, archive: { days: 60 }, unlimitedLevels: 'run', runLevels: { levels: 3, perLevel: 2 } },
    provider: {
      daily: (date) => { window.TEST_LOG.push(`daily ${date}`); return wait(days.find((d) => d.date === date) ?? null); },
      byId: (id) => wait(findPart(id) ?? (days.find((d) => d.id === id) && { puzzle: days.find((d) => d.id === id), track: 'daily' })
        ?? (unlimited.find((p) => p.id === id) && { puzzle: unlimited.find((p) => p.id === id), track: 'unlimited' }) ?? null),
      dates: () => wait(days.map((d) => d.date)),
      unlimited: ({ level, avoid }) => {
        window.TEST_LOG.push(`unlimited level ${level}`);
        const puzzle = unlimited.find((p) => p.level === level && !avoid.has(p.id));
        return wait(puzzle ? { puzzle } : null);
      },
    },
    intro: { today: '<h2>How to play the test</h2><p>Three parts a day.</p>', unlimited: '<p>Runs raise the level.</p>' },
    stats: ({ records, el }) => [el('h2', {}, 'Game stats'), el('p', { class: 'test-stats' }, `Records: ${records.length}`)],
    help: ({ el }) => el('section', { class: 'fables-help' }, el('h2', {}, 'Your data'), el('p', { class: 'test-help' }, 'Export and import go here.')),
    resultNote: (puzzle, { solved }) => window.Fables.el('p', { class: 'test-note' }, `${solved ? 'Got' : 'Missed'} ${puzzle.id}`),
  });
})();
