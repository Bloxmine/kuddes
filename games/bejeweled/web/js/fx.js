// Particles and one-off effects. Coordinates are board-local pixels (1920x1200 design space).
import { rand, TAU, lerp, clamp, ease, GEM_COLORS, GEM_GLOWS } from './util.js';

export class Particle {
  constructor(o) {
    this.sprite = o.sprite; // Sprite
    this.frame = o.frame || 0;
    this.fps = o.fps || 0; // animate through frames
    this.loopFrames = o.loopFrames ?? false;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.ax = o.ax || 0; this.ay = o.ay || 0;
    this.drag = o.drag || 0;
    this.rot = o.rot || 0; this.vrot = o.vrot || 0;
    this.scale = o.scale ?? 1; this.scaleEnd = o.scaleEnd ?? this.scale;
    this.alpha = o.alpha ?? 1;
    this.life = o.life || 1; this.t = -(o.delay || 0);
    this.fadeIn = o.fadeIn || 0; this.fadeOut = o.fadeOut ?? 0.4; // fraction of life
    this.blend = o.blend || 'source-over';
    this.scaleEase = o.scaleEase || ease.linear;
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0) return true;
    const d = Math.pow(1 - this.drag, dt * 60);
    this.vx = (this.vx + this.ax * dt) * d;
    this.vy = (this.vy + this.ay * dt) * d;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vrot * dt;
    return this.t < this.life;
  }
  draw(ctx) {
    if (this.t < 0) return;
    const k = this.t / this.life;
    let a = this.alpha;
    if (this.fadeIn && k < this.fadeIn) a *= k / this.fadeIn;
    if (this.fadeOut && k > 1 - this.fadeOut) a *= (1 - k) / this.fadeOut;
    if (a <= 0.003) return;
    const s = lerp(this.scale, this.scaleEnd, this.scaleEase(k));
    let f = this.frame;
    if (this.fps) {
      f += this.t * this.fps;
      if (!this.loopFrames) f = Math.min(f, this.sprite.frames - 1);
    }
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = this.blend;
    this.sprite.drawC(ctx, f, this.x, this.y, s, this.rot);
  }
}

// Generic effect with custom draw(ctx, t, k)
class Effect {
  constructor(life, draw, delay = 0, layer = 'over') {
    this.life = life; this.t = -delay; this.drawFn = draw; this.layer = layer;
  }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(ctx) {
    if (this.t < 0) return;
    ctx.save();
    this.drawFn(ctx, this.t, clamp(this.t / this.life, 0, 1));
    ctx.restore();
  }
}

export class FX {
  constructor(assets, fonts) {
    this.A = assets;
    this.fonts = fonts;
    this.under = []; // drawn below gems
    this.over = [];  // drawn above gems
    this.top = [];   // drawn above UI (compliments)
    this.shakeAmt = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.quality = 1;
  }

  s(name) { return this.A.s(name); }

  add(p, layer = 'over') { this[layer].push(p); return p; }
  effect(life, draw, delay = 0, layer = 'over') { return this.add(new Effect(life, draw, delay), layer); }

  shake(amount) { this.shakeAmt = Math.max(this.shakeAmt, amount); }

  update(dt) {
    for (const L of [this.under, this.over, this.top]) {
      let j = 0;
      for (let i = 0; i < L.length; i++) if (L[i].update(dt)) L[j++] = L[i];
      L.length = j;
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 60 * Math.max(1, this.shakeAmt * 0.12));
    this.shakeX = (Math.random() * 2 - 1) * this.shakeAmt;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeAmt;
  }

  draw(ctx, layer) {
    const L = this[layer];
    if (!L.length) return;
    ctx.save();
    for (const p of L) p.draw(ctx);
    ctx.restore();
  }

  clear() { this.under.length = this.over.length = this.top.length = 0; }

  // ------------------------------------------------------------ emitters

  sparkles(x, y, n = 6, spread = 50, color) {
    const sp = this.s('sparkle');
    for (let i = 0; i < n * this.quality; i++) {
      const a = rand(TAU), v = rand(30, 200);
      this.add(new Particle({
        sprite: sp, x: x + rand(-spread, spread) * 0.5, y: y + rand(-spread, spread) * 0.5,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, drag: 0.04, ay: 60,
        fps: rand(18, 30), life: rand(0.45, 0.8), scale: rand(0.8, 1.6), blend: 'lighter', fadeOut: 0.2,
        delay: rand(0, 0.1),
      }));
    }
  }

