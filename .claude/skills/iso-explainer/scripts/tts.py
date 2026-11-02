#!/usr/bin/env python3
"""Generate per-scene narration audio for a storyboard with edge-tts, then write <name>.voiced.json
whose scenes carry "audio" paths. render.js stretches each scene to fit its clip and mixes them in.

    pip install edge-tts
    python3 tts.py storyboard.json [--voice zh-CN-XiaoxiaoNeural] [--rate +0%] [--proxy http://...]

Default voice is chosen from meta.language. If edge-tts is unreachable, supply your own clips instead:
put "audio": "voice/scene-01.mp3" on each scene (any TTS or a human recording works).
"""
import argparse, asyncio, json, os, sys

VOICES = {
    'zh': 'zh-CN-XiaoxiaoNeural', 'zh-CN': 'zh-CN-XiaoxiaoNeural', 'zh-TW': 'zh-TW-HsiaoChenNeural',
    'en': 'en-US-AriaNeural', 'en-US': 'en-US-AriaNeural', 'en-GB': 'en-GB-SoniaNeural',
    'ja': 'ja-JP-NanamiNeural', 'ko': 'ko-KR-SunHiNeural', 'es': 'es-ES-ElviraNeural',
    'fr': 'fr-FR-DeniseNeural', 'de': 'de-DE-KatjaNeural',
}


async def synth(text, voice, rate, out, proxy):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate, proxy=proxy)
    await comm.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('storyboard')
    ap.add_argument('--voice')
    ap.add_argument('--rate', default='+0%')
    ap.add_argument('--proxy', default=os.environ.get('HTTPS_PROXY') or None)
    a = ap.parse_args()
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        sys.exit('edge-tts missing: pip install edge-tts')
    sb = json.load(open(a.storyboard, encoding='utf-8'))
    lang = sb.get('meta', {}).get('language', 'zh-CN')
    voice = a.voice or sb.get('meta', {}).get('voice') or VOICES.get(lang) or VOICES.get(lang.split('-')[0], 'en-US-AriaNeural')
    base = os.path.splitext(a.storyboard)[0]
    adir = base + '-audio'
    os.makedirs(adir, exist_ok=True)
    for i, sc in enumerate(sb['scenes']):
        text = sc.get('narration') or sc.get('caption')
        if not text:
            continue
        out = os.path.join(adir, f'scene-{i + 1:02d}.mp3')
        asyncio.run(synth(text, voice, a.rate, out, a.proxy))
        sc['audio'] = os.path.relpath(out, os.path.dirname(os.path.abspath(a.storyboard)))
        print(f'✓ {sc.get("id", i)} -> {out}')
    sb.setdefault('meta', {})['voice'] = voice
    dst = base + '.voiced.json'
    json.dump(sb, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'storyboard with narration: {dst}\nnext: node render.js preview {dst}  (scene lengths now follow the voice)')


if __name__ == '__main__':
    main()
