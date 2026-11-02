---
name: iso-explainer
description: 输入一个关键词/主题，制作“等距说明动画”视频——把流程、系统或概念变成带精准线条描摹、组件逐块组装、可见数据流动、连贯运镜和同步字幕的 isometric explainer（MP4 + SRT）。可自定义主题、受众、语言、调色板、时长和旁白；默认先渲染故事板预览给用户确认，再出成片。也能拆解一个参考视频并把它的风格参数化。Use when the user asks for an isometric / 等距 / 2.5D explainer animation, a process or architecture explainer video, a "how X works" animated diagram, or wants to replicate this explainer style from a keyword.
---

# Iso Explainer：关键词 → 等距说明动画

一个确定性的渲染引擎（SVG + Playwright + ffmpeg）。你（Claude）负责把关键词变成**故事板 JSON**；脚本负责把 JSON 变成故事板预览图和视频。所有画面都是 t 的纯函数，可任意跳帧、可复现。

```
关键词 ─► ①需求确认 ─► ②写故事板 JSON ─► ③validate ─► ④渲染故事板预览 ─► 用户确认/修改
                                                                    │
                                     ⑦交付 MP4+SRT ◄─ ⑥渲染成片 ◄─ ⑤(可选)生成旁白音频
```

## 文件
- `engine/` 渲染引擎（`index.html` 舞台、`engine.js`、`palettes.js`）。浏览器打开 `engine/index.html?sb=../examples/rag-zh.json` 可实时预览（空格暂停，←/→ 跳秒）。
- `scripts/render.js` —— `validate | preview | frame | video`
- `scripts/tts.py` —— 用 edge-tts 为每个镜头生成旁白，输出 `*.voiced.json`
- `scripts/analyze_reference.sh` —— 拆解参考视频（切点、关键帧、联系表、音轨）
- `references/style-breakdown.md` —— **风格拆解 / 设计规范，写故事板前必读**
- `references/storyboard-schema.md` —— **JSON 字段全集，写故事板前必读**
- `examples/rag-zh.json`（中文·paper·61s）、`examples/https-en.json`（英文·blueprint·36s）

依赖：Node ≥ 18 + `playwright`（Chromium）、`ffmpeg/ffprobe`；旁白可选 `pip install edge-tts`。
脚本路径都相对本 skill 目录，下文用 `$SKILL` 指代它。

## 工作流

### ① 需求确认（缺省即用默认值，不要连环追问）
| 参数 | 默认 |
|---|---|
| 主题 topic | 用户给的关键词 |
| 受众 audience | 对该领域零基础的大众 |
| 语言 language | 跟随用户提问语言 |
| 调色板 palette | 技术/架构 → `blueprint`；教育/通识 → `paper`；产品 → `mint`；营销 → `sunset`；严肃/学术 → `mono`；或用户给的品牌色 |
| 时长 duration | 60 s（约 6–8 个镜头） |
| 旁白 narration | 默认只有字幕；用户要求时生成旁白（音色可选） |
| 画幅 | 1920×1080；要竖屏用 1080×1920 并把布局改成纵向推进 |

用户只给了关键词时，直接按默认值进入下一步，把采用的默认值在回复里一句话列出来。

### ② 写故事板 JSON
先读 `references/style-breakdown.md` 和 `references/storyboard-schema.md`，再动笔。步骤：
1. **拆概念**：列出 4–8 个“角色”（参与者/组件/数据存储）和它们之间的 4–10 条关系（谁把什么交给谁）。抽象概念也要物化：例如“注意力机制”→ token 方块、打分芯片、加权求和的管道。
2. **选元件**：每个角色映射一个节点类型（人→`person`，客户端→`screen`，服务→`server`，存储→`database`，模型/处理→`chip`/`ai`，外部网络→`cloud`，入口/关卡→`gate`，文件→`doc`，区域→`platform`）。
3. **摆布局**：主流程沿 +x（屏幕右下）推进，分支沿 ±y；节点间距 ≥ 2 单位；希望管道笔直就让两端中心共享 x 或 y；用 1–3 个 `platform` 划分区域，平台后沿留空给标题；返回路径用 `route: "arc"`。
4. **分镜头**：按 style-breakdown §9 的叙事模板，每个镜头只讲一件事、新增 1–3 个元素，遵循“出现(build) → 连接(link) → 流动(flow) → 强调(highlight/callout)”四拍；`camera.focus` 指向本镜头的主角，讲局部时加 `dim: true`；最后一个镜头 `focus: "all"` + 所有管道 `until: "end"` 流动 + 一句话总结。
5. **写字幕**：口语化、每镜头 1–2 句；中文 ≤ 4.5 字/秒（英文 ≤ 15 字符/秒）；按受众调整术语深度（零基础用类比，专业受众给关键数字/术语）。
6. 文件保存在用户工作目录（如 `./<slug>/<slug>.json`），不要写进 skill 目录。

