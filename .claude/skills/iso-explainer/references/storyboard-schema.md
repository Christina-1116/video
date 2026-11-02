# 故事板 JSON 规范

一个视频 = 一个 JSON：`meta` + `nodes`（世界里的物体）+ `links`（管道，可选）+ `scenes`（按时间顺序的镜头）。

两种视觉风格：
- **`wire`（默认，参考视频同款）**：调色板 `midnight` / `draft`。以一个 `object` 主角物体为中心，X 光线稿 + 粒子 + 力箭头 + 标注。示例 `examples/drone-zh.json`。
- **`flat`**：调色板 `paper` / `blueprint` / `mint` / `sunset` / `mono`。多个系统组件块 + 管道流动，适合架构/流程图。示例 `examples/rag-zh.json`、`examples/https-en.json`。
两种风格的节点和动作可以混用（`wire` 风格下普通方块也会画成线稿）。

---

## meta
| 字段 | 默认 | 说明 |
|---|---|---|
| `title` `topic` `audience` | — | 写进故事板预览表头 |
| `language` | `zh-CN` | 字幕切句、阅读速度校验、TTS 音色 |
| `palette` | `midnight` | 预设名，或 `{ "base": "midnight", "teal": "#…", … }` 自定义（键见 `engine/palettes.js`） |
| `style` | 跟随调色板 | `wire` / `flat` 强制指定 |
| `duration` | 各镜头之和 | 目标总时长，按比例缩放所有镜头（有旁白音频时以音频为准） |
| `width` `height` `fps` | 1920 1080 30 | 竖屏 1080×1920 |
| `brand` | — | 字符串（右上小字）或 `{ "mark": "◆", "name": "QUADCOPTER", "tagline": "它如何飞 — 图解" }`（左上品牌区） |
| `unit` | 44 | 1 世界单位的像素数 |
| `gridStep` `gridZ` `grid` | 2(wire)/1 · 0 · true | 地面网格 |
| `captionSize` `captionMaxChars` `captions` | 40 · 24(中)/64(英) · true | 字幕 |
| `annotationSize` `labelSize` | 26 · 22 | 标注 / 名牌字号 |
| `cameraDrift` | 0.05 | 镜头内缓推幅度 |
| `progress` | true | 底部进度条（章节处自动加刻度） |
| `voice` `voiceVolume` `bgm` `bgmVolume` `audioPad` | — | 旁白音色、音量、背景音乐、旁白后留白 |

---

## nodes · `object`（主角物体，可运动）
```json
{ "id": "drone", "type": "object", "pos": [0, 0, 0], "rot": [0, 0, 0],
  "anchors": { "nose": [1.5, 0, 0.85], "battery": [-0.25, 0, 0.84] },
  "parts": [
    { "shape": "extrude", "plane": "xz", "span": [-0.75, 0.75],
      "profile": [[-1.4,0.55],[1.1,0.55],[1.5,0.85],[1.1,1.2],[-1.2,1.25],[-1.4,1.0]], "glassFaces": [2, 3] },
    { "shape": "cyl", "at": [2.2, 2.2, 1.08], "r": 0.3, "h": 0.38 },
    { "shape": "fan", "group": "cw", "at": [2.2, -2.2, 1.5], "r": 1.15, "blades": 2, "spin": 0.9, "style": "glass", "opacity": 0.12 },
    { "shape": "box", "group": "battery", "at": [-1.05, -0.45, 0.62], "size": [1.6, 0.9, 0.42], "style": "hatch", "color": "teal" },
    { "shape": "line", "points": [[-1.3, 0.95, 0], [1.4, 0.95, 0]] }
  ] }
```
- 坐标：局部坐标（x 向屏幕右下 = 物体“前方”，y 向左下，z 向上）；`pos` 是局部原点在世界中的位置；`rot` = `[roll(x), pitch(y), yaw(z)]` 角度；旋转中心默认为物体包围盒中心（`pivot` 可改）。
- **零件 `shape`**
  | shape | 参数 | 用途 |
  |---|---|---|
  | `box` | `at` 最小角、`size` | 机身、电池、方块 |
  | `cyl` | `at` 底面中心、`r`、`h`、`axis` `x/y/z`、`segments` | 电机、储罐、轮毂、火箭段 |
  | `wheel` | 同 cyl + 辐条 | 车轮（`axis: "y"`） |
  | `fan` | 同 cyl + `blades`、`spin`（转/秒，负数反转） | 螺旋桨、风扇、涡轮 |
  | `extrude` | `profile` 截面点 `[[u,v],…]`（可含 `{"arc":[cu,cv,r,起始角,结束角,段数]}`）、`plane` `xz`/`xy`/`yz`、`span` 拉伸区间、`glassFaces` 侧面序号、`open: true` 开口曲面、`ribs` | 车身/机身侧剖面、斜臂、坡道、环形跑道、机翼 |
  | `line` | `points`、`dashed`、`closed` | 支架、管线、轨迹、侧裙 |
  | `quad` | `points` 4 点 | 面板、窗 |
- **零件样式**：`style` = `body`（默认，半透明深色面 + 白线）/ `glass`（蓝色半透明）/ `hatch`（`color` 色斜线填充，X 光内部件）/ `solid` / `none`（只有线）；`color` 线色（调色板键）；`opacity`、`alpha`、`width`。
- **`group`**：零件分组。被任何 `"<id>.<group>"` 动作（build/trace/assemble/show）引用的组，会**等到那个动作才出现**——用来在对应章节才“X 光显影”内部组件；没被引用的组随主体一起出现。
- **`anchors`**：命名的局部坐标点，供 annotate/force/emit/readout 引用。
- `shadow: false` 关闭地面软阴影；`ground` 阴影所在高度。

