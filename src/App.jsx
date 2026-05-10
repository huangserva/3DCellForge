import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Line, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei'
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
  { id: 'plant', name: '植物细胞', type: '真核细胞', accent: '#82b366' },
  { id: 'white-blood', name: '白细胞', type: '免疫细胞', accent: '#7e6edb' },
  { id: 'neuron', name: '神经元', type: '神经细胞', accent: '#8b5cf6' },
  { id: 'epithelial', name: '上皮细胞', type: '人体组织细胞', accent: '#e07a7a' },
  { id: 'bacteria', name: '细菌细胞', type: '原核细胞', accent: '#5fbf9f' },
  { id: 'animal', name: '动物细胞', type: '真核细胞', accent: '#459ccf' },
  { id: 'muscle', name: '肌肉细胞', type: '肌肉纤维', accent: '#d25762' },
]

const SEEDED_GENERATED_CELLS = [
  {
    id: 'tripo-epithelial-test',
    name: 'Tripo 上皮细胞测试模型',
    type: 'AI 生成上皮细胞',
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
      message: '已缓存通过验证的 Tripo 上皮细胞测试 GLB。',
    },
  },
  {
    id: 'tripo-plant-test',
    name: 'Tripo 植物细胞测试模型',
    type: 'AI 生成植物细胞',
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
      message: '已缓存通过验证的 Tripo 测试 GLB。',
    },
  },
]

const ORGANELLES = {
  nucleus: {
    label: '细胞核',
    title: '细胞核',
    subtitle: '遗传控制区域',
    size: '约 6-10 um',
    location: '细胞质中央',
    visible: '是，染色后呈紫色',
    note: '白细胞通过分叶状细胞核穿过狭窄组织空间，同时协调免疫响应相关基因。',
    accent: '#7b4bb4',
  },
  lysosome: {
    label: '溶酶体',
    title: '溶酶体',
    subtitle: '细胞内清理结构',
    size: '约 1-2 um',
    location: '血液、淋巴和组织',
    visible: '是，染色后更明显',
    note: '溶酶体含有可分解捕获物质和受损细胞组件的酶。',
    accent: '#8d58b8',
  },
  mitochondria: {
    label: '线粒体',
    title: '线粒体',
    subtitle: 'ATP 生成位置',
    size: '约 0.5-1 um',
    location: '细胞质',
    visible: '常需荧光染料辅助观察',
    note: '免疫细胞在激活、迁移和响应感染时会调整线粒体活性。',
    accent: '#df7046',
  },
  membrane: {
    label: '细胞膜',
    title: '细胞膜',
    subtitle: '选择性外边界',
    size: '约 7-10 nm',
    location: '细胞外围',
    visible: '可间接观察',
    note: '细胞膜接收免疫信号，并帮助细胞挤过组织屏障。',
    accent: '#7aa4bf',
  },
  granules: {
    label: '分泌颗粒',
    title: '分泌颗粒',
    subtitle: '免疫响应颗粒',
    size: '约 0.1-1 um',
    location: '细胞质',
    visible: '是，表现为彩色点状结构',
    note: '颗粒储存免疫防御过程中释放的蛋白质和信号分子。',
    accent: '#5b82c4',
  },
}

const ORGANELLE_ORDER = ['nucleus', 'lysosome', 'mitochondria', 'membrane', 'granules']

const MICROSCOPE_IMAGES = [
  { label: '光学显微镜', tone: 'light', note: '明场纹理与组织环境参考。' },
  { label: '染色视图', tone: 'purple', note: '增强对比的细胞器染色参考。' },
  { label: '电子显微镜', tone: 'mono', note: '高细节灰度表面扫描参考。' },
]

const WORKSPACE_PANELS = {
  Gallery: '已保存的渲染角度、显微快照和导出记录。',
  Library: '细胞壁、细胞膜、细胞核、溶酶体和线粒体等参考结构。',
  Notebooks: '与当前细胞和细胞器关联的观察笔记。',
  Settings: '查看器质量、标签、剖面视图和导出偏好。',
  Compare: '并排对比细胞结构与生物学角色。',
  Profile: '当前项目：AI 3D 模型工坊中文体验版。',
}

const PANEL_LABELS = {
  Gallery: '图库',
  Library: '结构库',
  Notebooks: '观察笔记',
  Settings: '设置',
  Compare: '对比',
  Profile: '当前项目',
}

const CELL_PROMPT_NAMES = {
  plant: 'Plant Cell',
  'white-blood': 'White Blood Cell',
  neuron: 'Neuron',
  epithelial: 'Epithelial Cell',
  bacteria: 'Bacteria Cell',
  animal: 'Animal Cell',
  muscle: 'Muscle Cell',
}

