// Builds the motel from level data: merged static meshes with per-vertex baked
// light (12 switchable channels + ambient/AO), dynamic doors and items, and
// the few emissive things (fixtures, signs, screens).
import * as THREE from 'three';
import * as L from './level.js';
import { makeTextures, FRONTED, plateTexture, neonSignTexture, exitSignTexture, staticTexture } from './textures.js';

const NCH = L.CHANNELS.length;
const FLOOR_MAT = { ',': 'vinyl', o: 'officeFloor', '.': 'carpetCorr', r: 'carpetRoom', n: 'carpet9', ':': 'concrete', l: 'laundryTile' };
const WALL_MAT = { ',': 'wallLobby', o: 'wallOffice', '.': 'wallCorr', r: 'wallRoom', n: 'wall9', ':': 'wallService', l: 'wallService' };
const CEIL_MAT = { ',': 'ceilTile', o: 'ceilPlaster', '.': 'ceilTile', r: 'ceilPlaster', n: 'ceilPlaster', ':': 'ceilConcrete', l: 'ceilTile' };
const ROWS = [0, 0.15, 0.6, 1.2, 1.8, 2.35, 2.7];
const REVEAL = 0.3;

// ---------------------------------------------------------------- geometry
class Batch {
  constructor(key, cast) { this.key = key; this.cast = cast; this.p = []; this.n = []; this.uv = []; }
  tri(a, b, c, n, ua, ub, uc) {
    this.p.push(...a, ...b, ...c); this.n.push(...n, ...n, ...n); this.uv.push(...ua, ...ub, ...uc);
  }
}
const batches = new Map();
function batch(key, cast = false) {
  const k = key + (cast ? '|c' : '');
  if (!batches.has(k)) batches.set(k, new Batch(key, cast));
  return batches.get(k);
}
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A subdivided quad: origin o, unit axes u and v, lengths, segments, normal,
// and uvf(pos) -> [u, v].
function gridQuad(b, o, u, v, lu, lv, su, sv, n, uvf, vStops = null) {
  const flip = dot(cross(u, v), n) < 0;
  const vs = vStops || Array.from({ length: sv + 1 }, (_, j) => (j / sv) * lv);
  for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < su; i++) {
    const u0 = (i / su) * lu, u1 = ((i + 1) / su) * lu, v0 = vs[j], v1 = vs[j + 1];
    const a = add(add(o, u, u0), v, v0), bb = add(add(o, u, u1), v, v0), c = add(add(o, u, u1), v, v1), d = add(add(o, u, u0), v, v1);
    const ta = uvf(a), tb = uvf(bb), tc = uvf(c), td = uvf(d);
    if (!flip) { b.tri(a, bb, c, n, ta, tb, tc); b.tri(a, c, d, n, ta, tc, td); }
    else { b.tri(a, c, bb, n, ta, tc, tb); b.tri(a, d, c, n, ta, td, tc); }
  }
}
const stops = (y0, y1) => [y0, ...ROWS.filter((r) => r > y0 + 0.05 && r < y1 - 0.05), y1];

// The four directions: neighbour offset, face plane, inward normal, wall axis.
const DIRS = [
  { dx: 0, dz: -1, n: [0, 0, 1], o: (x, z) => [x, 0, z], u: [1, 0, 0], uv: (p) => p[0] },
  { dx: 0, dz: 1, n: [0, 0, -1], o: (x, z) => [x, 0, z + 1], u: [1, 0, 0], uv: (p) => -p[0] },
  { dx: -1, dz: 0, n: [1, 0, 0], o: (x, z) => [x, 0, z], u: [0, 0, 1], uv: (p) => -p[2] },
  { dx: 1, dz: 0, n: [-1, 0, 0], o: (x, z) => [x + 1, 0, z], u: [0, 0, 1], uv: (p) => p[2] },
];

function wallFace(key, d, x, z, y0, y1) {
  const o = d.o(x, z); o[1] = y0;
  gridQuad(batch(key), o, d.u, [0, 1, 0], 1, y1 - y0, 2, 1, d.n, (p) => [d.uv(p), p[1] / L.WALL_H], stops(y0, y1).map((s) => s - y0));
}
function floorQuad(key, x0, z0, w, d, y, up, scale = 1) {
  gridQuad(batch(key), [x0, y, z0], [1, 0, 0], [0, 0, 1], w, d, Math.max(1, Math.round(w * 2)), Math.max(1, Math.round(d * 2)), up ? [0, 1, 0] : [0, -1, 0], (p) => [p[0] / scale, p[2] / scale]);
}