### ③ 校验
```bash
node $SKILL/scripts/render.js validate ./<slug>/<slug>.json
```
修完所有 error；warning 中的“字幕过密”“动作晚于镜头结束”也要处理。

### ④ 渲染故事板预览（默认必做，先给用户看）
```bash
node $SKILL/scripts/render.js preview ./<slug>/<slug>.json --out ./<slug>/preview
```
产出 `storyboard.png`（联系表：每镜头关键帧 + 时间码 + 字幕 + 镜头/动作清单）、`storyboard.html`、`scene-XX.png`、`captions.srt`。约 10 秒。
**自己先看一遍 `storyboard.png`（必要时看单张 `scene-XX.png`）**，检查：元件重叠、名牌/气泡遮挡、管道穿模、平台标题被挡、取景过松/过紧、字幕截断。有问题直接改 JSON 重渲，再把预览发给用户，附一张镜头表（镜头 / 时长 / 字幕），询问是否需要调整。
需要看某一时刻的完整分辨率画面：`render.js frame sb.json --t 12.5 --out f.png`。

### ⑤ 旁白（可选）
```bash
python3 $SKILL/scripts/tts.py ./<slug>/<slug>.json [--voice zh-CN-YunxiNeural] [--rate +5%]
```
生成 `<slug>-audio/scene-XX.mp3` 和 `<slug>.voiced.json`；渲染时每个镜头自动拉长到“音频 + 0.6 s”，并把音频混到镜头起点。edge-tts 不可用时，可用其他 TTS 工具或真人录音，把文件路径写进每个镜头的 `"audio"` 字段即可。需要背景音乐：`meta.bgm` 或 `--bgm music.mp3 --bgm-volume 0.12`。

### ⑥ 渲染成片
```bash
node $SKILL/scripts/render.js video ./<slug>/<slug>.json --out ./<slug>/<slug>.mp4 [--workers 4] [--fps 30] [--crf 18]
```
- 速度参考：1080p30，4 workers ≈ 8 帧/秒（60 s 视频约 4 分钟）。草稿可用 `--fps 15 --scale 0.5` 或 `--from 20 --to 30` 只渲一段。
- 同时输出同名 `.srt`（画面里已烧录字幕；SRT 供平台外挂/二次剪辑）。
- 渲完抽 3–4 帧检查（`ffmpeg -ss T -i out.mp4 -frames:v 1 f.png`）再交付。

### ⑦ 交付
给出 MP4、SRT、故事板 JSON 路径，说明总时长、镜头数、采用的调色板/语言/受众，并提示可以改哪些参数再渲染（换调色板、改时长 `meta.duration`、加旁白、改竖屏）。

## 拆解参考视频（用户提供了视频时）
```bash
bash $SKILL/scripts/analyze_reference.sh reference.mp4 ./ref-breakdown
```
查看 `contact.jpg`、`shots/`、`every2s/`，按 `references/style-breakdown.md` 末尾的「拆解清单」逐项记录：元件、出场方式、流动表现、运镜、字幕样式、配色、节奏。然后把差异落到 `meta`（自定义 `palette` 取色、`unit`、`lineWidth`、`captionSize`、`cameraDrift`、`dropHeight`）和镜头节奏里；若出现引擎没有的元件，用现有类型组合（`block` 叠层、`chip`+`icon`）近似，或在 `engine.js` 的 `nodeParts()` 里新增一个 case。
注意：这种风格通常是一镜到底，场景切换检测可能只有 0–2 个切点，以 `every2s/` 的采样为准。

## 常见问题
- **元件挡住名牌/文字**：拉开节点间距，或调整 `camera.pad`；平台标题用 `titlePos` 挪到空处。
- **管道斜穿**：让两端中心对齐，或改 `route: "xy"/"yx"`，或用 `via` 指定拐点。
- **镜头太近/太远**：`pad`（默认 1.25，越大越远）或直接给 `zoom`。
- **想要硬切**：该镜头 `camera.ease: 0`。
- **中文显示成方块**：安装 Noto Sans CJK / 文泉驿字体，或设置 `meta.font`。
- **Playwright 找不到浏览器**：设置 `CHROMIUM_PATH=/path/to/chromium`。
