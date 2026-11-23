# FablesCore

The shared framework for the Fables games: small daily puzzle games that keep people sharp at the skills AI now does quickly, so they can still judge its work. DataFables is the first; CodeFables, ScaleFables, TestFables and UDXFables are planned.

FablesCore holds everything the games have in common, so it is improved once and every game gets it:

- **Page shell:** header with the game's icon and name, the Today, Unlimited, Stats and Help tabs, and the standard footer. Light and dark themes, phone and desktop layouts.
- **Feedback:** right and wrong answers are announced instantly and unmistakably, with color, an icon and a sentence ("Solved in two tries."), a short animation that respects reduced-motion settings, a screen-reader announcement, and an optional chime that is off by default.
- **Sharing:** a spoiler-free emoji grid with the game, puzzle number, date, tries and streak, a Copy button that confirms, the phone's share sheet, and a drawn result picture to save or share.
- **Weekly schedule:** puzzles climb from level 1 on Monday to level 6 on Saturday, and Sunday is a capstone that mixes the week's ideas.
- **Unlimited mode:** extra puzzles on their own numbers (U-1, U-2, …), chosen by concept and level or as a random mix, preferring ones the player hasn't solved. They never touch the daily streak.
- **Puzzle identity, difficulty, progress:** permanent IDs and serial numbers checked when a game starts, a difficulty score with a hook for real player data, and streaks and stats saved on the player's device only.

The code is plain HTML, CSS and JavaScript with no frameworks and no build step.

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

A plain static game serves its whole puzzle bank, so a curious player could read ahead. A game that cares can do what DataFables does: keep the full bank out of the published site and use a small Node script plus a daily GitHub Action to publish puzzles only through today. The core does not need anything special for this: the game hands `Fables.start` whatever bank the page loaded.

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

Everything else (choosing today's puzzle, the Unlimited picker, recording, streaks, the announcement, the share box, Stats and Help) is the core's job.

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

### Difficulty

`Fables.difficultyScore(inputs, weights)` turns a game's own structural inputs (line count, concepts combined, nesting depth, and so on) into a score. Later, `Fables.adjustDifficulty(score, stats, hook)` lets real player data (plays, solve rate, mean tries) correct it once a puzzle has enough plays.

## Naming, repos and topics

- Each game is a topic word plus Fables in CamelCase: DataFables, ScaleFables. The repo name, the page address (collegeville.github.io/ScaleFables) and the on-screen title all match exactly.
- Check a new name for collisions before using it.
- Every game repo gets the GitHub topic **fables-game**, and this repo gets **fables-core**. Add a subject topic too, such as `data`, `code`, `testing` or `scaling`. Then [this search](https://github.com/orgs/Collegeville/repositories?q=topic%3Afables-game) lists the whole family.
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
