// NIGHT AUDIT — Tape 01. Game loop, player, scripting, checkpoints.
import * as THREE from 'three';
import * as L from './level.js';
import { buildWorld } from './world.js';
import { createPhysics } from './physics.js';
import { createCamera } from './post.js';
import { createGuest } from './guest.js';
import { createAudio } from './audio.js';
import { watchLayout, setFoldOverride } from './layout.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import * as S from './story.js';
import { devlog } from './devlog.js';

const Q = new URLSearchParams(location.search);
const DEV = Q.has('dev');
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const settings = Object.assign({ sens: 1, invertY: false, volume: 0.8, vhs: 1, reduceFlash: matchMedia('(prefers-reduced-motion: reduce)').matches, bright: 1, calibrated: false, fold: 'auto' }, store.get('na.settings', {}));
setFoldOverride(Q.get('fold') || settings.fold);
const saveSettings = () => store.set('na.settings', settings);

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.05);
const camera = new THREE.PerspectiveCamera(58, 4 / 3, 0.04, 60);
camera.rotation.order = 'YXZ';
scene.add(camera);
const lamp = new THREE.SpotLight(0xffe2b4, 0, 17, 0.58, 0.6, 2);
lamp.castShadow = true;
lamp.shadow.mapSize.set(512, 512);
lamp.shadow.bias = -0.0008; lamp.shadow.normalBias = 0.03;
lamp.shadow.camera.near = 0.15; lamp.shadow.camera.far = 16;
const lampRig = new THREE.Object3D(); lampRig.rotation.order = 'YXZ'; scene.add(lampRig);
lampRig.add(lamp); lamp.position.set(0.1, -0.12, 0);
lampRig.add(lamp.target); lamp.target.position.set(0, -0.13, -1);
const ir = new THREE.PointLight(0xffffff, 0, 7.5, 2); camera.add(ir); ir.position.set(0, 0.05, 0.05);
const post = createCamera(renderer, 400, 300);

// ------------------------------------------------------------------ state
let state = 'loading'; // loading title calib play paused caught rewind ending end
let pauseKind = null;
let world, physics, guest, layout = { mode: 'handheld', W: innerWidth, H: innerHeight, vf: { x: 0, y: 0, w: 320, h: 240 }, stick: null };
let clock = 0, G = null, checkpoint = null, pendingCP = null;
const timers = [];
const P = {};
function resetPlayer() {
  Object.assign(P, { x: L.START.x, z: L.START.z, yaw: L.START.yaw, pitch: -0.05, vx: 0, vz: 0, speed: 0, bobPh: 0, roll: 0, lampOn: false, battery: 100, hidden: null,
    fuses: new Set(), key: false, notes: P.notes || new Set(), running: false, moving: false, light: 0.2, stepAcc: 0, lampYaw: L.START.yaw, lampPitch: 0, prevYaw: L.START.yaw, lightT: 0 });
}
resetPlayer();
const fx = { gain: 2.4, night: 1, interf: 0, glitch: 0, rewind: 0, fade: 0, flash: 0, shake: 0 };
const lights = { neonT: 0, neonDip: false, vendT: 3, vendStutter: 0, ltT: 14, lf: -1, power: 0, powerT: 0, delay: {}, burst: new Set(), preBurst: new Map() };
const explored = new Set();

// ------------------------------------------------------------------ UI, input, audio, layout
const ui = createUI({ onAction, onSetting });
const audio = createAudio();
const input = createInput({ layer: $('touch'), vf: $('vf'), stickBase: $('stick-base'), stickKnob: $('stick-knob'), getLayout: () => layout });
let dprCap = 1.5;
function resizeCanvas() {
  const r = layout.vf, dpr = Math.min(devicePixelRatio || 1, dprCap);
  renderer.setSize(Math.max(64, Math.round(r.w * dpr)), Math.max(48, Math.round(r.h * dpr)), false);
}
const lw = watchLayout((next, prev) => {
  layout = next;
  ui.applyLayout(next, state === 'play' || (state === 'paused' && pauseKind !== 'title'));
  resizeCanvas();
  input.releaseAll();
  if (prev.mode && prev.mode !== next.mode && state === 'play') pauseGame('fold');
  devlog('layout', { mode: next.mode, W: next.W, H: next.H, vf: next.vf, foldX: next.foldX, foldY: next.foldY, source: next.source, posture: next.posture, segments: next.segments });
}, () => { if (state === 'play') input.releaseAll(); });
layout = lw.get();
ui.bindSettings(settings);

// ------------------------------------------------------------------ boot
ui.only('s-loading');
ui.loading('▶ LOADING TAPE…');
setTimeout(boot, 30);
function boot() {
  try {
    world = buildWorld(renderer);
    scene.add(world.group);
    physics = createPhysics(world);
    guest = createGuest(scene, world, physics, audio);
    guest.onDoor = () => {};
    devlog('boot', { ua: navigator.userAgent, verts: world.verts, meshes: world.meshes, timings: world.timings, three: THREE.REVISION, layout: layout.mode, dev: DEV, secure: isSecureContext, standalone: matchMedia('(display-mode: standalone)').matches });
    resetWorld();
    // compile shaders before the first frame that needs them
    P.lampOn = true; applyCameraAndLamp(0); lamp.intensity = 1; renderer.compile(scene, camera); post.render(scene, camera); P.lampOn = false; lamp.intensity = 0;
    checkpoint = store.get('na.save', null);
    ui.setContinue(!!checkpoint);
    toTitle();
    requestAnimationFrame(frame);
    if (DEV) exposeDev();
    if (DEV && (Q.get('scene') || BOT)) {
      const go = () => { settings.calibrated = true; startGame(false); applyScene(Q.get('scene')); };
      if (VIDEO) setTimeout(go, 5000); else go();
    }
  } catch (e) {
    ui.loading('TAPE ERROR: ' + (e.message || e));
    devlog('boot-error', e);
    throw e;
  }
}

// ------------------------------------------------------------------ world helpers
const doorById = (id) => world.doors.find((d) => d.id === id);
const itemById = (id) => world.items.find((i) => i.id === id);
function resetWorld() {
  for (const d of world.doors) { const def = L.DOORS.find((x) => x.id === d.id); d.locked = def.locked; d.open = d.target = 0; d.speed = 1.6; }
  for (const it of world.items) { it.taken = false; it.group.visible = true; }
  world.setSlide(0);
  lights.power = 0; lights.powerT = 0; lights.burst.clear(); lights.preBurst.clear();
  for (const ch of L.POWER_CHANNELS) world.chan[ch] = 0;
  guest.despawn(); guest.phase = 0;
  timers.length = 0;
  pendingCP = null;
}
function later(sec, fn) { timers.push({ t: (G?.tapeTime ?? 0) + sec, fn }); }

// ------------------------------------------------------------------ game flow
function toTitle() {
  state = 'title'; pauseKind = null;
  input.setEnabled(false); ui.showButtons(false); ui.clearCaptions(); ui.prompt(null); ui.slats(false);
  resetWorld(); resetPlayer();
  ui.setContinue(!!checkpoint);
  ui.only('s-title');
}
function startGame(fromSave) {
  audio.init(); audio.setVolume(settings.volume);
  if (!settings.calibrated) { calibThen = () => startGame(fromSave); openCalib(); return; }
  try { history.pushState({ na: 1 }, ''); } catch { /* ignore */ }
  ui.only(null);
  G = { obj: 0, flags: {}, tapeTime: 0, rewinds: 0 };
  resetWorld(); resetPlayer();
  P.notes = new Set();
  explored.clear();
  if (fromSave && checkpoint) {
    restore(checkpoint);
    ui.big('▶ PLAY', 1400);
  } else {
    store.del('na.save'); checkpoint = null;
    ui.big('▶ REC', 1600);
    later(1.6, () => ui.say(S.LINES.intro));
    later(9.5, () => objectiveToast());
    later(7.0, () => startLightning());
    saveCheckpoint('start');
  }
  state = 'play';
  ui.applyLayout(layout, true);
  input.setEnabled(true);
  updateLedger();
  devlog('start', { fromSave: !!fromSave });
}
function pauseGame(kind = 'menu', why = kind) {
  if (state !== 'play') return;
  devlog('pause', { kind, why });
  state = 'paused'; pauseKind = kind;
  input.setEnabled(false); audio.duck(0.2, 0.15);
  if (kind === 'menu' || kind === 'fold') {
    $('pausewhy').textContent = kind === 'fold' ? '❚❚ PAUSED · FOLD DETECTED' : '❚❚ PAUSE';
    ui.only('s-pause');
  }
}
function resumeGame() {
  if (state !== 'paused') return;
  if (ui.ledgerOpen) ui.closeLedgerOverlay();
  ui.only(null);
  state = 'play'; pauseKind = null;
  audio.resume(); audio.duck(1, 0.2);
  input.clearPresses(); input.setEnabled(true);
  ui.big('▶ PLAY', 900);
}

