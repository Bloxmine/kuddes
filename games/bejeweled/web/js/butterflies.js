// Butterflies mode: butterflies climb one row after every move. Match them to set them free;
// if one is at the top when it has to climb again, it flies into the spider web and the game ends.
import { BaseMode } from './mode.js';
import { CELL, COLS, ROWS } from './board.js';
import { rand, randInt, choice, formatNumber, ease, clamp, lerp, GEM_GLOWS } from './util.js';
import { PamClip } from './pam.js';

export class ButterfliesScene extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'butterflies';
    this.title = 'Butterflies';
    this.music = 'butterflies';
    this.loseMusic = 'butterflies_lose';
    this.hasLevels = false;
    this.scoreBadge = 'monarch';
    this.spider = app.pams && app.pams.spider ? new PamClip(app.pams.spider) : null;
  }

  get boardShift() { return [0, 30]; }

  resetMode() {
    this.sinceSpawn = 0;
    this.freed = 0;
    this.playerMoved = false;
    this.danger = 0;
    this.spiderX = COLS * CELL / 2;
    this.spiderTarget = this.spiderX;
    this.caughtOne = false;
    if (this.spider) this.spider.play('drop');
  }

  get pointsMultiplier() { return 1 + Math.floor(this.freed / 10); }
  saveExtra() { return { freed: this.freed }; }
  loadExtra(e) { this.freed = e.freed || 0; }
  get glowColor() { return '#90ff90'; }

  customizeFill(board) {
    for (const row of board.grid) for (const g of row) g.bfly = false;
    const bottom = board.grid[ROWS - 1].slice();
    for (let i = 0; i < 2; i++) bottom.splice(randInt(0, bottom.length - 1), 1)[0].bfly = true;
  }

  updateMode(dt) {
    if (!this.spider) return;
    this.spider.update(dt);
    if (this.spider.done) this.spider.play('idle', true);
    const dx = this.spiderTarget - this.spiderX;
    this.spiderX += Math.sign(dx) * Math.min(Math.abs(dx), dt * 700); // steady walk, not a jump
    const L = this.spider.label;
    if (Math.abs(dx) > 4 && L === 'idle') this.spider.play('walk', true);
    else if (Math.abs(dx) <= 4 && L === 'walk') this.spider.play('idle', true);
    // the spider walks along the web towards whichever butterfly is closest to the top
    const top = this.butterflies().sort((a, b) => a.row - b.row || Math.abs(this.board.px(a) - this.spiderX) - Math.abs(this.board.px(b) - this.spiderX))[0];
    if (top && !this.caughtOne) this.spiderTarget = this.board.px(top);
  }

  onMoveSettled() {
    if (this.moveFreed) this.app.badges.report('bonanza', this.moveFreed);
    this.moveFreed = 0;
  }

  onMoveStart() {
    super.onMoveStart();
    this.moveFreed = 0;
    this.playerMoved = true;
  }

  noMoves() { this.reshuffle(); }

  butterflies() { return this.board.liveGems().filter((g) => g.bfly); }

  afterSettle(intro) {
    if (intro || !this.playerMoved) return super.afterSettle(intro);
    this.playerMoved = false;
    this.climb();
    return false;
  }

  // every butterfly moves up one cell (swapping with the gem above), then a new one may appear
  climb() {
    const B = this.board;
    const bs = this.butterflies().sort((a, b) => a.row - b.row);
    const top = bs.find((b) => b.row === 0);
    if (top) return this.caught(top);
    const start = new Map();
    for (const g of B.liveGems()) start.set(g, g.row);
    for (const b of bs) {
      const above = B.grid[b.row - 1][b.col];
      B.grid[b.row - 1][b.col] = b;
      B.grid[b.row][b.col] = above;
      above.row = b.row;
      b.row -= 1;
    }
    this.spawnButterfly();
    const moves = [];
    for (const [g, r] of start) if (g.row !== r) moves.push({ g, fx: g.col, fy: r, tx: g.col, ty: g.row });
    if (!moves.length) return B.resolveOrSettle();
    this.audio.play('butterfly_appear', { volume: 0.25, rate: 1.4, minGap: 0.2 });
    B.animate(moves, 0.16, () => B.resolveOrSettle(), ease.outQuad);
  }

  // new butterflies keep hatching on the bottom row after every move
  spawnButterfly() {
    const B = this.board;
    const moves = this.stats.moves;
    this.sinceSpawn = (this.sinceSpawn || 0) + 1;
    const low = this.butterflies().some((g) => g.row >= ROWS - 2);
    const chance = !low || this.sinceSpawn >= 2 ? 1 : clamp(0.6 + moves * 0.004, 0, 0.9);
    if (Math.random() > chance) return;
    const n = moves > 25 && Math.random() < clamp((moves - 25) * 0.01, 0, 0.35) ? 2 : 1;
    const cands = B.grid[ROWS - 1].filter((g) => g && !g.bfly && g.type === 'normal' && !g.dying);
    for (let i = 0; i < n && cands.length; i++) {
      const g = cands.splice((Math.random() * cands.length) | 0, 1)[0];
      g.bfly = true;
      g.born = 1;
      this.sinceSpawn = 0;
      const x = B.px(g), y = B.py(g);
      this.audio.play('butterfly_appear', { volume: 0.8, delay: 0.2 + i * 0.15, minGap: 0.1 });
      this.fx.ring(x, y, GEM_GLOWS[g.color], 0.2, 2.2, 0.6, 'p_ring1');
      this.fx.sparkles(x, y, 8, 60);
    }
  }

  caught(b) {
    const B = this.board;
    this.phase = 'caught';
    B.phase = 'locked';
    const x = B.px(b), y = B.py(b);
    this.spiderTarget = x;
    this.caughtOne = true;
    if (this.spider) this.spider.play('grab');
    this.audio.play('butterfly_death1', { volume: 1 });
    this.fx.flash(x, y - 60, 3, 0.5, '#ffffff');
    this.fx.shake(10);
    // the butterfly is dragged up into the web
    B.grid[b.row][b.col] = null;
    b.dying = { t: 0, dur: 99, kind: 'caught' };
    B.animate([{ g: b, fx: b.col, fy: b.row, tx: b.col, ty: -0.45 }], 0.5, () => {}, ease.inCubic);
    B.phase = 'locked';
    this.after(0.9, () => {
      b.dying = { t: 0, dur: 0.3, kind: 'blast' };
      this.phase = 'play';
      this.gameOver('BUTTERFLY CAUGHT', 'voice_gameover');
    });
  }

  onGemDestroyed(g, opts) {
    if (!g.bfly || this.phase === 'gameover') return;
    g.bfly = false;
    opts.quiet = true;
    this.freed++;
    this.moveFreed = (this.moveFreed || 0) + 1;
    this.addPoints(150 * Math.max(1, this.board.cascade), this.board.px(g), this.board.py(g) - 40, g.color);
    this.audio.play('butterflyescape', { volume: 0.8, minGap: 0.1 });
    this.releaseFx(g);
  }

  // butterfly flutters off the board
  releaseFx(g) {
    const B = this.board;
    let x = B.px(g), y = B.py(g);
    const vx = rand(-160, 160), color = g.color, ph = rand(10);
    const life = 2.2;
    this.fx.sparkles(x, y, 8, 50);
    this.fx.effect(life, (ctx, t, k) => {
      const px = x + vx * t + Math.sin(t * 5 + ph) * 40, py = y - 120 * t - 260 * t * t;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      this.drawButterfly(ctx, color, px, py, 0.9, ph + t * 3, 2.5);
    }, 0, 'top');
  }

  drawButterfly(ctx, color, x, y, scale, t, flapSpeed = 1) {
    const A = this.A;
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.2 * flapSpeed));
    const wings = A.s('bfly_wings');
    const ww = wings.fw * scale;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x, y - 6 * scale);
      ctx.scale(side * flap, 1);
      wings.draw(ctx, color, -ww - 4 * scale, -wings.fh * scale * 0.55, ww, wings.fh * scale);
      ctx.restore();
    }
    A.s('bfly_body').drawC(ctx, color, x, y, scale * 0.85);
  }

  drawGemCustom(ctx, g, x, y, sx, sy, alpha) {
    if (!g.bfly && !(g.dying && g.dying.kind === 'caught')) return false;
    const bob = Math.sin(g.anim * 2.5) * 4;
    ctx.globalAlpha = alpha * 0.45;
    this.A.s('bfly_shadow').drawC(ctx, g.color, x + 8, y + 14, sx * 0.85);
    ctx.globalAlpha = alpha;
    const danger = g.row === 0 ? 0.5 + 0.5 * Math.sin(this.app.time * 10) : 0;
    if (danger) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = danger * 0.6;
      this.A.tintedSprite('p_basicblur', '#ff3030').drawC(ctx, 0, x, y, 1.4); ctx.restore();
    }
    this.drawButterfly(ctx, g.color, x, y + bob, sx, g.anim + g.id);
    if (g.born) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g.born * 0.7;
      this.A.s('bfly_body').drawC(ctx, g.color, x, y + bob, sx * 0.85); ctx.restore();
    }
    return true;
  }

  // spider web stretched across the top of the board
  drawOnBoard(ctx) {
    const web = this.A.s('bfly_web');
    const top = this.butterflies().reduce((m, b) => Math.min(m, b.row), ROWS);
    const warn = top === 0 ? 0.5 + 0.5 * Math.sin(this.app.time * 8) : top === 1 ? 0.25 : 0;
    const w = COLS * CELL + 80, h = web.fh * (w / web.fw);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(web.img, -40, -h * 0.6, w, h);
    if (warn) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = warn * 0.6;
      ctx.drawImage(this.A.tinted(web.img, '#ff4040', 'web'), -40, -h * 0.6, w, h);
    }
    ctx.restore();
    // the spider (from the game's spider animation) hangs on its thread in the web
    if (this.spider) {
      const sc = 0.72;
      this.spider.draw(ctx, this.spiderX - 125 * sc, -470 * sc, sc);
    }
  }

  // ------------------------------------------------------------ ui
  drawGlows(ctx, ox, oy) {
    const A = this.A;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.25 + this.flash.bottom, 0, 1);
    A.tintedSprite('ui_bottomframeglow', this.glowColor).drawAt(ctx, ox, oy);
    ctx.restore();
  }
  drawTopFrame() {} // the web replaces the top frame
  drawBottomFrame(ctx, ox, oy) {
    if (!this.wide) this.drawBar(ctx, ox, oy);
    this.A.s('ui_bottomframe').drawAt(ctx, ox, oy);
  }

  drawScoreWidget(ctx) {
    if (!this.wide) return super.drawScoreWidget(ctx);
    const [sx, sy] = this.scoreOff;
    this.A.s('ui_topwidget_quest').drawC(ctx, 0, 400 + sx, 105 + sy, 1);
    this.drawScoreText(ctx, 400 + sx, 105 + sy, 220, 50);
    // butterfly flower: the bloom shows how many butterflies you've freed
    const fl = this.A.s('bfly_flower'), stem = this.A.s('bfly_stem');
    const fx = 400 + sx - fl.fw / 2, fy = 250 + sy;
    stem.draw(ctx, 0, fx + stem.x, fy + stem.y);
    const sway = Math.sin(this.app.time * 0.9) * 0.02;
    ctx.save();
    ctx.translate(fx + fl.fw / 2, fy + fl.fh);
    ctx.rotate(sway);
    fl.draw(ctx, 0, -fl.fw / 2, -fl.fh);
    ctx.restore();
    const cy = fy + 175;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 + 0.15 * Math.sin(this.app.time * 3);
    this.A.tintedSprite('p_basicblur', '#ff70e0').drawC(ctx, 0, 400 + sx, cy, 1.1); ctx.restore();
    this.fonts.score.draw(ctx, String(this.freed), 400 + sx, cy, { size: 60, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a0a50', GLOW: '#ff60e0' } });
    this.fonts.small.draw(ctx, 'FREED', 400 + sx, cy + 58, { size: 26, align: 'center', colors: { MAIN: '#ffe0f8', OUTLINE: '#3a0030' } });
  }

  barValue() {
    const top = this.butterflies().reduce((m, b) => Math.min(m, b.row), ROWS);
    return top >= ROWS ? 0 : (ROWS - top) / ROWS;
  }
  drawBar(ctx, ox, oy) {
    this.drawFillBar(ctx, ox, oy, this.displayProgress, ['#ffd0a0', '#ff7030', '#a01010'], this.freed + (this.freed === 1 ? ' butterfly' : ' butterflies') + ' freed');
  }
  orbText() { return ['x' + this.pointsMultiplier, 'MULTIPLIER']; }

  panelWidget() { return 'ui_bottomwidget_lightning'; }
  panelButtons() {
    return [
      { sprite: 'ui_hintbutton_lightning', action: 'hint', hoverFrame: 1, pressFrame: 2 },
      { sprite: 'ui_menubutton_lightning', action: 'menu', hoverFrame: 1, pressFrame: 2 },
      { sprite: 'ui_resetbutton_lightning', action: 'reset', hoverFrame: 1, pressFrame: 2 },
    ];
  }

  statRows() {
    const st = this.stats;
    return [
      ['Final Score', formatNumber(this.score)],
      ['Butterflies Freed', String(this.freed)],
      ['Moves', String(st.moves)],
      ['Best Move', formatNumber(st.bestMove)],
      ['Total Time', this.fmtTime(st.time)],
    ];
  }
}