function buildArchitecture() {
  const kindOf = (x, z) => L.tileAt(x, z);
  for (let z = 0; z < L.H; z++) for (let x = 0; x < L.W; x++) {
    const c = kindOf(x, z);
    if (L.FLOOR.has(c)) {
      floorQuad(FLOOR_MAT[c], x, z, 1, 1, 0, true, c === ':' ? 2 : 1);
      floorQuad(CEIL_MAT[c], x, z, 1, 1, L.WALL_H, false, 2);
      for (const d of DIRS) {
        const nc = kindOf(x + d.dx, z + d.dz);
        if (L.FLOOR.has(nc)) continue;
        const wm = WALL_MAT[c];
        if (nc === '#') wallFace(wm, d, x, z, 0, L.WALL_H);
        else if (nc === 'D') wallFace(wm, d, x, z, L.DOOR_H, L.WALL_H);
        else if (nc === 'W' || nc === 'G') {
          const lo = nc === 'W' ? L.WIN_LO : 0, hi = nc === 'W' ? L.WIN_HI : L.GLASS_HI;
          if (lo > 0) wallFace(wm, d, x, z, 0, lo);
          wallFace(wm, d, x, z, hi, L.WALL_H);
          // reveal: sill, header, jambs
          const o = d.o(x, z), into = [-d.n[0], 0, -d.n[2]];
          if (lo > 0) gridQuad(batch(wm), [o[0], lo, o[2]], d.u, into, 1, REVEAL, 2, 1, [0, 1, 0], (p) => [d.uv(p), 0.3]);
          gridQuad(batch(wm), [o[0], hi, o[2]], d.u, into, 1, REVEAL, 2, 1, [0, -1, 0], (p) => [d.uv(p), 0.95]);
          for (const end of [0, 1]) {
            const ex = x + d.dx + (d.u[0] ? (end ? 1 : -1) : 0), ez = z + d.dz + (d.u[2] ? (end ? 1 : -1) : 0);
            if (kindOf(ex, ez) === nc) continue;
            const eo = add(o, d.u, end); eo[1] = lo;
            const jn = d.u.map((v) => (end ? -v : v));
            gridQuad(batch(wm), eo, into, [0, 1, 0], REVEAL, hi - lo, 1, 3, jn, (p) => [p[0] + p[2], p[1] / L.WALL_H]);
          }
          if (nc === 'G') floorQuad('darkmetal', Math.min(o[0], o[0] + into[0] * REVEAL), Math.min(o[2], o[2] + into[2] * REVEAL), d.u[0] ? 1 : REVEAL, d.u[2] ? 1 : REVEAL, 0.003, true);
        }
      }
    } else if (c === 'D') {
      const door = L.DOORS.find((dd) => dd.tx === x && dd.tz === z);
      const alongZ = door.axis === 'x'; // passage runs along z
      const sideA = alongZ ? kindOf(x, z - 1) : kindOf(x - 1, z);
      const sideB = alongZ ? kindOf(x, z + 1) : kindOf(x + 1, z);
      for (const [half, k] of [[0, sideA], [1, sideB]]) {
        const x0 = alongZ ? x : x + half * 0.5, z0 = alongZ ? z + half * 0.5 : z, w = alongZ ? 1 : 0.5, dd = alongZ ? 0.5 : 1;
        floorQuad(FLOOR_MAT[k] || 'darkwood', x0, z0, w, dd, 0, true, k === ':' ? 2 : 1);
        floorQuad(WALL_MAT[k] || 'darkwood', x0, z0, w, dd, L.DOOR_H, false);
        for (const d of DIRS) {
          if (alongZ ? d.dz !== 0 : d.dx !== 0) continue;
          if (kindOf(x + d.dx, z + d.dz) !== '#') continue;
          const o = d.o(x, z);
          const along = alongZ ? [0, 0, 1] : [1, 0, 0];
          const start = add(o, along, half * 0.5); start[1] = 0;
          gridQuad(batch(WALL_MAT[k] || 'darkwood'), start, along, [0, 1, 0], 0.5, L.DOOR_H, 1, 1, d.n, (p) => [p[0] + p[2], p[1] / L.WALL_H], stops(0, L.DOOR_H));
        }
      }
    }
  }
}