// ------------------------------------------------------------------ checkpoints
function snapshot(kind) {
  const at = P.hidden ? { x: P.hidden.exit[0], z: P.hidden.exit[1] } : { x: P.x, z: P.z };
  return {
    v: 1, kind, x: at.x, z: at.z, yaw: P.yaw, battery: Math.max(P.battery, 55), fuses: [...P.fuses], key: P.key,
    notes: [...P.notes], obj: G.obj, flags: { ...G.flags }, tapeTime: G.tapeTime, rewinds: G.rewinds,
    doors: world.doors.map((d) => [d.id, d.target, d.locked]), taken: world.items.filter((i) => i.taken).map((i) => i.id),
    guest: { phase: guest.phase, mode: kind === 'hunt' ? 'hunt' : kind === 'power' ? 'none' : guest.active || G.respawn ? 'patrol' : 'none' },
  };
}
function saveCheckpoint(kind) {
  if (G) { G.cpDeaths = 0; guest.mercy = false; }
  checkpoint = snapshot(kind);
  store.set('na.save', checkpoint);
  devlog('checkpoint', { kind, obj: G.obj, x: +P.x.toFixed(1), z: +P.z.toFixed(1), fuses: [...P.fuses] });
}
function requestCheckpoint(kind) { pendingCP = { kind, t: 0 }; }
function restore(cp) {
  resetWorld();
  Object.assign(G, { obj: cp.obj, flags: { ...cp.flags }, tapeTime: cp.tapeTime, rewinds: G.rewinds ?? cp.rewinds ?? 0, respawn: null });
  P.x = cp.x; P.z = cp.z; P.yaw = cp.yaw; P.pitch = 0; P.vx = P.vz = 0; P.lampYaw = cp.yaw; P.prevYaw = cp.yaw;
  P.battery = cp.battery; P.fuses = new Set(cp.fuses); P.key = cp.key; P.hidden = null; P.lampOn = false;
  for (const n of cp.notes) P.notes.add(n);
  for (const [id, target, locked] of cp.doors) { const d = doorById(id); d.target = d.open = target; d.locked = locked; }
  for (const id of cp.taken) { const it = itemById(id); it.taken = true; it.group.visible = false; }
  guest.phase = cp.guest.phase;
  G.flags.lurkDone = true;
  if (G.flags.power) {
    lights.power = 1; lights.powerT = 10;
    G.flags.finale = false;
    later(2.0, () => startFinale());
  }
  if (cp.guest.mode === 'hunt') spawnHunt();
  else if (cp.guest.mode === 'patrol') { guest.despawn(); guest.phase = cp.guest.phase; G.respawn = { t: 14, x: P.x, z: P.z }; }
  ui.lampButton(false); ui.slats(false); ui.prompt(null);
  updateLedger();
}
// After a rewind the Guest comes back somewhere you aren't heading: far away,
// out of sight, and preferably behind the way you've been moving.
function spawnBehind(fromX, fromZ) {
  const mx = P.x - fromX, mz = P.z - fromZ, ml = Math.hypot(mx, mz);
  let best = null, bs = -1e9;
  for (const [x, z] of L.POIS) {
    if (x < 7 && z > 10 && z < 16 && doorById('office').locked) continue;
    const path = physics.findPath(P.x, P.z, x, z);
    const d = physics.pathLength(path);
    if (!Number.isFinite(d) || d < 14) continue;
    if (physics.los(P.x, P.z, x, z) && Math.hypot(x - P.x, z - P.z) < 18) continue;
    const behind = ml > 2 ? -((x - P.x) * mx + (z - P.z) * mz) / (Math.hypot(x - P.x, z - P.z) * ml) : 0;
    const score = d + behind * 14;
    if (score > bs) { bs = score; best = [x, z]; }
  }
  if (!best) { spawnSafe(); return; }
  guest.spawn(best[0], best[1], 0, 'patrol');
  guest.waitT = 3;
  devlog('respawn', { at: best, player: [+P.x.toFixed(1), +P.z.toFixed(1)] });
}
function spawnSafe() {
  // the farthest place the Guest can walk to, at least 14 m away
  let best = null, bd = -1;
  for (const [x, z] of L.POIS) {
    if (x < 7 && z > 10 && z < 16 && doorById('office').locked) continue;
    const path = physics.findPath(P.x, P.z, x, z);
    const d = physics.pathLength(path);
    if (Number.isFinite(d) && d > bd) { bd = d; best = [x, z]; }
  }
  const [x, z] = best || L.GUEST_HOME;
  guest.spawn(x, z, 0, 'patrol');
  guest.waitT = 6;
}

// ------------------------------------------------------------------ lights
function startLightning() { lights.lf = 0; audio.thunder(0.9 + Math.random() * 1.8, 0.8 + Math.random() * 0.4); }
const LF = [[0, 0], [0.03, 1], [0.09, 0.15], [0.14, 0.85], [0.22, 0.25], [0.32, 0.5], [0.7, 0]];
function lightningValue(t) {
  for (let i = 1; i < LF.length; i++) if (t <= LF[i][0]) { const a = LF[i - 1], b = LF[i]; return lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0])); }
  return -1;
}
function updateLights(dt) {
  const c = world.chan;
  lights.neonT -= dt;
  if (lights.neonT <= 0) { lights.neonDip = Math.random() < 0.3; lights.neonT = lights.neonDip ? 0.04 + Math.random() * 0.14 : 0.3 + Math.random() * 3.2; }
  c[L.CH.neon] = lights.neonDip ? 0.22 : 1;
  lights.vendT -= dt;
  if (lights.vendT <= 0) { lights.vendStutter = 0.4; lights.vendT = 6 + Math.random() * 10; }
  lights.vendStutter = Math.max(0, lights.vendStutter - dt);
  c[L.CH.vending] = lights.vendStutter > 0 ? (Math.random() < 0.5 ? 0.1 : 0.9) : 0.9;
  c[L.CH.exit] = 1;
  c[L.CH.tv] = G?.flags.tvOff ? 0 : 0.55 + 0.45 * Math.random();
  c[L.CH.lantern] = 0.9 + 0.1 * Math.sin(clock * 7.3) * Math.sin(clock * 2.9);
  // lightning
  if (state === 'play' || state === 'title' || state === 'calib') {
    lights.ltT -= dt;
    if (lights.ltT <= 0 && !G?.flags.finale) { startLightning(); lights.ltT = 24 + Math.random() * 30; }
  }
  if (lights.lf >= 0) {
    lights.lf += dt;
    const v = lightningValue(lights.lf);
    if (v < 0) { lights.lf = -1; c[L.CH.lightning] = 0; } else c[L.CH.lightning] = v * (settings.reduceFlash ? 0.3 : 1);
  } else c[L.CH.lightning] = 0;
  fx.flash = settings.reduceFlash ? 0 : c[L.CH.lightning] * 0.025;
  // power: fluorescents stutter on, then hum
  if (lights.power > 0) lights.powerT += dt;
  for (const ch of L.POWER_CHANNELS) {
    let v = 0;
    if (lights.power > 0 && !lights.burst.has(ch)) {
      const d = lights.delay[ch] ?? (lights.delay[ch] = Math.random() * 1.6);
      const t = lights.powerT - d;
      if (t > 0) v = t < 0.7 ? (Math.random() < 0.45 ? 1 : 0.05) : 0.96 + 0.04 * Math.sin(clock * 120 + ch);
      const pb = lights.preBurst.get(ch);
      if (pb !== undefined && clock > pb) v *= Math.random() < 0.4 ? 1.3 : 0.15;
    }
    c[ch] = v;
  }
}
function burst(chs) {
  for (const ch of chs) {
    if (lights.burst.has(ch)) continue;
    lights.burst.add(ch); lights.preBurst.delete(ch);
    const fix = L.FIXTURES.filter((f) => f[3] === ch);
    fix.slice(0, 2).forEach((f, i) => setTimeout(() => audio.burst([f[0], 2.6, f[1]]), i * 140));
    if (!fix.length) audio.burst([P.x, 2.6, P.z]);
    const near = fix.some((f) => Math.hypot(f[0] - P.x, f[1] - P.z) < 9);
    if (near) { fx.glitch = Math.max(fx.glitch, 0.5); fx.shake = 0.25; }
  }
}

