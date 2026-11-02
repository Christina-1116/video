#!/usr/bin/env python3
"""Record one narration clip per cue and write <story>.voiced.json (cue.audio set).
The player then uses the recorded track as its master clock instead of browser speech.

    pip install edge-tts
    python3 tts.py story.json [--voice en-US-AndrewNeural] [--rate +0%]
    python3 tts.py story.json --list            # print the cue script (for any external TTS / voice actor)

Clips land in <story-dir>/voice/<scene>-<n>.mp3. If you produce clips another way (LibTV, ElevenLabs,
a human), save them with those names and run with --attach to only wire them into the story.
"""
import argparse, asyncio, json, os, sys

DEFAULT = {"en-US": "en-US-AndrewNeural", "en-GB": "en-GB-RyanNeural", "en-AU": "en-AU-WilliamNeural",
           "zh-CN": "zh-CN-YunxiNeural", "es-ES": "es-ES-AlvaroNeural", "fr-FR": "fr-FR-HenriNeural", "de-DE": "de-DE-ConradNeural", "ja-JP": "ja-JP-KeitaNeural"}


def cues(story):
    for sc in story["scenes"]:
        for i, c in enumerate(sc.get("cues", [])):
            if isinstance(c, str):
                c = sc["cues"][i] = {"say": c}
            yield sc, i, c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story"); ap.add_argument("--voice"); ap.add_argument("--rate", default="+0%")
    ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY")); ap.add_argument("--list", action="store_true"); ap.add_argument("--attach", action="store_true")
    a = ap.parse_args()
    story = json.load(open(a.story, encoding="utf-8")); base = os.path.dirname(os.path.abspath(a.story))
    if a.list:
        for sc, i, c in cues(story): print(f"{sc.get('id')}-{i + 1}.mp3\t{c.get('say')}")
        return
    vdir = os.path.join(base, "voice"); os.makedirs(vdir, exist_ok=True)
    lang = story.get("meta", {}).get("language", "en-US")
    voice = a.voice or story.get("meta", {}).get("ttsVoice") or DEFAULT.get(lang, "en-US-AndrewNeural")
    if not a.attach:
        try:
            import edge_tts
        except ImportError:
            sys.exit("pip install edge-tts   (or record clips yourself and use --attach)")
        async def run():
            for sc, i, c in cues(story):
                out = os.path.join(vdir, f"{sc.get('id')}-{i + 1}.mp3")
                await edge_tts.Communicate(c.get("say") or c.get("caption"), voice, rate=a.rate, proxy=a.proxy).save(out)
                print("✓", os.path.relpath(out, base))
        asyncio.run(run())
    n = 0
    for sc, i, c in cues(story):
        rel = f"voice/{sc.get('id')}-{i + 1}.mp3"
        if os.path.exists(os.path.join(base, rel)): c["audio"] = rel; n += 1
    dst = os.path.splitext(a.story)[0] + ".voiced.json"
    json.dump(story, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{n} clips attached -> {dst}\nnext: python3 build.py {os.path.basename(dst)}")


if __name__ == "__main__":
    main()
