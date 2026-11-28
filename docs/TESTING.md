# Testing

## Behavior tests

`npm test` (Node 20 or later, no installs needed). They cover dates and the weekly ramp, bank checks (IDs, serial numbers, Sunday capstones, the Monday-to-Saturday climb), streak rules, unlimited picks, playing the collection again (several years of it, and adding puzzles part-way), the site builder, share text, feedback links, difficulty scores, storage and migrations, and the example game: its vendored core matches the core, its bank is exactly what its generator makes, and every puzzle has exactly one defensible answer.

### Music

`test/music.test.js` covers the music area: key spelling and scale degrees, the text form, the canonical audible form (ties joined, onsets only for clicks), splitting over barlines, transposition, the standard-notation rules (familiar shapes pass, odd ones are named), beaming, seeded random numbers, the generate-and-check harness and each shared choice check, the hidden answer key, screen-reader descriptions, the audio timeline (intro, count-in, notes, 6/8 beats), and SVG snapshots of the engraver for every notation feature the games use. After an intended change to the drawing, run `UPDATE_SNAPSHOTS=1 npm test` and look at `test/music/snapshots/index.html` before committing. The music games add property tests that generate 1,000 puzzles per level and check every one.

**Audio, by hand.** Browsers in tests run audio without speakers, so timing by ear is a manual check. Before a release that changes `audio.js`:

1. On an iPhone with the silent switch on, open a music game, press Play, and confirm that you hear it.
2. Play a Sunday puzzle on an Android phone in Chrome: the count-in is steady and the notes land on its beat.
3. Switch tabs during playback, come back, and press Replay: it starts cleanly from the count-in.

## Browser tests

`npm install`, then `npm run test:visual`. They open the example game straight from disk and check:

- **Look:** screenshots of the page shell, a miss, the results screen (solved and missed), the settled puzzle and the share box, at phone (375 px) and desktop widths, in light and dark themes, compared with saved baselines. At most 20 pixels may differ, so even a changed word fails the check.
- **Accessibility:** automated checks (axe, WCAG 2.1 AA, including color contrast and ARIA) on every state and every tab.
- **Music** (`music.spec.js`, against a small test page shaped like the music games): melody and rhythm cards at both sizes and themes, accessibility, no score described before the answer and every one described after, the keyboard (Space, numbers, arrows, Enter), listens counted once per press and not after the answer, and a generated Unlimited track with named levels.
- **Behavior:** the screen-reader announcements, focus moving to the results screen, its messages, its Back button and reload behavior, the Play more Fables? link, the success animation and its absence under reduced motion, progress surviving a reload, the Copy confirmation, Unlimited's own numbering and its separation from the streak, a date with no puzzle, repeats, open pages picking up a new day or release (and not interrupting a player, reloading in a loop, or giving up a working page offline), and a broken bank refused with a message.

Locally these use the Chrome already on the Mac.

## Baselines

Fonts render slightly differently on macOS and Linux, so baselines are kept per platform in `test/visual/baselines/darwin` and `test/visual/baselines/linux`. GitHub checks against the Linux ones.

Until the Linux baselines exist, the Tests check still runs every accessibility and behavior check but only warns that screenshots weren't compared, and the Release workflow refuses to run. Make them once, and again whenever a change to the look is intended:

1. On github.com, open FablesCore, then **Actions > Update visual baselines > Run workflow**.
2. It takes new screenshots on Linux and opens a pull request with them. Open the pull request's **Files changed** tab to compare old and new images, and merge if they look right.

Pull requests opened by a workflow don't start other workflows on their own, so the Tests check won't appear on that pull request. That is expected; it runs again after the merge.

To refresh the macOS baselines, run `npm run baselines` on the Mac (or ask Claude to).
