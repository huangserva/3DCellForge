export const SETTINGS_STORAGE_KEY = 'bio-demo-settings'
export const SETTINGS_STORAGE_VERSION = 4
export const UI_STATE_STORAGE_KEY = 'bio-demo-ui-state'
export const UI_STATE_STORAGE_VERSION = 1
export const FAL_MODEL_OPTIONS = [
  { id: 'fal-ai/hunyuan3d/v2', label: 'Hunyuan3D v2', description: 'Tencent Hunyuan3D v2 via Fal.' },
  { id: 'fal-ai/trellis', label: 'TRELLIS', description: 'Microsoft TRELLIS image-to-3D.' },
  { id: 'fal-ai/triposr', label: 'TripoSR', description: 'Fast TripoSR reconstruction.' },
  { id: 'fal-ai/tripo3d/v2.5/image-to-3d', label: 'Tripo3D v2.5', description: 'Tripo3D v2.5 via Fal.' },
  { id: 'fal-ai/hyper3d/rodin', label: 'Hyper3D Rodin', description: 'Hyper3D Rodin (needs HTTPS image; may fail with data URL).' },
]
export const FAL_MODEL_IDS = new Set(FAL_MODEL_OPTIONS.map((option) => option.id))
export const DEFAULT_FAL_MODEL = FAL_MODEL_OPTIONS[0].id
export const DEFAULT_SETTINGS = {
  quality: 'balanced',
  compactUi: false,
  generationProvider: 'tripo',
  generationMode: 'tripo',
  falModelId: DEFAULT_FAL_MODEL,
  settingsVersion: SETTINGS_STORAGE_VERSION,
}

export const CUSTOM_CELL_STORAGE_KEY = 'bio-demo-custom-cells'
export const MAX_PERSISTED_IMAGE_EDGE = 1280
export const COMPACT_PERSISTED_IMAGE_EDGE = 900
export const MAX_PERSISTED_IMAGE_CHARS = 3_200_000
export const MODEL_API_BASE = import.meta.env.VITE_MODEL_API_BASE || import.meta.env.VITE_TRIPO_API_BASE || 'http://127.0.0.1:8787'
export const GENERATION_POLL_INTERVAL_MS = 3500
export const GENERATION_TIMEOUT_MS = 8 * 60 * 1000
export const GENERATION_PROVIDER_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'Tripo first, then Fal, Rodin, Hunyuan backup.' },
  { id: 'tripo', label: 'Tripo', description: 'Cloud generation.' },
  { id: 'fal', label: 'Fal', description: 'Fal.AI queue (model picked in Settings).' },
  { id: 'rodin', label: 'Rodin', description: 'Hyper3D Rodin cloud generation.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D server.' },
]
export const GENERATION_PROVIDER_IDS = new Set(GENERATION_PROVIDER_OPTIONS.map((provider) => provider.id))
export const GENERATION_MODE_OPTIONS = [
  { id: 'tripo', label: 'Tripo', description: 'Cloud GLB generation.' },
  { id: 'fal', label: 'Fal', description: 'Fal.AI queue (Hunyuan3D / Rodin / TRELLIS, picked in Settings).' },
  { id: 'rodin', label: 'Rodin', description: 'Hyper3D Rodin GLB generation.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D GLB generation.' },
  { id: 'cinematic', label: 'JS Depth', description: 'Browser-side image relief with layered PNG fallback.' },
  { id: 'auto', label: 'Auto', description: 'Tripo, Fal, Rodin, Hunyuan, then JS Depth fallback.' },
  { id: 'local', label: 'Local GLB', description: 'Import an existing GLB or GLTF file.' },
]
export const GENERATION_MODE_IDS = new Set(GENERATION_MODE_OPTIONS.map((mode) => mode.id))
