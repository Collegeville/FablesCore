/*!
 * FablesCore music: a small engraver that draws a Piece as inline SVG.
 * © 2026 Michael A. Heroux. MIT License (code).
 *
 * Covers what the Fables music games use: treble or one-line percussion staff, clef, key and
 * time signatures, noteheads, stems, beams, flags, rests, dots, ties, accidentals, ledger lines
 * and barlines. Everything is drawn in currentColor, so it follows the page's light or dark theme.
 * Works under Node too (it only builds a string), which is how the golden-image tests use it.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./model.js') : root.FablesMusic);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FablesMusic = Object.assign(root.FablesMusic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (M) {
  'use strict';

  const SP = 10; // one staff space
  const TOP = 46; // y of the top staff line in each system
  const SYSTEM = 116; // height of one system
  const BOTTOM_LINE_STEP = 30; // E4, the bottom line of the treble staff
  const MIDDLE_STEP = 34; // B4

  const r1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- glyphs
  const TREBLE = 'M9.5 49.5C13.5 53 18 49.5 16.6 43.5L12.4 -5C11.8 -13 16.6 -18 19 -12.5C21.6 -5.8 13.2 2.2 7.4 9.6C1.4 17.4 1.6 28.6 8.6 33.6C14.8 38 23.8 35 24.2 27.8C24.6 21.2 18.6 18.4 14.2 20.4C10.4 22.2 10 27.6 13.6 29.6';
  const sharp = (x, y) => `<path d="M${r1(x - 2.2)} ${r1(y - 11)}v21M${r1(x + 2.2)} ${r1(y - 12)}v21" stroke="currentColor" stroke-width="1.2"/>`
    + `<path d="M${r1(x - 4.6)} ${r1(y - 2.4)}l9.2 -3v3.2l-9.2 3zM${r1(x - 4.6)} ${r1(y + 4.6)}l9.2 -3v3.2l-9.2 3z" fill="currentColor"/>`;
  const flat = (x, y) => `<path d="M${r1(x - 3)} ${r1(y - 14)}v18.5" stroke="currentColor" stroke-width="1.3"/>`
    + `<path d="M${r1(x - 3)} ${r1(y + 4.5)}c5.5 -3.2 7.8 -7.2 5.6 -9.2c-1.8 -1.6 -4 -0.4 -5.6 1.6v1.8c1.6 -1.8 3.4 -2.4 4.2 -1.4c1.2 1.6 -1 4.6 -4.2 6.4z" fill="currentColor"/>`;
  const natural = (x, y) => `<path d="M${r1(x - 2.6)} ${r1(y - 11)}v14.5M${r1(x + 2.6)} ${r1(y - 3.5)}v14.5" stroke="currentColor" stroke-width="1.2"/>`
    + `<path d="M${r1(x - 2.6)} ${r1(y - 2.2)}l5.2 -2v3l-5.2 2zM${r1(x - 2.6)} ${r1(y + 4.4)}l5.2 -2v3l-5.2 2z" fill="currentColor"/>`;
  const ACCIDENTAL = { 1: sharp, '-1': flat, 0: natural };

  function notehead(x, y, dur) {
    if (dur >= 4) {
      return `<path fill="currentColor" fill-rule="evenodd" d="M${r1(x - 7.4)} ${r1(y)}a7.4 4.9 0 1 0 14.8 0a7.4 4.9 0 1 0 -14.8 0z`
        + `M${r1(x - 3.2)} ${r1(y - 1.6)}a3.6 2.4 52 1 0 6.4 3.2a3.6 2.4 52 1 0 -6.4 -3.2z"/>`;
    }
    const open = dur >= 2;
    const outer = `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="6.1" ry="4.3" transform="rotate(-22 ${r1(x)} ${r1(y)})" fill="currentColor"/>`;
    if (!open) return outer;
    return `<path fill="currentColor" fill-rule="evenodd" d="M${r1(x - 6.1)} ${r1(y)}a6.1 4.3 0 1 0 12.2 0a6.1 4.3 0 1 0 -12.2 0z`
      + `M${r1(x - 4.6)} ${r1(y + 1.4)}a5 1.9 -24 1 0 9.2 -2.8a5 1.9 -24 1 0 -9.2 2.8z" transform="rotate(-18 ${r1(x)} ${r1(y)})"/>`;
  }
  // Percussion notes use the same heads; an X head would read as "ghost", so plain heads it is.

  function restGlyph(x, top, dur) {
    const mid = top + 2 * SP;
    switch (dur) {
      case 4: return `<rect x="${r1(x - 6.5)}" y="${top + SP}" width="13" height="5.2" fill="currentColor"/>`;
      case 3: case 2: return `<rect x="${r1(x - 6.5)}" y="${r1(mid - 5.2)}" width="13" height="5.2" fill="currentColor"/>`;
      case 1.5: case 1:
        return `<path fill="currentColor" d="M${r1(x - 2.4)} ${r1(mid - 14.5)}l6.6 7.8c-3.2 2.6 -3.8 5.4 -0.6 8.8l-1.2 1.2c-3.6 -2.2 -7 -0.8 -4.6 3.6c-4.4 -2 -4.2 -7.2 1.2 -6.4l-5.2 -6.2c3 -2.4 3.6 -5.2 0.6 -8z"/>`;
      case 0.75: case 0.5:
        return `<circle cx="${r1(x - 2.6)}" cy="${r1(mid - 5)}" r="2.6" fill="currentColor"/>`
          + `<path d="M${r1(x - 3.4)} ${r1(mid - 3.2)}q4.6 1.4 7.2 -3.2l-4.6 14" stroke="currentColor" stroke-width="1.4" fill="none"/>`;
      default:
        return `<circle cx="${r1(x - 1.6)}" cy="${r1(mid - 5)}" r="2.4" fill="currentColor"/><circle cx="${r1(x - 3.4)}" cy="${r1(mid + 3.2)}" r="2.4" fill="currentColor"/>`
          + `<path d="M${r1(x - 2.4)} ${r1(mid - 3.4)}q4.4 1.2 6.4 -3l-6.6 22M${r1(x - 4.2)} ${r1(mid + 4.8)}q4 1.2 6 -2.6" stroke="currentColor" stroke-width="1.4" fill="none"/>`;
    }
  }

  function flag(x, yEnd, up, count) {
    let out = '';
    for (let k = 0; k < count; k++) {
      const y = yEnd + (up ? 1 : -1) * k * 7.5;
      out += up
        ? `<path fill="currentColor" d="M${r1(x)} ${r1(y)}c1 6 9.8 8.6 7.6 19.2c2.6 -9 -4.6 -12 -7.6 -13.6z"/>`
        : `<path fill="currentColor" d="M${r1(x)} ${r1(y)}c1 -6 9.8 -8.6 7.6 -19.2c2.6 9 -4.6 12 -7.6 13.6z"/>`;
    }
    return out;
  }

  // ---------------------------------------------------------------- layout
  const WIDTH = { 4: 46, 3: 42, 2: 36, 1.5: 33, 1: 29, 0.75: 27, 0.5: 23, 0.25: 19 };
  const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
  const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];

  // Which accidental (if any) each note shows: the key signature holds until a note in the bar
  // changes a letter, and that change holds to the end of the bar. A note continuing a tie from
  // the bar before shows none.
  function accidentals(piece) {
    let tiedFrom = false;
    return piece.bars.map((bar) => {
      const state = {};
      return bar.map((e) => {
        if (e.rest || e.name === 'x') { tiedFrom = false; return null; }
        const p = M.parsePitch(e.name);
        const slot = `${p.letter}${p.octave}`;
        const current = slot in state ? state[slot] : M.signatureAlter(piece.key, p.letter);
        const continuing = tiedFrom;
        tiedFrom = !!e.tie;
        state[slot] = p.alter;
        if (continuing || current === p.alter) return null;
        return p.alter;
      });
    });
  }

  function renderScore(piece, opts = {}) {
    const perc = !!opts.percussion;
    const barsPerLine = opts.barsPerLine ?? (piece.bars.length <= 2 ? piece.bars.length : 4);
    const W = opts.width ?? (barsPerLine >= 4 ? 760 : 130 + 170 * barsPerLine);
    const lines = [];
    for (let b = 0; b < piece.bars.length; b += barsPerLine) lines.push(piece.bars.slice(b, b + barsPerLine).map((bar, k) => ({ bar, index: b + k })));
    const acc = perc ? piece.bars.map((bar) => bar.map(() => null)) : accidentals(piece);
    const yOfStep = (top, step) => top + 4 * SP - (step - BOTTOM_LINE_STEP) * (SP / 2);

    const out = [];
    const heads = []; // every placed event, in order, for ties across systems
    let eventIndex = 0;

    for (const [li, line] of lines.entries()) {
      const top = 14 + li * SYSTEM + (perc ? 0 : 18);
      const staffMid = top + 2 * SP;
      let x = 6;
      // Clef
      if (perc) {
        out.push(`<rect x="${x + 4}" y="${staffMid - 10}" width="4" height="20" fill="currentColor"/><rect x="${x + 12}" y="${staffMid - 10}" width="4" height="20" fill="currentColor"/>`);
        x += 28;
      } else {
        out.push(`<path d="${TREBLE}" transform="translate(${x} ${top})" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><circle cx="${x + 9.4}" cy="${top + 47.6}" r="3.4" fill="currentColor"/>`);
        x += 34;
        // Key signature
        const n = Math.abs(piece.key.fifths);
        for (let k = 0; k < n; k++) {
          const step = (piece.key.fifths > 0 ? SHARP_STEPS : FLAT_STEPS)[k];
          out.push((piece.key.fifths > 0 ? sharp : flat)(x + 5, yOfStep(top, step)));
          x += 10;
        }
        if (n) x += 4;
      }
      // Time signature, on the first system only
      if (li === 0) {
        const [a, b] = piece.time;
        const ty = perc ? staffMid - 10 : top;
        out.push(`<g font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="25" text-anchor="middle" fill="currentColor">`
          + `<text x="${x + 10}" y="${ty + 18.5}">${a}</text><text x="${x + 10}" y="${ty + 38.5}">${b}</text></g>`);
        x += 28;
      }
      x += 6;
      // Bars share the rest of the line in proportion to what they hold.
      const need = line.map(({ bar, index }) => 14 + bar.reduce((s, e, i) => s + (bar.length === 1 && e.rest ? 60 : WIDTH[e.dur] + (acc[index][i] != null ? 11 : 0) + ([3, 1.5, 0.75].includes(e.dur) ? 6 : 0)), 0));
      const fullLine = li < lines.length - 1 || line.length === barsPerLine;
      const avail = W - x - 2;
      const scale = fullLine ? avail / need.reduce((s, n) => s + n, 0) : Math.min(1.6, avail / need.reduce((s, n) => s + n, 0));

      for (const [k, { bar, index }] of line.entries()) {
        const bx = x;
        const bw = need[k] * scale;
        let cx = bx + 10 * scale;
        const placed = [];
        for (const [i, e] of bar.entries()) {
          const a = acc[index][i];
          const w = (bar.length === 1 && e.rest ? 60 : WIDTH[e.dur] + (a != null ? 11 : 0) + ([3, 1.5, 0.75].includes(e.dur) ? 6 : 0)) * scale;
          const hx = cx + (a != null ? 11 : 0) * scale + 7;
          if (e.rest) {
            const rx = bar.length === 1 ? bx + bw / 2 : hx;
            out.push(`<g class="fm-ev" data-i="${eventIndex}">${restGlyph(rx, perc ? staffMid - 2 * SP : top, bar.length === 1 ? 4 : e.dur)}`
              + ([3, 1.5, 0.75].includes(e.dur) ? `<circle cx="${r1(rx + 9)}" cy="${r1(staffMid - 5)}" r="1.9" fill="currentColor"/>` : '') + '</g>');
            placed.push({ e, rest: true, x: rx });
          } else {
            const step = perc ? MIDDLE_STEP : M.stepOf(e.name);
            const y = perc ? staffMid : yOfStep(top, step);
            placed.push({ e, x: hx, y, step, acc: a, i });
          }
          heads.push({ ...placed[placed.length - 1], line: li, top });
          eventIndex++;
          cx += w;
        }
        // Stems, beams and flags
        const groups = M.beamGroups(bar, piece.time);
        const inGroup = new Map();
        for (const g of groups) for (const i of g) inGroup.set(i, g);
        const stemUpFor = (steps) => (perc ? true : steps.reduce((s, v) => s + v, 0) / steps.length < MIDDLE_STEP + 0.01 ? true : false);
        const notes = placed.filter((p) => !p.rest);
        const byIndex = new Map(notes.map((p) => [p.i, p]));
        const drawn = new Set();
        let ev = eventIndex - bar.length;
        const parts = [];
        for (const [i, e] of bar.entries()) {
          const p = byIndex.get(i);
          const myIndex = ev + i;
          if (!p) continue;
          const g = inGroup.get(i);
          let body = '';
          // ledger lines
          if (!perc) {
            for (let s = 28; s >= p.step; s -= 2) body += `<path d="M${r1(p.x - 10)} ${r1(yOfStep(top, s))}h20" stroke="currentColor" stroke-width="1.2"/>`;
            for (let s = 40; s <= p.step; s += 2) body += `<path d="M${r1(p.x - 10)} ${r1(yOfStep(top, s))}h20" stroke="currentColor" stroke-width="1.2"/>`;
          }
          if (p.acc != null) body += ACCIDENTAL[p.acc](p.x - 16, p.y);
          body += notehead(p.x, p.y, e.dur);
          if ([3, 1.5, 0.75].includes(e.dur)) {
            const dy = !perc && p.step % 2 === 0 ? -SP / 2 : 0; // a dot sits in a space
            body += `<circle cx="${r1(p.x + 10.5)}" cy="${r1(p.y + dy)}" r="1.9" fill="currentColor"/>`;
          }
          if (e.dur < 4 && !g) {
            const up = stemUpFor([p.step]);
            const len = 34 + (e.dur <= 0.25 ? 6 : 0);
            const sx = up ? p.x + 5.6 : p.x - 5.6;
            const y2 = up ? Math.min(p.y - len, staffMid) : Math.max(p.y + len, staffMid);
            body += `<path d="M${r1(sx)} ${r1(p.y + (up ? -1.5 : 1.5))}V${r1(y2)}" stroke="currentColor" stroke-width="1.3"/>`;
            if (e.dur < 1) body += flag(sx, y2, up, e.dur <= 0.25 ? 2 : 1);
          }
          parts[i] = { cls: 'fm-ev', i: myIndex, body };
        }
        for (const g of groups) {
          const members = g.map((i) => byIndex.get(i));
          const up = stemUpFor(members.map((m) => m.step));
          const dir = up ? -1 : 1;
          const xs = members.map((m) => (up ? m.x + 5.6 : m.x - 5.6));
          const ends = members.map((m) => m.y + dir * 32);
          let slope = (ends[ends.length - 1] - ends[0]) / (xs[xs.length - 1] - xs[0] || 1);
          slope = Math.max(-0.18, Math.min(0.18, slope));
          let y0 = ends[0];
          // Every stem at least 28 long, beam clear of every head.
          for (const [k, m] of members.entries()) {
            const yb = y0 + slope * (xs[k] - xs[0]);
            const need2 = m.y + dir * 28;
            if (up ? yb > need2 : yb < need2) y0 += need2 - yb;
          }
          const yAt = (xx) => y0 + slope * (xx - xs[0]);
          let beams = `<path d="M${r1(xs[0])} ${r1(yAt(xs[0]))}L${r1(xs[xs.length - 1])} ${r1(yAt(xs[xs.length - 1]))}" stroke="currentColor" stroke-width="5" stroke-linecap="butt"/>`;
          // Second beams for sixteenths: across runs of them, or a stub toward the neighbor.
          const sixteenth = g.map((i) => bar[i].dur === 0.25);
          for (let k = 0; k < g.length; k++) {
            if (!sixteenth[k]) continue;
            const off = -dir * 7.5;
            if (k + 1 < g.length && sixteenth[k + 1]) {
              beams += `<path d="M${r1(xs[k])} ${r1(yAt(xs[k]) + off)}L${r1(xs[k + 1])} ${r1(yAt(xs[k + 1]) + off)}" stroke="currentColor" stroke-width="5"/>`;
            } else if (!(k > 0 && sixteenth[k - 1])) {
              const toward = k > 0 ? -1 : 1;
              const x2 = xs[k] + toward * 9;
              beams += `<path d="M${r1(xs[k])} ${r1(yAt(xs[k]) + off)}L${r1(x2)} ${r1(yAt(x2) + off)}" stroke="currentColor" stroke-width="5"/>`;
            }
          }
          for (const [k, i] of g.entries()) {
            parts[i].body += `<path d="M${r1(xs[k])} ${r1(members[k].y + dir * 1.5)}V${r1(yAt(xs[k]))}" stroke="currentColor" stroke-width="1.3"/>`;
          }
          parts[g[g.length - 1]].body += beams;
          drawn.add(g);
        }
        for (const p of parts) if (p) out.push(`<g class="${p.cls}" data-i="${p.i}">${p.body}</g>`);
        x = bx + bw;
        // Barline: a thin line, and a final double line at the end of the piece.
        const last = index === piece.bars.length - 1;
        const y1 = perc ? staffMid - 12 : top;
        const y2 = perc ? staffMid + 12 : top + 4 * SP;
        out.push(last
          ? `<path d="M${r1(x - 7)} ${y1}V${y2}" stroke="currentColor" stroke-width="1.2"/><rect x="${r1(x - 4)}" y="${y1}" width="4" height="${y2 - y1}" fill="currentColor"/>`
          : `<path d="M${r1(x - 0.6)} ${y1}V${y2}" stroke="currentColor" stroke-width="1.2"/>`);
      }
      // The staff runs to the last barline (a short last line stops there).
      const end = fullLine ? W : r1(x);
      if (perc) out.push(`<path d="M0 ${staffMid}H${end}" stroke="currentColor" stroke-width="1"/>`);
      else for (let i = 0; i < 5; i++) out.push(`<path d="M0 ${top + i * SP}H${end}" stroke="currentColor" stroke-width="1"/>`);
    }

    // Ties, curving away from the stems (below the note when the stem points up).
    for (let k = 0; k < heads.length - 1; k++) {
      const a = heads[k];
      if (a.rest || !a.e.tie) continue;
      const b = heads[k + 1];
      if (!b || b.rest) continue;
      const below = perc ? true : a.step >= MIDDLE_STEP ? false : true;
      const dy = below ? 1 : -1;
      const arc = (x1, x2, y) => {
        const mx = (x1 + x2) / 2;
        const h = Math.min(9, 3 + (x2 - x1) * 0.06);
        return `<path fill="currentColor" d="M${r1(x1)} ${r1(y)}Q${r1(mx)} ${r1(y + dy * h)} ${r1(x2)} ${r1(y)}Q${r1(mx)} ${r1(y + dy * (h - 2.2))} ${r1(x1)} ${r1(y)}z"/>`;
      };
      const yA = a.y + dy * 6;
      if (a.line === b.line) out.push(arc(a.x + 4, b.x - 4, yA));
      else {
        out.push(arc(a.x + 4, W - 4, yA));
        out.push(arc(b.x - 26, b.x - 4, b.y + dy * 6));
      }
    }

    const H = lines.length * SYSTEM + (perc ? -36 : 0);
    const label = opts.label ? ` role="img" aria-label="${esc(opts.label)}"` : ' aria-hidden="true" focusable="false"';
    return `<svg class="fm-score${perc ? ' fm-percussion' : ''}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"${label}>${out.join('')}</svg>`;
  }

  return { renderScore };
});
