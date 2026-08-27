import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Info, X } from 'lucide-react'
import {
  CUSTOM_CELL_STORAGE_KEY,
  DEFAULT_SETTINGS,
  GALLERY_STORAGE_KEY,
  GENERATION_HISTORY_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  UI_STATE_STORAGE_KEY,
  UI_STATE_STORAGE_VERSION,
} from './config/appConfig.js'
import {
  createCustomCell,
  getAllCells,
  getAvailableOrganelleIds,
  getCell,
  getCellProfile,
  getCustomCell,
  getDefaultOrganelle,
  getGenerationPrompt,
  getOrganelleDetail,
  getUploadPreviewFromCustomCells,
  isLocalModelFile,
} from './domain/cellCatalog.js'
import { persistCustomCells } from './domain/cellPersistence.js'
import { normalizeSettings, normalizeUiState } from './domain/preferences.js'
import { downloadBlob, downloadJson, downloadText, getCanvasImageDataUrl } from './lib/downloads.js'
import { createImageThumbnailDataUrl, prepareImageForUpload } from './lib/imagePipeline.js'
import { listStoredModels, saveStoredModels } from './lib/modelStore.js'
import { deleteProject, listProjects, loadProject, saveProject } from './lib/projectStore.js'
import { loadStoredValue, storeValue } from './lib/storage.js'
import { analyzeAssetImage, create3dGeneration, get3dApiHealth, get3dServerLogs, getProviderLabel, getProviderPlan, uploadLocal3dModel, waitFor3dModel } from './services/modelApi.js'
import { BottomDeck } from './components/BottomDeck.jsx'
import { CenterStage } from './components/CenterStage.jsx'
import { DetailPanel } from './components/DetailPanel.jsx'
import { LeftSidebar } from './components/LeftSidebar.jsx'
import { StatusToast } from './components/StatusToast.jsx'
import { StudioHeader } from './components/StudioHeader.jsx'
import { WorkspaceDrawer } from './components/WorkspaceDrawer.jsx'
import './App.css'

function mergeCustomModelRecords(primary = [], secondary = []) {
  const order = []
  const byId = new Map()

  for (const cell of [...primary, ...secondary]) {
    if (!cell?.id) continue
    const existing = byId.get(cell.id)
    if (!existing) order.push(cell.id)

    byId.set(cell.id, mergeCustomModelRecord(existing, cell))
  }

  return order.map((id) => byId.get(id)).filter(Boolean)
}

function mergeCustomModelRecord(existing, next) {
  if (!existing) return next

  const existingGeneration = existing.generation || {}
  const nextGeneration = next.generation || {}
  const existingStatus = String(existingGeneration.status || '').toLowerCase()
  const canFillGeneratedAsset = !existingStatus || existingStatus === 'success' || existingStatus === 'local'

  return {
    ...next,
    ...existing,
    imageUrl: existing.imageUrl || next.imageUrl || '',
    generation: {
      ...nextGeneration,
      ...existingGeneration,
      modelUrl: existingGeneration.modelUrl || (canFillGeneratedAsset ? nextGeneration.modelUrl || '' : ''),
      rawModelUrl: existingGeneration.rawModelUrl || (canFillGeneratedAsset ? nextGeneration.rawModelUrl || '' : ''),
      taskId: existingGeneration.taskId || nextGeneration.taskId || '',
    },
    thumbnailUrl: existing.thumbnailUrl || next.thumbnailUrl || '',
    intelligence: existing.intelligence || next.intelligence,
    motionProfile: existing.motionProfile || next.motionProfile,
    savedAt: existing.savedAt || next.savedAt,
    updatedAt: existing.updatedAt || next.updatedAt,
  }
}

function applyAssetInsightToCell(cell, insight) {
  if (!insight?.configured || insight.status !== 'success') return cell

  const objectName = String(insight.objectName || '').trim()
  const displayName = objectName || cell.fullName || cell.name

  return {
    ...cell,
    name: displayName.length > 24 ? `${displayName.slice(0, 24)}...` : displayName,
    fullName: displayName,
    type: insight.categoryLabel || cell.type,
    motionProfile: insight.categoryId || cell.motionProfile,
    intelligence: insight,
    generation: {
      ...cell.generation,
      message: cell.generation?.message || 'Image analyzed; waiting for generation.',
    },
  }
}

