# Decisions for FablesCore 0.1.0

Made while building the first version from the Fables family spec (2026-11-23).

**Settled with Mike**
- The repo is named FablesCore. Games use the names in their specs: CodeFables, ScaleFables, TestFables, UDXFables.
- The core itself has no build step. Games may use a small Node build and daily Action, as DataFables does, to publish puzzles only through today so future answers stay private.
- Cross-repo alerts open a pull request, not an issue.

**Made here, open to change**
- **One plain script, not modules.** `fables.js` is a classic script rather than JavaScript modules, because browsers refuse to load modules from a page opened straight from Finder. This keeps the preview steps (Show in Finder, open `index.html`) working.
- **Updates are pulled, not pushed.** Each game checks weekly for a new release and opens its own pull request with its own built-in token. No secret is needed, and nothing in FablesCore can write to a game. An optional token can start the check immediately after a release (see UPDATING.md). This needs FablesCore to be a **public** repo.
- **Releases come from the Actions tab.** The Release workflow runs every test first and creates the version tag only if they pass, which is how "block a release tag if tests fail" is enforced. Mike never needs to make a tag by hand.
- **Streak rule:** a day counts toward the streak when its daily puzzle is solved. Unlimited puzzles never count. (DataFables counts a daily set once all three tables are played; that difference is for the DataFables migration to settle.)
- **Weeks run Monday to Sunday.** Monday is level 1, Saturday level 6, Sunday the capstone. A bank where Monday to Saturday gets easier, or a Sunday is not a capstone, is refused.
- **Serial numbers run per track with no gaps** (daily #1, #2, …; unlimited U-1, U-2, …), stored in the data. Share links carry the permanent ID (`?p=ex-d-0012`), so a shared link always opens the same puzzle.
- **Sound** is a short chime made in the browser, off by default, turned on under Help.
- **Share image:** not in this version. The text grid is the baseline, as the spec allows; a drawn image can come later.
- **Tries:** three per puzzle by default; each game can set its own.
- **Test tools** (Playwright 1.56.1 and axe 4.11.0) live only in this repo. Screenshot baselines are kept per platform because fonts differ between macOS and Linux.
- **The example game's share link** points to collegeville.github.io/FablesCore/example/, which works once GitHub Pages is turned on for this repo (Settings > Pages > Deploy from a branch > main, root).
