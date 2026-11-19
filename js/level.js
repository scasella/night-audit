// Level data for Tape 01: the ground floor of the Sundown Motor Inn.
// Pure data and small helpers, no rendering. One tile is one metre.
// Tile (tx, tz) covers world x in [tx, tx+1] and z in [tz, tz+1]; north is -z.

export const W = 52;
export const H = 32;
export const WALL_H = 2.7;
export const DOOR_H = 2.1;
export const WIN_LO = 0.9;
export const WIN_HI = 2.2;
export const GLASS_HI = 2.3;

// Floor kinds: ',' lobby vinyl  'o' office  '.' corridor carpet  'r' room carpet
// 'n' room 9 carpet  ':' concrete  'l' laundry tile.  Solid: '#'.  Special
// wall tiles: 'D' door, 'W' window, 'G' sliding glass door.
const grid = Array.from({ length: H }, () => Array(W).fill('#'));
function carve(x0, z0, x1, z1, ch) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z][x] = ch;
}
carve(1, 17, 10, 25, ',');   // lobby
carve(1, 11, 6, 15, 'o');    // office
carve(2, 8, 42, 9, ':');     // service corridor
carve(41, 10, 42, 18, ':');  // service passage
carve(11, 20, 42, 21, '.');  // main corridor
carve(33, 11, 38, 18, 'r');  // room 7
carve(19, 23, 24, 29, 'r');  // room 4
carve(44, 17, 49, 24, 'n');  // room 9
carve(15, 22, 17, 24, '.');  // ice and vending alcove
carve(13, 2, 20, 6, 'l');    // laundry
carve(29, 2, 37, 6, ':');    // maintenance

export const DOORS = [
  { id: 'office', tx: 3, tz: 16, axis: 'x', locked: true, key: 'officeKey', sign: 'OFFICE', hinge: -1 },
  { id: 'officeBack', tx: 3, tz: 10, axis: 'x', locked: true, key: 'officeKey', sign: 'OFFICE', hinge: 1 },
  { id: 'r7', tx: 35, tz: 19, axis: 'x', locked: false, number: '7', hinge: -1 },
  { id: 'r4', tx: 21, tz: 22, axis: 'x', locked: false, number: '4', hinge: 1 },
  { id: 'r9', tx: 43, tz: 20, axis: 'z', locked: false, number: '9', hinge: -1 },
  { id: 'staff', tx: 41, tz: 19, axis: 'x', locked: false, sign: 'STAFF ONLY', hinge: 1 },
  { id: 'laundry', tx: 16, tz: 7, axis: 'x', locked: false, sign: 'LAUNDRY', hinge: -1 },
  { id: 'maint', tx: 33, tz: 7, axis: 'x', locked: false, sign: 'MAINTENANCE', hinge: 1 },
];
for (const d of DOORS) grid[d.tz][d.tx] = 'D';

// Windows (wall with an opening) and the lobby's sliding glass doors.
const WINDOWS = [[2, 26], [3, 26], [8, 26], [9, 26], [0, 20], [0, 21], [0, 22], [21, 30], [22, 30], [50, 20], [50, 21], [17, 1]];
for (const [x, z] of WINDOWS) grid[z][x] = 'W';
grid[26][5] = 'G';
grid[26][6] = 'G';

export const GRID = grid;
export const FLOOR = new Set([',', 'o', '.', 'r', 'n', ':', 'l']);
export const tileAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= H ? '#' : grid[z][x]);
export const isFloor = (x, z) => FLOOR.has(tileAt(x, z));
export const isOpenTile = (x, z) => { const c = tileAt(x, z); return FLOOR.has(c) || c === 'D'; };

