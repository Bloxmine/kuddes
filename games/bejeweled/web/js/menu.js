// Title screen (Play / Options / Records), mode select tree, and the About & Acknowledgements page.
import { Button, Slider, Dialog } from './ui.js';
import { rand, TAU, ease, clamp, formatNumber, store } from './util.js';
import { BaseMode } from './mode.js';
import { ClassicScene } from './classic.js';
import { ZenScene } from './zen.js';
import { LightningScene } from './lightning.js';
import { ButterfliesScene } from './butterflies.js';
import { DiamondMineScene } from './diamondmine.js';
import { IceStormScene } from './icestorm.js';
import { PokerScene } from './poker.js';
import { BADGES } from './badges.js';
import { HOSTED, tell } from './host.js';

export const MODES = [
  { id: 'classic', label: 'Classic', scene: ClassicScene },
  { id: 'zen', label: 'Zen', scene: ZenScene },
  { id: 'lightning', label: 'Lightning', scene: LightningScene },
  { id: 'butterflies', label: 'Butterflies', scene: ButterfliesScene },
  { id: 'mine', label: 'Diamond Mine', scene: DiamondMineScene },
  { id: 'icestorm', label: 'Ice Storm', scene: IceStormScene },
  { id: 'poker', label: 'Poker', scene: PokerScene },
];
const modeById = (id) => MODES.find((m) => m.id === id);

const LABEL = { MAIN: '#ffffff', OUTLINE: '#6a1040', GLOW: '#ff9ad8' };

// ------------------------------------------------------------ crystal orb button
class Orb {
  constructor(app, label, x, y, scale, onClick, opts = {}) {
    Object.assign(this, { app, label, x, y, scale, onClick });
    this.enabled = opts.enabled ?? true;
    this.sub = opts.sub || '';
    this.size = opts.size || 64;
    this.hover = false;
    this.down = false;
    this.h = 0;
    this.frame = rand(40);
    this.phase = rand(TAU);
  }
  get r() { return 140 * this.scale; }
  contains(px, py) { return Math.hypot(px - this.x, py - this.y) < this.r; }
  pointerMove(px, py) {
    const h = this.enabled && this.contains(px, py);
    if (h && !this.hover) this.app.audio.play('button_mouseover', { volume: 0.5 });
    this.hover = h;
  }
  pointerDown(px, py) {
    if (this.enabled && this.contains(px, py)) { this.down = true; this.app.audio.play('button_press', { volume: 0.7 }); return true; }
    return false;
  }
  pointerUp(px, py) {
    const was = this.down;
    this.down = false;
    if (was && this.contains(px, py)) { this.app.audio.play('button_release', { volume: 0.6 }); this.onClick && this.onClick(); return true; }
    return false;
  }
  update(dt) {
    this.h = clamp(this.h + (this.hover ? dt : -dt) * 5, 0, 1);
    this.frame += dt * (8 + 22 * this.h); // the crystal turns faster when hovered
  }
  draw(ctx, t) {
    const A = this.app.A;
    const bob = Math.sin(t * 1.3 + this.phase) * 6 * this.scale;
    const s = this.scale * (1 + 0.05 * this.h) * (this.down ? 0.96 : 1);
    const y = this.y + bob;
    const dim = this.enabled ? 1 : 0.55;
    ctx.save();
    ctx.globalAlpha *= 0.55 * dim;
    A.s('crystalball_shadow').drawC(ctx, 0, this.x, this.y + 18 * this.scale, s * 0.75);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= dim * (0.35 + 0.45 * this.h + 0.1 * Math.sin(t * 2 + this.phase));
    A.s('crystalball_glow').drawC(ctx, 0, this.x, y, s * 1.25);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= dim;
    A.s('crystalball').drawC(ctx, this.frame, this.x, y, s);
    // occasional sparkle on the facets
    ctx.globalCompositeOperation = 'lighter';
    const sp = (t * 0.7 + this.phase) % 3;
    if (sp < 0.6) { ctx.globalAlpha *= Math.sin(sp / 0.6 * Math.PI); A.s('sparkle').drawC(ctx, sp / 0.6 * 13, this.x - 50 * s, y - 60 * s, 1.4 * s); }
    ctx.restore();
    const f = this.app.fonts.ui;
    ctx.save();
    if (!this.enabled) ctx.globalAlpha *= 0.7;
    const size = this.size * (1 + 0.04 * this.h);
    let fs = size;
    const w = f.measure(this.label, size);
    if (w > this.r * 2.2) fs *= (this.r * 2.2) / w;
    f.draw(ctx, this.label, this.x, y, { size: fs, align: 'center', valign: 'middle', colors: LABEL });
    if (this.sub) this.app.fonts.small.draw(ctx, this.sub, this.x, y + Math.max(fs * 0.8, this.r * 0.62), { size: Math.max(20, 26 * this.scale), align: 'center', colors: { MAIN: '#fff4fc', OUTLINE: '#4a0a30' } });
    ctx.restore();
  }
}