// ------------------------------------------------------------------ player
const WALK = 1.75, RUN = 3.35, RAD = 0.27, EYE = 1.6;
function updatePlayer(dt) {
  const mv = input.readMove();
  const look = input.consumeLook();
  const tk = 0.0047 * settings.sens, mk = 0.0024 * settings.sens;
  P.prevYaw = P.yaw;
  P.yaw -= look.dx * tk + look.mdx * mk + mv.turn * 2.2 * dt;
  const dy = look.dy * tk + look.mdy * mk;
  P.pitch -= settings.invertY ? -dy : dy;
  P.pitch = clamp(P.pitch, -1.15, 1.05);
  if (P.hidden) {
    P.yaw = P.hidden.yaw + clamp(angDiff(P.hidden.yaw, P.yaw), -0.8, 0.8);
    P.pitch = clamp(P.pitch, -0.45, 0.35);
    P.vx = P.vz = P.speed = 0; P.moving = P.running = false;
    return;
  }
  const fX = -Math.sin(P.yaw), fZ = -Math.cos(P.yaw), rX = Math.cos(P.yaw), rZ = -Math.sin(P.yaw);
  const f = -mv.y, s = mv.x;
  let speed = mv.mag < 0.12 ? 0 : (mv.run ? RUN : WALK) * Math.min(1, mv.mag * 1.15);
  let dx = fX * f + rX * s, dz = fZ * f + rZ * s;
  const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
  const acc = Math.min(1, dt * 10);
  P.vx += (dx * speed - P.vx) * acc; P.vz += (dz * speed - P.vz) * acc;
  const p = { x: P.x + P.vx * dt, z: P.z + P.vz * dt };
  physics.collide(p, RAD);
  const moved = Math.hypot(p.x - P.x, p.z - P.z);
  P.x = p.x; P.z = p.z;
  P.speed = lerp(P.speed, moved / Math.max(dt, 1e-3), Math.min(1, dt * 12));
  P.moving = P.speed > 0.3; P.running = mv.run && P.speed > 2.2;
  P.stepAcc += moved;
  if (moved > 0.01 && input.st.stick) ui.stickUsed();
  if (P.stepAcc > (P.running ? 0.95 : 0.74)) {
    P.stepAcc = 0;
    audio.step(L.tileAt(Math.floor(P.x), Math.floor(P.z)), P.running ? 1 : 0.55);
    guest.noise(P.x, P.z, P.running ? 9 : 2.0);
  }
  P.bobPh += moved * (P.running ? 4.6 : 5.6);
}
function applyCameraAndLamp(dt) {
  const t = clock;
  const run = P.running ? 1 : 0, mv = P.moving ? 1 : 0;
  const bobY = Math.sin(P.bobPh * 2) * (0.022 + 0.02 * run) * mv;
  const bobX = Math.cos(P.bobPh) * (0.018 + 0.012 * run) * mv;
  const yawVel = angDiff(P.prevYaw, P.yaw) / Math.max(dt, 1e-3);
  P.roll = lerp(P.roll, clamp(-yawVel * 0.018, -0.07, 0.07) + bobX * 0.6, Math.min(1, dt * 5));
  const sw = settings.vhs >= 1 ? 1 : 0.4;
  const swayP = (Math.sin(t * 1.1) * 0.006 + Math.sin(t * 2.3) * 0.003) * sw + (fx.shake ? (Math.random() - 0.5) * fx.shake * 0.08 : 0);
  const swayY = (Math.sin(t * 0.8) * 0.007 + Math.sin(t * 1.9) * 0.003) * sw + (fx.shake ? (Math.random() - 0.5) * fx.shake * 0.08 : 0);
  if (P.hidden) camera.position.set(P.hidden.cam[0], P.hidden.cam[1] + Math.sin(t * 1.3) * 0.006, P.hidden.cam[2]);
  else camera.position.set(P.x + rXof(P.yaw) * bobX, EYE + bobY, P.z + rZof(P.yaw) * bobX);
  camera.rotation.set(P.pitch + swayP + bobY * 0.4, P.yaw + swayY, P.roll * sw);
  // the lamp lags the camera a little
  P.lampYaw += angDiff(P.lampYaw, P.yaw) * Math.min(1, dt * 11);
  P.lampPitch = lerp(P.lampPitch, P.pitch, Math.min(1, dt * 11));
  lampRig.position.copy(camera.position);
  lampRig.rotation.set(P.lampPitch, P.lampYaw, 0);
  const lowBatt = P.battery < 15 && Math.random() < 0.08;
  lamp.intensity = P.lampOn ? (lowBatt ? 8 : 38) : 0;
  ir.intensity = P.lampOn ? 0 : state === 'caught' ? 0.35 : 3.3;
}
const rXof = (y) => Math.cos(y), rZof = (y) => -Math.sin(y);

function toggleLamp(force) {
  const on = force ?? !P.lampOn;
  if (on === P.lampOn) return;
  if (on && (P.battery <= 0 || P.hidden)) { audio.click(false); if (P.battery <= 0) ui.hint('NO BATTERY'); return; }
  P.lampOn = on; audio.click(on); ui.lampButton(on);
  if (guest.active) guest.noise(P.x, P.z, 2.5);
}

// ------------------------------------------------------------------ interaction
const fwd = new THREE.Vector3();
function findFocus() {
  if (P.hidden) return { kind: 'leave', label: 'LEAVE' };
  camera.getWorldDirection(fwd);
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  let best = null, bs = 1e9;
  const consider = (o, x, y, z, reach, label, pull = 0.35) => {
    if (!label) return;
    const dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz);
    // reach is measured across the floor, so things lying on the carpet count too
    const hd = Math.hypot(dx, dz) || 1e-3;
    if (hd > reach || d > reach + 1.1 || d < 0.05) return;
    const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
    if (cos < (d < 1.0 ? 0.6 : 0.87)) return;
    // test sight to a point on our side of the thing (a closed door must not hide itself)
    const back = Math.min(pull, hd * 0.9);
    if (!physics.los(cx, cz, x - (dx / hd) * back, z - (dz / hd) * back)) return;
    const score = (1 - cos) * 5 + hd * 0.25;
    if (score < bs) { bs = score; best = { ...o, label }; }
  };
  for (const it of world.items) if (!it.taken) consider({ kind: 'item', it }, it.p.x, it.p.y, it.p.z, it.hidden ? 1.7 : 1.6, it.label);
  for (const d of world.doors) {
    const label = d.locked ? (P.key && d.key === 'officeKey' ? 'UNLOCK' : 'LOCKED') : d.open > 0.5 ? 'CLOSE' : 'OPEN';
    consider({ kind: 'door', d }, d.center.x, 1.05, d.center.z, 1.75, label, 0.62);
  }
  for (const f of world.fakeDoors) if (!f.closet) consider({ kind: 'fake', f }, f.center.x, 1.05, f.center.z, 1.6, 'TRY DOOR');
  for (const h of L.HIDES) consider({ kind: 'hide', h }, h.at[0], 1.1, h.at[1], 1.7, h.label);
  const pl = G.flags.power ? null : G.obj === 0 ? 'CHECK BREAKER' : G.obj === 1 ? 'BREAKER PANEL' : 'REPLACE FUSES';
  consider({ kind: 'panel' }, L.PANEL.x, L.PANEL.y, L.PANEL.z - 0.15, 1.8, pl);
  if (!G.flags.power) consider({ kind: 'front' }, 6.0, 1.2, 25.9, 2.0, 'FRONT DOORS');
  consider({ kind: 'vending' }, 15.75, 1.2, 24.15, 1.6, 'VENDING');
  consider({ kind: 'bell' }, 6.4, 1.14, 19.35, 1.4, 'RING BELL');
  consider({ kind: 'monitor' }, 2.0, 1.3, 19.08, 1.4, 'MONITOR');
  return best;
}

function interact(f) {
  const say = (k) => ui.say(S.LINES[k], { now: true });
  switch (f.kind) {
    case 'leave': exitHide(); break;
    case 'hide': enterHide(f.h); break;
    case 'door': {
      const d = f.d;
      if (d.locked) {
        if (P.key && d.key === 'officeKey') { for (const o of world.doors) if (o.key === 'officeKey') o.locked = false; audio.rattle([d.center.x, 1, d.center.z]); ui.hint('UNLOCKED'); }
        else { audio.rattle([d.center.x, 1, d.center.z]); if (d.key === 'officeKey') say('officeLocked'); guest.noise(d.center.x, d.center.z, 3); }
        break;
      }
      const inside = Math.floor(P.x) === d.tx && Math.floor(P.z) === d.tz;
      if (d.open > 0.5) { if (!inside) { d.target = 0; d.speed = 1.8; audio.creak([d.center.x, 1, d.center.z], false); guest.noise(d.center.x, d.center.z, 5); } }
      else { d.target = 1; d.speed = 1.4; audio.creak([d.center.x, 1, d.center.z], true); guest.noise(d.center.x, d.center.z, 4); }
      break;
    }
    case 'fake': {
      audio.rattle([f.f.center.x, 1, f.f.center.z]);
      if (f.f.line) ui.say(f.f.line, { now: true });
      break;
    }
    case 'item': takeItem(f.it); break;
    case 'panel': usePanel(); break;
    case 'front': say('frontNoPower'); audio.rattle([6, 1, 26]); break;
    case 'vending': say('vending'); break;
    case 'bell': audio.bell(); guest.noise(6.4, 19.3, 14); if (!G.flags.bell) { G.flags.bell = true; say('bell'); } break;
    case 'monitor': ui.say('Security monitor. Just snow.', { now: true }); break;
  }
}

