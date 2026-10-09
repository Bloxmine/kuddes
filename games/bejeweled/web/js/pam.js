// Player for PopCap PopAnim (.pam) animations baked to JSON by tools/pam.py.
// Frame objects: [kind, res, a, b, c, d, tx, ty, r, g, b, alpha, start, additive]

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export class PamAnim {
  static async load(name) {
    const def = await (await fetch('assets/pam/' + name + '.json')).json();
    const imgs = await Promise.all(def.images.map((im) => (im.file ? loadImage('assets/pam/' + im.file + '.png') : null)));
    return new PamAnim(def, imgs);
  }

  constructor(def, imgs) {
    this.def = def;
    this.imgs = imgs;
    this.byName = {};
    def.sprites.forEach((s, i) => { if (s.name) this.byName[s.name] = i; });
  }

  sprite(name) {
    if (name === undefined || name === null) return this.def.main;
    return typeof name === 'number' ? this.def.sprites[name] : this.def.sprites[this.byName[name]];
  }

  has(name) { return name in this.byName; }
  frameCount(name) { const s = this.sprite(name); return s ? s.frames.length : 0; }

  /**
   * Draw a sprite. time in seconds (or opts.frame). opts:
   *  x, y, scale, alpha, loop (default true), from/to: frame range (for labelled main timelines)
   */
  draw(ctx, name, time, opts = {}) {
    const sp = this.sprite(name);
    if (!sp) return;
    const n = sp.frames.length;
    const from = opts.from ?? 0, to = opts.to ?? n - 1;
    let f = opts.frame ?? Math.floor(time * (sp.fps || this.def.fps));
    const len = to - from + 1;
    f = opts.loop === false ? from + Math.min(f, len - 1) : from + (((f % len) + len) % len);
    ctx.save();
    if (opts.x || opts.y) ctx.translate(opts.x || 0, opts.y || 0);
    if (opts.scale && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    const base = ctx.getTransform();
    this.drawFrame(ctx, sp, f, base, ctx.globalAlpha, opts.skip);
    ctx.restore();
  }

  drawFrame(ctx, sp, f, M, alpha, skip) {
    const objs = sp.frames[Math.min(f, sp.frames.length - 1)];
    if (!objs) return;
    for (const o of objs) {
      const a = alpha * o[11];
      if (a <= 0.004) continue;
      // M * object matrix
      const m = M.multiply(new DOMMatrix([o[2], o[3], o[4], o[5], o[6], o[7]]));
      if (o[0] === 1) {
        const child = this.def.sprites[o[1]];
        const cn = child.frames.length;
        this.drawFrame(ctx, child, cn ? (((f - o[12]) % cn) + cn) % cn : 0, m, a, skip);
      } else {
        const img = this.imgs[o[1]];
        if (!img || (skip && skip(o[1]))) continue;
        const im = this.def.images[o[1]];
        const t = im.t;
        const mm = m.multiply(new DOMMatrix([t[0], t[1], t[2], t[3], t[4], t[5]]));
        ctx.setTransform(mm);
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = o[13] ? 'lighter' : 'source-over';
        ctx.drawImage(img, 0, 0, im.w || img.width, im.h || img.height);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Plays labelled ranges of a main timeline (e.g. spider: drop / idle / walk / grab).
export class PamClip {
  constructor(anim) {
    this.anim = anim;
    const main = anim.def.main;
    this.labels = main ? main.labels : {};
    this.stops = main ? main.stops : [];
    this.play('idle', true);
  }
  range(label) {
    const from = this.labels[label] ?? 0;
    const to = this.stops.find((s) => s >= from) ?? this.anim.def.main.frames.length - 1;
    return [from, to];
  }
  play(label, loop = false) {
    this.label = label;
    this.loop = loop;
    this.t = 0;
    [this.from, this.to] = this.range(label);
  }
  get done() { return !this.loop && this.t * this.anim.def.main.fps >= this.to - this.from; }
  update(dt) { this.t += dt; }
  draw(ctx, x, y, scale = 1, alpha = 1) {
    this.anim.draw(ctx, null, this.t, { x, y, scale, alpha, from: this.from, to: this.to, loop: this.loop });
  }
}