## nodes · 系统组件（flat 风格）
`box` `block`/`stack` `server` `database` `cylinder` `screen` `doc` `person` `cloud` `chip` `ai`/`model` `gate` `platform`。
```json
{ "id": "vdb", "type": "database", "pos": [10, 2, 0], "size": [2.4, 2.4, 2.8], "label": "向量数据库", "color": "secondary", "layers": 3, "icon": "🔍", "step": 3 }
```
`pos` = 包围盒最小角、`size` = `[x, y, z]`；`label`/`step`/`labelHidden` 名牌；`initial: "visible"|"traced"`；平台 `title`/`titlePos`/`titleSize`。

## links（flat 风格）
`{ "id", "from", "to", "route": "direct|xy|yx|arc", "height", "via", "color", "label", "style": "dashed", "arrow": false }`

---

## scenes
```json
{
  "id": "pitch", "duration": 12,
  "header": { "kicker": "02 · 姿态", "title": "第二招：用转速差倾斜机身", "subtitle": "前慢后快 → 机头下压", "tag": "约 30 分钟续航", "tagColor": "orange" },
  "fact": { "kicker": "力的分解", "text": "推力一倾斜，就分出一部分向前的力。", "at": 5.5 },
  "camera": { "follow": "drone", "pad": 1.6 },
  "caption": "让后面两个螺旋桨转得更快，机头就会微微下压。推力随之倾斜……",
  "narration": "（可选，与字幕不同时填写）",
  "audio": "voice/scene-03.mp3",
  "overlay": { "mark": "◆", "kicker": "四旋翼无人机", "title": "推空气，就能飞。", "title2": "调转速，就能转。", "footer": "升力 · 姿态 · 反扭矩", "backdrop": true },
  "actions": [ … ]
}
```
- `header`：左上标题区，**沿用到被下一个镜头改写**；`null` 隐藏。`chapter`（flat 风格的左上章节条）。
- `fact`：右上事实框。`overlay`：标题卡/结尾卡（`position: center|top|bottom`，`backdrop` 压暗背景）。
- `camera`：`focus`（id 数组 / `"all"`）、`follow`（跟随运动物体）、`followOffset` `[px,px]`、`pad`（越大越远，主体占画宽 ~45% 约为 1.5–1.8）、`fitAt`（按镜头内第几秒的位置取景）、`zoom`、`zoomMul`、`offset`、`pan`、`drift`、`ease`（0 = 硬切）。`dim: true` 压暗非焦点节点。
- 字幕按句切分，每句时长按字数分配；整句不超过 `captionMaxChars` 时一次显示一整句（参考视频的做法）。

### actions（`at` = 相对镜头开始的秒数；`target` 可为数组 + `stagger`）
| do | target | 关键参数 | 效果 |
|---|---|---|---|
| `build` | 节点 / `id.group` | `dur` | 线条逐条描出 → 面淡入（object）；描摹 + 组装（flat 组件） |
| `trace` | 节点 / 组 / 管道 | `dur` | 只描线 |
| `assemble` | 节点 / 组 | `dur` | 零件落入（组：`drop`、`dropDir` 在零件上设置） |
| `show` / `hide` | 任意 | `dur` | 出现 / 淡出 |
| `move` | object | `to` 或 `by`、`rot` 或 `rotBy`、`arc`（抛物线高度）、`ease` `inOut/linear/out/in/back`、`dur` | 移动、旋转、翻滚、起飞降落 |
| `highlight` | 节点 / 组 | `color`、`dur` | 发光强调 |
| `emit` | object | `from`（锚点名/局部点，或其数组）、`dir`、`spread`°、`speed`、`rate`/秒、`life`、`size`、`color`、`color2`、`gravity`、`dur` | 粒子喷射（气流、尾焰、水雾） |
| `stream` | object | `path`（局部点数组，或数组的数组）、`particles`、`speed`、`color` | 粒子沿路径流动（吸入、电流、血流） |
| `force` | object | `points`、`dir`、`length`、`color`、`stagger2` | 力箭头依次飞入 |
| `annotate` | 节点 | `point`（锚点/局部点）、`text`、`sub`、`dx` `dy`（屏幕像素偏移，负 dx = 左侧）、`color`、`dur` | 圆点 + 引线 + 粗体标题 + 灰色说明 |
| `readout` | 节点或省略 | `text`（含 `{v}`）、`from` `to` `decimals`、`count`（滚动时长）、`point`+`dx/dy` 或 `screen:[0–1,0–1]` | 等宽实时读数 |
| `chart` | 省略 | `title`、`xlabel`、`series:[{label,color,points:[[0–1,0–1]…],labelAt}]`、`draw`、`x` `y` `w` `h` | 右上内嵌曲线图 |
| `link` / `flow` / `callout` / `label` | 管道 / 节点 | 见 flat 风格 | 管道生长 / 沿管道流动 / 气泡 / 名牌 |

持续类动作（emit/stream/force/annotate/readout/chart/flow/highlight/callout）不写 `dur` 时默认持续到本镜头结束；`until: "end"` 持续到全片结束。

## 校验
`node scripts/render.js validate sb.json` 检查：id、类型、零件 shape、动作名、引用的节点/零件组/锚点是否存在、运动类动作是否作用于 object、字幕密度、从未出场的节点。