// Locked rooms are drawn as doors on the corridor walls with nothing behind.
// face: the side of the wall tile the door is on (n/s/e/w of the tile).
export const FAKE_DOORS = [
  { number: '1', tx: 14, tz: 19, face: 's', line: 'Locked.' },
  { number: '3', tx: 22, tz: 19, face: 's', line: 'Locked. There’s a DO NOT DISTURB tag on the handle.', dnd: true },
  { number: '5', tx: 28, tz: 19, face: 's', line: 'Locked. Something on the other side shifts its weight.' },
  { number: '2', tx: 13, tz: 22, face: 'n', line: 'Locked.' },
  { number: '6', tx: 28, tz: 22, face: 'n', line: 'Locked. It’s cold to the touch.' },
  { number: '8', tx: 35, tz: 22, face: 'n', line: 'Locked.' },
  { closet: true, tx: 31, tz: 19, face: 's', line: '' },
];

// Static light sources baked into the walls, by channel.
//  0 neon sign outside   1 vending machine   2 exit sign   3 room 4 TV
//  4 lightning           5 desk lantern      6 power: lobby and office
//  7..10 power: main corridor, west to east (10 includes room 9)
//  11 power: service passage   12 power: service hall east + maintenance
//  13 power: service hall west + laundry   14 power: rooms 4 and 7   15 spare
export const CHANNELS = [
  { name: 'neon', color: [1.0, 0.16, 0.3] },
  { name: 'vending', color: [0.72, 0.9, 1.0] },
  { name: 'exit', color: [1.0, 0.1, 0.06] },
  { name: 'tv', color: [0.62, 0.74, 1.0] },
  { name: 'lightning', color: [0.74, 0.82, 1.0] },
  { name: 'lantern', color: [1.0, 0.6, 0.3] },
  { name: 'lobbyPower', color: [1.0, 0.82, 0.6] },
  { name: 'corr1', color: [0.86, 1.0, 0.86] },
  { name: 'corr2', color: [0.86, 1.0, 0.86] },
  { name: 'corr3', color: [0.86, 1.0, 0.86] },
  { name: 'corr4', color: [0.86, 1.0, 0.86] },
  { name: 'passage', color: [0.9, 1.0, 0.92] },
  { name: 'serviceE', color: [0.9, 1.0, 0.92] },
  { name: 'serviceW', color: [0.9, 1.0, 0.92] },
  { name: 'rooms', color: [1.0, 0.86, 0.66] },
  { name: 'spare', color: [1, 1, 1] },
];
export const CH = Object.fromEntries(CHANNELS.map((c, i) => [c.name, i]));
export const POWER_CHANNELS = [CH.lobbyPower, CH.corr1, CH.corr2, CH.corr3, CH.corr4, CH.passage, CH.serviceE, CH.serviceW, CH.rooms];

