// Renderer for PopCap layered bitmap fonts (converted to JSON by build_assets.py).
// Each layer (GLOW / MAIN / OUTLINE ...) is a white alpha mask that is tinted at draw time.

const DEFAULT_COLORS = { MAIN: '#ffffff', OUTLINE: '#40104a', GLOW: '#ff60ff' };

export class BitmapFont {
  constructor(def, assets) {
    this.def = def;
    this.assets = assets;
    this.layers = def.layers;
    this.main = this.layers.find((l) => l.name === 'MAIN') || this.layers[0];
    this.pointSize = this.main.pointSize || 32;
    this.ascent = this.main.ascent;
    this.height = this.main.height;
  }

  glyph(layer, ch) {
    return layer.glyphs[ch] || layer.glyphs[ch.toUpperCase()] || layer.glyphs[ch.toLowerCase()];
  }

  // width in font units (unscaled)
  measure(text, size) {
    if (size !== undefined) {
      if (this.fallback && !this.covers(text)) return this.fallback.measure(text, size);
      return this.measure(text) * size / this.pointSize;
    }
    let w = 0;
    const L = this.main;
    for (let i = 0; i < text.length; i++) {
      const g = this.glyph(L, text[i]);
      w += g ? g.w : this.pointSize * 0.3;
      if (i + 1 < text.length) w += L.kern[text[i] + text[i + 1]] || 0;
    }
    return w;
  }

  covers(text) {
    for (const ch of text) if (ch !== ' ' && !this.glyph(this.main, ch)) return false;
    return true;
  }

  /**
   * draw(ctx, text, x, y, opts)
   *  y is the baseline unless opts.valign = 'middle' | 'top'
   *  opts: size (px), align ('left'|'center'|'right'), colors {MAIN, OUTLINE, GLOW}, alpha, layers (filter)
   */
  draw(ctx, text, x, y, opts = {}) {
    text = String(text);
    if (this.fallback && !this.covers(text)) return this.fallback.draw(ctx, text, x, y, opts);
    const scale = (opts.size || this.pointSize) / this.pointSize;
    const w = this.measure(text) * scale;
    if (opts.align === 'center') x -= w / 2;
    else if (opts.align === 'right') x -= w;
    if (opts.valign === 'middle') y += (this.ascent * scale) * 0.36;
    else if (opts.valign === 'top') y += this.ascent * scale;
    const colors = { ...DEFAULT_COLORS, ...(opts.colors || {}) };
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    for (const L of this.layers) {
      const color = colors[L.name];
      if (color === null || (opts.layers && !opts.layers.includes(L.name))) continue;
      const img = this.assets.tinted(L.img, color || '#ffffff', 'font:' + L.image);
      let pen = x;
      for (let i = 0; i < text.length; i++) {
        const g = this.glyph(L, text[i]);
        if (g) {
          const [rx, ry, rw, rh] = g.r;
          // the fonts' colon glyph is a single dot: draw it twice, stacked
          const reps = text[i] === ':' && rh < L.ascent * 0.3 ? [0, -L.ascent * 0.36] : [0];
          if (rw > 0 && rh > 0)
            for (const dy of reps)
              ctx.drawImage(img, rx, ry, rw, rh,
                pen + (g.o[0] + L.offset[0]) * scale, y + (g.o[1] + L.offset[1] - L.ascent + dy) * scale,
                rw * scale, rh * scale);
          pen += g.w * scale;
        } else pen += this.pointSize * 0.3 * scale;
        if (i + 1 < text.length) pen += (L.kern[text[i] + text[i + 1]] || 0) * scale;
      }
    }
    ctx.restore();
    return w;
  }
}
