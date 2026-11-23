# Changelog

Every release is a version tag (`v0.1.0`) with a section here. Games record the version they carry in `fables-core/VERSION`. A breaking change, meaning one that needs a game to change its own code, is marked **Breaking** with the steps to follow.

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
