// Chooses the screen layout from the space the browser reports, never from a
// device check. Measured in iOS 27 Safari on the iPhone Duo simulator:
//   closed            382x580, posture continuous, 1 segment        -> handheld
//   open, flat        951x543, continuous, 1 segment                -> theater
//   half-open (book)  951x543, folded, 2 side-by-side segments,
//                     crease x=475.5                                -> book
//   half-open, turned 669x825, folded, 2 stacked segments,
//                     crease y=349.5                                -> deck
// Segments lag the posture by ~0.5 s and their sizes can be stale during a
// fold, so only the crease coordinate is read, and only when it is sane.

const qH = matchMedia('(horizontal-viewport-segments: 2)');
const qV = matchMedia('(vertical-viewport-segments: 2)');
const qFold = matchMedia('(device-posture: folded)');
const GAP = 12;

let safeProbe = null;
function readSafe() {
  if (!safeProbe) {
    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(safeProbe);
  }
  const cs = getComputedStyle(safeProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}

const sane = (v, max) => Number.isFinite(v) && v > max * 0.2 && v < max * 0.8;
const R = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

let foldOverride = 'auto';
export function setFoldOverride(v) { foldOverride = v || 'auto'; }

export function computeLayout(prev = {}) {
  const W = innerWidth, H = innerHeight;
  const s = readSafe();
  const ax = s.l, ay = s.t, aw = W - s.l - s.r, ah = H - s.t - s.b;
  const segs = window.viewport?.segments ?? null;
  const folded = qFold.matches || navigator.devicePosture?.type === 'folded';
  let mode, foldX = null, foldY = null, source = 'size';

  if (segs?.length === 2 && segs[1].x > 1 && sane(segs[0].x + segs[0].width, W)) { mode = 'book'; foldX = segs[0].x + segs[0].width; source = 'segments'; }
  else if (segs?.length === 2 && segs[1].y > 1 && sane(segs[0].y + segs[0].height, H)) { mode = 'deck'; foldY = segs[0].y + segs[0].height; source = 'segments'; }
  else if (qH.matches) { mode = 'book'; foldX = W / 2; source = 'query'; }
  else if (qV.matches) { mode = 'deck'; foldY = prev.mode === 'deck' && prev.foldY ? prev.foldY : H * 0.42; source = 'query'; }
  else if (folded && Math.max(W, H) >= 640) {
    source = 'posture';
    if (W >= H) { mode = 'book'; foldX = prev.mode === 'book' && prev.foldX ? prev.foldX : W / 2; }
    else { mode = 'deck'; foldY = prev.mode === 'deck' && prev.foldY ? prev.foldY : H * 0.42; }
  } else mode = W / H >= 1.15 ? 'theater' : 'handheld';
  // Safari only reports the fold when its Device Posture / Viewport Segments
  // feature flags are on, so the player can pick the posture by hand.
  if (foldOverride === 'book' && mode !== 'book' && W >= H && W >= 640) { mode = 'book'; foldX = W / 2; source = 'manual'; }
  if (foldOverride === 'tabletop' && mode !== 'deck' && H > W && H >= 640) { mode = 'deck'; foldY = Math.round(H * 0.424); source = 'manual'; }

  const L = { mode, W, H, safe: s, foldX, foldY, source, posture: navigator.devicePosture?.type ?? (folded ? 'folded' : 'continuous'), segments: segs?.length ?? 1 };
  const fit = (box, align = 'center') => {
    let w = box.w, h = w * 0.75;
    if (h > box.h) { h = box.h; w = h * 4 / 3; }
    const y = align === 'top' ? box.y : box.y + (box.h - h) / 2;
    return R(box.x + (box.w - w) / 2, y, w, h);
  };

  if (mode === 'handheld') {
    let vf = fit({ x: ax, y: ay, w: aw, h: ah }, 'top');
    const minDeck = Math.min(190, ah * 0.36);
    if (ah - vf.h < minDeck) vf = fit({ x: ax, y: ay, w: aw, h: ah - minDeck }, 'top');
    L.vf = vf;
    L.deck = R(ax, vf.y + vf.h, aw, ay + ah - vf.y - vf.h);
    L.stick = R(0, L.deck.y, W * 0.52, H - L.deck.y);
    L.buttons = { area: L.deck, side: 'right' };
  } else if (mode === 'theater') {
    let vf = fit({ x: ax, y: ay, w: aw, h: ah });
    if (vf.w > aw * 0.84) vf = fit({ x: ax + aw * 0.08, y: ay, w: aw * 0.84, h: ah });
    L.vf = vf;
    L.barL = R(0, 0, vf.x, H);
    L.barR = R(vf.x + vf.w, 0, W - vf.x - vf.w, H);
    L.stick = R(0, H * 0.3, W * 0.42, H * 0.7);
    L.buttons = { area: L.barR, side: 'bar' };
  } else if (mode === 'book') {
    const left = R(ax, ay, foldX - GAP - ax, ah);
    const right = R(foldX + GAP, ay, ax + aw - foldX - GAP, ah);
    let vf = fit({ x: left.x, y: left.y, w: left.w, h: ah - 120 }, 'top');
    L.vf = vf; L.left = left; L.right = right;
    L.stick = R(0, vf.y + vf.h * 0.5, foldX - GAP, H - vf.y - vf.h * 0.5);
    L.ledger = R(right.x, right.y, right.w, right.h * 0.58);
    L.pad = R(right.x, right.y + right.h * 0.58, right.w, right.h * 0.42);
    L.deck = L.pad;
    L.buttons = { area: L.pad, side: 'right' };
  } else {
    const top = R(ax, ay, aw, foldY - GAP - ay);
    const bottom = R(ax, foldY + GAP, aw, ay + ah - foldY - GAP);
    L.vf = fit(top);
    L.top = top; L.bottom = bottom;
    L.deck = bottom;
    L.stick = R(0, bottom.y, W * 0.5, H - bottom.y);
    L.buttons = { area: bottom, side: 'right' };
  }
  return L;
}

// Calls onChange(next, prev) whenever the layout settles on something new.
// The first re-check waits 250 ms: mid-fold Safari briefly reports in-between
// sizes (585x825, 814x510) that would flash the wrong layout.
export function watchLayout(onChange, onMotion) {
  let state = {};
  let timers = [];
  const same = (a, b) => a.mode === b.mode && a.W === b.W && a.H === b.H &&
    Math.abs((a.foldX ?? 0) - (b.foldX ?? 0)) < 1 && Math.abs((a.foldY ?? 0) - (b.foldY ?? 0)) < 1 &&
    a.safe?.t === b.safe?.t && a.safe?.b === b.safe?.b && a.safe?.l === b.safe?.l && a.safe?.r === b.safe?.r;
  function check(force) {
    const next = computeLayout(state);
    if (force) state = {};
    if (same(next, state)) return;
    const prev = state; state = next;
    document.documentElement.dataset.layout = next.mode;
    onChange(next, prev);
  }
  function schedule() {
    onMotion?.();
    timers.forEach(clearTimeout);
    timers = [250, 600, 1100, 1800].map((ms) => setTimeout(check, ms));
  }
  addEventListener('resize', schedule);
  addEventListener('orientationchange', schedule);
  for (const q of [qH, qV, qFold]) q.addEventListener?.('change', schedule);
  navigator.devicePosture?.addEventListener?.('change', schedule);
  window.viewport?.addEventListener?.('segmentschange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  check();
  return { get: () => state, recheck: () => check(true) };
}
