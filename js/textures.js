// Procedural textures, drawn on canvas at load. No image files.
// Wall textures cover 1 m wide x 2.7 m tall (u repeats along the wall).
// Floor textures cover 1 m (or 2 m for concrete). "Fronted" props use a
// two-panel atlas: left half for sides and top, right half for the front.

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function grain(ctx, x, y, w, h, amt, r, mono = true) {
  const img = ctx.getImageData(x, y, w, h); const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    else { d[i] += (r() - 0.5) * amt; d[i + 1] += (r() - 0.5) * amt; d[i + 2] += (r() - 0.5) * amt; }
  }
  ctx.putImageData(img, x, y);
}

function blotches(ctx, x, y, w, h, n, r, color, size = 30, alpha = 0.12) {
  for (let i = 0; i < n; i++) {
    const cx = x + r() * w, cy = y + r() * h, rad = size * (0.3 + r());
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, color.replace('A', alpha * (0.5 + r())));
    g.addColorStop(1, color.replace('A', 0));
    ctx.fillStyle = g; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
}

// Wall texture helper: y in canvas = 512 * (1 - h / 2.7)
const WY = (m) => Math.round(512 * (1 - m / 2.7));

function baseboard(ctx, w, color = '#2a1c12') {
  ctx.fillStyle = color; ctx.fillRect(0, WY(0.12), w, 512 - WY(0.12));
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, WY(0.12), w, 2);
}

