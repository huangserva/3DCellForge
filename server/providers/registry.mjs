/**
 * 能力注册表（Capability Registry）
 *
 * 把「选供应商」改成「选能力 + 选偏好」。
 *
 * 背景：在此之前，server.mjs 用 if-else 按 provider 分发，抽象里只有「生成」一个动词。
 * 这导致 Tripo v3 提供的 17 个端点只有一个接得进来，且每加一个模型要改 5 处。
 * 改成注册表之后：加引擎 = 加一条记录，前端自动出现；后处理端点自然接入；
 * 「多引擎横评」只是遍历同一个 capability 的所有 provider。
 *
 * —— 这是 Forge 从「3D 生成器」走向「3D 资产工作台」的地基。
 *
 * 惰性加载：本模块不静态 import 任何 provider。
 *   ① 路由逻辑可独立单元测试，不必装齐所有 SDK
 *   ② 某个 provider 的依赖缺失或初始化失败，不会拖垮整个路由
 *   ③ 将来接本地 TRELLIS（需要 GPU 服务端）也不影响冷启动
 */

/**
 * 能力目录。
 * input / output 描述数据形状，供 UI 决定渲染哪种表单。
 * stage 用于流水线编排：generate 产出模型，postprocess 消费并再产出模型。
 */
export const CAPABILITIES = {
  // —— 生成阶段 ——
  'generate.image-to-model': {
    label: '图生 3D',
    stage: 'generate',
    input: ['image'],
    output: 'model',
    description: '从单张参考图生成 3D 模型。',
  },
  'generate.text-to-model': {
    label: '文生 3D',
    stage: 'generate',
    input: ['prompt'],
    output: 'model',
    description: '从文字描述生成 3D 模型。',
  },
  'generate.multiview-to-model': {
    label: '多视角生 3D',
    stage: 'generate',
    input: ['images[]'],
    output: 'model',
    description: '多张不同角度的图生成 3D 模型，几何精度与纹理覆盖更好。',
  },

  // —— 后处理阶段（护城河所在）——
  'mesh.segment': {
    label: '语义分割',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '把模型自动切成逻辑部件，便于单独编辑、贴图与动画。',
  },
  'mesh.complete': {
    label: '网格补全',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '补洞使其成为封闭网格（watertight），3D 打印必需。',
  },
  'mesh.decimate': {
    label: '减面 / 重拓扑',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '降低面数并优化布线，同时尽量保留视觉细节。',
  },
  'model.texture': {
    label: '重新贴图',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '在保留几何的前提下重新生成纹理。',
  },
  'model.convert': {
    label: '格式转换',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '在 GLB / OBJ / FBX / STL / USDZ 之间转换。',
  },

  'postprocess.optimize': {
    label: '本地优化',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '去重、焊接、减面、几何压缩。纯本地，不需要 API key。',
    sync: true,
  },

  // —— 动画 ——
  'animate.rig': {
    label: '骨骼绑定',
    stage: 'postprocess',
    input: ['model'],
    output: 'model',
    description: '自动放置骨骼并绑定，可直接进 Mixamo 做动画。',
  },
  'animate.retarget': {
    label: '动画重定向',
    stage: 'postprocess',
    input: ['model', 'animation'],
    output: 'model',
    description: '把已有动画迁移到新模型上。',
  },

  // —— 编辑 ——
  'edit.prompt': {
    label: '自然语言编辑',
    stage: 'postprocess',
    input: ['model', 'prompt'],
    output: 'model',
    description: '用文字描述直接修改已有模型（Rodin Gen-2 Edit）。',
  },
}

/**
 * 惰性调用包装。第一次真正调用时才 import 目标模块。
 */
function lazyCall(loader, method) {
  return async function invoke(...args) {
    const module = await loader()
    if (typeof module[method] !== 'function') {
      throw new Error(`Provider module does not export "${method}".`)
    }
    return module[method](...args)
  }
}

const loadTripo = () => import('./tripo.mjs')
const loadTripoV3 = () => import('./tripo-v3.mjs')
const loadRodin = () => import('./rodin.mjs')
const loadFal = () => import('./fal.mjs')
const loadHunyuan = () => import('./hunyuan.mjs')

/**
 * Tripo 的后处理端点结构一致（都是「上传/引用模型 → 异步任务」），
 * 所以统一包一层：把能力名固化进去，轮询复用同一个 getTripoV3Task。
 */
function lazyPost(capability) {
  return async function invoke(payload) {
    const module = await loadTripoV3()
    return module.createTripoV3PostTask(capability, payload)
  }
}

/**
 * 同步能力（sync）不走「创建任务 → 轮询」那套，而是直接 run 一次拿结果。
 * 本地优化就是这种 —— 它几秒内完成，没必要套异步任务模型。
 */
