// Badges (achievements) using the game's badge art, tier frames and award sounds.
import { store, ease, clamp, formatNumber } from './util.js';
import { badgesChanged } from './host.js';

const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Elite'];
const TIER_COLORS = ['#ffffff', '#ff8a40', '#eeeeee', '#ffe640', '#7cc4ff', '#ffd0ff'];

// kind: 'total' (counts add up over all games), 'best' (best single value), 'once' (single elite badge)
// icon = index in the small icon sheet (same order as the game's badge list), art = big badge image
export const BADGES = [
  { id: 'inferno', name: 'Inferno', icon: 0, art: 'inferno', kind: 'total', levels: [50, 400, 1400, 3400], desc: 'Detonate %s Flame Gems' },
  { id: 'stellar', name: 'Stellar', icon: 1, art: 'stellar', kind: 'total', levels: [25, 150, 550, 1300], desc: 'Detonate %s Star Gems' },
  { id: 'chromatic', name: 'Chromatic', icon: 2, art: 'chromatic', kind: 'total', levels: [25, 150, 550, 1300], desc: 'Use %s Hypercubes' },
  { id: 'blaster', name: 'Blaster', icon: 3, art: 'blaster', kind: 'best', levels: [30, 40, 50, 60], desc: 'Destroy %s gems in a single move' },
  { id: 'bejeweler', name: 'Bejeweler', icon: 4, art: 'bejeweler', kind: 'best', levels: [50000, 150000, 300000, 500000], desc: 'Score %s points in a Classic game' },
  { id: 'finalfrenzy', name: 'Final Frenzy', icon: 5, art: 'electrifier', kind: 'best', levels: [20000, 30000, 40000, 60000], desc: 'Score %s points in the last round of Lightning' },
  { id: 'highvoltage', name: 'High Voltage', icon: 6, art: 'high_voltage', kind: 'best', levels: [100000, 300000, 500000, 750000], desc: 'Score %s points in Lightning' },
  { id: 'anteup', name: 'Ante Up', icon: 7, art: 'ante_up', kind: 'best', levels: [100000, 300000, 500000, 750000], desc: 'Score %s points in Poker' },
  { id: 'gambler', name: 'The Gambler', icon: 8, art: 'the_gambler', kind: 'total', levels: [10, 30, 60, 100], desc: 'Get %s Flushes in Poker' },
  { id: 'glacial', name: 'Glacial Explorer', icon: 9, art: 'glacial_explorer', kind: 'best', levels: [100000, 300000, 500000, 750000], desc: 'Score %s points in Ice Storm' },
  { id: 'icebreaker', name: 'Ice Breaker', icon: 10, art: 'ice_breaker', kind: 'best', levels: [5, 8, 12, 15], desc: 'Break %s ice columns in one Ice Storm game' },
  { id: 'diamondmine', name: 'Diamond Mine', icon: 11, art: 'diamond_mine', kind: 'best', levels: [100000, 300000, 500000, 750000], desc: 'Score %s points in Diamond Mine' },
  { id: 'relichunter', name: 'Relic Hunter', icon: 12, art: 'relic_hunter', kind: 'best', levels: [5, 8, 12, 15], desc: 'Dig up %s artifacts in one Diamond Mine game' },
  { id: 'monarch', name: 'Butterfly Monarch', icon: 13, art: 'butterfly_monarch', kind: 'best', levels: [100000, 300000, 500000, 750000], desc: 'Score %s points in Butterflies' },
  { id: 'bonanza', name: 'Butterfly Bonanza', icon: 14, art: 'butterfly_bonanza', kind: 'best', levels: [4, 6, 8, 10], desc: 'Free %s butterflies in a single move' },
  { id: 'heroes', name: 'Heroes Welcome', icon: 15, art: 'heroes_welcome', kind: 'once', desc: 'Complete Quest mode', unavailable: true },
  { id: 'annihilator', name: 'Annihilator', icon: 16, art: 'annihilator', kind: 'once', desc: 'Swap two Hypercubes together' },
  { id: 'superstar', name: 'Superstar', icon: 17, art: 'superstar', kind: 'once', desc: 'Create a Supernova Gem by lining up 6' },
  { id: 'levelord', name: 'Levelord', icon: 18, art: 'levelord', kind: 'once', levels: [10], desc: 'Reach level 10 in Classic' },
  { id: 'topsecret', name: 'Top Secret', icon: 19, art: 'top_secret', kind: 'once', desc: 'Master the secret modes', unavailable: true },
];

export class Badges {
  constructor(app) {
    this.app = app;
    this.data = store('badges') || {}; // id -> { value, level }
    this.queue = [];
    this.cur = null;
    this.hold = false;      // while playing, awards wait until the game is over
    this.onDone = null;
  }

  // show every badge earned this game, then call done()
  release(done) {
    this.hold = false;
    this.onDone = done || null;
    if (!this.queue.length && !this.cur) { this.onDone = null; done && done(); }
  }

  get(id) { return this.data[id] || (this.data[id] = { value: 0, level: 0 }); }
  def(id) { return BADGES.find((b) => b.id === id); }
  maxLevel(b) { return b.kind === 'once' ? 1 : b.levels.length; }

  // displayed tier: multi-level badges go bronze..platinum, single badges are elite
  tier(b, level) { return b.kind === 'once' ? (level ? 5 : 0) : level; }

