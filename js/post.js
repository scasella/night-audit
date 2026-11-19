// The camcorder, in two stages, the way 1980s consumer video worked:
//  1. Camera: the scene (linear HDR) through the lens and the pickup — bloom,
//     horizontal smear and vertical CCD smear from bright lights, auto gain,
//     tube lag (bright things leave comet trails), then gamma. 480x360.
//  2. Tape: that signal, with the date stamp burned in, recorded and played
//     back off VHS — interlaced fields, ~3 MHz luma with ringing, ~0.5 MHz
//     chroma that smears and lags, snow, chroma noise, timebase wobble,
//     flagging, head-switching noise, dropouts, tracking errors. Screen res.
import * as THREE from 'three';

const camFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tPrev;
uniform float uGain, uNight, uFlash, uBright, uLag;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 srgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / vec2(textureSize(tScene, 0));
  vec3 c = texture2D(tScene, uv).rgb * 0.5 + (texture2D(tScene, uv + vec2(0.0, px.y * 0.8)).rgb + texture2D(tScene, uv - vec2(0.0, px.y * 0.8)).rgb) * 0.25;
  // lens glow from the mip chain
  vec3 b = textureLod(tScene, uv, 2.0).rgb * 0.45 + textureLod(tScene, uv, 3.5).rgb * 0.35 + textureLod(tScene, uv, 5.0).rgb * 0.2;
  c += max(b - 0.3, 0.0) * (0.6 + 0.5 * uNight);
  // bright lights smear sideways (tube / tape) and bleed down the column (CCD)
  vec3 hs = vec3(0.0), vs = vec3(0.0);
  for (int i = 1; i <= 4; i++) {
    float o = float(i), w = 0.55 - o * 0.11;
    hs += (max(textureLod(tScene, uv + vec2(o * 0.016, 0.0), 3.0).rgb - 0.7, 0.0) + max(textureLod(tScene, uv - vec2(o * 0.016, 0.0), 3.0).rgb - 0.7, 0.0)) * w;
    vs += max(textureLod(tScene, uv + vec2(0.0, o * 0.07), 4.5).rgb - 1.4, 0.0) + max(textureLod(tScene, uv - vec2(0.0, o * 0.07), 4.5).rgb - 1.4, 0.0);
  }
  c += hs * 0.22 + vs * 0.05;
  // auto gain: in the dark the picture is pushed hard, goes flat and muddy
  c = c * uGain * uBright + uFlash;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(lum) * vec3(1.02, 0.98, 0.88), uNight * 0.78);
  c = mix(c, pow(max(c, 0.0), vec3(0.78)) * 0.82, uNight * 0.65);
  c = aces(c * 1.12);
  c *= mix(vec3(1.06, 0.96, 0.82), vec3(0.98, 0.97, 0.92), uNight);
  c = srgb(c);
  // tube lag: highlights hang on, everything persists a touch
  vec3 prev = texture2D(tPrev, uv).rgb;
  float pl = dot(prev, vec3(0.333));
  c = max(c, prev * smoothstep(0.5, 0.95, pl) * 0.86 * uLag);
  c = mix(c, prev, 0.2 * uLag);
  gl_FragColor = vec4(c, 1.0);
}`;

const tapeFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCam, tOld, tStamp;
uniform vec2 uRes;
uniform float uTime, uInterf, uGlitch, uRewind, uVhs, uFade, uNight, uGrain;
float h11(float n) { return fract(sin(n) * 43758.5453123); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(float x) { float i = floor(x), f = fract(x); return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vn2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec3 toYIQ(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 toRGB(vec3 c) { return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }

float FIELD_OLD;
// the recorded signal: camera picture with the date stamp burned in
vec3 sig(vec2 p) {
  vec3 c = FIELD_OLD > 0.5 ? texture2D(tOld, p).rgb : texture2D(tCam, p).rgb;
  vec4 s = texture2D(tStamp, p);
  return mix(c, s.rgb, s.a);
}

void main() {
  vec2 uv = vUv;
  float t = uTime, fr = floor(t * 59.94), field = mod(fr, 2.0);
  float V = uVhs;
  // rewind: the picture rolls
  uv.y = fract(uv.y + uRewind * (t * 2.3 + vn(t * 3.0)));
  // occasional vertical bounce
  uv.y += (step(0.985, vn(t * 0.7)) * (vn(t * 30.0) - 0.5) * 0.012 + (vn(t * 9.0) - 0.5) * 0.0015) * V;
  float line = floor(uv.y * uRes.y);
  // interlace: alternate lines come from the previous field (combs on fast pans)
  FIELD_OLD = step(0.5, mod(line + field, 2.0)) * step(0.01, V);

  // timebase error: per-line jitter, slow wobble, flagging at the top, head switching at the bottom
  float jit = (h11(line * 1.31 + fr * 7.7) - 0.5) * 0.0022;
  float wob = sin(uv.y * 38.0 + t * 2.7) * 0.0009 + sin(uv.y * 7.0 - t * 1.3) * 0.0012;
  float flag = pow(max(0.0, (uv.y - 0.94) / 0.06), 2.0) * (0.006 + 0.012 * vn(t * 1.7));
  float hs = smoothstep(0.035, 0.0, uv.y) * (0.02 + 0.045 * uInterf) * (vn(line * 0.9 + t * 50.0) - 0.3);
  float bandY = fract(t * 0.09 + vn(t * 0.4) * 0.35);
  float band = smoothstep(0.1, 0.0, abs(uv.y - bandY)) * (0.24 + 1.6 * uInterf);
  float trk = (vn(line * 0.45 + t * 37.0) - 0.5) * 0.04 * band;
  float gl = uGlitch * (h11(floor(uv.y * 18.0) + fr) - 0.5) * 0.16 * step(0.5, h11(floor(uv.y * 9.0) + fr * 3.0));
  float rw = uRewind * (vn(line * 0.2 + t * 80.0) - 0.5) * 0.1;
  uv.x += (jit + wob + flag + hs + trk) * V + gl + rw;

  // luma: ~3 MHz low-pass, then the VCR's sharpening (ringing halos)
  float px = 1.0 / uRes.x;
  float y0 = toYIQ(sig(uv)).x;
  float yl = toYIQ(sig(uv - vec2(px * 1.6, 0.0))).x, yr = toYIQ(sig(uv + vec2(px * 1.6, 0.0))).x;
  float yl2 = toYIQ(sig(uv - vec2(px * 3.8, 0.0))).x, yr2 = toYIQ(sig(uv + vec2(px * 3.8, 0.0))).x;
  float Y = mix(y0, (y0 * 1.6 + yl + yr) * (1.0 / 3.6), 0.95 * V);
  Y += (Y - (yl2 + yr2 + Y * 2.0) * 0.25) * 0.9 * V;
  // chroma: ~0.5 MHz, smeared wide and arriving late (shifted right)
  vec2 iq = vec2(0.0);
  for (int i = 0; i < 8; i++) iq += toYIQ(sig(uv + vec2((float(i) - 6.0) * px * 2.7, 0.0))).yz;
  iq /= 8.0;
  vec2 iq0 = toYIQ(sig(uv)).yz;
  iq = mix(iq0, iq, V) * (1.0 - 0.15 * V);
  // chroma noise: horizontal colour blotches, worse in the dark and at high gain
  float cn = (0.06 + 0.12 * uNight + 0.07 * uInterf) * uGrain * V * (1.15 - Y);
  iq += (vec2(vn2(vec2(uv.x * 38.0, uv.y * 190.0 + fr * 3.1)), vn2(vec2(uv.x * 33.0 + 9.0, uv.y * 190.0 - fr * 2.3))) - 0.5) * cn;
  vec3 col = toRGB(vec3(Y, iq));

  // snow: fine grain plus horizontally stretched tape noise
  float fine = h21(gl_FragCoord.xy * 0.71 + vec2(fr * 3.17, fr * 1.73)) - 0.5;
  float streak = h21(vec2(floor(uv.x * uRes.x * 0.33), line) + fr * 0.913) - 0.5;
  float sn = (0.075 + 0.2 * uNight + 0.1 * uInterf) * uGrain * (1.3 - 0.8 * dot(col, vec3(0.33)));
  col += (fine * 0.8 + streak * 0.7) * sn * (0.35 + 0.65 * V);

  // tracking noise band, dropouts, rewind hash
  col = mix(col, vec3(h21(vec2(line, fr)) * 0.85), band * uInterf * 0.5 * V);
  float dl = h11(line * 3.1 + fr * 0.37);
  float drop = step(0.9982 - 0.014 * uInterf - 0.03 * uRewind, dl);
  float dx = h11(line + fr);
  col = mix(col, vec3(0.95), drop * step(dx, uv.x) * step(uv.x, dx + 0.08 + 0.2 * h11(line * 7.0)) * V);
  col = mix(col, vec3(h21(uv * 300.0 + fr)), uRewind * step(0.6, vn(uv.y * 40.0 + t * 30.0)) * 0.6);

  // field flicker, auto-gain pumping, lens vignette, overscan edges, black level
  col *= (1.0 - 0.025 * field * V) * (1.0 + (vn(t * 11.0) - 0.5) * 0.05 * V);
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.7 * pow(length(q * vec2(1.0, 1.12)) * 1.3, 2.7);
  float edgeL = smoothstep(0.0, 0.012, uv.x), edgeR = smoothstep(1.0, 0.992, uv.x);
  col *= mix(1.0, edgeL * edgeR, V);
  col = col * 0.9 + vec3(0.035, 0.03, 0.04) * (0.5 + 0.5 * V);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`;

