#!/usr/bin/env node
// Copies the core into a game: node tools/vendor.js <game folder>
// Replaces <game folder>/fables-core with this repo's fables-core (including VERSION). The update
// Action in each game does the same thing from a release zip; this is for local use and tests.
'use strict';
const { cpSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

function vendor(target) {
  const dest = join(resolve(target), 'fables-core');
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(__dirname, '..', 'fables-core'), dest, { recursive: true });
  return dest;
}
module.exports = { vendor };

if (require.main === module) {
  if (!process.argv[2]) {
    console.error('Usage: node tools/vendor.js <game folder>');
    process.exit(1);
  }
  console.log(`Copied the core to ${vendor(process.argv[2])}`);
}
