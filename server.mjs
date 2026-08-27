import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { API_HOST, API_PORT, CAPABILITY_ROUTER, FAL_API_KEY, HUNYUAN_API_BASE, RODIN_API_KEY, TRIPO_API_KEY } from './server/config.mjs'
import { assertLocalDiagnosticsRequest, readJsonBody, sendJson, setCorsHeaders } from './server/http-utils.mjs'
import { createRequestId, logEvent, readRecentLogs, summarizeError, summarizePayload } from './server/logger.mjs'
import { hasLocalModel, importLocalModel, localModelPath, localModelUrl, proxyModel, saveLocalModel, serveLocalModel } from './server/model-store.mjs'
import { getCapability, listAvailableCapabilities, route } from './server/providers/registry.mjs'
import { createFalTask, getFalHealth, getFalTask } from './server/providers/fal.mjs'
import { createHunyuanTask, getHunyuanHealth, getHunyuanTask } from './server/providers/hunyuan.mjs'
import { createRodinTask, getRodinHealth, getRodinTask } from './server/providers/rodin.mjs'
import { createTripoTask, getTripoHealth, getTripoTask } from './server/providers/tripo.mjs'
import { analyzeAssetImage, getVisionHealth } from './server/providers/vision.mjs'

const DEFAULT_GENERATION_PROVIDER = 'rodin'