// [x, y, z, intensity, radius, channel, wrap]
export const LIGHTS = [
  [3.0, 1.7, 25.7, 2.2, 7, CH.neon, 0.4], [9.0, 1.7, 25.7, 2.2, 7, CH.neon, 0.4], [1.3, 1.7, 21.5, 1.4, 6, CH.neon, 0.4],
  [16.0, 1.25, 23.9, 1.8, 5.5, CH.vending, 0.2],
  [6.0, 2.45, 25.75, 0.55, 3.2, CH.exit, 0.2],
  [20.0, 1.05, 27.0, 1.2, 4.5, CH.tv, 0.1],
  [3.0, 1.9, 25.6, 9, 9, CH.lightning, 0.5], [9.0, 1.9, 25.6, 9, 9, CH.lightning, 0.5], [1.3, 1.9, 21.5, 7, 8, CH.lightning, 0.5],
  [22.0, 1.9, 29.6, 8, 8, CH.lightning, 0.5], [49.6, 1.9, 21.0, 8, 8, CH.lightning, 0.5], [17.5, 2.2, 2.4, 6, 7, CH.lightning, 0.5],
  [5.4, 1.25, 19.3, 1.35, 6, CH.lantern, 0.15],
  [3.0, 2.55, 19.0, 2.6, 7, CH.lobbyPower, 0], [8.5, 2.55, 19.0, 2.6, 7, CH.lobbyPower, 0],
  [3.0, 2.55, 23.0, 2.6, 7, CH.lobbyPower, 0], [8.5, 2.55, 23.0, 2.6, 7, CH.lobbyPower, 0], [3.5, 2.55, 13.5, 2.4, 6, CH.lobbyPower, 0],
  [13, 2.58, 21, 2.8, 6, CH.corr1, 0], [17, 2.58, 21, 2.8, 6, CH.corr1, 0],
  [21, 2.58, 21, 2.8, 6, CH.corr2, 0], [25, 2.58, 21, 2.8, 6, CH.corr2, 0],
  [29, 2.58, 21, 2.8, 6, CH.corr3, 0], [33, 2.58, 21, 2.8, 6, CH.corr3, 0],
  [37, 2.58, 21, 2.8, 6, CH.corr4, 0], [41, 2.58, 21, 2.8, 6, CH.corr4, 0], [47, 2.55, 21, 2.4, 6, CH.corr4, 0],
  [42, 2.58, 12.5, 2.4, 6, CH.passage, 0], [42, 2.58, 17, 2.4, 6, CH.passage, 0],
  [24, 2.58, 9, 2.4, 6, CH.serviceE, 0], [30, 2.58, 9, 2.4, 6, CH.serviceE, 0], [36, 2.58, 9, 2.4, 6, CH.serviceE, 0], [33, 2.58, 4.5, 2.6, 6, CH.serviceE, 0],
  [6, 2.58, 9, 2.4, 6, CH.serviceW, 0], [12, 2.58, 9, 2.4, 6, CH.serviceW, 0], [18, 2.58, 9, 2.4, 6, CH.serviceW, 0], [17, 2.58, 4.5, 2.6, 6, CH.serviceW, 0],
  [22, 2.55, 26.5, 2.2, 6, CH.rooms, 0], [36, 2.55, 15, 2.2, 6, CH.rooms, 0],
];

// Ceiling fixtures that glow when their channel is powered: [x, z, len along x, channel]
export const FIXTURES = [
  [13, 21, 1.2, CH.corr1], [17, 21, 1.2, CH.corr1], [21, 21, 1.2, CH.corr2], [25, 21, 1.2, CH.corr2],
  [29, 21, 1.2, CH.corr3], [33, 21, 1.2, CH.corr3], [37, 21, 1.2, CH.corr4], [41, 21, 1.2, CH.corr4],
  [6, 9, 1.2, CH.serviceW], [12, 9, 1.2, CH.serviceW], [18, 9, 1.2, CH.serviceW], [24, 9, 1.2, CH.serviceE],
  [30, 9, 1.2, CH.serviceE], [36, 9, 1.2, CH.serviceE], [17, 4.5, 1.2, CH.serviceW], [33, 4.5, 1.2, CH.serviceE],
  [42, 12.5, 0.9, CH.passage], [42, 17, 0.9, CH.passage],
];

// Ambient (moonlight) level per floor kind and per zone, multiplied by baked AO.
export function ambientAt(x, z) {
  const c = tileAt(Math.floor(x), Math.floor(z));
  if (c === ',') return 1.0;
  if (c === 'r' && z > 22) return 0.75;   // room 4 has a window
  if (c === 'n') return 0.65;
  if (c === 'l') return 0.45;
  if (c === 'o') return 0.3;
  if (c === ':') return 0.28;
  return 0.36;
}

