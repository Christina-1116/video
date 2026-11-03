#!/usr/bin/env python3
"""古今拜师短剧 · 剧本工具

一个 episode.json 同时是剧本、分镜表、字幕和剪辑表。子命令：

  check     校验结构：九段齐全、两次白闪、三招各有道具改动与领悟句、台词长度、总时长
  shotlist  生成分镜表 shotlist.md 和逐镜头生成提示词 prompts.jsonl（首帧图 + 运动描述）
  plan      生成逐镜头生产清单 production-plan.jsonl（参考节点、首帧/视频提示词）和导出字幕 export-cues.json
  subs      生成 ASS 特效字幕（底部台词、顶部「注：」、《标题》、竖排口诀、人名、标签、收尾卡）和 SRT
  animatic  不用任何素材，按时长生成占位样片：色卡 + 镜头号 + 动作，带白闪和字幕，用于审节奏
  assemble  把 clips/<镜头id>.mp4 按剧本裁到时长、加白闪转场、配 BGM、烧字幕，导出成片

用法：python3 episode.py <子命令> episode.json [-o 输出目录] [--clips 目录] [--bgm 文件]
"""
import argparse, json, math, os, re, shutil, subprocess, sys, tempfile

BEATS = ["hook", "flash_in", "intro", "move1", "move2", "move3", "flash_out", "contrast", "close"]
BEAT_ZH = {"hook": "现代冲突", "flash_in": "白闪穿越", "intro": "拜见古人", "move1": "第一招",
           "move2": "第二招", "move3": "第三招", "flash_out": "白闪回归", "contrast": "当代对照", "close": "收尾"}
MAX_SUB = 16          # 每条字幕最多 16 个字（参考片多在 6–12 个字）
MASTER_MAX = 22       # 古人每句台词最多 22 个字：他不讲课
FLASH_OUT, FLASH_IN = 0.45, 0.25   # 白闪：出镜头最后 0.45 秒提亮到白，入镜头前 0.25 秒从白恢复

SCENE_COLORS = {"modern": "0x9fb4c8", "ancient": "0xc9a56e", "card": "0x202020"}


def die(msg):
    print("error:", msg, file=sys.stderr); sys.exit(1)


def load(path):
    with open(path, encoding="utf-8") as f:
        ep = json.load(f)
    ep.setdefault("meta", {})
    m = ep["meta"]
    m.setdefault("size", [1280, 720]); m.setdefault("fps", 30)
    m.setdefault("font", "WenQuanYi Zen Hei"); m.setdefault("brush_font", m["font"])
    t = 0.0
    for i, s in enumerate(ep.get("shots", [])):
        s.setdefault("id", f"s{i+1:02d}")
        s.setdefault("lines", []); s.setdefault("overlays", {})
        s["start"] = t; t += float(s["dur"]); s["end"] = t
    ep["total"] = t
    return ep


def clen(text):
    return len(re.sub(r"[\s，。、！？；：“”‘’（）《》…—,.!?;:'\"()\-]", "", text))


def split_sub(text):
    """按参考片的做法切字幕：每个逗号/句号/问号处断开，一条一句，去掉所有标点（引号保留）。
    超过 MAX_SUB 字的分句再硬切。"""
    out = []
    for p in re.split(r"[，。！？；：、…—,.!?;:]+", text):
        p = p.strip()
        while clen(p) > MAX_SUB:
            out.append(p[:MAX_SUB]); p = p[MAX_SUB:]
        if p: out.append(p)
    return out


