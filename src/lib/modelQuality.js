import { apiUrl, getProviderLabel } from '../services/modelApi.js'

const MODEL_METRIC_CACHE = new Map()

// 拓扑分析的成本随面数线性增长，超过这个预算就只做抽样，避免卡住 UI 线程
const MANIFOLD_BUDGET = 400_000

export async function inspectModelUrl(modelUrl) {
  if (!modelUrl) return null
  if (MODEL_METRIC_CACHE.has(modelUrl)) return MODEL_METRIC_CACHE.get(modelUrl)

  const promise = inspectModelUrlUncached(modelUrl)
  MODEL_METRIC_CACHE.set(modelUrl, promise)
  return promise
}

async function inspectModelUrlUncached(modelUrl) {
  const resolvedUrl = apiUrl(modelUrl)
  const response = await fetch(resolvedUrl)
  if (!response.ok) {
    throw new Error(`Model metrics unavailable (${response.status})`)
  }

  const headerSize = Number(response.headers.get('content-length'))
  const buffer = await response.arrayBuffer()
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const loader = new GLTFLoader()
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buffer, '', resolve, reject)
  })

  return extractSceneMetrics(gltf.scene, Number.isFinite(headerSize) && headerSize > 0 ? headerSize : buffer.byteLength)
}

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap']

export function extractSceneMetrics(scene, fileBytes = 0) {
  let nodeCount = 0
  let meshCount = 0
  let triangleCount = 0
  let vertexCount = 0
  let boundaryEdges = 0
  let degenerateTriangles = 0
  let analyzedTriangles = 0
  let meshWithUv = 0
  let uvCoverageSum = 0
  let maxTextureSize = 0
  let pbrChannels = 0

  const materials = new Set()
  const textures = new Set()
  let manifoldBudgetLeft = MANIFOLD_BUDGET

  scene.traverse((node) => {
    nodeCount += 1
    if (!node.isMesh) return

    meshCount += 1
    const geometry = node.geometry
    const position = geometry?.attributes?.position
    const index = geometry?.index
    const triangles = index ? Math.floor(index.count / 3) : Math.floor((position?.count || 0) / 3)

    triangleCount += triangles
    vertexCount += position?.count || 0

    // —— UV ——
    const uv = geometry?.attributes?.uv
    if (uv) {
      meshWithUv += 1
      uvCoverageSum += estimateUvCoverage(uv)
    }

    // —— 拓扑：封闭性与退化三角形 ——
    // 超预算时跳过，结果记为「部分评估」，不假装是全量结论
    if (triangles > 0 && manifoldBudgetLeft > 0) {
      const budget = Math.min(triangles, manifoldBudgetLeft)
      const topology = analyzeTopology(geometry, budget)
      boundaryEdges += topology.boundary
      degenerateTriangles += topology.degenerate
      analyzedTriangles += budget
      manifoldBudgetLeft -= budget
    }

    // —— 材质与纹理 ——
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material].filter(Boolean)
    nodeMaterials.forEach((material) => {
      if (materials.has(material)) return
      materials.add(material)
      pbrChannels += countPbrChannels(material)

      TEXTURE_SLOTS.forEach((slot) => {
        const texture = material?.[slot]
        if (!texture || textures.has(texture)) return
        textures.add(texture)
        maxTextureSize = Math.max(maxTextureSize, getTextureSize(texture))
      })
    })
  })

  return {
    fileBytes,
    nodeCount,
    meshCount,
    materialCount: materials.size,
    textureCount: textures.size,
    triangleCount,
    vertexCount,
    maxTextureSize,
    pbrChannels,
    // 拓扑类指标带有 evaluated 标记，UI 要据此区分「确实是 0」和「没算」
    boundaryEdges,
    degenerateTriangles,
    analyzedTriangles,
    manifoldComplete: analyzedTriangles >= triangleCount,
    uvCoverage: meshWithUv > 0 ? uvCoverageSum / meshWithUv : 0,
    meshWithUv,
    inspectedAt: new Date().toISOString(),
  }
}

