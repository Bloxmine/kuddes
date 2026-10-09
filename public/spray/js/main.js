(function () {
  'use strict';
  const S = window.Spray, P = S.Paint, Can = S.Can, Audio = S.Audio, Net = S.Net;

  const BASIC = [
    { name: 'Sneeuw', hex: '#f3f1ea' },
    { name: 'Nacht', hex: '#161616' },
    { name: 'Vuurrood', hex: '#d8261c' },
    { name: 'Mandarijn', hex: '#f27a14' },
    { name: 'Zonneschijn', hex: '#f6d20c' },
    { name: 'Blad', hex: '#2f9e45' },
    { name: 'Hemelsblauw', hex: '#3ab8ea' },
    { name: 'Kobalt', hex: '#1d5bd6' },
    { name: 'Violet', hex: '#6a3db8' },
    { name: 'Kauwgom', hex: '#ee4e9b' },
  ];

  const SPECIAL = [
    { name: 'Goud', hex: '#d4a93a', kind: 'metal', pal: ['#5a3d0c', '#b8871f', '#f7de8a', '#fff6d8'] },
    { name: 'Zilver', hex: '#b9bec4', kind: 'metal', pal: ['#4a4f55', '#a3a9b0', '#e9edf1', '#ffffff'] },
    { name: 'Koper', hex: '#c06a3a', kind: 'metal', pal: ['#4a200d', '#a4532a', '#f0a878', '#ffe2cc'] },
    { name: 'Chroom', hex: '#d9dde2', kind: 'metal', contrast: 1.7, pal: ['#1d2126', '#8d949b', '#f4f6f8', '#ffffff'] },
    { name: 'Holografisch', hex: '#b9a8e8', kind: 'holo', pal: ['#ff9ad5', '#9ae6ff', '#fff3a0'] },
    { name: 'Goudglitter', hex: '#b08a2c', kind: 'glitter', pal: ['#fff3c2', '#f5cf5a', '#d9a426', '#ffffff', '#b8861c'] },
    { name: 'Discoglitter', hex: '#8f86ad', kind: 'glitter', pal: ['#ff5ec4', '#5ee7ff', '#fff27a', '#b27bff', '#ffffff', '#7dffb0'] },
    { name: 'Sterrenconfetti', hex: '#1c2150', mist: '#b996ff', kind: 'stars', pal: ['#ffffff', '#ffe26a', '#ff7ac8', '#7ae0ff', '#b996ff'] },
    { name: 'Gouden sterren', hex: '#3a2a10', mist: '#f5c542', kind: 'stars', pal: ['#ffe07a', '#f5c542', '#fff4c9', '#d9a426'] },
    { name: 'Regenboog', hex: '#e84aa0', kind: 'rainbow', pal: ['#ff4a4a', '#ffd84a', '#4aff8a', '#4ac8ff', '#b44aff'] },
  ];

  const CAPS = {
    fat: { name: 'Dikke cap', spread: 0.3, flow: 46000 },
    skinny: { name: 'Dunne cap', spread: 0.11, flow: 12000 },
  };

  const DIST_MIN = 2, DIST_MAX = 45;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const stage = $('#stage');
  const wallC = $('#wall'), paintC = $('#paint'), reliefC = $('#relief'), uiC = $('#ui');
  const ui = uiC.getContext('2d');
  const distInput = $('#dist'), distVal = $('#distVal'), hint = $('#hint');
  const dripInput = $('#drip'), dripVal = $('#dripVal');
  const menuBtn = $('#menuBtn'), settings = $('#settings'), wallsEl = $('#walls');

  const store = {
    get(k, d) { try { const v = localStorage.getItem('spraywall.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('spraywall.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  let cssW = 0, cssH = 0, dpr = 1, spriteDpr = 0, floorY = 0, groundY = 0, shelfScale = 1;
  let dist = 12, capKey = store.get('cap', 'fat') === 'skinny' ? 'skinny' : 'fat';
  let wallType = store.get('wall', 'concrete');
  if (!S.WALL_TYPES.some((w) => w.id === wallType)) wallType = 'concrete';
  let drip = clamp(+store.get('drip', 50) || 0, 0, 100);
  let flash = { text: '', t: 0 };
  let held = null;
  let seed = (Math.random() * 1e9) | 0; // the host's seed wins when playing together
  const mouse = { x: -999, y: -999, down: false };
  let spraying = false, prevAim = null;
  const mist = [];
  const canFilter = 'filter' in ui;

  const SECRET = [
    { name: 'Houtnerf', hex: '#9a6a3a', kind: 'pattern', pattern: 'wood' },
    { name: 'Vampier', hex: '#4a0610', mist: '#5a0610', kind: 'vampire' },
    { name: 'Plasma', hex: '#c040ff', kind: 'anim', pattern: 'plasma' },
    { name: 'Lava', hex: '#ff5a10', kind: 'anim', pattern: 'lava' },
    { name: 'Melkweg', hex: '#3a1e6e', mist: '#6a3ab0', kind: 'pattern', pattern: 'galaxy' },
    { name: 'Camouflage', hex: '#566b30', kind: 'pattern', pattern: 'camo' },
    { name: 'Zebra', hex: '#e8e6e0', mist: '#8a8a8a', kind: 'pattern', pattern: 'zebra' },
    { name: 'Marmer', hex: '#e6e4de', kind: 'pattern', pattern: 'marble' },
    { name: 'Luipaard', hex: '#d89a48', kind: 'pattern', pattern: 'leopard' },
    { name: 'RGB', hex: /^#[0-9a-f]{6}$/i.test(store.get('rgb', '')) ? store.get('rgb') : '#00e5ff', kind: 'rgb' },
  ];

  // the secret row opens once every basic and special can has been sprayed
  const TRACKED = [...BASIC, ...SPECIAL].map((c) => c.name);
  const used = new Set((store.get('used', []) || []).filter((n) => TRACKED.includes(n)));
  let unlocked = !!store.get('unlocked', false) || used.size >= TRACKED.length;

  const GRAVITY = 2800;
  const makeCan = (set) => (color, i) => ({
    color, i, set,
    spr: null,
    // shelf | held | returning | tossOut | tossIn | away
    state: set === 'basic' ? 'shelf' : 'away',
    slot: { x: 0, y: 0 },
    jx: (Math.random() - 0.5) * 6, jy: (Math.random() - 0.5) * 5,
    x: 0, y: 0, vx: 0, vy: 0, ang: 0, av: 0, scale: 1,
    hover: 0, lastRattle: 0, pvx: 0, pvy: 0, returnT: 0,
    cx: 0, cy: 0, delay: 0, t: 0, T: 0, sx: 0, sy: 0, vy0: 0, ang0: 0, capOn: true, hop: 0,
  });
  const sets = {
    basic: BASIC.map(makeCan('basic')),
    special: SPECIAL.map(makeCan('special')),
    secret: SECRET.map(makeCan('secret')),
  };
  const allCans = [...sets.basic, ...sets.special, ...sets.secret];
  const rgbCan = sets.secret[9];
  const SET_ORDER = ['basic', 'special', 'secret'];
  const SET_LABEL = { basic: 'Gewoon', special: 'Speciaal', secret: 'Geheim' };
  let shelfSet = 'basic';
  let cans = sets[shelfSet];          // the set currently standing on the ground
  const glints = [];
  const cycleBtn = $('#cycleBtn');

  // ---------------------------------------------------------------- layout

  function layout() {
    cssW = window.innerWidth; cssH = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const groundH = clamp(cssH * 0.14, 70, 130);
    floorY = Math.round(cssH - groundH);
    groundY = floorY + groundH * 0.6;
    const Wd = Math.round(cssW * dpr), Hd = Math.round(cssH * dpr);

    S.generateWall(wallC, reliefC, Wd, Hd, dpr, floorY, seed, wallType);
    P.init(paintC, Wd, Hd, dpr, floorY);
    uiC.width = Wd; uiC.height = Hd;
    animC.width = Wd; animC.height = Hd;
    scratch.width = Wd; scratch.height = Hd;
    for (const k in patFrames) delete patFrames[k];

    if (spriteDpr !== dpr) {
      spriteDpr = dpr;
      for (const c of allCans) c.spr = Can.build(c.color, dpr * 1.8);
    }

    shelfScale = clamp((cssW - 40) / (BASIC.length * 50), 0.5, 1);
    const sp = 50 * shelfScale;
    const right = cssW - 24 - 20 * shelfScale;
    for (const c of allCans) {
      c.slot.x = right - (BASIC.length - 1 - c.i) * sp + c.jx * shelfScale;
      c.slot.y = groundY + c.jy * shelfScale;
      if (c.state === 'shelf') placeOnShelf(c);
    }
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--shelf-width', `${cssW - (cans[0].slot.x - 22 * shelfScale)}px`);
    rootStyle.setProperty('--hint-bottom', `${cssH - groundY + 30 * shelfScale}px`);
    rootStyle.setProperty('--cycle-bottom', `${cssH - groundY - 4}px`);
  }

  function slotPivot(c) {
    return { x: c.slot.x, y: c.slot.y + Can.NOZZLE * shelfScale };
  }

  function placeOnShelf(c) {
    const p = slotPivot(c);
    c.x = p.x; c.y = p.y; c.vx = c.vy = 0; c.ang = 0; c.av = 0; c.scale = shelfScale;
  }

  // ---------------------------------------------------------------- cans

  function canAt(x, y) {
    for (let k = cans.length - 1; k >= 0; k--) {
      const c = cans[k], s = shelfScale;
      if (c.state !== 'shelf' && c.state !== 'held' && c.state !== 'returning') continue;
      const top = c.state === 'shelf' ? c.slot.y - Can.H * s - 6 : c.slot.y - 30 * s;
      if (x > c.slot.x - 22 * s && x < c.slot.x + 22 * s && y > top && y < c.slot.y + 8 * s) return k;
    }
    return -1;
  }

  function pick(k) {
    if (held) putBack();
    const c = cans[k];
    if (c.state !== 'shelf') return;
    placeOnShelf(c);
    c.state = 'held';
    held = c;
    Audio.capOff();
    stage.classList.add('holding');
    document.body.classList.add('holding');
    toggleSettings(false);
    hint.classList.add('gone');
    if (c === rgbCan) showFlash('Druk op P om een kleur te kiezen');
  }

  function putBack() {
    if (!held) return;
    stopSpray();
    if (held.set === shelfSet) {
      held.state = 'returning';
      held.returnT = 0;
    } else {
      // its set isn't on the ground any more: chuck it
      pivotToCenter(held);
      held.capOn = false;
      tossOut(held, 0);
      held.vx = held.vx * 0.4 + 250 + Math.random() * 250;
      held.vy = Math.min(held.vy * 0.4, 0) - 750;
      Audio.whoosh(0.5);
    }
    held = null;
    stage.classList.remove('holding');
    document.body.classList.remove('holding');
  }

  // ---------------------------------------------------------------- tossing sets

  const CENTER = -Can.H / 2;                 // can centre relative to its bottom
  const PIVOT_TO_CENTER = CENTER - Can.NOZZLE; // centre relative to the nozzle

  function pivotToCenter(c) {
    const d = PIVOT_TO_CENTER * c.scale;
    c.cx = c.x - Math.sin(c.ang) * d;
    c.cy = c.y + Math.cos(c.ang) * d;
  }

  function tossOut(c, delay) {
    if (c.state === 'shelf') {
      c.cx = c.slot.x; c.cy = c.slot.y + CENTER * shelfScale; c.ang = 0; c.scale = shelfScale; c.capOn = true;
    } else if (c.state === 'returning') {
      pivotToCenter(c); c.capOn = false;
    }
    if (c.state !== 'tossIn') {
      c.vx = 250 + Math.random() * 450;
      c.vy = -(850 + Math.random() * 450);
    }
    c.av = (Math.random() * 2 - 1) * 12 + 5;
    c.delay = delay;
    c.state = 'tossOut';
  }

  function tossIn(c, delay) {
    const onScreen = c.state === 'tossOut' && c.delay <= 0 && c.cy < cssH && c.cx < cssW + 40;
    c.sx = onScreen ? c.cx : cssW + 60 + Math.random() * 160;
    c.sy = onScreen ? c.cy : groundY - 260 - Math.random() * 240;
    c.T = 0.55 + Math.random() * 0.25;
    c.t = 0;
    c.delay = delay;
    const ty = c.slot.y + CENTER * shelfScale;
    c.vy0 = (ty - c.sy - 0.5 * GRAVITY * c.T * c.T) / c.T;
    c.ang0 = (onScreen ? c.ang : 0) - Math.PI * 2 * (1 + ((Math.random() * 2) | 0));
    c.scale = shelfScale;
    c.capOn = true;
    c.cx = c.sx; c.cy = c.sy; c.ang = c.ang0;
    c.state = 'tossIn';
  }

  function nextSet() {
    const order = unlocked ? SET_ORDER : SET_ORDER.slice(0, 2);
    return order[(order.indexOf(shelfSet) + 1) % order.length];
  }

  function updateCycleLabel() {
    const n = nextSet();
    cycleBtn.querySelector('span').textContent = SET_LABEL[n];
    cycleBtn.title = `Wissel naar de ${SET_LABEL[n].toLowerCase()}e bussen (C)`;
  }

  function cycleSets(to) {
    const out = shelfSet, into = to || nextSet();
    if (into === out) return;
    shelfSet = into;
    cans = sets[into];
    sets[out].forEach((c, idx) => {
      if (c.state === 'shelf' || c.state === 'tossIn' || c.state === 'returning') tossOut(c, idx * 0.035);
    });
    sets[into].forEach((c, idx) => {
      if (c.state === 'tossOut' && c.delay > 0) { c.state = 'shelf'; placeOnShelf(c); } // hadn't left yet
      else if (c.state === 'away' || c.state === 'tossOut') tossIn(c, 0.2 + idx * 0.05);
    });
    if (into === 'secret') cycleBtn.classList.remove('fresh');
    updateCycleLabel();
    Audio.whoosh(1);
    hoverIdx = -1;
  }

  function updateToss(c, dt) {
    if (c.delay > 0) { c.delay -= dt; return; }
    if (c.state === 'tossOut') {
      c.vy += GRAVITY * dt;
      c.cx += c.vx * dt; c.cy += c.vy * dt;
      c.ang += c.av * dt;
      if (c.cy > cssH + 200 || c.cx > cssW + 250 || c.cx < -250) c.state = 'away';
    } else {
      c.t = Math.min(c.T, c.t + dt);
      const p = c.t / c.T;
      c.cx = c.sx + (c.slot.x - c.sx) * p;
      c.cy = c.sy + c.vy0 * c.t + 0.5 * GRAVITY * c.t * c.t;
      c.ang = c.ang0 * (1 - p) * (1 - p);
      if (p >= 1) {
        c.state = 'shelf';
        placeOnShelf(c);
        c.hop = 1;
        Audio.clank(0.25 + Math.random() * 0.15);
      }
    }
  }

  function integrate(c, tx, ty, k, zeta, baseAng, dt) {
    const damp = 2 * Math.sqrt(k) * zeta;
    const steps = 3, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ax = k * (tx - c.x) - damp * c.vx;
      const ay = k * (ty - c.y) - damp * c.vy;
      c.vx += ax * h; c.vy += ay * h;
      c.x += c.vx * h; c.y += c.vy * h;
      // the body hangs below the nozzle and lags behind sideways acceleration
      const aa = 55 * (baseAng - c.ang) - 6.5 * c.av + ax * 0.0011 - ay * 0.0002 * Math.sin(c.ang);
      c.av += aa * h;
      c.ang = clamp(c.ang + c.av * h, -1.3, 1.3);
    }
  }

  function updateCans(dt, now) {
    for (const c of allCans) {
      if (c.state === 'away') continue;
      if (c.state === 'tossOut' || c.state === 'tossIn') { updateToss(c, dt); continue; }
      if (c.hop > 0) c.hop = Math.max(0, c.hop - dt * 4);
      if (c.state === 'held') {
        const s = 0.78 + (dist / DIST_MAX) * 0.8; // farther from the wall = closer to your eye
        c.scale += (s - c.scale) * Math.min(1, dt * 8);
        const tx = mouse.x + 18 * c.scale, ty = mouse.y + 24 * c.scale;
        integrate(c, tx, ty, 650, 0.6, -0.28, dt);
        if (spraying) c.ang += (Math.random() - 0.5) * 0.006;

        // mixing ball rattles when the can changes direction hard
        const sp = Math.hypot(c.pvx, c.pvy);
        if (c.vx * c.pvx + c.vy * c.pvy < 0 && sp > 650 && now - c.lastRattle > 70) {
          Audio.rattle(sp / 2600);
          c.lastRattle = now;
        }
        c.pvx = c.vx; c.pvy = c.vy;
      } else if (c.state === 'returning') {
        const p = slotPivot(c);
        c.returnT += dt;
        c.scale += (shelfScale - c.scale) * Math.min(1, dt * 7);
        integrate(c, p.x, p.y, 240, 0.85, 0, dt);
        const d = Math.hypot(p.x - c.x, p.y - c.y), v = Math.hypot(c.vx, c.vy);
        if ((d < 1.5 && v < 40 && Math.abs(c.ang) < 0.06) || c.returnT > 2.5) {
          placeOnShelf(c);
          c.state = 'shelf';
          Audio.clank(0.5);
        }
      } else {
        const target = c.i === hoverIdx && !held ? 1 : c.i === hoverIdx ? 0.6 : 0;
        c.hover += (target - c.hover) * Math.min(1, dt * 14);
      }
    }
  }

  // ---------------------------------------------------------------- spraying

  function startSpray() {
    spraying = true;
    prevAim = null;
    Audio.spray(true, dist, capKey === 'skinny');
  }

  function stopSpray() {
    if (!spraying) return;
    spraying = false;
    prevAim = null;
    Audio.spray(false, dist);
  }

  const path = [];
  function doSpray(dt) {
    if (!held || !spraying) { path.length = 0; return; }
    const aim = { x: mouse.x * dpr, y: mouse.y * dpr };
    const burst = !prevAim;
    const pts = [prevAim || aim, ...path, aim];
    path.length = 0;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const cap = CAPS[capKey];
    const paint = held.spr.paint;
    paint.time += dt;
    markUsed(held);
    // every segment gets its own seed so a friend can replay it dot for dot
    const segs = [];
    const spray = (ax, ay, bx, by, sdt, b) => {
      const sd = (Math.random() * 4294967296) >>> 0;
      P.spray(ax, ay, bx, by, paint, dist, sdt, cap, b, sd);
      if (Net.connected) segs.push([ax / dpr, floorY - ay / dpr, bx / dpr, floorY - by / dpr, sdt, sd, b ? 1 : 0]);
    };
    if (total < 0.5) {
      spray(aim.x, aim.y, aim.x, aim.y, dt, burst);
    } else {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (seg > 0) spray(a.x, a.y, b.x, b.y, dt * seg / total, burst && i === 1);
      }
    }
    prevAim = aim;
    if (segs.length) {
      Net.send({
        t: 's', set: held.set, i: held.i, d: dist, cap: capKey, time: paint.time,
        rgb: held === rgbCan ? paint.rgb : undefined, segs,
      });
    }
    spawnMist(mouse.x, mouse.y, held.spr.mist, dist, capKey, dt);
  }

  // airborne mist around a spray point
  function spawnMist(x, y, spr, d, capK, dt) {
    const sigma = P.sigmaCss(d, CAPS[capK]);
    let n = ((capK === 'fat' ? 26 : 10) + d * 1.6) * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)), a = Math.random() * 6.283;
      mist.push({
        x: x + Math.cos(a) * g * sigma * 0.8, y: y + Math.sin(a) * g * sigma * 0.8,
        r: sigma * (0.7 + Math.random() * 0.9), vx: (Math.random() - 0.5) * 14, vy: -4 - Math.random() * 12,
        life: 0, max: 0.6 + Math.random() * 0.9, a: 0.035 + d * 0.0022, spr,
      });
    }
  }

  // glitter and foil stars catch the light now and then
  const flakeTmp = {};
  function updateGlints(dt) {
    let n = Math.min(90, P.flakeCount() * 0.04) * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      if (!P.sampleFlake(flakeTmp)) break;
      glints.push({
        x: flakeTmp.x, y: flakeTmp.y,
        col: `${(flakeTmp.r + 255 * 2) / 3 | 0},${(flakeTmp.g + 255 * 2) / 3 | 0},${(flakeTmp.b + 255 * 2) / 3 | 0}`,
        life: 0, max: 0.25 + Math.random() * 0.35, size: 3 + Math.random() * 5, rot: Math.random() * 0.6,
      });
    }
    for (let i = glints.length - 1; i >= 0; i--) {
      glints[i].life += dt;
      if (glints[i].life >= glints[i].max) glints.splice(i, 1);
    }
  }

  function drawGlints() {
    if (!glints.length) return;
    ui.save();
    ui.globalCompositeOperation = 'lighter';
    ui.lineCap = 'round';
    for (const g of glints) {
      if (g.life < 0) continue;
      const k = Math.sin(Math.PI * g.life / g.max), s = g.size * k;
      ui.strokeStyle = `rgba(${g.col},${0.9 * k})`;
      ui.lineWidth = 1;
      ui.beginPath();
      const c = Math.cos(g.rot), sn = Math.sin(g.rot);
      ui.moveTo(g.x - c * s, g.y - sn * s); ui.lineTo(g.x + c * s, g.y + sn * s);
      ui.moveTo(g.x + sn * s, g.y - c * s); ui.lineTo(g.x - sn * s, g.y + c * s);
      ui.stroke();
      ui.fillStyle = `rgba(255,255,255,${0.9 * k})`;
      ui.beginPath(); ui.arc(g.x, g.y, 1.1 * k + 0.3, 0, Math.PI * 2); ui.fill();
    }
    ui.restore();
  }

  // The Kuddes colours for what's drawn on the wall itself (tags, readouts), from the page's theme
  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  function bubble(x, y, w, h) {
    ui.shadowColor = 'rgba(0,0,0,0.3)';
    ui.shadowBlur = 6;
    ui.shadowOffsetY = 1;
    ui.fillStyle = css('--surface', '#ffffff');
    ui.strokeStyle = css('--box-border', '#c9e3f6');
    ui.lineWidth = 1;
    ui.beginPath();
    if (ui.roundRect) ui.roundRect(x, y, w, h, 5); else ui.rect(x, y, w, h);
    ui.fill();
    ui.shadowColor = 'transparent';
    ui.stroke();
  }

  // ---------------------------------------------------------------- unlocking

  const progressEl = $('#progress');
  function updateProgress() {
    progressEl.textContent = unlocked
      ? '✦ Geheime bussen ontgrendeld! Druk op ⟳ naast de bussen.'
      : `Bussen geprobeerd: ${used.size} / ${TRACKED.length}`;
    progressEl.classList.toggle('unlocked', unlocked);
  }

  const reported = new Set();
  function markUsed(c) {
    if (!reported.has(c.color.name)) {
      reported.add(c.color.name);
      Net.event('can', { name: c.color.name, set: c.set });
    }
    if (c.set === 'secret' || used.has(c.color.name)) return;
    used.add(c.color.name);
    store.set('used', [...used]);
    if (!unlocked && used.size >= TRACKED.length) unlock();
    updateProgress();
  }

  function unlock() {
    unlocked = true;
    store.set('unlocked', true);
    Net.event('unlock');
    showFlash('✦ Geheime bussen ontgrendeld ✦', 3.2);
    cycleBtn.classList.add('fresh');
    updateCycleLabel();
    Audio.chime();
    const cols = ['255,230,120', '255,120,220', '120,230,255', '255,255,255'];
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 160;
      glints.push({
        x: mouse.x + Math.cos(a) * r, y: mouse.y + Math.sin(a) * r, col: cols[i % cols.length],
        life: -Math.random() * 0.8, max: 0.5 + Math.random() * 0.6, size: 5 + Math.random() * 9, rot: Math.random(),
      });
    }
  }

  // ---------------------------------------------------------------- animated paint

  const animC = $('#anim'), animCtx = animC.getContext('2d');
  const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d');
  const patFrames = {};
  let animT = 0;
  function drawAnim(dt) {
    const layers = P.animLayers();
    if (!layers.length) return;
    animT += dt;
    animCtx.clearRect(0, 0, animC.width, animC.height);
    const out = [0, 0, 0], k = 6;
    for (const m of layers) {
      let pf = patFrames[m.name];
      if (!pf) {
        const w = Math.ceil(cssW / k) + 1, h = Math.ceil(floorY / k) + 1;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        pf = patFrames[m.name] = { c, g, img: g.createImageData(w, h), w, h };
      }
      const d = pf.img.data;
      for (let y = 0; y < pf.h; y++) {
        for (let x = 0; x < pf.w; x++) {
          P.pattern(m.name, x * k, y * k, animT, out);
          const i = (y * pf.w + x) * 4;
          d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
        }
      }
      pf.g.putImageData(pf.img, 0, 0);
      sctx.globalCompositeOperation = 'copy';
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(pf.c, 0, 0, pf.w * k * dpr, pf.h * k * dpr);
      sctx.globalCompositeOperation = 'destination-in';
      sctx.drawImage(m.cnv, 0, 0);
      animCtx.drawImage(scratch, 0, 0);
    }
  }

  // ---------------------------------------------------------------- RGB can

  const rgbPicker = $('#rgbPicker');
  rgbPicker.value = rgbCan.color.hex;
  function rgbSwatch() {
    if (shelfSet !== 'secret' || rgbCan.state !== 'shelf') return null;
    const s = shelfScale;
    return { x: rgbCan.slot.x, y: rgbCan.slot.y - (Can.H + 20) * s - rgbCan.hover * 6 * s, r: 7 + 3 * s };
  }
  function openPicker(x, y) {
    rgbPicker.style.left = `${x}px`;
    rgbPicker.style.top = `${y}px`;
    try { if (rgbPicker.showPicker) rgbPicker.showPicker(); else rgbPicker.click(); } catch { rgbPicker.click(); }
  }
  rgbPicker.addEventListener('input', () => {
    rgbCan.color.hex = rgbPicker.value;
    store.set('rgb', rgbPicker.value);
    rgbCan.spr = Can.build(rgbCan.color, dpr * 1.8);
    if (held === rgbCan) showFlash(rgbPicker.value.toUpperCase());
  });

  function drawSwatch() {
    const sw = rgbSwatch();
    if (!sw) return;
    ui.save();
    const ring = ui.createConicGradient ? ui.createConicGradient(0, sw.x, sw.y) : null;
    if (ring) {
      ['#ff2a2a', '#ffe02a', '#2aff5a', '#2affff', '#2a5bff', '#ff2aff', '#ff2a2a'].forEach((c, i) => ring.addColorStop(i / 6, c));
      ui.fillStyle = ring;
    } else ui.fillStyle = '#fff';
    ui.shadowColor = 'rgba(0,0,0,0.35)'; ui.shadowBlur = 4;
    ui.beginPath(); ui.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2); ui.fill();
    ui.shadowBlur = 0;
    ui.fillStyle = rgbCan.color.hex;
    ui.beginPath(); ui.arc(sw.x, sw.y, sw.r * 0.62, 0, Math.PI * 2); ui.fill();
    ui.restore();
  }

  function updateMist(dt) {
    for (let i = mist.length - 1; i >= 0; i--) {
      const m = mist[i];
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.r += dt * 10;
      if (m.life >= m.max) mist.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- drawing

  function drawCanAtPivot(c, spr) {
    ui.save();
    ui.translate(c.x, c.y);
    ui.rotate(c.ang);
    ui.scale(c.scale, c.scale);
    ui.translate(0, -Can.NOZZLE);
    Can.draw(ui, spr);
    ui.restore();
  }

  function drawGroundShadow(x, y, s, a) {
    ui.save();
    ui.translate(x, y);
    ui.scale(s, s);
    // contact shadow
    let g = ui.createRadialGradient(0, 0, 0, 0, 0, 24);
    g.addColorStop(0, `rgba(0,0,0,${0.55 * a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ui.fillStyle = g;
    ui.beginPath(); ui.ellipse(1, 1, 26, 7, 0, 0, Math.PI * 2); ui.fill();
    // cast shadow (light from the upper left)
    ui.transform(1, 0, -1.4, 0.26, 0, 0);
    g = ui.createLinearGradient(0, 0, 0, -118);
    g.addColorStop(0, `rgba(0,0,0,${0.3 * a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ui.fillStyle = g;
    ui.fillRect(-19, -118, 38, 118);
    ui.restore();
  }

  function drawUI() {
    ui.setTransform(1, 0, 0, 1, 0, 0);
    ui.clearRect(0, 0, uiC.width, uiC.height);
    ui.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawGlints();
    drawSwatch();

    // cans and caps on the ground
    for (const c of cans) {
      const s = shelfScale;
      if (c.state === 'tossIn' || c.state === 'tossOut' || c.state === 'away') {
        // shadow grows as an incoming can drops toward its spot
        if (c.state === 'tossIn' && c.delay <= 0) drawGroundShadow(c.slot.x, c.slot.y, s, 0.2 + 0.8 * (c.t / c.T));
        continue;
      }
      drawGroundShadow(c.slot.x, c.slot.y, s, c.state === 'shelf' ? 1 : 0.35);
      ui.save();
      if (c.state === 'shelf') {
        const hop = Math.sin(c.hop * Math.PI) * 7 * s;
        ui.translate(c.slot.x, c.slot.y - c.hover * 6 * s - hop);
        ui.rotate(c.hover * 0.03);
        ui.scale(s, s);
        Can.draw(ui, c.spr.full);
      } else {
        ui.translate(c.slot.x, c.slot.y);
        ui.scale(s, s);
        Can.draw(ui, c.spr.cap);
      }
      ui.restore();
    }

    // mist in the air
    for (const m of mist) {
      const t = m.life / m.max;
      ui.globalAlpha = m.a * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.1)) * (1 - t);
      ui.drawImage(m.spr.c, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    }
    ui.globalAlpha = 1;

    for (const c of allCans) {
      if (c.state === 'returning') drawCanAtPivot(c, c.spr.open);
      else if ((c.state === 'tossOut' || c.state === 'tossIn') && c.delay <= 0) {
        ui.save();
        ui.translate(c.cx, c.cy);
        ui.rotate(c.ang);
        ui.scale(c.scale, c.scale);
        ui.translate(0, -CENTER);
        Can.draw(ui, c.capOn ? c.spr.full : c.spr.open);
        ui.restore();
      }
    }
    // outgoing cans still waiting for their turn stay where they stood
    for (const c of allCans) {
      if (c.set !== shelfSet && c.state === 'tossOut' && c.delay > 0) {
        ui.save();
        ui.translate(c.cx, c.cy);
        ui.rotate(c.ang);
        ui.scale(c.scale, c.scale);
        ui.translate(0, -CENTER);
        Can.draw(ui, c.capOn ? c.spr.full : c.spr.open);
        ui.restore();
      }
    }

    drawFriend();

    if (held) {
      // the can's shadow on the wall: farther from the wall = bigger offset, softer
      const off = dist * 1.9, blur = 1 + dist * 0.45;
      ui.save();
      ui.globalAlpha = clamp(0.34 - dist * 0.005, 0.1, 0.34);
      if (canFilter) ui.filter = `blur(${blur}px)`;
      const saved = { x: held.x, y: held.y };
      held.x += off * 0.8; held.y += off;
      drawCanAtPivot(held, held.spr.shadow);
      held.x = saved.x; held.y = saved.y;
      ui.restore();

      // aim reticle: shows the size of the spray cone at this distance
      const r = 2 * P.sigmaCss(dist, CAPS[capKey]);
      ui.save();
      ui.globalAlpha = spraying ? 0.25 : 0.7;
      ui.setLineDash([3, 4]);
      ui.lineWidth = 2.5; ui.strokeStyle = 'rgba(0,0,0,0.35)';
      ui.beginPath(); ui.arc(mouse.x, mouse.y, r, 0, Math.PI * 2); ui.stroke();
      ui.lineWidth = 1; ui.strokeStyle = 'rgba(255,255,255,0.8)';
      ui.beginPath(); ui.arc(mouse.x, mouse.y, r, 0, Math.PI * 2); ui.stroke();
      ui.setLineDash([]);
      ui.lineWidth = 1.5; ui.strokeStyle = 'rgba(255,255,255,0.9)';
      ui.beginPath();
      ui.moveTo(mouse.x - 5, mouse.y); ui.lineTo(mouse.x + 5, mouse.y);
      ui.moveTo(mouse.x, mouse.y - 5); ui.lineTo(mouse.x, mouse.y + 5);
      ui.stroke();
      ui.restore();

      drawCanAtPivot(held, held.spr.open);

      // short-lived readout next to the cursor, since the menu is hidden now
      if (flash.t > 0) {
        ui.save();
        ui.globalAlpha = Math.min(1, flash.t * 3);
        ui.font = 'bold 12px Verdana, Tahoma, sans-serif';
        const tw = ui.measureText(flash.text).width;
        const fx = mouse.x - tw / 2 - 9, fy = mouse.y - r - 30;
        bubble(fx, fy, tw + 18, 22);
        ui.fillStyle = css('--title', '#13324f');
        ui.textBaseline = 'middle';
        ui.fillText(flash.text, fx + 9, fy + 11.5);
        ui.restore();
      }
    } else if (flash.t > 0) {
      // No can in hand (a friend joined, the wall was cleaned…): at the top of the wall
      ui.save();
      ui.globalAlpha = Math.min(1, flash.t * 3);
      ui.font = 'bold 13px Verdana, Tahoma, sans-serif';
      const tw = ui.measureText(flash.text).width;
      const fx = cssW / 2 - tw / 2 - 12, fy = 18;
      bubble(fx, fy, tw + 24, 28);
      ui.fillStyle = css('--title', '#13324f');
      ui.textBaseline = 'middle';
      ui.fillText(flash.text, fx + 12, fy + 14.5);
      ui.restore();
    }
  }

  function showFlash(text, dur) { flash = { text, t: dur || 1.1 }; }

  // ---------------------------------------------------------------- loop

  let hoverIdx = -1;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateCans(dt, now);
    doSpray(dt);
    P.update(dt);
    P.flush();
    updateMist(dt);
    updateGlints(dt);
    drawAnim(dt);
    updateFriend(dt);
    sendPresence(now);
    if (flash.t > 0) flash.t -= dt;
    drawUI();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- input

  function setDist(v, quiet) {
    const nd = clamp(Math.round(v * 2) / 2, DIST_MIN, DIST_MAX);
    if (nd !== dist && !quiet) showFlash(`${nd} cm van de muur`);
    dist = nd;
    distInput.value = dist;
    distVal.textContent = `${dist} cm`;
    if (spraying) Audio.spray(true, dist, capKey === 'skinny');
  }

  function setCap(k, quiet) {
    capKey = k;
    store.set('cap', k);
    for (const b of document.querySelectorAll('[data-cap]')) b.setAttribute('aria-checked', b.dataset.cap === k);
    if (!quiet) showFlash(CAPS[k].name);
    if (spraying) Audio.spray(true, dist, capKey === 'skinny');
  }

  const DRIP_LABELS = [[0, 'Uit'], [20, 'Droog'], [45, 'Gemiddeld'], [70, 'Lopend'], [90, 'Heel lopend']];
  function setDrip(v, fromNet) {
    drip = clamp(Math.round(v), 0, 100);
    dripInput.value = drip;
    let label = 'Uit';
    for (const [min, name] of DRIP_LABELS) if (drip >= min && drip > 0) label = name;
    dripVal.textContent = label;
    P.setDrip(drip / 100);
    store.set('drip', drip);
    if (!fromNet) Net.send({ t: 'drip', v: drip });
  }

  function setWall(id, fromNet, force) {
    if (!S.WALL_TYPES.some((w) => w.id === id) || (id === wallType && !force)) return;
    wallType = id;
    if (!fromNet) store.set('wall', id);
    for (const b of wallsEl.children) b.setAttribute('aria-checked', b.dataset.wall === id);
    S.generateWall(wallC, reliefC, wallC.width, wallC.height, dpr, floorY, seed, wallType);
    const name = S.WALL_TYPES.find((w) => w.id === id).name;
    if (held) showFlash(name);
    if (!fromNet) Net.send({ t: 'wall', id });
  }

  function toggleSettings(open) {
    const show = open === undefined ? settings.hidden : open;
    settings.hidden = !show;
    menuBtn.setAttribute('aria-expanded', show);
  }

  function setMouse(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    hoverIdx = canAt(mouse.x, mouse.y);
    stage.classList.toggle('over-can', hoverIdx >= 0 && !held);
  }

  stage.addEventListener('pointerdown', (e) => {
    Audio.init();
    setMouse(e);
    toggleSettings(false);
    if (e.button === 2) { putBack(); return; }
    if (e.button !== 0) return;
    const sw = rgbSwatch();
    if (sw && Math.hypot(mouse.x - sw.x, mouse.y - sw.y) < sw.r + 4) { openPicker(sw.x, sw.y); return; }
    const k = canAt(mouse.x, mouse.y);
    if (k >= 0) {
      if (cans[k] === held) putBack();
      else if (cans[k].state !== 'returning') pick(k);
      return;
    }
    if (held) {
      mouse.down = true;
      try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      startSpray();
    }
  });

  stage.addEventListener('pointermove', (e) => {
    // keep the precise pointer path between frames so fast strokes stay smooth
    if (spraying) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ce of evs.length ? evs : [e]) path.push({ x: ce.clientX * dpr, y: ce.clientY * dpr });
    }
    setMouse(e);
  });

  const release = () => { mouse.down = false; stopSpray(); };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', release);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('wheel', (e) => {
    if (e.target.closest && e.target.closest('#settings')) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
    setDist(dist + clamp(dy, -200, 200) * 0.015);
  }, { passive: false });

  distInput.addEventListener('input', () => setDist(parseFloat(distInput.value)));
  dripInput.addEventListener('input', () => setDrip(parseFloat(dripInput.value)));
  for (const b of document.querySelectorAll('[data-cap]')) b.addEventListener('click', () => setCap(b.dataset.cap, true));
  menuBtn.addEventListener('click', () => toggleSettings());
  cycleBtn.addEventListener('click', () => { Audio.init(); cycleSets(); });

  for (const w of S.WALL_TYPES) {
    const b = document.createElement('button');
    b.dataset.wall = w.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', w.id === wallType);
    b.title = w.name;
    const label = document.createElement('span');
    label.textContent = w.name;
    b.append(S.wallThumb(w.id, 160, 108, seed), label);
    b.addEventListener('click', () => setWall(w.id));
    wallsEl.append(b);
  }

  function clearWall() {
    const msg = Net.connected ? 'De muur voor jullie allebei schoonmaken?' : 'De muur schoonmaken? Je kunstwerk is dan weg.';
    if (window.confirm(msg)) { P.clear(); Net.send({ t: 'clear' }); }
  }
  $('#clearBtn').addEventListener('click', clearWall);

  function save() {
    const c = document.createElement('canvas');
    c.width = wallC.width; c.height = wallC.height;
    const g = c.getContext('2d');
    g.drawImage(wallC, 0, 0);
    g.drawImage(paintC, 0, 0);
    g.drawImage(animC, 0, 0);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.85;
    g.drawImage(reliefC, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(uiC, 0, 0);
    Net.event('photo');
    // Logged in: straight into your Foto's on Kuddes (the page uploads it); otherwise a download
    if (S.canSavePhoto) {
      showFlash('Foto opslaan…', 1.2);
      c.toBlob((b) => { if (b) Net.photo(b); }, 'image/webp', 0.92);
      return;
    }
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `kuddes-graffiti-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }
  $('#saveBtn').addEventListener('click', save);

  const muteBtn = $('#muteBtn');
  function toggleMute() {
    Audio.setMuted(!Audio.muted);
    muteBtn.textContent = Audio.muted ? 'Geluid uit' : 'Geluid aan';
  }
  muteBtn.addEventListener('click', toggleMute);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.key !== 'Escape') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') putBack();
    else if (key === 'f') setCap(capKey === 'fat' ? 'skinny' : 'fat');
    else if (key === 's') save();
    else if (key === 'm') toggleMute();
    else if (key === 'c') cycleSets();
    else if (key === 'p' && (held === rgbCan || rgbSwatch())) {
      e.preventDefault();
      const sw = rgbSwatch();
      openPicker(sw ? sw.x : mouse.x, sw ? sw.y : mouse.y);
    }
    else if (key === 'w') {
      const i = S.WALL_TYPES.findIndex((w) => w.id === wallType);
      setWall(S.WALL_TYPES[(i + 1) % S.WALL_TYPES.length].id);
    }
    else if (key === 'delete' || key === 'backspace') clearWall();
    else if (key === '[' || key === '-') setDist(dist - 1);
    else if (key === ']' || key === '=' || key === '+') setDist(dist + 1);
    else if (key >= '0' && key <= '9') {
      const k = key === '0' ? 9 : +key - 1;
      if (cans[k] && cans[k] !== held) pick(k);
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 200);
  });

  // ---------------------------------------------------------------- playing together

  // Everyone else on the wall, by who their messages are from (−1 over a direct line)
  const friends = new Map();
  // With more than one friend, whoever joins waits for the wall from someone already there
  let awaitingWall = false;
  const nameOf = (id) => S.peerNames[id] || S.friendName || 'Vriend';
  const anySpraying = () => [...friends.values()].some((f) => f.sp);
  // How many friends the wall shows (for checking that everyone sees everyone)
  S.friendCount = () => friends.size;
  const canBy = (set, i) => (Object.prototype.hasOwnProperty.call(sets, set) ? sets[set][i | 0] || null : null);
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const validRgb = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isFinite(+v));

  function applyStroke(m) {
    const c = canBy(m.set, m.i);
    if (!c || !Array.isArray(m.segs)) return;
    const d = clamp(num(m.d, 12), DIST_MIN, DIST_MAX), cap = m.cap === 'skinny' ? CAPS.skinny : CAPS.fat;
    const paint = Object.assign({}, c.spr.paint, { time: num(m.time, 0) });
    if (c === rgbCan && validRgb(m.rgb)) paint.rgb = m.rgb.map((v) => clamp(v | 0, 0, 255));
    for (const sg of m.segs.slice(0, 400)) {
      if (!Array.isArray(sg) || sg.length < 7) continue;
      const v = sg.slice(0, 5).map(Number);
      if (!v.every(Number.isFinite)) continue;
      P.spray(v[0] * dpr, (floorY - v[1]) * dpr, v[2] * dpr, (floorY - v[3]) * dpr,
        paint, d, clamp(v[4], 0, 0.05), cap, !!sg[6], num(sg[5], 0) >>> 0);
    }
  }

  async function sendSnapshot(to) {
    const png = (cnv) => new Promise((r) => cnv.toBlob((b) => r(b ? b.arrayBuffer() : null)));
    const masks = [];
    for (const m of P.animLayers()) masks.push({ name: m.name, png: await png(m.cnv) });
    Net.send({ t: 'snap', dpr, floorY, png: await png(paintC), masks }, to);
  }

  async function importSnapshot(m) {
    const decode = (buf) => createImageBitmap(new Blob([buf], { type: 'image/png' }));
    const scale = dpr / clamp(num(m.dpr, 1), 0.5, 4), dy = (floorY - num(m.floorY, floorY)) * dpr;
    try {
      if (m.png) P.importImage(await decode(m.png), 0, dy, scale);
      for (const mk of Array.isArray(m.masks) ? m.masks : []) {
        if ((mk.name === 'plasma' || mk.name === 'lava') && mk.png) P.importMask(mk.name, await decode(mk.png), 0, dy, scale);
      }
    } catch { /* a broken snapshot just means starting from a clean wall */ }
  }

  Net.onConnect = (role) => {
    friends.clear();
    showFlash(`Samen met ${S.friendName || 'je vriend'}!`, 1.8);
    awaitingWall = role === 'peer';
    if (role === 'host') {
      Net.send({ t: 'hello', seed, wall: wallType, drip });
      sendSnapshot();
    }
  };

  // Someone came in (more friends): they get the wall from us
  Net.onJoin = (id) => {
    Net.send({ t: 'hello', seed, wall: wallType, drip }, id);
    sendSnapshot(id);
    showFlash(`${nameOf(id)} spuit mee!`, 1.8);
  };

  Net.onLeave = (id) => {
    if (!friends.has(id)) return;
    friends.delete(id);
    Audio.remoteSpray(anySpraying());
    showFlash(`${nameOf(id)} is weg`, 2);
  };

  Net.onDisconnect = () => {
    friends.clear();
    Audio.remoteSpray(false);
    showFlash(`${S.friendName || 'Je vriend'} is weg`, 2);
  };

  // A wall to take over: as the guest of one friend, or when you just came in to more
  const takesWall = () => Net.role === 'guest' || (Net.role === 'peer' && awaitingWall);

  Net.onMessage = (m, from) => {
    switch (m.t) {
      case 's': applyStroke(m); break;
      case 'cur': onPresence(m, from); break;
      case 'hello':
        if (!takesWall()) break;
        gotRemoteWall = true;
        seed = num(m.seed, seed) >>> 0;
        setWall(S.WALL_TYPES.some((w) => w.id === m.wall) ? m.wall : wallType, true, true);
        setDrip(clamp(num(m.drip, drip), 0, 100), true);
        P.clear();
        break;
      case 'snap':
        if (!takesWall()) break;
        awaitingWall = false;
        importSnapshot(m);
        break;
      case 'wall': setWall(m.id, true); setNetMsg('Andere muur gekozen'); break;
      case 'drip': setDrip(clamp(num(m.v, drip), 0, 100), true); break;
      case 'clear': P.clear(); setNetMsg('Muur schoongemaakt'); showFlash('Muur schoongemaakt', 1.5); break;
    }
  };

  function onPresence(m, from) {
    const c = m.i >= 0 ? canBy(m.set, m.i) : null;
    const x = clamp(num(m.x, 0), -2000, 10000), y = floorY - clamp(num(m.y, 0), -2000, 10000);
    let friend = friends.get(from);
    if (!friend) {
      friend = { id: from, x, y, vx: 0, vy: 0, ang: 0, av: 0, scale: 1, tx: x, ty: y, c: null, sp: false, spr: null, rgb: '' };
      friends.set(from, friend);
    }
    friend.tx = x; friend.ty = y;
    if (c !== friend.c) {
      friend.c = c;
      friend.x = x + 18; friend.y = y + 24; friend.vx = friend.vy = 0;
    }
    friend.dist = clamp(num(m.d, 12), DIST_MIN, DIST_MAX);
    friend.cap = m.cap === 'skinny' ? 'skinny' : 'fat';
    // their RGB can shows their colour, not ours
    friend.spr = c ? c.spr : null;
    if (c === rgbCan && typeof m.rgb === 'string' && /^#[0-9a-f]{6}$/i.test(m.rgb)) {
      if (friend.rgb !== m.rgb) { friend.rgb = m.rgb; friend.rgbSpr = Can.build({ ...rgbCan.color, hex: m.rgb }, dpr * 1.8); }
      friend.spr = friend.rgbSpr;
    }
    const sp = !!m.sp && !!c;
    const was = anySpraying();
    friend.sp = sp;
    // One hiss for all friends: on while any of them sprays
    if (anySpraying() !== was || sp) Audio.remoteSpray(anySpraying(), friend.dist);
  }

  function updateFriend(dt) {
    for (const friend of friends.values()) {
      if (!friend.c) continue;
      const s = 0.78 + (friend.dist / DIST_MAX) * 0.8;
      friend.scale += (s - friend.scale) * Math.min(1, dt * 8);
      integrate(friend, friend.tx + 18 * friend.scale, friend.ty + 24 * friend.scale, 650, 0.6, -0.28, dt);
      if (friend.sp) spawnMist(friend.tx, friend.ty, friend.spr.mist, friend.dist, friend.cap, dt);
    }
  }

  function drawTag(x, y, text) {
    ui.save();
    ui.font = 'bold 11px Verdana, Tahoma, sans-serif';
    const tw = ui.measureText(text).width;
    bubble(x - tw / 2 - 14, y - 10, tw + 22, 20);
    // the green "online" dot, as next to names on Kuddes
    ui.fillStyle = '#5fc39a';
    ui.beginPath(); ui.arc(x - tw / 2 - 5, y, 3, 0, Math.PI * 2); ui.fill();
    ui.fillStyle = css('--link', '#1d74bd');
    ui.textBaseline = 'middle';
    ui.fillText(text, x - tw / 2 + 2, y + 0.5);
    ui.restore();
  }

  function drawFriend() {
    if (!Net.connected) return;
    for (const friend of friends.values()) drawOneFriend(friend);
  }

  // What a friend said in the chat, above their can for a few seconds
  const said = new Map();
  Net.onPhotoSaved = (ok, text) => showFlash(ok ? 'Opgeslagen in je Foto\'s!' : text || 'Opslaan lukte niet', 2.2);
  Net.onChat = (from, text) => said.set(from, { text: String(text).slice(0, 120), until: performance.now() + 5000 });

  function drawSaid(id, x, y) {
    const s = said.get(id);
    if (!s || performance.now() > s.until) return;
    ui.save();
    ui.font = '12px Verdana, Tahoma, sans-serif';
    const text = s.text.length > 48 ? s.text.slice(0, 47) + '…' : s.text;
    const tw = ui.measureText(text).width;
    ui.globalAlpha = clamp((s.until - performance.now()) / 600, 0, 1);
    bubble(x - tw / 2 - 10, y - 28, tw + 20, 22);
    ui.fillStyle = css('--text', '#222');
    ui.textBaseline = 'middle';
    ui.fillText(text, x - tw / 2, y - 16.5);
    ui.restore();
  }

  function drawOneFriend(friend) {
    const name = nameOf(friend.id);
    if (!friend.c) {
      ui.save();
      ui.fillStyle = 'rgba(246,210,12,0.9)';
      ui.strokeStyle = 'rgba(0,0,0,0.4)';
      ui.beginPath(); ui.arc(friend.tx, friend.ty, 4, 0, Math.PI * 2); ui.fill(); ui.stroke();
      ui.restore();
      drawTag(friend.tx, friend.ty - 18, name);
      drawSaid(friend.id, friend.tx, friend.ty - 30);
      return;
    }
    const off = friend.dist * 1.9;
    ui.save();
    ui.globalAlpha = clamp(0.34 - friend.dist * 0.005, 0.1, 0.34);
    if (canFilter) ui.filter = `blur(${1 + friend.dist * 0.45}px)`;
    const sx = friend.x, sy = friend.y;
    friend.x += off * 0.8; friend.y += off;
    drawCanAtPivot(friend, friend.spr.shadow);
    friend.x = sx; friend.y = sy;
    ui.restore();
    drawCanAtPivot(friend, friend.spr.open);
    const tagY = friend.ty - 2 * P.sigmaCss(friend.dist, CAPS[friend.cap]) - 16;
    drawTag(friend.tx, tagY, name);
    drawSaid(friend.id, friend.tx, tagY - 12);
  }

  let lastPresence = 0, lastPresenceKey = '', lastPresenceSent = 0;
  function sendPresence(now) {
    if (!Net.connected || now - lastPresence < 40) return;
    lastPresence = now;
    const m = {
      t: 'cur', x: mouse.x, y: floorY - mouse.y, set: held ? held.set : '', i: held ? held.i : -1,
      d: dist, cap: capKey, sp: spraying && !!held, rgb: held === rgbCan ? rgbCan.color.hex : undefined,
    };
    const key = `${m.x}|${m.y}|${m.set}|${m.i}|${m.d}|${m.cap}|${m.sp}|${m.rgb}`;
    if (key === lastPresenceKey && now - lastPresenceSent < 1000) return;
    lastPresenceKey = key; lastPresenceSent = now;
    Net.send(m);
  }

  // Playing together is set up by the Kuddes page around the wall (js/net.js)
  function setNetMsg(text) { if (Net.connected) showFlash(text, 1.6); }

  // Your progress follows your Kuddes account: the cans you tried on another computer count too
  Net.onInit = (d) => {
    for (const n of Array.isArray(d.tried) ? d.tried : []) if (TRACKED.includes(n)) used.add(n);
    store.set('used', [...used]);
    if (!unlocked && (d.unlocked === true || used.size >= TRACKED.length)) {
      unlocked = true;
      store.set('unlocked', true);
      updateCycleLabel();
    }
    updateProgress();
  };

  // ---------------------------------------------------------------- keeping the wall
  // Your artwork stays in this browser (IndexedDB): going from spraying together to
  // spraying alone, or opening the page again, keeps the wall as it was.
  const KEEP_DAYS = 14;
  let dirty = false, keeping = false, gotRemoteWall = false;
  function wallDb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('kuddes-spray', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('walls');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function dbDo(mode, fn) {
    const db = await wallDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('walls', mode);
        const req = fn(tx.objectStore('walls'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  // Anything that changes the paint marks the wall for keeping
  for (const k of ['spray', 'clear', 'importImage', 'importMask']) {
    const f = P[k];
    P[k] = function (...a) { dirty = true; return f.apply(this, a); };
  }
  async function keepWall() {
    if (!dirty || keeping || typeof indexedDB === 'undefined') return;
    dirty = false; keeping = true;
    try {
      const png = (cnv) => new Promise((r) => cnv.toBlob((b) => r(b ? b.arrayBuffer() : null)));
      const masks = [];
      for (const m of P.animLayers()) masks.push({ name: m.name, png: await png(m.cnv) });
      const wall = { at: Date.now(), dpr, floorY, seed, wall: wallType, png: await png(paintC), masks };
      await dbDo('readwrite', (st) => st.put(wall, 'wall'));
    } catch { /* not kept this time; the next change tries again */ }
    keeping = false;
  }
  setInterval(keepWall, 2500);
  window.addEventListener('pagehide', () => { void keepWall(); });
  async function restoreWall() {
    if (typeof indexedDB === 'undefined') return;
    try {
      const w = await dbDo('readonly', (st) => st.get('wall'));
      // Not when a friend's wall came in meanwhile (you joined theirs)
      if (!w || Date.now() - w.at > KEEP_DAYS * 86400e3 || gotRemoteWall || (Net.connected && takesWall())) return;
      seed = (+w.seed || seed) >>> 0;
      setWall(S.WALL_TYPES.some((x) => x.id === w.wall) ? w.wall : wallType, true, true);
      await importSnapshot(w);
      dirty = false;
    } catch { /* start with a clean wall */ }
  }

  // ---------------------------------------------------------------- boot

  layout();
  updateProgress();
  updateCycleLabel();
  setDist(dist, true);
  setCap(capKey, true);
  setDrip(drip, true);
  if (/[?&]demo/.test(location.search)) {
    const m = location.search.match(/wall=(\w+)/);
    if (m) setWall(m[1]);
  }
  requestAnimationFrame(frame);
  restoreWall().finally(() => Net.ready());

  // ?demo draws a quick sample piece (also used for screenshot testing)
  if (/[?&]demo/.test(location.search)) {
    const stroke = (k, pts, d, cap) => {
      const c = cans[k], dt = 1 / 60;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 7));
        for (let s = 0; s < steps; s++) {
          const a = s / steps, b = (s + 1) / steps;
          P.spray((x0 + (x1 - x0) * a) * dpr, (y0 + (y1 - y0) * a) * dpr,
            (x0 + (x1 - x0) * b) * dpr, (y0 + (y1 - y0) * b) * dpr, c.spr.paint, d, dt, CAPS[cap], i === 1 && s === 0);
          c.spr.paint.time += dt;
          P.update(dt);
        }
      }
      for (let i = 0; i < 400; i++) P.update(1 / 60);
    };
    const ox = cssW * 0.18, oy = cssH * 0.22;
    const tm = location.search.match(/tosstest=(\d+)/);
    if (tm) {
      cycleSets();
      for (let i = 0; i < +tm[1]; i++) updateCans(1 / 60, i * 16.7);
      return;
    }
    if (/secret/.test(location.search)) {
      unlocked = true;
      cycleSets('secret');
      for (const c of allCans) {
        if (c.set === 'secret') { c.state = 'shelf'; placeOnShelf(c); } else c.state = 'away';
      }
      stroke(0, [[ox - 20, oy], [ox + 150, oy], [ox + 150, oy + 60], [ox - 20, oy + 60]], 12, 'fat');
      stroke(1, [[ox + 200, oy], [ox + 200, oy + 120]], 7, 'fat');
      stroke(2, [[ox + 260, oy], [ox + 420, oy + 30], [ox + 260, oy + 80]], 12, 'fat');
      stroke(3, [[ox + 470, oy], [ox + 630, oy], [ox + 630, oy + 70]], 12, 'fat');
      stroke(4, [[ox - 20, oy + 150], [ox + 160, oy + 150]], 14, 'fat');
      stroke(5, [[ox + 200, oy + 150], [ox + 380, oy + 150]], 14, 'fat');
      stroke(6, [[ox + 420, oy + 150], [ox + 600, oy + 150]], 14, 'fat');
      stroke(7, [[ox - 20, oy + 240], [ox + 160, oy + 240]], 14, 'fat');
      stroke(8, [[ox + 200, oy + 240], [ox + 380, oy + 240]], 14, 'fat');
      stroke(9, [[ox + 420, oy + 240], [ox + 600, oy + 240]], 10, 'fat');
      P.flush();
      if (/menu/.test(location.search)) { updateProgress(); toggleSettings(true); } else { pick(2); placeOnShelf(held); }
      mouse.x = cssW * 0.62; mouse.y = cssH * 0.6;
      return;
    }
    if (/special/.test(location.search)) {
      cycleSets();
      for (const c of allCans) {
        if (c.set === 'special') { c.state = 'shelf'; placeOnShelf(c); } else c.state = 'away';
      }
      stroke(0, [[ox, oy + 160], [ox + 60, oy], [ox + 120, oy + 160]], 10, 'fat');
      stroke(1, [[ox + 170, oy], [ox + 170, oy + 160], [ox + 250, oy + 160]], 10, 'fat');
      stroke(3, [[ox + 300, oy], [ox + 300, oy + 160]], 8, 'fat');
      stroke(4, [[ox + 360, oy + 20], [ox + 520, oy + 20]], 12, 'fat');
      stroke(5, [[ox + 360, oy + 90], [ox + 520, oy + 90]], 10, 'fat');
      stroke(6, [[ox + 360, oy + 160], [ox + 520, oy + 160]], 10, 'fat');
      stroke(7, [[ox + 580, oy], [ox + 740, oy + 60]], 14, 'fat');
      stroke(8, [[ox + 580, oy + 120], [ox + 740, oy + 160]], 14, 'fat');
      stroke(9, [[ox - 10, oy + 230], [ox + 300, oy + 230], [ox + 600, oy + 230]], 8, 'fat');
      stroke(2, [[ox + 800, oy], [ox + 800, oy + 160]], 6, 'skinny');
      P.flush();
      pick(5);
      mouse.x = cssW * 0.62; mouse.y = cssH * 0.6;
      placeOnShelf(held);
      return;
    }
    stroke(4, [[ox, oy + 160], [ox + 60, oy], [ox + 120, oy + 160]], 10, 'fat');
    stroke(2, [[ox + 30, oy + 100], [ox + 95, oy + 100]], 10, 'fat');
    stroke(6, [[ox + 170, oy], [ox + 170, oy + 160], [ox + 250, oy + 160]], 14, 'fat');
    stroke(9, [[ox + 300, oy], [ox + 300, oy + 160]], 3, 'fat');
    stroke(1, [[ox - 10, oy + 200], [ox + 330, oy + 200]], 6, 'skinny');
    stroke(0, [[ox + 380, oy + 40], [ox + 520, oy + 40]], 35, 'fat');
    stroke(7, [[ox + 380, oy + 60], [ox + 520, oy + 60]], 35, 'fat');
    stroke(5, Array.from({ length: 80 }, () => [ox + 600, oy + 90]), 7, 'fat');
    stroke(8, [[ox + 650, oy + 150], ...Array.from({ length: 25 }, () => [ox + 700, oy + 150])], 3, 'skinny');
    P.flush();
    if (/menu/.test(location.search)) toggleSettings(true);
    else pick(3);
    mouse.x = cssW * 0.6; mouse.y = cssH * 0.55;
    placeOnShelf(held);
  }
})();
