#!/usr/bin/env node
/* Optional: export a built explainer HTML to MP4 (frames + procedural music + recorded narration clips).
 *   node export_mp4.js video.html [--out video.mp4] [--fps 30] [--scale 1.2] [--no-music]
 * Narration is only included when the story uses recorded clips (cue.audio); browser speech cannot be captured.
 * Captions are burned in as shown in the player (toggle with --no-captions).
 */
'use strict';
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const args = process.argv.slice(2); const file = path.resolve(args[0]);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; }; const flag = (k) => args.includes('--' + k);

(async () => {
  const fps = parseFloat(opt('fps', '30')), scale = parseFloat(opt('scale', '1.2'));
  const out = path.resolve(opt('out', file.replace(/\.html$/, '.mp4')));
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: scale });
  await page.goto('file://' + file + '?headless=1'); await page.waitForFunction(() => window.__peReady, null, { timeout: 20000 });
  const info = await page.evaluate(() => ({ W: player.compiled.W, H: player.compiled.H, total: player.compiled.total, cues: player.compiled.cues.map((c) => ({ t0: c.t0, audio: c.audio || null })) }));
  await page.setViewportSize({ width: info.W, height: info.H });
  await page.addStyleTag({ content: 'main{max-width:none!important;padding:0!important} .pe-player{border-radius:0!important;width:' + info.W + 'px!important} .credit{display:none}' + (flag('no-captions') ? '.pe-caption{display:none!important}' : '') });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(200);
  const stage = await page.$('.pe-viewport');
  const silent = out.replace(/\.mp4$/, '.v.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(info.total * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => player.seek(t), i / fps);
    const buf = await stage.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 30 === 0) process.stdout.write(`\rframes ${i}/${n}`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r)); process.stdout.write('\n');
  const inputs = [], filters = [], labels = []; const nIn = () => inputs.filter((x) => x === '-i').length;
  if (!flag('no-music')) {
    const b64 = await page.evaluate((s) => player.renderMusicWav(s), info.total + 1);
    const wav = out.replace(/\.mp4$/, '.music.wav'); fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
    inputs.push('-i', wav); const k = nIn(); filters.push(`[${k}:a]volume=1[a${k}]`); labels.push(`[a${k}]`);
  }
  const base = path.dirname(file);
  info.cues.forEach((c) => { if (!c.audio || c.audio.startsWith('data:')) return; inputs.push('-i', path.resolve(base, c.audio)); const k = nIn(); const ms = Math.round(c.t0 * 1000); filters.push(`[${k}:a]adelay=${ms}|${ms}[a${k}]`); labels.push(`[a${k}]`); });
  await browser.close();
  if (labels.length) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, ...inputs, '-filter_complex', filters.join(';') + `;${labels.join('')}amix=inputs=${labels.length}:normalize=0[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(info.total), out], { stdio: 'inherit' });
    fs.unlinkSync(silent);
  } else fs.renameSync(silent, out);
  const tmpWav = out.replace(/\.mp4$/, '.music.wav'); if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
  console.log(`mp4: ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
