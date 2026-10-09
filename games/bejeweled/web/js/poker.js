// Poker: every move deals a card in the colour of the gems you matched; five cards make a poker
// hand (Flush, 4 of a Kind, Full House, 3 of a Kind, 2 Pair, Spectrum, Pair) that scores, and hand
// values grow with every hand. Now and then a Skull lands on a hand: make that hand and the Skull
// Coin decides (clover: safe, skull: game over). Completed hands fill the Skull Eliminator, which
// takes a Skull away when full. No more moves just reshuffles the board.
import { BaseMode } from './mode.js';
import { CELL, COLS, ROWS } from './board.js';
import { clamp, ease, formatNumber, store } from './util.js';

// best first, as in the table on the panel
export const HANDS = [
  { id: 'flush', name: 'Flush', base: 750, fill: 0.6, sound: 'poker_flush', voice: 'voice_unbelievable' },
  { id: 'four', name: '4 of a Kind', base: 500, fill: 0.45, sound: 'poker_4ofakind', voice: 'voice_extraordinary' },
  { id: 'fullhouse', name: 'Full House', base: 350, fill: 0.34, sound: 'poker_fullhouse', voice: 'voice_spectacular' },
  { id: 'three', name: '3 of a Kind', base: 200, fill: 0.25, sound: 'pokerscore', voice: 'voice_excellent' },
  { id: 'twopair', name: '2 Pair', base: 150, fill: 0.2, sound: 'pokerscore', voice: 'voice_good' },
  { id: 'spectrum', name: 'Spectrum', base: 100, fill: 0.16, sound: 'pokerscore' },
  { id: 'pair', name: 'Pair', base: 50, fill: 0.12, sound: 'pokerscore' },
];
const PAIR = HANDS.length - 1;
// Skulls land on these hands, the lowest free one first (never on 4 of a Kind or a Flush)
const SKULLABLE = [6, 5, 4, 3, 2];
const FIRST_SKULL = 4, SKULL_EVERY = 5;
const POKER_SOUNDS = ['carddeal', 'cardflip', 'pokerscore', 'pokerchips', 'poker_fullhouse', 'poker_4ofakind', 'poker_flush', 'skull_appear',
  'skull_busted', 'skull_buster', 'coinappear', 'skullcoin_flip', 'skullcoinlands', 'skullcoinwin', 'skullcoinlose', 'rankup'];
const SKULL_TIP = 'The SKULL appears now and then. Avoid making hands marked by a Skull, or the Skull Coin decides your fate! Completing hands fills the Skull Eliminator bar: when full, it removes a Skull.';

/**
 * Where the cards so far are heading: the hand they already make (a Pair
 * with two alike), or Spectrum while they're all different. null below 2 cards.
 */
export function previewOf(cards) {
  if (cards.length >= 5) return handOf(cards);
  if (cards.length < 2) return null;
  const counts = new Map();
  for (const c of cards) counts.set(c, (counts.get(c) || 0) + 1);
  const n = [...counts.values()].sort((a, b) => b - a);
  if (n[0] === 4) return 1;
  if (n[0] === 3) return 3;
  if (n[0] === 2) return n[1] === 2 ? 4 : PAIR;
  return 5;
}

/** The hand five card colours make: an index into HANDS. */
export function handOf(cards) {
  const counts = new Map();
  for (const c of cards) counts.set(c, (counts.get(c) || 0) + 1);
  const n = [...counts.values()].sort((a, b) => b - a);
  if (n[0] === 5) return 0;
  if (n[0] === 4) return 1;
  if (n[0] === 3) return n[1] === 2 ? 2 : 3;
  if (n[0] === 2) return n[1] === 2 ? 4 : PAIR;
  return 5;
}

// The panel, in its own space (the felt frame is 460x620); the art's x/y are relative to BAR_O
const PANEL_W = 460, PANEL_H = 620;
const BAR_O = [-17, 61];
const ROW_H = 35.3;
const HAND_Y = 440, CARD_S = 0.6;

