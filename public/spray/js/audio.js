// Synthesised sounds: hiss while spraying, mixing-ball rattle when the can is
// shaken, and small clacks for cap / ground contact. No audio files needed.
(function () {
  'use strict';
  const S = (window.Spray = window.Spray || {});
  const A = (S.Audio = { muted: false });

  let ac = null, noise = null, master, hissGain, hissBP, hissLP, remote = null;

  A.init = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const len = ac.sampleRate * 2;
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

    master = ac.createGain();
    master.gain.value = A.muted ? 0 : 0.9;
    master.connect(ac.destination);

    ({ gain: hissGain, bp: hissBP, lp: hissLP } = makeHiss());
    remote = makeHiss();
  };

  function makeHiss() {
    const src = ac.createBufferSource();
    src.buffer = noise; src.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6500; bp.Q.value = 0.5;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000;
    const gain = ac.createGain(); gain.gain.value = 0;
    src.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(gain); gain.connect(master);
    src.start(ac.currentTime, Math.random() * 1.5);
    return { gain, bp, lp };
  }

  // the other player's can, a little quieter
  A.remoteSpray = function (on, dist) {
    if (!remote) return;
    const t = ac.currentTime;
    remote.gain.gain.setTargetAtTime(on ? 0.12 : 0, t, on ? 0.02 : 0.05);
    if (on) remote.bp.frequency.setTargetAtTime(5600 + dist * 40, t, 0.05);
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.02);
  };

  A.spray = function (on, dist, skinny) {
    if (!ac) return;
    const t = ac.currentTime;
    hissGain.gain.setTargetAtTime(on ? (skinny ? 0.13 : 0.22) : 0, t, on ? 0.012 : 0.035);
    if (on) {
      hissBP.frequency.setTargetAtTime((skinny ? 8200 : 5600) + dist * 40, t, 0.05);
      hissLP.frequency.setTargetAtTime(14000 - dist * 120, t, 0.05);
    }
  };

  function burst(t, freq, q, vol, decay, dur) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t, Math.random() * 1.5, dur);
  }

  function ping(t, freq, vol, decay) {
    const o = ac.createOscillator();
    o.type = 'sine'; o.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + decay + 0.02);
  }

  // the little ball inside the can
  A.rattle = function (intensity) {
    if (!ac) return;
    const v = Math.min(1, intensity);
    const t = ac.currentTime;
    const hits = 1 + (Math.random() * 2 | 0);
    for (let i = 0; i < hits; i++) {
      const tt = t + i * (0.018 + Math.random() * 0.02);
      burst(tt, 2600 + Math.random() * 1400, 7, 0.5 * v, 0.045, 0.06);
      ping(tt, 3100 + Math.random() * 900, 0.05 * v, 0.06);
    }
  };

  A.capOff = function () {
    if (!ac) return;
    const t = ac.currentTime;
    burst(t, 900, 2.5, 0.35, 0.05, 0.07);
    burst(t + 0.05, 1700, 3, 0.18, 0.04, 0.05);
  };

  // air rushing past a thrown can
  A.whoosh = function (v) {
    if (!ac) return;
    const t = ac.currentTime, vol = Math.min(1, v || 0.6);
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.45);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35 * vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t, Math.random(), 0.55);
  };

  // little arpeggio for unlocking something
  A.chime = function () {
    if (!ac) return;
    const t = ac.currentTime;
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      ping(t + i * 0.09, f, 0.12, 0.6);
      ping(t + i * 0.09, f * 2.01, 0.03, 0.35);
    });
  };

  A.clank = function (v) {
    if (!ac) return;
    const t = ac.currentTime;
    const vol = Math.min(1, v || 0.6);
    burst(t, 1500, 3, 0.5 * vol, 0.09, 0.12);
    ping(t, 1850, 0.07 * vol, 0.25);
    ping(t, 2710, 0.04 * vol, 0.18);
    burst(t + 0.07, 900, 2, 0.2 * vol, 0.05, 0.06);
  };
})();
