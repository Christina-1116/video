# episode.json 字段说明

一个文件同时是剧本、分镜表、生成提示词、字幕和剪辑表。可以从 `examples/pricing-secret.json` 复制后修改。

```jsonc
{
  "meta": {
    "title": "定价的秘密",           // 片名，开头以《》叠在顶部
    "principle": "一句话原理",
    "size": [1280, 720], "fps": 30,  // 9:16 用 [720,1280]，版式按高度自动缩放
    "target": [150, 200],            // 目标总时长（秒），check 会提醒
    "font": "WenQuanYi Zen Hei",     // 字幕、注释用的粗黑体
    "brush_font": "Ma Shan Zheng"    // 片名、竖排口诀、人名、收尾卡用的书法体；配合 --fontsdir 指向 ttf
  },
  "cast":   { "girl": {"name","look","ref?"}, "dad": {...}, "master": {...} },  // look 会拼进每个镜头的提示词；ref 填定妆照路径
  "scenes": { "modern": "...", "ancient": "...", "<自定义>": "..." },         // 场景描述；镜头用 set 选自定义场景
  "style":  { "modern": "...", "ancient": "...", "negative": "..." },        // 画风后缀
  "moves":  [ {"name","prop","before","after","common_sense","principle","maxim":[..],"modern"} ×3 ],
  "shots":  [ Shot, ... ]
}
```

## Shot
| 键 | 必填 | 说明 |
|---|---|---|
| `id` | 否 | 默认为 s01、s02…，也是素材文件名 `clips/<id>.mp4` |
| `beat` | 是 | `hook` `flash_in` `intro` `move1` `move2` `move3` `flash_out` `contrast` `close`，必须按这个顺序 |
| `scene` | 是 | `modern` / `ancient` / `card`（决定色调、占位色和画风后缀） |
| `set` | 否 | 用 `scenes` 里的某个自定义场景描述，例如 `gate` |
| `dur` | 是 | 秒。AI 视频片段通常 3–5 秒，可以生成后再裁 |
| `framing` | 否 | 景别：大全景 / 全景 / 中景 / 中近景 / 近景 / 特写 / 过肩 |
| `cast` | 否 | 画面里出现的角色 key，缺省时取说话人 |
| `action` | 是 | 画面内容（写成首帧图的描述） |
| `motion` | 否 | 运动描述（图生视频用），缺省时用 action |
| `prop_state` | 否 | 此刻道具上写着什么、长什么样，**每个道具镜头都要写**，保证前后一致 |
| `prop_change` | 每招至少 1 个 | 本招的道具改动，格式是“改前 → 改后” |
| `reaction` | 每招至少 1 个 | 路人反应（失败时和翻转后各写一次） |
| `lines` | 否 | `[{"who": "girl|dad|master|passerby|vo", "name": "路人", "text": "..."}]` |
| `overlays` | 否 | 见下表。相邻镜头的值完全相同时会合并成一段，不闪 |
| `transition` | 否 | `whiteflash` 表示本镜头末尾白闪。全片恰好 2 次：`flash_in` 和 `flash_out` 末尾 |
| `sub_offset` | 否 | 字幕相对镜头开始的延迟，默认 0.15 秒 |

## overlays
| 键 | 样式 | 示例 |
|---|---|---|
| `title` | 顶部居中，书法体大字 | `"《定价的秘密》"` |
| `note` | 顶部“注：”原理条（自动补“注：”） | `"价格是由锚点决定的"` |
| `vertical` | 左侧竖排口诀，自右向左读，数组里一个元素占一列 | `["锚定则价定","锚去则价生"]` |
| `name` | 人物旁竖排书法人名；`pos` 是相对坐标 | `{"text":"范蠡","pos":[0.64,0.15]}` |
| `tag` | 右上角蓝底标签（当代对照专用） | `"改名字 · 换掉参照物"` |
| `card` | 全屏居中多行（收尾卡） | `["《定价的秘密》","改名字 · 换锚点", ...]` |

## 字幕规则（自动执行）
台词在每个逗号、句号、问号处断成一条。去掉所有标点（引号保留）。每条最多 16 个字，超过就硬切。时间在镜头内按字数比例分配。
