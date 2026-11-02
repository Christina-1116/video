#!/usr/bin/env python3
"""Record one narration clip per cue and write <story>.voiced.json (cue.audio set).
The player then uses the recorded track as its master clock instead of browser speech.

Engines
  kokoro (default, offline neural voices, very accurate English):
      pip install kokoro-onnx soundfile
      model files (once): kokoro-v1.0.onnx + voices-v1.0.bin from
      https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
      python3 tts.py story.json --model-dir ~/kokoro [--voice af_heart] [--speed 1.0]
      English voices: af_heart af_bella af_nicole af_sarah am_michael am_fenrir am_puck (US) · bf_emma bm_george bm_fable (UK)
  edge (Microsoft online voices):
      pip install edge-tts ; python3 tts.py story.json --engine edge [--voice en-US-AndrewNeural]
  anything else (LibTV, ElevenLabs, a human): save clips as voice/<sceneId>-<n>.mp3 and run with --attach.

    python3 tts.py story.json --list     # print the cue script with target file names
"""
import argparse, asyncio, json, os, subprocess, sys, tempfile


def cues(story):
    for sc in story["scenes"]:
        for i, c in enumerate(sc.get("cues", [])):
            if isinstance(c, str):
                c = sc["cues"][i] = {"say": c}
            yield sc, i, c


def to_mp3(wav, mp3):
    subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", "apad=pad_dur=0.06", "-ac", "1", "-ar", "24000", "-b:a", "80k", mp3])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story"); ap.add_argument("--engine", default="kokoro", choices=["kokoro", "edge"])
    ap.add_argument("--voice"); ap.add_argument("--speed", type=float, default=1.0); ap.add_argument("--rate", default="+0%")
    ap.add_argument("--model-dir", default=os.environ.get("KOKORO_DIR", os.path.expanduser("~/kokoro")))
    ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY"))
    ap.add_argument("--list", action="store_true"); ap.add_argument("--attach", action="store_true"); ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    story = json.load(open(a.story, encoding="utf-8")); base = os.path.dirname(os.path.abspath(a.story))
    meta = story.get("meta", {})
    if a.list:
        for sc, i, c in cues(story): print(f"voice/{sc.get('id')}-{i + 1}.mp3\t{c.get('say')}")
        return
    vdir = os.path.join(base, "voice"); os.makedirs(vdir, exist_ok=True)
    todo = [(sc, i, c, os.path.join(vdir, f"{sc.get('id')}-{i + 1}.mp3")) for sc, i, c in cues(story)]
    todo_gen = [x for x in todo if a.force or not os.path.exists(x[3])]
    if not a.attach and todo_gen:
        if a.engine == "kokoro":
            try:
                import soundfile as sf
                from kokoro_onnx import Kokoro
            except ImportError:
                sys.exit("pip install kokoro-onnx soundfile")
            onnx, vb = os.path.join(a.model_dir, "kokoro-v1.0.onnx"), os.path.join(a.model_dir, "voices-v1.0.bin")
            if not (os.path.exists(onnx) and os.path.exists(vb)):
                sys.exit(f"model files missing in {a.model_dir} (kokoro-v1.0.onnx, voices-v1.0.bin) — see header of this script")
            k = Kokoro(onnx, vb)
            voice = a.voice or meta.get("ttsVoice") or "af_heart"
            lang = "en-gb" if voice[:1] == "b" else "en-us"
            for sc, i, c, out in todo_gen:
                samples, sr = k.create(c.get("say") or c.get("caption"), voice=voice, speed=a.speed, lang=lang)
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf: wav = tf.name
                sf.write(wav, samples, sr); to_mp3(wav, out); os.unlink(wav)
                print(f"✓ {os.path.relpath(out, base)}  {len(samples) / sr:.2f}s  “{c.get('say')}”")
        else:
            try:
                import edge_tts
            except ImportError:
                sys.exit("pip install edge-tts")
            voice = a.voice or meta.get("ttsVoice") or "en-US-AndrewNeural"
            async def run():
                for sc, i, c, out in todo_gen:
                    await edge_tts.Communicate(c.get("say") or c.get("caption"), voice, rate=a.rate, proxy=a.proxy).save(out)
                    print("✓", os.path.relpath(out, base))
            asyncio.run(run())
    n = 0
    for sc, i, c, out in todo:
        if os.path.exists(out): c["audio"] = os.path.relpath(out, base); n += 1
    dst = os.path.splitext(a.story)[0] + ".voiced.json"
    json.dump(story, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{n}/{len(todo)} clips attached -> {dst}\nnext: python3 build.py {os.path.basename(dst)} --inline-audio")


if __name__ == "__main__":
    main()
