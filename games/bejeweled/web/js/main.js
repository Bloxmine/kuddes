import { Assets } from './assets.js';
import { AudioSys } from './audio.js';
import { BitmapFont } from './font.js';
import { FX } from './fx.js';
import { rand, clamp, ease, TAU, store } from './util.js';
import { MenuScene } from './menu.js';
import { PamAnim } from './pam.js';
import { Badges, BADGES } from './badges.js';
import { initHost } from './host.js';

const SFX_PRELOAD = [
  'select', 'badmove', 'start_rotate', 'gem_hit', 'gem_shatters', 'combo_1', 'combo_2', 'combo_3', 'combo_4',
  'combo_5', 'combo_6', 'combo_7', 'doubleset', 'powergem_created', 'lasergem_created', 'hypercube_create',
  'bomb_explode', 'small_explode', 'electro_explode', 'electro_path', 'electro_path2', 'hyperspace', 'preblast',
  'voice_good', 'voice_excellent', 'voice_awesome', 'voice_spectacular', 'voice_extraordinary', 'voice_unbelievable',
  'voice_levelcomplete', 'voice_nomoremoves', 'voice_gameover', 'voice_go', 'voice_welcometobejeweled',
  'voice_welcomeback', 'voice_getready',
  'background_change', 'button_mouseover', 'button_press', 'button_release', 'backtomain', 'menuspin',
  'tooltip', 'rank_countup', 'rankup', 'clickflyin', 'multiplier_up2_1', 'flamebonus',
];

// Logical layouts. Everything is authored in the original 1920x1200 space.
const LAYOUTS = {
  landscape: { w: 1920, h: 1200, board: [679, 81], score: [260, 122], level: [261, 733] },
  portrait: { w: 1200, h: 1660, board: [88, 81], score: [150, 1222], level: [770, 1192] },
};

