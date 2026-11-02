#!/usr/bin/env python3
"""Generate takeoff-en.json and takeoff-zh.json (same visuals, two languages)."""
import json, copy, os
HERE = os.path.dirname(os.path.abspath(__file__))

def mirror(poly):  # mirror a planform (x,y) across the centerline
    return [[x, -y] for x, y in poly][::-1]

# ---------------- hero object: narrow-body airliner (local units, x = forward) ----------------
fus = [[-5.2, 1.3], [-3.0, 0.7], [3.8, 0.7], [4.8, 0.95], [5.3, 1.35], [4.8, 1.8], [4.0, 2.0], [-4.0, 2.0], [-5.45, 2.15]]
wingR = [[1.2, 0.62], [-1.5, 5.7], [-2.4, 5.7], [-1.6, 0.62]]
flapR = [[-1.55, 0.75], [-2.05, 3.4], [-2.45, 3.4], [-1.95, 0.75]]
stabR = [[-3.9, 0.35], [-5.0, 2.3], [-5.55, 2.3], [-5.0, 0.35]]
parts = [
    {"shape": "extrude", "plane": "xz", "span": [-0.66, 0.66], "profile": fus, "glassFaces": [5]},
    {"shape": "extrude", "plane": "xy", "span": [0.92, 1.04], "profile": wingR},
    {"shape": "extrude", "plane": "xy", "span": [0.92, 1.04], "profile": mirror(wingR)},
    {"shape": "extrude", "plane": "xy", "span": [1.92, 2.0], "profile": stabR},
    {"shape": "extrude", "plane": "xy", "span": [1.92, 2.0], "profile": mirror(stabR)},
    {"shape": "extrude", "plane": "xz", "span": [-0.06, 0.06], "profile": [[-3.7, 2.0], [-4.95, 3.95], [-5.6, 3.95], [-5.45, 2.0]]},
    # flaps (x-ray reveal in the rotate chapter)
    {"shape": "extrude", "plane": "xy", "span": [0.86, 0.94], "profile": flapR, "group": "flaps", "style": "hatch", "color": "teal"},
    {"shape": "extrude", "plane": "xy", "span": [0.86, 0.94], "profile": mirror(flapR), "group": "flaps", "style": "hatch", "color": "teal"},
]
for y in (2.1, -2.1):  # engines: nacelle + pylon + fan (fan revealed in thrust chapter)
    parts.append({"shape": "cyl", "axis": "x", "at": [-0.55, y, 0.5], "r": 0.42, "h": 1.75, "segments": 24})
    parts.append({"shape": "box", "at": [-0.2, y - 0.05, 0.9], "size": [0.9, 0.1, 0.06]})
    parts.append({"shape": "fan", "axis": "x", "at": [1.05, y, 0.5], "r": 0.36, "h": 0.04, "blades": 8, "spin": 1.6, "group": "fan", "style": "hatch", "color": "teal"})
    parts.append({"shape": "cyl", "axis": "x", "at": [-0.25, y, 0.5], "r": 0.22, "h": 1.2, "group": "fan", "style": "hatch", "color": "teal", "segments": 16})
for y in (1.0, -1.0):  # main gear
    parts.append({"shape": "line", "points": [[-0.6, y, 0.92], [-0.6, y, 0.24]], "group": "gear"})
    parts.append({"shape": "wheel", "axis": "y", "at": [-0.6, y - 0.11, 0.23], "r": 0.23, "h": 0.22, "group": "gear", "spokes": 6})
parts.append({"shape": "line", "points": [[3.8, 0, 0.72], [3.8, 0, 0.22]], "group": "gear"})
parts.append({"shape": "wheel", "axis": "y", "at": [3.8, -0.09, 0.2], "r": 0.2, "h": 0.18, "group": "gear"})
anchors = {
    "nose": [5.3, 0, 1.35], "cockpit": [4.4, 0, 1.9], "tail": [-5.3, 0, 3.9],
    "engR": [0.3, 2.1, 0.5], "engL": [0.3, -2.1, 0.5], "intakeR": [1.25, 2.1, 0.5], "exhaustR": [-0.6, 2.1, 0.5], "exhaustL": [-0.6, -2.1, 0.5],
    "wingTop": [-0.6, 3.2, 1.25], "wingBottom": [-0.9, 3.2, 0.8], "wingMid": [-0.8, 3.0, 1.0],
    "flap": [-2.0, 2.4, 0.9], "gear": [-0.6, 1.0, 0.4], "body": [0, 0, 1.4],
}
plane = {"id": "plane", "type": "object", "pos": [0, 0, 0], "parts": parts, "anchors": anchors}