// Props: boxes (with atlas fronts) and cylinders, transformed into the world.
function buildProps(collide) {
  for (const pr of L.PROPS) {
    const b = batch(pr.mat, pr.cast);
    if (pr.kind === 'box') {
      const cx = pr.x, cy = pr.y + pr.h / 2, cz = pr.z, hx = pr.w / 2, hy = pr.h / 2, hz = pr.d / 2;
      const cs = Math.cos(pr.rotY), sn = Math.sin(pr.rotY);
      const rot = (p) => [cx + (p[0] - cx) * cs + (p[2] - cz) * sn, p[1], cz - (p[0] - cx) * sn + (p[2] - cz) * cs];
      const rotN = (n) => [n[0] * cs + n[2] * sn, n[1], -n[0] * sn + n[2] * cs];
      const fronted = FRONTED[pr.mat];
      const faces = [
        { n: [0, 0, 1], o: [cx - hx, cy - hy, cz + hz], u: [1, 0, 0], v: [0, 1, 0], lu: pr.w, lv: pr.h, f: '+z' },
        { n: [0, 0, -1], o: [cx + hx, cy - hy, cz - hz], u: [-1, 0, 0], v: [0, 1, 0], lu: pr.w, lv: pr.h, f: '-z' },
        { n: [1, 0, 0], o: [cx + hx, cy - hy, cz + hz], u: [0, 0, -1], v: [0, 1, 0], lu: pr.d, lv: pr.h, f: '+x' },
        { n: [-1, 0, 0], o: [cx - hx, cy - hy, cz - hz], u: [0, 0, 1], v: [0, 1, 0], lu: pr.d, lv: pr.h, f: '-x' },
        { n: [0, 1, 0], o: [cx - hx, cy + hy, cz + hz], u: [1, 0, 0], v: [0, 0, -1], lu: pr.w, lv: pr.d, f: 'top' },
      ];
      if (pr.y > 0.01) faces.push({ n: [0, -1, 0], o: [cx - hx, cy - hy, cz - hz], u: [1, 0, 0], v: [0, 0, 1], lu: pr.w, lv: pr.d, f: 'bot' });
      for (const fc of faces) {
        const su = Math.max(1, Math.ceil(fc.lu / 0.6)), sv = Math.max(1, Math.ceil(fc.lv / 0.6));
        const isFront = fronted && fc.f === pr.front;
        const tmp = new Batch();
        gridQuad(tmp, fc.o, fc.u, fc.v, fc.lu, fc.lv, su, sv, fc.n, (p) => {
          const lu = dot([p[0] - fc.o[0], p[1] - fc.o[1], p[2] - fc.o[2]], fc.u) / fc.lu;
          const lv = dot([p[0] - fc.o[0], p[1] - fc.o[1], p[2] - fc.o[2]], fc.v) / fc.lv;
          if (fronted) return [isFront ? 0.5 + lu * 0.5 : lu * 0.5, lv];
          return [lu * fc.lu, lv * fc.lv];
        });
        for (let i = 0; i < tmp.p.length; i += 3) {
          const q = rot([tmp.p[i], tmp.p[i + 1], tmp.p[i + 2]]); b.p.push(...q);
          const nn = rotN([tmp.n[i], tmp.n[i + 1], tmp.n[i + 2]]); b.n.push(...nn);
        }
        b.uv.push(...tmp.uv);
      }
      if (pr.solid) {
        const ex = Math.abs(hx * cs) + Math.abs(hz * sn), ez = Math.abs(hx * sn) + Math.abs(hz * cs);
        collide.push({ minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, top: pr.y + pr.h });
      }
    } else {
      const g = new THREE.CylinderGeometry(pr.rTop, pr.rBot, pr.h, pr.seg, 1, false).toNonIndexed();
      g.translate(pr.x, pr.y + pr.h / 2, pr.z);
      const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
      for (let i = 0; i < P.length; i++) { b.p.push(P[i]); b.n.push(N[i]); }
      for (let i = 0; i < U.length; i += 2) b.uv.push(U[i] * 2, U[i + 1] * pr.h);
      if (pr.solid) { const r = Math.max(pr.rTop, pr.rBot); collide.push({ minX: pr.x - r, maxX: pr.x + r, minZ: pr.z - r, maxZ: pr.z + r, top: pr.y + pr.h }); }
    }
  }
}

// ---------------------------------------------------------------- baking
const opaque = (c) => c === '#';
function visible2D(ax, az, bx, bz) {
  let x = Math.floor(ax), z = Math.floor(az);
  const tx = Math.floor(bx), tz = Math.floor(bz);
  const dx = bx - ax, dz = bz - az;
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
  let tmz = dz !== 0 ? (dz > 0 ? z + 1 - az : az - z) * tdz : Infinity;
  const n = Math.abs(tx - x) + Math.abs(tz - z);
  for (let i = 0; i <= n; i++) {
    if (opaque(L.tileAt(x, z))) return false;
    if (tmx < tmz) { tmx += tdx; x += sx; } else { tmz += tdz; z += sz; }
  }
  return true;
}

