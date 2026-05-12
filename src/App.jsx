import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CUSTOM_CELL_STORAGE_KEY,
  DEFAULT_SETTINGS,
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
  inferCellTemplate,
  isLocalModelFile,
} from './domain/cellCatalog.js'
import { normalizeSettings, normalizeUiState } from './domain/preferences.js'
import { downloadBlob, downloadJson } from './lib/downloads.js'
import { prepareImageForUpload } from './lib/imagePipeline.js'
import { loadStoredValue, storeValue } from './lib/storage.js'
import { create3dGeneration, getProviderLabel, getProviderPlan, uploadLocal3dModel, waitFor3dModel } from './services/modelApi.js'
import { BottomDeck } from './components/BottomDeck.jsx'
import { CenterStage } from './components/CenterStage.jsx'
import { DetailPanel } from './components/DetailPanel.jsx'
import { LeftSidebar } from './components/LeftSidebar.jsx'
import { StatusToast } from './components/StatusToast.jsx'
import { StudioHeader } from './components/StudioHeader.jsx'
import { WorkspaceDrawer } from './components/WorkspaceDrawer.jsx'
import './App.css'

function App() {
  const initialCustomCellsRef = useRef(loadStoredValue(CUSTOM_CELL_STORAGE_KEY, []))
  const initialUiStateRef = useRef(normalizeUiState(loadStoredValue(UI_STATE_STORAGE_KEY, {})))
  const [customCells, setCustomCells] = useState(() => initialCustomCellsRef.current)
  const [selectedCell, setSelectedCell] = useState(() => initialUiStateRef.current.selectedCell)
  const [selectedOrganelle, setSelectedOrganelle] = useState(() => initialUiStateRef.current.selectedOrganelle)
  const [crossSection, setCrossSection] = useState(() => initialUiStateRef.current.crossSection)
  const [activePanel, setActivePanel] = useState(null)
  const [toast, setToast] = useState('Plant cell ready')
  const [favoriteKey, setFavoriteKey] = useState(() => initialUiStateRef.current.favoriteKey)
  const [labelVisible, setLabelVisible] = useState(() => loadStoredValue('bio-demo-label-visible', true))
  const [selectedMicroscope, setSelectedMicroscope] = useState(() => initialUiStateRef.current.selectedMicroscope)
  const [uploadedImage, setUploadedImage] = useState(() => getUploadPreviewFromCustomCells(initialCustomCellsRef.current))
  const [sceneExporter, setSceneExporter] = useState(null)
  const [compareCell, setCompareCell] = useState(() => initialUiStateRef.current.compareCell)
  const [galleryItems, setGalleryItems] = useState(() => loadStoredValue('bio-demo-gallery', []))
  const [notes, setNotes] = useState(() => loadStoredValue('bio-demo-notes', {}))
  const [settings, setSettings] = useState(() => normalizeSettings(loadStoredValue(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)))
  const allCells = useMemo(() => getAllCells(customCells), [customCells])

  useEffect(() => {
    storeValue('bio-demo-gallery', galleryItems)
  }, [galleryItems])

  useEffect(() => {
    storeValue('bio-demo-notes', notes)
  }, [notes])

  useEffect(() => {
    storeValue(SETTINGS_STORAGE_KEY, settings)
  }, [settings])

  useEffect(() => {
    storeValue('bio-demo-label-visible', labelVisible)
  }, [labelVisible])

  useEffect(() => {
    storeValue(CUSTOM_CELL_STORAGE_KEY, customCells)
  }, [customCells])

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
    if (!uploadedImage) setUploadedImage(getUploadPreviewFromCustomCells(customCells))
  }, [customCells, uploadedImage])

  useEffect(() => {
    if (allCells.some((cell) => cell.id === selectedCell)) return
    setSelectedCell('plant')
    setSelectedOrganelle(getDefaultOrganelle('plant', customCells))
    setCompareCell(getCellProfile('plant', customCells).compareTarget)
    setToast('Saved custom cell was missing; Plant Cell loaded')
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
    setCompareCell((current) => (current === cellId ? getCellProfile(cellId, customCells).compareTarget : current))
    if (nextCell.custom) setUploadedImage({ name: nextCell.name, url: nextCell.imageUrl || '' })
    setToast(`${nextCell.name} loaded`)
  }

  async function handleExport() {
    const cell = getCell(selectedCell, customCells)
    const detail = getOrganelleDetail(selectedCell, selectedOrganelle, customCells)

    if (!sceneExporter) {
      downloadJson(`${selectedCell}-cell-export.json`, {
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
      downloadJson(`${selectedCell}-cell-export.json`, {
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
      storeValue(CUSTOM_CELL_STORAGE_KEY, next)
      return next
    })
  }

  async function generateCustomCellModel(customCell, imageUrl, fileName, requestedProvider = settings.generationMode) {
    const providers = getProviderPlan(requestedProvider)
    const errors = []

    for (const provider of providers) {
      const label = getProviderLabel(provider)

      if (provider === 'cinematic') {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider: 'cinematic',
            requestedProvider,
            status: 'local',
            modelUrl: '',
            rawModelUrl: '',
            message: 'JS depth relief is ready.',
          },
        }))
        setToast(`${customCell.name} JS depth visual ready`)
        return
      }

      try {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider,
            requestedProvider,
            status: 'uploading',
            modelUrl: '',
            rawModelUrl: '',
            message: `Sending image to ${label}.`,
          },
        }))
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
            taskId: task.taskId,
            message: `${label} is generating the GLB model.`,
          },
        }))
        setToast(`${label} task started: ${String(task.taskId).slice(0, 8)}`)

        const finalStatus = await waitFor3dModel(task.taskId, provider, (status) => {
          updateCustomCell(customCell.id, (cell) => ({
            generation: {
              ...cell.generation,
              provider,
              requestedProvider,
              status: status.status || 'processing',
              taskId: task.taskId,
              message: status.progress ? `${label} progress ${status.progress}%` : `${label} status: ${status.status || 'processing'}`,
            },
          }))
        })

        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider,
            requestedProvider,
            status: 'success',
            taskId: task.taskId,
            modelUrl: finalStatus.modelUrl,
            rawModelUrl: finalStatus.rawModelUrl,
            message: `${label} GLB loaded.`,
          },
        }))
        setToast(`${customCell.name} ${label} 3D model ready`)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : `${label} generation failed.`
        errors.push(`${label}: ${message}`)

        if (provider !== providers[providers.length - 1]) {
          updateCustomCell(customCell.id, (cell) => ({
            generation: {
              ...cell.generation,
              provider,
              requestedProvider,
              status: 'processing',
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
      customCell = createCustomCell(file.name, displayUrl, {
        provider: requestedMode,
        requestedProvider: requestedMode,
        type: requestedMode === 'cinematic' ? `JS Depth ${getCell(inferCellTemplate(file.name)).name}` : undefined,
      })
      customCell.generation = {
        ...customCell.generation,
        provider: requestedMode,
        requestedProvider: requestedMode,
        status: 'uploading',
        message: requestedMode === 'cinematic' ? 'Building browser-side JS depth relief.' : 'Sending image to backend.',
      }
      const nextCustomCells = [customCell, ...customCells].slice(0, 8)

      setCustomCells(nextCustomCells)
      storeValue(CUSTOM_CELL_STORAGE_KEY, nextCustomCells)
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

    try {
      customCell = createCustomCell(file.name, '', {
        provider: 'local',
        requestedProvider: 'local',
        type: 'Local 3D Model',
        status: 'uploading',
        message: 'Saving model to local cache.',
      })
      const nextCustomCells = [customCell, ...customCells].slice(0, 8)

      setCustomCells(nextCustomCells)
      storeValue(CUSTOM_CELL_STORAGE_KEY, nextCustomCells)
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
          taskId: localModel.taskId,
          modelUrl: localModel.modelUrl,
          rawModelUrl: '',
          message: 'Local GLB loaded from disk cache.',
        },
      }))
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
            message: error instanceof Error ? error.message : 'Local model import failed.',
          },
        }))
      }
      setToast(error instanceof Error ? error.message : 'Local model import failed')
    }
  }

  function handleSaveGallery() {
    const item = {
      id: `${Date.now()}-${selectedCell}-${selectedOrganelle}`,
      cellId: selectedCell,
      organelleId: selectedOrganelle,
      microscope: selectedMicroscope,
      createdAt: new Date().toISOString(),
    }
    setGalleryItems((items) => [item, ...items].slice(0, 12))
    setToast('View saved to Gallery')
  }

  function handleClearGallery() {
    setGalleryItems([])
    setToast('Gallery cleared')
  }

  function handleUpdateNote(noteKey, value) {
    setNotes((current) => {
      const next = { ...current }
      if (value.trim()) next[noteKey] = value
      else delete next[noteKey]
      return next
    })
  }

  function handleOpenCompare(cellId) {
    setCompareCell(cellId)
    setActivePanel('Compare')
    setToast(`${getCell(selectedCell, customCells).name} compared with ${getCell(cellId, customCells).name}`)
  }

  return (
    <main className={settings.compactUi ? 'studio-shell compact-ui' : 'studio-shell'}>
      <motion.div className="studio-window" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }}>
        <StudioHeader activePanel={activePanel} setActivePanel={setActivePanel} onNotify={setToast} />
        <WorkspaceDrawer
          activePanel={activePanel}
          selectedCell={selectedCell}
          selectedOrganelle={selectedOrganelle}
          compareCell={compareCell}
          allCells={allCells}
          customCells={customCells}
          galleryItems={galleryItems}
          notes={notes}
          settings={settings}
          labelVisible={labelVisible}
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
          onUpdateNote={handleUpdateNote}
          onUpdateSettings={setSettings}
          onSetLabelVisible={setLabelVisible}
          onSetCrossSection={setCrossSection}
          onExport={handleExport}
          onNotify={setToast}
        />
        <StatusToast message={toast} />
        <div className="studio-grid">
          <LeftSidebar
            selectedCell={selectedCell}
            setSelectedCell={handleSelectCell}
            selectedOrganelle={selectedOrganelle}
            setSelectedOrganelle={setSelectedOrganelle}
            customCells={customCells}
          />
          <CenterStage
            selectedCell={selectedCell}
            selectedOrganelle={selectedOrganelle}
            setSelectedOrganelle={setSelectedOrganelle}
            crossSection={crossSection}
            setCrossSection={setCrossSection}
            labelVisible={labelVisible}
            renderQuality={settings.quality}
            customCells={customCells}
            onNotify={setToast}
            onExport={handleExport}
            onExporterReady={setSceneExporter}
            onRetryGeneration={handleRetryGeneration}
          />
          <DetailPanel
            selectedCell={selectedCell}
            selectedOrganelle={selectedOrganelle}
            favoriteKey={favoriteKey}
            setFavoriteKey={setFavoriteKey}
            labelVisible={labelVisible}
            setLabelVisible={setLabelVisible}
            customCells={customCells}
            onNotify={setToast}
          />
          <BottomDeck
            selectedCell={selectedCell}
            selectedMicroscope={selectedMicroscope}
            setSelectedMicroscope={setSelectedMicroscope}
            uploadedImage={uploadedImage}
            generationMode={settings.generationMode}
            onGenerationModeChange={(generationMode) => setSettings((current) => ({ ...current, generationMode }))}
            onUploadImage={handleUploadImage}
            compareCell={compareCell}
            customCells={customCells}
            onCompare={handleOpenCompare}
            onNotify={setToast}
          />
        </div>
      </motion.div>
    </main>
  )
}

export default App
