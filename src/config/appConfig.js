export const SETTINGS_STORAGE_KEY = 'bio-demo-settings'
export const GALLERY_STORAGE_KEY = 'bio-demo-gallery'
export const GENERATION_HISTORY_STORAGE_KEY = 'bio-demo-generation-history'
export const NOTES_STORAGE_KEY = 'bio-demo-notes'
export const PROJECT_FALLBACK_STORAGE_KEY = 'bio-demo-projects'
const VITE_ENV = import.meta.env || {}
export const SETTINGS_STORAGE_VERSION = 5
export const UI_STATE_STORAGE_KEY = 'bio-demo-ui-state'
export const UI_STATE_STORAGE_VERSION = 1
export const FAL_MODEL_OPTIONS = [
  { id: 'fal-ai/hunyuan3d/v2', label: 'Hunyuan3D v2', description: 'Tencent Hunyuan3D v2 through Fal.' },
  { id: 'fal-ai/trellis', label: 'TRELLIS', description: 'Image-to-3D with textured mesh output.' },
  { id: 'fal-ai/triposr', label: 'TripoSR', description: 'Fast image reconstruction through Fal.' },
  { id: 'tripo3d/tripo/v2.5/image-to-3d', label: 'Tripo3D v2.5', description: 'Fal-hosted Tripo3D image-to-3D.' },
  { id: 'fal-ai/hyper3d/rodin', label: 'Hyper3D Rodin', description: 'Fal-hosted Rodin image-to-3D.' },
]
export const FAL_MODEL_IDS = new Set(FAL_MODEL_OPTIONS.map((option) => option.id))
export const DEFAULT_FAL_MODEL = FAL_MODEL_OPTIONS[0].id
export const DEFAULT_SETTINGS = {
  quality: 'balanced',
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
  { id: 'atlas', label: 'Atlas Cloud', description: 'Atlas Cloud Hunyuan3D GLB generation.' },
]
export const GENERATION_PROVIDER_IDS = new Set(GENERATION_PROVIDER_OPTIONS.map((provider) => provider.id))
export const GENERATION_MODE_OPTIONS = [
  { id: 'rodin', label: 'Hyper3D', description: 'Hyper3D Rodin GLB generation.' },
  { id: 'tripo', label: 'Tripo', description: 'Cloud GLB generation.' },
  { id: 'fal', label: 'Fal', description: 'Fal.ai queue with selectable model.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D GLB generation.' },
  { id: 'atlas', label: 'Atlas Cloud', description: 'Atlas Cloud Hunyuan3D GLB generation.' },
  { id: 'cinematic', label: 'JS Depth', description: 'Browser-side image relief with layered PNG fallback.' },
  { id: 'auto', label: 'Auto', description: 'Hyper3D, Tripo, Fal, Hunyuan, then JS Depth fallback.' },
  { id: 'local', label: 'Local GLB', description: 'Import an existing GLB or GLTF file.' },
]
export const GENERATION_MODE_IDS = new Set(GENERATION_MODE_OPTIONS.map((mode) => mode.id))
