/* Paper Explainer — playable HTML explainer video runtime.
 *   PE.mount(containerEl, story, opts) -> player
 * The picture is a pure function of time t (player.seek(t) renders the exact frame), so the same story
 * plays in a browser, previews headlessly, and exports to MP4 frame by frame.
 */
(function () {
  'use strict';
  const SP = window.PE_STYLES;
  const FORMATS = { '16:9': [1600, 900], '9:16': [900, 1600], '1:1': [1200, 1200], '4:5': [1080, 1350] };
  const NS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------------------ utils
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const EASE = {
    linear: (x) => x,
    in: (x) => x * x * x,
    out: (x) => 1 - Math.pow(1 - x, 3),
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    soft: (x) => 1 - Math.pow(1 - x, 2)
  };
  const f = (n) => (Math.round(n * 10) / 10).toString();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) { if (!/^#/.test(a) || !/^#/.test(b)) return k < 0.5 ? a : b; const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); }
  function deepMerge(a, b) { const o = Array.isArray(a) ? a.slice() : Object.assign({}, a); for (const k in b || {}) { o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a && typeof a[k] === 'object' ? deepMerge(a[k], b[k]) : b[k]; } return o; }
  const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); };

  // ------------------------------------------------------------------ geometry
  function smoothPath(pts, closed) { // Catmull-Rom -> cubic Bezier
    if (pts.length < 2) return '';
    if (pts.length === 2 && !closed) return `M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`;
    const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
    let d = `M${f(P[1][0])},${f(P[1][1])}`;
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  function sampleSmooth(pts, per = 14) { // dense polyline along the Catmull-Rom curve
    if (pts.length < 3) {
      const out = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < per; k++) out.push([lerp(pts[i][0], pts[i + 1][0], k / per), lerp(pts[i][1], pts[i + 1][1], k / per)]);
      out.push(pts[pts.length - 1]); return out;
    }
    const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function polyLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function cutPoly(p, frac) { // first `frac` of a polyline by length
    if (frac >= 1) return p; const L = polyLen(p) * frac; let acc = 0; const out = [p[0]];
    for (let i = 1; i < p.length; i++) { const s = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (acc + s >= L) { const k = s ? (L - acc) / s : 0; out.push([lerp(p[i - 1][0], p[i][0], k), lerp(p[i - 1][1], p[i][1], k)]); return out; } acc += s; out.push(p[i]); }
    return out;
  }
  function pointAt(p, s) { // point + tangent angle at arc length s
    for (let i = 1; i < p.length; i++) { const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (s <= seg || i === p.length - 1) { const k = seg ? clamp(s / seg) : 0; return { x: lerp(p[i - 1][0], p[i][0], k), y: lerp(p[i - 1][1], p[i][1], k), a: Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]) }; } s -= seg; }
    const n = p.length - 1; return { x: p[n][0], y: p[n][1], a: 0 };
  }
  function offsetPoly(p, d) { // parallel polyline at signed distance d
    return p.map((q, i) => { const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [q[0] - (dy / L) * d, q[1] + (dx / L) * d]; });
  }
  function tornEdge(pts, amp, seed, closed = true, step = 13) { // jittered outline = torn paper
    if (!amp) return pts; const R = rng(seed), out = [], n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(L / step));
      const nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
      for (let k = 0; k < m; k++) { const t = k / m, j = k === 0 ? 0 : (R() - 0.5) * 2 * amp; out.push([lerp(a[0], b[0], t) + nx * j, lerp(a[1], b[1], t) + ny * j]); }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }
  const rectPts = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const polyD = (p) => 'M' + p.map((q) => f(q[0]) + ',' + f(q[1])).join('L') + 'Z';
  const lineD = (p) => 'M' + p.map((q) => f(q[0]) + ',' + f(q[1])).join('L');
  function blobPts(r, seed, n = 9, wob = 0.22) { const R = rng(seed); const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = r * (1 - wob + R() * wob * 2); out.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.82]); } return out; }
  function centroid(p) { let x = 0, y = 0; p.forEach((q) => { x += q[0]; y += q[1]; }); return [x / p.length, y / p.length]; }

  // ------------------------------------------------------------------ compile story -> timeline
  function estimateDur(text, lang, rate) {
    const cjk = /^(zh|ja|ko)/i.test(lang || 'en');
    const n = cjk ? String(text).replace(/\s/g, '').length : String(text).split(/\s+/).filter(Boolean).length;
    const perSec = (cjk ? 4.2 : 2.55) * (rate || 1);
    const punct = (String(text).match(/[,;:—–]/g) || []).length * 0.18;
    return Math.max(1.2, n / perSec + punct + 0.25);
  }
  function compile(story) {
    const m = Object.assign({ style: 'papercraft', format: '16:9', language: 'en-US', title: 'Untitled', captions: true }, story.meta || {});
    const style = deepMerge(SP.styles[m.style] || SP.styles.papercraft, m.styleOverrides || {});
    style.palette = Object.assign({}, style.palette, m.palette || {});
    m.music = Object.assign({ mood: (style.music || {}).mood || 'calm', volume: 0.2, enabled: true }, m.music || {});
    m.voice = Object.assign({ rate: 1, pitch: 1, prefer: [] }, m.voice || {});
    const [W, H] = FORMATS[m.format] || FORMATS['16:9'];
    const scenes = []; let t = 0;
    (story.scenes || []).forEach((s, i) => {
      const sc = Object.assign({}, s, { index: i, id: s.id || 's' + (i + 1) });
      sc.start = t; let cur = t + (s.lead != null ? s.lead : 0.45);
      sc.cues = (s.cues || []).map((c, k) => {
        const cc = typeof c === 'string' ? { say: c } : Object.assign({}, c);
        cc.index = k; cc.scene = i;
        const dur = cc.audioDur || cc.dur || estimateDur(cc.say || cc.caption || '', m.language, m.voice.rate);
        cc.t0 = cur; cc.t1 = cur + dur; cur = cc.t1 + (cc.pause != null ? cc.pause : (m.cuePause != null ? m.cuePause : 0.4));
        return cc;
      });
      sc.end = Math.max(cur + (s.tail != null ? s.tail : 0.35), t + (s.duration || 0));
      t = sc.end; scenes.push(sc);
    });
    const total = t;
    const byId = {}; scenes.forEach((s) => (byId[s.id] = s));
    function time(expr, sc, dflt) {
      if (expr == null) return dflt;
      if (typeof expr === 'number') return sc.start + expr;
      const mm = String(expr).trim().match(/^(?:([\w-]+):)?(start|end|c(\d+)(?:\.(start|end))?)\s*([+-]\s*\d*\.?\d+)?$/);
      if (!mm) { console.warn('bad time', expr); return dflt; }
      const S = mm[1] ? byId[mm[1]] : sc; if (!S) { console.warn('unknown scene', mm[1]); return dflt; }
      let base;
      if (mm[2] === 'start') base = S.start; else if (mm[2] === 'end') base = S.end;
      else { const c = S.cues[parseInt(mm[3], 10) - 1]; if (!c) { console.warn('no cue', expr); return dflt; } base = mm[4] === 'end' ? c.t1 : c.t0; }
      return base + (mm[5] ? parseFloat(mm[5].replace(/\s/g, '')) : 0);
    }
    const els = [];
    function addEl(e, sc, parent) {
      const el = Object.assign({}, e); el.sceneIndex = sc.index; el.parent = parent || null;
      el.id = el.id || `e${els.length}`;
      const inn = typeof el.in === 'string' ? { fx: el.in } : Object.assign({}, el.in || {});
      el.inFx = inn.fx || (parent ? 'none' : 'fade'); el.inDur = inn.dur != null ? inn.dur : 0.6; el.inEase = inn.ease;
      el.t0 = parent && el.at == null && inn.at == null ? parent.t0 : time(inn.at != null ? inn.at : el.at, sc, sc.start + 0.25);
      const out = typeof el.out === 'string' ? { fx: el.out } : Object.assign({}, el.out || {});
      el.outFx = out.fx || 'fade'; el.outDur = out.dur != null ? out.dur : 0.35;
      let endT = sc.end;
      if (el.until === 'end') endT = total + 1; else if (el.until) { const U = byId[el.until]; endT = U ? U.end : sc.end; }
      if (parent) endT = parent.t1;
      el.t1 = out.at != null ? time(out.at, sc, endT) : endT;
      el.keysR = (el.keys || []).map((k) => Object.assign({}, k, { tk: time(k.at, sc, el.t0), dur: k.dur != null ? k.dur : 1 })).sort((a, b) => a.tk - b.tk);
      el.children = (e.children || []).map((c) => addEl(c, sc, el));
      if (!parent) els.push(el);
      return el;
    }
    scenes.forEach((sc) => (story.scenes[sc.index].elements || []).forEach((e) => addEl(e, sc, null)));
    // camera keys
    const cams = [];
    scenes.forEach((sc) => {
      const c = sc.camera; if (!c) return;
      (Array.isArray(c) ? c : [c]).forEach((k) => cams.push({ t: time(k.at != null ? k.at : 0, sc, sc.start), x: k.x, y: k.y, zoom: k.zoom, dur: k.dur != null ? k.dur : 1.4, ease: k.ease || 'inOut' }));
    });
    const cues = []; scenes.forEach((s) => s.cues.forEach((c) => cues.push(c)));
    return { meta: m, style, W, H, scenes, els, total, cams, cues, time, byId };
  }

  // ------------------------------------------------------------------ element state at time t
  function propsAt(el, t) {
    const st = {};
    for (const k in el) if (!['keys', 'keysR', 'children', 'parent', 'in', 'out'].includes(k)) st[k] = el[k];
    st.x = el.x || 0; st.y = el.y || 0; st.rotate = el.rotate || 0; st.scale = el.scale != null ? el.scale : 1; st.opacity = el.opacity != null ? el.opacity : 1;
    for (const k of el.keysR) {
      if (t < k.tk) break;
      const p = (EASE[k.ease] || EASE.inOut)(clamp((t - k.tk) / (k.dur || 1e-6)));
      for (const key in k) {
        if (['at', 'tk', 'dur', 'ease'].includes(key)) continue;
        const a = st[key], b = k[key];
        if (typeof b === 'number' && typeof a === 'number') st[key] = lerp(a, b, p);
        else if (Array.isArray(b) && Array.isArray(a) && Array.isArray(b[0]) && a.length === b.length) st[key] = a.map((q, i) => [lerp(q[0], b[i][0], p), lerp(q[1], b[i][1], p)]);
        else if (Array.isArray(b) && Array.isArray(a) && typeof b[0] === 'number') st[key] = a.map((q, i) => lerp(q, b[i], p));
        else if (typeof b === 'string' && typeof a === 'string' && /^#/.test(a) && /^#/.test(b)) st[key] = mix(a, b, p);
        else st[key] = p >= 0.5 ? b : (a != null ? a : b);
      }
    }
    return st;
  }

  // ------------------------------------------------------------------ the player
  function mount(root, story, opts = {}) {
    const C = compile(story);
    const { meta, style, W, H } = C;
    const P = style.palette, F = style.fonts;
    const col = (c, d) => (c == null ? (P[d] || d) : (P[c] || c));
    const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const prefs = loadPrefs();
    const S = { t: 0, playing: false, rate: prefs.rate || 1, captions: prefs.captions != null ? prefs.captions : meta.captions !== false, capSize: prefs.capSize || 'M',
      reduce: prefs.reduce != null ? prefs.reduce : reduceMQ.matches, ended: false, started: false };

    // ---- DOM
    root.classList.add('pe-player'); root.tabIndex = 0; root.setAttribute('role', 'region');
    root.setAttribute('aria-label', `${meta.title} — animated explainer video. Press space to play, ? for shortcuts.`);
    root.style.setProperty('--pe-aspect', `${W}/${H}`);
    root.innerHTML = `
      <div class="pe-viewport"><div class="pe-stage" style="width:${W}px;height:${H}px">
        <svg class="pe-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
        <div class="pe-grain"></div><div class="pe-titles"></div><div class="pe-timeline-host"></div>
        <div class="pe-caption" aria-hidden="true"></div>
      </div></div>
      <div class="pe-sr" aria-live="polite" data-live></div>
      <div class="pe-overlay" data-poster><div class="o-title"></div><button class="pe-big" data-bigplay aria-label="Play video"><svg viewBox="0 0 24 24"><path d="M7 4.5l12 7.5-12 7.5z"/></svg></button><div class="o-meta"></div></div>
      <div class="pe-overlay" data-end hidden><div class="o-title"></div><div class="o-row"><button class="o-btn" data-replay2>↺ Replay</button><button class="o-btn" data-trans2>Transcript</button><button class="o-btn" data-vtt>Download captions (.vtt)</button></div></div>
      <div class="pe-transcript" role="dialog" aria-label="Transcript"></div>
      <div class="pe-help" role="dialog" aria-label="Keyboard shortcuts"></div>
      <div class="pe-toast" role="status"></div>
      <div class="pe-menu" role="dialog" aria-label="Settings"></div>
      <div class="pe-ui">
        <div class="pe-scrub"><div class="bar"><i></i></div><input type="range" min="0" max="1000" step="1" value="0" aria-label="Seek"><div class="tip"></div></div>
        <div class="pe-row">
          <button class="pe-btn" data-play aria-label="Play"></button>
          <button class="pe-btn" data-replay aria-label="Replay from start"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg></button>
          <button class="pe-btn pe-hide-sm" data-back aria-label="Back 5 seconds"><svg viewBox="0 0 24 24"><path d="M11 7l-5 5 5 5M18 7l-5 5 5 5"/></svg></button>
          <button class="pe-btn pe-hide-sm" data-fwd aria-label="Forward 5 seconds"><svg viewBox="0 0 24 24"><path d="M6 7l5 5-5 5M13 7l5 5-5 5"/></svg></button>
          <span class="pe-time" aria-live="off">0:00 / 0:00</span>
          <span class="pe-spacer"></span>
          <button class="pe-btn" data-voice aria-label="Narration" aria-pressed="true"><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg></button>
          <button class="pe-btn" data-music aria-label="Background music" aria-pressed="true"><svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13M9 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0zM20 16a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0z"/></svg></button>
          <input class="pe-vol" type="range" min="0" max="100" value="${Math.round((prefs.volume != null ? prefs.volume : 1) * 100)}" aria-label="Volume">
          <button class="pe-btn text" data-cc aria-label="Subtitles" aria-pressed="true">CC</button>
          <button class="pe-btn text pe-hide-sm" data-rate aria-label="Playback speed">1×</button>
          <button class="pe-btn" data-tr aria-label="Transcript"><svg viewBox="0 0 24 24"><path d="M5 5h14M5 10h14M5 15h9M5 20h6"/></svg></button>
          <button class="pe-btn" data-set aria-label="Settings" aria-haspopup="dialog"><svg viewBox="0 0 24 24"><path d="M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></button>
          <button class="pe-btn" data-fs aria-label="Full screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const stage = $('.pe-stage'), svg = $('svg.pe-svg'), titlesHost = $('.pe-titles'), capEl = $('.pe-caption'), live = $('[data-live]');
    for (const [k, v] of Object.entries(P)) stage.style.setProperty('--' + k, v);
    stage.style.setProperty('--f-title', F.title); stage.style.setProperty('--f-body', F.body); stage.style.setProperty('--f-mono', F.mono);
    root.style.setProperty('--f-title', F.title);

    // grain texture (seeded noise canvas)
    const grainURL = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 180; const g = c.getContext('2d'); const id = g.createImageData(180, 180); const R = rng(7); for (let i = 0; i < id.data.length; i += 4) { const v = R(); const d = v < 0.5 ? 0 : 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = d; id.data[i + 3] = Math.floor(R() * 26); } g.putImageData(id, 0, 0); return c.toDataURL(); } catch (e) { return ''; } })();
    $('.pe-grain').style.background = grainURL ? `url(${grainURL})` : 'none';
    $('.pe-grain').style.opacity = style.grain != null ? style.grain : 0.4;

    // ---- SVG skeleton
    const shadowMode = style.shadow;
    svg.innerHTML = `<defs>
      <pattern id="pe-ht" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3.5" cy="3.5" r="1.7" fill="${P.ink}"/></pattern>
      <pattern id="pe-ht2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="2.5" cy="2.5" r="1.25" fill="${P.ink}"/></pattern>
      <pattern id="pe-grainp" width="180" height="180" patternUnits="userSpaceOnUse"><image href="${grainURL}" width="180" height="180"/></pattern>
      <filter id="pe-sticker" x="-20%" y="-20%" width="140%" height="140%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="7" result="d"/>
        <feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="outline"/>
        <feOffset in="d" dx="9" dy="10" result="sh"/><feFlood flood-color="${P.shadow || '#000'}" flood-opacity=".9"/><feComposite in2="sh" operator="in" result="shadow"/>
        <feMerge><feMergeNode in="shadow"/><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="pe-gray"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.25" intercept="-.1"/><feFuncG type="linear" slope="1.25" intercept="-.1"/><feFuncB type="linear" slope="1.25" intercept="-.1"/></feComponentTransfer></filter>
    </defs>
    <rect class="pe-bg" x="0" y="0" width="${W}" height="${H}" fill="${P.bg}"/>
    <g class="pe-screen-under"></g><g class="pe-world"><g class="pe-decor"></g><g class="pe-els"></g></g><g class="pe-trans"></g>`;
    const bgRect = svg.querySelector('.pe-bg'), world = svg.querySelector('.pe-world'), decor = svg.querySelector('.pe-decor'), elsG = svg.querySelector('.pe-els'), transG = svg.querySelector('.pe-trans'), under = svg.querySelector('.pe-screen-under');

    // ---- paper helpers (markup strings)
    function paper(shape, fill, o = {}) { // shape(fillColor) -> markup ; adds shadow + grain + halftone + stroke
      const sh = o.shadow != null ? o.shadow : (shadowMode === 'hard' ? 1 : 1);
      let s = '';
      if (sh && o.noShadow !== true) {
        if (shadowMode === 'hard') s += `<g transform="translate(${f(8 * sh)},${f(9 * sh)})">${shape(P.shadow || P.ink)}</g>`;
        else s += `<g transform="translate(0,${f(3 * sh)})" opacity=".2">${shape(P.shadow)}</g><g transform="translate(${f(1.5 * sh)},${f(8 * sh)})" opacity=".1">${shape(P.shadow)}</g><g transform="translate(${f(2 * sh)},${f(14 * sh)})" opacity=".05">${shape(P.shadow)}</g>`;
      }
      s += shape(fill, o.stroke ? `stroke="${col(o.stroke)}" stroke-width="${o.strokeWidth || 3}" stroke-linejoin="round"` : '');
      if (o.grain !== false) s += `<g opacity="${o.grainOpacity != null ? o.grainOpacity : 0.55}">${shape('url(#pe-grainp)')}</g>`;
      if (o.halftone) s += `<g opacity="${typeof o.halftone === 'number' ? o.halftone : 0.35}">${shape(o.halftoneFine ? 'url(#pe-ht2)' : 'url(#pe-ht)')}</g>`;
      return s;
    }
    const pathShape = (d) => (fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
    function textSvg(txt, o) {
      const size = o.size || 28, fam = F[o.font || 'body'] || o.font || F.body;
      const lines = wrap(String(txt), size, o.maxWidth, fam, o.weight);
      const lh = size * (o.lineHeight || 1.18); const y0 = -(lines.length - 1) * lh / 2;
      const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
      return lines.map((ln, i) => `<text x="0" y="${f(y0 + i * lh)}" font-family='${fam}' font-size="${size}" font-weight="${o.weight || 700}" ${o.italic ? 'font-style="italic"' : ''} fill="${col(o.color, 'ink')}" text-anchor="${anchor}" dominant-baseline="central" ${o.spacing ? `letter-spacing="${o.spacing}"` : ''}>${esc(o.upper ? ln.toUpperCase() : ln)}</text>`).join('');
    }
    const measureCtx = document.createElement('canvas').getContext('2d');
    function textW(s, size, fam, weight) { measureCtx.font = `${weight || 700} ${size}px ${fam}`; return measureCtx.measureText(s).width; }
    function wrap(s, size, maxW, fam, weight) {
      const out = []; s.split('\n').forEach((para) => {
        if (!maxW) { out.push(para); return; }
        const words = para.split(' '); let cur = '';
        words.forEach((w) => { const tryS = cur ? cur + ' ' + w : w; if (textW(tryS, size, fam, weight) > maxW && cur) { out.push(cur); cur = w; } else cur = tryS; });
        out.push(cur);
      });
      return out;
    }
    function iconSvg(name, size, color, sw) {
      const d = SP.icons[name] || SP.icons.star; const k = size / 24;
      return `<g transform="translate(${f(-size / 2)},${f(-size / 2)}) scale(${k})"><path d="${d}" fill="none" stroke="${color}" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }

    // ---- per-type renderers: return inner markup in local coords ----
    const R = {};
    R.rect = (st, el, fx) => { const w = st.w || 200, h = st.h || 120; let pts = rectPts(w, h); if (st.torn) pts = tornEdge(pts, st.torn === true ? style.torn : st.torn, hashStr(el.id)); const d = st.rx && !st.torn ? `M${f(-w / 2 + st.rx)},${f(-h / 2)}h${f(w - 2 * st.rx)}a${st.rx},${st.rx} 0 0 1 ${st.rx},${st.rx}v${f(h - 2 * st.rx)}a${st.rx},${st.rx} 0 0 1 -${st.rx},${st.rx}h${f(-(w - 2 * st.rx))}a${st.rx},${st.rx} 0 0 1 -${st.rx},-${st.rx}v${f(-(h - 2 * st.rx))}a${st.rx},${st.rx} 0 0 1 ${st.rx},-${st.rx}z` : polyD(pts); return paper(pathShape(d), col(st.fill, 'paper'), { shadow: st.shadow, halftone: st.halftone, stroke: st.stroke, strokeWidth: st.strokeWidth, grain: st.grain }); };
    R.circle = (st) => { const r = st.r || 60; const sh = (fill, e = '') => `<circle r="${f(r)}" fill="${fill}" ${e}/>`; return paper(sh, col(st.fill, 'accent'), { shadow: st.shadow, halftone: st.halftone, stroke: st.stroke, strokeWidth: st.strokeWidth, grain: st.grain }); };
    R.blob = (st, el) => { const pts = blobPts(st.r || 80, st.seed || hashStr(el.id), st.n || 9, st.wobble != null ? st.wobble : 0.22); return paper(pathShape(smoothPath(pts, true)), col(st.fill, 'paper'), { shadow: st.shadow != null ? st.shadow : 0.6, grain: st.grain, halftone: st.halftone }); };
    R.poly = (st, el, fx) => {
      let pts = st.points || []; if (st.torn) pts = tornEdge(pts, st.torn === true ? style.torn : st.torn, hashStr(el.id));
      const d = st.smooth ? smoothPath(pts, true) : polyD(pts);
      let s = '';
      const fillK = fx.draw < 1 ? clamp((fx.draw - 0.6) / 0.4) : 1;
      if (fillK > 0) s += `<g opacity="${f(fillK)}">${paper(pathShape(d), col(st.fill, 'paper'), { shadow: st.shadow, halftone: st.halftone, grain: st.grain })}</g>`;
      if (st.stroke || fx.draw < 1) s += `<path d="${d}" fill="none" stroke="${col(st.stroke, 'ink')}" stroke-width="${st.strokeWidth || 3}" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f3(1 - fx.draw)}" ${st.stroke ? '' : `opacity="${f(1 - fillK)}"`}/>`;
      return s;
    };
    R.path = (st) => (st.fill && st.fill !== 'none' ? paper(pathShape(st.d), col(st.fill), { shadow: st.shadow, grain: st.grain, halftone: st.halftone }) : '') + (st.stroke ? `<path d="${st.d}" fill="none" stroke="${col(st.stroke)}" stroke-width="${st.strokeWidth || 3}" stroke-linecap="round" stroke-linejoin="round" ${st.dashed ? `stroke-dasharray="${st.dashed === true ? '10 9' : st.dashed}"` : ''}/>` : '');
    const f3 = (n) => (Math.round(n * 1000) / 1000).toString();
    function curvePts(st) { return st.smooth === false ? st.points : sampleSmooth(st.points, 16); }
    function headSvg(p, a, kind, color, w) {
      if (kind === 'chevrons') { let s = ''; for (let k = 0; k < 2; k++) { const bx = p.x - Math.cos(a) * (k * 12), by = p.y - Math.sin(a) * (k * 12); const l = 12; s += `<path d="M${f(bx - Math.cos(a - 0.6) * l)},${f(by - Math.sin(a - 0.6) * l)}L${f(bx)},${f(by)}L${f(bx - Math.cos(a + 0.6) * l)},${f(by - Math.sin(a + 0.6) * l)}" fill="none" stroke="${color}" stroke-width="${Math.max(2.5, w * 0.6)}" stroke-linecap="round" stroke-linejoin="round"/>`; } return s; }
      const L = Math.max(16, w * 3.4), Wd = Math.max(10, w * 2.4);
      return `<path d="M${f(p.x + Math.cos(a) * 3)},${f(p.y + Math.sin(a) * 3)}L${f(p.x - Math.cos(a) * L + Math.cos(a + Math.PI / 2) * Wd / 2)},${f(p.y - Math.sin(a) * L + Math.sin(a + Math.PI / 2) * Wd / 2)}L${f(p.x - Math.cos(a) * L - Math.cos(a + Math.PI / 2) * Wd / 2)},${f(p.y - Math.sin(a) * L - Math.sin(a + Math.PI / 2) * Wd / 2)}Z" fill="${color}"/>`;
    }
    R.curve = (st, el, fx) => {
      let pts = st.points || []; if (st.from && st.to) { const bend = st.bend || 0; const mx = (st.from[0] + st.to[0]) / 2, my = (st.from[1] + st.to[1]) / 2, dx = st.to[0] - st.from[0], dy = st.to[1] - st.from[1], L = Math.hypot(dx, dy) || 1; pts = bend ? [st.from, [mx - dy / L * bend, my + dx / L * bend], st.to] : [st.from, st.to]; }
      const dense = pts.length > 2 && st.smooth !== false ? sampleSmooth(pts, 16) : pts;
      const prog = Math.min(fx.draw, fx.grow);
      const part = cutPoly(dense, prog); if (part.length < 2) return '';
      const c = col(st.color || st.stroke, 'ink'), w = st.width || 4;
      let s = '';
      if (st.casing) s += `<path d="${lineD(part)}" fill="none" stroke="${col(st.casing)}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<path d="${lineD(part)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="${st.dashed ? 'butt' : 'round'}" stroke-linejoin="round" ${st.dashed ? `stroke-dasharray="${st.dashed === true ? '9 9' : st.dashed}"` : ''}/>`;
      const head = st.head || (el.type === 'arrow' ? 'end' : 'none');
      if (head !== 'none' && prog > 0.96) {
        const L = polyLen(part), e = pointAt(part, L), b = pointAt(part, 0.001);
        if (head === 'end' || head === 'both' || head === 'chevrons') s += headSvg(e, e.a, head === 'chevrons' ? 'chevrons' : 'tri', c, w);
        if (head === 'both') s += headSvg({ x: part[0][0], y: part[0][1] }, b.a + Math.PI, 'tri', c, w);
      }
      if (st.dot) s += `<circle cx="${f(part[0][0])}" cy="${f(part[0][1])}" r="${w * 1.4}" fill="${c}"/>`;
      return s;
    };
    R.arrow = R.curve; R.line = R.curve;
    R.band = (st, el, fx) => { // ribbon along a centreline: river, road, pipe, strip of land
      const dense = sampleSmooth(st.points, 18);
      const part = cutPoly(dense, fx.grow); if (part.length < 2) return '';
      const w = st.width || 80, ew = st.edgeWidth != null ? st.edgeWidth : 10;
      const ribbon = (ww) => { const a = offsetPoly(part, ww / 2), b = offsetPoly(part, -ww / 2).reverse(); return polyD(a.concat(b)); };
      let s = '';
      if (st.shadow !== 0) s += `<path d="${ribbon(w + ew * 2)}" transform="translate(0,6)" fill="${P.shadow}" opacity=".16"/>`;
      if (ew) s += `<path d="${ribbon(w + ew * 2)}" fill="${col(st.edge, 'accent3')}"/>`;
      s += `<path d="${ribbon(w)}" fill="${col(st.fill, 'accent2')}"/>`;
      s += `<path d="${ribbon(w)}" fill="url(#pe-grainp)" opacity=".5"/>`;
      if (st.innerEdge !== false) s += `<path d="${lineD(offsetPoly(part, w / 2 - 3))}" fill="none" stroke="${mix(col(st.fill, 'accent2'), '#000000', 0.25)}" stroke-width="5" opacity=".55"/>`;
      const lanes = st.lanes || 0;
      for (let i = 1; i <= lanes; i++) { const off = -w / 2 + (w * i) / (lanes + 1); s += `<path d="${lineD(offsetPoly(part, off))}" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="2.5"/>`; }
      if (st.ghost) { const g = sampleSmooth(st.ghost, 18); s += `<path d="${lineD(offsetPoly(g, w / 2 + ew))}" fill="none" stroke="${col('ink')}" stroke-width="2" stroke-dasharray="7 7" opacity=".55"/><path d="${lineD(offsetPoly(g, -w / 2 - ew))}" fill="none" stroke="${col('ink')}" stroke-width="2" stroke-dasharray="7 7" opacity=".55"/>`; }
      return s;
    };
    R.flow = (st, el, fx, t) => { // glyphs streaming along a band / curve / point list
      let pts = st.points;
      if (st.along) { const tgt = C.els.find((e) => e.id === st.along); if (tgt) { const ts = propsAt(tgt, t); pts = ts.points; } }
      if (!pts || pts.length < 2) return '';
      const dense = st.smooth === false ? pts : sampleSmooth(pts, 16), L = polyLen(dense);
      const lanes = st.lanes || [0], spacing = st.spacing || 120, speed = (st.speed || 90) * (S.reduce ? 0.4 : 1), c = col(st.color, '#ffffff'), sz = st.size || 16;
      const shift = ((t - el.t0) * speed) % spacing;
      let s = '';
      lanes.forEach((off, li) => {
        const lp = off ? offsetPoly(dense, off) : dense; const LL = polyLen(lp);
        for (let d0 = (li * spacing * 0.37) % spacing + shift - spacing; d0 < LL; d0 += spacing) {
          if (d0 < 0) continue; const q = pointAt(lp, d0); const edge = clamp(d0 / 40) * clamp((LL - d0) / 40) * fx.grow;
          if (edge <= 0.01 || d0 > LL * fx.grow) continue;
          const deg = q.a * 180 / Math.PI;
          let g;
          if ((st.glyph || 'arrow') === 'arrow') g = `<path d="M${-sz},0H${sz * 0.6}M${sz * 0.1},${-sz * 0.55}L${sz * 0.7},0L${sz * 0.1},${sz * 0.55}" fill="none" stroke="${c}" stroke-width="${Math.max(2.5, sz / 4.2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
          else if (st.glyph === 'dash') g = `<rect x="${-sz}" y="${-sz * 0.22}" width="${sz * 2}" height="${sz * 0.44}" rx="${sz * 0.22}" fill="${c}"/>`;
          else if (st.glyph === 'chevron') g = `<path d="M${-sz * 0.3},${-sz * 0.6}L${sz * 0.4},0L${-sz * 0.3},${sz * 0.6}" fill="none" stroke="${c}" stroke-width="${sz / 4}" stroke-linecap="round" stroke-linejoin="round"/>`;
          else g = `<circle r="${sz / 2}" fill="${c}"/>`;
          s += `<g transform="translate(${f(q.x)},${f(q.y)}) rotate(${f(deg)})" opacity="${f(edge * (st.alpha != null ? st.alpha : 0.95))}">${g}</g>`;
        }
      });
      return s;
    };
    R.angle = (st, el, fx) => { // coloured wedge at a vertex + letter badge
      const [vx, vy] = st.at || [0, 0], r = st.r || 46; const a0 = -(st.from || 0) * Math.PI / 180; let a1 = -(st.to || 60) * Math.PI / 180;
      a1 = a0 + (a1 - a0) * fx.grow;
      const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0, sweep = a1 < a0 ? 0 : 1;
      const d = `M${f(vx)},${f(vy)}L${f(vx + Math.cos(a0) * r)},${f(vy + Math.sin(a0) * r)}A${r},${r} 0 ${large} ${sweep} ${f(vx + Math.cos(a1) * r)},${f(vy + Math.sin(a1) * r)}Z`;
      let s = paper(pathShape(d), col(st.fill, 'red'), { shadow: st.shadow != null ? st.shadow : 0.5, grain: st.grain });
      if (st.arc !== false) { const rr = r * 0.62; s += `<path d="M${f(vx + Math.cos(a0) * rr)},${f(vy + Math.sin(a0) * rr)}A${rr},${rr} 0 ${large} ${sweep} ${f(vx + Math.cos(a1) * rr)},${f(vy + Math.sin(a1) * rr)}" fill="none" stroke="${P.ink}" stroke-width="2" opacity=".75"/>`; }
      if (st.label && fx.grow > 0.6) { const am = (a0 + a1) / 2, lr = st.labelR || r * 0.58; const bx = vx + Math.cos(am) * lr, by = vy + Math.sin(am) * lr; s += `<g opacity="${f(clamp((fx.grow - 0.6) / 0.4))}"><circle cx="${f(bx)}" cy="${f(by)}" r="${st.badge || 16}" fill="#ffffff"/><text x="${f(bx)}" y="${f(by + 1)}" font-family='${F.title}' font-style="italic" font-weight="700" font-size="${(st.badge || 16) * 1.25}" fill="${P.ink}" text-anchor="middle" dominant-baseline="central">${esc(st.label)}</text></g>`; }
      return s;
    };
    R.text = (st) => textSvg(st.text, st);
    R.tag = (st, el) => { // chip / equation card / sticky label
      const size = st.size || 30, fam = F[st.font || 'label'] || F.label, padX = st.padX || size * 0.65, padY = st.padY || size * 0.42;
      const lines = String(st.text).split('\n'); const tw = Math.max(...lines.map((l) => textW(l, size, fam, st.weight || 700))); const w = st.w || tw + padX * 2, h = st.h || lines.length * size * 1.2 + padY * 2;
      let pts = rectPts(w, h); if (st.torn) pts = tornEdge(pts, st.torn === true ? style.torn : st.torn, hashStr(el.id));
      return paper(pathShape(polyD(pts)), col(st.fill, 'accent'), { shadow: st.shadow, grain: st.grain }) + textSvg(st.text, { size, font: st.font || 'label', color: st.color || 'ink', weight: st.weight || 700, upper: st.upper, spacing: st.spacing });
    };
    R.label = (st, el, fx) => { // white card + colour bar + leader line to an anchor point
      const size = st.size || 30, sub = st.sub, fam = F.label;
      const tw = Math.max(textW(st.text, size, fam, 700), sub ? textW(sub, size * 0.66, F.body, 400) : 0);
      const w = st.w || tw + 36, h = sub ? size * 2.35 : size * 1.65;
      let s = '';
      if (st.anchor) {
        const ax = st.anchor[0] - st.x, ay = st.anchor[1] - st.y; const ex = clamp(ax, -w / 2, w / 2), ey = clamp(ay, -h / 2, h / 2);
        const k = fx.draw; s += `<path d="M${f(ax)},${f(ay)}L${f(lerp(ax, ex, k))},${f(lerp(ay, ey, k))}" stroke="${col(st.lineColor, 'ink')}" stroke-width="2"/><circle cx="${f(ax)}" cy="${f(ay)}" r="5" fill="${col(st.lineColor, 'ink')}"/>`;
      }
      const variant = st.variant || style.labelVariant;
      if (variant === 'chip') s += paper(pathShape(polyD(tornEdge(rectPts(w, h), style.torn * 0.6, hashStr(el.id)))), col(st.fill, 'ink'), { shadow: 0.5 });
      else { s += paper(pathShape(polyD(rectPts(w, h))), col(st.fill, 'card'), { shadow: 0.7 }); if (st.bar !== false) s += `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="7" fill="${col(st.bar, 'red')}"/>`; }
      const tc = variant === 'chip' ? col(st.color, 'card') : col(st.color, 'ink');
      if (sub) s += `<text x="${f(-w / 2 + 18)}" y="${f(-h / 2 + 8 + size * 0.85)}" font-family='${fam}' font-weight="700" font-size="${size}" fill="${tc}" dominant-baseline="central">${esc(st.text)}</text><text x="${f(-w / 2 + 18)}" y="${f(-h / 2 + 8 + size * 1.75)}" font-family='${F.body}' font-size="${f(size * 0.66)}" fill="${variant === 'chip' ? tc : P.muted}" dominant-baseline="central">${esc(sub)}</text>`;
      else s += `<text x="0" y="${f(3)}" font-family='${fam}' font-weight="700" font-size="${size}" fill="${tc}" text-anchor="middle" dominant-baseline="central">${esc(st.text)}</text>`;
      return s;
    };
    R.card = (st, el) => { // torn card with number / icon / big title / scribble underline
      const w = st.w || 300, h = st.h || 220; let pts = rectPts(w, h); if (st.torn !== false) pts = tornEdge(pts, st.torn && st.torn !== true ? st.torn : style.torn, hashStr(el.id));
      const fill = col(st.fill, 'card'); const dark = /^#/.test(fill) && hexRgb(fill).reduce((a, b) => a + b) < 300; const tc = col(st.color, dark ? 'card' : 'ink');
      let s = paper(pathShape(polyD(pts)), fill, { shadow: st.shadow, halftone: st.halftone, grain: st.grain });
      if (st.number) s += `<text x="${f(-w / 2 + 26)}" y="${f(-h / 2 + 34)}" font-family='${F.mono}' font-weight="700" font-size="17" fill="${tc}" letter-spacing="2">${esc(st.number)}</text>`;
      if (st.icon) s += `<g transform="translate(${f(w / 2 - 50)},${f(-h / 2 + 52)})">${iconSvg(st.icon, 54, col(st.iconColor, tc), 2.4)}</g>`;
      if (st.title) s += `<g transform="translate(${f(-w / 2 + 28)},${f(h * 0.1)})">${textSvg(st.title, { size: st.size || 38, font: 'title', color: tc, align: 'left', maxWidth: w - 56, weight: 800, upper: st.upper })}</g>`;
      if (st.body) s += `<g transform="translate(${f(-w / 2 + 28)},${f(h * 0.36)})">${textSvg(st.body, { size: 19, font: 'body', color: tc, align: 'left', maxWidth: w - 56, weight: 400 })}</g>`;
      if (st.underline) s += `<path d="M${f(-w / 2 + 28)},${f(h / 2 - 34)}C${f(-w / 6)},${f(h / 2 - 44)} ${f(w / 6)},${f(h / 2 - 28)} ${f(w / 2 - 30)},${f(h / 2 - 40)}" fill="none" stroke="${col(st.underline === true ? (dark ? 'accent' : 'ink') : st.underline)}" stroke-width="5" stroke-linecap="round"/>`;
      return s;
    };
    R.icon = (st) => { // line icon, optional paper badge, optional sticker cut-out look
      const size = st.size || 80, c = col(st.color, 'ink');
      let s = '';
      if (st.badge) s += paper((fill, e = '') => `<circle r="${f(size * 0.72)}" fill="${fill}" ${e}/>`, col(st.badge, 'accent'), { shadow: st.shadow != null ? st.shadow : 0.6 });
      s += iconSvg(st.name, size, c, st.strokeWidth || 2.2);
      return s;
    };
    R.image = (st) => { const w = st.w || 300, h = st.h || 300; return `<image href="${esc(st.src)}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${st.halftone ? 'filter="url(#pe-gray)"' : ''}/>`; };
    R.counter = (st) => { const v = st.value != null ? st.value : 0; const txt = String(st.format || '{v}').replace('{v}', Number(v).toFixed(st.decimals || 0)); return st.fill ? R.tag(Object.assign({}, st, { text: txt }), { id: 'ctr' }) : textSvg(txt, Object.assign({ font: 'mono', size: 40 }, st)); };
    R.chart = (st, el, fx) => { const w = st.w || 320, h = st.h || 200; let s = paper(pathShape(polyD(rectPts(w, h))), col(st.fill, 'card'), { shadow: 0.7 }); if (st.title) s += `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${w}" height="26" fill="${col(st.bar, 'red')}"/><text x="${f(-w / 2 + 12)}" y="${f(-h / 2 + 14)}" font-family='${F.body}' font-weight="700" font-size="13" fill="#ffffff" letter-spacing="1.5" dominant-baseline="central">${esc(String(st.title).toUpperCase())}</text>`;
      const px = -w / 2 + 22, py = -h / 2 + 40, pw = w - 44, ph = h - 64;
      (st.series || []).forEach((se) => { const pts = se.points.map(([u, v]) => [px + u * pw, py + (1 - v) * ph]); const part = cutPoly(st.smooth ? sampleSmooth(pts, 10) : pts, fx.draw); if (part.length > 1) s += `<path d="${lineD(part)}" fill="none" stroke="${col(se.color, 'accent2')}" stroke-width="${se.width || 4}" stroke-linecap="round" stroke-linejoin="round"/>`; });
      if (st.note) s += `<text x="${f(-w / 2 + 14)}" y="${f(h / 2 - 12)}" font-family='${F.body}' font-size="12" fill="${P.muted}">${esc(st.note)}</text>`;
      return s; };
    R.scatter = (st, el) => { // static decoration: trees / blobs / dots over a region
      const [rx, ry, rw, rh] = st.region || [0, 0, W, H]; const Rn = rng(st.seed || hashStr(el.id)); let s = '';
      for (let i = 0; i < (st.count || 12); i++) {
        const x = rx + Rn() * rw, y = ry + Rn() * rh, sz = lerp(st.min || 14, st.max || 26, Rn());
        if ((st.glyph || 'tree') === 'tree') s += `<g transform="translate(${f(x)},${f(y)})"><rect x="-2.5" y="${f(sz * 0.3)}" width="5" height="${f(sz * 0.6)}" fill="${col('trunk', 'ink')}"/><ellipse cx="2" cy="${f(4)}" rx="${f(sz * 0.62)}" ry="${f(sz * 0.6)}" fill="${P.shadow}" opacity=".18"/><circle r="${f(sz * 0.6)}" fill="${col(st.fill, 'tree')}"/><circle cx="${f(-sz * 0.18)}" cy="${f(-sz * 0.2)}" r="${f(sz * 0.25)}" fill="#ffffff" opacity=".14"/></g>`;
        else if (st.glyph === 'blob') s += `<g transform="translate(${f(x)},${f(y)})"><path d="${smoothPath(blobPts(sz, hashStr(el.id) + i, 8, 0.25), true)}" fill="${col(Rn() < 0.5 ? (st.fill || 'land1') : (st.fill2 || 'land2'))}" opacity="${st.alpha || 0.75}"/></g>`;
        else s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(sz / 4)}" fill="${col(st.fill, 'ink')}" opacity="${st.alpha || 0.8}"/>`;
      }
      return s;
    };
    R.seq = (st, el, fx) => { // items revealed one by one along a line: morse code, footsteps, beads, data packets
      const [x0, y0] = st.from || [0, 0], [x1, y1] = st.to || [400, 0]; const pat = String(st.pattern || '........'); const n = pat.length; let s = '';
      for (let i = 0; i < n; i++) { const k = n === 1 ? 0 : i / (n - 1); const vis = clamp((fx.grow * n - i) * 2); if (vis <= 0) continue; const x = lerp(x0, x1, k), y = lerp(y0, y1, k) + (st.wave ? Math.sin(k * Math.PI * (st.wave)) * (st.amp || 14) : 0); const c = col(st.color, 'ink'), sz = st.size || 12;
        s += `<g transform="translate(${f(x)},${f(y)}) scale(${f(EASE.back(vis))})">${pat[i] === '-' ? `<rect x="${-sz * 1.6}" y="${-sz / 2}" width="${sz * 3.2}" height="${sz}" rx="${sz / 2}" fill="${c}"/>` : pat[i] === ' ' ? '' : `<ellipse rx="${sz * 0.7}" ry="${sz * 0.5}" fill="${c}"/>`}</g>`; }
      return s;
    };
    R.waves = (st, el, fx, t) => { // radiating arcs (signal, sound, heat)
      const n = st.count || 3, r0 = st.r || 30, gap = st.gap || 22, a0 = (st.from != null ? st.from : 210) * Math.PI / 180, a1 = (st.to != null ? st.to : 330) * Math.PI / 180; let s = '';
      for (let i = 0; i < n; i++) { const r = r0 + i * gap; const ph = st.pulse === false ? 1 : 0.55 + 0.45 * Math.sin((t * 3.2) - i * 0.9); const vis = clamp(fx.grow * n - i); s += `<path d="M${f(Math.cos(a0) * r)},${f(Math.sin(a0) * r)}A${r},${r} 0 0 1 ${f(Math.cos(a1) * r)},${f(Math.sin(a1) * r)}" fill="none" stroke="${col(i % 2 ? (st.color2 || st.color) : st.color, 'accent2')}" stroke-width="${st.width || 7}" stroke-linecap="round" opacity="${f(vis * ph)}"/>`; }
      return s;
    };
    R.group = () => '';

    // ---- element DOM + per-frame update
    function makeNode(el, parentNode) {
      const g = document.createElementNS(NS, 'g'); el._g = g; el._last = '';
      const inner = document.createElementNS(NS, 'g'); g.appendChild(inner); el._inner = inner;
      if (el.sticker) g.setAttribute('filter', 'url(#pe-sticker)');
      parentNode.appendChild(g);
      el.children.forEach((c) => makeNode(c, g));
      if (el.type === 'group' && el.children.length) { const kids = document.createElementNS(NS, 'g'); g.appendChild(kids); el.children.forEach((c) => kids.appendChild(c._g)); }
    }
    C.els.sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((el) => makeNode(el, elsG));

    function fxAt(el, t) {
      const fx = { o: 1, dx: 0, dy: 0, s: 1, r: 0, draw: 1, grow: 1, sx: 1 };
      let kind = el.inFx; if (S.reduce && !['none', 'draw', 'grow'].includes(kind)) kind = 'fade';
      const pin = clamp((t - el.t0) / (el.inDur || 1e-6)); const e = (EASE[el.inEase] || EASE.out)(pin);
      switch (kind) {
        case 'fade': fx.o = e; break;
        case 'pop': fx.s = lerp(0.55, 1, EASE.back(pin)); fx.o = clamp(pin * 3); break;
        case 'rise': fx.dy = (1 - e) * 46; fx.o = e; break;
        case 'drop': fx.dy = -(1 - EASE.back(pin)) * 140; fx.r = (1 - e) * -7; fx.o = clamp(pin * 4); break;
        case 'slide-left': fx.dx = (1 - e) * -W * 0.55; fx.r = (1 - e) * -4; break;
        case 'slide-right': fx.dx = (1 - e) * W * 0.55; fx.r = (1 - e) * 4; break;
        case 'slide-up': fx.dy = (1 - e) * H * 0.6; break;
        case 'stamp': fx.s = lerp(1.35, 1, EASE.back(pin)); fx.r = (1 - e) * -6; fx.o = clamp(pin * 3); break;
        case 'unfold': fx.sx = Math.max(0.001, e); break;
        case 'draw': fx.draw = EASE.inOut(pin); break;
        case 'grow': fx.grow = EASE.inOut(pin); break;
        case 'none': break;
      }
      if (el.type === 'flow' || el.type === 'waves') { if (kind !== 'grow') fx.grow = clamp(pin * 1.5); }
      if (el.type === 'label' && kind !== 'draw') fx.draw = clamp(pin * 1.4);
      if (t > el.t1) {
        const po = clamp((t - el.t1) / (el.outDur || 1e-6)), eo = EASE.in(po);
        let ok = el.outFx; if (S.reduce && ok !== 'none') ok = 'fade';
        if (ok === 'fade') fx.o *= 1 - eo; else if (ok === 'sink') { fx.o *= 1 - eo; fx.dy += eo * 40; } else if (ok === 'lift') { fx.o *= 1 - eo; fx.dy -= eo * 50; }
        else if (ok === 'pop') { fx.o *= 1 - eo; fx.s *= 1 - eo * 0.4; } else if (ok === 'slide-left') fx.dx -= eo * W * 0.7; else if (ok === 'slide-right') fx.dx += eo * W * 0.7;
        else if (ok === 'none') fx.o *= po >= 1 ? 0 : 1;
      }
      return fx;
    }
    function updateEl(el, t) {
      const visible = t >= el.t0 && t <= el.t1 + el.outDur + 0.02;
      if (!visible) { if (el._vis !== false) { el._g.setAttribute('display', 'none'); el._vis = false; } return; }
      if (el._vis !== true) { el._g.removeAttribute('display'); el._vis = true; }
      const st = propsAt(el, t), fx = fxAt(el, t);
      const geo = ['poly', 'curve', 'arrow', 'line', 'band', 'flow', 'angle', 'path', 'scatter', 'seq'].includes(el.type);
      const ox = geo ? (el.origin ? el.origin[0] : (st.points ? centroid(st.points)[0] : (st.at ? st.at[0] : 0))) : 0;
      const oy = geo ? (el.origin ? el.origin[1] : (st.points ? centroid(st.points)[1] : (st.at ? st.at[1] : 0))) : 0;
      const tx = st.x + fx.dx, ty = st.y + fx.dy, rot = st.rotate + fx.r, sc = st.scale * fx.s;
      el._g.setAttribute('transform', `translate(${f(tx + ox)},${f(ty + oy)}) rotate(${f(rot)}) scale(${f3(sc * fx.sx)},${f3(sc)}) translate(${f(-ox)},${f(-oy)})` + (fx.sx !== 1 ? '' : ''));
      el._g.setAttribute('opacity', f3(clamp(st.opacity * fx.o)));
      const r = R[el.type]; const inner = r ? r(st, el, fx, t) : '';
      if (inner !== el._last) { el._inner.innerHTML = inner; el._last = inner; }
      el.children.forEach((c) => updateEl(c, t));
    }

    // ---- decor (style backgrounds)
    function buildDecor() {
      let s = '', u = '';
      if (style.bgVariant === 'board') {
        const pts = tornEdge([[24, 22], [W - 24, 22], [W - 24, H - 22], [24, H - 22]], 2.5, 11, true, 16);
        s += `<path d="${polyD(pts)}" transform="translate(0,8)" fill="${P.shadow}" opacity=".18"/><path d="${polyD(pts)}" fill="${P.paper}"/><path d="${polyD(pts)}" fill="url(#pe-grainp)" opacity=".7"/>`;
        const Rn = rng(meta.seed || 5);
        for (let i = 0; i < 26; i++) { const x = 60 + Rn() * (W - 120), y = 60 + Rn() * (H - 120), r = 30 + Rn() * 70; s += `<path transform="translate(${f(x)},${f(y)})" d="${smoothPath(blobPts(r, 100 + i, 8, 0.28), true)}" fill="${Rn() < 0.55 ? P.land1 : P.land2}" opacity=".55"/>`; }
      }
      if (style.decor === 'scraps') {
        const scrap = (pts, c, seed) => { const tp = tornEdge(pts, 3, seed, true, 18); return `<path d="${polyD(tp)}" transform="translate(0,4)" fill="${P.shadow}" opacity=".12"/><path d="${polyD(tp)}" fill="${c}"/><path d="${polyD(tp)}" fill="url(#pe-grainp)" opacity=".6"/>`; };
        u += scrap([[-20, H * 0.86], [W * 0.15, H * 0.875], [W * 0.21, H + 20], [-20, H + 20]], P.scrap2 || P.accent3, 3);
        u += scrap([[W * 0.865, -20], [W + 20, -20], [W + 20, H * 0.19], [W * 0.94, H * 0.17]], P.scrap1 || P.accent2, 4);
        u += scrap([[W * 0.93, H * 0.92], [W + 20, H * 0.9], [W + 20, H + 20], [W * 0.95, H + 20]], P.scrap3 || P.accent, 5);
      }
      decor.innerHTML = s; under.innerHTML = u;
    }
    buildDecor();

    // ---- titles (HTML, scaled with the stage)
    const titleNodes = C.scenes.map((sc) => {
      if (!sc.title && !sc.kicker) return null;
      const d = document.createElement('div'); const variant = sc.titleVariant || style.titleVariant;
      d.className = 'pe-title ' + variant; d.style.opacity = 0;
      const pos = sc.titlePos || (style.titlePos) || 'tl';
      const size = sc.titleSize || (variant === 'strip' ? 76 : 58);
      const lines = String(sc.title || '').split('\n');
      let box = `<div class="t-box">${variant === 'strip' ? `<svg preserveAspectRatio="none" viewBox="0 0 100 100"><path d="${stripPath(sc.index)}" fill="${col(sc.titleFill, sceneBg(sc) === col('accent') ? 'card' : 'accent')}" vector-effect="non-scaling-stroke"/><path d="${stripPath(sc.index)}" fill="url(#pe-grainp)" opacity=".5"/></svg>` : ''}
        <div class="t-main" style="font-size:${size}px">${lines.map((l) => `<span class="t-line">${esc(l)}</span>`).join('')}</div>${sc.subtitle ? `<div class="t-sub" style="font-size:${Math.round(size * 0.5)}px">${esc(sc.subtitle)}</div>` : ''}</div>`;
      d.innerHTML = (sc.kicker ? `<div class="t-kicker ${style.kickerVariant}">${esc(sc.kicker)}</div><br>` : '') + (sc.title ? box : '');
      const pad = Math.round(Math.min(W, H) * 0.06);
      if (pos === 'tl') { d.style.left = pad * 1.1 + 'px'; d.style.top = pad * 0.9 + 'px'; }
      else if (pos === 'top') { d.style.left = '50%'; d.style.top = pad * 1.2 + 'px'; d.style.transform = 'translateX(-50%)'; d.style.textAlign = 'center'; }
      else if (pos === 'center') { d.style.left = '50%'; d.style.top = '42%'; d.style.transform = 'translate(-50%,-50%)'; d.style.textAlign = 'center'; }
      else if (pos === 'bl') { d.style.left = pad * 1.1 + 'px'; d.style.bottom = pad * 2.2 + 'px'; }
      titlesHost.appendChild(d); return d;
    });
    function stripPath(seed) { const pts = tornEdge([[0, 0], [100, 0], [100, 100], [0, 100]], 2.2, 300 + seed, true, 6); return polyD(pts.map((p) => [clamp(p[0], -3, 103), clamp(p[1], -6, 106)])); }
    function updateTitles(t) {
      C.scenes.forEach((sc, i) => {
        const d = titleNodes[i]; if (!d) return;
        const prev = C.scenes[i - 1], next = C.scenes[i + 1];
        const same = (a, b) => a && b && a.title === b.title && a.kicker === b.kicker && (a.subtitle || '') === (b.subtitle || '');
        const tIn = sc.start + (sc.titleAt != null ? sc.titleAt : 0.15);
        const carriedIn = same(prev, sc) && titleNodes[i - 1];
        const carriedOut = same(next, sc) && titleNodes[i + 1];
        let a;
        if (t < sc.start - 0.001 || t > sc.end + 0.001) a = 0;
        else {
          const pin = carriedIn ? 1 : clamp((t - tIn) / 0.7), pout = carriedOut ? 0 : clamp((t - (sc.end - 0.3)) / 0.3);
          a = Math.min(EASE.out(pin) * 1.4, 1) * (1 - pout);
          const lines = d.querySelectorAll('.t-line');
          lines.forEach((ln, k) => { const p = carriedIn || S.reduce ? 1 : clamp((t - tIn - k * 0.14) / 0.55); ln.style.transform = `translateY(${f((1 - EASE.out(p)) * 30)}px)`; ln.style.opacity = f3(clamp(p * 1.6)); });
          const box = d.querySelector('.t-box > svg'); if (box) { const p = carriedIn || S.reduce ? 1 : EASE.out(clamp((t - tIn + 0.1) / 0.55)); box.style.transform = `scaleX(${f3(Math.max(0.001, p))})`; box.style.transformOrigin = 'left center'; }
        }
        d.style.opacity = f3(a); d.style.visibility = a > 0 ? 'visible' : 'hidden';
      });
    }

    // ---- bottom timeline (collage)
    let tlNodes = null;
    if (meta.timeline && meta.timeline.length) {
      const host = $('.pe-timeline-host'); const tl = document.createElement('div'); tl.className = 'pe-timeline'; tl.style.bottom = Math.round(H * 0.035) + 'px';
      tl.innerHTML = `<div class="tl-track"></div><div class="tl-fill"></div>` + meta.timeline.map((l, i) => `<div class="tl-node" style="left:${(i / (meta.timeline.length - 1)) * 100}%"><div class="tl-dot"></div><div class="tl-label">${esc(l)}</div></div>`).join('');
      host.appendChild(tl); tlNodes = { el: tl, fill: tl.querySelector('.tl-fill'), nodes: [...tl.querySelectorAll('.tl-node')] };
    }
    function timelineIdx(i) { for (let k = i; k >= 0; k--) if (C.scenes[k].timeline != null) return C.scenes[k].timeline; return 0; }
    function updateTimeline(t, sc) {
      if (!tlNodes) return; const n = meta.timeline.length - 1; const cur = timelineIdx(sc.index), prev = sc.index > 0 ? timelineIdx(sc.index - 1) : 0;
      const k = EASE.inOut(clamp((t - sc.start - 0.2) / 0.9)); const pos = lerp(prev, cur, S.reduce ? 1 : k);
      tlNodes.fill.style.width = (pos / n) * 100 + '%';
      tlNodes.nodes.forEach((nd, i) => { nd.classList.toggle('on', i === cur); nd.classList.toggle('done', i < cur); });
      tlNodes.el.style.opacity = sc.hideTimeline ? 0 : 1;
    }

    // ---- background colour + transitions
    function sceneBg(sc) { return col(sc.bg || 'bg'); }
    const isDark = (c) => /^#/.test(c) && (() => { const [r, g, b] = hexRgb(c); return 0.299 * r + 0.587 * g + 0.114 * b < 110; })();
    function updateBg(t, sc) {
      stage.classList.toggle('dark', isDark(sceneBg(sc)));
      const prev = C.scenes[sc.index - 1];
      const tr = sc.transition || (prev && sceneBg(prev) !== sceneBg(sc) ? (style.decor === 'collage' ? 'tear' : 'fade') : 'cut');
      let html = '';
      if (prev && tr === 'tear' && !S.reduce) {
        const p = clamp((t - sc.start + 0.05) / 0.75), e = EASE.inOut(p);
        bgRect.setAttribute('fill', p >= 1 ? sceneBg(sc) : sceneBg(prev));
        if (p > 0 && p < 1) { const edge = lerp(-120, W + 160, e); const pts = tornEdge([[-40, -40], [edge, -40], [edge - 70, H + 40], [-40, H + 40]], 9, 77 + sc.index, true, 22); html = `<path d="${polyD(pts)}" transform="translate(10,0)" fill="#000" opacity=".18"/><path d="${polyD(pts)}" fill="${sceneBg(sc)}"/><path d="${polyD(pts)}" fill="url(#pe-grainp)" opacity=".6"/>`; }
      } else if (prev && tr === 'fade') {
        const p = clamp((t - sc.start) / 0.6); bgRect.setAttribute('fill', mix(sceneBg(prev), sceneBg(sc), EASE.inOut(p)));
      } else bgRect.setAttribute('fill', sceneBg(sc));
      if (transG._h !== html) { transG.innerHTML = html; transG._h = html; }
    }

    // ---- camera
    const baseCam = { x: W / 2, y: H / 2, zoom: style.bgVariant === 'board' ? 1.04 : 1 };
    function camAt(t) {
      let c = Object.assign({}, baseCam);
      for (const k of C.cams) {
        if (t < k.t) break; const p = S.reduce ? 1 : (EASE[k.ease] || EASE.inOut)(clamp((t - k.t) / k.dur));
        const tgt = { x: k.x != null ? k.x : c.x, y: k.y != null ? k.y : c.y, zoom: k.zoom != null ? k.zoom : c.zoom };
        c = { x: lerp(c.x, tgt.x, p), y: lerp(c.y, tgt.y, p), zoom: Math.exp(lerp(Math.log(c.zoom), Math.log(tgt.zoom), p)) };
      }
      return c;
    }

    // ---- captions
    let capCue = null;
    function cueAt(t) { for (const c of C.cues) if (t >= c.t0 && t < c.t1 + Math.min(0.35, (c.pause != null ? c.pause : 0.4))) return c; return null; }
    function updateCaption(t) {
      const c = cueAt(t);
      if (c !== capCue) {
        capCue = c; capEl.innerHTML = c ? `<span>${esc(c.caption || c.say)}</span>` : '';
        if (c && S.captions) live.textContent = ''; // live region is fed by speech-off mode only (avoid double voice)
        updateTranscriptHL();
      }
      capEl.classList.toggle('hidden', !S.captions || !c);
    }
    function applyCapStyle() {
      const base = { S: 0.015, M: 0.019, L: 0.025 }[S.capSize] || 0.019;
      capEl.style.fontSize = Math.round(Math.min(W, H * 1.7) * base) + 'px';
      capEl.style.bottom = Math.round(H * (tlNodes ? 0.11 : 0.06)) + 'px';
      capEl.className = 'pe-caption ' + (style.captionVariant || 'chip') + (S.captions ? '' : ' hidden');
    }
    applyCapStyle();

    // ---- render a frame
    function render(t) {
      t = clamp(t, 0, C.total);
      const sc = sceneAt(t);
      updateBg(t, sc);
      const cam = camAt(t);
      world.setAttribute('transform', `translate(${f(W / 2)},${f(H / 2)}) scale(${f3(cam.zoom)}) translate(${f(-cam.x)},${f(-cam.y)})`);
      for (const el of C.els) updateEl(el, t);
      updateTitles(t); updateTimeline(t, sc); updateCaption(t);
      updateUI(t);
    }
    function sceneAt(t) { for (const s of C.scenes) if (t < s.end) return s; return C.scenes[C.scenes.length - 1]; }

    // ---- fit stage into the player
    function fit() { const vp = $('.pe-viewport'); const k = Math.min(vp.clientWidth / W, vp.clientHeight / H) || 1; stage.style.transform = `scale(${k})`; stage.style.marginRight = `${-W * (1 - k)}px`; stage.style.marginBottom = `${-H * (1 - k)}px`; }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root); window.addEventListener('resize', fit); setTimeout(fit, 0);

    // ================================================================== audio
    const A = { ctx: null, master: null, voiceOn: prefs.voice !== false, musicOn: prefs.music != null ? prefs.music : meta.music.enabled !== false, volume: prefs.volume != null ? prefs.volume : 1,
      mode: 'speech', files: [], active: -1, speaking: false, utter: null, voices: [], voiceName: prefs.voiceName || null };
    A.mode = C.cues.length && C.cues.every((c) => c.audio) ? 'files' : (window.speechSynthesis && meta.narration !== 'off' ? 'speech' : 'off');
    if (A.mode === 'files') A.files = C.cues.map((c) => { const a = new Audio(); a.preload = 'auto'; a.src = c.audio; return a; });
    function pickVoice() {
      if (!window.speechSynthesis) return null; const vs = speechSynthesis.getVoices(); A.voices = vs;
      if (A.voiceName) { const v = vs.find((x) => x.name === A.voiceName); if (v) return v; }
      const lang = (meta.language || 'en-US').toLowerCase(), pre = lang.split('-')[0];
      const score = (v) => { const L = v.lang.toLowerCase().replace('_', '-'); let s = 0; if (L === lang) s += 40; else if (L.startsWith(pre)) s += 25; else return -1;
        (meta.voice.prefer || []).forEach((p, i) => { if (v.name.toLowerCase().includes(String(p).toLowerCase())) s += 60 - i; });
        if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 20; if (/google us english|samantha|aria|jenny|guy|daniel|serena|ava|allison/i.test(v.name)) s += 10; if (!v.localService) s += 3; return s; };
      return vs.filter((v) => score(v) >= 0).sort((a, b) => score(b) - score(a))[0] || null;
    }
    if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = () => { A.voices = speechSynthesis.getVoices(); buildMenu(); }; }
    function narrStop() { if (A.mode === 'files') A.files.forEach((a) => { try { a.pause(); } catch (e) {} }); if (A.mode === 'speech' && window.speechSynthesis) { speechSynthesis.cancel(); } A.speaking = false; A.active = -1; duck(false); }
    function narrUpdate(t) {
      if (!S.playing) return;
      const c = C.cues.find((q) => t >= q.t0 && t < q.t1); const idx = c ? C.cues.indexOf(c) : -1;
      if (idx === A.active) return;
      if (A.mode === 'files' && A.active >= 0) { try { A.files[A.active].pause(); } catch (e) {} }
      A.active = idx; if (idx < 0) { duck(false); return; }
      if (!A.voiceOn) { live.textContent = c.caption || c.say; return; }
      if (A.mode === 'files') { const a = A.files[idx]; try { a.currentTime = Math.max(0, t - c.t0); a.playbackRate = S.rate; a.volume = A.volume; a.play().catch(() => {}); } catch (e) {} duck(true); a.onended = () => duck(false); }
      else if (A.mode === 'speech' && t - c.t0 < 0.6) {
        try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(c.say || c.caption); const v = pickVoice(); if (v) u.voice = v; u.lang = (v && v.lang) || meta.language; u.rate = clamp(meta.voice.rate * S.rate, 0.5, 2); u.pitch = meta.voice.pitch; u.volume = A.volume;
          u.onend = u.onerror = () => { if (A.utter === u) { A.speaking = false; duck(false); } }; A.utter = u; A.speaking = true; duck(true); speechSynthesis.speak(u); } catch (e) { A.speaking = false; }
      } else if (A.mode === 'off') live.textContent = c.caption || c.say;
    }
    // ---------- procedural background music (Web Audio) ----------
    const MOODS = {
      calm: { bpm: 68, root: 57, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], arp: [0, 2, 1, 2], step: 1, hat: false, wave: 'triangle' },
      warm: { bpm: 80, root: 53, prog: [[0, 4, 7], [4, 7, 11], [-3, 0, 4], [-7, -3, 0]], arp: [0, 1, 2, 1, 0, 2, 1, 2], step: 0.5, hat: false, wave: 'triangle' },
      playful: { bpm: 104, root: 60, prog: [[0, 4, 7], [7, 11, 14], [-3, 0, 4], [-7, -3, 0]], arp: [0, 2, 1, 2, 0, 2, 1, 3], step: 0.5, hat: true, wave: 'square' },
      documentary: { bpm: 74, root: 50, prog: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], arp: [0, 1, 2, 1], step: 0.5, hat: false, wave: 'sine' },
      upbeat: { bpm: 112, root: 62, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], arp: [0, 1, 2, 3, 2, 1, 2, 1], step: 0.5, hat: true, wave: 'triangle' }
    };
    const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function musicGraph(ctx) {
      const out = ctx.createGain(); out.gain.value = 1;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(out);
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.32; const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.22;
      delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(lp);
      return { out, bus: lp, fx: delay };
    }
    function scheduleMusic(ctx, G, mood, fromT, toT, ctxT0) { // schedule notes for timeline window [fromT,toT)
      const M = MOODS[mood] || MOODS.calm, beat = 60 / M.bpm, bar = beat * 4;
      const notes = (ch) => ch.map((n) => M.root + n);
      const firstBar = Math.floor(fromT / bar);
      for (let b = firstBar; b * bar < toT; b++) {
        const chord = notes(M.prog[b % M.prog.length]), bt = b * bar;
        if (bt >= fromT && bt < toT) { // pad + bass at bar start
          const at = ctxT0 + bt - fromT0;
          chord.forEach((n, i) => { [-6, 6].forEach((det) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(n - 12 + (i === 0 ? 12 : 0)); o.detune.value = det; const g = ctx.createGain(); const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; o.connect(flt); flt.connect(g); g.connect(G.bus); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.018, at + 1.2); g.gain.setValueAtTime(0.018, at + bar - 0.6); g.gain.linearRampToValueAtTime(0, at + bar + 1.0); o.start(at); o.stop(at + bar + 1.1); }); });
          const bo = ctx.createOscillator(); bo.type = 'sine'; bo.frequency.value = midiHz(chord[0] - 24); const bg = ctx.createGain(); bo.connect(bg); bg.connect(G.bus); bg.gain.setValueAtTime(0, at); bg.gain.linearRampToValueAtTime(0.11, at + 0.04); bg.gain.exponentialRampToValueAtTime(0.001, at + bar * 0.9); bo.start(at); bo.stop(at + bar);
        }
        const steps = Math.round(4 / M.step);
        for (let s = 0; s < steps; s++) { // arpeggio plucks
          const st = bt + s * beat * M.step; if (st < fromT || st >= toT) continue; const at = ctxT0 + st - fromT0;
          const deg = M.arp[s % M.arp.length]; const n = chord[deg % 3] + (deg >= 3 ? 12 : 0) + 12;
          const o = ctx.createOscillator(); o.type = M.wave; o.frequency.value = midiHz(n); const g = ctx.createGain(); o.connect(g); g.connect(G.bus); g.connect(G.fx);
          const lvl = M.wave === 'square' ? 0.018 : 0.05; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(lvl, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, at + 0.55); o.start(at); o.stop(at + 0.6);
          if (M.hat && s % 2 === 1) { const len = 0.05, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0), Rn = rng(b * 31 + s); for (let i = 0; i < d.length; i++) d[i] = (Rn() * 2 - 1) * (1 - i / d.length); const src = ctx.createBufferSource(); src.buffer = buf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const hg = ctx.createGain(); hg.gain.value = 0.05; src.connect(hp); hp.connect(hg); hg.connect(G.bus); src.start(at); }
        }
      }
    }
    let fromT0 = 0; // timeline time mapped to ctxT0 in the current scheduling run
    const MUS = { timer: null, G: null, duckG: null, schedUntil: 0, ctxT0: 0 };
    function musicVolume() { return (meta.music.volume || 0.2) * 3 * A.volume * (A.musicOn ? 1 : 0); }
    function ensureCtx() {
      if (A.ctx) return A.ctx; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      A.ctx = new AC(); MUS.G = musicGraph(A.ctx); MUS.duckG = A.ctx.createGain(); MUS.G.out.connect(MUS.duckG); A.master = A.ctx.createGain(); MUS.duckG.connect(A.master); A.master.connect(A.ctx.destination); A.master.gain.value = musicVolume();
      return A.ctx;
    }
    function musicStart(t) {
      if (meta.music.mood === 'none') return; const ctx = ensureCtx(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume();
      musicStop(true); MUS.G = musicGraph(ctx); MUS.G.out.connect(MUS.duckG);
      fromT0 = t; MUS.ctxT0 = ctx.currentTime + 0.05; MUS.schedUntil = t;
      A.master.gain.cancelScheduledValues(ctx.currentTime); A.master.gain.setValueAtTime(0.0001, ctx.currentTime); A.master.gain.linearRampToValueAtTime(musicVolume() + 0.0001, ctx.currentTime + 0.8);
      const pump = () => { const now = fromT0 + (ctx.currentTime - MUS.ctxT0); const until = Math.min(now + 1.2, C.total + 2); if (until > MUS.schedUntil) { scheduleMusic(ctx, MUS.G, meta.music.mood, MUS.schedUntil, until, MUS.ctxT0); MUS.schedUntil = until; } };
      pump(); MUS.timer = setInterval(pump, 250);
    }
    function musicStop(hard) {
      if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = null; }
      if (A.ctx && MUS.G) { const g = MUS.G.out, now = A.ctx.currentTime; try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + (hard ? 0.05 : 0.4)); } catch (e) {} const old = MUS.G; setTimeout(() => { try { old.out.disconnect(); } catch (e) {} }, 600); MUS.G = null; }
    }
    function duck(on) { if (!A.ctx || !MUS.duckG) return; const now = A.ctx.currentTime; MUS.duckG.gain.cancelScheduledValues(now); MUS.duckG.gain.setTargetAtTime(on ? 0.38 : 1, now, on ? 0.08 : 0.5); }
    function setVolume(v) { A.volume = v; if (A.master && A.ctx) A.master.gain.setTargetAtTime(musicVolume() + 0.0001, A.ctx.currentTime, 0.1); A.files.forEach((a) => (a.volume = v)); savePrefs(); }
    async function renderMusicWav(seconds) { // offline render for MP4 export
      const sr = 44100, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; const ctx = new OAC(2, Math.ceil(sr * seconds), sr);
      const G = musicGraph(ctx); const m = ctx.createGain(); m.gain.value = (meta.music.volume || 0.2) * 3; G.out.connect(m); m.connect(ctx.destination);
      fromT0 = 0; scheduleMusic(ctx, G, meta.music.mood, 0, seconds, 0);
      const buf = await ctx.startRendering(); return wavB64(buf);
    }
    function wavB64(buf) { const ch = buf.numberOfChannels, len = buf.length, ab = new ArrayBuffer(44 + len * ch * 2), v = new DataView(ab); const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * ch * 2, true);
      const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c)); let o = 44; for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(data[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
      let bin = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(bin); }

    // ================================================================== clock
    let raf = 0, last = 0;
    function frame(now) {
      if (!S.playing) return;
      let dt = Math.min(0.1, (now - last) / 1000) * S.rate; last = now;
      const c = A.active >= 0 ? C.cues[A.active] : null;
      if (A.mode === 'files' && c && A.voiceOn && !A.files[A.active].paused && !A.files[A.active].ended) S.t = Math.max(S.t, Math.min(c.t1, c.t0 + A.files[A.active].currentTime)); // audio is the master clock
      else if (A.mode === 'speech' && c && A.speaking && A.voiceOn && S.t + dt >= c.t1 - 0.02) { // hold until the voice finishes the sentence
        if (!A.holdSince) A.holdSince = now;
        const stuck = (now - A.holdSince > 1200 && !speechSynthesis.speaking) || now - A.holdSince > 7000; // watchdog: engines that never fire 'end'
        if (stuck) { A.speaking = false; A.holdSince = 0; S.t += dt; } else S.t = Math.min(S.t, c.t1 - 0.02);
      }
      else { S.t += dt; A.holdSince = 0; }
      if (S.t >= C.total) { S.t = C.total; render(S.t); end(); return; }
      narrUpdate(S.t); render(S.t);
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (S.ended || S.t >= C.total - 0.05) seek(0);
      if (A.mode === 'speech' && A.voiceOn) { const c = C.cues.find((q) => S.t >= q.t0 && S.t < q.t1); if (c && S.t - c.t0 > 0.6) { S.t = c.t0; render(S.t); } } // resume speech at the sentence start
      S.playing = true; S.started = true; S.ended = false; $('[data-poster]').hidden = true; $('[data-end]').hidden = true;
      if (A.musicOn) musicStart(S.t); else ensureCtx();
      if (A.mode === 'speech' && window.speechSynthesis && speechSynthesis.paused) speechSynthesis.resume();
      if (A.mode === 'files' && A.active >= 0 && A.voiceOn) A.files[A.active].play().catch(() => {});
      last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); setIdle(); updateUI(S.t); announce('Playing');
    }
    function pause() {
      S.playing = false; cancelAnimationFrame(raf); musicStop();
      if (A.mode === 'files' && A.active >= 0) A.files[A.active].pause();
      if (A.mode === 'speech' && window.speechSynthesis) { speechSynthesis.cancel(); A.speaking = false; A.active = -1; }
      root.classList.remove('idle'); updateUI(S.t); announce('Paused');
    }
    function end() { S.playing = false; S.ended = true; cancelAnimationFrame(raf); musicStop(); narrStop(); root.classList.remove('idle'); $('[data-end]').hidden = false; updateUI(S.t); announce('Video ended'); }
    function seek(t, keep) { const was = S.playing; narrStop(); S.t = clamp(t, 0, C.total); S.ended = false; $('[data-end]').hidden = true; render(S.t); if (was && !keep) { musicStart(S.t); narrUpdate(S.t); } }
    function toggle() { S.playing ? pause() : play(); }

    // ================================================================== UI
    const scrub = $('.pe-scrub input'), bar = $('.pe-scrub .bar i'), tip = $('.pe-scrub .tip'), timeEl = $('.pe-time');
    const scrubWrap = $('.pe-scrub');
    C.scenes.forEach((sc, i) => { if (i === 0) return; const tk = document.createElement('div'); tk.className = 'tick'; tk.style.left = (sc.start / C.total) * 100 + '%'; tk.title = sc.title || sc.kicker || ''; scrubWrap.appendChild(tk); });
    const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/></svg>', ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/></svg>';
    function chapterName(t) { const s = sceneAt(t); return (s.kicker ? s.kicker + ' — ' : '') + (s.title || '').replace(/\n/g, ' '); }
    function updateUI(t) {
      const p = C.total ? t / C.total : 0; bar.style.width = p * 100 + '%'; if (document.activeElement !== scrub) scrub.value = Math.round(p * 1000);
      scrub.setAttribute('aria-valuetext', `${fmtTime(t)} of ${fmtTime(C.total)}${chapterName(t) ? ', ' + chapterName(t) : ''}`);
      timeEl.textContent = `${fmtTime(t)} / ${fmtTime(C.total)}`;
      const pb = $('[data-play]'); const lab = S.playing ? 'Pause' : 'Play'; if (pb.getAttribute('aria-label') !== lab || !pb.innerHTML) { pb.innerHTML = S.playing ? ICON_PAUSE : ICON_PLAY; pb.setAttribute('aria-label', lab); }
    }
    scrub.addEventListener('input', () => { const t = (scrub.value / 1000) * C.total; seek(t, true); });
    scrub.addEventListener('change', () => { if (S.playing) { musicStart(S.t); narrUpdate(S.t); } });
    scrubWrap.addEventListener('mousemove', (e) => { const r = scrubWrap.getBoundingClientRect(); const k = clamp((e.clientX - r.left) / r.width); tip.style.left = k * 100 + '%'; tip.textContent = `${fmtTime(k * C.total)} · ${chapterName(k * C.total) || ''}`; });
    $('[data-play]').onclick = toggle; $('[data-bigplay]').onclick = () => { play(); root.focus({ preventScroll: true }); }; $('[data-replay]').onclick = () => { seek(0); play(); }; $('[data-replay2]').onclick = () => { seek(0); play(); };
    $('[data-back]').onclick = () => seek(S.t - 5); $('[data-fwd]').onclick = () => seek(S.t + 5);
    const ccBtn = $('[data-cc]'); const setCC = (v) => { S.captions = v; ccBtn.setAttribute('aria-pressed', String(v)); applyCapStyle(); updateCaption(S.t); savePrefs(); };
    ccBtn.onclick = () => { setCC(!S.captions); toast(S.captions ? 'Subtitles on' : 'Subtitles off'); }; setCC(S.captions);
    const voiceBtn = $('[data-voice]'); const setVoice = (v) => { A.voiceOn = v; voiceBtn.setAttribute('aria-pressed', String(v)); if (!v) narrStop(); savePrefs(); };
    voiceBtn.onclick = () => { setVoice(!A.voiceOn); toast(A.voiceOn ? 'Narration on' : 'Narration off'); }; setVoice(A.voiceOn);
    if (A.mode === 'off') { voiceBtn.disabled = true; voiceBtn.title = 'No narration available in this browser'; }
    const musicBtn = $('[data-music]'); const setMusic = (v) => { A.musicOn = v; musicBtn.setAttribute('aria-pressed', String(v)); if (S.playing) { v ? musicStart(S.t) : musicStop(); } savePrefs(); };
    musicBtn.onclick = () => { setMusic(!A.musicOn); toast(A.musicOn ? 'Music on' : 'Music off'); }; musicBtn.setAttribute('aria-pressed', String(A.musicOn));
    if (meta.music.mood === 'none') musicBtn.hidden = true;
    $('.pe-vol').oninput = (e) => setVolume(e.target.value / 100);
    const RATES = [0.75, 1, 1.25, 1.5]; const rateBtn = $('[data-rate]'); const setRate = (r) => { S.rate = r; rateBtn.textContent = r + '×'; A.files.forEach((a) => (a.playbackRate = r)); savePrefs(); }; setRate(S.rate);
    rateBtn.onclick = () => { setRate(RATES[(RATES.indexOf(S.rate) + 1) % RATES.length]); toast('Speed ' + S.rate + '×'); };
    $('[data-fs]').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen(); };
    const trEl = $('.pe-transcript');
    function buildTranscript() { trEl.innerHTML = `<h3>Transcript <button class="pe-btn" data-trclose aria-label="Close transcript">✕</button></h3>` + C.scenes.map((sc) => `<h5>${esc(sc.kicker || '')}${sc.kicker && sc.title ? ' · ' : ''}${esc((sc.title || '').replace(/\n/g, ' '))}</h5>` + sc.cues.map((c) => `<p tabindex="0" role="button" data-t="${c.t0}">${esc(c.caption || c.say)}</p>`).join('')).join('');
      trEl.querySelector('[data-trclose]').onclick = () => toggleTranscript(false);
      trEl.querySelectorAll('p').forEach((p) => { const go = () => { seek(parseFloat(p.dataset.t)); if (!S.playing) render(S.t); }; p.onclick = go; p.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; }); }
    function updateTranscriptHL() { if (!trEl.classList.contains('open')) return; trEl.querySelectorAll('p').forEach((p) => p.classList.toggle('on', capCue && Math.abs(parseFloat(p.dataset.t) - capCue.t0) < 1e-6)); }
    function toggleTranscript(v) { const open = v != null ? v : !trEl.classList.contains('open'); trEl.classList.toggle('open', open); $('[data-tr]').setAttribute('aria-pressed', String(open)); if (open) { buildTranscript(); updateTranscriptHL(); trEl.querySelector('p') && trEl.querySelector('[data-trclose]').focus(); } }
    $('[data-tr]').onclick = () => toggleTranscript(); $('[data-trans2]').onclick = () => toggleTranscript(true);
    $('[data-vtt]').onclick = () => { const v = 'WEBVTT\n\n' + C.cues.map((c, i) => `${i + 1}\n${vttT(c.t0)} --> ${vttT(c.t1)}\n${c.caption || c.say}\n`).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([v], { type: 'text/vtt' })); a.download = (meta.slug || 'captions') + '.vtt'; a.click(); };
    const vttT = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = (s % 60).toFixed(3); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${r.padStart(6, '0')}`; };
    const menu = $('.pe-menu');
    function buildMenu() {
      const opt = (group, val, label, on) => `<button class="opt" role="menuitemradio" aria-checked="${on}" data-g="${group}" data-v="${val}">${label}</button>`;
      let voicesHtml = '';
      if (A.mode === 'speech' && window.speechSynthesis) { const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith((meta.language || 'en').slice(0, 2).toLowerCase())); const cur = pickVoice(); voicesHtml = `<h4>Voice</h4><select data-voicesel aria-label="Narration voice">${vs.map((v) => `<option ${cur && cur.name === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`; }
      menu.innerHTML = `<h4>Subtitle size</h4><div class="opts">${['S', 'M', 'L'].map((s) => opt('cap', s, s, S.capSize === s)).join('')}</div>
        <h4>Speed</h4><div class="opts">${RATES.map((r) => opt('rate', r, r + '×', S.rate === r)).join('')}</div>${voicesHtml}
        <h4>Accessibility</h4><label><input type="checkbox" data-reduce ${S.reduce ? 'checked' : ''}> Reduce motion</label>
        <h4>Narration source</h4><div style="opacity:.8">${A.mode === 'files' ? 'Recorded voice track' : A.mode === 'speech' ? 'Browser speech (pick a voice above)' : 'Not available — captions only'}</div>`;
      menu.querySelectorAll('button.opt').forEach((b) => (b.onclick = () => { if (b.dataset.g === 'cap') { S.capSize = b.dataset.v; applyCapStyle(); savePrefs(); } else setRate(parseFloat(b.dataset.v)); buildMenu(); }));
      const vs = menu.querySelector('[data-voicesel]'); if (vs) vs.onchange = () => { A.voiceName = vs.value; savePrefs(); toast('Voice: ' + vs.value); };
      menu.querySelector('[data-reduce]').onchange = (e) => { S.reduce = e.target.checked; savePrefs(); render(S.t); };
    }
    $('[data-set]').onclick = () => { buildMenu(); menu.classList.toggle('open'); $('[data-set]').setAttribute('aria-expanded', String(menu.classList.contains('open'))); };
    const help = $('.pe-help'); help.innerHTML = `<b>Keyboard shortcuts</b>${[['Space / K', 'Play / pause'], ['← / →', 'Back / forward 5 s'], ['J / L', 'Previous / next chapter'], ['Home', 'Replay from start'], ['C', 'Subtitles on / off'], ['N', 'Narration on / off'], ['M', 'Music on / off'], ['T', 'Transcript'], ['F', 'Full screen'], ['< / >', 'Slower / faster'], ['?', 'This help']].map(([k, d]) => `<div><kbd>${k}</kbd>${d}</div>`).join('')}`;
    function chapterJump(dir) { const i = sceneAt(S.t).index; const tgt = dir < 0 ? (S.t - C.scenes[i].start > 1.5 ? C.scenes[i] : C.scenes[Math.max(0, i - 1)]) : C.scenes[Math.min(C.scenes.length - 1, i + 1)]; seek(tgt.start + 0.01); }
    document.addEventListener('keydown', (e) => { // shortcuts also work when focus fell back to <body>
      if ((document.activeElement === document.body || !document.activeElement) && !e.defaultPrevented) root.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: false, cancelable: true }));
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type === 'range' && ['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.target.tagName === 'SELECT') return;
      const k = e.key; let handled = true;
      if (k === ' ' || k === 'k' || k === 'K') { if (e.target.tagName === 'BUTTON' && k === ' ') return; toggle(); }
      else if (k === 'ArrowLeft') seek(S.t - 5); else if (k === 'ArrowRight') seek(S.t + 5);
      else if (k === 'j' || k === 'J') chapterJump(-1); else if (k === 'l' || k === 'L') chapterJump(1);
      else if (k === 'Home') { seek(0); } else if (k === 'End') seek(C.total - 0.05);
      else if (k === 'c' || k === 'C') ccBtn.click(); else if (k === 'n' || k === 'N') voiceBtn.click(); else if (k === 'm' || k === 'M') musicBtn.click();
      else if (k === 't' || k === 'T') toggleTranscript(); else if (k === 'f' || k === 'F') $('[data-fs]').click();
      else if (k === '>' || k === '.') setRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(S.rate) + 1)]); else if (k === '<' || k === ',') setRate(RATES[Math.max(0, RATES.indexOf(S.rate) - 1)]);
      else if (k === '?') help.classList.toggle('open'); else if (k === 'Escape') { help.classList.remove('open'); menu.classList.remove('open'); toggleTranscript(false); }
      else handled = false;
      if (handled) { e.preventDefault(); wake(); }
    });
    $('.pe-viewport').addEventListener('click', () => { if (S.started) toggle(); else play(); });
    let idleT = 0; function wake() { root.classList.remove('idle'); clearTimeout(idleT); setIdle(); } function setIdle() { clearTimeout(idleT); idleT = setTimeout(() => { if (S.playing && !menu.classList.contains('open') && !root.querySelector('.pe-ui:hover')) root.classList.add('idle'); }, 2600); }
    root.addEventListener('mousemove', wake); root.addEventListener('focusin', wake);
    const toastEl = $('.pe-toast'); let toastT = 0; function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1100); }
    function announce(m) { live.textContent = m; }
    function loadPrefs() { try { return JSON.parse(localStorage.getItem('pe-prefs') || '{}'); } catch (e) { return {}; } }
    function savePrefs() { try { localStorage.setItem('pe-prefs', JSON.stringify({ captions: S.captions, capSize: S.capSize, rate: S.rate, volume: A.volume, voice: A.voiceOn, music: A.musicOn, reduce: S.reduce, voiceName: A.voiceName })); } catch (e) {} }

    // poster + end screen text
    $('[data-poster] .o-title').textContent = meta.title; $('[data-poster] .o-meta').textContent = `${fmtTime(C.total)} · ${meta.audience ? meta.audience + ' · ' : ''}Press Space to play`;
    $('[data-end] .o-title').textContent = meta.endTitle || meta.title;
    if (opts.headless) { $('[data-poster]').hidden = true; root.querySelector('.pe-ui').style.display = 'none'; }
    const posterT = meta.posterAt != null ? C.time(meta.posterAt, C.scenes[0], 0) : Math.min(C.total, (C.scenes[0] ? C.scenes[0].end : 0) - 0.2);
    S.t = 0; render(opts.headless ? 0 : posterT); S.t = 0; updateUI(0);

    return { seek: (t) => { S.t = clamp(t, 0, C.total); render(S.t); }, play, pause, get duration() { return C.total; }, get time() { return S.t; }, compiled: C, renderMusicWav, el: root };
  }

  window.PE = { mount, compile, styles: SP };
})();
