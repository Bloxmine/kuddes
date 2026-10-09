// Board simulation: grid, matching, special gems, gravity physics and cascades.
import { rand, randInt, choice, shuffle, clamp, lerp, ease, TAU, GEM_COLORS, GEM_GLOWS } from './util.js';

export const COLS = 8, ROWS = 8, CELL = 128, NCOLORS = 7;
const GRAVITY = 52;      // cells / s^2
const MAX_FALL = 24;     // cells / s
const SWAP_TIME = 0.24;  // seconds
const BOUNCE = 0.2;      // restitution of the first landing bounce

let nextId = 1;

export class Gem {
  constructor(color, type, col, row) {
    this.id = nextId++;
    this.color = color;           // 0..6, -1 for hypercube
    this.type = type;             // 'normal' | 'flame' | 'star' | 'hyper' | 'nova'
    this.col = col; this.row = row;
    this.x = col; this.y = row;   // visual position in cells
    this.vy = 0; this.falling = false; this.delay = 0; this.bounced = false;
    this.ox = 0; this.oy = 0; this.ovx = 0; this.ovy = 0; // spring offset (shockwaves)
    this.squash = 0;
    this.scale = 1; this.alpha = 1;
    this.dying = null;            // { t, dur, kind }
    this.triggered = false;
    this.protect = false;
    this.born = 0;                // special creation glow timer
    this.anim = rand(100);
    this.zap = 0;                 // hypercube target highlight
    this.flying = null;           // level transition free-fall
    this.time = 0;                // lightning mode time gem (+5 / +10)
    this.bfly = false;            // butterflies mode
    this.hp = 0; this.item = null; // diamond mine dirt
  }
  get special() { return this.type === 'flame' || this.type === 'star' || this.type === 'hyper' || this.type === 'nova'; }
  get dirt() { return this.type === 'dirt'; }
}

export const canSwap = (g) => !!g && !g.dying && !g.flying && !g.pendingKill && g.type !== 'dirt';

export class Board {
  constructor(game) {
    this.game = game;            // provides A (assets), fx, audio, hooks
    this.A = game.A;
    this.fx = game.fx;
    this.audio = game.audio;
    this.grid = [];
    this.gems = [];
    this.timers = [];
    this.phase = 'empty';
    this.swap = null;
    this.cascade = 0;
    this.moveScore = 0;
    this.time = 0;
    this.landSounds = 0;
    this.selected = null;
    this.hint = null;
    this.clipTop = true;
    this.clipBottom = false;
    this.custom = null;          // scripted movement { moves, t, dur, done }
    this.colors = [0, 1, 2, 3, 4, 5, 6];
  }

  randColor() { return this.colors[(Math.random() * this.colors.length) | 0]; }

  // new gem colour for a falling-in gem (modes may bias this)
  spawnColor(c, r) { return this.game.pickColor ? this.game.pickColor(this, c, r) : this.randColor(); }

  // ------------------------------------------------------------ helpers
  at(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS ? this.grid[r][c] : null; }
  px(g) { return (g.x + g.ox) * CELL + CELL / 2; }
  py(g) { return (g.y + g.oy) * CELL + CELL / 2; }
  cx(c) { return c * CELL + CELL / 2; }
  after(t, fn) { this.timers.push({ t, fn }); }
  get busy() { return this.phase !== 'idle'; }
  liveGems() { const out = []; for (const row of this.grid) for (const g of row) if (g && !g.dying) out.push(g); return out; }

