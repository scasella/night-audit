// Grid collision, line of sight and A* for the motel.
import * as L from './level.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createPhysics(world) {
  const doorAt = new Map(world.doors.map((d) => [d.tx + ',' + d.tz, d]));
  const door = (x, z) => doorAt.get(x + ',' + z);

  // Tiles whose centre sits inside furniture can't be walked through by the Guest.
  const propBlocked = new Set();
  for (let z = 0; z < L.H; z++) for (let x = 0; x < L.W; x++) {
    if (!L.isFloor(x, z)) continue;
    const cx = x + 0.5, cz = z + 0.5;
    for (const b of world.collide) if (cx > b.minX - 0.22 && cx < b.maxX + 0.22 && cz > b.minZ - 0.22 && cz < b.maxZ + 0.22) { propBlocked.add(x + ',' + z); break; }
  }

  function solid(x, z) {
    const c = L.tileAt(x, z);
    if (L.FLOOR.has(c)) return false;
    if (c === 'D') return door(x, z).open < 0.55;
    if (c === 'G') return world.slideOpen < 0.85;
    return true;
  }

  function pushOut(p, r, x0, x1, z0, z1) {
    const cx = clamp(p.x, x0, x1), cz = clamp(p.z, z0, z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
    else {
      const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b);
      if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
    }
    return true;
  }

  // Resolve a circle against walls, closed doors and furniture. Mutates p.
  function collide(p, r, withProps = true) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      const tx = Math.floor(p.x), tz = Math.floor(p.z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (solid(tx + dx, tz + dz) && pushOut(p, r, tx + dx, tx + dx + 1, tz + dz, tz + dz + 1)) hit = true;
      }
      if (withProps) for (const b of world.collide) {
        if (p.x + r < b.minX || p.x - r > b.maxX || p.z + r < b.minZ || p.z - r > b.maxZ) continue;
        if (pushOut(p, r, b.minX, b.maxX, b.minZ, b.maxZ)) hit = true;
      }
    }
    return hit;
  }

  // Can a ray pass between two points? Walls and closed doors block it.
  function los(ax, az, bx, bz) {
    let x = Math.floor(ax), z = Math.floor(az);
    const tx = Math.floor(bx), tz = Math.floor(bz);
    const dx = bx - ax, dz = bz - az;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? z + 1 - az : az - z) * tdz : Infinity;
    const n = Math.abs(tx - x) + Math.abs(tz - z);
    for (let i = 0; i <= n; i++) {
      const c = L.tileAt(x, z);
      if (c === '#' || c === 'W' || c === 'G') return false;
      if (c === 'D' && door(x, z).open < 0.45) return false;
      if (tmx < tmz) { tmx += tdx; x += sx; } else { tmz += tdz; z += sz; }
    }
    return true;
  }

  // A* over tiles. Guests open unlocked doors; locked doors are walls.
  function passable(x, z, opts) {
    const c = L.tileAt(x, z);
    if (c === 'D') { const d = door(x, z); return !d.locked || opts.ignoreLocks; }
    if (!L.FLOOR.has(c)) return false;
    if (propBlocked.has(x + ',' + z) && !opts.allowProps) return false;
    return true;
  }
  function findPath(sx, sz, gx, gz, opts = {}) {
    const start = [Math.floor(sx), Math.floor(sz)], goal = [Math.floor(gx), Math.floor(gz)];
    const key = (x, z) => z * L.W + x;
    const okStart = (x, z) => passable(x, z, { ...opts, allowProps: true });
    if (!okStart(...goal)) {
      // goal inside furniture or a wall: use the nearest open tile
      let best = null, bd = 1e9;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = goal[0] + dx, z = goal[1] + dz;
        if (passable(x, z, opts) && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = [x, z]; }
      }
      if (!best) return null;
      goal[0] = best[0]; goal[1] = best[1];
    }
    const open = [[start[0], start[1], 0, 0]];
    const g = new Map([[key(...start), 0]]);
    const came = new Map();
    const h = (x, z) => { const dx = Math.abs(x - goal[0]), dz = Math.abs(z - goal[1]); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    let found = false, guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][3] < open[bi][3]) bi = i;
      const [x, z, gc] = open.splice(bi, 1)[0];
      if (x === goal[0] && z === goal[1]) { found = true; break; }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        const isGoal = nx === goal[0] && nz === goal[1];
        if (!passable(nx, nz, opts) && !(isGoal && passable(nx, nz, { ...opts, allowProps: true }))) continue;
        if (dx && dz) {
          if (!passable(x + dx, z, opts) || !passable(x, z + dz, opts)) continue;
          if (L.tileAt(nx, nz) === 'D' || L.tileAt(x, z) === 'D') continue;
        }
        const ng = gc + (dx && dz ? Math.SQRT2 : 1);
        const k = key(nx, nz);
        if (ng < (g.get(k) ?? Infinity)) { g.set(k, ng); came.set(k, key(x, z)); open.push([nx, nz, ng, ng + h(nx, nz)]); }
      }
    }
    if (!found) return null;
    const tiles = [];
    let k = key(...goal);
    while (k !== undefined) { tiles.push([k % L.W, Math.floor(k / L.W)]); k = came.get(k); }
    tiles.reverse();
    return tiles.map(([x, z]) => ({ x: x + 0.5, z: z + 0.5, door: L.tileAt(x, z) === 'D' ? door(x, z) : null }));
  }

  function pathLength(path) {
    let s = 0; for (let i = 1; i < (path?.length ?? 0); i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return path ? s : Infinity;
  }

  return { solid, collide, los, findPath, pathLength, door, propBlocked };
}
