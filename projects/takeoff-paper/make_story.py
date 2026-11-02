#!/usr/bin/env python3
"""Generate story.json for 'How does a plane take off?' (paper-explainer, papercraft style, EN voice + EN/ZH subtitles)."""
import json, os

def plane(pid, x, y, at, until=None, keys=None, gear_out=None, fx="drop"):
    gear_o = {"out": {"fx": "fade", "at": gear_out, "dur": 0.5}} if gear_out else {}
    el = {"id": pid, "type": "group", "x": x, "y": y, "scale": 1.35, "z": 5, "in": {"fx": fx, "at": at, "dur": 0.9}, "children": [
        {"type": "curve", "from": [-20, 22], "to": [-20, 50], "color": "ink", "width": 5, **gear_o},
        {"type": "circle", "x": -20, "y": 58, "r": 10, "fill": "ink", "shadow": 0, **gear_o},
        {"type": "curve", "from": [180, 22], "to": [180, 48], "color": "ink", "width": 4, **gear_o},
        {"type": "circle", "x": 180, "y": 56, "r": 9, "fill": "ink", "shadow": 0, **gear_o},
        {"type": "poly", "points": [[-245, -10], [-212, -122], [-182, -122], [-160, -26]], "fill": "red"},
        {"type": "poly", "smooth": True, "points": [[-262, -6], [-205, -30], [180, -34], [236, -24], [264, -2], [250, 16], [200, 25], [-200, 25], [-252, 10]], "fill": "card"},
        {"type": "poly", "points": [[-236, -2], [-296, -18], [-280, -26], [-205, -14]], "fill": "red", "shadow": 0.4},
        {"type": "poly", "points": [[208, -22], [234, -18], [243, -7], [214, -9]], "fill": "blue", "shadow": 0},
        {"type": "seq", "from": [-170, -9], "to": [160, -9], "pattern": "ooooooooooooooo", "size": 8, "color": "blue"},
        {"type": "rect", "x": 0, "y": 8, "w": 420, "h": 5, "fill": "blue", "shadow": 0, "grain": False},
        {"type": "poly", "points": [[-30, 6], [70, 6], [-30, 44], [-75, 44]], "fill": "blue"},
        {"type": "rect", "x": 85, "y": 52, "w": 100, "h": 36, "rx": 17, "fill": "#9aa1a3"},
        {"type": "rect", "x": 133, "y": 52, "w": 6, "h": 30, "fill": "ink", "shadow": 0, "grain": False}
    ]}
    if until: el["until"] = until
    if keys: el["keys"] = keys
    return el

def runway(rid, until, speed_keys, at=0.1):
    return [
        {"id": rid, "type": "rect", "x": 800, "y": 712, "w": 1800, "h": 70, "fill": "#5d6366", "shadow": 0.4, "until": until, "z": 1, "in": {"fx": "unfold", "at": at, "dur": 0.8}},
        {"id": rid + "-dash", "type": "flow", "points": [[1750, 712], [-150, 712]], "smooth": False, "glyph": "dash", "size": 26, "color": "#f4efe6", "spacing": 150, "speed": 0, "alpha": 0.9, "until": until, "z": 2,
         "in": {"fx": "fade", "at": at + 0.4}, "keys": speed_keys}
    ]

def arrow(aid, frm, to, color, at, until=None, out=None, width=9):
    e = {"id": aid, "type": "arrow", "from": frm, "to": to, "color": color, "width": width, "z": 7, "in": {"fx": "draw", "at": at, "dur": 0.7}}
    if until: e["until"] = until
    if out: e["out"] = out
    return e

def tag(tid, text, x, y, fill, at, color=None, size=30, fx="pop", until=None, rotate=0, out=None):
    e = {"id": tid, "type": "tag", "text": text, "x": x, "y": y, "fill": fill, "size": size, "z": 8, "rotate": rotate, "in": {"fx": fx, "at": at}}
    if color: e["color"] = color
    if until: e["until"] = until
    if out: e["out"] = out
    return e

def cue(say, zh, caption=None):
    c = {"say": say, "tr": {"zh": zh}}
    if caption: c["caption"] = caption
    return c

airfoil = [[430, 488], [470, 440], [560, 398], [700, 372], [850, 368], [1000, 386], [1130, 425], [1210, 470], [1130, 482], [1000, 496], [850, 505], [700, 507], [560, 503], [470, 498]]

