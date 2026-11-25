# Decisions for the Fables family

Made while building the first version from the Fables family spec (2026-11-23).

**Settled with Mike**
- The repo is named FablesCore. Games use the names in their specs: CodeFables, ScaleFables, TestFables, UDXFables.
- The core itself has no build step. Games may use a small Node build and daily Action, as DataFables does, to publish puzzles only through today so future answers stay private.
- Cross-repo alerts open a pull request, not an issue.

**Made here, open to change**
- **One plain script, not modules.** `fables.js` is a classic script rather than JavaScript modules, because browsers refuse to load modules from a page opened straight from Finder. This keeps the preview steps (Show in Finder, open `index.html`) working.
- **Updates are pulled, not pushed.** Each game checks weekly for a new release and opens its own pull request with its own built-in token. No secret is needed, and nothing in FablesCore can write to a game. An optional token can start the check immediately after a release (see UPDATING.md). This needs FablesCore to be a **public** repo.
- **Releases come from the Actions tab.** The Release workflow runs every test first and creates the version tag only if they pass, which is how "block a release tag if tests fail" is enforced. Mike never needs to make a tag by hand.
- **Weeks run Monday to Sunday.** Monday is level 1, Saturday level 6, Sunday the capstone. A bank where Monday to Saturday gets easier, or a Sunday is not a capstone, is refused.
- **Serial numbers run per track with no gaps** (daily #1, #2, …; unlimited U-1, U-2, …), stored in the data. Share links carry the permanent ID (`?p=ex-d-0012`), so a shared link always opens the same puzzle.
- **Tries:** three per puzzle by default; each game can set its own.
- **Test tools** (Playwright 1.56.1 and axe 4.11.0) live only in this repo. Screenshot baselines are kept per platform because fonts differ between macOS and Linux.
- **The example game's share link** points to collegeville.github.io/FablesCore/example/, which works once GitHub Pages is turned on for this repo (Settings > Pages > Deploy from a branch > main, root).

## Answers from Mike, 2026-11-23

1. **Sound:** a short chime, off by default, turned on under Help.
2. **Share picture:** yes, in the first version. Added in 0.2.0 as **Save picture**.
3. **DataFables migration:** after CodeFables, once the core has proved itself on a second real game.
4. **Streaks:** a day counts when its daily puzzle is finished, solved or not, as DataFables does. Changed in 0.2.0.
5. **Org profile:** kept by hand, with the weekly check against the website catalog.
6. **Games page:** one list, grouped by subject once there are more than eight games.
7. **CodeFables:** store each puzzle's expected output, verified by running the code when the bank is built; no Python in the browser.
8. **First puzzle bank for each game:** four weeks of daily puzzles (28) plus 60 unlimited.
9. **CodeFables icon:** four short indented code lines, one flagged in the accent color.
10. **ScaleFables icon:** rising bars with the last one shooting up in the accent color. (ExampleFables moved to a dots icon to avoid the clash.)
11. **TestFables icon:** a large check mark with a small accent-colored gap.
12. **UDXFables icon:** a round-headed figure and a square-headed agent side by side, as plain shapes.
13. **ScaleFables labels:** lenses named Compute, Memory and Data movement; the two halves of a puzzle labeled Big-O and Speedup.
14. **Puzzle review:** Mike reviews the flagged puzzles (TestFables numerical and acceptance, UDXFables agent needs) on a review page that lists each with its answer and explanation, approving or rejecting before they go live.

## Answers from Mike, 2026-11-25

1. **Results:** a screen of their own at the end of a game, with "Play more Fables?".
2. **A puzzle every day:** each puzzle has a permanent number; the collection plays in order, then again in a fixed different order each time. New puzzles go after unplayed ones and before repeats.
3. **By calendar:** everyone has the same puzzle on the same day. Future days stay private.
4. **Repeats keep the weekly climb.**
5. **Size:** a full year per game, if the puzzles stay different enough.
6. **Unlimited** stays separate, and DataFables keeps its generator.
7. **Open pages update themselves.**

Still open, to ask when each game starts: TestFables' on-screen test level names; UDXFables' starting persona cast, stakeholder types, journey stage names and phase 1 artifact types; whether ScaleFables later covers communication between machines; and the names of later rungs above CodeFables.
