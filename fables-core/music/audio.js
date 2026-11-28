/*!
 * FablesCore music: a small Web Audio engine. Synthesized sounds only (no sample files): a soft
 * piano-like voice for melodies, a woodblock click for rhythms, and a quieter tick for count-ins.
 * © 2026 Michael A. Heroux. MIT License (code).
 *
 * Timing uses a lookahead scheduler on AudioContext.currentTime: a timer wakes every 25 ms and
 * hands the audio clock every sound due in the next 120 ms, so a busy page never makes a note late.
 *
 *   const engine = FablesMusic.createEngine();
 *   await engine.unlock();                      // inside a tap or key press
 *   engine.play(piece, { voice: 'piano', countIn: true, intro: [...], onNote, onEnd });
 *   engine.stop();
 */
(function (root, factory) {
  const api = factory(root, typeof module === 'object' && module.exports ? require('./model.js') : root.FablesMusic);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FablesMusic = Object.assign(root.FablesMusic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (root, M) {
  'use strict';

  const LOOKAHEAD = 0.12; // seconds of sound handed to the audio clock ahead of time
  const TICK_MS = 25;
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  // The timeline a piece plays as: an optional intro (orientation chord, scale or tonic), an
  // optional count-in bar, then the piece. Times are in beats of a quarter note; `tempo` is
  // quarter notes per minute. Pure, so it can be tested without audio.
  //   intro: [{ at, dur, midi: [..] }]  played before the count-in, at the same tempo
  function timeline(piece, { countIn = true, intro = [], metronome = false, tempo } = {}) {
    const bpm = tempo ?? piece.tempo ?? 90;
    const out = [];
    let t = 0;
    for (const n of intro) out.push({ kind: 'intro', at: n.at, dur: n.dur, midi: [].concat(n.midi) });
    if (intro.length) t = Math.max(...intro.map((n) => n.at + n.dur)) + 1;
    const bar = M.barLength(piece.time);
    const beat = M.beatLength(piece.time);
    if (countIn) {
      for (let b = 0; b < bar - 1e-9; b += beat) out.push({ kind: 'count', at: t + b, accent: b === 0 });
      t += bar;
    }
    const start = t;
    if (metronome) {
      for (let b = 0; b < piece.bars.length * bar - 1e-9; b += beat) out.push({ kind: 'tick', at: start + b, accent: Math.abs((b % bar)) < 1e-9 });
    }
    let index = 0;
    const percussion = piece.bars.some((bar2) => bar2.some((e) => e.name === 'x'));
    const notes = M.audible(piece);
    // Map each sounded note back to the first written event it starts on, for the playhead.
    const written = M.events(piece).map((e, i) => ({ ...e, i }));
    for (const [at, dur, midi] of notes) {
      const first = written.find((e) => !e.rest && Math.abs(e.at - at) < 1e-9);
      const covers = written.filter((e) => !e.rest && e.at >= at - 1e-9 && e.at < at + dur - 1e-9).map((e) => e.i);
      out.push({ kind: percussion ? 'click' : 'note', at: start + at, dur, midi, index: index++, events: covers.length ? covers : [first?.i] });
    }
    const end = start + piece.bars.length * bar;
    return { events: out.sort((a, b) => a.at - b.at), bpm, start, end };
  }

  function createEngine({ volume = 0.8 } = {}) {
    const AC = root.AudioContext || root.webkitAudioContext;
    let ctx = null;
    let master = null;
    let silent = null;
    let timer = null;
    let session = 0;
    let listening = 0;

    function context() {
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC({ latencyHint: 'interactive' });
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
      }
      return ctx;
    }

    // Must run inside a user gesture. On iPhone, Web Audio follows the silent switch unless media
    // is playing, so a looping silent <audio> element is started too, and the audio session is
    // marked as playback where Safari supports it.
    async function unlock() {
      const c = context();
      if (!c) return false;
      try { if (root.navigator?.audioSession) root.navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
      if (c.state !== 'running') { try { await c.resume(); } catch { /* blocked */ } }
      if (!silent && root.document) {
        silent = root.document.createElement('audio');
        silent.setAttribute('x-webkit-airplay', 'deny');
        silent.preload = 'auto';
        silent.loop = true;
        silent.src = silentWav();
        silent.volume = 0.01;
      }
      try { await silent?.play(); } catch { /* not allowed yet; Web Audio still plays */ }
      // A one-sample buffer, played now, finishes the unlock on older iOS.
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
      return c.state === 'running';
    }

    // ---- voices
    function piano(midi, when, seconds, gain = 0.32) {
      const f = hz(midi);
      const out = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(9000, f * 9), when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), when + 0.9);
      filter.connect(out);
      out.connect(master);
      const len = Math.max(0.3, seconds);
      out.gain.setValueAtTime(0.0001, when);
      out.gain.linearRampToValueAtTime(gain, when + 0.008);
      out.gain.exponentialRampToValueAtTime(gain * 0.45, when + 0.25);
      out.gain.exponentialRampToValueAtTime(gain * 0.2, when + len);
      out.gain.exponentialRampToValueAtTime(0.0001, when + len + 0.35);
      for (const [type, mult, level] of [['triangle', 1, 1], ['sine', 2, 0.28], ['sine', 3, 0.08]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = f * mult;
        g.gain.value = level;
        o.connect(g).connect(filter);
        o.start(when);
        o.stop(when + len + 0.4);
      }
    }
    function click(when, { gain = 0.7, pitch = 1600, length = 0.06 } = {}) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = pitch;
      bp.Q.value = 6;
      o.type = 'square';
      o.frequency.setValueAtTime(pitch, when);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.55, when + length);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + length);
      o.connect(bp).connect(g).connect(master);
      o.start(when);
      o.stop(when + length + 0.02);
    }
    const woodblock = (when) => click(when, { gain: 0.9, pitch: 1150, length: 0.09 });
    const tick = (when, accent) => click(when, { gain: accent ? 0.32 : 0.2, pitch: accent ? 2600 : 2100, length: 0.03 });

    // Plays a piece. Returns a promise that settles when it ends or is stopped.
    function play(piece, { voice = 'piano', countIn = true, intro = [], metronome = false, tempo, onNote, onEnd } = {}) {
      const c = context();
      if (!c) { onEnd?.({ ok: false }); return Promise.resolve(false); }
      stop();
      const id = ++session;
      const plan = timeline(piece, { countIn, intro, metronome, tempo });
      const sec = 60 / plan.bpm;
      const t0 = c.currentTime + 0.12;
      listening++;
      let next = 0;
      return new Promise((resolve) => {
        const pump = () => {
          if (id !== session) return;
          const horizon = c.currentTime + LOOKAHEAD;
          while (next < plan.events.length && t0 + plan.events[next].at * sec < horizon) {
            const e = plan.events[next++];
            const when = t0 + e.at * sec;
            if (e.kind === 'intro') for (const m of e.midi) piano(m, when, e.dur * sec, 0.22);
            else if (e.kind === 'count' || e.kind === 'tick') tick(when, e.accent);
            else if (e.kind === 'click') woodblock(when);
            else if (voice === 'click') woodblock(when);
            else piano(e.midi, when, e.dur * sec);
            if (onNote && (e.kind === 'note' || e.kind === 'click')) {
              const delay = Math.max(0, (when - c.currentTime) * 1000);
              root.setTimeout(() => { if (id === session) onNote(e); }, delay);
            }
          }
          if (next >= plan.events.length && c.currentTime > t0 + plan.end * sec + 0.3) {
            finish(true);
          }
        };
        const finish = (ok) => {
          root.clearInterval(timer);
          timer = null;
          if (id === session) session++;
          onEnd?.({ ok });
          resolve(ok);
        };
        stopCurrent = () => finish(false);
        timer = root.setInterval(pump, TICK_MS);
        pump();
      });
    }
    let stopCurrent = null;
    function stop() {
      if (timer) { const s = stopCurrent; stopCurrent = null; s?.(); }
      if (master && ctx) {
        // Cut anything already handed to the audio clock.
        const old = master;
        old.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
        root.setTimeout(() => old.disconnect(), 400);
      }
    }
    function setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = volume;
    }

    return {
      available: !!AC,
      unlock,
      play,
      stop,
      setVolume,
      get volume() { return volume; },
      get playing() { return !!timer; },
      get running() { return ctx?.state === 'running'; },
      get plays() { return listening; },
    };
  }

  // A tenth of a second of silence as a WAV data URL, for the iPhone silent-switch workaround.
  function silentWav() {
    const rate = 8000;
    const n = 800;
    const bytes = new Uint8Array(44 + n);
    const view = new DataView(bytes.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); view.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    str(36, 'data'); view.setUint32(40, n, true);
    bytes.fill(128, 44);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return `data:audio/wav;base64,${typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')}`;
  }

  return { createEngine, timeline, silentWav };
});
