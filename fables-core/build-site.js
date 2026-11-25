// Builds a game's published site into dist/. Runs in Node, from a game's tools/build-site.js:
//
//   const { siteBuilder } = require('../fables-core/build-site.js');
//   module.exports = siteBuilder({ root, bank: 'CODEFABLES_BANK', files: [...] });
//
// Copies the game, and writes a puzzle bank holding only the daily puzzles up to today (in the
// game's time zone), so tomorrow's answers can't be read from the site, plus the repeats that are
// due (see "Playing the collection again" in README.md). Unlimited puzzles are all included.
// Also writes version.json, which open pages read to learn about a new day or a new release.
// This file itself is not published.
'use strict';
const { createHash } = require('node:crypto');
const { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { basename, join } = require('node:path');
const Fables = require('./fables.js');

function filesUnder(path) {
  return statSync(path).isDirectory() ? readdirSync(path).sort().flatMap((f) => filesUnder(join(path, f))) : [path];
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
    writeFileSync(join(out, 'puzzles', 'bank.js'), `window.${bankName} = ${JSON.stringify({ ...published, build })};\n`);
    writeFileSync(join(out, 'version.json'), `${JSON.stringify({ build, day: today })}\n`);
    return { today, build, daily: published.daily.length, repeats: published.repeats.length, unlimited: published.unlimited.length };
  }

  return { buildSite, loadBank };
}

module.exports = { siteBuilder };