  // ------------------------------------------------------------ board generation
  fill(dropIn = true) {
    this.gems = this.gems.filter((g) => g.dying || g.flying);
    let tries = 0;
    do {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          let color;
          do color = this.randColor();
          while (
            (c >= 2 && this.grid[r][c - 1].color === color && this.grid[r][c - 2].color === color) ||
            (r >= 2 && this.grid[r - 1][c].color === color && this.grid[r - 2][c].color === color)
          );
          this.grid[r][c] = new Gem(color, 'normal', c, r);
        }
      this.game.customizeFill && this.game.customizeFill(this);
    } while (!this.findMove() && ++tries < 100);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const g = this.grid[r][c];
        this.gems.push(g);
        if (dropIn) {
          g.y = r - ROWS - 1.5 - rand(0, 0.3);
          g.falling = true;
          g.delay = (ROWS - 1 - r) * 0.07 + c * 0.025 + rand(0, 0.03);
        }
      }
    this.phase = dropIn ? 'falling' : 'idle';
    this.introDrop = dropIn;
    this.cascade = 0;
  }

  // Restore a saved board (cells: rows of compact gem records) with the usual drop-in.
  fillFrom(cells) {
    this.gems = this.gems.filter((g) => g.dying || g.flying);
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const d = cells[r][c];
        const g = new Gem(d.c, d.t, c, r);
        g.time = d.tm || 0; g.bfly = !!d.bf; g.hp = d.hp || 0; g.item = d.it || null; g.pebbles = d.pb || 1;
        this.grid[r][c] = g;
        this.gems.push(g);
        g.y = r - ROWS - 1.5 - rand(0, 0.3);
        g.falling = true;
        g.delay = (ROWS - 1 - r) * 0.07 + c * 0.025 + rand(0, 0.03);
      }
    this.phase = 'falling';
    this.introDrop = true;
    this.cascade = 0;
  }

  serialize() {
    return this.grid.map((row) => row.map((g) => {
      const d = { c: g.color, t: g.type };
      if (g.time) d.tm = g.time;
      if (g.bfly) d.bf = 1;
      if (g.hp) d.hp = g.hp;
      if (g.item) d.it = g.item;
      if (g.pebbles) d.pb = g.pebbles;
      return d;
    }));
  }

  // ------------------------------------------------------------ match detection
  canMatch(g) { return g && !g.dying && !g.falling && g.color >= 0; }

  findRuns() {
    const runs = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const g = this.grid[r][c];
        let e = c + 1;
        if (this.canMatch(g)) while (e < COLS && this.canMatch(this.grid[r][e]) && this.grid[r][e].color === g.color) e++;
        if (this.canMatch(g) && e - c >= 3) runs.push({ dir: 'h', gems: this.grid[r].slice(c, e), color: g.color });
        c = e;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const g = this.grid[r][c];
        let e = r + 1;
        if (this.canMatch(g)) while (e < ROWS && this.canMatch(this.grid[e][c]) && this.grid[e][c].color === g.color) e++;
        if (this.canMatch(g) && e - r >= 3) {
          const gs = [];
          for (let i = r; i < e; i++) gs.push(this.grid[i][c]);
          runs.push({ dir: 'v', gems: gs, color: g.color });
        }
        r = e;
      }
    }
    return runs;
  }

  // Merge runs that share gems into match groups and classify what they create.
  findGroups() {
    const runs = this.findRuns();
    const groups = [];
    const owner = new Map();
    for (const run of runs) {
      let grp = null;
      for (const g of run.gems) if (owner.has(g.id)) { grp = owner.get(g.id); break; }
      if (!grp) { grp = { runs: [], gems: new Set(), color: run.color }; groups.push(grp); }
      grp.runs.push(run);
      for (const g of run.gems) { grp.gems.add(g); owner.set(g.id, grp); }
    }
    for (const grp of groups) {
      const maxLen = Math.max(...grp.runs.map((r) => r.gems.length));
      const cross = grp.runs.some((r) => r.dir === 'h') && grp.runs.some((r) => r.dir === 'v');
      grp.size = grp.gems.size;
      grp.maxLen = maxLen;
      grp.creates = maxLen >= 6 ? 'nova' : maxLen === 5 ? 'hyper' : cross ? 'star' : maxLen === 4 ? 'flame' : null;
      grp.cross = cross;
    }
    return groups;
  }

  // Returns [gemA, gemB] for a valid move, or null.
  findMove() {
    const g = this.grid;
    const col = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS && g[r][c] ? g[r][c].color : -2);
    const lineAt = (c, r, color, colorAt) => {
      if (color < 0) return false;
      let h = 1, v = 1;
      for (let i = c - 1; colorAt(i, r) === color; i--) h++;
      for (let i = c + 1; colorAt(i, r) === color; i++) h++;
      for (let i = r - 1; colorAt(c, i) === color; i--) v++;
      for (let i = r + 1; colorAt(c, i) === color; i++) v++;
      return h >= 3 || v >= 3;
    };
    const moves = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (!g[r][c]) continue;
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
          const c2 = c + dc, r2 = r + dr;
          if (c2 >= COLS || r2 >= ROWS || !g[r2][c2]) continue;
          const a = g[r][c], b = g[r2][c2];
          if (!canSwap(a) || !canSwap(b)) continue;
          if (a.type === 'hyper' || b.type === 'hyper') { moves.push([a, b]); continue; }
          const swapped = (x, y) => (x === c && y === r ? b.color : x === c2 && y === r2 ? a.color : col(x, y));
          if (lineAt(c, r, b.color, swapped) || lineAt(c2, r2, a.color, swapped)) moves.push([a, b]);
        }
      }
    return moves.length ? choice(moves) : null;
  }

  // ------------------------------------------------------------ player input
  trySwap(a, b) {
    if (this.phase !== 'idle' || !canSwap(a) || !canSwap(b) || a === b) return false;
    if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) !== 1) return false;
    this.hint = null;
    this.selected = null;
    this.cascade = 0;
    this.moveScore = 0;
    this.moveSpecials = 0;
    this.moveKills = 0;
    this.audio.play('start_rotate', { volume: 0.5 });
    // a Hypercube doesn't trade places: both stay put and the cube goes off where it is
    if (a.type === 'hyper' || b.type === 'hyper') { this.useHyper(a, b); return true; }
    this.startSwap(a, b, false);
    return true;
  }

  // a Hypercube used on a gem (all of that colour go) or on another Hypercube (everything goes)
  useHyper(a, b) {
    this.cascade = 1;
    this.phase = 'clearing';
    this.game.onMoveStart && this.game.onMoveStart();
    if (a.type === 'hyper' && b.type === 'hyper') this.doubleHyper(a, b);
    else {
      const cube = a.type === 'hyper' ? a : b, other = cube === a ? b : a;
      this.game.onHyper && this.game.onHyper(other.color);
      this.activateHyper(cube, other.color, other.special ? other.type : null);
    }
  }

  startSwap(a, b, back) {
    this.phase = 'swap';
    this.swap = { a, b, t: 0, back, ac: a.col, ar: a.row, bc: b.col, br: b.row };
  }

  finishSwap() {
    const { a, b, back, ac, ar, bc, br } = this.swap;
    this.swap = null;
    // exchange grid positions
    this.grid[ar][ac] = b; this.grid[br][bc] = a;
    a.col = bc; a.row = br; b.col = ac; b.row = ar;
    a.x = a.col; a.y = a.row; b.x = b.col; b.y = b.row;
    if (back) { this.phase = 'idle'; this.game.onBadMove && this.game.onBadMove(); return; }

    if (a.type === 'hyper' || b.type === 'hyper') return this.useHyper(a, b);
    const groups = this.findGroups();
    if (!groups.length) {
      this.audio.play('badmove', { volume: 0.8 });
      this.startSwap(a, b, true);
      return;
    }
    this.game.onMoveStart && this.game.onMoveStart();
    this.resolve(groups, [a, b]);
  }

  // ------------------------------------------------------------ resolving matches
  resolve(groups, moved = []) {
    this.phase = 'clearing';
    this.cascade++;
    for (const g of this.gems) g.protect = false;
    const cascade = this.cascade;
    this.game.onCascade && this.game.onCascade(cascade, groups);
    // combo_1 is a silent placeholder in the game data; the audible match chime starts at combo_2
    const comboSnd = 'combo_' + Math.min(cascade + 1, 7);
    this.audio.play(comboSnd, { volume: 0.9 });
    if (groups.length > 1) this.audio.play('doubleset', { volume: 0.5, delay: 0.05 });

    for (const grp of groups) {
      const gems = [...grp.gems];
      // where does the special gem go?
      let target = null;
      if (grp.creates) {
        if (grp.creates === 'star') {
          const counts = new Map();
          for (const run of grp.runs) for (const g of run.gems) counts.set(g, (counts.get(g) || 0) + 1);
          target = gems.find((g) => counts.get(g) > 1 && !g.special);
        }
        if (!target) target = moved.find((g) => grp.gems.has(g) && !g.special);
        if (!target) {
          const longest = grp.runs.reduce((a, b) => (b.gems.length > a.gems.length ? b : a));
          const mid = longest.gems.slice().sort((p, q) => Math.abs(p.col - (longest.gems[0].col + longest.gems.at(-1).col) / 2) + Math.abs(p.row - (longest.gems[0].row + longest.gems.at(-1).row) / 2) - (Math.abs(q.col - (longest.gems[0].col + longest.gems.at(-1).col) / 2) + Math.abs(q.row - (longest.gems[0].row + longest.gems.at(-1).row) / 2)));
          target = mid.find((g) => !g.special) || null;
        }
      }
      // score
      const base = 50 * (grp.size - 2) + (grp.creates === 'hyper' ? 250 : grp.creates === 'nova' ? 500 : 0);
      const pts = base * cascade;
      let sx = 0, sy = 0;
      for (const g of gems) { sx += this.px(g); sy += this.py(g); }
      this.game.addPoints(pts, sx / gems.length, sy / gems.length, grp.color);
      this.game.onGroupMatched && this.game.onGroupMatched(grp, cascade);

      for (const g of gems) {
        if (g === target) continue;
        if (target && !g.special) {
          // gems slide into the newly created special
          this.destroy(g, 0, { into: target });
        } else this.destroy(g, 0);
      }
      if (target) this.makeSpecial(target, grp.creates);
    }
  }

  makeSpecial(g, type) {
    g.type = type;
    if (type === 'hyper') g.color = -1;
    g.protect = true;
    g.born = 1;
    this.moveSpecials = (this.moveSpecials || 0) + 1;
    const x = this.px(g), y = this.py(g);
    this.fx.specialCreated(x, y, g.color < 0 ? 3 : g.color, type);
    const snd = { flame: 'powergem_created', star: 'lasergem_created', hyper: 'hypercube_create', nova: 'lasergem_created' }[type];
    this.audio.play(snd, { volume: 1 });
    if (type === 'nova') this.audio.play('powergem_created', { volume: 0.8, delay: 0.1 });
    this.game.onSpecialCreated && this.game.onSpecialCreated(type, g);
    if (type === 'nova') this.game.app.badges.report('superstar');
  }

  /**
   * Remove a gem. opts.points: score for special-caused kills, opts.into: gem to slide into,
   * opts.force: ignore creation protection, opts.quiet: no effects
   */
  destroy(g, delay = 0, opts = {}) {
    if (!g || g.dying || g.flying) return;
    if (delay > 0) {
      g.pendingKill = true;
      this.after(delay, () => { g.pendingKill = false; this.destroy(g, 0, opts); });
      return;
    }
    if (g.protect && !opts.force) return;
    if (g.dirt && this.game.onDirtHit && this.game.onDirtHit(g, opts)) return; // dirt survived the hit
    if (this.grid[g.row] && this.grid[g.row][g.col] === g) this.grid[g.row][g.col] = null;
    const x = this.px(g), y = this.py(g);
    this.game.onGemDestroyed && this.game.onGemDestroyed(g, opts);
    if (g.special && !g.triggered) {
      g.triggered = true;
      g.dying = { t: 0, dur: 0.12, kind: 'blast' };
      this.trigger(g, opts.hyperColor);
      return;
    }
    this.moveKills = (this.moveKills || 0) + 1;
    if (opts.points && !g.dirt) this.game.addPoints(opts.points * Math.max(1, this.cascade), x, y, g.color, true);
    if (g.dirt) { g.dying = { t: 0, dur: 0.25, kind: 'shatter' }; return; }
    if (opts.into) {
      g.dying = { t: 0, dur: 0.22, kind: 'into', tx: opts.into.col, ty: opts.into.row, sx: g.x, sy: g.y };
      return;
    }
    g.dying = { t: 0, dur: 0.28, kind: 'shatter' };
    if (!opts.quiet) this.fx.gemShatter(x, y, g.color, opts.power || 1);
  }

  trigger(g, hyperColor) {
    const x = this.px(g), y = this.py(g);
    this.game.onSpecialUsed && this.game.onSpecialUsed(g.type);
    if (g.type === 'flame') this.game.app.badges.report('inferno');
    else if (g.type === 'star' || g.type === 'nova') this.game.app.badges.report('stellar');
    if (g.type === 'flame') {
      this.audio.play('bomb_explode', { volume: 1, minGap: 0.06 });
      this.fx.flameExplosion(x, y);
      this.shockwave(g.col, g.row, 3.5, 14);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const n = this.at(g.col + dc, g.row + dr);
          if (n && n !== g) this.destroy(n, 0.1 + rand(0, 0.05), { points: 20, power: 1.6 });
        }
    } else if (g.type === 'star' || g.type === 'nova') {
      const nova = g.type === 'nova';
      this.audio.play('electro_explode', { volume: 1, minGap: 0.06 });
      if (nova) { this.audio.play('bomb_explode', { volume: 0.8 }); this.fx.shake(22); }
      else this.fx.shake(6);
      const color = GEM_GLOWS[g.color] || '#ffffff';
      const span = nova ? [-1, 0, 1] : [0];
      for (const d of span) {
        const k = nova ? (d === 0 ? 0.55 : 0.3) : 1;
        this.fx.beam(x, (g.row + d) * CELL + CELL / 2, true, COLS * CELL, color, nova ? 1.2 : 1, 0.6, k);
        this.fx.beam((g.col + d) * CELL + CELL / 2, y, false, ROWS * CELL, color, nova ? 1.2 : 1, 0.6, k);
      }
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const inRow = span.some((d) => r === g.row + d), inCol = span.some((d) => c === g.col + d);
          if (!(inRow || inCol)) continue;
          const n = this.grid[r][c];
          if (!n || n === g) continue;
          const dist = inRow && inCol ? Math.min(Math.abs(c - g.col), Math.abs(r - g.row)) : inRow ? Math.abs(c - g.col) : Math.abs(r - g.row);
          this.destroy(n, 0.12 + dist * 0.04, { points: 20, power: 1.3 });
        }
      if (nova) this.shockwave(g.col, g.row, 5, 18);
    } else if (g.type === 'hyper') {
      // hit by another special: pick a random colour that's on the board
      let color = hyperColor;
      if (color === undefined || color < 0) {
        const colors = this.liveGems().filter((n) => n.color >= 0).map((n) => n.color);
        color = colors.length ? choice(colors) : 0;
      }
      g.dying = null;
      g.triggered = false;
      this.activateHyper(g, color, null);
    }
  }

  // Hypercube swapped with a gem of `color`. If convertType, those gems turn into that special first.
  activateHyper(cube, color, convertType) {
    this.game.app.badges.report('chromatic');
    cube.triggered = true;
    cube.protect = false;
    if (this.grid[cube.row][cube.col] === cube) this.grid[cube.row][cube.col] = null;
    cube.dying = { t: 0, dur: 99, kind: 'hyper' }; // stays visible while zapping
    const cx = this.px(cube), cy = this.py(cube);
    const targets = this.liveGems().filter((n) => n.color === color && n !== cube && !n.pendingKill);
    shuffle(targets);
    targets.sort((p, q) => Math.hypot(p.col - cube.col, p.row - cube.row) - Math.hypot(q.col - cube.col, q.row - cube.row));
    this.audio.play('hyperspace', { volume: 0.25 });
    this.audio.play('electro_path', { volume: 0.8 });
    this.fx.ring(cx, cy, GEM_GLOWS[color], 0.3, 3, 0.6, 'p_ring1');
    this.fx.flash(cx, cy, 3, 0.5, '#ffffff');
    const step = convertType ? 0.07 : 0.045;
    targets.forEach((t, i) => {
      t.pendingKill = true;
      this.after(0.08 + i * step, () => {
        if (t.dying) return;
        t.zap = 1;
        this.fx.lightning(cx, cy, this.px(t), this.py(t), GEM_GLOWS[color], 0.5, 0.7);
        this.fx.flash(this.px(t), this.py(t), 1.4, 0.3, GEM_GLOWS[color]);
        this.audio.play('electro_path2', { volume: 0.5, minGap: 0.05, rate: 1 + i * 0.03 });
        if (convertType && t.type === 'normal') {
          t.type = convertType;
          t.born = 1;
          this.fx.specialCreated(this.px(t), this.py(t), t.color, convertType);
        }
      });
    });
    const end = 0.08 + targets.length * step + 0.35;
    this.after(end, () => {
      this.fx.flash(cx, cy, 4, 0.5, '#ffffff');
      this.audio.play('electro_explode', { volume: 0.9 });
      this.fx.shake(10);
      targets.forEach((t, i) => {
        t.pendingKill = false;
        this.destroy(t, convertType ? i * 0.12 : rand(0, 0.08), { points: 50, power: 1.4, force: true });
      });
      cube.dying = { t: 0, dur: 0.3, kind: 'shatter' };
      this.fx.gemShatter(cx, cy, 3, 2);
      this.fx.specialCreated(cx, cy, color, 'hyper');
    });
  }

  doubleHyper(a, b) {
    this.game.app.badges.report('annihilator');
    for (const cube of [a, b]) {
      cube.triggered = true;
      if (this.grid[cube.row][cube.col] === cube) this.grid[cube.row][cube.col] = null;
      cube.dying = { t: 0, dur: 99, kind: 'hyper' };
    }
    const cx = (this.px(a) + this.px(b)) / 2, cy = (this.py(a) + this.py(b)) / 2;
    this.audio.play('hyperspace', { volume: 0.6 });
    this.audio.play('electro_path', { volume: 1 });
    const all = this.liveGems();
    all.forEach((t) => {
      t.pendingKill = true;
      const d = Math.hypot(this.px(t) - cx, this.py(t) - cy) / CELL;
      this.after(0.1 + d * 0.06, () => {
        this.fx.lightning(cx, cy, this.px(t), this.py(t), choice(GEM_GLOWS), 0.4, 0.6);
        t.zap = 1;
      });
    });
    this.after(1.0, () => {
      this.fx.flash(cx, cy, 9, 0.8, '#ffffff');
      this.fx.shake(28);
      this.audio.play('bomb_explode', { volume: 1 });
      this.audio.play('electro_explode', { volume: 1 });
      for (const t of all) {
        t.pendingKill = false;
        t.triggered = true; // no chain reactions, everything goes
        if (!t.dirt) t.type = 'normal';
        const d = Math.hypot(this.px(t) - cx, this.py(t) - cy) / CELL;
        this.destroy(t, d * 0.035, { points: 100, power: 1.8, force: true });
      }
      for (const cube of [a, b]) { cube.dying = { t: 0, dur: 0.3, kind: 'shatter' }; this.fx.gemShatter(this.px(cube), this.py(cube), 3, 2); }
    });
  }

  // push nearby gems outward with a spring (purely visual)
  shockwave(col, row, radius, strength) {
    for (const g of this.gems) {
      if (g.dying) continue;
      const dx = g.col - col, dy = g.row - row, d = Math.hypot(dx, dy);
      if (d === 0 || d > radius) continue;
      const f = (strength * (1 - d / radius)) / d;
      g.ovx += dx * f;
      g.ovy += dy * f;
    }
  }

  // ------------------------------------------------------------ gravity
  collapse() {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      let moving = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        const g = this.grid[r][c];
        if (!g) continue;
        if (r !== write) {
          this.grid[write][c] = g;
          this.grid[r][c] = null;
          g.row = write;
          g.falling = true;
          g.bounced = false;
          g.delay = moving * 0.012;
          moving++;
        }
        write--;
      }
      const empty = write + 1;
      for (let i = 0; i < empty; i++) {
        const r = write - i;
        const g = new Gem(this.spawnColor(c, r), 'normal', c, r);
        g.y = r - empty - 0.15;
        g.falling = true;
        g.delay = (moving + i) * 0.012;
        this.game.spawnGem && this.game.spawnGem(g);
        this.grid[r][c] = g;
        this.gems.push(g);
      }
    }
    this.phase = 'falling';
  }

  // Recolour the normal gems in place until the board has a move and no matches (no-moves reshuffle).
  scramble() {
    const gs = this.liveGems().filter((g) => g.type === 'normal' && !g.bfly);
    const keep = gs.map((g) => g.color);
    for (let t = 0; t < 400; t++) {
      for (const g of gs) g.color = this.randColor();
      if (!this.findRuns().length && this.findMove()) {
        gs.forEach((g, i) => { g.born = 1; this.after(i * 0.01, () => this.fx.sparkles(this.px(g), this.py(g), 2, 40)); });
        return true;
      }
    }
    gs.forEach((g, i) => (g.color = keep[i]));
    return false;
  }

  // ------------------------------------------------------------ level transitions
  // gems tumble off the board (level complete)
  dropAll() {
    for (const g of this.liveGems()) {
      this.grid[g.row][g.col] = null;
      g.flying = { vx: rand(-4, 4), vy: rand(-14, -5) - (ROWS - g.row) * 0.6, rot: 0, vr: rand(-6, 6), delay: g.row * 0.02 + rand(0, 0.1) };
    }
    this.selected = null;
    this.hint = null;
    this.phase = 'locked';
  }

  // gems shatter in a wave (game over)
  shatterAll() {
    const gs = this.liveGems();
    for (const g of gs) {
      g.triggered = true;
      if (!g.dirt) g.type = 'normal';
      this.destroy(g, 0.3 + g.row * 0.12 + g.col * 0.02 + rand(0, 0.05), { force: true });
    }
    this.selected = null;
    this.hint = null;
    this.phase = 'locked';
    for (let r = 0; r < ROWS; r++) this.after(0.3 + r * 0.12, () => this.audio.play('gem_shatters', { volume: 0.5 }));
  }

  // Move gems along scripted paths (butterflies climbing, mine scrolling). moves: [{ g, fx, fy, tx, ty }]
  // Grid positions must already be updated by the caller. done() runs when the animation ends.
  animate(moves, dur, done, easing = ease.inOutQuad) {
    this.phase = 'custom';
    for (const m of moves) { m.g.x = m.fx; m.g.y = m.fy; }
    this.custom = { moves, t: 0, dur, done, easing };
  }

  // After scripted moves: resolve any matches they made, otherwise settle.
  resolveOrSettle() {
    const groups = this.findGroups();
    if (groups.length) this.resolve(groups);
    else this.settle();
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    this.landSounds = Math.max(0, this.landSounds - dt * 20);

    // timers (callbacks may add more timers)
    if (this.timers.length) {
      const due = [];
      for (const t of this.timers) { t.t -= dt; if (t.t <= 0) due.push(t); }
      if (due.length) {
        this.timers = this.timers.filter((t) => t.t > 0);
        for (const t of due) t.fn();
      }
    }

    if (this.swap) {
      this.swap.t += dt / SWAP_TIME;
      const { a, b, ac, ar, bc, br } = this.swap;
      const k = ease.inOutQuad(Math.min(1, this.swap.t));
      a.x = lerp(ac, bc, k); a.y = lerp(ar, br, k);
      b.x = lerp(bc, ac, k); b.y = lerp(br, ar, k);
      if (this.swap.t >= 1) this.finishSwap();
    }

    if (this.custom) {
      const C = this.custom;
      C.t += dt / C.dur;
      const k = C.easing(Math.min(1, C.t));
      for (const m of C.moves) { m.g.x = lerp(m.fx, m.tx, k); m.g.y = lerp(m.fy, m.ty, k); }
      if (C.t >= 1) { this.custom = null; C.done && C.done(); }
    }

    let anyFalling = false;
    for (const g of this.gems) {
      g.anim += dt;
      if (g.born > 0) g.born = Math.max(0, g.born - dt * 1.5);
      if (g.zap > 0) g.zap = Math.max(0, g.zap - dt * 2);
      if (g.squash > 0) g.squash = Math.max(0, g.squash - dt * 5);
      // spring offset
      if (g.ox || g.oy || g.ovx || g.ovy) {
        const k = 260, d = 14;
        g.ovx += (-k * g.ox - d * g.ovx) * dt;
        g.ovy += (-k * g.oy - d * g.ovy) * dt;
        g.ox += g.ovx * dt; g.oy += g.ovy * dt;
        if (Math.abs(g.ox) + Math.abs(g.oy) + Math.abs(g.ovx) + Math.abs(g.ovy) < 0.002) g.ox = g.oy = g.ovx = g.ovy = 0;
      }
      if (g.flying) {
        const f = g.flying;
        if (f.delay > 0) { f.delay -= dt; continue; }
        f.vy += GRAVITY * 0.7 * dt;
        g.x += f.vx * dt; g.y += f.vy * dt; f.rot += f.vr * dt;
        if (g.y > ROWS + 4) g.dead = true;
        continue;
      }
      if (g.dying) {
        g.dying.t += dt;
        const d = g.dying;
        if (d.kind === 'into') {
          const k = ease.inQuad(Math.min(1, d.t / d.dur));
          g.x = lerp(d.sx, d.tx, k); g.y = lerp(d.sy, d.ty, k);
        }
        if (d.t >= d.dur) g.dead = true;
        continue;
      }
      if (g.falling) {
        anyFalling = true;
        if (g.delay > 0) { g.delay -= dt; continue; }
        g.vy = Math.min(g.vy + GRAVITY * dt, MAX_FALL);
        g.y += g.vy * dt;
        if (g.y >= g.row) {
          const impact = g.vy;
          g.y = g.row;
          if (!g.bounced && impact > 5) {
            g.vy = -impact * BOUNCE;
            g.bounced = true;
            g.squash = Math.min(1, impact / 18);
            this.onLand(g, impact);
          } else {
            g.vy = 0;
            g.falling = false;
            g.bounced = false;
          }
        }
      }
    }
    if (this.gems.some((g) => g.dead)) this.gems = this.gems.filter((g) => !g.dead);

    // phase machine
    if (this.phase === 'clearing') {
      if (!this.timers.length && !this.gems.some((g) => g.dying)) this.collapse();
    } else if (this.phase === 'falling') {
      if (!anyFalling) {
        const groups = this.findGroups();
        if (groups.length) this.resolve(groups);
        else this.settle();
      }
    }
  }

  onLand(g, impact) {
    if (this.landSounds < 3) {
      this.landSounds++;
      this.audio.play('gem_hit', { volume: clamp(impact / 30, 0.08, 0.35), rate: rand(0.9, 1.15), minGap: 0.02, pan: (g.col - 3.5) / 6 });
    }
  }

  settle() {
    this.phase = 'idle';
    const intro = this.introDrop;
    this.introDrop = false;
    this.game.onSettled && this.game.onSettled(this.cascade, intro);
    this.cascade = 0;
  }

  // ------------------------------------------------------------ drawing
  draw(ctx, t) {
    const A = this.A;
    // board background: translucent checkerboard
    ctx.save();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) & 1 ? 'rgba(0,0,0,0.45)' : 'rgba(20,10,40,0.30)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    ctx.restore();

    this.fx.draw(ctx, 'under');

    ctx.save();
    if (this.clipTop) {
      ctx.beginPath();
      ctx.rect(-200, 0, COLS * CELL + 400, ROWS * CELL + (this.clipBottom ? 0 : 400));
      ctx.clip();
    }
    // hint highlight under gems
    if (this.hint && this.phase === 'idle') {
      const [h] = this.hint;
      const k = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.4 * k;
      A.s('p_ring').drawC(ctx, 0, this.px(h), this.py(h), 1.1 + 0.15 * k);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // soft drop shadows in their own pass so they never cover neighbouring gems
    for (const g of this.gems) this.drawShadow(ctx, g);

    const order = this.gems.slice().sort((p, q) => (p.flying ? 1 : 0) - (q.flying ? 1 : 0) || (p === this.swap?.a ? 1 : 0) - (q === this.swap?.a ? 1 : 0));
    for (const g of order) this.drawGem(ctx, g);
    ctx.restore();

    // selector
    if (this.selected && !this.selected.dying) {
      const g = this.selected;
      const s = 1 + 0.04 * Math.sin(this.time * 8);
      A.s('selector').drawC(ctx, 0, this.px(g), this.py(g), s);
    }
    // hint arrow
    if (this.hint && this.phase === 'idle') {
      const [h] = this.hint;
      const bob = Math.abs(Math.sin(this.time * 5)) * 22;
      A.s('hintarrow').drawC(ctx, 0, this.px(h), this.py(h) - CELL * 0.62 - bob, 1.1);
    }

    this.fx.draw(ctx, 'over');
  }

  drawShadow(ctx, g) {
    if (g.flying || g.type === 'hyper' || g.color < 0 || g.bfly) return;
    if (g.y < -1.2 && this.clipTop) return;
    let scale = g.scale, alpha = 0.55 * g.alpha;
    const d = g.dying;
    if (d) {
      const k = Math.min(1, d.t / d.dur);
      if (d.kind === 'shatter') scale *= 1 - k;
      else alpha *= 1 - k;
      if (alpha <= 0.01 || scale <= 0.01) return;
    }
    let frame = 0;
    if (g === this.selected) frame = (this.time * 22) | 0;
    else if (g.type !== 'normal') frame = ((g.anim * 14) | 0) % 20;
    ctx.globalAlpha = alpha;
    this.A.s('gemshadow' + g.color).drawC(ctx, frame, this.px(g) + 5, this.py(g) + 8, scale * (1 + 0.1 * g.squash));
    ctx.globalAlpha = 1;
  }

  drawGem(ctx, g) {
    if (g.y < -1.2 && this.clipTop && !g.flying) return;
    const A = this.A;
    const x = this.px(g), y = this.py(g);
    let scale = g.scale, alpha = g.alpha;
    let rot = 0;
    const d = g.dying;
    if (d) {
      const k = Math.min(1, d.t / d.dur);
      if (d.kind === 'shatter') { scale *= k < 0.3 ? 1 + k * 0.5 : 1.15 * (1 - ease.inQuad((k - 0.3) / 0.7)); }
      else if (d.kind === 'into') { scale *= 1 - k * 0.4; alpha *= 1 - k * 0.6; }
      else if (d.kind === 'blast') { scale *= 1 + k * 0.6; alpha *= 1 - k; }
      else if (d.kind === 'hyper') { scale *= 1.1 + 0.08 * Math.sin(d.t * 30); }
    }
    if (g.flying) rot = g.flying.rot;
    if (g === this.swap?.a) scale *= 1 + 0.1 * Math.sin(Math.PI * Math.min(1, this.swap.t));
    if (g === this.swap?.b) scale *= 1 - 0.08 * Math.sin(Math.PI * Math.min(1, this.swap.t));
    if (g.born > 0) scale *= 1 + 0.25 * ease.outElastic(1 - g.born) * g.born;
    const sx = scale * (1 + 0.14 * g.squash), sy = scale * (1 - 0.14 * g.squash);
    const yAdj = y + (CELL * 0.5) * (1 - sy) * 0.8; // squash anchored near bottom

    ctx.globalAlpha = alpha;
    if (this.game.drawGemCustom && this.game.drawGemCustom(ctx, g, x, yAdj, sx, sy, alpha, rot)) { ctx.globalAlpha = 1; return; }
    if (g.type === 'hyper') {
      const hf = (g.anim * 30) | 0;
      ctx.globalCompositeOperation = 'lighter';
      A.s('hypercubeglow').drawC(ctx, hf, x, y, scale * 1.05, rot);
      ctx.globalCompositeOperation = 'source-over';
      A.s('hypercube').drawC(ctx, hf, x, yAdj, sx, rot);
      ctx.globalAlpha = 1;
      return;
    }
    const sheet = A.s('gem' + g.color);
    let frame = 0;
    if (g === this.selected) frame = (this.time * 22) | 0;
    else if (g.type !== 'normal') frame = ((g.anim * 14) | 0) % 20; // specials slowly spin

    if (g.type === 'flame') {
      const pulse = 0.75 + 0.25 * Math.sin(g.anim * 7);
      ctx.globalAlpha = alpha;
      A.s('bombglow').drawC(ctx, g.color, x, y, scale * 1.1, rot);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * pulse * 0.6;
      A.s('bombglow').drawC(ctx, g.color, x, y, scale * 1.15, rot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      if (!d && Math.random() < 0.25 * this.fx.quality) this.fx.flameLick(x, y);
    }
    if (g.type === 'nova') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.8;
      A.tintedSprite('hyperflarering', GEM_GLOWS[g.color]).drawC(ctx, 0, x, y, scale * 0.95, g.anim * 1.5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }

    if (sx !== 1 || sy !== 1 || rot) {
      ctx.save();
      ctx.translate(x, yAdj);
      if (rot) ctx.rotate(rot);
      ctx.scale(sx, sy);
      sheet.drawC(ctx, frame, 0, 0, 1);
      ctx.restore();
    } else sheet.drawC(ctx, frame, x, y, 1);

    // brightening flash on dying / zapped / newly created gems
    let glow = 0;
    if (d && d.kind === 'shatter') glow = Math.min(1, d.t / d.dur * 2.5);
    if (g.zap) glow = Math.max(glow, g.zap);
    if (g.born) glow = Math.max(glow, g.born * 0.8);
    if (glow > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * glow * 0.8;
      if (sx !== 1 || sy !== 1) {
        ctx.save(); ctx.translate(x, yAdj); ctx.scale(sx, sy); sheet.drawC(ctx, frame, 0, 0, 1); ctx.restore();
      } else sheet.drawC(ctx, frame, x, y, 1);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (g.type === 'star' || g.type === 'nova') {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.7 + 0.3 * Math.sin(g.anim * 5);
      ctx.globalAlpha = alpha * pulse;
      A.s('p_starglow').drawC(ctx, 0, x, y, scale * (g.type === 'nova' ? 0.85 : 0.65), g.anim * 0.8);
      ctx.globalAlpha = alpha * 0.5;
      A.s('p_starglow').drawC(ctx, 0, x, y, scale * 0.45, -g.anim * 1.3 + 0.4);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.game.drawGemOverlay) { ctx.globalAlpha = alpha; this.game.drawGemOverlay(ctx, g, x, yAdj, sx, sy, alpha); }
    ctx.globalAlpha = 1;
  }

  // board cell from board-local pixel coordinates
  cellAt(x, y) {
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c, r };
  }
}