/**
 * 统计边界边与退化三角形。
 *
 * 边界边 = 只被一个三角形使用的边。封闭（watertight）网格的边界边应为 0，
 * 这是 3D 打印和布尔运算的前提。用 min*vertexCount+max 把边打包成数字键，
 * 顶点数在千万级以内都安全落在 MAX_SAFE_INTEGER 里。
 */
export function analyzeTopology(geometry, maxTriangles) {
  const index = geometry.index
  const position = geometry.attributes?.position
  if (!position) return { boundary: 0, degenerate: 0 }

  const vertexCount = position.count
  const total = index ? Math.floor(index.count / 3) : Math.floor(vertexCount / 3)
  const count = Math.min(total, maxTriangles)

  const getVertex = index
    ? (i) => index.getX(i)
    : (i) => i

  const edges = new Map()
  let degenerate = 0

  for (let t = 0; t < count; t += 1) {
    const a = getVertex(t * 3)
    const b = getVertex(t * 3 + 1)
    const c = getVertex(t * 3 + 2)

    if (a === b || b === c || a === c) {
      degenerate += 1
      continue
    }

    countEdge(edges, a, b, vertexCount)
    countEdge(edges, b, c, vertexCount)
    countEdge(edges, c, a, vertexCount)
  }

  let boundary = 0
  for (const uses of edges.values()) {
    if (uses === 1) boundary += 1
  }

  return { boundary, degenerate }
}

function countEdge(edges, a, b, vertexCount) {
  const key = a < b ? a * vertexCount + b : b * vertexCount + a
  edges.set(key, (edges.get(key) || 0) + 1)
}

/**
 * UV 覆盖率：UV 包围盒占 [0,1] 空间的面积。
 * 太低说明大片区域没用上（纹理分辨率浪费），超过 1 说明有 UV 越界（会重复贴图）。
 */
function estimateUvCoverage(uv) {
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity

  // 全量遍历太慢，等距抽样
  const stride = Math.max(1, Math.floor(uv.count / 20000))
  for (let i = 0; i < uv.count; i += stride) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }

  if (!Number.isFinite(minU)) return 0
  return Math.min(1, (maxU - minU) * (maxV - minV))
}

function countPbrChannels(material) {
  if (!material) return 0
  return ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].filter((slot) => material[slot]).length
}

function getTextureSize(texture) {
  const image = texture?.image
  if (!image) return 0
  return Math.max(image.width || 0, image.height || 0)
}

/**
 * 质量评估。
 *
 * 重要：这里刻意**不**奖励「文件大」和「面数多」。
 * 旧版按体积加分，等于鼓励臃肿、惩罚 clean topology —— 一个 200 万面的烂模型
 * 会拿高分，而 Tripo v3 主打的干净低面数模型反而被判低分。
 *
 * 现在衡量的是六个真实信号，每项独立打分并给出理由，UI 可以直接展示
 * 「为什么是这个分」。
 */
const QUALITY_CHECKS = [
  { id: 'watertight', label: '网格封闭', weight: 22 },
  { id: 'pbr', label: 'PBR 通道', weight: 20 },
  { id: 'uv', label: 'UV 覆盖', weight: 18 },
  { id: 'texture', label: '纹理分辨率', weight: 15 },
  { id: 'density', label: '面数合理', weight: 15 },
  { id: 'clean', label: '结构干净', weight: 10 },
]

