# FablesCore

The shared framework for the Fables games: small daily puzzle games for the skills that matter more as AI changes how software is made. Four of them keep people sharp at work AI now does quickly, so they can still judge it. UDXFables trains what grows in importance as AI automates the mechanics: user and developer experience, shaped by people working with AI, for the people and AI agents who build and use a product. Five games are live, and all of them run on FablesCore:

| Game | What it asks | For |
| --- | --- | --- |
| [DataFables](https://collegeville.github.io/DataFables/) | Find what's wrong with the table, or decide that nothing is. | Students and anyone who works with data |
| [CodeFables](https://collegeville.github.io/CodeFables/) | Read short Python snippets, predict what they do, and spot what's wrong. | Beginning programmers (CS1) and anyone who judges code |
| [ScaleFables](https://collegeville.github.io/ScaleFables/) | How does it grow, and how does it speed up? | Students past CS1 and anyone who reasons about performance |
| [TestFables](https://collegeville.github.io/TestFables/) | When can you trust a green checkmark? | Undergraduate students who know basic programming |
| [UDXFables](https://collegeville.github.io/UDXFables/) | Who is it for, and what do they need right now? For the people and agents who build and use a product. | Anyone who builds software, tools, or communities |

FablesCore holds everything the games have in common, so it is improved once and every game gets it:

- **Page shell:** header with the game's icon and name, the Collegeville mark linking to the Games page, the Today, Unlimited, Stats and Help tabs, and the standard footer. Light and dark themes, phone and desktop layouts.
- **Feedback:** right and wrong answers are announced instantly and unmistakably, with color, an icon and a sentence ("Solved in two tries."), a short animation that respects reduced-motion settings, a screen-reader announcement, and an optional chime that is off by default.
- **Results screen:** the end of a game opens its own screen, with congratulations, encouragement or (for a day with some parts solved) something in between, then the score, streak, explanation and moral, a link back to the puzzle, and a **Play more Fables?** link to the Games page.
- **Sharing:** a spoiler-free emoji grid with the game, puzzle number, date, tries and streak, a Copy button that confirms, the phone's share sheet, and a drawn result picture to save or share.
- **Weekly schedule:** puzzles climb from level 1 on Monday to level 6 on Saturday, and Sunday is a capstone that mixes the week's ideas.
- **A puzzle every day:** once every daily puzzle has been played, the collection plays again, in a new fixed order each time. New puzzles go ahead of repeats.
- **Staying current:** a page left open picks up a new day or a new release by itself.
- **Unlimited mode:** extra puzzles on their own numbers (U-1, U-2, …), chosen by concept and level or as a random mix, preferring ones the player hasn't solved. They never touch the daily streak.
- **Puzzle identity, difficulty, progress:** permanent IDs and serial numbers checked when a game starts, a difficulty score with a hook for real player data, and streaks and stats saved on the player's device only.

The code is plain HTML, CSS and JavaScript with no frameworks and no build step.

The [Games page](https://collegeville.github.io/games/) on the Collegeville site describes this shared pattern for players, written from this README. When this README changes on `main`, an issue is opened on the site's repo as a reminder to review that paragraph.

## See it working

The `example` folder holds **ExampleFables**, a tiny complete game ("Which number breaks the pattern?") built on the core.

In GitHub Desktop, choose **Repository > Show in Finder**, open the `example` folder, and double-click `index.html`. To play another day, add `?date=2026-11-29` to the end of the address (that one is a Sunday capstone).

## Making a new game

1. Create the repo in the Collegeville organization, named as described under Naming below.
2. Copy the contents of `example/` into it: `index.html`, `game.js`, `game.css`, `icon.json`, the `fables-core` folder, and a `puzzles` folder.
3. In `game.js`, change the settings (`id`, `name`, `tagline`, `color`, `url`, `help`) and write the game's own `render` and `check` (see The contract below).
4. Write the game's puzzle bank. `example/tools/make-bank.js` shows the pattern: generate puzzles, check that each has exactly one defensible answer, lay out weeks with `Fables.planWeek`, and number them with `Fables.assignSerials`.
5. Make the icon: edit `icon.json`, then run `node tools/make-icon.js path/to/icon.json` from this repo. See Icons below.
6. Copy `templates/update-fables-core.yml` to `.github/workflows/update-fables-core.yml` in the game, so it receives core updates as pull requests, and add the game to `registry.json` here.
7. Add the GitHub topics (below) and the game's entry in the Collegeville site's `_data/games.yml`.

### Keeping future puzzles private

A plain static game serves its whole puzzle bank, so a curious player could read ahead. `fables-core/build-site.js` builds a site that holds puzzles only through today; a game runs it every day from a GitHub Action (see CodeFables). Its `tools/build-site.js` is a few lines:

```js
const { join } = require('node:path');
const { siteBuilder } = require('../fables-core/build-site.js');
module.exports = siteBuilder({ root: join(__dirname, '..'), bank: 'CODEFABLES_BANK' });
if (require.main === module) console.log(module.exports.buildSite(process.argv[2]));
```

It also writes `version.json` (`{ build, day }`), which open pages read to learn about a new day or a new release. A game with its own builder (DataFables) writes that file itself.

## The contract

A game loads three scripts and calls `Fables.start` once:

```html
<link rel="stylesheet" href="fables-core/fables.css">
<script src="fables-core/fables.js" defer></script>
<script src="puzzles/bank.js" defer></script>   <!-- sets window.MY_BANK -->
<script src="game.js" defer></script>            <!-- calls Fables.start -->
```

```js
Fables.start({
  game: {
    id: 'codefables',              // storage namespace; never change it once players exist
    name: 'CodeFables',
    tagline: 'Read it, predict it, judge it',
    icon: 'icons/icon.svg',
    color: '#1d4ed8',              // the game's color; colorDark is optional
    maxAttempts: 3,
    url: 'https://collegeville.github.io/CodeFables/',            // used in share links
    feedbackUrl: 'https://github.com/Collegeville/CodeFables/issues/new?title=Puzzle%20{id}',
    conceptLabels: { loops: 'Loops' },                             // names in the Unlimited picker
    help: '<h2>How to play</h2><p>…</p>',
    version: window.MY_BANK.version,                                // set by the site builder; see Versions below
    about: '<h2>Why these puzzles</h2><p>…</p>',                    // optional: an About tab after Help
    gamesUrl: 'https://collegeville.github.io/games/',             // optional: where "Play more Fables?" goes; this is the default
    messages: { solved: ['…'], some: ['…'], missed: ['…'] },       // optional: the game's own lines for the results screen
    timeZone: 'America/Chicago',   // optional: when the daily puzzle turns over; default is the player's own day
  },
  bank: window.MY_BANK,
  render(puzzle, el, play) { /* draw into el; call play.submit(answer) */ },
  check(puzzle, answer) { return { correct: true, mark: 'hit' }; },
  rows(marks, puzzle) { return [marks]; },   // optional: the share grid, one array of marks per row
  migrations: [],                             // optional: storage upgrades, run once in order
});
```

**`render(puzzle, el, play)`** draws the puzzle into `el`. `play` has `answers` (the player's answers so far), `marks`, `done`, `solved`, `attemptsLeft`, and `submit(answer)`. The core calls `render` again after every answer, so the game only draws the current state: mark tried answers, and once `done` is true, show the correct one and disable input.

**`check(puzzle, answer)`** returns `{ correct, mark }`. Marks are `hit` (🟩), `near` (🟨), `miss` (🟥) or `skip` (⬜). The core only ever sees marks, so shared results cannot spoil the answer.

**Versions.** Every game and puzzle has a version. The game version is stamped automatically at each publish by `fables-core/build-site.js` (a game with its own builder computes it the same way, with `gameVersion` from that file): the date of the change being published and which change of that day it is, such as `2026.11.26.2`. Pass it as `game.version`; it shows under the game's name and in every share, and open pages reload for a newer one. A puzzle's `puzzleVersion` starts at 1 and goes up only when its content changes: call `Fables.versionPuzzles(bank, previousBank)` when building a bank. A player partway through a puzzle that has since been revised starts it fresh. Publish workflows need `fetch-depth: 0` on checkout, so the date count sees the day's history.

**`about`** (optional) adds an **About** tab after Help: what the puzzles are, why they matter now that AI does more of the work, and the big ideas a regular player learns. The core closes it with a line on the Fables family and a link to the Games page.

Everything else (choosing today's puzzle, the Unlimited picker, recording, streaks, the announcement, the results screen, the share box, Stats and Help) is the core's job.

### Puzzle banks

```js
window.MY_BANK = {
  game: 'CodeFables',
  daily: [
    { id: 'cf-d-0001', serial: 1, date: '2026-11-30', difficulty: 2.5, capstone: false, /* game fields */ },
  ],
  unlimited: [
    { id: 'cf-u-0001', serial: 1, concept: 'loops', level: 1, difficulty: 2, /* game fields */ },
  ],
};
```

- **`id`** is permanent and unique across both tracks. It is used by saved progress, share links (`?p=cf-d-0001`) and bug reports, and is never changed or reused, even if a puzzle is retired.
- **`serial`** is the number players see. It runs 1, 2, 3, … with no gaps within each track, so daily #12 and U-12 are different puzzles. It is stored, never worked out from the date.
- **Daily puzzles** have a `date`. Sundays must be capstones, and Monday to Saturday must not get easier.
- **Unlimited puzzles** have a `concept` and a `level`.
- Optional fields the core shows: `title`, `explanation` and `moral` (every Fables puzzle ends with a one-line moral).

If any rule is broken, the game refuses to start, shows a short message, and lists every problem in the browser console. `Fables.validateBank(bank)` returns the same list, so a game's bank script can check itself before writing the file.

### Playing the collection again

A daily puzzle's `date` is the day it is first played. On any date after that with no first play of its own, the core plays the collection again:

- **In passes.** A pass plays every puzzle once, in an order fixed by the bank's `seed`, the pass and the day of the week. Every player gets the same puzzle on the same day, and each pass has a new order. The most recently played quarter never comes back in the first quarter of the next pass.
- **Keeping the climb.** Each day of the week draws on the puzzles made for it; a week of repeats is put in order of difficulty, with its capstone on Sunday.
- **As a fresh puzzle.** A repeat keeps its number. Its ID says which play it is (`ux-d-0005@2`), so it has its own saved state and result and counts toward the streak. Problem reports use the original ID.
- **New puzzles first.** Add puzzles in whole weeks, with the next serial numbers and dates from `Fables.nextOpenMonday(daily, today)`: after every unplayed puzzle and before any more repeats. If a pass was under way it goes on afterwards where it stopped, and the next pass includes them. Never change a date that has passed: the dates are the record of what was played.

`Fables.planRepeats(daily, through, { seed })` gives the schedule.

### Multi-part days

A daily puzzle can be a set of parts played in order, like DataFables' three tables. Give it `parts` instead of the game fields; each part is a puzzle with its own permanent `id`, and may set its own `maxAttempts` and a `label`:

```js
{ id: 'df-47', serial: 47, date: '2026-11-23', difficulty: 6.5,
  parts: [
    { id: 'df-47a', label: 'Find',  maxAttempts: 4, /* game fields */ },
    { id: 'df-47b', label: 'Audit', maxAttempts: 2, /* game fields */ },
    { id: 'df-47c', label: 'Rule',  maxAttempts: 2, /* game fields */ },
  ] }
```

The core shows a, b, c steps; each part unlocks when the one before is finished, and the result offers "Next: part b". The last part opens the results screen, which covers the whole day. The day is shared once, there, with one row of squares per part and the score as parts solved (`2/3`). The day counts toward the streak when every part is finished on the day. Any single puzzle can also set its own `maxAttempts`. `render` and `check` are called for each part exactly as for a single puzzle.

### Store adapter

A game that already has players can keep its own saved data. Pass `store` to `Fables.start`, an object with:

| Method | Does |
| --- | --- |
| `records()` | Every finished-puzzle record, as a list |
| `record(entry)` | Saves a record once per puzzle ID (returns false if it already exists) |
| `solvedIds()` | A Set of the IDs of solved puzzles |
| `loadState(id)`, `saveState(id, state)` | The in-progress state of one puzzle |
| `settings()`, `saveSettings(s)` | Settings such as `sound` |

Records the core writes look like `{ id, serial, track, date, onTime, solved, attempts, maxAttempts }`, plus `set`, `part` and `parts` for a part of a multi-part day. An adapter can store them in whatever shape it already uses, as long as `records()` gives them back in this shape. `tagRecord()`, also passed to `Fables.start`, returns extra fields to add to every record (DataFables uses it for class codes).

### Loading puzzles on demand (provider)

A game with all its puzzles in one `bank` needs nothing more. A game that loads puzzles from files, one day at a time (DataFables), passes a `provider` instead of a `bank`. Every method may be async:

| Method | Returns |
| --- | --- |
| `daily(date)` | The daily puzzle (or multi-part day) for that date, or null |
| `byId(id)` | `{ puzzle, track, part? }` for a shared link, or null |
| `dates()` | Every date that has a daily puzzle, for the Archive |
| `unlimited({ concept, level, mode, avoid })` | `{ puzzle, notice? }`: the next Unlimited puzzle, avoiding the IDs in `avoid` if it can; `notice` is shown above it (for example "Level 3 is used up for now") |
| `concepts()`, `levels()` | Choices for the Unlimited picker (not needed with run-based levels) |

Puzzles from a provider are checked one at a time as they load, with the same rules as a bank.

### Game options

| Option | Does |
| --- | --- |
| `weeklyRamp: false` | For a game without the Monday-to-Saturday ramp yet: no Sunday-capstone or climb rules, and the kicker shows just the weekday |
| `weeklyRamp: { from: 'YYYY-MM-DD' }` | The ramp starts on that Monday; earlier days are treated as `weeklyRamp: false`. For a game that adds the ramp after it has players |
| `updates: false` or `{ every, idle }` | Turns off the check for a new day or release, or changes how often it looks and how long without input counts as idle (milliseconds; the defaults are five minutes and two) |
| `archive: { days: 60 }` | Adds an **Archive** tab listing past days. A past day opens with `?archive=YYYY-MM-DD` as practice: it is recorded, but never changes the streak |
| `unlimitedLevels: 'run'`, `runLevels: { levels: 5, perLevel: 3 }` | Unlimited levels rise with the run (solves in a row): every three solves goes up a level, and a miss starts over. Replaces the concept and level picker with a run banner, and Stats shows current and best run |

The core also resumes an Unlimited puzzle that was started but not finished.

### Hooks for a game's own pieces

Passed to `Fables.start` alongside `render` and `check`. Each gets `{ store, records, day, el }`, where `el(tag, attrs, ...children)` makes elements, and returns elements to insert.

| Hook | Where it shows |
| --- | --- |
| `intro: { today, unlimited }` | A first-visit card on that tab, with **Got it** (HTML text or elements) |
| `stats(ctx)` | Extra sections on Stats (DataFables: points, this week, skills) |
| `help(ctx)` | Extra sections on Help (DataFables: class code, difficulty log, export and import, reminder) |
| `resultNote(puzzle, { solved, track, set, screen })` | Extra lines in the result, under the verdict. Called for the finished puzzle (`screen: 'puzzle'`) and the results screen (`'results'`, where the board is not on screen, and where `puzzle` is the last part of a multi-part day) |
| `tagRecord()` | Extra fields on every record (DataFables: the class code) |

### Difficulty

`Fables.difficultyScore(inputs, weights)` turns a game's own structural inputs (line count, concepts combined, nesting depth, and so on) into a score. Later, `Fables.adjustDifficulty(score, stats, hook)` lets real player data (plays, solve rate, mean tries) correct it once a puzzle has enough plays.

## Naming, repos and topics

- Each game is a topic word plus Fables in CamelCase: DataFables, ScaleFables. The repo name, the page address (collegeville.github.io/ScaleFables) and the on-screen title all match exactly.
- Check a new name for collisions before using it.
- Every game repo gets the GitHub topic **fables-game**, and this repo gets **fables-core**. Add a subject topic too, such as `data`, `code`, `scaling`, `testing` or `experience`. Then [this search](https://github.com/orgs/Collegeville/repositories?q=topic%3Afables-game) lists the whole family.
- All Fables repos live side by side in the Collegeville organization. Revisit the flat layout only if it passes about fifty repos.

## Icons

Every game has an icon in the family style: a rounded square in the game's color with one simple symbol in the shared paper color, and at most one accent color. The symbol is made of rectangles, circles and polygons kept inside the middle 80%, so it survives the rounded masks phones apply. `tools/make-icon.js` checks those rules and writes every size a game needs: `icon.svg` (favicon and the website catalog), `icon-32.png`, `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png`, plus `alt.txt`. Each game's spec names its symbol idea; icons are made with Claude, never from photos, and never show a real person.

## Versions and updates

Games keep their own copy of the `fables-core` folder, with a `VERSION` file inside, so each game is self-contained and works offline. When the core changes, a release is made from the Actions tab, and each game gets a pull request with the new copy to review and merge. See [docs/UPDATING.md](docs/UPDATING.md).

## Testing

`npm test` runs the behavior tests (dates, the weekly ramp, bank checks, streaks, sharing, difficulty, unlimited picks, and the example game's puzzles). `npm run test:visual` runs the browser tests: screenshots of every state at phone and desktop widths in light and dark themes, automated accessibility checks, and reduced-motion behavior. GitHub runs both on every pull request. See [docs/TESTING.md](docs/TESTING.md).

## License

Code is under the [MIT License](LICENSE). Documents, written content, images, audio, and video are under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see [LICENSE-CONTENT](LICENSE-CONTENT). © 2026 Michael A. Heroux.

## Image policy

No photos or likenesses of any real person, living or dead, appear in this repo or on anything built from it. All images are created together with Claude, so Michael A. Heroux owns them and they are licensed CC BY 4.0. The only exception is Michael himself: his standard professional portrait and an occasional informal photo. Any other exception needs Michael's explicit approval for that specific case. Future contributors, including AI coding sessions, must follow this policy.
