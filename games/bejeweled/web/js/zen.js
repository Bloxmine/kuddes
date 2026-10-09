// Zen mode: no game over, relaxed music, mantras scrolling through the progress bar.
import { BaseMode } from './mode.js';
import { Button } from './ui.js';
import { store, clamp } from './util.js';

export class ZenScene extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'zen';
    this.title = 'Zen';
    this.endless = true;
    this.music = 'zen';
    this.loseMusic = 'zen';
    this.autoHint = 0;
    this.mantraSets = app.A.manifest.affirmations || [];
    this.mantraSet = store('zenMantras') ?? (this.mantraSets.includes('General.txt') ? 'General.txt' : this.mantraSets[0] || 'off');
    this.mantras = [];
    this.loadMantras();
  }

  // Mantra lines are read from the affirmation files in your game folder (lines starting with # are headers).
  async loadMantras() {
    this.mantras = [];
    this.mantraIdx = 0;
    this.mantraT = 0;
    if (!this.mantraSet || this.mantraSet === 'off') return;
    try {
      const txt = await (await fetch('assets/affirmations/' + encodeURIComponent(this.mantraSet))).text();
      this.mantras = txt.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      this.mantraIdx = Math.floor(Math.random() * this.mantras.length);
    } catch (e) { this.mantras = []; }
  }

  get pointsMultiplier() { return 1; }
  goalFor(level) { return 2500 + 750 * (level - 1); }

  noMoves() { this.reshuffle(); }

  panelWidget() { return 'ui_bottomwidget_zen'; }
  panelButtons() {
    return [
      { sprite: 'ui_optionsbutton_zen', action: 'menu', hoverFrame: 1 },
      { sprite: 'ui_hintbutton', action: 'hint', hoverFrame: 1, dy: -4 },
      { sprite: 'ui_menubutton_zen', action: 'menu', hoverFrame: 1 },
    ];
  }

  get glowColor() { return '#80d0ff'; }

  updateMode(dt) {
    if (!this.mantras.length) return;
    this.mantraT += dt;
    if (this.mantraT > 9) { this.mantraT = 0; this.mantraIdx = (this.mantraIdx + 1) % this.mantras.length; }
  }

  drawBar(ctx, ox, oy) {
    this.drawFillBar(ctx, ox, oy, this.displayProgress, ['#c0f0ff', '#50a8ff', '#2050c0']);
    if (!this.mantras.length) return;
    const [x0, y0, W, H] = this.barRect(ox, oy);
    const t = this.mantraT;
    const a = clamp(Math.min(t / 1.2, (9 - t) / 1.2), 0, 1);
    let text = this.mantras[this.mantraIdx];
    let size = 30;
    const w = this.fonts.text.measure(text, size);
    if (w > W - 40) size *= (W - 40) / w;
    this.fonts.text.draw(ctx, text, x0 + W / 2, y0 + H / 2, { size, align: 'center', valign: 'middle', alpha: a, colors: { MAIN: '#ffffff', OUTLINE: '#102040', GLOW: null } });
  }

  openPause() {
    super.openPause();
    const d = this.dialog;
    if (!d || !this.mantraSets.length) return;
    // extra row: cycle through mantra sets (or off)
    const label = () => 'Mantras: ' + (this.mantraSet === 'off' ? 'Off' : this.mantraSet.replace(/\.txt$/, ''));
    d.h += 120;
    d.y -= 60;
    for (const w of d.widgets) if (w.label === undefined || w.y > 450) w.y += 120;
    const btn = new Button(this.app, label(), 100, 500, d.w - 200, 90, () => {
      const opts = [...this.mantraSets, 'off'];
      this.mantraSet = opts[(opts.indexOf(this.mantraSet) + 1) % opts.length];
      store('zenMantras', this.mantraSet);
      btn.label = label();
      this.loadMantras();
    }, { size: 34 });
    d.add(btn);
  }

  statRows() {
    const st = this.stats;
    return [
      ['Score', String(this.score)],
      ['Level', String(this.level)],
      ['Longest Cascade', String(st.longestCascade)],
      ['Time Relaxed', this.fmtTime(st.time)],
    ];
  }
}