runway = {"id": "runway", "type": "object", "pos": [0, 0, 0], "shadow": False, "parts": [
    {"shape": "extrude", "plane": "xy", "span": [-0.03, 0.0], "profile": [[-12, -3], [70, -3], [70, 3], [-12, 3]], "opacity": 0.28, "width": 1.2, "alpha": 0.55},
    {"shape": "line", "points": [[-11, 0, 0.0], [69, 0, 0.0]], "dashed": True, "alpha": 0.6},
] + [{"shape": "line", "points": [[-10.5, y, 0], [-8.0, y, 0]], "alpha": 0.6} for y in (-2.4, -1.8, -1.2, 1.2, 1.8, 2.4)]}

# ---------------- text (EN / ZH) ----------------
T = {
 "en": {
  "meta": {"title": "How a plane takes off", "topic": "Airliner takeoff: thrust, lift, rotation", "audience": "General audience",
           "language": "en-US", "brand": {"mark": "✈", "name": "AIRLINER", "tagline": "How it flies — explained"}, "voice": "English_Trustworthy_Man"},
  "h": [
    {"kicker": "Airliner · How it takes off", "title": "78 tons. Airborne in 40 seconds.", "subtitle": "Two forces, one wing", "tag": "Narrow-body jet · typical figures"},
    {"kicker": "01 · Thrust", "title": "Trick one: push air backwards", "subtitle": "Twin turbofans + Newton's third law"},
    {"kicker": "02 · Lift", "title": "Trick two: bend the airflow", "subtitle": "Curved, tilted wing + pressure difference"},
    {"kicker": "03 · Rotate", "title": "Rotate, then climb", "subtitle": "Pull back · flaps out · gear up"},
    {"kicker": "04 · The catch", "title": "Lift needs speed", "subtitle": "Lift grows with speed squared", "tag": "Runways run 2–3 km", "tagColor": "orange"},
  ],
  "fact": {"kicker": "Bernoulli + Newton", "text": "Faster air above means lower pressure. Air pushed down means wing pushed up."},
  "cap": [
    "This is a 78-ton passenger jet. In about 40 seconds, it will leave the ground.",
    "Trick one: thrust. Two turbofan engines swallow air and blast it out the back. By Newton's third law, the jet surges forward, to about 270 km/h.",
    "Trick two: lift. The wing is curved and tilted slightly up. Air over the top speeds up and its pressure drops, while the wing pushes the air below it down. That pressure difference lifts the wing.",
    "At rotation speed, the pilot pulls back. The nose rises about ten degrees, flaps add extra lift, and the wheels leave the runway.",
    "The catch: lift grows with the square of speed. Half the speed gives only a quarter of the lift. That's why runways are kilometers long.",
    "Engines to move. Wings to fly. That's how a plane takes off.",
  ],
  "nar": [
    "This is a seventy-eight-ton passenger jet. In about forty seconds, it will leave the ground.",
    "Trick one: thrust. Two turbofan engines swallow air and blast it out the back. By Newton's third law, the jet surges forward, to about two hundred and seventy kilometers per hour.",
    None, None, None, None],
  "ann": {"fan": ("Turbofan", "pulls in about a ton of air every second"), "exh": ("Air blasts back", "jet moves forward"),
          "top": ("Faster air, lower pressure", "over the curved upper surface"), "bot": ("Air pushed down", "higher pressure below"),
          "flap": ("Flaps extended", "more lift at low speed"), "gear": ("Gear up", "less drag in the climb"), "lift": ("Lift ∝ speed²", "")},
  "ro": {"spd": "SPEED {v} km/h", "pitch": "PITCH {v}°", "alt": "ALTITUDE {v} m"},
  "chart": {"title": "LIFT vs SPEED", "x": "SPEED →  takeoff ≈ 270 km/h", "lift": "Lift", "w": "Weight"},
  "end": {"mark": "✈", "kicker": "Takeoff", "title": "Engines to move.", "title2": "Wings to fly.", "footer": "Turbofans · Wings · Flaps"},
 },
 "zh": {
  "meta": {"title": "飞机是怎么起飞的", "topic": "客机起飞：推力、升力、抬轮", "audience": "大众科普",
           "language": "zh-CN", "brand": {"mark": "✈", "name": "AIRLINER", "tagline": "它如何起飞 — 图解"}, "voice": "Chinese (Mandarin)_Reliable_Executive"},
  "h": [
    {"kicker": "客机 · 起飞原理", "title": "78 吨，40 秒离地。", "subtitle": "两种力，一副机翼", "tag": "窄体客机 · 典型数据"},
    {"kicker": "01 · 推力", "title": "第一招：把空气往后推", "subtitle": "双涡扇发动机 + 牛顿第三定律"},
    {"kicker": "02 · 升力", "title": "第二招：让气流拐弯", "subtitle": "弯曲、上仰的机翼 + 上下压力差"},
    {"kicker": "03 · 抬轮", "title": "抬头，然后爬升", "subtitle": "拉杆 · 放襟翼 · 收起落架"},
    {"kicker": "04 · 代价", "title": "升力离不开速度", "subtitle": "升力与速度的平方成正比", "tag": "跑道长 2–3 公里", "tagColor": "orange"},
  ],
  "fact": {"kicker": "伯努利 + 牛顿", "text": "上方气流更快，压强更低；空气被向下推，机翼就被向上托。"},
  "cap": [
    "这是一架 78 吨重的客机。大约 40 秒后，它就会离开地面。",
    "第一招：推力。两台涡扇发动机吸进空气，再从尾部高速喷出。根据牛顿第三定律，飞机被反推向前，速度冲到约 270 公里每小时。",
    "第二招：升力。机翼上表面弯曲，还略微向上倾斜。上方气流更快、压强更低，下方的空气被机翼往下推。上下的压力差，把机翼托了起来。",
    "到达抬轮速度，飞行员向后拉杆。机头抬起约 10 度，襟翼提供额外升力，轮子离开跑道。",
    "代价是：升力和速度的平方成正比。速度减半，升力只剩四分之一。所以跑道动辄两三公里长。",
    "推力让它前进，机翼让它飞起。这就是飞机起飞的原理。",
  ],
  "nar": [
    "这是一架七十八吨重的客机。大约四十秒后，它就会离开地面。",
    "第一招：推力。两台涡扇发动机吸进空气，再从尾部高速喷出。根据牛顿第三定律，飞机被反推向前，速度冲到每小时约二百七十公里。",
    None,
    "到达抬轮速度，飞行员向后拉杆。机头抬起约十度，襟翼提供额外升力，轮子离开跑道。",
    None, None],
  "ann": {"fan": ("涡扇发动机", "每秒吸入约一吨空气"), "exh": ("空气向后喷", "飞机向前冲"),
          "top": ("上方：流速快、压强低", "气流沿弯曲的上表面加速"), "bot": ("下方：空气被往下推", "压强更高"),
          "flap": ("襟翼放出", "低速时多出一份升力"), "gear": ("收起落架", "爬升时减少阻力"), "lift": ("升力 ∝ 速度²", "")},
  "ro": {"spd": "速度 {v} km/h", "pitch": "俯仰 {v}°", "alt": "高度 {v} m"},
  "chart": {"title": "升力 vs 速度", "x": "速度 →  起飞约 270 km/h", "lift": "升力", "w": "重量"},
  "end": {"mark": "✈", "kicker": "起飞", "title": "推力让它前进。", "title2": "机翼让它飞起。", "footer": "涡扇 · 机翼 · 襟翼"},
 },
}

