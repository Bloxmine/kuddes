// Shared game-mode scene: board, frames, side widgets, input, dialogs, level/game-over sequences.
// Modes (classic, zen, lightning, butterflies, diamond mine) subclass this and override hooks.
import { Board, CELL, COLS, ROWS, canSwap } from './board.js';
import { Button, Slider, Dialog } from './ui.js';
import { clamp, lerp, ease, rand, formatNumber, store, GEM_GLOWS } from './util.js';
import { submitScore } from './host.js';

const COMPLIMENTS = ['good', 'excellent', 'awesome', 'spectacular', 'extraordinary', 'unbelievable'];
// "Get ready" starts after GET_READY_DELAY and lasts about 1.55 s; "Go" waits a moment after it
const GET_READY_DELAY = 0.2, GO_AFTER = GET_READY_DELAY + 1.55 + 0.6;

// original-layout reference points (1920x1200 space)
export const REF_BOARD = [679, 81], REF_SCORE = [260, 122], REF_LEVEL = [261, 733];

export class BaseMode {
  constructor(app) {
    this.app = app;
    this.A = app.A;
    this.fx = app.fx;
    this.audio = app.audio;
    this.fonts = app.fonts;
    // overridable configuration
    this.id = 'classic';
    this.title = 'Classic';
    this.music = 'classic';
    this.loseMusic = 'classic_lose';
    this.autoHint = 15;
    this.hasLevels = true;
    // no game over (Zen): the score counts when you stop playing
    this.endless = false;
  }

  enter() {
    this.app.badges.hold = true;
    this.reset(this.resume);
    this.resume = null;
    this.audio.playMusic(this.music, 2.0);
  }

  exit() { this.saveBest(); if (this.endless) this.submit(); this.save(); this.app.badges.release(); }

  // ------------------------------------------------------------ save / continue
  get saveKey() { return 'save_' + this.id; }
  static savedGame(id) { const s = store('save_' + id); return s && s.v === 1 ? s : null; }

  save() {
    if (!this.board || this.phase !== 'play' || this.board.phase !== 'idle') return;
    store(this.saveKey, {
      v: 1, score: this.score, level: this.level, levelStart: this.levelStart, goal: this.goal,
      stats: this.stats, grid: this.board.serialize(), extra: this.saveExtra(), when: Date.now(), reported: this.reported,
    });
  }
  clearSave() { store(this.saveKey, null); }
  saveExtra() { return {}; }
  loadExtra() {}

  restore(s) {
    this.score = this.displayScore = s.score;
    this.reported = s.reported || 0;
    this.level = s.level;
    this.levelStart = s.levelStart;
    this.goal = s.goal;
    Object.assign(this.stats, s.stats);
    this.loadExtra(s.extra || {});
    this.app.setBackground(this.currentBg(), 1.2);
    this.board.fillFrom(s.grid);
  }
  currentBg() { return this.bgFor(this.level); }

  reset(saved) {
    this.score = 0;
    this.displayScore = 0;
    this.reported = 0;
    this.level = 1;
    this.levelStart = 0;
    this.goal = this.goalFor(1);
    this.displayProgress = 0;
    this.stats = { bestMove: 0, longestCascade: 0, time: 0, moves: 0, flame: 0, star: 0, hyper: 0, nova: 0 };
    this.moveScore = 0;
    this.phase = 'intro';
    this.idleT = 0;
    this.pending = null;
    this.drag = null;
    this.dialog = null;
    this.paused = false;
    this.seq = [];
    this.flash = { top: 0, bottom: 0, bar: 0 };
    this.lastCompliment = 0;
    this.hover = null;
    this.fx.clear();
    this.board = new Board(this);
    this.resetMode();
    if (saved) this.restore(saved);
    else {
      this.app.setBackground(this.currentBg(), 1.2);
      this.board.fill(true);
    }
    this.sayGo = true;
    this.readyAt = this.app.time;
    this.audio.play('voice_getready', { volume: 0.9, delay: GET_READY_DELAY });
  }

  resetMode() {}

