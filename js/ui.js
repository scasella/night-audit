// DOM side: places the viewfinder, deck, ledger and buttons for each layout,
// and runs the OSD, captions, ledger, notes and menus.
import * as Lv from './level.js';
import { NOTES, NOTE_ORDER, HOWTO } from './story.js';

const $ = (id) => document.getElementById(id);
const place = (el, r) => { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; };

export function createUI({ onAction, onSetting }) {
  const el = {
    vf: $('vf'), deck: $('deck'), ledger: $('ledger'), objline: $('objline'), buttons: $('buttons'),
    lamp: $('b-lamp'), use: $('b-use'), useLabel: $('b-use-label'), ledgerBtn: $('b-ledger'), menu: $('b-menu'),
    rec: $('rec'), modeTag: $('modeTag'), batt: $('batt'), clock: $('clock'), counter: $('counter'),
    reticle: $('reticle'), prompt: $('prompt'), caption: $('caption'), toast: $('toast'), big: $('big'), slats: $('slats'), hint: $('hint'),
    osd: $('osd'), obj: $('lg-obj'), fuses: $('lg-fuses'), notes: $('lg-notes'), map: $('map'), lgNote: $('lg-note'), lgHint: $('lg-hint'),
    noteHost: $('note-host'), ledgerHost: $('ledger-host'), flash: $('flashcover'),
  };
  let L = null;
  const ui = { layoutMode: null, ledgerOpen: false, noteOpen: null };

  // ------------------------------------------------------------ layout
  ui.applyLayout = function (layout, playing) {
    L = layout; ui.layoutMode = L.mode;
    place(el.vf, L.vf);
    document.documentElement.style.setProperty('--vfh', L.vf.h + 'px');
    const deckOn = L.mode !== 'theater';
    el.deck.style.display = deckOn ? 'block' : 'none';
    if (L.mode === 'handheld' || L.mode === 'deck') place(el.deck, L.deck);
    if (L.mode === 'book') place(el.deck, { x: L.right.x - 12, y: 0, w: L.W - L.right.x + 12, h: L.H });
    const grille = el.deck.querySelector('.grille');
    grille.style.left = '14px'; grille.style.top = (L.mode === 'book' ? L.H - 44 : (L.deck?.h ?? 80) - 44) + 'px';
    el.deck.querySelector('.brand').style.display = L.mode === 'book' || (L.deck?.w ?? 0) < 420 ? 'none' : '';
    // ledger: on the right page in book posture, otherwise only as an overlay
    if (L.mode === 'book') {
      if (el.ledger.parentElement !== document.body) document.body.appendChild(el.ledger);
      el.ledger.style.display = 'block'; place(el.ledger, L.ledger);
    } else if (!ui.ledgerOpen) el.ledger.style.display = 'none';
    // objective strip
    if (L.mode === 'handheld' || L.mode === 'deck') {
      el.objline.style.display = 'block';
      place(el.objline, { x: L.deck.x + 10, y: L.deck.y + 30, w: L.deck.w - 20, h: 0 });
      el.objline.style.height = 'auto';
    } else if (L.mode === 'theater' && L.barL.w >= 88) {
      el.objline.style.display = 'block'; el.objline.classList.add('bar');
      place(el.objline, { x: L.barL.x + 8 + L.safe.l, y: L.safe.t + 96, w: L.barL.w - 16 - L.safe.l, h: 0 });
      el.objline.style.height = 'auto';
    } else el.objline.style.display = 'none';
    if (L.mode !== 'theater') el.objline.classList.remove('bar');
    el.buttons.style.display = playing ? 'block' : 'none';
    placeButtons();
    renderObjline();
    placeGhost();
    ui.drawMap();
  };

  function placeButtons() {
    const big = Math.round(Math.max(64, Math.min(86, Math.min(L.W, L.H) * 0.15)));
    const mid = Math.round(big * 0.8);
    const sz = (b, s) => { b.style.width = b.style.height = s + 'px'; b.style.fontSize = Math.round(s * 0.26) + 'px'; };
    const small = (b, x, y, w = null) => { b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.height = '32px'; b.style.width = w ? w + 'px' : ''; b.style.fontSize = '16px'; };
    sz(el.use, big); sz(el.lamp, mid);
    let ux, uy, lx, ly;
    el.ledgerBtn.style.display = L.mode === 'book' ? 'none' : '';
    if (L.mode === 'theater') {
      const bar = L.barR, fits = bar.w >= big * 0.85;
      ux = fits ? bar.x + (bar.w - big) / 2 : L.vf.x + L.vf.w - big - 10;
      uy = L.H * 0.66 - big / 2;
      lx = fits ? bar.x + (bar.w - mid) / 2 : ux + (big - mid) / 2; ly = uy - mid - 22;
      small(el.menu, Math.max(L.safe.l + 8, 8), L.safe.t + 10, 46);
      small(el.ledgerBtn, Math.max(L.safe.l + 8, 8), L.safe.t + 50);
    } else {
      const area = L.mode === 'book' ? L.pad : L.deck;
      ux = area.x + area.w - big - 18 - (L.mode === 'book' ? 0 : L.safe.r);
      uy = area.y + area.h - big - Math.max(18, L.safe.b + 8);
      lx = ux - mid - 18; ly = uy - mid * 0.55;
      if (L.mode === 'book') {
        small(el.menu, L.right.x + L.right.w - 52, L.right.y + 8, 44);
      } else {
        small(el.menu, area.x + area.w - 54 - L.safe.r, area.y + 4, 44);
        small(el.ledgerBtn, area.x + area.w - 54 - 96 - L.safe.r, area.y + 4, 88);
      }
    }
    el.use.style.left = ux + 'px'; el.use.style.top = uy + 'px';
    el.lamp.style.left = lx + 'px'; el.lamp.style.top = ly + 'px';
    if (L.mode === 'handheld' || L.mode === 'deck') {
      const area = L.deck;
      el.objline.style.width = (area.w - 20 - 150) + 'px';
      el.objline.style.top = (area.y + 4) + 'px';
    }
  }
  ui.showButtons = (on) => { el.buttons.style.display = on ? 'block' : 'none'; renderObjline(); placeGhost(); };
  // a dashed ring where the stick lives, until the player has used it once
  let ghostDone = false;
  const ghost = $('stick-ghost');
  function placeGhost() {
    const on = !ghostDone && L && el.buttons.style.display !== 'none' && matchMedia('(pointer: coarse)').matches;
    ghost.style.display = on ? 'grid' : 'none';
    if (!on) return;
    const r = Math.max(42, Math.min(64, Math.min(L.W, L.H) * 0.11));
    const cx = L.stick.x + Math.min(L.stick.w * 0.45, 140), cy = L.stick.y + L.stick.h * 0.55;
    Object.assign(ghost.style, { left: cx - r + 'px', top: cy - r + 'px', width: r * 2 + 'px', height: r * 2 + 'px' });
  }
  ui.stickUsed = () => { if (!ghostDone) { ghostDone = true; placeGhost(); } };

  // ------------------------------------------------------------ OSD
  let lastOSD = {};
  const setText = (k, node, v) => { if (lastOSD[k] !== v) { lastOSD[k] = v; node.textContent = v; } };
  ui.osd = function ({ rec, mode, battery, clock, counter, low }) {
    el.rec.classList.toggle('off', !rec);
    setText('mode', el.modeTag, mode);
    setText('clock', el.clock, clock);
    setText('counter', el.counter, counter);
    const bars = battery > 75 ? 4 : battery > 50 ? 3 : battery > 25 ? 2 : battery > 3 ? 1 : 0;
    if (lastOSD.bars !== bars || lastOSD.low !== low) {
      lastOSD.bars = bars; lastOSD.low = low;
      [...el.batt.children].forEach((b, i) => b.classList.toggle('e', i >= bars));
      el.batt.classList.toggle('low', low);
    }
  };
  ui.lampButton = (on) => { el.lamp.classList.toggle('on', on); };
  ui.prompt = function (text) {
    if (lastOSD.prompt === text) return;
    lastOSD.prompt = text;
    el.reticle.classList.toggle('on', !!text);
    el.prompt.classList.toggle('on', !!text);
    if (text) el.prompt.textContent = '▸ ' + text;
    const verb = text ? text.split(' ')[0] : 'USE';
    el.useLabel.textContent = verb.length > 6 ? 'USE' : verb;
    el.use.classList.toggle('idle', !text);
    el.use.classList.toggle('live', !!text);
  };
  ui.slats = (on, vertical = false) => { el.slats.classList.toggle('on', on); el.slats.classList.toggle('v', vertical); };
  ui.jitter = (on) => el.osd.classList.toggle('jitter', on);
  let bigTimer = 0;
  ui.big = function (text, ms = 1200) {
    clearTimeout(bigTimer);
    el.big.textContent = text; el.big.classList.add('on');
    if (ms) bigTimer = setTimeout(() => el.big.classList.remove('on'), ms);
  };
  ui.bigOff = () => el.big.classList.remove('on');
  let hintTimer = 0;
  ui.hint = function (text, ms = 3500) { clearTimeout(hintTimer); el.hint.textContent = text; el.hint.classList.add('on'); hintTimer = setTimeout(() => el.hint.classList.remove('on'), ms); };
  ui.fadeCover = (on) => el.flash.classList.toggle('on', on);

  // ------------------------------------------------------------ captions
  const queue = []; let capT = 0, capOn = false;
  ui.say = function (lines, opts = {}) {
    if (opts.now) { queue.length = 0; capT = 0; }
    for (const l of [].concat(lines)) queue.push(l);
  };
  ui.clearCaptions = () => { queue.length = 0; capT = 0; el.caption.classList.remove('on'); capOn = false; };
  let toastT = 0;
  ui.toast = function (text, secs = 4.5) { el.toast.textContent = text; el.toast.classList.add('on'); toastT = secs; };

  ui.tick = function (dt) {
    capT -= dt;
    if (capT <= 0) {
      if (queue.length) { const l = queue.shift(); el.caption.textContent = l; el.caption.classList.add('on'); capOn = true; capT = Math.max(2.2, 1.0 + l.length * 0.065); }
      else if (capOn) { el.caption.classList.remove('on'); capOn = false; }
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('on'); }
  };
  ui.captionBusy = () => queue.length > 0 || capT > 0.4;

  // ------------------------------------------------------------ ledger
  let ledgerState = { obj: '', fuses: 0, notes: new Set(), hint: '', explored: new Set(), player: null, marks: [] };
  ui.setLedger = function (s) {
    Object.assign(ledgerState, s);
    el.obj.innerHTML = '';
    for (const o of ledgerState.objList || []) {
      const d = document.createElement('div'); d.textContent = (o.done ? '☑ ' : '☐ ') + o.text; if (o.done) d.className = 'done'; el.obj.appendChild(d);
    }
    [...el.fuses.querySelectorAll('i')].forEach((f, i) => f.classList.toggle('got', i < ledgerState.fuses));
    el.lgHint.textContent = ledgerState.hint || '';
    el.notes.innerHTML = '';
    for (const id of NOTE_ORDER) {
      const b = document.createElement('button');
      const got = ledgerState.notes.has(id);
      b.textContent = got ? '✎ ' + NOTES[id].title : '✎ ……';
      b.disabled = !got;
      if (got) b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); onAction('readnote', id); });
      el.notes.appendChild(b);
    }
    renderObjline();
  };
  function renderObjline() {
    const cur = (ledgerState.objList || []).find((o) => !o.done);
    el.objline.style.visibility = cur && el.buttons.style.display !== 'none' ? 'visible' : 'hidden';
    if (!cur) { el.objline.innerHTML = ''; return; }
    if (L?.mode === 'theater') {
      el.objline.innerHTML = `<b>▸</b> ${ledgerState.short || ''}${ledgerState.fuseLine ? `<br><span class="fz">FUSES ${ledgerState.fuseLine}</span>` : ''}`;
    } else {
      el.objline.innerHTML = `<b>▸</b> ${cur.text}`;
    }
  }
  ui.drawMap = function (explored = ledgerState.explored, player = ledgerState.player) {
    ledgerState.explored = explored; ledgerState.player = player;
    const c = el.map; if (!c.isConnected || c.offsetWidth === 0) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = c.offsetWidth, h = c.offsetHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const s = Math.min(w / 52, h / 32), ox = (w - 52 * s) / 2, oy = (h - 32 * s) / 2;
    ctx.fillStyle = 'rgba(70,55,30,0.13)';
    for (const k of explored) { const [x, z] = k.split(',').map(Number); ctx.fillRect(ox + x * s, oy + z * s, s + 0.3, s + 0.3); }
    ctx.strokeStyle = 'rgba(40,32,20,0.85)'; ctx.lineWidth = Math.max(1, s * 0.22); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const k of explored) {
      const [x, z] = k.split(',').map(Number);
      const open = (a, b) => Lv.isOpenTile(a, b);
      if (!open(x, z - 1)) { ctx.moveTo(ox + x * s, oy + z * s); ctx.lineTo(ox + (x + 1) * s, oy + z * s); }
      if (!open(x, z + 1)) { ctx.moveTo(ox + x * s, oy + (z + 1) * s); ctx.lineTo(ox + (x + 1) * s, oy + (z + 1) * s); }
      if (!open(x - 1, z)) { ctx.moveTo(ox + x * s, oy + z * s); ctx.lineTo(ox + x * s, oy + (z + 1) * s); }
      if (!open(x + 1, z)) { ctx.moveTo(ox + (x + 1) * s, oy + z * s); ctx.lineTo(ox + (x + 1) * s, oy + (z + 1) * s); }
    }
    ctx.stroke();
    // red-pencil circles where the fuses are said to be
    ctx.strokeStyle = 'rgba(170,30,30,0.75)'; ctx.lineWidth = Math.max(1.2, s * 0.25);
    for (const m of ledgerState.marks || []) { ctx.beginPath(); ctx.ellipse(ox + m[0] * s, oy + m[1] * s, s * 1.6, s * 1.25, 0.2, 0, Math.PI * 2); ctx.stroke(); }
    if (player) {
      ctx.fillStyle = '#b3261e';
      ctx.beginPath(); ctx.arc(ox + player.x * s, oy + player.z * s, Math.max(2.5, s * 0.55), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b3261e'; ctx.lineWidth = Math.max(1, s * 0.25);
      ctx.beginPath(); ctx.moveTo(ox + player.x * s, oy + player.z * s); ctx.lineTo(ox + (player.x - Math.sin(player.yaw) * 1.8) * s, oy + (player.z - Math.cos(player.yaw) * 1.8) * s); ctx.stroke();
    }
  };

  // ------------------------------------------------------------ notes
  function paperHTML(id) {
    const n = NOTES[id];
    return `<div class="paper ${n.style}">${n.style === 'photo' ? '<div class="snap"></div>' : ''}<h3>${n.title.toUpperCase()}</h3><pre></pre><button class="note-close" data-act="closenote">PUT IT DOWN</button></div>`;
  }
  ui.openNote = function (id, inLedger) {
    ui.noteOpen = id;
    const host = inLedger ? el.lgNote : el.noteHost;
    host.innerHTML = paperHTML(id);
    host.querySelector('pre').textContent = NOTES[id].body;
    if (inLedger) { el.ledger.classList.add('reading'); }
    else show('s-note');
  };
  ui.closeNote = function () {
    ui.noteOpen = null;
    el.ledger.classList.remove('reading');
    hide('s-note');
  };

  // ------------------------------------------------------------ screens
  const screens = ['s-loading', 's-title', 's-howto', 's-settings', 's-calib', 's-pause', 's-ledgerview', 's-note', 's-end'];
  function show(id) { $(id).classList.add('on'); }
  function hide(id) { $(id).classList.remove('on'); }
  ui.show = show; ui.hide = hide;
  ui.only = (id) => { for (const s of screens) if (s !== id) hide(s); if (id) show(id); };
  ui.isOn = (id) => $(id).classList.contains('on');
  ui.loading = (msg) => { $('loadmsg').textContent = msg; };
  ui.setContinue = (on) => { document.querySelector('[data-act="continue"]').hidden = !on; };

  ui.openLedgerOverlay = function () {
    ui.ledgerOpen = true;
    el.ledgerHost.appendChild(el.ledger);
    el.ledger.style.cssText = 'display:block;position:absolute;left:0;top:0;width:100%;height:100%';
    show('s-ledgerview');
    requestAnimationFrame(() => ui.drawMap());
  };
  ui.closeLedgerOverlay = function () {
    ui.ledgerOpen = false;
    hide('s-ledgerview');
    document.body.appendChild(el.ledger);
    el.ledger.style.cssText = '';
    if (L) ui.applyLayout(L, true);
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) { e.preventDefault(); onAction(b.dataset.act); }
  });
  $('s-ledgerview').addEventListener('click', (e) => { if (e.target.id === 's-ledgerview') onAction('closeledger'); });
  $('s-note').addEventListener('click', (e) => { if (e.target.id === 's-note' || e.target.id === 'note-host') onAction('closenote'); });

  const how = $('howlist');
  for (const [k, v] of HOWTO) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; how.append(dt, dd); }

  ui.bindSettings = function (s) {
    const sens = $('set-sens'), vol = $('set-vol'), inv = $('set-inv'), vhs = $('set-vhs'), fl = $('set-flash'), br = $('set-bright-r'), fold = $('set-fold');
    sens.value = s.sens; vol.value = s.volume; br.value = s.bright;
    const sync = () => { fold.textContent = (s.fold || 'auto').toUpperCase(); fold.classList.toggle('on', s.fold && s.fold !== 'auto'); inv.textContent = s.invertY ? 'ON' : 'OFF'; inv.classList.toggle('on', s.invertY); vhs.textContent = s.vhs >= 1 ? 'FULL' : 'LIGHT'; vhs.classList.toggle('on', s.vhs >= 1); fl.textContent = s.reduceFlash ? 'ON' : 'OFF'; fl.classList.toggle('on', s.reduceFlash); };
    sync();
    sens.oninput = () => onSetting('sens', +sens.value);
    vol.oninput = () => onSetting('volume', +vol.value);
    br.oninput = () => onSetting('bright', +br.value);
    inv.onclick = () => { onSetting('invertY', !s.invertY); sync(); };
    vhs.onclick = () => { onSetting('vhs', s.vhs >= 1 ? 0.45 : 1); sync(); };
    fl.onclick = () => { onSetting('reduceFlash', !s.reduceFlash); sync(); };
    fold.onclick = () => { const order = ['auto', 'book', 'tabletop']; onSetting('fold', order[(order.indexOf(s.fold || 'auto') + 1) % 3]); sync(); };
    $('set-bright').onclick = () => onAction('calib');
  };

  ui.endScreen = function (title, body, stats) {
    $('end-title').textContent = title; $('end-body').textContent = body;
    $('end-stats').innerHTML = stats.map(([k, v]) => `<span style="color:#8a8577">${k}</span><span>${v}</span>`).join('');
    ui.only('s-end');
  };
  ui.el = el;
  return ui;
}
