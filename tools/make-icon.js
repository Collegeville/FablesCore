#!/usr/bin/env node
// Draws a Fables game icon in the family style, with no dependencies.
//   node tools/make-icon.js path/to/icon.json
//
// Family style: a rounded square filled with the game's color, holding one simple symbol drawn
// from rectangles, circles and polygons in the shared paper color, with at most one accent color.
// Shapes are placed in unit coordinates (0 to 1) and must stay inside the middle 80% so the icon
// survives the rounded masks phones apply to home-screen icons.
//
// icon.json:
//   { "color": "#5b3fb0", "accent": "#f59e0b", "out": "../icons",
//     "alt": "ExampleFables icon: rising bars with one out of place",
//     "symbol": [ { "rect": [x, y, w, h], "fill": "paper" },
//                 { "circle": [cx, cy, r], "fill": "accent" },
//                 { "poly": [[x, y], ...], "fill": "soft" } ] }
// fill is "paper", "soft" (paper at 70% over the game color), "accent", or a hex color.
//
// Writes icon.svg (favicon and catalog), icon-32.png, apple-touch-icon.png (180), icon-192.png and
// icon-512.png (installed web app), plus alt.txt with the icon's alt text.

'use strict';
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { deflateSync } = require('node:zlib');

const PAPER = '#faf7f0';
const SAFE = [0.1, 0.9];

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);

function resolveFill(fill, cfg) {
  if (fill === 'paper') return toRgb(PAPER);
  if (fill === 'soft') return mix(toRgb(cfg.color), toRgb(PAPER), 0.7);
  if (fill === 'accent') return toRgb(cfg.accent);
  return toRgb(fill);
}

function inside(shape, u, v) {
  if (shape.rect) {
    const [x, y, w, h] = shape.rect;
    return u >= x && u < x + w && v >= y && v < y + h;
  }
  if (shape.circle) {
    const [cx, cy, r] = shape.circle;
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
  }
  let hit = false; // even-odd rule
  const p = shape.poly;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > v) !== (p[j][1] > v) && u < ((p[j][0] - p[i][0]) * (v - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) hit = !hit;
  }
  return hit;
}

function bounds(shape) {
  if (shape.rect) return [shape.rect[0], shape.rect[1], shape.rect[0] + shape.rect[2], shape.rect[1] + shape.rect[3]];
  if (shape.circle) return [shape.circle[0] - shape.circle[2], shape.circle[1] - shape.circle[2], shape.circle[0] + shape.circle[2], shape.circle[1] + shape.circle[2]];
  const xs = shape.poly.map((p) => p[0]);
  const ys = shape.poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function check(cfg) {
  const problems = [];
  if (!/^#[0-9a-f]{6}$/i.test(cfg.color ?? '')) problems.push('color must be a hex color like #5b3fb0');
  if (!cfg.alt) problems.push('alt text is required');
  const fills = new Set(cfg.symbol.map((s) => s.fill));
  if ([...fills].some((f) => !['paper', 'soft', 'accent'].includes(f) && f !== cfg.accent)) problems.push('use paper, soft, or the one accent color');
  if (fills.has('accent') && !cfg.accent) problems.push('accent fill used but no accent color given');
  for (const s of cfg.symbol) {
    const [x0, y0, x1, y1] = bounds(s);
    if (x0 < SAFE[0] - 1e-9 || y0 < SAFE[0] - 1e-9 || x1 > SAFE[1] + 1e-9 || y1 > SAFE[1] + 1e-9) problems.push(`shape ${JSON.stringify(s)} leaves the safe zone (0.1 to 0.9)`);
  }
  if (problems.length) throw new Error(`Icon problems:\n- ${problems.join('\n- ')}`);
}

// PNG with 4x4 supersampling, so edges stay crisp at 32 px.
function png(cfg, size) {
  const bg = toRgb(cfg.color);
  const shapes = cfg.symbol.map((s) => ({ ...s, rgb: resolveFill(s.fill, cfg), box: bounds(s) }));
  const px = Buffer.alloc(size * size * 3);
  const ss = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          let color = bg;
          for (const s of shapes) {
            if (u >= s.box[0] && u <= s.box[2] && v >= s.box[1] && v <= s.box[3] && inside(s, u, v)) color = s.rgb;
          }
          acc = acc.map((c, i) => c + color[i]);
        }
      }
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  return encodePng(px, size);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(px, size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function svg(cfg) {
  const n = (v) => +(v * 100).toFixed(2);
  const shapes = cfg.symbol.map((s) => {
    const fill = toHex(resolveFill(s.fill, cfg));
    if (s.rect) return `<rect x="${n(s.rect[0])}" y="${n(s.rect[1])}" width="${n(s.rect[2])}" height="${n(s.rect[3])}" rx="1.5" fill="${fill}"/>`;
    if (s.circle) return `<circle cx="${n(s.circle[0])}" cy="${n(s.circle[1])}" r="${n(s.circle[2])}" fill="${fill}"/>`;
    return `<polygon points="${s.poly.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="${fill}"/>`;
  });
  const title = cfg.alt.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${title.replace(/"/g, '&quot;')}"><title>${title}</title><rect width="100" height="100" rx="22" fill="${cfg.color}"/>${shapes.join('')}</svg>\n`;
}

function makeIcon(configPath) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  check(cfg);
  const out = resolve(dirname(configPath), cfg.out ?? '.');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'icon.svg'), svg(cfg));
  for (const [name, size] of [['icon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    writeFileSync(join(out, name), png(cfg, size));
  }
  writeFileSync(join(out, 'alt.txt'), `${cfg.alt}\n`);
  return out;
}

module.exports = { makeIcon, check };

if (require.main === module) {
  if (!process.argv[2]) {
    console.error('Usage: node tools/make-icon.js path/to/icon.json');
    process.exit(1);
  }
  console.log(`Icons written to ${makeIcon(resolve(process.argv[2]))}`);
}