  // points needed for a level (points also scale with level, so moves-per-level grows slowly)
  goalFor(level) { return level * (2000 + 450 * (level - 1)); }
  bgFor(level) { const bgs = this.app.A.manifest.backgrounds; return bgs[(level - 1) % bgs.length]; }
  get progress() { return clamp((this.score - this.levelStart) / this.goal, 0, 1); }
  get pointsMultiplier() { return this.level; }

  // ------------------------------------------------------------ layout helpers
  get L() { return this.app.layout; }
  get wide() { return this.L.w > this.L.h; }
  // modes with a taller top bar (lightning, diamond mine) push the board down
  get boardShift() { return [0, 0]; }
  get boardPos() { const b = this.L.board, s = this.boardShift; return [b[0] + s[0], b[1] + s[1]]; }
  get off() { const b = this.boardPos; return [b[0] - REF_BOARD[0], b[1] - REF_BOARD[1]]; }
  get scoreOff() { const s = this.L.score, dy = this.wide ? 0 : this.boardShift[1]; return [s[0] - REF_SCORE[0], s[1] - REF_SCORE[1] + dy]; }
  get levelOff() { const s = this.L.level, dy = this.wide ? 0 : this.boardShift[1]; return [s[0] - REF_LEVEL[0], s[1] - REF_LEVEL[1] + dy]; }

  // Side panel buttons: sprite drawn at its original position (shifted by the level-group offset).
  // { sprite, action, hoverFrame, pressFrame, r (hit radius) }
  panelButtons() {
    return [
      { sprite: 'ui_hintbutton', action: 'hint', hoverFrame: 1 },
      { sprite: 'ui_menubutton', action: 'menu', hoverFrame: 1 },
    ];
  }
  panelWidget() { return 'ui_bottomwidget'; }

  buttonGeom(b) {
    const sp = this.A.s(b.sprite);
    const [ox, oy] = this.levelOff;
    const x = sp.x + ox + (b.dx || 0), y = sp.y + oy + (b.dy || 0);
    return { sp, x, y, cx: x + sp.fw / 2, cy: y + sp.fh / 2, r: b.r || Math.min(sp.fw, sp.fh) * 0.47 };
  }

  buttonAt(px, py) {
    for (const b of this.panelButtons()) {
      const g = this.buttonGeom(b);
      if (Math.hypot(px - g.cx, py - g.cy) < g.r) return b;
    }
    return null;
  }

  panelAction(action) {
    if (action === 'hint') this.showHint();
    else if (action === 'menu') { this.audio.play('button_press'); this.openPause(); }
    else if (action === 'reset') { this.audio.play('button_press'); this.confirmRestart(); }
  }

  after(t, fn) { this.seq.push({ t, fn }); }

  // ------------------------------------------------------------ board hooks
  addPoints(pts, x, y, color, small) {
    pts = Math.round(pts * this.pointsMultiplier);
    this.score += pts;
    if (this.scoreBadge) this.app.badges.report(this.scoreBadge, this.score);
    this.moveScore += pts;
    this.flash.bar = 1;
    if (!small) this.fx.scorePopup(x, y, formatNumber(pts), GEM_GLOWS[color] || '#ffffff', 58 + Math.min(40, pts / (this.pointsMultiplier * 40)));
  }

  onMoveStart() {
    this.stats.moves++;
    this.idleT = 0;
    this.lastCompliment = 0;
    this.moveScore = 0;
  }

  onCascade(c) {
    this.stats.longestCascade = Math.max(this.stats.longestCascade, c);
    if (c >= 3 && c > this.lastCompliment && this.phase === 'play') {
      this.lastCompliment = c;
      const name = COMPLIMENTS[Math.min(c - 3, COMPLIMENTS.length - 1)];
      this.fx.compliment(COLS * CELL / 2, ROWS * CELL / 2, 'cmp_' + name);
      this.audio.play('voice_' + name, { volume: 1, minGap: 0.5 });
      this.flash.top = this.flash.bottom = 1;
    }
  }

  onSpecialCreated(type) { this.stats[type]++; }
  onSpecialUsed() { this.flash.bottom = Math.max(this.flash.bottom, 0.6); }
  onBadMove() { this.idleT = 0; }

