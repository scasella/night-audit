// The Guest: a tall figure in a motel bathrobe with a lampshade over its head.
// It goes where the light is.
import * as THREE from 'three';
import * as L from './level.js';
import { probeMaterial } from './world.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function buildModel() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const robe = probeMaterial({ color: 0x5c574e });
  const skin = probeMaterial({ color: 0x2a2724 });
  const shade = probeMaterial({ color: 0x8a7650, side: THREE.DoubleSide });
  const mats = [robe, skin, shade];
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0.95, 0); body.add(hip);
    mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.95, 6), skin, hip, 0, -0.475, 0);
    mesh(new THREE.BoxGeometry(0.08, 0.04, 0.2), skin, hip, 0, -0.93, 0.05);
    legs.push(hip);
  }
  mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.32, 11), robe, body, 0, 1.0, 0);
  const torso = new THREE.Group(); torso.position.set(0, 1.62, 0); body.add(torso);
  mesh(new THREE.BoxGeometry(0.52, 0.3, 0.27), robe, torso, 0, 0.12, 0);
  mesh(new THREE.BoxGeometry(0.1, 0.5, 0.06), robe, torso, -0.07, -0.05, 0.13);
  const neck = new THREE.Group(); neck.position.set(0, 0.28, 0.04); torso.add(neck);
  mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.22, 6), skin, neck, 0, 0.09, 0);
  const head = new THREE.Group(); head.position.set(0, 0.22, 0.02); neck.add(head);
  mesh(new THREE.SphereGeometry(0.11, 10, 8), skin, head, 0, 0.04, 0);
  const shadeMesh = mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.36, 14, 1, true), shade, head, 0, 0.1, 0);
  shadeMesh.rotation.z = 0.12;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.014, 6, 5), eyeMat, head, s * 0.038, -0.03, 0.1);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.28, 0.2, 0); torso.add(sh);
    mesh(new THREE.CylinderGeometry(0.038, 0.03, 1.05, 6), skin, sh, 0, -0.52, 0);
    const hand = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.035), skin, sh, 0, -1.12, 0);
    for (let f = 0; f < 3; f++) mesh(new THREE.BoxGeometry(0.012, 0.13, 0.012), skin, hand, -0.02 + f * 0.02, -0.15, 0);
    arms.push(sh);
  }
  return { root, body, torso, head, legs, arms, mats, eyeMat };
}

