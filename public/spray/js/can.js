// Spray can sprites, drawn procedurally. Local units are css px with the
// origin at the bottom centre of the can; y goes up as negative.
(function () {
  'use strict';
  const S = (window.Spray = window.Spray || {});
  const C = (S.Can = {});

  const CW = 40;          // can diameter
  const BODY_TOP = -92;   // top of the cylindrical body
  const CAP_TOP = -118;   // top of the cap
  const NOZZLE = -110;    // actuator tip when the cap is off
  const PAD = 8;
  C.W = CW; C.H = -CAP_TOP; C.NOZZLE = NOZZLE; C.BODY_TOP = BODY_TOP;

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(rgb, to, t) {
    return `rgb(${rgb.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',')})`;
  }
  const dark = (rgb, t) => mix(rgb, [0, 0, 0], t);
  const light = (rgb, t) => mix(rgb, [255, 255, 255], t);
  C.hexRgb = hexRgb;

  function cylPath(g, hw, yTop, yBot, ry) {
    g.beginPath();
    g.moveTo(-hw, yTop);
    g.lineTo(-hw, yBot);
    g.ellipse(0, yBot, hw, ry, 0, Math.PI, 0, true);
    g.lineTo(hw, yTop);
    g.ellipse(0, yTop, hw, ry, 0, 0, Math.PI, true);
    g.closePath();
  }

  // shading for a lit cylinder (light from upper left)
  function shade(g, hw, gloss) {
    const gr = g.createLinearGradient(-hw, 0, hw, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.1, 'rgba(0,0,0,0.18)');
    gr.addColorStop(0.24, `rgba(255,255,255,${0.28 * gloss})`);
    gr.addColorStop(0.3, `rgba(255,255,255,${0.5 * gloss})`);
    gr.addColorStop(0.38, `rgba(255,255,255,${0.06 * gloss})`);
    gr.addColorStop(0.62, 'rgba(0,0,0,0)');
    gr.addColorStop(0.86, 'rgba(0,0,0,0.3)');
    gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = gr;
    g.fill();
  }

  function silver(g, hw) {
    g.fillStyle = '#c3c6ca';
    g.fill();
    shade(g, hw, 1.3);
  }

  function seeded(str) {
    let a = 0;
    for (const ch of str) a = (a * 31 + ch.charCodeAt(0)) | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function starPath(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r, a = rot + (i / 10) * Math.PI * 2 - Math.PI / 2;
      if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }

  // Paint the can surface (the current path) in the style of its paint.
  function surface(g, spec, hw, yTop, yBot, isCap) {
    const { rgb, kind, pal } = spec;
    const css = (c) => `rgb(${c})`;
    if (kind === 'metal') {
      const gr = g.createLinearGradient(-hw, 0, hw, 0);
      [[0, 0], [0.16, 1], [0.3, 2], [0.36, 3], [0.46, 1], [0.7, 0], [0.86, 1], [1, 0]]
        .forEach(([t, i]) => gr.addColorStop(t, css(pal[i])));
      g.fillStyle = gr; g.fill();
      return;
    }
    if (kind === 'holo') {
      const gr = g.createLinearGradient(-hw, yTop, hw, yBot);
      ['#ff9ad5', '#9ae6ff', '#fff3a0', '#c3a4ff', '#9affd2', '#ff9ad5'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
      g.fillStyle = gr; g.fill();
      return;
    }
    if (kind === 'pattern' || kind === 'anim' || kind === 'vampire') {
      // sample the very pattern the can sprays
      const res = spec.res, ry = CW * 0.13, top = yTop - ry;
      const w = Math.ceil(hw * 2 * res), h = Math.ceil((yBot - yTop + ry * 2) * res);
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const og = off.getContext('2d'), img = og.createImageData(w, h), d = img.data, out = [0, 0, 0];
      const name = kind === 'vampire' ? 'vampire' : spec.pattern;
      const ofs = spec.name.length * 97;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          S.Paint.pattern(name, ofs + (x / res) * 1.6, 200 + (top + y / res) * 1.6, 0, out);
          const i = (y * w + x) * 4;
          d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
        }
      }
      og.putImageData(img, 0, 0);
      g.save(); g.clip();
      g.drawImage(off, -hw, top, hw * 2, h / res);
      if (kind === 'vampire') {
        // blood running down from the top edge
        const rand = seeded(spec.name + yTop);
        g.fillStyle = '#9a0a18';
        for (let i = 0; i < 6; i++) {
          const x = -hw + rand() * hw * 2, len = 4 + rand() * (yBot - yTop) * 0.35, wd = 1.2 + rand() * 1.8;
          g.fillRect(x - wd / 2, yTop - ry, wd, len + ry);
          g.beginPath(); g.arc(x, yTop + len, wd * 0.9, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
      return;
    }
    if (kind === 'rgb') {
      // black can with RGB light bars; the cap wears the chosen colour
      g.fillStyle = isCap ? css(rgb) : '#141416'; g.fill();
      if (!isCap) {
        g.save(); g.clip();
        ['#ff2a2a', '#2aff5a', '#2a7bff'].forEach((c, i) => {
          const y = yTop + 8 + i * 4;
          g.fillStyle = c; g.fillRect(-hw, y, hw * 2, 2);
          g.fillStyle = css(rgb); g.fillRect(-hw, yBot - 12 + i * 3, hw * 2, 1.2);
        });
        g.restore();
      }
      return;
    }
    if (kind === 'rainbow') {
      const gr = g.createLinearGradient(0, yTop, 0, yBot);
      for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${i * 55},85%,55%)`);
      g.fillStyle = gr; g.fill();
      return;
    }
    g.fillStyle = css(rgb); g.fill();
    if (kind === 'glitter' || kind === 'stars') {
      const rand = seeded(spec.name + yTop);
      g.save(); g.clip();
      const n = kind === 'glitter' ? 260 : 14;
      for (let i = 0; i < n; i++) {
        const c = pal[(rand() * pal.length) | 0];
        const x = (rand() * 2 - 1) * hw, y = yTop + rand() * (yBot - yTop);
        g.fillStyle = css(c);
        if (kind === 'glitter') {
          g.globalAlpha = 0.5 + rand() * 0.5;
          const sz = 0.5 + rand() * 0.9;
          g.fillRect(x, y, sz, sz);
        } else {
          starPath(g, x, y, 1.6 + rand() * 2.4, rand() * 6);
          g.fill();
        }
      }
      g.restore();
    }
  }

  function drawBody(g, spec) {
    const { rgb, name, isDark: isDarkPaint } = spec;
    const special = !!spec.kind;
    const accent = special ? spec.pal[Math.min(1, spec.pal.length - 1)] : rgb;
    const hw = CW / 2, ry = CW * 0.13;
    // bottom rim
    cylPath(g, hw * 0.97, -7, -0.5, ry); silver(g, hw);
    // body
    cylPath(g, hw, BODY_TOP, -6, ry);
    surface(g, spec, hw, BODY_TOP, -6);
    cylPath(g, hw, BODY_TOP, -6, ry);
    g.save(); g.clip();
    // label
    const labelBg = isDarkPaint && !special ? '#e8e5dc' : '#1a1a1c';
    const labelFg = special ? '#f2d58a' : isDarkPaint ? '#1a1a1c' : '#f2f2f2';
    cylPath(g, hw, -74, -28, ry); g.fillStyle = labelBg; g.fill();
    cylPath(g, hw, -36, -33, ry); g.fillStyle = `rgb(${accent})`; g.fill();
    cylPath(g, hw, -71, -69, ry); g.fillStyle = `rgb(${accent})`; g.fill();
    g.fillStyle = labelFg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 8.5px "Arial Black", Impact, sans-serif';
    g.fillText('KROMA', -1, -57);
    g.font = '700 4.6px Verdana, Arial, sans-serif';
    g.fillText(name.toUpperCase(), -1, -47);
    g.globalAlpha = 0.6;
    g.font = '600 3.6px Verdana, Arial, sans-serif';
    g.fillText(special ? '★ SPECIALE FX ★' : '400 ML · ACRYL', -1, -40);
    g.globalAlpha = 1;
    // printed dots on the label edge
    g.restore();
    cylPath(g, hw, BODY_TOP, -6, ry); shade(g, hw, spec.kind === 'metal' ? 0.6 : 1);
    // seam ring at the shoulder
    cylPath(g, hw, BODY_TOP - 2.5, BODY_TOP + 1, ry); silver(g, hw);
  }

  function drawCap(g, spec, yOff) {
    const rgb = spec.rgb;
    const hw = CW / 2 * 0.94, ry = CW * 0.13 * 0.94;
    const top = CAP_TOP + yOff, bot = BODY_TOP + 1 + yOff;
    cylPath(g, hw, top, bot, ry);
    surface(g, spec, hw, top, bot, true);
    cylPath(g, hw, top, bot, ry);
    shade(g, hw, spec.kind === 'metal' ? 0.8 : 1.4);
    // top face
    g.beginPath(); g.ellipse(0, top, hw, ry, 0, 0, Math.PI * 2);
    g.fillStyle = light(rgb, 0.2); g.fill();
    g.beginPath(); g.ellipse(0, top + 0.6, hw * 0.72, ry * 0.7, 0, 0, Math.PI * 2);
    g.fillStyle = dark(rgb, 0.12); g.fill();
    g.beginPath(); g.ellipse(0, top, hw, ry, 0, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.6; g.stroke();
    // small ridge near the bottom
    cylPath(g, hw * 1.01, bot - 3, bot, ry);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
  }

  function drawValve(g, rgb) {
    const hw = CW / 2;
    // dome shoulder
    g.beginPath();
    g.moveTo(-hw, BODY_TOP - 1);
    g.bezierCurveTo(-hw, BODY_TOP - 9, -hw * 0.55, BODY_TOP - 10.5, -hw * 0.34, BODY_TOP - 10.5);
    g.lineTo(hw * 0.34, BODY_TOP - 10.5);
    g.bezierCurveTo(hw * 0.55, BODY_TOP - 10.5, hw, BODY_TOP - 9, hw, BODY_TOP - 1);
    g.ellipse(0, BODY_TOP - 1, hw, CW * 0.13, 0, 0, Math.PI, false);
    g.closePath();
    silver(g, hw);
    // valve cup
    const vy = BODY_TOP - 11;
    g.beginPath(); g.ellipse(0, vy, hw * 0.36, 2.6, 0, 0, Math.PI * 2);
    g.fillStyle = '#a9adb2'; g.fill();
    g.beginPath(); g.ellipse(0, vy - 0.4, hw * 0.28, 1.9, 0, 0, Math.PI * 2);
    g.fillStyle = '#d7dadd'; g.fill();
    // actuator
    const aw = 6.2;
    cylPath(g, aw, NOZZLE, vy, 1.4);
    g.fillStyle = '#f1f0ec'; g.fill();
    shade(g, aw, 0.6);
    g.beginPath(); g.ellipse(0, NOZZLE, aw, 1.4, 0, 0, Math.PI * 2);
    g.fillStyle = '#fbfbf8'; g.fill();
    // finger pad
    g.beginPath(); g.ellipse(0.4, NOZZLE, aw * 0.7, 0.9, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fill();
    // nozzle hole, facing the wall (away from us, so just a hint on top)
    g.beginPath(); g.arc(-3.4, NOZZLE + 3.2, 1.05, 0, Math.PI * 2);
    g.fillStyle = '#222'; g.fill();
    // a smear of paint on the actuator
    g.beginPath(); g.arc(-3.6, NOZZLE + 3.4, 1.7, 0, Math.PI * 2);
    g.fillStyle = `rgba(${rgb},0.55)`; g.fill();
  }

  function sprite(res, w, h, ox, oy, fn) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
    const g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, ox * res, oy * res);
    fn(g);
    return { c, ox, oy, w, h };
  }

  function silhouette(spr) {
    const c = document.createElement('canvas');
    c.width = spr.c.width; c.height = spr.c.height;
    const g = c.getContext('2d');
    g.drawImage(spr.c, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    return { c, ox: spr.ox, oy: spr.oy, w: spr.w, h: spr.h };
  }

  C.build = function (color, res) {
    const rgb = hexRgb(color.hex);
    const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    const spec = {
      rgb, name: color.name, isDark: lum < 60, kind: color.kind,
      pal: color.pal ? color.pal.map(hexRgb) : [rgb],
      pattern: color.pattern, res,
    };
    const mistRgb = color.mist ? hexRgb(color.mist) : rgb;
    const w = CW + PAD * 2, h = -CAP_TOP + PAD * 2, ox = w / 2, oy = -CAP_TOP + PAD;
    const full = sprite(res, w, h, ox, oy, (g) => { drawBody(g, spec); drawCap(g, spec, 0); });
    const open = sprite(res, w, h, ox, oy, (g) => { drawBody(g, spec); drawValve(g, mistRgb); });
    const capH = CAP_TOP - BODY_TOP;
    const cap = sprite(res, w, -capH + PAD * 2, ox, -capH + PAD, (g) => drawCap(g, spec, -(BODY_TOP + 1)));
    const mist = sprite(1, 64, 64, 32, 32, (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 32);
      gr.addColorStop(0, `rgba(${mistRgb},1)`);
      gr.addColorStop(0.5, `rgba(${mistRgb},0.4)`);
      gr.addColorStop(1, `rgba(${mistRgb},0)`);
      g.fillStyle = gr; g.fillRect(-32, -32, 64, 64);
    });
    const paint = {
      kind: color.kind === 'rgb' ? 'solid' : color.kind || 'solid',
      rgb, pal: spec.pal, contrast: color.contrast || 1, pattern: color.pattern, time: 0,
    };
    return { rgb, paint, full, open, cap, mist, shadow: silhouette(open) };
  };

  // draw sprite with origin at can-bottom-centre in the current transform
  C.draw = function (ctx, spr) {
    ctx.drawImage(spr.c, -spr.ox, -spr.oy, spr.w, spr.h);
  };
})();
