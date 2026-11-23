# Changelog

Every release is a version tag (`v0.1.0`) with a section here. Games record the version they carry in `fables-core/VERSION`. A breaking change, meaning one that needs a game to change its own code, is marked **Breaking** with the steps to follow.

## 0.3.1

- **Fix:** Daily stats (played, solved, the guess chart) count only puzzles played on their own day. Archive practice no longer inflates them, matching the streak and DataFables' long-standing rule.

## 0.3.0

Toward moving DataFables onto the core (see DataFables' docs/MIGRATION.md).

- **Multi-part days:** a daily puzzle can have `parts`, played in order with a, b, c steps, each unlocking when the one before is done. Shared once at the end with a row per part; counts toward the streak when every part is finished on the day.
- **A guess limit per puzzle:** `maxAttempts` on a puzzle or part overrides the game's.
- **Store adapter:** a game can pass its own `store`, so existing saved data stays where it is. `tagRecord()` adds fields to every record.
- **Fix:** an absent optional piece of the result panel no longer shows as the word "false".
- **Provider:** a game can load puzzles on demand (one file per day) instead of passing a whole bank; each loaded puzzle is checked.
- **Archive tab** (`archive`), played as practice outside the streak.
- **Run-based Unlimited levels** (`unlimitedLevels: 'run'`), with current and best run on Stats; an unfinished Unlimited puzzle resumes.
- **`weeklyRamp: false`** for games without the ramp yet.
- **Hooks:** `intro`, `stats`, `help`, `resultNote`, plus `Fables.el` for building their elements.
- **Fix:** changing the Unlimited filter starts a matching puzzle instead of resuming the old one.

## 0.2.0

- Streaks now count a day when its daily puzzle is finished, solved or not, matching DataFables. A daily puzzle played on a later day (from a shared link) does not fill in a past day; records carry `onTime` for this.
- A **Save picture** button in the share box draws a 1200 × 630 result card (game, puzzle number, date, score, the colored squares, streak) from the same spoiler-free pieces as the text. On phones it opens the share sheet with the picture; elsewhere it downloads a PNG.
- `Fables.shareParts` and `Fables.drawShareCard` are available to games.
- The example game has a new icon (dots, one out of line), leaving rising bars for ScaleFables.

## 0.1.0

First version.

- Page shell: header with the game's icon and name, Today, Unlimited, Stats and Help tabs, and the standard footer. Light and dark themes, phone and desktop layouts.
- Feedback: one call announces every outcome. Success is instant and unmistakable (green panel, check mark, short animation, "Solved in two tries."); a miss is calm and says how many tries are used and left. Never color alone, a screen-reader live region, reduced-motion respected, optional chime (off by default).
- Sharing: a spoiler-free emoji grid with a header line (game, puzzle number, date, tries, streak) and a link that opens the same puzzle by ID. Copy button with a visible confirmation, and the phone's share sheet where available.
- Weekly schedule: Monday to Saturday climb from level 1 to 6, Sunday is the capstone. `planWeek` lays out a week when a bank is built.
- Puzzle identity: every puzzle has a permanent ID and a serial number per track (daily #12, unlimited U-7), checked when the bank loads.
- Unlimited mode: its own numbers and stats, filters by concept and level or a random mix, prefers unsolved puzzles, never touches the streak.
- Difficulty: a weighted structural score and a hook for later correction with player data.
- Progress: streaks, stats and in-progress games in local storage, namespaced per game, with schema migrations.
- Icons: `tools/make-icon.js` draws the family-style icon in every size a game needs.
- Example game, tests, and the release and update Actions.