export function createGuest(scene, world, physics, audio) {
  const M = buildModel();
  scene.add(M.root);
  M.root.visible = false;

  const g = {
    model: M, state: 'dormant', active: false, phase: 0,
    x: 0, z: 0, yaw: 0, speed: 0, susp: 0, path: null, pi: 0, goal: null,
    lastKnown: null, lostT: 0, waitT: 0, searchT: 0, repathT: 0, stepT: 0, walkPh: 0,
    sawHideT: -99, lastSeenT: -99, chaseCooldown: 0, screamT: -99, finaleSpeed: 3.0,
    twitch: { x: 0, z: 0, tx: 0, tz: 0, t: 0 }, eye: 0, doorWait: null, lurkCb: null,
    noiseQueue: [], time: 0, wanderT: 0,
  };

  const SPEED = { patrol: [1.1, 1.3], investigate: [1.55, 1.75], search: [1.25, 1.4], chase: [2.9, 3.05], pullout: [2.4, 2.6] };
  const sp = (s) => (SPEED[s] ? SPEED[s][g.phase >= 2 ? 1 : 0] : 1.2) * (g.mercy && s === 'chase' ? 0.9 : 1);

  function place(x, z, yaw = 0) { g.x = x; g.z = z; g.yaw = yaw; M.root.position.set(x, 0, z); M.root.rotation.y = yaw; }

  function setPath(tx, tz) {
    const p = physics.findPath(g.x, g.z, tx, tz);
    g.path = p; g.pi = p && p.length > 1 ? 1 : 0; g.goal = { x: tx, z: tz };
    return !!p;
  }

  function choosePatrol(player) {
    const cands = [];
    for (const [x, z] of L.POIS) {
      const dG = Math.hypot(x - g.x, z - g.z);
      if (dG < 4) continue;
      if (x < 7 && z > 10 && z < 16 && world.doors.find((d) => d.id === 'office').locked) continue; // office, while locked
      const dP = Math.hypot(x - player.x, z - player.z);
      let w = 1;
      if (!g.mercy) { if (dP > 6 && dP < 18) w = 3; else if (dP <= 6) w = 0.5; }
      else if (dP < 10) w = 0.3;
      if (player.hidden && dP < 4) w = 0.15;
      cands.push({ x, z, w });
    }
    let r = Math.random() * cands.reduce((s, c) => s + c.w, 0);
    for (const c of cands) { r -= c.w; if (r <= 0) return c; }
    return cands[0];
  }

  function moveAlong(dt, speed) {
    if (!g.path || g.pi >= g.path.length) return true;
    let node = g.path[g.pi];
    // doors: stop, open, wait
    if (node.door && node.door.open < 0.6) {
      if (node.door.locked) { g.path = null; return true; }
      const dd = Math.hypot(node.x - g.x, node.z - g.z);
      if (dd < 1.25) {
        if (node.door.target < 1) { node.door.target = 1; node.door.speed = g.state === 'chase' ? 2.2 : 0.9; audio.creak([node.x, 1.2, node.z], true); g.onDoor?.(node.door); }
        g.speed = 0; return false;
      }
    }
    // skip ahead when the next-but-one node is in clear view
    while (g.pi + 1 < g.path.length && !g.path[g.pi].door && !g.path[g.pi + 1].door && physics.los(g.x, g.z, g.path[g.pi + 1].x, g.path[g.pi + 1].z) && Math.hypot(g.path[g.pi + 1].x - g.x, g.path[g.pi + 1].z - g.z) < 3.2) g.pi++;
    node = g.path[g.pi];
    const last = g.pi === g.path.length - 1;
    const tx = last && g.goal ? g.goal.x : node.x, tz = last && g.goal ? g.goal.z : node.z;
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    if (d < (last ? 0.2 : 0.35)) { g.pi++; return g.pi >= g.path.length; }
    const want = Math.atan2(dx, dz);
    g.yaw += angDiff(g.yaw, want) * Math.min(1, dt * (g.state === 'chase' ? 9 : 5));
    const step = Math.min(d, speed * dt);
    g.x += (dx / d) * step; g.z += (dz / d) * step;
    const p = { x: g.x, z: g.z }; physics.collide(p, 0.28, false); g.x = p.x; g.z = p.z;
    g.speed = speed;
    return false;
  }

  function perceive(player) {
    const dx = player.x - g.x, dz = player.z - g.z, dist = Math.hypot(dx, dz);
    if (player.hidden) return { sees: false, dist, range: 0 };
    let range = 3.0;
    if (player.light > 0.1) range = 5.5;
    if (player.light > 0.3) range = 9;
    if (player.lampOn) range = 15;
    if (player.running) range += 2.5;
    if (g.mercy) range *= 0.65;
    const cosA = (dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw)) / (dist || 1);
    const inFov = cosA > Math.cos(1.15) || dist < 1.7;
    const sees = dist < range && inFov && physics.los(g.x, g.z, player.x, player.z);
    return { sees, dist, range };
  }

  function enter(state) {
    if (g.state === state) return;
    g.state = state;
    g.path = null; g.repathT = 0;
    if (state === 'search') g.searchT = 7 + Math.random() * 3;
    if (state === 'patrol') g.waitT = 0;
  }

  g.spawn = function (x, z, yaw = 0, state = 'patrol') {
    place(x, z, yaw); g.active = true; M.root.visible = true; g.susp = 0; g.lastKnown = null; enter(state); g.state = state;
  };
  g.despawn = function () { g.active = false; M.root.visible = false; g.state = 'dormant'; g.path = null; };
  g.lurk = function (x, z, yaw, cb) { place(x, z, yaw); g.active = false; M.root.visible = true; g.state = 'lurk'; g.lurkCb = cb; };
  g.noise = function (x, z, radius) { if (g.active) g.noiseQueue.push({ x, z, radius }); };
  g.goTo = function (x, z, state = 'investigate') { enter(state); setPath(x, z); };

  // Returns an event string or null: 'caught', 'chase', 'lost'
  g.update = function (dt, player) {
    g.time += dt;
    let event = null;
    animate(dt, player);
    if (g.state === 'lurk') {
      const d = Math.hypot(player.x - g.x, player.z - g.z);
      g.lurkCb?.(d, dt);
      return null;
    }
    if (!g.active) return null;

    const per = perceive(player);
    const t = g.time;
    if (per.sees) { g.lastSeenT = t; g.lastKnown = { x: player.x, z: player.z }; }
    if (player.beamOnGuest && !player.hidden) { g.susp = Math.min(1.2, g.susp + dt * 1.8); g.lastKnown = { x: player.x, z: player.z }; g.lastSeenT = t; }

    if (g.state === 'finale') {
      if (g.repathT <= 0 || !g.path) { setPath(player.x, player.z); g.repathT = 0.4; }
      g.repathT -= dt;
      moveAlong(dt, g.finaleSpeed);
      if (per.dist < 0.85) event = 'caught';
      footsteps(dt, 1.3);
      return event;
    }

    // hearing
    while (g.noiseQueue.length) {
      const n = g.noiseQueue.shift();
      if (g.state === 'chase' || g.state === 'pullout') continue;
      const d = Math.hypot(n.x - g.x, n.z - g.z);
      const heard = d < n.radius * (physics.los(g.x, g.z, n.x, n.z) ? 1 : 0.6);
      if (heard) { g.susp = Math.max(g.susp, 0.45); enter('investigate'); setPath(n.x, n.z); g.lastKnown = { x: n.x, z: n.z }; }
    }

    if (per.sees) g.susp += dt * ((1.7 * (1 - per.dist / (per.range + 1)) + 0.45) * (player.lampOn ? 1.5 : 1) * (player.running ? 1.3 : 1));
    else if (g.state !== 'chase') g.susp = Math.max(0, g.susp - dt * 0.12);

    if (player.hidden && g.state === 'chase' && t - g.lastSeenT < 1.2 && per.dist < 6) {
      // it watched you get in
      enter('pullout'); setPath(player.hideAt[0], player.hideAt[1]);
    }

    switch (g.state) {
      case 'patrol': {
        if (g.susp >= 1) { enter('chase'); event = 'chase'; break; }
        if (g.susp >= 0.4 && g.lastKnown) { enter('investigate'); setPath(g.lastKnown.x, g.lastKnown.z); break; }
        if (!g.path) {
          if (g.waitT > 0) { g.waitT -= dt; g.speed = 0; break; }
          const c = choosePatrol(player); if (c) setPath(c.x, c.z);
          if (!g.path) g.waitT = 1;
        }
        if (moveAlong(dt, sp('patrol'))) { g.path = null; g.waitT = 1.5 + Math.random() * 2.5; }
        break;
      }
      case 'investigate': {
        if (g.susp >= 1) { enter('chase'); event = 'chase'; break; }
        if (per.sees && g.lastKnown && (g.repathT -= dt) <= 0) { setPath(g.lastKnown.x, g.lastKnown.z); g.repathT = 0.6; }
        if (!g.path && g.lastKnown) setPath(g.lastKnown.x, g.lastKnown.z);
        if (moveAlong(dt, sp('investigate')) || !g.path) { enter('search'); }
        break;
      }
      case 'chase': {
        g.susp = 1.1;
        if (per.sees) { g.lostT = 0; } else g.lostT += dt;
        if (g.lostT > 2.6) { enter('search'); g.susp = 0.55; event = 'lost'; break; }
        g.repathT -= dt;
        const tgt = per.sees ? player : g.lastKnown;
        if (tgt && (g.repathT <= 0 || !g.path)) { setPath(tgt.x, tgt.z); g.repathT = per.dist < 4 ? 0.2 : 0.45; }
        if (per.sees && per.dist < 2.2 && physics.los(g.x, g.z, player.x, player.z)) {
          // close in directly
          const dx = player.x - g.x, dz = player.z - g.z, d = per.dist;
          g.yaw += angDiff(g.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
          const step = Math.min(d, sp('chase') * dt);
          g.x += (dx / d) * step; g.z += (dz / d) * step; g.speed = sp('chase');
          const p = { x: g.x, z: g.z }; physics.collide(p, 0.28, false); g.x = p.x; g.z = p.z;
        } else if (moveAlong(dt, sp('chase')) && !per.sees) { enter('search'); g.susp = 0.55; event = 'lost'; }
        break;
      }
      case 'search': {
        if (g.susp >= 1) { enter('chase'); event = 'chase'; break; }
        g.searchT -= dt;
        if (g.searchT <= 0) { enter('patrol'); g.susp = 0; break; }
        if (!g.path) {
          if ((g.wanderT -= dt) > 0) { g.speed = 0; break; }
          const c = g.lastKnown || { x: g.x, z: g.z };
          for (let i = 0; i < 6 && !g.path; i++) { const a = Math.random() * TAU, r = 1 + Math.random() * 3; setPath(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); }
          g.wanderT = 0.6 + Math.random();
        }
        if (moveAlong(dt, sp('search'))) g.path = null;
        break;
      }
      case 'pullout': {
        if (moveAlong(dt, sp('pullout')) || Math.hypot(player.hideAt[0] - g.x, player.hideAt[1] - g.z) < 1.1) event = 'caught';
        break;
      }
    }
    if (!player.hidden && per.dist < 0.85 && g.state !== 'dormant') event = 'caught';
    footsteps(dt, g.state === 'chase' ? 1.2 : 0.8);
    return event;
  };

  function footsteps(dt, loud) {
    if (g.speed < 0.2) return;
    g.stepT -= dt;
    if (g.stepT <= 0) { g.stepT = 0.95 / Math.max(0.6, g.speed * 0.8) + Math.random() * 0.08; audio.guestStep([g.x, 0.2, g.z], loud); }
  }

  function animate(dt, player) {
    const moving = g.speed > 0.15;
    const chase = g.state === 'chase' || g.state === 'finale' || g.state === 'pullout';
    g.walkPh += dt * (moving ? 2.2 + g.speed * 1.6 : 0);
    const amp = moving ? Math.min(1, g.speed / 1.4) : 0;
    M.legs[0].rotation.x = Math.sin(g.walkPh) * 0.55 * amp;
    M.legs[1].rotation.x = -Math.sin(g.walkPh) * 0.55 * amp;
    const reach = chase ? -1.25 : 0;
    M.arms[0].rotation.x += ((-Math.sin(g.walkPh) * 0.3 * amp + reach) - M.arms[0].rotation.x) * Math.min(1, dt * 6);
    M.arms[1].rotation.x += ((Math.sin(g.walkPh) * 0.3 * amp + reach * 0.85) - M.arms[1].rotation.x) * Math.min(1, dt * 6);
    M.arms[0].rotation.z = -0.07; M.arms[1].rotation.z = 0.07;
    M.body.position.y = Math.abs(Math.sin(g.walkPh)) * 0.045 * amp;
    M.torso.rotation.x += ((chase ? 0.32 : 0.12) - M.torso.rotation.x) * Math.min(1, dt * 4);
    // head: slow listening tilt, sudden twitches
    const tw = g.twitch; tw.t -= dt;
    if (tw.t <= 0) { tw.t = 0.4 + Math.random() * (chase ? 0.6 : 2.5); tw.tx = (Math.random() - 0.5) * 0.5; tw.tz = (Math.random() - 0.5) * 0.9; }
    tw.x += (tw.tx - tw.x) * Math.min(1, dt * 14); tw.z += (tw.tz - tw.z) * Math.min(1, dt * 14);
    M.head.rotation.x = tw.x; M.head.rotation.z = tw.z + Math.sin(g.time * 0.7) * 0.1;
    M.root.position.set(g.x, 0, g.z);
    M.root.rotation.y = g.yaw;
    // light it like everything else
    const w = world.probeOf(g.x, 1.4, g.z);
    for (const m of M.mats) { m.userData.weights.set(w); world.updateProbe(m.userData.uProbe.value, w); }
    M.eyeMat.color.setRGB(g.eye * 6 + 0.02, g.eye * 5.2 + 0.015, g.eye * 3 + 0.01);
  }

  g.headPos = () => new THREE.Vector3(g.x, 2.0, g.z);
  g.serialize = () => ({ x: g.x, z: g.z, yaw: g.yaw, state: g.state, active: g.active, phase: g.phase, visible: M.root.visible });
  return g;
}
