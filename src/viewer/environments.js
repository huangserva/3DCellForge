/**
 * 环境预设（本地光棚）
 *
 * 每一套预设都是用 Lightformer 几何体现场渲进 cubemap 的，**不依赖任何 HDRI 文件**。
 * 这是刻意的取舍：HDRI 要么得从 CDN 下载（离线跑不了），要么得往仓库里塞几 MB
 * 的贴图文件。而 Forge 主打可自托管，所以全部本地生成。
 *
 * 代价是真实感不如实拍 HDRI —— 但对检查 PBR 材质、看金属度和粗糙度反射来说，
 * 这套够用了，而且切换是零延迟的。
 */

export const ENVIRONMENT_PRESETS = [
  {
    id: 'studio',
    label: '摄影棚',
    description: '中性柔和，适合检查材质本身',
    shell: '#6b675e',
    intensity: 0.85,
    lights: [
      { form: 'rect', intensity: 5, color: '#fff6e8', position: [3, 4, 5], scale: [8, 6, 1] },
      { form: 'rect', intensity: 1.8, color: '#dbeafe', position: [-5, 2, -3], scale: [6, 6, 1] },
      { form: 'rect', intensity: 1.4, color: '#fbe6f0', position: [0, 1, -6], scale: [6, 4, 1] },
    ],
  },
  {
    id: 'outdoor',
    label: '户外',
    description: '天光为主，冷调，适合有机与自然材质',
    shell: '#7f97ad',
    intensity: 1,
    lights: [
      { form: 'circle', intensity: 7, color: '#eaf4ff', position: [0, 8, 1], scale: [10, 10, 1] },
      { form: 'rect', intensity: 1.2, color: '#9ec1a4', position: [-6, -1, 2], scale: [8, 5, 1] },
      { form: 'rect', intensity: 0.8, color: '#cfe0ee', position: [6, 0, -4], scale: [6, 6, 1] },
    ],
  },
  {
    id: 'warehouse',
    label: '厂房',
    description: '顶部强光源，硬阴影，适合看几何与倒角',
    shell: '#5e5b55',
    intensity: 0.75,
    lights: [
      { form: 'rect', intensity: 8, color: '#fffaf0', position: [0, 7, 0], scale: [4, 10, 1] },
      { form: 'rect', intensity: 4, color: '#f2f4f6', position: [-4, 6, 4], scale: [3, 8, 1] },
      { form: 'rect', intensity: 3, color: '#eef1f4', position: [4, 6, -4], scale: [3, 8, 1] },
    ],
  },
  {
    id: 'product',
    label: '产品棚',
    description: '左右对称柔光箱，商品展示常用',
    shell: '#6f6a62',
    intensity: 0.9,
    lights: [
      { form: 'rect', intensity: 5, color: '#ffffff', position: [-6, 2, 3], scale: [7, 7, 1] },
      { form: 'rect', intensity: 5, color: '#ffffff', position: [6, 2, 3], scale: [7, 7, 1] },
      { form: 'rect', intensity: 2.5, color: '#eef2ff', position: [0, 5, 4], scale: [8, 4, 1] },
      { form: 'rect', intensity: 1, color: '#ffe9d6', position: [0, -3, -5], scale: [6, 3, 1] },
    ],
  },
  {
    id: 'night',
    label: '夜景',
    description: '低照度高反差，适合检查自发光与暗部细节',
    shell: '#2a2f3a',
    intensity: 0.5,
    lights: [
      { form: 'rect', intensity: 3.5, color: '#ff9f6e', position: [-5, 1, 3], scale: [4, 5, 1] },
      { form: 'rect', intensity: 2.5, color: '#5b8cff', position: [5, 2, -2], scale: [5, 5, 1] },
      { form: 'circle', intensity: 1.2, color: '#9fb4d6', position: [0, 6, -4], scale: [6, 6, 1] },
    ],
  },
]

export const ENVIRONMENT_PRESET_IDS = new Set(ENVIRONMENT_PRESETS.map((preset) => preset.id))

export const DEFAULT_ENVIRONMENT_PRESET = 'studio'

export function getEnvironmentPreset(id) {
  return ENVIRONMENT_PRESETS.find((preset) => preset.id === id) || ENVIRONMENT_PRESETS[0]
}

export function normalizeEnvironmentPreset(id) {
  return ENVIRONMENT_PRESET_IDS.has(id) ? id : DEFAULT_ENVIRONMENT_PRESET
}
