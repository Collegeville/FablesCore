/*!
 * FablesCore: the shared framework for the Fables games.
 * © 2026 Michael A. Heroux. MIT License (code). See README.md for the game contract.
 *
 * One plain script, no build step and no modules, so a game works when its page is opened
 * straight from Finder (file://) as well as from GitHub Pages. In the browser it defines
 * window.Fables; under Node (tests) it is a CommonJS module.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fables = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '0.1.0';

  // ---------------------------------------------------------------- dates
  // Dates are ISO strings (YYYY-MM-DD). Arithmetic is done in UTC day numbers so results never
  // depend on the host time zone.

  const DAY_MS = 86400000;
  const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dayNumber(iso) {
    const m = ISO_DATE.exec(iso);
    if (!m) throw new Error(`Not an ISO date: ${iso}`);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
  }
  const fromDayNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  const isValidDate = (s) => typeof s === 'string' && ISO_DATE.test(s) && fromDayNumber(dayNumber(s)) === s;
  const addDays = (iso, days) => fromDayNumber(dayNumber(iso) + days);
  // 0 = Sunday ... 6 = Saturday. 1970-01-01 was a Thursday.
  const weekday = (iso) => (((dayNumber(iso) + 4) % 7) + 7) % 7;
  const shortDate = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

  // Today's date for the player: their own calendar day, or a named time zone if the game sets one.
  function today(now = new Date(), timeZone) {
    if (timeZone) {
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  // ---------------------------------------------------------------- weekly schedule
  // Weeks run Monday to Sunday. Monday to Saturday climb from level 1 to 6; Sunday is the capstone,
  // which mixes the week's concepts.

  function rampSlot(iso) {
    const w = weekday(iso);
    return w === 0
      ? { weekday: WEEKDAYS[w], level: null, capstone: true }
      : { weekday: WEEKDAYS[w], level: w, capstone: false };
  }
  const weekStart = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));

  // Lay out one week: the six easiest-to-hardest non-capstone puzzles on Monday to Saturday and one
  // capstone on Sunday. Used when building a bank; the returned entries carry their dates, and the
  // caller assigns serial numbers (see assignSerials).
  function planWeek(candidates, monday) {
    if (weekday(monday) !== 1) throw new Error(`planWeek needs a Monday, got ${monday}`);
    const regular = candidates.filter((p) => !p.capstone).sort((a, b) => a.difficulty - b.difficulty);
    const capstone = candidates.find((p) => p.capstone);
    if (regular.length < 6 || !capstone) throw new Error('planWeek needs six regular puzzles and one capstone');
    return [
      ...regular.slice(0, 6).map((p, i) => ({ ...p, date: addDays(monday, i), capstone: false })),
      { ...capstone, date: addDays(monday, 6), capstone: true },
    ];
  }

  // Serial numbers are explicit data, never derived from dates. This helper numbers a track's
  // entries in order once, when a bank is built; after that, numbers never change.
  function assignSerials(entries, first = 1) {
    return entries.map((p, i) => ({ ...p, serial: first + i }));
  }

  // ---------------------------------------------------------------- puzzle banks
  // A bank is { game, daily: [...], unlimited: [...] }. Every puzzle has an `id` (permanent, unique
  // across the whole bank, never reused) and a `serial` (the number players see, in sequence within
  // its track). Daily puzzles also have a `date`; unlimited puzzles have a `concept` and `level`.

  function validateBank(bank) {
    const errors = [];
    if (!bank || typeof bank !== 'object') return { ok: false, errors: ['The puzzle bank is missing.'] };
    const ids = new Map();
    const tracks = { daily: bank.daily ?? [], unlimited: bank.unlimited ?? [] };
    for (const [track, list] of Object.entries(tracks)) {
      if (!Array.isArray(list)) {
        errors.push(`${track}: must be a list`);
        continue;
      }
      const serials = new Set();
      for (const [i, p] of list.entries()) {
        const where = `${track}[${i}]`;
        if (typeof p.id !== 'string' || !p.id.trim()) errors.push(`${where}: missing id`);
        else if (ids.has(p.id)) errors.push(`${where}: id "${p.id}" is also used by ${ids.get(p.id)}`);
        else ids.set(p.id, where);
        if (!Number.isInteger(p.serial) || p.serial < 1) errors.push(`${where}: missing serial number`);
        else if (serials.has(p.serial)) errors.push(`${where}: serial ${p.serial} is used twice in ${track}`);
        else serials.add(p.serial);
        if (typeof p.difficulty !== 'number') errors.push(`${where}: missing difficulty score`);
      }
      const sorted = [...serials].sort((a, b) => a - b);
      if (sorted.some((s, i) => i > 0 && s !== sorted[i - 1] + 1)) errors.push(`${track}: serial numbers must run in sequence with no gaps`);
    }
    if (Array.isArray(tracks.daily)) validateDaily(tracks.daily, errors);
    if (Array.isArray(tracks.unlimited)) {
      for (const [i, p] of tracks.unlimited.entries()) {
        if (typeof p.concept !== 'string') errors.push(`unlimited[${i}]: missing concept`);
        if (!Number.isInteger(p.level)) errors.push(`unlimited[${i}]: missing level`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function validateDaily(daily, errors) {
    const dates = new Set();
    for (const [i, p] of daily.entries()) {
      const where = `daily[${i}]`;
      if (!isValidDate(p.date)) {
        errors.push(`${where}: missing or invalid date`);
        continue;
      }
      if (dates.has(p.date)) errors.push(`${where}: two puzzles on ${p.date}`);
      dates.add(p.date);
      const slot = rampSlot(p.date);
      if (slot.capstone && !p.capstone) errors.push(`${where}: ${p.date} is a Sunday, so it must be a capstone`);
      if (!slot.capstone && p.capstone) errors.push(`${where}: capstones belong on Sundays, not ${p.date}`);
    }
    const valid = daily.filter((p) => isValidDate(p.date) && Number.isInteger(p.serial));
    const byDate = [...valid].sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
    if (byDate.some((p, i) => i > 0 && p.serial < byDate[i - 1].serial)) errors.push('daily: serial numbers must increase with the date');
    // Within each week, Monday to Saturday must not get easier.
    const weeks = new Map();
    for (const p of byDate) {
      if (p.capstone) continue;
      const key = weekStart(p.date);
      weeks.set(key, [...(weeks.get(key) ?? []), p]);
    }
    for (const [monday, list] of weeks) {
      if (list.some((p, i) => i > 0 && p.difficulty < list[i - 1].difficulty)) {
        errors.push(`daily: the week of ${monday} gets easier before Saturday; Monday to Saturday must climb`);
      }
    }
  }

  function assertBank(bank) {
    const { ok, errors } = validateBank(bank);
    if (!ok) throw new Error(`Puzzle bank problems:\n- ${errors.join('\n- ')}`);
    return bank;
  }

  const dailyFor = (bank, date) => (bank.daily ?? []).find((p) => p.date === date) ?? null;
  const findPuzzle = (bank, id) => {
    const daily = (bank.daily ?? []).find((p) => p.id === id);
    if (daily) return { puzzle: daily, track: 'daily' };
    const unlimited = (bank.unlimited ?? []).find((p) => p.id === id);
    return unlimited ? { puzzle: unlimited, track: 'unlimited' } : null;
  };

  // ---------------------------------------------------------------- difficulty
  // A structural score is a weighted sum of a game's own inputs (line count, concepts combined, and
  // so on). Games may later correct it with real player data through `adjust`.

  function difficultyScore(inputs, weights) {
    let total = 0;
    for (const [name, weight] of Object.entries(weights)) {
      if (typeof inputs[name] !== 'number') throw new Error(`Difficulty input "${name}" is missing`);
      total += weight * inputs[name];
    }
    return Math.round(total * 100) / 100;
  }

  // `hook(score, stats)` returns the corrected score. With no hook, or too few plays, the
  // structural score stands. stats: { plays, solveRate, meanAttempts }.
  function adjustDifficulty(score, stats, hook, minPlays = 30) {
    if (!hook || !stats || stats.plays < minPlays) return score;
    return hook(score, stats);
  }

  // ---------------------------------------------------------------- unlimited mode
  // Picks from the unlimited track only. Filters by concept and level when given (null means any),
  // prefers puzzles this player has not solved, and repeats only when everything matching is solved.
  // mode 'next' takes the lowest unsolved serial; 'random' takes any unsolved match.

  function pickUnlimited(list, solvedIds, { concept = null, level = null, mode = 'next', random = Math.random } = {}) {
    const matches = list.filter((p) => (concept == null || p.concept === concept) && (level == null || p.level === level));
    if (!matches.length) return null;
    const fresh = matches.filter((p) => !solvedIds.has(p.id));
    const pool = fresh.length ? fresh : matches;
    const puzzle = mode === 'random' || !fresh.length
      ? pool[Math.floor(random() * pool.length)]
      : pool.reduce((a, b) => (b.serial < a.serial ? b : a));
    return { puzzle, repeat: !fresh.length };
  }

  // ---------------------------------------------------------------- progress and streaks
  // A record is written once per finished puzzle:
  // { id, serial, track, date, solved, attempts, maxAttempts }
  // `date` is the puzzle's date for daily puzzles, and the day it was played for unlimited ones.
  // Only daily puzzles count toward the streak; a streak day is a day whose daily puzzle was solved.

  function streakDays(records) {
    return new Set(records.filter((r) => r.track === 'daily' && r.solved).map((r) => r.date));
  }

  // Today still counts as pending, so an unplayed today does not break the streak.
  function currentStreak(records, day) {
    const days = streakDays(records);
    let d = days.has(day) ? day : addDays(day, -1);
    let n = 0;
    while (days.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  function maxStreak(records) {
    const days = [...streakDays(records)].map(dayNumber).sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return best;
  }

  function trackStats(records, track) {
    const mine = records.filter((r) => r.track === track);
    const solved = mine.filter((r) => r.solved);
    const distribution = {};
    for (const r of solved) distribution[r.attempts] = (distribution[r.attempts] ?? 0) + 1;
    return {
      played: mine.length,
      solved: solved.length,
      winRate: mine.length ? Math.round((100 * solved.length) / mine.length) : 0,
      distribution,
    };
  }

  // Local storage only: no accounts, nothing leaves the device. Keys are namespaced per game, and a
  // schema number plus migration list lets later versions change the layout without losing streaks.
  const SCHEMA = 1;

  function memoryStorage() {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
  }

  function createStore(gameId, storage, migrations = []) {
    let backing = storage;
    if (!backing) {
      try {
        backing = root.localStorage;
        backing.setItem('fables:probe', '1');
        backing.removeItem('fables:probe');
      } catch {
        backing = memoryStorage(); // private mode or blocked storage: the game still works this visit
      }
    }
    const key = (name) => `fables:${gameId}:${name}`;
    const read = (name, fallback) => {
      try {
        const raw = backing.getItem(key(name));
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    };
    const write = (name, value) => {
      try {
        backing.setItem(key(name), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    };

    // Migrations run in order from the stored schema up to the current one, before anything is read.
    const stored = read('schema', null);
    if (stored == null) write('schema', SCHEMA + migrations.length);
    else for (let v = stored; v < SCHEMA + migrations.length; v++) {
      migrations[v - SCHEMA]({ read, write });
      write('schema', v + 1);
    }

    return {
      records: () => Object.values(read('records', {})),
      record(entry) {
        const all = read('records', {});
        if (all[entry.id]) return false; // a finished puzzle is recorded once
        all[entry.id] = entry;
        return write('records', all);
      },
      solvedIds: () => new Set(Object.values(read('records', {})).filter((r) => r.solved).map((r) => r.id)),
      loadState: (id) => read(`state:${id}`, null),
      saveState: (id, state) => write(`state:${id}`, state),
      settings: () => ({ sound: false, ...read('settings', {}) }),
      saveSettings: (s) => write('settings', s),
      read,
      write,
    };
  }

  // ---------------------------------------------------------------- sharing
  // Spoiler-free by construction: the core only ever sees marks, never answers.

  const MARKS = { hit: '🟩', near: '🟨', miss: '🟥', skip: '⬜' };

  function shareText({ game, puzzle, track, rows, solved, attempts, maxAttempts, streak, url }) {
    const tag = track === 'unlimited' ? `U-${puzzle.serial}` : `#${puzzle.serial}`;
    const when = track === 'unlimited' ? 'Unlimited' : `${WEEKDAYS[weekday(puzzle.date)].slice(0, 3)} ${shortDate(puzzle.date)}`;
    const score = solved ? `${attempts}/${maxAttempts}` : `X/${maxAttempts}`;
    const parts = [`${game} ${tag}`, when, score];
    if (track === 'daily' && Number.isInteger(streak)) parts.push(`Streak ${streak}`);
    const lines = [parts.join(' · '), ...rows.map((row) => row.map((m) => MARKS[m] ?? MARKS.skip).join(''))];
    if (url) lines.push(url);
    return lines.join('\n');
  }

  // The link in a share opens the same puzzle by its permanent ID.
  function shareUrl(base, puzzle) {
    if (!base) return '';
    return `${base}${base.includes('?') ? '&' : '?'}p=${encodeURIComponent(puzzle.id)}`;
  }

  // Fills {id}, {serial} and {track} in a game's feedback address, for "Report a problem" links.
  function feedbackLink(template, puzzle, track) {
    if (!template) return '';
    const fill = { id: puzzle.id, serial: track === 'unlimited' ? `U-${puzzle.serial}` : `#${puzzle.serial}`, track };
    return template.replace(/\{(id|serial|track)\}/g, (_, k) => encodeURIComponent(fill[k]));
  }

  // Default marks: one square per attempt, in a single row.
  const defaultRows = (marks) => [marks];

  // ---------------------------------------------------------------- browser UI
  // Everything below needs a document. The page shell, the check-and-announce flow, the share box,
  // the Unlimited picker, Stats and Help all live here, so every game gets them for free.

  const doc = root.document;

  function h(tag, attrs, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  const plural = (n, word) => `${n} ${n === 1 ? word : word === 'try' ? 'tries' : `${word}s`}`;
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const tries = (n) => `${WORDS[n] ?? n} ${n === 1 ? 'try' : 'tries'}`;

  // A short two-note chime, made in the browser. Off unless the player turns sound on in Help.
  function chime() {
    try {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      const ctx = new Ctx();
      [660, 880].forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.32);
      });
    } catch {
      // No audio available; the visual and text announcement already happened.
    }
  }

  // Start a game. See README.md for the full contract. The game supplies `game` settings, a `bank`,
  // `render(puzzle, el, play)` to draw a puzzle, and `check(puzzle, answer)` returning
  // { correct, mark }. The core does the rest.
  function start(options) {
    const { game, bank, render, check } = options;
    const rowsFor = options.rows ?? defaultRows;
    const params = new URLSearchParams(root.location.search);
    const day = isValidDate(params.get('date')) ? params.get('date') : today(new Date(), game.timeZone);
    const maxAttempts = game.maxAttempts ?? 3;
    const store = createStore(game.id, undefined, options.migrations);
    const shell = mountShell(game);

    const { ok, errors } = validateBank(bank);
    if (!ok) {
      console.error('FablesCore: puzzle bank problems', errors);
      shell.main.replaceChildren(h('p', { class: 'fables-notice' }, "This game's puzzles failed their checks, so it can't start. Details are in the browser console."));
      return { store, errors };
    }

    let unlimitedFilter = { concept: null, level: null, mode: 'next' };
    let current = null; // the unlimited puzzle on screen, kept across tab switches

    // A shared link (?p=<id>) opens that puzzle once; after that the tabs behave normally.
    let linked = params.get('p') ? findPuzzle(bank, params.get('p')) : null;
    if (linked && linked.track === 'unlimited') {
      current = linked.puzzle;
      linked = null;
      if (root.location.hash !== '#unlimited') root.history.replaceState(null, '', '#unlimited');
    }

    function route() {
      const view = (root.location.hash || '#today').slice(1);
      for (const a of shell.tabs.querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.view === view);
      if (view === 'unlimited') return showUnlimited();
      if (view === 'stats') return showStats();
      if (view === 'help') return showHelp();
      return showToday();
    }

    function showToday() {
      const fromLink = linked;
      linked = null;
      const puzzle = fromLink ? fromLink.puzzle : dailyFor(bank, day);
      if (!puzzle) {
        shell.main.replaceChildren(h('section', { class: 'fables-empty' },
          h('h2', {}, 'No puzzle today'),
          h('p', {}, 'There is no daily puzzle scheduled for this date. Unlimited mode always has more.'),
          h('p', {}, h('a', { href: '#unlimited' }, 'Play Unlimited'))));
        return undefined;
      }
      const slot = rampSlot(puzzle.date);
      const label = slot.capstone ? 'Sunday capstone' : `${slot.weekday} · level ${slot.level} of 6`;
      return play(puzzle, 'daily', `#${puzzle.serial} · ${shortDate(puzzle.date)} · ${label}`);
    }

    function showUnlimited() {
      if (!current) current = pickUnlimited(bank.unlimited ?? [], store.solvedIds(), unlimitedFilter)?.puzzle ?? null;
      const concepts = [...new Set((bank.unlimited ?? []).map((p) => p.concept))];
      const levels = [...new Set((bank.unlimited ?? []).map((p) => p.level))].sort((a, b) => a - b);
      const labels = game.conceptLabels ?? {};
      const select = (name, label, values, value, text) => h('label', {}, label, ' ',
        h('select', {
          name,
          onchange: (e) => {
            const v = e.target.value;
            unlimitedFilter = { ...unlimitedFilter, [name]: v === '' ? null : name === 'level' ? Number(v) : v };
            current = null;
            showUnlimited();
          },
        }, h('option', { value: '' }, name === 'concept' ? 'Any concept' : 'Any level'),
        values.map((v) => h('option', { value: v, selected: value === v }, text(v)))));
      const picker = h('form', { class: 'fables-picker', onsubmit: (e) => e.preventDefault() },
        select('concept', 'Concept', concepts, unlimitedFilter.concept, (v) => labels[v] ?? v),
        select('level', 'Level', levels, unlimitedFilter.level, (v) => `Level ${v}`),
        h('label', {}, h('input', {
          type: 'checkbox',
          checked: unlimitedFilter.mode === 'random',
          onchange: (e) => {
            unlimitedFilter = { ...unlimitedFilter, mode: e.target.checked ? 'random' : 'next' };
            current = null;
            showUnlimited();
          },
        }), ' Random mix'));
      if (!current) {
        shell.main.replaceChildren(picker, h('p', { class: 'fables-notice' }, 'No unlimited puzzles match these choices.'));
        return;
      }
      const concept = labels[current.concept] ?? current.concept;
      play(current, 'unlimited', `U-${current.serial} · ${concept} · level ${current.level}`, picker);
    }

    function nextUnlimited() {
      const solved = store.solvedIds();
      solved.add(current.id); // never hand back the puzzle just finished
      current = pickUnlimited(bank.unlimited ?? [], solved, unlimitedFilter)?.puzzle ?? null;
      if (root.location.hash !== '#unlimited') root.location.hash = '#unlimited';
      else showUnlimited();
    }

    // One puzzle on screen: the game draws it, the core checks, records and announces.
    function play(puzzle, track, kicker, before) {
      const state = store.loadState(puzzle.id) ?? { answers: [], marks: [] };
      const area = h('div', { class: 'fables-puzzle' });
      const result = h('section', { class: 'fables-result', 'aria-label': 'Result', tabindex: '-1' });
      const head = h('header', { class: 'fables-puzzle-head' },
        h('p', { class: 'fables-kicker' }, kicker),
        puzzle.title && h('h2', {}, puzzle.title),
        h('div', { class: 'fables-pips', 'aria-hidden': 'true' },
          Array.from({ length: maxAttempts }, (_, i) => h('span', { class: `fables-pip${i < state.answers.length ? ` ${state.marks[i]}` : ''}` }))));
      shell.main.replaceChildren(...[before, head, area, result].filter(Boolean));

      const done = () => state.solved || state.answers.length >= maxAttempts;
      const draw = () => {
        area.replaceChildren();
        render(puzzle, area, {
          answers: state.answers,
          marks: state.marks,
          done: done(),
          solved: !!state.solved,
          attemptsLeft: maxAttempts - state.answers.length,
          submit,
        });
      };

      function submit(answer) {
        if (done()) return;
        const verdict = check(puzzle, answer);
        state.answers.push(answer);
        state.marks.push(verdict.mark ?? (verdict.correct ? 'hit' : 'miss'));
        if (verdict.correct) state.solved = true;
        store.saveState(puzzle.id, state);
        if (done()) {
          store.record({
            id: puzzle.id, serial: puzzle.serial, track,
            date: track === 'daily' ? puzzle.date : day,
            solved: !!state.solved, attempts: state.answers.length, maxAttempts,
          });
        }
        head.querySelectorAll('.fables-pip').forEach((pip, i) => {
          if (i < state.marks.length) pip.className = `fables-pip ${state.marks[i]}`;
        });
        draw();
        announce(true);
      }

      // `fresh` is true right after a submit: that is when the moment plays (animation, sound,
      // screen reader). Reopening a finished puzzle just shows its settled state.
      function announce(fresh) {
        result.replaceChildren();
        result.className = 'fables-result';
        if (!state.answers.length) return;
        const used = state.answers.length;
        if (!done()) {
          result.classList.add('is-miss');
          const left = maxAttempts - used;
          const text = `Not yet. ${plural(used, 'try')} used, ${plural(left, 'try')} left.`;
          result.append(h('p', { class: 'fables-verdict' }, h('span', { class: 'fables-icon', 'aria-hidden': 'true' }, '↻'), text));
          if (fresh) {
            shell.say(text);
            result.classList.add('fables-enter');
          }
          return;
        }
        result.classList.add(state.solved ? 'is-solved' : 'is-lost');
        const verdict = state.solved ? `Solved in ${tries(used)}.` : `Not solved. All ${tries(maxAttempts)} used.`;
        const streak = currentStreak(store.records(), day);
        const rows = rowsFor(state.marks, puzzle);
        const text = shareText({
          game: game.name, puzzle, track, rows, solved: !!state.solved, attempts: used, maxAttempts,
          streak: track === 'daily' && puzzle.date === day ? streak : undefined, url: shareUrl(game.url, puzzle),
        });
        const report = feedbackLink(game.feedbackUrl, puzzle, track);
        result.append(
          h('p', { class: 'fables-verdict' },
            h('span', { class: 'fables-icon', 'aria-hidden': 'true' }, state.solved ? '✓' : '✕'),
            h('span', {}, verdict)),
          track === 'daily' && state.solved && h('p', { class: 'fables-streak' }, `Streak: ${plural(streak, 'day')}`),
          puzzle.explanation && h('p', { class: 'fables-explanation' }, puzzle.explanation),
          puzzle.moral && h('p', { class: 'fables-moral' }, h('span', {}, 'Moral: '), puzzle.moral),
          shareBox(text),
          h('p', { class: 'fables-after' },
            track === 'unlimited'
              ? h('button', { type: 'button', class: 'fables-button', onclick: nextUnlimited }, 'Next puzzle')
              : h('a', { href: '#unlimited' }, 'Play more in Unlimited'),
            report && h('a', { class: 'fables-report', href: report, target: '_blank', rel: 'noopener' }, `Report a problem with ${puzzle.id}`)));
        if (fresh) {
          shell.say(`${verdict}${puzzle.moral ? ` Moral: ${puzzle.moral}` : ''}`);
          result.classList.add('fables-enter');
          if (state.solved && store.settings().sound) chime();
          result.focus({ preventScroll: true });
        }
      }

      draw();
      announce(false);
    }

    function shareBox(text) {
      const status = h('span', { class: 'fables-copied', role: 'status' });
      return h('section', { class: 'fables-share', 'aria-label': 'Share your result' },
        h('pre', { class: 'fables-share-text' }, text),
        h('div', { class: 'fables-share-buttons' },
          h('button', {
            type: 'button',
            class: 'fables-button',
            onclick: async () => {
              try {
                await root.navigator.clipboard.writeText(text);
                status.textContent = 'Copied. Paste it anywhere.';
              } catch {
                status.textContent = 'Copy did not work here. Select the text above and copy it.';
              }
            },
          }, 'Copy result'),
          root.navigator?.share && h('button', {
            type: 'button',
            class: 'fables-button secondary',
            onclick: async () => {
              try {
                await root.navigator.share({ text });
              } catch {
                // The player closed the share sheet.
              }
            },
          }, 'Share…'),
          status));
    }

    function showStats() {
      const records = store.records();
      const daily = trackStats(records, 'daily');
      const unlimited = trackStats(records, 'unlimited');
      const tile = (value, label) => h('div', { class: 'fables-tile' }, h('span', { class: 'fables-tile-value' }, String(value)), h('span', { class: 'fables-tile-label' }, label));
      const dist = (s) => {
        const max = Math.max(1, ...Object.values(s.distribution));
        return h('ol', { class: 'fables-dist', 'aria-label': 'Solved by number of tries' },
          Array.from({ length: maxAttempts }, (_, i) => {
            const n = s.distribution[i + 1] ?? 0;
            return h('li', {}, h('span', {}, String(i + 1)),
              h('span', { class: 'fables-bar', style: `width:${Math.max(4, (100 * n) / max)}%` }), h('span', {}, String(n)));
          }));
      };
      shell.main.replaceChildren(
        h('h2', {}, 'Daily'),
        h('div', { class: 'fables-tiles' },
          tile(daily.played, 'Played'), tile(`${daily.winRate}%`, 'Solved'),
          tile(currentStreak(records, day), 'Streak'), tile(maxStreak(records), 'Best streak')),
        dist(daily),
        h('h2', {}, 'Unlimited'),
        h('p', { class: 'fables-notice' }, 'Unlimited puzzles have their own numbers and never change your daily streak.'),
        h('div', { class: 'fables-tiles' }, tile(unlimited.played, 'Played'), tile(`${unlimited.winRate}%`, 'Solved')),
        dist(unlimited),
        h('p', { class: 'fables-notice' }, 'Your progress is saved on this device only. Nothing is sent anywhere.'));
    }

    function showHelp() {
      const settings = store.settings();
      shell.main.replaceChildren(
        h('section', { class: 'fables-help', html: game.help ?? '' }),
        h('section', { class: 'fables-help' },
          h('h2', {}, 'How the week works'),
          h('p', {}, 'A new daily puzzle arrives every day. They get harder from Monday to Saturday, and Sunday brings a capstone that mixes the week’s ideas. Unlimited mode has as many extra puzzles as you like, with their own numbers, and never touches your streak.'),
          h('h2', {}, 'Settings'),
          h('p', {}, h('button', {
            type: 'button',
            class: 'fables-button secondary',
            'aria-pressed': String(settings.sound),
            onclick: (e) => {
              const next = { ...store.settings(), sound: !store.settings().sound };
              store.saveSettings(next);
              e.target.setAttribute('aria-pressed', String(next.sound));
              e.target.textContent = `Sound: ${next.sound ? 'on' : 'off'}`;
              if (next.sound) chime();
            },
          }, `Sound: ${settings.sound ? 'on' : 'off'}`))));
    }

    root.addEventListener('hashchange', route);
    route();
    return { store, day };
  }

  // The page shell: header with icon and name, tabs, main area, a screen-reader live region, and
  // the standard footer. The game's color is set once here so the whole page follows it.
  function mountShell(game) {
    const body = doc.body;
    body.classList.add('fables');
    if (game.color) body.style.setProperty('--game', game.color);
    if (game.colorDark) body.style.setProperty('--game-dark', game.colorDark);
    const year = game.year ?? 2026;
    const live = h('div', { class: 'fables-sr', 'aria-live': 'polite', role: 'status' });
    const tabs = h('nav', { class: 'fables-tabs', 'aria-label': 'Sections' },
      [['today', 'Today'], ['unlimited', 'Unlimited'], ['stats', 'Stats'], ['help', 'Help']]
        .map(([view, label]) => h('a', { href: `#${view}`, 'data-view': view }, label)));
    const main = h('main', { class: 'fables-main', id: 'fables-main' });
    body.replaceChildren(
      h('header', { class: 'fables-masthead' },
        game.icon && h('img', { class: 'fables-logo', src: game.icon, alt: '', width: '40', height: '40' }),
        h('div', {}, h('h1', {}, h('a', { href: './' }, game.name)), game.tagline && h('p', { class: 'fables-tagline' }, game.tagline))),
      tabs,
      main,
      live,
      h('footer', { class: 'fables-footer' },
        h('p', {}, `© ${year} Michael A. Heroux`),
        h('p', {}, 'Code under ', h('a', { href: 'https://opensource.org/license/mit', rel: 'noopener', target: '_blank' }, 'MIT'),
          ', content under ', h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', rel: 'noopener', target: '_blank' }, 'CC BY 4.0'), '.')));
    return {
      main,
      tabs,
      // Clearing first makes screen readers announce a repeated message ("Not yet…" twice).
      say(text) {
        live.textContent = '';
        root.setTimeout(() => { live.textContent = text; }, 30);
      },
    };
  }

  return {
    VERSION,
    // dates and schedule
    dayNumber, addDays, weekday, isValidDate, today, shortDate, rampSlot, weekStart, planWeek, assignSerials,
    // banks
    validateBank, assertBank, dailyFor, findPuzzle,
    // difficulty
    difficultyScore, adjustDifficulty,
    // unlimited
    pickUnlimited,
    // progress
    createStore, memoryStorage, streakDays, currentStreak, maxStreak, trackStats,
    // sharing
    MARKS, shareText, shareUrl, feedbackLink,
    // browser
    start,
  };
});