function takeItem(it) {
  it.taken = true; it.group.visible = false;
  switch (it.kind) {
    case 'note': {
      P.notes.add(it.id); audio.paper();
      openNote(it.id);
      if (it.id === 'note3') ui.hint('THE OFFICE KEY WAS UNDER IT');
      break;
    }
    case 'key': P.key = true; audio.pickup('key'); ui.say(S.LINES.key, { now: true }); ui.hint('OFFICE KEY'); requestCheckpoint('key'); break;
    case 'battery': P.battery = Math.min(100, P.battery + 45); audio.pickup('battery'); ui.say(S.LINES.battery, { now: true }); break;
    case 'fuse': {
      P.fuses.add(it.id); audio.pickup('fuse');
      ui.say(S.LINES[it.id === 'fuseL' ? 'dryer' : it.id === 'fuseO' ? 'drawer' : 'fuseR'], { now: true });
      if (it.id === 'fuseR') { guest.phase = 2; guest.noise(47, 21, 34); fx.glitch = 0.6; audio.stinger(0.6); }
      ui.hint(`FUSE ${P.fuses.size} / 3`);
      if (P.fuses.size >= 3 && G.obj === 1) { G.obj = 2; later(2.6, () => { ui.say(S.LINES.allFuses); objectiveToast(); }); }
      requestCheckpoint('fuse');
      break;
    }
  }
  updateLedger();
}

function usePanel() {
  if (G.obj === 0) {
    audio.clunk([L.PANEL.x, 1.5, L.PANEL.z]);
    ui.say(S.LINES.breakerFirst, { now: true });
    G.obj = 1; G.flags.breaker = true;
    later(1.4, () => { P.notes.add('note2'); audio.paper(); openNote('note2'); G.flags.huntArmed = true; updateLedger(); });
    // the hunt starts once the note is put down (or after a while, if it is read on the ledger page)
    later(1.4 + 9, () => { if (!G.flags.hunt) startHunt(); });
  } else if (G.obj === 1) {
    ui.say(`Still ${3 - P.fuses.size} missing.`, { now: true });
    if (!P.notes.has('note2')) { P.notes.add('note2'); openNote('note2'); }
  } else if (G.obj === 2 && !G.flags.power) {
    powerOn();
  }
}

function openNote(id) {
  const inLedger = layout.mode === 'book';
  ui.openNote(id, inLedger);
  if (!inLedger) { state = 'paused'; pauseKind = 'note'; input.setEnabled(false); }
}
function closeNote() {
  ui.closeNote();
  if (state === 'paused' && pauseKind === 'note') { state = 'play'; pauseKind = null; input.clearPresses(); input.setEnabled(true); }
  if (G?.flags.huntArmed && !G.flags.hunt) later(1.0, () => { if (!G.flags.hunt) startHunt(); });
}

function enterHide(h) {
  toggleLamp(false);
  P.hidden = h; P.yaw = h.yaw; P.pitch = 0;
  // inside the closet you look out through the door, so don't draw its back
  if (h.id === 'closet') world.fakeDoors.find((f) => f.closet)?.meshes.forEach((m) => { m.visible = false; });
  ui.slats(true, h.id === 'closet' || h.id === 'lockerM' ? false : true);
  audio.creak([h.at[0], 1, h.at[1]], false);
  if (!G.flags.hidTip) { G.flags.hidTip = true; ui.say(S.LINES.hideTip, { now: true }); }
}
function exitHide() {
  const h = P.hidden; if (!h) return;
  P.hidden = null; P.x = h.exit[0]; P.z = h.exit[1];
  world.fakeDoors.find((f) => f.closet)?.meshes.forEach((m) => { m.visible = true; });
  const p = { x: P.x, z: P.z }; physics.collide(p, RAD); P.x = p.x; P.z = p.z;
  ui.slats(false);
  audio.creak([h.at[0], 1, h.at[1]], true);
  guest.noise(P.x, P.z, 3);
}

// ------------------------------------------------------------------ scripted beats
function objectiveToast() {
  const n = P.fuses.size;
  const text = G.obj === 1 ? `${S.OBJECTIVES[1]} (${n}/3)` : S.OBJECTIVES[G.obj];
  ui.toast('▸ ' + text, 6);
  updateLedger();
}
function startNineLurk() {
  G.flags.nineOpened = true;
  const d = doorById('r9'); d.target = 1; d.speed = 0.3; audio.creak([43.5, 1.2, 20.5], true);
  ui.say(S.LINES.nineOpens, { now: true });
  let tt = 0, lit = 0;
  guest.lurk(45.2, 20.55, -Math.PI / 2, (dist, dt) => {
    if (G.flags.lurkDone) return;
    tt += dt; if (beamOnGuest || (irOnGuest && dist < 7)) lit += dt;
    const seen = lit > 0.45 || dist < 4.6;
    if (seen || tt > 28 || P.z < 19.3 || P.x < 26) endLurk(seen);
  });
}
function endLurk(seen) {
  G.flags.lurkDone = true;
  guest.despawn();
  const d = doorById('r9'); d.speed = seen ? 4 : 0.8; d.target = 0;
  if (seen) { audio.thud([43.5, 1.2, 20.5], 1.2, 0.15); audio.stinger(0.9); fx.glitch = 1; ui.say(S.LINES.ninePeek, { now: true }); }
}
function spawnHunt() {
  guest.phase = Math.max(1, guest.phase);
  guest.spawn(41.5, 18.4, Math.PI, 'investigate');
  guest.goTo(33.5, 4.6, 'investigate');
}
function startHunt() {
  if (G.flags.hunt) return;
  G.flags.hunt = true; G.flags.huntArmed = false;
  saveCheckpoint('hunt');
  spawnHunt();
  later(0.8, () => { ui.say(S.LINES.hunt, { now: true }); audio.creak([41.5, 1.2, 19.5], true); });
  later(4.5, () => ui.hint('HIDE: THE LOCKER BY THE DOOR · LAMP OFF', 5000));
}
function powerOn() {
  G.flags.power = true;
  for (const id of ['fuseL', 'fuseO', 'fuseR']) P.fuses.delete(id);
  ui.say(S.LINES.insert, { now: true });
  for (let i = 0; i < 3; i++) setTimeout(() => audio.clunk([L.PANEL.x, 1.5, L.PANEL.z]), 250 + i * 330);
  // the lights come on and it is gone, for now
  later(1.3, () => { audio.powerUp(); lights.power = 1; lights.powerT = 0; lights.delay = {}; if (guest.active) { guest.despawn(); fx.glitch = 0.6; } });
  later(3.4, () => {
    G.obj = 3; ui.say(S.LINES.power); objectiveToast();
    for (const d of world.doors) if (!d.locked && d.target < 1) { d.target = 1; d.speed = 1.2; }
    world.doors.filter((d) => d.id !== 'office' && d.id !== 'officeBack').forEach((d, i) => setTimeout(() => audio.creak([d.center.x, 1, d.center.z], true), i * 180));
    saveCheckpoint('power');
  });
  later(5.2, () => startFinale());
  updateLedger();
}
// the route out, for placing the Guest behind you
const ROUTE = [[33.4, 4.0], [33.5, 8.5], [37.5, 8.6], [41.5, 9.4], [41.5, 14], [41.5, 19.5], [38, 21], [30, 21], [22, 21], [14, 21], [9, 22], [6, 25.5], [6, 26.9]];
function routeProgress(x, z) {
  let acc = 0, best = 0, bd = 1e9;
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, az] = ROUTE[i - 1], [bx, bz] = ROUTE[i];
    const vx = bx - ax, vz = bz - az, len = Math.hypot(vx, vz);
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (len * len), 0, 1);
    const d = Math.hypot(ax + vx * t - x, az + vz * t - z);
    if (d < bd) { bd = d; best = acc + t * len; }
    acc += len;
  }
  return best;
}
function routePoint(s) {
  let acc = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, az] = ROUTE[i - 1], [bx, bz] = ROUTE[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= s) { const t = (s - acc) / len; return [ax + (bx - ax) * t, az + (bz - az) * t]; }
    acc += len;
  }
  return ROUTE[ROUTE.length - 1];
}
const BURSTS = [[0.8, ['serviceW', 'rooms']], [1.8, ['serviceE']], [5.2, ['passage']], [9.2, ['corr4']], [12.6, ['corr3']], [15.8, ['corr2']], [19.0, ['corr1']], [22.4, ['lobbyPower']]];
function startFinale() {
  if (G.flags.finale) return;
  G.flags.finale = true; G.finaleT = 0; G.finaleSpawned = false; G.runHinted = false;
  ui.say(S.LINES.burst, { now: true });
  audio.scream([33.5, 1.8, 8.5]);
  fx.glitch = 0.8;
}
function updateFinale(dt) {
  G.finaleT += dt;
  for (const [t, names] of BURSTS) {
    for (const n of names) {
      const ch = L.CH[n];
      if (G.finaleT > t - 0.9 && !lights.burst.has(ch) && !lights.preBurst.has(ch)) lights.preBurst.set(ch, clock);
    }
    if (G.finaleT >= t) burst(names.map((n) => L.CH[n]));
  }
  const s = routeProgress(P.x, P.z);
  if (!G.finaleSpawned && (s > 13 || G.finaleT > 9)) {
    let gs = Math.max(0, s - 9);
    let [gx, gz] = routePoint(gs);
    if (Math.hypot(gx - P.x, gz - P.z) < 5) [gx, gz] = routePoint(Math.max(0, s - 12));
    guest.phase = 3; guest.spawn(gx, gz, 0, 'finale'); guest.finaleSpeed = 3.0;
    G.finaleSpawned = true; audio.scream([gx, 1.8, gz]);
  }
  if (!G.runHinted && G.finaleT > 3 && !P.running && input.touchActive) { G.runHinted = true; ui.hint('PUSH THE STICK ALL THE WAY TO RUN', 4000); }
}

