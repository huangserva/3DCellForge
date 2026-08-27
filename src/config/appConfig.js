import { DEFAULT_ENVIRONMENT_PRESET } from '../viewer/environments.js'

// 注意：这些 key 仍沿用 bio-demo-* 前缀（cell 时代遗留），不能轻易改。
// 改了会让已安装用户的设置、画廊、历史、笔记全部丢失 —— 2624 star 意味着
// 有真实用户在跑。要改名必须配一次性迁移，见 preferences.js 的 migrateLegacyKeys。
export const SETTINGS_STORAGE_KEY = 'bio-demo-settings'
export const GALLERY_STORAGE_KEY = 'bio-demo-gallery'
export const GENERATION_HISTORY_STORAGE_KEY = 'bio-demo-generation-history'
export const NOTES_STORAGE_KEY = 'bio-demo-notes'
export const PROJECT_FALLBACK_STORAGE_KEY = 'bio-demo-projects'
const VITE_ENV = import.meta.env || {}
export const SETTINGS_STORAGE_VERSION = 5
export const UI_STATE_STORAGE_KEY = 'bio-demo-ui-state'
export const UI_STATE_STORAGE_VERSION = 1
// Fal 模型目录（2026-08 更新）。
// 必须与服务端 server/providers/fal.mjs 的 FAL_MODEL_DEFINITIONS 保持一致，
// 否则前端给出的选项会被服务端的 normalizeFalModelId 静默回退掉。
//
// perf 字段供后续「能力路由」使用：按 speed / quality / cost 偏好自动挑引擎。
// verified: false 表示模型 id 或请求参数是依据厂商公开命名推断的，接入前需实测确认。
//
// 只收录 image → textured mesh。以下两类刻意不收，因为它们的数据形状不同，
// 需要各自的 UI 与结果解析，等 Sprint 1 第二批再进：
//   - 文生 3D（fal-ai/meshy/v7/text-to-3d）
//   - 输出点云/场景而非网格（fal-ai/vggt-1b）
export const FAL_MODEL_OPTIONS = [
  {
    id: 'fal-ai/hitem3d/hi3d/v3.0/image-to-3d',
    label: 'Hi3D V3.0',
    description: 'Hitem3D。几何精度最佳。',
    perf: { speed: 7, quality: 9, cost: 5 },
    verified: true,
  },
  {
    id: 'fal-ai/hunyuan3d/v3.1/pro/image-to-3d',
    label: 'Hunyuan3D 3.1 Pro',
    description: '腾讯。纹理与 PBR 质量最佳，支持多视图输入。',
    perf: { speed: 6, quality: 9, cost: 5 },
    verified: false,
  },
  {
    id: 'fal-ai/trellis-2',
    label: 'TRELLIS.2 (4B, MIT)',
    description: '微软。MIT 许可，单卡 24GB 约 20s 出 1536 分辨率，可商用。',
    perf: { speed: 8, quality: 8, cost: 2 },
    verified: false,
  },
  {
    id: 'tripo3d/tripo/v2.5/image-to-3d',
    label: 'Tripo3D v2.5',
    description: 'Fal 托管的 Tripo3D。项目原本就在用的稳定选项。',
    perf: { speed: 8, quality: 7, cost: 3 },
    verified: true,
  },
  {
    id: 'fal-ai/triposr',
    label: 'TripoSR（草稿）',
    description: '亚秒级草稿，适合先出形再精修。',
    perf: { speed: 10, quality: 4, cost: 1 },
    verified: true,
  },
  {
    id: 'fal-ai/hyper3d/rodin',
    label: 'Hyper3D Rodin',
    description: '电影级 hero 资产，最贵。',
    perf: { speed: 3, quality: 10, cost: 9 },
    verified: true,
  },
  {
    id: 'fal-ai/hunyuan3d/v2',
    label: 'Hunyuan3D v2（旧版回退）',
    description: '上一代，保留作兼容回退。',
    perf: { speed: 6, quality: 7, cost: 3 },
    verified: true,
  },
  {
    id: 'fal-ai/trellis',
    label: 'TRELLIS（旧版回退）',
    description: '上一代结构化 3D latent。',
    perf: { speed: 8, quality: 7, cost: 2 },
    verified: true,
  },
]
export const FAL_MODEL_IDS = new Set(FAL_MODEL_OPTIONS.map((option) => option.id))
// 显式指定，避免列表顺序变动时默认值被意外改掉
export const DEFAULT_FAL_MODEL = 'fal-ai/hitem3d/hi3d/v3.0/image-to-3d'
export const DEFAULT_SETTINGS = {
  quality: 'balanced',
  environment: DEFAULT_ENVIRONMENT_PRESET,
  compactUi: false,
  generationProvider: 'rodin',
  generationMode: 'rodin',
  falModelId: DEFAULT_FAL_MODEL,
  screenshotScale: 2,
  language: 'en',
  settingsVersion: SETTINGS_STORAGE_VERSION,
}

export const SCREENSHOT_SCALE_OPTIONS = [
  { id: 1, label: '1x' },
  { id: 2, label: '2x' },
  { id: 3, label: '3x' },
]

export const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
]
export const LANGUAGE_IDS = new Set(LANGUAGE_OPTIONS.map((option) => option.id))

export const CUSTOM_CELL_STORAGE_KEY = 'bio-demo-custom-cells'
export const MAX_PERSISTED_IMAGE_EDGE = 1280
export const COMPACT_PERSISTED_IMAGE_EDGE = 900
export const MAX_PERSISTED_IMAGE_CHARS = 3_200_000
export const MODEL_API_BASE = VITE_ENV.VITE_MODEL_API_BASE || VITE_ENV.VITE_TRIPO_API_BASE || 'http://127.0.0.1:8787'
export const GENERATION_POLL_INTERVAL_MS = 3500
export const GENERATION_TIMEOUT_MS = 8 * 60 * 1000
export const GENERATION_PROVIDER_OPTIONS = [
  { id: 'rodin', label: 'Hyper3D', description: 'Hyper3D Rodin cloud generation.' },
  { id: 'auto', label: 'Auto', description: 'Hyper3D first, then Tripo, Fal, Hunyuan, and JS Depth backup.' },
  { id: 'tripo', label: 'Tripo', description: 'Cloud generation.' },
  { id: 'fal', label: 'Fal', description: 'Fal queue with selectable 3D models.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D server.' },
]
export const GENERATION_PROVIDER_IDS = new Set(GENERATION_PROVIDER_OPTIONS.map((provider) => provider.id))
export const GENERATION_MODE_OPTIONS = [
  { id: 'rodin', label: 'Hyper3D', description: 'Hyper3D Rodin GLB generation.' },
  { id: 'tripo', label: 'Tripo', description: 'Cloud GLB generation.' },
  { id: 'fal', label: 'Fal', description: 'Fal.ai queue with selectable model.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D GLB generation.' },
  { id: 'cinematic', label: 'JS Depth', description: 'Browser-side image relief with layered PNG fallback.' },
  { id: 'auto', label: 'Auto', description: 'Hyper3D, Tripo, Fal, Hunyuan, then JS Depth fallback.' },
  { id: 'local', label: 'Local GLB', description: 'Import an existing GLB or GLTF file.' },
]
export const GENERATION_MODE_IDS = new Set(GENERATION_MODE_OPTIONS.map((mode) => mode.id))
