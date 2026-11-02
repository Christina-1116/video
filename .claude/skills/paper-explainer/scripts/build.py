#!/usr/bin/env python3
"""Build a playable HTML explainer from a story JSON.

    python3 build.py story.json [-o out.html] [--inline-audio] [--check]

* Validates the story (types, fx, time expressions, ids, caption density).
* Measures narration clips (cue "audio": "voice/s1-1.mp3") with ffprobe -> cue.audioDur, so the
  timeline follows the real voice. Without clips the player narrates with the browser's speech engine.
* Writes ONE self-contained .html (runtime, styles, story inlined). Audio stays as relative files
  unless --inline-audio embeds it as base64 (single portable file).
"""
import argparse, base64, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RT = os.path.join(HERE, "..", "runtime")
TYPES = {"rect", "circle", "blob", "poly", "path", "curve", "arrow", "line", "band", "flow", "angle", "text", "tag", "label",
         "card", "icon", "image", "counter", "chart", "scatter", "seq", "waves", "group"}
FX_IN = {"fade", "pop", "rise", "drop", "slide-left", "slide-right", "slide-up", "stamp", "unfold", "draw", "grow", "none"}
FX_OUT = {"fade", "sink", "lift", "pop", "slide-left", "slide-right", "none"}
STYLES = {"collage", "papercraft", "papermap", "nightpaper"}
TIME_RE = re.compile(r"^(?:([\w-]+):)?(start|end|c(\d+)(?:\.(start|end))?)\s*([+-]\s*\d*\.?\d+)?$")


def ffdur(p):
    try:
        return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode().strip())
    except Exception:
        return None