const server = http.createServer(async (request, response) => {
  const requestId = createRequestId()
  const startedAt = Date.now()
  let url = null

  try {
    setCorsHeaders(response)
    response.setHeader('X-Request-Id', requestId)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    url = new URL(request.url, `http://${request.headers.host}`)
    await logEvent('info', 'http.request', {
      requestId,
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    })

    if (request.method === 'GET' && url.pathname === '/api/3d/health') {
      const payload = {
        ok: true,
        capabilityRouter: CAPABILITY_ROUTER,
        providers: {
          tripo: getTripoHealth(),
          rodin: getRodinHealth(),
          hunyuan: getHunyuanHealth(),
          fal: getFalHealth(),
          vision: getVisionHealth(),
        },
      }
      sendJson(response, 200, payload)
      await logEvent('info', 'http.response', { requestId, path: url.pathname, status: 200, durationMs: Date.now() - startedAt })
      return
    }

    // 能力目录：前端据此渲染「要做什么」而不是「用哪家引擎」
    if (request.method === 'GET' && url.pathname === '/api/3d/capabilities') {
      const onlyConfigured = url.searchParams.get('configured') === 'true'
      const payload = {
        ok: true,
        capabilityRouter: CAPABILITY_ROUTER,
        capabilities: listAvailableCapabilities({ onlyConfigured }),
      }
      sendJson(response, 200, payload)
      await logEvent('info', 'http.response', { requestId, path: url.pathname, status: 200, durationMs: Date.now() - startedAt })
      return
    }

    // 路由建议：给定能力与偏好，返回排序后的引擎列表
    if (request.method === 'GET' && url.pathname === '/api/3d/route') {
      const capability = url.searchParams.get('capability') || 'generate.image-to-model'
      const prefer = url.searchParams.get('prefer') || 'balanced'
      const onlyConfigured = url.searchParams.get('configured') !== 'false'
      const payload = {
        ok: true,
        capability,
        prefer,
        candidates: route(capability, { prefer, onlyConfigured }),
      }
      sendJson(response, 200, payload)
      await logEvent('info', 'http.response', { requestId, path: url.pathname, status: 200, durationMs: Date.now() - startedAt })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/3d/logs') {
      assertLocalDiagnosticsRequest(request)
      const payload = await readRecentLogs(url.searchParams.get('limit') || 100)
      sendJson(response, 200, payload)
      await logEvent('info', 'http.response', { requestId, path: url.pathname, status: 200, durationMs: Date.now() - startedAt, entries: payload.entries.length })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/analyze') {
      const payload = await readJsonBody(request)
      await logEvent('info', 'asset.analyze.start', {
        requestId,
        payload: summarizePayload(payload),
      })
      const insight = await analyzeAssetImage(payload)

      sendJson(response, 200, insight)
      await logEvent('info', 'asset.analyze.success', {
        requestId,
        provider: insight.provider,
        configured: insight.configured,
        status: insight.status,
        categoryId: insight.categoryId,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/generate') {
      const payload = await readJsonBody(request)
      const provider = payload.provider || DEFAULT_GENERATION_PROVIDER
      await logEvent('info', 'generation.create.start', {
        requestId,
        provider,
        payload: summarizePayload(payload),
      })
      const task = await createGenerationTask(provider, payload)

      sendJson(response, 200, task)
      await logEvent('info', 'generation.create.success', {
        requestId,
        provider,
        taskId: task.taskId,
        status: task.status,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/status/')) {
      const taskId = decodeURIComponent(url.pathname.replace('/api/3d/status/', ''))
      const provider = url.searchParams.get('provider') || DEFAULT_GENERATION_PROVIDER
      const task = await getGenerationTask(provider, taskId)

      sendJson(response, 200, task)
      await logEvent('info', 'generation.status', {
        requestId,
        provider,
        taskId,
        status: task.status,
        progress: task.progress,
        hasModelUrl: Boolean(task.modelUrl),
        error: task.error,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/3d/model') {
      await proxyModel(url, response)
      await logEvent('info', 'model.proxy.success', { requestId, durationMs: Date.now() - startedAt })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/local-model') {
      const model = await importLocalModel(request, url)
      sendJson(response, 200, model)
      await logEvent('info', 'model.import.success', {
        requestId,
        taskId: model.taskId,
        modelUrl: model.modelUrl,
        fileName: model.fileName,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    // 本地优化：不需要任何 API key，走 gltf-transform
    if (request.method === 'POST' && url.pathname === '/api/3d/optimize') {
      const payload = await readJsonBody(request)
      const result = await runLocalOptimize(payload)

      sendJson(response, 200, result)
      await logEvent('info', 'model.optimize.success', {
        requestId,
        sourceId: payload.modelId,
        outputId: result.modelId,
        savedBytes: result.before.bytes - result.after.bytes,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/local-model/')) {
      await serveLocalModel(url, response)
      await logEvent('info', 'model.local.success', { requestId, path: url.pathname, durationMs: Date.now() - startedAt })
      return
    }

    sendJson(response, 404, { error: 'Not found' })
    await logEvent('warn', 'http.not_found', { requestId, path: url.pathname, durationMs: Date.now() - startedAt })
  } catch (error) {
    if (response.headersSent) {
      await logEvent('error', 'http.stream_error', {
        requestId,
        path: url?.pathname,
        durationMs: Date.now() - startedAt,
        error: summarizeError(error),
      })
      response.destroy(error)
      return
    }

    const status = error.status || 500
    sendJson(response, status, {
      error: error.message || 'Server error',
      detail: error.detail,
    })
    await logEvent(status >= 500 ? 'error' : 'warn', 'http.error', {
      requestId,
      method: request.method,
      path: url?.pathname,
      status,
      durationMs: Date.now() - startedAt,
      error: summarizeError(error),
    })
  }
})

server.listen(API_PORT, API_HOST, () => {
  console.log(`Forge3D API running at http://${API_HOST}:${API_PORT}`)
  console.log(`Capability router: ${CAPABILITY_ROUTER ? 'on' : 'off (legacy dispatch)'}`)
  console.log(TRIPO_API_KEY ? 'Tripo API key loaded from environment.' : 'TRIPO_API_KEY is missing. Add it to .env.local.')
  console.log(RODIN_API_KEY ? 'Rodin API key loaded from environment.' : 'RODIN_API_KEY is missing. Add it to .env.local.')
  console.log(FAL_API_KEY ? 'Fal API key loaded from environment.' : 'FAL_API_KEY is missing. Add it to .env.local.')
  console.log(getVisionHealth().configured ? 'Vision analysis provider configured.' : 'Vision analysis is not configured. Add OPENAI_API_KEY to .env.local.')
  console.log(`Hunyuan3D local provider: ${HUNYUAN_API_BASE}`)
  logEvent('info', 'api.start', {
    host: API_HOST,
    port: API_PORT,
    providers: {
      tripo: Boolean(TRIPO_API_KEY),
      rodin: Boolean(RODIN_API_KEY),
      fal: Boolean(FAL_API_KEY),
      hunyuan: Boolean(HUNYUAN_API_BASE),
      vision: getVisionHealth().configured,
    },
  })
})

function createGenerationTask(provider, payload) {
  if (!CAPABILITY_ROUTER) return createLegacyTask(provider, payload)

  const capability = payload.capability || 'generate.image-to-model'
  let providerId = provider

  // 未指定引擎、或显式给了偏好时，按偏好路由挑最优
  if (!providerId || payload.prefer) {
    const candidates = route(capability, { prefer: payload.prefer || 'balanced', onlyConfigured: true })
    if (!candidates.length) {
      throw Object.assign(new Error(`No configured provider supports "${capability}".`), { status: 503 })
    }
    providerId = candidates[0].providerId
  }

  const entry = getCapability(providerId, capability)
  if (!entry) {
    throw Object.assign(new Error(`Provider "${providerId}" does not support "${capability}".`), { status: 400 })
  }

  return entry.create(payload)
}

function getGenerationTask(provider, taskId) {
  if (!CAPABILITY_ROUTER) return getLegacyTask(provider, taskId)

  const entry = getCapability(provider || DEFAULT_GENERATION_PROVIDER, 'generate.image-to-model')
  if (!entry) return getLegacyTask(provider, taskId)

  return entry.get(taskId)
}

// —— 原有路径，完整保留。CAPABILITY_ROUTER=off 时走这里，任何时刻都可回退。——
function createLegacyTask(provider, payload) {
  if (provider === 'hunyuan') return createHunyuanTask(payload)
  if (provider === 'fal') return createFalTask(payload)
  if (provider === 'tripo') return createTripoTask(payload)
  return createRodinTask(payload)
}

function getLegacyTask(provider, taskId) {
  if (provider === 'hunyuan') return getHunyuanTask(taskId)
  if (provider === 'fal') return getFalTask(taskId)
  if (provider === 'tripo') return getTripoTask(taskId)
  return getRodinTask(taskId)
}

/**
 * 本地优化：读一个已缓存的模型，跑 gltf-transform，存成新文件。
 * 不需要任何 API key —— 这是「本地零成本模式」的第一块砖。
 *
 * 只接受 modelId（本地缓存里的 id），不接受任意 URL —— 否则就成了
 * 一个可以被利用来让服务器下载任意文件的 SSRF 入口。
 */
async function runLocalOptimize({ modelId, ratio = 1, compress = 'meshopt', error = 0.001 } = {}) {
  if (!modelId) {
    throw Object.assign(new Error('modelId is required.'), { status: 400 })
  }

  if (!(await hasLocalModel(modelId, 'glb'))) {
    throw Object.assign(new Error(`本地没有这个模型：${modelId}`), { status: 404 })
  }

  // 惰性加载：gltf-transform + draco3d + meshoptimizer 体积不小，
  // 放启动路径上会白白拖慢冷启动，只在真要优化时才拉进来
  const { optimizeGlb } = await import('./server/optimize.mjs')
  const source = await readFile(localModelPath(modelId, 'glb'))
  const result = await optimizeGlb(source, { ratio, compress, error })

  const outputId = `${modelId}-opt`
  await saveLocalModel(outputId, Buffer.from(result.buffer), 'glb')

  return {
    ok: true,
    modelId: outputId,
    modelUrl: localModelUrl(outputId, 'glb'),
    sourceId: modelId,
    steps: result.steps,
    before: result.before,
    after: result.after,
    savedPercent: Math.round((1 - result.after.bytes / Math.max(1, result.before.bytes)) * 100),
  }
}