export class PokerScene extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'poker';
    this.title = 'Poker';
    this.music = 'poker';
    this.loseMusic = 'poker_lose';
    this.hasLevels = false;
    this.scoreBadge = 'anteup';
  }

  enter() {
    // its sounds aren't in the game's preload list: fetch them now, so the first hand isn't silent
    this.audio.preload(POKER_SOUNDS);
    super.enter();
  }

  resetMode() {
    this.hand = [];          // card colours, up to 5
    this.dealt = [];         // per card: seconds since it was dealt (for the slide-in)
    this.handsPlayed = 0;
    this.skulls = [];        // hand indexes with a Skull
    this.fill = 0;           // Skull Eliminator, 0..1
    this.counts = HANDS.map(() => 0);
    this.lastHand = null;    // { type, t } for the glow on the table
    this.coin = null;        // the Skull Coin while it flips
    this.cardThisMove = false;
    this.skullT = 0;
  }

  get pointsMultiplier() { return 1; }
  get handMult() { return this.handsPlayed + 1; }
  handValue(i) { return HANDS[i].base * this.handMult; }
  get glowColor() { return '#70ff60'; }
  noMoves() { this.reshuffle(); }
  // the purple castle with the lantern plants, as in the original
  currentBg() { const bgs = this.app.A.manifest.backgrounds; return bgs.includes('lantern_plants_world') ? 'lantern_plants_world' : bgs[0]; }

  saveExtra() { return { hand: this.hand, handsPlayed: this.handsPlayed, skulls: this.skulls, fill: this.fill, counts: this.counts }; }
  loadExtra(e) {
    this.hand = (e.hand || []).slice(0, 4);
    this.dealt = this.hand.map(() => 9);
    this.handsPlayed = e.handsPlayed || 0;
    this.skulls = e.skulls || [];
    this.fill = e.fill || 0;
    if (e.counts) this.counts = e.counts;
  }

  // ------------------------------------------------------------ dealing
  onMoveStart() {
    super.onMoveStart();
    this.cardThisMove = false;
  }

  // only the match you made deals a card, not the cascades after it
  onGroupMatched(grp, cascade) {
    if (cascade === 1 && grp.color >= 0) this.deal(grp.color);
  }
  onHyper(color) { if (color >= 0) this.deal(color); }

  deal(color) {
    if (this.cardThisMove || this.hand.length >= 5 || this.phase !== 'play') return;
    this.cardThisMove = true;
    this.hand.push(color);
    this.dealt.push(0);
    this.audio.play('carddeal', { volume: 0.8 });
  }

  afterSettle(intro) {
    if (!intro && this.hand.length === 5) { this.playHand(); return false; }
    return super.afterSettle(intro);
  }

  // ------------------------------------------------------------ a hand of five
  playHand() {
    const type = handOf(this.hand);
    const cards = this.hand.slice();
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.phase = 'hand';
    this.lastHand = { type, t: 0 };
    if (this.skulls.includes(type)) return this.flipCoin(type, cards);

    const pts = this.handValue(type);
    this.counts[type]++;
    if (type === 0) this.app.badges.report('gambler', 1);
    // the hand's own fanfare (Full House, 4 of a Kind, Flush), or the poker score jingle
    this.audio.play(HANDS[type].sound, { volume: 0.9 });
    this.audio.play('pokerchips', { volume: 0.7, delay: 0.3 });
    if (HANDS[type].voice) this.audio.play(HANDS[type].voice, { volume: 1, delay: 0.45 });
    this.showHand(cards, HANDS[type].name, '+' + formatNumber(pts), '#ffe060');
    this.celebrate(PAIR - type);
    this.flash.top = this.flash.bottom = 1;
    this.after(0.5, () => this.addPoints(pts, cx, cy + 150, 3, true));
    this.after(1.7, () => {
      // the table shows the new values only once this hand is done
      this.handsPlayed++;
      this.clearHand();
      this.fillEliminator(HANDS[type].fill);
    });
  }

  // More for better hands (tier 0 = Pair .. 6 = Flush): stars, rings, sparkles, a shake, fire
  celebrate(tier) {
    const fx = this.fx, [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.starBurst(3 + tier * 4, tier);
    fx.sparkles(cx, cy, 10 + tier * 6, 300 + tier * 40, '#ffe060');
    if (tier >= 2) fx.ring(cx, cy, '#ffe080', 0.3, 3 + tier * 0.4, 0.7);
    if (tier >= 3) { fx.flash(cx, cy, 6, 0.35, '#ffffff', 0.5); fx.shake(6 + tier * 2); }
    if (tier >= 4) fx.ring(cx, cy, '#ff80e0', 0.2, 4.5, 0.9, 'p_ring', 'over', 0.15);
    if (tier >= 5) this.after(0.25, () => this.starBurst(4 + tier * 3, tier));
    if (tier >= 6) { fx.fireBurst(cx, cy, 50, 1.5); this.audio.play('rankup', { volume: 0.7, delay: 0.2 }); }
  }

  // big golden stars flying out from the middle of the board, spinning
  starBurst(n, tier) {
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 380 + Math.random() * (300 + tier * 60);
      const size = 30 + Math.random() * (30 + tier * 8);
      const spin = (Math.random() - 0.5) * 6;
      const life = 1.1 + Math.random() * 0.6;
      this.fx.effect(life, (ctx, t, k) => {
        const d = speed * t - 140 * t * t;
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d + 180 * t * t;
        drawStar(ctx, x, y, size * (k < 0.15 ? k / 0.15 : 1), t * spin, k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      }, Math.random() * 0.15, 'over');
    }
  }

  // the five cards, the name of the hand and what it's worth, over the board
  showHand(cards, name, sub, color) {
    const A = this.A, [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    const front = A.s('card_front'), face = A.s('card_face');
    this.fx.effect(1.8, (ctx, t, k) => {
      const a = k > 0.82 ? 1 - (k - 0.82) / 0.18 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,0,20,0.35)';
      ctx.fillRect(0, cy - 230, COLS * CELL, 460);
      cards.forEach((c, i) => {
        const d = clamp((t - i * 0.06) / 0.25, 0, 1);
        const s = 0.82 * ease.outBack(d);
        if (s <= 0) return;
        const x = cx + (i - 2) * 112, y = cy + 10;
        front.drawC(ctx, 0, x, y, s);
        face.drawC(ctx, c + 1, x, y, s * 0.92);
      });
      this.fonts.big.draw(ctx, name, cx, cy - 150, { size: 96 * (t < 0.3 ? ease.outBack(t / 0.3) : 1), align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#4a0a50', GLOW: '#ff80e0' } });
      if (t > 0.45) this.fonts.score.draw(ctx, sub, cx, cy + 150, { size: 80, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#4a0a50', GLOW: color } });
      ctx.restore();
    }, 0, 'top');
  }

  clearHand() {
    this.hand = [];
    this.dealt = [];
    this.audio.play('cardflip', { volume: 0.6 });
    // a new Skull every few hands, on the lowest hand without one
    if (this.handsPlayed >= FIRST_SKULL && (this.handsPlayed - FIRST_SKULL) % SKULL_EVERY === 0) this.addSkull();
    this.backToPlay();
  }

  backToPlay() {
    if (this.phase === 'gameover') return;
    this.phase = 'play';
    this.save();
    if (!this.board.findMove()) this.noMoves();
  }

  addSkull() {
    const free = SKULLABLE.find((i) => !this.skulls.includes(i));
    if (free === undefined) return;
    this.skulls.push(free);
    this.skullT = 1;
    this.audio.play('skull_appear', { volume: 0.9 });
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.fx.bigText(cx, cy, 'SKULL: ' + HANDS[free].name.toUpperCase(), { size: 90, life: 2, colors: { MAIN: '#ffffff', OUTLINE: '#400010', GLOW: '#ff3030' } });
    if (!store('pokerSkullTip')) {
      store('pokerSkullTip', true);
      this.after(0.8, () => this.tip('Skull!', SKULL_TIP));
    }
  }

  fillEliminator(amount) {
    if (!this.skulls.length) { this.fill = Math.min(1, this.fill + amount); return; }
    this.fill += amount;
    if (this.fill < 1) return;
    // full: the most recent Skull goes
    this.fill -= 1;
    const gone = this.skulls.pop();
    this.audio.play('skull_buster', { volume: 0.9 });
    this.flash.bar = 1;
    const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
    this.fx.bigText(cx, cy, HANDS[gone].name.toUpperCase() + ' IS SAFE', { size: 80, life: 1.8, colors: { MAIN: '#ffffff', OUTLINE: '#0a3a10', GLOW: '#70ff60' } });
  }

  // ------------------------------------------------------------ the Skull Coin
  flipCoin(type, cards) {
    this.audio.play('skull_busted', { volume: 0.9 });
    this.showHand(cards, HANDS[type].name, 'No Score', '#ff3030');
    const safe = Math.random() < 0.5;
    this.after(1.6, () => {
      this.clearCards();
      this.coin = { t: 0, safe, landed: false };
      this.audio.play('coinappear', { volume: 0.8 });
      this.audio.play('skullcoin_flip', { volume: 0.9, delay: 0.4 });
    });
  }

  clearCards() { this.hand = []; this.dealt = []; }

  updateCoin(dt) {
    const c = this.coin;
    if (!c) return;
    c.t += dt;
    if (!c.landed && c.t > 2.6) {
      c.landed = true;
      this.audio.play('skullcoinlands', { volume: 0.9 });
      this.audio.play(c.safe ? 'skullcoinwin' : 'skullcoinlose', { volume: 1, delay: 0.25 });
      const [cx, cy] = [COLS * CELL / 2, ROWS * CELL / 2];
      if (c.safe) {
        this.fx.bigText(cx, cy + 260, 'SAFE!', { size: 120, life: 1.6, colors: { MAIN: '#ffffff', OUTLINE: '#0a3a10', GLOW: '#70ff60' } });
        this.after(1.6, () => { this.coin = null; this.handsPlayed++; this.clearHand(); });
      } else {
        this.after(1.4, () => { this.coin = null; this.phase = 'play'; this.gameOver('SKULL', null); });
      }
    }
  }

  // the coin spins (its face turns edge-on and back) and lands on clover or skull
  drawCoin(ctx) {
    const c = this.coin;
    if (!c) return;
    const A = this.A, [bx, by] = this.boardPos;
    const cx = bx + COLS * CELL / 2, cy = by + ROWS * CELL / 2;
    const rise = c.t < 0.4 ? ease.outCubic(c.t / 0.4) : 1;
    const spinT = Math.min(c.t, 2.6);
    // fast at first, slowing down; an even number of half-turns lands on the drawn face
    const turns = 9 * (1 - Math.pow(1 - spinT / 2.6, 2));
    const ang = turns * Math.PI;
    const showSafe = c.landed ? c.safe : (Math.floor(turns) % 2 === 0) === c.safe;
    const squash = Math.abs(Math.cos(ang));
    const bounce = c.landed ? Math.abs(Math.sin(Math.min(1, (c.t - 2.6) / 0.5) * Math.PI)) * 30 * (1 - Math.min(1, (c.t - 2.6) / 0.5)) : Math.sin(spinT / 2.6 * Math.PI) * 120;
    const scale = 0.9 * rise;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.5 * rise})`;
    ctx.fillRect(bx, by, COLS * CELL, ROWS * CELL);
    const face = A.s('coin_set1');
    const y = cy - bounce;
    if (squash < 0.08) A.s('coin_side').drawC(ctx, 0, cx, y, scale);
    else {
      ctx.translate(cx, y);
      ctx.scale(1, Math.max(0.08, squash));
      face.drawC(ctx, showSafe ? 0 : 2, 0, 0, scale);
    }
    ctx.restore();
    if (c.t < 2.6) this.fonts.ui.draw(ctx, 'The Skull Coin decides…', cx, by + ROWS * CELL - 120, { size: 52, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#400010', GLOW: '#ff3030' } });
  }

  tip(title, text) {
    import('./ui.js').then(({ Button, Dialog }) => {
      if (this.dialog || this.phase === 'gameover') return;
      this.paused = true;
      const L = this.L;
      const w = Math.min(900, L.w - 80), h = 560;
      const d = new Dialog(this.app, title, (L.w - w) / 2, (L.h - h) / 2, w, h);
      const lines = this.wrap(text, w - 140, 34);
      d.body = (ctx) => lines.forEach((l, i) => this.fonts.text.draw(ctx, l, w / 2, 150 + i * 48, { size: 34, align: 'center', colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } }));
      d.add(new Button(this.app, 'OK', (w - 300) / 2, h - 150, 300, 100, () => d.close(() => (this.paused = false))));
      this.dialog = d;
    });
  }

  wrap(text, width, size) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && this.fonts.text.measure(next, size) > width) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  // ------------------------------------------------------------ update
  get clockRunning() { return super.clockRunning || this.phase === 'hand'; }

  updateMode(dt) {
    for (let i = 0; i < this.dealt.length; i++) this.dealt[i] += dt;
    if (this.lastHand) this.lastHand.t += dt;
    this.skullT = Math.max(0, this.skullT - dt * 0.5);
    this.updateCoin(dt);
  }

  barValue() { return this.fill; }
  // the bar under the board: the Skull Eliminator too
  drawBar(ctx, ox, oy) {
    this.drawFillBar(ctx, ox, oy, this.displayProgress, ['#e8ff60', '#90e020', '#2a6010'], this.skulls.length ? 'Skull Eliminator' : 'Hand ' + (this.handsPlayed + 1));
  }

  // ------------------------------------------------------------ the poker panel
  // where the felt frame goes, and how big: left of the board, or below it in portrait
  panelPlace() {
    const [sx, sy] = this.scoreOff;
    return this.wide ? [170 + sx, 60 + sy, 1] : [210 + sx, 30 + sy, 0.8];
  }

  drawScoreWidget(ctx) {
    const [px, py, s] = this.panelPlace();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s, s);
    this.drawPokerPanel(ctx);
    ctx.restore();
  }

  drawPokerPanel(ctx) {
    const A = this.A, F = this.fonts, t = this.app.time;
    const bar = (name, dx = 0, dy = 0) => A.s(name).drawAt(ctx, BAR_O[0] + dx, BAR_O[1] + dy);
    A.s('pk_bkg').draw(ctx, 0, 0, 0);
    // score in the oval at the top
    A.s('pk_scorebkg').draw(ctx, 0, (PANEL_W - 262) / 2, 6);
    this.drawScoreText(ctx, PANEL_W / 2, 38, 230, 46);

    // Skull Eliminator
    bar('pk_crusherbkg');
    const cb = A.s('pk_crusherbar');
    const w = cb.fw * clamp(this.displayProgress, 0, 1);
    if (w > 1) cb.draw(ctx, 0, cb.x + BAR_O[0], cb.y + BAR_O[1], w, cb.fh);
    if (this.flash.bar > 0 && this.skulls.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.flash.bar * 0.8;
      bar('pk_crusherglow'); ctx.restore();
    }
    bar('pk_crusherborder');
    bar('pk_barcover');
    bar(this.skulls.length ? 'pk_barskull' : 'pk_slashshadow');
    if (!this.skulls.length) bar('pk_skullslash');

    // the deck
    const deck = A.s('card_deck'), back = A.s('card_back');
    const [dx, dy] = [BAR_O[0] + 50, BAR_O[1] + 130];
    A.s('card_deckshadow').draw(ctx, 0, dx - 10, dy + 14);
    deck.draw(ctx, 0, dx, dy);
    back.draw(ctx, 0, dx, dy);

    // the table of hands, with what they're worth now (or a Skull)
    const board = A.s('pk_scoreboard');
    const [tx, ty] = [BAR_O[0] + board.x, BAR_O[1] + board.y];
    board.draw(ctx, 0, tx, ty);
    const glow = (r, alpha, color) => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
      (color ? A.tintedSprite('pk_scoreglow', color) : A.s('pk_scoreglow')).draw(ctx, 0, tx - 22, ty + r * ROW_H - 24, 253, 83);
      ctx.restore();
    };
    if (this.lastHand && this.lastHand.t < 3) glow(this.lastHand.type, (1 - this.lastHand.t / 3) * (0.6 + 0.4 * Math.sin(t * 10)));
    // what the cards so far are heading for (red when that hand has a Skull)
    const preview = this.phase === 'hand' ? null : previewOf(this.hand);
    if (preview !== null) {
      const danger = this.skulls.includes(preview);
      ctx.save();
      ctx.fillStyle = danger ? 'rgba(255,60,40,0.3)' : 'rgba(255,230,120,0.28)';
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
      ctx.fillRect(tx + 2, ty + preview * ROW_H + 2, 203, ROW_H - 3);
      ctx.restore();
      glow(preview, 0.85 + 0.15 * Math.sin(t * 5), danger ? '#ff3030' : null);
      A.s('pk_lightlit').drawC(ctx, 0, tx - 14, ty + preview * ROW_H + ROW_H / 2, 0.42);
    }
    HANDS.forEach((_, i) => {
      const y = ty + i * ROW_H + ROW_H / 2;
      const vx = tx + 130 + 38;
      if (this.skulls.includes(i)) {
        ctx.save();
        ctx.fillStyle = 'rgba(150,0,0,0.75)';
        ctx.fillRect(tx + 131, ty + i * ROW_H + 2, 74, ROW_H - 3);
        ctx.restore();
        const pulse = i === this.skulls[this.skulls.length - 1] ? 1 + this.skullT * 0.6 * Math.abs(Math.sin(t * 8)) : 1;
        A.s('pk_skull').drawC(ctx, 0, vx, y, pulse);
      } else {
        const v = formatNumber(this.handValue(i));
        const size = v.length > 6 ? 20 : 24;
        F.small.draw(ctx, v, vx, y, { size, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#1a3010' } });
      }
    });

    // the hand you're building: five places, the dealt cards slide in from the deck
    const front = A.s('card_front'), face = A.s('card_face'), shadow = A.s('card_shadow');
    const cw = front.fw * CARD_S, gap = 8;
    const x0 = (PANEL_W - (5 * cw + 4 * gap)) / 2;
    for (let i = 0; i < 5; i++) {
      const x = x0 + i * (cw + gap) + cw / 2, y = HAND_Y + front.fh * CARD_S / 2;
      if (i >= this.hand.length) {
        ctx.save(); ctx.globalAlpha = 0.25;
        shadow.drawC(ctx, 0, x, y, CARD_S);
        ctx.restore();
        continue;
      }
      const k = ease.outCubic(clamp(this.dealt[i] / 0.35, 0, 1));
      const sx = dx + back.fw / 2, sy = dy + back.fh / 2;
      const cx = sx + (x - sx) * k, cy = sy + (y - sy) * k;
      // it turns over halfway
      const flip = Math.abs(Math.cos(k * Math.PI));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.05, flip), 1);
      if (k < 0.5) back.drawC(ctx, 0, 0, 0, CARD_S);
      else { front.drawC(ctx, 0, 0, 0, CARD_S); face.drawC(ctx, this.hand[i] + 1, 0, 0, CARD_S * 0.9); }
      ctx.restore();
    }
    F.small.draw(ctx, 'HAND ' + (this.handsPlayed + 1), PANEL_W / 2, HAND_Y + front.fh * CARD_S + 30, { size: 24, align: 'center', valign: 'middle', colors: { MAIN: '#e8ffd0', OUTLINE: '#1a3010' } });
  }

  drawOverlay(ctx) { this.drawCoin(ctx); }

  // the window in the button widget: what you're making and when the next Skull comes
  drawPanelContent(ctx, lx, ly) {
    const F = this.fonts, cx = 400 + lx, cy = 822 + ly;
    const preview = previewOf(this.hand);
    const free = SKULLABLE.some((i) => !this.skulls.includes(i));
    const next = this.handsPlayed < FIRST_SKULL ? FIRST_SKULL - this.handsPlayed : SKULL_EVERY - ((this.handsPlayed - FIRST_SKULL) % SKULL_EVERY);
    const lines = [
      [preview === null ? 'Make poker hands' : HANDS[preview].name + (this.hand.length < 5 ? '?' : ''), preview !== null && this.skulls.includes(preview) ? '#ff8080' : '#ffffff', 34],
      [preview === null ? 'with gem matches' : this.hand.length + ' of 5 cards', '#ffd0f0', 24],
      [free ? (next === 1 ? 'Skull after this hand!' : 'Skull in ' + next + ' hands') : 'Every Skull is out', '#ffb0b0', 24],
    ];
    lines.forEach(([text, color, size], i) =>
      F.small.draw(ctx, text, cx, cy - 38 + i * 36, { size, align: 'center', valign: 'middle', colors: { MAIN: color, OUTLINE: '#2a0020' } }));
  }

  panelWidget() { return 'ui_bottomwidget_quest'; }
  panelButtons() {
    return [
      { sprite: 'ui_hintbutton_quest', action: 'hint', hoverFrame: 1 },
      { sprite: 'ui_menubutton_quest', action: 'menu', hoverFrame: 1 },
      { sprite: 'ui_resetbutton_quest', action: 'reset', hoverFrame: 1 },
    ];
  }

  submitExtra() { return { hands: this.counts.reduce((a, b) => a + b, 0), flushes: this.counts[0] }; }

  statRows() {
    const st = this.stats;
    const best = this.counts.findIndex((n) => n > 0);
    return [
      ['Final Score', formatNumber(this.score)],
      ['Hands Played', String(this.handsPlayed)],
      ['Best Hand', best >= 0 ? HANDS[best].name : '-'],
      ['Flushes', String(this.counts[0])],
      ['Total Time', this.fmtTime(st.time)],
    ];
  }
}

function drawStar(ctx, x, y, r, rot, alpha) {
  if (r <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#fffbd0');
  g.addColorStop(0.5, '#ffe030');
  g.addColorStop(1, '#f0a000');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(255,220,60,0.8)';
  ctx.shadowBlur = r * 0.5;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.strokeStyle = '#a05000';
  ctx.stroke();
  ctx.restore();
}
