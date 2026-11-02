# 视频风格拆解：X 光线稿等距说明动画

这份拆解来自用户上传的参考视频：Roadster「HOW IT FLIES — EXPLAINED」，57.9 秒，1280×720，30fps，有旁白。拆解用的素材（联系表、关键帧、时间序列）在仓库的 `docs/reference/` 目录。
这是本 skill 的设计规范。默认调色板 `midnight` 和 `object` 节点都是照它做的。

---

## 0. 一句话
**全片只有一个主角物体**：它先被白色细线一笔一笔描出来，然后像 X 光一样露出内部组件（青色斜线填充）。粒子和箭头把“看不见的力或气流”画出来，物体自己会移动、翻转、飞行。镜头一镜到底跟着它走。左上角是品牌和标题区，底部是逐句字幕和带章节刻度的进度条。

## 1. 量化数据
| 项 | 参考视频 | 引擎默认 |
|---|---|---|
| 时长 / 画幅 / 帧率 | 57.9 s · 16:9 · 30 fps | 由 `meta.duration` 决定 · 1920×1080 · 30 |
| 硬切 | **0 个**（场景检测阈值 0.2 时检出 0 个切点） | 镜头之间 1.4 s 平滑过渡 |
| 章节 | 开场 + 4 章 + 结尾卡（开场约 7 s，各章 8–15 s，结尾 5 s） | 6 个镜头左右 |
| 旁白 | 持续旁白，句间停顿 0.4–0.7 s，约 13 句 | `tts.py` 逐镜头生成，镜头时长自动对齐语音 |
| 字幕 | 每次只显示一整句，白字配半透明黑底，底部居中，字号约为画高的 3% | 按句切分，`captionSize` 40 × 0.82 |
| 主体占比 | 约占画宽 40–55%，位于画面中部偏右（左上留给标题） | `camera.pad` 1.5–1.8 |

## 2. 时间线（参考视频逐段）
| 时间 | 章节 / 标题 | 画面动作 | 字幕 |
|---|---|---|---|
| 0–2.8 s | 品牌区淡入 | 几根白线出现，沿车身棱线**逐条延伸**，1 秒后车身大体成形 | “This is …’s new Roadster.” |
| 1.2–6.6 s | `TESLA · ROADSTER (2026 REVEAL)` / **Drives upside down. Then flies.** / 副标题 + 描边胶囊标签（地点和日期） | 玻璃面板填上蓝色，镜头缓慢推近 | “At SpaceX’s test site …, it drove upside down, then flew.” |
| 7.4–13.5 s | `01 · SUCTION` / **Trick one: stick with suction** | X 光：车身变透明，**底部风扇以青色描出**；侧裙描成薄荷绿线；标注“Underbody fans”“Side skirts seal the edges” | “Underbody fans pull air from beneath the car, while side skirts seal the edges.” |
| 13.5–17.2 s | 同上 | **橙色下压力箭头**依次落下；青色粒子从车底被抽出；标注“Outside air presses down”“Low pressure under the floor”；胶囊标签“Up to 2 g of suction” | “Lower pressure below means the outside air presses the car down, up to 2 g.” |
| 17.6–21 s | 同上 | 镜头拉远，**环形坡道**用线描出（带网格填充），车开上坡道倒挂 | “More grip, more friction: enough to cling to an inverted loop.” |
| 21–30 s | `02 · THRUST` / **Trick two: thrust with air** | 两个储气罐以青色斜线 X 光显示；10 个喷嘴用小圆点加虚线连到储气罐 | “Two carbon-wrapped tanks store about 250 kg of compressed air, released through ten … cold-gas nozzles.” |
| 30–36 s | 同上 + 右上**事实框** `NEWTON’S THIRD LAW` | 橙色粒子从车尾喷出，橙色箭头“Air blasts back”，青色箭头“Car moves forward” | “Air blasts one way; by Newton’s third law, the car moves the other.” |
| 36–45 s | `03 · LAUNCH` / **Launch, then steer with air** | 车沿**虚线抛物线**升空；读数 `ROLL 87°` 实时变化；整车翻转；一排线稿方块（车型阵列）从下方掠过；“Lands upright after a full roll” | “Rear main thrusters launch it.” / “Attitude thrusters fire in pairs to roll and pitch, …” |
| 45–53 s | `04 · THE CATCH` / **The tanks empty in seconds** + 橙色胶囊 | 右上角**内嵌曲线图**（TANK PRESSURE vs ALTITUDE）描出两条曲线；读数“4% air left”到“100% air left” | “The catch: the tanks empty in seconds.” / “It’s a powered hop, not sustained flight.” |
| 53–58 s | 结尾卡 | 背景压暗，品牌标志、宽字距品牌名、白色一行加青色一行的总结金句，再加一行宽字距的关键词脚注 | “This is the … Roadster.” |