  onSettled(cascade, intro) {
    if (this.moveScore > this.stats.bestMove) this.stats.bestMove = this.moveScore;
    this.moveScore = 0;
    if (!intro && this.board.moveKills) { this.app.badges.report('blaster', this.board.moveKills); this.board.moveKills = 0; }
    this.onMoveSettled && this.onMoveSettled();
    if (this.phase === 'intro') this.phase = 'play';
    if (this.phase !== 'play') return;
    if (intro && this.sayGo) {
      this.sayGo = false;
      this.audio.play('voice_go', { volume: 1, delay: Math.max(0, this.readyAt + GO_AFTER - this.app.time) });
    }
    if (this.afterSettle(intro) === false) return; // mode took over (sequence started)
    this.save();
    if (this.pending) {
      const [a, b] = this.pending;
      this.pending = null;
      if (this.board.grid[a.row]?.[a.col] === a && this.board.grid[b.row]?.[b.col] === b) this.board.trySwap(a, b);
    }
  }

  // Default (classic) rules. Return false when a sequence took over the board.
  afterSettle() {
    if (this.hasLevels && this.progress >= 1) { this.levelComplete(); return false; }
    if (!this.board.findMove()) { this.noMoves(); return false; }
    return true;
  }

  noMoves() { this.gameOver('NO MORE MOVES', 'voice_nomoremoves'); }

  // ------------------------------------------------------------ sequences
  levelComplete() {
    if (this.phase !== 'play') return;
    this.phase = 'levelup';
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.audio.play('voice_levelcomplete', { volume: 1 });
    this.audio.play('rankup', { volume: 0.7 });
    this.fx.bigText(cx, cy, 'LEVEL COMPLETE', { size: 120, life: 2.0, colors: { MAIN: '#ffffff', OUTLINE: '#5a1060', GLOW: '#ffd040' } });
    this.flash.top = this.flash.bottom = 1;
    this.after(1.1, () => {
      this.board.clipTop = false;
      this.board.dropAll();
      this.audio.play('menuspin', { volume: 0.6 });
    });
    this.after(2.0, () => {
      this.level++;
      this.levelStart = this.score;
      this.goal = this.goalFor(this.level);
      this.displayProgress = 0;
      this.app.setBackground(this.bgFor(this.level), 1.6);
      this.audio.play('background_change', { volume: 0.9 });
      this.fx.bigText(cx, cy, 'LEVEL ' + this.level, { size: 130, life: 1.8, delay: 0.4, colors: { MAIN: '#ffffff', OUTLINE: '#3a0a50', GLOW: '#60c0ff' } });
    });
    this.after(3.6, () => this.refill());
  }

  refill() {
    this.board.clipTop = true;
    this.phase = 'intro';
    this.board.fill(true);
  }

  // shuffle: gems tumble away and a fresh board drops in (used by modes without a no-moves game over)
  reshuffle(text = 'NO MORE MOVES') {
    if (this.phase !== 'play') return;
    this.phase = 'shuffle';
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.fx.bigText(cx, cy, text, { size: 110, life: 1.6, colors: { MAIN: '#ffffff', OUTLINE: '#20304a', GLOW: '#80c0ff' } });
    this.audio.play('scramble', { volume: 0.9 });
    this.after(0.9, () => {
      if (this.board.scramble()) { this.phase = 'play'; this.board.resolveOrSettle(); return; }
      this.board.clipTop = false;
      this.board.dropAll();
      this.after(1.0, () => this.refill());
    });
  }

  gameOver(text, voice) {
    if (this.phase !== 'play' && this.phase !== 'intro') return;
    this.phase = 'gameover';
    this.clearSave();
    this.submit();
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.audio.stopMusic(0.5);
    if (voice) this.audio.play(voice, { volume: 1, delay: 0.1 });
    this.fx.bigText(cx, cy, text, { size: 120, life: 2.6, colors: { MAIN: '#ffffff', OUTLINE: '#400010', GLOW: '#ff4040' } });
    this.after(0.6, () => this.audio.playMusic(this.loseMusic, 0.2));
    this.after(1.6, () => this.board.shatterAll());
    this.after(3.6, () => {
      this.audio.play('voice_gameover', { volume: 1 });
      this.saveBest();
      // badges earned during the game are presented now, then the results
      this.app.badges.release(() => { this.app.badges.hold = true; this.showGameOver(); });
    });
  }

