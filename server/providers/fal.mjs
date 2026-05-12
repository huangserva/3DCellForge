import { fetch as undiciFetch } from 'undici'

import {
  FAL_API_KEY,
  FAL_DEFAULT_MODEL,
  FAL_QUEUE_BASE,
  OUTBOUND_PROXY_AGENT,
  hasOutboundProxy,
} from '../config.mjs'
import { parseDataUrl } from '../http-utils.mjs'
import { cacheRemoteModel, hasLocalModel, localModelUrl } from '../model-store.mjs'
import { findFirstValue, findModelUrl, isSuccessStatus } from '../object-utils.mjs'

export function getFalHealth() {
  return {
    configured: Boolean(FAL_API_KEY),
    queueBase: FAL_QUEUE_BASE,
    defaultModel: FAL_DEFAULT_MODEL,
  }
}

export async function createFalTask(payload) {
  requireFalKey()

  const modelId = sanitizeFalModelId(payload.modelId || payload.falModelId || FAL_DEFAULT_MODEL)
  const image = parseDataUrl(payload.imageDataUrl)
  const dataUrl = `data:${image.mime};base64,${image.buffer.toString('base64')}`
  const input = buildFalInput(modelId, dataUrl, payload)
  const raw = await falRequest(modelId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const requestId = findFirstValue(raw, ['request_id', 'requestId', 'id'])
  const statusUrl = findFirstValue(raw, ['status_url', 'statusUrl'])
  const responseUrl = findFirstValue(raw, ['response_url', 'responseUrl'])

  if (!requestId) {
    const error = new Error('Fal task response did not include a request id.')
    error.detail = raw
    throw error
  }

  return {
    provider: 'fal',
    taskId: encodeFalTaskId({ modelId, requestId, statusUrl, responseUrl }),
    status: normalizeFalStatus(raw.status),
    raw,
  }
}

export async function getFalTask(taskId) {
  requireFalKey()

  if (!taskId) {
    throw Object.assign(new Error('taskId is required.'), { status: 400 })
  }

  if (await hasLocalModel(taskId, 'glb')) {
    return {
      provider: 'fal',
      taskId,
      status: 'success',
      progress: 100,
      modelUrl: localModelUrl(taskId, 'glb'),
      rawModelUrl: '',
      error: '',
      raw: { cached: true },
    }
  }

  const decoded = decodeFalTaskId(taskId)
  const statusUrl = decoded.statusUrl || falStatusUrl(decoded.modelId, decoded.requestId)
  const responseUrl = decoded.responseUrl || falResponseUrl(decoded.modelId, decoded.requestId)
  const statusRaw = await falRequestAbsolute(statusUrl, { method: 'GET' })
  const status = normalizeFalStatus(statusRaw.status || statusRaw.state)
  let modelUrl = ''
  let rawModelUrl = ''
  let cacheError = ''
  let result = null

  if (status === 'success') {
    result = await falRequestAbsolute(responseUrl, { method: 'GET' })
    rawModelUrl = findModelUrl(result)

    if (rawModelUrl) {
      try {
        modelUrl = await cacheRemoteModel(taskId, rawModelUrl)
      } catch (error) {
        cacheError = error.message || 'Fal model cache failed.'
        modelUrl = `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}`
      }
    } else {
      cacheError = 'Fal response did not include a GLB or GLTF URL.'
    }
  }

  return {
    provider: 'fal',
    taskId,
    status,
    progress: getFalProgress(statusRaw, status),
    modelUrl,
    rawModelUrl,
    error: statusRaw.error || cacheError || '',
    raw: result ?? statusRaw,
  }
}

export function encodeFalTaskId(task) {
  return `fal-${Buffer.from(JSON.stringify(task)).toString('base64url')}`
}

export function decodeFalTaskId(taskId) {
  const raw = String(taskId || '')
  if (!raw.startsWith('fal-')) {
    return { modelId: FAL_DEFAULT_MODEL, requestId: raw, statusUrl: '', responseUrl: '' }
  }

  try {
    const parsed = JSON.parse(Buffer.from(raw.slice(4), 'base64url').toString('utf8'))
    return {
      modelId: sanitizeFalModelId(parsed.modelId || FAL_DEFAULT_MODEL),
      requestId: parsed.requestId || raw,
      statusUrl: parsed.statusUrl || '',
      responseUrl: parsed.responseUrl || '',
    }
  } catch {
    return { modelId: FAL_DEFAULT_MODEL, requestId: raw, statusUrl: '', responseUrl: '' }
  }
}

function falStatusUrl(modelId, requestId) {
  const namespace = modelId.split('/').slice(0, 2).join('/')
  return `${FAL_QUEUE_BASE.replace(/\/$/, '')}/${namespace}/requests/${encodeURIComponent(requestId)}/status`
}

function falResponseUrl(modelId, requestId) {
  const namespace = modelId.split('/').slice(0, 2).join('/')
  return `${FAL_QUEUE_BASE.replace(/\/$/, '')}/${namespace}/requests/${encodeURIComponent(requestId)}`
}

export function normalizeFalStatus(value) {
  const status = String(value || '').toLowerCase()
  if (!status) return 'queued'
  if (status === 'in_queue' || status === 'queued' || status === 'pending') return 'queued'
  if (status === 'in_progress' || status === 'running' || status === 'processing') return 'running'
  if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') return 'failed'
  if (isSuccessStatus(status)) return 'success'
  return status
}

function buildFalInput(modelId, imageUrl, payload) {
  const input = {}
  const lower = modelId.toLowerCase()

  if (lower.includes('hyper3d/rodin')) {
    input.input_image_urls = [imageUrl]
  } else if (lower.includes('hunyuan3d')) {
    input.input_image_url = imageUrl
  } else {
    input.image_url = imageUrl
  }

  if (payload.prompt) input.prompt = payload.prompt
  if (payload.seed !== undefined) input.seed = Number(payload.seed)

  return input
}

function getFalProgress(raw, status) {
  if (status === 'success') return 100
  if (status === 'failed') return null
  if (status === 'queued') return 0
  if (typeof raw.progress === 'number') return raw.progress
  if (typeof raw.percent === 'number') return raw.percent
  return null
}

function requireFalKey() {
  if (!FAL_API_KEY) {
    const error = new Error('FAL_API_KEY is not configured on the backend.')
    error.status = 500
    throw error
  }
}

function sanitizeFalModelId(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '')
}

async function falRequest(modelOrPath, options = {}) {
  const trimmedPath = sanitizeFalModelId(modelOrPath)
  const url = `${FAL_QUEUE_BASE.replace(/\/$/, '')}/${trimmedPath}`
  return falRequestAbsolute(url, options)
}

async function falRequestAbsolute(url, options = {}) {
  let response
  try {
    response = await undiciFetch(url, {
      ...options,
      ...(OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}),
      headers: {
        Authorization: `Key ${FAL_API_KEY}`,
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    const wrapped = new Error(`Fal network request failed: ${error.message}`)
    wrapped.detail = {
      url,
      cause: error.cause?.message || error.cause?.code || '',
      proxy: hasOutboundProxy(),
    }
    throw wrapped
  }

  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text || 'Non-JSON response from Fal.' }
  }

  if (!response.ok || data.error) {
    const detail = typeof data.detail === 'string' ? data.detail : null
    const message = data.message || detail || data.error || `Fal request failed with ${response.status}.`
    const error = new Error(message)
    error.status = response.status || 502
    error.detail = data
    console.error('[fal] request failed', { method: options.method || 'GET', url, status: response.status, body: text.slice(0, 800) })
    throw error
  }

  return data
}
