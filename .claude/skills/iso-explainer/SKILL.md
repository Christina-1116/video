---
name: iso-explainer
description: 输入一个关键词/主题，制作“X 光线稿等距说明动画”视频（参考视频同款）——一个主角物体被白色线条逐笔描出、内部组件以青色 X 光显影、粒子与力箭头让看不见的气流/力/数据可见、物体自身移动翻转、镜头一镜到底跟随，配标题区、标注、读数、内嵌图表、逐句字幕与结尾金句卡（MP4 + SRT）。也支持多组件系统流程图风格。可自定义主题、受众、语言、调色板、时长和旁白；默认先渲染故事板预览给用户确认，再出成片；也能拆解新的参考视频并参数化。Use when the user asks for an isometric / 等距 / 2.5D / wireframe / x-ray explainer animation, a "how X works" video for a machine, product, process, system or concept, or wants this explainer style from a keyword.
---

# Iso Explainer：关键词 → X 光线稿等距说明动画

确定性渲染引擎（SVG + Playwright + ffmpeg），画面是时间 t 的纯函数。**你（Claude）负责把关键词变成故事板 JSON**（主角建模 + 分镜 + 字幕）；脚本负责渲染故事板预览、成片和字幕。

```
关键词 → ①需求 → ②选主角&拆原理 → ③建模 object → ④分镜 JSON → ⑤validate → ⑥故事板预览 ⇄ 用户确认
                                                               → ⑦(可选)旁白 → ⑧成片 MP4+SRT → ⑨抽帧自检 → 交付
```

## 必读
- `references/style-breakdown.md` —— 参考视频逐段拆解与设计规范（版式数值、配色、动作语法、叙事模板、字幕规律）。**写分镜前必读。**
- `references/storyboard-schema.md` —— JSON 字段全集（object 零件、动作参数）。**写 JSON 前必读。**
- `examples/drone-zh.json` —— 同款风格完整示例（四旋翼无人机，58 s）。新视频从它复制改起最快。
- `examples/rag-zh.json` / `examples/https-en.json` —— flat 风格（多组件系统流程）示例。

脚本（`$SKILL` = 本 skill 目录）：`scripts/render.js validate|preview|frame|video`、`scripts/tts.py`、`scripts/analyze_reference.sh`。
依赖：Node ≥ 18 + `playwright`（Chromium）、ffmpeg；旁白可选 `pip install edge-tts`。浏览器打开 `engine/index.html?sb=../examples/drone-zh.json` 可实时预览（空格暂停，←/→ 跳秒）。

## ① 需求（缺省就用默认值，一句话告知用户，不连环追问）
| 参数 | 默认 |
|---|---|
| 主题 | 用户的关键词 |
| 受众 | 对该领域零基础的大众（专业受众 → 更多术语与具体数字） |
| 语言 | 跟随用户的语言；字幕与旁白同语言 |
| 调色板 | `midnight`（参考同款深蓝 X 光）；浅色版 `draft`；流程图风格可用 `paper` `blueprint` `mint` `sunset` `mono`；或用户品牌色（`{"base":"midnight","teal":"#…","orange":"#…"}`） |
| 时长 | 55–60 s（开场 + 3–4 章 + 结尾卡）；用户给时长则按比例增减章节 |
| 旁白 | 默认仅字幕；要旁白则在 ⑦ 生成 |
| 画幅 | 1920×1080；竖屏 1080×1920 时主体放中上、标题区缩短 |

## ② 选主角 & 拆原理
- **主角物体**：把关键词落到一个可画的“东西”上。机器/产品 → 它本身（无人机、火箭、汽车、心脏、发动机、芯片、风力机）；流程/系统 → 承载它的设备或一个隐喻物体（“HTTPS”→ 一封带锁的信封穿过路由器；“光合作用”→ 叶片剖面）；纯概念 → 用 flat 风格的多组件图（见 rag 示例）。
- **拆成 2–3 招**（参考视频是“两招 + 组合应用 + 代价”）：每招 = 一个部件 + 一个物理/逻辑机制 + 一个可见效果。
- 为每招准备：要 X 光显影的**内部零件组**、要可视化的**流（粒子）**和**力（箭头）**、一个**具体数字**（读数/胶囊/图表）。
- 最后一章讲**代价/局限**（配 chart），结尾卡用**对仗金句**（白一行 + 青一行）。

## ③ 建模 object（最关键的一步）
- 用 `extrude` 画主体侧剖面（6–10 个点的多边形，沿 y 拉伸）→ 自动得到参考视频那种“截面 + 纵向棱线”的车身质感；挑 1–2 个上表面设 `glassFaces`。
- 圆形部件用 `cyl`/`wheel`/`fan`；内部部件用 `box`/`cyl` + `style: "hatch"` + `group`；支架、侧裙、轨迹用 `line`。
- 尺寸：主体长 3–5 单位；坐标原点放在主体底部中心附近；`x` 正向 = 物体前方。
- 给每个要标注/喷射/受力的位置定义 `anchors`。
- 建完先 `render.js frame sb.json --t <主体刚描完的时间> --out f.png` 看一眼造型，再写后面的分镜。

