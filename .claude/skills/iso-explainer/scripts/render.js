#!/usr/bin/env node
/* Iso Explainer renderer CLI
 *
 *   node render.js validate  <storyboard.json>
 *   node render.js preview   <storyboard.json> [--out dir]            -> storyboard.png + storyboard.html + per-scene keyframes
 *   node render.js frame     <storyboard.json> --t 12.5 [--out f.png]
 *   node render.js video     <storyboard.json> [--out out.mp4] [--fps 30] [--scale 1] [--crf 18]
 *                            [--audio narration.mp3] [--bgm music.mp3 --bgm-volume 0.12] [--from 0 --to 10]
 *
 * Scene audio: if a scene has "audio": "path.mp3" (relative to the storyboard), its duration is measured with
 * ffprobe and the scene is stretched to fit (audio + meta.audioPad, default 0.6s); all clips are mixed at their
 * scene start. meta.duration rescales all scenes proportionally when no scene audio locks the timing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require('playwright-core')); } catch (e2) {
    console.error('Playwright is required: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
}

const ENGINE = path.resolve(__dirname, '..', 'engine', 'index.html');
const NODE_TYPES = ['object', 'box', 'block', 'stack', 'server', 'database', 'cylinder', 'screen', 'doc', 'document', 'person', 'cloud', 'chip', 'ai', 'model', 'gate', 'platform'];
const ACTIONS = ['trace', 'assemble', 'build', 'link', 'flow', 'highlight', 'callout', 'label', 'hide', 'show', 'move', 'emit', 'stream', 'force', 'annotate', 'readout', 'chart'];
const NO_TARGET = ['chart', 'readout'];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

function ffprobeDuration(file) {
  try {
    return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
  } catch (e) { return null; }
}

function loadStoryboard(file) {
  const sb = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(path.resolve(file));
  sb.meta = sb.meta || {};
  // 1) scene audio auto-fit
  let audioLocked = false;
  for (const sc of sb.scenes || []) {
    if (sc.audio) {
      sc.audioPath = path.resolve(dir, sc.audio);
      const d = fs.existsSync(sc.audioPath) ? ffprobeDuration(sc.audioPath) : null;
      if (d) {
        sc.audioDuration = d;
        const need = d + (sb.meta.audioPad != null ? sb.meta.audioPad : 0.6) + (sc.audioOffset || 0);
        if (!sc.duration || sc.duration < need) sc.duration = Math.round(need * 100) / 100;
        audioLocked = true;
      } else console.warn(`! scene ${sc.id}: audio not found or unreadable: ${sc.audio}`);
    }
  }
  // 2) target total duration (proportional rescale) — only when timing is not locked by narration audio
  const sum = (sb.scenes || []).reduce((s, x) => s + (x.duration || 0), 0);
  if (sb.meta.duration && !audioLocked && Math.abs(sum - sb.meta.duration) > 0.05 && sum > 0) {
    const k = sb.meta.duration / sum;
    for (const sc of sb.scenes) {
      sc.duration *= k;
      for (const a of sc.actions || []) {
        if (a.at != null) a.at *= k;
        if (a.dur != null) a.dur *= k;
        if (a.stagger != null) a.stagger *= k;
      }
    }
  }
  return sb;
}

function validate(sb) {
  const errs = [], warns = [];
  const ids = new Set();
  for (const n of sb.nodes || []) {
    if (!n.id) errs.push('node without id');
    if (ids.has(n.id)) errs.push(`duplicate id: ${n.id}`);
    ids.add(n.id);
    if (n.type === 'object' && !(n.parts || []).length) errs.push(`object ${n.id}: needs parts[]`);
    for (const p of n.parts || []) if (p.shape && !['box', 'cyl', 'fan', 'wheel', 'extrude', 'line', 'quad'].includes(p.shape)) errs.push(`object ${n.id}: unknown part shape "${p.shape}"`);
    if (n.type && !NODE_TYPES.includes(n.type)) errs.push(`node ${n.id}: unknown type "${n.type}" (use ${NODE_TYPES.join('/')})`);
    if (!Array.isArray(n.pos) && n.type !== 'object') errs.push(`node ${n.id}: pos [x,y,z] required`);
  }
  for (const l of sb.links || []) {
    if (ids.has(l.id)) errs.push(`duplicate id: ${l.id}`);
    ids.add(l.id);
    if (!ids.has(l.from) || !(sb.nodes || []).some((n) => n.id === l.from)) errs.push(`link ${l.id}: from "${l.from}" is not a node`);
    if (!(sb.nodes || []).some((n) => n.id === l.to)) errs.push(`link ${l.id}: to "${l.to}" is not a node`);
  }
  if (!sb.scenes || !sb.scenes.length) errs.push('no scenes');
  const touched = new Set();
  for (const sc of sb.scenes || []) {
    if (!(sc.duration > 0)) errs.push(`scene ${sc.id}: duration must be > 0`);
    for (const a of sc.actions || []) {
      if (!ACTIONS.includes(a.do)) errs.push(`scene ${sc.id}: unknown action "${a.do}"`);
      if (a.target == null && NO_TARGET.includes(a.do)) continue;
      const ts = Array.isArray(a.target) ? a.target : [a.target];
      for (const t of ts) {
        const [base, grp] = String(t).split('.');
        const node = (sb.nodes || []).find((n) => n.id === base);
        if (!ids.has(base)) errs.push(`scene ${sc.id}: action ${a.do} targets unknown id "${t}"`);
        else if (grp && !(node && (node.parts || []).some((p) => p.group === grp))) errs.push(`scene ${sc.id}: "${t}" — node ${base} has no part with group "${grp}"`);
        if (['move', 'emit', 'stream', 'force'].includes(a.do) && node && node.type !== 'object') errs.push(`scene ${sc.id}: ${a.do} needs an "object" node, got ${node.type || 'box'} "${base}"`);
        if (a.do === 'annotate' && typeof a.point === 'string' && node && !(node.anchors && node.anchors[a.point])) errs.push(`scene ${sc.id}: anchor "${a.point}" not defined on ${base}`);
        touched.add(base);
        if (a.do === 'flow' && !(sb.links || []).some((l) => l.id === t)) errs.push(`scene ${sc.id}: flow must target a link, got "${t}"`);
      }
      if ((a.at || 0) > sc.duration) warns.push(`scene ${sc.id}: action ${a.do}@${a.at}s starts after the scene ends (${sc.duration}s)`);
    }
    const cap = sc.caption != null ? sc.caption : sc.narration;
    if (cap) {
      const cjk = /^(zh|ja|ko)/i.test(sb.meta.language || 'zh-CN');
      const rate = cjk ? 4.5 : 15; // chars per second a viewer can comfortably read
      if (cap.length / sc.duration > rate * 1.25) warns.push(`scene ${sc.id}: caption is dense (${cap.length} chars / ${sc.duration.toFixed(1)}s) — lengthen the scene or shorten the text`);
    }
    if (sc.camera && Array.isArray(sc.camera.focus)) for (const id of sc.camera.focus) if (!(sb.nodes || []).some((n) => n.id === id)) errs.push(`scene ${sc.id}: camera focus unknown node "${id}"`);
  }
  for (const n of sb.nodes || []) if (!touched.has(n.id) && !n.initial) warns.push(`node ${n.id} never appears (no action and no "initial")`);
  return { errs, warns };
}

async function openStage(sb, scale) {
  const W = sb.meta.width || 1920, H = sb.meta.height || 1080;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale || 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('file://' + ENGINE);
  const info = await page.evaluate((s) => window.ISO.init(s), sb);
  await page.evaluate(() => document.fonts.ready);
  const stage = await page.$('#stage');
  return { browser, page, stage, info, W, H };
}

async function shot(page, stage, t, opts = {}) {
  await page.evaluate((tt) => window.ISO.render(tt), t);
  return stage.screenshot(Object.assign({ type: 'png' }, opts));
}

function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }
function srtTime(t) {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}
function writeSrt(cues, file) {
  fs.writeFileSync(file, cues.map((c, i) => `${i + 1}\n${srtTime(c.t0)} --> ${srtTime(c.t1)}\n${c.text}\n`).join('\n'));
}

function keyTime(sc, scRaw) {
  let last = 0;
  for (const a of scRaw.actions || []) {
    const ts = Array.isArray(a.target) ? a.target.length : 1;
    const d = a.dur != null ? a.dur : ({ move: 1.5, annotate: 1.4, chart: 3, readout: 1.4, emit: 1.4, stream: 1.4, force: 1.4, trace: 1.2, assemble: 1, build: 1.8, link: 0.9, flow: 1.6, highlight: 1, callout: 1, label: 0.5 }[a.do] || 1);
    last = Math.max(last, (a.at || 0) + (a.stagger || 0) * (ts - 1) + Math.min(d, ['flow', 'callout', 'highlight', 'emit', 'stream', 'force', 'annotate', 'readout', 'chart'].includes(a.do) ? Math.min(d || 1.4, a.count || a.draw || 1.4) + 0.4 : d));
  }
  if (scRaw.overlay) last = Math.max(last, 1.2);
  return Math.min(sc.end - 0.05, sc.start + Math.max(last + 0.25, sc.duration * 0.55));
}

async function cmdPreview(file, args) {
  const sb = loadStoryboard(file);
  const { errs, warns } = validate(sb);
  warns.forEach((w) => console.warn('warn:', w));
  if (errs.length) { errs.forEach((e) => console.error('error:', e)); process.exit(2); }
  const outDir = path.resolve(args.out || path.join(path.dirname(file), path.basename(file, '.json') + '-preview'));
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page, stage, info, W, H } = await openStage(sb, 0.5);
  const cards = [];
  for (let i = 0; i < info.scenes.length; i++) {
    const sc = info.scenes[i], raw = sb.scenes[i];
    const t = keyTime(sc, raw);
    const name = `scene-${String(i + 1).padStart(2, '0')}.png`;
    fs.writeFileSync(path.join(outDir, name), await shot(page, stage, t));
    const acts = (raw.actions || []).map((a) => `${a.do} → ${Array.isArray(a.target) ? a.target.join(', ') : (a.target == null ? '—' : a.target)}${a.text ? ' 「' + String(a.text).split('\n')[0] + '」' : ''}`);
    cards.push({ i, name, sc, raw, t, acts });
    process.stdout.write(`\rkeyframes ${i + 1}/${info.scenes.length}`);
  }
  process.stdout.write('\n');
  writeSrt(info.cues, path.join(outDir, 'captions.srt'));

  const m = sb.meta;
  const P = await page.evaluate((p) => (typeof p === 'object' ? p : window.ISO_PALETTES[p || 'blueprint']), m.palette);
  const sw = ['bg', 'ink', 'primary', 'secondary', 'accent', 'ground'].map((k) => `<span class="sw" style="background:${P[k]}" title="${k}"></span>`).join('');
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title || 'Storyboard')} · 故事板</title><style>
  body{margin:0;background:#f4f2ee;font-family:"Noto Sans SC","PingFang SC","WenQuanYi Zen Hei",Arial,sans-serif;color:#1d1d1f}
  .wrap{width:1960px;padding:40px;box-sizing:border-box}
  header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;border-bottom:3px solid #1d1d1f;padding-bottom:18px}
  h1{font-size:44px;margin:0 0 8px} .meta{font-size:20px;color:#555;line-height:1.6} .sw{display:inline-block;width:28px;height:28px;border-radius:6px;margin-left:6px;border:1px solid #0002;vertical-align:middle}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
  .card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 0 #0001,0 8px 24px #0000000f}
  .card img{width:100%;display:block;aspect-ratio:${W}/${H}}
  .body{padding:16px 18px 18px} .row{display:flex;justify-content:space-between;font-size:17px;color:#777;margin-bottom:8px}
  .no{font-weight:800;color:#1d1d1f} .cap{font-size:21px;font-weight:600;line-height:1.45;margin-bottom:8px}
  .nar{font-size:16px;color:#555;margin-bottom:8px;line-height:1.5} .acts{font-size:14px;color:#888;font-family:ui-monospace,Menlo,monospace;line-height:1.5}
  .ch{display:inline-block;background:#1d1d1f;color:#fff;border-radius:6px;padding:1px 8px;font-size:14px;margin-left:6px}
  </style></head><body><div class="wrap"><header><div><h1>${esc(m.title || '')}</h1>
  <div class="meta">主题 ${esc(m.topic || '')} · 受众 ${esc(m.audience || '')} · 语言 ${esc(m.language || 'zh-CN')} · ${info.scenes.length} 个镜头 · 总时长 ${fmt(info.duration)}</div></div>
  <div class="meta">调色板 ${esc(typeof m.palette === 'string' ? m.palette : 'custom')} ${sw}</div></header><div class="grid">
  ${cards.map((c) => `<div class="card"><img src="${c.name}"><div class="body"><div class="row"><span><span class="no">S${String(c.i + 1).padStart(2, '0')}</span>${c.raw.chapter ? `<span class="ch">${esc(c.raw.chapter)}</span>` : ''}</span><span>${fmt(c.sc.start)} – ${fmt(c.sc.end)} · ${c.sc.duration.toFixed(1)}s</span></div>
  <div class="cap">${esc(c.raw.caption || c.raw.narration || (c.raw.overlay ? c.raw.overlay.title : ''))}</div>
  ${c.raw.narration && c.raw.caption && c.raw.narration !== c.raw.caption ? `<div class="nar">🎙 ${esc(c.raw.narration)}</div>` : ''}
  <div class="acts">${c.raw.camera ? '🎥 ' + esc(c.raw.camera.follow ? 'follow ' + c.raw.camera.follow : (c.raw.camera.focus === 'all' || !c.raw.camera.focus ? 'all' : c.raw.camera.focus.join(', '))) + (c.raw.dim ? ' · dim' : '') + '<br>' : ''}${c.acts.map(esc).join('<br>')}</div></div></div>`).join('')}
  </div></div></body></html>`;
  fs.writeFileSync(path.join(outDir, 'storyboard.html'), html);
  const sheet = await browser.newPage({ viewport: { width: 1960, height: 1000 } });
  await sheet.goto('file://' + path.join(outDir, 'storyboard.html'));
  await sheet.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => (i.onload = r)))));
  await sheet.screenshot({ path: path.join(outDir, 'storyboard.png'), fullPage: true });
  await browser.close();
  console.log(`storyboard: ${path.join(outDir, 'storyboard.png')}`);
  console.log(`            ${path.join(outDir, 'storyboard.html')}  (${info.scenes.length} scenes, ${info.duration.toFixed(1)}s)`);
}

async function cmdFrame(file, args) {
  const sb = loadStoryboard(file);
  const { browser, page, stage } = await openStage(sb, 1);
  const out = path.resolve(args.out || 'frame.png');
  fs.writeFileSync(out, await shot(page, stage, parseFloat(args.t || 0)));
  await browser.close();
  console.log(out);
}

async function cmdVideo(file, args) {
  const sb = loadStoryboard(file);
  const { errs, warns } = validate(sb);
  warns.forEach((w) => console.warn('warn:', w));
  if (errs.length) { errs.forEach((e) => console.error('error:', e)); process.exit(2); }
  const fps = parseFloat(args.fps || sb.meta.fps || 30);
  const scale = parseFloat(args.scale || 1);
  const out = path.resolve(args.out || path.join(path.dirname(file), path.basename(file, '.json') + '.mp4'));
  const { browser, page, stage, info } = await openStage(sb, scale);
  const from = parseFloat(args.from || 0), to = Math.min(parseFloat(args.to || info.duration), info.duration);
  const n = Math.round((to - from) * fps);
  const silent = out.replace(/\.mp4$/, '') + '.silent.mp4';
  // parallel workers: each renders a contiguous frame range into its own segment, then segments are concatenated
  const workers = Math.max(1, Math.min(parseInt(args.workers || Math.min(4, require('os').cpus().length), 10), 8));
  const seg = Math.ceil(n / workers);
  const t0 = Date.now();
  let done = 0;
  async function renderRange(w, pg, st) {
    const a = w * seg, b = Math.min(n, a + seg);
    const file = `${silent}.part${w}.mp4`;
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', args.preset || 'medium', '-crf', String(args.crf || 18), file], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = a; i < b; i++) {
      const buf = await shot(pg, st, from + i / fps, { type: 'jpeg', quality: 94 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (++done % 15 === 0 || done === n) {
        const el = (Date.now() - t0) / 1000;
        process.stdout.write(`\rframes ${done}/${n}  ${((done / n) * 100).toFixed(0)}%  eta ${Math.max(0, (el / done) * (n - done)).toFixed(0)}s  (${workers} workers)   `);
      }
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg failed ' + c)))));
    return file;
  }
  const stages = [{ page, stage }];
  for (let w = 1; w < workers; w++) {
    const pg = await browser.newPage({ viewport: { width: sb.meta.width || 1920, height: sb.meta.height || 1080 }, deviceScaleFactor: scale });
    await pg.goto('file://' + ENGINE);
    await pg.evaluate((s) => window.ISO.init(s), sb);
    await pg.evaluate(() => document.fonts.ready);
    stages.push({ page: pg, stage: await pg.$('#stage') });
  }
  const parts = await Promise.all(stages.map((s, w) => renderRange(w, s.page, s.stage)));
  await browser.close();
  process.stdout.write('\n');
  const list = silent + '.txt';
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', silent]);
  parts.forEach((p) => fs.unlinkSync(p)); fs.unlinkSync(list);

  // audio: per-scene narration clips + optional global narration + optional bgm
  const inputs = [], filters = [], labels = [];
  const nIn = () => inputs.filter((x) => x === '-i').length; // ffmpeg input index (0 = video)
  info.scenes.forEach((sc, i) => {
    const raw = sb.scenes[i];
    if (raw.audioPath && fs.existsSync(raw.audioPath) && sc.end > from && sc.start < to) {
      const delay = Math.max(0, Math.round((sc.start + (raw.audioOffset || 0.25) - from) * 1000));
      inputs.push('-i', raw.audioPath);
      const k = nIn();
      filters.push(`[${k}:a]adelay=${delay}|${delay},volume=${sb.meta.voiceVolume || 1}[a${k}]`); labels.push(`[a${k}]`);
    }
  });
  if (args.audio) { inputs.push('-i', path.resolve(args.audio)); const k = nIn(); filters.push(`[${k}:a]anull[a${k}]`); labels.push(`[a${k}]`); }
  const bgm = args.bgm || (sb.meta.bgm ? path.resolve(path.dirname(file), sb.meta.bgm) : null);
  if (bgm) {
    inputs.push('-stream_loop', '-1', '-i', path.resolve(bgm)); const k = nIn();
    const vol = args['bgm-volume'] || sb.meta.bgmVolume || 0.12;
    filters.push(`[${k}:a]volume=${vol},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, to - from - 2)}:d=2[a${k}]`); labels.push(`[a${k}]`);
  }
  if (labels.length) {
    const fc = filters.join(';') + `;${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad[aout]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(to - from), out], { stdio: 'inherit' });
    fs.unlinkSync(silent);
  } else fs.renameSync(silent, out);
  writeSrt(info.cues.filter((c) => c.t1 > from && c.t0 < to).map((c) => ({ t0: Math.max(0, c.t0 - from), t1: c.t1 - from, text: c.text })), out.replace(/\.mp4$/, '.srt'));
  console.log(`video: ${out}  (${(to - from).toFixed(1)}s @ ${fps}fps)`);
  console.log(`srt:   ${out.replace(/\.mp4$/, '.srt')}`);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, file] = args._;
  if (!cmd || !file) {
    console.log('usage: node render.js <validate|preview|frame|video> storyboard.json [options]');
    process.exit(1);
  }
  if (cmd === 'validate') {
    const sb = loadStoryboard(file);
    const { errs, warns } = validate(sb);
    warns.forEach((w) => console.warn('warn:', w));
    errs.forEach((e) => console.error('error:', e));
    const total = sb.scenes.reduce((s, x) => s + x.duration, 0);
    console.log(errs.length ? `✗ ${errs.length} error(s)` : `✓ valid — ${sb.scenes.length} scenes, ${total.toFixed(1)}s, ${(sb.nodes || []).length} nodes, ${(sb.links || []).length} links`);
    process.exit(errs.length ? 2 : 0);
  }
  if (cmd === 'preview') return cmdPreview(file, args);
  if (cmd === 'frame') return cmdFrame(file, args);
  if (cmd === 'video') return cmdVideo(file, args);
  console.error('unknown command ' + cmd); process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
