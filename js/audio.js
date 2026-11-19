// All sound is synthesised with Web Audio. No files.
// init() must run inside a user gesture (the PLAY tap); resume() after a fold,
// a pause or backgrounding.

export function createAudio() {
  let ctx = null, master, comp, dry, wet, buses = {};
  let white, pink, brown;
  let volume = 0.8;
  const loops = {};
  const A = { ready: false };

  function noiseBuffer(kind, secs = 2) {
    const n = ctx.sampleRate * secs, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  function impulse(secs = 1.8, decay = 2.6) {
    const n = ctx.sampleRate * secs, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  const now = () => ctx.currentTime;
  function src(buf, loop = false, rate = 1) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rate; return s; }
  function gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function env(g, t, a, peak, d, end = 0.0001) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
  function panner(x, y, z, ref = 1.2, roll = 1.4) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 40; p.rolloffFactor = roll;
    setPos(p, x, y, z); return p;
  }
  function setPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }
  // route: 'ui' (dry, no reverb) or 'world' (with room reverb); pos: [x,y,z] makes it spatial
  function out(node, route = 'world', pos = null) {
    let n = node;
    if (pos) { const p = panner(...pos); n.connect(p); n = p; }
    n.connect(route === 'ui' ? buses.ui : buses.world);
    return n;
  }

  A.init = function () {
    if (ctx) { A.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    master = gain(volume);
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.buffer = impulse();
    wet = gain(0.32); verb.connect(wet).connect(master);
    dry = gain(1); dry.connect(master);
    buses.world = gain(1); buses.world.connect(dry); buses.world.connect(verb);
    buses.ui = gain(1); buses.ui.connect(master);
    white = noiseBuffer('white'); pink = noiseBuffer('pink', 3); brown = noiseBuffer('brown', 3);
    // beds: tape hiss, room tone, rain on the roof
    const hiss = src(white, true); const hf = filt('highpass', 5200); loops.hiss = gain(0.012); hiss.connect(hf).connect(loops.hiss).connect(buses.ui); hiss.start();
    const tone = src(brown, true); const tf = filt('lowpass', 160); loops.tone = gain(0.08); tone.connect(tf).connect(loops.tone).connect(dry); tone.start();
    const rain = src(pink, true, 0.9); const rf = filt('bandpass', 1400, 0.45); loops.rain = gain(0.0); rain.connect(rf).connect(loops.rain).connect(dry); rain.start();
    const rain2 = src(brown, true, 1.3); const rf2 = filt('lowpass', 420); const rg2 = gain(0.5); rain2.connect(rf2).connect(rg2).connect(loops.rain); rain2.start();
    // the Guest: breath and a low growl, positioned on it
    loops.guestPan = panner(0, -50, 0, 1.0, 1.25); loops.guestPan.connect(buses.world);
    const br = src(pink, true, 0.6); const bf = filt('bandpass', 520, 1.4); loops.breath = gain(0); br.connect(bf).connect(loops.breath).connect(loops.guestPan); br.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.38; const lg = gain(0.5); lfo.connect(lg).connect(loops.breath.gain); lfo.start();
    const growl = ctx.createOscillator(); growl.type = 'sawtooth'; growl.frequency.value = 52; const gf = filt('lowpass', 240, 3); loops.growl = gain(0); growl.connect(gf).connect(loops.growl).connect(loops.guestPan); growl.start();
    const gw = ctx.createOscillator(); gw.frequency.value = 5.5; const gwg = gain(6); gw.connect(gwg).connect(growl.frequency); gw.start();
    loops.growlOsc = growl;
    // spatial hums
    loops.vending = humLoop([16.0, 1.0, 24.0], 120, 0.05);
    loops.tv = staticLoop([19.6, 1.0, 26.7], 0.045);
    loops.neon = humLoop([6.0, 2.2, 26.4], 100, 0.03, 'square');
    loops.buzz = gain(0); const bz = ctx.createOscillator(); bz.type = 'sawtooth'; bz.frequency.value = 120; const bzf = filt('bandpass', 2400, 6); bz.connect(bzf).connect(loops.buzz).connect(dry); bz.start();
    // heartbeat scheduler state
    loops.heart = { next: 0, rate: 0, vol: 0 };
    A.ready = true;
    A.resume();
  };
  function humLoop(pos, f, v, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const lp = filt('lowpass', 900); const g = gain(v);
    o.connect(lp); o2.connect(lp); lp.connect(g); out(g, 'world', pos); o.start(); o2.start();
    return g;
  }
  function staticLoop(pos, v) {
    const s = src(white, true); const f = filt('bandpass', 3200, 0.8); const g = gain(v);
    s.connect(f).connect(g); out(g, 'world', pos); s.start();
    return g;
  }

  A.resume = function () { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
  A.suspend = function () { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); };
  A.setVolume = function (v) { volume = v; if (master) master.gain.setTargetAtTime(v, now(), 0.05); };
  A.duck = function (amount, t = 0.4) { if (master) master.gain.setTargetAtTime(volume * amount, now(), t); };

  A.listener = function (x, y, z, fx, fz) {
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  };

  // Continuous levels, set every frame by the game.
  A.levels = function ({ rain = 0, vending = 0, tv = 0, neon = 0, buzz = 0, guest = null, breath = 0, growl = 0, heart = 0, heartRate = 1 }) {
    if (!ctx) return;
    const t = now();
    loops.rain.gain.setTargetAtTime(rain * 0.11, t, 0.4);
    loops.vending.gain.setTargetAtTime(vending * 0.05, t, 0.1);
    loops.tv.gain.setTargetAtTime(tv * 0.05, t, 0.1);
    loops.neon.gain.setTargetAtTime(neon * 0.025, t, 0.05);
    loops.buzz.gain.setTargetAtTime(buzz * 0.012, t, 0.2);
    if (guest) setPos(loops.guestPan, guest[0], guest[1], guest[2]);
    loops.breath.gain.setTargetAtTime(breath * 0.5, t, 0.3);
    loops.growl.gain.setTargetAtTime(growl * 0.22, t, 0.25);
    const h = loops.heart; h.vol = heart; h.rate = heartRate;
    if (heart > 0.02 && t >= h.next) {
      beat(t, heart); beat(t + 0.22, heart * 0.7);
      h.next = t + 60 / (60 + 70 * heartRate);
    }
  };
  function beat(t, v) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = gain(0); o.connect(g); out(g, 'ui'); env(g, t, 0.01, 0.5 * v, 0.18); o.start(t); o.stop(t + 0.3);
  }

  // ---- one-shots
  A.step = function (surface, loud = 0.5) {
    if (!ctx) return;
    const t = now(), s = src(white, false, 0.8 + Math.random() * 0.4);
    const hard = surface === ':' || surface === 'l' || surface === ',' || surface === 'D';
    const f = filt(hard ? 'bandpass' : 'lowpass', hard ? 1400 + Math.random() * 500 : 380 + Math.random() * 120, hard ? 1.2 : 0.8);
    const g = gain(0); s.connect(f).connect(g); out(g, 'world');
    env(g, t, 0.006, (hard ? 0.22 : 0.16) * loud, hard ? 0.09 : 0.14);
    s.start(t, Math.random() * 1.5, 0.3);
  };
  A.guestStep = function (pos, loud = 1) {
    if (!ctx) return;
    const t = now(), s = src(brown, false, 0.7);
    const f = filt('lowpass', 260); const g = gain(0); s.connect(f).connect(g); out(g, 'world', pos);
    env(g, t, 0.01, 0.9 * loud, 0.25); s.start(t, Math.random(), 0.4);
    const s2 = src(white, false, 0.5); const f2 = filt('bandpass', 700, 0.6); const g2 = gain(0); s2.connect(f2).connect(g2); out(g2, 'world', pos);
    env(g2, t + 0.05, 0.08, 0.12 * loud, 0.35); s2.start(t + 0.05, Math.random(), 0.5);
  };
  A.click = function (on = true) {
    if (!ctx) return;
    const t = now(), o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = on ? 2400 : 1700;
    const g = gain(0); o.connect(g); out(g, 'ui'); env(g, t, 0.002, 0.05, 0.03); o.start(t); o.stop(t + 0.06);
    const s = src(white); const f = filt('highpass', 3000); const g2 = gain(0); s.connect(f).connect(g2); out(g2, 'ui'); env(g2, t, 0.001, 0.06, 0.02); s.start(t, 0, 0.05);
  };
  A.creak = function (pos, opening = true) {
    if (!ctx) return;
    const t = now(), o = ctx.createOscillator(); o.type = 'sawtooth';
    const base = 180 + Math.random() * 120;
    o.frequency.setValueAtTime(base, t);
    for (let i = 1; i < 8; i++) o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.8), t + i * 0.09);
    const f = filt('bandpass', 900, 8); const g = gain(0); o.connect(f).connect(g); out(g, 'world', pos);
    env(g, t, 0.05, 0.12, 0.7); o.start(t); o.stop(t + 0.9);
    if (!opening) A.thud(pos, 0.6, 0.55);
  };
  A.thud = function (pos, v = 1, delay = 0) {
    if (!ctx) return;
    const t = now() + delay, o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = gain(0); o.connect(g); out(g, 'world', pos); env(g, t, 0.005, 0.6 * v, 0.25); o.start(t); o.stop(t + 0.4);
    const s = src(brown); const f = filt('lowpass', 600); const g2 = gain(0); s.connect(f).connect(g2); out(g2, 'world', pos); env(g2, t, 0.003, 0.5 * v, 0.2); s.start(t, Math.random(), 0.3);
  };
  A.rattle = function (pos) {
    if (!ctx) return;
    for (let i = 0; i < 5; i++) {
      const t = now() + i * 0.07 + Math.random() * 0.02, s = src(white); const f = filt('bandpass', 2200 + Math.random() * 800, 3); const g = gain(0);
      s.connect(f).connect(g); out(g, 'world', pos); env(g, t, 0.002, 0.16, 0.05); s.start(t, Math.random(), 0.08);
    }
  };
  A.pickup = function (kind = 'item') {
    if (!ctx) return;
    const t = now();
    A.click(true);
    if (kind === 'fuse' || kind === 'key') {
      for (const [f, d] of [[1320, 0], [1980, 0.05]]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = gain(0); o.connect(g); out(g, 'ui'); env(g, t + d, 0.004, 0.05, 0.5); o.start(t + d); o.stop(t + d + 0.6); }
    }
  };
  A.paper = function () {
    if (!ctx) return;
    const t = now(), s = src(pink, false, 1.4); const f = filt('bandpass', 3000, 0.6); const g = gain(0); s.connect(f).connect(g); out(g, 'ui');
    g.gain.setValueAtTime(0.0001, t); for (let i = 0; i < 6; i++) g.gain.linearRampToValueAtTime(Math.random() * 0.12, t + i * 0.05 + 0.03); g.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    s.start(t, Math.random(), 0.45);
  };
  A.clunk = function (pos) { A.thud(pos, 1.2); A.rattle(pos); };
  A.powerUp = function () {
    if (!ctx) return;
    const t = now(), o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(30, t); o.frequency.exponentialRampToValueAtTime(120, t + 2.2);
    const f = filt('lowpass', 500); const g = gain(0); o.connect(f).connect(g); out(g, 'world'); env(g, t, 1.6, 0.18, 1.6); o.start(t); o.stop(t + 3.4);
    for (let i = 0; i < 6; i++) A.thud(null, 0.25, 0.4 + i * 0.22);
  };
  A.burst = function (pos) {
    if (!ctx) return;
    const t = now(), s = src(white); const f = filt('highpass', 1800); const g = gain(0); s.connect(f).connect(g); out(g, 'world', pos);
    env(g, t, 0.002, 0.5, 0.12); s.start(t, Math.random(), 0.2);
    for (let i = 0; i < 7; i++) {
      const tt = t + 0.05 + Math.random() * 0.4, o = ctx.createOscillator(); o.frequency.value = 3000 + Math.random() * 4000;
      const gg = gain(0); o.connect(gg); out(gg, 'world', pos); env(gg, tt, 0.002, 0.04, 0.12); o.start(tt); o.stop(tt + 0.2);
    }
  };
  A.thunder = function (delay = 1.5, v = 1) {
    if (!ctx) return;
    const t = now() + delay, s = src(brown, false, 0.5); const f = filt('lowpass', 900); const g = gain(0); s.connect(f).connect(g); out(g, 'world');
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 3.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * v, t + 0.15); g.gain.exponentialRampToValueAtTime(0.25 * v, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    s.start(t, Math.random(), 4.6);
  };
  A.bell = function () {
    if (!ctx) return;
    const t = now();
    for (const [f, v] of [[1760, 0.12], [4420, 0.04], [2640, 0.05]]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = gain(0); o.connect(g); out(g, 'world', [6.4, 1.1, 19.35]); env(g, t, 0.002, v, 1.6); o.start(t); o.stop(t + 1.8); }
  };
  A.scream = function (pos) {
    if (!ctx) return;
    const t = now();
    for (const m of [1, 1.06, 1.49]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420 * m, t); o.frequency.exponentialRampToValueAtTime(180 * m, t + 1.3);
      const v = ctx.createOscillator(); v.frequency.value = 9; const vg = gain(25); v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + 1.5);
      const f = filt('bandpass', 1200, 1.5); const g = gain(0); o.connect(f).connect(g); out(g, 'world', pos); env(g, t, 0.05, 0.18, 1.3); o.start(t); o.stop(t + 1.5);
    }
  };
  A.stinger = function (v = 1) {
    if (!ctx) return;
    const t = now();
    for (const f of [92, 97.5, 138, 195.5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = filt('lowpass', 1400); const g = gain(0);
      o.connect(lp).connect(g); out(g, 'ui'); env(g, t, 0.02, 0.08 * v, 2.2); o.start(t); o.stop(t + 2.4);
    }
    const s = src(white); const f = filt('bandpass', 5000, 2); const g = gain(0); s.connect(f).connect(g); out(g, 'ui'); env(g, t, 0.01, 0.1 * v, 0.6); s.start(t, 0, 0.7);
  };
  A.jumpscare = function () {
    if (!ctx) return;
    const t = now();
    const s = src(white); const g = gain(0); s.connect(g); out(g, 'ui'); env(g, t, 0.005, 0.7, 0.9); s.start(t, 0, 1.0);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.9);
    const ws = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); } ws.curve = curve;
    const g2 = gain(0); o.connect(ws).connect(g2); out(g2, 'ui'); env(g2, t, 0.005, 0.35, 0.9); o.start(t); o.stop(t + 1.0);
  };
  A.rewind = function (secs = 1.6) {
    if (!ctx) return;
    const t = now(), o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(900, t + secs);
    const f = filt('bandpass', 1500, 2); const g = gain(0); o.connect(f).connect(g); out(g, 'ui');
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.1); g.gain.setValueAtTime(0.08, t + secs - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    o.start(t); o.stop(t + secs + 0.05);
    const s = src(white, true); const f2 = filt('bandpass', 4000, 1); const g2 = gain(0); s.connect(f2).connect(g2); out(g2, 'ui'); env(g2, t, 0.05, 0.06, secs); s.start(t); s.stop(t + secs + 0.1);
    A.click(false); setTimeout(() => A.click(true), secs * 1000);
  };
  A.static = function (secs = 0.35, v = 0.25) {
    if (!ctx) return;
    const t = now(), s = src(white); const g = gain(0); s.connect(g); out(g, 'ui'); env(g, t, 0.005, v, secs); s.start(t, Math.random(), secs + 0.05);
  };
  A.whisper = function (pos) {
    if (!ctx) return;
    const t = now(), s = src(pink, false, 1.8); const f = filt('bandpass', 2600, 4); const g = gain(0); s.connect(f).connect(g); out(g, 'world', pos);
    g.gain.setValueAtTime(0.0001, t); for (let i = 0; i < 10; i++) g.gain.linearRampToValueAtTime(Math.random() * 0.25, t + 0.08 * i + 0.04); g.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    s.start(t, Math.random(), 1.0);
  };
  return A;
}
