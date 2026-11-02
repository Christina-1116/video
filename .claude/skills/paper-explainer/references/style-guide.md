# Style guide — what makes these explainers work

Distilled from three reference videos (full breakdown with frames: `docs/三个参考视频拆解.md` in the repo).

## The three built-in looks
| | `collage` (ref A, "From Wires to AI") | `papercraft` (ref B, "a+b+c = 180°") | `papermap` (ref C, "Why do rivers bend?") |
|---|---|---|---|
| Best for | histories, timelines, "how X evolved", product eras | proofs, maths, physics, step-by-step logic | natural processes, geography, systems that change over time |
| Ground | grey grain paper; whole-scene colour swaps (mustard / teal / black) with a **torn-paper wipe** | cream paper + torn scraps in three corners | sage map board with blob terrain and paper trees |
| Hero objects | halftone **cut-out stickers** (white outline + hard offset shadow) | cream paper shapes with soft shadow, coloured wedges, letter badges | layered paper bands (river = bank + water + lanes) that **grow and morph** |
| Title | slab-serif on a **torn mustard strip**, black kicker chip, lines rise in | serif title card with a red left bar | same card; big centred title on the opening shot |
| Captions | black block | dark rounded chip | dark rounded chip |
| Extras | bottom **year timeline**, teal squares, black rules, morse dots, signal waves, 01/02/03 takeaway cards | parallel-line chevrons, dashed construction lines, equation chips | white label cards with colour bar + leader line, counter card, flow arrows |
| Pace | 3–4 s per shot | 4–6 s per step | 4–6 s per step, one continuous picture |
| Music mood | `documentary` | `calm` | `warm` |

`nightpaper` is a fourth preset (dark paper, warm/teal accents) showing how new looks are composed: same parts,
new `palette`, `titleVariant`, `bgVariant`, `decor`. Make any other style the same way with `meta.styleOverrides`.

## Rules that carry over to every topic
1. **One sentence → one visible change.** Each cue gets its own element entering, moving or highlighting at `"cN"`.
2. **Anchor to cues, never to absolute seconds**, so recorded or browser voices of any speed stay in sync.
3. **Paper physics**: things drop, slide and unfold like paper (ease-out / back-ease); nothing spins or bounces for no reason.
4. **One accent at a time**: the thing being talked about gets the accent colour or a highlight; everything else stays neutral.
5. **Captions are short** (≤ 16 words), plain English, present tense. Titles are 2–6 words; kickers name the era/step.
6. **Build, then reveal**: show the setup (shape, river, timeline) before the insight; end on a summary title and 2–3 takeaways or the finished "after" state.
7. **Readable at phone size**: titles ≥ 56 px, labels ≥ 26 px, captions on (default) — all in the 1600×900 design space.
8. **Accessibility is part of the product**: every scene has a caption; the transcript is generated from cues; motion respects "reduce motion".

## Narration voice (English)
- Write the `say` text for the ear: contractions, no symbols ("a squared plus b squared", not "a²+b²"); put symbols in `caption` instead.
- Numbers as words when the pronunciation matters ("three thousand years"), digits in captions ("3,000 years").
- 2.4–2.8 words per second is the natural explainer pace; the estimator assumes 2.55.