def build(lang):
    L = T[lang]; A = L["ann"]
    nar = [n if n else c for n, c in zip(L["nar"], L["cap"])]
    # estimated scene lengths (replaced by real narration length once audio exists)
    rate = 2.6 if lang == "en" else 4.3  # words/s or chars/s
    def est(i):
        n = len(nar[i].split()) if lang == "en" else len(nar[i])
        return round(max(6.0, n / rate + 1.2), 1)
    d = [est(i) for i in range(6)]
    d[0] = max(d[0], 7.0); d[5] = max(d[5], 6.0)
    # real narration clips (audio-<lang>/scene-01.mp3 …) override the estimate: scene = voice + 0.9 s
    audio = [os.path.join(HERE, f"audio-{lang}", f"scene-{i + 1:02d}.mp3") for i in range(6)]
    for i, a in enumerate(audio):
        if os.path.exists(a):
            import subprocess
            dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a]).decode().strip())
            d[i] = round(max(dur + 0.9, 6.0 if i in (0, 5) else 0), 2)
    sc = []
    sc.append({"id": "intro", "duration": d[0], "header": L["h"][0], "camera": {"focus": ["plane"], "pad": 1.35, "drift": 0.06},
               "caption": L["cap"][0], "narration": nar[0],
               "actions": [{"do": "build", "target": "runway", "at": 0.0, "dur": 2.0},
                           {"do": "build", "target": "plane", "at": 0.4, "dur": 4.6},
                           {"do": "trace", "target": "plane.gear", "at": 3.0, "dur": 1.6}]})
    sc.append({"id": "thrust", "duration": d[1], "header": L["h"][1], "camera": {"follow": "plane", "pad": 1.45, "followOffset": [40, 20]},
               "caption": L["cap"][1], "narration": nar[1],
               "actions": [{"do": "build", "target": "plane.fan", "at": 0.3, "dur": 1.6},
                           {"do": "annotate", "target": "plane", "point": "intakeR", "text": A["fan"][0], "sub": A["fan"][1], "dx": 250, "dy": 120, "at": 1.0, "dur": 4.5},
                           {"do": "stream", "target": "plane", "path": [[[3.6, 2.1, 0.5], [1.2, 2.1, 0.5]], [[3.6, -2.1, 0.5], [1.2, -2.1, 0.5]], [[3.6, 2.1, 0.75], [1.2, 2.1, 0.6]], [[3.6, -2.1, 0.25], [1.2, -2.1, 0.4]]], "particles": 4, "speed": 4, "color": "teal", "at": 1.0},
                           {"do": "emit", "target": "plane", "from": ["exhaustR", "exhaustL"], "dir": [-1, 0, 0], "spread": 7, "speed": 9, "rate": 34, "life": 0.6, "color": "orange", "color2": "line", "at": 2.0},
                           {"do": "annotate", "target": "plane", "point": [-3.2, -2.1, 0.5], "text": A["exh"][0], "sub": A["exh"][1], "color": "orange", "dx": -240, "dy": 90, "at": 3.2, "dur": 4.5},
                           {"do": "force", "target": "plane", "points": [[7.6, 0, 1.35]], "dir": [1, 0, 0], "length": 2.2, "color": "teal", "at": 3.4},
                           {"do": "move", "target": "plane", "by": [18, 0, 0], "at": 2.0, "dur": d[1] - 2.0, "ease": "in"},
                           {"do": "readout", "target": "plane", "point": "cockpit", "text": L["ro"]["spd"], "from": 0, "to": 180, "dx": 120, "dy": -170, "at": 2.0, "count": d[1] - 2.0, "ease": "in"}]})
    sc.append({"id": "lift", "duration": d[2], "header": L["h"][2], "fact": dict(L["fact"], at=d[2] * 0.45), "camera": {"follow": "plane", "pad": 1.3, "followOffset": [-60, 30]},
               "caption": L["cap"][2], "narration": nar[2],
               "actions": [{"do": "move", "target": "plane", "by": [16, 0, 0], "at": 0, "dur": d[2], "ease": "linear"},
                           {"do": "readout", "target": "plane", "point": "cockpit", "text": L["ro"]["spd"], "from": 180, "to": 250, "dx": 120, "dy": -170, "at": 0, "count": d[2], "ease": "linear"},
                           {"do": "highlight", "target": "plane", "at": 0.4, "dur": 1.6, "color": "teal"},
                           {"do": "stream", "target": "plane", "path": [[[3.2, y, 1.15], [1.4, y, 1.45], [-0.2, y, 1.5], [-2.0, y, 1.25], [-4.5, y, 1.1]] for y in (2.0, 3.3, 4.5)], "particles": 5, "speed": 7.5, "color": "teal", "size": 2.4, "at": 1.2},
                           {"do": "stream", "target": "plane", "path": [[[3.2, y, 0.95], [1.4, y, 0.85], [-1.0, y, 0.75], [-2.5, y, 0.55], [-4.5, y, 0.35]] for y in (2.6, 4.0)], "particles": 4, "speed": 4.2, "color": "orange", "size": 2.4, "at": 2.6},
                           {"do": "annotate", "target": "plane", "point": "wingTop", "text": A["top"][0], "sub": A["top"][1], "dx": 260, "dy": -150, "at": 1.6, "dur": d[2] - 2.4},
                           {"do": "annotate", "target": "plane", "point": "wingBottom", "text": A["bot"][0], "sub": A["bot"][1], "color": "orange", "dx": 250, "dy": 130, "at": 3.2, "dur": d[2] - 4.0},
                           {"do": "force", "target": "plane", "points": [[-0.6, 1.6, 2.7], [-1.0, 3.0, 2.7], [-1.4, 4.4, 2.7], [-0.6, -1.6, 2.7], [-1.0, -3.0, 2.7], [-1.4, -4.4, 2.7]], "dir": [0, 0, 1], "length": 1.5, "color": "orange", "at": d[2] * 0.62}]})
    sc.append({"id": "rotate", "duration": d[3], "header": L["h"][3], "camera": {"follow": "plane", "pad": 1.5, "followOffset": [-40, 40]},
               "caption": L["cap"][3], "narration": nar[3],
               "actions": [{"do": "move", "target": "plane", "by": [10, 0, 0], "at": 0, "dur": 2.0, "ease": "linear"},
                           {"do": "build", "target": "plane.flaps", "at": 0.6, "dur": 1.4},
                           {"do": "highlight", "target": "plane.flaps", "at": 1.8, "dur": 3.0, "color": "teal"},
                           {"do": "annotate", "target": "plane", "point": "flap", "text": A["flap"][0], "sub": A["flap"][1], "dx": -260, "dy": 120, "at": 1.4, "dur": 3.6},
                           {"do": "move", "target": "plane", "rot": [0, -11, 0], "at": 2.0, "dur": 1.8},
                           {"do": "readout", "target": "plane", "point": "nose", "text": L["ro"]["pitch"], "from": 0, "to": 11, "dx": 90, "dy": -150, "at": 2.0, "count": 1.8},
                           {"do": "move", "target": "plane", "by": [16, 0, 3.6], "at": 2.0, "dur": d[3] - 2.0, "ease": "in"},
                           {"do": "hide", "target": "plane.gear", "at": d[3] - 2.0, "dur": 1.2},
                           {"do": "annotate", "target": "plane", "point": "gear", "text": A["gear"][0], "sub": A["gear"][1], "dx": 230, "dy": 120, "at": d[3] - 2.4, "dur": 2.4}]})
    sc.append({"id": "catch", "duration": d[4], "header": L["h"][4], "camera": {"follow": "plane", "pad": 2.05, "followOffset": [230, -40]},
               "caption": L["cap"][4], "narration": nar[4],
               "actions": [{"do": "move", "target": "plane", "by": [16, 0, 3.0], "at": 0, "dur": d[4], "ease": "linear"},
                           {"do": "readout", "target": "plane", "point": "cockpit", "text": L["ro"]["alt"], "from": 0, "to": 120, "dx": 300, "dy": -150, "at": 0, "count": d[4], "ease": "linear"},
                           {"do": "chart", "title": L["chart"]["title"], "xlabel": L["chart"]["x"], "at": 0.8, "draw": 3.0,
                            "series": [{"label": L["chart"]["lift"], "color": "teal", "labelAt": 0.82, "points": [[i / 10, round(0.92 * (i / 10) ** 2, 3)] for i in range(11)]},
                                       {"label": L["chart"]["w"], "color": "orange", "labelAt": 0.15, "points": [[0, 0.58], [1, 0.58]]}]},
                           {"do": "annotate", "target": "plane", "point": "wingTop", "text": A["lift"][0], "dx": 380, "dy": 95, "at": 2.0, "dur": d[4] - 2.6}]})
    sc.append({"id": "outro", "duration": d[5], "header": None, "camera": {"follow": "plane", "pad": 2.6},
               "overlay": dict(L["end"], backdrop=True), "caption": L["cap"][5], "narration": nar[5],
               "actions": [{"do": "move", "target": "plane", "by": [14, 0, 2.5], "at": 0, "dur": d[5], "ease": "linear"}]})
    for i, a in enumerate(audio):
        if os.path.exists(a): sc[i]["audio"] = os.path.relpath(a, HERE); sc[i]["audioOffset"] = 0.3
    meta = dict(L["meta"], palette="midnight", width=1920, height=1080, fps=30, watermark="by Dong", audioPad=0.0, captionMaxChars=(30 if lang == "zh" else 96))
    return {"meta": meta, "nodes": [copy.deepcopy(runway), copy.deepcopy(plane)], "scenes": sc}

for lang in ("en", "zh"):
    sb = build(lang)
    json.dump(sb, open(os.path.join(HERE, f"takeoff-{lang}.json"), "w"), ensure_ascii=False, indent=1)
    print(lang, sum(s["duration"] for s in sb["scenes"]), "s")
