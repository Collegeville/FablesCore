/*!
 * FablesCore music: the "pick the score" component. Shows each choice as a card with its score,
 * a Play/Replay button with a listen counter, and handles choosing and checking in the core's
 * style. A game calls it from its render():
 *
 *   render(puzzle, el, play) {
 *     FablesMusic.pickTheScore(el, { id: puzzle.id, choices, answer, play, percussion, sound });
 *   }
 *
 * `answer` is only used once the puzzle is done (to show which card was right).
 * `sound` is { voice, countIn, intro, metronome } for the puzzle's playback.
 * © 2026 Michael A. Heroux. MIT License (code).
 */
(function (root, factory) {
  const api = factory(root, root.FablesMusic);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FablesMusic = Object.assign(root.FablesMusic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (root, M) {
  'use strict';

  const doc = root.document;
  let engine = null;
  let active = null; // the component on screen, for the keyboard
  const selected = new Map(); // puzzle id -> chosen card, kept across redraws

  const storage = (() => { try { return root.localStorage; } catch { return null; } })();
  const getNum = (k, d) => { try { const v = storage?.getItem(k); return v == null ? d : Number(v); } catch { return d; } };
  const setNum = (k, v) => { try { storage?.setItem(k, String(v)); } catch { /* private mode */ } };
  const listensKey = (id) => `fables-music:listens:${id}`;
  const listensFor = (id) => getNum(listensKey(id), 0);
  const getEngine = () => {
    if (!engine && M.createEngine) engine = M.createEngine({ volume: getNum('fables-music:volume', 0.8) });
    return engine;
  };

  function el(tag, attrs = {}, ...kids) {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  }

  function pickTheScore(area, opts) {
    const { id, choices, play, percussion = false, sound = {} } = opts;
    // Two bars to a line on a phone, so the staff stays big enough to read; four on wider screens.
    const barsPerLine = opts.barsPerLine ?? ((root.innerWidth || 800) < 600 ? 2 : 4);
    const done = play.done;
    const answer = done ? opts.answer : null;
    const eng = getEngine();
    const n = choices.length;
    let sel = selected.get(id) ?? null;
    if (sel != null && play.answers.includes(sel)) sel = null;
    let playheadOn = getNum('fables-music:playhead', 0) === 1;

    // ---- the player
    const listens = listensFor(id);
    const counter = el('span', { class: 'fm-listens', 'aria-live': 'polite' }, listenText(listens));
    const playBtn = el('button', { type: 'button', class: 'fables-button fm-play', 'aria-keyshortcuts': 'Space' },
      el('span', { 'aria-hidden': 'true' }, listens ? '↻ ' : '▶ '), listens ? 'Replay' : 'Play');
    const hint = el('p', { class: 'fm-hint' }, 'No sound? Turn up the volume. On an iPhone, check the silent switch too.');
    const volume = el('input', {
      type: 'range', min: '0', max: '1', step: '0.05', value: String(eng?.volume ?? 0.8), 'aria-label': 'Volume',
      oninput: (e) => { eng?.setVolume(Number(e.target.value)); setNum('fables-music:volume', e.target.value); },
    });
    // An optional beat click under the music (ClapFables): on by default where the puzzle says,
    // and the player's own choice once they change it.
    let metronome = !!sound.metronome;
    const saved = storage && (() => { try { return storage.getItem('fables-music:metronome'); } catch { return null; } })();
    if (opts.metronomeToggle && saved != null) metronome = saved === '1';
    const beat = opts.metronomeToggle && el('label', { class: 'fm-toggle fm-beat' }, el('input', {
      type: 'checkbox', checked: metronome,
      onchange: (e) => { metronome = e.target.checked; setNum('fables-music:metronome', metronome ? 1 : 0); },
    }), ' Click the beat underneath');
    const player = el('div', { class: 'fm-player' },
      playBtn, counter, el('label', { class: 'fm-volume' }, el('span', { 'aria-hidden': 'true' }, '🔈'), volume));
    if (!eng?.available) {
      player.replaceChildren(el('p', { class: 'fables-notice' }, "This browser can't play sound, so this puzzle can't be played here. Try another browser."));
    }

    async function listen(piece, { count = !done, card = null } = {}) {
      if (!eng) return;
      await eng.unlock();
      if (!eng.running) hint.classList.add('is-loud');
      if (count) {
        const k = listensFor(id) + 1;
        setNum(listensKey(id), k);
        counter.textContent = listenText(k);
        playBtn.replaceChildren(el('span', { 'aria-hidden': 'true' }, '↻ '), 'Replay');
        opts.onListen?.(k);
      }
      const svg = card?.querySelector('svg');
      const lit = [];
      const clear = () => { for (const g of lit.splice(0)) g.classList.remove('fm-now'); };
      area.classList.add('fm-is-playing');
      await eng.play(piece, {
        ...sound,
        metronome,
        voice: percussion ? 'click' : sound.voice ?? 'piano',
        onNote: (e) => {
          if (!svg || !playheadOn) return;
          clear();
          for (const i of e.events) {
            const g = svg.querySelector(`[data-i="${i}"]`);
            if (g) { g.classList.add('fm-now'); lit.push(g); }
          }
        },
      });
      clear();
      area.classList.remove('fm-is-playing');
    }
    playBtn.addEventListener('click', () => listen(opts.piece ?? choices[opts.answerForSound ?? 0], {}));

    // ---- the cards
    const cards = choices.map((piece, i) => {
      const tried = play.answers.includes(i);
      const isAnswer = done && i === answer;
      const label = done ? M.describe(piece, { percussion }) : null;
      const svg = M.renderScore(piece, { percussion, barsPerLine, label });
      const state = isAnswer ? 'is-answer' : tried ? 'is-tried' : sel === i ? 'is-selected' : '';
      const badge = isAnswer
        ? el('span', { class: 'fm-badge ok' }, el('span', { 'aria-hidden': 'true' }, '✓ '), play.solved ? 'The answer' : 'This was the answer')
        : tried ? el('span', { class: 'fm-badge no' }, el('span', { 'aria-hidden': 'true' }, '✕ '), 'Not this one') : null;
      const card = el('li', { class: `fm-card ${state}` });
      const choose = el('button', {
        type: 'button',
        class: 'fm-choose',
        disabled: done || tried,
        'aria-pressed': !done && !tried ? String(sel === i) : null,
        'aria-label': `Choice ${i + 1} of ${n}${tried ? ', not this one' : ''}${isAnswer ? ', the answer' : ''}${sel === i && !done ? ', selected' : ''}`,
        onclick: () => select(i),
      }, el('span', { class: 'fm-num', 'aria-hidden': 'true' }, String(i + 1)), el('span', { class: 'fm-svg', html: svg }));
      card.append(choose);
      if (badge) card.append(badge);
      if (done) {
        card.append(el('div', { class: 'fm-after' },
          el('button', { type: 'button', class: 'fm-hear', onclick: () => listen(piece, { count: false, card }) },
            el('span', { 'aria-hidden': 'true' }, '▶ '), `Hear choice ${i + 1}`)));
      }
      return card;
    });
    const list = el('ol', { class: `fm-cards${percussion ? ' fm-short' : ''}`, 'aria-label': 'Choices' }, cards);

    const check = el('button', {
      type: 'button', class: 'fables-button fm-check', disabled: sel == null, 'aria-keyshortcuts': 'Enter',
      onclick: () => { if (sel != null) { const s = sel; selected.delete(id); play.submit(s); } },
    }, sel == null ? 'Choose a score' : `Check choice ${sel + 1}`);

    function select(i) {
      if (done || play.answers.includes(i)) return;
      sel = i;
      selected.set(id, i);
      cards.forEach((c, k) => {
        if (c.classList.contains('is-tried')) return;
        c.classList.toggle('is-selected', k === i);
        const b = c.querySelector('.fm-choose');
        b.setAttribute('aria-pressed', String(k === i));
        b.setAttribute('aria-label', `Choice ${k + 1} of ${n}${k === i ? ', selected' : ''}`);
      });
      check.disabled = false;
      check.textContent = `Check choice ${i + 1}`;
    }

    const parts = [player, beat, hint].filter(Boolean);
    if (!done) {
      parts.push(el('p', { class: 'fm-prompt' }, opts.prompt ?? 'Listen, then choose the score that matches what you hear.'), list,
        el('div', { class: 'fm-actions' }, check));
    } else {
      const toggle = el('label', { class: 'fm-toggle' }, el('input', {
        type: 'checkbox', checked: playheadOn,
        onchange: (e) => { playheadOn = e.target.checked; setNum('fables-music:playhead', playheadOn ? 1 : 0); },
      }), ' Show each note as it plays');
      parts.push(el('p', { class: 'fm-prompt' }, 'Hear each choice to find what changed.'), toggle, list);
    }
    area.append(...parts);

    active = {
      area,
      space: () => playBtn.isConnected && !playBtn.disabled && playBtn.click(),
      move: (d) => {
        const open = [...Array(n).keys()].filter((i) => !play.answers.includes(i));
        if (done || !open.length) return;
        const at = open.indexOf(sel);
        select(open[at < 0 ? (d > 0 ? 0 : open.length - 1) : (at + d + open.length) % open.length]);
        list.children[sel]?.querySelector('.fm-choose')?.focus();
      },
      pick: (i) => i < n && select(i),
      enter: () => !check.disabled && !done && check.click(),
    };
  }

  const listenText = (k) => (k === 0 ? 'Not played yet' : k === 1 ? 'Listened once' : `Listened ${k} times`);

  // Keyboard: Space plays or replays, arrows and number keys choose, Enter checks.
  if (doc) {
    doc.addEventListener('keydown', (e) => {
      if (!active || !active.area.isConnected || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const onOther = t && t.tagName === 'BUTTON' && !t.classList.contains('fm-choose');
      if (e.key === ' ' && !onOther) { e.preventDefault(); active.space(); }
      else if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); active.move(1); }
      else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); active.move(-1); }
      else if (/^[1-9]$/.test(e.key)) active.pick(Number(e.key) - 1);
      else if (e.key === 'Enter' && !onOther) { e.preventDefault(); active.enter(); }
    });
  }

  return { pickTheScore, listensFor };
});