  // On Kuddes: onto the high-score list of this mode (once per score)
  submit() {
    if (this.score <= this.reported) return;
    this.reported = this.score;
    const st = this.stats;
    submitScore(this.id, this.score, {
      level: this.level, bestMove: st.bestMove, cascade: st.longestCascade, seconds: st.time, moves: st.moves,
      flame: st.flame, star: st.star, hyper: st.hyper, nova: st.nova, ...this.submitExtra(),
    });
  }
  submitExtra() { return {}; }

  get bestKey() { return this.id + 'Best'; }
  saveBest() {
    const best = store(this.bestKey) || { score: 0, level: 0 };
    this.wasBest = this.score > best.score;
    if (this.wasBest) store(this.bestKey, { score: this.score, level: this.level });
  }

  fmtTime(t) { return `${Math.floor(t / 60)}m ${String(Math.floor(t % 60)).padStart(2, '0')}s`; }

  statRows() {
    const st = this.stats;
    return [
      ['Final Score', formatNumber(this.score)],
      ['Level Achieved', String(this.level)],
      ['Best Move', formatNumber(st.bestMove)],
      ['Longest Cascade', String(st.longestCascade)],
      ['Total Time', this.fmtTime(st.time)],
    ];
  }

  // ------------------------------------------------------------ dialogs
  showGameOver() {
    const L = this.L;
    const rows = this.statRows();
    const w = Math.min(900, L.w - 80), h = 520 + rows.length * 66;
    const d = new Dialog(this.app, 'Game Over', (L.w - w) / 2, (L.h - h) / 2, w, h);
    const st = this.stats;
    d.body = (ctx) => {
      let y = 170;
      for (const [k, v] of rows) {
        this.fonts.ui.draw(ctx, k, 80, y, { size: 42, colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
        this.fonts.ui.draw(ctx, v, w - 80, y, { size: 42, align: 'right', colors: { MAIN: '#ffffff', OUTLINE: '#5a1a40', GLOW: null } });
        y += 66;
      }
      const icons = [['go_iconflame', st.flame], ['go_iconstar', st.star + st.nova], ['go_iconhypercube', st.hyper]];
      const span = w / (icons.length + 1);
      icons.forEach(([icon, n], i) => {
        const x = span * (i + 1);
        this.A.s(icon).drawC(ctx, 0, x - 40, y + 30, 1);
        this.fonts.ui.draw(ctx, '× ' + n, x + 5, y + 30, { size: 44, valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a1a40', GLOW: null } });
      });
      if (this.wasBest && this.score > 0)
        this.fonts.ui.draw(ctx, 'New personal best!', w / 2, y + 120, { size: 40, align: 'center', colors: { MAIN: '#fff4a0', OUTLINE: '#6a3000', GLOW: '#ffb000' } });
    };
    const bw = (w - 200) / 2;
    d.add(new Button(this.app, 'Play Again', 80, h - 150, bw, 100, () => d.close(() => this.restart())));
    d.add(new Button(this.app, 'Main Menu', w - 80 - bw, h - 150, bw, 100, () => d.close(() => this.toMenu())));
    this.dialog = d;
  }

  openPause() {
    if (this.dialog || this.phase === 'gameover') return;
    this.paused = true;
    this.audio.play('menuspin', { volume: 0.5 });
    const L = this.L;
    const w = Math.min(760, L.w - 80), h = 780;
    const d = new Dialog(this.app, 'Paused', (L.w - w) / 2, (L.h - h) / 2, w, h);
    const bw = w - 200;
    d.add(new Button(this.app, 'Resume', 100, 140, bw, 100, () => d.close(() => (this.paused = false))));
    d.add(new Button(this.app, 'Restart', 100, 260, bw, 100, () => d.close(() => this.restart())));
    d.add(new Button(this.app, 'Main Menu', 100, 380, bw, 100, () => d.close(() => this.toMenu())));
    d.add(new Slider(this.app, 'Music', 110, 560, bw - 20, this.audio.musicVolume, (v) => this.audio.setMusicVolume(v)));
    d.add(new Slider(this.app, 'Sound', 110, 680, bw - 20, this.audio.sfxVolume, (v) => this.audio.setSfxVolume(v)));
    this.dialog = d;
  }

  confirmRestart() {
    if (this.dialog || this.phase === 'gameover') return;
    this.paused = true;
    const L = this.L;
    const w = Math.min(700, L.w - 80), h = 400;
    const d = new Dialog(this.app, 'Restart?', (L.w - w) / 2, (L.h - h) / 2, w, h);
    d.body = (ctx) => this.fonts.text.draw(ctx, 'Start a new game?', w / 2, 170, { size: 40, align: 'center', colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
    const bw = (w - 200) / 2;
    d.add(new Button(this.app, 'Yes', 80, h - 150, bw, 100, () => d.close(() => this.restart())));
    d.add(new Button(this.app, 'No', w - 80 - bw, h - 150, bw, 100, () => d.close(() => (this.paused = false))));
    this.dialog = d;
  }

  restart() {
    this.saveBest();
    if (this.endless) this.submit();
    this.clearSave();
    this.audio.playMusic(this.music, 1);
    this.reset();
  }

  toMenu() {
    this.saveBest();
    if (this.endless) this.submit();
    this.audio.play('backtomain', { volume: 0.8 });
    import('./menu.js').then((m) => this.app.setScene(new m.ModeSelectScene(this.app)));
  }

  // ------------------------------------------------------------ input
  boardLocal(x, y) { const [bx, by] = this.boardPos; return [x - bx, y - by]; }

  pointerDown(x, y) {
    if (this.dialog) return this.dialog.pointerDown(x, y);
    const btn = this.buttonAt(x, y);
    if (btn) { this.pressed = btn; return this.panelAction(btn.action); }
    if (this.phase !== 'play') return;
    const [lx, ly] = this.boardLocal(x, y);
    const cell = this.board.cellAt(lx, ly);
    if (!cell) { this.board.selected = null; return; }
    const g = this.board.at(cell.c, cell.r);
    if (!canSwap(g)) return;
    const sel = this.board.selected;
    if (sel && sel !== g && Math.abs(sel.col - g.col) + Math.abs(sel.row - g.row) === 1) {
      this.queueSwap(sel, g);
      return;
    }
    this.drag = { gem: g, x: lx, y: ly, wasSelected: sel === g };
    if (sel !== g) {
      this.board.selected = g;
      this.audio.play('select', { volume: 0.7 });
    }
  }

  pointerMove(x, y) {
    if (this.dialog) return this.dialog.pointerMove(x, y);
    this.hover = this.buttonAt(x, y);
    if (!this.drag) return;
    const [lx, ly] = this.boardLocal(x, y);
    const dx = lx - this.drag.x, dy = ly - this.drag.y;
    if (Math.hypot(dx, dy) < CELL * 0.3) return;
    const g = this.drag.gem;
    const [dc, dr] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    const n = this.board.at(g.col + dc, g.row + dr);
    this.drag = null;
    if (canSwap(n)) this.queueSwap(g, n);
  }

  pointerUp(x, y) {
    this.pressed = null;
    if (this.dialog) return this.dialog.pointerUp(x, y);
    if (this.drag && this.drag.wasSelected) this.board.selected = null;
    this.drag = null;
  }

  keyDown(e) {
    if (e.key === 'Escape' || e.key === 'p') {
      if (this.dialog && this.paused) this.dialog.close(() => (this.paused = false));
      else this.openPause();
    } else if (e.key === 'h') this.showHint();
  }

  queueSwap(a, b) {
    this.idleT = 0;
    this.board.hint = null;
    if (this.board.phase === 'idle' && this.phase === 'play') this.board.trySwap(a, b);
    else { this.pending = [a, b]; this.board.selected = null; }
  }

  showHint() {
    if (this.phase !== 'play' || this.board.phase !== 'idle') return;
    this.audio.play('button_press', { volume: 0.7 });
    this.board.hint = this.board.findMove();
    this.idleT = 0;
  }

  // ------------------------------------------------------------ update
  get clockRunning() { return this.phase === 'play' || this.phase === 'intro'; }

  update(dt) {
    if (this.dialog) {
      this.dialog.update(dt);
      if (this.dialog.done) {
        const cb = this.dialog.onClosed;
        this.dialog = null;
        cb && cb();
      }
    }
    if (this.paused) return;
    if (this.clockRunning) this.stats.time += dt;

    if (this.seq.length) {
      const due = [];
      for (const s of this.seq) { s.t -= dt; if (s.t <= 0) due.push(s); }
      if (due.length) { this.seq = this.seq.filter((s) => s.t > 0); for (const s of due) s.fn(); }
    }

    this.board.update(dt);
    this.fx.update(dt);
    this.updateMode(dt);

    if (this.autoHint && this.phase === 'play' && this.board.phase === 'idle') {
      this.idleT += dt;
      if (this.idleT > this.autoHint && !this.board.hint) this.board.hint = this.board.findMove();
    }

    const diff = this.score - this.displayScore;
    this.displayScore = diff < 1 ? this.score : this.displayScore + Math.max(1, diff * Math.min(1, dt * 6));
    this.displayProgress = lerp(this.displayProgress, this.barValue(), Math.min(1, dt * 4));
    for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 1.5);
  }

  updateMode() {}
  barValue() { return this.phase === 'levelup' ? 1 : this.progress; }

  // ------------------------------------------------------------ drawing
  draw(ctx, dt) {
    const A = this.A, app = this.app;
    const [bx, by] = this.boardPos;
    const [ox, oy] = this.off;
    this.drawBackdrop(ctx);
    app.drawMotes(ctx, dt);
    this.drawGlows(ctx, ox, oy);
    this.drawBehindBoard(ctx);

    // board
    ctx.save();
    ctx.translate(bx + this.fx.shakeX, by + this.fx.shakeY);
    if (this.paused) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) & 1 ? 'rgba(0,0,0,0.6)' : 'rgba(20,10,40,0.5)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    } else {
      this.board.draw(ctx, app.time);
      this.drawOnBoard(ctx);
    }
    ctx.restore();

    this.drawTopFrame(ctx, ox, oy);
    this.drawBottomFrame(ctx, ox, oy);
    this.drawScoreWidget(ctx);
    this.drawPanel(ctx);
    this.drawOverlay(ctx);

    ctx.save();
    ctx.translate(bx, by);
    this.fx.draw(ctx, 'top');
    ctx.restore();

    if (this.dialog) this.dialog.draw(ctx);
  }

  // logical-space rectangle currently visible on screen (for full-bleed backdrops)
  visibleRect() {
    const a = this.app;
    return [-a.offX / a.scale, -a.offY / a.scale, (a.canvas.width - a.offX) / a.scale, (a.canvas.height - a.offY) / a.scale];
  }
  drawBackdrop() {}
  drawOverlay() {}
  drawGlows(ctx, ox, oy) {
    const A = this.A;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.25 + 0.1 * Math.sin(this.app.time * 2);
    ctx.globalAlpha = clamp(pulse + this.flash.top, 0, 1);
    A.tintedSprite('ui_topframeglow', this.glowColor).drawAt(ctx, ox, oy);
    ctx.globalAlpha = clamp(pulse + this.flash.bottom, 0, 1);
    A.tintedSprite('ui_bottomframeglow', this.glowColor).drawAt(ctx, ox, oy);
    ctx.restore();
  }
  drawBottomFrame(ctx, ox, oy) {
    this.drawBar(ctx, ox, oy);
    this.A.s('ui_bottomframe').drawAt(ctx, ox, oy);
  }

  get glowColor() { return '#ff70e0'; }
  drawBehindBoard() {}
  drawOnBoard() {}
  drawTopFrame(ctx, ox, oy) { this.A.s('ui_topframe').drawAt(ctx, ox, oy); }

  drawScoreText(ctx, cx, cy, maxW = 220, size = 54) {
    const scoreText = formatNumber(this.displayScore);
    const w = this.fonts.score.measure(scoreText, size);
    if (w > maxW) size *= maxW / w;
    this.fonts.score.draw(ctx, scoreText, cx, cy, {
      size, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#3a0838', GLOW: '#ff60e0' },
    });
  }

  // classic-style score widget: score slot + orb (level number by default)
  drawScoreWidget(ctx) {
    const [sx, sy] = this.scoreOff;
    this.A.s('ui_topwidget').drawAt(ctx, sx, sy, 0);
    const cx = REF_SCORE[0] + 140 + sx;
    this.drawScoreText(ctx, cx, REF_SCORE[1] + 62 + sy);
    const [orb, label] = this.orbText();
    this.fonts.level.draw(ctx, orb, cx, REF_SCORE[1] + 121 + sy, {
      size: orb.length > 1 ? 34 : 44, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#5a0a50', DROPSHADOW: '#200020' },
    });
    this.fonts.small.draw(ctx, label, cx, REF_SCORE[1] + 184 + sy, { size: 26, align: 'center', colors: { MAIN: '#ffd0f0', OUTLINE: '#2a0020' } });
  }
  orbText() { return [String(this.level), 'LEVEL']; }

  drawPanel(ctx) {
    const A = this.A;
    const [lx, ly] = this.levelOff;
    A.s(this.panelWidget()).drawAt(ctx, lx, ly);
    this.drawPanelContent(ctx, lx, ly);
    for (const b of this.panelButtons()) {
      const g = this.buttonGeom(b);
      const hov = this.hover === b || (this.hover && this.hover.action === b.action);
      const frame = this.pressed && this.pressed.action === b.action && b.pressFrame !== undefined ? b.pressFrame : hov ? (b.hoverFrame ?? 0) : 0;
      g.sp.draw(ctx, frame, g.x, g.y);
      if (b.action === 'hint' && this.board.hint) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.5 + 0.5 * Math.sin(this.app.time * 6)) * 0.4;
        g.sp.draw(ctx, b.hoverFrame ?? 0, g.x, g.y); ctx.restore();
      }
    }
  }
  drawPanelContent() {}

  // bottom bar: classic level progress
  drawBar(ctx, ox, oy) {
    this.drawFillBar(ctx, ox, oy, this.displayProgress, ['#ffe080', '#ff9a20', '#c03000']);
  }

  barRect(ox, oy) {
    const back = this.A.s('ui_bottomframeback');
    return [back.x + ox + 6, back.y + oy + 7, back.fw - 12, back.fh - 14];
  }

  drawFillBar(ctx, ox, oy, p, stops, text) {
    const A = this.A;
    A.s('ui_bottomframeback').drawAt(ctx, ox, oy);
    const [x0, y0, W, H] = this.barRect(ox, oy);
    const fw = W * clamp(p, 0, 1);
    if (fw > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x0, y0, fw, H, H / 2) : ctx.rect(x0, y0, fw, H);
      ctx.clip();
      const g = ctx.createLinearGradient(0, y0, 0, y0 + H);
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, fw, H);
      const t = this.app.time;
      ctx.globalCompositeOperation = 'lighter';
      const sh = ctx.createLinearGradient(x0, 0, x0 + 300, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,220,0.45)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.translate(((t * 400) % (W + 600)) - 300, 0);
      ctx.fillStyle = sh;
      ctx.fillRect(x0, y0, 300, H);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + 0.4 * this.flash.bar;
      A.s('p_basicblur').drawC(ctx, 0, x0 + fw, y0 + H / 2, 0.6 + 0.3 * this.flash.bar);
      A.s('sparkle').drawC(ctx, (this.app.time * 20) % 14, x0 + fw, y0 + H / 2, 1.2);
      ctx.restore();
    }
    if (text) this.fonts.text.draw(ctx, text, x0 + W / 2, y0 + H / 2, { size: 30, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#200818', GLOW: null } });
  }
}