// ------------------------------------------------------------------ guest coupling
let beamOnGuest = false, irOnGuest = false;
const tmpV = new THREE.Vector3();
function guestSight() {
  beamOnGuest = false; irOnGuest = false;
  if (!guest.model.root.visible) { guest.eye = 0; return 99; }
  const hx = guest.x, hz = guest.z, hy = 1.95;
  const dx = hx - camera.position.x, dy = hy - camera.position.y, dz = hz - camera.position.z;
  const d = Math.hypot(dx, dy, dz);
  const clear = physics.los(camera.position.x, camera.position.z, hx, hz);
  let eye = 0.0;
  if (clear) {
    tmpV.set(0, 0, -1).applyEuler(lampRig.rotation);
    const cosL = (dx * tmpV.x + dy * tmpV.y + dz * tmpV.z) / d;
    if (P.lampOn && d < 15 && cosL > Math.cos(lamp.angle * 1.05)) { beamOnGuest = true; eye = 0.7 * smooth(16, 3, d) + 0.25; }
    if (!P.lampOn && d < 7.5) { irOnGuest = true; eye = Math.max(eye, 0.55 * smooth(7.5, 1.5, d)); }
  }
  guest.eye = lerp(guest.eye || 0, eye, 0.3);
  return Math.hypot(hx - P.x, hz - P.z);
}

function updateGuest(dt) {
  const d = guestSight();
  const hideAt = P.hidden ? [P.hidden.at[0], P.hidden.at[1]] : null;
  const ev = guest.update(dt, { x: P.x, z: P.z, lampOn: P.lampOn, running: P.running, hidden: !!P.hidden, hideAt, light: P.light, beamOnGuest });
  if (ev === 'caught') startCaught();
  else if (ev === 'chase') {
    if (clock - (G.lastScream || -99) > 12) { audio.scream([guest.x, 1.9, guest.z]); G.lastScream = clock; }
    audio.stinger(0.7); fx.glitch = Math.max(fx.glitch, 0.7);
    if (!G.flags.sawLine) { G.flags.sawLine = true; ui.say(S.LINES.saw, { now: true }); }
  }
  const visible = guest.model.root.visible;
  const chase = guest.state === 'chase' || guest.state === 'finale' || guest.state === 'pullout';
  const near = visible ? smooth(14, 1.5, d) : 0;
  fx.interf = lerp(fx.interf, clamp(near * 0.85 + (chase ? 0.15 : 0), 0, 1), Math.min(1, dt * 3));
  const threat = visible ? clamp(near * (chase ? 1 : 0.75), 0, 1) : 0;
  audio.levels({
    rain: smooth(0.2, 1.0, L.ambientAt(P.x, P.z)) * 0.85 + 0.15, vending: world.chan[L.CH.vending], tv: world.chan[L.CH.tv], neon: world.chan[L.CH.neon],
    buzz: clamp(lights.power > 0 ? P.light * 0.8 : 0, 0, 1),
    guest: visible ? [guest.x, 1.8, guest.z] : null,
    breath: visible ? (chase ? 1 : guest.state === 'lurk' ? 0.35 : 0.55) : 0,
    growl: visible ? (chase ? 1 : guest.state === 'investigate' ? 0.35 : guest.state === 'search' ? 0.25 : 0) : 0,
    heart: threat, heartRate: threat,
  });
  ui.jitter(fx.interf > 0.5);
}

// ------------------------------------------------------------------ caught, rewind, ending
let caughtT = 0, rewindT = 0, endT = 0;
function startCaught() {
  state = 'caught'; caughtT = 0;
  input.setEnabled(false); ui.prompt(null); ui.slats(false);
  if (P.hidden) { P.x = P.hidden.exit[0]; P.z = P.hidden.exit[1]; P.hidden = null; world.fakeDoors.find((f) => f.closet)?.meshes.forEach((m) => { m.visible = true; }); }
  toggleLamp(false);
  audio.jumpscare(); fx.glitch = 1; fx.interf = 1;
  G.rewinds++;
  G.cpDeaths = (G.cpDeaths || 0) + 1;
  guest.mercy = G.cpDeaths >= 3;
  devlog('caught', { obj: G.obj, x: +P.x.toFixed(1), z: +P.z.toFixed(1), guest: guest.state, rewinds: G.rewinds, cp: checkpoint?.kind });
  if (BOT) { bot.flee = null; bot.path = null; P.hidden = null; }
}
function updateCaught(dt) {
  caughtT += dt;
  if (G.devHold && caughtT > 0.95) caughtT = 0.95;
  // snap the view onto it
  const want = Math.atan2(-(guest.x - P.x), -(guest.z - P.z));
  P.yaw += angDiff(P.yaw, want) * Math.min(1, dt * 14);
  P.pitch = lerp(P.pitch, 0.12, Math.min(1, dt * 8));
  const k = Math.min(1, caughtT / 0.5);
  guest.x = lerp(guest.x, P.x + Math.sin(want) * -0.95, k * 0.25); guest.z = lerp(guest.z, P.z + Math.cos(want) * -0.95, k * 0.25);
  guest.eye = 1; fx.glitch = 1; fx.shake = 0.6;
  if (caughtT > 1.15) startRewind();
}
function startRewind() {
  state = 'rewind'; rewindT = 0;
  ui.big('◀◀ REW', 0); audio.rewind(1.7); guest.despawn();
}
function updateRewind(dt) {
  rewindT += dt;
  fx.rewind = smooth(0, 0.3, rewindT) * (1 - smooth(1.5, 1.8, rewindT));
  fx.glitch = 0.2;
  if (rewindT > 1.0 && !G.restored) { G.restored = true; restore(checkpoint || snapshot('start')); }
  if (rewindT > 1.8) {
    G.restored = false; fx.rewind = 0; fx.shake = 0;
    ui.big('▶ PLAY', 900);
    state = 'play'; input.clearPresses(); input.setEnabled(true);
  }
}
function startEnding() {
  state = 'ending'; endT = 0;
  input.setEnabled(false); ui.showButtons(false); ui.prompt(null);
  guest.despawn();
  ui.say(S.LINES.out, { now: true });
  store.del('na.save'); checkpoint = null;
  const best = store.get('na.best', null);
  if (!best || G.tapeTime < best.time) store.set('na.best', { time: G.tapeTime, rewinds: G.rewinds, notes: P.notes.size });
  devlog('escaped', { time: Math.round(G.tapeTime), rewinds: G.rewinds, notes: P.notes.size });
}
function updateEnding(dt) {
  endT += dt;
  P.x += -Math.sin(P.yaw) * dt * 1.2; P.z += -Math.cos(P.yaw) * dt * 1.2;
  P.moving = true; P.bobPh += dt * 6;
  fx.fade = smooth(1.4, 2.6, endT);
  if (endT > 2.6 && !G.stopShown) { G.stopShown = true; ui.big('■ STOP', 0); audio.static(0.5, 0.3); }
  if (endT > 4.2) {
    state = 'end'; ui.bigOff();
    ui.endScreen(S.ENDING.title, S.ENDING.body, [['TAPE TIME', fmt(G.tapeTime)], ['NOTES FOUND', `${P.notes.size} / 6`], ['REWINDS', String(G.rewinds)]]);
  }
}

