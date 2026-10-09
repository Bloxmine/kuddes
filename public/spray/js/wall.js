// Procedural walls.
// Each wall type paints two canvases:
//   wall   - the base colour (tone variation, stains, streaks, ground)
//   relief - neutral-grey (128) height/shading map (grain, pores, joints, light)
//            that is overlay-blended on top of both the wall and the paint,
//            so the surface texture shows through whatever gets sprayed on it.
// All feature sizes are in css px, 1 cm = 5 px.
(function () {
  'use strict';
  const S = (window.Spray = window.Spray || {});

  // ------------------------------------------------------------ helpers

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(rand) {
    const vals = new Float32Array(256 * 256);
    for (let i = 0; i < vals.length; i++) vals[i] = rand();
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
      const a = vals[y0 | x0], b = vals[y0 | x1], c = vals[y1 | x0], d = vals[y1 | x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  function fbm(noise, x, y, oct) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * noise(x * f + i * 17.3, y * f + i * 31.7);
      n += amp; amp *= 0.5; f *= 2.03;
    }
    return s / n;
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Render fn(X, Y) -> [r,g,b,a] on a low-res grid (k css px per cell) and
  // stretch it smoothly over the target canvas.
  function lowRes(C, target, k, fn) {
    const lw = Math.ceil(C.cssW / k) + 1, lh = Math.ceil(C.cssH / k) + 1;
    const small = canvas(lw, lh), sg = small.getContext('2d');
    const img = sg.createImageData(lw, lh), d = img.data;
    const px = [0, 0, 0, 255];
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        fn(x * k, y * k, px);
        const i = (y * lw + x) * 4;
        d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2]; d[i + 3] = px[3];
      }
    }
    sg.putImageData(img, 0, 0);
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    target.drawImage(small, 0, 0, lw * k * C.dpr, lh * k * C.dpr);
  }

  // Large blotchy light/dark variation laid over the base colour.
  function toneOverlay(C, scale, strength) {
    lowRes(C, C.g, 6, (X, Y, p) => {
      const n = fbm(C.nA, X / scale, Y / scale, 5) - 0.5 + (fbm(C.nB, X / 70, Y / 70, 3) - 0.5) * 0.4;
      if (n < 0) { p[0] = 30; p[1] = 26; p[2] = 22; p[3] = Math.min(255, -n * 255 * strength); }
      else { p[0] = 255; p[1] = 252; p[2] = 245; p[3] = Math.min(255, n * 255 * strength * 0.7); }
    });
  }

  // Dirty vertical rain streaks running down from the given edges.
  function streaks(C, tops, color, density, maxLen, alpha) {
    const { rand, cssW } = C;
    const k = 3, st = canvas(C.cssW / k, C.cssH / k), sg = st.getContext('2d');
    sg.scale(1 / k, 1 / k);
    for (const top of tops) {
      const count = Math.round(cssW / density);
      for (let i = 0; i < count; i++) {
        const x = rand() * cssW;
        const w = 2 + Math.pow(rand(), 2) * 34;
        const len = 30 + Math.pow(rand(), 1.5) * maxLen;
        const a = alpha * (0.25 + rand() * 0.75);
        const gr = sg.createLinearGradient(0, top, 0, top + len);
        gr.addColorStop(0, `rgba(${color},${a})`);
        gr.addColorStop(0.5, `rgba(${color},${a * 0.6})`);
        gr.addColorStop(1, `rgba(${color},0)`);
        sg.fillStyle = gr;
        let yy = top, xx = x;
        while (yy < top + len) {
          const seg = 8 + rand() * 12;
          sg.fillRect(xx, yy, w, seg + 1);
          yy += seg; xx += (rand() - 0.5) * 1.5;
        }
      }
    }
    C.g.drawImage(st, 0, 0, st.width * k * C.dpr, st.height * k * C.dpr);
  }

  // Grime collecting near the ground.
  function grime(C, height, alpha) {
    const { g, dpr, Wd, floorD } = C;
    const gr = g.createLinearGradient(0, floorD - height * dpr, 0, floorD);
    gr.addColorStop(0, 'rgba(50,44,38,0)');
    gr.addColorStop(1, `rgba(50,44,38,${alpha})`);
    g.fillStyle = gr;
    g.fillRect(0, floorD - height * dpr, Wd, height * dpr);
  }

  function pores(C, count, maxR, dark, x0, y0, w, h) {
    const { r, rand, dpr } = C;
    for (let i = 0; i < count; i++) {
      const x = (x0 + rand() * w) * dpr, y = (y0 + rand() * h) * dpr;
      const rad = (0.35 + Math.pow(rand(), 7) * maxR) * dpr;
      const rot = rand() * Math.PI;
      r.fillStyle = 'rgba(175,175,175,0.4)';
      r.beginPath(); r.ellipse(x, y + rad * 0.35, rad * 1.12, rad * 0.95, rot, 0, Math.PI * 2); r.fill();
      const v = 45 + rand() * 30 | 0;
      r.fillStyle = `rgba(${v},${v},${v},${dark * (0.55 + rand() * 0.45)})`;
      r.beginPath(); r.ellipse(x, y, rad, rad * (0.7 + rand() * 0.3), rot, 0, Math.PI * 2); r.fill();
    }
  }

  function segLine(C, x0, y0, x1, y1, color, width) {
    const { r, rand, dpr } = C;
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.round(len / 18));
    r.strokeStyle = color; r.lineWidth = width * dpr; r.lineCap = 'butt';
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      r.globalAlpha = 0.45 + rand() * 0.55;
      r.beginPath();
      r.moveTo((x0 + (x1 - x0) * t0) * dpr, (y0 + (y1 - y0) * t0) * dpr);
      r.lineTo((x0 + (x1 - x0) * t1) * dpr, (y0 + (y1 - y0) * t1) * dpr);
      r.stroke();
    }
    r.globalAlpha = 1;
  }

  // Masonry: a running-bond grid of units with recessed mortar joints.
  function masonry(C, uw, uh, joint, unitColor, reliefFace, edge) {
    const { g, r, rand, dpr, cssW, floorY } = C;
    const cw = uw + joint, ch = uh + joint;
    const offset = -rand() * cw;
    const units = [];
    for (let row = 0; ; row++) {
      const top = floorY - (row + 1) * ch + joint;
      if (top + uh < 0) break;
      const shift = row % 2 ? cw / 2 : 0;
      for (let x = offset + shift - cw; x < cssW + cw; x += cw) units.push({ x, y: top, w: uw, h: uh });
    }
    for (const u of units) {
      const j = () => (rand() - 0.5) * edge;
      const pts = [[u.x + j(), u.y + j()], [u.x + u.w + j(), u.y + j()], [u.x + u.w + j(), u.y + u.h + j()], [u.x + j(), u.y + u.h + j()]];
      const path = () => {
        const p = new Path2D();
        p.moveTo(pts[0][0] * dpr, pts[0][1] * dpr);
        for (let i = 1; i < 4; i++) p.lineTo(pts[i][0] * dpr, pts[i][1] * dpr);
        p.closePath();
        return p;
      };
      const p = path();
      g.fillStyle = unitColor(u); g.fill(p);
      // relief: face, lit top edge, shadowed bottom edge, cast shadow into the joint
      const face = reliefFace(u);
      r.fillStyle = `rgb(${face},${face},${face})`; r.fill(p);
      r.lineWidth = 1.3 * dpr;
      r.strokeStyle = 'rgba(185,185,185,0.8)';
      r.beginPath(); r.moveTo(pts[3][0] * dpr, pts[3][1] * dpr); r.lineTo(pts[0][0] * dpr, pts[0][1] * dpr); r.lineTo(pts[1][0] * dpr, pts[1][1] * dpr); r.stroke();
      r.strokeStyle = 'rgba(70,70,70,0.8)';
      r.beginPath(); r.moveTo(pts[1][0] * dpr, pts[1][1] * dpr); r.lineTo(pts[2][0] * dpr, pts[2][1] * dpr); r.lineTo(pts[3][0] * dpr, pts[3][1] * dpr); r.stroke();
      r.strokeStyle = 'rgba(55,55,55,0.55)'; r.lineWidth = 2 * dpr;
      r.beginPath(); r.moveTo((pts[3][0] + 1) * dpr, (pts[3][1] + 1.6) * dpr); r.lineTo((pts[2][0] + 1) * dpr, (pts[2][1] + 1.6) * dpr); r.stroke();
    }
    return units;
  }

  // ------------------------------------------------------------ wall types

  const TYPES = {};

  TYPES.concrete = {
    name: 'Beton',
    build(C) {
      const { g, r, rand, dpr, Wd, floorD, cssW, floorY } = C;
      g.fillStyle = '#a09d97'; g.fillRect(0, 0, Wd, floorD);
      lowRes(C, g, 6, (X, Y, p) => {
        const n = fbm(C.nA, X / 320, Y / 320, 5), m = fbm(C.nB, X / 70, Y / 70, 4);
        const damp = Math.max(0, fbm(C.nC, X / 500, Y / 260, 3) - 0.55) * 2.2;
        const lum = (n - 0.5) * 42 + (m - 0.5) * 16 - damp * 26;
        const warm = (fbm(C.nD, X / 600, Y / 600, 2) - 0.5) * 10;
        p[0] = 160 + lum + warm; p[1] = 157 + lum + warm * 0.4; p[2] = 151 + lum - warm * 0.6; p[3] = 255;
      });

      // board-formed panels, 108 x 54 cm
      const pw = 540, ph = 270;
      const ox = -rand() * pw, oy = floorY - Math.ceil(floorY / ph) * ph;
      const xs = [], ys = [];
      for (let x = ox; x < cssW + pw; x += pw) xs.push(x);
      for (let y = oy; y < floorY; y += ph) ys.push(y);
      for (const x of xs) for (const y of ys) {
        g.fillStyle = rand() < 0.5 ? `rgba(40,36,32,${rand() * 0.07})` : `rgba(255,252,245,${rand() * 0.05})`;
        g.fillRect(x * dpr, y * dpr, pw * dpr, ph * dpr);
      }
      streaks(C, [0, ...ys.filter((y) => y > 0)], '58,52,46', 26, 380, 0.09);

      lowRes(C, r, 2, (X, Y, p) => {
        const v = 128 + (fbm(C.nB, X / 16, Y / 11, 3) - 0.5) * 26 + (fbm(C.nD, X / 60, Y / 4, 2) - 0.5) * 7;
        p[0] = p[1] = p[2] = v; p[3] = 255;
      });
      pores(C, Math.round((cssW * floorY) / 380), 3.6, 0.8, 0, 0, cssW, floorY);
      for (const y of ys) {
        if (y <= 0) continue;
        segLine(C, 0, y + 1.4, cssW, y + 1.4, 'rgb(178,178,178)', 1.2);
        segLine(C, 0, y, cssW, y, 'rgb(62,62,62)', 1.5);
      }
      for (const x of xs) {
        if (x <= 0) continue;
        segLine(C, x + 1.4, 0, x + 1.4, floorY, 'rgb(172,172,172)', 1.1);
        segLine(C, x, 0, x, floorY, 'rgb(66,66,66)', 1.4);
      }
      // tie holes
      for (const px of xs) for (const py of ys) {
        for (const fx of [0.25, 0.75]) {
          const x = (px + pw * fx) * dpr, y = (py + ph * 0.5) * dpr;
          if (y > floorD - 20 * dpr || y < 0) continue;
          const R = 6 * dpr;
          r.fillStyle = 'rgba(150,150,150,0.35)';
          r.beginPath(); r.arc(x, y, R * 2.3, 0, Math.PI * 2); r.fill();
          const hg = r.createRadialGradient(x, y - R * 0.2, 0, x, y, R);
          hg.addColorStop(0, 'rgb(22,22,22)');
          hg.addColorStop(0.75, 'rgb(58,58,58)');
          hg.addColorStop(1, 'rgb(96,96,96)');
          r.fillStyle = hg;
          r.beginPath(); r.arc(x, y, R, 0, Math.PI * 2); r.fill();
          r.lineWidth = 1.3 * dpr;
          r.strokeStyle = 'rgba(200,200,200,0.7)';
          r.beginPath(); r.arc(x, y, R + 0.6 * dpr, 0.15 * Math.PI, 0.85 * Math.PI); r.stroke();
          r.strokeStyle = 'rgba(50,50,50,0.5)';
          r.beginPath(); r.arc(x, y, R + 0.6 * dpr, 1.15 * Math.PI, 1.85 * Math.PI); r.stroke();
        }
      }
      C.grain = 24;
    },
  };

  TYPES.brick = {
    name: 'Baksteen',
    build(C) {
      const { g, r, rand, dpr, Wd, floorD } = C;
      g.fillStyle = '#9d968a'; g.fillRect(0, 0, Wd, floorD);           // mortar
      r.fillStyle = 'rgb(96,96,96)'; r.fillRect(0, 0, Wd, floorD);      // recessed joints
      const palette = [[150, 62, 44], [134, 55, 40], [160, 76, 54], [120, 49, 37], [168, 90, 64], [140, 68, 52], [128, 60, 46]];
      const units = masonry(C, 107, 32, 5,
        () => {
          const v = rand();
          let c = v < 0.06 ? [84, 40, 32] : v < 0.1 ? [184, 124, 92] : palette[(rand() * palette.length) | 0];
          const j = (rand() - 0.5) * 16;
          return `rgb(${c[0] + j | 0},${c[1] + j * 0.6 | 0},${c[2] + j * 0.5 | 0})`;
        },
        () => 122 + (rand() * 14 | 0), 1.6);
      // speckle, chips and pits on the bricks
      for (const u of units) {
        pores(C, 10, 1.8, 0.7, u.x, u.y, u.w, u.h);
        const chips = (rand() * 3) | 0;
        for (let i = 0; i < chips; i++) {
          const side = rand() < 0.5, x = u.x + (side ? rand() * u.w : rand() < 0.5 ? 1 : u.w - 1);
          const y = side ? (rand() < 0.5 ? u.y + 1 : u.y + u.h - 1) : u.y + rand() * u.h;
          r.fillStyle = 'rgba(70,70,70,0.7)';
          r.beginPath(); r.ellipse(x * dpr, y * dpr, (1.5 + rand() * 3) * dpr, (1 + rand() * 2) * dpr, rand() * 3, 0, Math.PI * 2); r.fill();
        }
        for (let i = 0; i < 14; i++) {
          g.fillStyle = rand() < 0.5 ? 'rgba(40,20,15,0.35)' : 'rgba(230,190,150,0.25)';
          g.fillRect((u.x + rand() * u.w) * dpr, (u.y + rand() * u.h) * dpr, 1.2 * dpr, 1.2 * dpr);
        }
      }
      toneOverlay(C, 280, 0.32);
      toneOverlay(C, 28, 0.18); // mottling within each brick
      streaks(C, [0], '30,24,20', 30, 460, 0.12);
      grime(C, 90, 0.3);
      C.grain = 26;
    },
  };

  TYPES.block = {
    name: 'Betonblokken',
    build(C) {
      const { g, r, rand, dpr, Wd, floorD, cssW, floorY } = C;
      g.fillStyle = '#8f8b84'; g.fillRect(0, 0, Wd, floorD);
      r.fillStyle = 'rgb(100,100,100)'; r.fillRect(0, 0, Wd, floorD);
      const units = masonry(C, 195, 95, 5,
        () => { const v = 132 + (rand() - 0.5) * 16; return `rgb(${v + 3 | 0},${v + 1 | 0},${v - 3 | 0})`; },
        () => 124 + (rand() * 8 | 0), 0.8);
      // coarse aggregate
      pores(C, Math.round((cssW * floorY) / 45), 1.6, 0.65, 0, 0, cssW, floorY);
      for (const u of units) {
        for (let i = 0; i < 90; i++) {
          const v = rand();
          g.fillStyle = v < 0.5 ? 'rgba(60,56,50,0.3)' : 'rgba(210,205,196,0.3)';
          const s = (0.8 + rand() * 1.8) * dpr;
          g.fillRect((u.x + rand() * u.w) * dpr, (u.y + rand() * u.h) * dpr, s, s);
        }
      }
      toneOverlay(C, 360, 0.28);
      streaks(C, [0], '52,48,42', 34, 420, 0.1);
      grime(C, 70, 0.28);
      C.grain = 34;
    },
  };

  TYPES.stucco = {
    name: 'Stucwerk',
    build(C) {
      const { g, r, rand, dpr, Wd, floorD, cssW, cssH } = C;
      g.fillStyle = '#d9d3c6'; g.fillRect(0, 0, Wd, floorD);
      toneOverlay(C, 340, 0.22);
      streaks(C, [0], '90,80,68', 22, 520, 0.12);
      grime(C, 160, 0.34);

      // knock-down texture: raised flattened blobs, lit from the top
      const k = 1, hw = Math.ceil(cssW / k) + 2, hh = Math.ceil(cssH / k) + 2;
      const hgt = new Float32Array(hw * hh);
      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < hw; x++) {
          const X = x * k, Y = y * k;
          const b = fbm(C.nB, X / 9, Y / 9, 3);
          const t = Math.min(1, Math.max(0, (b - 0.47) / 0.08));
          hgt[y * hw + x] = t * t * (3 - 2 * t) + C.nC(X / 2.2, Y / 2.2) * 0.22;
        }
      }
      const small = canvas(hw, hh), sg = small.getContext('2d');
      const img = sg.createImageData(hw, hh), d = img.data;
      for (let y = 1; y < hh - 1; y++) {
        for (let x = 1; x < hw - 1; x++) {
          const i = y * hw + x;
          const v = 128 + (hgt[i - hw] - hgt[i + hw]) * 95 + (hgt[i - 1] - hgt[i + 1]) * 35;
          const o = i * 4;
          d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
        }
      }
      sg.putImageData(img, 0, 0);
      r.imageSmoothingEnabled = true;
      r.drawImage(small, 0, 0, hw * k * dpr, hh * k * dpr);

      // hairline cracks
      const cracks = 2 + ((rand() * 3) | 0);
      for (let n = 0; n < cracks; n++) {
        let x = rand() * cssW, y = rand() * C.floorY * 0.8, a = Math.PI / 2 + (rand() - 0.5) * 1.5;
        const len = 120 + rand() * 380;
        const pts = [[x, y]];
        for (let s = 0; s < len; s += 3) {
          a += (rand() - 0.5) * 0.5;
          x += Math.cos(a) * 3; y += Math.sin(a) * 3;
          pts.push([x, y]);
        }
        const stroke = (ctx, color, w, dy) => {
          ctx.strokeStyle = color; ctx.lineWidth = w * dpr; ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * dpr, (py + dy) * dpr) : ctx.moveTo(px * dpr, (py + dy) * dpr)));
          ctx.stroke();
        };
        stroke(r, 'rgba(210,210,210,0.6)', 1, 1);
        stroke(r, 'rgba(40,40,40,0.85)', 0.9, 0);
        stroke(g, 'rgba(80,70,60,0.25)', 3, 0);
      }
      C.grain = 14;
    },
  };

  TYPES.shutter = {
    name: 'Rolluik',
    build(C) {
      const { g, r, rand, dpr, Wd, floorD, cssW, floorY } = C;
      const slat = 19;
      g.fillStyle = '#74827f'; g.fillRect(0, 0, Wd, floorD);
      // each slat slightly different after years of sun
      for (let y = floorY - 14; y > -slat; y -= slat) {
        g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${rand() * 0.06})` : `rgba(255,255,255,${rand() * 0.06})`;
        g.fillRect(0, (y - slat) * dpr, Wd, slat * dpr);
      }
      toneOverlay(C, 260, 0.25);
      // rust blooms + rust runs
      lowRes(C, g, 3, (X, Y, p) => {
        const n = fbm(C.nC, X / 110, Y / 70, 5) + (fbm(C.nD, X / 14, Y / 14, 3) - 0.5) * 0.22;
        const t = Math.max(0, Math.min(1, (n - 0.6) / 0.16));
        const m = fbm(C.nB, X / 25, Y / 25, 2);
        p[0] = 112 + m * 30; p[1] = 60 + m * 14; p[2] = 32; p[3] = t * t * 150;
      });
      streaks(C, [0], '110,58,28', 60, 300, 0.14);
      grime(C, 80, 0.35);

      // corrugated slat profile, one row at a time
      const H = floorD, prof = (t) => {
        if (t < 0.07) return 60;
        if (t < 0.18) return 60 + (t - 0.07) / 0.11 * 125;
        if (t < 0.55) return 185 - (t - 0.18) / 0.37 * 50;
        if (t < 0.88) return 135 - (t - 0.55) / 0.33 * 45;
        return 90 - (t - 0.88) / 0.12 * 25;
      };
      const base = floorY - 14;
      for (let y = 0; y < H; y++) {
        const cy = y / dpr;
        let v;
        if (cy > base) v = cy < base + 2 ? 180 : 110;
        else v = prof(((base - cy) % slat + slat) % slat / slat * -1 + 1);
        r.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
        r.fillRect(0, y, Wd, 1);
      }
      // bottom rail
      g.fillStyle = '#4b5250'; g.fillRect(0, base * dpr, Wd, 14 * dpr);
      // dents and dings
      for (let i = 0; i < cssW / 120; i++) {
        const x = rand() * cssW * dpr, y = rand() * base * dpr, R = (8 + rand() * 30) * dpr;
        const dg = r.createRadialGradient(x, y - R * 0.3, 0, x, y, R);
        dg.addColorStop(0, 'rgba(60,60,60,0.35)');
        dg.addColorStop(0.6, 'rgba(200,200,200,0.15)');
        dg.addColorStop(1, 'rgba(128,128,128,0)');
        r.fillStyle = dg;
        r.beginPath(); r.ellipse(x, y, R * 1.4, R, 0, 0, Math.PI * 2); r.fill();
      }
      // rough rust in the relief
      pores(C, Math.round((cssW * floorY) / 900), 1.2, 0.5, 0, 0, cssW, floorY);
      C.grain = 10;
    },
  };

  S.WALL_TYPES = Object.keys(TYPES).map((id) => ({ id, name: TYPES[id].name }));

  // ------------------------------------------------------------ shared passes

  function drawGround(C) {
    const { g, rand, dpr, Wd, Hd, floorD, cssW, cssH, floorY } = C;
    if (floorD >= Hd) return;
    const gr = g.createLinearGradient(0, floorD, 0, Hd);
    gr.addColorStop(0, '#46443f');
    gr.addColorStop(0.18, '#57544f');
    gr.addColorStop(1, '#6c6963');
    g.fillStyle = gr;
    g.fillRect(0, floorD, Wd, Hd - floorD);
    const ao = g.createLinearGradient(0, floorD - 46 * dpr, 0, floorD);
    ao.addColorStop(0, 'rgba(0,0,0,0)');
    ao.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = ao;
    g.fillRect(0, floorD - 46 * dpr, Wd, 46 * dpr);
    g.fillStyle = 'rgba(20,18,16,0.55)';
    g.fillRect(0, floorD, Wd, Math.max(1, dpr));
    const jy = floorD + (Hd - floorD) * 0.78;
    g.fillStyle = 'rgba(25,23,20,0.35)';
    g.fillRect(0, jy, Wd, 1.5 * dpr);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, jy + 1.5 * dpr, Wd, dpr);
    for (let i = 0; i < (cssW * (cssH - floorY)) / 40; i++) {
      const x = rand() * Wd, y = floorD + rand() * (Hd - floorD);
      g.fillStyle = rand() < 0.5 ? `rgba(20,18,16,${0.1 + rand() * 0.25})` : `rgba(200,196,188,${0.05 + rand() * 0.15})`;
      const s = (0.6 + rand() * 1.4) * dpr;
      g.fillRect(x, y, s, s);
    }
  }

  function grainPass(C, amp, seed) {
    const { r, Wd, Hd } = C;
    const img = r.getImageData(0, 0, Wd, Hd), d = img.data;
    let s = (seed * 2654435761) >>> 0 || 1;
    for (let i = 0; i < d.length; i += 4) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      let v = d[i] + ((s & 1023) / 1023 - 0.5) * amp;
      if (((s >>> 12) & 1023) < 3) v += (s >>> 22) & 1 ? 38 : -44;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    r.putImageData(img, 0, 0);
  }

  function lighting(C) {
    const { r, Wd, Hd } = C;
    const lg = r.createLinearGradient(0, 0, Wd, Hd);
    lg.addColorStop(0, 'rgba(255,255,255,0.09)');
    lg.addColorStop(0.5, 'rgba(128,128,128,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.1)');
    r.fillStyle = lg;
    r.fillRect(0, 0, Wd, Hd);
    const vg = r.createRadialGradient(Wd * 0.45, Hd * 0.4, Math.min(Wd, Hd) * 0.3, Wd * 0.5, Hd * 0.5, Math.max(Wd, Hd) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    r.fillStyle = vg;
    r.fillRect(0, 0, Wd, Hd);
  }

  S.generateWall = function (wallCnv, reliefCnv, Wd, Hd, dpr, floorY, seed, type) {
    seed = seed || 1337;
    const rand = mulberry32(seed);
    wallCnv.width = Wd; wallCnv.height = Hd;
    reliefCnv.width = Wd; reliefCnv.height = Hd;
    const C = {
      g: wallCnv.getContext('2d'), r: reliefCnv.getContext('2d'),
      Wd, Hd, dpr, cssW: Wd / dpr, cssH: Hd / dpr, floorY, floorD: Math.round(floorY * dpr),
      rand, nA: makeNoise(rand), nB: makeNoise(rand), nC: makeNoise(rand), nD: makeNoise(rand),
      grain: 20,
    };
    C.r.fillStyle = 'rgb(128,128,128)';
    C.r.fillRect(0, 0, Wd, Hd);
    (TYPES[type] || TYPES.concrete).build(C);
    // ground is shared by every wall
    if (C.floorD < Hd) {
      C.r.fillStyle = 'rgb(128,128,128)';
      C.r.fillRect(0, C.floorD, Wd, Hd - C.floorD);
    }
    drawGround(C);
    grainPass(C, C.grain, seed);
    lighting(C);
  };

  // Small preview of a wall type, relief already blended in.
  S.wallThumb = function (type, w, h, seed) {
    const scale = 0.28;
    const a = canvas(w, h), b = canvas(w, h);
    S.generateWall(a, b, w, h, scale, h / scale + 10, seed, type);
    const g = a.getContext('2d');
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.85;
    g.drawImage(b, 0, 0);
    return a;
  };
})();
