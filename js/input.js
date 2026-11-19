// Touch: a floating stick on the left zone, drag-to-look everywhere else,
// tap the picture to use. Buttons are separate elements. Keyboard and mouse
// work too (WASD / arrows, mouse drag or pointer lock, F lamp, E use).

export function createInput({ layer, vf, stickBase, stickKnob, getLayout }) {
  const st = {
    enabled: false,
    stick: null, look: null,
    mx: 0, my: 0, run: false,
    lookDX: 0, lookDY: 0, mouseDX: 0, mouseDY: 0,
    presses: new Set(), keys: new Set(),
    lastTouch: 0,
  };
  const inRect = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const stickR = () => { const L = getLayout(); return Math.max(42, Math.min(64, Math.min(L.W, L.H) * 0.11)); };

  function showStick(on) {
    stickBase.style.display = stickKnob.style.display = on ? 'block' : 'none';
  }
  function placeStick() {
    if (!st.stick) return;
    const r = stickR();
    stickBase.style.cssText = `display:block;left:${st.stick.ox - r}px;top:${st.stick.oy - r}px;width:${r * 2}px;height:${r * 2}px`;
    const k = r * 0.46;
    stickKnob.style.cssText = `display:block;left:${st.stick.ox + st.mx * r - k}px;top:${st.stick.oy + st.my * r - k}px;width:${k * 2}px;height:${k * 2}px`;
    stickKnob.classList.toggle('run', st.run);
  }

  function down(e) {
    if (!st.enabled) return;
    e.preventDefault();
    if (e.pointerType === 'touch') st.lastTouch = performance.now();
    const L = getLayout();
    const p = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse') {
      if (document.pointerLockElement) return;
      st.look = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), moved: 0, mouse: true };
      layer.setPointerCapture?.(e.pointerId);
      return;
    }
    if (!st.stick && inRect(p, L.stick)) {
      const r = stickR();
      // keep the stick off the screen edges (Safari's back swipe, home indicator)
      const ox = Math.max(r + 14, Math.min(L.W - r - 14, p.x));
      const oy = Math.max(L.stick.y + r * 0.6, Math.min(L.H - r - 18, p.y));
      st.stick = { id: e.pointerId, ox, oy };
      st.mx = st.my = 0;
      updateStick(p);
      layer.setPointerCapture?.(e.pointerId);
    } else if (!st.look) {
      st.look = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), moved: 0 };
      layer.setPointerCapture?.(e.pointerId);
    }
  }
  function updateStick(p) {
    const r = stickR();
    let dx = (p.x - st.stick.ox) / r, dy = (p.y - st.stick.oy) / r;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    st.mx = dx; st.my = dy;
    st.run = m > 0.92;
    placeStick();
  }
  function move(e) {
    if (st.stick && e.pointerId === st.stick.id) { e.preventDefault(); updateStick({ x: e.clientX, y: e.clientY }); return; }
    if (st.look && e.pointerId === st.look.id) {
      e.preventDefault();
      const dx = e.clientX - st.look.x, dy = e.clientY - st.look.y;
      st.look.x = e.clientX; st.look.y = e.clientY;
      st.look.moved += Math.abs(dx) + Math.abs(dy);
      if (st.look.mouse) { st.mouseDX += dx; st.mouseDY += dy; } else { st.lookDX += dx; st.lookDY += dy; }
    }
  }
  function up(e) {
    if (st.stick && e.pointerId === st.stick.id) { st.stick = null; st.mx = st.my = 0; st.run = false; showStick(false); }
    if (st.look && e.pointerId === st.look.id) {
      const quick = performance.now() - st.look.t0 < 260 && st.look.moved < 10;
      if (quick && e.type === 'pointerup') {
        const r = vf.getBoundingClientRect();
        if (st.look.mouse) {
          if (!document.pointerLockElement && matchMedia('(pointer: fine)').matches && st.enabled) vf.requestPointerLock?.();
        } else if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) st.presses.add('tap');
      }
      st.look = null;
    }
  }
  layer.addEventListener('pointerdown', down, { passive: false });
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  addEventListener('mousemove', (e) => { if (document.pointerLockElement) { st.mouseDX += e.movementX; st.mouseDY += e.movementY; } });

  // Block the browser's own gestures on the game surface.
  // Menus, notes and the ledger keep their taps (iOS only sends click if touchstart isn't cancelled).
  document.addEventListener('touchstart', (e) => { if (!e.target.closest?.('.screen, #ledger, .scroll, input')) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => { if (!e.target.closest?.('.scroll, input')) e.preventDefault(); }, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

  // Buttons
  function bindButton(el) {
    const name = el.dataset.btn;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); st.presses.add(name); if (e.pointerType === 'touch') st.lastTouch = performance.now(); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => el.classList.remove('down'));
  }
  document.querySelectorAll('[data-btn]').forEach(bindButton);

  // Keyboard
  const KEYMAP = { KeyF: 'lamp', KeyE: 'use', Space: 'use', Enter: 'use', Escape: 'menu', KeyP: 'menu', Tab: 'ledger', KeyL: 'ledger' };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    st.keys.add(e.code);
    const p = KEYMAP[e.code];
    if (p) { st.presses.add(p); if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); }
  });
  addEventListener('keyup', (e) => st.keys.delete(e.code));

  function releaseAll() {
    st.stick = null; st.look = null; st.mx = st.my = 0; st.run = false;
    st.lookDX = st.lookDY = st.mouseDX = st.mouseDY = 0;
    st.keys.clear();
    showStick(false);
    document.querySelectorAll('[data-btn].down').forEach((b) => b.classList.remove('down'));
  }
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);

  return {
    st,
    get touchActive() { return performance.now() - st.lastTouch < 4000; },
    readMove() {
      const k = st.keys;
      let x = st.mx, y = st.my, run = st.run;
      const kx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const ky = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      if (kx || ky) { const m = Math.hypot(kx, ky); x = kx / m; y = ky / m; run = k.has('ShiftLeft') || k.has('ShiftRight'); }
      const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      return { x, y, mag: Math.min(1, Math.hypot(x, y)), run, turn };
    },
    consumeLook() {
      const o = { dx: st.lookDX, dy: st.lookDY, mdx: st.mouseDX, mdy: st.mouseDY };
      st.lookDX = st.lookDY = st.mouseDX = st.mouseDY = 0;
      return o;
    },
    consume(name) { if (st.presses.has(name)) { st.presses.delete(name); return true; } return false; },
    clearPresses() { st.presses.clear(); },
    setEnabled(v) { st.enabled = v; if (!v) { releaseAll(); if (document.pointerLockElement) document.exitPointerLock?.(); } },
    releaseAll,
  };
}
