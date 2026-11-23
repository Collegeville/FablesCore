// Turns ExampleFables' bank into multi-part days for the browser tests.
(function () {
  const startWithIcon = window.Fables.start;
  window.Fables.start = (options) => startWithIcon({ ...options, game: { ...options.game, icon: '../../../example/icons/icon.svg' } });
  const source = window.EXAMPLE_BANK;
  const limits = [4, 2, 2];
  const labels = ['Find', 'Audit', 'Rule'];
  window.EXAMPLE_BANK = {
    ...source,
    daily: source.daily.slice(0, 7).map((day, d) => ({
      id: `set-${day.serial}`, serial: day.serial, date: day.date, difficulty: day.difficulty, capstone: day.capstone,
      parts: [0, 1, 2].map((k) => ({ ...source.unlimited[d * 3 + k], id: `set-${day.serial}${'abc'[k]}`, maxAttempts: limits[k], label: labels[k] })),
    })),
    unlimited: source.unlimited.slice(30),
  };
  window.EXAMPLE_BANK.unlimited = window.EXAMPLE_BANK.unlimited.map((p, i) => ({ ...p, serial: i + 1 }));
})();

// With ?store=legacy, plug in a store adapter that keeps everything under its own keys, the way
// DataFables will keep its existing datafables:* storage.
if (new URLSearchParams(location.search).get('store') === 'legacy') {
  const start = window.Fables.start;
  const read = (k, fallback) => JSON.parse(localStorage.getItem(`legacy:${k}`) ?? 'null') ?? fallback;
  const write = (k, v) => localStorage.setItem(`legacy:${k}`, JSON.stringify(v));
  window.Fables.start = (options) => start({
    ...options,
    store: {
      records: () => Object.values(read('records', {})),
      record(entry) {
        const all = read('records', {});
        if (all[entry.id]) return false;
        all[entry.id] = { ...entry, savedBy: 'legacy adapter' };
        write('records', all);
        return true;
      },
      solvedIds: () => new Set(Object.values(read('records', {})).filter((r) => r.solved).map((r) => r.id)),
      loadState: (id) => read(`state:${id}`, null),
      saveState: (id, state) => write(`state:${id}`, state),
      settings: () => ({ sound: false, ...read('settings', {}) }),
      saveSettings: (s) => write('settings', s),
    },
    tagRecord: () => ({ classCode: 'TEST1' }),
  });
}
