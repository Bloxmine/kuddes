// Playing together on Kuddes. The wall runs in an iframe on the Kuddes page
// (/graffiti), which does the connecting: a friend accepts your invite, and
// the page carries the messages over the site's own WebRTC game room (with a
// relay through the server when a direct line can't be made). This file is
// the wall's side of that: the same Net interface the wall always used,
// passing messages to and from the page with postMessage. With more than one
// friend every message comes with `from` (who sent it), and `to` sends one
// to a single friend (the wall for someone who just came in).
(function () {
  'use strict';
  const S = (window.Spray = window.Spray || {});
  const page = window.parent !== window ? window.parent : null;
  const N = (S.Net = {
    state: 'idle', role: null, code: null, connected: false,
    onStatus: null, onConnect: null, onDisconnect: null, onMessage: null, onInit: null,
    onJoin: null, onLeave: null, onChat: null, onPhotoSaved: null,
  });
  // Friends' names, by who their messages are from
  S.peerNames = {};

  const post = (msg) => { if (page) page.postMessage(Object.assign({ spray: 1 }, msg), location.origin); };

  // Snapshots carry PNG bytes; the page's channel carries JSON, so bytes travel as base64
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
  }
  function pack(v) {
    if (v instanceof ArrayBuffer) return { __b64: toB64(new Uint8Array(v)) };
    if (ArrayBuffer.isView(v)) return { __b64: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = pack(v[k]); return o; }
    return v;
  }
  function unpack(v) {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === 'object') {
      if (typeof v.__b64 === 'string') return fromB64(v.__b64);
      const o = {}; for (const k in v) o[k] = unpack(v[k]); return o;
    }
    return v;
  }

  // The site's colours, so the menu and buttons match the theme the member uses
  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return;
    for (const [k, v] of Object.entries(theme)) {
      if (/^--[a-z0-9-]+$/.test(k) && typeof v === 'string' && v.length < 200) document.documentElement.style.setProperty(k, v);
    }
    if (theme.dark === 'true') document.documentElement.classList.add('dark');
  }

  N.send = function (msg, to) { if (N.connected) post(to === undefined ? { type: 'send', m: pack(msg) } : { type: 'send', m: pack(msg), to }); };
  N.leave = function () { post({ type: 'leave' }); };
  /** Something for achievements: a can used, the secret row, a saved photo. */
  N.event = function (name, data) { post({ type: 'event', name, data: data || null }); };
  /** A picture of the wall for your Foto's on Kuddes: the page uploads it and says how it went. */
  N.photo = function (blob) {
    blob.arrayBuffer().then((buf) => post({ type: 'photo', b64: toB64(new Uint8Array(buf)), mime: blob.type || 'image/webp' }));
  };
  /** The wall is set up and listening. */
  N.ready = function () { post({ type: 'ready' }); };

  window.addEventListener('message', (e) => {
    if (e.source !== page || e.origin !== location.origin || !e.data || e.data.spray !== 1) return;
    const d = e.data;
    switch (d.type) {
      case 'init':
        S.friendName = typeof d.friendName === 'string' ? d.friendName.slice(0, 40) : '';
        // Logged in: "Foto bewaren" puts it in your Foto's instead of downloading it
        S.canSavePhoto = d.canSavePhoto === true;
        applyTheme(d.theme);
        if (N.onInit) N.onInit(d);
        break;
      case 'peers':
        if (d.names && typeof d.names === 'object') {
          S.peerNames = {};
          for (const [k, v] of Object.entries(d.names)) if (typeof v === 'string') S.peerNames[k] = v.slice(0, 40);
        }
        break;
      case 'connect':
        if (N.connected) return;
        N.role = d.role === 'host' ? 'host' : d.role === 'peer' ? 'peer' : 'guest';
        N.connected = true;
        N.state = 'connected';
        if (N.onConnect) N.onConnect(N.role);
        break;
      case 'disconnect':
        if (!N.connected) return;
        N.connected = false;
        N.state = 'idle';
        if (N.onDisconnect) N.onDisconnect();
        break;
      case 'msg':
        if (N.connected && N.onMessage && d.m && typeof d.m === 'object') N.onMessage(unpack(d.m), typeof d.from === 'number' ? d.from : -1);
        break;
      case 'join':
        if (N.connected && N.onJoin && typeof d.id === 'number') N.onJoin(d.id);
        break;
      case 'leave':
        if (N.onLeave && typeof d.id === 'number') N.onLeave(d.id);
        break;
      case 'chat':
        if (N.onChat && typeof d.from === 'number' && typeof d.text === 'string') N.onChat(d.from, d.text);
        break;
      case 'photo-saved':
        if (N.onPhotoSaved) N.onPhotoSaved(d.ok === true, typeof d.text === 'string' ? d.text.slice(0, 120) : '');
        break;
    }
  });
})();
