# Install paper-explainer

**Claude Code** — unzip into `~/.claude/skills/` (all projects) or `<project>/.claude/skills/` (one project). Then ask: “Use paper-explainer to make a video about …”.

**Claude.ai / Claude Desktop** — Settings → Capabilities → Skills → Upload skill → choose `paper-explainer.zip`.

**Claude API (Agent Skills) / other agents** — upload the folder as a skill, or point any agent at `SKILL.md`; it is plain instructions + scripts.

**Without an agent** — write a `story.json` (see `examples/` and `references/story-schema.md`), then:
```bash
python3 scripts/build.py story.json -o video.html          # playable single-file video
node scripts/preview.js video.html --out preview           # storyboard (needs Node + Playwright)
python3 scripts/tts.py story.json --model-dir <kokoro>     # optional recorded English voice (pip install kokoro-onnx soundfile)
python3 scripts/build.py story.voiced.json -o video.html --inline-audio
node scripts/export_mp4.js video.html                      # optional MP4 (needs ffmpeg)
```
Requirements: Python 3 (build); Node 18 + Playwright + ffmpeg (preview/MP4); kokoro-onnx model files (voice).
