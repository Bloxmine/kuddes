// Spray paint engine: every droplet is a tiny dot blended into a full-resolution
// pixel buffer, so colours physically overlap and mix. A coarse "wetness" grid
// tracks how much paint is still wet; too much in one place turns into drips.
(function () {
  'use strict';
  const S = (window.Spray = window.Spray || {});
  const P = (S.Paint = {});

  P.CM = 5; // css px per centimetre on the wall

  const CELL = 4;          // wetness cell size (device px)
  let DRIP_AT = 14;        // paint layers in a cell before it runs
  let dripLen = 1;         // how far drips run
  const DRY_TAU = 1.8;     // seconds for wet paint to settle

  let canvas, ctx, img, d, W = 0, H = 0, dpr = 1, floorD = 0;
  let wet, wetFlag, active = [], wCols = 0, wRows = 0;
  let dx0, dy0, dx1, dy1;
  const drips = [];

  // Spraying runs on a seedable RNG so a peer can replay a stroke dot for dot.
  function seededRng(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = Math.random;

  // Animated paints don't live in the pixel buffer: each one has its own alpha
  // mask, and the page fills the mask with a moving pattern every frame.
  const masks = [];
  let maskMode = null; // while set, blend() paints into this mask instead
  function getMask(name) {
    let m = masks.find((k) => k.name === name);
    if (m) return m;
    const cnv = document.createElement('canvas');
    cnv.width = W; cnv.height = H;
    const mctx = cnv.getContext('2d');
    const mimg = mctx.createImageData(W, H);
    m = { name, cnv, ctx: mctx, img: mimg, d: mimg.data };
    masks.push(m);
    return m;
  }
  P.animLayers = () => masks;

  function resetDirty() { dx0 = 1e9; dy0 = 1e9; dx1 = -1; dy1 = -1; }
  resetDirty();

  // 0 = paint never runs, 1 = very runny
  P.setDrip = function (t) {
    DRIP_AT = t <= 0.001 ? Infinity : 30 * Math.pow(0.17, t);
    dripLen = 0.35 + 1.3 * t;
  };

  P.init = function (cnv, Wd, Hd, _dpr, floorCss) {
    const oldImg = img, oldW = W, oldH = H;
    canvas = cnv;
    canvas.width = Wd; canvas.height = Hd;
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(Wd, Hd);
    d = img.data;
    W = Wd; H = Hd; dpr = _dpr;
    floorD = Math.round(floorCss * dpr);
    if (oldImg) { // keep the artwork across resizes
      const cw = Math.min(oldW, W), ch = Math.min(oldH, H, floorD);
      for (let y = 0; y < ch; y++) {
        d.set(oldImg.data.subarray(y * oldW * 4, (y * oldW + cw) * 4), y * W * 4);
      }
    }
    wCols = Math.ceil(W / CELL); wRows = Math.ceil(H / CELL);
    wet = new Float32Array(wCols * wRows);
    wetFlag = new Uint8Array(wCols * wRows);
    active = [];
    drips.length = 0;
    if (!oldImg) { flakeCount = 0; flakeHead = 0; }
    for (const m of masks) {
      const old = m.d, cw = Math.min(oldW, W), ch = Math.min(oldH, H, floorD);
      m.cnv.width = W; m.cnv.height = H;
      m.img = m.ctx.createImageData(W, H); m.d = m.img.data;
      for (let y = 0; y < ch; y++) m.d.set(old.subarray(y * oldW * 4, (y * oldW + cw) * 4), y * W * 4);
      m.ctx.putImageData(m.img, 0, 0);
    }
    ctx.putImageData(img, 0, 0);
    resetDirty();
  };

  P.clear = function () {
    d.fill(0); wet.fill(0); wetFlag.fill(0); active = []; drips.length = 0;
    flakeCount = 0; flakeHead = 0;
    ctx.putImageData(img, 0, 0);
    for (const m of masks) { m.d.fill(0); m.ctx.putImageData(m.img, 0, 0); }
    resetDirty();
  };

  // --- pixel ops ----------------------------------------------------------

  function blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= W || y >= floorD) return;
    const i = (y * W + x) << 2;
    if (maskMode) {
      const md = maskMode.d;
      md[i + 3] = (a + md[i + 3] * (1 / 255) * (1 - a)) * 255 + 0.5;
      for (let n = 0; n < masks.length; n++) if (masks[n] !== maskMode && masks[n].d[i + 3]) masks[n].d[i + 3] *= 1 - a;
      return;
    }
    const da = d[i + 3] * (1 / 255);
    const oa = a + da * (1 - a);
    const k = a / oa;
    d[i] += (r - d[i]) * k;
    d[i + 1] += (g - d[i + 1]) * k;
    d[i + 2] += (b - d[i + 2]) * k;
    d[i + 3] = oa * 255 + 0.5;
    // fresh paint covers animated paint underneath
    for (let n = 0; n < masks.length; n++) if (masks[n].d[i + 3]) masks[n].d[i + 3] *= 1 - a;
  }

  function touch(x0, y0, x1, y1) {
    if (x0 < dx0) dx0 = x0; if (y0 < dy0) dy0 = y0;
    if (x1 > dx1) dx1 = x1; if (y1 > dy1) dy1 = y1;
  }

  function addWet(x, y, amount) {
    if (x < 0 || y < 0 || x >= W || y >= floorD) return;
    const c = ((y / CELL) | 0) * wCols + ((x / CELL) | 0);
    wet[c] += amount;
    if (!wetFlag[c]) { wetFlag[c] = 1; active.push(c); }
    if (wet[c] > DRIP_AT) spawnDrip(c);
  }

  // one droplet
  function splat(x, y, rad, r, g, b, a, wetMul) {
    if (rad < 0.7) {
      const ix = x | 0, iy = y | 0;
      blend(ix, iy, r, g, b, a);
      touch(ix, iy, ix, iy);
      addWet(ix, iy, a * wetMul / (CELL * CELL));
      return;
    }
    const x0 = Math.floor(x - rad - 0.5), x1 = Math.ceil(x + rad + 0.5);
    const y0 = Math.floor(y - rad - 0.5), y1 = Math.ceil(y + rad + 0.5);
    for (let py = y0; py <= y1; py++) {
      const ddy = py + 0.5 - y;
      for (let px = x0; px <= x1; px++) {
        const ddx = px + 0.5 - x;
        let c = rad + 0.5 - Math.sqrt(ddx * ddx + ddy * ddy);
        if (c <= 0) continue;
        if (c > 1) c = 1;
        blend(px, py, r, g, b, a * c);
      }
    }
    touch(x0, y0, x1, y1);
    addWet(x | 0, y | 0, a * Math.PI * rad * rad * wetMul / (CELL * CELL));
  }

  // --- special paints -----------------------------------------------------

  function hsl(h, s, l, out) {
    h = ((h % 360) + 360) % 360 / 60;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
    out[0] = (r + m) * 255; out[1] = (g + m) * 255; out[2] = (b + m) * 255;
    return out;
  }
  P.hsl = hsl;

  // Metallic paint reflects the sky unevenly: smooth light/dark bands across the wall.
  function sheen(px, py, contrast) {
    const X = px / dpr, Y = py / dpr;
    return 0.5 + contrast * (0.27 * Math.sin(X * 0.021 + Y * 0.013) + 0.16 * Math.sin(X * 0.0071 - Y * 0.017 + 1.3));
  }

  function metalColor(pal, t, out) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const a = t < 0.5 ? pal[0] : pal[1], b = t < 0.5 ? pal[1] : pal[2], u = t < 0.5 ? t * 2 : t * 2 - 1;
    out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u;
    return out;
  }

  // Glitter flakes are remembered so the page can make them twinkle.
  const FLAKES = 40000;
  const flakeXY = new Float32Array(FLAKES * 2), flakeRGB = new Uint32Array(FLAKES);
  let flakeCount = 0, flakeHead = 0;
  function addFlake(x, y, r, g, b) {
    flakeXY[flakeHead * 2] = x / dpr; flakeXY[flakeHead * 2 + 1] = y / dpr;
    flakeRGB[flakeHead] = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    flakeHead = (flakeHead + 1) % FLAKES;
    if (flakeCount < FLAKES) flakeCount++;
  }
  P.flakeCount = () => flakeCount;
  P.sampleFlake = function (out) {
    if (!flakeCount) return false;
    const i = (rnd() * flakeCount) | 0;
    out.x = flakeXY[i * 2]; out.y = flakeXY[i * 2 + 1];
    const c = flakeRGB[i];
    out.r = (c >> 16) & 255; out.g = (c >> 8) & 255; out.b = c & 255;
    return true;
  };

  // Star confetti: pre-rendered anti-aliased masks per size and rotation.
  const starMasks = new Map();
  function starMask(r, rot) {
    const key = r * 100 + rot;
    let m = starMasks.get(key);
    if (m) return m;
    const s = Math.ceil(r * 2 + 3), c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.translate(s / 2, s / 2);
    g.rotate((rot / 6) * (Math.PI * 2 / 5));
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#fff';
    g.fill();
    const data = g.getImageData(0, 0, s, s).data, a = new Float32Array(s * s);
    for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3] / 255;
    m = { s, a };
    starMasks.set(key, m);
    return m;
  }

  function stampStar(cx, cy, r, col, alpha) {
    const m = starMask(Math.max(1, Math.round(r * 2) / 2), (rnd() * 6) | 0);
    const x0 = Math.round(cx - m.s / 2), y0 = Math.round(cy - m.s / 2);
    // slight top-left highlight so stars read as foil
    for (let y = 0; y < m.s; y++) {
      for (let x = 0; x < m.s; x++) {
        const a = m.a[y * m.s + x];
        if (a <= 0) continue;
        const hl = 1 + 0.25 * (1 - (x + y) / m.s);
        blend(x0 + x, y0 + y, col[0] * hl, col[1] * hl, col[2] * hl, a * alpha);
      }
    }
    touch(x0, y0, x0 + m.s, y0 + m.s);
    addWet(cx | 0, cy | 0, alpha * r * r * 0.6 / (CELL * CELL));
  }

  // --- pattern paints -----------------------------------------------------
  // Colour as a function of wall position (css px), so a pattern can is like
  // spraying through to a hidden surface. t animates the animated ones.

  function makeNoise(seed) {
    let a = seed;
    const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const vals = new Float32Array(65536);
    for (let i = 0; i < vals.length; i++) vals[i] = rnd();
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
      const p = vals[y0 | x0], q = vals[y0 | x1], r = vals[y1 | x0], w = vals[y1 | x1];
      return p + (q - p) * u + (r - p) * v + (p - q - r + w) * u * v;
    };
  }
  const nz = makeNoise(4242);
  function fbm(x, y, oct) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += amp * nz(x * f + i * 19.1, y * f + i * 7.7); n += amp; amp *= 0.5; f *= 2.02; }
    return s / n;
  }
  function hash(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function put(out, r, g, b) { out[0] = r; out[1] = g; out[2] = b; return out; }
  function lerp3(out, a, b, t) { return put(out, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); }

  const WOOD_L = [200, 150, 96], WOOD_D = [116, 70, 36];
  const MARBLE = [238, 236, 230], VEIN = [74, 76, 86];
  const LAVA = [[22, 4, 3], [150, 16, 4], [240, 80, 8], [255, 170, 30], [255, 236, 140]];

  P.pattern = function (name, X, Y, t, out) {
    switch (name) {
      case 'wood': {
        const plank = Math.floor(Y / 64), py = Y - plank * 64;
        if (py < 1.4) return put(out, 58, 34, 18); // seam between planks
        const off = hash(plank, 3) * 900;
        const warp = fbm((X + off) / 420, Y / 10, 3) * 46 + Math.sin((X + off) * 0.006) * 5;
        const ring = 0.5 + 0.5 * Math.sin((Y + warp) * 0.55);
        const streak = (nz((X + off) / 2.5, Y / 0.9) - 0.5) * 26;
        const tone = (hash(plank, 9) - 0.5) * 34;
        lerp3(out, WOOD_L, WOOD_D, Math.pow(ring, 2.2));
        out[0] += streak + tone; out[1] += streak * 0.8 + tone * 0.8; out[2] += streak * 0.6 + tone * 0.6;
        // the odd knot
        const kx = Math.floor((X + off) / 260), kh = hash(kx, plank);
        if (kh > 0.6) {
          const kxc = kx * 260 - off + 130 + (kh - 0.8) * 400, kyc = plank * 64 + 32;
          const dk = Math.hypot((X - kxc) / 1.8, Y - kyc);
          if (dk < 12) lerp3(out, out, [70, 40, 20], (1 - dk / 12) * (0.6 + 0.4 * Math.sin(dk * 1.4)));
        }
        return out;
      }
      case 'galaxy': {
        const n1 = fbm(X / 230, Y / 230, 4), n2 = fbm(X / 80 + 9, Y / 80, 3);
        put(out, 8, 6, 26);
        const p = sstep(0.42, 0.75, n1), m = sstep(0.52, 0.8, n2) * n1, c = sstep(0.5, 0.8, 1 - n1) * 0.7;
        out[0] += 110 * p + 220 * m + 30 * c; out[1] += 36 * p + 60 * m + 150 * c; out[2] += 160 * p + 170 * m + 210 * c;
        return out;
      }
      case 'camo': {
        const n = fbm(X / 75, Y / 75, 3), m = fbm(X / 32 + 30, Y / 32, 2);
        if (m > 0.66 && n > 0.45) return put(out, 30, 26, 18);
        if (n < 0.43) return put(out, 46, 58, 31);
        if (n < 0.52) return put(out, 86, 106, 48);
        if (n < 0.6) return put(out, 150, 132, 86);
        return put(out, 30, 26, 18);
      }
      case 'zebra': {
        const v = Math.sin(X * 0.05 + fbm(X / 150, Y / 150, 3) * 11 + Math.sin(Y * 0.012) * 2.4);
        return v > 0.12 ? put(out, 16, 16, 16) : put(out, 242, 240, 234);
      }
      case 'marble': {
        const w = fbm(X / 130, Y / 130, 4);
        const v = Math.abs(Math.sin(X * 0.008 + Y * 0.012 + w * 9));
        const f = Math.abs(Math.sin(X * 0.021 - Y * 0.011 + fbm(X / 45, Y / 45, 3) * 7));
        const vein = Math.min(1, Math.pow(1 - v, 12) + Math.pow(1 - f, 26) * 0.55);
        lerp3(out, MARBLE, VEIN, vein);
        const cloud = (fbm(X / 60, Y / 60, 3) - 0.5) * 18;
        out[0] += cloud; out[1] += cloud; out[2] += cloud;
        return out;
      }
      case 'leopard': {
        const C = 38, cx = Math.floor(X / C), cy = Math.floor(Y / C);
        let best = 9, bh = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const h1 = hash(cx + i, cy + j), h2 = hash(cy + j + 91, cx + i - 17);
          const dx = (cx + i + 0.15 + h1 * 0.7) * C - X, dy = (cy + j + 0.15 + h2 * 0.7) * C - Y;
          const dd = Math.sqrt(dx * dx + dy * dy) / C;
          if (dd < best) { best = dd; bh = h1; }
        }
        const size = 0.26 + 0.12 * bh, ragged = (nz(X / 5, Y / 5) - 0.5) * 0.09;
        if (best + ragged < size * 0.6) return put(out, 170, 92, 30);
        if (best + ragged < size && nz(X / 7 + 50, Y / 7) > 0.3) return put(out, 26, 18, 12);
        const g = (nz(X / 20, Y / 20) - 0.5) * 24;
        return put(out, 222 + g, 162 + g, 76 + g * 0.5);
      }
      case 'vampire': {
        const n = fbm(X / 40, Y / 40, 3);
        return lerp3(out, [20, 1, 3], [118, 6, 16], sstep(0.35, 0.8, n));
      }
      case 'plasma': {
        const v = Math.sin(X * 0.017 + t * 1.1) + Math.sin(Y * 0.021 - t * 1.4) +
          Math.sin((X + Y) * 0.011 + t * 0.8) + Math.sin(Math.hypot(X - 600, Y - 300) * 0.014 - t * 1.7);
        return hsl(v * 55 + t * 50, 1, 0.55, out);
      }
      case 'lava': {
        const n = fbm(X / 95 + Math.sin(t * 0.3) * 0.4, Y / 95 - t * 0.22, 4);
        const m = fbm(X / 32 - t * 0.1, Y / 32 - t * 0.55, 2);
        let k = Math.min(0.999, Math.max(0, (n * 0.85 + m * 0.35 - 0.2) * 1.9));
        const pulse = 0.88 + 0.12 * Math.sin(t * 2.2 + X * 0.01 + Y * 0.007);
        k *= LAVA.length - 1;
        const i = Math.floor(k);
        lerp3(out, LAVA[i], LAVA[i + 1], k - i);
        out[0] *= pulse; out[1] *= pulse; out[2] *= pulse;
        return out;
      }
    }
    return put(out, 128, 128, 128);
  };

  // --- spraying -----------------------------------------------------------

  const tmp = [0, 0, 0];

  /**
   * Spray along the segment (x0,y0)->(x1,y1) in device px.
   * paint: {kind, rgb, pal, contrast, time}. dist: nozzle distance in cm. cap: {spread, flow}.
   */
  P.spray = function (x0, y0, x1, y1, paint, dist, dt, cap, burst, seed) {
    maskMode = paint.kind === 'anim' ? getMask(paint.pattern) : null;
    rnd = seed === undefined ? Math.random : seededRng(seed);
    sprayInner(x0, y0, x1, y1, paint, dist, dt, cap, burst);
    rnd = Math.random;
    maskMode = null;
  };

  // Replace the artwork with an image (a peer's snapshot), aligned by the caller.
  function drawToBuffer(src, dx, dy, scale) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(src, dx, dy, src.width * scale, src.height * scale);
    return g.getImageData(0, 0, W, H).data;
  }
  P.importImage = function (src, dx, dy, scale) {
    const data = drawToBuffer(src, dx, dy, scale);
    d.set(data);
    d.fill(0, floorD * W * 4);
    wet.fill(0); wetFlag.fill(0); active = []; drips.length = 0;
    ctx.putImageData(img, 0, 0);
    resetDirty();
  };
  P.importMask = function (name, src, dx, dy, scale) {
    const data = drawToBuffer(src, dx, dy, scale), m = getMask(name), md = m.d;
    const end = floorD * W * 4;
    for (let i = 3; i < md.length; i += 4) md[i] = i < end ? data[i] : 0;
    m.ctx.putImageData(m.img, 0, 0);
  };

  // colour for the odd extra droplet (dust, spits) of any paint
  function colorAt(paint, px, py, contrast, out) {
    const k = paint.kind;
    if (k === 'metal') return metalColor(paint.pal, sheen(px, py, contrast), out);
    if (k === 'pattern' || k === 'vampire') return P.pattern(k === 'vampire' ? 'vampire' : paint.pattern, px / dpr, py / dpr, 0, out);
    if (k === 'rainbow') return hsl(paint.time * 110, 0.9, 0.55, out);
    return put(out, paint.rgb[0], paint.rgb[1], paint.rgb[2]);
  }

  function sprayInner(x0, y0, x1, y1, paint, dist, dt, cap, burst) {
    const cm = P.CM * dpr;
    const sigma = (0.2 + dist * cap.spread) * cm;
    const dry = Math.min(1, Math.max(0, (dist - 14) / 28));  // far: droplets dry mid-air
    const close = Math.min(1, Math.max(0, (6 - dist) / 4));  // very close: spits & puddles
    const kind = paint.kind || 'solid', pal = paint.pal, contrast = paint.contrast || 1;
    let n = cap.flow * dt * (kind === 'stars' ? 0.16 : 1);
    n = Math.floor(n) + (rnd() < n % 1 ? 1 : 0);
    let base = paint.rgb;
    if (kind === 'rainbow') base = hsl(paint.time * 110, 0.9, 0.55, [0, 0, 0]);
    const cr = base[0], cg = base[1], cb = base[2];
    const sizeMul = dpr * (1 - 0.4 * dry) * (1 + 0.35 * close);
    const alphaMul = 1 - 0.5 * dry;
    const lost = dry * 0.4;

    for (let k = 0; k < n; k++) {
      if (lost && rnd() < lost) continue;
      const t = rnd();
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      const roll = rnd();
      const s = roll < 0.1 ? sigma * 2.3 : sigma; // overspray halo
      const mag = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * s;
      const ang = rnd() * 6.283185;
      const px = cx + Math.cos(ang) * mag, py = cy + Math.sin(ang) * mag;
      let rad = (0.3 + Math.pow(rnd(), 3) * 1.25) * sizeMul;
      let a = (0.45 + 0.5 * rnd()) * alphaMul;
      if (roll < 0.1) { a *= 0.6; rad *= 0.8; }

      if (kind === 'metal') {
        if (rnd() < 0.035) { splat(px, py, rad, pal[3][0], pal[3][1], pal[3][2], a, 1); continue; }
        metalColor(pal, sheen(px, py, contrast) + (rnd() - 0.5) * 0.3, tmp);
        splat(px, py, rad, tmp[0], tmp[1], tmp[2], a, 1);
      } else if (kind === 'holo') {
        const sh = sheen(px, py, 1.2);
        const X = px / dpr, Y = py / dpr;
        hsl(X * 1.3 + Y * 0.9 + Math.sin(X * 0.03 + Y * 0.02) * 70 + rnd() * 25, 0.6, 0.5 + sh * 0.32, tmp);
        if (rnd() < 0.03) { tmp[0] = tmp[1] = tmp[2] = 255; }
        splat(px, py, rad, tmp[0], tmp[1], tmp[2], a, 1);
      } else if (kind === 'glitter') {
        if (rnd() < 0.12) {
          const c = pal[(rnd() * pal.length) | 0], j = (rnd() - 0.5) * 60;
          const fr = (0.75 + rnd() * 0.8) * dpr;
          splat(px, py, fr, c[0] + j, c[1] + j, c[2] + j, 0.95, 0.6);
          if (rnd() < 0.5) addFlake(px, py, c[0], c[1], c[2]);
        } else {
          const j = (rnd() - 0.5) * 20;
          splat(px, py, rad, cr + j, cg + j, cb + j, a * 0.6, 1);
        }
      } else if (kind === 'pattern') {
        if (paint.pattern === 'galaxy' && rnd() < 0.012) {
          splat(px, py, (0.5 + rnd() * 0.6) * dpr, 255, 255, 255, 1, 0.5);
          if (rnd() < 0.5) addFlake(px, py, 255, 255, 255);
          continue;
        }
        P.pattern(paint.pattern, px / dpr, py / dpr, 0, tmp);
        const j = (rnd() - 0.5) * 12;
        splat(px, py, rad, tmp[0] + j, tmp[1] + j, tmp[2] + j, a, 1);
      } else if (kind === 'vampire') {
        // near-black blood that runs at the slightest excuse
        const v = Math.pow(rnd(), 1.6);
        splat(px, py, rad, 18 + v * 110, 1 + v * 6, 3 + v * 14, a, 2.6);
      } else if (kind === 'stars') {
        // carrier dust between the stars
        const c = pal[(rnd() * pal.length) | 0];
        splat(px, py, rad * 0.8, c[0], c[1], c[2], a * 0.45, 0.2);
      } else {
        const j = (rnd() - 0.5) * 14;
        splat(px, py, rad, cr + j, cg + j, cb + j, a, 1);
      }
    }

    if (kind === 'stars') {
      let m = 170 * Math.sqrt(cap.flow / 46000) * dt;
      m = Math.floor(m) + (rnd() < m % 1 ? 1 : 0);
      for (let i = 0; i < m; i++) {
        const t = rnd();
        const mag = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * sigma * 0.85;
        const ang = rnd() * 6.283185;
        const sx = x0 + (x1 - x0) * t + Math.cos(ang) * mag, sy = y0 + (y1 - y0) * t + Math.sin(ang) * mag;
        const c = pal[(rnd() * pal.length) | 0];
        stampStar(sx, sy, (2.6 + Math.pow(rnd(), 1.6) * 5.5) * dpr, c, 0.97);
        if (rnd() < 0.4) addFlake(sx, sy, c[0], c[1], c[2]);
      }
      return; // no spits from a confetti can
    }

    // fine dust haze when far away
    if (dry > 0) {
      const dust = (n * 0.5 * dry) | 0;
      for (let k = 0; k < dust; k++) {
        const t = rnd();
        const mag = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * sigma * 1.6;
        const ang = rnd() * 6.283185;
        const px = x0 + (x1 - x0) * t + Math.cos(ang) * mag, py = y0 + (y1 - y0) * t + Math.sin(ang) * mag;
        colorAt(paint, px, py, contrast, tmp);
        splat(px, py, 0.3, tmp[0], tmp[1], tmp[2], 0.12 + rnd() * 0.12, 0.3);
      }
    }

    // spits: big droplets on the first press and when very close
    const spitChance = burst ? 0.8 : close * dt * 14 + dt * 0.4;
    if (rnd() < spitChance) {
      const count = burst ? 1 + (rnd() * 3 | 0) : 1;
      for (let i = 0; i < count; i++) {
        const mag = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * sigma * 0.7;
        const ang = rnd() * 6.283185;
        const rad = (1.1 + rnd() * 2.2) * dpr;
        const sx = x1 + Math.cos(ang) * mag, sy = y1 + Math.sin(ang) * mag;
        colorAt(paint, sx, sy, contrast, tmp);
        splat(sx, sy, rad, tmp[0], tmp[1], tmp[2], 0.96, 3);
      }
    }
  };

  // --- drips --------------------------------------------------------------

  function spawnDrip(c) {
    const col = c % wCols, row = (c / wCols) | 0;
    const excess = wet[c] - DRIP_AT * 0.5;
    wet[c] = DRIP_AT * 0.4;
    // neighbours drain into this drip so we get one runner, not a curtain
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const rr = row + dr, cc = col + dc;
        if (rr < 0 || cc < 0 || rr >= wRows || cc >= wCols) continue;
        const k = rr * wCols + cc;
        if (wet[k] > DRIP_AT * 0.6) wet[k] = DRIP_AT * 0.6;
      }
    }
    const x = col * CELL + rnd() * CELL, y = row * CELL + CELL * 0.5;
    const ix = Math.min(W - 1, x | 0), iy = Math.min(floorD - 1, y | 0);
    const i = (iy * W + ix) << 2;
    const mask = masks.find((m) => m.d[i + 3] > 120) || null;
    if (d[i + 3] < 40 && !mask) return;
    const len = Math.min(420, (22 + excess * 7) * dripLen) * dpr;
    drips.push({
      x, y, len, len0: len,
      r: (0.85 + Math.min(1.4, excess * 0.05)) * dpr,
      col: [d[i], d[i + 1], d[i + 2]],
      v: 0, wob: rnd() * 6.28, wobA: 0.02 + rnd() * 0.05, mask,
    });
  }

  function stampDisc(x, y, rad, col, a) {
    const x0 = Math.floor(x - rad - 0.5), x1 = Math.ceil(x + rad + 0.5);
    const y0 = Math.floor(y - rad - 0.5), y1 = Math.ceil(y + rad + 0.5);
    for (let py = y0; py <= y1; py++) {
      const ddy = py + 0.5 - y;
      for (let px = x0; px <= x1; px++) {
        const ddx = px + 0.5 - x;
        let c = rad + 0.5 - Math.sqrt(ddx * ddx + ddy * ddy);
        if (c <= 0) continue;
        if (c > 1) c = 1;
        blend(px, py, col[0], col[1], col[2], a * c);
      }
    }
    touch(x0, y0, x1, y1);
  }

  P.update = function (dt) {
    // paint sets
    const f = Math.exp(-dt / DRY_TAU);
    for (let k = active.length - 1; k >= 0; k--) {
      const c = active[k];
      wet[c] *= f;
      if (wet[c] < 0.05) {
        wet[c] = 0; wetFlag[c] = 0;
        active[k] = active[active.length - 1]; active.pop();
      }
    }

    // drips crawl down, thinning out, and end in a bead
    for (let n = drips.length - 1; n >= 0; n--) {
      const dr = drips[n];
      const frac = Math.max(0, dr.len / dr.len0);
      const target = (5 + 70 * frac * frac) * dpr;
      dr.v += (target - dr.v) * Math.min(1, dt * 2.5);
      let step = dr.v * dt, done = false;
      maskMode = dr.mask;
      while (step > 0 && !done) {
        const s = Math.min(step, 0.5 * dpr);
        step -= s;
        dr.y += s;
        dr.x += Math.sin(dr.y / (18 * dpr) + dr.wob) * dr.wobA * s;
        dr.len -= s;
        const fr = Math.max(0, dr.len / dr.len0);
        stampDisc(dr.x, dr.y, dr.r * (0.5 + 0.5 * fr), dr.col, 0.85);
        // soak up wet paint it runs through
        const cx = (dr.x / CELL) | 0, cy = (dr.y / CELL) | 0;
        if (cx >= 0 && cx < wCols && cy < wRows) {
          const c = cy * wCols + cx;
          if (wet[c] > 2) {
            dr.len += wet[c] * 1.6 * dpr;
            if (dr.len > dr.len0) dr.len0 = dr.len;
            const ix = Math.min(W - 1, dr.x | 0), iy = Math.min(floorD - 1, dr.y | 0), i = (iy * W + ix) << 2;
            dr.col[0] += (d[i] - dr.col[0]) * 0.3;
            dr.col[1] += (d[i + 1] - dr.col[1]) * 0.3;
            dr.col[2] += (d[i + 2] - dr.col[2]) * 0.3;
            wet[c] = 0;
          }
        }
        if (dr.y >= floorD - 1) done = true;
        else if (dr.len <= 0) {
          stampDisc(dr.x, dr.y + dr.r * 0.4, dr.r * 1.25, dr.col, 0.95);
          done = true;
        }
      }
      maskMode = null;
      if (done) drips.splice(n, 1);
    }
  };

  P.flush = function () {
    if (dx1 < 0) return;
    const x0 = Math.max(0, dx0), y0 = Math.max(0, dy0);
    const x1 = Math.min(W - 1, dx1), y1 = Math.min(floorD - 1, dy1);
    if (x1 >= x0 && y1 >= y0) {
      ctx.putImageData(img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      for (const m of masks) m.ctx.putImageData(m.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }
    resetDirty();
  };

  P.sigmaCss = function (dist, cap) { return (0.2 + dist * cap.spread) * P.CM; };
  P.canvas = () => canvas;
})();