// Ambient level for a surface point, read from the floor tile it faces.
function ambientNear(x, z) {
  for (const [ox, oz] of [[0, 0], [0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06], [0.06, 0.06], [-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06]]) {
    const c = L.tileAt(Math.floor(x + ox), Math.floor(z + oz));
    if (L.FLOOR.has(c)) return L.ambientAt(x + ox, z + oz);
  }
  return 0.3;
}

const LIGHTS = L.LIGHTS.map(([x, y, z, i, r, ch, wrap]) => ({ x, y, z, i, r, ch, wrap }));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function aoAt(px, py, pz, nx, ny, nz, props) {
  const ox = px + nx * 0.05, oz = pz + nz * 0.05;
  const tx = Math.floor(ox), tz = Math.floor(oz);
  let dmin = 1;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = L.tileAt(tx + dx, tz + dz);
    if (L.FLOOR.has(c) || c === 'D') continue;
    const cx = Math.max(tx + dx, Math.min(ox, tx + dx + 1)), cz = Math.max(tz + dz, Math.min(oz, tz + dz + 1));
    const d = Math.hypot(ox - cx, oz - cz);
    if (d > 0.07) dmin = Math.min(dmin, d);
  }
  let a = 0.5 + 0.5 * smooth(0, 0.75, dmin);
  if (Math.abs(ny) < 0.5) a *= (0.62 + 0.38 * smooth(0, 0.5, py)) * (0.8 + 0.2 * smooth(0, 0.4, L.WALL_H - py));
  else if (ny > 0.5 && py < 0.05) {
    for (const p of props) if (px > p.minX - 0.12 && px < p.maxX + 0.12 && pz > p.minZ - 0.12 && pz < p.maxZ + 0.12) { a *= 0.5; break; }
  }
  return a;
}

// Per-channel irradiance at a point. omni: ignore the normal (for probes).
function bakePoint(px, py, pz, nx, ny, nz, out, props, omni = false) {
  out.fill(0);
  for (const l of LIGHTS) {
    const dx = l.x - px, dy = l.y - py, dz = l.z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > l.r * l.r) continue;
    const d = Math.sqrt(d2) || 1e-4;
    let ndl = omni ? 1 : (nx * dx + ny * dy + nz * dz) / d;
    ndl = (ndl + l.wrap) / (1 + l.wrap);
    if (ndl <= 0) continue;
    const x = d / l.r, win = (1 - x * x * x * x) ** 2;
    const fall = (l.i / (d2 + 0.35)) * win;
    if (fall < 0.002) continue;
    // start just off the surface; if that is inside a wall, nudge toward the light
    let sx = px + nx * 0.04, sz = pz + nz * 0.04;
    if (opaque(L.tileAt(Math.floor(sx), Math.floor(sz)))) { sx += (dx / d) * 0.04; sz += (dz / d) * 0.04; }
    // soft shadow: three samples across the light
    const qx = -dz / d * 0.22, qz = dx / d * 0.22;
    let vis = 0;
    if (visible2D(sx, sz, l.x, l.z)) vis += 0.4;
    if (visible2D(sx, sz, l.x + qx, l.z + qz)) vis += 0.3;
    if (visible2D(sx, sz, l.x - qx, l.z - qz)) vis += 0.3;
    if (vis > 0) out[l.ch] += ndl * fall * vis;
  }
  out[NCH] = ambientNear(px + nx * 0.05, pz + nz * 0.05) * aoAt(px, py, pz, nx, ny, nz, props);
  return out;
}

function bakeBatch(b, props) {
  const nv = b.p.length / 3;
  const A = new Float32Array(nv * 4), B = new Float32Array(nv * 4), C = new Float32Array(nv * 4), D = new Float32Array(nv * 4), M = new Float32Array(nv);
  const out = new Float32Array(NCH + 1);
  for (let i = 0; i < nv; i++) {
    bakePoint(b.p[i * 3], b.p[i * 3 + 1], b.p[i * 3 + 2], b.n[i * 3], b.n[i * 3 + 1], b.n[i * 3 + 2], out, props);
    for (let k = 0; k < 4; k++) { A[i * 4 + k] = out[k]; B[i * 4 + k] = out[4 + k]; C[i * 4 + k] = out[8 + k]; D[i * 4 + k] = out[12 + k]; }
    M[i] = out[NCH];
  }
  return { A, B, C, D, M };
}