export function getModelQuality(cell, metrics, generationHistory = []) {
  const generation = cell.custom ? cell.generation || {} : {}
  const status = String(generation.status || (cell.custom ? 'pending' : 'built-in')).toLowerCase()
  const hasGlb = Boolean(generation.modelUrl)
  const provider = generation.provider || (cell.custom ? 'unknown' : 'built-in')
  const history = generationHistory.find((entry) => entry.cellId === cell.id && ['success', 'failed'].includes(String(entry.status).toLowerCase()))
  const durationMs = history?.durationMs
  const failed = status === 'failed'
  const loadingMetrics = hasGlb && !metrics
  const metricError = metrics?.error || ''

  let checks = []
  let score

  if (failed) {
    score = 12
  } else if (cell.custom && status && !['success', 'local'].includes(status) && !hasGlb) {
    // 自定义资产还在生成中，没出 GLB —— 这是「等待」，不是「质量差」
    score = 38
  } else if (!metrics) {
    // 内置起始资产本来就没有 GLB，不该按生成未完成论处
    score = cell.custom ? 55 : 68
  } else {
    const assessment = assessMetrics(metrics)
    score = assessment.score
    checks = assessment.checks
  }

  return {
    score,
    verdict: getVerdict(score, { cell, failed, hasGlb, metricError, metrics }),
    checks,
    providerLabel: provider === 'built-in' ? 'Built-in' : getProviderLabel(provider),
    status,
    hasGlb,
    durationMs,
    loadingMetrics,
    metricError,
    fileBytes: metrics?.fileBytes || 0,
    nodeCount: metrics?.nodeCount || 0,
    meshCount: metrics?.meshCount || 0,
    materialCount: metrics?.materialCount || 0,
    textureCount: metrics?.textureCount || 0,
    triangleCount: metrics?.triangleCount || 0,
    // 透出新的诊断字段，供 UI 展开详情
    boundaryEdges: metrics?.boundaryEdges ?? null,
    degenerateTriangles: metrics?.degenerateTriangles ?? null,
    manifoldComplete: metrics?.manifoldComplete ?? null,
    maxTextureSize: metrics?.maxTextureSize || 0,
    pbrChannels: metrics?.pbrChannels || 0,
    uvCoverage: metrics?.uvCoverage ?? null,
  }
}

/**
 * 六个信号各自打分，加权求和。每项都返回 detail 供 UI 展示。
 */
export function assessMetrics(metrics) {
  const checks = QUALITY_CHECKS.map((check) => ({
    ...check,
    ...evaluate(check.id, metrics),
  }))

  const totalWeight = checks.reduce((sum, check) => sum + (check.skipped ? 0 : check.weight), 0)
  const weighted = checks.reduce((sum, check) => sum + (check.skipped ? 0 : check.ratio * check.weight), 0)

  const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0

  return { score, checks }
}

