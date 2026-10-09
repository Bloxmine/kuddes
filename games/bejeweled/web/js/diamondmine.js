// Diamond Mine: dig through dirt by matching next to it. Clearing the dirt line scrolls the board
// down to the next layer (bonus time). Buried gold, diamonds, artifacts and hypercubes wait below.
import { BaseMode } from './mode.js';
import { Gem, CELL, COLS, ROWS } from './board.js';
import { rand, randInt, choice, formatNumber, ease, clamp } from './util.js';
import { Particle } from './fx.js';

const START_TIME = 90;
const DIRT_TOP = 5;      // row where the dirt line sits after scrolling
const ADVANCE_AT = 6;    // scroll once the dirt line is at or below this row
const ITEM_COUNT = 37;
const DRILL_TIME = 2.0;
const MINE_COLORS = [0, 1, 2, 3, 4, 6]; // no orange gems in the mine
// the Mine UI animation was laid out around a board at this position
const UI_BOARD = [681, 134];
const DECOS = ['11', '12', '20', '21', '22', '23', '25', '26', '27', '28'];

export class DiamondMineScene extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'mine';
    this.title = 'Diamond Mine';
    this.music = 'mine';
    this.loseMusic = 'mine_lose';
    this.hasLevels = false;
    this.ui = app.pams && app.pams.mineui;
    this.scoreBadge = 'diamondmine';
    // fixed pseudo-random rock decorations on the wall
    this.decos = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) this.decos.push({ id: DECOS[i % DECOS.length], x: rnd(), y: rnd(), flip: rnd() < 0.5, s: 0.7 + rnd() * 0.5 });
  }

  resetMode() {
    this.timeLeft = START_TIME;
    this.depth = 0;           // rows dug
    this.timeUp = false;
    this.lastTick = 99;
    this.treasure = { gold: 0, diamonds: 0, artifacts: 0, hypercubes: 0 };
    this.board.clipBottom = true;
    this.board.colors = MINE_COLORS;
    this.uiT = 0;
    this.drillT = 0;
    this.mult = 1;
    this.meter = 0;          // treasure value collected towards the next multiplier
    this.displayMeter = 0;
  }

  get meterGoal() { return 1500 + 1000 * (this.mult - 1); }

  // treasure fills the gold tube; a full tube raises the multiplier
  addTreasure(value) {
    this.meter += value;
    if (this.meter >= this.meterGoal) {
      // one step per treasure, so a big artifact can't skip several multipliers at once
      this.meter = Math.min(this.meter - this.meterGoal, this.meterGoal + 1000 - 1);
      this.mult++;
      this.displayMeter = 0;
      this.audio.play('multiplier_up2_' + Math.min(4, this.mult - 1), { volume: 1 });
      this.audio.play('multiplier_appears', { volume: 0.8 });
      this.fx.bigText(COLS * CELL / 2, ROWS * CELL / 2, 'x' + this.mult, { size: 190, life: 1.5, colors: { MAIN: '#fff8c0', OUTLINE: '#3a2000', GLOW: '#ffb000' } });
      this.flash.top = 1;
    }
  }

  get boardShift() { return this.wide ? [UI_BOARD[0] - this.L.board[0], UI_BOARD[1] - this.L.board[1]] : [0, 53]; }
  get pointsMultiplier() { return this.mult; }
  get glowColor() { return '#ffc060'; }
  currentBg() { return this.app.A.manifest.menuBackground; }
  noMoves() { this.reshuffle(); }
  orbText() { return ['x' + this.pointsMultiplier, 'MULTIPLIER']; }
  saveExtra() { return { timeLeft: this.timeLeft, depth: this.depth, treasure: this.treasure, mult: this.mult, meter: this.meter }; }
  loadExtra(e) { Object.assign(this, e); this.treasure = { gold: 0, diamonds: 0, artifacts: 0, hypercubes: 0, ...(e.treasure || {}) }; this.mult = e.mult || 1; this.meter = e.meter || 0; this.displayMeter = this.meter; }

  // Mine assist: falling gems lean towards colours already next to them, so matches come easier.
  pickColor(board, c, r) {
    if (Math.random() < 0.3) {
      const near = [board.at(c - 1, r), board.at(c + 1, r), board.at(c, r + 1)].filter((g) => g && g.color >= 0 && g.type === 'normal');
      if (near.length) return choice(near).color;
    }
    return board.randColor();
  }

  // ------------------------------------------------------------ dirt
  makeDirt(g, depthRow) {
    g.type = 'dirt';
    g.color = -2;
    g.bfly = false;
    g.hp = clamp(1 + Math.floor(depthRow / 6) + (Math.random() < 0.25 ? 1 : 0), 1, 4);
    const r = Math.random();
    const deep = depthRow / 30;
    if (r < 0.006 + deep * 0.004) g.item = { kind: 'artifact', id: randInt(0, ITEM_COUNT - 1) };
    else if (r < 0.02 + deep * 0.004) g.item = { kind: 'hyper' };
    else if (r < 0.07 + deep * 0.02) g.item = { kind: 'diamond', id: randInt(1, 4) };
    else if (r < 0.27) g.item = { kind: 'gold', id: randInt(1, 3) };
    else g.item = null;
    g.pebbles = randInt(1, 3);
    return g;
  }

  customizeFill(board) {
    for (let r = DIRT_TOP; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) this.makeDirt(board.grid[r][c], this.depth + r - DIRT_TOP);
  }

  onGroupMatched(grp) {
    const B = this.board;
    const hit = new Map();
    const add = (n, delay) => { if (n && n.dirt && !n.dying && !hit.has(n)) hit.set(n, delay); };
    for (const g of grp.gems) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, -1]]) add(B.at(g.col + dc, g.row + dr), 0.06);
      // matches sitting on dirt blast downward through the next two layers
      const below = B.at(g.col, g.row + 1);
      if (below && below.dirt) {
        add(below, 0.06);
        add(B.at(g.col, g.row + 2), 0.2);
        this.fx.add(new Particle({ sprite: this.A.s('dig_streak'), x: B.px(g), y: B.py(g) + CELL * 0.9, life: 0.35, scale: 1.4, scaleEnd: 2.2, blend: 'lighter', fadeOut: 0.8 }));
      }
    }
    let i = 0;
    for (const [n, d] of hit) this.board.destroy(n, d + i++ * 0.02, {});
  }

  // returns true when the dirt survives this hit
  onDirtHit(g, opts) {
    const B = this.board, x = B.px(g), y = B.py(g);
    if (opts.force) return false;
    g.hp--;
    this.dirtBurst(x, y, g.hp > 0 ? 6 : 14);
    if (g.hp > 0) {
      g.squash = 0.6;
      g.ovy -= 1.5;
      this.audio.play(g.hp >= 2 ? 'diamond_mine_stone_cracked' : 'diamond_mine_dirt_cracked', { volume: 0.7, minGap: 0.05 });
      return true;
    }
    this.audio.play('diamond_mine_dig', { volume: 0.6, minGap: 0.05 });
    this.addPoints(25, x, y, -1, true);
    if (g.item && g.item.kind === 'hyper') {
      // a buried hypercube becomes a playable gem in place of the dirt
      g.item = null;
      g.type = 'hyper';
      g.color = -1;
      g.hp = 0;
      g.born = 1;
      this.treasure.hypercubes++;
      this.audio.play('hypercube_create', { volume: 0.9 });
      this.fx.specialCreated(x, y, 6, 'hyper');
      return true;
    }
    if (g.item) this.collect(g, x, y);
    return false;
  }

  collect(g, x, y) {
    const it = g.item;
    g.item = null;
    const pts = it.kind === 'artifact' ? 5000 : it.kind === 'diamond' ? 1000 : 250;
    this.treasure[it.kind === 'artifact' ? 'artifacts' : it.kind === 'diamond' ? 'diamonds' : 'gold']++;
    if (it.kind === 'artifact') this.app.badges.report('relichunter', this.treasure.artifacts);
    this.audio.play(it.kind === 'gold' ? 'diamond_mine_treasurefind' : 'diamond_mine_treasurefind_diamonds', { volume: 1, minGap: 0.1 });
    if (it.kind === 'artifact') { this.audio.play('diamond_mine_artifact_showcase', { volume: 0.9, delay: 0.2 }); this.fx.shake(6); }
    const sp = this.A.s(this.itemSprite(it));
    this.addPoints(pts, x, y - 50, it.kind === 'gold' ? 3 : it.kind === 'diamond' ? 6 : 1);
    this.fx.ring(x, y, it.kind === 'gold' ? '#ffd040' : '#a0f0ff', 0.3, 2.8, 0.6, 'p_ring1');
    this.fx.sparkles(x, y, 12, 80);
    // treasure pops up and flies to the money counter
    const [bx, by] = this.boardPos;
    const [tx0, ty0] = this.tubePos();
    const tx = tx0 - bx, ty = ty0 - by;
    // the treasure lands in the tube when the fly-to animation ends
    this.after(1.25, () => { this.addTreasure(pts); this.audio.play('coin_created', { volume: 0.6, minGap: 0.05 }); });
    this.fx.effect(1.3, (ctx, t, k) => {
      const k1 = Math.min(1, t / 0.45), k2 = clamp((t - 0.45) / 0.85, 0, 1);
      const px = k2 > 0 ? x + (tx - x) * ease.inCubic(k2) : x;
      const py = k2 > 0 ? y - 90 + (ty - y + 90) * ease.inCubic(k2) : y - 90 * ease.outBack(k1);
      const s = (it.kind === 'artifact' ? 1.5 : 1.15) * (k2 > 0 ? 1 - 0.6 * k2 : 0.6 + 0.4 * ease.outBack(k1));
      ctx.globalAlpha = 1 - k2 * 0.3;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
      this.A.s('p_basicblur').drawC(ctx, 0, px, py, s * 1.4); ctx.restore();
      sp.drawC(ctx, 0, px, py, s);
    }, 0, 'top');
  }

  itemSprite(it) {
    if (it.kind === 'artifact') return 'dig_item' + it.id;
    if (it.kind === 'diamond') return 'dig_diamond' + it.id;
    if (it.kind === 'hyper') return 'dig_hypercube';
    return 'dig_gold' + it.id;
  }

  dirtBurst(x, y, n) {
    const part = this.A.s('dig_wallpart');
    for (let i = 0; i < n * this.fx.quality; i++) {
      const a = rand(Math.PI * 2), v = rand(100, 380);
      this.fx.add(new Particle({
        sprite: part, x: x + rand(-40, 40), y: y + rand(-40, 40), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200,
        ay: 1400, life: rand(0.5, 0.9), scale: rand(1.2, 2.4), vrot: rand(-8, 8),
      }));
    }
    const smoke = this.A.tintedSprite('smoke', '#a08060');
    this.fx.add(new Particle({ sprite: smoke, x, y, life: 0.7, scale: 0.5, scaleEnd: 1.3, alpha: 0.4, vy: -30 }), 'under');
  }

  isDirt(c, r) { const n = this.board.at(c, r); return !!(n && n.dirt && !n.dying); }

  drawGemCustom(ctx, g, x, y, sx, sy, alpha) {
    if (!g.dirt) return false;
    const A = this.A;
    let s = 1;
    if (g.dying) s = 1 - ease.inQuad(Math.min(1, g.dying.t / g.dying.dur));
    if (s <= 0.01) return true;
    const w = CELL * s * (1 + 0.06 * g.squash), h = CELL * s * (1 - 0.06 * g.squash);
    const x0 = x - w / 2, y0 = y - h / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(A.s('dig_dirt').img, x0, y0, w, h);
    // harder layers are darker and rockier
    if (g.hp > 1) {
      ctx.globalAlpha = alpha * Math.min(0.55, (g.hp - 1) * 0.17);
      ctx.fillStyle = '#1a0c00';
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = alpha * 0.8;
      A.s('dig_pebbles' + g.pebbles).drawC(ctx, 0, x, y, s);
    }
    if (g.item) {
      ctx.globalAlpha = alpha * (g.hp > 1 ? 0.55 : 0.9);
      const sp = A.s(this.itemSprite(g.item));
      sp.drawC(ctx, 0, x, y, s * (g.item.kind === 'artifact' ? 0.8 : g.item.kind === 'hyper' ? 0.85 : 0.75));
      if (g.item.kind !== 'gold' && g.hp === 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(g.anim * 4);
        sp.drawC(ctx, 0, x, y, s * 0.75);
      }
    }
    ctx.restore();
    if (g.dying || Math.abs(g.y - g.row) > 0.01) return true;
    // edge and corner tiles wherever this dirt borders open space
    const top = !this.isDirt(g.col, g.row - 1), left = !this.isDirt(g.col - 1, g.row) && g.col > 0;
    const right = !this.isDirt(g.col + 1, g.row) && g.col < COLS - 1, bottom = !this.isDirt(g.col, g.row + 1) && g.row < ROWS - 1;
    const ref = A.s('dig_dirt');
    const edge = (name) => { const e = A.s(name); ctx.drawImage(e.img, x0 + (e.x - ref.x), y0 + (e.y - ref.y), e.fw, e.fh); };
    ctx.globalAlpha = alpha;
    if (left) { edge('dig_edge_l'); edge('dig_edge_l_hi'); }
    if (right) { edge('dig_edge_r'); edge('dig_edge_r_hi'); }
    if (bottom) { edge('dig_edge_b'); edge('dig_edge_b_hi'); }
    if (top) {
      const surface = this.depth === 0 && g.row === DIRT_TOP;
      edge(surface ? 'dig_grass' : 'dig_dirttop');
      if (!surface) edge('dig_edge_t_hi');
      if (surface && left) edge('dig_grass_l');
      if (surface && right) edge('dig_grass_r');
    }
    ctx.globalAlpha = 1;
    return true;
  }

  // ------------------------------------------------------------ digging deeper
  afterSettle(intro) {
    if (this.timeUp) { this.gameOver('TIME UP', 'voice_timeup'); return false; }
    const B = this.board;
    // the dirt line is the first row with 2+ dirt blocks; a single straggler doesn't hold back the dig
    let topDirt = ROWS;
    for (let r = 0; r < ROWS; r++) if (B.grid[r].filter((g) => g?.dirt).length >= 2) { topDirt = r; break; }
    if (!intro && topDirt >= ADVANCE_AT) { this.advance(topDirt - DIRT_TOP); return false; }
    return super.afterSettle(intro);
  }

  advance(k) {
    const B = this.board;
    this.phase = 'dig';
    this.depth += k;
    const bonus = 8 * k;
    this.timeLeft += bonus;
    this.audio.play('diamond_mine_dig_notify', { volume: 0.9 });
    this.audio.play('earthquake', { volume: 0.5 });
    this.fx.shake(8);
    this.flash.bottom = 1;
    this.drillT = DRILL_TIME;
    // gears grind and the drills bite into the next layer
    this.audio.play('pulleys', { volume: 0.9 });
    this.audio.play('diamond_mine_dig_line_hit_mega', { volume: 0.8, delay: 0.25 });
    this.audio.play('diamond_mine_dig_line_hit', { volume: 0.7, delay: 0.9 });
    this.fx.bigText(COLS * CELL / 2, ROWS * CELL / 2, '+' + bonus + ' SECONDS', { size: 90, life: 1.5, colors: { MAIN: '#ffffff', OUTLINE: '#3a2000', GLOW: '#ffc040' } });
    const moves = [];
    for (let r = 0; r < k; r++) for (let c = 0; c < COLS; c++) {
      const g = B.grid[r][c];
      if (g) g.dying = { t: 0, dur: 0.9, kind: 'into', sx: c, sy: r, tx: c, ty: r - k };
    }
    for (let r = k; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const g = B.grid[r][c];
      B.grid[r - k][c] = g;
      if (g) { moves.push({ g, fx: c, fy: r, tx: c, ty: r - k }); g.row = r - k; }
    }
    for (let r = ROWS - k; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const g = this.makeDirt(new Gem(0, 'normal', c, r), this.depth + r - DIRT_TOP);
      B.grid[r][c] = g;
      B.gems.push(g);
      moves.push({ g, fx: c, fy: r + k, tx: c, ty: r });
    }
    B.animate(moves, 0.9, () => {
      this.phase = 'play';
      B.resolveOrSettle();
    });
  }

  // ------------------------------------------------------------ clock
  updateMode(dt) {
    this.uiT += dt;
    if (this.drillT > 0) this.drillT -= dt;
    this.displayMeter += (this.meter - this.displayMeter) * Math.min(1, dt * 4);
    if (this.phase !== 'play' || this.timeUp) return;
    this.timeLeft -= dt;
    const sec = Math.ceil(this.timeLeft);
    if (sec <= 5 && sec < this.lastTick && sec > 0) { this.lastTick = sec; this.audio.play('countdown_warning', { volume: 0.7 }); this.flash.top = 1; }
    if (sec > 5) this.lastTick = 99;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.timeUp = true;
      this.board.selected = null;
      this.board.hint = null;
      this.pending = null;
      if (this.board.phase === 'idle') this.gameOver('TIME UP', 'voice_timeup');
    }
  }

  queueSwap(a, b) { if (!this.timeUp) super.queueSwap(a, b); }

  // ------------------------------------------------------------ look
  get uiOff() { const [bx, by] = this.boardPos; return [bx - UI_BOARD[0], by - UI_BOARD[1]]; }

  // rock wall behind everything, with fossils and stones set into it
  drawBackdrop(ctx) {
    const A = this.A;
    const [x0, y0, x1, y1] = this.visibleRect();
    const tile = A.s('dig_bg');
    const sw = 470, tw = sw * 2, th = tile.fh * 2; // the left part of the texture tiles cleanly
    ctx.save();
    let j = 0;
    for (let y = Math.floor(y0 / th) * th; y < y1; y += th, j++) {
      let i = 0;
      for (let x = Math.floor(x0 / tw) * tw; x < x1; x += tw, i++) {
        const flip = (i + j) & 1;
        ctx.save();
        ctx.translate(x + (flip ? tw : 0), y);
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(tile.img, 0, 0, sw, tile.fh, 0, 0, tw, th);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 0.85;
    for (const d of this.decos) {
      const sp = A.s('dig_deco' + d.id);
      const x = x0 + d.x * (x1 - x0), y = y0 + d.y * (y1 - y0);
      ctx.save();
      ctx.translate(x, y);
      if (d.flip) ctx.scale(-1, 1);
      sp.drawC(ctx, 0, 0, 0, d.s);
      ctx.restore();
    }
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  drawGlows() {}

  drawTopFrame(ctx, ox, oy) {
    if (!this.ui || !this.wide) return super.drawTopFrame(ctx, ox, oy);
    const [ux, uy] = this.uiOff;
    // the drill animation replaces the idle one while the mine scrolls (drawing both doubles the gears)
    if (this.drillT > 0) this.ui.draw(ctx, 'drill', DRILL_TIME - this.drillT, { x: ux, y: uy, loop: false });
    else this.ui.draw(ctx, 'idle', this.uiT, { x: ux, y: uy });
    // timer: a burning bar across the top
    const bx0 = 690 + ux, by0 = 30 + uy, bw = 1010, bh = 76;
    const p = clamp(this.timeLeft / START_TIME, 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx0, by0, bw * p, bh);
    ctx.clip();
    const g = ctx.createLinearGradient(0, by0, 0, by0 + bh);
    g.addColorStop(0, '#ffd070'); g.addColorStop(0.5, '#e07010'); g.addColorStop(1, '#802000');
    ctx.fillStyle = g;
    ctx.fillRect(bx0, by0, bw, bh);
    ctx.globalCompositeOperation = 'lighter';
    const fl = this.A.s('p_basicblur');
    for (let i = 0; i < 26; i++) {
      const fx = bx0 + ((i * 97 + this.uiT * 60 * (1 + (i % 3))) % bw), fy = by0 + bh / 2 + Math.sin(this.uiT * 3 + i) * 18;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.uiT * 5 + i * 1.7);
      fl.drawC(ctx, 0, fx, fy, 0.5 + 0.3 * ((i * 7) % 5) / 5);
    }
    ctx.restore();
    // clock badge
    const low = this.timeLeft < 10;
    const cx = 1612 + ux, cy = 70 + uy;
    this.A.s(low ? 'ui_timer_red_lightning' : 'ui_timer_lightning').drawC(ctx, 0, cx, cy, 1);
    const sec = Math.ceil(this.timeLeft);
    const pulse = low && !this.timeUp ? 1 + 0.08 * Math.abs(Math.sin(this.app.time * 6)) : 1;
    this.fonts.ui.draw(ctx, Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), cx, cy, {
      size: 44 * pulse, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#301030', GLOW: low ? '#ff4040' : '#ff80e0' },
    });
    // depth counter on the left pillar
    const digits = String(Math.min(999, this.depth * 10)).padStart(3, '0');
    for (let i = 0; i < 3; i++)
      this.fonts.score.draw(ctx, digits[i], 565 + i * 50 + ux, 926 + uy, { size: 46, align: 'center', valign: 'middle', colors: { MAIN: '#201008', OUTLINE: null, GLOW: null } });
  }

  drawBottomFrame(ctx, ox, oy) {
    if (!this.ui || !this.wide) {
      const sec = Math.ceil(this.timeLeft);
      this.drawFillBar(ctx, ox, oy, clamp(this.timeLeft / START_TIME, 0, 1), ['#fff0b0', '#e0a030', '#805010'], Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'));
      this.A.s('ui_bottomframe').drawAt(ctx, ox, oy);
    }
  }

  moneyPos() { const [sx, sy] = this.scoreOff; return [400 + sx, 70 + sy]; }
  tubeOrigin() { const [sx, sy] = this.scoreOff; return [400 + sx - 75, 175 + sy]; }
  tubePos() { const [wx, wy] = this.tubeOrigin(); return [wx + 75, wy + 300]; }

  // "$" plate hanging on chains above the spiral glass treasure tube
  drawScoreWidget(ctx) {
    const A = this.A;
    const [sx, sy] = this.scoreOff;
    const [wx, wy] = this.tubeOrigin();
    const S = 1.25; // tube scale
    const back = A.s('wt_glassback'), front = A.s('wt_glassfront'), mask = A.s('wt_fillmask'), cap = A.s('wt_cap');
    const at = (sp, f, dy = 0) => sp.draw(ctx, f, wx + sp.x * S, wy + (sp.y + dy) * S, sp.fw * S, sp.fh * S);
    for (const cx of [wx + 30 * S, wx + 92 * S]) A.s('rig_sidechain').draw(ctx, 0, cx - 7, 95 + sy, 15, wy - 85 - sy);
    ctx.save();
    ctx.globalAlpha = 0.3;
    at(back, 1);
    ctx.restore();
    // gold fill: the tube's own fill mask tinted gold, with nuggets and gems piled inside
    const p = clamp(this.displayMeter / this.meterGoal, 0, 1);
    if (p > 0.003) {
      const fx0 = wx + mask.x * S, fy0 = wy + mask.y * S, fw = mask.fw * S, fh = mask.fh * S;
      const top = fy0 + fh * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx0 - 4, top, fw + 8, fh * p + 4);
      ctx.clip();
      ctx.drawImage(A.tinted(mask.img, '#c88a10', 'wt_fillmask'), fx0, fy0, fw, fh);
      let seed = 3;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 30; i++) {
        const row = i / 30, kx = rnd(), sc = 0.38 + rnd() * 0.14, rot = rnd() * 6;
        const narrow = Math.min(1, (1 - row) * 6); // the tube rounds off at the bottom
        const name = rnd() < 0.15 ? 'dig_diamond' + (1 + ((rnd() * 4) | 0)) : 'dig_gold' + (1 + ((rnd() * 3) | 0));
        A.s(name).drawC(ctx, 0, fx0 + fw / 2 + (kx - 0.5) * (fw - 28) * narrow, fy0 + fh - 22 - row * (fh - 20), sc, rot);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(this.uiT * 3);
      A.tintedSprite('p_basicblur', '#ffd040').drawC(ctx, 0, fx0 + fw / 2, top, 0.9);
      ctx.restore();
    }
    at(front, 0); // the spiral glass
    ctx.save();
    ctx.filter = 'sepia(1) saturate(2.2) brightness(1.08)'; // gold rings
    at(cap, 0, -20);
    ctx.restore();
    A.s('ui_topwidget_quest').drawC(ctx, 0, 400 + sx, 70 + sy, 1);
    const [mx, my] = this.moneyPos();
    const text = '$' + formatNumber(this.displayScore);
    let size = 52;
    const w = this.fonts.ui.measure(text, size);
    if (w > 230) size *= 230 / w;
    this.fonts.ui.draw(ctx, text, mx, my, { size, align: 'center', valign: 'middle', colors: { MAIN: '#fff060', OUTLINE: '#402000', GLOW: '#ffa000' } });
    this.fonts.ui.draw(ctx, 'x' + this.mult, wx + cap.x * S + cap.fw * S / 2, wy + 52 * S, { size: 40, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#402000', GLOW: '#ffb000' } });
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
    const T = this.treasure;
    return [
      ['Final Score', '$' + formatNumber(this.score)],
      ['Depth Reached', this.depth * 10 + 'm'],
      ['Gold Found', String(T.gold)],
      ['Diamonds Found', String(T.diamonds)],
      ['Artifacts Found', String(T.artifacts)],
      ['Multiplier Reached', 'x' + this.mult],
    ];
  }
}