const vtx = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function createCamera(renderer, w = 480, h = 360) {
  const sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true });
  const camRT = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }));
  let ping = 0;

  // the burned-in date stamp
  const stampCanvas = document.createElement('canvas');
  stampCanvas.width = w; stampCanvas.height = h;
  const sctx = stampCanvas.getContext('2d');
  const stamp = new THREE.CanvasTexture(stampCanvas);
  stamp.minFilter = stamp.magFilter = THREE.LinearFilter; stamp.generateMipmaps = false;
  let stampText = '';

  const quad = new THREE.PlaneGeometry(2, 2);
  const mk = (frag, uniforms) => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms, vertexShader: vtx, fragmentShader: frag, depthTest: false, depthWrite: false })); m.frustumCulled = false; const s = new THREE.Scene(); s.add(m); return { s, m }; };
  const camU = { tScene: { value: sceneRT.texture }, tPrev: { value: camRT[1].texture }, uGain: { value: 1 }, uNight: { value: 0 }, uFlash: { value: 0 }, uBright: { value: 1 }, uLag: { value: 1 } };
  const tapeU = {
    tCam: { value: camRT[0].texture }, tOld: { value: camRT[1].texture }, tStamp: { value: stamp }, uRes: { value: new THREE.Vector2(w, h) },
    uTime: { value: 0 }, uInterf: { value: 0 }, uGlitch: { value: 0 }, uRewind: { value: 0 }, uVhs: { value: 1 }, uFade: { value: 0 }, uNight: camU.uNight, uGrain: { value: 1 },
  };
  const camPass = mk(camFrag, camU), tapePass = mk(tapeFrag, tapeU);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // one shared uniform view so callers can keep setting u.uGain etc.
  const uniforms = new Proxy({}, { get: (_, k) => camU[k] || tapeU[k] });

  return {
    rt: sceneRT, uniforms,
    resize(nw, nh) {
      sceneRT.setSize(nw, nh); camRT.forEach((r) => r.setSize(nw, nh)); tapeU.uRes.value.set(nw, nh);
      stampCanvas.width = nw; stampCanvas.height = nh; stampText = '';
    },
    // camcorder date/time stamp, drawn into the signal before it goes to tape
    setStamp(lines) {
      const text = lines.join('|');
      if (text === stampText) return;
      stampText = text;
      const W = stampCanvas.width, H = stampCanvas.height;
      sctx.clearRect(0, 0, W, H);
      const size = Math.round(H * 0.075);
      sctx.font = `${size}px VT323, "Courier New", monospace`;
      sctx.textBaseline = 'alphabetic';
      lines.forEach((l, i) => {
        const x = Math.round(W * 0.075), y = Math.round(H * 0.84 + i * size * 0.98);
        sctx.fillStyle = 'rgba(0,0,0,0.85)';
        for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) sctx.fillText(l, x + ox, y + oy);
        sctx.fillStyle = '#f4f0e6';
        sctx.fillText(l, x, y);
      });
      stamp.needsUpdate = true;
    },
    render(worldScene, worldCam) {
      const cur = camRT[ping], prev = camRT[1 - ping];
      renderer.setRenderTarget(sceneRT);
      renderer.render(worldScene, worldCam);
      camU.tPrev.value = prev.texture;
      renderer.setRenderTarget(cur);
      renderer.render(camPass.s, ortho);
      tapeU.tCam.value = cur.texture; tapeU.tOld.value = prev.texture;
      renderer.setRenderTarget(null);
      renderer.render(tapePass.s, ortho);
      ping = 1 - ping;
    },
  };
}
