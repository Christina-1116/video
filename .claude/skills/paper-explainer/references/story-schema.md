# Story JSON schema

A story = `meta` + ordered `scenes`. Each scene has narration `cues` (one short sentence each) and the
`elements` that animate on top of them. **Every animation time is anchored to a cue**, so the picture
stays in sync whatever voice reads it.

## meta
| key | default | notes |
|---|---|---|
| `title`, `topic`, `audience` | — | poster, page title, transcript header |
| `language` | `en-US` | voice selection, caption rules, `<html lang>` |
| `style` | `papercraft` | `collage` · `papercraft` · `papermap` · `nightpaper` |
| `styleOverrides` | — | any style key: `titleVariant` (`strip`/`card`/`plain`), `kickerVariant` (`chip`/`plain`), `shadow` (`hard`/`soft`), `torn`, `grain`, `bgVariant` (`paper`/`board`), `decor` (`scraps`/`map`/`collage`/none), `captionVariant` (`chip`/`block`), `labelVariant` (`card`/`chip`), `fonts`, `googleFonts` |
| `palette` | style's | override colours: `bg paper card ink muted accent accent2 accent3 red blue green caption captionText shadow` (+ `land1 land2 tree trunk water bank sand scrap1-3`) |
| `format` | `16:9` | `16:9` 1600×900 · `9:16` 900×1600 · `1:1` 1200×1200 · `4:5` 1080×1350 (author coordinates in this space) |
| `timeline` | — | labels for the collage bottom timeline, e.g. `["1830s","1844",…,"Today"]` |
| `music` | `{mood: style's, volume: .2}` | `mood`: `calm` `warm` `playful` `documentary` `upbeat` `none` (procedural Web-Audio score, ducks under the voice) |
| `voice` | `{rate:1, pitch:1, prefer:[]}` | browser-speech voice ranking hints, e.g. `["Aria","Jenny","Natural","Samantha","Google US English"]` |
| `ttsVoice` | — | edge-tts voice for `scripts/tts.py` (e.g. `en-US-AndrewNeural`) |
| `cuePause` | 0.4 | silence after each sentence |
| `posterAt`, `endTitle`, `credit`, `pageBg`, `slug` | — | poster frame time, end-screen line, footer text, page colour, caption file name |

## scenes
```json
{ "id": "coins", "kicker": "600 BC · Coins", "title": "Metal you\ncould count.", "subtitle": "optional second line",
  "bg": "accent", "transition": "tear", "timeline": 1, "titlePos": "tl", "titleSize": 76, "titleVariant": "strip", "titleFill": "card",
  "camera": { "x": 1010, "y": 470, "zoom": 1.5, "dur": 1.8 },
  "cues": [ { "say": "Then came coins." }, { "say": "Small, tough, and stamped with a promise.", "caption": "optional on-screen text", "audio": "voice/coins-2.mp3", "pause": 0.5 } ],
  "lead": 0.45, "tail": 0.35,
  "elements": [ … ] }
```
- `title` uses `\n` for line breaks (lines rise in one by one). A title identical to the previous scene's stays put (no re-animation) — use that for multi-scene steps of one idea.
- `bg`: palette key or hex. A colour change triggers the style's transition (`tear` for collage, `fade` otherwise); force with `transition`: `tear` `fade` `cut`.
- `titlePos`: `tl` (default) · `top` · `center` · `bl`.
- `camera`: object or list of keys `{at, x, y, zoom, dur, ease}` (x,y = point to centre). Interpolates from the previous camera.
- Scene length = lead + Σ(cue duration + pause) + tail. Cue duration = recorded clip length (`audioDur`, measured by build.py) or an estimate from word count.

## time expressions (`at`, `in.at`, `out.at`, `keys[].at`)
`2.5` (seconds from scene start) · `"c2"` (cue 2 starts) · `"c2.end"` · `"c2+0.4"` · `"c3.end-0.3"` · `"start"` · `"end"` · `"otherScene:c1"` (cue in another scene — used for keys of persistent elements).

## elements — common keys
`id`, `type`, `x`, `y`, `rotate`, `scale`, `opacity`, `z` (layer order), `in`, `out`, `until`, `keys`, `sticker` (white cut-out outline + hard shadow), `shadow` (0–2), `grain` (false to disable), `halftone` (0–1 dot-screen overlay).
- **Box-like types** (`rect circle blob text tag label card icon image counter chart waves group`) are centred on `x,y`.
- **Geometry types** (`poly curve arrow line band flow angle path scatter seq`) use absolute coordinates; `x,y` then shift them.
- `in`: `"pop"` or `{fx, at, dur, ease}` — fx `fade pop rise drop slide-left slide-right slide-up stamp unfold draw grow none`. Default at = scene start + 0.25.
- `out`: `{fx, at, dur}` — fx `fade sink lift pop slide-left slide-right none`. Default at = end of the scene, or of `until` (`"sceneId"` or `"end"`).
- `keys`: `[{at, dur, ease, …props}]` — any numeric prop, colours, and `points` (same count) morph smoothly.

## element types
| type | key props | used for |
|---|---|---|
| `rect` | `w h rx fill torn stroke` | paper sheets, blocks, bars |
| `circle` | `r fill` | discs, coins, badges |
| `blob` | `r seed n wobble fill` | organic patches, terrain |
| `poly` | `points smooth fill stroke torn` | triangles, shapes, land/sea (`smooth:true`); `in:"draw"` traces the outline then fills |
| `path` | `d fill stroke dashed` | custom SVG shapes |
| `curve` / `arrow` / `line` | `points` or `from to bend`, `color width dashed head (end/both/none/chevrons) casing dot` | connectors, trajectories, parallel-line marks (`chevrons`) |
| `band` | `points width fill edge edgeWidth lanes ghost` | rivers, roads, pipes, strips; `in:"grow"`, morph `points` |
| `flow` | `along` (band/curve id) or `points`, `lanes glyph (arrow/dot/dash/chevron) size color spacing speed` | moving arrows, particles, packets |
| `angle` | `at from to r fill label` | angle wedges with letter badge (degrees, counter-clockwise from →) |
| `text` | `text size font (title/body/mono/label) weight color align maxWidth italic upper` | free text |
| `tag` | `text fill color size font torn` | equation chips, small labels, letter tags |
| `label` | `text sub anchor bar fill size w variant` | callout card with leader line to `anchor` |
| `card` | `w h fill number icon iconColor title body underline torn` | takeaway cards (01/02/03), info cards |
| `icon` | `name size color strokeWidth badge` | 48 built-in line icons (see `runtime/styles.js`) |
| `image` | `src w h halftone` | real photo cut-outs (use with `sticker:true`) |
| `counter` | `value format decimals fill font size` | animated numbers (`keys:[{value:…}]`) |
| `chart` | `w h title series:[{points:[[0..1,0..1]],color}] note` | mini line chart that draws itself |
| `scatter` | `region seed count glyph (tree/blob/dot) min max fill` | trees, texture, crowds |
| `seq` | `from to pattern ('.-o ' chars) size color wave amp` | morse code, beads, footsteps revealed one by one (`in:"grow"`) |
| `waves` | `count r gap from to color color2` | radio / sound / heat arcs (`in:"grow"`, pulses) |
| `group` | `children sticker` | composite objects (phone, coin, bill) — children are relative to the group |
