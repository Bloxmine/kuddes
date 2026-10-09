// Minimal immediate-ish UI: buttons, sliders and nine-slice dialogs drawn with the game's dialog art.
import { clamp, ease } from './util.js';

export class Button {
  constructor(app, label, x, y, w, h, onClick, opts = {}) {
    Object.assign(this, { app, label, x, y, w, h, onClick });
    this.enabled = opts.enabled ?? true;
    this.sub = opts.sub || '';
    this.size = opts.size || 46;
    this.hover = false;
    this.down = false;
    this.anim = 0;
  }
  contains(px, py) { return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }
  pointerMove(px, py) {
    const h = this.contains(px, py);
    if (h && !this.hover && this.enabled) this.app.audio.play('button_mouseover', { volume: 0.5 });
    this.hover = h;
  }
  pointerDown(px, py) {
    if (this.enabled && this.contains(px, py)) { this.down = true; this.app.audio.play('button_press', { volume: 0.7 }); return true; }
    return false;
  }
  pointerUp(px, py) {
    const was = this.down;
    this.down = false;
    if (was && this.contains(px, py) && this.enabled) { this.app.audio.play('button_release', { volume: 0.6 }); this.onClick && this.onClick(); return true; }
    return false;
  }
  update(dt) { this.anim = clamp(this.anim + (this.hover ? dt : -dt) * 6, 0, 1); }
  draw(ctx) {
    const A = this.app.A;
    const sp = A.s('dlg_smallbutton');
    const frame = !this.enabled ? 0 : this.down ? 2 : this.hover ? 1 : 0;
    ctx.save();
    if (!this.enabled) ctx.globalAlpha = 0.55;
    sp.drawPanel(ctx, this.x, this.y, this.w, this.h, 30, frame);
    const f = this.app.fonts.ui;
    f.draw(ctx, this.label, this.x + this.w / 2, this.y + this.h / 2 + (this.sub ? -8 : 2) + (this.down ? 2 : 0), {
      size: this.size, align: 'center', valign: 'middle',
      colors: { MAIN: this.enabled ? '#ffffff' : '#d0b0d0', OUTLINE: '#3a0a3a', GLOW: this.hover ? '#ffb0ff' : '#a02090' },
    });
    if (this.sub) this.app.fonts.small.draw(ctx, this.sub, this.x + this.w / 2, this.y + this.h - 14, { size: 22, align: 'center', colors: { MAIN: '#ffe0ff', OUTLINE: '#300830' } });
    ctx.restore();
  }
}

export class Slider {
  constructor(app, label, x, y, w, value, onChange) {
    Object.assign(this, { app, label, x, y, w, value, onChange });
    this.drag = false;
  }
  hit(px, py) { return px >= this.x - 20 && px <= this.x + this.w + 20 && py >= this.y - 30 && py <= this.y + 30; }
  set(px) { this.value = clamp((px - this.x) / this.w, 0, 1); this.onChange && this.onChange(this.value); }
  pointerDown(px, py) { if (this.hit(px, py)) { this.drag = true; this.set(px); return true; } return false; }
  pointerMove(px) { if (this.drag) this.set(px); }
  pointerUp() { if (this.drag) { this.drag = false; this.app.audio.play('select', { volume: 0.6 }); } }
  update() {}
  draw(ctx) {
    const A = this.app.A;
    this.app.fonts.ui.draw(ctx, this.label, this.x, this.y - 34, { size: 34, colors: { MAIN: '#5a1a40', OUTLINE: null, GLOW: null } });
    A.s('dlg_sliderbar').drawPanel(ctx, this.x, this.y - 17, this.w, 34, 16);
    ctx.save();
    ctx.fillStyle = 'rgba(255,120,220,0.55)';
    ctx.fillRect(this.x + 8, this.y - 6, (this.w - 16) * this.value, 12);
    ctx.restore();
    A.s('dlg_sliderhandle').drawC(ctx, 0, this.x + this.w * this.value, this.y, 1);
  }
}

// A modal dialog with a title, optional body draw callback and widgets.
export class Dialog {
  constructor(app, title, x, y, w, h, opts = {}) {
    Object.assign(this, { app, title, x, y, w, h });
    this.widgets = [];
    this.body = opts.body || null;
    this.t = 0;
    this.closing = false;
    this.onClosed = null;
    this.header = opts.header ?? true;
  }
  add(w) { this.widgets.push(w); return w; }
  close(cb) { this.closing = true; this.closeT = 0; this.onClosed = cb; }
  get done() { return this.closing && this.closeT >= 0.2; }
  update(dt) {
    this.t += dt;
    if (this.closing) this.closeT += dt;
    for (const w of this.widgets) w.update(dt);
  }
  local(px, py) {
    return [px - this.x, py - this.y - this.offsetY()];
  }
  offsetY() {
    if (this.closing) return ease.inQuad(Math.min(1, this.closeT / 0.2)) * 900;
    return (1 - ease.outBack(Math.min(1, this.t / 0.35), 1.2)) * -900;
  }
  pointerDown(px, py) { const [x, y] = this.local(px, py); for (const w of this.widgets) if (w.pointerDown(x, y)) return true; return true; }
  pointerMove(px, py) { const [x, y] = this.local(px, py); for (const w of this.widgets) w.pointerMove(x, y); }
  pointerUp(px, py) { const [x, y] = this.local(px, py); for (const w of this.widgets) w.pointerUp(x, y); }
  draw(ctx) {
    const A = this.app.A;
    ctx.save();
    const fade = this.closing ? 1 - Math.min(1, this.closeT / 0.2) : Math.min(1, this.t / 0.25);
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = '#000';
    ctx.fillRect(-4000, -4000, 8000, 8000);
    ctx.globalAlpha = 1;
    ctx.translate(this.x, this.y + this.offsetY());
    const sp = A.s(this.header ? 'dlg_background' : 'dlg_headerless');
    sp.drawPanel(ctx, 0, 0, this.w, this.h, 140);
    if (this.title) {
      this.app.fonts.ui.draw(ctx, this.title, this.w / 2, this.header ? 52 : 70, {
        size: 48, align: 'center', valign: 'middle', colors: { MAIN: '#ffffff', OUTLINE: '#4a0a40', GLOW: '#ff60e0' },
      });
    }
    if (this.body) this.body(ctx, this);
    for (const w of this.widgets) w.draw(ctx);
    ctx.restore();
  }
}
