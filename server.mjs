import http from 'node:http'
import { API_HOST, API_PORT, FAL_API_KEY, HUNYUAN_API_BASE, RODIN_API_KEY, TRIPO_API_KEY } from './server/config.mjs'
import { readJsonBody, sendJson, setCorsHeaders } from './server/http-utils.mjs'
import { importLocalModel, proxyModel, serveLocalModel } from './server/model-store.mjs'
import { createFalTask, getFalHealth, getFalTask } from './server/providers/fal.mjs'
import { createHunyuanTask, getHunyuanHealth, getHunyuanTask } from './server/providers/hunyuan.mjs'
import { createRodinTask, getRodinHealth, getRodinTask } from './server/providers/rodin.mjs'
import { createTripoTask, getTripoHealth, getTripoTask } from './server/providers/tripo.mjs'

const server = http.createServer(async (request, response) => {
  try {
    setCorsHeaders(response)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const url = new URL(request.url, `http://${request.headers.host}`)

    if (request.method === 'GET' && url.pathname === '/api/3d/health') {
      sendJson(response, 200, {
        ok: true,
        providers: {
          tripo: getTripoHealth(),
          rodin: getRodinHealth(),
          hunyuan: getHunyuanHealth(),
          fal: getFalHealth(),
        },
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/generate') {
      const payload = await readJsonBody(request)
      const provider = payload.provider || 'tripo'
      const task = await createGenerationTask(provider, payload)

      sendJson(response, 200, task)
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/status/')) {
      const taskId = decodeURIComponent(url.pathname.replace('/api/3d/status/', ''))
      const provider = url.searchParams.get('provider') || 'tripo'
      const task = await getGenerationTask(provider, taskId)

      sendJson(response, 200, task)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/3d/model') {
      await proxyModel(url, response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/local-model') {
      const model = await importLocalModel(request, url)
      sendJson(response, 200, model)
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/local-model/')) {
      await serveLocalModel(url, response)
      return
    }

    sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error)
      return
    }

    const status = error.status || 500
    sendJson(response, status, {
      error: error.message || 'Server error',
      detail: error.detail,
    })
  }
})

server.listen(API_PORT, API_HOST, () => {
  console.log(`Bio demo API running at http://${API_HOST}:${API_PORT}`)
  console.log(TRIPO_API_KEY ? 'Tripo API key loaded from environment.' : 'TRIPO_API_KEY is missing. Add it to .env.local.')
  console.log(RODIN_API_KEY ? 'Rodin API key loaded from environment.' : 'RODIN_API_KEY is missing. Add it to .env.local.')
  console.log(FAL_API_KEY ? 'Fal API key loaded from environment.' : 'FAL_API_KEY is missing. Add it to .env.local.')
  console.log(`Hunyuan3D local provider: ${HUNYUAN_API_BASE}`)
})

function createGenerationTask(provider, payload) {
  if (provider === 'hunyuan') return createHunyuanTask(payload)
  if (provider === 'rodin') return createRodinTask(payload)
  if (provider === 'fal') return createFalTask(payload)
  return createTripoTask(payload)
}

function getGenerationTask(provider, taskId) {
  if (provider === 'hunyuan') return getHunyuanTask(taskId)
  if (provider === 'rodin') return getRodinTask(taskId)
  if (provider === 'fal') return getFalTask(taskId)
  return getTripoTask(taskId)
}
