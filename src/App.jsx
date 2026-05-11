import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Line, OrbitControls, RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import { motion } from 'framer-motion'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  BookOpen,
  Box,
  Camera,
  ChevronDown,
  CircleDot,
  Dna,
  Eye,
  Grid3X3,
  Heart,
  Image,
  Layers3,
  Library,
  Move3D,
  RotateCcw,
  Settings,
  Sparkles as SparklesIcon,
  Upload,
  X,
} from 'lucide-react'
import * as THREE from 'three'
import plantCellRender from './assets/cell-plant-render.png'
import './App.css'

const CELL_TYPES = [
  { id: 'plant', name: 'Plant Cell', type: 'Eukaryotic Cell', accent: '#82b366' },
  { id: 'white-blood', name: 'White Blood Cell', type: 'Immune Cell', accent: '#7e6edb' },
  { id: 'neuron', name: 'Neuron', type: 'Nerve Cell', accent: '#8b5cf6' },
  { id: 'epithelial', name: 'Epithelial Cell', type: 'Human Tissue Cell', accent: '#e07a7a' },
  { id: 'bacteria', name: 'Bacteria Cell', type: 'Prokaryotic Cell', accent: '#5fbf9f' },
  { id: 'animal', name: 'Animal Cell', type: 'Eukaryotic Cell', accent: '#459ccf' },
  { id: 'muscle', name: 'Muscle Cell', type: 'Muscle Fiber', accent: '#d25762' },
]

const SEEDED_GENERATED_CELLS = [
  {
    id: 'tripo-epithelial-test',
    name: 'Tripo Epithelial Test',
    type: 'AI Generated Epithelial Cell',
    accent: '#e07a7a',
    custom: true,
    template: 'epithelial',
    imageUrl: '/epithelial_cell_3d_tripo_input.png',
    generation: {
      provider: 'tripo',
      status: 'success',
      taskId: 'dc44beb1-e1a1-4650-9337-fbe418b7b154',
      modelUrl: '/generated-models/tripo-epithelial-cell-test.glb',
      rawModelUrl: '',
      message: 'Cached GLB from the verified Tripo epithelial test run.',
    },
  },
  {
    id: 'tripo-plant-test',
    name: 'Tripo Plant Test',
    type: 'AI Generated Plant Cell',
    accent: '#82b366',
    custom: true,
    template: 'plant',
    imageUrl: plantCellRender,
    generation: {
      provider: 'tripo',
      status: 'success',
      taskId: '1db80a91-e202-4494-b17b-147de74cae81',
      modelUrl: '/generated-models/tripo-plant-cell-test.glb',
      rawModelUrl: '',
      message: 'Cached GLB from the verified Tripo test run.',
    },
  },
]

const KHRONOS_REFERENCE_CELLS = [
  {
    id: 'khronos-transmission-test',
    name: 'Transmission Test',
    type: 'Khronos PBR Reference',
    accent: '#72a4bf',
    custom: true,
    reference: true,
    template: 'animal',
    imageUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/TransmissionTest/screenshot/screenshot_large.png',
    referenceSummary: 'Official Khronos glTF sample for KHR_materials_transmission. Useful for tuning transparent membranes, glassy shells, and opacity interactions.',
    referenceLicense: 'CC0, Adobe via Khronos glTF Sample Models',
    referenceSource: 'https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/TransmissionTest',
    generation: {
      provider: 'reference',
      requestedProvider: 'reference',
      status: 'success',
      taskId: 'khronos-transmission-test',
      modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/TransmissionTest/glTF-Binary/TransmissionTest.glb',
      rawModelUrl: '',
      message: 'Remote Khronos GLB reference for transparent material behavior.',
    },
  },
  {
    id: 'khronos-transmission-roughness',
    name: 'Transmission Roughness',
    type: 'Khronos PBR Reference',
    accent: '#8eb4cf',
    custom: true,
    reference: true,
    template: 'animal',
    imageUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/TransmissionRoughnessTest/screenshot/screenshot-large.png',
    referenceSummary: 'Official Khronos glTF sample for transmission, IOR, roughness, and volume. Useful for soft translucent cell walls and membrane haze.',
    referenceLicense: 'CC-BY 4.0, Ed Mackey / Analytical Graphics via Khronos glTF Sample Models',
    referenceSource: 'https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/TransmissionRoughnessTest',
    generation: {
      provider: 'reference',
      requestedProvider: 'reference',
      status: 'success',
      taskId: 'khronos-transmission-roughness',
      modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/TransmissionRoughnessTest/glTF-Binary/TransmissionRoughnessTest.glb',
      rawModelUrl: '',
      message: 'Remote Khronos GLB reference for IOR and translucent roughness.',
    },
  },
  {
    id: 'khronos-mosquito-amber',
    name: 'Mosquito In Amber',
    type: 'Khronos Bio Reference',
    accent: '#d18a42',
    custom: true,
    reference: true,
    template: 'bacteria',
    imageUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/MosquitoInAmber/screenshot/screenshot.jpg',
    referenceSummary: 'Biological specimen in a transparent amber volume. Useful as a target for organic detail plus translucent material presentation.',
    referenceLicense: 'CC-BY 4.0, Loic Norgeot / Geoffrey Marchal / Sketchfab via Khronos glTF Sample Models',
    referenceSource: 'https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/MosquitoInAmber',
    generation: {
      provider: 'reference',
      requestedProvider: 'reference',
      status: 'success',
      taskId: 'khronos-mosquito-amber',
      modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/MosquitoInAmber/glTF-Binary/MosquitoInAmber.glb',
      rawModelUrl: '',
      message: 'Remote Khronos biological GLB reference. This model is larger and may take longer to load.',
    },
  },
]

const ORGANELLES = {
  nucleus: {
    label: 'Nucleus',
    title: 'Nucleus',
    subtitle: 'Genetic control region',
    size: 'About 6-10 um',
    location: 'Central cytoplasm',
    visible: 'Yes, stained purple',
    note: 'White blood cells use a lobed nucleus to move through tight tissue spaces while coordinating immune response genes.',
    accent: '#7b4bb4',
  },
  lysosome: {
    label: 'Lysosome',
    title: 'Lysosome',
    subtitle: 'The cellular cleanup crew',
    size: 'About 1-2 um',
    location: 'Blood, lymph, and tissues',
    visible: 'Yes, especially with stain',
    note: 'Lysosomes contain enzymes that digest captured material and damaged cell components.',
    accent: '#8d58b8',
  },
  mitochondria: {
    label: 'Mitochondria',
    title: 'Mitochondria',
    subtitle: 'ATP production sites',
    size: 'About 0.5-1 um',
    location: 'Cytoplasm',
    visible: 'Often with fluorescent dye',
    note: 'Immune cells change mitochondrial activity as they activate, migrate, and respond to infection.',
    accent: '#df7046',
  },
  membrane: {
    label: 'Plasma Membrane',
    title: 'Plasma Membrane',
    subtitle: 'Selective outer boundary',
    size: 'About 7-10 nm',
    location: 'Cell perimeter',
    visible: 'Indirectly visible',
    note: 'The membrane receives immune signals and allows the cell to squeeze through tissue barriers.',
    accent: '#7aa4bf',
  },
  granules: {
    label: 'Secretory Granules',
    title: 'Secretory Granules',
    subtitle: 'Immune response packets',
    size: 'About 0.1-1 um',
    location: 'Cytoplasm',
    visible: 'Yes, as colored dots',
    note: 'Granules store proteins and signaling molecules released during immune defense.',
    accent: '#5b82c4',
  },
}

const ORGANELLE_ORDER = ['nucleus', 'lysosome', 'mitochondria', 'membrane', 'granules']

const MICROSCOPE_IMAGES = [
  { label: 'Light Microscope', tone: 'light', note: 'Bright-field texture and tissue context.' },
  { label: 'Stained Selection', tone: 'purple', note: 'Contrast-enhanced organelle staining.' },
  { label: 'Electron Microscope', tone: 'mono', note: 'High-detail grayscale surface scan.' },
]

const WORKSPACE_PANELS = {
  Gallery: 'Saved render angles, microscope snapshots, and exported study plates.',
  Library: 'Reference structures for cell walls, membranes, nuclei, lysosomes, and mitochondria.',
  Notebooks: 'Observation notes linked to the selected cell and organelle.',
  Settings: 'Viewer quality, labels, cross-section defaults, and export preferences.',
  Compare: 'Side-by-side cell comparison for visual structure and biological role.',
  Profile: 'Current workspace: Bio Visualization Prototype.',
}