// ------------------------------------------------------------------ ledger + OSD
function updateLedger() {
  if (!G) return;
  const n = [...P.fuses].length + (G.flags.power ? 3 : 0);
  const objList = [{ text: 'Reset the breaker (maintenance)', done: G.obj > 0 }];
  if (G.obj >= 1) objList.push({ text: `Find the 3 fuses (${Math.min(3, n)}/3)`, done: G.obj > 1 });
  if (G.obj >= 2) objList.push({ text: 'Put them back in the panel', done: G.obj > 2 || G.flags.power });
  if (G.obj >= 3) objList.push({ text: 'GET OUT · front doors', done: false });
  const known = P.notes.has('note2') && G.obj === 1;
  const marks = known ? [['fuseO', 5.6, 12.4], ['fuseL', 16.2, 2.6], ['fuseR', 47, 21]].filter(([id]) => !P.fuses.has(id)).map(([, x, z]) => [x, z]) : [];
  const SHORT = ['FIND THE BREAKER', 'FIND 3 FUSES', 'BACK TO THE BREAKER', 'GET OUT'];
  ui.setLedger({ objList, fuses: Math.min(3, n), notes: P.notes, hint: known ? S.FUSE_HINT : '', marks, fuseLine: G.obj === 1 ? `${n}/3` : '', short: SHORT[G.obj] });
}
let osdT = 0, exploreT = 0, mapT = 0;
function updateOSD(dt) {
  osdT -= dt;
  if (osdT > 0) return;
  osdT = 0.12;
  const tape = G ? G.tapeTime : clock;
  const secs = 3 * 3600 + 12 * 60 + 4 + tape;
  const hh = Math.floor(secs / 3600) % 12 || 12, mm = Math.floor(secs / 60) % 60, ss = Math.floor(secs) % 60;
  post.setStamp([`${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} AM`, 'NOV.18 1989']);
  ui.osd({
    rec: state === 'play' ? clock % 1.2 < 0.75 : state !== 'title',
    mode: P.lampOn ? 'LAMP' : fx.night > 0.45 ? 'LOW LIGHT' : 'AUTO',
    battery: P.battery, low: P.battery < 15,
    clock: `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} AM`,
    counter: `SP ${fmt(tape)}`,
  });
}

// ------------------------------------------------------------------ per-state updates
function updatePlay(dt) {
  G.tapeTime += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (G.tapeTime >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  if (input.consume('menu')) { pauseGame('menu', 'button'); return; }
  if (input.consume('ledger') && layout.mode !== 'book') { ui.openLedgerOverlay(); state = 'paused'; pauseKind = 'ledger'; input.setEnabled(false); return; }
  if (input.consume('lamp')) toggleLamp();
  updatePlayer(dt);
  if (P.lampOn) {
    P.battery = Math.max(0, P.battery - dt * 0.3);
    if (P.battery <= 0) { toggleLamp(false); if (!G.flags.lampDead) { G.flags.lampDead = true; ui.say(S.LINES.lampDead, { now: true }); } }
  }
  P.lightT -= dt;
  if (P.lightT <= 0) { P.lightT = 0.15; P.light = world.lightLevel(P.x, 1.2, P.z); }
  const focus = findFocus();
  ui.prompt(focus?.label || null);
  const tap = input.consume('tap');
  if (input.consume('use') || (tap && focus)) { if (focus) interact(focus); }
  // triggers
  const F = G.flags, inCorr = P.z > 20 && P.z < 22;
  if (!F.corridor && P.x > 12.5 && inCorr) { F.corridor = true; ui.say(S.LINES.corridor); }
  if (!F.nineOpened && G.obj === 0 && P.x > 33.5 && inCorr) startNineLurk();
  if (!F.tvSeen && P.x > 19 && P.x < 25 && P.z > 23) { F.tvSeen = true; ui.say(['TV’s on.', '…It isn’t even plugged in.']); }
  if (!F.r7 && P.x > 33 && P.x < 39 && P.z > 11 && P.z < 19) { F.r7 = true; ui.say(S.LINES.r7); }
  if (!F.room9 && P.x > 44.2) { F.room9 = true; ui.say(S.LINES.room9, { now: true }); }
  if (F.finale) updateFinale(dt);
  if (G.respawn) { G.respawn.t -= dt; if (G.respawn.t <= 0) { const r = G.respawn; G.respawn = null; spawnBehind(r.x, r.z); } }
  if (F.power) {
    const near = Math.hypot(P.x - 6, P.z - 26) < 3.4;
    world.setSlide(clamp(world.slideOpen + (near ? dt * 1.4 : -dt * 0.6), 0, 1));
    if (P.z > 26.3 && P.x > 4.8 && P.x < 7.2) { startEnding(); return; }
  }
  updateGuest(dt);
  if (state !== 'play') return;
  if (pendingCP) {
    pendingCP.t += dt;
    const safe = !guest.active || (guest.state !== 'chase' && guest.state !== 'pullout' && Math.hypot(guest.x - P.x, guest.z - P.z) > 8);
    if (safe) { saveCheckpoint(pendingCP.kind); pendingCP = null; } else if (pendingCP.t > 40) pendingCP = null;
  }
  exploreT -= dt;
  if (exploreT <= 0) {
    exploreT = 0.3;
    const px = Math.floor(P.x), pz = Math.floor(P.z);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = px + dx, z = pz + dz;
      if (dx * dx + dz * dz > 10 || !L.isOpenTile(x, z)) continue;
      const k = x + ',' + z;
      if (!explored.has(k) && physics.los(P.x, P.z, x + 0.5, z + 0.5)) explored.add(k);
    }
  }
  mapT -= dt;
  if (mapT <= 0 && (layout.mode === 'book' || ui.ledgerOpen)) { mapT = 0.35; ui.drawMap(explored, { x: P.x, z: P.z, yaw: P.yaw }); }
}

function updateAttract(dt) {
  const t = clock;
  P.lampOn = false;
  camera.position.set(8.7 + Math.sin(t * 0.05) * 0.25, 1.55, 23.4);
  camera.rotation.set(-0.1 + Math.sin(t * 0.13) * 0.02, 0.98 + Math.sin(t * 0.06) * 0.32, Math.sin(t * 0.21) * 0.01);
  lamp.intensity = 0; ir.intensity = 1.2;
  P.light = 0.25;
}

// ------------------------------------------------------------------ frame
let last = performance.now(), perf = { samples: [], n: 0, level: 0, t: 0, bad: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, Math.max(0, rawDt));
  const steps = DEV ? clamp(+(Q.get('speed') || 1), 1, 6) : 1;
  for (let i = 0; i < steps; i++) {
    clock += dt;
    if (BOT && i > 0 && state === 'play') { botStep(dt); updatePlay(dt); applyCameraAndLamp(dt); updateLights(dt); world.update(dt, clock); }
  }
  if (BOT) botStep(dt);
  if (state === 'play') updatePlay(dt);
  else if (state === 'caught') { updateCaught(dt); updateGuestOnly(dt); }
  else if (state === 'rewind') updateRewind(dt);
  else if (state === 'ending') updateEnding(dt);
  else if (state === 'title' || state === 'calib' || state === 'end') updateAttract(dt);
  if (state === 'play' || state === 'caught' || state === 'rewind' || state === 'ending' || state === 'paused') {
    if (state !== 'paused') applyCameraAndLamp(dt);
  }
  updateLights(dt);
  if (state !== 'paused') world.update(dt, clock);
  // exposure and tape
  const lampMode = P.lampOn && state !== 'title' && state !== 'calib' && state !== 'end';
  const caught = state === 'caught';
  const gT = caught ? 1.6 : lampMode ? 1.15 : clamp(1.05 / (P.light + 0.25), 1.05, 3.8);
  const nT = caught ? 0.5 : lampMode ? 0 : clamp(1.25 - P.light * 2.1, 0, 1);
  fx.gain = lerp(fx.gain, gT, Math.min(1, dt * (caught ? 12 : 2.6)));
  fx.night = lerp(fx.night, nT, Math.min(1, dt * 3));
  fx.glitch = Math.max(0, fx.glitch - dt * 1.6);
  fx.shake = Math.max(0, fx.shake - dt * 1.5);
  const u = post.uniforms;
  u.uTime.value = clock % 1000; u.uGain.value = fx.gain; u.uNight.value = fx.night;
  u.uInterf.value = state === 'title' ? 0.08 : fx.interf; u.uGlitch.value = fx.glitch; u.uRewind.value = fx.rewind;
  u.uVhs.value = settings.vhs; u.uFade.value = fx.fade; u.uFlash.value = fx.flash; u.uBright.value = settings.bright;
  u.uGrain.value = settings.vhs >= 1 ? 1.25 : 0.55; u.uLag.value = settings.vhs >= 1 ? 1 : 0.3;
  if (state !== 'paused' || pauseKind === 'note' || pauseKind === 'ledger') post.render(scene, camera);
  else if (!G?.pausedFrame) { post.render(scene, camera); }
  // camera-facing audio
  if (audio.ready) audio.listener(camera.position.x, camera.position.y, camera.position.z, -Math.sin(camera.rotation.y), -Math.cos(camera.rotation.y));
  ui.tick(dt);
  updateOSD(dt);
  // adaptive quality: judge only steady, visible play; ignore hitches and throttled frames
  if (state === 'play' && document.visibilityState === 'visible' && rawDt < 0.2 && (G?.tapeTime ?? 0) > 6 && Q.get('quality') !== 'fixed') perf.samples.push(rawDt);
  perf.t += rawDt; perf.n++;
  if (perf.t > 4) {
    if (perf.samples.length > 90) {
      const med = perf.samples.slice().sort((a, b) => a - b)[Math.floor(perf.samples.length / 2)];
      perf.bad = med > 0.026 ? perf.bad + 1 : 0;
      if (perf.bad >= 2 && perf.level < 2) {
        perf.level++; perf.bad = 0;
        if (perf.level === 1) { dprCap = 1.0; resizeCanvas(); post.resize(352, 264); }
        else { post.resize(320, 240); lamp.castShadow = false; }
        devlog('quality', { level: perf.level, medianMs: Math.round(med * 1000) });
      }
    }
    if (state === 'play') devlog('fps', { fps: Math.round(perf.n / perf.t), mode: layout.mode, obj: G?.obj, guest: guest?.state });
    perf.samples = []; perf.t = 0; perf.n = 0;
  }
}
function updateGuestOnly() {
  // it stoops into the lens
  const k = Math.min(1, caughtT / 0.35);
  guest.yaw = Math.atan2(P.x - guest.x, P.z - guest.z);
  guest.model.root.visible = true;
  guest.model.root.position.set(guest.x, -0.34 * k, guest.z);
  guest.model.root.rotation.y = guest.yaw;
  guest.model.torso.rotation.x = 0.33 * k;
  guest.model.head.rotation.z = Math.sin(clock * 40) * 0.25 * k;
  guest.model.eyeMat.color.setRGB(6, 5.2, 3);
}