// ---------------------------------------------------------------------------
// Props. Each is a box (or cylinder) in world units: centre x/z, base y, size.
// mat names map to textures in world.js. cast: casts a lamp shadow. solid:
// blocks movement (its footprint becomes a collision box).
export const PROPS = [];
function box(x, y, z, w, h, d, mat, opts = {}) {
  PROPS.push({ kind: 'box', x, y, z, w, h, d, mat, cast: opts.cast ?? true, solid: opts.solid ?? (y < 0.5 && h > 0.3), rotY: opts.rotY || 0, tag: opts.tag, front: opts.front });
}
function cyl(x, y, z, rTop, rBot, h, mat, opts = {}) {
  PROPS.push({ kind: 'cyl', x, y, z, rTop, rBot, h, mat, cast: opts.cast ?? true, solid: opts.solid ?? (y < 0.5 && h > 0.3), seg: opts.seg || 12, tag: opts.tag });
}
function lamp(x, z, y = 0, tall = false) {
  if (tall) { cyl(x, y, z, 0.12, 0.16, 0.05, 'brass', { solid: false }); cyl(x, y + 0.05, z, 0.015, 0.015, 1.35, 'brass', { solid: false }); cyl(x, y + 1.3, z, 0.17, 0.27, 0.32, 'shade', { solid: false }); }
  else { cyl(x, y, z, 0.07, 0.09, 0.3, 'ceramic', { solid: false }); cyl(x, y + 0.28, z, 0.12, 0.19, 0.24, 'shade', { solid: false }); }
}
function bed(x0, z0, x1, z1, headSide) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  box(cx, 0, cz, w, 0.32, d, 'darkwood', { solid: true });
  box(cx, 0.32, cz, w - 0.06, 0.2, d - 0.06, 'bedspread', { solid: false });
  if (headSide === 'e') { box(x1 - 0.04, 0, cz, 0.08, 1.05, d + 0.1, 'darkwood', { solid: false }); box(x1 - 0.32, 0.52, cz, 0.38, 0.12, d - 0.3, 'linen', { solid: false }); }
  if (headSide === 'n') { box(cx, 0, z0 + 0.04, w + 0.1, 1.05, 0.08, 'darkwood', { solid: false }); box(cx, 0.52, z0 + 0.32, w - 0.3, 0.12, 0.38, 'linen', { solid: false }); }
}