function lazyRun(loader, method) {
  return async function invoke(...args) {
    const module = await loader()
    if (typeof module[method] !== 'function') {
      throw new Error(`Provider module does not export "${method}".`)
    }
    return module[method](...args)
  }
}

/**
 * 供应商注册表。
 *
 * 每个 capability 提供：
 *   create(payload) -> { provider, taskId, status, raw }
 *   get(taskId)     -> { provider, taskId, status, progress, modelUrl, rawModelUrl, error, raw }
 *   perf            -> { speed, quality, cost }  0–10，用于按偏好路由与 UI 展示
 *
 * configured 是同步的纯 env 判断 —— 路由时必须同步拿到，不能触发动态 import。
 * health 是异步的，只在 /api/3d/health 这种诊断场景调用。
 *
 * perf 取值依据（2026-08，厂商公开信息与第三方评测综合）：
 *   speed   越大越快
 *   quality 越大越好；Rodin Gen-2 电影级给 10
 *   cost    越大越贵；Rodin 单次 $0.50+ 给 9
 */
export const PROVIDERS = {
  tripo: {
    id: 'tripo',
    label: 'Tripo',
    configured: () => Boolean(process.env.TRIPO_API_KEY),
    health: async () => (await loadTripo()).getTripoHealth(),
    capabilities: {
      'generate.image-to-model': {
        create: lazyCall(loadTripo, 'createTripoTask'),
        get: lazyCall(loadTripo, 'getTripoTask'),
        perf: { speed: 9, quality: 8, cost: 3 },
      },

      // —— 后处理（Tripo v3 提供，需要 API key）——
      // 每个能力只是把能力名绑给 createTripoV3PostTask，轮询统一复用 getTripoV3Task。
      'mesh.segment': {
        create: lazyPost('mesh.segment'),
        get: lazyCall(loadTripoV3, 'getTripoV3Task'),
        perf: { speed: 7, quality: 8, cost: 5 },
      },
      'mesh.complete': {
        create: lazyPost('mesh.complete'),
        get: lazyCall(loadTripoV3, 'getTripoV3Task'),
        perf: { speed: 8, quality: 7, cost: 3 },
      },
      'mesh.decimate': {
        create: lazyPost('mesh.decimate'),
        get: lazyCall(loadTripoV3, 'getTripoV3Task'),
        perf: { speed: 9, quality: 6, cost: 2 },
      },
      'model.texture': {
        create: lazyPost('model.texture'),
        get: lazyCall(loadTripoV3, 'getTripoV3Task'),
        perf: { speed: 6, quality: 8, cost: 5 },
      },
      'model.convert': {
        create: lazyPost('model.convert'),
        get: lazyCall(loadTripoV3, 'getTripoV3Task'),
        perf: { speed: 10, quality: 8, cost: 1 },
      },
      'animate.rig': {
        create: lazyPost('animate.rig'),
        get: lazyCall(loadTripoV3, 'getTripoV3Task'),
        perf: { speed: 5, quality: 8, cost: 6 },
      },
    },
  },

  rodin: {
    id: 'rodin',
    label: 'Hyper3D Rodin',
    configured: () => Boolean(process.env.RODIN_API_KEY),
    health: async () => (await loadRodin()).getRodinHealth(),
    capabilities: {
      'generate.image-to-model': {
        create: lazyCall(loadRodin, 'createRodinTask'),
        get: lazyCall(loadRodin, 'getRodinTask'),
        perf: { speed: 3, quality: 10, cost: 9 },
      },
      // Rodin Gen-2 Edit（2026-01 发布）支持自然语言编辑。
      // 端点待接，见 Sprint 1 第二批。登记后若没有 create/get，
      // listAvailableCapabilities 会自动过滤掉，UI 不会露出半成品选项。
      'edit.prompt': {
        perf: { speed: 4, quality: 9, cost: 8 },
      },
    },
  },

  fal: {
    id: 'fal',
    label: 'Fal.ai',
    configured: () => Boolean(process.env.FAL_API_KEY || process.env.FAL_KEY),
    health: async () => (await loadFal()).getFalHealth(),
    capabilities: {
      'generate.image-to-model': {
        create: lazyCall(loadFal, 'createFalTask'),
        get: lazyCall(loadFal, 'getFalTask'),
        perf: { speed: 7, quality: 7, cost: 2 },
      },
    },
  },

  hunyuan: {
    id: 'hunyuan',
    label: 'Hunyuan3D（本地）',
    configured: () => Boolean(process.env.HUNYUAN_API_BASE),
    health: async () => (await loadHunyuan()).getHunyuanHealth(),
    capabilities: {
      'generate.image-to-model': {
        create: lazyCall(loadHunyuan, 'createHunyuanTask'),
        get: lazyCall(loadHunyuan, 'getHunyuanTask'),
        perf: { speed: 4, quality: 7, cost: 1 },
      },
    },
  },

  /**
   * 本地引擎：不依赖任何外部服务，configured 恒为 true。
   * 这是「本地零成本模式」的载体 —— 用户 clone 下来不配 key 也能用上后处理。
   */
  local: {
    id: 'local',
    label: '本地（无需 key）',
    configured: () => true,
    health: async () => ({ configured: true, note: '本地 gltf-transform，无需 API key' }),
    capabilities: {
      'postprocess.optimize': {
        run: lazyRun(() => import('../optimize.mjs'), 'optimizeGlb'),
        perf: { speed: 9, quality: 8, cost: 0 },
      },
    },
  },
}