// ------------------------------------------------------------------ actions
let calibThen = null;
function openCalib() {
  const prev = state; state = 'calib';
  ui.only('s-calib'); calibReturn = prev;
}
let calibReturn = 'title';
function onAction(act, arg) {
  audio.init();
  switch (act) {
    case 'new': startGame(false); break;
    case 'continue': startGame(true); break;
    case 'howto': ui.only('s-howto'); break;
    case 'settings': ui.only('s-settings'); break;
    case 'back':
      if (state === 'paused') { ui.only('s-pause'); } else ui.only('s-title');
      break;
    case 'calib': openCalib(); break;
    case 'calibdone':
      settings.calibrated = true; saveSettings();
      if (calibThen) { const f = calibThen; calibThen = null; state = 'title'; f(); }
      else if (calibReturn === 'paused') { state = 'paused'; ui.only('s-settings'); }
      else { state = 'title'; ui.only('s-settings'); }
      break;
    case 'resume': resumeGame(); break;
    case 'restart': ui.only(null); startGame(false); break;
    case 'quit': toTitle(); break;
    case 'again': startGame(false); break;
    case 'ledger':
      if (state === 'paused' && pauseKind === 'menu') { ui.only(null); ui.openLedgerOverlay(); pauseKind = 'ledger'; }
      break;
    case 'closeledger': if (ui.ledgerOpen) { ui.closeLedgerOverlay(); resumeGame(); } break;
    case 'readnote': ui.openNote(arg, ui.ledgerOpen || layout.mode === 'book'); if (layout.mode !== 'book' && !ui.ledgerOpen) { state = 'paused'; pauseKind = 'note'; input.setEnabled(false); } break;
    case 'closenote': closeNote(); break;
  }
}
function onSetting(k, v) {
  settings[k] = v; saveSettings();
  if (k === 'volume') audio.setVolume(v);
  if (k === 'fold') { setFoldOverride(v); lw.recheck(); }
}

// pause when the page goes to the background; keep Safari's back swipe from leaving
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (state === 'play' && !Q.has('nopause')) pauseGame('menu', 'hidden'); audio.suspend(); }
  else if (state !== 'paused') audio.resume();
});
addEventListener('pagehide', () => { if (state === 'play') pauseGame('menu', 'pagehide'); });
addEventListener('popstate', () => { if (state === 'play' || state === 'paused') { try { history.pushState({ na: 1 }, ''); } catch { /* ignore */ } if (state === 'play') pauseGame('menu', 'popstate'); } });
addEventListener('pointerdown', () => audio.resume(), { capture: true });

// ------------------------------------------------------------------ dev: scenes and autopilot
const BOT = DEV && Q.has('autopilot');
// ?video: a watchable autopilot — smooth camera, lamp when it's safe, notes held up to read
const VIDEO = BOT && Q.has('video');
function applyScene(name) {
  if (BOT) ui.stickUsed();
  const take = (id) => { const it = itemById(id); it.taken = true; it.group.visible = false; };
  if (name === 'corridor') { P.x = 30; P.z = 21; P.yaw = -Math.PI / 2; }
  if (name === 'caught') { P.x = 30; P.z = 21; P.yaw = -Math.PI / 2; G.flags.lurkDone = true; G.obj = 1; guest.phase = 1; guest.spawn(31.4, 21, -Math.PI / 2, 'patrol'); G.devHold = true; }
  if (name === 'hunt') { P.x = 33.4; P.z = 3.3; P.yaw = 0; }
  if (name === 'office') { G.obj = 1; P.notes.add('note2'); P.key = true; P.x = 3.5; P.z = 17.7; P.yaw = 0; G.flags.lurkDone = G.flags.breaker = G.flags.hunt = true; spawnSafe(); }
  if (name === 'room9') { G.obj = 1; P.notes.add('note2'); P.x = 40.5; P.z = 21; P.yaw = -Math.PI / 2; G.flags.lurkDone = G.flags.breaker = G.flags.hunt = true; spawnSafe(); }
  if (name === 'fuses' || name === 'finale') {
    G.obj = 2; for (const id of ['fuseL', 'fuseO', 'fuseR']) { P.fuses.add(id); take(id); }
    P.x = 33.4; P.z = 3.2; P.yaw = 0; G.flags.lurkDone = G.flags.breaker = G.flags.hunt = true;
    if (name === 'finale') powerOn();
  }
  P.lampYaw = P.prevYaw = P.yaw;
  timers.length = 0;
  updateLedger();
  if (name) devlog('scene', name);
}