story = {
  "meta": {
    "title": "How does a plane take off?",
    "topic": "Thrust, lift and speed: how a 78-ton airliner leaves the ground",
    "audience": "Curious learners, age 12+",
    "language": "en-US",
    "style": "papercraft",
    "format": "16:9",
    "palette": {"blue": "#5f8fb0", "bg": "#e8dfcf"},
    "music": {"mood": "warm", "volume": 0.13},
    "ttsVoice": "af_heart",
    "subtitleDefault": "both",
    "cuePause": 0.6,
    "endTitle": "Engines make speed. Wings turn speed into lift.",
    "credit": "by Dong · Paper Explainer · English narration · EN/中文 subtitles",
    "slug": "how-a-plane-takes-off",
    "watermark": "by Dong"
  },
  "scenes": [
    {"id": "hook", "title": "How does a 78-ton plane take off?",
     "cues": [cue("A passenger jet weighs about seventy-eight tons.", "一架客机重约 78 吨。", "A passenger jet weighs about 78 tons."),
              cue("So how does all that weight leave the ground?", "这么重的东西，是怎么离开地面的？")],
     "elements": runway("rw1", "thrust", [{"at": "thrust:c2", "dur": 5.5, "ease": "in", "speed": 620}]) + [
        plane("plane1", 760, 586, "c1+0.2", until="thrust"),
        tag("ton", "78 t", 760, 420, "accent", "c1+1.2", size=44, fx="stamp", out={"fx": "pop", "at": "forces:start"}, until="forces")]},
    {"id": "forces", "title": "Four forces at work",
     "cues": [cue("Four forces act on the plane.", "飞机受到四种力的作用。"),
              cue("Weight pulls it down. Thrust pushes it forward.", "重力把它往下拉，推力把它往前推。"),
              cue("Drag holds it back. And lift pushes it up.", "阻力把它往后拖，升力把它往上托。")],
     "elements": [
        arrow("fW", [760, 600], [760, 742], "red", "c2"),
        tag("tW", "Weight", 880, 712, "red", "c2+0.4", color="#ffffff", size=26),
        arrow("fT", [1135, 590], [1330, 590], "blue", "c2+1.6"),
        tag("tT", "Thrust", 1420, 590, "blue", "c2+2.0", color="#ffffff", size=26),
        arrow("fD", [345, 586], [170, 586], "muted", "c3"),
        tag("tD", "Drag", 110, 520, "card", "c3+0.4", size=26),
        arrow("fL", [760, 520], [760, 300], "accent", "c3+1.4"),
        tag("tL", "Lift", 870, 310, "accent", "c3+1.8", size=26)]},
    {"id": "thrust", "title": "Thrust: throw air backwards",
     "cues": [cue("The engines suck in air and blast it out the back.", "发动机吸入空气，再从尾部高速喷出。"),
              cue("Push air backwards, and the plane is pushed forwards.", "把空气往后推，飞机就被往前推。"),
              cue("It speeds up, faster and faster, down the runway.", "它在跑道上越跑越快。")],
     "elements": [
        {"id": "intake", "type": "flow", "points": [[1150, 656], [960, 656]], "smooth": False, "glyph": "dot", "size": 9, "color": "blue", "spacing": 40, "speed": 160, "z": 6, "in": {"fx": "grow", "at": "c1+0.3"}},
        {"id": "exhaust", "type": "flow", "points": [[820, 656], [250, 640]], "smooth": False, "lanes": [-8, 0, 8], "glyph": "dash", "size": 12, "color": "muted", "alpha": 0.75, "spacing": 70, "speed": 520, "z": 6, "in": {"fx": "grow", "at": "c1+0.8"}},
        tag("tExh", "Air out → back", 250, 560, "card", "c1+1.4", size=24, out={"fx": "fade", "at": "c3"}),
        arrow("fT2", [1135, 590], [1360, 590], "blue", "c2+0.6", width=11),
        tag("tT2", "Plane → forward", 1330, 515, "blue", "c2+1.0", color="#ffffff", size=24),
        {"id": "spd", "type": "counter", "x": 1370, "y": 190, "fill": "card", "font": "mono", "size": 30, "format": "{v} km/h", "value": 0, "z": 9, "in": {"fx": "drop", "at": "c2+0.4"},
         "keys": [{"at": "c2+0.6", "dur": 5.6, "ease": "in", "value": 180}]}]},
    {"id": "wing", "title": "The secret is in the wing",
     "cues": [cue("Now cut the wing open, and look at its shape.", "把机翼切开，看看它的截面。"),
              cue("It's curved on top, and tilted slightly upward.", "它上表面弯曲，而且略微向上倾斜。")],
     "elements": [
        {"id": "foil", "type": "poly", "smooth": True, "points": airfoil, "fill": "blue", "rotate": -5, "origin": [820, 440], "until": "lift", "z": 5, "in": {"fx": "draw", "at": "c1+0.4", "dur": 1.4}},
        {"id": "chord", "type": "curve", "from": [380, 495], "to": [1280, 495], "color": "ink", "width": 2.5, "dashed": "10 10", "z": 4, "in": {"fx": "draw", "at": "c2+0.6"}},
        {"id": "aoa", "type": "angle", "vertex": [430, 494], "from": 0, "to": 9, "r": 120, "fill": "accent", "label": "", "z": 3, "in": {"fx": "grow", "at": "c2+1.0"}},
        tag("tAoa", "tilted ≈ 5°", 330, 400, "accent", "c2+1.4", size=26),
        tag("tCurve", "curved top", 850, 290, "card", "c2+0.2", size=26)]},
    {"id": "lift", "title": "Bending the air makes lift",
     "cues": [cue("Air flowing over the curved top speeds up, and its pressure drops.", "流过弯曲上表面的空气加速，压强随之降低。"),
              cue("The wing also pushes the air below it downward.", "机翼还把下方的空气往下推。"),
              cue("Lower pressure above, air pushed down below. Together, they push the wing up.", "上方压强低、下方空气被下压，两者一起把机翼往上托。"),
              cue("That upward push is lift.", "这个向上的力，就是升力。")],
     "elements": [
        {"id": "fa1", "type": "flow", "points": [[120, 400], [430, 405], [650, 330], [900, 320], [1180, 370], [1500, 410]], "glyph": "arrow", "size": 13, "color": "accent2", "spacing": 90, "speed": 300, "z": 6, "in": {"fx": "grow", "at": "c1+0.2"}},
        {"id": "fa2", "type": "flow", "points": [[120, 320], [450, 322], [700, 265], [950, 262], [1230, 300], [1500, 330]], "glyph": "arrow", "size": 13, "color": "accent2", "spacing": 90, "speed": 300, "z": 6, "in": {"fx": "grow", "at": "c1+0.5"}},
        {"id": "fb1", "type": "flow", "points": [[120, 560], [450, 562], [800, 590], [1150, 620], [1500, 690]], "glyph": "arrow", "size": 13, "color": "red", "spacing": 90, "speed": 170, "z": 6, "in": {"fx": "grow", "at": "c2+0.2"}},
        {"id": "fb2", "type": "flow", "points": [[120, 640], [450, 642], [800, 665], [1150, 700], [1500, 770]], "glyph": "arrow", "size": 13, "color": "red", "spacing": 90, "speed": 170, "z": 6, "in": {"fx": "grow", "at": "c2+0.5"}},
        {"id": "lLow", "type": "label", "x": 1270, "y": 215, "anchor": [960, 330], "text": "Faster air", "sub": "lower pressure on top", "bar": "accent2", "z": 9, "in": {"fx": "fade", "at": "c1+1.2"}},
        {"id": "lHigh", "type": "label", "x": 1330, "y": 690, "anchor": [1000, 590], "text": "Air pushed down", "sub": "the wing is pushed up", "bar": "red", "z": 9, "in": {"fx": "fade", "at": "c2+0.8"}},
        arrow("fL2", [820, 420], [820, 170], "accent", "c4", width=14),
        tag("tL2", "LIFT", 940, 190, "accent", "c4+0.3", size=40, fx="stamp")]},
    {"id": "speed", "title": "Lift needs speed",
     "cues": [cue("Lift grows with the square of speed.", "升力与速度的平方成正比。", "Lift grows with the square of speed (lift ∝ v²)."),
              cue("Double the speed, and you get four times the lift.", "速度翻一倍，升力变成四倍。", "Double the speed → 4× the lift."),
              cue("That's why a plane needs a long runway to build up speed.", "所以飞机需要一条长跑道来加速。")],
     "elements": [
        {"id": "chartDraw", "type": "chart", "x": 1030, "y": 480, "w": 760, "h": 440, "title": "Lift vs speed", "bar": "blue", "z": 6, "smooth": True, "shadow": 0,
         "series": [{"points": [[i / 10, round(0.95 * (i / 10) ** 2, 3)] for i in range(11)], "color": "accent2", "width": 6},
                    {"points": [[0, 0.62], [1, 0.62]], "color": "red", "width": 4}],
         "note": "teal = lift   ·   red = weight   ·   speed →", "in": {"fx": "draw", "at": "c1+0.3", "dur": 2.4}},
        tag("t2x", "2× speed", 300, 440, "blue", "c2+0.2", color="#ffffff", size=40, fx="stamp", rotate=-3),
        tag("t4x", "= 4× lift", 330, 540, "accent", "c2+0.9", size=46, fx="stamp", rotate=2),
        {"id": "rwIcon", "type": "tag", "text": "runway ≈ 2–3 km", "x": 320, "y": 660, "fill": "card", "size": 28, "z": 8, "in": {"fx": "rise", "at": "c3+0.3"}}]},
    {"id": "climb", "title": "Rotate, lift off, climb", "tail": 2.4,
     "cues": [cue("At about two hundred and seventy kilometers per hour, lift becomes bigger than weight.", "速度达到约每小时 270 公里时，升力超过了重力。", "At about 270 km/h, lift becomes bigger than weight."),
              cue("The pilot pulls back, and the nose tilts up.", "飞行员向后拉杆，机头抬起。"),
              cue("The wheels leave the runway, and the plane climbs away.", "轮子离开跑道，飞机爬升远去。")],
     "elements": runway("rw2", "climb", [{"at": 0.1, "dur": 0.01, "speed": 900}], at=0.05) + [
        plane("plane2", 600, 586, 0.15, until="climb", fx="fade", gear_out="climb:c3+0.9",
              keys=[{"at": "c2+0.2", "dur": 1.6, "ease": "inOut", "rotate": -11},
                    {"at": "c3", "dur": 5.0, "ease": "in", "x": 1500, "y": 220}]),
        arrow("fL3", [600, 515], [600, 230], "accent", "c1+0.8", out={"fx": "fade", "at": "c3"}, width=12),
        tag("tL3", "Lift", 710, 250, "accent", "c1+1.1", size=26, out={"fx": "fade", "at": "c3"}),
        arrow("fW3", [600, 610], [600, 700], "red", "c1+1.5", out={"fx": "fade", "at": "c3"}, width=10),
        tag("tW3", "Weight", 720, 712, "red", "c1+1.8", color="#ffffff", size=26, out={"fx": "fade", "at": "c3"}),
        {"id": "spd2", "type": "counter", "x": 1370, "y": 190, "fill": "card", "font": "mono", "size": 30, "format": "{v} km/h", "value": 220, "z": 9, "in": {"fx": "fade", "at": 0.2},
         "keys": [{"at": 0.3, "dur": 3.0, "ease": "out", "value": 270}]}]},
    {"id": "end", "title": "Engines make speed.\nWings turn it into lift.", "titlePos": "center", "titleSize": 64, "tail": 1.6,
     "cues": [cue("Engines make speed. Wings turn speed into lift.", "发动机制造速度，机翼把速度变成升力。"),
              cue("That's how a plane takes off.", "这就是飞机起飞的原理。")],
     "elements": [
        {"id": "c1", "type": "card", "x": 560, "y": 700, "w": 330, "h": 150, "fill": "blue", "icon": "arrow", "title": "THRUST", "size": 40, "torn": 1.5, "in": {"fx": "drop", "at": "c1+0.2"}},
        {"id": "c2", "type": "card", "x": 1040, "y": 700, "w": 330, "h": 150, "fill": "accent", "icon": "rocket", "title": "LIFT", "size": 40, "torn": 1.5, "in": {"fx": "drop", "at": "c1+1.4"}}]}
  ]
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "story.json")
json.dump(story, open(out, "w"), ensure_ascii=False, indent=1)
print(out)
