#!/usr/bin/env node
/* Storyboard preview of a built explainer HTML.
 *   node preview.js video.html [--out dir] [--at 0.85]      -> dir/storyboard.png + scene-XX.png
 *   node preview.js video.html --frame 12.5 --out f.png      -> one full-res frame
 * Each scene keyframe is taken at start + at × duration (default 0.85: after its elements have entered).
 */
'use strict';
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const args = process.argv.slice(2); const file = path.resolve(args[0]);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto('file://' + file + '?headless=1');
  await page.waitForFunction(() => window.__peReady, null, { timeout: 20000 });
  const info = await page.evaluate(() => { const C = player.compiled; return { W: C.W, H: C.H, total: C.total, title: C.meta.title, style: C.meta.style, scenes: C.scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, title: s.title || '', kicker: s.kicker || '', cues: s.cues.map((c) => c.caption || c.say) })) }; });
  await page.setViewportSize({ width: info.W, height: info.H });
  await page.addStyleTag({ content: 'main{max-width:none!important;padding:0!important} .pe-player{border-radius:0!important;width:' + info.W + 'px!important} .credit{display:none}' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(150);
  const stage = await page.$('.pe-viewport');
  const shot = async (t, p) => { await page.evaluate((tt) => player.seek(tt), t); await page.waitForTimeout(30); await stage.screenshot({ path: p }); };
  if (opt('frame')) { const out = path.resolve(opt('out', 'frame.png')); await shot(parseFloat(opt('frame')), out); console.log(out); await browser.close(); return; }
  const dir = path.resolve(opt('out', file.replace(/\.html$/, '') + '-preview')); fs.mkdirSync(dir, { recursive: true });
  const at = parseFloat(opt('at', '0.85'));
  for (let i = 0; i < info.scenes.length; i++) { const s = info.scenes[i]; await shot(s.start + (s.end - s.start) * at, path.join(dir, `scene-${String(i + 1).padStart(2, '0')}.png`)); }
  const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  const cols = info.W >= info.H ? 3 : 4;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f3f1ec;font-family:Inter,Arial,sans-serif;color:#1d1d1f}.w{padding:36px;width:${cols * 600}px}h1{margin:0 0 6px;font-size:40px}.m{color:#666;font-size:18px;margin-bottom:24px}.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:22px}.c{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px #0001}.c img{width:100%;display:block}.b{padding:14px 16px}.r{display:flex;justify-content:space-between;color:#888;font-size:15px}.t{font-weight:700;font-size:19px;margin:6px 0}.q{font-size:15px;color:#444;line-height:1.45}</style>
  <div class="w"><h1>${esc(info.title)}</h1><div class="m">style ${esc(info.style)} · ${info.scenes.length} scenes · ${fmt(info.total)}</div><div class="g">${info.scenes.map((s, i) => `<div class="c"><img src="scene-${String(i + 1).padStart(2, '0')}.png"><div class="b"><div class="r"><b>S${String(i + 1).padStart(2, '0')}</b><span>${fmt(s.start)}–${fmt(s.end)}</span></div><div class="t">${esc(s.kicker ? s.kicker + ' · ' : '')}${esc(s.title.replace(/\n/g, ' '))}</div><div class="q">${s.cues.map((c) => '🎙 ' + esc(c)).join('<br>')}</div></div></div>`).join('')}</div></div>`;
  fs.writeFileSync(path.join(dir, 'storyboard.html'), html);
  const sheet = await browser.newPage({ viewport: { width: cols * 600 + 72, height: 900 } });
  await sheet.goto('file://' + path.join(dir, 'storyboard.html')); await sheet.waitForTimeout(300);
  await sheet.screenshot({ path: path.join(dir, 'storyboard.png'), fullPage: true });
  await browser.close();
  if (errors.length) { console.log('page warnings/errors:'); errors.forEach((e) => console.log('  ' + e)); }
  console.log(`storyboard: ${path.join(dir, 'storyboard.png')}  (${info.scenes.length} scenes, ${info.total.toFixed(1)}s)`);
})().catch((e) => { console.error(e); process.exit(1); });