const CELL_PROFILES = {
  plant: {
    summary: 'Rigid wall, large vacuole, chloroplast-like structures, Golgi stacks, and a clear nucleus.',
    occurs: 'Leaves, stems, roots, and photosynthetic tissue.',
    comparison: 'Has a rigid wall and chloroplast-like organelles; animal cells do not.',
    compareTarget: 'animal',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
  'white-blood': {
    summary: 'Soft immune cell with lobed nucleus, many lysosomes, granules, and deformable membrane.',
    occurs: 'Blood, lymph, and inflamed tissue.',
    comparison: 'More mobile and granular than epithelial cells; built for immune response.',
    compareTarget: 'epithelial',
    organelles: ['lysosome', 'nucleus', 'mitochondria', 'membrane', 'granules'],
  },
  neuron: {
    summary: 'Compact soma with branching dendrite and axon-like extensions for signal routing.',
    occurs: 'Brain, spinal cord, and peripheral nerves.',
    comparison: 'Long membrane extensions dominate the shape; most other cells stay compact.',
    compareTarget: 'muscle',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
  epithelial: {
    summary: 'Sheet-like tissue cell with apical ridges, junction cues, membrane boundaries, and nucleus.',
    occurs: 'Skin, ducts, organ linings, and protective surfaces.',
    comparison: 'Designed for barrier tissue, unlike free-moving white blood cells.',
    compareTarget: 'white-blood',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
  bacteria: {
    summary: 'Prokaryotic capsule with nucleoid DNA, ribosome dots, pili, and a flagellum cue.',
    occurs: 'Soil, water, gut flora, skin, and many environmental surfaces.',
    comparison: 'No nucleus or membrane-bound organelles; the DNA sits in a nucleoid region.',
    compareTarget: 'animal',
    organelles: ['membrane', 'granules'],
  },
  animal: {
    summary: 'Flexible eukaryotic cell with nucleus, mitochondria, vesicles, and soft membrane.',
    occurs: 'Organs, connective tissue, blood-related tissues, and cultured samples.',
    comparison: 'Lacks the rigid wall shown in plant cells.',
    compareTarget: 'plant',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'lysosome', 'granules'],
  },
  muscle: {
    summary: 'Elongated fiber-like cell with striation cues and extra mitochondria for contraction.',
    occurs: 'Skeletal muscle, cardiac tissue, and contractile tissue samples.',
    comparison: 'Elongated and energy-heavy compared with round animal cells.',
    compareTarget: 'neuron',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
}

const SETTINGS_STORAGE_KEY = 'bio-demo-settings'
const SETTINGS_STORAGE_VERSION = 3
const UI_STATE_STORAGE_KEY = 'bio-demo-ui-state'
const UI_STATE_STORAGE_VERSION = 1
const DEFAULT_SETTINGS = {
  quality: 'balanced',
  compactUi: false,
  generationProvider: 'tripo',
  generationMode: 'tripo',
  settingsVersion: SETTINGS_STORAGE_VERSION,
}

const CUSTOM_CELL_STORAGE_KEY = 'bio-demo-custom-cells'
const MAX_PERSISTED_IMAGE_EDGE = 1280
const COMPACT_PERSISTED_IMAGE_EDGE = 900
const MAX_PERSISTED_IMAGE_CHARS = 3_200_000
const MODEL_API_BASE = import.meta.env.VITE_MODEL_API_BASE || import.meta.env.VITE_TRIPO_API_BASE || 'http://127.0.0.1:8787'
const GENERATION_POLL_INTERVAL_MS = 3500
const GENERATION_TIMEOUT_MS = 8 * 60 * 1000
const GENERATION_PROVIDER_OPTIONS = [
  { id: 'auto', label: 'Auto', description: 'Tripo, Rodin, then Hunyuan backup.' },
  { id: 'tripo', label: 'Tripo', description: 'Cloud generation.' },
  { id: 'rodin', label: 'Rodin', description: 'Hyper3D Rodin cloud generation.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D server.' },
]
const GENERATION_PROVIDER_IDS = new Set(GENERATION_PROVIDER_OPTIONS.map((provider) => provider.id))
const GENERATION_MODE_OPTIONS = [
  { id: 'tripo', label: 'Tripo', description: 'Cloud GLB generation.' },
  { id: 'rodin', label: 'Rodin', description: 'Hyper3D Rodin GLB generation.' },
  { id: 'hunyuan', label: 'Hunyuan', description: 'Local Hunyuan3D GLB generation.' },
  { id: 'cinematic', label: 'Cinematic', description: 'Layered transparent PNG composition.' },
  { id: 'auto', label: 'Auto', description: 'Tripo, Rodin, Hunyuan, then Cinematic fallback.' },
  { id: 'local', label: 'Local GLB', description: 'Import an existing GLB or GLTF file.' },
]
const GENERATION_MODE_IDS = new Set(GENERATION_MODE_OPTIONS.map((mode) => mode.id))

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (!normalized.startsWith('/api/')) return normalized
  return `${MODEL_API_BASE.replace(/\/$/, '')}${normalized}`
}

const DEFAULT_ORGANELLE_BY_CELL = {
  plant: 'membrane',
  'white-blood': 'lysosome',
  neuron: 'nucleus',
  epithelial: 'membrane',
  bacteria: 'granules',
  animal: 'nucleus',
  muscle: 'mitochondria',
}

const CELL_DETAIL_OVERRIDES = {
  plant: {
    nucleus: {
      subtitle: 'The command center',
      size: '5-10 um in diameter',
      location: 'Usually central',
      visible: 'Yes',
      note: 'The nucleus is surrounded by a double membrane called the nuclear envelope, which contains pores that regulate the movement of molecules in and out.',
      funFact: 'The nucleus was one of the first cell structures discovered.',
    },
    membrane: {
      title: 'Cell Wall',
      subtitle: 'Rigid outer support',
      size: 'About 0.1-10 um thick',
      location: 'Outer boundary',
      visible: 'Yes',
      note: 'Plant cells have a rigid wall outside the membrane. It gives the cell shape and helps resist pressure from the large central vacuole.',
      funFact: 'Cellulose fibers make plant cell walls strong and flexible.',
    },
    mitochondria: {
      note: 'Mitochondria convert stored sugars into usable energy for growth, repair, and transport inside the plant cell.',
      funFact: 'Plant cells have both mitochondria and chloroplasts.',
    },
    granules: {
      title: 'Golgi Apparatus',
      subtitle: 'Packaging and transport',
      note: 'The Golgi modifies, sorts, and packages proteins and lipids before they move to their next destination.',
      funFact: 'Golgi stacks look like folded ribbons in many educational renders.',
    },
  },
  'white-blood': {
    lysosome: {
      note: 'White blood cells carry many lysosomes because they digest captured particles and damaged material during immune response.',
      funFact: 'The clustered purple granules are emphasized here so they remain readable while rotating.',
    },
    nucleus: {
      note: 'The lobed nucleus is a key visual feature of many immune cells and helps the cell deform through narrow tissue gaps.',
    },
  },
  neuron: {
    membrane: {
      title: 'Axon and Dendrites',
      subtitle: 'Signal-routing branches',
      location: 'Extending from the soma',
      note: 'Neurons depend on long membrane extensions to receive and transmit electrical signals across large distances.',
      funFact: 'The branching structure matters more visually than a perfectly round cell body.',
    },
  },
  epithelial: {
    membrane: {
      title: 'Apical Surface',
      subtitle: 'Barrier and contact layer',
      location: 'Tissue-facing edge',
      note: 'Epithelial cells form sheets. The surface ridges and junction lines make that tissue architecture visible.',
    },
  },
  bacteria: {
    granules: {
      title: 'Nucleoid and Ribosomes',
      subtitle: 'Prokaryotic core material',
      size: 'Not membrane bound',
      location: 'Central cytoplasm',
      note: 'Bacteria do not have a nucleus. The blue DNA coil and small ribosome dots represent the prokaryotic interior.',
      funFact: 'The flagellum and pili are exaggerated for readability in the 3D viewer.',
    },
  },
  animal: {
    nucleus: {
      note: 'Animal cells are shown with a softer membrane, central nucleus, mitochondria, and transport structures without a rigid wall.',
    },
  },
  muscle: {
    mitochondria: {
      note: 'Muscle fibers contain many mitochondria because contraction needs sustained ATP production.',
      funFact: 'The stripe pattern is a simplified sarcomere cue, not a literal molecular model.',
    },
  },
}

const CELL_BODY = {
  plant: { color: '#b8d983', scale: [1.38, 1.04, 0.76], kind: 'box' },
  'white-blood': { color: '#c9d3e6', scale: [1.34, 1.18, 0.92], kind: 'sphere' },
  neuron: { color: '#d8c6ff', scale: [0.78, 0.68, 0.58], kind: 'sphere' },
  epithelial: { color: '#efb4a6', scale: [1.22, 0.92, 0.52], kind: 'box' },
  bacteria: { color: '#8ed9bc', scale: [0.9, 1, 0.56], kind: 'capsule' },
  animal: { color: '#b8dcf2', scale: [1.18, 1.08, 0.9], kind: 'sphere' },
  muscle: { color: '#e78a94', scale: [0.82, 1.1, 0.48], kind: 'capsule' },
}

function getStoredCustomCells() {
  return loadStoredValue(CUSTOM_CELL_STORAGE_KEY, [])
}

function getPrimaryCells(customCells = getStoredCustomCells()) {
  const activeCustomCells = customCells.filter((cell) => cell.generation?.status !== 'failed')
  const failedCustomCells = customCells.filter((cell) => cell.generation?.status === 'failed')

  return [...activeCustomCells, ...SEEDED_GENERATED_CELLS, ...failedCustomCells, ...CELL_TYPES]
}

function getAllCells(customCells = getStoredCustomCells()) {
  return [...getPrimaryCells(customCells), ...KHRONOS_REFERENCE_CELLS]
}

function getCell(cellId, customCells = getStoredCustomCells()) {
  return getAllCells(customCells).find((cell) => cell.id === cellId) ?? CELL_TYPES[1]
}

function getCustomCell(cellId, customCells = getStoredCustomCells()) {
  return [...customCells, ...SEEDED_GENERATED_CELLS, ...KHRONOS_REFERENCE_CELLS].find((cell) => cell.id === cellId)
}

function getModelCellId(cellId, customCells = getStoredCustomCells()) {
  return getCustomCell(cellId, customCells)?.template ?? cellId
}

function getCellProfile(cellId, customCells = getStoredCustomCells()) {
  const customCell = getCustomCell(cellId, customCells)
  if (customCell) {
    const baseProfile = CELL_PROFILES[customCell.template] ?? CELL_PROFILES.animal
    if (customCell.reference) {
      return {
        ...baseProfile,
        summary: customCell.referenceSummary,
        comparison: `${customCell.name} is a Khronos glTF reference asset for inspecting material behavior and GLB loader compatibility, not a biological teaching model.`,
        occurs: customCell.referenceSource,
        organelles: baseProfile.organelles,
      }
    }

    const hasGeneratedModel = Boolean(customCell.generation?.modelUrl)
    const isCinematic = customCell.generation?.provider === 'cinematic'
    return {
      ...baseProfile,
      summary: isCinematic
        ? `Browser-generated JS depth relief from the uploaded image, using ${getCell(customCell.template).name} biology as context.`
        : hasGeneratedModel
        ? `AI-generated GLB from the uploaded image, using ${getCell(customCell.template).name} biology as context.`
        : `Uploaded image queued for image-to-3D generation; fallback scaffold is ${getCell(customCell.template).name}.`,
      comparison: isCinematic
        ? 'This custom sample uses a browser-generated displacement mesh plus transparent depth slabs, not a GLB or full AI-generated mesh.'
        : hasGeneratedModel
        ? 'This custom sample is loaded as a real generated GLB in the WebGL viewer.'
        : `This custom sample will use the ${getCell(customCell.template).name} fallback while generation is running.`,
      occurs: 'Uploaded by user as a custom microscope reference.',
      organelles: baseProfile.organelles,
    }
  }

  return CELL_PROFILES[cellId] ?? CELL_PROFILES['white-blood']
}

function getAvailableOrganelleIds(cellId) {
  return getCellProfile(cellId).organelles ?? ORGANELLE_ORDER
}

function getDefaultOrganelle(cellId) {
  const available = getAvailableOrganelleIds(cellId)
  const preferred = DEFAULT_ORGANELLE_BY_CELL[cellId] ?? available[0]
  return available.includes(preferred) ? preferred : available[0]
}

function getOrganelleDetail(cellId, organelleId) {
  return {
    ...ORGANELLES[organelleId],
    ...(CELL_DETAIL_OVERRIDES[cellId]?.[organelleId] ?? {}),
  }
}

function loadStoredValue(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function storeValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can fail in private browsing; the UI should keep working.
  }
}

function normalizeSettings(value) {
  const stored = value && typeof value === 'object' ? value : {}
  const next = { ...DEFAULT_SETTINGS, ...stored }
  const storedMode = stored.generationMode || stored.generationProvider

  if (stored.settingsVersion !== SETTINGS_STORAGE_VERSION) {
    next.generationProvider = GENERATION_PROVIDER_IDS.has(stored.generationProvider) ? stored.generationProvider : DEFAULT_SETTINGS.generationProvider
    next.generationMode = GENERATION_MODE_IDS.has(storedMode) ? storedMode : DEFAULT_SETTINGS.generationMode
  }

  if (!GENERATION_PROVIDER_IDS.has(next.generationProvider)) {
    next.generationProvider = DEFAULT_SETTINGS.generationProvider
  }

  if (!GENERATION_MODE_IDS.has(next.generationMode)) {
    next.generationMode = DEFAULT_SETTINGS.generationMode
  }

  next.settingsVersion = SETTINGS_STORAGE_VERSION
  return next
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be decoded.'))
    image.src = url
  })
}

function getCanvasDataUrl(canvas) {
  const webp = canvas.toDataURL('image/webp', 0.9)
  if (webp.startsWith('data:image/webp')) return webp
  return canvas.toDataURL('image/png')
}

function getCanvasPngDataUrl(canvas) {
  return canvas.toDataURL('image/png')
}

function resampleCanvas(sourceCanvas, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(sourceCanvas.width, sourceCanvas.height))
  if (scale >= 1) return sourceCanvas

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale))
  canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale))
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)
  return canvas
}

function trimTransparentCanvas(sourceCanvas, padding = 34) {
  const context = sourceCanvas.getContext('2d')
  const imageData = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const { data, width, height } = imageData
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha < 10) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return sourceCanvas

  const cropX = Math.max(0, minX - padding)
  const cropY = Math.max(0, minY - padding)
  const cropW = Math.min(width - cropX, maxX - minX + padding * 2)
  const cropH = Math.min(height - cropY, maxY - minY + padding * 2)
  const cropRatio = (cropW * cropH) / (width * height)
  if (cropRatio > 0.94) return sourceCanvas

  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  canvas.getContext('2d').drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return canvas
}

function removeLightBackground(canvas) {
  const context = canvas.getContext('2d')
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = imageData
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 90))
  let edgeSamples = 0
  let lightEdgeSamples = 0

  function isLightNeutral(index) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const brightness = (r + g + b) / 3
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    return brightness > 232 && chroma < 42
  }

  for (let x = 0; x < width; x += sampleStep) {
    edgeSamples += 2
    if (isLightNeutral(x * 4)) lightEdgeSamples += 1
    if (isLightNeutral(((height - 1) * width + x) * 4)) lightEdgeSamples += 1
  }

  for (let y = 0; y < height; y += sampleStep) {
    edgeSamples += 2
    if (isLightNeutral((y * width) * 4)) lightEdgeSamples += 1
    if (isLightNeutral((y * width + width - 1) * 4)) lightEdgeSamples += 1
  }

  const shouldRemove = edgeSamples > 0 && lightEdgeSamples / edgeSamples > 0.42
  if (!shouldRemove) return canvas

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const brightness = (r + g + b) / 3
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)

    if (brightness > 242 && chroma < 36) {
      data[index + 3] = 0
    } else if (brightness > 224 && chroma < 46) {
      const keep = Math.max(0, Math.min(1, (242 - brightness) / 18 + chroma / 92))
      data[index + 3] = Math.round(data[index + 3] * keep)
    }
  }

  context.putImageData(imageData, 0, 0)
  return trimTransparentCanvas(canvas)
}

async function buildPersistentImageDataUrl(sourceUrl, maxEdge = MAX_PERSISTED_IMAGE_EDGE) {
  const image = await loadImageFromUrl(sourceUrl)
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))

  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const cutoutCanvas = removeLightBackground(canvas)
  const dataUrl = getCanvasDataUrl(cutoutCanvas)
  if (dataUrl.length <= MAX_PERSISTED_IMAGE_CHARS || maxEdge <= COMPACT_PERSISTED_IMAGE_EDGE) return dataUrl

  return getCanvasDataUrl(resampleCanvas(cutoutCanvas, COMPACT_PERSISTED_IMAGE_EDGE))
}

async function prepareImageForUpload(file) {
  const sourceUrl = await fileToDataUrl(file)
  if (typeof sourceUrl !== 'string' || !file.type.startsWith('image/')) {
    return { displayUrl: sourceUrl, generationUrl: sourceUrl }
  }

  try {
    return {
      displayUrl: await buildPersistentImageDataUrl(sourceUrl),
      generationUrl: sourceUrl,
    }
  } catch (error) {
    console.warn(error)
    return { displayUrl: sourceUrl, generationUrl: sourceUrl }
  }
}

function createTransparentCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function createCutoutCanvasFromUrl(sourceUrl, maxEdge = COMPACT_PERSISTED_IMAGE_EDGE) {
  const image = await loadImageFromUrl(sourceUrl)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const canvas = createTransparentCanvas(Math.max(1, Math.round(sourceWidth * scale)), Math.max(1, Math.round(sourceHeight * scale)))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return removeLightBackground(canvas)
}

function createDerivedPngLayer(sourceCanvas, derivePixel) {
  const inputContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  const source = inputContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const outputCanvas = createTransparentCanvas(sourceCanvas.width, sourceCanvas.height)
  const outputContext = outputCanvas.getContext('2d')
  const output = outputContext.createImageData(sourceCanvas.width, sourceCanvas.height)
  const { data } = source
  const target = output.data

  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const index = (y * sourceCanvas.width + x) * 4
      const alpha = data[index + 3]
      if (alpha < 4) continue
      const pixel = derivePixel(data[index], data[index + 1], data[index + 2], alpha, x, y, sourceCanvas.width, sourceCanvas.height)
      if (!pixel) continue
      target[index] = pixel[0]
      target[index + 1] = pixel[1]
      target[index + 2] = pixel[2]
      target[index + 3] = pixel[3]
    }
  }

  outputContext.putImageData(output, 0, 0)
  return getCanvasPngDataUrl(outputCanvas)
}

function createRimPngLayer(sourceCanvas) {
  const inputContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  const source = inputContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const outputCanvas = createTransparentCanvas(sourceCanvas.width, sourceCanvas.height)
  const outputContext = outputCanvas.getContext('2d')
  const output = outputContext.createImageData(sourceCanvas.width, sourceCanvas.height)
  const { data } = source
  const target = output.data
  const { width, height } = sourceCanvas

  function alphaAt(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0
    return data[(y * width + x) * 4 + 3]
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3]
      if (alpha < 18) continue
      const edgeStrength = Math.max(0, alpha - Math.min(alphaAt(x - 2, y), alphaAt(x + 2, y), alphaAt(x, y - 2), alphaAt(x, y + 2)))
      if (edgeStrength < 18) continue
      target[index] = 120
      target[index + 1] = 176
      target[index + 2] = 210
      target[index + 3] = Math.min(170, edgeStrength * 1.8)
    }
  }

  outputContext.putImageData(output, 0, 0)
  return getCanvasPngDataUrl(outputCanvas)
}