# ───────────────────────── check ─────────────────────────
def cmd_check(ep, args):
    errs, warns = [], []
    shots = ep.get("shots") or []
    if not shots: die("没有 shots")
    ids = [s["id"] for s in shots]
    if len(set(ids)) != len(ids): errs.append("镜头 id 有重复")
    seen = []
    for s in shots:
        b = s.get("beat")
        if b not in BEATS: errs.append(f"{s['id']}: beat 必须是 {BEATS} 之一，现在是 {b!r}")
        elif not seen or seen[-1] != b: seen.append(b)
        if float(s.get("dur", 0)) < 0.8: warns.append(f"{s['id']}: 时长 {s.get('dur')} 秒太短")
        if s.get("scene") not in SCENE_COLORS: errs.append(f"{s['id']}: scene 只能是 modern/ancient/card")
        for ln in s["lines"]:
            if ln.get("who") not in ep.get("cast", {}) and ln.get("who") not in ("vo", "passerby"):
                errs.append(f"{s['id']}: 说话人 {ln.get('who')!r} 不在 cast 里")
            if ln.get("who") == "master" and clen(ln["text"]) > MASTER_MAX:
                warns.append(f"{s['id']}: 古人这句 {clen(ln['text'])} 字，太像讲课了（≤{MASTER_MAX}）：{ln['text']}")
        need = sum(clen(x) for ln in s["lines"] for x in split_sub(ln["text"])) / 5.0  # 约每秒 5 字
        if need > float(s["dur"]) + 0.3:
            warns.append(f"{s['id']}: 台词约需 {need:.1f} 秒，镜头只有 {s['dur']} 秒")
    if [b for b in BEATS if b in seen] != BEATS or seen != BEATS:
        errs.append(f"段落顺序应为 {' → '.join(BEATS)}，现在是 {' → '.join(seen)}")
    flashes = [s["id"] for s in shots if s.get("transition") == "whiteflash"]
    if len(flashes) != 2: errs.append(f"应恰好有 2 次白闪（去古代、回现代），现在 {len(flashes)} 次：{flashes}")
    else:
        for fid, nxt in zip(flashes, ("ancient", "modern")):
            i = ids.index(fid)
            if i + 1 < len(shots) and shots[i + 1]["scene"] != nxt:
                errs.append(f"{fid} 白闪之后应切到 {nxt}")
    moves = ep.get("moves", [])
    if len(moves) != 3: errs.append("moves 应正好三招")
    for k, mv in enumerate(moves, 1):
        b = f"move{k}"
        bs = [s for s in shots if s.get("beat") == b]
        for key in ("name", "prop", "before", "after", "common_sense", "principle", "maxim"):
            if not mv.get(key): errs.append(f"moves[{k}] 缺 {key}")
        if not any(s.get("prop_change") for s in bs): errs.append(f"{b}: 没有镜头标出 prop_change（三招必须落在道具上）")
        if not any(s["overlays"].get("note") for s in bs): warns.append(f"{b}: 没有顶部「注：」原理条")
        if not any(s["overlays"].get("vertical") for s in bs): warns.append(f"{b}: 没有竖排对仗口诀")
        last = [ln for s in bs for ln in s["lines"]][-1:] if bs else []
        if not last or last[0]["who"] != "girl" or "原来" not in last[0]["text"]:
            warns.append(f"{b}: 最后一句应是女儿的领悟句「原来不是……是……」")
        if not any(s.get("reaction") for s in bs): warns.append(f"{b}: 没有标出路人反应镜头（reaction）")
    ct = [s for s in shots if s.get("beat") == "contrast"]
    if sum(1 for s in ct if s["overlays"].get("tag")) < 3:
        warns.append("contrast: 当代对照应有 3 个 tag，与三招一一对应")
    lo, hi = ep["meta"].get("target", [150, 200])
    if not lo <= ep["total"] <= hi: warns.append(f"总时长 {ep['total']:.1f} 秒，不在目标 {lo}–{hi} 秒内")
    for w in warns: print("warn:", w)
    for e in errs: print("error:", e)
    per = {}
    for s in shots: per[s.get("beat")] = per.get(s.get("beat"), 0) + float(s["dur"])
    print("段落时长：" + " | ".join(f"{BEAT_ZH.get(b,b)} {per.get(b,0):.1f}s" for b in BEATS))
    print(f"{len(shots)} 个镜头，共 {ep['total']:.1f} 秒（{int(ep['total']//60)}分{ep['total']%60:04.1f}秒）")
    if errs: sys.exit(1)
    print("ok")


# ───────────────────────── shotlist / prompts ─────────────────────────
def shot_prompt(ep, s):
    cast = ep.get("cast", {}); scenes = ep.get("scenes", {}); style = ep.get("style", {})
    who = s.get("cast") or sorted({ln["who"] for ln in s["lines"] if ln["who"] in cast})
    looks = [f"{cast[w]['name']}：{cast[w]['look']}" for w in who if w in cast]
    parts = [s.get("framing", ""), scenes.get(s.get("set") or s["scene"], ""), s.get("action", "")]
    if s.get("prop_state"): parts.append("道具：" + s["prop_state"])
    parts += looks
    parts.append(style.get(s.get("set") or "", style.get(s["scene"], style.get("all", ""))))
    parts.append(style.get("negative", ""))
    img = "；".join(p for p in parts if p)
    motion = s.get("motion") or s.get("action", "")
    return img, motion, who