## 3. 视觉动作语法（引擎动作对照）
| 参考中的动作 | 画面细节 | 引擎实现 |
|---|---|---|
| **精准线条描摹** | 线条逐条生长，不是整体淡入；描完后 0.5 s 再填上半透明的面 | `build` / `trace` 作用于 `object`：所有边按顺序依次描出，面在描到 55% 后才淡入 |
| **X 光内部组件** | 内部零件在讲到它的那一章才出现：青色线，加 30° 斜线填充 | 给零件设 `group`，章节内对 `"<id>.<group>"` 执行 `build`；`style: "hatch"` |
| **组件组装** | 零件从上方落入后定位 | 零件组执行 `assemble`（`drop` 控制下落高度，`dropDir` 控制方向） |
| **玻璃面板** | 车窗或顶盖填半透明蓝色 | `extrude.glassFaces` 或 `style: "glass"` |
| **可见流动 · 抽吸** | 青色小点沿路径被吸走 | `stream`（沿物体局部路径）或 `emit`（从某点喷射） |
| **可见流动 · 喷射** | 橙色和白色粒子成锥形喷出，带速度差 | `emit`：`spread`、`speed`、`rate`、`life`、`color2` |
| **力** | 橙色细箭头从远处飞入，依次落下 | `force`：`points`、`dir`、`length`、`stagger2` |
| **运动** | 车开上环形坡道、沿抛物线飞、翻滚 360° | `move`：`to`/`by`、`rot`/`rotBy`、`arc`、`ease` |
| **强调** | 被讲到的零件线条变亮发光 | `highlight` 作用于节点或零件组，用 glow 滤镜 |
| **标注** | 起点一个实心小圆点，一根细引线，粗体白字标题，下面一行灰色小字说明，**不加框** | `annotate`：`point`（锚点名或局部坐标）、`dx/dy`、`text`、`sub`、`color` |
| **读数** | 等宽青色字，数值实时滚动（`ROLL 87°`） | `readout`：`text` 中的 `{v}` 从 `from` 滚到 `to` |
| **内嵌图表** | 右上角圆角深色面板，等宽标题，坐标轴，曲线逐步描出，曲线标签用同色 | `chart`：`series[].points` 取值 0–1 |
| **事实框** | 右上角，等宽青色小标题加两行白字 | 镜头级 `fact: {kicker, text}` |

## 4. 运镜
- **一镜到底**，靠推、拉、平移切换段落：讲细节时推近到局部，讲运动时拉远并跟随物体。
- 镜头内一直有轻微推近（4–6%），画面始终在动。
- 物体运动时镜头**跟随**它：`camera.follow`。物体落地或停下后，镜头再平滑过渡到下一个取景。
- 主体放在画面中部偏右，给左上角的标题区留出空间，用 `followOffset` 或 `offset` 调整。