// Lobby
box(4.0, 0, 19.3, 6.0, 1.05, 0.6, 'wood');                         // front desk
box(4.0, 1.05, 19.32, 6.1, 0.05, 0.75, 'darkwood', { solid: false });
box(2.0, 1.1, 19.3, 0.5, 0.42, 0.45, 'crt', { solid: false, tag: 'monitor', front: '-z' });
cyl(6.4, 1.1, 19.35, 0.05, 0.07, 0.06, 'brass', { solid: false });
box(5.4, 1.1, 19.3, 0.2, 0.26, 0.2, 'metal', { solid: false });   // lantern body
box(6.0, 1.3, 17.04, 1.3, 0.7, 0.06, 'wood', { solid: false });   // key board
box(2.1, 0, 23.8, 0.6, 0.45, 0.6, 'fabric'); box(2.1, 0.45, 23.55, 0.6, 0.45, 0.1, 'fabric', { solid: false });
box(3.0, 0, 23.8, 0.6, 0.45, 0.6, 'fabric'); box(3.0, 0.45, 23.55, 0.6, 0.45, 0.1, 'fabric', { solid: false });
box(2.55, 0, 24.85, 1.1, 0.4, 0.55, 'darkwood');
cyl(10.4, 0, 17.6, 0.26, 0.2, 0.45, 'ceramic'); cyl(10.4, 0.45, 17.6, 0.05, 0.42, 0.9, 'plant', { solid: false, seg: 7 });
box(10.6, 0, 24.6, 0.5, 1.4, 0.35, 'darkwood');                     // brochure rack
lamp(1.5, 25.4, 0, true);
// Office
box(5.2, 0, 12.2, 1.6, 0.76, 0.8, 'desk', { tag: 'officeDesk', front: '+z' });
box(5.2, 0, 13.25, 0.5, 0.48, 0.5, 'fabric');
box(6.6, 0, 11.6, 0.6, 1.3, 0.62, 'metal');
box(1.5, 0, 15.3, 0.7, 0.8, 0.6, 'darkmetal');
lamp(4.65, 12.0, 0.76);
// Room 4
bed(23.0, 25.3, 25.0, 26.7, 'e');
box(24.65, 0, 24.75, 0.5, 0.55, 0.45, 'wood');
lamp(24.7, 24.75, 0.55);
box(19.3, 0, 26.7, 0.55, 0.8, 1.8, 'wood');
box(19.36, 0.8, 26.7, 0.48, 0.45, 0.7, 'crt', { solid: false, tag: 'tv', front: '+x' });
box(19.7, 0, 29.65, 1.2, 2.0, 0.65, 'wardrobe', { tag: 'wardrobe4', front: '-z' });
box(21.6, 0, 28.0, 0.75, 0.22, 0.5, 'fabric', { rotY: 0.4 });     // open suitcase
// Room 7
bed(35.3, 11.0, 36.7, 13.0, 'n');
box(37.25, 0, 11.3, 0.45, 0.55, 0.45, 'wood');
lamp(37.25, 11.3, 0.55);
box(33.33, 0, 15.1, 0.65, 2.0, 1.2, 'wardrobe', { tag: 'wardrobe7', front: '+x' });
box(37.9, 0, 17.4, 0.9, 0.75, 0.5, 'wood');                         // desk
box(34.6, 0, 17.6, 0.5, 0.48, 0.5, 'fabric', { rotY: 0.6 });
// Room 9: every lamp in the building, in a ring.
for (let i = 0; i < 11; i++) {
  const a = (i / 11) * Math.PI * 2 + 0.3, r = 1.45;
  lamp(47.0 + Math.cos(a) * r, 21.0 + Math.sin(a) * r, 0, i % 3 === 0);
}
box(48.0, 0, 17.25, 1.4, 1.95, 0.3, 'bedspread', { rotY: 0.08 }); // mattress against the wall
box(44.7, 0, 23.9, 0.5, 0.55, 0.45, 'wood');
// Vending alcove
box(15.75, 0, 24.6, 1.1, 1.85, 0.8, 'vending', { tag: 'vending', front: '-z' });
box(17.2, 0, 24.65, 1.1, 1.3, 0.7, 'whitemetal', { tag: 'ice' });
// Laundry
box(13.55, 0, 2.38, 0.72, 0.9, 0.72, 'washer', { front: '+z' }); box(14.35, 0, 2.38, 0.72, 0.9, 0.72, 'washer', { front: '+z' });
box(15.4, 0, 2.38, 0.72, 0.9, 0.72, 'dryer', { front: '+z' }); box(16.2, 0, 2.38, 0.72, 0.9, 0.72, 'dryer', { tag: 'dryer2', front: '+z' });
box(17.0, 0, 2.38, 0.72, 0.9, 0.72, 'dryer', { front: '+z' });
box(16.4, 0, 4.6, 2.0, 0.86, 0.8, 'wood');                         // folding table
box(19.6, 0, 5.8, 0.75, 0.85, 0.55, 'fabric');                     // linen cart
box(20.6, 0, 4.1, 0.65, 2.0, 1.1, 'cabinet', { tag: 'cabinetL', front: '-x' });
// Maintenance
box(33.4, 1.0, 2.08, 0.8, 1.0, 0.14, 'panel', { solid: false, tag: 'panel', front: '+z' });
cyl(30.4, 0, 3.4, 0.68, 0.68, 2.2, 'boiler', { seg: 16 });
box(37.55, 0, 4.3, 0.85, 0.9, 2.4, 'wood');                         // workbench
box(35.4, 0, 2.3, 1.6, 1.9, 0.5, 'darkmetal');                      // shelves
box(29.35, 0, 6.65, 0.6, 2.0, 0.6, 'locker', { tag: 'lockerM', front: '-z' }); // locker
cyl(32.0, 0, 6.2, 0.22, 0.2, 0.35, 'plastic');                      // mop bucket
cyl(30.4, 2.2, 3.4, 0.12, 0.12, 0.5, 'darkmetal', { solid: false });
box(34.0, 2.45, 2.25, 9.0, 0.16, 0.16, 'darkmetal', { solid: false });
// Corridors
box(26.2, 0, 21.7, 0.6, 0.06, 0.45, 'whitemetal');                  // room-service tray
cyl(39.4, 0, 20.35, 0.14, 0.11, 0.25, 'whitemetal');                // ice bucket
box(9.0, 0, 8.6, 0.8, 0.9, 0.55, 'fabric');                         // linen cart
box(27.0, 0, 8.25, 0.45, 1.6, 0.45, 'darkmetal');                   // stacked chairs