const DRAW = {
  carpetCorr(ctx, r) {
    const S = 256; ctx.fillStyle = '#4f2226'; ctx.fillRect(0, 0, S, S);
    // interlocking diamonds, 4 per metre
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const cx = i * 64 + 32 + (j % 2) * 0, cy = j * 64 + 32;
      ctx.fillStyle = '#96702f'; ctx.beginPath(); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx + 26, cy); ctx.lineTo(cx, cy + 26); ctx.lineTo(cx - 26, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4f2226'; ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 18, cy); ctx.lineTo(cx, cy + 18); ctx.lineTo(cx - 18, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b605a'; ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b605a'; ctx.fillRect(i * 64 - 3, j * 64 - 3, 6, 6);
    }
    grain(ctx, 0, 0, S, S, 46, r, false);
    blotches(ctx, 0, 0, S, S, 6, r, 'rgba(10,4,2,A)', 40, 0.25);
  },
  carpetRoom(ctx, r) {
    const S = 256; ctx.fillStyle = '#4e4127'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(30,22,10,0.35)' : 'rgba(120,100,60,0.25)'; ctx.fillRect(r() * S, r() * S, 2, 3); }
    grain(ctx, 0, 0, S, S, 34, r);
    blotches(ctx, 0, 0, S, S, 5, r, 'rgba(20,12,4,A)', 50, 0.3);
  },
  carpet9(ctx, r) {
    DRAW.carpetRoom(ctx, r);
    blotches(ctx, 0, 0, 256, 256, 9, r, 'rgba(8,4,2,A)', 60, 0.55);
  },
  vinyl(ctx, r) {
    const S = 256, T = 128;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      ctx.fillStyle = (i + j) % 2 ? '#5b3a27' : '#b4a587';
      ctx.fillRect(i * T, j * T, T, T);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * T, 0); ctx.lineTo(i * T, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * T); ctx.lineTo(S, i * T); ctx.stroke(); }
    grain(ctx, 0, 0, S, S, 22, r);
    blotches(ctx, 0, 0, S, S, 8, r, 'rgba(40,28,10,A)', 45, 0.22);
  },
  officeFloor(ctx, r) {
    const S = 256; const cols = ['#4a2f1c', '#553722', '#40281a', '#5c3d26'];
    for (let i = 0; i < 8; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(i * 32, 0, 32, S); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(i * 32, 0, 1, S); const cut = r() * S; ctx.fillRect(i * 32, cut, 32, 1); }
    for (let i = 0; i < 300; i++) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(r() * S, r() * S, 1, 10 + r() * 30); }
    grain(ctx, 0, 0, S, S, 20, r);
  },
  concrete(ctx, r) {
    const S = 256; ctx.fillStyle = '#5d5b55'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, 0, 0, S, S, 30, r, 'rgba(30,30,28,A)', 40, 0.25);
    blotches(ctx, 0, 0, S, S, 12, r, 'rgba(120,110,90,A)', 30, 0.18);
    grain(ctx, 0, 0, S, S, 40, r);
    ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); let x = r() * S, y = r() * S; ctx.moveTo(x, y); for (let i = 0; i < 8; i++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); }
  },
  laundryTile(ctx, r) {
    const S = 256; ctx.fillStyle = '#6f6c62'; ctx.fillRect(0, 0, S, S);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = 170 + r() * 25; ctx.fillStyle = `rgb(${v},${v - 4},${v - 14})`; ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
    grain(ctx, 0, 0, S, S, 22, r);
    blotches(ctx, 0, 0, S, S, 10, r, 'rgba(60,50,30,A)', 40, 0.25);
  },
  wallLobby(ctx, r) {
    const w = 256; ctx.fillStyle = '#7a6230'; ctx.fillRect(0, 0, w, 512);
    // damask-ish repeating motif
    ctx.fillStyle = 'rgba(60,40,10,0.35)';
    for (let j = 0; j < 9; j++) for (let i = 0; i < 4; i++) {
      const cx = i * 64 + (j % 2) * 32 + 16, cy = j * 40 + 20;
      ctx.beginPath(); ctx.ellipse(cx, cy, 8, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
    grain(ctx, 0, 0, w, WY(1.0), 24, r);
    // wood wainscot
    const top = WY(1.0);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = ['#4b2e19', '#55351e', '#442a17', '#4f311b'][i % 4]; ctx.fillRect(i * 32, top, 32, 512 - top); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(i * 32, top, 2, 512 - top); }
    ctx.fillStyle = '#2b1a0e'; ctx.fillRect(0, top - 6, w, 10);
    ctx.fillStyle = 'rgba(255,220,160,0.15)'; ctx.fillRect(0, top - 6, w, 2);
    ctx.fillStyle = '#3a2412'; ctx.fillRect(0, 0, w, 10);
    grain(ctx, 0, top, w, 512 - top, 18, r);
    blotches(ctx, 0, 0, w, top, 4, r, 'rgba(40,25,5,A)', 50, 0.25);
    baseboard(ctx, w);
  },
  wallCorr(ctx, r) {
    const w = 256; ctx.fillStyle = '#7b4a3a'; ctx.fillRect(0, 0, w, 512);
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? 'rgba(60,24,18,0.3)' : 'rgba(170,120,80,0.14)'; ctx.fillRect(i * 16, 0, 8, WY(0.9)); }
    ctx.fillStyle = 'rgba(200,160,90,0.18)';
    for (let j = 0; j < 12; j++) for (let i = 0; i < 4; i++) { const cx = i * 64 + 32, cy = j * 32 + 16; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 6, cy); ctx.fill(); }
    grain(ctx, 0, 0, w, WY(0.9), 26, r);
    const top = WY(0.9);
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(0, top, w, 512 - top);
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(i * 64 + 6, top + 14, 52, 512 - top - 34); }
    ctx.fillStyle = '#24150c'; ctx.fillRect(0, top - 5, w, 9);
    ctx.fillStyle = 'rgba(255,220,160,0.12)'; ctx.fillRect(0, top - 5, w, 2);
    grain(ctx, 0, top, w, 512 - top, 16, r);
    blotches(ctx, 0, 0, w, 512, 5, r, 'rgba(20,8,4,A)', 60, 0.3);
    baseboard(ctx, w);
  },
  wallRoom(ctx, r) {
    const w = 256; ctx.fillStyle = '#8b8456'; ctx.fillRect(0, 0, w, 512);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(70,74,40,0.35)'; ctx.fillRect(i * 32 + 4, 0, 10, 512); ctx.fillStyle = 'rgba(160,110,60,0.3)'; ctx.fillRect(i * 32 + 20, 0, 3, 512); }
    for (let j = 0; j < 16; j++) for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(120,50,30,0.35)'; ctx.beginPath(); ctx.arc(i * 32 + 26, j * 32 + (i % 2) * 16, 2.5, 0, 7); ctx.fill(); }
    grain(ctx, 0, 0, w, 512, 24, r);
    blotches(ctx, 0, 0, w, 512, 6, r, 'rgba(60,40,10,A)', 70, 0.22);
    baseboard(ctx, w, '#3a2a1a');
  },
  wall9(ctx, r) {
    DRAW.wallRoom(ctx, r);
    blotches(ctx, 0, 0, 256, 512, 10, r, 'rgba(10,5,2,A)', 80, 0.45);
    ctx.strokeStyle = 'rgba(30,15,8,0.7)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) { const x0 = r() * 256, y0 = 120 + r() * 200; for (let f = 0; f < 4; f++) { ctx.beginPath(); ctx.moveTo(x0 + f * 6, y0); ctx.lineTo(x0 + f * 6 + (r() - 0.5) * 16, y0 + 60 + r() * 60); ctx.stroke(); } }
  },
  wallService(ctx, r) {
    const w = 256; ctx.fillStyle = '#7d8676'; ctx.fillRect(0, 0, w, 512);
    const bh = 512 / 2.7 * 0.2, bw = 256 / 2.5;
    ctx.strokeStyle = 'rgba(40,45,38,0.55)'; ctx.lineWidth = 2;
    for (let j = 0; j * bh < 512; j++) { const y = 512 - j * bh; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); for (let i = -1; i < 4; i++) { const x = i * bw + (j % 2) * bw / 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - bh); ctx.stroke(); } }
    const top = WY(1.0); ctx.fillStyle = 'rgba(40,70,58,0.75)'; ctx.fillRect(0, top, w, 512 - top);
    ctx.fillStyle = 'rgba(30,40,32,0.9)'; ctx.fillRect(0, top - 6, w, 6);
    grain(ctx, 0, 0, w, 512, 30, r);
    blotches(ctx, 0, 0, w, 512, 8, r, 'rgba(50,40,20,A)', 60, 0.28);
  },
  wallOffice(ctx, r) {
    const w = 256; const cols = ['#3d2516', '#46301b', '#382213', '#422b18'];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(i * 43, 0, 43, 512); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(i * 43, 0, 2, 512); }
    for (let i = 0; i < 160; i++) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(r() * w, r() * 512, 1, 20 + r() * 40); }
    grain(ctx, 0, 0, w, 512, 16, r);
    baseboard(ctx, w, '#1e120a');
  },
  ceilTile(ctx, r) {
    const S = 256; ctx.fillStyle = '#7f786c'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 1800; i++) { ctx.fillStyle = 'rgba(60,55,45,0.35)'; ctx.fillRect(r() * S, r() * S, 1.5, 1.5); }
    ctx.fillStyle = '#6a655c'; ctx.fillRect(0, 0, S, 4); ctx.fillRect(0, 0, 4, S); ctx.fillRect(0, 126, S, 4); ctx.fillRect(126, 0, 4, S);
    blotches(ctx, 0, 0, S, S, 3, r, 'rgba(110,80,30,A)', 50, 0.35);
    grain(ctx, 0, 0, S, S, 16, r);
  },
  ceilPlaster(ctx, r) {
    const S = 128; ctx.fillStyle = '#a49c8c'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(70,64,52,0.3)' : 'rgba(220,210,190,0.25)'; ctx.fillRect(r() * S, r() * S, 2, 2); }
    blotches(ctx, 0, 0, S, S, 2, r, 'rgba(110,80,30,A)', 30, 0.3);
  },
  ceilConcrete(ctx, r) { DRAW.concrete(ctx, r); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 256, 256); },
  wood(ctx, r, S = 128) {
    ctx.fillStyle = '#5e3c22'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { ctx.strokeStyle = `rgba(${r() < 0.5 ? '30,16,6' : '120,80,45'},0.25)`; ctx.lineWidth = 1 + r() * 2; ctx.beginPath(); const y = r() * S; ctx.moveTo(0, y); ctx.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 8, S * 0.6, y + (r() - 0.5) * 8, S, y + (r() - 0.5) * 6); ctx.stroke(); }
    grain(ctx, 0, 0, S, S, 14, r);
  },
  darkwood(ctx, r) { DRAW.wood(ctx, r); ctx.fillStyle = 'rgba(15,6,2,0.5)'; ctx.fillRect(0, 0, 128, 128); },
  metal(ctx, r) { ctx.fillStyle = '#5a6470'; ctx.fillRect(0, 0, 128, 128); grain(ctx, 0, 0, 128, 128, 18, r); blotches(ctx, 0, 0, 128, 128, 5, r, 'rgba(20,20,20,A)', 25, 0.3); },
  darkmetal(ctx, r) { ctx.fillStyle = '#34383d'; ctx.fillRect(0, 0, 128, 128); grain(ctx, 0, 0, 128, 128, 18, r); blotches(ctx, 0, 0, 128, 128, 5, r, 'rgba(80,50,20,A)', 25, 0.3); },
  whitemetal(ctx, r) { ctx.fillStyle = '#b9b5aa'; ctx.fillRect(0, 0, 128, 128); grain(ctx, 0, 0, 128, 128, 14, r); blotches(ctx, 0, 0, 128, 128, 4, r, 'rgba(90,70,40,A)', 25, 0.3); },
  plastic(ctx, r) { ctx.fillStyle = '#a89a7c'; ctx.fillRect(0, 0, 128, 128); grain(ctx, 0, 0, 128, 128, 12, r); },
  fabric(ctx, r) {
    ctx.fillStyle = '#6b4024'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 4) { ctx.fillStyle = 'rgba(20,10,4,0.25)'; ctx.fillRect(0, i, 128, 2); ctx.fillRect(i, 0, 1, 128); }
    grain(ctx, 0, 0, 128, 128, 30, r, false);
  },
  bedspread(ctx, r) {
    const S = 256; ctx.fillStyle = '#7b4a24'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S, s = 10 + r() * 14;
      ctx.fillStyle = ['#b8742e', '#8c2f1c', '#d0a050', '#4a5a2a'][i % 4];
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.45, s * 0.25, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.arc(x, y, s * 0.25, 0, 7); ctx.fill();
    }
    grain(ctx, 0, 0, S, S, 26, r);
  },
  linen(ctx, r) { ctx.fillStyle = '#c9c2b0'; ctx.fillRect(0, 0, 64, 64); grain(ctx, 0, 0, 64, 64, 14, r); },
  ceramic(ctx, r) { ctx.fillStyle = '#2f5b57'; ctx.fillRect(0, 0, 64, 64); for (let i = 0; i < 64; i += 8) { ctx.fillStyle = 'rgba(200,170,90,0.35)'; ctx.fillRect(0, i, 64, 2); } grain(ctx, 0, 0, 64, 64, 12, r); },
  shade(ctx, r) { ctx.fillStyle = '#b7a57a'; ctx.fillRect(0, 0, 64, 64); for (let i = 0; i < 64; i += 3) { ctx.fillStyle = 'rgba(90,70,30,0.15)'; ctx.fillRect(i, 0, 1, 64); } blotches(ctx, 0, 0, 64, 64, 2, r, 'rgba(90,60,20,A)', 18, 0.4); },
  brass(ctx, r) { ctx.fillStyle = '#8a6a2c'; ctx.fillRect(0, 0, 32, 32); grain(ctx, 0, 0, 32, 32, 30, r); },
  plant(ctx, r) { ctx.fillStyle = '#3a3818'; ctx.fillRect(0, 0, 64, 64); for (let i = 0; i < 40; i++) { ctx.fillStyle = r() < 0.5 ? '#5a4a1c' : '#283014'; ctx.fillRect(r() * 64, r() * 64, 3, 12); } },
  boiler(ctx, r) { ctx.fillStyle = '#4a2a22'; ctx.fillRect(0, 0, 128, 128); for (let i = 0; i < 128; i += 32) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, i, 128, 3); for (let x = 4; x < 128; x += 12) { ctx.fillStyle = 'rgba(200,160,120,0.3)'; ctx.fillRect(x, i + 6, 2, 2); } } grain(ctx, 0, 0, 128, 128, 22, r); blotches(ctx, 0, 0, 128, 128, 6, r, 'rgba(120,60,20,A)', 25, 0.4); },
  door(ctx, r) {
    const w = 128, h = 256; DRAW.wood(ctx, r, 128); const img = ctx.getImageData(0, 0, 128, 128); ctx.putImageData(img, 0, 128);
    ctx.fillStyle = 'rgba(25,12,5,0.25)'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, 100, 96); ctx.strokeRect(14, 126, 100, 116);
    ctx.strokeStyle = 'rgba(255,210,150,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(17, 17, 94, 90); ctx.strokeRect(17, 129, 94, 110);
  },
  // two-panel atlases: side on the left, front on the right
  vending(ctx, r) {
    ctx.fillStyle = '#6e1a16'; ctx.fillRect(0, 0, 128, 256); grain(ctx, 0, 0, 128, 256, 20, r);
    ctx.fillStyle = '#1a1a1c'; ctx.fillRect(128, 0, 128, 256);
    ctx.fillStyle = '#c9d8e0'; ctx.fillRect(136, 10, 86, 190);
    const cans = ['#c22', '#24a', '#e80', '#2a4', '#ddd', '#a2a'];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) { ctx.fillStyle = cans[(i + j * 2) % cans.length]; ctx.fillRect(140 + i * 16, 16 + j * 30, 12, 22); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(141 + i * 16, 17 + j * 30, 3, 20); }
    ctx.fillStyle = '#d33'; ctx.fillRect(136, 204, 86, 18); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('COLD DRINKS', 140, 218);
    ctx.fillStyle = '#333'; ctx.fillRect(228, 40, 22, 60); ctx.fillStyle = '#000'; ctx.fillRect(140, 228, 80, 20);
  },
  washer(ctx, r) {
    ctx.fillStyle = '#c4c0b4'; ctx.fillRect(0, 0, 256, 128); grain(ctx, 0, 0, 256, 128, 14, r);
    blotches(ctx, 0, 0, 256, 128, 4, r, 'rgba(90,70,40,A)', 25, 0.3);
    ctx.fillStyle = '#8f8b80'; ctx.fillRect(128, 0, 128, 22); ctx.fillStyle = '#333'; ctx.fillRect(140, 6, 30, 8);
    ctx.fillStyle = '#5a5a58'; ctx.beginPath(); ctx.arc(192, 72, 38, 0, 7); ctx.fill();
    ctx.fillStyle = '#1b1d1f'; ctx.beginPath(); ctx.arc(192, 72, 30, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(182, 62, 10, 0, 7); ctx.fill();
  },
  dryer(ctx, r) { DRAW.washer(ctx, r); ctx.fillStyle = '#c4c0b4'; ctx.fillRect(150, 34, 84, 76); ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.strokeRect(152, 36, 80, 72); ctx.fillStyle = '#333'; ctx.fillRect(220, 66, 8, 14); },
  wardrobe(ctx, r) {
    DRAW.wood(ctx, r, 128); const img = ctx.getImageData(0, 0, 128, 128);
    ctx.putImageData(img, 0, 128); ctx.putImageData(img, 128, 0); ctx.putImageData(img, 128, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(190, 0, 3, 256);
    for (let y = 30; y < 230; y += 9) { ctx.fillRect(140, y, 44, 3); ctx.fillRect(198, y, 44, 3); }
    ctx.fillStyle = '#b08d40'; ctx.fillRect(182, 120, 4, 16); ctx.fillRect(196, 120, 4, 16);
  },
  locker(ctx, r) {
    DRAW.darkmetal(ctx, r); const img = ctx.getImageData(0, 0, 128, 128);
    ctx.putImageData(img, 0, 128); ctx.putImageData(img, 128, 0); ctx.putImageData(img, 128, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; for (let y = 20; y < 70; y += 7) ctx.fillRect(150, y, 80, 3);
    ctx.fillStyle = '#888'; ctx.fillRect(225, 120, 6, 24);
  },
  cabinet(ctx, r) { DRAW.locker(ctx, r); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(190, 0, 3, 256); },
  crt(ctx, r) {
    ctx.fillStyle = '#a99c7e'; ctx.fillRect(0, 0, 256, 128); grain(ctx, 0, 0, 256, 128, 12, r);
    ctx.fillStyle = '#1d1e1c'; ctx.fillRect(140, 12, 104, 84);
    ctx.fillStyle = '#2b302e'; ctx.fillRect(146, 18, 92, 72);
    ctx.fillStyle = '#555'; ctx.fillRect(150, 104, 10, 10); ctx.fillRect(166, 104, 10, 10);
  },
  panel(ctx, r) {
    DRAW.darkmetal(ctx, r); ctx.putImageData(ctx.getImageData(0, 0, 128, 128), 128, 0);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(138, 10, 108, 108);
    ctx.fillStyle = '#c9a227'; ctx.fillRect(150, 18, 84, 14); ctx.fillStyle = '#111'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('MAIN  480V', 162, 29);
    ctx.fillStyle = '#d5d0c0'; ctx.fillRect(150, 90, 50, 18); ctx.fillStyle = '#222'; ctx.font = '8px sans-serif'; ctx.fillText('DANGER', 158, 102);
  },
  desk(ctx, r) {
    DRAW.wood(ctx, r, 128); ctx.putImageData(ctx.getImageData(0, 0, 128, 128), 128, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(190, 10, 60, 30); ctx.strokeRect(190, 48, 60, 30); ctx.strokeRect(190, 86, 60, 34);
    ctx.fillStyle = '#b08d40'; ctx.fillRect(214, 22, 12, 4); ctx.fillRect(214, 60, 12, 4); ctx.fillRect(214, 100, 12, 4);
  },
};

// Props with a front face use the atlas. front: which face is the front.
export const FRONTED = { vending: true, washer: true, dryer: true, wardrobe: true, locker: true, cabinet: true, crt: true, panel: true, desk: true };

const SIZES = { carpetCorr: [256, 256], carpetRoom: [256, 256], carpet9: [256, 256], vinyl: [256, 256], officeFloor: [256, 256], concrete: [256, 256], laundryTile: [256, 256],
  wallLobby: [256, 512], wallCorr: [256, 512], wallRoom: [256, 512], wall9: [256, 512], wallService: [256, 512], wallOffice: [256, 512],
  ceilTile: [256, 256], ceilPlaster: [128, 128], ceilConcrete: [256, 256], wood: [128, 128], darkwood: [128, 128], metal: [128, 128], darkmetal: [128, 128],
  whitemetal: [128, 128], plastic: [128, 128], fabric: [128, 128], bedspread: [256, 256], linen: [64, 64], ceramic: [64, 64], shade: [64, 64], brass: [32, 32],
  plant: [64, 64], boiler: [128, 128], door: [128, 256], vending: [256, 256], washer: [256, 128], dryer: [256, 128], wardrobe: [256, 256], locker: [256, 256],
  cabinet: [256, 256], crt: [256, 128], panel: [256, 128], desk: [256, 128] };

export function makeTextures(THREE, maxAniso = 4) {
  const out = {};
  let seed = 1234;
  for (const [name, [w, h]] of Object.entries(SIZES)) {
    const c = canvas(w, h); const ctx = c.getContext('2d', { willReadFrequently: true });
    DRAW[name](ctx, rng(seed++ * 7919));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    out[name] = t;
  }
  return out;
}

// Small text plates (room numbers, signs) as their own textures.
export function plateTexture(THREE, text, { w = 128, h = 48, bg = '#1c140c', fg = '#c9a24a', font = 'bold 30px Georgia, serif', border = '#6a5428' } = {}) {
  const c = canvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// The motel sign seen through the lobby glass.
export function neonSignTexture(THREE) {
  const c = canvas(512, 256); const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 256);
  const tube = (text, x, y, size, color) => {
    ctx.font = `bold ${size}px "Brush Script MT", "Snell Roundhand", cursive`; ctx.textAlign = 'center';
    for (const [blur, alpha] of [[24, 0.5], [10, 0.8], [2, 1]]) { ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.fillStyle = alpha === 1 ? '#fff4f4' : color; ctx.globalAlpha = alpha; ctx.fillText(text, x, y); }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };
  tube('Sundown', 256, 110, 92, '#ff2a55');
  ctx.font = 'bold 34px Futura, "Avenir Next", sans-serif'; ctx.textAlign = 'center';
  ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffd2a0'; ctx.fillText('MOTOR INN', 256, 160);
  ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffb0b0'; ctx.font = 'bold 30px Futura, "Avenir Next", sans-serif'; ctx.fillText('NO VACANCY', 256, 222);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function exitSignTexture(THREE) {
  const c = canvas(128, 48); const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a0303'; ctx.fillRect(0, 0, 128, 48);
  ctx.font = 'bold 34px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff2010'; ctx.shadowBlur = 8; ctx.fillStyle = '#ff6a50'; ctx.fillText('EXIT', 64, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Animated TV static: a tiny canvas redrawn a few times a second.
export function staticTexture(THREE) {
  const c = canvas(64, 48); const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  let s = 99;
  t.userData.redraw = () => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 16) & 255; d[i] = v * 0.8; d[i + 1] = v * 0.86; d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0); t.needsUpdate = true;
  };
  t.userData.redraw();
  return t;
}
