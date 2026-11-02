// Palette presets. Every node/link color may reference a key below or be a raw hex.
window.ISO_PALETTES = {
  // 午夜 X 光线稿（参考视频同款）：深海军蓝 + 白色线稿 + 青色内部组件 + 橙色力/喷流
  midnight: {
    style: 'wire',
    bg: '#070e1a', bg2: '#13233b', grid: '#1d3150', ink: '#e8eef7', line: '#e8eef7', ghost: '#7f93b3',
    fill: '#0c1830', glass: '#2a46a8', ground: '#16263d',
    primary: '#e8eef7', secondary: '#7da2ff', accent: '#4fd1c5', teal: '#4fd1c5', orange: '#f6ad55', red: '#e5484d',
    success: '#4fd1c5', danger: '#e5484d', neutral: '#5b6b85', glow: '#4fd1c5', muted: '#9aa7bb',
    text: '#ffffff', labelBg: '#0c1830', labelText: '#ffffff',
    captionBg: 'rgba(4,9,18,0.72)', captionText: '#ffffff'
  },
  // 纸面线稿：浅色背景版的 X 光线稿
  draft: {
    style: 'wire',
    bg: '#f3f1ec', bg2: '#fbfaf7', grid: '#e3dfd6', ink: '#1d2433', line: '#1d2433', ghost: '#9aa3b2',
    fill: '#ffffff', glass: '#9db4ff', ground: '#e3dfd6',
    primary: '#1d2433', secondary: '#3d63dd', accent: '#0f9d8a', teal: '#0f9d8a', orange: '#e8772e', red: '#d6363c',
    success: '#0f9d8a', danger: '#d6363c', neutral: '#9aa3b2', glow: '#0f9d8a', muted: '#5d6676',
    text: '#1d2433', labelBg: '#ffffff', labelText: '#1d2433',
    captionBg: 'rgba(29,36,51,0.85)', captionText: '#ffffff'
  },
  // 深蓝图纸：科技/系统架构
  blueprint: {
    bg: '#0d1b2a', bg2: '#13263b', grid: '#1f3a56', ink: '#e6f1ff', ghost: '#7fb8ff',
    ground: '#16304a', primary: '#3a86ff', secondary: '#4cc9f0', accent: '#ffbe0b',
    success: '#38d39f', danger: '#ff5d73', neutral: '#8aa0b8',
    text: '#e6f1ff', labelBg: '#0d1b2a', labelText: '#e6f1ff',
    captionBg: 'rgba(5,14,24,0.78)', captionText: '#ffffff', glow: '#ffd166'
  },
  // 米白纸张：教育/通识，最接近手绘说明书
  paper: {
    bg: '#f6f1e7', bg2: '#efe7d6', grid: '#e2d8c3', ink: '#2b2d42', ghost: '#8d99ae',
    ground: '#ebe2cf', primary: '#5b8def', secondary: '#7fc8a9', accent: '#f4a259',
    success: '#57b894', danger: '#e76f51', neutral: '#b8b0a0',
    text: '#2b2d42', labelBg: '#fffdf8', labelText: '#2b2d42',
    captionBg: 'rgba(43,45,66,0.86)', captionText: '#ffffff', glow: '#f4a259'
  },
  // 薄荷清新：产品/SaaS
  mint: {
    bg: '#eef7f4', bg2: '#e2f1ec', grid: '#cfe5dd', ink: '#1f3b4d', ghost: '#86a8a0',
    ground: '#dcefe8', primary: '#2ec4b6', secondary: '#7b9cff', accent: '#ff9f1c',
    success: '#2ec4b6', danger: '#ef476f', neutral: '#a7c4bc',
    text: '#1f3b4d', labelBg: '#ffffff', labelText: '#1f3b4d',
    captionBg: 'rgba(31,59,77,0.85)', captionText: '#ffffff', glow: '#ff9f1c'
  },
  // 日落暖色：商业/营销
  sunset: {
    bg: '#2b1d3a', bg2: '#38244a', grid: '#4a3160', ink: '#fff4e6', ghost: '#f8b4a6',
    ground: '#3c2850', primary: '#ff7b54', secondary: '#ffb26b', accent: '#ffd56b',
    success: '#7bd389', danger: '#ff4d6d', neutral: '#b9a3c9',
    text: '#fff4e6', labelBg: '#2b1d3a', labelText: '#fff4e6',
    captionBg: 'rgba(20,10,30,0.8)', captionText: '#ffffff', glow: '#ffd56b'
  },
  // 黑白极简：严肃/金融/学术
  mono: {
    bg: '#fafafa', bg2: '#f0f0f0', grid: '#e4e4e4', ink: '#111111', ghost: '#9a9a9a',
    ground: '#ececec', primary: '#d9d9d9', secondary: '#bfbfbf', accent: '#ff3b30',
    success: '#34c759', danger: '#ff3b30', neutral: '#cfcfcf',
    text: '#111111', labelBg: '#ffffff', labelText: '#111111',
    captionBg: 'rgba(17,17,17,0.88)', captionText: '#ffffff', glow: '#ff3b30'
  }
};
