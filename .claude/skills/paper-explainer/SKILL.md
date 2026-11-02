---
name: paper-explainer
description: Turn any topic, process or product into a finished, playable English-narrated explainer video delivered as one self-contained HTML file — layered paper-cut illustrations, smooth procedural animation, voice-over, background music, play/pause/seek/replay controls, chapter-marked progress bar, switchable subtitles, transcript, keyboard shortcuts and reduced-motion support. Three reference looks (collage zine, papercraft geometry, paper map) plus custom styles; topic, audience, language, palette/tone and format (16:9, 9:16, 1:1, 4:5) are configurable. Optional MP4 export. Use when the user asks for an animated explainer / 讲解动画 / 科普短片 / paper-cut or collage animation / "explain X in a short video" / an HTML video, or wants a topic turned into a narrated animation rather than a storyboard or web page.
---

# Paper Explainer — topic → playable narrated HTML video

The output is **a complete short film**, not a storyboard: open the `.html` and it plays with voice,
music and captions. The picture is a pure function of time, so the same file also previews headlessly
and exports to MP4.

```
topic ─► ① brief ─► ② script (cues) ─► ③ story.json (scenes + elements) ─► ④ build.py ─► ⑤ preview.js (look at it!)
                                                                          └► ⑥ optional: tts.py voice clips / export_mp4.js
```

## Read first
- `references/style-guide.md` — the three looks, when to use which, the rules that make them work.
- `references/story-schema.md` — every JSON key, element type, animation and time expression.
- `examples/` — one finished story per style, copy the closest one:
  - `money/` — **collage**: history timeline (“From Shells to Screens”)
  - `pythagoras/` — **papercraft**: visual proof (“Why does a² + b² = c²?”)
  - `delta/` — **papermap**: natural process with a morphing landscape (“How does a river build new land?”)
- Reference breakdown with frames: `docs/三个参考视频拆解.md` (repo root).

Paths below use `$SKILL` = this skill's folder. Requires Python 3 and, for preview/export, Node + Playwright (Chromium) and ffmpeg.

## ① Brief — fill defaults, don't interrogate
| knob | default |
|---|---|
| topic | the user's words |
| audience | curious general audience, age 12+ (adjust vocabulary, number of steps, examples) |
| language | English (`en-US`); captions = narration text |
| style | history/evolution → `collage`; maths/logic/proof → `papercraft`; nature/geography/process → `papermap`; product/tech at night → `nightpaper`; or compose a new one (`styleOverrides` + `palette`) |
| tone | sets music mood + pace: calm/curious → `calm`, warm/story → `warm`, serious/history → `documentary`, kids/playful → `playful` or `upbeat` |
| format | 16:9; 9:16 for Shorts/Reels (stack content vertically, titles `top`) |
| length | 35–60 s (6–9 scenes, 1–3 cues each) |
State the defaults you picked in one line, then build.

## ② Script — write the narration first
- 8–16 cues total, **one short spoken sentence per cue** (≤ 16 words). This is the timeline.
- Structure: **hook question → setup → 2–4 steps/eras (one idea each) → the insight → takeaway/summary line.**
- Write for the ear (`say`): words, not symbols ("a squared"), numbers as words when pronunciation matters. Put symbols/digits in `caption` if they differ.
- Each scene: a 2–6 word `title` (statement or step name) and, for timelines, a `kicker` (era / step label).

## ③ Story JSON — draw it
For each cue decide the **one visible change** that lands on it (`"at": "cN"`), using the style's vocabulary:
- collage: `group` + `sticker:true` objects built from `circle/rect/icon/text` with `halftone`, colour-block `rect`s, `waves`, `seq`, scene `bg` swaps, `meta.timeline`, closing `card`s 01/02/03.
- papercraft: `poly` shapes with `in:"draw"`, `angle` wedges, `curve` with `head:"chevrons"`, `tag` equations, `keys` that slide pieces (`x`,`y`) to prove a point.
- papermap: `poly smooth` land/sea, `band` rivers/roads (`in:"grow"`, morph `points` via `keys`), `flow` along bands, `label` cards with anchors, `counter` for years, `camera` zooms.
Keep elements that persist across scenes in their first scene with `"until": "end"` and animate them later with `keys` at `"sceneId:cN"`.
Coordinates: 1600×900 (16:9). Keep the top-left ~620×260 for the title and the bottom 120 px for captions (+timeline in collage).

## ④ Build
```bash
python3 $SKILL/scripts/build.py story.json -o video.html      # validates, then writes ONE self-contained html
```
Fix every `error:`; heed `warn:` (long sentences). `--check` validates only.

## ⑤ Preview — always look before delivering
```bash
node $SKILL/scripts/preview.js video.html --out preview          # storyboard.png: one keyframe per scene + script
node $SKILL/scripts/preview.js video.html --frame 12.5 --out f.png
```
Open `preview/storyboard.png` (and single frames where needed) and check: nothing hidden under the title or captions,
labels readable, layers in the right order (`z`), morphs/moves land where intended, contrast on coloured backgrounds.
Iterate on the JSON, rebuild, re-preview. Then give the user the `.html` (and the storyboard image).

## ⑥ Voice & export (optional)
- **Default narration = the viewer's browser speech engine** (best-ranked English voice; Edge "Natural"/Chrome "Google US English"/macOS "Samantha"…; listeners can pick another voice in ⚙). The timeline waits for each sentence, so sync holds with any voice.
- **Recorded voice (consistent, best quality)**: `python3 $SKILL/scripts/tts.py story.json` (edge-tts, default `en-US-AndrewNeural`) → `story.voiced.json` → build. Or generate clips with any TTS (e.g. LibTV `synthesize_speech` with `speech-2.8-hd` and an `English_*` voice), save as `voice/<sceneId>-<n>.mp3`, then `tts.py story.json --attach`. Clip lengths become the timeline; the recorded track is the master clock. `build.py --inline-audio` embeds clips into the single file.
- **MP4**: `node $SKILL/scripts/export_mp4.js video.html --out video.mp4` (frames + rendered music + recorded clips; browser speech can't be captured).

## Player features (built in — mention them when delivering)
Play/pause, replay, ±5 s, chapter jumps, scrubber with chapter ticks and hover titles, time readout, narration on/off,
music on/off + volume (music auto-ducks under the voice), CC on/off + size S/M/L, speed 0.75–1.5×, voice picker,
transcript panel (click a line to jump), end screen with replay + .vtt caption download, full screen,
keyboard shortcuts (`?` lists them), screen-reader labels and live announcements, reduced-motion mode
(respects the OS setting), remembered preferences, `<noscript>` transcript fallback.

## Troubleshooting
- Element invisible → check `z` (layer order), `in.at` vs scene length, and that it isn't under the title/caption zone.
- Morph jumps → `keys[].points` must have the same number of points as `points`.
- Persistent element vanishes → add `"until": "end"` (or a scene id).
- Title strip invisible on a coloured scene → it auto-switches to `card` colour on `accent` backgrounds; or set `titleFill`.
- Silent in a browser → speech needs a user gesture (the big Play button) and installed voices; recorded clips avoid this.