// ---------------------------------------------------------------- materials
const shared = {
  uChCol: { value: Array.from({ length: NCH }, () => new THREE.Vector3()) },
  uAmb: { value: new THREE.Vector3(0.02, 0.025, 0.04) },
};
function bakedInject(shader) {
  shader.uniforms.uChCol = shared.uChCol;
  shader.uniforms.uAmb = shared.uAmb;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec4 bakeA; attribute vec4 bakeB; attribute vec4 bakeC; attribute vec4 bakeD; attribute float bakeAmb;
uniform vec3 uChCol[${NCH}]; uniform vec3 uAmb; varying vec3 vBaked;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vBaked = bakeAmb * uAmb
  + bakeA.x * uChCol[0] + bakeA.y * uChCol[1] + bakeA.z * uChCol[2] + bakeA.w * uChCol[3]
  + bakeB.x * uChCol[4] + bakeB.y * uChCol[5] + bakeB.z * uChCol[6] + bakeB.w * uChCol[7]
  + bakeC.x * uChCol[8] + bakeC.y * uChCol[9] + bakeC.z * uChCol[10] + bakeC.w * uChCol[11]
  + bakeD.x * uChCol[12] + bakeD.y * uChCol[13] + bakeD.z * uChCol[14] + bakeD.w * uChCol[15];`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBaked;')
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += vBaked * BRDF_Lambert( diffuseColor.rgb );');
}
function probeInject(shader) {
  shader.uniforms.uProbe = this.userData.uProbe;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uProbe;')
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += uProbe * BRDF_Lambert( diffuseColor.rgb );');
}

// A material for moving things: lit by the lamp plus a CPU-side light probe.
export function probeMaterial(params) {
  const m = new THREE.MeshLambertMaterial(params);
  m.userData.uProbe = { value: new THREE.Vector3() };
  m.userData.weights = new Float32Array(NCH + 1);
  m.onBeforeCompile = probeInject;
  m.customProgramCacheKey = () => 'probe';
  return m;
}

// ---------------------------------------------------------------- the world
export function buildWorld(renderer) {
  const t0 = performance.now();
  batches.clear();
  const tex = makeTextures(THREE, Math.min(4, renderer.capabilities.getMaxAnisotropy()));
  const group = new THREE.Group();
  const collide = [];
  buildArchitecture();
  buildProps(collide);
  const tGeo = performance.now();

  const vendingEmit = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(tex.vending.image, 136, 10, 86, 212, 136, 10, 86, 212);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  const worldMats = {};
  const meshes = [];
  let verts = 0;
  for (const b of batches.values()) {
    if (!b.p.length) continue;
    const baked = bakeBatch(b, collide);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('bakeA', new THREE.BufferAttribute(baked.A, 4));
    g.setAttribute('bakeB', new THREE.BufferAttribute(baked.B, 4));
    g.setAttribute('bakeC', new THREE.BufferAttribute(baked.C, 4));
    g.setAttribute('bakeD', new THREE.BufferAttribute(baked.D, 4));
    g.setAttribute('bakeAmb', new THREE.BufferAttribute(baked.M, 1));
    g.computeBoundingSphere();
    let mat = worldMats[b.key];
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ map: tex[b.key] || null, color: tex[b.key] ? 0xffffff : 0x777777 });
      if (b.key === 'vending') { mat.emissiveMap = vendingEmit; mat.emissive = new THREE.Color(0, 0, 0); }
      mat.onBeforeCompile = bakedInject;
      mat.customProgramCacheKey = () => 'baked';
      worldMats[b.key] = mat;
    }
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.castShadow = b.cast;
    m.matrixAutoUpdate = false; m.updateMatrix();
    group.add(m); meshes.push(m);
    verts += b.p.length / 3;
  }
  const tBake = performance.now();

  // ------------------------------------------------------------ emissives
  const chan = new Float32Array(NCH);          // current channel intensities
  const fixtureMats = Array.from({ length: NCH }, () => new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  for (const [x, z, len, ch] of L.FIXTURES) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.22), fixtureMats[ch]);
    m.position.set(x, L.WALL_H - 0.03, z); group.add(m);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(len + 0.08, 0.03, 0.3), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    housing.position.set(x, L.WALL_H - 0.008, z); group.add(housing);
  }
  // outside: the motel sign and the dark lot, seen through the lobby glass
  const neonMat = new THREE.MeshBasicMaterial({ map: neonSignTexture(THREE), color: 0xffffff });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), neonMat);
  sign.position.set(5.5, 2.4, 31.0); sign.rotation.y = Math.PI; group.add(sign);
  const westSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), neonMat);
  westSign.position.set(-4.0, 2.2, 21.5); westSign.rotation.y = Math.PI / 2; group.add(westSign);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.4, depthWrite: false });
  for (let z = 0; z < L.H; z++) for (let x = 0; x < L.W; x++) {
    if (L.tileAt(x, z) !== 'W') continue;
    let nd = null;
    for (const d of DIRS) if (L.FLOOR.has(L.tileAt(x - d.dx, z - d.dz))) nd = d;
    if (!nd) continue;
    const o = nd.o(x - nd.dx, z - nd.dz);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, L.WIN_HI - L.WIN_LO), glassMat);
    g.position.set(o[0] + nd.u[0] * 0.5 - nd.n[0] * 0.2, (L.WIN_LO + L.WIN_HI) / 2, o[2] + nd.u[2] * 0.5 - nd.n[2] * 0.2);
    g.lookAt(g.position.x + nd.n[0], g.position.y, g.position.z + nd.n[2]);
    group.add(g);
  }
  // sliding glass doors
  const slideMat = new THREE.MeshBasicMaterial({ color: 0x10141a, transparent: true, opacity: 0.45, depthWrite: false });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x222428 });
  const slides = [];
  for (const sx of [5.5, 6.5]) {
    const g = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.98, L.GLASS_HI - 0.04, 0.03), slideMat);
    pane.position.y = L.GLASS_HI / 2; g.add(pane);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, L.GLASS_HI, 0.06), frameMat); fr.position.set(sx < 6 ? -0.47 : 0.47, L.GLASS_HI / 2, 0); g.add(fr);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.06, 0.06), frameMat); bar.position.set(0, 0.03, 0); g.add(bar);
    g.position.set(sx, 0, 26.15); group.add(g);
    slides.push({ g, home: sx, dir: sx < 6 ? -1 : 1 });
  }
  const exitMat = new THREE.MeshBasicMaterial({ map: exitSignTexture(THREE), color: 0xffffff });
  const exitSign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.08), exitMat);
  exitSign.position.set(6.0, 2.48, 25.92); group.add(exitSign);
  // screens
  const staticTex = staticTexture(THREE);
  const tvMat = new THREE.MeshBasicMaterial({ map: staticTex, color: 0x888888 });
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), tvMat);
  tvScreen.position.set(19.605, 1.03, 26.7); tvScreen.rotation.y = Math.PI / 2; group.add(tvScreen);
  const monMat = new THREE.MeshBasicMaterial({ map: staticTex, color: 0x333333 });
  const monScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), monMat);
  monScreen.position.set(2.0, 1.33, 19.07); monScreen.rotation.y = Math.PI; group.add(monScreen);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffa050 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bulbMat);
  bulb.position.set(5.4, 1.26, 19.3); group.add(bulb);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, wireframe: true }));
  cage.position.set(5.4, 1.29, 19.3); group.add(cage);

  // ------------------------------------------------------------ doors
  const probeOf = (x, y, z) => bakePoint(x, y, z, 0, 1, 0, new Float32Array(NCH + 1), collide, true);
  const doorTex = tex.door;
  const doors = [];
  const OPEN_TOWARD = { office: 'n', officeBack: 's', r7: 'n', r4: 's', r9: 'e', staff: 'n', laundry: 'n', maint: 'n' };
  for (const d of L.DOORS) {
    const pivot = new THREE.Group();
    const mat = probeMaterial({ map: doorTex });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.94, L.DOOR_H - 0.03, 0.05), mat);
    leaf.castShadow = true; leaf.receiveShadow = true;
    const dir = -d.hinge; // direction from hinge to free end
    const knobMat = probeMaterial({ map: tex.brass });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), knobMat);
    const knob2 = knob.clone();
    if (d.axis === 'x') {
      pivot.position.set(d.tx + (d.hinge < 0 ? 0.03 : 0.97), 0, d.tz + 0.5);
      leaf.position.set(dir * 0.47, (L.DOOR_H - 0.03) / 2, 0);
      knob.position.set(dir * 0.84, 1.0, 0.05); knob2.position.set(dir * 0.84, 1.0, -0.05);
    } else {
      pivot.position.set(d.tx + 0.5, 0, d.tz + (d.hinge < 0 ? 0.03 : 0.97));
      leaf.rotation.y = Math.PI / 2;
      leaf.position.set(0, (L.DOOR_H - 0.03) / 2, dir * 0.47);
      knob.position.set(0.05, 1.0, dir * 0.84); knob2.position.set(-0.05, 1.0, dir * 0.84);
    }
    pivot.add(leaf, knob, knob2);
    const label = d.number || d.sign;
    if (label) {
      const pm = new THREE.MeshBasicMaterial({ map: plateTexture(THREE, label, d.number ? {} : { w: 192, h: 40, bg: '#d8d2c0', fg: '#1a1a1a', font: 'bold 20px Helvetica, Arial, sans-serif', border: '#555' }), color: 0x555555 });
      pm.userData.base = 0.33;
      for (const side of [1, -1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(d.number ? 0.16 : 0.34, d.number ? 0.06 : 0.07), pm);
        if (d.axis === 'x') { plate.position.set(dir * 0.47, 1.55, side * 0.03); plate.rotation.y = side > 0 ? 0 : Math.PI; }
        else { plate.position.set(side * 0.03, 1.55, dir * 0.47); plate.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
        pivot.add(plate);
      }
    }
    group.add(pivot);
    const w = probeOf(d.tx + 0.5, 1.2, d.tz + 0.5);
    mat.userData.weights.set(w); knobMat.userData.weights.set(w);
    const toward = OPEN_TOWARD[d.id];
    let sign = 1;
    if (d.axis === 'x') sign = toward === 'n' ? dir : -dir;
    else sign = toward === 'e' ? dir : -dir;
    doors.push({ ...d, pivot, mats: [mat, knobMat], open: 0, target: 0, speed: 1.6, sign, center: new THREE.Vector3(d.tx + 0.5, 1.0, d.tz + 0.5) });
  }
  // fake doors on the corridor walls
  const fakeDoors = [];
  for (const f of L.FAKE_DOORS) {
    const mat = probeMaterial({ map: doorTex, color: f.closet ? 0xb8b0a0 : 0xffffff });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.92, L.DOOR_H - 0.05, 0.04), mat);
    leaf.receiveShadow = true;
    const zFace = f.face === 's' ? f.tz + 1 + 0.02 : f.tz - 0.02;
    leaf.position.set(f.tx + 0.5, (L.DOOR_H - 0.05) / 2, zFace);
    group.add(leaf);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.02, L.DOOR_H + 0.04, 0.03), probeMaterial({ map: tex.darkwood }));
    frame.position.set(f.tx + 0.5, (L.DOOR_H + 0.04) / 2, f.face === 's' ? f.tz + 1 + 0.005 : f.tz - 0.005);
    group.add(frame);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), probeMaterial({ map: tex.brass }));
    knob.position.set(f.tx + 0.85, 1.0, zFace + (f.face === 's' ? 0.04 : -0.04)); group.add(knob);
    const w = probeOf(f.tx + 0.5, 1.2, f.face === 's' ? f.tz + 1.4 : f.tz - 0.4);
    for (const m of [mat, frame.material, knob.material]) m.userData.weights.set(w);
    if (f.number || f.dnd) {
      const pm = new THREE.MeshBasicMaterial({ map: plateTexture(THREE, f.number), color: 0x555555 });
      pm.userData.base = 0.33;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), pm);
      plate.position.set(f.tx + 0.5, 1.55, zFace + (f.face === 's' ? 0.025 : -0.025));
      if (f.face === 'n') plate.rotation.y = Math.PI;
      group.add(plate);
      if (f.dnd) {
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.22), new THREE.MeshBasicMaterial({ map: plateTexture(THREE, 'DND', { w: 48, h: 112, bg: '#a8261c', fg: '#f4e8c8', font: 'bold 16px Helvetica, sans-serif', border: '#f4e8c8' }), color: 0x444444 }));
        tag.position.set(f.tx + 0.85, 0.86, zFace + 0.05); group.add(tag);
      }
    }
    fakeDoors.push({ ...f, meshes: [leaf, frame, knob], center: new THREE.Vector3(f.tx + 0.5, 1.2, f.face === 's' ? f.tz + 1.05 : f.tz - 0.05) });
  }

  // ------------------------------------------------------------ items
  const items = [];
  const paperMat = () => probeMaterial({ color: 0xd8d0bc });
  for (const it of L.ITEMS) {
    const g = new THREE.Group();
    const mats = [];
    const addMesh = (geo, mat, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); mats.push(mat); return m; };
    if (!it.hidden) {
      if (it.id === 'note1') {
        addMesh(new THREE.BoxGeometry(0.34, 0.03, 0.24), probeMaterial({ color: 0x23402e }), 0, 0.015, 0, 0.1);
        addMesh(new THREE.BoxGeometry(0.31, 0.012, 0.21), paperMat(), 0, 0.036, 0, 0.1);
      } else if (it.kind === 'note') {
        const m = addMesh(new THREE.BoxGeometry(it.id === 'note5' ? 0.09 : 0.15, 0.004, it.id === 'note5' ? 0.11 : 0.2), it.id === 'note5' ? probeMaterial({ color: 0xe8e4da }) : paperMat(), 0, 0.003, 0, 0.5);
        m.rotation.y = (it.pos[0] * 7.3) % 1.2;
      } else if (it.kind === 'key') {
        addMesh(new THREE.BoxGeometry(0.06, 0.008, 0.012), probeMaterial({ color: 0xb08a3a }), 0, 0.004, 0);
        addMesh(new THREE.BoxGeometry(0.035, 0.01, 0.07), probeMaterial({ color: 0x9a1a14 }), 0.05, 0.005, 0.02, 0.3);
      } else if (it.kind === 'fuse') {
        const body = addMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10), probeMaterial({ color: 0xd8d2c4 }), 0, 0.02, 0);
        body.rotation.z = Math.PI / 2;
        for (const s of [-1, 1]) { const cap = addMesh(new THREE.CylinderGeometry(0.021, 0.021, 0.02, 10), probeMaterial({ color: 0xb08a3a }), s * 0.055, 0.02, 0); cap.rotation.z = Math.PI / 2; }
      } else if (it.kind === 'battery') {
        addMesh(new THREE.BoxGeometry(0.07, 0.035, 0.11), probeMaterial({ color: 0x151515 }), 0, 0.018, 0, 0.4);
        addMesh(new THREE.BoxGeometry(0.06, 0.002, 0.06), probeMaterial({ color: 0xc9a227 }), 0, 0.037, 0, 0.4);
      }
      g.position.set(...it.pos);
      group.add(g);
    }
    const w = probeOf(it.pos[0], it.pos[1] + 0.3, it.pos[2]);
    for (const m of mats) m.userData.weights.set(w);
    items.push({ ...it, group: g, mats, taken: false, p: new THREE.Vector3(...it.pos) });
  }

  // ------------------------------------------------------------ runtime
  const dynMats = [];
  group.traverse((o) => { if (o.material?.userData?.uProbe) dynMats.push(o.material); });
  const uniqueDyn = [...new Set(dynMats)];

  function applyChannels() {
    for (let i = 0; i < NCH; i++) {
      const c = L.CHANNELS[i].color, k = chan[i];
      shared.uChCol.value[i].set(c[0] * k, c[1] * k, c[2] * k);
    }
    for (const m of uniqueDyn) updateProbe(m.userData.uProbe.value, m.userData.weights);
  }
  function updateProbe(v, w) {
    let r = w[NCH] * shared.uAmb.value.x, g = w[NCH] * shared.uAmb.value.y, b = w[NCH] * shared.uAmb.value.z;
    for (let i = 0; i < NCH; i++) { const s = w[i]; if (!s) continue; const c = shared.uChCol.value[i]; r += s * c.x; g += s * c.y; b += s * c.z; }
    v.set(r, g, b);
  }

  let staticT = 0;
  function update(dt, t) {
    for (const d of doors) {
      if (d.open !== d.target) {
        const step = dt * d.speed;
        d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
      }
      const ease = d.open * d.open * (3 - 2 * d.open);
      d.pivot.rotation.y = d.sign * ease * Math.PI * 0.55;
    }
    for (const s of slides) s.g.position.x = s.home + s.dir * slideOpen * 0.95;
    staticT += dt;
    if (staticT > 0.07) { staticT = 0; staticTex.userData.redraw(); }
    // emissive surfaces follow their channel
    for (let i = 0; i < NCH; i++) {
      const k = chan[i], c = L.CHANNELS[i].color;
      if (L.POWER_CHANNELS.includes(i)) fixtureMats[i].color.setRGB(0.03 + c[0] * k * 2.4, 0.03 + c[1] * k * 2.4, 0.03 + c[2] * k * 2.4);
    }
    const n = chan[L.CH.neon];
    neonMat.color.setRGB(0.35 + n * 1.6, 0.35 + n * 1.6, 0.35 + n * 1.6);
    exitMat.color.setScalar(0.25 + chan[L.CH.exit] * 2.2);
    tvMat.color.setScalar(chan[L.CH.tv] * 1.4);
    monMat.color.setScalar(0.12 + chan[L.CH.lobbyPower] * 0.6);
    bulbMat.color.setRGB(chan[L.CH.lantern] * 2.2, chan[L.CH.lantern] * 1.3, chan[L.CH.lantern] * 0.6);
    const v = chan[L.CH.vending];
    worldMats.vending.emissive.setRGB(v * 0.9, v * 0.95, v);
    applyChannels();
  }

  let slideOpen = 0;
  const world = {
    group, tex, doors, fakeDoors, items, collide, chan, shared, verts,
    timings: { geometry: Math.round(tGeo - t0), bake: Math.round(tBake - tGeo) },
    meshes: meshes.length,
    probeOf, updateProbe, probeMaterial,
    update,
    setSlide(v) { slideOpen = v; },
    get slideOpen() { return slideOpen; },
    // brightness at a point from the static lights (for stealth)
    lightLevel(x, y, z) {
      const w = probeOf(x, y, z); let s = w[NCH] * 0.15;
      for (let i = 0; i < NCH; i++) { const c = L.CHANNELS[i].color; s += w[i] * chan[i] * (0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2]); }
      return s;
    },
  };
  return world;
}
