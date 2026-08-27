import {
  DEFAULT_SETTINGS,
  FAL_MODEL_IDS,
  GENERATION_MODE_IDS,
  GENERATION_PROVIDER_IDS,
  LANGUAGE_IDS,
  SCREENSHOT_SCALE_OPTIONS,
  SETTINGS_STORAGE_VERSION,
  UI_STATE_STORAGE_VERSION,
} from '../config/appConfig.js'
import { DEFAULT_ENVIRONMENT_PRESET, ENVIRONMENT_PRESET_IDS } from '../viewer/environments.js'
import { MICROSCOPE_IMAGES } from './cellData.js'
import { getCellProfile } from './cellCatalog.js'

export function normalizeSettings(value) {
  const stored = value && typeof value === 'object' ? value : {}
  const next = { ...DEFAULT_SETTINGS, ...stored }
  const storedMode = stored.generationMode || stored.generationProvider

  if (stored.settingsVersion !== SETTINGS_STORAGE_VERSION) {
    next.generationProvider = GENERATION_PROVIDER_IDS.has(stored.generationProvider) ? stored.generationProvider : DEFAULT_SETTINGS.generationProvider
    next.generationMode = GENERATION_MODE_IDS.has(storedMode) ? storedMode : DEFAULT_SETTINGS.generationMode
    next.falModelId = FAL_MODEL_IDS.has(stored.falModelId) ? stored.falModelId : DEFAULT_SETTINGS.falModelId
    next.screenshotScale = normalizeScreenshotScale(stored.screenshotScale)
    next.language = LANGUAGE_IDS.has(stored.language) ? stored.language : DEFAULT_SETTINGS.language
  }

  if (!GENERATION_PROVIDER_IDS.has(next.generationProvider)) {
    next.generationProvider = DEFAULT_SETTINGS.generationProvider
  }

  if (!GENERATION_MODE_IDS.has(next.generationMode)) {
    next.generationMode = DEFAULT_SETTINGS.generationMode
  }

  if (!FAL_MODEL_IDS.has(next.falModelId)) {
    next.falModelId = DEFAULT_SETTINGS.falModelId
  }

  next.screenshotScale = normalizeScreenshotScale(next.screenshotScale)
  if (!LANGUAGE_IDS.has(next.language)) {
    next.language = DEFAULT_SETTINGS.language
  }

  // 环境预设是后加的，老用户的存储里没有这个字段，必须独立归一化，
  // 不能放进上面那个 settingsVersion 分支 —— 否则只有升版本的人才有值。
  next.environment = ENVIRONMENT_PRESET_IDS.has(next.environment)
    ? next.environment
    : DEFAULT_ENVIRONMENT_PRESET

  next.settingsVersion = SETTINGS_STORAGE_VERSION
  return next
}

function normalizeScreenshotScale(value) {
  const scale = Number(value)
  return SCREENSHOT_SCALE_OPTIONS.some((option) => option.id === scale) ? scale : DEFAULT_SETTINGS.screenshotScale
}

export function normalizeUiState(value) {
  const stored = value && typeof value === 'object' ? value : {}
  const selectedMicroscope = MICROSCOPE_IMAGES.some((item) => item.label === stored.selectedMicroscope)
    ? stored.selectedMicroscope
    : MICROSCOPE_IMAGES[0].label
  return {
    selectedCell: typeof stored.selectedCell === 'string' ? stored.selectedCell : 'plant',
    selectedOrganelle: typeof stored.selectedOrganelle === 'string' ? stored.selectedOrganelle : 'nucleus',
    selectedMicroscope,
    compareCell: typeof stored.compareCell === 'string' ? stored.compareCell : getCellProfile('plant').compareTarget,
    crossSection: typeof stored.crossSection === 'boolean' ? stored.crossSection : true,
    favoriteKey: typeof stored.favoriteKey === 'string' ? stored.favoriteKey : '',
    uiStateVersion: UI_STATE_STORAGE_VERSION,
  }
}
