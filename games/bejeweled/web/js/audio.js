// Web Audio sound effects + streamed music with crossfades.
import { store } from './util.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.loading = {};
    this.lastPlay = {};
    this.music = null; // { name, el, gain }
    this.musicVolume = store('musicVolume') ?? 0.7;
    this.sfxVolume = store('sfxVolume') ?? 0.8;
    this.wantedMusic = null;
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
      for (const name of Object.keys(this.pendingNames || {})) this.load(name);
      if (this.wantedMusic) this.playMusic(this.wantedMusic.name, this.wantedMusic.fade);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return !!this.ctx;
  }

  async load(name) {
    if (this.buffers[name] || this.loading[name]) return this.loading[name];
    if (!this.ctx) {
      (this.pendingNames ||= {})[name] = true;
      return;
    }
    this.loading[name] = fetch('assets/sfx/' + name + '.ogg')
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx.decodeAudioData(b))
      .then((buf) => (this.buffers[name] = buf))
      .catch((e) => console.warn('sound', name, e));
    return this.loading[name];
  }

  preload(names) {
    return Promise.all(names.map((n) => this.load(n)));
  }

  /**
   * play('combo_3', { volume, rate, pan, minGap })
   * minGap (seconds) rate-limits rapid repeats of the same sound.
   */
  play(name, opts = {}) {
    if (!this.ctx) return null;
    const buf = this.buffers[name];
    if (!buf) {
      // not loaded yet: play it as soon as it is (if that's still in time), instead of not at all
      const asked = this.ctx.currentTime;
      Promise.resolve(this.load(name)).then(() => {
        const late = this.ctx.currentTime - asked;
        if (this.buffers[name] && late < 1) this.play(name, { ...opts, delay: Math.max(0, (opts.delay || 0) - late) });
      });
      return null;
    }
    const now = this.ctx.currentTime;
    const gap = opts.minGap ?? 0.03;
    if (this.lastPlay[name] !== undefined && now - this.lastPlay[name] < gap) return null;
    this.lastPlay[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    let node = src;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    node.connect(g);
    node = g;
    if (opts.pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(p);
      node = p;
    }
    node.connect(this.sfxGain);
    src.start(now + (opts.delay || 0));
    if (opts.loop) src.loop = true;
    return { src, gain: g };
  }

  playMusic(name, fade = 1.0) {
    this.wantedMusic = { name, fade };
    if (!this.ctx) return;
    if (this.music && this.music.name === name) return;
    this.stopMusic(fade);
    const info = (this.manifestMusic || {})[name] || { loop: true };
    const el = new Audio('assets/music/' + name + '.ogg');
    el.loop = info.loop;
    el.preload = 'auto';
    const srcNode = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    srcNode.connect(gain);
    gain.connect(this.musicGain);
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + Math.max(0.01, fade));
    el.play().catch(() => {});
    this.music = { name, el, gain };
  }

  stopMusic(fade = 1.0) {
    if (!this.music) return;
    const { el, gain } = this.music;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
    setTimeout(() => {
      el.pause();
      el.src = '';
    }, fade * 1000 + 50);
    this.music = null;
    this.wantedMusic = null;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    store('musicVolume', v);
    if (this.musicGain) this.musicGain.gain.value = v;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    store('sfxVolume', v);
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  suspend(hidden) {
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend();
    else this.ctx.resume();
  }
}