  // Normal gem destruction: shards + sparkles + soft flash
  gemShatter(x, y, color, power = 1) {
    const shard = this.A.tintedSprite('gemshard', GEM_COLORS[color] || '#fff');
    const n = Math.round((5 + power * 3) * this.quality);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), v = rand(150, 420) * power;
      this.add(new Particle({
        sprite: shard, frame: rand(40), fps: rand(30, 70), loopFrames: true,
        x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(150, 350), ay: 1500, drag: 0.01,
        life: rand(0.6, 1.0), scale: rand(0.9, 1.6), scaleEnd: 0.5, fadeOut: 0.3,
      }));
    }
    const small = this.A.tintedSprite('smshards', GEM_GLOWS[color] || '#fff');
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), v = rand(80, 300) * power;
      this.add(new Particle({
        sprite: small, frame: rand(8), x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, ay: 900, drag: 0.02,
        life: rand(0.5, 0.9), scale: rand(1, 2), vrot: rand(-10, 10), blend: 'lighter',
      }));
    }
    this.sparkles(x, y, 4, 60);
    const glow = this.A.tintedSprite('p_basicblur', GEM_GLOWS[color] || '#fff');
    this.add(new Particle({ sprite: glow, x, y, life: 0.35, scale: 1.2, scaleEnd: 2.2, alpha: 0.8, blend: 'lighter', fadeOut: 0.8 }), 'under');
  }

  ring(x, y, color = '#ffffff', from = 0.3, to = 2.5, life = 0.5, sprite = 'p_ring', layer = 'over', delay = 0) {
    const sp = color === '#ffffff' ? this.s(sprite) : this.A.tintedSprite(sprite, color);
    this.add(new Particle({ sprite: sp, x, y, life, scale: from, scaleEnd: to, blend: 'lighter', fadeOut: 0.7, scaleEase: ease.outCubic, delay }), layer);
  }

  flash(x, y, size = 2, life = 0.3, color = '#ffffff', alpha = 1) {
    const sp = color === '#ffffff' ? this.s('p_basicblur') : this.A.tintedSprite('p_basicblur', color);
    this.add(new Particle({ sprite: sp, x, y, life, scale: size, scaleEnd: size * 1.3, alpha, blend: 'lighter', fadeOut: 0.9 }));
  }

  // Special gem creation burst
  specialCreated(x, y, color, type) {
    const c = GEM_GLOWS[color] || '#ffffff';
    this.ring(x, y, c, 0.2, 2.4, 0.6, 'p_ring1');
    this.ring(x, y, '#ffffff', 0.1, 1.6, 0.45, 'p_ring');
    this.flash(x, y, 2.2, 0.4, c);
    const star = this.s('p_sharpstar');
    for (let i = 0; i < 10 * this.quality; i++) {
      const a = (i / 10) * TAU, v = rand(250, 450);
      this.add(new Particle({ sprite: star, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.08,
        life: rand(0.4, 0.7), scale: rand(0.25, 0.5), scaleEnd: 0, blend: 'lighter', vrot: rand(-6, 6) }));
    }
    if (type === 'flame') this.fireBurst(x, y, 10, 0.6);
  }

  fireBurst(x, y, n = 30, power = 1) {
    const fire = this.s('fireparticle');
    for (let i = 0; i < n * this.quality; i++) {
      const a = rand(TAU), v = rand(80, 500) * power;
      this.add(new Particle({
        sprite: fire, frame: 0, fps: rand(50, 80), x: x + rand(-20, 20), y: y + rand(-20, 20),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: -200, drag: 0.06,
        life: rand(0.5, 1.0), scale: rand(2.2, 4), scaleEnd: rand(1, 2), blend: 'lighter', fadeOut: 0.5,
      }));
    }
  }

  // ambient flame on a flame gem
  flameLick(x, y) {
    const fire = this.s('fireparticle');
    this.add(new Particle({
      sprite: fire, fps: rand(40, 60), x: x + rand(-40, 40), y: y + rand(-10, 35),
      vx: rand(-15, 15), vy: rand(-90, -40), life: rand(0.5, 0.8), scale: rand(1.4, 2.4), scaleEnd: 0.8,
      blend: 'lighter', alpha: 0.85, fadeIn: 0.15,
    }));
  }

  flameExplosion(x, y) {
    this.ring(x, y, '#ffffff', 0.4, 3.2, 0.55, 'flameexplode', 'over');
    this.ring(x, y, '#ffaa40', 0.3, 4.2, 0.7, 'p_ring1', 'over');
    this.flash(x, y, 4.5, 0.4, '#ffb040');
    this.flash(x, y, 2.5, 0.25, '#ffffff');
    this.add(new Particle({ sprite: this.s('flameblur'), x, y, life: 0.45, scale: 1.2, scaleEnd: 2.6, blend: 'lighter', fadeOut: 0.8 }));
    this.fireBurst(x, y, 36, 1.1);
    const smoke = this.s('smoke');
    for (let i = 0; i < 8 * this.quality; i++) {
      const a = rand(TAU), v = rand(40, 160);
      this.add(new Particle({ sprite: smoke, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, drag: 0.03,
        life: rand(0.8, 1.4), scale: rand(0.6, 1), scaleEnd: rand(1.8, 2.6), alpha: 0.35, vrot: rand(-1, 1), delay: 0.08 }), 'under');
    }
    this.sparkles(x, y, 10, 140);
    this.shake(14);
  }

  // jagged lightning bolt between two points; lasts `life` seconds, re-jitters every frame
  lightning(x1, y1, x2, y2, color = '#a0d0ff', life = 0.35, width = 1, delay = 0) {
    const segs = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 40));
    const tex = this.A.tintedSprite('lightning', color);
    return this.effect(life, (ctx, t, k) => {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const a = (1 - ease.inQuad(k));
      ctx.globalCompositeOperation = 'lighter';
      // textured bolt strip
      ctx.save();
      ctx.translate(x1, y1);
      ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      ctx.globalAlpha = a;
      const fw = tex.fw, fh = tex.fh, wpx = 110 * width;
      for (let d = 0; d < len; d += fh * 0.9) {
        const f = (Math.random() * tex.frames) | 0;
        tex.draw(ctx, f, -wpx / 2, d, wpx, Math.min(fh, len - d + 10));
      }
      ctx.restore();
      // procedural core
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (let i = 1; i < segs; i++) {
          const f = i / segs, j = (Math.random() * 2 - 1) * 22 * width;
          ctx.lineTo(x1 + dx * f + nx * j, y1 + dy * f + ny * j);
        }
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = pass ? '#ffffff' : color;
        ctx.globalAlpha = a * (pass ? 0.9 : 0.6);
        ctx.lineWidth = (pass ? 3 : 12) * width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }, delay);
  }

  // straight beam across the board for star / supernova gems
  beam(x, y, horizontal, length, color, width = 1, life = 0.6, intensity = 1) {
    const flare = this.s('hyperflareline');
    const glow = this.A.tintedSprite('p_basicblur', color);
    this.effect(life, (ctx, t, k) => {
      const a = (k < 0.15 ? k / 0.15 : 1 - ease.inQuad((k - 0.15) / 0.85)) * intensity;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      if (!horizontal) ctx.rotate(Math.PI / 2);
      const th = 60 * width * (1 + 0.3 * Math.sin(t * 60));
      ctx.drawImage(glow.img, -length, -th, length * 2, th * 2);
      ctx.drawImage(flare.img, -length, -flare.fh * width * 1.6, length * 2, flare.fh * width * 3.2);
      ctx.drawImage(flare.img, -length, -flare.fh * width * 0.6, length * 2, flare.fh * width * 1.2);
    });
    const ex = horizontal ? length : 0, ey = horizontal ? 0 : length;
    for (let i = 0; i < (intensity < 1 ? 1 : 2); i++) {
      this.lightning(x - ex, y - ey, x + ex, y + ey, color, life * 0.8, 0.8 * width);
    }
    this.flash(x, y, 3 * width, 0.4, color, intensity);
    this.add(new Particle({ sprite: this.s('lightningcenter'), x, y, life: 0.5, scale: 4 * width, scaleEnd: 6 * width, blend: 'lighter' }));
  }

  // floating score text
  scorePopup(x, y, text, color = '#ffffff', size = 60, delay = 0) {
    const font = this.fonts.score || this.fonts.main;
    this.add(new Effect(1.4, (ctx, t, k) => {
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const s = k < 0.12 ? ease.outBack(k / 0.12) : 1;
      font.draw(ctx, text, x, y - ease.outCubic(k) * 80, {
        size: size * s, align: 'center', valign: 'middle', alpha: a,
        colors: { MAIN: '#ffffff', GLOW: color, OUTLINE: shade(color) },
      });
    }, delay), 'top');
  }

  // big centred text (LEVEL COMPLETE etc.)
  bigText(x, y, text, opts = {}) {
    const font = opts.font || this.fonts.big;
    const life = opts.life || 2.2, size = opts.size || 110;
    this.effect(life, (ctx, t, k) => {
      let s = 1, a = 1;
      if (t < 0.35) s = ease.outBack(t / 0.35);
      if (k > 0.8) a = 1 - (k - 0.8) / 0.2;
      font.draw(ctx, text, x, y, { size: size * s, align: 'center', valign: 'middle', alpha: a, colors: opts.colors });
    }, opts.delay || 0, 'top');
  }

  compliment(x, y, spriteName, delay = 0) {
    const sp = this.s(spriteName);
    if (!sp) return;
    this.effect(1.6, (ctx, t, k) => {
      let s, a = 1;
      if (t < 0.25) s = lerp(0.3, 1.08, ease.outCubic(t / 0.25));
      else if (t < 0.4) s = lerp(1.08, 1, (t - 0.25) / 0.15);
      else s = 1 + (t - 0.4) * 0.05;
      if (k > 0.75) a = 1 - (k - 0.75) / 0.25;
      ctx.globalAlpha = a;
      sp.drawC(ctx, 0, x, y, s * 0.8);
      if (t < 0.3) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - t / 0.3) * 0.8;
        sp.drawC(ctx, 0, x, y, s * 0.8);
      }
    }, delay, 'top');
  }
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.25, g = ((n >> 8) & 255) * 0.25, b = (n & 255) * 0.25;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
