/* Iso Explainer engine — deterministic isometric explainer renderer.
 * window.ISO.init(storyboard) then window.ISO.render(t) draws the exact frame at time t (seconds).
 * Everything is a pure function of t, so frames can be captured in any order.
 */
(function () {
  'use strict';
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  const NS = 'http://www.w3.org/2000/svg';
  let SB, P, W, H, U = 44, nodes = {}, links = {}, scenes = [], total = 0;
  let acts = {};            // target id -> [{do,t0,t1,...}]
  let camTargets = [];      // per scene camera target {cx,cy,z}
  let captionCues = [];     // [{t0,t1,text}]
  const $ = (id) => document.getElementById(id);

  // ---------- math helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const prog = (t, t0, t1) => (t1 <= t0 ? (t >= t0 ? 1 : 0) : clamp((t - t0) / (t1 - t0)));
  const iso = (x, y, z) => [(x - y) * C30 * U, (x + y) * S30 * U - z * U];
  const f = (n) => (Math.round(n * 100) / 100).toString();
  const pt = (p) => f(p[0]) + ',' + f(p[1]);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function col(c, fallback) {
    if (!c) return P[fallback] || fallback;
    return P[c] || c;
  }
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) { // amt>0 lighten, <0 darken
    if (!/^#/.test(hex)) return hex;
    const [r, g, b] = hexToRgb(hex);
    const m = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }

  // ---------- timeline ----------
  function buildTimeline() {
    let t = 0;
    scenes = SB.scenes.map((s, i) => {
      const sc = Object.assign({}, s, { index: i, start: t, end: t + s.duration });
      t += s.duration;
      return sc;
    });
    total = t;
    acts = {};
    for (const sc of scenes) {
      for (const a of sc.actions || []) {
        const targets = Array.isArray(a.target) ? a.target : [a.target == null ? '_' : a.target];
        targets.forEach((id, k) => {
          const stagger = (a.stagger || 0) * k;
          const t0 = sc.start + (a.at || 0) + stagger;
          // persistent overlays/effects default to "until the end of this scene"
          const persistent = PERSIST.includes(a.do);
          const dur = a.dur != null ? a.dur : (persistent ? Math.max(0.3, sc.end - t0) : defaultDur(a.do));
          const t1 = a.until === 'end' ? total + 999 : (typeof a.until === 'number' ? sc.start + a.until : t0 + dur);
          (acts[id] = acts[id] || []).push(Object.assign({}, a, { target: id, t0, t1, scene: sc.index }));
        });
      }
    }
    // 'until: end' needs total; recompute after total known (already known here)
    // captions
    captionCues = [];
    for (const sc of scenes) {
      const text = sc.caption != null ? sc.caption : sc.narration;
      if (!text) continue;
      const chunks = splitCaption(text, SB.meta.language || 'zh-CN');
      const a = sc.start + 0.15, b = sc.end - 0.15;
      const totalLen = chunks.reduce((s, c) => s + c.length, 0) || 1;
      let cur = a;
      chunks.forEach((c) => {
        const d = (b - a) * (c.length / totalLen);
        captionCues.push({ t0: cur, t1: cur + d, text: c, scene: sc.index });
        cur += d;
      });
    }
  }
  const PERSIST = ['flow', 'highlight', 'callout', 'emit', 'stream', 'force', 'annotate', 'readout', 'chart'];
  function defaultDur(kind) {
    return { trace: 1.2, assemble: 1.0, build: 1.8, link: 0.9, flow: 3, highlight: 2, callout: 2.5, label: 0.5, hide: 0.5, show: 0.5, move: 1.5 }[kind] || 1;
  }
  function splitCaption(text, lang) {
    const cjk = /^(zh|ja|ko)/i.test(lang);
    const max = (SB.meta.captionMaxChars) || (cjk ? 24 : 64);
    const sentences = text.split(/(?<=[。！？；!?;])\s*|(?<=\.)\s+/).filter((s) => s.trim());
    const out = [];
    for (let s of sentences) {
      s = s.trim();
      while (s.length > max) {
        // balanced split: aim for equal chunks, prefer punctuation (or spaces for latin) near the target point
        const n = Math.ceil(s.length / max), target = s.length / n;
        let best = -1, bestD = 1e9;
        for (let k = Math.floor(target * 0.5); k <= Math.min(max, s.length - 2); k++) {
          const ch = s[k];
          const ok = /[，,、：:；;）) ]/.test(ch);
          if (ok && Math.abs(k + 1 - target) < bestD) { best = k + 1; bestD = Math.abs(k + 1 - target); }
        }
        if (best < 0) best = Math.round(target);
        out.push(s.slice(0, best).trim());
        s = s.slice(best).trim();
      }
      if (s) out.push(s);
    }
    return out;
  }
  function sceneAt(t) {
    for (const sc of scenes) if (t < sc.end) return sc;
    return scenes[scenes.length - 1];
  }

  // ---------- state queries ----------
  function actProgress(id, kinds, t, ease = (x) => x) {
    let p = 0;
    for (const a of acts[id] || []) if (kinds.includes(a.do)) p = Math.max(p, ease(prog(t, a.t0, a.t1)));
    return p;
  }
  function hidden(id, t) { // hide action fades the element out (1 = fully hidden)
    let h = 0;
    for (const a of acts[id] || []) {
      if (a.do === 'hide') h = Math.max(h, prog(t, a.t0, a.t1));
      if (a.do === 'show' && t >= a.t0) h = Math.min(h, 1 - prog(t, a.t0, a.t1));
    }
    return h;
  }
  function nodeState(n, t) {
    if (n.initial === 'visible') return { trace: 1, asm: 1, vis: 1 - hidden(n.id, t) };
    if (n.initial === 'traced') {
      const asm = actProgress(n.id, ['assemble', 'build'], t);
      return { trace: 1, asm, vis: 1 - hidden(n.id, t) };
    }
    let trace = 0, asm = 0;
    for (const a of acts[n.id] || []) {
      const p = prog(t, a.t0, a.t1);
      if (a.do === 'trace') trace = Math.max(trace, p);
      if (a.do === 'assemble') { asm = Math.max(asm, p); if (p > 0) trace = Math.max(trace, 1); }
      if (a.do === 'build') { trace = Math.max(trace, clamp(p / 0.45)); asm = Math.max(asm, clamp((p - 0.4) / 0.6)); }
      if (a.do === 'show') { trace = Math.max(trace, p); asm = Math.max(asm, p); }
    }
    return { trace, asm, vis: 1 - hidden(n.id, t) };
  }
  function dimFactor(id, t) {
    // scenes with dim:true fade non-focus nodes; transition 0.6s at scene start
    const sc = sceneAt(t);
    const focusOf = (s) => (s && s.dim && s.camera && Array.isArray(s.camera.focus) ? s.camera.focus : null);
    const cur = focusOf(sc);
    const prev = sc.index > 0 ? focusOf(scenes[sc.index - 1]) : null;
    const k = easeInOut(prog(t, sc.start, sc.start + 0.6));
    const dimOf = (fl) => (fl ? (fl.includes(id) || (links[id] && (fl.includes(links[id].from) && fl.includes(links[id].to))) ? 1 : 0.28) : 1);
    return lerp(dimOf(prev), dimOf(cur), k);
  }

  // ---------- camera ----------
  function nodeBounds(n, t) {
    if (n.type === 'object') { const X = xformAt(n, t || 0); return (n._verts || []).map((v) => isoV(X.T(v))); }
    const [w, d, h] = n.size;
    const [x, y, z] = n.pos;
    const pts = [];
    for (const dx of [0, w]) for (const dy of [0, d]) for (const dz of [0, h]) pts.push(iso(x + dx, y + dy, z + dz));
    return pts;
  }
  function fitCamera(ids, pad, t) {
    const pts = [];
    ids.forEach((id) => { if (nodes[id]) pts.push(...nodeBounds(nodes[id], t)); });
    if (!pts.length) return { cx: 0, cy: 0, z: 1 };
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = (maxX - minX) || 1, bh = (maxY - minY) || 1;
    const usableH = H * 0.72, usableW = W * 0.86;
    const z = clamp(Math.min(usableW / (bw * pad), usableH / (bh * pad)), 0.35, 3.2);
    // shift centre so content sits a bit above the caption band
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 + (H * 0.045) / z, z };
  }
  function buildCamera() {
    camTargets = [];
    let prev = null;
    scenes.forEach((sc) => {
      const c = sc.camera || {};
      let tgt;
      if (c.focus || !prev) {
        const ids = !c.focus || c.focus === 'all' ? Object.keys(nodes) : c.focus;
        tgt = fitCamera(ids, c.pad || 1.25, sc.start + (c.fitAt || 0));
      } else tgt = Object.assign({}, prev.end);
      if (c.zoom) tgt.z = c.zoom;
      if (c.zoomMul) tgt.z *= c.zoomMul;
      if (c.offset) { const o = iso(c.offset[0], c.offset[1], c.offset[2] || 0); tgt.cx += o[0]; tgt.cy += o[1]; }
      const drift = c.drift != null ? c.drift : (SB.meta.cameraDrift != null ? SB.meta.cameraDrift : 0.05);
      const pan = c.pan ? iso(c.pan[0], c.pan[1], 0) : [0, 0];
      const entry = { start: tgt, end: { cx: tgt.cx + pan[0], cy: tgt.cy + pan[1], z: tgt.z * (1 + drift) }, ease: c.ease != null ? c.ease : 1.4,
        follow: c.follow || null, followOffset: c.followOffset || [0, 0] };
      if (c.follow && nodes[c.follow] && !c.focus) { const ft = fitCamera([c.follow], c.pad || 2.2, sc.start); if (!c.zoom) { entry.start.z = ft.z; entry.end.z = ft.z * (1 + drift); } }
      camTargets.push(entry);
      prev = entry;
    });
  }
  function baseCam(i, t) {
    const sc = scenes[i], cur = camTargets[i];
    const driftK = easeInOut(clamp((t - sc.start) / sc.duration));
    const base = {
      cx: lerp(cur.start.cx, cur.end.cx, driftK), cy: lerp(cur.start.cy, cur.end.cy, driftK),
      z: Math.exp(lerp(Math.log(cur.start.z), Math.log(cur.end.z), driftK))
    };
    if (cur.follow && nodes[cur.follow]) { // keep the moving hero object centred
      const pts = nodeBounds(nodes[cur.follow], t);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const k = SB.scenes[i].camera.followLag != null ? SB.scenes[i].camera.followLag : 1;
      const fx = (Math.min(...xs) + Math.max(...xs)) / 2, fy = (Math.min(...ys) + Math.max(...ys)) / 2 + (H * 0.04) / base.z;
      base.cx = lerp(base.cx, fx + cur.followOffset[0], k); base.cy = lerp(base.cy, fy + cur.followOffset[1], k);
    }
    return base;
  }
  function cameraAt(t) {
    const sc = sceneAt(t);
    const cur = camTargets[sc.index];
    const base = baseCam(sc.index, t);
    if (sc.index === 0 || cur.ease <= 0) return base;
    const prevEnd = baseCam(sc.index - 1, scenes[sc.index - 1].end - 1e-4);
    const k = easeInOut(prog(t, sc.start, sc.start + Math.min(cur.ease, sc.duration)));
    return {
      cx: lerp(prevEnd.cx, base.cx, k), cy: lerp(prevEnd.cy, base.cy, k),
      z: Math.exp(lerp(Math.log(prevEnd.z), Math.log(base.z), k))
    };
  }

  // ---------- primitives ----------
  // A part = {kind:'box'|'cyl'|'sphere', ...world coords, color, decor}
  function boxFaces(x, y, z, w, d, h) {
    const p = (a, b, c) => iso(a, b, c);
    return {
      top: [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)],
      right: [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)],
      left: [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)]
    };
  }
  const poly = (pts) => 'M' + pts.map(pt).join('L') + 'Z';
  function boxOutlinePaths(x, y, z, w, d, h) {
    const p = (a, b, c) => iso(a, b, c);
    const hex = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y, z), p(x + w, y + d, z), p(x, y + d, z), p(x, y + d, z + h)];
    const c = p(x + w, y + d, z + h);
    return [poly(hex), 'M' + pt(p(x + w, y, z + h)) + 'L' + pt(c) + 'L' + pt(p(x + w, y + d, z)) + 'M' + pt(c) + 'L' + pt(p(x, y + d, z + h))];
  }
  function cylGeom(cx, cy, z, r, h) {
    const top = iso(cx, cy, z + h), bot = iso(cx, cy, z);
    const rx = r * 1.2247 * U, ry = r * 0.7071 * U;
    const side = `M${f(top[0] - rx)},${f(top[1])}L${f(bot[0] - rx)},${f(bot[1])}A${f(rx)},${f(ry)} 0 0 0 ${f(bot[0] + rx)},${f(bot[1])}L${f(top[0] + rx)},${f(top[1])}Z`;
    const outline = `M${f(top[0] - rx)},${f(top[1])}L${f(bot[0] - rx)},${f(bot[1])}A${f(rx)},${f(ry)} 0 0 0 ${f(bot[0] + rx)},${f(bot[1])}L${f(top[0] + rx)},${f(top[1])}`;
    return { top, bot, rx, ry, side, outline };
  }
  const SW = () => (SB.meta.lineWidth || 2.4);

  function drawPart(part, alpha, dz, highlight) {
    const ink = P.ink;
    const stroke = highlight ? col(highlight) : ink;
    const sw = SW() * (highlight ? 1.5 : 1);
    const base = col(part.color, 'primary');
    let s = `<g opacity="${f(alpha)}">`;
    const z = part.z + dz;
    if (WIRE() && part.kind === 'box') { // x-ray wireframe look for generic blocks
      const F = boxFaces(part.x, part.y, z, part.w, part.d, part.h);
      const lc = highlight ? col(highlight) : (part.color && P[part.color] && ['teal', 'orange', 'accent', 'red'].includes(part.color) ? P[part.color] : P.line);
      const fo = part.color === 'neutral' || part.color === 'ground' ? 0.25 : 0.5;
      for (const k of ['left', 'right', 'top']) s += `<path d="${poly(F[k])}" fill="${P.fill}" fill-opacity="${fo}" stroke="${lc}" stroke-width="${f(LW(1.5))}" stroke-linejoin="round"/>`;
      if (part.decor) s += part.decor(z, lc);
      return s + '</g>';
    }
    if (part.kind === 'box') {
      const F = boxFaces(part.x, part.y, z, part.w, part.d, part.h);
      const rnd = part.round ? ' stroke-linejoin="round"' : ' stroke-linejoin="round"';
      s += `<path d="${poly(F.left)}" fill="${shade(base, 0.05)}" stroke="${stroke}" stroke-width="${sw}"${rnd}/>`;
      s += `<path d="${poly(F.right)}" fill="${shade(base, -0.22)}" stroke="${stroke}" stroke-width="${sw}"${rnd}/>`;
      s += `<path d="${poly(F.top)}" fill="${shade(base, 0.32)}" stroke="${stroke}" stroke-width="${sw}"${rnd}/>`;
    } else if (part.kind === 'cyl') {
      const g = cylGeom(part.cx, part.cy, z, part.r, part.h);
      s += `<path d="${g.side}" fill="${shade(base, -0.1)}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      s += `<path d="M${f(g.top[0] - g.rx * 0.55)},${f(g.top[1] + g.ry * 0.3)}L${f(g.bot[0] - g.rx * 0.55)},${f(g.bot[1] + g.ry * 0.82)}" stroke="${shade(base, 0.35)}" stroke-width="${f(g.rx * 0.12)}" stroke-linecap="round" opacity="0.55"/>`;
      s += `<ellipse cx="${f(g.top[0])}" cy="${f(g.top[1])}" rx="${f(g.rx)}" ry="${f(g.ry)}" fill="${shade(base, 0.3)}" stroke="${stroke}" stroke-width="${sw}"/>`;
    } else if (part.kind === 'sphere') {
      const c = iso(part.cx, part.cy, z);
      const r = part.r * U;
      s += `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" fill="${base}" stroke="${stroke}" stroke-width="${sw}"/>`;
      s += `<circle cx="${f(c[0] - r * 0.3)}" cy="${f(c[1] - r * 0.32)}" r="${f(r * 0.3)}" fill="#fff" opacity="0.45"/>`;
    }
    if (part.decor) s += part.decor(z, stroke);
    s += '</g>';
    return s;
  }
  function partOutline(part) {
    if (part.kind === 'box') return boxOutlinePaths(part.x, part.y, part.z, part.w, part.d, part.h);
    if (part.kind === 'cyl') {
      const g = cylGeom(part.cx, part.cy, part.z, part.r, part.h);
      return [g.outline, `M${f(g.top[0] - g.rx)},${f(g.top[1])}A${f(g.rx)},${f(g.ry)} 0 1 1 ${f(g.top[0] + g.rx)},${f(g.top[1])}A${f(g.rx)},${f(g.ry)} 0 1 1 ${f(g.top[0] - g.rx)},${f(g.top[1])}`];
    }
    if (part.kind === 'sphere') {
      const c = iso(part.cx, part.cy, part.z); const r = part.r * U;
      return [`M${f(c[0] - r)},${f(c[1])}A${f(r)},${f(r)} 0 1 1 ${f(c[0] + r)},${f(c[1])}A${f(r)},${f(r)} 0 1 1 ${f(c[0] - r)},${f(c[1])}`];
    }
    return [];
  }

  // text/icon painted onto the top face of a box (isometric floor plane)
  function topText(cx, cy, z, text, size, color, weight = 700, anchor = 'middle') {
    const o = iso(cx, cy, z);
    return `<g transform="matrix(${f(C30)},${f(S30)},${f(-C30)},${f(S30)},${f(o[0])},${f(o[1])})"><text x="0" y="0" font-size="${f(size)}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central" font-weight="${weight}">${esc(text)}</text></g>`;
  }
  // text on the right (x = const) face: runs along +y direction (down-left visually) — we use the left face instead
  function leftFaceText(x0, y, z0, text, size, color) { // on face y=const, runs along +x
    const o = iso(x0, y, z0);
    return `<g transform="matrix(${f(C30)},${f(S30)},0,1,${f(o[0])},${f(o[1])})"><text x="0" y="0" font-size="${f(size)}" fill="${color}" text-anchor="middle" dominant-baseline="central" font-weight="700">${esc(text)}</text></g>`;
  }
  function rightFaceLines(x, y0, z0, d, h, n, color, sw) { // horizontal lines on x=const face
    let s = '';
    for (let i = 1; i <= n; i++) {
      const zz = z0 + (h * i) / (n + 1);
      const a = iso(x, y0 + d * 0.15, zz), b = iso(x, y0 + d * 0.85, zz);
      s += `<path d="M${pt(a)}L${pt(b)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
    return s;
  }

  // ---------- node types -> parts ----------
  function nodeParts(n) {
    const [x, y, z] = n.pos, [w, d, h] = n.size;
    const color = n.color || 'primary';
    const cx = x + w / 2, cy = y + d / 2;
    const iconDecor = (zTop) => (n.icon ? topText(cx, cy, zTop, n.icon, Math.min(w, d) * U * 0.42, col(n.iconColor, 'ink')) : '');
    switch (n.type) {
      case 'platform': {
        const decor = (zz, stroke) => {
          let s = '';
          if (n.title) s += topText(x + (n.titlePos ? n.titlePos[0] : 0.5), y + (n.titlePos ? n.titlePos[1] : 0.7), zz + h, n.title, (n.titleSize || 0.55) * U, col(n.titleColor, 'ink'), 800, 'start');
          return s;
        };
        return [{ kind: 'box', x, y, z, w, d, h, color: n.color || 'ground', decor }];
      }
      case 'stack':
      case 'block': {
        const k = n.layers || 3, gap = 0.08, lh = (h - gap * (k - 1)) / k;
        return Array.from({ length: k }, (_, i) => ({
          kind: 'box', x, y, z: z + i * (lh + gap), w, d, h: lh, color,
          decor: i === k - 1 ? (zz) => iconDecor(zz + lh) : null
        }));
      }
      case 'server': {
        const k = n.layers || 3, ph = h * 0.08, gap = 0.06, uh = (h - ph - gap * k) / k;
        const parts = [{ kind: 'box', x: x - 0.1, y: y - 0.1, z, w: w + 0.2, d: d + 0.2, h: ph, color: 'neutral' }];
        for (let i = 0; i < k; i++) {
          const zz0 = z + ph + gap + i * (uh + gap);
          parts.push({
            kind: 'box', x, y, z: zz0, w, d, h: uh, color,
            decor: (zz, stroke) => {
              let s = rightFaceLines(x + w, y, zz, d * 0.7, uh, 2, stroke, SW() * 0.8);
              const led = iso(x + w, y + d * 0.84, zz + uh / 2);
              s += `<circle cx="${f(led[0])}" cy="${f(led[1])}" r="${f(U * 0.09)}" fill="${P.success}" stroke="${stroke}" stroke-width="1"/>`;
              if (i === k - 1) s += iconDecor(zz + uh);
              return s;
            }
          });
        }
        return parts;
      }
      case 'database': {
        const k = n.layers || 3, r = Math.min(w, d) / 2, gap = 0.1, dh = (h - gap * (k - 1)) / k;
        return Array.from({ length: k }, (_, i) => ({
          kind: 'cyl', cx, cy, z: z + i * (dh + gap), r, h: dh, color,
          decor: i === k - 1 ? (zz) => iconDecor(zz + dh) : null
        }));
      }
      case 'cylinder':
        return [{ kind: 'cyl', cx, cy, z, r: Math.min(w, d) / 2, h, color, decor: (zz) => iconDecor(zz + h) }];
      case 'screen': {
        const baseH = 0.12;
        return [
          { kind: 'box', x: x + w * 0.25, y: y + d * 0.3, z, w: w * 0.5, d: d * 0.4, h: baseH, color: 'neutral' },
          { kind: 'box', x: x + w * 0.42, y: y + d * 0.45, z: z + baseH, w: w * 0.16, d: d * 0.1, h: h * 0.3, color: 'neutral' },
          {
            kind: 'box', x: x + w * 0.35, y, z: z + h * 0.3, w: w * 0.18, d, h: h * 0.7, color,
            decor: (zz, stroke) => {
              // glass panel + content lines on the visible x-face
              const xf = x + w * 0.53, ph = h * 0.7;
              const g = [iso(xf, y + d * 0.08, zz + ph * 0.1), iso(xf, y + d * 0.92, zz + ph * 0.1), iso(xf, y + d * 0.92, zz + ph * 0.9), iso(xf, y + d * 0.08, zz + ph * 0.9)];
              let s = `<path d="${poly(g)}" fill="${shade(P.bg, 0.15)}" stroke="${stroke}" stroke-width="${SW() * 0.7}"/>`;
              s += rightFaceLines(xf, y + d * 0.1, zz + ph * 0.1, d * 0.6, ph * 0.8, 3, col(n.accent, 'accent'), SW() * 1.2);
              return s;
            }
          }
        ];
      }
      case 'document':
      case 'doc': {
        const k = n.layers || 3, th = 0.07;
        return Array.from({ length: k }, (_, i) => ({
          kind: 'box', x: x + i * 0.12, y: y - i * 0.12, z: z + i * (th + 0.04), w, d, h: th, color: n.color || '#ffffff',
          decor: i === k - 1 ? (zz, stroke) => {
            let s = '';
            for (let j = 0; j < 4; j++) {
              const yy = y - i * 0.12 + d * (0.22 + j * 0.18);
              const a = iso(x + i * 0.12 + w * 0.18, yy, zz + th), b = iso(x + i * 0.12 + w * (j === 3 ? 0.55 : 0.82), yy, zz + th);
              s += `<path d="M${pt(a)}L${pt(b)}" stroke="${col(n.accent, 'ghost')}" stroke-width="${SW()}" stroke-linecap="round"/>`;
            }
            return s;
          } : null
        }));
      }
      case 'person': {
        const r = Math.min(w, d) * 0.32;
        return [
          { kind: 'cyl', cx, cy, z, r, h: h * 0.58, color },
          { kind: 'sphere', cx, cy, z: z + h * 0.58 + r * 0.95, r: r * 0.85, color: n.headColor || '#ffd6a5' }
        ];
      }
      case 'cloud': {
        const r = Math.min(w, d) / 2;
        const base = { kind: 'cyl', cx, cy, z, r, h: h * 0.25, color };
        const puffs = [[-0.35, 0.3, 0.55], [0.3, -0.3, 0.55], [0, 0, 0.75], [0.35, 0.35, 0.45]].map(([dx, dy, rr]) => ({
          kind: 'sphere', cx: cx + dx * r, cy: cy + dy * r, z: z + h * 0.25 + rr * r * 0.55, r: rr * r * 0.75, color
        }));
        if (n.icon) puffs[2].decor = (zz) => { const c = iso(cx, cy, zz); return `<text x="${f(c[0])}" y="${f(c[1])}" font-size="${f(r * U * 0.5)}" text-anchor="middle" dominant-baseline="central">${esc(n.icon)}</text>`; };
        return [base, ...puffs];
      }
      case 'chip': {
        const parts = [{ kind: 'box', x, y, z, w, d, h: h * 0.6, color: n.color || 'neutral' }];
        parts.push({ kind: 'box', x: x + w * 0.22, y: y + d * 0.22, z: z + h * 0.6, w: w * 0.56, d: d * 0.56, h: h * 0.4, color: n.accent || 'accent', decor: (zz) => iconDecor(zz + h * 0.4) });
        return parts;
      }
      case 'ai':
      case 'model': {
        const bh = h * 0.55, r = Math.min(w, d) * 0.3;
        return [
          { kind: 'box', x, y, z, w, d, h: bh * 0.35, color: 'neutral' },
          { kind: 'box', x: x + 0.12, y: y + 0.12, z: z + bh * 0.35, w: w - 0.24, d: d - 0.24, h: bh * 0.65, color, decor: (zz, stroke) => rightFaceLines(x + w - 0.12, y + 0.12, zz, d - 0.24, bh * 0.65, 2, stroke, SW() * 0.8) },
          { kind: 'sphere', cx, cy, z: z + bh + r * 1.25, r, color: n.accent || 'accent', decor: (zz) => n.icon ? (() => { const c = iso(cx, cy, zz); return `<text x="${f(c[0])}" y="${f(c[1])}" font-size="${f(r * U * 1.0)}" text-anchor="middle" dominant-baseline="central">${esc(n.icon)}</text>`; })() : '' }
        ];
      }
      case 'gate': // a portal/arch: two pillars + lintel
        return [
          { kind: 'box', x, y, z, w: w * 0.25, d, h, color },
          { kind: 'box', x: x + w * 0.75, y, z, w: w * 0.25, d, h, color },
          { kind: 'box', x, y, z: z + h, w, d, h: h * 0.2, color: n.accent || 'accent', decor: (zz) => iconDecor(zz + h * 0.2) }
        ];
      default: // 'box'
        return [{ kind: 'box', x, y, z, w, d, h, color, decor: (zz) => iconDecor(zz + h) }];
    }
  }

  // ---------- links ----------
  function linkPoints(l) {
    const A = nodes[l.from], B = nodes[l.to];
    const ca = [A.pos[0] + A.size[0] / 2, A.pos[1] + A.size[1] / 2];
    const cb = [B.pos[0] + B.size[0] / 2, B.pos[1] + B.size[1] / 2];
    const z = l.z != null ? l.z : Math.max(A.pos[2], B.pos[2]) + 0.04;
    const gap = l.gap != null ? l.gap : 0.25;
    const route = l.route || 'xy';
    const exitA = (dir) => [ca[0] + dir[0] * (A.size[0] / 2 + gap), ca[1] + dir[1] * (A.size[1] / 2 + gap)];
    const enterB = (dir) => [cb[0] - dir[0] * (B.size[0] / 2 + gap), cb[1] - dir[1] * (B.size[1] / 2 + gap)];
    const sgn = (v) => (v >= 0 ? 1 : -1);
    let pts;
    if (route === 'arc') {
      const dx = cb[0] - ca[0], dy = cb[1] - ca[1], L = Math.hypot(dx, dy) || 1;
      const dir = [dx / L, dy / L];
      const a = [ca[0] + dir[0] * (Math.max(A.size[0], A.size[1]) / 2 * 0.6), ca[1] + dir[1] * (Math.max(A.size[0], A.size[1]) / 2 * 0.6)];
      const b = [cb[0] - dir[0] * (Math.max(B.size[0], B.size[1]) / 2 * 0.6), cb[1] - dir[1] * (Math.max(B.size[0], B.size[1]) / 2 * 0.6)];
      const za = A.pos[2] + A.size[2] + 0.1, zb = B.pos[2] + B.size[2] + 0.1;
      const peak = Math.max(za, zb) + (l.height != null ? l.height : L * 0.35);
      pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), (1 - t) * (1 - t) * za + 2 * (1 - t) * t * peak + t * t * zb]);
      }
      return pts;
    }
    if (route === 'direct' || (Math.abs(ca[0] - cb[0]) < 0.01 || Math.abs(ca[1] - cb[1]) < 0.01)) {
      const dx = cb[0] - ca[0], dy = cb[1] - ca[1];
      if (Math.abs(dy) < 0.01) { pts = [exitA([sgn(dx), 0]), enterB([sgn(dx), 0])]; }
      else if (Math.abs(dx) < 0.01) { pts = [exitA([0, sgn(dy)]), enterB([0, sgn(dy)])]; }
      else {
        const L = Math.hypot(dx, dy), dir = [dx / L, dy / L];
        const ra = Math.min(A.size[0], A.size[1]) / 2 + gap, rb = Math.min(B.size[0], B.size[1]) / 2 + gap;
        pts = [[ca[0] + dir[0] * ra, ca[1] + dir[1] * ra], [cb[0] - dir[0] * rb, cb[1] - dir[1] * rb]];
      }
    } else if (route === 'xy') {
      const d1 = [sgn(cb[0] - ca[0]), 0], d2 = [0, sgn(cb[1] - ca[1])];
      pts = [exitA(d1), [cb[0], ca[1]], enterB(d2)];
    } else { // 'yx'
      const d1 = [0, sgn(cb[1] - ca[1])], d2 = [sgn(cb[0] - ca[0]), 0];
      pts = [exitA(d1), [ca[0], cb[1]], enterB(d2)];
    }
    if (l.via) pts = [pts[0], ...l.via, pts[pts.length - 1]];
    return pts.map((p) => [p[0], p[1], p[2] != null ? p[2] : z]);
  }
  function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return L; }
  function pointAt(pts, s) {
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      if (s <= seg || i === pts.length - 1) {
        const k = seg ? clamp(s / seg) : 0;
        return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k), lerp(pts[i - 1][2], pts[i][2], k)];
      }
      s -= seg;
    }
    return pts[pts.length - 1];
  }
  function linkProgress(l, t) {
    if (l.initial === 'visible') return 1 - hidden(l.id, t);
    let p = 0;
    for (const a of acts[l.id] || []) {
      if (a.do === 'link' || a.do === 'trace' || a.do === 'build' || a.do === 'show') p = Math.max(p, prog(t, a.t0, a.t1));
      if (a.do === 'flow') p = Math.max(p, prog(t, a.t0, a.t0 + 0.6)); // flow implies the pipe exists
    }
    return easeInOut(p) * (1 - hidden(l.id, t));
  }
  function drawLink(l, t) {
    const p = linkProgress(l, t);
    if (p <= 0.001) return { under: '', over: '' };
    const pts = linkPoints(l).map((q) => iso(q[0], q[1], q[2]));
    const d = 'M' + pts.map(pt).join('L');
    const c = col(l.color, 'secondary');
    const dim = dimFactor(l.id, t);
    const flowing = (acts[l.id] || []).some((a) => a.do === 'flow' && t >= a.t0 && t <= a.t1);
    const dash = `pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - p)}"`;
    let s = `<g opacity="${f(dim)}">`;
    s += `<path d="${d}" fill="none" stroke="${P.ink}" stroke-width="${f(l.width || 9)}" stroke-linecap="round" stroke-linejoin="round" ${dash}/>`;
    s += `<path d="${d}" fill="none" stroke="${flowing ? shade(c, 0.25) : c}" stroke-width="${f((l.width || 9) - 4.5)}" stroke-linecap="round" stroke-linejoin="round" ${dash}/>`;
    if (l.style === 'dashed') s += `<path d="${d}" fill="none" stroke="${P.bg}" stroke-width="2" stroke-dasharray="6 8" opacity="${f(p)}"/>`;
    // arrowhead
    if (p > 0.92 && l.arrow !== false) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const L = 16, Wd = 9;
      const tip = [b[0] + Math.cos(ang) * 6, b[1] + Math.sin(ang) * 6];
      const l1 = [tip[0] - Math.cos(ang) * L + Math.cos(ang + Math.PI / 2) * Wd, tip[1] - Math.sin(ang) * L + Math.sin(ang + Math.PI / 2) * Wd];
      const l2 = [tip[0] - Math.cos(ang) * L - Math.cos(ang + Math.PI / 2) * Wd, tip[1] - Math.sin(ang) * L - Math.sin(ang + Math.PI / 2) * Wd];
      s += `<path d="M${pt(tip)}L${pt(l1)}L${pt(l2)}Z" fill="${c}" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round" opacity="${f(clamp((p - 0.92) / 0.08))}"/>`;
    }
    s += '</g>';
    return { under: s, over: drawFlow(l, t, dim) };
  }
  function drawFlow(l, t, dim) {
    let s = '';
    for (const a of acts[l.id] || []) {
      if (a.do !== 'flow' || t < a.t0) continue;
      const wpts = linkPoints(l);
      const L = polyLen(wpts);
      const speed = a.speed || Math.max(L / 1.4, 2.2); // world units per second
      const gap = a.gap || (L / speed) / (a.particles || 3);
      const kind = a.particle || 'dot';
      const c = col(a.color, 'accent');
      const tEnd = Math.min(a.t1, total);
      const kMax = Math.floor((Math.min(t, tEnd) - a.t0) / gap);
      for (let k = Math.max(0, kMax - 60); k <= kMax; k++) {
        const e = a.t0 + k * gap;
        const sPos = (t - e) * speed;
        if (sPos < 0 || sPos > L) continue;
        const q = pointAt(wpts, sPos);
        const fade = clamp(sPos / 0.4) * clamp((L - sPos) / 0.5);
        const lift = kind === 'cube' ? 0.05 : 0.18;
        const sp = iso(q[0], q[1], q[2] + lift);
        s += `<g opacity="${f(fade * dim)}">`;
        if (kind === 'cube') {
          const sz = a.size || 0.42;
          s += drawPart({ kind: 'box', x: q[0] - sz / 2, y: q[1] - sz / 2, z: q[2] + 0.05, w: sz, d: sz, h: sz, color: a.color || 'accent' }, 1, 0, null);
        } else {
          s += `<circle cx="${f(sp[0])}" cy="${f(sp[1])}" r="${f(a.size ? a.size * U : 13)}" fill="${c}" opacity="0.28"/>`;
          s += `<circle cx="${f(sp[0])}" cy="${f(sp[1])}" r="${f(a.size ? a.size * U * 0.5 : 6.5)}" fill="${c}" stroke="${P.ink}" stroke-width="1.6"/>`;
        }
        if (a.text) {
          const tp = iso(q[0], q[1], q[2] + (kind === 'cube' ? (a.size || 0.42) + 0.15 : 0.2));
          const tw = textWidth(a.text, 15) + 16;
          s += `<g transform="translate(${f(tp[0])},${f(tp[1] - 22)})"><rect x="${f(-tw / 2)}" y="-13" width="${f(tw)}" height="26" rx="13" fill="${c}" stroke="${P.ink}" stroke-width="1.6"/><text x="0" y="1" font-size="15" font-weight="700" fill="${P.ink === '#e6f1ff' || P.ink === '#fff4e6' ? '#111' : P.ink}" text-anchor="middle" dominant-baseline="central">${esc(a.text)}</text></g>`;
        }
        s += '</g>';
      }
    }
    return s;
  }
  function textWidth(s, size) { // rough width estimate; CJK = 1em, latin ≈ .58em
    let w = 0;
    for (const ch of String(s)) w += /[⺀-￿]/.test(ch) ? size : size * 0.6;
    return w;
  }

  // ---------- highlight / labels / callouts ----------
  function drawHighlight(n, t) {
    let s = '';
    for (const a of acts[n.id] || []) {
      if (a.do !== 'highlight' || t < a.t0 || t > a.t1 + 0.5) continue;
      const fade = clamp((t - a.t0) / 0.3) * clamp((a.t1 + 0.5 - t) / 0.5);
      const [x, y, z] = n.pos, [w, d] = n.size;
      const c = col(a.color, 'glow');
      for (let k = 0; k < 2; k++) {
        const ph = (((t - a.t0) / 1.2) + k * 0.5) % 1;
        const m = 0.25 + ph * 0.9;
        const quad = [iso(x - m, y - m, z), iso(x + w + m, y - m, z), iso(x + w + m, y + d + m, z), iso(x - m, y + d + m, z)];
        s += `<path d="${poly(quad)}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" opacity="${f(fade * (1 - ph))}"/>`;
      }
      const quad0 = [iso(x - 0.2, y - 0.2, z), iso(x + w + 0.2, y - 0.2, z), iso(x + w + 0.2, y + d + 0.2, z), iso(x - 0.2, y + d + 0.2, z)];
      s += `<path d="${poly(quad0)}" fill="${c}" opacity="${f(0.22 * fade)}"/>`;
    }
    return s;
  }
  function highlightActive(n, t) {
    for (const a of acts[n.id] || []) if (a.do === 'highlight' && t >= a.t0 && t <= a.t1) return a.color || 'glow';
    return null;
  }
  function screenOf(world, cam) {
    const p = iso(world[0], world[1], world[2]);
    return [(p[0] - cam.cx) * cam.z + W / 2, (p[1] - cam.cy) * cam.z + H / 2];
  }
  function drawLabels(t, cam) {
    let s = '';
    const fs = SB.meta.labelSize || 22;
    for (const id in nodes) {
      const n = nodes[id];
      if (!n.label || n.type === 'platform' || n.type === 'object') continue;
      const st = nodeState(n, t);
      let a = clamp((Math.max(st.asm, st.trace * 0.6) - 0.5) / 0.4);
      for (const ac of acts[id] || []) if (ac.do === 'label') a = Math.max(a, prog(t, ac.t0, ac.t1));
      if (n.labelHidden && !(acts[id] || []).some((ac) => ac.do === 'label' && t >= ac.t0)) a = 0;
      a *= st.vis * dimFactor(id, t);
      if (a <= 0.01) continue;
      const [x, y, z] = n.pos, [w, d, h] = n.size;
      const top = screenOf([x + w / 2, y + d / 2, z + h + (n.type === 'person' || n.type === 'ai' || n.type === 'model' ? 0.6 : 0)], cam);
      const rise = 46 + (1 - easeOut(a)) * 10;
      const text = (n.step != null ? '' : '') + n.label;
      const tw = textWidth(text, fs) + 28 + (n.step != null ? fs + 8 : 0);
      const ly = top[1] - rise;
      s += `<g opacity="${f(a)}">`;
      s += `<path d="M${f(top[0])},${f(top[1] - 6)}L${f(top[0])},${f(ly + 18)}" stroke="${P.ink}" stroke-width="2" stroke-dasharray="3 4"/>`;
      s += `<circle cx="${f(top[0])}" cy="${f(top[1] - 6)}" r="4" fill="${P.ink}"/>`;
      s += `<rect x="${f(top[0] - tw / 2)}" y="${f(ly - 18)}" width="${f(tw)}" height="36" rx="18" fill="${P.labelBg}" stroke="${P.ink}" stroke-width="2"/>`;
      let tx = top[0];
      if (n.step != null) {
        const bx = top[0] - tw / 2 + 18 + fs / 2 - 4;
        s += `<circle cx="${f(bx)}" cy="${f(ly)}" r="${f(fs / 2 + 2)}" fill="${col(n.color, 'primary')}" stroke="${P.ink}" stroke-width="1.5"/>`;
        s += `<text x="${f(bx)}" y="${f(ly + 1)}" font-size="${f(fs * 0.7)}" font-weight="800" fill="${P.ink}" text-anchor="middle" dominant-baseline="central">${esc(n.step)}</text>`;
        tx += (fs + 8) / 2;
      }
      s += `<text x="${f(tx)}" y="${f(ly + 1)}" font-size="${fs}" font-weight="700" fill="${P.labelText}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
      s += '</g>';
    }
    // link labels
    for (const id in links) {
      const l = links[id];
      if (!l.label) continue;
      const p = linkProgress(l, t);
      const a = clamp((p - 0.7) / 0.3) * dimFactor(id, t);
      if (a <= 0.01) continue;
      const wp = linkPoints(l); const mid = pointAt(wp, polyLen(wp) / 2);
      const sp = screenOf([mid[0], mid[1], mid[2] + 0.1], cam);
      const tw = textWidth(l.label, fs * 0.8) + 18;
      s += `<g opacity="${f(a)}"><rect x="${f(sp[0] - tw / 2)}" y="${f(sp[1] - 34)}" width="${f(tw)}" height="28" rx="6" fill="${col(l.color, 'secondary')}" stroke="${P.ink}" stroke-width="1.8"/><text x="${f(sp[0])}" y="${f(sp[1] - 19)}" font-size="${f(fs * 0.8)}" font-weight="700" fill="#111" text-anchor="middle" dominant-baseline="central">${esc(l.label)}</text></g>`;
    }
    return s;
  }
  function drawCallouts(t, cam) {
    let s = '';
    const fs = (SB.meta.labelSize || 22) * 0.92;
    for (const id in acts) {
      for (const a of acts[id]) {
        if (a.do !== 'callout' || t < a.t0 || t > a.t1 + 0.4) continue;
        const n = nodes[id] || null; if (!n) continue;
        const k = easeOutBack(clamp((t - a.t0) / 0.45)) * clamp((a.t1 + 0.4 - t) / 0.4);
        const [x, y, z] = n.pos, [w, d, h] = n.size;
        const anchor = screenOf([x + w / 2, y + d / 2, z + h * 0.6], cam);
        const side = a.side === 'left' ? -1 : 1;
        const lines = String(a.text).split('\n');
        const tw = Math.max(...lines.map((ln) => textWidth(ln, fs))) + 36;
        const th = lines.length * fs * 1.35 + 24;
        const bx = anchor[0] + side * (Math.max(w, d) * U * cam.z * 0.6 + 70) - (side < 0 ? tw : 0);
        const by = anchor[1] - th - 40;
        const cxp = side > 0 ? bx : bx + tw;
        s += `<g opacity="${f(clamp(k))}" transform="translate(${f(anchor[0])},${f(anchor[1])}) scale(${f(Math.max(0.01, k))}) translate(${f(-anchor[0])},${f(-anchor[1])})">`;
        s += `<path d="M${f(anchor[0])},${f(anchor[1])}L${f(cxp)},${f(by + th - 14)}" stroke="${P.ink}" stroke-width="2.4"/>`;
        s += `<circle cx="${f(anchor[0])}" cy="${f(anchor[1])}" r="6" fill="${col(a.color, 'accent')}" stroke="${P.ink}" stroke-width="2"/>`;
        s += `<rect x="${f(bx)}" y="${f(by)}" width="${f(tw)}" height="${f(th)}" rx="12" fill="${P.labelBg}" stroke="${P.ink}" stroke-width="2.4"/>`;
        s += `<rect x="${f(bx)}" y="${f(by)}" width="8" height="${f(th)}" rx="4" fill="${col(a.color, 'accent')}"/>`;
        lines.forEach((ln, i) => {
          s += `<text x="${f(bx + 22)}" y="${f(by + 12 + fs * 0.68 + i * fs * 1.35)}" font-size="${f(fs)}" font-weight="${i === 0 ? 800 : 500}" fill="${P.labelText}" dominant-baseline="central">${esc(ln)}</text>`;
        });
        s += '</g>';
      }
    }
    return s;
  }

  // =====================================================================
  // OBJECTS — mesh-based hero objects (x-ray wireframe), with motion
  // =====================================================================
  const WIRE = () => SB.meta.style === 'wire';
  let CAMZ = 1;                                    // current camera zoom (for constant screen-space strokes)
  const LW = (px) => px / CAMZ;                    // screen px -> world-svg units
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
  };
  const VIEW = V.norm([1, 1, 1]);                  // direction towards the viewer
  const isoV = (p) => iso(p[0], p[1], p[2]);
  const depth = (p) => p[0] + p[1] + p[2];
  const EASE = { linear: (x) => x, inOut: easeInOut, out: easeOut, in: (x) => x * x * x, back: easeOutBack };
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function rotM(rot) { // rot = [roll(x), pitch(y), yaw(z)] degrees; R = Rz * Ry * Rx
    const [a, b, c] = rot.map((d) => (d * Math.PI) / 180);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    return [
      [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
      [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
      [-sb, cb * sa, cb * ca]
    ];
  }
  const mulM = (m, v) => [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];

  // motion state of an object at time t (pos + rot), driven by `move` actions
  function motionAt(n, t) {
    let pos = n.pos.slice(), rot = (n.rot || [0, 0, 0]).slice();
    const moves = (acts[n.id] || []).filter((a) => a.do === 'move' && t >= a.t0).sort((a, b) => a.t0 - b.t0);
    for (const a of moves) {
      const k = (EASE[a.ease] || easeInOut)(prog(t, a.t0, a.t1));
      const p0 = pos.slice(), r0 = rot.slice();
      const pT = a.to ? a.to : (a.by ? V.add(p0, a.by) : p0);
      const rT = a.rot ? a.rot : (a.rotBy ? V.add(r0, a.rotBy) : r0);
      pos = V.lerp(p0, pT, k);
      if (a.arc) pos[2] += a.arc * Math.sin(Math.PI * k);
      rot = V.lerp(r0, rT, k);
    }
    return { pos, rot };
  }
  function xformAt(n, t) {
    const m = motionAt(n, t), R = rotM(m.rot), pv = n.pivot || n._center || [0, 0, 0];
    return { T: (p) => V.add(V.add(m.pos, mulM(R, V.sub(p, pv))), pv), R: (v) => mulM(R, v), pos: m.pos };
  }

  // profile helper: entries are [u,v] or {"arc":[cu,cv,r,deg0,deg1,steps]}
  function expandProfile(prof) {
    const out = [];
    for (const e of prof) {
      if (Array.isArray(e)) out.push(e);
      else if (e.arc) {
        const [cu, cv, r, d0, d1, st] = e.arc; const n = st || 16;
        for (let i = 0; i <= n; i++) { const a = ((d0 + ((d1 - d0) * i) / n) * Math.PI) / 180; out.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]); }
      }
    }
    return out;
  }
  const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  function planeMap(plane) { // returns (u,v,w) -> local xyz
    if (plane === 'xy') return (u, v, w) => [u, v, w];
    if (plane === 'yz') return (u, v, w) => [w, u, v];
    return (u, v, w) => [u, w, v]; // 'xz' (default): profile in x/z, extruded along y
  }
  function ringPts(c, axis, r, n, phase = 0) {
    const a = V.norm(axis);
    const e1 = V.norm(Math.abs(a[2]) < 0.9 ? V.cross(a, [0, 0, 1]) : V.cross(a, [1, 0, 0]));
    const e2 = V.cross(a, e1);
    const out = [];
    for (let i = 0; i < n; i++) { const th = phase + (i / n) * Math.PI * 2; out.push(V.add(c, V.add(V.mul(e1, r * Math.cos(th)), V.mul(e2, r * Math.sin(th))))); }
    return out;
  }
  // Build world-space geometry for one part: {faces:[{pts,fill,op}], edges:[{pts,closed}]}
  function partGeom(part, X, t, off) {
    const T = (p) => X.T(V.add(p, off)), R = X.R;
    const g = { faces: [], edges: [] };
    const sh = part.shape || 'box';
    if (sh === 'box') {
      const [x, y, z] = part.at || [0, 0, 0], [w, d, h] = part.size || [1, 1, 1];
      const c = [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]].map(T);
      [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((f) => g.faces.push({ pts: f.map((i) => c[i]) }));
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach((e) => g.edges.push({ pts: [c[e[0]], c[e[1]]] }));
    } else if (sh === 'cyl' || sh === 'fan' || sh === 'wheel') {
      const base = T(part.at || [0, 0, 0]); const ax = V.norm(R(AX[part.axis || 'z'] || part.axis));
      const h = part.h != null ? part.h : (sh === 'cyl' ? 1 : 0.15), r = part.r || 0.5, n = part.segments || 28;
      const top = V.add(base, V.mul(ax, h));
      const r0 = ringPts(base, ax, r, n), r1 = ringPts(top, ax, r, n);
      g.faces.push({ pts: r0 }); g.faces.push({ pts: r1 });
      for (let i = 0; i < n; i++) g.faces.push({ pts: [r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]], side: true });
      g.edges.push({ pts: r0, closed: true }); if (h > 0.02) g.edges.push({ pts: r1, closed: true });
      // silhouette lines (perpendicular to the view)
      let u = V.sub(VIEW, V.mul(ax, V.dot(VIEW, ax)));
      if (Math.hypot(...u) > 1e-3 && h > 0.02) {
        const s = V.mul(V.norm(V.cross(ax, V.norm(u))), r);
        g.edges.push({ pts: [V.add(base, s), V.add(top, s)] }); g.edges.push({ pts: [V.sub(base, s), V.sub(top, s)] });
      }
      if (sh === 'fan' || sh === 'wheel') { // hub + blades/spokes, spinning
        const blades = part.blades || (sh === 'fan' ? 5 : 6), spin = (part.spin || 0) * (t - (part._t0 || 0)) * Math.PI * 2;
        const mid = V.add(base, V.mul(ax, h / 2));
        const hub = ringPts(mid, ax, r * 0.18, 14);
        g.edges.push({ pts: hub, closed: true, minor: true });
        const tips = ringPts(mid, ax, r * 0.88, blades, spin), roots = ringPts(mid, ax, r * 0.18, blades, spin);
        for (let i = 0; i < blades; i++) g.edges.push({ pts: [roots[i], tips[i]], minor: true });
        if (sh === 'wheel') g.edges.push({ pts: ringPts(mid, ax, r * 0.62, 24), closed: true, minor: true });
      }
    } else if (sh === 'extrude') {
      const prof = expandProfile(part.profile || []), M = planeMap(part.plane || 'xz');
      const [w0, w1] = part.span || [0, 1];
      const A = prof.map(([u, v]) => T(M(u, v, w0))), B = prof.map(([u, v]) => T(M(u, v, w1)));
      const n = prof.length, closed = !part.open;
      if (closed) { g.faces.push({ pts: A }); g.faces.push({ pts: B }); }
      for (let i = 0; i < (closed ? n : n - 1); i++) { const j = (i + 1) % n; g.faces.push({ pts: [A[i], A[j], B[j], B[i]], side: true, idx: i }); }
      g.edges.push({ pts: A, closed }); g.edges.push({ pts: B, closed });
      const every = part.ribs || 1;
      for (let i = 0; i < n; i++) if (part.open ? (i === 0 || i === n - 1 || i % every === 0) : true) g.edges.push({ pts: [A[i], B[i]], minor: part.open && i % every === 0 && i !== 0 && i !== n - 1 });
      if (part.glassFaces) part.glassFaces.forEach((i) => { const f = g.faces.find((q) => q.idx === i); if (f) f.glass = true; });
    } else if (sh === 'line') {
      g.edges.push({ pts: (part.points || []).map(T), closed: !!part.closed, dashed: part.dashed });
    } else if (sh === 'quad') { // a flat panel given by 4 points (glass windows, skirts...)
      const q = (part.points || []).map(T);
      g.faces.push({ pts: q, glass: part.style === 'glass' }); g.edges.push({ pts: q, closed: true });
    }
    return g;
  }
  function objectParts(n) { return n.parts || []; }
  function partProgress(n, part, t, base) {
    // parts with a `group` that some action targets appear on their own schedule
    const gid = part.group ? n.id + '.' + part.group : null;
    if (gid && (acts[gid] || []).some((a) => ['trace', 'build', 'assemble', 'show'].includes(a.do))) {
      let tr = 0, asm = 0;
      for (const a of acts[gid]) {
        const p = prog(t, a.t0, a.t1);
        if (a.do === 'trace' || a.do === 'build' || a.do === 'show') tr = Math.max(tr, p);
        if (a.do === 'assemble') { asm = Math.max(asm, p); tr = Math.max(tr, p); }
      }
      return { trace: tr, asm, own: true, vis: 1 - hidden(gid, t) };
    }
    return { trace: base.trace, asm: 1, own: false, vis: 1 };
  }
  function objectCenter(n) {
    const pts = [];
    for (const part of objectParts(n)) {
      const g = partGeom(part, { T: (p) => p, R: (v) => v }, 0, [0, 0, 0]);
      g.faces.forEach((f) => pts.push(...f.pts)); g.edges.forEach((e) => pts.push(...e.pts));
    }
    if (!pts.length) return { c: [0, 0, 0], min: [0, 0, 0], max: [1, 1, 1] };
    n._verts = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 400)) === 0); // real silhouette points for camera framing
    const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))), max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
    return { c: V.mul(V.add(min, max), 0.5), min, max };
  }
  function objectWorldCorners(n, t) {
    const X = xformAt(n, t), b = n._bb, out = [];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push(X.T([x, y, z]));
    return out;
  }
  function anchorLocal(n, a) { return Array.isArray(a) ? a : (n.anchors && n.anchors[a]) || n._center; }

  function faceStyle(part, face) {
    const style = face.glass ? 'glass' : (part.style || 'body');
    const c = col(part.color, style === 'hatch' ? 'teal' : 'line');
    if (style === 'none') return null;
    if (style === 'glass') return { fill: P.glass || '#2b4aa8', op: part.opacity != null ? part.opacity : 0.42 };
    if (style === 'hatch') return { fill: `url(#hatch-${(part.color || 'teal').replace('#', '')})`, op: 0.9, tint: c };
    if (style === 'solid') return { fill: col(part.fill, 'fill'), op: 0.92 };
    return { fill: col(part.fill, 'fill'), op: part.opacity != null ? part.opacity : 0.5 };
  }

  function drawObject(n, t) {
    const st = nodeState(n, t);
    const vis = st.vis * dimFactor(n.id, t);
    if (vis <= 0.001) return '';
    const X = xformAt(n, t);
    const hlNode = highlightActive(n, t);
    const items = [];
    const parts = objectParts(n);
    // global edge counter so the tracing runs edge after edge through the whole object
    let edgeTotal = 0; const geoms = [];
    parts.forEach((part, pi) => {
      const pp = partProgress(n, part, t, st);
      if (pp.trace <= 0.001) { geoms.push(null); return; }
      const off = pp.asm < 1 && pp.own && part.drop !== 0 ? V.mul(part.dropDir || [0, 0, 1], (1 - easeOutBack(pp.asm)) * (part.drop || 1.2)) : [0, 0, 0];
      part._t0 = 0;
      const g = partGeom(part, X, t, off);
      geoms.push({ g, pp, part });
      if (!pp.own) edgeTotal += g.edges.length;
    });
    let edgeIdx = 0;
    geoms.forEach((G) => {
      if (!G) return;
      const { g, pp, part } = G;
      const gid = part.group ? n.id + '.' + part.group : null;
      const hl = (gid && highlightActive({ id: gid }, t)) || hlNode;
      const lineC = hl ? col(hl) : col(part.line || part.color, part.style === 'hatch' ? 'teal' : 'line');
      const alpha = (part.alpha != null ? part.alpha : 1) * pp.vis;
      const fillK = clamp((pp.trace - 0.55) / 0.45);
      g.faces.forEach((fc) => {
        const st2 = faceStyle(part, fc); if (!st2 || fillK <= 0) return;
        items.push({ d: depth(V.mul(fc.pts.reduce((a, b) => V.add(a, b), [0, 0, 0]), 1 / fc.pts.length)) - (fc.side ? 0 : 0.001),
          s: `<path d="${poly(fc.pts.map(isoV))}" fill="${st2.fill}" fill-opacity="${f(st2.op * fillK * alpha)}" stroke="none"/>` });
      });
      const n2 = g.edges.length;
      g.edges.forEach((e, k) => {
        let p;
        if (pp.own) p = clamp((pp.trace - (k / Math.max(1, n2)) * 0.6) / 0.4);
        else { p = clamp((pp.trace - (edgeIdx / Math.max(1, edgeTotal)) * 0.7) / 0.3); edgeIdx++; }
        if (p <= 0) return;
        const pts = e.pts.map(isoV); const d = 'M' + pts.map(pt).join('L') + (e.closed ? 'Z' : '');
        const w = LW((part.width || (e.minor ? 1.0 : 1.6)) * (hl ? 1.6 : 1));
        const dash = e.dashed ? `stroke-dasharray="${f(LW(5))} ${f(LW(6))}" opacity="${f(alpha * 0.8)}"` : (p < 1 ? `pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - p)}"` : '');
        items.push({ d: depth(V.mul(e.pts.reduce((a, b) => V.add(a, b), [0, 0, 0]), 1 / e.pts.length)) + 0.002,
          s: `<path d="${d}" fill="none" stroke="${lineC}" stroke-opacity="${f(alpha * (e.minor ? 0.75 : 1))}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round" ${dash}${hl ? ' filter="url(#glow)"' : ''}/>` });
      });
    });
    items.sort((a, b) => a.d - b.d);
    let s = `<g opacity="${f(vis)}">`;
    // soft ground shadow
    if (n.shadow !== false && st.trace > 0.3) {
      const gz = n.ground != null ? n.ground : 0;
      const cs = objectWorldCorners(n, t);
      const minZ = Math.min(...cs.map((c) => c[2]));
      const lift = Math.max(0, minZ - gz);
      const fade = clamp((st.trace - 0.3) / 0.5) * clamp(1 - lift / 6);
      if (fade > 0.01) {
        const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const q = [[x0, y0, gz], [x1, y0, gz], [x1, y1, gz], [x0, y1, gz]].map(isoV);
        s += `<path d="${poly(q)}" fill="#000" opacity="${f(0.38 * fade)}" filter="url(#soft)"/>`;
      }
    }
    s += items.map((i) => i.s).join('');
    s += '</g>';
    return s;
  }

  // ---------- particles: emit (spray from a point) & stream (along a path) ----------
  function drawEmit(n, a, t) {
    const rate = a.rate || 40, life = a.life || 1.0, spread = ((a.spread != null ? a.spread : 18) * Math.PI) / 180;
    const speed = a.speed || 4, grav = a.gravity || 0, size = a.size || 2.6, c = col(a.color, 'orange');
    const tEnd = Math.min(t, a.t1);
    const kMin = Math.max(0, Math.floor((t - life - a.t0) * rate)), kMax = Math.floor((tEnd - a.t0) * rate);
    const froms = Array.isArray(a.from) && Array.isArray(a.from[0]) ? a.from : [a.from || 'origin'];
    let s = '';
    for (let k = kMin; k <= kMax; k++) {
      const e = a.t0 + k / rate, age = t - e;
      if (age < 0 || age > life) continue;
      const X = xformAt(n, e);
      froms.forEach((fr, fi) => {
        const seed = k * 7.13 + fi * 101.7 + (a.seed || 0);
        const o = X.T(anchorLocal(n, fr));
        const dir = V.norm(X.R(a.dir || [-1, 0, 0]));
        const e1 = V.norm(Math.abs(dir[2]) < 0.9 ? V.cross(dir, [0, 0, 1]) : V.cross(dir, [1, 0, 0])), e2 = V.cross(dir, e1);
        const th = hash(seed) * Math.PI * 2, rr = Math.tan(spread) * Math.sqrt(hash(seed + 1.3));
        const dv = V.norm(V.add(dir, V.add(V.mul(e1, rr * Math.cos(th)), V.mul(e2, rr * Math.sin(th)))));
        const sp = speed * (0.7 + 0.6 * hash(seed + 2.9));
        let p = V.add(o, V.mul(dv, sp * age)); p[2] -= 0.5 * grav * age * age;
        const q = isoV(p), fade = (1 - age / life) * clamp(age / 0.05);
        const pc = a.color2 && hash(seed + 5.1) > 0.6 ? col(a.color2) : c;
        s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(LW(size * (0.6 + 0.8 * hash(seed + 4.2))))}" fill="${pc}" opacity="${f(fade)}"/>`;
      });
    }
    return s;
  }
  function drawStream(n, a, t) {
    const X = xformAt(n, t);
    const paths = Array.isArray(a.path[0][0]) ? a.path : [a.path];
    const c = col(a.color, 'teal'), size = a.size || 2.6;
    let s = '';
    paths.forEach((pth, pi) => {
      const w = pth.map((p) => X.T(anchorLocal(n, p)));
      const L = polyLen(w), speed = a.speed || 2.5, per = a.particles || 6, gap = L / speed / per;
      const kMax = Math.floor((Math.min(t, a.t1) - a.t0) / gap);
      for (let k = Math.max(0, kMax - per * 3); k <= kMax; k++) {
        const e = a.t0 + k * gap + pi * gap * 0.37, sPos = (t - e) * speed;
        if (sPos < 0 || sPos > L) continue;
        const p = pointAt(w, sPos), q = isoV(p);
        const fade = clamp(sPos / 0.3) * clamp((L - sPos) / 0.4) * clamp((a.t1 + 0.4 - t) / 0.4);
        s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="${f(LW(size))}" fill="${c}" opacity="${f(fade)}"/>`;
      }
    });
    return s;
  }
  function drawForce(n, a, t) {
    const X = xformAt(n, t);
    const pts = a.points || [a.point || 'origin'];
    const c = col(a.color, 'orange'), len = a.length || 2.4, dir = V.norm(a.dir || [0, 0, -1]);
    const out = clamp((a.t1 + 0.4 - t) / 0.4);
    let s = '';
    pts.forEach((pp, i) => {
      const k = easeOut(prog(t, a.t0 + i * (a.stagger2 || 0.15), a.t0 + i * (a.stagger2 || 0.15) + 0.6));
      if (k <= 0) return;
      const tip = X.T(anchorLocal(n, pp)), dw = X.R(dir);
      const tail = V.sub(tip, V.mul(dw, len)), head = V.sub(tip, V.mul(dw, len * (1 - k)));
      const A = isoV(tail), B = isoV(head);
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]), hs = LW(9);
      const l1 = [B[0] - Math.cos(ang - 0.45) * hs, B[1] - Math.sin(ang - 0.45) * hs], l2 = [B[0] - Math.cos(ang + 0.45) * hs, B[1] - Math.sin(ang + 0.45) * hs];
      s += `<g opacity="${f(out)}"><path d="M${pt(A)}L${pt(B)}" stroke="${c}" stroke-width="${f(LW(2))}" stroke-linecap="round"/>`;
      if (k > 0.6) s += `<path d="M${pt(l1)}L${pt(B)}L${pt(l2)}" fill="none" stroke="${c}" stroke-width="${f(LW(2))}" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += '</g>';
    });
    return s;
  }
  function drawEffects(t, layer) { // world-space effects of objects (inside camera group)
    let s = '';
    for (const id in acts) {
      const baseId = id.split('.')[0], n = nodes[baseId];
      if (!n) continue;
      for (const a of acts[id]) {
        if (t < a.t0 || t > a.t1 + (a.do === 'emit' ? (a.life || 1) : 0.5)) continue;
        const dim = dimFactor(baseId, t) * nodeState(n, t).vis;
        if (dim <= 0.01) continue;
        let piece = '';
        if (a.do === 'emit') piece = `<g filter="url(#pglow)">${drawEmit(n, a, t)}</g>`;
        else if (a.do === 'stream') piece = drawStream(n, a, t);
        else if (a.do === 'force') piece = drawForce(n, a, t);
        if (piece) s += `<g opacity="${f(dim)}">${piece}</g>`;
      }
    }
    return s;
  }

  // ---------- screen-space annotations, readouts, charts ----------
  function worldPointOf(id, point, t) {
    const n = nodes[id.split('.')[0]];
    if (!n) return null;
    if (n.type === 'object') return xformAt(n, t).T(anchorLocal(n, point));
    const [x, y, z] = n.pos, [w, d, h] = n.size;
    return Array.isArray(point) ? point : [x + w / 2, y + d / 2, z + h * 0.6];
  }
  function drawAnnotations(t, cam) {
    let s = '';
    const fsz = (SB.meta.annotationSize || 26);
    for (const id in acts) for (const a of acts[id]) {
      if (t < a.t0 || t > a.t1 + 0.5) continue;
      const fade = clamp((a.t1 + 0.5 - t) / 0.5);
      if (a.do === 'annotate') {
        const wp = worldPointOf(id, a.point, t); if (!wp) continue;
        const A = screenOf(wp, cam);
        const dx = a.dx != null ? a.dx : (a.side === 'left' ? -220 : 220), dy = a.dy != null ? a.dy : -90;
        const B = [A[0] + dx, A[1] + dy];
        const k = easeOut(prog(t, a.t0, a.t0 + 0.6)), kt = clamp((t - a.t0 - 0.35) / 0.4);
        const E = [lerp(A[0], B[0], k), lerp(A[1], B[1], k)];
        const c = col(a.color, 'teal');
        const left = dx < 0;
        s += `<g opacity="${f(fade)}">`;
        s += `<circle cx="${f(A[0])}" cy="${f(A[1])}" r="5" fill="${c}"/>`;
        s += `<path d="M${pt(A)}L${pt(E)}" stroke="${c}" stroke-width="1.6"/>`;
        const tx = B[0] + (left ? -12 : 12), anchor = left ? 'end' : 'start';
        s += `<g opacity="${f(kt)}" transform="translate(${f((1 - kt) * (left ? 8 : -8))},0)">`;
        s += `<text x="${f(tx)}" y="${f(B[1] + 2)}" font-size="${fsz}" font-weight="700" fill="${col(a.textColor, 'text')}" text-anchor="${anchor}" dominant-baseline="central">${esc(a.text || '')}</text>`;
        if (a.sub) s += `<text x="${f(tx)}" y="${f(B[1] + fsz * 1.05)}" font-size="${f(fsz * 0.66)}" fill="${P.muted || P.text}" text-anchor="${anchor}" dominant-baseline="central">${esc(a.sub)}</text>`;
        s += '</g></g>';
      } else if (a.do === 'readout') {
        let pos;
        if (a.screen) pos = [a.screen[0] * W, a.screen[1] * H];
        else { const wp = worldPointOf(id, a.point, t); if (!wp) continue; const A = screenOf(wp, cam); pos = [A[0] + (a.dx || 120), A[1] + (a.dy || -60)]; }
        const k = (EASE[a.ease] || easeInOut)(prog(t, a.t0, a.t0 + (a.count || Math.max(0.3, a.t1 - a.t0 - 0.3))));
        const v = lerp(a.from || 0, a.to != null ? a.to : 0, k);
        const txt = String(a.text || '{v}').replace('{v}', v.toFixed(a.decimals || 0));
        s += `<text x="${f(pos[0])}" y="${f(pos[1])}" font-family="var(--mono)" font-size="${a.size || 24}" font-weight="600" fill="${col(a.color, 'teal')}" opacity="${f(fade * clamp((t - a.t0) / 0.3))}" letter-spacing="1">${esc(txt)}</text>`;
      } else if (a.do === 'chart') {
        s += drawChart(a, t, fade);
      }
    }
    return s;
  }
  function drawChart(a, t, fade) {
    const w = a.w || 520, h = a.h || 290;
    const x0 = a.x != null ? a.x * W : W - w - 96, y0 = a.y != null ? a.y * H : 140;
    const appear = easeOut(clamp((t - a.t0) / 0.5));
    const k = easeInOut(prog(t, a.t0 + 0.3, a.t0 + 0.3 + (a.draw || 2.2)));
    const px = x0 + 54, py = y0 + 56, pw = w - 84, ph = h - 120;
    let s = `<g opacity="${f(fade * appear)}" transform="translate(0,${f((1 - appear) * 12)})">`;
    s += `<rect x="${f(x0)}" y="${f(y0)}" width="${w}" height="${h}" rx="12" fill="${P.bg}" fill-opacity="0.72" stroke="${P.line}" stroke-opacity="0.35" stroke-width="1.5"/>`;
    s += `<text x="${f(x0 + 24)}" y="${f(y0 + 32)}" font-family="var(--mono)" font-size="17" fill="${P.text}" opacity="0.85" letter-spacing="1">${esc(a.title || '')}</text>`;
    s += `<path d="M${f(px)},${f(py)}L${f(px)},${f(py + ph)}L${f(px + pw)},${f(py + ph)}" fill="none" stroke="${P.line}" stroke-opacity="0.7" stroke-width="1.5"/>`;
    if (a.xlabel) s += `<text x="${f(px)}" y="${f(py + ph + 30)}" font-family="var(--mono)" font-size="15" fill="${P.text}" opacity="0.8">${esc(a.xlabel)}</text>`;
    (a.series || []).forEach((se) => {
      const pts = se.points.map(([u, v]) => [px + u * pw, py + (1 - v) * ph]);
      const d = 'M' + pts.map(pt).join('L');
      const c = col(se.color, 'teal');
      s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - k)}"/>`;
      if (se.label && k > 0.6) {
        const at = se.labelAt != null ? se.labelAt : 0.35; const lp = pts[Math.min(pts.length - 1, Math.round(at * (pts.length - 1)))];
        s += `<text x="${f(lp[0] + 10)}" y="${f(lp[1] - 12)}" font-size="20" font-weight="600" fill="${c}" opacity="${f(clamp((k - 0.6) / 0.3))}">${esc(se.label)}</text>`;
      }
    });
    return s + '</g>';
  }

  let DEFS = '';
  function buildDefs() {
    const hatchColors = new Set(['teal']);
    (SB.nodes || []).forEach((n) => (n.parts || []).forEach((p) => { if (p.style === 'hatch') hatchColors.add(p.color || 'teal'); }));
    let s = '<defs>';
    hatchColors.forEach((c) => {
      s += `<pattern id="hatch-${c.replace('#', '')}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><rect width="7" height="7" fill="${col(c)}" fill-opacity="0.12"/><line x1="0" y1="0" x2="0" y2="7" stroke="${col(c)}" stroke-width="2" stroke-opacity="0.75"/></pattern>`;
    });
    s += '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>';
    s += '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    s += '<filter id="pglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    DEFS = s + '</defs>';
  }
  // ---------- grid ----------
  let gridCache = '';
  function buildGrid() {
    const R = SB.meta.gridExtent || 40;
    const step = SB.meta.gridStep || (SB.meta.style === 'wire' ? 2 : 1);
    const gz = SB.meta.gridZ || 0;
    let s = '';
    for (let i = -R; i <= R; i += step) {
      const a = iso(i, -R, gz), b = iso(i, R, gz), c = iso(-R, i, gz), d = iso(R, i, gz);
      const major = SB.meta.style === 'wire' ? false : i % 4 === 0;
      s += `<path d="M${pt(a)}L${pt(b)}M${pt(c)}L${pt(d)}" stroke="${P.grid}" stroke-width="${major ? 1.6 : (SB.meta.style === 'wire' ? 1.1 : 0.8)}" opacity="${major ? 0.9 : 0.6}"/>`;
    }
    gridCache = s;
  }

  // ---------- frame ----------
  function render(t) {
    t = clamp(t, 0, total - 1e-6);
    const cam = cameraAt(t);
    CAMZ = cam.z;
    const sc = sceneAt(t);
    const world = $('world');
    let s = DEFS + `<g transform="translate(${f(W / 2)},${f(H / 2)}) scale(${cam.z.toFixed(5)}) translate(${f(-cam.cx)},${f(-cam.cy)})">`;
    if (SB.meta.grid !== false) s += gridCache;

    // order: platforms, highlights, link pipes, nodes (depth sorted), flow particles
    const ordered = Object.values(nodes).sort((a, b) => {
      const pa = a.type === 'platform' ? -1e6 : 0, pb = b.type === 'platform' ? -1e6 : 0;
      const A = a._sortPos || a.pos, B = b._sortPos || b.pos;
      const da = A[0] + a.size[0] / 2 + A[1] + a.size[1] / 2 + A[2] * 0.5;
      const db = B[0] + b.size[0] / 2 + B[1] + b.size[1] / 2 + B[2] * 0.5;
      return pa - pb || (a.layer || 0) - (b.layer || 0) || da - db;
    });
    const platforms = ordered.filter((n) => n.type === 'platform');
    const others = ordered.filter((n) => n.type !== 'platform');
    for (const n of platforms) s += drawNode(n, t);
    for (const n of ordered) s += drawHighlight(n, t);
    let over = '';
    for (const id in links) { const r = drawLink(links[id], t); s += r.under; over += r.over; }
    for (const n of others) s += n.type === 'object' ? drawObject(n, t) : drawNode(n, t);
    s += over;
    s += drawEffects(t);
    s += '</g>';
    s += drawLabels(t, cam);
    s += drawCallouts(t, cam);
    s += drawAnnotations(t, cam);
    world.innerHTML = s;
    drawOverlay(t, sc);
  }
  function drawNode(n, t) {
    const st = nodeState(n, t);
    if (st.trace <= 0.001 && st.asm <= 0.001) return '';
    const dim = dimFactor(n.id, t) * st.vis;
    if (dim <= 0.001) return '';
    const parts = nodeParts(n);
    const hl = highlightActive(n, t);
    let s = `<g opacity="${f(dim)}">`;
    // 1) precise line tracing (blueprint ghost) — fades out as the solid assembles
    const ghostA = st.asm >= 1 ? 0 : 1 - easeOut(st.asm);
    if (st.trace > 0 && ghostA > 0.01) {
      s += `<g opacity="${f(ghostA)}" fill="none" stroke="${P.ghost}" stroke-width="${f(SW())}" stroke-linecap="round" stroke-linejoin="round">`;
      for (const part of parts) for (const d of partOutline(part)) {
        s += `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - easeInOut(st.trace))}"/>`;
      }
      // construction marks: tiny corner ticks during tracing
      if (st.trace < 1) {
        const [x, y, z] = n.pos, [w, d] = n.size;
        for (const c of [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) {
          const q = iso(c[0], c[1], z);
          s += `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="3.5" fill="${P.ghost}" stroke="none"/>`;
        }
      }
      s += '</g>';
    }
    // 2) component assembly — parts drop in one after another
    if (st.asm > 0) {
      const k = parts.length;
      const span = 0.55;
      const stg = k > 1 ? (1 - span) / (k - 1) : 0;
      for (let i = 0; i < k; i++) {
        const q = clamp((st.asm - i * stg) / span);
        if (q <= 0) continue;
        const dz = (1 - easeOutBack(q)) * (SB.meta.dropHeight || 2.6);
        s += drawPart(parts[i], clamp(q * 2.5), dz, hl);
      }
    }
    s += '</g>';
    return s;
  }

  function drawOverlay(t, sc) {
    // captions
    const cap = $('caption');
    const cue = captionCues.find((c) => t >= c.t0 && t < c.t1);
    if (cue && SB.meta.captions !== false) {
      const a = Math.min(clamp((t - cue.t0) / 0.18), clamp((cue.t1 - t) / 0.18));
      cap.style.opacity = a;
      if (cap.dataset.text !== cue.text) { cap.textContent = cue.text; cap.dataset.text = cue.text; }
    } else cap.style.opacity = 0;

    // chapter tag (top-left)
    const ch = $('chapter');
    if (sc.chapter) {
      const a = Math.min(clamp((t - sc.start) / 0.4), clamp((sc.end - t) / 0.3) + (scenes[sc.index + 1] && scenes[sc.index + 1].chapter === sc.chapter ? 1 : 0));
      ch.style.opacity = clamp(a);
      ch.style.transform = `translateX(${f((1 - easeOut(clamp((t - sc.start) / 0.5))) * -24)}px)`;
      if (ch.dataset.text !== sc.chapter) { ch.textContent = sc.chapter; ch.dataset.text = sc.chapter; }
    } else ch.style.opacity = 0;

    // title card
    const tc = $('titlecard');
    if (sc.overlay) {
      const o = sc.overlay;
      const inA = easeOut(clamp((t - sc.start - 0.1) / 0.7));
      const outA = clamp((sc.end - t) / 0.5);
      tc.style.opacity = Math.min(inA, outA);
      tc.style.transform = `translateY(${f((1 - inA) * 18)}px)`;
      const html = (o.mark ? `<div class="mark">${esc(o.mark)}</div>` : '') + (o.kicker ? `<div class="kicker">${esc(o.kicker)}</div>` : '') + `<div class="title">${esc(o.title || '')}</div>` +
        (o.title2 ? `<div class="title title2">${esc(o.title2)}</div>` : '') + (o.subtitle ? `<div class="subtitle">${esc(o.subtitle)}</div>` : '') + (o.footer ? `<div class="footer">${esc(o.footer)}</div>` : '');
      if (tc.dataset.html !== html) { tc.innerHTML = html; tc.dataset.html = html; }
      tc.className = 'titlecard ' + (o.position || 'center') + (o.backdrop ? ' backdrop' : '');
    } else tc.style.opacity = 0;

    // progress bar (+ chapter ticks)
    const pb = $('progress');
    $('progresswrap').style.display = SB.meta.progress === false ? 'none' : 'block';
    pb.style.width = (t / total) * 100 + '%';

    // header block: kicker / title / subtitle / tag (inherits until changed; null hides)
    const hd = $('header');
    const hdr = headerOf(sc.index);
    if (hdr) {
      const prevH = sc.index > 0 ? headerOf(sc.index - 1) : null, nextH = scenes[sc.index + 1] ? headerOf(sc.index + 1) : null;
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const inA = same(prevH, hdr) ? 1 : easeOut(clamp((t - sc.start - 0.1) / 0.5));
      const outA = !nextH || same(nextH, hdr) ? 1 : clamp((sc.end - t) / 0.3);
      hd.style.opacity = Math.min(inA, outA);
      hd.style.transform = `translateY(${f((1 - inA) * 10)}px)`;
      const html = (hdr.kicker ? `<div class="h-kicker">${esc(hdr.kicker)}</div>` : '') + (hdr.title ? `<div class="h-title">${esc(hdr.title)}</div>` : '') +
        (hdr.subtitle ? `<div class="h-sub">${esc(hdr.subtitle)}</div>` : '') + (hdr.tag ? `<div class="h-tag" style="--tagc:${col(hdr.tagColor, 'muted')}">${esc(hdr.tag)}</div>` : '');
      if (hd.dataset.html !== html) { hd.innerHTML = html; hd.dataset.html = html; }
    } else hd.style.opacity = 0;

    // fact box (top-right)
    const fb = $('fact');
    if (sc.fact) {
      const a0 = sc.start + (sc.fact.at || 0.6);
      const a = Math.min(easeOut(clamp((t - a0) / 0.5)), clamp((sc.end - t) / 0.4));
      fb.style.opacity = a; fb.style.transform = `translateY(${f((1 - a) * 10)}px)`;
      const html = (sc.fact.kicker ? `<div class="f-kicker">${esc(sc.fact.kicker)}</div>` : '') + `<div class="f-text">${esc(sc.fact.text || '')}</div>`;
      if (fb.dataset.html !== html) { fb.innerHTML = html; fb.dataset.html = html; }
    } else fb.style.opacity = 0;
  }
  function headerOf(i) {
    for (let k = i; k >= 0; k--) if (SB.scenes[k].header !== undefined) return SB.scenes[k].header;
    return null;
  }

  // ---------- init ----------
  function init(sb) {
    SB = sb;
    SB.meta = SB.meta || {};
    W = SB.meta.width || 1920; H = SB.meta.height || 1080;
    U = SB.meta.unit || 44;
    const pal = typeof SB.meta.palette === 'object' ? SB.meta.palette : (window.ISO_PALETTES[SB.meta.palette || 'midnight'] || window.ISO_PALETTES.midnight);
    P = Object.assign({}, window.ISO_PALETTES.midnight, typeof SB.meta.palette === 'object' && SB.meta.palette.base ? window.ISO_PALETTES[SB.meta.palette.base] : {}, pal);
    if (!SB.meta.style) SB.meta.style = pal.style || (pal.base && window.ISO_PALETTES[pal.base] && window.ISO_PALETTES[pal.base].style) || 'flat';
    nodes = {}; links = {};
    (SB.nodes || []).forEach((n) => {
      n.pos = n.pos || [0, 0, 0]; if (n.pos.length < 3) n.pos = [n.pos[0], n.pos[1], 0];
      n.size = n.size || [2, 2, n.type === 'platform' ? 0.3 : 1.6];
      nodes[n.id] = n;
      if (n.type === 'object') { // local bbox -> pivot + approximate size for sorting/fit
        const bb = objectCenter(n); n._bb = bb; n._center = bb.c;
        n.size = V.sub(bb.max, bb.min); n._sortPos = V.add(n.pos, bb.min);
      }
    });
    (SB.links || []).forEach((l) => { links[l.id] = l; });
    buildTimeline();
    buildCamera();
    buildGrid();
    buildDefs();
    // stage styles
    const root = document.documentElement;
    root.style.setProperty('--W', W + 'px'); root.style.setProperty('--H', H + 'px');
    root.style.setProperty('--bg', P.bg); root.style.setProperty('--bg2', P.bg2);
    root.style.setProperty('--ink', P.ink); root.style.setProperty('--text', P.text);
    root.style.setProperty('--capbg', P.captionBg); root.style.setProperty('--captext', P.captionText);
    root.style.setProperty('--accent', P.accent); root.style.setProperty('--labelbg', P.labelBg);
    root.style.setProperty('--capsize', (SB.meta.captionSize || 40) + 'px');
    if (SB.meta.font) root.style.setProperty('--font', SB.meta.font);
    root.style.setProperty('--teal', P.teal || P.accent); root.style.setProperty('--muted', P.muted || P.text);
    root.style.setProperty('--line', P.line || P.ink); root.style.setProperty('--markc', P.red || P.accent);
    document.body.dataset.style = SB.meta.style;
    // brand block
    const b = SB.meta.brand;
    const bEl = $('brand');
    if (b && typeof b === 'object') { bEl.className = 'brandblock'; bEl.innerHTML = (b.mark ? `<span class="b-mark">${esc(b.mark)}</span>` : '') + `<span class="b-text"><span class="b-name">${esc(b.name || '')}</span><span class="b-tag">${esc(b.tagline || '')}</span></span>`; }
    else { bEl.className = ''; bEl.textContent = b || ''; }
    $('watermark').textContent = SB.meta.watermark || '';
    $('grain').style.opacity = SB.meta.grain != null ? SB.meta.grain : (SB.meta.style === 'wire' ? 0.07 : 0);
    // progress ticks at chapter changes
    const ticks = $('ticks'); ticks.innerHTML = '';
    scenes.forEach((sc, i) => { if (i > 0 && sc.chapter && sc.chapter !== scenes[i - 1].chapter) { const d = document.createElement('i'); d.style.left = (sc.start / total) * 100 + '%'; ticks.appendChild(d); } });
    const svg = $('world'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    return { duration: total, scenes: scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, duration: s.duration, caption: s.caption || s.narration || '', narration: s.narration || '', chapter: s.chapter || '', actions: (s.actions || []).length })), cues: captionCues };
  }

  window.ISO = { init, render, get duration() { return total; } };
})();