class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.A = new Assets();
    this.audio = new AudioSys();
    this.fonts = {};
    this.scene = null;
    this.time = 0;
    this.bg = { cur: null, prev: null, t: 1, dur: 1 };
    this.motes = [];
    this.loadProgress = 0;
    this.loaded = false;
    this.started = false;
    this.error = null;
    this.layout = LAYOUTS.landscape;
    this.frameTimes = [];
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.audio.suspend(document.hidden);
      if (document.hidden && this.scene && this.scene.save) this.scene.save();
    });
    window.addEventListener('beforeunload', () => this.scene && this.scene.save && this.scene.save());
    this.bindInput();
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  async boot() {
    try {
      // On Kuddes: whose game it is, with their badges and bests (before anything reads the saves)
      await initHost(BADGES.filter((b) => !b.unavailable).map((b) => b.id));
      this.audio.musicVolume = store('musicVolume') ?? 0.7;
      this.audio.sfxVolume = store('sfxVolume') ?? 0.8;
      await this.A.loadManifest();
      this.audio.manifestMusic = this.A.manifest.music;
      await this.A.loadAll((p) => (this.loadProgress = p * 0.85));
      this.pams = {};
      const names = this.A.manifest.pams || [];
      let n = 0;
      await Promise.all(names.map(async (k) => { this.pams[k] = await PamAnim.load(k); this.loadProgress = 0.85 + 0.15 * (++n / names.length); }));
      const F = (n) => new BitmapFont(this.A.fonts[n], this.A);
      this.fonts = {
        score: F('flaregothicbold80score'),
        big: F('flaregothicbold100'),
        ui: F('flaregothicbold42'),
        small: F('flaregothic25'),
        text: F('flaregothic32'),
        button: F('flaregothicboldbutton66'),
        level: F('flarebold120sidebar'),
      };
      // fallback for glyphs missing from display fonts
      for (const k of ['score', 'big', 'button', 'level']) this.fonts[k].fallback = this.fonts.ui;
      this.fx = new FX(this.A, this.fonts);
      this.badges = new Badges(this);
      this.loaded = true;
      this.setBackground(this.A.manifest.menuBackground, 0);
    } catch (e) {
      console.error(e);
      this.error = e.message;
    }
  }

  // ------------------------------------------------------------ layout / scaling
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this.layout = w / h < 0.95 ? LAYOUTS.portrait : LAYOUTS.landscape;
    const L = this.layout;
    this.scale = Math.min(this.canvas.width / L.w, this.canvas.height / L.h);
    this.offX = (this.canvas.width - L.w * this.scale) / 2;
    this.offY = (this.canvas.height - L.h * this.scale) / 2;
    if (this.scene && this.scene.onResize) this.scene.onResize();
  }

  toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * this.dpr, y = (e.clientY - r.top) * this.dpr;
    return [(x - this.offX) / this.scale, (y - this.offY) / this.scale];
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.audio.unlock();
      if (!this.started && this.loaded) { this.start(); return; }
      const [x, y] = this.toLogical(e);
      this.scene && this.scene.pointerDown && this.scene.pointerDown(x, y, e);
    });
    c.addEventListener('pointermove', (e) => {
      const [x, y] = this.toLogical(e);
      this.scene && this.scene.pointerMove && this.scene.pointerMove(x, y, e);
    });
    const up = (e) => {
      const [x, y] = this.toLogical(e);
      this.scene && this.scene.pointerUp && this.scene.pointerUp(x, y, e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
        return;
      }
      this.audio.unlock();
      if (!this.started && this.loaded && (e.key === 'Enter' || e.key === ' ')) { this.start(); return; }
      this.scene && this.scene.keyDown && this.scene.keyDown(e);
    });
  }

  start() {
    this.started = true;
    this.audio.unlock();
    this.audio.preload(SFX_PRELOAD);
    const returning = store('played');
    store('played', true);
    this.audio.play(returning ? 'voice_welcomeback' : 'voice_welcometobejeweled', { volume: 1, delay: 0.3 });
    this.setScene(new MenuScene(this));
  }

  setScene(s) {
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = s;
    this.fx && this.fx.clear();
    s.enter && s.enter();
  }

  // ------------------------------------------------------------ backgrounds
  setBackground(name, fade = 1.5) {
    const img = this.A.backgrounds[name];
    if (!img || this.bg.cur?.img === img) return;
    this.bg.prev = this.bg.cur;
    this.bg.cur = { img, t0: this.time, seed: rand(TAU) };
    this.bg.t = 0;
    this.bg.dur = fade;
  }

  drawBgImage(ctx, b, alpha) {
    if (!b || alpha <= 0) return;
    const cw = this.canvas.width, ch = this.canvas.height;
    const img = b.img;
    // cover the whole window, with a slow drift so the scene feels alive
    const t = this.time - b.t0;
    const zoom = 1.06 + 0.03 * Math.sin(t * 0.05 + b.seed);
    const s = Math.max(cw / img.width, ch / img.height) * zoom;
    const w = img.width * s, h = img.height * s;
    const dx = Math.sin(t * 0.031 + b.seed) * (w - cw) * 0.35;
    const dy = Math.cos(t * 0.023 + b.seed) * (h - ch) * 0.35;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (cw - w) / 2 + dx, (ch - h) / 2 + dy, w, h);
    ctx.globalAlpha = 1;
  }

  drawBackground(ctx, dt) {
    const B = this.bg;
    B.t = Math.min(1, B.t + dt / Math.max(0.001, B.dur));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (B.prev && B.t < 1) this.drawBgImage(ctx, B.prev, 1);
    this.drawBgImage(ctx, B.cur, B.prev ? ease.inOutQuad(B.t) : 1);
    if (B.t >= 1) B.prev = null;
  }

  // floating light motes over the background
  drawMotes(ctx, dt) {
    if (!this.loaded) return;
    const L = this.layout;
    while (this.motes.length < 40) {
      this.motes.push({ x: rand(-100, L.w + 100), y: rand(-50, L.h + 100), vx: rand(-8, 8), vy: rand(-30, -8), s: rand(0.15, 0.5), a: rand(0.15, 0.5), ph: rand(TAU) });
    }
    const sp = this.A.s('p_basicblur');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.time * 0.7 + m.ph) * 10) * dt;
      m.y += m.vy * dt;
      if (m.y < -80) { m.y = L.h + 60; m.x = rand(-100, L.w + 100); }
      ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(this.time * 2 + m.ph));
      sp.drawC(ctx, 0, m.x, m.y, m.s);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ main loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = clamp((now - (this.last || now)) / 1000, 0, 1 / 20);
    this.last = now;
    this.time += dt;
    this.adaptQuality(dt);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingQuality = 'high';
    this.drawBackground(ctx, dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);

    if (!this.started) { this.drawLoading(ctx); return; }
    if (this.scene) {
      // the badge award popup pauses play while it shows
      if (!this.badges.showing || !this.scene.board) this.scene.update(dt);
      this.scene.draw(ctx, dt);
    }
    this.badges.update(dt);
    this.badges.draw(ctx);
  }

  adaptQuality(dt) {
    if (!this.fx) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 60) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 1 / 40) this.fx.quality = Math.max(0.4, this.fx.quality - 0.15);
      else if (avg < 1 / 58) this.fx.quality = Math.min(1, this.fx.quality + 0.05);
    }
  }

  drawLoading(ctx) {
    const L = this.layout;
    const cx = L.w / 2, cy = L.h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, L.w, L.h);
    if (this.error) {
      ctx.fillStyle = '#fff';
      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Error: ' + this.error, cx, cy);
      return;
    }
    if (this.loaded) {
      const logo = this.A.s('logo');
      logo.drawC(ctx, 0, cx, cy - 180, Math.min(1, (L.w - 100) / logo.fw));
      const a = 0.6 + 0.4 * Math.sin(this.time * 4);
      this.fonts.ui.draw(ctx, 'Click to play', cx, cy + 160, { size: 64, align: 'center', valign: 'middle', alpha: a, colors: { GLOW: '#ff60ff', OUTLINE: '#300030' } });
      this.fonts.small.draw(ctx, 'F - toggle fullscreen', cx, L.h - 50, { size: 28, align: 'center', alpha: 0.7, colors: { OUTLINE: '#000' } });
      return;
    }
    const w = Math.min(800, L.w - 200), h = 26;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, '#ff40c0');
    g.addColorStop(1, '#ffd040');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w / 2, cy - h / 2, w * this.loadProgress, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading… ' + Math.round(this.loadProgress * 100) + '%', cx, cy - 40);
  }
}

const app = new App(document.getElementById('game'));
window.app = app;
app.boot();