function createHighlightPngLayer(sourceCanvas) {
  const canvas = createTransparentCanvas(sourceCanvas.width, sourceCanvas.height)
  const context = canvas.getContext('2d')
  const main = context.createRadialGradient(sourceCanvas.width * 0.34, sourceCanvas.height * 0.24, 0, sourceCanvas.width * 0.34, sourceCanvas.height * 0.24, sourceCanvas.width * 0.34)
  main.addColorStop(0, 'rgba(255,255,255,0.62)')
  main.addColorStop(0.34, 'rgba(255,255,255,0.16)')
  main.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = main
  context.fillRect(0, 0, canvas.width, canvas.height)

  const secondary = context.createRadialGradient(sourceCanvas.width * 0.68, sourceCanvas.height * 0.66, 0, sourceCanvas.width * 0.68, sourceCanvas.height * 0.66, sourceCanvas.width * 0.28)
  secondary.addColorStop(0, 'rgba(122,190,214,0.24)')
  secondary.addColorStop(1, 'rgba(122,190,214,0)')
  context.fillStyle = secondary
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.globalCompositeOperation = 'destination-in'
  context.drawImage(sourceCanvas, 0, 0)
  return getCanvasPngDataUrl(canvas)
}

function createParticlePngLayer(sourceCanvas) {
  const canvas = createTransparentCanvas(sourceCanvas.width, sourceCanvas.height)
  const context = canvas.getContext('2d')
  const colors = ['rgba(132,80,184,0.72)', 'rgba(223,112,70,0.62)', 'rgba(108,164,198,0.66)', 'rgba(125,176,92,0.56)']

  for (let index = 0; index < 34; index += 1) {
    const x = sourceCanvas.width * (0.16 + seeded(index + 800) * 0.68)
    const y = sourceCanvas.height * (0.14 + seeded(index + 860) * 0.72)
    const radius = 2.4 + seeded(index + 920) * 7.5
    const gradient = context.createRadialGradient(x - radius * 0.28, y - radius * 0.32, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(255,255,255,0.82)')
    gradient.addColorStop(0.38, colors[index % colors.length])
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  return getCanvasPngDataUrl(canvas)
}

function createImageReliefGeometry(image) {
  const sourceWidth = Math.max(1, image?.naturalWidth || image?.width || 1)
  const sourceHeight = Math.max(1, image?.naturalHeight || image?.height || 1)
  const aspect = sourceWidth / sourceHeight
  const specimenWidth = aspect >= 1 ? 3.9 : 3.9 * aspect
  const specimenHeight = aspect >= 1 ? 3.9 / aspect : 3.9
  const sampleScale = Math.min(1, 190 / Math.max(sourceWidth, sourceHeight))
  const sampleWidth = Math.max(24, Math.round(sourceWidth * sampleScale))
  const sampleHeight = Math.max(24, Math.round(sourceHeight * sampleScale))
  const canvas = createTransparentCanvas(sampleWidth, sampleHeight)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight)

  const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight)
  const segmentsX = Math.max(44, Math.min(96, Math.round(sampleWidth / 3.1)))
  const segmentsY = Math.max(44, Math.min(96, Math.round(sampleHeight / 3.1)))
  const geometry = new THREE.PlaneGeometry(specimenWidth, specimenHeight, segmentsX, segmentsY)
  const slabGeometry = new THREE.PlaneGeometry(specimenWidth, specimenHeight, 1, 1)
  const positions = geometry.attributes.position
  const uvs = geometry.attributes.uv

  function sampleAlpha(x, y) {
    const px = Math.max(0, Math.min(sampleWidth - 1, x))
    const py = Math.max(0, Math.min(sampleHeight - 1, y))
    return data[(py * sampleWidth + px) * 4 + 3] / 255
  }

  for (let index = 0; index < positions.count; index += 1) {
    const u = uvs.getX(index)
    const v = uvs.getY(index)
    const px = Math.max(0, Math.min(sampleWidth - 1, Math.round(u * (sampleWidth - 1))))
    const py = Math.max(0, Math.min(sampleHeight - 1, Math.round((1 - v) * (sampleHeight - 1))))
    const dataIndex = (py * sampleWidth + px) * 4
    const r = data[dataIndex]
    const g = data[dataIndex + 1]
    const b = data[dataIndex + 2]
    const rawAlpha = data[dataIndex + 3] / 255
    const alpha = rawAlpha < 0.16 ? 0 : clamp((rawAlpha - 0.16) / 0.84)
    const brightness = (r + g + b) / 765
    const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
    const radial = clamp(1 - Math.hypot((u - 0.5) / 0.57, (v - 0.52) / 0.55))
    const neighborAlpha = Math.min(
      sampleAlpha(px - 2, py),
      sampleAlpha(px + 2, py),
      sampleAlpha(px, py - 2),
      sampleAlpha(px, py + 2),
    )
    const contour = clamp((alpha - neighborAlpha) * 2.4)
    const cellularNoise = Math.sin(u * 24 + v * 13) * 0.018 + Math.sin(u * 47 - v * 29) * 0.012
    const depth = alpha <= 0
      ? -0.16
      : alpha * (0.1 + radial * 0.58 + saturation * 0.22 + (1 - Math.abs(brightness - 0.58)) * 0.1 + cellularNoise) + contour * 0.2
    positions.setZ(index, depth)
  }

  geometry.computeVertexNormals()

  return {
    aspect,
    geometry,
    slabGeometry,
  }
}

async function buildLayeredPngVisual(sourceUrl) {
  const cutoutCanvas = await createCutoutCanvasFromUrl(sourceUrl)
  const aspect = cutoutCanvas.width / cutoutCanvas.height
  const bodyUrl = getCanvasPngDataUrl(cutoutCanvas)
  const shadowUrl = createDerivedPngLayer(cutoutCanvas, (r, g, b, a) => [42, 55, 62, Math.round(a * 0.34)])
  const depthUrl = createDerivedPngLayer(cutoutCanvas, (r, g, b, a) => [
    Math.round(r * 0.72 + 84 * 0.28),
    Math.round(g * 0.72 + 124 * 0.28),
    Math.round(b * 0.72 + 148 * 0.28),
    Math.round(a * 0.52),
  ])
  const coreUrl = createDerivedPngLayer(cutoutCanvas, (r, g, b, a, x, y, width, height) => {
    const nx = (x / width - 0.5) / 0.44
    const ny = (y / height - 0.48) / 0.4
    const mask = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny))
    if (mask <= 0) return null
    return [
      Math.min(255, Math.round(r * 1.08 + 8)),
      Math.min(255, Math.round(g * 1.04 + 6)),
      Math.min(255, Math.round(b * 1.12 + 12)),
      Math.round(a * Math.min(0.9, mask * 1.35)),
    ]
  })
  const frontUrl = createDerivedPngLayer(cutoutCanvas, (r, g, b, a, x, y, width, height) => {
    const brightness = (r + g + b) / 3
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    const detail = Math.max(0, Math.min(1, (saturation - 28) / 110 + (brightness - 116) / 260))
    const upper = Math.max(0, 1 - Math.hypot((x / width - 0.56) / 0.42, (y / height - 0.38) / 0.46))
    const mask = Math.max(detail * 0.85, upper * 0.52)
    if (mask <= 0.08) return null
    return [
      Math.min(255, Math.round(r * 1.18 + 12)),
      Math.min(255, Math.round(g * 1.12 + 8)),
      Math.min(255, Math.round(b * 1.1 + 10)),
      Math.round(a * Math.min(0.82, mask)),
    ]
  })

  return {
    aspect,
    layers: [
      { id: 'shadow', className: 'layer-shadow', url: shadowUrl, z: -130, shiftX: -28, shiftY: -18, scale: 1.1, opacity: 0.92, snapshotX: -18, snapshotY: 20 },
      { id: 'depth', className: 'layer-depth', url: depthUrl, z: -70, shiftX: -18, shiftY: -10, scale: 1.04, opacity: 0.78, snapshotX: -10, snapshotY: 8 },
      { id: 'rim', className: 'layer-rim', url: createRimPngLayer(cutoutCanvas), z: -20, shiftX: -8, shiftY: -4, scale: 1.025, opacity: 0.82, snapshotX: -3, snapshotY: 2 },
      { id: 'body', className: 'layer-body', url: bodyUrl, z: 18, shiftX: 8, shiftY: 5, scale: 1, opacity: 1, snapshotX: 0, snapshotY: 0 },
      { id: 'core', className: 'layer-core', url: coreUrl, z: 74, shiftX: 22, shiftY: 13, scale: 1.018, opacity: 0.94, snapshotX: 8, snapshotY: -3 },
      { id: 'front', className: 'layer-front', url: frontUrl, z: 128, shiftX: 34, shiftY: 22, scale: 1.036, opacity: 0.92, snapshotX: 16, snapshotY: -8 },
      { id: 'particles', className: 'layer-particles', url: createParticlePngLayer(cutoutCanvas), z: 170, shiftX: 46, shiftY: 28, scale: 1.08, opacity: 0.96, snapshotX: 24, snapshotY: -13 },
      { id: 'highlight', className: 'layer-highlight', url: createHighlightPngLayer(cutoutCanvas), z: 210, shiftX: 54, shiftY: 32, scale: 1.03, opacity: 0.78, snapshotX: 12, snapshotY: -10 },
    ],
  }
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

async function drawImageToCanvas(context, url, x, y, width, height, opacity = 1, filter = 'none') {
  const image = await loadImageFromUrl(url)
  context.save()
  context.globalAlpha = opacity
  context.filter = filter
  context.drawImage(image, x, y, width, height)
  context.restore()
}