function evaluate(id, metrics) {
  const { triangleCount = 0, boundaryEdges = 0, degenerateTriangles = 0, manifoldComplete = false,
    maxTextureSize = 0, pbrChannels = 0, uvCoverage = 0, meshCount = 0 } = metrics

  switch (id) {
    case 'watertight': {
      if (triangleCount === 0) return { ratio: 0, detail: '没有三角形', skipped: true }
      if (!manifoldComplete) {
        // 抽样评估不能当作全量结论，按边界边比例给一个保守分
        const ratio = boundaryEdges === 0 ? 0.85 : 0.5
        return { ratio, detail: `抽样评估：${boundaryEdges} 条边界边（未覆盖全部网格）` }
      }
      if (boundaryEdges === 0) return { ratio: 1, detail: '封闭网格，可直接 3D 打印' }
      const perTri = boundaryEdges / triangleCount
      const ratio = perTri < 0.01 ? 0.8 : perTri < 0.05 ? 0.55 : perTri < 0.15 ? 0.3 : 0.1
      return { ratio, detail: `${boundaryEdges} 条边界边，网格有破洞` }
    }

    case 'pbr': {
      // 有 baseColor 之外的 normal/roughness/metalness/ao 才算完整 PBR
      const ratio = pbrChannels >= 3 ? 1 : pbrChannels === 2 ? 0.75 : pbrChannels === 1 ? 0.45 : 0.15
      return { ratio, detail: `${pbrChannels} 个 PBR 通道（法线/粗糙度/金属度/AO）` }
    }

    case 'uv': {
      if (uvCoverage <= 0) return { ratio: 0, detail: '没有 UV，无法贴图' }
      // 0.3 以下浪费严重；0.9 以上可能越界重复
      const ratio = uvCoverage > 0.95 ? 0.7 : uvCoverage >= 0.3 ? 1 : uvCoverage >= 0.15 ? 0.6 : 0.3
      const verdictText = uvCoverage > 0.95 ? 'UV 越界，会重复贴图' : uvCoverage >= 0.3 ? 'UV 利用充分' : 'UV 空间浪费严重'
      return { ratio, detail: `覆盖 ${Math.round(uvCoverage * 100)}%，${verdictText}` }
    }

    case 'texture': {
      if (maxTextureSize === 0) return { ratio: 0, detail: '没有纹理' }
      // 2048 是当前主流甜点；再高对 Web 端是负担而非优势
      const ratio = maxTextureSize >= 2048 ? 1 : maxTextureSize >= 1024 ? 0.8 : maxTextureSize >= 512 ? 0.55 : 0.3
      return { ratio, detail: `最高 ${maxTextureSize}px` }
    }

    case 'density': {
      if (triangleCount === 0) return { ratio: 0, detail: '没有三角形', skipped: true }
      // 关键改动：不再是「越多越好」，而是落在合理区间最高。
      // 低于 2k 细节不足；2k–150k 是 Web 端甜点；超过 800k 基本是浪费。
      let ratio
      if (triangleCount < 2000) ratio = 0.3
      else if (triangleCount <= 150_000) ratio = 1
      else if (triangleCount <= 400_000) ratio = 0.8
      else if (triangleCount <= 800_000) ratio = 0.55
      else ratio = 0.3

      const note = ratio === 1 ? '面数在合理区间' : ratio > 0.6 ? '面数偏多' : triangleCount < 2000 ? '面数过少，细节不足' : '面数远超 Web 端需要'
      return { ratio, detail: `${triangleCount.toLocaleString()} 面，${note}` }
    }

    case 'clean': {
      if (triangleCount === 0) return { ratio: 0, detail: '没有三角形', skipped: true }
      const degenerateRatio = degenerateTriangles / triangleCount
      // 碎片过多（很多小 mesh）和退化三角形都说明拓扑不干净
      const fragmentPenalty = meshCount > 50 ? 0.4 : meshCount > 20 ? 0.2 : 0
      const ratio = Math.max(0, (degenerateRatio < 0.001 ? 1 : degenerateRatio < 0.01 ? 0.7 : 0.35) - fragmentPenalty)
      const note = degenerateTriangles === 0 && meshCount <= 20 ? '拓扑干净' : `退化三角形 ${degenerateTriangles}，${meshCount} 个网格碎片`
      return { ratio, detail: note }
    }

    default:
      return { ratio: 0, detail: '', skipped: true }
  }
}

function getVerdict(score, { cell, failed, hasGlb, metricError, metrics }) {
  if (failed) return 'Failed'
  if (metricError) return 'GLB loaded, metrics limited'
  if (cell.custom && !hasGlb && cell.generation?.provider === 'cinematic') return 'Preview only'
  if (cell.custom && !hasGlb) return 'Waiting for GLB'
  // 只有「有 GLB 但度量还没算完」才算等待；内置资产本来就没 GLB，直接按分数判断
  if (!metrics && hasGlb) return 'Awaiting metrics'
  if (score >= 86) return 'Demo-ready'
  if (score >= 72) return 'Solid'
  if (score >= 55) return 'Usable'
  return 'Needs cleanup'
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'n/a'
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`
  return `${Math.round(bytes)} B`
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'n/a'
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

export function formatNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return new Intl.NumberFormat(undefined, { notation: value >= 100000 ? 'compact' : 'standard' }).format(value)
}
