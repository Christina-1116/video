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
        const targets = Array.isArray(a.target) ? a.target : [a.target];
        targets.forEach((id, k) => {
          const stagger = (a.stagger || 0) * k;
          const dur = a.dur != null ? a.dur : defaultDur(a.do);
          const t0 = sc.start + (a.at || 0) + stagger;
          const t1 = a.do === 'flow' || a.do === 'highlight' || a.do === 'callout'
            ? (a.until === 'end' ? total + 999 : t0 + dur)
            : t0 + dur;
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
  function defaultDur(kind) {
    return { trace: 1.2, assemble: 1.0, build: 1.8, link: 0.9, flow: 3, highlight: 2, callout: 2.5, label: 0.5, hide: 0.5, show: 0.5 }[kind] || 1;
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
  function nodeBounds(n) {
    const [w, d, h] = n.size;
    const [x, y, z] = n.pos;
    const pts = [];
    for (const dx of [0, w]) for (const dy of [0, d]) for (const dz of [0, h]) pts.push(iso(x + dx, y + dy, z + dz));
    return pts;
  }
  function fitCamera(ids, pad) {
    const pts = [];
    ids.forEach((id) => { if (nodes[id]) pts.push(...nodeBounds(nodes[id])); });
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
        tgt = fitCamera(ids, c.pad || 1.25);
      } else tgt = Object.assign({}, prev.end);
      if (c.zoom) tgt.z = c.zoom;
      if (c.zoomMul) tgt.z *= c.zoomMul;
      if (c.offset) { const o = iso(c.offset[0], c.offset[1], c.offset[2] || 0); tgt.cx += o[0]; tgt.cy += o[1]; }
      const drift = c.drift != null ? c.drift : (SB.meta.cameraDrift != null ? SB.meta.cameraDrift : 0.05);
      const pan = c.pan ? iso(c.pan[0], c.pan[1], 0) : [0, 0];
      const entry = { start: tgt, end: { cx: tgt.cx + pan[0], cy: tgt.cy + pan[1], z: tgt.z * (1 + drift) }, ease: c.ease != null ? c.ease : 1.4 };
      camTargets.push(entry);
      prev = entry;
    });
  }
  function cameraAt(t) {
    const sc = sceneAt(t);
    const cur = camTargets[sc.index];
    const local = clamp((t - sc.start) / sc.duration);
    // continuous drift across the whole scene
    const driftK = easeInOut(local);
    const base = {
      cx: lerp(cur.start.cx, cur.end.cx, driftK), cy: lerp(cur.start.cy, cur.end.cy, driftK),
      z: Math.exp(lerp(Math.log(cur.start.z), Math.log(cur.end.z), driftK))
    };
    if (sc.index === 0 || cur.ease <= 0) return base;
    const prevEnd = camTargets[sc.index - 1].end;
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
      if (!n.label || n.type === 'platform') continue;
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

  // ---------- grid ----------
  let gridCache = '';
  function buildGrid() {
    const R = SB.meta.gridExtent || 40;
    let s = '';
    for (let i = -R; i <= R; i++) {
      const a = iso(i, -R, 0), b = iso(i, R, 0), c = iso(-R, i, 0), d = iso(R, i, 0);
      const major = i % 4 === 0;
      s += `<path d="M${pt(a)}L${pt(b)}M${pt(c)}L${pt(d)}" stroke="${P.grid}" stroke-width="${major ? 1.6 : 0.8}" opacity="${major ? 0.9 : 0.6}"/>`;
    }
    gridCache = s;
  }

  // ---------- frame ----------
  function render(t) {
    t = clamp(t, 0, total - 1e-6);
    const cam = cameraAt(t);
    const sc = sceneAt(t);
    const world = $('world');
    let s = `<g transform="translate(${f(W / 2)},${f(H / 2)}) scale(${cam.z.toFixed(5)}) translate(${f(-cam.cx)},${f(-cam.cy)})">`;
    if (SB.meta.grid !== false) s += gridCache;

    // order: platforms, highlights, link pipes, nodes (depth sorted), flow particles
    const ordered = Object.values(nodes).sort((a, b) => {
      const pa = a.type === 'platform' ? -1e6 : 0, pb = b.type === 'platform' ? -1e6 : 0;
      const da = a.pos[0] + a.size[0] / 2 + a.pos[1] + a.size[1] / 2 + a.pos[2] * 0.5;
      const db = b.pos[0] + b.size[0] / 2 + b.pos[1] + b.size[1] / 2 + b.pos[2] * 0.5;
      return pa - pb || (a.layer || 0) - (b.layer || 0) || da - db;
    });
    const platforms = ordered.filter((n) => n.type === 'platform');
    const others = ordered.filter((n) => n.type !== 'platform');
    for (const n of platforms) s += drawNode(n, t);
    for (const n of ordered) s += drawHighlight(n, t);
    let over = '';
    for (const id in links) { const r = drawLink(links[id], t); s += r.under; over += r.over; }
    for (const n of others) s += drawNode(n, t);
    s += over;
    s += '</g>';
    s += drawLabels(t, cam);
    s += drawCallouts(t, cam);
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
      const html = (o.kicker ? `<div class="kicker">${esc(o.kicker)}</div>` : '') + `<div class="title">${esc(o.title || '')}</div>` + (o.subtitle ? `<div class="subtitle">${esc(o.subtitle)}</div>` : '');
      if (tc.dataset.html !== html) { tc.innerHTML = html; tc.dataset.html = html; }
      tc.className = 'titlecard ' + (o.position || 'center');
    } else tc.style.opacity = 0;

    // progress bar
    const pb = $('progress');
    pb.style.display = SB.meta.progress === false ? 'none' : 'block';
    pb.style.width = (t / total) * 100 + '%';
  }

  // ---------- init ----------
  function init(sb) {
    SB = sb;
    SB.meta = SB.meta || {};
    W = SB.meta.width || 1920; H = SB.meta.height || 1080;
    U = SB.meta.unit || 44;
    const pal = typeof SB.meta.palette === 'object' ? SB.meta.palette : (window.ISO_PALETTES[SB.meta.palette || 'blueprint'] || window.ISO_PALETTES.blueprint);
    P = Object.assign({}, window.ISO_PALETTES.blueprint, typeof SB.meta.palette === 'object' && SB.meta.palette.base ? window.ISO_PALETTES[SB.meta.palette.base] : {}, pal);
    nodes = {}; links = {};
    (SB.nodes || []).forEach((n) => {
      n.pos = n.pos || [0, 0, 0]; if (n.pos.length < 3) n.pos = [n.pos[0], n.pos[1], 0];
      n.size = n.size || [2, 2, n.type === 'platform' ? 0.3 : 1.6];
      nodes[n.id] = n;
    });
    (SB.links || []).forEach((l) => { links[l.id] = l; });
    buildTimeline();
    buildCamera();
    buildGrid();
    // stage styles
    const root = document.documentElement;
    root.style.setProperty('--W', W + 'px'); root.style.setProperty('--H', H + 'px');
    root.style.setProperty('--bg', P.bg); root.style.setProperty('--bg2', P.bg2);
    root.style.setProperty('--ink', P.ink); root.style.setProperty('--text', P.text);
    root.style.setProperty('--capbg', P.captionBg); root.style.setProperty('--captext', P.captionText);
    root.style.setProperty('--accent', P.accent); root.style.setProperty('--labelbg', P.labelBg);
    root.style.setProperty('--capsize', (SB.meta.captionSize || 40) + 'px');
    if (SB.meta.font) root.style.setProperty('--font', SB.meta.font);
    const svg = $('world'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    $('brand').textContent = SB.meta.brand || '';
    return { duration: total, scenes: scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, duration: s.duration, caption: s.caption || s.narration || '', narration: s.narration || '', chapter: s.chapter || '', actions: (s.actions || []).length })), cues: captionCues };
  }

  window.ISO = { init, render, get duration() { return total; } };
})();