def validate(story, base):
    errs, warns = [], []
    meta = story.get("meta", {})
    if meta.get("style", "papercraft") not in STYLES and not meta.get("styleOverrides"):
        errs.append(f"meta.style '{meta.get('style')}' unknown (use {sorted(STYLES)} or styleOverrides)")
    scenes = story.get("scenes") or []
    if not scenes:
        errs.append("no scenes")
    ids = {s.get("id") for s in scenes}
    icons = set(re.findall(r"^\s{4}(\w+):", open(os.path.join(RT, "styles.js")).read(), re.M))
    lang = meta.get("language", "en-US")

    def chk_time(v, sc, where):
        if v is None or isinstance(v, (int, float, list)):
            return
        m = TIME_RE.match(str(v).strip())
        if not m:
            errs.append(f"{where}: bad time '{v}' (use seconds, 'c2', 'c2.end-0.3', 'end', 'sceneId:c1')")
            return
        S = sc if not m.group(1) else next((s for s in scenes if s.get("id") == m.group(1)), None)
        if S is None:
            errs.append(f"{where}: unknown scene '{m.group(1)}'")
        elif m.group(3) and int(m.group(3)) > len(S.get("cues", [])):
            errs.append(f"{where}: '{v}' but scene '{S.get('id')}' has {len(S.get('cues', []))} cues")

    def chk_el(e, sc, path):
        t = e.get("type")
        where = f"scene {sc.get('id')} › {path}{e.get('id', t)}"
        if t not in TYPES:
            errs.append(f"{where}: unknown type '{t}'")
        fin = e.get("in"); fin = {"fx": fin} if isinstance(fin, str) else (fin or {})
        fout = e.get("out"); fout = {"fx": fout} if isinstance(fout, str) else (fout or {})
        if fin.get("fx") and fin["fx"] not in FX_IN: errs.append(f"{where}: in.fx '{fin['fx']}' unknown")
        if fout.get("fx") and fout["fx"] not in FX_OUT: errs.append(f"{where}: out.fx '{fout['fx']}' unknown")
        for v in (e.get("at"), fin.get("at"), fout.get("at")): chk_time(v, sc, where)
        for k in e.get("keys", []): chk_time(k.get("at"), sc, where + " key")
        if e.get("until") and e["until"] != "end" and e["until"] not in ids: errs.append(f"{where}: until '{e['until']}' is not a scene id")
        if t == "icon" and e.get("name") not in icons: errs.append(f"{where}: icon '{e.get('name')}' not in library")
        if t in ("poly", "band") and len(e.get("points", [])) < (3 if t == "poly" else 2): errs.append(f"{where}: needs points")
        for k in e.get("keys", []):
            if "points" in k and "points" in e and len(k["points"]) != len(e["points"]):
                errs.append(f"{where}: morph key has {len(k['points'])} points, element has {len(e['points'])} (must match)")
        for c in e.get("children", []): chk_el(c, sc, path + e.get("id", t) + " › ")

    for sc in scenes:
        for i, c in enumerate(sc.get("cues", [])):
            c = {"say": c} if isinstance(c, str) else c
            txt = c.get("say") or c.get("caption") or ""
            n = len(txt.split()) if not lang.startswith(("zh", "ja", "ko")) else len(txt)
            if n > (26 if not lang.startswith(("zh", "ja", "ko")) else 40):
                warns.append(f"scene {sc.get('id')} cue {i + 1}: {n} words — split it (one caption = one short sentence)")
            if c.get("audio") and not os.path.exists(os.path.join(base, c["audio"])) and not c["audio"].startswith("data:"):
                errs.append(f"scene {sc.get('id')} cue {i + 1}: audio file missing: {c['audio']}")
        for e in sc.get("elements", []): chk_el(e, sc, "")
    return errs, warns


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story"); ap.add_argument("-o", "--out"); ap.add_argument("--inline-audio", action="store_true"); ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    base = os.path.dirname(os.path.abspath(a.story))
    story = json.load(open(a.story, encoding="utf-8"))
    errs, warns = validate(story, base)
    for w in warns: print("warn:", w)
    for e in errs: print("error:", e)
    if errs: sys.exit(2)
    # narration clips -> real durations
    n_audio = 0
    for sc in story["scenes"]:
        cues = sc.get("cues", [])
        for i, c in enumerate(cues):
            if isinstance(c, str): c = cues[i] = {"say": c}
            if c.get("audio") and not c["audio"].startswith("data:"):
                p = os.path.join(base, c["audio"]); d = ffdur(p)
                if d: c["audioDur"] = round(d + 0.05, 3); n_audio += 1
                if a.inline_audio:
                    c["audio"] = "data:audio/mpeg;base64," + base64.b64encode(open(p, "rb").read()).decode()
    if a.check:
        print(f"✓ valid — {len(story['scenes'])} scenes, {sum(len(s.get('cues', [])) for s in story['scenes'])} cues, {n_audio} narration clips"); return
    meta = story.get("meta", {})
    styles_js = open(os.path.join(RT, "styles.js"), encoding="utf-8").read()
    player_js = open(os.path.join(RT, "player.js"), encoding="utf-8").read()
    css = open(os.path.join(RT, "player.css"), encoding="utf-8").read()
    m = re.search(r"%s:\s*\{.*?googleFonts:\s*'([^']+)'" % re.escape(meta.get("style", "papercraft")), styles_js, re.S)
    fonts = m.group(1) if m else "family=Inter:wght@400;600;700"
    story_json = json.dumps(story, ensure_ascii=False).replace("</", "<\\/")
    title = meta.get("title", "Explainer")
    bg = meta.get("pageBg", "#16181d")
    html = f"""<!doctype html>
<html lang="{meta.get('language', 'en-US')[:2]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{(meta.get('topic') or title).replace('"', '&quot;')} — animated explainer with narration, music and subtitles.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts}&display=swap">
<style>
html,body{{margin:0;background:{bg};color:#eee;font-family:Inter,Arial,sans-serif}}
main{{max-width:min(1280px, calc((100vh - 40px) * {1.7778 if meta.get('format', '16:9') == '16:9' else 0.5625 if meta.get('format') == '9:16' else 1 if meta.get('format') == '1:1' else 0.8}));margin:0 auto;padding:20px 16px}}
.credit{{font-size:12px;opacity:.55;margin-top:10px;text-align:center}}
{css}
</style>
</head>
<body>
<main>
  <div id="player"></div>
  <noscript><p>This explainer needs JavaScript. Transcript:</p>{''.join('<p>' + (c.get('caption') or c.get('say', '')) + '</p>' for s in story['scenes'] for c in s.get('cues', []))}</noscript>
  <div class="credit">{meta.get('credit', '')}</div>
</main>
<script>{styles_js}</script>
<script>{player_js}</script>
<script type="application/json" id="pe-story">{story_json}</script>
<script>
  (function () {{
    const story = JSON.parse(document.getElementById('pe-story').textContent);
    const headless = /[?&]headless=1/.test(location.search);
    const go = () => {{ window.player = PE.mount(document.getElementById('player'), story, {{ headless }}); window.__peReady = true; }};
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go, go);
  }})();
</script>
</body>
</html>"""
    out = a.out or os.path.splitext(a.story)[0] + ".html"
    open(out, "w", encoding="utf-8").write(html)
    print(f"html: {out}  ({os.path.getsize(out) // 1024} KB, {n_audio} narration clips{' inlined' if a.inline_audio else ''})")


if __name__ == "__main__":
    main()