def cmd_shotlist(ep, args):
    out = args.out; os.makedirs(out, exist_ok=True)
    md = [f"# 《{ep['meta'].get('title','')}》分镜表", "",
          f"原理：{ep['meta'].get('principle','')}  ", f"总长 {ep['total']:.1f} 秒，{len(ep['shots'])} 个镜头", ""]
    if ep.get("moves"):
        md += ["| 招 | 道具 | 改前 → 改后 | 女儿的常识 | 原理 | 口诀 |", "|---|---|---|---|---|---|"]
        for mv in ep["moves"]:
            md.append(f"| {mv['name']} | {mv['prop']} | {mv['before']} → {mv['after']} | {mv['common_sense']} | {mv['principle']} | {' / '.join(mv['maxim'])} |")
        md.append("")
    md += ["| # | 段落 | 时间 | 景别 | 画面 / 动作 | 台词 | 叠字 | 转场 |", "|---|---|---|---|---|---|---|---|"]
    jl = []
    for s in ep["shots"]:
        lines = "<br>".join(f"**{ep.get('cast',{}).get(l['who'],{}).get('name', l.get('name', l['who']))}**：{l['text']}" for l in s["lines"])
        ov = s["overlays"]; tags = []
        for k, lab in (("title", "标题"), ("note", "注"), ("vertical", "竖排"), ("name", "人名"), ("tag", "标签"), ("card", "卡")):
            if ov.get(k):
                v = ov[k]; v = v.get("text", v) if isinstance(v, dict) else v
                tags.append(f"{lab}：{' / '.join(v) if isinstance(v, list) else v}")
        act = s.get("action", "")
        if s.get("prop_change"): act += f"<br>🔧 **道具改动**：{s['prop_change']}"
        if s.get("reaction"): act += f"<br>👥 **路人反应**：{s['reaction']}"
        md.append(f"| {s['id']} | {BEAT_ZH.get(s['beat'], s['beat'])} | {s['start']:.1f}–{s['end']:.1f} | {s.get('framing','')} | {act} | {lines} | {'<br>'.join(tags)} | {'⚪白闪' if s.get('transition')=='whiteflash' else '切'} |")
        img, motion, who = shot_prompt(ep, s)
        jl.append({"id": s["id"], "dur": s["dur"], "scene": s["scene"], "cast": who,
                   "image_prompt": img, "motion_prompt": motion,
                   "dialogue": [{"who": l["who"], "text": l["text"]} for l in s["lines"]],
                   "ref_images": [ep["cast"][w].get("ref") for w in who if ep["cast"][w].get("ref")]})
    with open(os.path.join(out, "shotlist.md"), "w", encoding="utf-8") as f: f.write("\n".join(md) + "\n")
    with open(os.path.join(out, "prompts.jsonl"), "w", encoding="utf-8") as f:
        for j in jl: f.write(json.dumps(j, ensure_ascii=False) + "\n")
    print("wrote", os.path.join(out, "shotlist.md"), "and prompts.jsonl")