function App() {
  const initialCustomCellsRef = useRef(loadStoredValue(CUSTOM_CELL_STORAGE_KEY, []))
  const initialUiStateRef = useRef(normalizeUiState(loadStoredValue(UI_STATE_STORAGE_KEY, {})))
  const [customCells, setCustomCells] = useState(() => initialCustomCellsRef.current)
  const [selectedCell, setSelectedCell] = useState(() => initialUiStateRef.current.selectedCell)
  const [selectedOrganelle, setSelectedOrganelle] = useState(() => initialUiStateRef.current.selectedOrganelle)
  const [crossSection, setCrossSection] = useState(() => initialUiStateRef.current.crossSection)
  const [activePanel, setActivePanel] = useState(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [toast, setToast] = useState('3D Model Studio ready')
  const [favoriteKey, setFavoriteKey] = useState(() => initialUiStateRef.current.favoriteKey)
  const [selectedMicroscope, setSelectedMicroscope] = useState(() => initialUiStateRef.current.selectedMicroscope)
  const [uploadedImage, setUploadedImage] = useState(() => getUploadPreviewFromCustomCells(initialCustomCellsRef.current))
  const [sceneExporter, setSceneExporter] = useState(null)
  const [compareCell, setCompareCell] = useState(() => initialUiStateRef.current.compareCell)
  const [galleryItems, setGalleryItems] = useState(() => loadStoredValue(GALLERY_STORAGE_KEY, []))
  const [generationHistory, setGenerationHistory] = useState(() => loadStoredValue(GENERATION_HISTORY_STORAGE_KEY, []))
  const [notes, setNotes] = useState(() => loadStoredValue(NOTES_STORAGE_KEY, {}))
  const [settings, setSettings] = useState(() => normalizeSettings(loadStoredValue(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)))
  const [apiHealth, setApiHealth] = useState(null)
  const [serverLogs, setServerLogs] = useState({ entries: [], file: '', size: 0 })
  const [projects, setProjects] = useState([])
  const [modelLibraryHydrated, setModelLibraryHydrated] = useState(false)
  const allCells = useMemo(() => getAllCells(customCells), [customCells])
  const latestUploadCell = useMemo(() => customCells.find((cell) => cell.custom && !cell.reference), [customCells])
  const refreshApiHealth = useCallback(async () => {
    try {
      const health = await get3dApiHealth()
      setApiHealth({ ok: true, checkedAt: new Date().toISOString(), ...health })
    } catch (error) {
      setApiHealth({
        ok: false,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'API health check failed.',
      })
    }
  }, [])
  const refreshServerLogs = useCallback(async () => {
    try {
      const logs = await get3dServerLogs(100)
      setServerLogs({ ...logs, checkedAt: new Date().toISOString(), error: '' })
    } catch (error) {
      setServerLogs({
        entries: [],
        file: '',
        size: 0,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Server logs could not be loaded.',
      })
    }
  }, [])

  useEffect(() => {
    storeValue(GALLERY_STORAGE_KEY, galleryItems)
  }, [galleryItems])

  useEffect(() => {
    storeValue(GENERATION_HISTORY_STORAGE_KEY, generationHistory)
  }, [generationHistory])

  useEffect(() => {
    storeValue(NOTES_STORAGE_KEY, notes)
  }, [notes])

  useEffect(() => {
    storeValue(SETTINGS_STORAGE_KEY, settings)
  }, [settings])

  useEffect(() => {
    persistCustomCells(customCells)
  }, [customCells])

  useEffect(() => {
    let cancelled = false

    listStoredModels()
      .then((storedModels) => {
        if (cancelled) return

        if (storedModels.length > 0) {
          setCustomCells((current) => {
            const merged = mergeCustomModelRecords(current, storedModels)
            persistCustomCells(merged)
            return merged
          })
          setUploadedImage((current) => current || getUploadPreviewFromCustomCells(storedModels))
        }

        setModelLibraryHydrated(true)
      })
      .catch(() => {
        if (!cancelled) setModelLibraryHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!modelLibraryHydrated) return
    saveStoredModels(customCells)
  }, [customCells, modelLibraryHydrated])

  useEffect(() => {
    storeValue(UI_STATE_STORAGE_KEY, {
      selectedCell,
      selectedOrganelle,
      selectedMicroscope,
      compareCell,
      crossSection,
      favoriteKey,
      uiStateVersion: UI_STATE_STORAGE_VERSION,
    })
  }, [compareCell, crossSection, favoriteKey, selectedCell, selectedMicroscope, selectedOrganelle])

  useEffect(() => {
    if (activePanel) setInspectorOpen(false)
    if (activePanel === 'Settings') refreshApiHealth()
    if (activePanel === 'Logs') {
      refreshApiHealth()
      refreshServerLogs()
    }
  }, [activePanel, refreshApiHealth, refreshServerLogs])

  useEffect(() => {
    if (!uploadedImage) setUploadedImage(getUploadPreviewFromCustomCells(customCells))
  }, [customCells, uploadedImage])

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!demoMode) return undefined

    const presentationCells = allCells.filter((cell) => !cell.reference).slice(0, 7)
    if (presentationCells.length === 0) return undefined
    let index = Math.max(0, presentationCells.findIndex((cell) => cell.id === selectedCell))

    const timer = window.setInterval(() => {
      index = (index + 1) % presentationCells.length
      const nextCell = presentationCells[index]
      setSelectedCell(nextCell.id)
      setSelectedOrganelle(getDefaultOrganelle(nextCell.id, customCells))
      setCompareCell(getCellProfile(nextCell.id, customCells).compareTarget)
      setToast(`Presentation: ${nextCell.name}`)
    }, 9200)

    return () => window.clearInterval(timer)
  }, [allCells, customCells, demoMode, selectedCell])

  useEffect(() => {
    if (allCells.some((cell) => cell.id === selectedCell)) return
    setSelectedCell('plant')
    setSelectedOrganelle(getDefaultOrganelle('plant', customCells))
    setCompareCell(getCellProfile('plant', customCells).compareTarget)
    setToast('Saved model was missing; starter model loaded')
  }, [allCells, customCells, selectedCell])

  useEffect(() => {
    const available = getAvailableOrganelleIds(selectedCell, customCells)
    if (available.includes(selectedOrganelle)) return
    setSelectedOrganelle(getDefaultOrganelle(selectedCell, customCells))
  }, [customCells, selectedCell, selectedOrganelle])

  function handleSelectCell(cellId) {
    const nextCell = getCell(cellId, customCells)
    setSelectedCell(cellId)
    setSelectedOrganelle(getDefaultOrganelle(cellId, customCells))
    setInspectorOpen(false)
    setCompareCell((current) => (current === cellId ? getCellProfile(cellId, customCells).compareTarget : current))
    if (nextCell.custom) setUploadedImage({ name: nextCell.name, url: nextCell.imageUrl || nextCell.thumbnailUrl || '' })
    setToast(`${nextCell.name} loaded`)
  }

  function handleStageOrganelleSelect(organelleId) {
    setSelectedOrganelle(organelleId)
    setActivePanel(null)
    setInspectorOpen(true)
  }

  function openInspector() {
    setActivePanel(null)
    setInspectorOpen(true)
  }

  function toggleDemoMode() {
    setDemoMode((current) => {
      const next = !current
      if (next) {
        setActivePanel(null)
        setInspectorOpen(false)
      }
      setToast(next ? 'Demo mode enabled' : 'Workbench mode restored')
      return next
    })
  }

  async function handleExport() {
    const cell = getCell(selectedCell, customCells)
    const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)

    if (!sceneExporter) {
      downloadJson(`${selectedCell}-model-export.json`, {
        cell,
        selectedOrganelle,
        detail,
        crossSection,
        selectedMicroscope,
        exportedAt: new Date().toISOString(),
        fallbackReason: 'WebGL model exporter is not available in this browser.',
      })
      setToast('WebGL unavailable; metadata exported')
      return
    }

    setToast('Preparing GLB export')
    try {
      const glb = await sceneExporter()
      downloadBlob(`${selectedCell}-${selectedOrganelle}.glb`, glb)
      setToast(`${cell.name} GLB downloaded`)
    } catch (error) {
      console.error(error)
      downloadJson(`${selectedCell}-model-export.json`, {
        cell,
        selectedOrganelle,
        detail,
        crossSection,
        selectedMicroscope,
        exportedAt: new Date().toISOString(),
        fallbackReason: error instanceof Error ? error.message : 'GLB export failed.',
      })
      setToast('GLB failed; metadata exported')
    }
  }

  function updateCustomCell(cellId, patch) {
    setCustomCells((current) => {
      const next = current.map((cell) => (
        cell.id === cellId
          ? {
              ...cell,
              ...(typeof patch === 'function' ? patch(cell) : patch),
            }
          : cell
      ))
      persistCustomCells(next)
      return next
    })
  }

  async function analyzeUploadedAsset(imageDataUrl, fileName) {
    try {
      const insight = await analyzeAssetImage({ imageDataUrl, fileName })
      if (!insight?.configured) return null
      return insight
    } catch (error) {
      console.warn(error)
      return null
    }
  }

  function addGenerationHistory(entry) {
    const nextEntry = {
      id: entry.id || `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startedAt: new Date().toISOString(),
      status: 'queued',
      ...entry,
    }
    setGenerationHistory((items) => [nextEntry, ...items].slice(0, 40))
    return nextEntry.id
  }

  function updateGenerationHistory(entryId, patch) {
    setGenerationHistory((items) => items.map((item) => (
      item.id === entryId
        ? {
            ...item,
            ...(typeof patch === 'function' ? patch(item) : patch),
          }
        : item
    )))
  }

  async function generateCustomCellModel(customCell, imageUrl, fileName, requestedProvider = settings.generationMode) {
    const providers = getProviderPlan(requestedProvider)
    const errors = []

    for (const provider of providers) {
      const label = getProviderLabel(provider)
      const startedAt = Date.now()
      const historyId = addGenerationHistory({
        cellId: customCell.id,
        cellName: customCell.name,
        provider,
        requestedProvider,
        sourceImageUrl: imageUrl,
        status: 'queued',
        message: `Queued ${label} generation.`,
      })

      if (provider === 'cinematic') {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider: 'cinematic',
            requestedProvider,
            status: 'local',
            progress: 100,
            modelUrl: '',
            rawModelUrl: '',
            message: 'JS depth relief is ready.',
          },
        }))
        updateGenerationHistory(historyId, {
          status: 'success',
          progress: 100,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message: 'JS depth relief is ready.',
        })
        setToast(`${customCell.name} JS depth preview ready`)
        return
      }

      try {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider,
            requestedProvider,
            status: 'uploading',
            progress: 0,
            modelUrl: '',
            rawModelUrl: '',
            message: `Sending image to ${label}.`,
          },
        }))
        updateGenerationHistory(historyId, {
          status: 'uploading',
          progress: 0,
          message: `Sending image to ${label}.`,
        })
        setToast(`Creating ${label} image-to-3D task`)

        const task = await create3dGeneration({
          provider,
          imageDataUrl: imageUrl,
          fileName,
          prompt: getGenerationPrompt(customCell),
          modelId: provider === 'fal' ? settings.falModelId : undefined,
        })

        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider,
            requestedProvider,
            status: 'processing',
            progress: 0,
            taskId: task.taskId,
            message: `${label} is generating the GLB model.`,
          },
        }))
        updateGenerationHistory(historyId, {
          status: 'processing',
          progress: 0,
          taskId: task.taskId,
          message: `${label} is generating the GLB model.`,
        })
        setToast(`${label} task started: ${String(task.taskId).slice(0, 8)}`)

        const finalStatus = await waitFor3dModel(task.taskId, provider, (status) => {
          updateCustomCell(customCell.id, (cell) => ({
            generation: {
              ...cell.generation,
              provider,
              requestedProvider,
              status: status.status || 'processing',
              progress: status.progress ?? cell.generation?.progress ?? null,
              taskId: task.taskId,
              message: status.progress ? `${label} progress ${status.progress}%` : `${label} status: ${status.status || 'processing'}`,
            },
          }))
          updateGenerationHistory(historyId, {
            status: status.status || 'processing',
            progress: status.progress ?? null,
            taskId: task.taskId,
            message: status.progress ? `${label} progress ${status.progress}%` : `${label} status: ${status.status || 'processing'}`,
          })
        })

        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider,
            requestedProvider,
            status: 'success',
            progress: 100,
            taskId: task.taskId,
            modelUrl: finalStatus.modelUrl,
            rawModelUrl: finalStatus.rawModelUrl,
            message: `${label} GLB loaded.`,
          },
        }))
        updateGenerationHistory(historyId, {
          status: 'success',
          progress: 100,
          taskId: task.taskId,
          modelUrl: finalStatus.modelUrl,
          rawModelUrl: finalStatus.rawModelUrl,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message: `${label} GLB loaded.`,
        })
        setToast(`${customCell.name} ${label} 3D model ready`)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : `${label} generation failed.`
        errors.push(`${label}: ${message}`)
        updateGenerationHistory(historyId, {
          status: 'failed',
          progress: null,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message,
        })

        if (provider !== providers[providers.length - 1]) {
          updateCustomCell(customCell.id, (cell) => ({
            generation: {
              ...cell.generation,
              provider,
              requestedProvider,
              status: 'processing',
              progress: null,
              message: `${label} failed; trying ${getProviderLabel(providers[providers.indexOf(provider) + 1])}.`,
            },
          }))
          setToast(`${label} failed; trying backup provider`)
        }
      }
    }

    throw new Error(errors.join(' | '))
  }

  async function handleRetryGeneration(cellId) {
    const cell = getCustomCell(cellId, customCells)
    if (!cell?.imageUrl) {
      setToast('No source image to retry')
      return
    }

    setSelectedCell(cell.id)
    setSelectedOrganelle(getDefaultOrganelle(cell.id, customCells))
    setToast('Retrying 3D generation')

    try {
      const retryMode = settings.generationMode === 'local' ? 'cinematic' : settings.generationMode
      await generateCustomCellModel(cell, cell.imageUrl, `${cell.name}.png`, retryMode)
    } catch (error) {
      console.error(error)
      updateCustomCell(cell.id, (current) => ({
        generation: {
          ...current.generation,
          requestedProvider: settings.generationMode,
          status: 'failed',
          progress: null,
          modelUrl: '',
          rawModelUrl: '',
          message: error instanceof Error ? error.message : '3D generation failed.',
        },
      }))
      setToast(error instanceof Error ? error.message : 'Image-to-3D generation failed')
    }
  }

  async function handleUploadImage(file) {
    if (isLocalModelFile(file)) {
      await handleUploadLocalModel(file)
      return
    }

    setToast('Uploading image for 3D generation')
    let customCell = null
    try {
      const requestedMode = settings.generationMode === 'local' ? 'cinematic' : settings.generationMode
      if (settings.generationMode === 'local') setToast('Local GLB mode needs a model file; using JS Depth')
      const { displayUrl, generationUrl } = await prepareImageForUpload(file)
      const thumbnailUrl = await createImageThumbnailDataUrl(displayUrl)
      setToast('Analyzing source image')
      const assetInsight = await analyzeUploadedAsset(generationUrl, file.name)
      customCell = applyAssetInsightToCell(createCustomCell(file.name, displayUrl, {
        provider: requestedMode,
        requestedProvider: requestedMode,
        thumbnailUrl: thumbnailUrl || displayUrl,
        type: requestedMode === 'cinematic' ? 'JS Depth preview asset' : undefined,
      }), assetInsight)
      customCell.generation = {
        ...customCell.generation,
        provider: requestedMode,
        requestedProvider: requestedMode,
        status: 'uploading',
        progress: 0,
        message: requestedMode === 'cinematic' ? 'Building browser-side JS depth relief.' : 'Sending image to backend.',
      }
      const nextCustomCells = [customCell, ...customCells].slice(0, 8)
      persistCustomCells(nextCustomCells)

      setCustomCells(nextCustomCells)
      setUploadedImage({ name: file.name, url: displayUrl })
      setSelectedCell(customCell.id)
      setSelectedOrganelle(getDefaultOrganelle(customCell.id, nextCustomCells))
      setCompareCell(customCell.template)
      setActivePanel('Library')
      await generateCustomCellModel(customCell, generationUrl, file.name, requestedMode)
    } catch (error) {
      console.error(error)
      if (customCell) {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            requestedProvider: settings.generationMode,
            status: 'failed',
            progress: null,
            message: error instanceof Error ? error.message : '3D generation failed.',
          },
        }))
      }
      setToast(error instanceof Error ? error.message : 'Image-to-3D generation failed')
    }
  }

  async function handleUploadLocalModel(file) {
    setToast('Importing local 3D model')
    let customCell = null
    let historyId = ''
    const startedAt = Date.now()

    try {
      customCell = createCustomCell(file.name, '', {
        provider: 'local',
        requestedProvider: 'local',
        type: 'Local 3D Model',
        status: 'uploading',
        progress: 0,
        message: 'Saving model to local cache.',
      })
      historyId = addGenerationHistory({
        cellId: customCell.id,
        cellName: customCell.name,
        provider: 'local',
        requestedProvider: 'local',
        status: 'uploading',
        sourceImageUrl: '',
        message: 'Importing local GLB/GLTF.',
      })
      const nextCustomCells = [customCell, ...customCells].slice(0, 8)
      persistCustomCells(nextCustomCells)

      setCustomCells(nextCustomCells)
      setUploadedImage({ name: file.name, url: '' })
      setSelectedCell(customCell.id)
      setSelectedOrganelle(getDefaultOrganelle(customCell.id, nextCustomCells))
      setCompareCell(customCell.template)
      setActivePanel('Library')

      const localModel = await uploadLocal3dModel(file)
      updateCustomCell(customCell.id, (cell) => ({
        generation: {
          ...cell.generation,
          provider: 'local',
          requestedProvider: 'local',
          status: 'success',
          progress: 100,
          taskId: localModel.taskId,
          modelUrl: localModel.modelUrl,
          rawModelUrl: '',
          message: 'Local GLB loaded from disk cache.',
        },
      }))
      updateGenerationHistory(historyId, {
        status: 'success',
        progress: 100,
        taskId: localModel.taskId,
        modelUrl: localModel.modelUrl,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        message: 'Local GLB loaded from disk cache.',
      })
      setToast(`${customCell.name} local 3D model ready`)
    } catch (error) {
      console.error(error)
      if (customCell) {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider: 'local',
            requestedProvider: 'local',
            status: 'failed',
            progress: null,
            message: error instanceof Error ? error.message : 'Local model import failed.',
          },
        }))
      }
      if (historyId) {
        updateGenerationHistory(historyId, {
          status: 'failed',
          progress: null,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : 'Local model import failed.',
        })
      }
      setToast(error instanceof Error ? error.message : 'Local model import failed')
    }
  }

  async function handleSaveGallery() {
    const cell = getCell(selectedCell, customCells)
    const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)
    const generation = cell.custom ? cell.generation : null
    const thumbnailUrl = getCanvasImageDataUrl({ scale: 1, maxWidth: 420 }) || cell.imageUrl || ''
    const item = {
      id: `${Date.now()}-${selectedCell}-${selectedOrganelle}`,
      title: `${cell.name} / ${detail.title}`,
      cellId: selectedCell,
      organelleId: selectedOrganelle,
      microscope: selectedMicroscope,
      crossSection,
      generationProvider: generation?.provider || 'built-in',
      modelUrl: generation?.modelUrl || '',
      thumbnailUrl,
      createdAt: new Date().toISOString(),
    }
    setGalleryItems((items) => [item, ...items].slice(0, 12))
    setToast(thumbnailUrl ? 'View saved with screenshot' : 'View saved without screenshot')
  }

  function handleClearGallery() {
    setGalleryItems([])
    setToast('Gallery cleared')
  }

  function handleRestoreGalleryItem(item) {
    if (!item) return
    handleSelectCell(item.cellId)
    setSelectedOrganelle(item.organelleId)
    setSelectedMicroscope(item.microscope)
    if (typeof item.crossSection === 'boolean') setCrossSection(item.crossSection)
    setToast('Saved gallery view restored')
  }

  function handleRenameGalleryItem(itemId, title) {
    const nextTitle = title.trim()
    if (!nextTitle) return
    setGalleryItems((items) => items.map((item) => (item.id === itemId ? { ...item, title: nextTitle } : item)))
    setToast('Gallery item renamed')
  }

  function handleDeleteGalleryItem(itemId) {
    setGalleryItems((items) => items.filter((item) => item.id !== itemId))
    setToast('Gallery item removed')
  }

  function handleDownloadGalleryImage(item) {
    if (!item?.thumbnailUrl) {
      setToast('No screenshot stored for this view')
      return
    }
    const link = document.createElement('a')
    link.href = item.thumbnailUrl
    link.download = `${item.cellId}-${item.organelleId}-gallery.png`
    link.click()
    setToast('Gallery screenshot downloaded')
  }

  function handleExportGallery() {
    downloadJson('3d-model-studio-gallery.json', galleryItems)
    setToast('Gallery JSON exported')
  }

  function handleDeleteCustomCell(cellId) {
    const deleted = customCells.find((cell) => cell.id === cellId)
    if (!deleted) return

    const nextCustomCells = customCells.filter((cell) => cell.id !== cellId)
    persistCustomCells(nextCustomCells)
    setCustomCells(nextCustomCells)
    setGalleryItems((items) => items.filter((item) => item.cellId !== cellId))
    setGenerationHistory((items) => items.filter((item) => item.cellId !== cellId))
    setNotes((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${cellId}:`))))

    if (selectedCell === cellId) {
      setSelectedCell('plant')
      setSelectedOrganelle(getDefaultOrganelle('plant', nextCustomCells))
      setCompareCell(getCellProfile('plant', nextCustomCells).compareTarget)
      setInspectorOpen(false)
    }

    setUploadedImage(getUploadPreviewFromCustomCells(nextCustomCells))
    setToast(`${deleted.name} removed`)
  }

  function handleUpdateNote(noteKey, value) {
    setNotes((current) => {
      const next = { ...current }
      if (value.trim()) next[noteKey] = value
      else delete next[noteKey]
      return next
    })
  }

  function buildNotebookText() {
    const cell = getCell(selectedCell, customCells)
    const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)
    const profile = getCellProfile(selectedCell, customCells)

    return [
      `# ${cell.name} - ${detail.title}`,
      '',
      `Type: ${cell.type}`,
      `View: ${selectedMicroscope}`,
      '',
      '## Observation',
      profile.summary,
      '',
      '## Part Detail',
      `${detail.title}: ${detail.subtitle}. Scale: ${detail.size}. Position: ${detail.location}. Visibility: ${detail.visible}.`,
      '',
      '## Narration',
      `${cell.name} highlights ${detail.title.toLowerCase()} as a key structure. ${detail.note}`,
    ].join('\n')
  }

  function handleGenerateNote() {
    const noteKey = `${selectedCell}:${selectedOrganelle}`
    const generated = buildNotebookText()
    setNotes((current) => ({ ...current, [noteKey]: current[noteKey]?.trim() ? `${current[noteKey]}\n\n${generated}` : generated }))
    setToast('Notebook draft generated')
  }

  async function handleCopyNote() {
    const noteKey = `${selectedCell}:${selectedOrganelle}`
    const text = notes[noteKey] || buildNotebookText()
    try {
      await navigator.clipboard.writeText(text)
      setToast('Notebook copied')
    } catch {
      setToast('Clipboard unavailable')
    }
  }

  function handleExportNote() {
    const noteKey = `${selectedCell}:${selectedOrganelle}`
    const text = notes[noteKey] || buildNotebookText()
    downloadText(`${selectedCell}-${selectedOrganelle}-notes.md`, text, 'text/markdown;charset=utf-8')
    setToast('Notebook Markdown exported')
  }

  async function handleCopyText(text, successMessage = 'Copied') {
    try {
      await navigator.clipboard.writeText(text)
      setToast(successMessage)
    } catch {
      setToast('Clipboard unavailable')
    }
  }

  function handleClearWorkspaceCache() {
    if (!window.confirm('Clear uploaded models, gallery items, and notes from this browser?')) return
    setCustomCells([])
    setGalleryItems([])
    setGenerationHistory([])
    setNotes({})
    setUploadedImage(null)
    setSelectedCell('plant')
    setSelectedOrganelle(getDefaultOrganelle('plant', []))
    setCompareCell(getCellProfile('plant', []).compareTarget)
    setToast('Workspace cache cleared')
  }

  function handleResetWorkspace() {
    if (!window.confirm('Reset the workspace, settings, saved views, notes, and uploaded models?')) return
    const normalizedDefaults = normalizeSettings(DEFAULT_SETTINGS)
    setSettings(normalizedDefaults)
    setCustomCells([])
    setGalleryItems([])
    setGenerationHistory([])
    setNotes({})
    setFavoriteKey('')
    setUploadedImage(null)
    setSelectedCell('plant')
    setSelectedOrganelle(getDefaultOrganelle('plant', []))
    setSelectedMicroscope('Studio Preview')
    setCrossSection(true)
    setCompareCell(getCellProfile('plant', []).compareTarget)
    setActivePanel(null)
    setInspectorOpen(false)
    setToast('Workspace reset')
  }

  function buildProjectSnapshot(name) {
    return {
      name,
      thumbnailUrl: getCanvasImageDataUrl({ scale: 1, maxWidth: 420 }) || getCell(selectedCell, customCells).imageUrl || '',
      summary: `${getCell(selectedCell, customCells).name} / ${getOrganelleDetail(selectedCell, selectedOrganelle, customCells).title}`,
      state: {
        customCells,
        galleryItems,
        generationHistory,
        notes,
        settings,
        ui: {
          selectedCell,
          selectedOrganelle,
          selectedMicroscope,
          compareCell,
          crossSection,
          favoriteKey,
        },
      },
    }
  }

  async function refreshProjects() {
    try {
      setProjects(await listProjects())
    } catch {
      setProjects([])
    }
  }

  async function handleSaveProject() {
    const fallbackName = `${getCell(selectedCell, customCells).name} Workspace`
    const name = window.prompt('Project name', fallbackName)
    if (name === null) return
    const project = await saveProject(buildProjectSnapshot(name.trim() || fallbackName))
    await refreshProjects()
    setToast(`${project.name} saved`)
  }

  async function handleLoadProject(projectId) {
    const project = await loadProject(projectId)
    if (!project?.state) {
      setToast('Project could not be loaded')
      return
    }

    const nextCustomCells = project.state.customCells || []
    persistCustomCells(nextCustomCells)
    const ui = project.state.ui || {}
    const nextSettings = normalizeSettings(project.state.settings || DEFAULT_SETTINGS)
    setCustomCells(nextCustomCells)
    setGalleryItems(project.state.galleryItems || [])
    setGenerationHistory(project.state.generationHistory || [])
    setNotes(project.state.notes || {})
    setSettings(nextSettings)
    setSelectedCell(ui.selectedCell || 'plant')
    setSelectedOrganelle(ui.selectedOrganelle || getDefaultOrganelle(ui.selectedCell || 'plant', nextCustomCells))
    setSelectedMicroscope(ui.selectedMicroscope || 'Studio Preview')
    setCompareCell(ui.compareCell || getCellProfile(ui.selectedCell || 'plant', nextCustomCells).compareTarget)
    setCrossSection(typeof ui.crossSection === 'boolean' ? ui.crossSection : true)
    setFavoriteKey(ui.favoriteKey || '')
    setUploadedImage(getUploadPreviewFromCustomCells(nextCustomCells))
    setActivePanel(null)
    setInspectorOpen(false)
    setToast(`${project.name} loaded`)
  }

  async function handleDeleteProject(projectId) {
    await deleteProject(projectId)
    await refreshProjects()
    setToast('Project deleted')
  }

  function handleExportProject(project) {
    downloadJson(`${project.name || '3d-model-studio-project'}.modelstudio.json`, project)
    setToast('Project package exported')
  }

  function handleClearGenerationHistory() {
    setGenerationHistory([])
    setToast('Generation history cleared')
  }

  function handleExportDiagnostics() {
    downloadJson(`3d-model-studio-diagnostics-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      selected: {
        cell: selectedCell,
        organelle: selectedOrganelle,
        microscope: selectedMicroscope,
        compareCell,
        crossSection,
      },
      settings,
      apiHealth,
      serverLogs,
      generationHistory,
      galleryCount: galleryItems.length,
      noteCount: Object.keys(notes).length,
      customCells: customCells.map((cell) => ({
        id: cell.id,
        name: cell.name,
        template: cell.template,
        provider: cell.generation?.provider,
        requestedProvider: cell.generation?.requestedProvider,
        status: cell.generation?.status,
        progress: cell.generation?.progress,
        taskId: cell.generation?.taskId,
        modelUrl: cell.generation?.modelUrl,
        message: cell.generation?.message,
      })),
    })
    setToast('Diagnostics exported')
  }

  async function handleRunProviderCompare(cellId = selectedCell) {
    const sourceCell = getCustomCell(cellId, customCells)
    if (!sourceCell?.imageUrl) {
      setToast('Provider compare needs a custom model with a source image')
      return
    }

    const providers = apiHealth?.providers?.fal?.configured ? ['rodin', 'tripo', 'fal', 'cinematic'] : ['rodin', 'tripo', 'cinematic']
    const comparisonCells = providers.map((provider) => createCustomCell(`${sourceCell.name} ${getProviderLabel(provider)} compare.png`, sourceCell.imageUrl, {
      provider,
      requestedProvider: provider,
      type: `${getProviderLabel(provider)} provider comparison`,
    }))

    setCustomCells((current) => {
      const next = [...comparisonCells, ...current].slice(0, 12)
      persistCustomCells(next)
      return next
    })
    setSelectedCell(comparisonCells[0].id)
    setSelectedOrganelle(getDefaultOrganelle(comparisonCells[0].id, comparisonCells))
    setActivePanel('Library')
    setToast(`Provider compare started: ${providers.map(getProviderLabel).join(', ')}`)

    await Promise.all(comparisonCells.map(async (candidate) => {
      try {
        await generateCustomCellModel(candidate, sourceCell.imageUrl, `${candidate.name}.png`, candidate.generation.provider)
      } catch (error) {
        console.error(error)
        updateCustomCell(candidate.id, (cell) => ({
          generation: {
            ...cell.generation,
            status: 'failed',
            progress: null,
            message: error instanceof Error ? error.message : 'Provider comparison failed.',
          },
        }))
      }
    }))
    setToast('Provider compare finished')
  }

  function handleOpenCompare(cellId) {
    setCompareCell(cellId)
    setActivePanel('Compare')
    setToast(`${getCell(selectedCell, customCells).name} compared with ${getCell(cellId, customCells).name}`)
  }

  return (
    <main className={settings.compactUi ? 'studio-shell compact-ui' : 'studio-shell'}>
      <motion.div className={demoMode ? 'studio-window workbench-v2 demo-mode' : 'studio-window workbench-v2'} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
        <StudioHeader activePanel={activePanel} setActivePanel={setActivePanel} demoMode={demoMode} language={settings.language} onToggleDemoMode={toggleDemoMode} onNotify={setToast} />
        <WorkspaceDrawer
          activePanel={activePanel}
          selectedCell={selectedCell}
          selectedOrganelle={selectedOrganelle}
          compareCell={compareCell}
          allCells={allCells}
          customCells={customCells}
          galleryItems={galleryItems}
          generationHistory={generationHistory}
          notes={notes}
          settings={settings}
          projects={projects}
          crossSection={crossSection}
          selectedMicroscope={selectedMicroscope}
          uploadedImage={uploadedImage}
          favoriteKey={favoriteKey}
          onClose={() => setActivePanel(null)}
          onSelectCell={handleSelectCell}
          onSelectOrganelle={setSelectedOrganelle}
          onSetCompareCell={(cellId) => {
            setCompareCell(cellId)
            setToast(`${getCell(cellId, customCells).name} set as comparison target`)
          }}
          onSaveGallery={handleSaveGallery}
          onClearGallery={handleClearGallery}
          onRestoreGalleryItem={handleRestoreGalleryItem}
          onRenameGalleryItem={handleRenameGalleryItem}
          onDeleteGalleryItem={handleDeleteGalleryItem}
          onDownloadGalleryImage={handleDownloadGalleryImage}
          onExportGallery={handleExportGallery}
          onDeleteCustomCell={handleDeleteCustomCell}
          onClearGenerationHistory={handleClearGenerationHistory}
          onUpdateNote={handleUpdateNote}
          onGenerateNote={handleGenerateNote}
          onCopyNote={handleCopyNote}
          onExportNote={handleExportNote}
          onUpdateSettings={setSettings}
          onSetCrossSection={setCrossSection}
          onExport={handleExport}
          exportAvailable={Boolean(sceneExporter)}
          exportReason={sceneExporter ? 'GLB export ready' : 'No mounted WebGL model is available for GLB export.'}
          apiHealth={apiHealth}
          serverLogs={serverLogs}
          onRefreshApiHealth={refreshApiHealth}
          onRefreshServerLogs={refreshServerLogs}
          onExportDiagnostics={handleExportDiagnostics}
          onClearWorkspaceCache={handleClearWorkspaceCache}
          onResetWorkspace={handleResetWorkspace}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
          onDeleteProject={handleDeleteProject}
          onExportProject={handleExportProject}
          onRunProviderCompare={handleRunProviderCompare}
          onCopyText={handleCopyText}
          onNotify={setToast}
        />
        <StatusToast message={toast} />
        {demoMode && (
          <button type="button" className="demo-exit-button" onClick={toggleDemoMode}>
            Exit Demo
          </button>
        )}
        <div className="studio-workbench-v2">
          <div className="stage-zone">
            <CenterStage
              selectedCell={selectedCell}
              selectedOrganelle={selectedOrganelle}
              setSelectedOrganelle={handleStageOrganelleSelect}
              crossSection={crossSection}
              setCrossSection={setCrossSection}
              renderQuality={settings.quality}
              environment={settings.environment}
              screenshotScale={settings.screenshotScale}
              customCells={customCells}
              generationHistory={generationHistory}
              demoMode={demoMode}
              onNotify={setToast}
              onExport={handleExport}
              exportAvailable={Boolean(sceneExporter)}
              exportReason={sceneExporter ? 'Export the current WebGL scene as GLB.' : 'No mounted WebGL model is available for GLB export.'}
              onExporterReady={setSceneExporter}
              onRetryGeneration={handleRetryGeneration}
              onOpenInspector={openInspector}
            />
          </div>

          <div className="selection-shelf">
            <LeftSidebar
              selectedCell={selectedCell}
              setSelectedCell={handleSelectCell}
              customCells={customCells}
              onDeleteCustomCell={handleDeleteCustomCell}
              onRetryGeneration={handleRetryGeneration}
            />
          </div>

          <button
            type="button"
            className={inspectorOpen ? 'inspector-trigger active' : 'inspector-trigger'}
            onClick={openInspector}
            aria-expanded={inspectorOpen}
          >
            <Info size={16} />
            Info
          </button>

          {inspectorOpen && (
            <>
              <button type="button" className="inspector-scrim" aria-label="Close inspector" onClick={() => setInspectorOpen(false)} />
              <div className="inspector-zone open">
                <button type="button" className="inspector-close" onClick={() => setInspectorOpen(false)}>
                  <X size={15} />
                  Close
                </button>
                <DetailPanel
                  selectedCell={selectedCell}
                  selectedOrganelle={selectedOrganelle}
                  favoriteKey={favoriteKey}
                  setFavoriteKey={setFavoriteKey}
                  customCells={customCells}
                  onNotify={setToast}
                />
              </div>
            </>
          )}

          <div className="command-zone">
            <BottomDeck
              selectedCell={selectedCell}
              selectedMicroscope={selectedMicroscope}
              setSelectedMicroscope={setSelectedMicroscope}
              uploadedImage={uploadedImage}
              latestUploadCell={latestUploadCell}
              generationMode={settings.generationMode}
              onGenerationModeChange={(generationMode) => setSettings((current) => ({ ...current, generationMode }))}
              onUploadImage={handleUploadImage}
              compareCell={compareCell}
              customCells={customCells}
              onCompare={handleOpenCompare}
              onOpenGenerationCell={handleSelectCell}
              onNotify={setToast}
            />
          </div>
        </div>
      </motion.div>
    </main>
  )
}

export default App