## 5. 版式（1920×1080 下的数值）
- **品牌区**（左上，x=96, y=54）：红色标志、宽字距（0.26em）粗体品牌名，下面一行宽字距大写灰色说明（如“HOW IT FLIES — EXPLAINED”）。→ `meta.brand: {mark, name, tagline}`
- **标题区**（左上，y≈150）：等宽青色章节号（`01 · SUCTION`）、50px 特粗白色标题、22px 灰色副标题，可加一个描边胶囊标签（中性灰或橙色警示）。→ 镜头级 `header`，后面的镜头沿用，直到被改写；设为 `null` 隐藏。
- **字幕**：底部居中，半透明黑底，白色常规字重，一次一句。
- **进度条**：底部细线，左右各留 96px 边距，青色填充，**每个章节起点有一个刻度**。
- **结尾卡**：居中排列标志、宽字距品牌名、白色一行加青色一行的金句、宽字距的关键词脚注；背景压暗，主体淡出。→ `overlay: {mark, kicker, title, title2, footer, backdrop: true}`

## 6. 色彩（取自参考画面，即 `midnight` 调色板）
| 角色 | 色值 | 用途 |
|---|---|---|
| 背景 | `#070e1a` 到 `#13233b` 的径向渐变，再加暗角 | 全局 |
| 网格 | `#1d3150` | 地面网格，每格 2 个单位，很淡 |
| 线稿 | `#e8eef7` | 主体所有轮廓线，1.6px |
| 面 | `#0c1830`，不透明度 50% | 主体的面，形成 X 光透视感 |
| 玻璃 | `#2a46a8`，不透明度 42% | 车窗、顶盖 |
| 青 | `#4fd1c5` | 内部组件、气流、读数、章节号、正向结果 |
| 橙 | `#f6ad55` | 力、喷流、警示胶囊、对比曲线 |
| 红 | `#e5484d` | 品牌标志、尾灯类的小点缀 |
| 灰 | `#9aa7bb` | 副标题、标注里的说明文字 |
原则：**静态结构用白线，讲解对象用青色，力和代价用橙色**。同一个画面里最多同时出现两种强调色。

## 7. 叙事结构（参考视频的模板）
1. **开场（约 7 s）**：主体逐线描出，标题区打出一句反常识的钩子（“Drives upside down. Then flies.”），胶囊标签交代背景。
2. **第 1 招（约 14 s）**：先说名字，再 X 光露出相关零件，接着用粒子和力箭头解释原理，最后看效果（倒挂过环）。
3. **第 2 招（约 15 s）**：同样的结构，加一个事实框点出物理定律。
4. **组合应用（约 9 s）**：主体动起来（发射、翻转、落地），配实时读数。
5. **代价（约 8 s）**：内嵌图表加橙色胶囊，诚实交代局限。
6. **结尾卡（约 5 s）**：两行金句，一行白、一行青，再加关键词脚注。

每章的标题都是“动作 + 结果”式的短句，如“Trick one: stick with suction”；副标题写组成部分，如“Underbody fans + sealed side skirts”。

## 8. 写字幕的规律
- 一句话只讲一个事实，一般 8–16 个英文单词，或 14–28 个汉字。
- 节奏：先报名字（“Trick one: suction.”），再讲机制，再给数据，最后讲结果。
- 数据要具体：“up to 2 g”“about 250 kg”“ten nozzles”。
- 结尾用对仗句：“Suction to stick. Air to fly.”

---

## 拆解新参考视频的清单
运行 `scripts/analyze_reference.sh ref.mp4 out 0.2`，然后：
- [ ] 读 `info.txt`：时长、画幅、帧率、有没有音轨
- [ ] 看 `cuts.txt` 里有几个硬切。这类视频通常是 0 个，要以 `every2s/` 的逐帧采样为准
- [ ] 用 `ffmpeg -af silencedetect=n=-35dB:d=0.35` 找旁白的句间停顿，据此确定每句字幕的时长
- [ ] 按 2 秒一帧逐段记录：章节号和标题、主体在做什么、新出现了哪些元素、用了什么颜色
- [ ] 主体怎么建模：列出截面轮廓（`extrude`）、圆柱（`cyl`/`wheel`/`fan`）、方块（`box`）
- [ ] 内部组件分几组，各在哪一章出现
- [ ] 力、流动、读数、图表、事实框、胶囊标签分别出现在哪里
- [ ] 取色（背景、线、面、强调色 1、强调色 2），写成自定义 `palette`
- [ ] 结尾卡的构成
