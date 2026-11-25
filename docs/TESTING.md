# Testing

## Behavior tests

`npm test` (Node 20 or later, no installs needed). They cover dates and the weekly ramp, bank checks (IDs, serial numbers, Sunday capstones, the Monday-to-Saturday climb), streak rules, unlimited picks, playing the collection again (several years of it, and adding puzzles part-way), the site builder, share text, feedback links, difficulty scores, storage and migrations, and the example game: its vendored core matches the core, its bank is exactly what its generator makes, and every puzzle has exactly one defensible answer.

## Browser tests

`npm install`, then `npm run test:visual`. They open the example game straight from disk and check:

- **Look:** screenshots of the page shell, a miss, the results screen (solved and missed), the settled puzzle and the share box, at phone (375 px) and desktop widths, in light and dark themes, compared with saved baselines. At most 20 pixels may differ, so even a changed word fails the check.
- **Accessibility:** automated checks (axe, WCAG 2.1 AA, including color contrast and ARIA) on every state and every tab.
- **Behavior:** the screen-reader announcements, focus moving to the results screen, its messages, its Back button and reload behavior, the Play more Fables? link, the success animation and its absence under reduced motion, progress surviving a reload, the Copy confirmation, Unlimited's own numbering and its separation from the streak, a date with no puzzle, repeats, open pages picking up a new day or release (and not interrupting a player, reloading in a loop, or giving up a working page offline), and a broken bank refused with a message.

Locally these use the Chrome already on the Mac.

## Baselines

Fonts render slightly differently on macOS and Linux, so baselines are kept per platform in `test/visual/baselines/darwin` and `test/visual/baselines/linux`. GitHub checks against the Linux ones.

Until the Linux baselines exist, the Tests check still runs every accessibility and behavior check but only warns that screenshots weren't compared, and the Release workflow refuses to run. Make them once, and again whenever a change to the look is intended:

1. On github.com, open FablesCore, then **Actions > Update visual baselines > Run workflow**.
2. It takes new screenshots on Linux and opens a pull request with them. Open the pull request's **Files changed** tab to compare old and new images, and merge if they look right.

Pull requests opened by a workflow don't start other workflows on their own, so the Tests check won't appear on that pull request. That is expected; it runs again after the merge.

To refresh the macOS baselines, run `npm run baselines` on the Mac (or ask Claude to).
