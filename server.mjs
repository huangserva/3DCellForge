import http from 'node:http'
import { API_HOST, API_PORT, ATLASCLOUD_API_KEY, FAL_API_KEY, HUNYUAN_API_BASE, RODIN_API_KEY, TRIPO_API_KEY } from './server/config.mjs'
import { assertLocalDiagnosticsRequest, readJsonBody, sendJson, setCorsHeaders } from './server/http-utils.mjs'
import { createRequestId, logEvent, readRecentLogs, summarizeError, summarizePayload } from './server/logger.mjs'
import { importLocalModel, proxyModel, serveLocalModel } from './server/model-store.mjs'
import { createFalTask, getFalHealth, getFalTask } from './server/providers/fal.mjs'
import { createAtlasTask, getAtlasHealth, getAtlasTask } from './server/providers/atlas.mjs'
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
        providers: {
          tripo: getTripoHealth(),
          rodin: getRodinHealth(),
          hunyuan: getHunyuanHealth(),
          fal: getFalHealth(),
          atlas: getAtlasHealth(),
          vision: getVisionHealth(),
        },
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
  console.log(`Bio demo API running at http://${API_HOST}:${API_PORT}`)
  console.log(TRIPO_API_KEY ? 'Tripo API key loaded from environment.' : 'TRIPO_API_KEY is missing. Add it to .env.local.')
  console.log(RODIN_API_KEY ? 'Rodin API key loaded from environment.' : 'RODIN_API_KEY is missing. Add it to .env.local.')
  console.log(FAL_API_KEY ? 'Fal API key loaded from environment.' : 'FAL_API_KEY is missing. Add it to .env.local.')
  console.log(ATLASCLOUD_API_KEY ? 'Atlas Cloud API key loaded from environment.' : 'ATLASCLOUD_API_KEY is missing. Add it to .env.local.')
  console.log(getVisionHealth().configured ? 'Vision analysis provider configured.' : 'Vision analysis is not configured. Add OPENAI_API_KEY to .env.local.')
  console.log(`Hunyuan3D local provider: ${HUNYUAN_API_BASE}`)
  logEvent('info', 'api.start', {
    host: API_HOST,
    port: API_PORT,
    providers: {
      tripo: Boolean(TRIPO_API_KEY),
      rodin: Boolean(RODIN_API_KEY),
      fal: Boolean(FAL_API_KEY),
      atlas: Boolean(ATLASCLOUD_API_KEY),
      hunyuan: Boolean(HUNYUAN_API_BASE),
      vision: getVisionHealth().configured,
    },
  })
})

function createGenerationTask(provider, payload) {
  if (provider === 'atlas') return createAtlasTask(payload)
  if (provider === 'hunyuan') return createHunyuanTask(payload)
  if (provider === 'fal') return createFalTask(payload)
  if (provider === 'tripo') return createTripoTask(payload)
  return createRodinTask(payload)
}

function getGenerationTask(provider, taskId) {
  if (provider === 'atlas') return getAtlasTask(taskId)
  if (provider === 'hunyuan') return getHunyuanTask(taskId)
  if (provider === 'fal') return getFalTask(taskId)
  if (provider === 'tripo') return getTripoTask(taskId)
  return getRodinTask(taskId)
}
