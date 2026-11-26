// Builds a game's published site into dist/. Runs in Node, from a game's tools/build-site.js:
//
//   const { siteBuilder } = require('../fables-core/build-site.js');
//   module.exports = siteBuilder({ root, bank: 'CODEFABLES_BANK', files: [...] });
//
// Copies the game, and writes a puzzle bank holding only the daily puzzles up to today (in the
// game's time zone), so tomorrow's answers can't be read from the site, plus the repeats that are
// due (see "Playing the collection again" in README.md). Unlimited puzzles are all included.
// Also writes version.json, which open pages read to learn about a new day or a new release, and
// stamps the game version (see gameVersion) into both.
// This file itself is not published.
'use strict';
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { basename, join } = require('node:path');
const Fables = require('./fables.js');

function filesUnder(path) {
  return statSync(path).isDirectory() ? readdirSync(path).sort().flatMap((f) => filesUnder(join(path, f))) : [path];
}

// The game version: the date of the commit being published, in the game's time zone, and which of
// that day's changes it is, counting along main (merges and direct commits, not the commits inside a
// merged branch): 2026.11.26.2 is the day's second change. It changes only when the repository does,
// so a nightly publish of the same code keeps it. Null outside a git checkout. Needs the full
// history in CI (actions/checkout with fetch-depth: 0).
function gameVersion(root, timeZone = 'America/Chicago') {
  let times;
  try {
    times = execFileSync('git', ['-C', root, 'log', '--first-parent', '--format=%ct', '-n', '200', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().split('\n').filter(Boolean).map(Number);
  } catch {
    return null;
  }
  if (!times.length) return null;
  const day = (t) => Fables.today(new Date(t * 1000), timeZone);
  const head = day(times[0]);
  const count = times.filter((t) => day(t) === head).length;
  return `${head.replaceAll('-', '.')}.${count}`;
}

function siteBuilder({ root, bank: bankName, files = ['index.html', 'game.js', 'game.css', 'fables-core', 'icons'], timeZone = 'America/Chicago' }) {
  function loadBank() {
    const sandbox = {};
    new Function('window', readFileSync(join(root, 'puzzles', 'bank.js'), 'utf8'))(sandbox);
    return sandbox[bankName];
  }

  function buildSite(today = Fables.today(new Date(), timeZone), out = join(root, 'dist')) {
    const published = Fables.publishedBank(Fables.assertBank(loadBank()), today);
    Fables.assertBank(Fables.withRepeats(published, today));
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, 'puzzles'), { recursive: true });
    const keep = (src) => basename(src) !== 'build-site.js';
    for (const f of files) cpSync(join(root, f), join(out, f), { recursive: true, filter: keep });
    const hash = createHash('sha256').update(JSON.stringify(published));
    for (const f of files.flatMap((name) => filesUnder(join(out, name)))) hash.update(readFileSync(f));
    const build = hash.digest('hex').slice(0, 12);
    const version = gameVersion(root, timeZone);
    writeFileSync(join(out, 'puzzles', 'bank.js'), `window.${bankName} = ${JSON.stringify({ ...published, build, ...(version && { version }) })};\n`);
    writeFileSync(join(out, 'version.json'), `${JSON.stringify({ build, day: today, ...(version && { version }) })}\n`);
    return { today, build, version, daily: published.daily.length, repeats: published.repeats.length, unlimited: published.unlimited.length };
  }

  return { buildSite, loadBank };
}

module.exports = { siteBuilder, gameVersion };