const CELL_PROFILES = {
  plant: {
    summary: '具有坚硬细胞壁、大液泡、类叶绿体结构、高尔基体堆叠和清晰细胞核。',
    occurs: '叶、茎、根和光合作用组织。',
    comparison: '植物细胞具有坚硬细胞壁和类叶绿体结构，动物细胞没有这些特征。',
    compareTarget: 'animal',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
  'white-blood': {
    summary: '柔软的免疫细胞，具有分叶状细胞核、较多溶酶体、颗粒和可变形细胞膜。',
    occurs: '血液、淋巴和炎症组织。',
    comparison: '相比上皮细胞，白细胞更易移动且颗粒更多，适合免疫响应。',
    compareTarget: 'epithelial',
    organelles: ['lysosome', 'nucleus', 'mitochondria', 'membrane', 'granules'],
  },
  neuron: {
    summary: '紧凑胞体带有树突和轴突样延伸结构，用于传递信号。',
    occurs: '大脑、脊髓和周围神经。',
    comparison: '神经元以长距离膜延伸结构为主要形态，多数其他细胞更紧凑。',
    compareTarget: 'muscle',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
  epithelial: {
    summary: '片状组织细胞，带有顶端脊线、连接提示、膜边界和细胞核。',
    occurs: '皮肤、导管、器官内衬和保护性表面。',
    comparison: '上皮细胞用于形成屏障组织，不同于可自由移动的白细胞。',
    compareTarget: 'white-blood',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
  bacteria: {
    summary: '原核胶囊样结构，包含拟核 DNA、核糖体点、菌毛和鞭毛提示。',
    occurs: '土壤、水、肠道菌群、皮肤以及多种环境表面。',
    comparison: '没有细胞核和膜包裹细胞器，DNA 位于拟核区域。',
    compareTarget: 'animal',
    organelles: ['membrane', 'granules'],
  },
  animal: {
    summary: '柔性的真核细胞，包含细胞核、线粒体、囊泡和柔软细胞膜。',
    occurs: '器官、结缔组织、血液相关组织和培养样本。',
    comparison: '动物细胞没有植物细胞展示的坚硬细胞壁。',
    compareTarget: 'plant',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'lysosome', 'granules'],
  },
  muscle: {
    summary: '细长纤维状细胞，带有横纹提示和用于收缩的更多线粒体。',
    occurs: '骨骼肌、心肌组织和收缩性组织样本。',
    comparison: '相比圆形动物细胞，肌肉细胞更细长且能量需求更高。',
    compareTarget: 'neuron',
    organelles: ['membrane', 'nucleus', 'mitochondria', 'granules'],
  },
}

const SETTINGS_STORAGE_KEY = 'bio-demo-settings'
const SETTINGS_STORAGE_VERSION = 2
const DEFAULT_SETTINGS = {
  quality: 'balanced',
  compactUi: false,
  generationProvider: 'tripo',
  settingsVersion: SETTINGS_STORAGE_VERSION,
}

const CUSTOM_CELL_STORAGE_KEY = 'bio-demo-custom-cells'
const MODEL_API_BASE = import.meta.env.VITE_MODEL_API_BASE || import.meta.env.VITE_TRIPO_API_BASE || 'http://127.0.0.1:8787'
const GENERATION_POLL_INTERVAL_MS = 3500
const GENERATION_TIMEOUT_MS = 8 * 60 * 1000
const GENERATION_PROVIDER_OPTIONS = [
  { id: 'auto', label: '自动', description: '优先使用 Tripo，失败后尝试 Hunyuan。' },
  { id: 'tripo', label: 'Tripo', description: '云端生成。' },
  { id: 'hunyuan', label: 'Hunyuan', description: '本地 Hunyuan3D 服务。' },
]
const GENERATION_PROVIDER_IDS = new Set(GENERATION_PROVIDER_OPTIONS.map((provider) => provider.id))

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
      subtitle: '细胞指挥中心',
      size: '直径 5-10 um',
      location: '通常位于中央',
      visible: '是',
      note: '细胞核被称为核膜的双层膜包围，核膜上的孔道调控分子进出。',
      funFact: '细胞核是最早被发现的细胞结构之一。',
    },
    membrane: {
      title: '细胞壁',
      subtitle: '坚硬外部支撑',
      size: '厚约 0.1-10 um',
      location: '外部边界',
      visible: '是',
      note: '植物细胞在细胞膜外侧有坚硬细胞壁，可维持形状并抵抗大型中央液泡带来的压力。',
      funFact: '纤维素纤维让植物细胞壁兼具强度和柔韧性。',
    },
    mitochondria: {
      note: '线粒体将储存的糖转化为可用能量，用于植物细胞的生长、修复和胞内运输。',
      funFact: '植物细胞同时具有线粒体和叶绿体。',
    },
    granules: {
      title: '高尔基体',
      subtitle: '包装与运输',
      note: '高尔基体会修饰、分拣并包装蛋白质和脂质，再将其送往下一目的地。',
      funFact: '在许多教学渲染中，高尔基体堆叠看起来像折叠的丝带。',
    },
  },
  'white-blood': {
    lysosome: {
      note: '白细胞含有较多溶酶体，因为它们需要在免疫响应中消化捕获颗粒和受损物质。',
      funFact: '这里强化了成簇紫色颗粒，方便旋转观察时保持可读性。',
    },
    nucleus: {
      note: '分叶状细胞核是许多免疫细胞的重要视觉特征，也帮助细胞变形并穿过狭窄组织间隙。',
    },
  },
  neuron: {
    membrane: {
      title: '轴突与树突',
      subtitle: '信号传导分支',
      location: '从胞体向外延伸',
      note: '神经元依靠较长的膜延伸结构在远距离接收和传递电信号。',
      funFact: '对神经元而言，分支结构在视觉识别上比完全球形胞体更重要。',
    },
  },
  epithelial: {
    membrane: {
      title: '顶端表面',
      subtitle: '屏障与接触层',
      location: '面向组织表面的一侧',
      note: '上皮细胞形成片层结构。表面脊线和连接线让这种组织架构更直观。',
    },
  },
  bacteria: {
    granules: {
      title: '拟核与核糖体',
      subtitle: '原核核心物质',
      size: '无膜包裹',
      location: '中央细胞质',
      note: '细菌没有细胞核。蓝色 DNA 线圈和小型核糖体点代表原核细胞内部结构。',
      funFact: '鞭毛和菌毛在 3D 查看器中被适度夸张，以便更容易识别。',
    },
  },
  animal: {
    nucleus: {
      note: '动物细胞展示为柔软细胞膜、中央细胞核、线粒体和运输结构组合，没有坚硬细胞壁。',
    },
  },
  muscle: {
    mitochondria: {
      note: '肌肉纤维含有许多线粒体，因为收缩需要持续 ATP 供应。',
      funFact: '条纹图案是简化的肌节提示，并非严格分子模型。',
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

function getAllCells(customCells = getStoredCustomCells()) {
  const activeCustomCells = customCells.filter((cell) => cell.generation?.status !== 'failed')
  const failedCustomCells = customCells.filter((cell) => cell.generation?.status === 'failed')

  return [...activeCustomCells, ...SEEDED_GENERATED_CELLS, ...failedCustomCells, ...CELL_TYPES]
}

function getCell(cellId, customCells = getStoredCustomCells()) {
  return getAllCells(customCells).find((cell) => cell.id === cellId) ?? CELL_TYPES[1]
}

function getCustomCell(cellId, customCells = getStoredCustomCells()) {
  return [...customCells, ...SEEDED_GENERATED_CELLS].find((cell) => cell.id === cellId)
}

function getModelCellId(cellId, customCells = getStoredCustomCells()) {
  return getCustomCell(cellId, customCells)?.template ?? cellId
}

function getCellProfile(cellId, customCells = getStoredCustomCells()) {
  const customCell = getCustomCell(cellId, customCells)
  if (customCell) {
    const baseProfile = CELL_PROFILES[customCell.template] ?? CELL_PROFILES.animal
    const hasGeneratedModel = Boolean(customCell.generation?.modelUrl)
    return {
      ...baseProfile,
      summary: hasGeneratedModel
        ? `基于上传图片生成的 AI GLB 模型，参考${getCell(customCell.template).name}的生物学结构。`
        : `上传图片已进入图像转 3D 队列；生成前使用${getCell(customCell.template).name}作为备用结构。`,
      comparison: hasGeneratedModel
        ? '该自定义样本已作为真实生成的 GLB 加载到 WebGL 查看器中。'
        : `生成进行中时，该自定义样本会使用${getCell(customCell.template).name}备用结构。`,
      occurs: '用户上传的自定义显微参考。',
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

  if (stored.settingsVersion !== SETTINGS_STORAGE_VERSION) {
    next.generationProvider = DEFAULT_SETTINGS.generationProvider
  }

  if (!GENERATION_PROVIDER_IDS.has(next.generationProvider)) {
    next.generationProvider = DEFAULT_SETTINGS.generationProvider
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

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function readApiResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `请求失败，状态码 ${response.status}`)
  }
  return payload
}

function getProviderPlan(provider) {
  return provider === 'auto' ? ['tripo', 'hunyuan'] : [provider || 'tripo']
}

function getProviderLabel(provider) {
  if (provider === 'local') return '本地'
  return GENERATION_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label ?? 'Tripo'
}

function getViewModeLabel(mode) {
  const labels = {
    solid: '实体',
    layers: '分层',
    focus: '聚焦',
  }
  return labels[mode] ?? mode
}

function getGenerationStatusLabel(status) {
  const labels = {
    uploading: '上传中',
    processing: '处理中',
    queued: '排队中',
    success: '成功',
    failed: '失败',
    pending: '等待中',
    local: '本地',
  }
  return labels[status] ?? status
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
      if (!status.modelUrl) throw new Error(`${getProviderLabel(provider)}已完成，但没有返回 GLB 模型地址。`)
      return status
    }

    if (['failed', 'error', 'cancelled', 'canceled'].includes(String(status.status).toLowerCase())) {
      throw new Error(status.error || `${getProviderLabel(provider)}生成失败。`)
    }
  }

  throw new Error(`${getProviderLabel(provider)}生成超时。`)
}

function getGenerationPrompt(cell) {
  const base = getCell(cell.template)
  const promptName = CELL_PROMPT_NAMES[cell.template] ?? base.name
  return [
    `A high quality educational 3D biological model of a ${promptName}.`,
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
  const name = cleanFileName(fileName) || '上传细胞'
  const provider = options.provider || 'tripo'

  return {
    id: `custom-${Date.now()}`,
    name: name.length > 20 ? `${name.slice(0, 20)}...` : name,
    type: options.type || `上传的${base.name}`,
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
      message: options.message || '等待图像转 3D 生成。',
    },
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
      <div className="cell-fallback upload-render-fallback" aria-label="上传细胞图片备用视图">
        <img src={referenceImageUrl} alt="上传的细胞参考图" />
      </div>
    )
  }

  if (visualCellId === 'plant') {
    return (
      <div className="cell-fallback plant-render-fallback" aria-label="植物细胞图片备用视图">
        <img src={plantCellRender} alt="植物细胞详细备用渲染图" />
      </div>
    )
  }

  return (
    <div className="cell-fallback" aria-label="细胞示意备用视图">
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
  const cells = getAllCells(customCells)
  const availableOrganelles = getAvailableOrganelleIds(selectedCell)

  return (
    <aside className="left-rail">
      <section className="panel cell-types-panel">
        <header className="panel-title">
          <span>
            <SparklesIcon size={14} />
            细胞类型
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
            细胞器
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
    { id: 'solid', icon: Box, label: '实体' },
    { id: 'layers', icon: Layers3, label: '分层' },
    { id: 'focus', icon: CircleDot, label: '聚焦' },
  ]

  return (
    <div className="viewer-controls">
      <span>视图模式</span>
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
        <span>剖面视图</span>
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
  const cell = getCell(selectedCell, customCells)
  const modelCellId = cell.custom ? cell.template : selectedCell
  const referenceImageUrl = cell.custom ? cell.imageUrl : ''
  const generatedModelUrl = getGeneratedModelUrl(cell)
  const generation = cell.custom ? cell.generation : null
  const generationProviderLabel = getProviderLabel(generation?.provider)
  const generationFailureTitle = generation?.requestedProvider === 'auto' ? '3D 生成失败' : `${generationProviderLabel}生成失败`
  const detail = getOrganelleDetail(selectedCell, selectedOrganelle)
  const webglAvailable = canUseWebGL()
  const generationPending = cell.custom && !generatedModelUrl && generation?.status && !['failed', 'local'].includes(generation.status)
  const generationFailed = cell.custom && !generatedModelUrl && generation?.status === 'failed'

  function handleRotate() {
    const next = !autoRotate
    setAutoRotate(next)
    onNotify(next ? '自动旋转已开启' : '自动旋转已暂停')
  }

  function handleIsolate() {
    const next = !isIsolated
    setIsIsolated(next)
    if (next) setViewMode('focus')
    onNotify(next ? `${detail.title}聚焦模式` : '聚焦模式已关闭')
  }

  function handleHideOthers() {
    const next = !hideOthers
    setHideOthers(next)
    onNotify(next ? `仅突出${detail.title}和细胞外壳` : '已显示全部结构')
  }

  function handleResetView() {
    setAutoRotate(false)
    setIsIsolated(false)
    setHideOthers(false)
    setProofMode(false)
    setViewMode('layers')
    setResetNonce((value) => value + 1)
    onNotify('视图已重置')
  }

  function handleProofMode() {
    const next = !proofMode
    setProofMode(next)
    if (next) {
      setViewMode('focus')
      setHideOthers(false)
      setAutoRotate(true)
    }
    onNotify(next ? '3D 验证模式：坐标轴、网格、分解结构' : '3D 验证模式已关闭')
  }

  function handleScreenshot() {
    const ok = downloadCanvasImage(`${selectedCell}-${selectedOrganelle}.png`)
    setCapturePulse(true)
    window.setTimeout(() => setCapturePulse(false), 280)
    onNotify(ok ? '截图已下载' : '当前浏览器无法截图')
  }

  return (
    <section className="stage-panel">
      <div className="stage-title">
        <div>
          <h1>{cell.name}</h1>
          <p>{cell.type}</p>
        </div>
      </div>
      <ViewerControls crossSection={crossSection} setCrossSection={setCrossSection} viewMode={viewMode} setViewMode={setViewMode} />
      <div className={`cell-viewer ${viewMode} ${isIsolated ? 'is-isolated' : ''}`}>
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
      </div>
      {referenceImageUrl && (
        <div className="custom-reference-layer">
          <img src={referenceImageUrl} alt={`${cell.name}上传参考图`} />
          <span>{generatedModelUrl ? `用于${generationProviderLabel} 3D 生成的源图片` : `${generationProviderLabel}生成使用的源图片`}</span>
        </div>
      )}
      {generationPending && (
        <div className="generation-overlay">
          <strong>{generation.status === 'uploading' ? `正在上传到${generationProviderLabel}` : `正在使用${generationProviderLabel}生成`}</strong>
          <span>{generation.message || '等待 AI 生成 GLB...'}</span>
          <div className="generation-meter">
            <i />
          </div>
        </div>
      )}
      {generationFailed && (
        <div className="generation-overlay failed">
          <strong>{generationFailureTitle}</strong>
          <span>{generation.message || '已保存的上传任务在返回 GLB 前失败。'}</span>
          <button type="button" onClick={() => onRetryGeneration?.(cell.id)}>重试生成</button>
        </div>
      )}
      <button type="button" className={proofMode ? 'proof-launcher active' : 'proof-launcher'} onClick={handleProofMode} aria-pressed={proofMode}>
        <Box size={15} />
        3D 验证
      </button>
      {proofMode && (
        <div className="proof-badge">
          <strong>实时 WebGL 3D</strong>
          <span>{generatedModelUrl ? `${generationProviderLabel} GLB · 轨道控制 · GLB 导出` : referenceImageUrl ? `${generationProviderLabel}任务等待中 · 备用 3D 结构` : '分解结构 · XYZ 坐标轴 · GLB 导出'}</span>
        </div>
      )}
      {labelVisible && (
        <button type="button" className="stage-label" style={{ '--label-color': detail.accent }} onClick={() => setSelectedOrganelle(selectedOrganelle)}>
          <span />
          {detail.title}
        </button>
      )}
      <div className="stage-status">
        {generatedModelUrl ? `${generationProviderLabel} GLB 已加载` : generationFailed ? `${generationProviderLabel}失败；显示源图片` : referenceImageUrl ? `${generationProviderLabel} ${getGenerationStatusLabel(generation?.status || 'pending')}` : webglAvailable ? 'WebGL 实时 3D' : '备用图片'} · {autoRotate || proofMode ? '自动旋转' : '拖动旋转 / 滚轮缩放'} · {getViewModeLabel(viewMode)}
      </div>
      {capturePulse && <div className="capture-pulse" />}
      <div className="stage-toolbar">
        <button type="button" className={autoRotate ? 'active' : ''} onClick={handleRotate} aria-pressed={autoRotate}>
          <Move3D size={14} />
          旋转
        </button>
        <button type="button" className={isIsolated ? 'active' : ''} onClick={handleIsolate} aria-pressed={isIsolated}>
          <Eye size={14} />
          聚焦
        </button>
        <button type="button" className={hideOthers ? 'active' : ''} onClick={handleHideOthers} aria-pressed={hideOthers}>
          <Layers3 size={14} />
          隐藏其他
        </button>
        <button type="button" onClick={handleResetView}>
          <RotateCcw size={14} />
          重置视图
        </button>
        <button type="button" className={proofMode ? 'active proof-active' : ''} onClick={handleProofMode} aria-pressed={proofMode}>
          <Box size={14} />
          3D 验证
        </button>
        <span />
        <button type="button" onClick={handleScreenshot}>
          <Camera size={14} />
          截图
        </button>
        <button type="button" onClick={onExport}>
          <Upload size={14} />
          导出 GLB
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
    onNotify(isFavorite ? `已从收藏移除${detail.title}` : `已收藏${detail.title}`)
  }

  function toggleLabel() {
    const next = !labelVisible
    setLabelVisible(next)
    onNotify(next ? '舞台标签已显示' : '舞台标签已隐藏')
  }

  return (
    <aside className="right-rail">
      <section className="panel detail-panel">
        <header className="detail-title">
          <span>细胞器详情</span>
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
            <dt>尺寸</dt>
            <dd>{detail.size}</dd>
          </div>
          <div>
            <dt>位置</dt>
            <dd>{detail.location}</dd>
          </div>
          <div>
            <dt>光镜可见</dt>
            <dd>{detail.visible}</dd>
          </div>
          <div>
            <dt>标签</dt>
            <dd>
              <button type="button" className={labelVisible ? 'mini-toggle active' : 'mini-toggle'} onClick={toggleLabel} aria-pressed={labelVisible} aria-label="切换标签" />
              <span className="color-dot" style={{ background: detail.accent }} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel notes-panel">
        <header className="panel-title">
          <span>生物学笔记</span>
        </header>
        <p>{detail.note}</p>
        <blockquote>{detail.funFact ?? '部分白细胞可以改变形状，挤过血管壁并到达感染组织。'}</blockquote>
      </section>

      <section className="panel occurs-panel">
        <header className="panel-title">
          <span>常见位置</span>
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

function BottomDeck({ selectedCell, selectedMicroscope, setSelectedMicroscope, uploadedImage, compareCell, onUploadImage, onCompare, onNotify }) {
  const fileInputRef = useRef(null)
  const selected = getCell(selectedCell)
  const compareTarget = getCell(compareCell)

  function handleMicroscopeSelect(item) {
    setSelectedMicroscope(item.label)
    onNotify(item.note)
  }

  return (
    <section className="bottom-deck">
      <div className="panel media-panel">
        <header className="panel-title">
          <span>显微视图</span>
          <small>3</small>
        </header>
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
            {uploadedImage?.name || '添加图片 / GLB'}
          </button>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*,.glb,.gltf,model/gltf-binary,model/gltf+json"
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
          <span>细胞对比</span>
          <small>2</small>
        </header>
        <button type="button" className="compare-box" onClick={() => onCompare(compareTarget.id)}>
          <CellThumb cell={selected} selected />
          <div>
            <strong>{selected.name.replace(' Cell', '')}</strong>
            <small>{selected.type}</small>
          </div>
          <span className="versus">对比</span>
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
    onNotify(next ? `${PANEL_LABELS[panel]}已打开` : `${PANEL_LABELS[panel]}已关闭`)
  }

  return (
    <header className="studio-header">
      <div className="studio-brand">
        <div className="brand-mark">
          <CellThumb cell={CELL_TYPES[1]} selected />
        </div>
        <div>
          <strong>AI 3D 模型工坊</strong>
          <span>一个用于查看、上传、截图和导出 3D 模型的中文体验版工具。</span>
        </div>
      </div>
      <nav className="studio-nav">
        <button type="button" className={activePanel === 'Gallery' ? 'active' : ''} onClick={() => openPanel('Gallery')}>
          <Grid3X3 size={15} />
          图库
        </button>
        <button type="button" className={activePanel === 'Library' ? 'active' : ''} onClick={() => openPanel('Library')}>
          <Library size={15} />
          结构库
        </button>
        <button type="button" className={activePanel === 'Notebooks' ? 'active' : ''} onClick={() => openPanel('Notebooks')}>
          <BookOpen size={15} />
          观察笔记
        </button>
        <button type="button" className={activePanel === 'Settings' ? 'active' : ''} onClick={() => openPanel('Settings')}>
          <Settings size={15} />
          设置
        </button>
      </nav>
      <button type="button" className={activePanel === 'Profile' ? 'profile-button active' : 'profile-button'} onClick={() => openPanel('Profile')}>
        <Dna size={18} />
        <span>当前项目</span>
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
  const savedFavorite = favoriteKey ? favoriteKey.replace(':', ' / ') : '无'

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
            <button type="button" className="drawer-primary" onClick={onSaveGallery}>保存视图</button>
            <button type="button" className="drawer-secondary" onClick={onExport}>导出 GLB</button>
          </div>
          {uploadedImage && (
            <div className="uploaded-tile" style={{ '--upload-preview': `url(${uploadedImage.url})` }}>
              <span />
              <div>
                <strong>{uploadedImage.name}</strong>
                <small>已附加显微参考图</small>
              </div>
            </div>
          )}
          <div className="drawer-list">
            {galleryItems.length === 0 ? (
              <p className="empty-state">还没有保存的视图。</p>
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
                      onNotify('已恢复保存的视图')
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
          {galleryItems.length > 0 && <button type="button" className="drawer-secondary full" onClick={onClearGallery}>清空图库</button>}
        </div>
      )
    }

    if (activePanel === 'Library') {
      return (
        <div className="drawer-content">
          <p className="drawer-copy">{profile.summary}</p>
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
                    onNotify(`已选择${item.title}`)
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
              placeholder="记录观察、问题或讲解备注..."
            />
          </label>
          <div className="drawer-meta inline">
            <span>{noteValue.length} 字</span>
            <span>已自动保存到本地</span>
            <span>{Object.keys(notes).length} 条笔记</span>
          </div>
        </div>
      )
    }

    if (activePanel === 'Settings') {
      return (
        <div className="drawer-content settings-list">
          <label className="settings-row">
            <span>
              <strong>细胞器标签</strong>
              <small>在舞台上显示悬浮标签。</small>
            </span>
            <input type="checkbox" checked={labelVisible} onChange={(event) => onSetLabelVisible(event.target.checked)} />
          </label>
          <label className="settings-row">
            <span>
              <strong>剖面视图</strong>
              <small>保持切面观察视图开启。</small>
            </span>
            <input type="checkbox" checked={crossSection} onChange={(event) => onSetCrossSection(event.target.checked)} />
          </label>
          <div className="settings-row">
            <span>
              <strong>渲染质量</strong>
              <small>均衡模式更快，高质量模式使用更高 DPR。</small>
            </span>
            <div className="segmented">
              {['balanced', 'high'].map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={settings.quality === quality ? 'active' : ''}
                  onClick={() => onUpdateSettings({ ...settings, quality })}
                >
                  {quality === 'balanced' ? '均衡' : '高质量'}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span>
              <strong>生成服务</strong>
              <small>{GENERATION_PROVIDER_OPTIONS.find((item) => item.id === settings.generationProvider)?.description}</small>
            </span>
            <div className="segmented provider-segmented">
              {GENERATION_PROVIDER_OPTIONS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={settings.generationProvider === provider.id ? 'active' : ''}
                  onClick={() => onUpdateSettings({ ...settings, generationProvider: provider.id })}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </div>
          <label className="settings-row">
            <span>
              <strong>紧凑界面</strong>
              <small>为小屏幕使用更紧凑的面板。</small>
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
            <button type="button" className="drawer-primary" onClick={() => onSelectCell(compareCell)}>打开对比细胞</button>
            <button type="button" className="drawer-secondary" onClick={() => onSetCompareCell(profile.compareTarget)}>重置目标</button>
          </div>
        </div>
      )
    }

    return (
      <div className="drawer-content">
        <div className="profile-stats">
          <span><strong>{allCells.length}</strong><small>细胞</small></span>
          <span><strong>{galleryItems.length}</strong><small>已保存</small></span>
          <span><strong>{Object.keys(notes).length}</strong><small>笔记</small></span>
        </div>
        <p className="drawer-copy">收藏：{savedFavorite}</p>
        <p className="drawer-copy">常见位置：{profile.occurs}</p>
        <p className="drawer-copy">本项目基于 3DCellForge 开源项目进行中文化体验改造。</p>
      </div>
    )
  }

  return (
    <motion.section className="workspace-drawer" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      <header>
        <div>
          <strong>{PANEL_LABELS[activePanel]}</strong>
          <span>{WORKSPACE_PANELS[activePanel]}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭面板">
          <X size={15} />
        </button>
      </header>
      <div className="drawer-meta">
        <span>{cell.name}</span>
        <span>{detail.title}</span>
        <span>剖面视图就绪</span>
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
  const [selectedCell, setSelectedCell] = useState('plant')
  const [selectedOrganelle, setSelectedOrganelle] = useState('nucleus')
  const [crossSection, setCrossSection] = useState(true)
  const [activePanel, setActivePanel] = useState(null)
  const [toast, setToast] = useState('植物细胞已就绪')
  const [favoriteKey, setFavoriteKey] = useState('')
  const [labelVisible, setLabelVisible] = useState(() => loadStoredValue('bio-demo-label-visible', true))
  const [selectedMicroscope, setSelectedMicroscope] = useState(MICROSCOPE_IMAGES[0].label)
  const [uploadedImage, setUploadedImage] = useState(null)
  const [sceneExporter, setSceneExporter] = useState(null)
  const [customCells, setCustomCells] = useState(() => loadStoredValue(CUSTOM_CELL_STORAGE_KEY, []))
  const [compareCell, setCompareCell] = useState(getCellProfile('plant').compareTarget)
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

  function handleSelectCell(cellId) {
    setSelectedCell(cellId)
    setSelectedOrganelle(getDefaultOrganelle(cellId))
    setCompareCell((current) => (current === cellId ? getCellProfile(cellId).compareTarget : current))
    setToast(`${getCell(cellId).name}已加载`)
  }

  async function handleExport() {
    const cell = getCell(selectedCell)
    const detail = getOrganelleDetail(selectedCell, selectedOrganelle)

    if (!sceneExporter) {
      downloadJson(`${selectedCell}-cell-export.json`, {
        cell,
        selectedOrganelle,
        detail,
        crossSection,
        selectedMicroscope,
        exportedAt: new Date().toISOString(),
        fallbackReason: '当前浏览器无法使用 WebGL 模型导出器。',
      })
      setToast('WebGL 不可用；已导出元数据')
      return
    }

    setToast('正在准备 GLB 导出')
    try {
      const glb = await sceneExporter()
      downloadBlob(`${selectedCell}-${selectedOrganelle}.glb`, glb)
      setToast(`${cell.name} GLB 已下载`)
    } catch (error) {
      console.error(error)
      downloadJson(`${selectedCell}-cell-export.json`, {
        cell,
        selectedOrganelle,
        detail,
        crossSection,
        selectedMicroscope,
        exportedAt: new Date().toISOString(),
        fallbackReason: error instanceof Error ? error.message : 'GLB 导出失败。',
      })
      setToast('GLB 导出失败；已导出元数据')
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

  async function generateCustomCellModel(customCell, imageUrl, fileName, requestedProvider = settings.generationProvider) {
    const providers = getProviderPlan(requestedProvider)
    const errors = []

    for (const provider of providers) {
      const label = getProviderLabel(provider)

      try {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider,
            requestedProvider,
            status: 'uploading',
            modelUrl: '',
            rawModelUrl: '',
            message: `正在发送图片到${label}。`,
          },
        }))
        setToast(`正在创建${label}图像转 3D 任务`)

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
            message: `${label}正在生成 GLB 模型。`,
          },
        }))
        setToast(`${label}任务已启动：${String(task.taskId).slice(0, 8)}`)

        const finalStatus = await waitFor3dModel(task.taskId, provider, (status) => {
          updateCustomCell(customCell.id, (cell) => ({
            generation: {
              ...cell.generation,
              provider,
              requestedProvider,
              status: status.status || 'processing',
              taskId: task.taskId,
              message: status.progress ? `${label}进度 ${status.progress}%` : `${label}状态：${getGenerationStatusLabel(status.status || 'processing')}`,
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
            message: `${label} GLB 已加载。`,
          },
        }))
        setToast(`${customCell.name} ${label} 3D 模型已就绪`)
        return
      } catch (error) {
        const message = error instanceof Error ? error.message : `${label}生成失败。`
        errors.push(`${label}: ${message}`)

        if (provider !== providers[providers.length - 1]) {
          updateCustomCell(customCell.id, (cell) => ({
            generation: {
              ...cell.generation,
              provider,
              requestedProvider,
              status: 'processing',
              message: `${label}失败；正在尝试${getProviderLabel(providers[providers.indexOf(provider) + 1])}。`,
            },
          }))
          setToast(`${label}失败；正在尝试备用服务`)
        }
      }
    }

    throw new Error(errors.join(' | '))
  }

  async function handleRetryGeneration(cellId) {
    const cell = getCustomCell(cellId, customCells)
    if (!cell?.imageUrl) {
      setToast('没有可重试的源图片')
      return
    }

    setSelectedCell(cell.id)
    setSelectedOrganelle(getDefaultOrganelle(cell.id))
    setToast('正在重试 3D 生成')

    try {
      await generateCustomCellModel(cell, cell.imageUrl, `${cell.name}.png`)
    } catch (error) {
      console.error(error)
      updateCustomCell(cell.id, (current) => ({
        generation: {
          ...current.generation,
          requestedProvider: settings.generationProvider,
          status: 'failed',
          modelUrl: '',
          rawModelUrl: '',
          message: error instanceof Error ? error.message : '3D 生成失败。',
        },
      }))
      setToast(error instanceof Error ? error.message : '图像转 3D 生成失败')
    }
  }

  async function handleUploadImage(file) {
    if (isLocalModelFile(file)) {
      await handleUploadLocalModel(file)
      return
    }

    setToast('正在上传图片用于 3D 生成')
    let customCell = null
    try {
      const imageUrl = await fileToDataUrl(file)
      customCell = createCustomCell(file.name, imageUrl)
      customCell.generation = {
        ...customCell.generation,
        provider: settings.generationProvider,
        requestedProvider: settings.generationProvider,
        status: 'uploading',
        message: '正在将图片发送到后端。',
      }
      const nextCustomCells = [customCell, ...customCells].slice(0, 8)

      setCustomCells(nextCustomCells)
      storeValue(CUSTOM_CELL_STORAGE_KEY, nextCustomCells)
      setUploadedImage({ name: file.name, url: imageUrl })
      setSelectedCell(customCell.id)
      setSelectedOrganelle(getDefaultOrganelle(customCell.id))
      setCompareCell(customCell.template)
      setActivePanel('Library')
      await generateCustomCellModel(customCell, imageUrl, file.name)
    } catch (error) {
      console.error(error)
      if (customCell) {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            requestedProvider: settings.generationProvider,
            status: 'failed',
            message: error instanceof Error ? error.message : '3D 生成失败。',
          },
        }))
      }
      setToast(error instanceof Error ? error.message : '图像转 3D 生成失败')
    }
  }

  async function handleUploadLocalModel(file) {
    setToast('正在导入本地 3D 模型')
    let customCell = null

    try {
      customCell = createCustomCell(file.name, '', {
        provider: 'local',
        requestedProvider: 'local',
        type: '本地 3D 模型',
        status: 'uploading',
        message: '正在将模型保存到本地缓存。',
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
          message: '本地 GLB 已从磁盘缓存加载。',
        },
      }))
      setToast(`${customCell.name}本地 3D 模型已就绪`)
    } catch (error) {
      console.error(error)
      if (customCell) {
        updateCustomCell(customCell.id, (cell) => ({
          generation: {
            ...cell.generation,
            provider: 'local',
            requestedProvider: 'local',
            status: 'failed',
            message: error instanceof Error ? error.message : '本地模型导入失败。',
          },
        }))
      }
      setToast(error instanceof Error ? error.message : '本地模型导入失败')
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
    setToast('视图已保存到图库')
  }

  function handleClearGallery() {
    setGalleryItems([])
    setToast('图库已清空')
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
    setToast(`${getCell(selectedCell).name}已与${getCell(cellId).name}对比`)
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
            setToast(`${getCell(cellId).name}已设为对比目标`)
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