## ④ 分镜 JSON（按 style-breakdown §7 模板）
| 镜头 | 时长 | header | 主要动作 |
|---|---|---|---|
| 开场 | 6–7 s | kicker 话题 · 系列 / title 反常识钩子 / subtitle / tag 背景胶囊 | `build` 主角（4 s 左右，线条逐条生长） |
| 01 第一招 | 10–14 s | `01 · 关键词` / 动作+结果短句 / 组成部分 | `build` 零件组 → `highlight` → `annotate` ×2 → `emit`/`stream` → `force` → `move` 展示效果 + `readout` |
| 02 第二招 | 10–14 s | 同上 | 同上，可加 `fact` 讲定律 |
| 03 组合/运动 | 8–11 s | 同上 | `move`（`arc`、`rot` 翻转）+ `camera.follow` + `readout` 实时角度/速度 |
| 04 代价 | 8–10 s | 含橙色 `tag` | `chart` + `readout` 递减 + 橙色标注 |
| 结尾 | 5–6 s | `null` | `overlay` 结尾卡（`backdrop: true`） |
规则：
- 每镜头只讲一件事；同屏最多 2 个标注 + 1 个读数；同屏强调色 ≤ 2 种（青=讲解对象/正向，橙=力/代价）。
- 标注朝空白处伸出（主体右侧用正 `dx`，左侧用负 `dx`），不要压住标题区（左上）和字幕区（底部）。
- 字幕：一句一事实；中文 14–28 字/句、≤ 4.5 字/秒；“先报名 → 讲机制 → 给数字 → 说结果”。
- 镜头 `pad` 1.5–1.8 让主角约占画宽 45%；物体移动的镜头用 `follow`。
- 文件写到用户工作目录（如 `./<slug>/<slug>.json`），不要写进 skill 目录。

## ⑤ 校验
```bash
node $SKILL/scripts/render.js validate ./<slug>/<slug>.json
```
修完所有 error；处理“字幕过密”等 warning。

## ⑥ 故事板预览（默认必做，先给用户看）
```bash
node $SKILL/scripts/render.js preview ./<slug>/<slug>.json --out ./<slug>/preview
```
产出 `storyboard.png`（每镜头关键帧 + 时间码 + 字幕 + 镜头/动作清单）、`storyboard.html`、`scene-XX.png`、`captions.srt`，约 10 秒。
**先自己看 `storyboard.png`**：主角是否够大、标注是否遮挡/出界、图表标签是否重叠、粒子方向是否正确、header 是否压到主体。有问题改 JSON 重渲，再把预览图 + 一张镜头表（镜头/时长/字幕）发给用户确认。任意时刻全分辨率画面：`render.js frame sb.json --t 12.5 --out f.png`。

## ⑦ 旁白（可选）
```bash
python3 $SKILL/scripts/tts.py ./<slug>/<slug>.json [--voice zh-CN-YunxiNeural] [--rate +5%]
```
生成 `<slug>-audio/scene-XX.mp3` 与 `<slug>.voiced.json`，渲染时镜头自动拉长到“音频 + 0.6 s”并混音。edge-tts 不可用时，用任何 TTS 或真人录音，把路径写进每个镜头的 `"audio"`。背景音乐：`meta.bgm` 或 `--bgm music.mp3 --bgm-volume 0.12`。

## ⑧ 成片
```bash
node $SKILL/scripts/render.js video ./<slug>/<slug>.voiced.json --out ./<slug>/<slug>.mp4 --workers 4
```
1080p30、4 workers ≈ 8 帧/秒（60 s 约 4 分钟）。草稿：`--fps 15 --scale 0.5` 或 `--from 20 --to 30`。同时输出 `.srt`。

## ⑨ 自检 & 交付
抽 4–6 帧检查（`ffmpeg -ss T -i out.mp4 -frames:v 1 f.png`），再交付 MP4、SRT、JSON 路径；说明时长、镜头数、调色板/语言/受众，并告知可调参数（换调色板、`meta.duration`、加旁白、竖屏）。

## 拆解新的参考视频
```bash
bash $SKILL/scripts/analyze_reference.sh ref.mp4 ./ref-breakdown 0.2
ffmpeg -i ref.mp4 -af silencedetect=n=-35dB:d=0.35 -f null - 2>&1 | grep silence_   # 旁白断句
```
看 `contact.jpg`、`every2s/`，按 style-breakdown 末尾清单逐项记录，把差异写进 `meta.palette`（取色）与分镜节奏；缺的零件形状在 `engine/engine.js` 的 `partGeom()` 里加一个 case。

## 常见问题
- 主角太小/太大 → 调 `camera.pad`；运动镜头用 `follow` + `followOffset`。
- 标注重叠 → 调 `dx/dy`，或错开 `at`/`dur`。
- 零件组一开始就出现 → 确认有对 `"<id>.<group>"` 的 build/trace/assemble/show 动作。
- 翻转方向反了 → `rot` 取负值；`rot` = `[roll(x), pitch(y), yaw(z)]`，pitch 正值 = 机头（+x）向下。
- 中文方块字 → 安装 Noto Sans CJK / 文泉驿，或设 `meta.font`。Playwright 找不到浏览器 → 设 `CHROMIUM_PATH`。