async function downloadLayeredPngSnapshot(imageUrl, filename) {
  const visual = await buildLayeredPngVisual(imageUrl)
  const canvas = createTransparentCanvas(1400, 900)
  const context = canvas.getContext('2d')
  const backdrop = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  backdrop.addColorStop(0, '#fbf5e8')
  backdrop.addColorStop(1, '#edf6f0')
  context.fillStyle = backdrop
  context.fillRect(0, 0, canvas.width, canvas.height)

  const specimenWidth = visual.aspect >= 1 ? 760 : 760 * visual.aspect
  const specimenHeight = visual.aspect >= 1 ? 760 / visual.aspect : 760
  const originX = (canvas.width - specimenWidth) / 2
  const originY = (canvas.height - specimenHeight) / 2 + 10

  for (const layer of visual.layers) {
    await drawImageToCanvas(
      context,
      layer.url,
      originX + layer.snapshotX,
      originY + layer.snapshotY,
      specimenWidth,
      specimenHeight,
      layer.opacity,
      layer.id === 'shadow' ? 'blur(16px)' : 'none',
    )
  }

  const blob = await canvasToBlob(canvas)
  if (!blob) return false
  downloadBlob(filename, blob)
  return true
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function readApiResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Request failed with ${response.status}`)
  }
  return payload
}

function getProviderPlan(provider) {
  return provider === 'auto' ? ['tripo', 'rodin', 'hunyuan', 'cinematic'] : [provider || 'tripo']
}

function getProviderLabel(provider) {
  if (provider === 'local') return 'Local'
  if (provider === 'cinematic') return 'JS Depth'
  if (provider === 'reference') return 'Khronos Reference'
  return GENERATION_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label ?? 'Tripo'
}

async function create3dGeneration({ provider, imageDataUrl, fileName, prompt }) {
  const response = await fetch(apiUrl('/api/3d/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, imageDataUrl, fileName, prompt }),
  })

  return readApiResponse(response)
}

async function uploadLocal3dModel(file) {
  const response = await fetch(apiUrl(`/api/3d/local-model?fileName=${encodeURIComponent(file.name)}`), {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'model/gltf-binary' },
    body: file,
  })

  return readApiResponse(response)
}

async function get3dGenerationStatus(taskId, provider) {
  const response = await fetch(apiUrl(`/api/3d/status/${encodeURIComponent(taskId)}?provider=${encodeURIComponent(provider || 'tripo')}`))
  return readApiResponse(response)
}

async function waitFor3dModel(taskId, provider, onStatus) {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS

  while (Date.now() < deadline) {
    await delay(GENERATION_POLL_INTERVAL_MS)
    const status = await get3dGenerationStatus(taskId, provider)
    onStatus?.(status)

    if (['success', 'completed', 'complete', 'done'].includes(String(status.status).toLowerCase())) {
      if (!status.modelUrl) throw new Error(`${getProviderLabel(provider)} finished but no GLB model URL was returned.`)
      return status
    }

    if (['failed', 'error', 'cancelled', 'canceled'].includes(String(status.status).toLowerCase())) {
      throw new Error(status.error || `${getProviderLabel(provider)} generation failed.`)
    }
  }

  throw new Error(`${getProviderLabel(provider)} generation timed out.`)
}

function getGenerationPrompt(cell) {
  const base = getCell(cell.template)
  return [
    `A high quality educational 3D biological model of a ${base.name}.`,
    'Make it a single integrated specimen, not a flat relief, not a display base.',
    'Preserve the recognizable major biological structures and use clean PBR materials.',
    'Style: polished interactive science app, clear organelles, soft studio lighting.',
  ].join(' ')
}

function getGeneratedModelUrl(cell) {
  return cell.custom ? cell.generation?.modelUrl || '' : ''
}

function cleanFileName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
}

function inferCellTemplate(fileName) {
  const name = fileName.toLowerCase()
  if (name.includes('plant') || name.includes('leaf') || name.includes('chloroplast')) return 'plant'
  if (name.includes('bacteria') || name.includes('bacillus') || name.includes('microbe')) return 'bacteria'
  if (name.includes('neuron') || name.includes('nerve')) return 'neuron'
  if (name.includes('muscle') || name.includes('fiber')) return 'muscle'
  if (name.includes('epithelial') || name.includes('tissue')) return 'epithelial'
  if (name.includes('blood') || name.includes('immune') || name.includes('wbc')) return 'white-blood'
  return 'animal'
}

function isLocalModelFile(file) {
  return /\.(?:glb|gltf)$/i.test(file.name)
}

function createCustomCell(fileName, imageUrl, options = {}) {
  const template = inferCellTemplate(fileName)
  const base = getCell(template)
  const name = cleanFileName(fileName) || 'Uploaded Cell'
  const provider = options.provider || 'tripo'

  return {
    id: `custom-${Date.now()}`,
    name: name.length > 20 ? `${name.slice(0, 20)}...` : name,
    type: options.type || `Uploaded ${base.name}`,
    accent: base.accent,
    custom: true,
    template,
    imageUrl,
    generation: {
      provider,
      requestedProvider: options.requestedProvider || provider,
      status: options.status || 'queued',
      taskId: options.taskId || '',
      modelUrl: options.modelUrl || '',
      rawModelUrl: options.rawModelUrl || '',
      message: options.message || 'Waiting for image-to-3D generation.',
    },
  }
}

function getUploadPreviewFromCustomCells(customCells) {
  const latest = customCells.find((cell) => cell.custom)
  if (!latest) return null
  return { name: latest.name, url: latest.imageUrl || '' }
}

function normalizeUiState(value) {
  const stored = value && typeof value === 'object' ? value : {}
  return {
    selectedCell: typeof stored.selectedCell === 'string' ? stored.selectedCell : 'plant',
    selectedOrganelle: typeof stored.selectedOrganelle === 'string' ? stored.selectedOrganelle : 'nucleus',
    selectedMicroscope: typeof stored.selectedMicroscope === 'string' ? stored.selectedMicroscope : MICROSCOPE_IMAGES[0].label,
    compareCell: typeof stored.compareCell === 'string' ? stored.compareCell : getCellProfile('plant').compareTarget,
    crossSection: typeof stored.crossSection === 'boolean' ? stored.crossSection : true,
    favoriteKey: typeof stored.favoriteKey === 'string' ? stored.favoriteKey : '',
    uiStateVersion: UI_STATE_STORAGE_VERSION,
  }
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(filename, blob)
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportObjectAsGlb(object) {
  return new Promise((resolve, reject) => {
    if (!object) {
      reject(new Error('No exportable model is mounted.'))
      return
    }

    const exportRoot = object.clone(true)
    exportRoot.traverse((node) => {
      if (!node.isMesh && !node.isLine && !node.isLineSegments) return

      node.castShadow = false
      node.receiveShadow = false
      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) => material.clone())
      } else if (node.material) {
        node.material = node.material.clone()
      }
    })

    const exporter = new GLTFExporter()
    exporter.parse(
      exportRoot,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: 'model/gltf-binary' }))
          return
        }

        resolve(new Blob([JSON.stringify(result)], { type: 'model/gltf+json' }))
      },
      (error) => reject(error),
      {
        binary: true,
        onlyVisible: true,
        trs: false,
      },
    )
  })
}

function downloadCanvasImage(filename) {
  const canvas = document.querySelector('.cell-viewer canvas')
  if (!canvas) return false

  try {
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = filename
    link.click()
    return true
  } catch {
    return false
  }
}

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function seeded(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function pickSpherePoint(index, radius = 1) {
  const theta = seeded(index * 3) * Math.PI * 2
  const phi = Math.acos(2 * seeded(index * 3 + 1) - 1)
  const spread = radius * (0.86 + seeded(index * 3 + 2) * 0.16)

  return [
    Math.sin(phi) * Math.cos(theta) * spread,
    Math.sin(phi) * Math.sin(theta) * spread,
    Math.cos(phi) * spread,
  ]
}

function ClickableGroup({ id, onSelect, children, ...props }) {
  return (
    <group
      {...props}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(id)
      }}
    >
      {children}
    </group>
  )
}

function PlantChloroplast({ position, rotation = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <capsuleGeometry args={[0.13, 0.5, 14, 34]} />
        <meshPhysicalMaterial color="#78b83d" roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.35} />
      </mesh>
      {[-0.18, -0.09, 0, 0.09, 0.18].map((y) => (
        <mesh key={y} position={[0, y, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.085, 0.012, 8, 28]} />
          <meshStandardMaterial color="#3f7d20" roughness={0.38} />
        </mesh>
      ))}
    </group>
  )
}

function PlantMitochondrion({ position, rotation = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <capsuleGeometry args={[0.095, 0.42, 12, 30]} />
        <meshStandardMaterial color="#f07832" emissive="#b84213" emissiveIntensity={0.12} roughness={0.38} />
      </mesh>
      {[-0.13, 0, 0.13].map((y) => (
        <Line
          key={y}
          points={[
            [-0.055, y - 0.04, 0.08],
            [0.055, y, 0.09],
            [-0.035, y + 0.045, 0.08],
          ]}
          color="#ffd0a8"
          lineWidth={1.4}
          transparent
          opacity={0.75}
        />
      ))}
    </group>
  )
}

function PlantGolgi({ position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {[-0.18, -0.09, 0, 0.09, 0.18].map((y, index) => (
        <RoundedBox key={y} args={[0.56 - index * 0.035, 0.05, 0.07]} radius={0.025} smoothness={4} position={[0, y, index * 0.018]}>
          <meshStandardMaterial color={index % 2 === 0 ? '#f28a72' : '#ef6f86'} roughness={0.42} />
        </RoundedBox>
      ))}
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[0.36 + seeded(index) * 0.16, -0.2 + index * 0.09, 0.05]}>
          <sphereGeometry args={[0.045, 18, 18]} />
          <meshStandardMaterial color="#f08b65" roughness={0.34} />
        </mesh>
      ))}
    </group>
  )
}

function PlantCellWallPores() {
  const pores = useMemo(
    () =>
      Array.from({ length: 46 }, (_, index) => {
        const onHorizontal = index % 2 === 0
        const side = seeded(index) > 0.5 ? 1 : -1
        return {
          position: onHorizontal
            ? [(seeded(index + 10) - 0.5) * 2.85, side * (0.86 + seeded(index + 20) * 0.08), 0.29 + seeded(index + 30) * 0.05]
            : [side * (1.45 + seeded(index + 10) * 0.08), (seeded(index + 20) - 0.5) * 1.55, 0.29 + seeded(index + 30) * 0.05],
          scale: 0.018 + seeded(index + 40) * 0.018,
        }
      }),
    [],
  )

  return (
    <group>
      {pores.map((pore, index) => (
        <mesh key={index} position={pore.position} scale={[pore.scale * 1.45, pore.scale, pore.scale * 0.24]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial color="#5e7f30" roughness={0.72} transparent opacity={0.62} />
        </mesh>
      ))}
    </group>
  )
}

function PlantCellBubbles() {
  const bubbles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        position: [(seeded(index) - 0.5) * 2.35, (seeded(index + 50) - 0.5) * 1.25, 0.48 + seeded(index + 100) * 0.28],
        radius: 0.025 + seeded(index + 150) * 0.045,
      })),
    [],
  )

  return (
    <group>
      {bubbles.map((bubble, index) => (
        <mesh key={index} position={bubble.position}>
          <sphereGeometry args={[bubble.radius, 18, 18]} />
          <meshPhysicalMaterial
            color="#d8f8ff"
            transparent
            opacity={0.38}
            roughness={0.04}
            metalness={0}
            transmission={0.28}
            thickness={0.2}
            clearcoat={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

function PlantReticulum() {
  const lines = useMemo(
    () => [
      [
        [0.14, 0.55, 0.58],
        [0.38, 0.7, 0.62],
        [0.78, 0.65, 0.58],
        [1.04, 0.47, 0.54],
      ],
      [
        [0.06, 0.26, 0.6],
        [0.38, 0.12, 0.66],
        [0.86, 0.2, 0.62],
        [1.12, 0.02, 0.57],
      ],
      [
        [0.1, -0.08, 0.62],
        [0.36, -0.18, 0.7],
        [0.78, -0.1, 0.64],
        [1.02, -0.24, 0.58],
      ],
      [
        [0.12, 0.42, 0.5],
        [-0.12, 0.26, 0.58],
        [-0.38, 0.12, 0.54],
      ],
    ],
    [],
  )

  return (
    <group>
      {lines.map((points, index) => (
        <Line key={index} points={points} color={index % 2 ? '#326eb2' : '#6d46bd'} lineWidth={2.1} transparent opacity={0.7} />
      ))}
    </group>
  )
}

function PlantCellModel({ selected, crossSection, onSelect, hideOthers, proofMode }) {
  const group = useRef()
  const show = (id) => !hideOthers || id === selected || id === 'membrane'
  const proofOffset = (id) => {
    if (!proofMode) return [0, 0, 0]
    return {
      nucleus: [0.34, 0.18, 0.46],
      granules: [-0.2, -0.04, 0.32],
      mitochondria: [-0.42, 0.08, 0.56],
      chloroplasts: [0.24, -0.18, 0.72],
    }[id] ?? [0, 0, 0]
  }
  const ribosomes = useMemo(
    () =>
      Array.from({ length: 92 }, (_, index) => {
        const point = pickSpherePoint(index + 20, 1)
        return {
          position: [point[0] * 1.4, point[1] * 0.84, 0.34 + seeded(index + 70) * 0.25],
          radius: 0.018 + seeded(index + 120) * 0.018,
          color: ['#d59a3d', '#8561bd', '#d76f7e', '#5aa4b5'][index % 4],
        }
      }),
    [],
  )

  const fibers = useMemo(
    () => [
      [
        [-1.25, -0.58, 0.42],
        [-0.5, -0.38, 0.5],
        [0.24, -0.56, 0.48],
        [1.1, -0.35, 0.46],
      ],
      [
        [-1.18, 0.45, 0.42],
        [-0.3, 0.24, 0.52],
        [0.55, 0.48, 0.48],
        [1.2, 0.25, 0.44],
      ],
      [
        [-0.95, -0.1, 0.5],
        [-0.2, 0.05, 0.56],
        [0.72, -0.03, 0.5],
      ],
    ],
    [],
  )

  return (
    <group ref={group} scale={1.12} rotation={[-0.54, -0.18, 0.02]}>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          <RoundedBox args={[3.45, 2.16, 0.42]} radius={0.18} smoothness={8} position={[0, 0, 0.02]}>
            <meshPhysicalMaterial color="#87a944" roughness={0.46} clearcoat={0.55} clearcoatRoughness={0.42} sheen={0.35} sheenColor="#dbe68e" />
          </RoundedBox>
          <PlantCellWallPores />
          <RoundedBox args={[3.08, 1.78, 0.46]} radius={0.16} smoothness={8} position={[0, 0, 0.16]}>
            <meshPhysicalMaterial
              color="#7fb59d"
              transparent
              opacity={crossSection ? 0.48 : 0.62}
              roughness={0.24}
              metalness={0.02}
              transmission={0.12}
              depthWrite={false}
              clearcoat={0.6}
              clearcoatRoughness={0.18}
            />
          </RoundedBox>
          {selected === 'membrane' && (
            <RoundedBox args={[3.55, 2.26, 0.48]} radius={0.2} smoothness={8} position={[0, 0, 0.2]}>
              <meshBasicMaterial color="#6b9844" wireframe transparent opacity={0.24} />
            </RoundedBox>
          )}
        </ClickableGroup>

        {show('granules') && (
        <ClickableGroup id="granules" onSelect={onSelect} position={proofOffset('granules')}>
          <mesh position={[-0.5, -0.05, 0.48]} rotation={[0.02, -0.1, -0.18]} scale={[0.58, 0.92, 0.16]}>
            <sphereGeometry args={[0.7, 56, 56]} />
            <meshPhysicalMaterial color="#6cc8ee" transparent opacity={0.84} roughness={0.08} clearcoat={0.88} clearcoatRoughness={0.08} transmission={0.1} />
          </mesh>
          <PlantGolgi position={[0.48, -0.38, 0.62]} rotation={[0, 0, 0.08]} />
          <PlantCellBubbles />
          {ribosomes.map((ribosome, index) => (
            <mesh key={index} position={ribosome.position}>
              <sphereGeometry args={[ribosome.radius, 12, 12]} />
              <meshStandardMaterial color={ribosome.color} roughness={0.35} />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('nucleus') && (
        <ClickableGroup id="nucleus" onSelect={onSelect} position={[0.55 + proofOffset('nucleus')[0], 0.38 + proofOffset('nucleus')[1], 0.6 + proofOffset('nucleus')[2]]}>
          <mesh scale={[0.56, 0.5, 0.28]}>
            <sphereGeometry args={[0.58, 72, 72]} />
            <meshPhysicalMaterial color="#8d55c7" roughness={0.36} clearcoat={0.35} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0.06, -0.02, 0.18]} scale={[0.17, 0.17, 0.14]}>
            <sphereGeometry args={[1, 40, 40]} />
            <meshStandardMaterial color="#5a2f96" roughness={0.28} />
          </mesh>
          {[0.62, 0.78, 0.94].map((radius, index) => (
            <mesh key={radius} rotation={[Math.PI / 2, 0, 0.05 * index]} position={[0, 0, -0.02 - index * 0.015]}>
              <torusGeometry args={[radius, 0.018, 8, 90]} />
              <meshStandardMaterial color={index % 2 ? '#6e45b8' : '#304f9b'} roughness={0.4} />
            </mesh>
          ))}
          <PlantReticulum />
          {selected === 'nucleus' && (
            <mesh scale={[0.77, 0.68, 0.36]}>
              <sphereGeometry args={[0.62, 48, 48]} />
              <meshBasicMaterial color="#8d55c7" wireframe transparent opacity={0.32} />
            </mesh>
          )}
        </ClickableGroup>
        )}

        {show('mitochondria') && (
        <ClickableGroup id="mitochondria" onSelect={onSelect} position={proofOffset('mitochondria')}>
          <PlantMitochondrion position={[-1.1, 0.48, 0.58]} rotation={[0.2, 0.18, -0.42]} scale={0.82} />
          <PlantMitochondrion position={[1.2, 0.3, 0.56]} rotation={[0.2, -0.18, 0.62]} scale={0.88} />
          <PlantMitochondrion position={[-0.85, -0.78, 0.55]} rotation={[0.15, 0.2, 1.45]} scale={0.82} />
        </ClickableGroup>
        )}

        {show('granules') && (
        <ClickableGroup id="granules" onSelect={onSelect} position={proofOffset('chloroplasts')}>
          <PlantChloroplast position={[-1.18, -0.38, 0.58]} rotation={[0.15, -0.22, -0.9]} scale={1.05} />
          <PlantChloroplast position={[-1.02, 0.76, 0.54]} rotation={[0.2, -0.1, -1.12]} scale={0.95} />
          <PlantChloroplast position={[1.15, -0.58, 0.55]} rotation={[0.16, 0.12, 0.82]} scale={1.03} />
          <PlantChloroplast position={[1.02, 0.7, 0.5]} rotation={[0.18, -0.16, 0.98]} scale={0.9} />
          {fibers.map((points, index) => (
            <Line key={index} points={points} color={index % 2 ? '#5f7fcb' : '#68a173'} lineWidth={1.5} transparent opacity={0.55} />
          ))}
        </ClickableGroup>
        )}
    </group>
  )
}

function CellBodyGeometry({ kind }) {
  if (kind === 'box') return <boxGeometry args={[1.9, 1.42, 0.9, 10, 10, 4]} />
  if (kind === 'capsule') return <capsuleGeometry args={[0.42, 2.38, 18, 64]} />
  return <sphereGeometry args={[1.32, 96, 96]} />
}

function CellSpecificStructures({ cellId, onSelect }) {
  if (cellId === 'neuron') {
    return (
      <group>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          {[
            [
              [-0.72, 0.2, 0.12],
              [-1.46, 0.72, 0.05],
              [-2.18, 0.94, -0.08],
            ],
            [
              [-0.54, -0.08, 0.16],
              [-1.28, -0.54, 0.08],
              [-2.18, -0.86, -0.08],
            ],
            [
              [-0.34, 0.38, 0.12],
              [-0.88, 1.02, 0.04],
              [-1.34, 1.44, -0.05],
            ],
            [
              [0.64, 0.02, 0.08],
              [1.55, 0.02, 0.02],
              [2.65, -0.05, -0.04],
              [3.34, 0.16, -0.1],
            ],
          ].map((points, index) => (
            <Line key={index} points={points} color="#8b5cf6" lineWidth={3.2} transparent opacity={0.68} />
          ))}
          {[
            [-2.18, 0.94, -0.08],
            [-2.18, -0.86, -0.08],
            [-1.34, 1.44, -0.05],
            [3.34, 0.16, -0.1],
          ].map((position, index) => (
            <mesh key={index} position={position}>
              <sphereGeometry args={[0.08, 20, 20]} />
              <meshStandardMaterial color="#a78bfa" emissive="#6d28d9" emissiveIntensity={0.16} roughness={0.34} />
            </mesh>
          ))}
        </ClickableGroup>
      </group>
    )
  }

  if (cellId === 'bacteria') {
    const dna = Array.from({ length: 28 }, (_, index) => {
      const x = index * 0.07 - 0.95
      return [x, Math.sin(index * 0.9) * 0.16, 0.22]
    })

    return (
      <group>
        <ClickableGroup id="granules" onSelect={onSelect}>
          <Line points={dna} color="#5b7fdf" lineWidth={3} transparent opacity={0.78} />
          {Array.from({ length: 32 }, (_, index) => (
            <mesh key={index} position={[(seeded(index) - 0.5) * 2.2, (seeded(index + 20) - 0.5) * 0.48, 0.24 + seeded(index + 40) * 0.2]}>
              <sphereGeometry args={[0.025 + seeded(index + 60) * 0.018, 12, 12]} />
              <meshStandardMaterial color={index % 2 ? '#2f9a7d' : '#5b82c4'} roughness={0.42} />
            </mesh>
          ))}
        </ClickableGroup>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          <Line points={[[1.54, -0.05, 0.02], [2.18, -0.22, -0.05], [2.8, -0.02, -0.1], [3.38, 0.2, -0.14]]} color="#52b788" lineWidth={3.4} transparent opacity={0.72} />
          {[-0.8, -0.42, 0, 0.42, 0.8].map((x, index) => (
            <Line
              key={x}
              points={[
                [x, 0.35, 0.02],
                [x + (index % 2 ? 0.08 : -0.08), 0.68, -0.05],
              ]}
              color="#69c6a9"
              lineWidth={1.8}
              transparent
              opacity={0.64}
            />
          ))}
        </ClickableGroup>
      </group>
    )
  }

  if (cellId === 'muscle') {
    return (
      <group>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          {[-1.08, -0.78, -0.48, -0.18, 0.12, 0.42, 0.72, 1.02].map((x) => (
            <Line key={x} points={[[x, -0.38, 0.26], [x + 0.16, 0.38, 0.26]]} color="#f8c4ca" lineWidth={2.2} transparent opacity={0.84} />
          ))}
          <Line points={[[-1.48, 0.1, 0.25], [-0.5, 0.18, 0.28], [0.5, 0.13, 0.28], [1.48, 0.2, 0.25]]} color="#ffe2e5" lineWidth={2.4} transparent opacity={0.72} />
        </ClickableGroup>
      </group>
    )
  }

  if (cellId === 'epithelial') {
    return (
      <ClickableGroup id="membrane" onSelect={onSelect}>
        {[-0.72, -0.36, 0, 0.36, 0.72].map((x) => (
          <Line key={x} points={[[x, 0.58, 0.38], [x + 0.03, 0.92, 0.38]]} color="#b96363" lineWidth={2} transparent opacity={0.64} />
        ))}
        {[-0.46, 0, 0.46].map((x) => (
          <Line key={x} points={[[x, -0.62, 0.42], [x, 0.62, 0.42]]} color="#f7d4cd" lineWidth={1.6} transparent opacity={0.72} />
        ))}
      </ClickableGroup>
    )
  }

  if (cellId === 'white-blood') {
    return (
      <ClickableGroup id="membrane" onSelect={onSelect}>
        {[
          [-1.38, -0.08, 0.02, -0.5],
          [1.36, 0.18, 0.04, 0.52],
          [-0.3, 1.24, -0.02, 1.55],
          [0.38, -1.18, -0.02, -1.48],
        ].map(([x, y, z, angle], index) => (
          <mesh key={index} position={[x, y, z]} rotation={[0.2, 0.08, angle]}>
            <capsuleGeometry args={[0.11, 0.38, 10, 24]} />
            <meshPhysicalMaterial color="#d7dfef" transparent opacity={0.64} roughness={0.36} clearcoat={0.35} />
          </mesh>
        ))}
      </ClickableGroup>
    )
  }

  if (cellId === 'animal') {
    return (
      <ClickableGroup id="granules" onSelect={onSelect}>
        {[[-0.68, 0.64, 0.36], [0.72, -0.38, 0.4], [0.45, 0.62, 0.28]].map((position, index) => (
          <mesh key={index} position={position} scale={[0.22, 0.16, 0.16]}>
            <sphereGeometry args={[1, 28, 28]} />
            <meshPhysicalMaterial color="#8cc9dd" transparent opacity={0.46} roughness={0.08} clearcoat={0.7} />
          </mesh>
        ))}
      </ClickableGroup>
    )
  }

  return null
}

function CellModel({ cellId, selected, crossSection, onSelect, hideOthers, proofMode }) {
  const group = useRef()
  const body = CELL_BODY[cellId] ?? CELL_BODY['white-blood']
  const seedOffset = CELL_TYPES.findIndex((cell) => cell.id === cellId) * 100
  const show = (id) => !hideOthers || id === selected || id === 'membrane'
  const bodyRotation = body.kind === 'capsule' ? [0, 0, Math.PI / 2] : [0, 0, 0]
  const bodyOpacity = hideOthers && selected !== 'membrane' ? 0.24 : crossSection ? 0.42 : 0.62
  const proofOffset = (id) => {
    if (!proofMode) return [0, 0, 0]
    return {
      nucleus: [0.34, 0.18, 0.42],
      granules: [-0.28, -0.04, 0.46],
      lysosome: [0.28, 0.26, 0.58],
      mitochondria: [-0.38, -0.18, 0.62],
    }[id] ?? [0, 0, 0]
  }

  const granules = useMemo(
    () =>
      Array.from({ length: cellId === 'bacteria' ? 48 : cellId === 'muscle' ? 34 : 88 }, (_, index) => {
        const point = pickSpherePoint(index + seedOffset, body.kind === 'capsule' ? 1.1 : 1.4)
        return {
          position:
            body.kind === 'capsule'
              ? [(seeded(index + seedOffset) - 0.5) * 2.46, (seeded(index + seedOffset + 30) - 0.5) * 0.56, point[2] * 0.32]
              : [point[0] * 1.04, point[1] * 0.92, point[2] * 0.74],
          radius: 0.035 + seeded(index + 200) * 0.04,
          color: ['#d8dde8', '#b6c3dc', '#8799d6', '#dab3d2'][index % 4],
        }
      }),
    [body.kind, cellId, seedOffset],
  )

  const lysosomes = useMemo(
    () =>
      Array.from({ length: 13 }, (_, index) => ({
        position: [1.28 + seeded(index + seedOffset) * 0.34, 0.56 + seeded(index + seedOffset + 40) * 0.64, -0.16 + seeded(index + seedOffset + 80) * 0.3],
        radius: 0.06 + seeded(index + 120) * 0.035,
      })),
    [seedOffset],
  )

  const erLines = useMemo(
    () => [
      [
        [-0.18, -0.86, 0.34],
        [0.12, -0.76, 0.25],
        [0.36, -0.9, 0.32],
        [0.58, -0.72, 0.24],
        [0.8, -0.84, 0.34],
      ],
      [
        [-0.22, -1.02, 0.26],
        [0.04, -1.15, 0.22],
        [0.34, -1.04, 0.28],
        [0.62, -1.16, 0.2],
      ],
      [
        [0.02, -0.62, 0.36],
        [0.34, -0.52, 0.32],
        [0.6, -0.62, 0.38],
        [0.88, -0.5, 0.28],
      ],
    ],
    [],
  )

  return (
      <group ref={group} scale={1.22} rotation={[-0.08, -0.42, 0.05]}>
        <ClickableGroup id="membrane" onSelect={onSelect}>
          <mesh scale={body.scale} rotation={bodyRotation}>
            <CellBodyGeometry kind={body.kind} />
            <meshPhysicalMaterial
              color={body.color}
              transparent
              opacity={bodyOpacity}
              roughness={0.34}
              metalness={0.03}
              transmission={body.kind === 'capsule' ? 0.06 : 0.14}
              clearcoat={0.58}
              clearcoatRoughness={0.2}
            />
          </mesh>
          <mesh scale={body.scale.map((value) => value * 1.04)} rotation={bodyRotation}>
            <CellBodyGeometry kind={body.kind} />
            <meshBasicMaterial color="#f4f0e4" wireframe transparent opacity={selected === 'membrane' ? 0.3 : 0.12} />
          </mesh>
        </ClickableGroup>

        {crossSection && (
          <mesh position={[0.12, -0.04, 0.1]} rotation={[0, 0.05, 0]} scale={[1.58, 1.28, 1]}>
            <circleGeometry args={[1.05, 96]} />
            <meshBasicMaterial color="#f6e9dc" transparent opacity={0.32} side={THREE.DoubleSide} />
          </mesh>
        )}

        {show('nucleus') && cellId !== 'bacteria' && (
        <ClickableGroup id="nucleus" onSelect={onSelect} position={[-0.2 + proofOffset('nucleus')[0], 0.12 + proofOffset('nucleus')[1], 0.28 + proofOffset('nucleus')[2]]} rotation={[0.2, -0.12, -0.32]}>
          <mesh position={[-0.25, 0.18, 0]} scale={[0.72, 0.5, 0.44]}>
            <sphereGeometry args={[0.48, 64, 64]} />
            <meshPhysicalMaterial color="#6f3a9b" roughness={0.36} clearcoat={0.32} emissive="#4c1d95" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0.36, -0.24, 0.04]} scale={[0.76, 0.54, 0.44]}>
            <sphereGeometry args={[0.48, 64, 64]} />
            <meshPhysicalMaterial color="#753ca8" roughness={0.36} clearcoat={0.32} emissive="#4c1d95" emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0.08, -0.02, 0.02]} scale={[0.42, 0.28, 0.28]}>
            <sphereGeometry args={[0.42, 48, 48]} />
            <meshStandardMaterial color="#8449b8" roughness={0.48} />
          </mesh>
          {selected === 'nucleus' && (
            <mesh scale={[1.42, 1.1, 0.78]} position={[0.04, -0.04, 0]}>
              <sphereGeometry args={[0.68, 48, 48]} />
              <meshBasicMaterial color="#7b4bb4" wireframe transparent opacity={0.28} />
            </mesh>
          )}
        </ClickableGroup>
        )}

        {show('granules') && (
        <ClickableGroup id="granules" onSelect={onSelect} position={proofOffset('granules')}>
          {granules.map((granule, index) => (
            <mesh key={index} position={granule.position}>
              <sphereGeometry args={[granule.radius, 18, 18]} />
              <meshStandardMaterial
                color={granule.color}
                emissive={selected === 'granules' ? '#5b82c4' : '#1e293b'}
                emissiveIntensity={selected === 'granules' ? 0.25 : 0.02}
                roughness={0.36}
              />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('lysosome') && cellId !== 'bacteria' && cellId !== 'muscle' && (
        <ClickableGroup id="lysosome" onSelect={onSelect} position={proofOffset('lysosome')}>
          {lysosomes.map((lysosome, index) => (
            <mesh key={index} position={lysosome.position}>
              <sphereGeometry args={[lysosome.radius, 24, 24]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? '#7c3b91' : '#a15bb7'}
                emissive="#5b2470"
                emissiveIntensity={selected === 'lysosome' ? 0.45 : 0.16}
                roughness={0.3}
              />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('mitochondria') && cellId !== 'bacteria' && (
        <ClickableGroup id="mitochondria" onSelect={onSelect} position={proofOffset('mitochondria')}>
          {[
            [-0.78, -0.55, 0.48, 0.38],
            [0.7, 0.1, 0.46, -0.35],
            [0.96, -0.62, 0.16, 0.7],
            ...(cellId === 'muscle'
              ? [
                  [-1.18, 0.18, 0.34, -0.72],
                  [1.2, 0.24, 0.32, 0.58],
                ]
              : []),
          ].map(([x, y, z, tilt], index) => (
            <mesh key={index} position={[x, y, z]} rotation={[0.78, tilt, 0.95]} scale={selected === 'mitochondria' ? 1.08 : 1}>
              <capsuleGeometry args={[0.105, 0.42, 10, 28]} />
              <meshStandardMaterial color="#df7046" emissive="#c2410c" emissiveIntensity={0.22} roughness={0.34} />
            </mesh>
          ))}
        </ClickableGroup>
        )}

        {show('granules') && cellId !== 'bacteria' && (
        <ClickableGroup id="granules" onSelect={onSelect}>
          {erLines.map((points, index) => (
            <Line key={index} points={points} color="#d65e85" lineWidth={2.4} transparent opacity={0.78} />
          ))}
        </ClickableGroup>
        )}

        <CellSpecificStructures cellId={cellId} onSelect={onSelect} />
      </group>
  )
}

function SceneExportBridge({ exportRoot, onExporterReady }) {
  useEffect(() => {
    if (typeof onExporterReady !== 'function') return undefined

    const exportCurrentModel = () => exportObjectAsGlb(exportRoot.current)
    onExporterReady(() => exportCurrentModel)

    return () => onExporterReady(null)
  }, [exportRoot, onExporterReady])

  return null
}

function ProofRig() {
  const gridLines = useMemo(() => {
    const lines = []
    for (let i = -4; i <= 4; i += 1) {
      lines.push({
        key: `x-${i}`,
        points: [[-2.4, -1.42, i * 0.45], [2.4, -1.42, i * 0.45]],
      })
      lines.push({
        key: `z-${i}`,
        points: [[i * 0.45, -1.42, -1.8], [i * 0.45, -1.42, 1.8]],
      })
    }
    return lines
  }, [])

  return (
    <group>
      {gridLines.map((line) => (
        <Line key={line.key} points={line.points} color="#9a8a72" lineWidth={0.8} transparent opacity={0.24} />
      ))}
      <Line points={[[-2.55, -1.38, 0], [2.65, -1.38, 0]]} color="#d94a4a" lineWidth={3.2} transparent opacity={0.78} />
      <Line points={[[0, -1.48, 0], [0, 1.72, 0]]} color="#45a464" lineWidth={3.2} transparent opacity={0.78} />
      <Line points={[[0, -1.38, -2.05], [0, -1.38, 2.25]]} color="#3b82f6" lineWidth={3.2} transparent opacity={0.78} />
      {[0.65, 1.15, 1.65].map((radius) => (
        <mesh key={radius} rotation={[Math.PI / 2, 0, 0]} position={[0, -1.36, 0]}>
          <torusGeometry args={[radius, 0.006, 8, 96]} />
          <meshBasicMaterial color="#7c6d5a" transparent opacity={0.22} />
        </mesh>
      ))}
    </group>
  )
}

class ViewerErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

function GeneratedGlbModel({ modelUrl, proofMode, onSelect }) {
  const gltf = useGLTF(modelUrl)
  const { object, scale } = useMemo(() => {
    const cloned = gltf.scene.clone(true)

    cloned.traverse((node) => {
      if (!node.isMesh) return
      node.castShadow = true
      node.receiveShadow = true
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach((material) => {
          material.side = THREE.DoubleSide
          material.envMapIntensity = Math.max(material.envMapIntensity || 0, 1.15)
          material.needsUpdate = true
        })
      }
    })

    const box = new THREE.Box3().setFromObject(cloned)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const longest = Math.max(size.x, size.y, size.z) || 1
    cloned.position.sub(center)

    return {
      object: cloned,
      scale: 3.25 / longest,
    }
  }, [gltf.scene])

  return (
    <group
      scale={scale * (proofMode ? 0.92 : 1)}
      rotation={[-0.12, -0.2, 0]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect('membrane')
      }}
    >
      <primitive object={object} />
    </group>
  )
}

function CinematicReliefSpecimen({ imageUrl, autoRotate, onSelect }) {
  const groupRef = useRef(null)
  const sourceTexture = useTexture(imageUrl)
  const texture = useMemo(() => {
    const nextTexture = sourceTexture.clone()
    nextTexture.colorSpace = THREE.SRGBColorSpace
    nextTexture.anisotropy = 12
    nextTexture.generateMipmaps = false
    nextTexture.minFilter = THREE.LinearFilter
    nextTexture.magFilter = THREE.LinearFilter
    nextTexture.wrapS = THREE.ClampToEdgeWrapping
    nextTexture.wrapT = THREE.ClampToEdgeWrapping
    nextTexture.needsUpdate = true
    return nextTexture
  }, [sourceTexture])
  const relief = useMemo(() => createImageReliefGeometry(sourceTexture.image), [sourceTexture.image])

  useEffect(() => () => {
    texture.dispose()
    relief.geometry.dispose()
    relief.slabGeometry.dispose()
  }, [relief, texture])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (autoRotate) groupRef.current.rotation.y += delta * 0.22
  })

  return (
    <group ref={groupRef} rotation={[-0.12, -0.18, 0]} onClick={(event) => {
      event.stopPropagation()
      onSelect('membrane')
    }}>
      <mesh geometry={relief.geometry} position={[0, 0, 0.18]} renderOrder={10}>
        <meshPhysicalMaterial
          map={texture}
          alphaTest={0.24}
          depthWrite
          roughness={0.46}
          metalness={0.02}
          clearcoat={0.42}
          clearcoatRoughness={0.18}
          envMapIntensity={1.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

function CinematicReliefScene({ imageUrl, autoRotate, onSelectOrganelle }) {
  return (
    <Canvas
      className="cinematic-relief-canvas"
      camera={{ position: [0, 0.18, 5.35], fov: 34 }}
      shadows
      dpr={[1, 1]}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.14
      }}
    >
      <color attach="background" args={['#f6efdf']} />
      <ambientLight intensity={0.84} />
      <directionalLight castShadow position={[3.6, 4.8, 5.8]} intensity={3.8} color="#fff7e8" shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4.2, 2.1, 3.2]} intensity={1.55} color="#d6eef8" />
      <pointLight position={[0.8, -2.6, 2.6]} intensity={1.3} color="#f4a6c8" />
      <pointLight position={[-2.8, 1.2, 1.8]} intensity={0.92} color="#bde8b0" />
      <Suspense fallback={null}>
        <CinematicReliefSpecimen imageUrl={imageUrl} autoRotate={autoRotate} onSelect={onSelectOrganelle} />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={3.15} maxDistance={6.2} enableDamping dampingFactor={0.08} autoRotate={autoRotate} autoRotateSpeed={0.32} />
    </Canvas>
  )
}

function CinematicLayerVisual({ imageUrl, selectedOrganelle, onSelectOrganelle, autoRotate }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [visualState, setVisualState] = useState(null)
  const visual = visualState?.imageUrl === imageUrl ? visualState.visual : null
  const webglAvailable = canUseWebGL()

  useEffect(() => {
    let cancelled = false

    if (webglAvailable) {
      return () => {
        cancelled = true
      }
    }

    buildLayeredPngVisual(imageUrl)
      .then((nextVisual) => {
        if (!cancelled) setVisualState({ imageUrl, visual: nextVisual })
      })
      .catch((error) => {
        console.warn(error)
        if (!cancelled) {
          setVisualState({
            imageUrl,
            visual: {
              aspect: 1,
              layers: [{ id: 'source', className: 'layer-body', url: imageUrl, z: 0, shiftX: 0, shiftY: 0, scale: 1, opacity: 1 }],
            },
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [imageUrl, webglAvailable])

  function handlePointerMove(event) {
    if (webglAvailable) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    setPointer({
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    })
  }

  return (
    <div
      className="cinematic-layer-scene"
      style={{ '--px': pointer.x.toFixed(3), '--py': pointer.y.toFixed(3) }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        if (!webglAvailable) setPointer({ x: 0, y: 0 })
      }}
      onClick={() => onSelectOrganelle('membrane')}
    >
      {!webglAvailable && <div className="cinematic-depth-field" />}
      {webglAvailable ? (
        <CinematicReliefScene imageUrl={imageUrl} autoRotate={autoRotate} onSelectOrganelle={onSelectOrganelle} />
      ) : (
        <div
          className={`layered-png-stage ${autoRotate ? 'auto' : ''}`}
          style={{ '--layer-aspect': visual?.aspect || 1 }}
          aria-label="Layered transparent PNG cell visual"
        >
          {visual ? (
            visual.layers.map((layer) => (
              <img
                key={layer.id}
                className={`cinematic-png-layer ${layer.className}`}
                src={layer.url}
                alt=""
                style={{
                  '--z': `${layer.z}px`,
                  '--shift-x': `${layer.shiftX}px`,
                  '--shift-y': `${layer.shiftY}px`,
                  '--scale': layer.scale,
                  '--layer-opacity': layer.opacity,
                }}
              />
            ))
          ) : (
            <div className="layered-png-loading">
              <span />
              Building PNG layers
            </div>
          )}
        </div>
      )}
      <button type="button" className="cinematic-hotspot" style={{ '--label-color': ORGANELLES[selectedOrganelle]?.accent || '#72a4bf' }} onClick={(event) => {
        event.stopPropagation()
        onSelectOrganelle(selectedOrganelle)
      }}>
        <span />
        {ORGANELLES[selectedOrganelle]?.title || 'Layer'}
      </button>
    </div>
  )
}

function CellScene({ selectedCell, modelCellId, referenceImageUrl, generatedModelUrl, selectedOrganelle, crossSection, autoRotate, hideOthers, proofMode, renderQuality, onSelectOrganelle, onExporterReady = null }) {
  const isPlant = modelCellId === 'plant'
  const exportRoot = useRef(null)
  const dpr = renderQuality === 'high' ? [1, 2] : [1, 1.4]

  if (!canUseWebGL()) return null

  return (
    <Canvas
      camera={{ position: [0, 0.1, 5.25], fov: 35 }}
      shadows
      dpr={dpr}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.08
      }}
      fallback={<CellFallback selectedCell={selectedCell} modelCellId={modelCellId} referenceImageUrl={referenceImageUrl} selectedOrganelle={selectedOrganelle} onSelectOrganelle={onSelectOrganelle} />}
    >
      <color attach="background" args={['#f5efdf']} />
      <ambientLight intensity={0.82} />
      <directionalLight castShadow position={[4, 5, 5]} intensity={3.4} color="#fff7ed" shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4.5, 2.6, 3]} intensity={1.65} color="#dbeafe" />
      <pointLight position={[0, -3.2, 2.4]} intensity={1.35} color="#f9a8d4" />
      <pointLight position={[-2.4, 1.2, 1.6]} intensity={0.75} color="#b8f7a6" />
      {proofMode && <ProofRig />}
      <group ref={exportRoot} name={`${selectedCell}-cell-export-root`}>
        {generatedModelUrl ? (
          <Suspense fallback={null}>
            <GeneratedGlbModel modelUrl={apiUrl(generatedModelUrl)} proofMode={proofMode} onSelect={onSelectOrganelle} />
          </Suspense>
        ) : isPlant ? (
          <PlantCellModel selected={selectedOrganelle} crossSection={crossSection} hideOthers={hideOthers} proofMode={proofMode} onSelect={onSelectOrganelle} />
        ) : (
          <CellModel cellId={modelCellId} selected={selectedOrganelle} crossSection={crossSection} hideOthers={hideOthers} proofMode={proofMode} onSelect={onSelectOrganelle} />
        )}
      </group>
      <SceneExportBridge exportRoot={exportRoot} onExporterReady={onExporterReady} />
      <ContactShadows frames={1} position={[0, -1.32, 0]} opacity={0.2} scale={5.4} blur={2.4} far={2.8} color="#8a7355" />
      <OrbitControls enablePan={false} minDistance={proofMode ? 4 : 3.3} maxDistance={proofMode ? 7.4 : 6.4} enableDamping dampingFactor={0.08} autoRotate={autoRotate || proofMode} autoRotateSpeed={proofMode ? 0.75 : 0.45} />
    </Canvas>
  )
}

function CellFallback({ selectedCell, modelCellId, referenceImageUrl, selectedOrganelle, onSelectOrganelle }) {
  const visualCellId = modelCellId ?? getModelCellId(selectedCell)
  const fallbackGranules = Array.from({ length: 34 }, (_, index) => ({
    left: 26 + seeded(index) * 50,
    top: 22 + seeded(index + 80) * 52,
    size: 5 + seeded(index + 140) * 8,
    tone: index % 5,
  }))

  if (referenceImageUrl) {
    return (
      <div className="cell-fallback upload-render-fallback" aria-label="Uploaded cell image fallback">
        <img src={referenceImageUrl} alt="Uploaded cell reference" />
      </div>
    )
  }

  if (visualCellId === 'plant') {
    return (
      <div className="cell-fallback plant-render-fallback" aria-label="Plant cell image fallback">
        <img src={plantCellRender} alt="Detailed plant cell fallback render" />
      </div>
    )
  }

  return (
    <div className="cell-fallback" aria-label="Cell illustration fallback">
      <button
        type="button"
        className={selectedOrganelle === 'membrane' ? `fallback-cell-body ${visualCellId} active` : `fallback-cell-body ${visualCellId}`}
        onClick={() => onSelectOrganelle('membrane')}
      >
        <span className="fallback-texture" />
        <span className="fallback-nucleus-one" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('nucleus')
        }} />
        <span className="fallback-nucleus-two" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('nucleus')
        }} />
        <span className="fallback-er" />
        <span className="fallback-mito one" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('mitochondria')
        }} />
        <span className="fallback-mito two" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('mitochondria')
        }} />
        <span className="fallback-lysosomes" onClick={(event) => {
          event.stopPropagation()
          onSelectOrganelle('lysosome')
        }} />
        {fallbackGranules.map((granule, index) => (
          <span
            key={index}
            className={`fallback-granule tone-${granule.tone}`}
            style={{
              left: `${granule.left}%`,
              top: `${granule.top}%`,
              width: `${granule.size}px`,
              height: `${granule.size}px`,
            }}
            onClick={(event) => {
              event.stopPropagation()
              onSelectOrganelle('granules')
            }}
          />
        ))}
      </button>
    </div>
  )
}

function CellThumb({ cell, selected }) {
  return (
    <span
      className={`cell-thumb ${cell.custom ? 'custom-cell' : cell.id} ${selected ? 'selected' : ''}`}
      style={{ '--cell-accent': cell.accent, '--thumb-image': cell.imageUrl ? `url(${cell.imageUrl})` : undefined }}
    >
      <span />
    </span>
  )
}

function LeftSidebar({ selectedCell, setSelectedCell, selectedOrganelle, setSelectedOrganelle, customCells }) {
  const cells = getPrimaryCells(customCells)
  const availableOrganelles = getAvailableOrganelleIds(selectedCell)

  return (
    <aside className="left-rail">
      <section className="panel cell-types-panel">
        <header className="panel-title">
          <span>
            <SparklesIcon size={14} />
            Cell Types
          </span>
          <ChevronDown size={14} />
        </header>
        <div className="cell-list">
          {cells.map((cell) => (
            <button
              key={cell.id}
              type="button"
              className={selectedCell === cell.id ? 'cell-row active' : 'cell-row'}
              onClick={() => setSelectedCell(cell.id)}
            >
              <CellThumb cell={cell} selected={selectedCell === cell.id} />
              <span>
                <strong>{cell.name}</strong>
                <small>{cell.type}</small>
              </span>
              {selectedCell === cell.id && <Heart size={13} fill="currentColor" />}
            </button>
          ))}
        </div>
      </section>

      <section className="panel organelles-panel">
        <header className="panel-title">
          <span>
            <CircleDot size={14} />
            Organelles
          </span>
          <ChevronDown size={14} />
        </header>
        <div className="organelle-list">
          {availableOrganelles.map((id) => (
            <button
              key={id}
              type="button"
              className={selectedOrganelle === id ? 'organelle-row active' : 'organelle-row'}
              onClick={() => setSelectedOrganelle(id)}
              style={{ '--dot': ORGANELLES[id].accent }}
            >
              <span className="dot" />
              {ORGANELLES[id].label}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}

function ViewerControls({ crossSection, setCrossSection, viewMode, setViewMode }) {
  const modes = [
    { id: 'solid', icon: Box, label: 'Solid' },
    { id: 'layers', icon: Layers3, label: 'Layers' },
    { id: 'focus', icon: CircleDot, label: 'Focus' },
  ]

  return (
    <div className="viewer-controls">
      <span>View Mode</span>
      <div className="mode-buttons">
        {modes.map((mode) => {
          const Icon = mode.icon
          return (
            <button
              key={mode.id}
              type="button"
              className={viewMode === mode.id ? 'active' : ''}
              onClick={() => setViewMode(mode.id)}
              title={mode.label}
            >
              <Icon size={17} />
            </button>
          )
        })}
      </div>
      <label className="toggle-row">
        <span>Cross-Section</span>
        <input type="checkbox" checked={crossSection} onChange={(event) => setCrossSection(event.target.checked)} />
        <i />
      </label>
    </div>
  )
}

function CenterStage({ selectedCell, selectedOrganelle, setSelectedOrganelle, crossSection, setCrossSection, labelVisible, renderQuality, customCells, onNotify, onExport, onExporterReady, onRetryGeneration }) {
  const [viewMode, setViewMode] = useState('layers')
  const [autoRotate, setAutoRotate] = useState(false)
  const [isIsolated, setIsIsolated] = useState(false)
  const [hideOthers, setHideOthers] = useState(false)
  const [proofMode, setProofMode] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [capturePulse, setCapturePulse] = useState(false)
  const [viewerError, setViewerError] = useState(null)
  const cell = getCell(selectedCell, customCells)
  const modelCellId = cell.custom ? cell.template : selectedCell
  const referenceImageUrl = cell.custom ? cell.imageUrl : ''
  const generatedModelUrl = getGeneratedModelUrl(cell)
  const generation = cell.custom ? cell.generation : null
  const generationProviderLabel = getProviderLabel(generation?.provider)
  const generationFailureTitle = generation?.requestedProvider === 'auto' ? '3D generation failed' : `${generationProviderLabel} generation failed`
  const isCinematicCell = cell.custom && generation?.provider === 'cinematic'
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle)
  const webglAvailable = canUseWebGL()
  const generationPending = cell.custom && !generatedModelUrl && generation?.status && !['failed', 'local'].includes(generation.status)
  const generationFailed = cell.custom && !generatedModelUrl && generation?.status === 'failed'
  const stageStatusText = isCinematicCell
    ? `JS image relief · ${autoRotate ? 'Auto orbit' : 'Manual orbit'} · ${viewMode}`
    : `${generatedModelUrl ? `${generationProviderLabel} GLB loaded` : generationFailed ? `${generationProviderLabel} failed; source image shown` : referenceImageUrl ? `${generationProviderLabel} ${generation?.status || 'pending'}` : webglAvailable ? 'WebGL live 3D' : 'Fallback image'} · ${autoRotate || proofMode ? 'Auto rotate' : 'Manual orbit'} · ${viewMode}`
  const referenceLabel = isCinematicCell
    ? 'Source image used for browser-side JS depth relief'
    : generatedModelUrl
    ? `Source image used for ${generationProviderLabel} 3D generation`
    : `Source image for ${generationProviderLabel} generation`
  const viewerResetKey = `${selectedCell}-${generatedModelUrl}-${generation?.provider || 'built-in'}-${resetNonce}`
  const activeViewerError = viewerError?.key === viewerResetKey ? viewerError.message : ''
  const viewerFallback = (
    <CellFallback
      selectedCell={selectedCell}
      modelCellId={modelCellId}
      referenceImageUrl={referenceImageUrl}
      selectedOrganelle={selectedOrganelle}
      onSelectOrganelle={setSelectedOrganelle}
    />
  )

  function handleRotate() {
    const next = !autoRotate
    setAutoRotate(next)
    onNotify(next ? 'Auto rotate enabled' : 'Auto rotate paused')
  }

  function handleIsolate() {
    const next = !isIsolated
    setIsIsolated(next)
    if (next) setViewMode('focus')
    onNotify(next ? `${detail.title} focus mode` : 'Focus mode off')
  }

  function handleHideOthers() {
    const next = !hideOthers
    setHideOthers(next)
    onNotify(next ? `Showing ${detail.title} with cell shell` : 'All structures visible')
  }

  function handleResetView() {
    setAutoRotate(false)
    setIsIsolated(false)
    setHideOthers(false)
    setProofMode(false)
    setViewMode('layers')
    setResetNonce((value) => value + 1)
    onNotify('View reset')
  }

  function handleProofMode() {
    const next = !proofMode
    setProofMode(next)
    if (next) {
      setViewMode('focus')
      setHideOthers(false)
      setAutoRotate(true)
    }
    onNotify(next ? '3D proof mode: axes, grid, exploded meshes' : '3D proof mode off')
  }

  async function handleScreenshot() {
    const ok = isCinematicCell && referenceImageUrl
      ? (webglAvailable ? downloadCanvasImage(`${selectedCell}-${selectedOrganelle}.png`) : await downloadLayeredPngSnapshot(referenceImageUrl, `${selectedCell}-${selectedOrganelle}.png`))
      : downloadCanvasImage(`${selectedCell}-${selectedOrganelle}.png`)
    setCapturePulse(true)
    window.setTimeout(() => setCapturePulse(false), 280)
    onNotify(ok ? 'Screenshot downloaded' : 'Screenshot unavailable in this browser')
  }

  function handleViewerError(error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'The saved 3D preview could not be loaded.'
    setViewerError({ key: viewerResetKey, message })
    onExporterReady?.(null)
    onNotify('3D preview unavailable; fallback view shown')
  }

  useEffect(() => {
    if (isCinematicCell) onExporterReady?.(null)
  }, [isCinematicCell, onExporterReady])

  return (
    <section className="stage-panel">
      <div className="stage-title">
        <div>
          <h1>{cell.name}</h1>
          <p>{cell.type}</p>
        </div>
      </div>
      <ViewerControls crossSection={crossSection} setCrossSection={setCrossSection} viewMode={viewMode} setViewMode={setViewMode} />
      <div className={`cell-viewer ${viewMode} ${isIsolated ? 'is-isolated' : ''} ${isCinematicCell ? 'cinematic-viewer' : ''}`}>
        <ViewerErrorBoundary resetKey={viewerResetKey} onError={handleViewerError} fallback={viewerFallback}>
          {isCinematicCell ? (
            <CinematicLayerVisual imageUrl={referenceImageUrl} selectedOrganelle={selectedOrganelle} onSelectOrganelle={setSelectedOrganelle} autoRotate={autoRotate || proofMode} />
          ) : (
            <>
              <CellFallback selectedCell={selectedCell} modelCellId={modelCellId} referenceImageUrl={referenceImageUrl} selectedOrganelle={selectedOrganelle} onSelectOrganelle={setSelectedOrganelle} />
              {!generationFailed && (
                <CellScene
                  key={`${selectedCell}-${resetNonce}`}
                  selectedCell={selectedCell}
                  modelCellId={modelCellId}
                  referenceImageUrl={referenceImageUrl}
                  generatedModelUrl={generatedModelUrl}
                  selectedOrganelle={selectedOrganelle}
                  crossSection={crossSection}
                  autoRotate={autoRotate}
                  hideOthers={hideOthers}
                  proofMode={proofMode}
                  renderQuality={renderQuality}
                  onSelectOrganelle={setSelectedOrganelle}
                  onExporterReady={onExporterReady}
                />
              )}
            </>
          )}
        </ViewerErrorBoundary>
      </div>
      {referenceImageUrl && (
        <div className="custom-reference-layer">
          <img src={referenceImageUrl} alt={`${cell.name} uploaded reference`} />
          <span>{referenceLabel}</span>
        </div>
      )}
      {generationPending && (
        <div className="generation-overlay">
          <strong>{generation.status === 'uploading' ? `Uploading to ${generationProviderLabel}` : `Generating with ${generationProviderLabel}`}</strong>
          <span>{generation.message || 'Waiting for AI-generated GLB...'}</span>
          <div className="generation-meter">
            <i />
          </div>
        </div>
      )}
      {generationFailed && (
        <div className="generation-overlay failed">
          <strong>{generationFailureTitle}</strong>
          <span>{generation.message || 'The saved upload failed before a GLB was returned.'}</span>
          <button type="button" onClick={() => onRetryGeneration?.(cell.id)}>Retry Generation</button>
        </div>
      )}
      {activeViewerError && !generationFailed && (
        <div className="generation-overlay failed">
          <strong>3D preview unavailable</strong>
          <span>{generatedModelUrl ? 'The saved GLB could not be loaded. Showing the saved source image or fallback cell instead.' : activeViewerError}</span>
          {cell.custom && !cell.reference && cell.imageUrl && <button type="button" onClick={() => onRetryGeneration?.(cell.id)}>Retry Generation</button>}
        </div>
      )}
      <button type="button" className={proofMode ? 'proof-launcher active' : 'proof-launcher'} onClick={handleProofMode} aria-pressed={proofMode}>
        <Box size={15} />
        3D Proof
      </button>
      {proofMode && (
        <div className="proof-badge">
          <strong>{isCinematicCell ? 'JS IMAGE RELIEF' : 'LIVE WEBGL 3D'}</strong>
          <span>{isCinematicCell ? 'Texture displacement · transparent depth slabs · OrbitControls' : generatedModelUrl ? `${generationProviderLabel} GLB · OrbitControls · GLB export` : referenceImageUrl ? `${generationProviderLabel} task pending · fallback 3D scaffold` : 'Exploded meshes · XYZ axes · GLB export'}</span>
        </div>
      )}
      {labelVisible && (
        <button type="button" className="stage-label" style={{ '--label-color': detail.accent }} onClick={() => setSelectedOrganelle(selectedOrganelle)}>
          <span />
          {detail.title}
        </button>
      )}
      <div className="stage-status">
        {stageStatusText}
      </div>
      {capturePulse && <div className="capture-pulse" />}
      <div className="stage-toolbar">
        <button type="button" className={autoRotate ? 'active' : ''} onClick={handleRotate} aria-pressed={autoRotate}>
          <Move3D size={14} />
          Rotate
        </button>
        <button type="button" className={isIsolated ? 'active' : ''} onClick={handleIsolate} aria-pressed={isIsolated}>
          <Eye size={14} />
          Isolate
        </button>
        <button type="button" className={hideOthers ? 'active' : ''} onClick={handleHideOthers} aria-pressed={hideOthers}>
          <Layers3 size={14} />
          Hide Others
        </button>
        <button type="button" onClick={handleResetView}>
          <RotateCcw size={14} />
          Reset View
        </button>
        <button type="button" className={proofMode ? 'active proof-active' : ''} onClick={handleProofMode} aria-pressed={proofMode}>
          <Box size={14} />
          3D Proof
        </button>
        <span />
        <button type="button" onClick={handleScreenshot}>
          <Camera size={14} />
          Screenshot
        </button>
        <button type="button" onClick={onExport}>
          <Upload size={14} />
          3D Export
        </button>
      </div>
    </section>
  )
}

function DetailPanel({ selectedCell, selectedOrganelle, favoriteKey, setFavoriteKey, labelVisible, setLabelVisible, onNotify }) {
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle)
  const currentKey = `${selectedCell}:${selectedOrganelle}`
  const isFavorite = favoriteKey === currentKey

  function toggleFavorite() {
    const next = isFavorite ? '' : currentKey
    setFavoriteKey(next)
    onNotify(isFavorite ? `${detail.title} removed from favorites` : `${detail.title} saved to favorites`)
  }

  function toggleLabel() {
    const next = !labelVisible
    setLabelVisible(next)
    onNotify(next ? 'Stage label visible' : 'Stage label hidden')
  }

  return (
    <aside className="right-rail">
      <section className="panel detail-panel">
        <header className="detail-title">
          <span>Organelle Details</span>
          <button type="button" className={isFavorite ? 'detail-fav active' : 'detail-fav'} onClick={toggleFavorite} aria-pressed={isFavorite}>
            <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </header>
        <div className="detail-heading">
          <div className="cluster-icon" style={{ '--cluster': detail.accent }}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>{detail.title}</h2>
            <p>{detail.subtitle}</p>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Size</dt>
            <dd>{detail.size}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{detail.location}</dd>
          </div>
          <div>
            <dt>Visible in LM</dt>
            <dd>{detail.visible}</dd>
          </div>
          <div>
            <dt>Label</dt>
            <dd>
              <button type="button" className={labelVisible ? 'mini-toggle active' : 'mini-toggle'} onClick={toggleLabel} aria-pressed={labelVisible} aria-label="Toggle label" />
              <span className="color-dot" style={{ background: detail.accent }} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel notes-panel">
        <header className="panel-title">
          <span>Biological Notes</span>
        </header>
        <p>{detail.note}</p>
        <blockquote>{detail.funFact ?? 'Some white blood cells can change shape to squeeze between blood vessel walls and reach infected tissue.'}</blockquote>
      </section>

      <section className="panel occurs-panel">
        <header className="panel-title">
          <span>Where It Occurs</span>
        </header>
        <div className="body-map">
          <div className="body-line" />
          <div className="body-figure" />
          <div className="target-cell">
            <span />
          </div>
        </div>
      </section>
    </aside>
  )
}

function BottomDeck({ selectedCell, selectedMicroscope, setSelectedMicroscope, uploadedImage, generationMode, onGenerationModeChange, compareCell, onUploadImage, onCompare, onNotify }) {
  const fileInputRef = useRef(null)
  const selected = getCell(selectedCell)
  const compareTarget = getCell(compareCell)
  const uploadAccept = generationMode === 'local' ? '.glb,.gltf,model/gltf-binary,model/gltf+json' : 'image/*,.glb,.gltf,model/gltf-binary,model/gltf+json'

  function handleMicroscopeSelect(item) {
    setSelectedMicroscope(item.label)
    onNotify(item.note)
  }

  return (
    <section className="bottom-deck">
      <div className="panel media-panel">
        <header className="panel-title">
          <span>Microscope View</span>
          <small>3</small>
        </header>
        <div className="generation-mode-row">
          <span>Generate Mode</span>
          <div className="generation-mode-pills">
            {GENERATION_MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={generationMode === mode.id ? 'active' : ''}
                onClick={() => {
                  onGenerationModeChange(mode.id)
                  onNotify(`${mode.label} mode selected`)
                }}
                title={mode.description}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <div className="micro-grid">
          {MICROSCOPE_IMAGES.map((item) => (
            <button
              key={item.label}
              type="button"
              className={selectedMicroscope === item.label ? `micro-card ${item.tone} active` : `micro-card ${item.tone}`}
              onClick={() => handleMicroscopeSelect(item)}
            >
              <span />
              <small>{item.label}</small>
            </button>
          ))}
          <button
            type="button"
            className={uploadedImage ? `add-image active ${uploadedImage.url ? 'with-preview' : 'with-model'}` : 'add-image'}
            style={uploadedImage?.url ? { '--upload-preview': `url(${uploadedImage.url})` } : undefined}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadedImage?.url ? <Image size={16} /> : <Box size={16} />}
            {uploadedImage?.name || 'Add Image / GLB'}
          </button>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept={uploadAccept}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              onUploadImage(file)
              event.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="panel compare-panel">
        <header className="panel-title">
          <span>Compare Cells</span>
          <small>2</small>
        </header>
        <button type="button" className="compare-box" onClick={() => onCompare(compareTarget.id)}>
          <CellThumb cell={selected} selected />
          <div>
            <strong>{selected.name.replace(' Cell', '')}</strong>
            <small>{selected.type}</small>
          </div>
          <span className="versus">VS</span>
          <CellThumb cell={compareTarget} />
          <div>
            <strong>{compareTarget.name}</strong>
            <small>{compareTarget.type.replace('Human ', '')}</small>
          </div>
        </button>
      </div>
    </section>
  )
}

function StudioHeader({ activePanel, setActivePanel, onNotify }) {
  function openPanel(panel) {
    const next = activePanel === panel ? null : panel
    setActivePanel(next)
    onNotify(next ? `${panel} opened` : `${panel} closed`)
  }

  return (
    <header className="studio-header">
      <div className="studio-brand">
        <div className="brand-mark">
          <CellThumb cell={CELL_TYPES[1]} selected />
        </div>
        <div>
          <strong>Cell Architecture Studio</strong>
          <span>Explore life at the microscopic level</span>
        </div>
      </div>
      <nav className="studio-nav">
        <button type="button" className={activePanel === 'Gallery' ? 'active' : ''} onClick={() => openPanel('Gallery')}>
          <Grid3X3 size={15} />
          Gallery
        </button>
        <button type="button" className={activePanel === 'Library' ? 'active' : ''} onClick={() => openPanel('Library')}>
          <Library size={15} />
          Library
        </button>
        <button type="button" className={activePanel === 'Notebooks' ? 'active' : ''} onClick={() => openPanel('Notebooks')}>
          <BookOpen size={15} />
          Notebooks
        </button>
        <button type="button" className={activePanel === 'Settings' ? 'active' : ''} onClick={() => openPanel('Settings')}>
          <Settings size={15} />
          Settings
        </button>
      </nav>
      <button type="button" className={activePanel === 'Profile' ? 'profile-button active' : 'profile-button'} onClick={() => openPanel('Profile')}>
        <Dna size={18} />
        <ChevronDown size={13} />
      </button>
    </header>
  )
}

function WorkspaceDrawer({
  activePanel,
  selectedCell,
  selectedOrganelle,
  compareCell,
  allCells = CELL_TYPES,
  galleryItems,
  notes,
  settings,
  labelVisible,
  crossSection,
  selectedMicroscope,
  uploadedImage,
  favoriteKey,
  onClose,
  onSelectCell,
  onSelectOrganelle,
  onSetCompareCell,
  onSaveGallery,
  onClearGallery,
  onUpdateNote,
  onUpdateSettings,
  onSetLabelVisible,
  onSetCrossSection,
  onExport,
  onNotify,
}) {
  if (!activePanel) return null

  const cell = getCell(selectedCell)
  const compare = getCell(compareCell)
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle)
  const profile = getCellProfile(selectedCell)
  const noteKey = `${selectedCell}:${selectedOrganelle}`
  const noteValue = notes[noteKey] ?? ''
  const savedFavorite = favoriteKey ? favoriteKey.replace(':', ' / ') : 'None'

  function renderContent() {
    if (activePanel === 'Gallery') {
      return (
        <div className="drawer-content">
          <div className="gallery-hero">
            <CellThumb cell={cell} selected />
            <div>
              <strong>{cell.name}</strong>
              <span>{detail.title} · {selectedMicroscope}</span>
            </div>
          </div>
          <div className="drawer-actions">
            <button type="button" className="drawer-primary" onClick={onSaveGallery}>Save View</button>
            <button type="button" className="drawer-secondary" onClick={onExport}>Export GLB</button>
          </div>
          {uploadedImage && (
            <div className="uploaded-tile" style={{ '--upload-preview': `url(${uploadedImage.url})` }}>
              <span />
              <div>
                <strong>{uploadedImage.name}</strong>
                <small>Attached microscope reference</small>
              </div>
            </div>
          )}
          <div className="drawer-list">
            {galleryItems.length === 0 ? (
              <p className="empty-state">No saved views yet.</p>
            ) : (
              galleryItems.map((item) => {
                const itemCell = getCell(item.cellId)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="drawer-row"
                    onClick={() => {
                      onSelectCell(item.cellId)
                      onSelectOrganelle(item.organelleId)
                      onNotify('Saved view restored')
                    }}
                  >
                    <CellThumb cell={itemCell} selected={item.cellId === selectedCell} />
                    <span>
                      <strong>{itemCell.name}</strong>
                      <small>{getOrganelleDetail(item.cellId, item.organelleId).title} · {item.microscope}</small>
                    </span>
                  </button>
                )
              })
            )}
          </div>
          {galleryItems.length > 0 && <button type="button" className="drawer-secondary full" onClick={onClearGallery}>Clear Gallery</button>}
        </div>
      )
    }

    if (activePanel === 'Library') {
      return (
        <div className="drawer-content">
          <p className="drawer-copy">{profile.summary}</p>
          <div className="reference-section">
            <strong>Khronos Reference Models</strong>
            <span>Auxiliary GLB/PBR samples for material and loader checks.</span>
            <div className="reference-grid">
              {KHRONOS_REFERENCE_CELLS.map((reference) => (
                <button
                  key={reference.id}
                  type="button"
                  className={selectedCell === reference.id ? 'reference-card active' : 'reference-card'}
                  onClick={() => {
                    onSelectCell(reference.id)
                    onNotify(`${reference.name} reference loaded`)
                  }}
                >
                  <CellThumb cell={reference} selected={selectedCell === reference.id} />
                  <span>
                    <strong>{reference.name}</strong>
                    <small>{reference.referenceLicense}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="library-grid">
            {getAvailableOrganelleIds(selectedCell).map((id) => {
              const item = getOrganelleDetail(selectedCell, id)
              return (
                <button
                  key={id}
                  type="button"
                  className={selectedOrganelle === id ? 'library-card active' : 'library-card'}
                  onClick={() => {
                    onSelectOrganelle(id)
                    onNotify(`${item.title} selected`)
                  }}
                >
                  <span style={{ background: item.accent }} />
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (activePanel === 'Notebooks') {
      return (
        <div className="drawer-content">
          <label className="note-editor">
            <span>{cell.name} / {detail.title}</span>
            <textarea
              value={noteValue}
              onChange={(event) => onUpdateNote(noteKey, event.target.value)}
              placeholder="Record observations, questions, or narration notes..."
            />
          </label>
          <div className="drawer-meta inline">
            <span>{noteValue.length} chars</span>
            <span>Autosaved locally</span>
            <span>{Object.keys(notes).length} notes</span>
          </div>
        </div>
      )
    }

    if (activePanel === 'Settings') {
      return (
        <div className="drawer-content settings-list">
          <label className="settings-row">
            <span>
              <strong>Organelle Labels</strong>
              <small>Show the floating label on the stage.</small>
            </span>
            <input type="checkbox" checked={labelVisible} onChange={(event) => onSetLabelVisible(event.target.checked)} />
          </label>
          <label className="settings-row">
            <span>
              <strong>Cross-Section</strong>
              <small>Keep the cutaway view enabled.</small>
            </span>
            <input type="checkbox" checked={crossSection} onChange={(event) => onSetCrossSection(event.target.checked)} />
          </label>
          <div className="settings-row">
            <span>
              <strong>Render Quality</strong>
              <small>Balanced is faster; high uses denser DPR.</small>
            </span>
            <div className="segmented">
              {['balanced', 'high'].map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={settings.quality === quality ? 'active' : ''}
                  onClick={() => onUpdateSettings({ ...settings, quality })}
                >
                  {quality}
                </button>
              ))}
            </div>
          </div>
          <label className="settings-row">
            <span>
              <strong>Compact UI</strong>
              <small>Slightly tighter panels for smaller screens.</small>
            </span>
            <input type="checkbox" checked={settings.compactUi} onChange={(event) => onUpdateSettings({ ...settings, compactUi: event.target.checked })} />
          </label>
        </div>
      )
    }

    if (activePanel === 'Compare') {
      return (
        <div className="drawer-content">
          <div className="compare-drawer-grid">
            {[cell, compare].map((item) => {
              const itemProfile = getCellProfile(item.id)
              return (
                <div key={item.id} className="compare-card">
                  <CellThumb cell={item} selected={item.id === selectedCell} />
                  <strong>{item.name}</strong>
                  <small>{itemProfile.summary}</small>
                </div>
              )
            })}
          </div>
          <p className="drawer-copy">{profile.comparison}</p>
          <div className="cell-chip-grid">
            {allCells.filter((item) => item.id !== selectedCell).map((item) => (
              <button key={item.id} type="button" className={item.id === compareCell ? 'active' : ''} onClick={() => onSetCompareCell(item.id)}>
                {item.name.replace(' Cell', '')}
              </button>
            ))}
          </div>
          <div className="drawer-actions">
            <button type="button" className="drawer-primary" onClick={() => onSelectCell(compareCell)}>Open Compared Cell</button>
            <button type="button" className="drawer-secondary" onClick={() => onSetCompareCell(profile.compareTarget)}>Reset Target</button>
          </div>
        </div>
      )
    }

    return (
      <div className="drawer-content">
        <div className="profile-stats">
          <span><strong>{allCells.length}</strong><small>cells</small></span>
          <span><strong>{galleryItems.length}</strong><small>saved</small></span>
          <span><strong>{Object.keys(notes).length}</strong><small>notes</small></span>
        </div>
        <p className="drawer-copy">Favorite: {savedFavorite}</p>
        <p className="drawer-copy">Occurs: {profile.occurs}</p>
      </div>
    )
  }

  return (
    <motion.section className="workspace-drawer" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <header>
        <div>
          <strong>{activePanel}</strong>
          <span>{WORKSPACE_PANELS[activePanel]}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel">
          <X size={15} />
        </button>
      </header>
      <div className="drawer-meta">
        <span>{cell.name}</span>
        <span>{detail.title}</span>
        <span>Cross-section ready</span>
      </div>
      {renderContent()}
    </motion.section>
  )
}

function StatusToast({ message }) {
  return (
    <div className="status-toast">
      <span />
      {message}
    </div>
  )
}

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
    setSelectedOrganelle(getDefaultOrganelle('plant'))
    setCompareCell(getCellProfile('plant').compareTarget)
    setToast('Saved custom cell was missing; Plant Cell loaded')
  }, [allCells, selectedCell])

  useEffect(() => {
    const available = getAvailableOrganelleIds(selectedCell)
    if (available.includes(selectedOrganelle)) return
    setSelectedOrganelle(getDefaultOrganelle(selectedCell))
  }, [customCells, selectedCell, selectedOrganelle])

  function handleSelectCell(cellId) {
    const nextCell = getCell(cellId, customCells)
    setSelectedCell(cellId)
    setSelectedOrganelle(getDefaultOrganelle(cellId))
    setCompareCell((current) => (current === cellId ? getCellProfile(cellId).compareTarget : current))
    if (nextCell.custom) setUploadedImage({ name: nextCell.name, url: nextCell.imageUrl || '' })
    setToast(`${nextCell.name} loaded`)
  }

  async function handleExport() {
    const cell = getCell(selectedCell, customCells)
    const detail = getOrganelleDetail(selectedCell, selectedOrganelle)

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
    setSelectedOrganelle(getDefaultOrganelle(cell.id))
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
      setSelectedOrganelle(getDefaultOrganelle(customCell.id))
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
      setSelectedOrganelle(getDefaultOrganelle(customCell.id))
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
            setToast(`${getCell(cellId).name} set as comparison target`)
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
            onCompare={handleOpenCompare}
            onNotify={setToast}
          />
        </div>
      </motion.div>
    </main>
  )
}

export default App