  /** add (kind 'total'), or record a candidate value (kind 'best' / 'once') */
  report(id, value = 1) {
    const b = this.def(id);
    if (!b || b.unavailable) return;
    const s = this.get(id);
    if (b.kind === 'total') s.value += value;
    else s.value = Math.max(s.value, value);
    const levels = b.levels || [1];
    let lvl = 0;
    while (lvl < levels.length && s.value >= levels[lvl]) lvl++;
    if (b.kind === 'once') lvl = Math.min(lvl, 1);
    const levelUp = lvl > s.level;
    if (levelUp) {
      s.level = lvl;
      this.queue.push({ b, level: lvl });
    }
    store('badges', this.data);
    // On Kuddes the badges are achievements too: a new level goes there right away
    badgesChanged(this.data, levelUp);
  }

  describe(b) {
    const s = this.get(b.id);
    if (b.unavailable) return b.desc.replace('%s', formatNumber(b.levels ? b.levels[0] : 1)) + ' (mode not available yet)';
    if (b.kind === 'once') return b.desc.replace('%s', b.levels ? b.levels[0] : '') + (s.level ? '  -  earned!' : '');
    if (s.level >= b.levels.length) return b.desc.replace('%s', formatNumber(b.levels.at(-1))) + '  -  MAX LEVEL';
    return b.desc.replace('%s', formatNumber(b.levels[s.level])) + ' for ' + TIER_NAMES[s.level + 1] + '  (' + formatNumber(s.value) + ')';
  }

  // ------------------------------------------------------------ drawing helpers
  // big badge: art + tier frame, centred at (cx, cy)
  drawBig(ctx, b, tier, cx, cy, scale = 1) {
    const A = this.app.A;
    const art = A.s('badge_' + b.art);
    // the big art and its frames share a 750x750 layout, the art sits at 159,159
    const ox = cx - 375 * scale, oy = cy - 375 * scale;
    ctx.drawImage(art.img, ox + art.x * scale, oy + art.y * scale, art.fw * scale, art.fh * scale);
    if (tier) {
      const fr = A.s('badge_t' + tier);
      ctx.drawImage(fr.img, ox + fr.x * scale, oy + fr.y * scale, fr.fw * scale, fr.fh * scale);
    }
  }

  // small badge: icon (grey when locked) + tier ring
  drawSmall(ctx, b, tier, cx, cy, scale = 1) {
    const A = this.app.A;
    // icon and ring share a 200x200 layout (icon at 42,42 and ring at 3,6 in the game's resources)
    const ox = cx - 100 * scale, oy = cy - 100 * scale;
    const icons = A.s(tier ? 'badge_icons' : 'badge_icons_grey');
    icons.draw(ctx, b.icon, ox + icons.x * scale, oy + icons.y * scale, icons.fw * scale, icons.fh * scale);
    if (tier) {
      const rings = A.s('badge_rings');
      rings.draw(ctx, tier, ox + rings.x * scale, oy + rings.y * scale, rings.fw * scale, rings.fh * scale);
    }
  }

  tierName(b, level) { return TIER_NAMES[this.tier(b, level)]; }
  tierColor(b, level) { return TIER_COLORS[this.tier(b, level)]; }

  // ------------------------------------------------------------ award popup
  update(dt) {
    if (!this.cur && this.queue.length && !this.hold) {
      this.cur = { ...this.queue.shift(), t: 0 };
      this.app.audio.play('badgefall', { volume: 0.9 });
      this.app.audio.play('badgeawarded', { volume: 0.9, delay: 0.55 });
    }
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.t > 4.2) this.cur = null;
    }
    if (!this.cur && !this.queue.length && this.onDone) { const cb = this.onDone; this.onDone = null; cb(); }
  }

  draw(ctx) {
    const c = this.cur;
    if (!c) return;
    const L = this.app.layout, F = this.app.fonts;
    const t = c.t;
    const cx = L.w / 2, cy = L.h * 0.42;
    const a = t < 0.25 ? t / 0.25 : t > 3.7 ? Math.max(0, 1 - (t - 3.7) / 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = '#000';
    ctx.fillRect(-2000, -2000, L.w + 4000, L.h + 4000);
    // badge drops in with a bounce, glow spins behind it
    const drop = t < 0.55 ? -900 * (1 - ease.inQuad(t / 0.55)) : t < 0.85 ? -40 * Math.sin(((t - 0.55) / 0.3) * Math.PI) : 0;
    const scale = 0.62 * (t > 3.7 ? 1 + (t - 3.7) * 0.4 : 1);
    ctx.globalAlpha = a;
    if (t > 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * clamp((t - 0.5) * 3, 0, 1) * (0.6 + 0.2 * Math.sin(t * 4));
      const g = this.app.A.s('award_glow');
      g.drawC(ctx, 0, cx, cy, 1.1 + 0.05 * Math.sin(t * 3), t * 0.5);
      const rays = this.app.A.s('p_ray');
      for (let i = 0; i < 8; i++) rays.drawC(ctx, 0, cx, cy, 2.4, t * 0.4 + (i * Math.PI) / 4);
      ctx.restore();
    }
    this.drawBig(ctx, c.b, this.tier(c.b, c.level), cx, cy + drop, scale);
    if (t > 0.7) {
      const ta = a * clamp((t - 0.7) * 3, 0, 1);
      F.ui.draw(ctx, 'You have earned the', cx, cy + 300, { size: 46, align: 'center', valign: 'middle', alpha: ta, colors: { MAIN: '#ffffff', OUTLINE: '#3a0838', GLOW: '#ff60e0' } });
      const tn = this.tierName(c.b, c.level);
      F.ui.draw(ctx, tn + ' "' + c.b.name + '" Badge', cx, cy + 370, {
        size: 62, align: 'center', valign: 'middle', alpha: ta, colors: { MAIN: this.tierColor(c.b, c.level), OUTLINE: '#3a0838', GLOW: '#ff60e0' },
      });
    }
    ctx.restore();
  }

  get showing() { return !!this.cur; }
}