def cmd_plan(ep, args):
    """逐镜头生产清单：首帧图提示词 + 参考节点 + 运动提示词 + 时长；并输出成片导出用的字幕时间表。"""
    out = args.out; os.makedirs(out, exist_ok=True)
    lt = ep["meta"].get("libtv", {}); refs = lt.get("refs", {})
    rows = []
    for s in ep["shots"]:
        img, motion, who = shot_prompt(ep, s)
        r = [refs[w] for w in who if w in refs]
        setk = s.get("set") or s["scene"]
        if setk in refs: r.append(refs[setk])
        if "碗" in (s.get("action", "") + s.get("prop_state", "")) and "bowl" in refs: r.append(refs["bowl"])
        lines = "；".join(f"{ep['cast'].get(l['who'],{}).get('name', l.get('name','路人'))}说：“{l['text']}”" for l in s["lines"])
        rows.append({"id": s["id"], "beat": s["beat"], "start": round(s["start"], 2), "dur": s["dur"],
                     "transition": s.get("transition", "cut"), "ref_nodes": r, "image_prompt": img,
                     "video_prompt": (motion + ("。" + lines if lines else "")), "dialogue": s["lines"]})
    with open(os.path.join(out, "production-plan.jsonl"), "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    cues = [{"start": round(a, 2), "end": round(b, 2), "text": t} for a, b, t in sub_events(ep)]
    with open(os.path.join(out, "export-cues.json"), "w", encoding="utf-8") as f:
        json.dump({"timebase": "output", "cues": cues}, f, ensure_ascii=False, indent=1)
    print(f"wrote production-plan.jsonl ({len(rows)} shots) and export-cues.json ({len(cues)} cues)")


# ───────────────────────── subtitles ─────────────────────────
def ts(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def srt_ts(t):
    ms = int(round(t * 1000)); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"


def sub_events(ep):
    """台词 → 字幕条：在镜头内按字数比例分配时间，相邻台词之间留 0.08 秒空隙。"""
    ev = []
    for s in ep["shots"]:
        chunks = [c for ln in s["lines"] for c in split_sub(ln["text"])]
        if not chunks: continue
        lead = float(s.get("sub_offset", 0.15)); span = float(s["dur"]) - lead - 0.1
        tot = sum(max(clen(c), 2) for c in chunks); t = s["start"] + lead
        for c in chunks:
            d = span * max(clen(c), 2) / tot
            ev.append((t, t + d - 0.08, c)); t += d
    return ev


def overlay_runs(ep, key):
    """把连续镜头里相同的叠字合并成一段，避免逐镜头闪烁。"""
    runs = []
    for s in ep["shots"]:
        v = s["overlays"].get(key)
        if not v: continue
        sig = json.dumps(v, ensure_ascii=False, sort_keys=True)
        if runs and runs[-1][3] == sig and abs(runs[-1][1] - s["start"]) < 1e-6:
            runs[-1][1] = s["end"]
        else:
            runs.append([s["start"], s["end"], v, sig])
    return [(a, b, v) for a, b, v, _ in runs]


def esc(t):
    return t.replace("\\", "＼").replace("{", "｛").replace("}", "｝").replace("\n", "\\N")


def vert(text):
    return "\\N".join(ch for ch in text if ch.strip())


def cmd_subs(ep, args, out_dir=None):
    out = out_dir or args.out; os.makedirs(out, exist_ok=True)
    W, H = ep["meta"]["size"]; k = H / 720.0; f = ep["meta"]["font"]; bf = ep["meta"]["brush_font"]
    def sz(x): return int(round(x * k))
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{f},{sz(30)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,1,0,1,{sz(2.2)},{sz(1)},2,40,40,{sz(14)},1
Style: Note,{f},{sz(24)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,2,0,1,{sz(2)},{sz(1)},8,40,40,{sz(10)},1
Style: Title,{bf},{sz(52)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,4,0,1,{sz(3.5)},{sz(2)},8,40,40,{sz(14)},1
Style: Vert,{bf},{sz(40)},&H00FFFFFF,&H00FFFFFF,&H00202020,&H64000000,1,0,0,0,100,100,0,0,1,{sz(3)},{sz(1.5)},7,0,0,0,1
Style: Name,{bf},{sz(44)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,{sz(3)},{sz(2)},7,0,0,0,1
Style: Tag,{f},{sz(28)},&H00FFFFFF,&H00FFFFFF,&H00305FC8,&H00305FC8,1,0,0,0,100,100,2,0,3,{sz(8)},0,9,40,{sz(48)},{sz(70)},1
Style: Card,{bf},{sz(46)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,4,0,1,{sz(2)},0,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    L = []
    for a, b, t in sub_events(ep):
        L.append(f"Dialogue: 5,{ts(a)},{ts(b)},Sub,,0,0,0,,{esc(t)}")
    for a, b, v in overlay_runs(ep, "title"):
        L.append(f"Dialogue: 4,{ts(a)},{ts(b)},Title,,0,0,0,,{{\\fad(200,250)}}{esc(v)}")
    for a, b, v in overlay_runs(ep, "note"):
        txt = v if v.startswith("注") else "注：" + v
        L.append(f"Dialogue: 4,{ts(a)},{ts(b)},Note,,0,0,0,,{{\\fad(150,150)}}{esc(txt)}")
    for a, b, v in overlay_runs(ep, "vertical"):
        cols = v if isinstance(v, list) else [v]
        x0 = int(W * 0.022); colw = sz(54); y0 = int(H * 0.11)
        for i, col in enumerate(cols):        # 竖排自右向左读：第一列在最右
            x = x0 + (len(cols) - 1 - i) * colw
            L.append(f"Dialogue: 4,{ts(a)},{ts(b)},Vert,,0,0,0,,{{\\pos({x},{y0})\\fad(250,200)}}{vert(esc(col))}")
    for a, b, v in overlay_runs(ep, "name"):
        text, pos = (v["text"], v.get("pos", [0.64, 0.16])) if isinstance(v, dict) else (v, [0.64, 0.16])
        L.append(f"Dialogue: 4,{ts(a)},{ts(b)},Name,,0,0,0,,{{\\pos({int(pos[0]*W)},{int(pos[1]*H)})\\fad(300,200)}}{vert(esc(text))}")
    for a, b, v in overlay_runs(ep, "tag"):
        L.append(f"Dialogue: 6,{ts(a+0.2)},{ts(b)},Tag,,0,0,0,,{{\\fad(150,100)}} {esc(v)} ")
    for a, b, v in overlay_runs(ep, "card"):
        txt = "\\N".join(esc(x) for x in v) if isinstance(v, list) else esc(v)
        L.append(f"Dialogue: 6,{ts(a)},{ts(b)},Card,,0,0,0,,{{\\fad(400,400)}}{txt}")
    ass = os.path.join(out, "subs.ass")
    with open(ass, "w", encoding="utf-8-sig") as fh: fh.write(head + "\n".join(L) + "\n")
    with open(os.path.join(out, "subs.srt"), "w", encoding="utf-8") as fh:
        for i, (a, b, t) in enumerate(sub_events(ep), 1):
            fh.write(f"{i}\n{srt_ts(a)} --> {srt_ts(b)}\n{t}\n\n")
    if out_dir is None: print("wrote", ass, "and subs.srt")
    return ass


# ───────────────────────── render ─────────────────────────
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: die("ffmpeg 失败：\n" + " ".join(cmd) + "\n" + r.stderr[-2000:])


def has_audio(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", p],
                       capture_output=True, text=True)
    return bool(r.stdout.strip())


def shot_filters(ep, i):
    s = ep["shots"]; d = float(s[i]["dur"]); vf = []
    if s[i].get("transition") == "whiteflash":
        vf.append(f"fade=t=out:st={d-FLASH_OUT:.3f}:d={FLASH_OUT}:color=white")
    if i > 0 and s[i-1].get("transition") == "whiteflash":
        vf.append(f"fade=t=in:st=0:d={FLASH_IN}:color=white")
    return vf


def render(ep, args, source):
    W, H = ep["meta"]["size"]; fps = ep["meta"]["fps"]
    tmp = tempfile.mkdtemp(prefix="ep_"); parts = []
    for i, s in enumerate(ep["shots"]):
        d = float(s["dur"]); p = os.path.join(tmp, f"{i:03d}.mp4")
        base = [f"scale={W}:{H}:force_original_aspect_ratio=increase", f"crop={W}:{H}", f"fps={fps}", "setsar=1",
                f"tpad=stop_mode=clone:stop_duration={d}", f"trim=duration={d}", "setpts=PTS-STARTPTS"]
        vf = ",".join(base + shot_filters(ep, i) + ["format=yuv420p"])
        src = source(s, d, tmp)
        cmd = ["ffmpeg", "-v", "error", "-y"] + src
        if len(src) > 2 and has_audio(src[-1]) and not args.mute_clips:
            cmd += ["-filter_complex", f"[0:v]{vf}[v];[0:a]aresample=48000,apad,atrim=duration={d},asetpts=PTS-STARTPTS[a]", "-map", "[v]", "-map", "[a]"]
        else:
            cmd += ["-f", "lavfi", "-t", str(d), "-i", "anullsrc=r=48000:cl=stereo",
                    "-filter_complex", f"[0:v]{vf}[v]", "-map", "[v]", "-map", "1:a"]
        cmd += ["-t", str(d), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", p]
        run(cmd); parts.append(p)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as fh: fh.writelines(f"file '{p}'\n" for p in parts)
    cat = os.path.join(tmp, "cat.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", cat])
    ass = cmd_subs(ep, args, out_dir=tmp)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    fontsdir = args.fontsdir or ""
    sub = f"ass={ass}" + (f":fontsdir={fontsdir}" if fontsdir else "")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", cat]
    if args.bgm:
        cmd += ["-stream_loop", "-1", "-i", args.bgm, "-filter_complex",
                f"[0:v]{sub}[v];[1:a]volume={args.bgm_volume},atrim=duration={ep['total']},afade=t=out:st={max(0, ep['total']-2)}:d=2[b];[0:a][b]amix=inputs=2:normalize=0:duration=first[a]",
                "-map", "[v]", "-map", "[a]"]
    else:
        cmd += ["-vf", sub, "-map", "0:v", "-map", "0:a"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", args.output]
    run(cmd)
    if not args.keep: shutil.rmtree(tmp, ignore_errors=True)
    print(f"wrote {args.output}  ({ep['total']:.1f}s)")


def cmd_animatic(ep, args):
    W, H = ep["meta"]["size"]; f = ep["meta"]["font"]
    def source(s, d, tmp):
        txtf = os.path.join(tmp, s["id"] + ".txt")
        with open(txtf, "w", encoding="utf-8") as fh:
            fh.write(f"{s['id']} · {BEAT_ZH.get(s['beat'], s['beat'])} · {s.get('framing','')}\n{s.get('action','')[:60]}")
        col = SCENE_COLORS.get(s["scene"], "0x777777")
        if s["scene"] == "card":
            return ["-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:d={d}:r={ep['meta']['fps']}"]
        dt = (f"drawtext=font='{f}':textfile='{txtf}':fontcolor=white@0.9:fontsize={int(H*0.034)}:line_spacing=10:"
              f"x=(w-text_w)/2:y=h*0.42:box=1:boxcolor=black@0.35:boxborderw=14")
        return ["-f", "lavfi", "-i", f"color=c={col}:s={W}x{H}:d={d}:r={ep['meta']['fps']},{dt}"]
    render(ep, args, source)


def cmd_assemble(ep, args):
    if not args.clips: die("assemble 需要 --clips 目录（内含 <镜头id>.mp4/.mov/.png/.jpg）")
    missing = []
    def find(s):
        for ext in (".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg"):
            p = os.path.join(args.clips, s["id"] + ext)
            if os.path.exists(p): return p
        return None
    for s in ep["shots"]:
        if not find(s): missing.append(s["id"])
    if missing and not args.allow_missing:
        die("缺少镜头素材：" + ", ".join(missing) + "（加 --allow-missing 用占位色卡代替）")
    W, H = ep["meta"]["size"]
    def source(s, d, tmp):
        p = find(s)
        if not p:
            return ["-f", "lavfi", "-i", f"color=c={SCENE_COLORS.get(s['scene'])}:s={W}x{H}:d={d}:r={ep['meta']['fps']}"]
        if p.lower().endswith((".png", ".jpg", ".jpeg")):   # 静帧：定格铺满镜头时长
            return ["-loop", "1", "-t", str(d), "-i", p]
        return ["-i", p]
    render(ep, args, source)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["check", "shotlist", "subs", "plan", "animatic", "assemble"])
    ap.add_argument("episode")
    ap.add_argument("-o", "--out", default="out", help="shotlist/subs 的输出目录")
    ap.add_argument("--output", help="animatic/assemble 的输出 mp4（默认 <out>/animatic.mp4 或 <out>/final.mp4）")
    ap.add_argument("--clips", help="assemble：镜头素材目录")
    ap.add_argument("--allow-missing", action="store_true")
    ap.add_argument("--mute-clips", action="store_true", help="丢弃素材自带音轨")
    ap.add_argument("--bgm"); ap.add_argument("--bgm-volume", default="0.18")
    ap.add_argument("--fontsdir", help="ASS 字体目录（放书法体 ttf）")
    ap.add_argument("--keep", action="store_true", help="保留中间文件")
    args = ap.parse_args()
    ep = load(args.episode)
    if args.cmd in ("animatic", "assemble") and not args.output:
        args.output = os.path.join(args.out, "animatic.mp4" if args.cmd == "animatic" else "final.mp4")
    {"check": cmd_check, "shotlist": cmd_shotlist, "subs": cmd_subs, "plan": cmd_plan,
     "animatic": cmd_animatic, "assemble": cmd_assemble}[args.cmd](ep, args)


if __name__ == "__main__":
    main()