// plain pink text button (BACK / QUIT on the mode select screen)
class TextButton extends Button {
  draw(ctx) {
    const s = 1 + 0.06 * this.anim;
    this.app.fonts.ui.draw(ctx, this.label, this.x + this.w / 2, this.y + this.h / 2, {
      size: this.size * s, align: 'center', valign: 'middle', colors: { MAIN: this.hover ? '#ffffff' : '#ffd0ec', OUTLINE: '#6a1040', GLOW: this.hover ? '#ff60c0' : null },
    });
  }
}

// image button with a hover frame (the title screen's HELP / QUIT)
class SpriteButton extends Button {
  constructor(app, sprite, onClick) {
    const sp = app.A.s(sprite);
    super(app, '', sp.x, sp.y, sp.fw, sp.fh, onClick);
    this.sprite = sp;
  }
  draw(ctx) { this.sprite.draw(ctx, this.hover ? 1 : 0, this.x, this.y); }
}

function quitGame(app) {
  app.audio.stopMusic(0.5);
  // on Kuddes: back to the games
  if (HOSTED) { app.scene && app.scene.save && app.scene.save(); tell('quit'); return; }
  // a web page can't close a tab it didn't open; fall back to the start screen
  window.close();
  app.started = false;
}

// ------------------------------------------------------------ shared scene plumbing
class MenuBase {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.widgets = [];
    this.dialog = null;
    this.leaving = 0;
    this.stars = [];
  }
  onResize() { this.build(); }
  get L() { return this.app.layout; }
  get wide() { return this.L.w > this.L.h; }

  go(makeScene) {
    if (this.leaving) return;
    this.next = makeScene;
    this.leaving = 0.001;
  }

  update(dt) {
    this.t += dt;
    for (const w of this.widgets) w.update(dt);
    if (this.dialog) {
      this.dialog.update(dt);
      if (this.dialog.done) { const cb = this.dialog.onClosed; this.dialog = null; cb && cb(); }
    }
    if (this.leaving) {
      this.leaving += dt;
      if (this.leaving > 0.45) this.app.setScene(this.next());
    }
    if (Math.random() < dt * 6) this.stars.push({ x: rand(this.L.w), y: rand(this.L.h * 0.45), t: 0, life: rand(0.8, 1.6), s: rand(0.5, 1.3) });
    this.stars = this.stars.filter((s) => (s.t += dt) < s.life);
  }

  get fade() { return this.leaving ? Math.max(0, 1 - this.leaving / 0.45) : Math.min(1, this.t / 0.5); }

  drawStars(ctx) {
    const A = this.app.A;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.stars) {
      const k = s.t / s.life;
      ctx.globalAlpha = this.fade * Math.sin(k * Math.PI);
      A.s('sparkle').drawC(ctx, k * 13, s.x, s.y, s.s);
    }
    ctx.restore();
  }

  drawWidgets(ctx) {
    ctx.save();
    ctx.globalAlpha = this.fade;
    for (const w of this.widgets) w.draw(ctx, this.app.time);
    ctx.restore();
    if (this.dialog) this.dialog.draw(ctx);
  }

  pointerDown(x, y) { if (this.dialog) return this.dialog.pointerDown(x, y); if (this.leaving) return; for (const w of this.widgets) if (w.pointerDown(x, y)) return; }
  pointerMove(x, y) { if (this.dialog) return this.dialog.pointerMove(x, y); for (const w of this.widgets) w.pointerMove(x, y); }
  pointerUp(x, y) { if (this.dialog) return this.dialog.pointerUp(x, y); for (const w of this.widgets) w.pointerUp(x, y); }
  keyDown(e) { if (e.key === 'Escape' && this.dialog) this.dialog.close(); }

  // dialog with a text body (Help / Records); array lines are [label, value] rows
  textDialog(title, lines, w = 1100) {
    const L = this.L;
    w = Math.min(w, L.w - 60);
    const h = Math.min(L.h - 60, 300 + lines.length * 50);
    const d = new Dialog(this.app, title, (L.w - w) / 2, (L.h - h) / 2, w, h);
    d.body = (ctx) => {
      let y = 160;
      for (const ln of lines) {
        if (Array.isArray(ln)) {
          this.app.fonts.text.draw(ctx, ln[0], 90, y, { size: 36, colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
          this.app.fonts.ui.draw(ctx, ln[1], w - 90, y, { size: 38, align: 'right', colors: { MAIN: '#ffffff', OUTLINE: '#5a1a40', GLOW: null } });
        } else {
          let size = 32;
          const tw = this.app.fonts.text.measure(ln, size);
          if (tw > w - 140) size *= (w - 140) / tw;
          this.app.fonts.text.draw(ctx, ln, w / 2, y, { size, align: 'center', colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
        }
        y += 50;
      }
    };
    d.add(new Button(this.app, 'OK', w / 2 - 140, h - 130, 280, 90, () => d.close()));
    this.dialog = d;
  }
}

// ------------------------------------------------------------ title screen
export class MenuScene extends MenuBase {
  enter() {
    this.app.setBackground(this.app.A.manifest.menuBackground, 1.0);
    this.app.audio.playMusic('menu', 1.5);
    this.build();
  }

  // landscape follows the original 1920x1200 layout; portrait squeezes it into the narrow screen
  pos(x, y) {
    if (this.wide) return [x + (this.L.w - 1920) / 2, y];
    return [this.L.w / 2 + (x - 960) * (this.L.w / 1920) * 1.2, 120 + y * (this.L.h / 1300)];
  }

  build() {
    const app = this.app;
    const [px, py] = this.pos(960, 640), [ox, oy] = this.pos(330, 690), [rx, ry] = this.pos(1590, 690), [ax, ay] = this.pos(960, 1060);
    const k = this.wide ? 1 : 0.8;
    this.widgets = [
      new Orb(app, 'PLAY', px, py, 1.2 * k, () => this.go(() => new ModeSelectScene(app)), { size: 84 }),
      new Orb(app, 'OPTIONS', ox, oy, 0.62 * k, () => this.options(), { size: 44 }),
      new Orb(app, 'RECORDS', rx, ry, 0.62 * k, () => this.go(() => new RecordsScene(app)), { size: 44 }),
      new Orb(app, 'ABOUT', ax, ay, 0.42 * k, () => this.go(() => new AboutScene(app)), { size: 32 }),
    ];
    const help = new SpriteButton(app, 'mm_help', () => this.help());
    const quit = new SpriteButton(app, 'mm_quit', () => quitGame(app));
    if (this.wide) { help.x += (this.L.w - 1920) / 2; quit.x += (this.L.w - 1920) / 2; }
    else {
      help.x = 30; help.y = this.L.h - help.h - 20;
      quit.x = this.L.w - quit.w - 30; quit.y = this.L.h - quit.h - 20;
    }
    this.widgets.push(help, quit);
  }

  options() {
    const L = this.L, a = this.app.audio;
    const w = Math.min(760, L.w - 60), h = 640;
    const d = new Dialog(this.app, 'Options', (L.w - w) / 2, (L.h - h) / 2, w, h);
    d.add(new Slider(this.app, 'Music', 110, 210, w - 220, a.musicVolume, (v) => a.setMusicVolume(v)));
    d.add(new Slider(this.app, 'Sound', 110, 330, w - 220, a.sfxVolume, (v) => { a.setSfxVolume(v); a.play('select', { volume: 0.7, minGap: 0.15 }); }));
    d.add(new Button(this.app, 'Fullscreen', 100, 400, w - 200, 90, () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    }, { size: 40 }));
    d.add(new Button(this.app, 'Done', w / 2 - 140, h - 130, 280, 90, () => d.close()));
    this.dialog = d;
  }

  records() {
    this.textDialog('Records', MODES.map((m) => {
      const b = store(m.id + 'Best');
      return [m.label, b && b.score ? formatNumber(b.score) : '-'];
    }), 860);
  }

  help() {
    this.textDialog('How to Play', [
      'Swap two neighbouring gems to line up three or more of a colour.',
      'Match 4 for a Flame Gem, an L or T shape for a Star Gem,',
      '5 in a row for a Hypercube and 6 or more for a Supernova.',
      'Swap a Hypercube with any gem to clear every gem of that colour.',
      'Use the HINT orb if you get stuck.  F = fullscreen, Esc = pause.',
    ]);
  }

  draw(ctx, dt) {
    const app = this.app, L = this.L, A = app.A;
    app.drawMotes(ctx, dt);
    this.drawStars(ctx);
    ctx.save();
    ctx.globalAlpha = this.fade;
    // stone pillars and arches along the bottom of the title screen
    const fg = A.s('mm_foreground');
    const fs = this.wide ? 1 : L.w / 1500;
    // rest the pillars on the bottom of the visible screen (tall windows show more than the layout)
    const bottom = this.wide ? L.h : Math.max(L.h, (app.canvas.height - app.offY) / app.scale);
    ctx.drawImage(fg.img, (L.w - fg.fw * fs) / 2, bottom - fg.fh * fs, fg.fw * fs, fg.fh * fs);
    const logo = A.s('mm_logo');
    const ls = Math.min(1, (L.w - 80) / logo.fw) * (1 + 0.012 * Math.sin(this.t * 1.5));
    const drop = this.t < 0.8 ? (1 - ease.outBack(this.t / 0.8)) * -400 : 0;
    const lx = L.w / 2, ly = (this.wide ? logo.y + logo.fh / 2 : 220) + drop;
    logo.drawC(ctx, 0, lx, ly, ls);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.fade * 0.3 * Math.max(0, Math.sin(this.t * 0.8));
    logo.drawC(ctx, 0, lx, ly, ls);
    ctx.restore();
    this.drawWidgets(ctx);
  }

  keyDown(e) {
    if (this.dialog) return super.keyDown(e);
    if (e.key === 'Enter') this.go(() => new ModeSelectScene(this.app));
  }
}

// ------------------------------------------------------------ mode select tree
export class ModeSelectScene extends MenuBase {
  enter() {
    this.app.setBackground('Overworld', 0.8);
    this.app.audio.playMusic('menu', 1.5);
    this.build();
  }

  // orb spots on the twin tree, in the original 1920x1200 layout
  build() {
    const app = this.app, L = this.L;
    const map = (x, y) => (this.wide ? [x + (L.w - 1920) / 2, y] : [L.w / 2 + (x - 960) * (L.w / 1250), 140 + y * (L.h / 1300)]);
    const info = (id) => {
      if (BaseMode.savedGame(id)) return 'in progress';
      const b = store(id + 'Best');
      return b && b.score ? 'best ' + formatNumber(b.score) : '';
    };
    const spots = [
      ['classic', 460, 250, 1], ['zen', 1460, 250, 1], ['lightning', 460, 908, 1], ['quest', 1460, 908, 1],
      ['poker', 712, 422, 0.55], ['butterflies', 1208, 422, 0.55], ['icestorm', 712, 717, 0.55], ['mine', 1208, 717, 0.55],
    ];
    const k = this.wide ? 1 : 0.85;
    this.widgets = spots.map(([id, x, y, s]) => {
      const m = modeById(id);
      const [px, py] = map(x, y);
      const label = m ? m.label.toUpperCase() : id.toUpperCase();
      return new Orb(app, label, px, py, s * k, m ? () => this.play(m) : null, {
        size: s > 0.8 ? 66 : 34, enabled: !!m, sub: m ? info(id) : 'coming soon',
      });
    });
    const back = new TextButton(app, 'BACK', 0, 0, 240, 90, () => this.go(() => new MenuScene(app)), { size: 56 });
    const quit = new TextButton(app, 'QUIT', 0, 0, 240, 90, () => quitGame(app), { size: 56 });
    [back.x, back.y] = map(140, 1100);
    [quit.x, quit.y] = map(1540, 1100);
    if (!this.wide) { back.x = 30; back.y = L.h - 110; quit.x = L.w - 270; quit.y = L.h - 110; }
    this.widgets.push(back, quit);
  }

  // a saved game asks Continue / New Game first
  play(mode, choice) {
    if (this.leaving || this.dialog) return;
    const saved = BaseMode.savedGame(mode.id);
    if (saved && !choice) return this.askContinue(mode, saved);
    if (choice === 'new') store('save_' + mode.id, null);
    const resume = choice === 'continue' ? saved : null;
    this.app.audio.play('menuspin', { volume: 0.8 });
    this.app.audio.stopMusic(0.5);
    this.go(() => { const sc = new mode.scene(this.app); sc.resume = resume; return sc; });
  }

  askContinue(mode, saved) {
    const L = this.L;
    const w = Math.min(760, L.w - 80), h = 470;
    const d = new Dialog(this.app, mode.label, (L.w - w) / 2, (L.h - h) / 2, w, h);
    d.body = (ctx) => {
      this.app.fonts.text.draw(ctx, 'You have a game in progress', w / 2, 160, { size: 38, align: 'center', colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
      this.app.fonts.ui.draw(ctx, 'Score ' + formatNumber(saved.score), w / 2, 220, { size: 42, align: 'center', colors: { MAIN: '#ffffff', OUTLINE: '#5a1a40', GLOW: null } });
    };
    const bw = (w - 200) / 2;
    d.add(new Button(this.app, 'Continue', 80, h - 150, bw, 100, () => d.close(() => this.play(mode, 'continue'))));
    d.add(new Button(this.app, 'New Game', w - 80 - bw, h - 150, bw, 100, () => d.close(() => this.play(mode, 'new'))));
    this.dialog = d;
  }

  draw(ctx, dt) {
    this.app.drawMotes(ctx, dt);
    this.drawStars(ctx);
    this.drawWidgets(ctx);
  }

  keyDown(e) {
    if (this.dialog) return super.keyDown(e);
    if (e.key === 'Escape' || e.key === 'Backspace') this.go(() => new MenuScene(this.app));
  }

  // index of playable modes (used by the automated tests)
  get buttons() { return MODES.map((m) => ({ onClick: () => this.play(m) })); }
}

// ------------------------------------------------------------ about & acknowledgements
const ABOUT = [
  ['h', 'About'],
  ['p', 'An HTML5 remake of Bejeweled 3 that runs in your browser.'],
  ['p', 'The game code is a fresh implementation; all artwork, sound, music'],
  ['p', 'and fonts are loaded from your own installed copy of Bejeweled 3.'],
  ['s'],
  ['h', 'Original Game'],
  ['p', 'Bejeweled 3 was created by PopCap Games.'],
  ['p', 'Bejeweled and PopCap are trademarks of Electronic Arts Inc.'],
  ['p', 'Please support the original - this remake needs your own copy to run.'],
  ['s'],
  ['h', 'Acknowledgements'],
  ['p', 'QuickBMS by Luigi Auriemma - unpacking main.pak'],
  ['p', 'libopenmpt / OpenMPT - rendering the MO3 music module'],
  ['p', 'OpenJPEG - decoding the JPEG 2000 artwork'],
  ['p', 'Pillow, ImageMagick and FFmpeg - converting images and audio'],
  ['p', 'The PopCap modding community for documenting the PAK and PopAnim formats'],
  ['p', 'Playwright and Chromium - automated play testing'],
  ['s'],
  ['h', 'HTML5 Port'],
  ['p', 'Engine, game modes and tools written with Claude (Anthropic).'],
  ['p', 'Not affiliated with or endorsed by PopCap Games or Electronic Arts.'],
];

export class AboutScene extends MenuBase {
  enter() {
    this.app.setBackground(this.app.A.manifest.menuBackground, 0.8);
    this.scroll = 0;
    this.contentH = 0;
    this.build();
  }
  build() {
    const L = this.L;
    this.widgets = [new Button(this.app, 'Back', L.w / 2 - 160, L.h - 140, 320, 100, () => this.go(() => new MenuScene(this.app)), { size: 46 })];
  }
  update(dt) {
    super.update(dt);
    // slow scroll when the credits are taller than the panel
    const view = this.L.h - 230 - 160;
    if (this.contentH > view) this.scroll = Math.min(this.contentH - view, Math.max(0, (this.t - 3) * 30));
  }
  draw(ctx, dt) {
    const app = this.app, L = this.L;
    app.drawMotes(ctx, dt);
    this.drawStars(ctx);
    ctx.save();
    ctx.globalAlpha = this.fade;
    const w = Math.min(1500, L.w - 60), h = L.h - 230, x = (L.w - w) / 2, y = 50;
    app.A.s('dlg_headerless').drawPanel(ctx, x, y, w, h, 140);
    ctx.beginPath();
    ctx.rect(x + 40, y + 60, w - 80, h - 120);
    ctx.clip();
    let cy = y + 120 - this.scroll;
    for (const [kind, text] of ABOUT) {
      if (kind === 'h') {
        app.fonts.ui.draw(ctx, text, L.w / 2, cy, { size: 52, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a1040', GLOW: '#ff70d0' } });
        cy += 70;
      } else if (kind === 'p') {
        let size = 34;
        const tw = app.fonts.text.measure(text, size);
        if (tw > w - 140) size *= (w - 140) / tw;
        app.fonts.text.draw(ctx, text, L.w / 2, cy, { size, align: 'center', valign: 'middle', colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
        cy += 48;
      } else cy += 26;
    }
    this.contentH = cy + this.scroll - (y + 120);
    ctx.restore();
    this.drawWidgets(ctx);
  }
  keyDown(e) { if (e.key === 'Escape') this.go(() => new MenuScene(this.app)); }
}

// ------------------------------------------------------------ records: high scores + badges
export class RecordsScene extends MenuBase {
  enter() {
    this.app.setBackground(this.app.A.manifest.menuBackground, 0.8);
    this.hoverBadge = null;
    this.build();
  }
  build() {
    const L = this.L;
    this.widgets = [new Button(this.app, 'Back', L.w / 2 - 160, L.h - 130, 320, 96, () => this.go(() => new MenuScene(this.app)), { size: 46 })];
    // badge grid cells (5 x 4), right panel in landscape, lower panel in portrait
    const cols = 5, cell = this.wide ? 160 : Math.min(150, (L.w - 120) / cols);
    // centred inside the badges panel (drawn in draw() with the same geometry)
    const pw = this.wide ? L.w / 2 - 80 : L.w - 60, px = this.wide ? L.w / 2 + 40 : 30;
    const py = this.wide ? 50 : 700, ph = this.wide ? L.h - 220 : 4 * cell + 200;
    const gx = px + (pw - cols * cell) / 2;
    const gy = py + 140 + (ph - 160 - 4 * cell) / 2;
    this.cells = BADGES.map((b, i) => ({ b, x: gx + (i % cols) * cell + cell / 2, y: gy + Math.floor(i / cols) * cell + cell / 2, r: cell * 0.45 }));
    this.cell = cell;
  }
  pointerMove(x, y) {
    super.pointerMove(x, y);
    const c = this.cells.find((c) => Math.hypot(x - c.x, y - c.y) < c.r);
    if (c && c !== this.hoverBadge) this.app.audio.play('tooltip', { volume: 0.4 });
    this.hoverBadge = c || null;
  }
  pointerDown(x, y) {
    super.pointerDown(x, y);
    this.pointerMove(x, y); // touch: tap a badge to read it
  }
  draw(ctx, dt) {
    const app = this.app, L = this.L, F = app.fonts, B = app.badges;
    app.drawMotes(ctx, dt);
    this.drawStars(ctx);
    ctx.save();
    ctx.globalAlpha = this.fade;
    const panel = app.A.s('dlg_headerless');
    // high scores
    const sw = this.wide ? L.w / 2 - 80 : L.w - 60, sx = this.wide ? 40 : 30, sh = this.wide ? L.h - 220 : 640;
    panel.drawPanel(ctx, sx, 50, sw, sh, 140);
    F.ui.draw(ctx, 'High Scores', sx + sw / 2, 130, { size: 56, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a1040', GLOW: '#ff70d0' } });
    MODES.forEach((m, i) => {
      const y = 230 + i * 70;
      const best = store(m.id + 'Best');
      F.text.draw(ctx, m.label, sx + 90, y, { size: 38, valign: 'middle', colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
      F.ui.draw(ctx, best && best.score ? formatNumber(best.score) : '-', sx + sw - 90, y, { size: 40, align: 'right', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a1a40', GLOW: null } });
    });
    // badges
    const bw = this.wide ? L.w / 2 - 80 : L.w - 60, bx = this.wide ? L.w / 2 + 40 : 30, by = this.wide ? 50 : 700, bh = this.wide ? L.h - 220 : 4 * this.cell + 200;
    panel.drawPanel(ctx, bx - (this.wide ? 0 : 0), by, bw, bh, 140);
    const earned = BADGES.filter((b) => B.get(b.id).level).length;
    F.ui.draw(ctx, 'Badges  ' + earned + '/' + BADGES.length, bx + bw / 2, by + 80, { size: 56, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a1040', GLOW: '#ff70d0' } });
    for (const c of this.cells) {
      const lvl = B.get(c.b.id).level;
      const hov = this.hoverBadge === c;
      ctx.save();
      if (c.b.unavailable) ctx.globalAlpha *= 0.5;
      B.drawSmall(ctx, c.b, B.tier(c.b, lvl), c.x, c.y, (this.cell / 200) * (hov ? 1.08 : 1));
      ctx.restore();
    }
    // tooltip for the hovered badge
    const h = this.hoverBadge;
    if (h) {
      const lvl = B.get(h.b.id).level;
      const title = (lvl ? B.tierName(h.b, lvl) + ' ' : '') + h.b.name;
      const desc = B.describe(h.b);
      const tw = Math.max(F.ui.measure(title, 40), F.text.measure(desc, 30)) + 60;
      const tx = clamp(h.x - tw / 2, 10, L.w - tw - 10), ty = h.y + h.r + 10;
      app.A.s('tooltip').drawPanel(ctx, tx, ty, tw, 120, 30);
      F.ui.draw(ctx, title, tx + tw / 2, ty + 40, { size: 40, align: 'center', valign: 'middle', colors: { MAIN: B.tierColor(h.b, lvl), OUTLINE: '#3a0838', GLOW: null } });
      F.text.draw(ctx, desc, tx + tw / 2, ty + 85, { size: 30, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#3a0838', GLOW: null } });
    }
    ctx.restore();
    this.drawWidgets(ctx);
  }
  keyDown(e) { if (e.key === 'Escape') this.go(() => new MenuScene(this.app)); }
}
