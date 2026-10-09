// Ice Storm: columns of ice creep up from the bottom of the board. A vertical match inside a column
// shatters it, horizontal matches through it knock it down. Matches also build steam in the meter;
// a full meter vents, pushing all ice down and raising the multiplier. Ice reaching the top = game over.
import { BaseMode } from './mode.js';
import { CELL, COLS, ROWS } from './board.js';
import { rand, randInt, choice, formatNumber, ease, clamp } from './util.js';
import { Particle } from './fx.js';

const UI_X = 130; // the Ice Storm UI animation is 1600 wide; this places its pipes next to the board

export class IceStormScene extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'icestorm';
    this.title = 'Ice Storm';
    this.music = 'icestorm';
    this.loseMusic = 'icestorm_lose';
    this.hasLevels = false;
    const P = app.pams || {};
    this.ui = P.iceui;
    this.fill = P.icefill;
    this.colAnims = [P.icecolumn1, P.icecolumn2].filter(Boolean);
    this.scoreBadge = 'glacial';
  }

  resetMode() {
    this.frozen = false;
    this.cols = [];        // { c, h (cells), anim, born }
    this.meter = 0;
    this.mult = 1;
    this.elapsed = 0;
    this.spawnT = 3;
    this.uiT = 0;
    this.shattered = 0;
    this.warnT = 0;
    this.ventT = 0;
  }

  get pointsMultiplier() { return this.mult; }
  get glowColor() { return '#80e0ff'; }
  orbText() { return ['x' + this.mult, 'MULTIPLIER']; }
  noMoves() { this.reshuffle(); }
  queueSwap(a, b) { if (!this.frozen) super.queueSwap(a, b); }
  currentBg() { const bgs = this.app.A.manifest.iceBackgrounds || this.app.A.manifest.backgrounds; return bgs[(this.mult - 1) % bgs.length]; }
  saveExtra() { return { cols: this.cols.map((c) => ({ c: c.c, h: c.h, anim: c.anim })), meter: this.meter, mult: this.mult, elapsed: this.elapsed, shattered: this.shattered }; }
  loadExtra(e) { Object.assign(this, e); this.cols = (e.cols || []).map((c) => ({ ...c, born: 0 })); }

  colAt(c) { return this.cols.find((k) => k.c === c); }
  // a gem is inside the ice when its row is under the column's top
  inIce(col, row) { return row + 1 > ROWS - col.h + 0.1; } // any overlap with the gem's cell counts

  // ------------------------------------------------------------ ice
  updateMode(dt) {
    this.uiT += dt;
    if (this.ventT > 0) this.ventT -= dt;
    if (this.phase !== 'play') return;
    this.elapsed += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cols.length < COLS) {
      this.spawnT = Math.max(2.2, 7.5 - this.elapsed * 0.035);
      const free = [];
      for (let c = 0; c < COLS; c++) if (!this.colAt(c)) free.push(c);
      const c = choice(free);
      this.cols.push({ c, h: 0, anim: randInt(0, this.colAnims.length - 1), born: 1 });
      this.audio.play('ice_column_appears', { volume: 0.7 });
    }
    const speed = Math.min(0.42, 0.11 + this.elapsed * 0.0016);
    let danger = 0;
    for (const col of this.cols) {
      col.h += speed * dt;
      if (col.born > 0) col.born -= dt * 2;
      danger = Math.max(danger, col.h);
    }
    if (danger > ROWS - 2) {
      this.warnT -= dt;
      if (this.warnT <= 0) { this.warnT = 1.4; this.audio.play('ice_warning', { volume: 0.7 }); this.flash.top = 1; }
    }
    if (danger >= ROWS && !this.frozen) {
      this.frozen = true;
      this.audio.play('ice_storm_gameover', { volume: 1 });
      this.board.selected = null;
      this.pending = null;
      if (this.board.phase === 'idle') { this.frozen = false; this.gameOver('FROZEN', 'voice_gameover'); }
    }
  }

  afterSettle(intro) {
    if (this.frozen) { this.frozen = false; this.gameOver('FROZEN', 'voice_gameover'); return false; }
    return super.afterSettle(intro);
  }

  // Vertical matches shatter the ice in their column (even when made in the rows above it).
  // Horizontal matches never shatter: every column they cross sinks back down by half.
  onGroupMatched(grp) {
    const halved = new Set();
    for (const run of grp.runs) {
      if (run.dir === 'v') {
        const col = this.colAt(run.gems[0].col);
        if (col) this.shatter(col);
      } else {
        for (const g of run.gems) {
          const col = this.colAt(g.col);
          if (col && !halved.has(col)) { halved.add(col); this.halve(col); }
        }
      }
    }
    this.meter += grp.size * 0.03 * (1 + (grp.creates ? 1 : 0));
    if (this.meter >= 1) this.vent();
  }

  // special gem explosions shatter any ice they hit
  onGemDestroyed(g, opts) {
    if (!opts.points) return;
    const col = this.colAt(g.col);
    if (col && this.inIce(col, g.row)) this.shatter(col);
  }

  halve(col) {
    this.knock(col, col.h / 2, true);
  }

  // push a column down (keeps at least a sliver unless allowed to vanish)
  knock(col, amount, keep) {
    col.h = Math.max(keep ? 0.3 : 0, col.h - amount);
    this.iceFx(col, 8);
    this.audio.play('ice_column_break', { volume: 0.6, minGap: 0.08, rate: 1.2 });
    if (!keep && col.h <= 0.25) this.shatter(col, true);
  }

  shatter(col, quiet) {
    if (!this.cols.includes(col)) return;
    this.cols = this.cols.filter((k) => k !== col);
    this.shattered++;
    this.app.badges.report('icebreaker', this.shattered);
    this.iceFx(col, 30);
    this.fx.shake(6);
    if (!quiet) {
      this.audio.play('ice_column_break', { volume: 1 });
      this.audio.play('ice_storm_columncombo', { volume: 0.8, delay: 0.05 });
      const x = col.c * CELL + CELL / 2, y = (ROWS - col.h / 2) * CELL;
      this.addPoints(500 * Math.max(1, Math.ceil(col.h)), x, y, 6);
    }
  }

  iceFx(col, n) {
    const x = col.c * CELL + CELL / 2, top = (ROWS - Math.max(0.5, col.h)) * CELL;
    const shards = [this.A.s('p_iceshard'), this.A.s('p_icechunk')];
    for (let i = 0; i < n * this.fx.quality; i++) {
      const a = rand(-Math.PI, 0), v = rand(150, 520);
      this.fx.add(new Particle({
        sprite: choice(shards), x: x + rand(-50, 50), y: top + rand(0, col.h * CELL),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 1500, life: rand(0.6, 1.1), scale: rand(1.2, 2.6), vrot: rand(-10, 10),
      }));
    }
    this.fx.add(new Particle({ sprite: this.A.tintedSprite('smoke', '#c0e8ff'), x, y: top, life: 0.8, scale: 0.6, scaleEnd: 1.6, alpha: 0.5, vy: -40 }), 'over');
  }

  // a full steam meter blasts all the ice down and raises the multiplier
  vent() {
    this.meter = 0;
    this.mult++;
    this.ventT = 1.6;
    this.audio.play('ice_storm_steam_build_up', { volume: 0.8 });
    this.audio.play('ice_storm_steam_valve', { volume: 1, delay: 0.4 });
    this.audio.play('ice_storm_multipler_up', { volume: 1, delay: 0.5 });
    this.fx.bigText(COLS * CELL / 2, ROWS * CELL / 2, 'x' + this.mult, { size: 180, life: 1.5, colors: { MAIN: '#ffffff', OUTLINE: '#103050', GLOW: '#80e0ff' } });
    for (const col of this.cols.slice()) this.halve(col);
    const steam = this.A.s('p_steam4');
    for (let i = 0; i < 24 * this.fx.quality; i++)
      this.fx.add(new Particle({ sprite: steam, frame: randInt(0, 3), x: rand(0, COLS * CELL), y: ROWS * CELL + 20, vx: rand(-40, 40), vy: rand(-700, -350), drag: 0.03,
        life: rand(0.8, 1.4), scale: rand(0.8, 1.6), scaleEnd: 2.6, alpha: 0.55, blend: 'lighter', delay: 0.4 + rand(0, 0.3) }));
    this.flash.top = this.flash.bottom = 1;
    this.app.setBackground(this.currentBg(), 1.4);
  }

  // ------------------------------------------------------------ look
  drawOnBoard(ctx) {
    if (!this.colAnims.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-20, 0, COLS * CELL + 40, ROWS * CELL);
    ctx.clip();
    for (const col of this.cols) {
      const anim = this.colAnims[col.anim % this.colAnims.length];
      const warn = col.h > ROWS - 2;
      const name = warn && anim.has('warning1') ? 'warning1' : 'idle';
      const topY = (ROWS - col.h) * CELL;
      // the column art is 200 wide with the ice occupying x 37..162; its top cap sits ~25px down
      // translucent so the gems frozen inside stay readable
      anim.draw(ctx, name, this.uiT + col.c * 0.37, { x: col.c * CELL - 37, y: topY - 25, alpha: 0.62 * (col.born > 0 ? 1 - col.born : 1) });
    }
    ctx.restore();
    // frost skull riding on top of each column; it panics as the ice nears the top
    const skull = this.app.pams && this.app.pams.frostpanic;
    if (skull) for (const col of this.cols) {
      const topY = (ROWS - col.h) * CELL;
      const name = col.h > ROWS - 1.5 ? 'panicfast' : col.h > ROWS - 3 ? 'panic' : 'blue';
      const s = 1.2;
      skull.draw(ctx, name, this.uiT, { x: col.c * CELL + CELL / 2 - 35 * s, y: Math.max(-30, topY - 70 * s * 0.75), scale: s });
    }
    // frost creeping over the board when the ice gets close
    const danger = this.cols.reduce((m, c) => Math.max(m, c.h), 0);
    if (danger > ROWS - 3) {
      const a = clamp((danger - (ROWS - 3)) / 3, 0, 1) * (0.6 + 0.2 * Math.sin(this.app.time * 6));
      const g = ctx.createLinearGradient(0, 0, 0, CELL * 2);
      g.addColorStop(0, `rgba(180,230,255,${0.55 * a})`);
      g.addColorStop(1, 'rgba(180,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, COLS * CELL, CELL * 2);
    }
  }

  get pamUI() { return this.ui && this.wide; }

  drawScoreWidget(ctx) {
    if (!this.pamUI) return super.drawScoreWidget(ctx);
    const [sx, sy] = this.scoreOff;
    const ox = UI_X + sx, oy = sy - 0;
    // images 21/22 are the meter's backing plate and base, shaped for a hint panel we draw ourselves
    this.ui.draw(ctx, 'idle', this.uiT, { x: ox, y: oy, skip: (i) => i === 21 || i === 22 });
    if (this.ventT > 0 && this.ui.has('multiplierup')) this.ui.draw(ctx, 'multiplierup', 1.6 - this.ventT, { x: ox, y: oy, loop: false });
    // steam meter fill inside the glass tube
    const gx = 197 + ox, gy = 248 + oy, gw = 190, gh = 440;
    const p = clamp(this.meter, 0, 1);
    if (p > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy + gh * (1 - p), gw, gh * p);
      ctx.clip();
      if (this.fill) this.fill.draw(ctx, 'loop', this.uiT, { x: gx - 200, y: gy + gh * (1 - p) - 325 });
      else { ctx.fillStyle = 'rgba(80,160,255,0.7)'; ctx.fillRect(gx, gy, gw, gh); }
      ctx.restore();
    }
    this.drawScoreText(ctx, 292 + ox, 50 + oy, 260, 52);
    this.fonts.ui.draw(ctx, 'x' + this.mult, 292 + ox, 172 + oy, { size: 46, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a0a50', GLOW: '#ff60e0' } });
  }

  drawBottomFrame(ctx, ox, oy) {
    if (!this.pamUI) {
      this.drawFillBar(ctx, ox, oy, this.meter, ['#e0f8ff', '#60c0ff', '#2060c0'], 'Steam');
    } else this.A.s('ui_bottomframeback').drawAt(ctx, ox, oy);
    this.A.s('ui_bottomframe').drawAt(ctx, ox, oy);
  }

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
      ['Multiplier Reached', 'x' + this.mult],
      ['Columns Shattered', String(this.shattered)],
      ['Survived', this.fmtTime(this.elapsed)],
      ['Best Move', formatNumber(st.bestMove)],
    ];
  }
}
