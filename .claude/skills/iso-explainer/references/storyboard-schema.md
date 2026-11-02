# 故事板 JSON 规范

一个视频 = 一个 JSON：`meta`（全局设置）+ `nodes`（世界里的物体）+ `links`（管道）+ `scenes`（按时间顺序的镜头）。
完整示例见 `examples/rag-zh.json`（中文 / paper）与 `examples/https-en.json`（英文 / blueprint）。

## meta
| 字段 | 默认 | 说明 |
|---|---|---|
| `title` `topic` `audience` | — | 写进故事板预览页的表头 |
| `language` | `zh-CN` | 决定字幕切句规则、阅读速度校验、TTS 默认音色 |
| `palette` | `blueprint` | `blueprint` / `paper` / `mint` / `sunset` / `mono`，或自定义对象 `{ "base": "paper", "primary": "#…", … }`（键见 `engine/palettes.js`） |
| `duration` | 各镜头之和 | 目标总时长（秒）。与镜头之和不同时按比例缩放所有镜头和动作；有旁白音频时以音频为准、忽略此项 |
| `width` `height` `fps` | 1920 1080 30 | 竖屏用 1080×1920 |
| `unit` | 44 | 1 个世界单位的像素数（整体缩放元件） |
| `lineWidth` | 2.4 | 描边粗细 |
| `captionSize` / `captionMaxChars` | 40 / 24(中) 64(英) | 字幕字号 / 每条字幕最大字数 |
| `captions` | true | false 关闭画面内字幕（仍输出 .srt） |
| `labelSize` | 22 | 名牌字号 |
| `cameraDrift` | 0.05 | 镜头内缓慢推近幅度 |
| `dropHeight` | 2.6 | 组装时部件下落高度 |
| `grid` / `progress` | true / true | 地面网格 / 底部进度条 |
| `brand` | — | 右上角品牌字样 |
| `font` | 系统无衬线 + 中文字体栈 | CSS font-family |
| `voice` `voiceVolume` `bgm` `bgmVolume` `audioPad` | — | 旁白音色、音量、背景音乐、旁白后留白（0.6 s） |

## nodes
```json
{ "id": "vdb", "type": "database", "pos": [10, 2, 0], "size": [2.4, 2.4, 2.8],
  "label": "向量数据库", "color": "secondary", "layers": 3, "icon": "🔍", "step": 3 }
```
- `pos` = 包围盒最小角 `[x, y, z]`（x 向右下、y 向左下、z 向上）；`size` = `[宽x, 深y, 高z]`。
- `type`：`box` `block`/`stack` `server` `database` `cylinder` `screen` `doc` `person` `cloud` `chip` `ai`/`model` `gate` `platform`。
- `color`：调色板键或 hex；`accent`（芯片/AI 球/门楣的点缀色）；`icon` 印在顶面；`layers` 叠层数（block/server/database/doc）。
- `label` 名牌；`step` 名牌前的序号圆点；`labelHidden: true` 直到 `label` 动作才显示。
- `initial`: `"visible"`（开场即存在）或 `"traced"`（开场已有线稿，等待组装）。默认隐藏，直到被动作唤出。
- `platform` 专用：`title`（印在顶面）、`titlePos` `[dx, dy]`（相对平台角）、`titleSize`。
- 布局经验：节点间留 ≥ 2 单位间距；同一管道两端的中心对齐在同一 x 或 y 上可得到笔直管道；平台高 0.35、z = −0.35，使平台顶面正好是 z=0。

## links
```json
{ "id": "l_query", "from": "app", "to": "embed", "route": "xy", "color": "accent", "label": "HTTPS" }
```
- `route`：`direct`（直线；中心同 x 或同 y 时为正交直线）· `xy`（先沿 x 再沿 y）· `yx` · `arc`（空中抛物线，`height` 控制拱高，适合返回路径/跨区域）。
- `via`：额外拐点 `[[x,y],…]`；`z` 管道高度；`width` 粗细；`style: "dashed"`；`arrow: false`。

## scenes
```json
{
  "id": "search", "duration": 8, "chapter": "04 · 相似度检索",
  "camera": { "focus": ["embed", "vdb"], "pad": 1.6 },
  "dim": true,
  "caption": "向量数据库按语义相似度，找出最相关的几段原文。",
  "narration": "（可选，与字幕不同时填写；为空则旁白=字幕）",
  "audio": "voice/scene-05.mp3",
  "overlay": { "kicker": "…", "title": "…", "subtitle": "…", "position": "center|top|bottom" },
  "actions": [ … ]
}
```
- `camera`：`focus`（节点 id 数组或 `"all"`；缺省=沿用上一镜头）、`pad`（留白系数，越大越远）、`zoom`（绝对缩放）、`zoomMul`、`offset` `[x,y,z]`、`pan` `[dx,dy]`（镜头内平移）、`drift`、`ease`（过渡秒数，0 = 硬切）。
- `dim`: 压暗非焦点元素。
- `caption` 显示在画面；`narration` 用于 TTS；两者缺一时互相补位。

### actions（`at` 相对镜头开始，秒）
| do | target | 参数 | 效果 |
|---|---|---|---|
| `build` | 节点 | `dur`(1.8) | 描摹 + 组装（最常用） |
| `trace` | 节点/管道 | `dur`(1.2) | 只画线稿 |
| `assemble` | 节点 | `dur`(1.0) | 部件逐块落下成型 |
| `link` | 管道 | `dur`(0.9) | 管道从起点生长到终点 + 箭头 |
| `flow` | 管道 | `dur`(3) / `until:"end"`、`particles`(3)、`particle`:`dot`/`cube`、`text`、`color`、`speed`、`size` | 粒子沿管道流动（管道若未出现会自动长出） |
| `highlight` | 节点 | `dur`(2)、`color` | 底部扩散光圈 + 描边变色 |
| `callout` | 节点 | `dur`(2.5)、`text`（`\n` 换行，第一行加粗）、`side`:`left`/`right`、`color` | 说明气泡 |
| `label` | 节点 | `dur`(0.5) | 显示名牌（配合 `labelHidden`） |
| `hide` / `show` | 节点/管道 | `dur`(0.5) | 淡出 / 重新出现 |

`target` 可以是数组，配合 `stagger`（秒）依次触发。

## 校验
`node scripts/render.js validate sb.json` 会检查：id 重复、未知类型/动作、悬空引用、flow 目标不是管道、动作晚于镜头结束、字幕过密（中文 > 4.5 字/秒）、从未出场的节点。