const bot = { ti: 0, path: null, pi: 0, repath: 0, hideT: 0, flee: null, stuckT: 0, last: null, tryT: 0, deaths: 0, t0: 0, waitDoor: 0 };
const PANEL_SPOT = { to: [33.4, 3.15], face: [L.PANEL.x, 1.5, 2.15] };
const BOT_TASKS = [
  { name: 'breaker', ...PANEL_SPOT, done: () => G.obj >= 1 },
  { name: 'hide-from-hunt', hide: 'lockerM', done: () => G.flags.hunt && (bot.huntHid || G.obj >= 2) },
  { name: 'laundry-fuse', to: [16.2, 3.45], face: [16.2, 0.5, 2.8], done: () => P.fuses.has('fuseL') },
  { name: 'office-key', to: [24.0, 24.75], face: [24.55, 0.57, 24.6], done: () => P.key },
  { name: 'office-door', to: [3.5, 17.55], face: [3.5, 1.05, 16.5], done: () => !doorById('office').locked && doorById('office').open > 0.6 },
  { name: 'office-fuse', to: [5.6, 13.35], face: [5.6, 0.6, 12.65], done: () => P.fuses.has('fuseO') },
  { name: 'room9-fuse', to: [46.35, 21.0], face: [47, 0.02, 21], done: () => P.fuses.has('fuseR') },
  { name: 'power', ...PANEL_SPOT, done: () => G.flags.power },
  { name: 'escape', route: true, done: () => state !== 'play' },
];
if (VIDEO) {
  const at = (name) => BOT_TASKS.findIndex((t) => t.name === name) + 1;
  BOT_TASKS.unshift({ name: 'note1', to: [4.4, 17.85], face: [4.3, 1.11, 19.2], done: () => P.notes.has('note1') });
  BOT_TASKS.splice(at('laundry-fuse'), 0, { name: 'note4', to: [16.0, 3.7], face: [16.0, 0.87, 4.55], done: () => P.notes.has('note4') });
  BOT_TASKS.splice(at('office-key'), 0, { name: 'note3', to: [24.0, 24.9], face: [24.75, 0.57, 24.9], done: () => P.notes.has('note3') });
  BOT_TASKS.splice(at('office-fuse'), 0, { name: 'note5', to: [3.85, 12.3], face: [4.95, 0.77, 12.25], done: () => P.notes.has('note5') });
  BOT_TASKS.splice(at('room9-fuse'), 0, { name: 'note6', to: [46.35, 21.0], face: [46.3, 0.02, 20.4], done: () => P.notes.has('note6') });
}
function botLog(ev, extra = {}) { devlog('bot', { ev, task: BOT_TASKS[bot.ti]?.name, t: Math.round(G?.tapeTime ?? 0), x: +P.x.toFixed(1), z: +P.z.toFixed(1), guest: guest.active ? guest.state : '-', ...extra }); }
function stick(x, y, run = false) { input.st.mx = x; input.st.my = y; input.st.run = run; }
function faceTo(x, y, z, dt = 1 / 60) {
  const ty = Math.atan2(-(x - P.x), -(z - P.z));
  // same limits updatePlayer puts on P.pitch, or a target on the floor can never count as aimed
  const tp = clamp(Math.atan2(y - EYE, Math.hypot(x - P.x, z - P.z)), -1.15, 1.05);
  const k = Math.min(1, dt * (VIDEO ? 6 : 40));
  P.yaw += angDiff(P.yaw, ty) * k; P.pitch += (tp - P.pitch) * k;
  return Math.abs(angDiff(P.yaw, ty)) < 0.08 && Math.abs(tp - P.pitch) < 0.08;
}
function botGo(tx, tz, run, dt = 1 / 60) {
  if (bot.side > 0) { bot.side -= dt; stick(bot.sideDir, 0.35); if (bot.side <= 0) bot.path = null; return false; }
  bot.mvT = (bot.mvT || 0) + dt;
  if (bot.mvT > 2.2) {
    const moved = bot.mvAt ? Math.hypot(P.x - bot.mvAt[0], P.z - bot.mvAt[1]) : 1;
    bot.mvT = 0; bot.mvAt = [P.x, P.z];
    if (moved < 0.15 && Math.hypot(tx - P.x, tz - P.z) > 0.4) { bot.side = 0.7; bot.sideDir = Math.random() < 0.5 ? -1 : 1; botLog('sidestep'); return false; }
  }
  bot.repath -= 1 / 60;
  if (!bot.path || bot.repath <= 0 || bot.goal?.[0] !== tx || bot.goal?.[1] !== tz) {
    bot.path = physics.findPath(P.x, P.z, tx, tz, { allowProps: false }); bot.pi = 1; bot.repath = 2; bot.goal = [tx, tz];
    if (!bot.path) { stick(0, 0); return false; }
  }
  const path = bot.path;
  while (bot.pi < path.length - 1 && Math.hypot(path[bot.pi].x - P.x, path[bot.pi].z - P.z) < 0.45) bot.pi++;
  const node = path[Math.min(bot.pi, path.length - 1)];
  if (node.door && node.door.open < 0.6) {
    const d = node.door, dd = Math.hypot(d.center.x - P.x, d.center.z - P.z);
    if (d.locked) { bot.path = null; stick(0, 0); return false; }
    if (dd < 1.5) { stick(0, 0); if (faceTo(d.center.x, 1.05, d.center.z, dt) && d.target < 1) interact({ kind: 'door', d }); return false; }
  }
  const last = bot.pi >= path.length - 1;
  const gx = last ? tx : node.x, gz = last ? tz : node.z;
  const dist = Math.hypot(gx - P.x, gz - P.z);
  if (last && dist < 0.22) { stick(0, 0); bot.mvT = 0; bot.mvAt = null; return true; }
  const want = Math.atan2(-(gx - P.x), -(gz - P.z)), err = Math.abs(angDiff(P.yaw, want));
  P.yaw += angDiff(P.yaw, want) * (VIDEO ? Math.min(1, dt * 5) : 0.35);
  P.pitch += (-0.04 - P.pitch) * Math.min(1, dt * 3);
  const fwd = VIDEO ? (err > 1.0 ? 0.15 : err > 0.5 ? 0.55 : 1) : 1;
  stick(0, (last && dist < 0.6 ? -0.5 : -1) * fwd, run);
  return false;
}
function pickHide() {
  let best = null, bl = 1e9;
  for (const h of L.HIDES) {
    const path = physics.findPath(P.x, P.z, h.exit[0], h.exit[1]);
    if (!path) continue;
    if (guest.active && path.some((n) => Math.hypot(n.x - guest.x, n.z - guest.z) < 3)) continue;
    const len = physics.pathLength(path);
    if (len < bl) { bl = len; best = h; }
  }
  return best;
}
function botStep(dt) {
  if (state === 'paused' && pauseKind === 'note') {
    bot.noteT = (bot.noteT || 0) + dt;
    if (bot.noteT > (VIDEO ? 4.2 : 0)) { bot.noteT = 0; closeNote(); }
    return;
  }
  if (state !== 'play') { stick(0, 0); return; }
  const task = BOT_TASKS[bot.ti];
  if (!task) return;
  const gd = guest.active ? Math.hypot(guest.x - P.x, guest.z - P.z) : 99;
  const lampBot = Q.has('lamp');
  let wantLamp = lampBot;
  if (VIDEO) {
    // like a careful player: light when it's away or the lights are going, dark when it's near
    const inSight = guest.active && physics.los(guest.x, guest.z, P.x, P.z);
    const calm = !guest.active || (guest.state === 'patrol' && (inSight ? gd > 21 : gd > 7));
    wantLamp = !P.hidden && P.battery > 8 && (G.flags.finale || calm);
  }
  if (P.lampOn && !wantLamp) toggleLamp(false);
  if (wantLamp && !P.lampOn && !P.hidden && P.battery > 5) toggleLamp(true);
  // hiding: wait until it has gone
  if (P.hidden) {
    stick(0, 0); bot.hideT += dt;
    if (task.name === 'hide-from-hunt' && guest.active) bot.huntHid = true;
    const away = !guest.active || ((guest.state === 'patrol' || guest.state === 'search') && gd > (VIDEO ? 9 : 11)) || gd > (VIDEO ? 14 : 18);
    if (away && bot.hideT > (VIDEO ? 3 : 4)) { interact({ kind: 'leave' }); bot.flee = null; bot.path = null; botLog('unhide', { gd: +gd.toFixed(1) }); }
    return;
  }
  const threat = guest.active && !G.flags.finale && (guest.state === 'chase' || guest.state === 'pullout' || ((guest.state === 'investigate' || guest.state === 'search') && gd < 7) || gd < 4);
  if (threat || bot.flee) {
    if (!bot.flee) { bot.flee = pickHide(); bot.path = null; botLog('flee', { to: bot.flee?.id, gd: +gd.toFixed(1), gs: guest.state }); }
    const h = bot.flee;
    if (h) {
      if (botGo(h.exit[0], h.exit[1], guest.state === 'chase', dt) && (faceTo(h.at[0], 1.1, h.at[1], dt * 3) || guest.state === 'chase')) { interact({ kind: 'hide', h }); bot.hideT = 0; botLog('hide', { h: h.id }); }
      return;
    }
  }
  if (task.done()) { botLog('done'); bot.ti++; bot.path = null; bot.tryT = 0; bot.taskT = 0; return; }
  bot.taskT = (bot.taskT || 0) + dt;
  if (bot.taskT > 90 && !bot.stuckLogged) { bot.stuckLogged = true; botLog('stuck', { path: !!bot.path, goal: bot.goal, gd: +gd.toFixed(1) }); }
  if (task.hide) {
    if (!G.flags.hunt) { stick(0, 0); return; }
    const h = L.HIDES.find((x) => x.id === task.hide);
    if (botGo(h.exit[0], h.exit[1], true, dt) && faceTo(h.at[0], 1.1, h.at[1], dt * 3)) { interact({ kind: 'hide', h }); bot.hideT = 0; botLog('hide', { h: h.id }); }
    return;
  }
  if (task.route) {
    const s = routeProgress(P.x, P.z);
    const [tx, tz] = routePoint(Math.min(s + 2.5, 999));
    P.yaw += angDiff(P.yaw, Math.atan2(-(tx - P.x), -(tz - P.z))) * (VIDEO ? Math.min(1, dt * 6) : 0.3);
    P.pitch += (-0.04 - P.pitch) * Math.min(1, dt * 3);
    stick(0, -1, true);
    return;
  }
  if (botGo(task.to[0], task.to[1], false, dt)) {
    const aimed = faceTo(...task.face, dt);
    bot.tryT += dt;
    const f = aimed || !VIDEO ? findFocus() : null;
    if (f && bot.tryT > (VIDEO ? 0.5 : 0.25)) { interact(f); bot.tryT = -0.6; botLog('use', { label: f.label }); }
    if (bot.tryT > (VIDEO ? 5 : 3)) { P.x += (Math.random() - 0.5) * 0.3; P.z += (Math.random() - 0.5) * 0.3; bot.tryT = 0; botLog('nudge'); }
  }
}

// ------------------------------------------------------------------ dev hooks
function exposeDev() {
  window.__na = {
    get state() { return state; }, get P() { return P; }, get G() { return G; }, world, guest, physics, input, settings, L, layout: () => layout, fx, lights,
    start: () => startGame(false),
    teleport(x, z, yaw = P.yaw) { P.x = x; P.z = z; P.yaw = yaw; P.lampYaw = yaw; },
    face(x, z) { P.yaw = Math.atan2(-(x - P.x), -(z - P.z)); P.pitch = 0; },
    focus: () => findFocus(), use() { const f = findFocus(); if (f) interact(f); return f?.label; },
    give(id) { const it = itemById(id); if (it && !it.taken) takeItem(it); },
    obj(n) { G.obj = n; updateLedger(); }, power: () => powerOn(), hunt: () => startHunt(), lamp: (v) => toggleLamp(v),
    closeNote, checkpoint: () => checkpoint, caught: () => startCaught(), finale: () => startFinale(), calibrate() { settings.calibrated = true; saveSettings(); },
    peace(v = true) { guest._peace = v; if (v) guest.despawn(); },
  };
  devlog('dev', 'hooks ready');
}
