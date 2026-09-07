import { fetch as undiciFetch } from 'undici'

import { ATLASCLOUD_3D_MODEL, ATLASCLOUD_API_BASE, ATLASCLOUD_API_KEY, OUTBOUND_PROXY_AGENT } from '../config.mjs'
import { parseDataUrl } from '../http-utils.mjs'
import { cacheRemoteModelAs, hasLocalModel, localModelUrl } from '../model-store.mjs'

const MAX_ATLAS_IMAGE_BYTES = 4.5 * 1024 * 1024

export function getAtlasHealth() {
  return {
    configured: Boolean(ATLASCLOUD_API_KEY),
    model: ATLASCLOUD_3D_MODEL,
  }
}

export async function createAtlasTask(payload) {
  requireAtlasKey()
  const image = parseDataUrl(payload.imageDataUrl)

  if (image.buffer.length > MAX_ATLAS_IMAGE_BYTES) {
    throw Object.assign(new Error('Atlas Cloud source images must be 4.5 MB or smaller.'), { status: 400 })
  }

  const raw = await atlasRequest('/model/generateImage', {
    method: 'POST',
    body: JSON.stringify({
      model: ATLASCLOUD_3D_MODEL,
      image: `data:${image.mime};base64,${image.buffer.toString('base64')}`,
      enable_pbr: true,
      enable_geometry: false,
      format: 'GLB',
    }),
  })
  const data = raw.data || raw
  const taskId = data.id || data.request_id || data.requestId

  if (!taskId) {
    throw Object.assign(new Error('Atlas Cloud response did not include a prediction id.'), { detail: sanitizeAtlasRaw(raw) })
  }

  return {
    provider: 'atlas',
    taskId,
    status: normalizeAtlasStatus(data.status),
    raw: sanitizeAtlasRaw(raw),
  }
}

export async function getAtlasTask(taskId) {
  requireAtlasKey()
  if (!taskId) throw Object.assign(new Error('taskId is required.'), { status: 400 })
  const cacheId = `atlas-${taskId}`

  if (await hasLocalModel(cacheId, 'glb')) {
    return {
      provider: 'atlas',
      taskId,
      status: 'success',
      progress: 100,
      modelUrl: localModelUrl(cacheId, 'glb'),
      rawModelUrl: '',
      error: '',
      raw: { cached: true },
    }
  }

  const raw = await atlasRequest(`/model/result/${encodeURIComponent(taskId)}`, { method: 'GET' })
  const data = raw.data || raw
  const status = normalizeAtlasStatus(data.status)
  const rawModelUrl = findAtlasModelUrl(data)
  let modelUrl = ''
  let cacheError = ''

  if (status === 'success' && rawModelUrl) {
    try {
      modelUrl = await cacheRemoteModelAs(cacheId, rawModelUrl, 'glb')
    } catch (error) {
      cacheError = error.message || 'Atlas Cloud model cache failed.'
      modelUrl = `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}`
    }
  }

  return {
    provider: 'atlas',
    taskId,
    status,
    progress: status === 'success' ? 100 : null,
    modelUrl,
    rawModelUrl,
    error: data.error || data.message || (status === 'success' && !rawModelUrl ? 'Atlas Cloud completed without a GLB output.' : cacheError),
    raw: sanitizeAtlasRaw(raw),
  }
}

export function normalizeAtlasStatus(value) {
  const status = String(value || '').toLowerCase()
  if (['completed', 'succeeded', 'success', 'done'].includes(status)) return 'success'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'failed'
  if (['created', 'starting', 'queued', 'pending'].includes(status)) return 'queued'
  return status || 'running'
}

export function findAtlasModelUrl(value) {
  const files = Array.isArray(value?.files) ? value.files : []
  const glbFile = files.find((file) => {
    const type = String(file?.type || file?.content_type || '').toLowerCase()
    return type === 'glb' || type.includes('gltf-binary') || /\.glb(?:$|\?)/i.test(String(file?.url || ''))
  })
  if (glbFile?.url) return glbFile.url

  const outputs = Array.isArray(value?.outputs) ? value.outputs : []
  return outputs.find((url) => /\.glb(?:$|\?)/i.test(String(url))) || ''
}

async function atlasRequest(path, options) {
  let response
  try {
    response = await undiciFetch(`${ATLASCLOUD_API_BASE.replace(/\/$/, '')}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...(OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}),
    })
  } catch (error) {
    throw Object.assign(new Error('Atlas Cloud API is unavailable.'), { detail: error.message })
  }

  const raw = await response.json().catch(() => ({}))
  if (!response.ok || (raw.code && Number(raw.code) !== 200)) {
    throw Object.assign(new Error(raw.message || raw.error || `Atlas Cloud request failed with ${response.status}.`), {
      status: response.status >= 400 && response.status < 500 ? response.status : 502,
      detail: sanitizeAtlasRaw(raw),
    })
  }
  return raw
}

function requireAtlasKey() {
  if (!ATLASCLOUD_API_KEY) {
    throw Object.assign(new Error('ATLASCLOUD_API_KEY is missing. Add it to .env.local or switch provider.'), { status: 400 })
  }
}

function sanitizeAtlasRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw, (key, value) => {
    if (['authorization', 'api_key', 'apikey'].includes(String(key).toLowerCase())) return '[secret omitted]'
    return value
  }))
}