// ---------------------------------------------------------------------------
// Hiding spots: where the camera sits, the way it faces, where you step out.
export const HIDES = [
  { id: 'closet', label: 'HIDE IN CLOSET', at: [31.5, 19.95], cam: [31.5, 1.55, 19.7], yaw: Math.PI, exit: [31.5, 20.55] },
  { id: 'wardrobe4', label: 'HIDE IN WARDROBE', at: [19.7, 29.3], cam: [19.7, 1.55, 29.75], yaw: 0, exit: [19.9, 28.6] },
  { id: 'wardrobe7', label: 'HIDE IN WARDROBE', at: [33.7, 15.1], cam: [33.25, 1.55, 15.1], yaw: -Math.PI / 2, exit: [34.4, 15.1] },
  { id: 'cabinetL', label: 'HIDE IN CABINET', at: [20.25, 4.1], cam: [20.65, 1.55, 4.1], yaw: Math.PI / 2, exit: [19.6, 4.1] },
  { id: 'lockerM', label: 'HIDE IN LOCKER', at: [29.35, 6.3], cam: [29.35, 1.55, 6.62], yaw: 0, exit: [29.5, 5.75] },
];

// Pickups and readables. pos is where it sits; the prompt appears when you
// look at it from close by.
export const ITEMS = [
  { id: 'note1', kind: 'note', pos: [4.3, 1.11, 19.2], label: 'READ LEDGER' },
  { id: 'officeKey', kind: 'key', pos: [24.55, 0.57, 24.6], label: 'TAKE KEY' },
  { id: 'note3', kind: 'note', pos: [24.75, 0.57, 24.9], label: 'READ NOTE' },
  { id: 'fuseL', kind: 'fuse', pos: [16.2, 0.5, 2.8], label: 'OPEN DRYER', hidden: true },
  { id: 'note4', kind: 'note', pos: [16.0, 0.87, 4.55], label: 'READ NOTE' },
  { id: 'fuseO', kind: 'fuse', pos: [5.6, 0.6, 12.65], label: 'OPEN DRAWER', hidden: true },
  { id: 'note5', kind: 'note', pos: [4.95, 0.77, 12.25], label: 'LOOK AT PHOTO' },
  { id: 'fuseR', kind: 'fuse', pos: [47.0, 0.02, 21.0], label: 'TAKE FUSE' },
  { id: 'note6', kind: 'note', pos: [46.3, 0.02, 20.4], label: 'READ CARD' },
  { id: 'battery1', kind: 'battery', pos: [37.25, 0.57, 11.45], label: 'TAKE BATTERY' },
  { id: 'battery2', kind: 'battery', pos: [37.5, 0.92, 3.6], label: 'TAKE BATTERY' },
  { id: 'battery3', kind: 'battery', pos: [17.0, 1.32, 24.6], label: 'TAKE BATTERY' },
];

export const START = { x: 4.4, z: 17.75, yaw: Math.PI }; // behind the desk, facing the front doors

// Places the Guest walks between.
export const POIS = [
  [6, 21.5], [14, 21], [16.5, 23.3], [22, 26], [26, 21], [31, 21], [36, 15], [40, 21],
  [47, 21], [42, 14], [38, 9], [33, 4.5], [25, 9], [18.3, 4.0], [8, 9], [3.5, 13],
];
export const GUEST_HOME = [47.2, 21.4];

export const FRONT_DOOR = { x: 6.0, z: 26.0 };
export const PANEL = { x: 33.4, y: 1.5, z: 2.3 };
