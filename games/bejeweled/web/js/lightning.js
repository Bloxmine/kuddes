// Lightning mode: 60 second rounds. Time gems bank extra seconds for the next round,
// and each new round raises the score multiplier. Out of time with nothing banked = game over.
import { BaseMode } from './mode.js';
import { CELL, COLS, ROWS } from './board.js';
import { clamp, rand, formatNumber, ease } from './util.js';

const ROUND_TIME = 60;

export class LightningScene extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'lightning';
    this.title = 'Lightning';
    this.music = 'speed';
    this.loseMusic = 'classic_lose';
    this.hasLevels = false;
    this.autoHint = 0;
    this.scoreBadge = 'highvoltage';
    this.ui = app.pams && app.pams.lightningui;
    this.uiBottom = app.pams && app.pams.lightninguibottom;
    this.uiT = 0;
  }

  // the lightning top bar sits above the board, so the board moves down
  get boardShift() { return [0, 49]; }
  get uiOff() { const [bx, by] = this.boardPos; return [bx - 679, by - 130]; }
  get pamUI() { return this.ui && this.wide; }
  uiSprite(anim) {
    if (this.mult <= 1) return 'unpowered';
    const n = 'pulse' + Math.min(5, this.mult - 1);
    return anim.has(n) ? n : 'unpowered';
  }

  drawGlows(ctx, ox, oy) { if (!this.pamUI) super.drawGlows(ctx, ox, oy); }

  resetMode() {
    this.timeLeft = ROUND_TIME;
    this.roundTime = ROUND_TIME;
    this.bank = 0;
    this.mult = 1;
    this.timeUp = false;
    this.warned30 = false;
    this.lastTick = 99;
    this.collected = 0;
    this.displayBank = 0;
    this.roundStartScore = 0;
  }

  get pointsMultiplier() { return this.mult; }
  currentBg() { return this.bgFor(this.mult); }
  saveExtra() { return { timeLeft: this.timeLeft, roundTime: this.roundTime, bank: this.bank, mult: this.mult, collected: this.collected }; }
  loadExtra(e) { Object.assign(this, e); this.displayBank = this.bank; }
  get glowColor() { return '#70b0ff'; }
  orbText() { return ['x' + this.mult, 'MULTIPLIER']; }
  noMoves() { this.reshuffle(); }

  // ------------------------------------------------------------ time gems
  spawnGem(g) {
    if (this.phase !== 'play' || this.timeUp) return;
    const live = this.board.gems.filter((n) => n.time && !n.dying).length;
    if (live >= 3) return;
    const r = Math.random();
    if (r < 0.012) g.time = 10;
    else if (r < 0.055) g.time = 5;
    if (g.time) this.audio.play('timebonus_appears_' + g.time, { volume: 0.6, minGap: 0.3, delay: 0.3 });
  }

  onGemDestroyed(g) {
    if (!g.time) return;
    const t = g.time;
    g.time = 0;
    this.bank += t;
    this.collected += t;
    this.audio.play('timebonus_' + t, { volume: 0.9 });
    const x = this.board.px(g), y = this.board.py(g);
    this.fx.ring(x, y, '#80c0ff', 0.3, 2.6, 0.5, 'p_ring1');
    const sp = this.A.s('timenum' + Math.max(0, g.color));
    this.fx.effect(1.0, (ctx, tt, k) => {
      ctx.globalAlpha = 1 - ease.inQuad(k);
      sp.drawC(ctx, t === 10 ? 1 : 0, x, y - ease.outCubic(k) * 160, 1 + 0.6 * ease.outBack(Math.min(1, k * 3)));
    }, 0, 'top');
  }

  drawGemOverlay(ctx, g, x, y, sx, sy, alpha) {
    if (!g.time) return;
    const pulse = 0.85 + 0.15 * Math.sin(g.anim * 6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.35 * pulse;
    this.A.s('p_basicblur').drawC(ctx, 0, x, y, 1.3 * sx);
    ctx.restore();
    ctx.globalAlpha = alpha;
    this.A.s('timenum' + g.color).drawC(ctx, g.time === 10 ? 1 : 0, x, y, 0.85 * sx * pulse);
  }

  // ------------------------------------------------------------ clock
  updateMode(dt) {
    this.uiT += dt;
    this.displayBank += (this.bank - this.displayBank) * Math.min(1, dt * 8);
    if (this.phase !== 'play' || this.timeUp) return;
    this.timeLeft -= dt;
    if (!this.warned30 && this.timeLeft <= 30 && this.roundTime > 35) { this.warned30 = true; this.audio.play('voice_thirtyseconds', { volume: 0.9 }); }
    const sec = Math.ceil(this.timeLeft);
    if (sec <= 5 && sec < this.lastTick && sec > 0) { this.lastTick = sec; this.audio.play('countdown_warning', { volume: 0.7 }); this.flash.top = 1; }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.timeUp = true;
      this.board.selected = null;
      this.board.hint = null;
      this.pending = null;
      if (this.board.phase === 'idle') this.roundEnd();
    }
  }

  queueSwap(a, b) {
    if (this.timeUp) return;
    super.queueSwap(a, b);
  }

  afterSettle(intro) {
    if (this.timeUp) { this.roundEnd(); return false; }
    return super.afterSettle(intro);
  }

  roundEnd() {
    if (this.phase !== 'play') return;
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    if (this.bank <= 0) {
      this.app.badges.report('finalfrenzy', this.score - this.roundStartScore);
      return this.gameOver('TIME UP', 'voice_timeup');
    }
    this.phase = 'levelup';
    this.audio.play('voice_timeup', { volume: 0.9 });
    this.fx.bigText(cx, cy - 80, 'TIME UP', { size: 110, life: 1.6, colors: { MAIN: '#ffffff', OUTLINE: '#102050', GLOW: '#60a0ff' } });
    this.after(1.4, () => {
      this.mult++;
      this.roundStartScore = this.score;
      this.roundTime = this.timeLeft = this.bank;
      this.bank = 0;
      this.timeUp = false;
      this.warned30 = false;
      this.lastTick = 99;
      this.audio.play('lightning_energize', { volume: 1 });
      this.audio.play('multiplier_up2_' + Math.min(4, this.mult - 1), { volume: 0.9, delay: 0.2 });
      this.fx.bigText(cx, cy, 'x' + this.mult, { size: 200, life: 1.6, colors: { MAIN: '#ffffff', OUTLINE: '#102050', GLOW: '#ffe060' } });
      this.fx.flash(cx, cy, 8, 0.6, '#80c0ff');
      this.flash.top = this.flash.bottom = 1;
      this.app.setBackground(this.bgFor(this.mult), 1.2);
      this.audio.play('background_change', { volume: 0.7 });
    });
    this.after(2.6, () => {
      this.audio.play('voice_go', { volume: 0.9 });
      this.phase = 'play';
      if (!this.board.findMove()) this.reshuffle();
    });
  }

  // ------------------------------------------------------------ ui
  panelWidget() { return 'ui_bottomwidget_lightning'; }
  panelButtons() {
    return [
      { sprite: 'ui_hintbutton_lightning', action: 'hint', hoverFrame: 1, pressFrame: 2 },
      { sprite: 'ui_menubutton_lightning', action: 'menu', hoverFrame: 1, pressFrame: 2 },
      { sprite: 'ui_resetbutton_lightning', action: 'reset', hoverFrame: 1, pressFrame: 2 },
    ];
  }

  barValue() { return clamp(this.timeLeft / Math.max(ROUND_TIME, this.roundTime), 0, 1); }

  fmtClock(t) { const sec = Math.ceil(t); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

  drawBottomFrame(ctx, ox, oy) {
    if (!this.pamUI) {
      const low = this.timeLeft < 10 && !this.timeUp;
      const stops = low && Math.sin(this.app.time * 12) > 0 ? ['#ffd0d0', '#ff4040', '#901010'] : ['#e0f4ff', '#40a0ff', '#1040b0'];
      this.drawFillBar(ctx, ox, oy, this.displayProgress, stops, this.bank > 0 ? 'Next round: +' + Math.round(this.displayBank) + 's' : '');
      this.A.s('ui_bottomframe').drawAt(ctx, ox, oy);
      return;
    }
    const [ux, uy] = this.uiOff;
    this.uiBottom.draw(ctx, this.uiSprite(this.uiBottom), this.uiT, { x: ux, y: uy });
  }

  drawTopFrame(ctx, ox, oy) {
    const low = this.timeLeft < 10;
    if (!this.pamUI) super.drawTopFrame(ctx, ox, oy);
    else {
      const [ux, uy] = this.uiOff;
      this.ui.draw(ctx, this.uiSprite(this.ui), this.uiT, { x: ux, y: uy });
      // the time left fills the top bar
      const bx0 = 690 + ux, by0 = 34 + uy, bw = 900, bh = 74;
      const p = this.displayProgress;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx0, by0, bw * p, bh);
      ctx.clip();
      const g = ctx.createLinearGradient(0, by0, 0, by0 + bh);
      const red = low && !this.timeUp && Math.sin(this.app.time * 12) > 0;
      g.addColorStop(0, red ? '#ffb0a0' : '#fff0a0');
      g.addColorStop(0.5, red ? '#e03020' : '#f0a020');
      g.addColorStop(1, red ? '#801010' : '#a05000');
      ctx.fillStyle = g;
      ctx.fillRect(bx0, by0, bw, bh);
      ctx.globalCompositeOperation = 'lighter';
      const fl = this.A.s('p_basicblur');
      for (let i = 0; i < 22; i++) {
        const fx = bx0 + ((i * 113 + this.uiT * 80 * (1 + (i % 3))) % bw), fy = by0 + bh / 2 + Math.sin(this.uiT * 3 + i) * 16;
        ctx.globalAlpha = 0.3 + 0.25 * Math.sin(this.uiT * 5 + i * 1.7);
        fl.drawC(ctx, 0, fx, fy, 0.45 + 0.3 * ((i * 7) % 5) / 5);
      }
      ctx.restore();
    }
    const sp = this.A.s(low ? 'ui_timer_red_lightning' : this.bank > 0 ? 'ui_timer_gold_lightning' : 'ui_timer_lightning');
    const tl = this.A.s('ui_timer_lightning');
    const dx = this.pamUI ? this.uiOff[0] : ox, dy = this.pamUI ? this.uiOff[1] : oy;
    sp.drawAt(ctx, dx, dy);
    const pulse = low && !this.timeUp ? 1 + 0.08 * Math.abs(Math.sin(this.app.time * 6)) : 1;
    this.fonts.ui.draw(ctx, this.fmtClock(this.timeLeft), tl.x + dx + tl.fw / 2, tl.y + dy + tl.fh / 2, {
      size: 44 * pulse, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#301030', GLOW: low ? '#ff4040' : '#ff80e0' },
    });
  }

  // score / multiplier / banked time on the lightning header (the art itself is part of the UI animation)
  drawScoreWidget(ctx) {
    if (!this.pamUI) return super.drawScoreWidget(ctx);
    const [ux, uy] = this.uiOff;
    this.drawScoreText(ctx, 400 + ux, 192 + uy, 230, 50);
    this.fonts.ui.draw(ctx, 'x' + this.mult, 400 + ux, 295 + uy, { size: 46, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a0a50', GLOW: '#ff60e0' } });
    const bank = '+' + this.fmtClock(this.displayBank);
    this.fonts.ui.draw(ctx, bank, 400 + ux, 395 + uy, { size: 40, align: 'center', valign: 'middle', colors: { MAIN: this.bank > 0 ? '#fff4a0' : '#ffffff', OUTLINE: '#402000', GLOW: this.bank > 0 ? '#ffb000' : null } });
  }

  statRows() {
    const st = this.stats;
    return [
      ['Final Score', formatNumber(this.score)],
      ['Multiplier Reached', 'x' + this.mult],
      ['Time Collected', this.collected + 's'],
      ['Best Move', formatNumber(st.bestMove)],
      ['Longest Cascade', String(st.longestCascade)],
    ];
  }
}
