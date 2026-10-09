// Loads the converted assets listed in assets/manifest.json.
const BASE = 'assets/';

export class Sprite {
  constructor(img, meta) {
    this.img = img;
    this.meta = meta;
    this.cols = meta.cols || 1;
    this.rows = meta.rows || 1;
    this.fw = Math.floor(meta.w / this.cols);
    this.fh = Math.floor(meta.h / this.rows);
    this.frames = this.cols * this.rows;
    this.x = meta.x || 0;
    this.y = meta.y || 0;
  }
  // draw frame centred at (cx, cy)
  drawC(ctx, frame, cx, cy, scale = 1, rot = 0) {
    frame = ((frame | 0) % this.frames + this.frames) % this.frames;
    const sx = (frame % this.cols) * this.fw, sy = Math.floor(frame / this.cols) * this.fh;
    const w = this.fw * scale, h = this.fh * scale;
    if (rot) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.drawImage(this.img, sx, sy, this.fw, this.fh, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(this.img, sx, sy, this.fw, this.fh, cx - w / 2, cy - h / 2, w, h);
    }
  }
  // draw frame with its top-left at (x, y)
  draw(ctx, frame, x, y, w = this.fw, h = this.fh) {
    frame = ((frame | 0) % this.frames + this.frames) % this.frames;
    const sx = (frame % this.cols) * this.fw, sy = Math.floor(frame / this.cols) * this.fh;
    ctx.drawImage(this.img, sx, sy, this.fw, this.fh, x, y, w, h);
  }
  // draw at the position the original layout placed it (resource x/y), shifted by (dx, dy)
  drawAt(ctx, dx = 0, dy = 0, frame = 0) {
    this.draw(ctx, frame, this.x + dx, this.y + dy);
  }
  // 9-slice panel drawing
  drawPanel(ctx, x, y, w, h, m = 100, frame = 0) {
    const sx0 = (frame % this.cols) * this.fw, sy0 = Math.floor(frame / this.cols) * this.fh;
    const W = this.fw, H = this.fh;
    const mx = Math.min(m, w / 2, W / 2), my = Math.min(m, h / 2, H / 2);
    const srcX = [0, mx, W - mx, W], srcY = [0, my, H - my, H];
    const dstX = [x, x + mx, x + w - mx, x + w], dstY = [y, y + my, y + h - my, y + h];
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const sw = srcX[i + 1] - srcX[i], sh = srcY[j + 1] - srcY[j];
        const dw = dstX[i + 1] - dstX[i], dh = dstY[j + 1] - dstY[j];
        if (sw > 0 && sh > 0 && dw > 0 && dh > 0)
          ctx.drawImage(this.img, sx0 + srcX[i], sy0 + srcY[j], sw, sh, dstX[i], dstY[j], dw, dh);
      }
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + url));
    img.src = url;
  });
}

export class Assets {
  constructor() {
    this.sprites = {};
    this.backgrounds = {};
    this.fonts = {};
    this.manifest = null;
    this._tints = new Map();
  }

  async loadManifest() {
    // always asked again (a browser may still hold an older list from before new art was added);
    // if that check fails, the ordinary request still gets the game going
    let r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' }).catch(() => null);
    if (!r || !r.ok) r = await fetch(BASE + 'manifest.json');
    if (!r.ok) throw new Error(`assets/manifest.json missing (HTTP ${r.status}) - run tools/build_assets.py first`);
    this.manifest = await r.json();
    return this.manifest;
  }

  // Loads everything except music (streamed) and sounds (handled by audio).
  async loadAll(onProgress) {
    const m = this.manifest;
    const jobs = [];
    for (const [name, meta] of Object.entries(m.images))
      jobs.push(() => loadImage(BASE + 'img/' + name + '.png').then((img) => (this.sprites[name] = new Sprite(img, meta))));
    for (const name of new Set([...m.backgrounds, m.menuBackground, ...(m.iceBackgrounds || []), ...(m.extraBackgrounds || [])]))
      jobs.push(() => loadImage(BASE + 'bg/' + name + '.jpg').then((img) => (this.backgrounds[name] = img)));
    for (const name of m.fonts)
      jobs.push(async () => {
        const def = await (await fetch(BASE + 'fonts/' + name + '.json')).json();
        await Promise.all(def.layers.map(async (L) => (L.img = await loadImage(BASE + 'fonts/' + L.image + '.png'))));
        this.fonts[name] = def;
      });
    let done = 0;
    const total = jobs.length;
    // limited concurrency keeps the progress bar honest
    const queue = jobs.slice();
    const worker = async () => {
      while (queue.length) {
        await queue.shift()();
        done++;
        onProgress && onProgress(done / total);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }

  s(name) {
    return this.sprites[name];
  }

  // Returns a canvas of `img` multiplied by `color` (keeps alpha). Cached.
  tinted(img, color, key) {
    const k = (key || img.src) + '|' + color;
    let c = this._tints.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    this._tints.set(k, c);
    return c;
  }

  tintedSprite(name, color) {
    const k = name + '|' + color;
    let sp = this.sprites[k];
    if (!sp) {
      const base = this.sprites[name];
      sp = this.sprites[k] = new Sprite(this.tinted(base.img, color, name), base.meta);
    }
    return sp;
  }
}
