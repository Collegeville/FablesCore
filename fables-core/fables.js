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

  const VERSION = '0.3.1';

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

  // `ramp: false` skips the weekly-ramp rules (Sunday capstones, the Monday-to-Saturday climb),
  // for a game that has no ramp yet.
  function validateBank(bank, { ramp = true } = {}) {
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
        // A multi-part day (a set): each part is its own puzzle with its own permanent ID.
        if (p.parts !== undefined) {
          if (track !== 'daily') errors.push(`${where}: only daily puzzles can have parts`);
          if (!Array.isArray(p.parts) || !p.parts.length) errors.push(`${where}: parts must be a non-empty list`);
          else for (const [k, part] of p.parts.entries()) {
            const at = `${where}.parts[${k}]`;
            if (typeof part.id !== 'string' || !part.id.trim()) errors.push(`${at}: missing id`);
            else if (ids.has(part.id)) errors.push(`${at}: id "${part.id}" is also used by ${ids.get(part.id)}`);
            else ids.set(part.id, at);
            if (part.maxAttempts !== undefined && (!Number.isInteger(part.maxAttempts) || part.maxAttempts < 1)) errors.push(`${at}: maxAttempts must be a whole number`);
          }
        }
        if (p.maxAttempts !== undefined && (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1)) errors.push(`${where}: maxAttempts must be a whole number`);
      }
      const sorted = [...serials].sort((a, b) => a - b);
      if (sorted.some((s, i) => i > 0 && s !== sorted[i - 1] + 1)) errors.push(`${track}: serial numbers must run in sequence with no gaps`);
    }
    if (Array.isArray(tracks.daily)) validateDaily(tracks.daily, errors, ramp);
    if (Array.isArray(tracks.unlimited)) {
      for (const [i, p] of tracks.unlimited.entries()) {
        if (typeof p.concept !== 'string') errors.push(`unlimited[${i}]: missing concept`);
        if (!Number.isInteger(p.level)) errors.push(`unlimited[${i}]: missing level`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function validateDaily(daily, errors, ramp = true) {
    const dates = new Set();
    for (const [i, p] of daily.entries()) {
      const where = `daily[${i}]`;
      if (!isValidDate(p.date)) {
        errors.push(`${where}: missing or invalid date`);
        continue;
      }
      if (dates.has(p.date)) errors.push(`${where}: two puzzles on ${p.date}`);
      dates.add(p.date);
      if (!ramp) continue;
      const slot = rampSlot(p.date);
      if (slot.capstone && !p.capstone) errors.push(`${where}: ${p.date} is a Sunday, so it must be a capstone`);
      if (!slot.capstone && p.capstone) errors.push(`${where}: capstones belong on Sundays, not ${p.date}`);
    }
    if (!ramp) return;
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
  // Letters for the parts of a multi-part day: a, b, c, ...
  const partLetter = (k) => String.fromCharCode(97 + k);

  const findPuzzle = (bank, id) => {
    const daily = (bank.daily ?? []).find((p) => p.id === id);
    if (daily) return { puzzle: daily, track: 'daily' };
    for (const p of bank.daily ?? []) {
      const k = (p.parts ?? []).findIndex((part) => part.id === id);
      if (k >= 0) return { puzzle: p, track: 'daily', part: k };
    }
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

  // Unlimited runs: solves in a row, in the order played. A miss starts a new run.
  function unlimitedRuns(records) {
    const list = records.filter((r) => r.track === 'unlimited').sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
    let current = 0;
    let best = 0;
    for (const r of list) {
      current = r.solved ? current + 1 : 0;
      best = Math.max(best, current);
    }
    return { current, best, played: list.length };
  }

  // For games whose Unlimited level rises with the run: every `perLevel` solves goes up a level.
  const levelForRun = (run, { levels = 5, perLevel = 3 } = {}) => Math.min(levels, 1 + Math.floor(run / perLevel));

  // The puzzle provider: how the core gets puzzles. A game with all its puzzles in one bank needs
  // nothing more; a game that loads puzzles from files day by day (DataFables) supplies its own
  // provider with the same async methods.
  function bankProvider(bank) {
    const unlimited = bank.unlimited ?? [];
    return {
      daily: async (date) => dailyFor(bank, date),
      byId: async (id) => findPuzzle(bank, id),
      dates: async () => (bank.daily ?? []).map((p) => p.date),
      concepts: () => [...new Set(unlimited.map((p) => p.concept))],
      levels: () => [...new Set(unlimited.map((p) => p.level))].sort((a, b) => a - b),
      // { concept, level, mode, avoid } -> { puzzle, notice? } or null. `avoid` holds IDs to skip
      // if possible: solved ones in the picker, played ones in a run.
      async unlimited({ concept = null, level = null, mode = 'next', avoid = new Set() }) {
        const pick = pickUnlimited(unlimited, avoid, { concept, level, mode });
        if (pick && !pick.repeat) return { puzzle: pick.puzzle };
        if (level != null && concept == null) {
          const any = pickUnlimited(unlimited, avoid, { mode });
          if (any && !any.repeat) return { puzzle: any.puzzle, notice: `Level ${level} is used up for now, so this one is level ${any.puzzle.level}.` };
        }
        return pick ? { puzzle: pick.puzzle, notice: 'You have played every puzzle that matches, so this is a repeat.' } : null;
      },
    };
  }

  // ---------------------------------------------------------------- progress and streaks
  // A record is written once per finished puzzle:
  // { id, serial, track, date, onTime, solved, attempts, maxAttempts }
  // plus, for one part of a multi-part day: { set: the day's id, part: 'a', parts: how many }
  // `date` is the puzzle's date for daily puzzles, and the day it was played for unlimited ones.
  // `onTime` is false when a daily puzzle was played on a later day (from a shared link).
  // Only daily puzzles count toward the streak. A streak day is a day whose daily puzzle was
  // finished on that day, solved or not: showing up and working the puzzle is what counts. For a
  // multi-part day, every part must be finished.

  function streakDays(records) {
    const days = new Set();
    const sets = new Map();
    for (const r of records) {
      if (r.track !== 'daily' || r.onTime === false) continue;
      if (!r.set) {
        days.add(r.date);
        continue;
      }
      const entry = sets.get(r.set) ?? { date: r.date, parts: r.parts, done: new Set() };
      entry.done.add(r.part);
      sets.set(r.set, entry);
    }
    for (const s of sets.values()) if (s.done.size >= s.parts) days.add(s.date);
    return days;
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

  // Daily totals count puzzles played on their own day; archive practice builds skill but, like
  // the streak, is not counted here.
  function trackStats(records, track) {
    const mine = records.filter((r) => r.track === track && (track !== 'daily' || r.onTime !== false));
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

  // The pieces of a shared result, used by both the text and the picture.
  function shareParts({ game, puzzle, track, rows, solved, attempts, maxAttempts, streak, url, score }) {
    return {
      game,
      tag: track === 'unlimited' ? `U-${puzzle.serial}` : `#${puzzle.serial}`,
      when: track === 'unlimited' ? 'Unlimited' : `${WEEKDAYS[weekday(puzzle.date)].slice(0, 3)} ${shortDate(puzzle.date)}`,
      score: score ?? (solved ? `${attempts}/${maxAttempts}` : `X/${maxAttempts}`),
      solved: !!solved,
      streak: track === 'daily' && Number.isInteger(streak) ? streak : null,
      rows: rows.map((row) => row.map((m) => (MARKS[m] ? m : 'skip'))),
      url: url || '',
    };
  }

  function shareText(opts) {
    const p = shareParts(opts);
    const head = [`${p.game} ${p.tag}`, p.when, p.score];
    if (p.streak != null) head.push(`Streak ${p.streak}`);
    const lines = [head.join(' · '), ...p.rows.map((row) => row.map((m) => MARKS[m]).join(''))];
    if (p.url) lines.push(p.url);
    return lines.join('\n');
  }

  // The picture: a 1200 x 630 card (the shape link previews use) drawn from the same pieces as
  // the text, so it is just as spoiler-free. Shapes and text only, no photos.
  const CARD = { width: 1200, height: 630 };
  const CARD_COLORS = { hit: '#16a34a', near: '#eab308', miss: '#dc2626', skip: '#cbd5e1' };

  function drawShareCard(canvas, parts, color = '#0e7c86') {
    canvas.width = CARD.width;
    canvas.height = CARD.height;
    const c = canvas.getContext('2d');
    const serif = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
    const sans = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    c.fillStyle = color;
    c.fillRect(0, 0, CARD.width, CARD.height);
    const round = (x, y, w, hgt, r) => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + hgt, r);
      c.arcTo(x + w, y + hgt, x, y + hgt, r);
      c.arcTo(x, y + hgt, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    };
    c.fillStyle = '#faf7f0';
    round(40, 40, CARD.width - 80, CARD.height - 80, 28);
    c.fill();
    c.fillStyle = '#1f2a37';
    c.font = `700 64px ${serif}`;
    c.fillText(parts.game, 90, 140);
    c.fillStyle = '#5b6573';
    c.font = `500 34px ${sans}`;
    c.fillText(`${parts.tag} · ${parts.when}`, 90, 192);
    c.fillStyle = parts.solved ? CARD_COLORS.hit : '#b42318';
    c.font = `700 120px ${serif}`;
    c.fillText(parts.score, 90, 360);
    // Squares shrink to fit when a game has many tries per row.
    const longest = Math.max(1, ...parts.rows.map((row) => row.length));
    const gap = 14;
    const size = Math.min(64, Math.floor((CARD.width - 90 - 470) / longest) - gap);
    parts.rows.forEach((row, r) => row.forEach((m, i) => {
      c.fillStyle = CARD_COLORS[m];
      round(470 + i * (size + gap), 282 + r * (size + gap), size, size, 10);
      c.fill();
    }));
    c.fillStyle = '#1f2a37';
    c.font = `600 36px ${sans}`;
    if (parts.streak != null) c.fillText(`Streak: ${parts.streak} ${parts.streak === 1 ? 'day' : 'days'}`, 90, 470);
    c.fillStyle = '#5b6573';
    c.font = `400 26px ${sans}`;
    if (parts.url) c.fillText(parts.url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''), 90, 540);
    return canvas;
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
    const { game, render, check } = options;
    const bank = options.bank ?? null;
    const rowsFor = options.rows ?? defaultRows;
    const params = new URLSearchParams(root.location.search);
    const day = isValidDate(params.get('date')) ? params.get('date') : today(new Date(), game.timeZone);
    const maxAttempts = game.maxAttempts ?? 3;
    const ramp = game.weeklyRamp !== false;
    const runMode = game.unlimitedLevels === 'run';
    // A game may plug in its own storage (see README, "Store adapter"); otherwise the core's.
    const store = options.store ?? createStore(game.id, undefined, options.migrations);
    const shell = mountShell(game);
    const provider = options.provider ?? bankProvider(bank ?? {});
    const ctx = () => ({ store, records: store.records(), day, el: h });

    const refuse = (errors) => {
      console.error('FablesCore: puzzle problems', errors);
      shell.main.replaceChildren(h('p', { class: 'fables-notice' }, "This game's puzzles failed their checks, so it can't start. Details are in the browser console."));
    };
    if (bank) {
      const { ok, errors } = validateBank(bank, { ramp });
      if (!ok) {
        refuse(errors);
        return { store, errors };
      }
    }
    // Puzzles from a provider are checked one at a time as they load.
    const checkOne = (puzzle, track) => {
      if (bank || !puzzle) return true;
      const { ok, errors } = validateBank({ [track]: [puzzle] }, { ramp });
      if (!ok) refuse(errors);
      return ok;
    };

    let unlimitedFilter = { concept: null, level: null, mode: 'next' };
    let current = null; // the unlimited puzzle on screen, kept across tab switches
    let unlimitedNotice = null;
    let viewingPart = params.get('t') ? params.get('t').charCodeAt(0) - 97 : null;
    let linkedId = params.get('p'); // a shared link (?p=<id>) opens that puzzle once
    const archiveDate = game.archive && isValidDate(params.get('archive')) && dayNumber(params.get('archive')) < dayNumber(day)
      ? params.get('archive') : null;
    let nav = 0; // bumped on every route, so a slow load never draws over a newer view

    if (game.archive) {
      shell.tabs.querySelector('[data-view="unlimited"]').after(h('a', { href: '#archive', 'data-view': 'archive' }, 'Archive'));
    }

    async function route() {
      const token = ++nav;
      let view = (root.location.hash || '#today').slice(1);
      if (linkedId) {
        const found = await provider.byId(linkedId);
        if (token !== nav) return;
        linkedId = null;
        if (found?.track === 'unlimited') {
          current = found.puzzle;
          if (view !== 'unlimited') root.history.replaceState(null, '', '#unlimited');
          view = 'unlimited';
        } else if (found) {
          if (found.part !== undefined) viewingPart = found.part;
          linkedDaily = found.puzzle;
        }
      }
      for (const a of shell.tabs.querySelectorAll('a')) {
        // In archive practice the Archive tab is the current one, not Today.
        const shown = view === 'today' && archiveDate ? 'archive' : view;
        a.toggleAttribute('aria-current', a.dataset.view === shown);
      }
      // In archive practice, Today goes back to the real today.
      const todayTab = shell.tabs.querySelector('[data-view="today"]');
      if (archiveDate) {
        const url = new URL(root.location.href);
        for (const key of ['archive', 't', 'p']) url.searchParams.delete(key);
        url.hash = '';
        todayTab.href = url.href;
      }
      if (view === 'unlimited') return showUnlimited(token);
      if (view === 'archive' && game.archive) return showArchive(token);
      if (view === 'stats') return showStats();
      if (view === 'help') return showHelp();
      return showToday(token);
    }
    let linkedDaily = null;

    // A first-visit card for a tab, shown once with a "Got it" button.
    function intro(tab) {
      const content = options.intro?.[tab];
      if (!content || store.loadState(`__intro:${tab}`)) return null;
      const card = h('section', { class: 'fables-intro', 'aria-label': 'How to play' },
        typeof content === 'string' ? h('div', { html: content }) : content,
        h('button', {
          type: 'button',
          class: 'fables-button secondary',
          onclick: () => {
            store.saveState(`__intro:${tab}`, true);
            card.remove();
          },
        }, 'Got it'));
      return card;
    }

    const loading = () => shell.main.replaceChildren(h('p', { class: 'fables-notice' }, 'Loading…'));

    async function showToday(token) {
      const date = archiveDate ?? day;
      let puzzle = linkedDaily;
      linkedDaily = null;
      if (!puzzle) {
        loading();
        puzzle = await provider.daily(date);
        if (token !== nav) return undefined;
      }
      if (!checkOne(puzzle, 'daily')) return undefined;
      if (!puzzle) {
        shell.main.replaceChildren(h('section', { class: 'fables-empty' },
          h('h2', {}, archiveDate ? 'No puzzle that day' : 'No puzzle today'),
          h('p', {}, 'There is no daily puzzle for this date. Unlimited mode always has more.'),
          h('p', {}, h('a', { href: '#unlimited' }, 'Play Unlimited'))));
        return undefined;
      }
      const slot = rampSlot(puzzle.date);
      const label = !ramp ? WEEKDAYS[weekday(puzzle.date)] : slot.capstone ? 'Sunday capstone' : `${slot.weekday} · level ${slot.level} of 6`;
      const practice = puzzle.date !== day && h('p', { class: 'fables-practice' },
        `Practice: ${shortDate(puzzle.date)} is from the archive, so it doesn't change your streak. `,
        h('a', { href: shell.tabs.querySelector('[data-view="today"]').href }, 'Back to today'));
      const before = [intro('today'), practice].filter(Boolean);
      if (puzzle.parts) return showParts(puzzle, label, before);
      return play(puzzle, 'daily', `#${puzzle.serial} · ${shortDate(puzzle.date)} · ${label}`, before);
    }

    // ---- multi-part days: parts are played in order, each unlocking when the one before is done.
    const partDone = (part) => store.records().find((r) => r.id === part.id) ?? null;

    function partSteps(set) {
      const done = set.parts.map(partDone);
      const firstOpen = done.findIndex((d) => !d);
      return set.parts.map((part, k) => {
        let state = 'locked';
        if (done[k]) state = done[k].solved ? 'solved' : 'missed';
        else if (k === firstOpen) state = 'current';
        return { part, k, letter: partLetter(k), state, open: state !== 'locked' };
      });
    }

    function showParts(set, label, before = []) {
      const steps = partSteps(set);
      const open = steps.filter((s) => s.open).map((s) => s.k);
      const firstUnfinished = steps.find((s) => s.state === 'current');
      const k = open.includes(viewingPart) ? viewingPart : firstUnfinished ? firstUnfinished.k : set.parts.length - 1;
      viewingPart = k;
      const navEl = stepsNav(set, k);
      const part = set.parts[k];
      const kicker = `#${set.serial}${partLetter(k)} · ${shortDate(set.date)}${part.label ? ` · ${part.label}` : ''} · ${label}`;
      return play(part, 'daily', kicker, [...before, navEl], { set, k, nav: navEl, label, before });
    }

    function stepsNav(set, k) {
      const GLYPH = { solved: '✓', missed: '✕', current: '•', locked: '' };
      const STATE = { solved: 'solved', missed: 'missed', current: 'playing now', locked: 'locked until the one before is done' };
      return h('ol', { class: 'fables-steps', 'aria-label': `#${set.serial} parts` }, partSteps(set).map((st) => h('li', {},
        h('button', {
          type: 'button',
          class: `fables-step ${st.state}${st.k === k ? ' viewing' : ''}`,
          disabled: !st.open,
          'aria-current': st.k === k ? 'step' : null,
          'aria-label': `Part ${st.letter}${st.part.label ? `, ${st.part.label}` : ''}: ${STATE[st.state]}`,
          onclick: () => {
            viewingPart = st.k;
            linkedDaily = set;
            showToday(++nav);
          },
        }, h('span', { class: 'fables-step-letter' }, st.letter), h('span', { 'aria-hidden': 'true' }, GLYPH[st.state])))));
    }

    // ---- Unlimited
    const CURRENT_KEY = '__unlimited:current';
    const finishedIds = () => new Set(store.records().filter((r) => r.track === 'unlimited').map((r) => r.id));

    async function chooseUnlimited() {
      // Resume a puzzle that was started and not finished.
      const saved = store.loadState(CURRENT_KEY);
      if (saved && !finishedIds().has(saved)) {
        const found = await provider.byId(saved);
        if (found?.track === 'unlimited') return { puzzle: found.puzzle };
      }
      if (runMode) {
        const level = levelForRun(unlimitedRuns(store.records()).current, game.runLevels);
        return provider.unlimited({ level, mode: 'next', avoid: finishedIds() });
      }
      return provider.unlimited({ ...unlimitedFilter, avoid: store.solvedIds() });
    }

    async function showUnlimited(token) {
      if (!current) {
        loading();
        const pick = await chooseUnlimited();
        if (token !== nav) return;
        current = pick?.puzzle ?? null;
        unlimitedNotice = pick?.notice ?? null;
        if (current) store.saveState(CURRENT_KEY, current.id);
      }
      if (!checkOne(current, 'unlimited')) return;
      const labels = game.conceptLabels ?? {};
      let header;
      if (runMode) {
        const r = unlimitedRuns(store.records());
        const level = levelForRun(r.current, game.runLevels);
        header = h('div', { class: 'fables-picker fables-run' },
          h('p', {}, h('strong', {}, `Run ${r.current}`), ` · best ${r.best} · level ${level} of ${game.runLevels?.levels ?? 5}. `,
            'Unlimited runs are separate from your daily streak.'),
          unlimitedNotice && h('p', { class: 'fables-notice' }, unlimitedNotice));
      } else {
        const select = (name, label, values, value, text) => h('label', {}, label, ' ',
          h('select', {
            name,
            onchange: (e) => {
              const v = e.target.value;
              unlimitedFilter = { ...unlimitedFilter, [name]: v === '' ? null : name === 'level' ? Number(v) : v };
              current = null;
              store.saveState(CURRENT_KEY, null); // a new choice starts fresh rather than resuming
              showUnlimited(++nav);
            },
          }, h('option', { value: '' }, name === 'concept' ? 'Any concept' : 'Any level'),
          values.map((v) => h('option', { value: v, selected: value === v }, text(v)))));
        header = h('form', { class: 'fables-picker', onsubmit: (e) => e.preventDefault() },
          select('concept', 'Concept', provider.concepts?.() ?? [], unlimitedFilter.concept, (v) => labels[v] ?? v),
          select('level', 'Level', provider.levels?.() ?? [], unlimitedFilter.level, (v) => `Level ${v}`),
          h('label', {}, h('input', {
            type: 'checkbox',
            checked: unlimitedFilter.mode === 'random',
            onchange: (e) => {
              unlimitedFilter = { ...unlimitedFilter, mode: e.target.checked ? 'random' : 'next' };
              current = null;
              store.saveState(CURRENT_KEY, null);
              showUnlimited(++nav);
            },
          }), ' Random mix'),
          unlimitedNotice && h('p', { class: 'fables-notice' }, unlimitedNotice));
      }
      if (!current) {
        shell.main.replaceChildren(...[intro('unlimited'), header, h('p', { class: 'fables-notice' }, runMode
          ? "You've played every Unlimited puzzle there is. New ones arrive with the next update."
          : 'No unlimited puzzles match these choices.')].filter(Boolean));
        return;
      }
      const concept = current.concept ? `${labels[current.concept] ?? current.concept} · ` : '';
      play(current, 'unlimited', `U-${current.serial} · ${concept}level ${current.level}`, [intro('unlimited'), header].filter(Boolean));
    }

    function nextUnlimited() {
      current = null;
      store.saveState(CURRENT_KEY, null);
      if (root.location.hash !== '#unlimited') root.location.hash = '#unlimited';
      else showUnlimited(++nav);
      root.scrollTo({ top: 0 });
    }

    // ---- Archive: past days, played as practice.
    async function showArchive(token) {
      loading();
      const all = await provider.dates();
      if (token !== nav) return;
      const days = game.archive.days ?? 60;
      const past = [...new Set(all)].filter((d) => dayNumber(d) < dayNumber(day)).sort((a, b) => dayNumber(b) - dayNumber(a)).slice(0, days);
      const records = store.records().filter((r) => r.track === 'daily');
      const statusOf = (d) => {
        const mine = records.filter((r) => r.date === d);
        if (!mine.length) return { text: 'Not played', cls: 'unplayed' };
        const parts = mine[0].parts;
        const solved = mine.filter((r) => r.solved).length;
        if (parts && mine.length < parts) return { text: `${mine.length} of ${parts} played`, cls: 'progress' };
        if (parts) return { text: `Played · ${solved} of ${parts} solved`, cls: solved ? 'won' : 'lost' };
        return mine[0].solved ? { text: `Solved in ${mine[0].attempts}`, cls: 'won' } : { text: 'Missed', cls: 'lost' };
      };
      const link = (d) => {
        const url = new URL(root.location.href);
        url.searchParams.set('archive', d);
        url.searchParams.delete('p');
        url.searchParams.delete('t');
        url.hash = '';
        return url.href;
      };
      shell.main.replaceChildren(
        h('h2', {}, 'Archive'),
        h('p', { class: 'fables-notice' }, 'Past puzzles are practice. They build skill but never change your streak.'),
        past.length
          ? h('ol', { class: 'fables-archive' }, past.map((d) => {
            const s = statusOf(d);
            return h('li', {}, h('a', { href: link(d) }, h('span', {}, `${WEEKDAYS[weekday(d)].slice(0, 3)} ${shortDate(d)}`), h('span', { class: `fables-status ${s.cls}` }, s.text)));
          }))
          : h('p', { class: 'fables-notice' }, 'No past puzzles yet.'));
    }

    // One puzzle on screen: the game draws it, the core checks, records and announces.
    // `inSet` is { set, k } when this puzzle is part k of a multi-part day.
    function play(puzzle, track, kicker, before, inSet) {
      const maxAttempts = puzzle.maxAttempts ?? options.game.maxAttempts ?? 3; // per puzzle, else the game's
      const state = store.loadState(puzzle.id) ?? { answers: [], marks: [] };
      const day0 = inSet ? inSet.set : puzzle; // the daily entry that carries the date and number
      const area = h('div', { class: 'fables-puzzle' });
      const result = h('section', { class: 'fables-result', 'aria-label': 'Result', tabindex: '-1' });
      const head = h('header', { class: 'fables-puzzle-head' },
        h('p', { class: 'fables-kicker' }, kicker),
        puzzle.title && h('h2', {}, puzzle.title),
        h('div', { class: 'fables-pips', 'aria-hidden': 'true' },
          Array.from({ length: maxAttempts }, (_, i) => h('span', { class: `fables-pip${i < state.answers.length ? ` ${state.marks[i]}` : ''}` }))));
      shell.main.replaceChildren(...[...[].concat(before ?? []), head, area, result].filter(Boolean));

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
            id: puzzle.id, serial: day0.serial, track,
            date: track === 'daily' ? day0.date : day,
            onTime: track === 'daily' ? day0.date === day : undefined,
            solved: !!state.solved, attempts: state.answers.length, maxAttempts, at: new Date().toISOString(),
            ...(inSet && { set: inSet.set.id, part: partLetter(inSet.k), parts: inSet.set.parts.length }),
            ...(options.tagRecord && options.tagRecord()),
          });
          // Redraw the a/b/c steps so the next part unlocks.
          if (inSet) {
            const navEl = stepsNav(inSet.set, inSet.k);
            inSet.nav.replaceWith(navEl);
            inSet.nav = navEl;
          }
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
        const onTime = track === 'daily' && day0.date === day;
        // A multi-part day is shared once, after its last part; until then, point to the next part.
        const setDone = inSet ? inSet.set.parts.every(partDone) : true;
        const nextPart = inSet && !setDone ? inSet.set.parts.findIndex((part) => !partDone(part)) : -1;
        let share = null;
        if (setDone) {
          const shareInput = inSet
            ? (() => {
              const finished = inSet.set.parts.map(partDone);
              const solvedParts = finished.filter((r) => r.solved).length;
              return {
                game: game.name, puzzle: inSet.set, track,
                rows: inSet.set.parts.map((part) => store.loadState(part.id)?.marks ?? []),
                solved: solvedParts > 0, score: `${solvedParts}/${inSet.set.parts.length}`,
                streak: onTime ? streak : undefined, url: shareUrl(game.url, inSet.set),
              };
            })()
            : {
              game: game.name, puzzle, track, rows: rowsFor(state.marks, puzzle), solved: !!state.solved, attempts: used, maxAttempts,
              streak: onTime ? streak : undefined, url: shareUrl(game.url, puzzle),
            };
          share = shareBox(shareText(shareInput), shareParts(shareInput), `${game.id}-${track === 'unlimited' ? 'U' : ''}${day0.serial}.png`);
        }
        const reportTarget = inSet ? { id: puzzle.id, serial: `${inSet.set.serial}${partLetter(inSet.k)}` } : puzzle;
        const report = feedbackLink(game.feedbackUrl, reportTarget, track);
        // DOM append writes false and null as text, so drop the optional pieces that are absent.
        result.append(...[
          h('p', { class: 'fables-verdict' },
            h('span', { class: 'fables-icon', 'aria-hidden': 'true' }, state.solved ? '✓' : '✕'),
            h('span', {}, verdict)),
          ...[].concat(options.resultNote?.(puzzle, { solved: !!state.solved, track, set: inSet?.set ?? null }) ?? []),
          onTime && setDone && h('p', { class: 'fables-streak' }, `Streak: ${plural(streak, 'day')}`),
          puzzle.explanation && h('p', { class: 'fables-explanation' }, puzzle.explanation),
          puzzle.moral && h('p', { class: 'fables-moral' }, h('span', {}, 'Moral: '), puzzle.moral),
          nextPart >= 0 && h('p', { class: 'fables-after' }, h('button', {
            type: 'button',
            class: 'fables-button',
            onclick: () => {
              viewingPart = nextPart;
              linkedDaily = inSet.set;
              showToday(++nav);
              root.scrollTo({ top: 0 });
            },
          }, `Next: part ${partLetter(nextPart)}${inSet.set.parts[nextPart].label ? `, ${inSet.set.parts[nextPart].label}` : ''} →`)),
          share,
          h('p', { class: 'fables-after' },
            track === 'unlimited'
              ? h('button', { type: 'button', class: 'fables-button', onclick: nextUnlimited }, 'Next puzzle')
              : setDone && h('a', { href: '#unlimited' }, 'Play more in Unlimited'),
            report && h('a', { class: 'fables-report', href: report, target: '_blank', rel: 'noopener' }, `Report a problem with ${reportTarget.id}`)),
        ].filter(Boolean));
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

    function shareBox(text, parts, filename) {
      const cardColor = getComputedStyle(doc.body).getPropertyValue('--game').trim() || game.color;
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
          h('button', {
            type: 'button',
            class: 'fables-button secondary',
            onclick: () => {
              const canvas = drawShareCard(doc.createElement('canvas'), parts, game.color || cardColor);
              canvas.toBlob(async (blob) => {
                const file = new root.File([blob], filename, { type: 'image/png' });
                // Phones can share the picture straight to an app; elsewhere it downloads.
                if (root.navigator.canShare?.({ files: [file] })) {
                  try {
                    await root.navigator.share({ files: [file] });
                    return;
                  } catch {
                    // Closed the share sheet; fall back to saving.
                  }
                }
                const link = h('a', { href: root.URL.createObjectURL(blob), download: filename });
                doc.body.append(link);
                link.click();
                link.remove();
                status.textContent = 'Picture saved.';
              }, 'image/png');
            },
          }, 'Save picture'),
          status));
    }

    // The longest guess limit, for the Stats chart: from the bank, or what the player has met.
    const mostAttempts = () => Math.max(maxAttempts,
      ...(bank ? [...(bank.daily ?? []), ...(bank.unlimited ?? [])].flatMap((p) => [p, ...(p.parts ?? [])]).map((p) => p.maxAttempts ?? 0) : []),
      ...store.records().map((r) => r.maxAttempts ?? 0));

    function showStats() {
      const records = store.records();
      const daily = trackStats(records, 'daily');
      const unlimited = trackStats(records, 'unlimited');
      const runs = unlimitedRuns(records);
      const longest = mostAttempts();
      const tile = (value, label) => h('div', { class: 'fables-tile' }, h('span', { class: 'fables-tile-value' }, String(value)), h('span', { class: 'fables-tile-label' }, label));
      const dist = (s) => {
        const max = Math.max(1, ...Object.values(s.distribution));
        return h('ol', { class: 'fables-dist', 'aria-label': 'Solved by number of tries' },
          Array.from({ length: longest }, (_, i) => {
            const n = s.distribution[i + 1] ?? 0;
            return h('li', {}, h('span', {}, String(i + 1)),
              h('span', { class: 'fables-bar', style: `width:${Math.max(4, (100 * n) / max)}%` }), h('span', {}, String(n)));
          }));
      };
      shell.main.replaceChildren(...[
        h('h2', {}, 'Daily'),
        h('div', { class: 'fables-tiles' },
          tile(daily.played, 'Played'), tile(`${daily.winRate}%`, 'Solved'),
          tile(currentStreak(records, day), 'Streak'), tile(maxStreak(records), 'Best streak')),
        dist(daily),
        h('h2', {}, 'Unlimited'),
        h('p', { class: 'fables-notice' }, 'Unlimited puzzles have their own numbers and never change your daily streak.'),
        runMode
          ? h('div', { class: 'fables-tiles' }, tile(runs.current, 'Current run'), tile(runs.best, 'Best run'), tile(unlimited.played, 'Played'), tile(`${unlimited.winRate}%`, 'Solved'))
          : h('div', { class: 'fables-tiles' }, tile(unlimited.played, 'Played'), tile(`${unlimited.winRate}%`, 'Solved')),
        dist(unlimited),
        ...[].concat(options.stats?.(ctx()) ?? []),
        h('p', { class: 'fables-notice' }, 'Your progress is saved on this device only. Nothing is sent anywhere.'),
      ].filter(Boolean));
    }

    function showHelp() {
      const settings = store.settings();
      const week = ramp
        ? 'A new daily puzzle arrives every day. They get harder from Monday to Saturday, and Sunday brings a capstone that mixes the week’s ideas. Finish the day’s puzzle, solved or not, to keep your streak going.'
        : 'A new daily puzzle arrives every day. Finish it, solved or not, to keep your streak going.';
      const unlimitedText = runMode
        ? ' Unlimited has as many extra puzzles as you like. Solve them in a row to build a run; the level rises as the run grows. Runs never touch your daily streak.'
        : ' Unlimited mode has as many extra puzzles as you like, with their own numbers, and never touches your streak.';
      shell.main.replaceChildren(...[
        h('section', { class: 'fables-help', html: game.help ?? '' }),
        h('section', { class: 'fables-help' },
          h('h2', {}, ramp ? 'How the week works' : 'Daily and Unlimited'),
          h('p', {}, week + unlimitedText + (game.archive ? ' Past days are in the Archive as practice.' : ''))),
        ...[].concat(options.help?.(ctx()) ?? []),
        h('section', { class: 'fables-help' },
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
          }, `Sound: ${settings.sound ? 'on' : 'off'}`))),
      ].filter(Boolean));
    }

    root.addEventListener('hashchange', route);
    route();
    return { store, day, rerender: () => route() };
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
    // unlimited runs and providers
    unlimitedRuns, levelForRun, bankProvider,
    // browser helper for games' hooks
    el: (...args) => h(...args),
    // progress
    createStore, memoryStorage, streakDays, currentStreak, maxStreak, trackStats,
    // sharing
    MARKS, shareParts, shareText, shareUrl, feedbackLink, drawShareCard,
    // browser
    start,
  };
});