const PREFERENCE_WEIGHTS = {
  fastest: { speed: 1, quality: 0, cost: -0.5 },
  cheapest: { speed: 0.2, quality: -0.2, cost: -1 },
  quality: { speed: -0.2, quality: 1, cost: 0.2 },
  balanced: { speed: 0.5, quality: 0.7, cost: -0.6 },
}

export const ROUTE_PREFERENCES = Object.keys(PREFERENCE_WEIGHTS)

/**
 * 找出所有声明支持某能力的供应商，按偏好权重排序。
 *
 * @param {string} capability  能力 id，如 'generate.image-to-model'
 * @param {object} options
 * @param {string} options.prefer            fastest | cheapest | quality | balanced
 * @param {boolean} options.onlyConfigured   仅返回已配置 key 的
 * @param {boolean} options.implementedOnly 仅返回真正接了 create/get 的
 * @returns {Array<{ providerId, label, capability, perf, score, configured, implemented }>}
 */
export function route(capability, { prefer = 'balanced', onlyConfigured = false, implementedOnly = true } = {}) {
  if (!CAPABILITIES[capability]) {
    throw Object.assign(new Error(`Unknown capability: ${capability}`), { status: 400 })
  }

  const weights = PREFERENCE_WEIGHTS[prefer] || PREFERENCE_WEIGHTS.balanced
  const results = []

  for (const provider of Object.values(PROVIDERS)) {
    const entry = provider.capabilities?.[capability]
    if (!entry) continue

    const implemented = isImplemented(entry)
    if (implementedOnly && !implemented) continue

    const configured = safeConfigured(provider)
    if (onlyConfigured && !configured) continue

    const perf = entry.perf || { speed: 0, quality: 0, cost: 0 }
    const score =
      perf.speed * weights.speed +
      perf.quality * weights.quality +
      perf.cost * weights.cost

    results.push({
      providerId: provider.id,
      label: provider.label,
      capability,
      perf,
      score: Math.round(score * 100) / 100,
      configured,
      implemented,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * 取某个供应商的某项能力。不存在或未实现时返回 null，调用方据此隐藏 UI 选项。
 */
export function getCapability(providerId, capability) {
  const entry = PROVIDERS[providerId]?.capabilities?.[capability]
  if (!isImplemented(entry)) return null
  return entry
}

/**
 * 列出全部已实现的能力，供前端渲染「可以做什么」。
 * 与 CAPABILITIES 的区别：这里只返回真正接了 create/get 的，声明了但没实现的不会出现。
 */
export function listAvailableCapabilities({ onlyConfigured = false } = {}) {
  const map = new Map()

  for (const provider of Object.values(PROVIDERS)) {
    if (onlyConfigured && !safeConfigured(provider)) continue

    for (const [capabilityId, entry] of Object.entries(provider.capabilities || {})) {
      if (!isImplemented(entry)) continue
      if (!map.has(capabilityId)) map.set(capabilityId, [])
      map.get(capabilityId).push({
        providerId: provider.id,
        label: provider.label,
        perf: entry.perf || null,
      })
    }
  }

  return [...map.entries()].map(([capabilityId, providers]) => ({
    id: capabilityId,
    ...(CAPABILITIES[capabilityId] || { label: capabilityId, stage: 'unknown' }),
    providers,
  }))
}

/**
 * 汇总各 provider 的健康状态。仅用于诊断端点，失败不该让整体挂掉。
 */
export async function getAllHealth() {
  const entries = await Promise.all(
    Object.values(PROVIDERS).map(async (provider) => {
      try {
        return [provider.id, { ...(await provider.health()), configured: safeConfigured(provider) }]
      } catch (error) {
        return [provider.id, { configured: safeConfigured(provider), error: error.message }]
      }
    }),
  )

  return Object.fromEntries(entries)
}

/**
 * 能力要么提供 create/get（异步任务模型），要么提供 run（同步执行）。
 */
function isImplemented(entry) {
  return Boolean((entry?.create && entry?.get) || entry?.run)
}

function safeConfigured(provider) {
  try {
    return provider.configured?.() === true
  } catch {
    return false
  }
}
