/**
 * Tripo OpenAPI v3 客户端
 *
 * Base: https://openapi.tripo3d.ai/v3
 * Auth: Authorization: Bearer {api_key}
 *
 * ⚠️ 本模块依据官方文档编写，尚未用真实 API key 实测验证。
 *    上线前请在 .env.local 配好 TRIPO_API_KEY 并跑一次 `npm run compare` 验证。
 *    如有问题，用 TRIPO_API_VERSION=v2 切回已验证的 v2 实现。
 *
 * 与 v2 的差异：
 *   - 上传：v2 走 STS 对象存储 + AWS SigV4 签名；v3 直接 multipart 到 POST /v3/files 拿 file_token（简单很多）
 *   - 端点：v2 是 /task + /task/{id}；v3 是 /v3/generation/* + /v3/tasks/{id}
 *   - 状态：v3 明确为 queued / running / success / failed / cancelled
 *   - 响应包在 { code, data } 里，code !== 0 即为错误
 */

import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fetch as undiciFetch } from 'undici'
import { OUTBOUND_PROXY_AGENT, TRIPO_API_KEY, TRIPO_MODEL_VERSION, hasOutboundProxy } from '../config.mjs'
import { parseDataUrl, sanitizeFileName } from '../http-utils.mjs'
import { cacheRemoteModel, hasLocalModel, localModelPath, localModelUrl } from '../model-store.mjs'
import { findModelUrl, isSuccessStatus } from '../object-utils.mjs'

const V3_BASE = 'https://openapi.tripo3d.ai/v3'

// v3 状态 → 内部统一状态
const STATUS_MAP = {
  queued: 'queued',
  running: 'running',
  success: 'success',
  failed: 'failed',
  cancelled: 'failed',
}

export function getTripoV3Health() {
  return {
    configured: Boolean(TRIPO_API_KEY),
    apiVersion: 'v3',
    base: V3_BASE,
    modelVersion: TRIPO_MODEL_VERSION,
  }
}

/**
 * 按 payload 内容自动选择生成端点：
 *   imageDataUrls[] → multiview-to-model
 *   imageDataUrl    → image-to-model
 *   prompt          → text-to-model
 */
export async function createTripoV3Task(payload) {
  requireKey()

  if (Array.isArray(payload.imageDataUrls) && payload.imageDataUrls.length > 1) {
    const files = []
    for (const [index, dataUrl] of payload.imageDataUrls.entries()) {
      files.push(await uploadSingle(dataUrl, payload.fileName, index))
    }
    return submit('multiview-to-model', { files, ...buildQuality(payload) })
  }

  if (payload.imageDataUrl) {
    const file = await uploadSingle(payload.imageDataUrl, payload.fileName, 0)
    return submit('image-to-model', { file, ...buildQuality(payload) })
  }

  if (payload.prompt) {
    return submit('text-to-model', { prompt: String(payload.prompt).slice(0, 2000), ...buildQuality(payload) })
  }

  throw Object.assign(new Error('Tripo v3 needs imageDataUrl, imageDataUrls, or prompt.'), { status: 400 })
}

export async function getTripoV3Task(taskId) {
  if (!taskId) {
    throw Object.assign(new Error('taskId is required.'), { status: 400 })
  }

  if (await hasLocalModel(taskId, 'glb')) {
    return {
      provider: 'tripo',
      taskId,
      status: 'success',
      progress: 100,
      modelUrl: localModelUrl(taskId, 'glb'),
      rawModelUrl: '',
      error: '',
      raw: { cached: true },
    }
  }

  requireKey()
  const raw = await v3Request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' })
  const data = raw.data || raw
  const status = STATUS_MAP[String(data.status || '').toLowerCase()] || String(data.status || 'unknown').toLowerCase()
  const rawModelUrl = pickV3ModelUrl(data)
  let modelUrl = rawModelUrl ? `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}` : ''
  let cacheError = ''

  if (rawModelUrl && isSuccessStatus(status)) {
    try {
      modelUrl = await cacheRemoteModel(taskId, rawModelUrl)
    } catch (error) {
      cacheError = error.message || 'Model cache failed.'
    }
  }

  return {
    provider: 'tripo',
    taskId,
    status,
    progress: Number.isFinite(data.progress) ? data.progress : null,
    modelUrl,
    rawModelUrl,
    error: data.message || cacheError || '',
    creditsConsumed: data.credits_consumed,
    raw: data,
  }
}

/**
 * v3 的输出在 data.output 里，可能是 model_url 或 pbr_model_url。
 * 显式按顺序取，取不到再退回递归扫描 —— 比纯正则稳，因为 CDN URL 不一定带 .glb 后缀。
 */
export function pickV3ModelUrl(data) {
  const output = data?.output
  if (output && typeof output === 'object') {
    const explicit = output.pbr_model_url || output.model_url || output.base_model_url
    if (typeof explicit === 'string' && /^https?:\/\//i.test(explicit)) return explicit
  }

  return findModelUrl(data)
}

function buildQuality(payload) {
  return {
    model_version: TRIPO_MODEL_VERSION,
    texture: payload.texture !== false,
    pbr: payload.pbr !== false,
    texture_quality: payload.textureQuality || 'standard',
    geometry_quality: payload.geometryQuality || 'standard',
  }
}

async function uploadSingle(dataUrl, baseName, index) {
  const image = parseDataUrl(dataUrl)
  const original = baseName || `reference.${image.ext}`
  const suffix = index > 0 ? `-${index}` : ''
  const fileName = sanitizeFileName(
    index > 0 ? original.replace(/(\.[a-z0-9]+)$/i, `${suffix}$1`) : original,
  )

  const form = new FormData()
  form.append('file', new Blob([image.buffer], { type: image.mime }), fileName)

  const raw = await v3Request('/files', { method: 'POST', body: form })
  const data = raw.data || raw
  const token = data.file_token || data.fileToken || data.token

  if (!token) {
    const error = new Error('Tripo v3 upload response did not include a file_token.')
    error.detail = data
    throw error
  }

  return { type: getUploadType(fileName, image.mime), file_token: token }
}

async function submit(endpoint, body) {
  const raw = await v3Request(`/generation/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = raw.data || raw
  const taskId = data.task_id || data.taskId || data.id

  if (!taskId) {
    const error = new Error('Tripo v3 generation response did not include a task_id.')
    error.detail = data
    throw error
  }

  return {
    provider: 'tripo',
    taskId,
    status: STATUS_MAP[String(data.status || 'queued').toLowerCase()] || 'queued',
    raw: data,
  }
}

/**
 * 后处理端点。全部接受一个 input（file_token / task_id / 公开 URL），
 * 异步返回 task_id，复用 getTripoV3Task 轮询。
 *
 * ⚠️ 同 generate 部分：依据官方文档编写，未经真实 key 实测。
 */
const POSTPROCESS_ENDPOINTS = {
  'mesh.segment': '/mesh/segment',
  'mesh.complete': '/mesh/complete',
  'mesh.decimate': '/mesh/decimate',
  'model.texture': '/models/texture',
  'model.convert': '/models/convert',
  'animate.rig': '/animations/rig',
}

export const TRIPO_POSTPROCESS_CAPABILITIES = Object.keys(POSTPROCESS_ENDPOINTS)

/**
 * @param {string} capability  如 'mesh.decimate'
 * @param {object} payload
 * @param {string} [payload.modelId]   本地缓存里的模型 id，会自动上传拿 file_token
 * @param {string} [payload.sourceTaskId]  直接复用上一次生成任务的 task_id
 * @param {object} [payload.options]   传给该端点的额外参数
 */
export async function createTripoV3PostTask(capability, payload = {}) {
  const endpoint = POSTPROCESS_ENDPOINTS[capability]
  if (!endpoint) {
    throw Object.assign(new Error(`Tripo v3 不支持后处理能力：${capability}`), { status: 400 })
  }

  requireKey()

  const input = await resolveModelInput(payload)
  if (!input) {
    throw Object.assign(
      new Error('后处理需要一个模型来源：给 modelId（本地缓存）或 sourceTaskId（上次生成的任务 id）。'),
      { status: 400 },
    )
  }

  const body = { input, ...(payload.options || {}) }
  const raw = await v3Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = raw.data || raw
  const taskId = data.task_id || data.taskId || data.id
  if (!taskId) {
    const error = new Error(`Tripo v3 ${capability} 响应里没有 task_id。`)
    error.detail = data
    throw error
  }

  return {
    provider: 'tripo',
    taskId,
    status: STATUS_MAP[String(data.status || 'queued').toLowerCase()] || 'queued',
    raw: data,
  }
}

/**
 * 本地模型必须先上传到 Tripo 才能当后处理输入 —— 它访问不到我们的 localhost。
 */
async function resolveModelInput({ sourceTaskId, modelId, filePath, modelUrl }) {
  if (sourceTaskId) return sourceTaskId
  if (typeof modelUrl === 'string' && /^https?:\/\//i.test(modelUrl)) return modelUrl

  const target = filePath || (modelId ? localModelPath(modelId, 'glb') : '')
  if (!target) return ''

  const buffer = await readFile(target)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'model/gltf-binary' }), path.basename(target))

  const raw = await v3Request('/files', { method: 'POST', body: form })
  const data = raw.data || raw
  return data.file_token || data.fileToken || data.token || ''
}

function getUploadType(fileName, mime) {
  const ext = path.extname(fileName || '').replace('.', '').toLowerCase()
  if (ext === 'png' || mime === 'image/png') return 'png'
  if (ext === 'webp' || mime === 'image/webp') return 'webp'
  return 'jpg'
}

function requireKey() {
  if (!TRIPO_API_KEY) {
    throw Object.assign(new Error('TRIPO_API_KEY is not configured on the backend.'), { status: 500 })
  }
}

async function v3Request(requestPath, options = {}) {
  let response

  try {
    response = await undiciFetch(`${V3_BASE}${requestPath}`, {
      ...options,
      ...(OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}),
      headers: {
        Authorization: `Bearer ${TRIPO_API_KEY}`,
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    const wrapped = new Error(`Tripo v3 network request failed: ${error.message}`)
    wrapped.detail = {
      path: requestPath,
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
    data = { message: text || 'Non-JSON response from Tripo.' }
  }

  // v3 统一响应：code === 0 为成功
  if (!response.ok || (typeof data.code === 'number' && data.code !== 0)) {
    const error = new Error(data.message || `Tripo v3 request failed with ${response.status}.`)
    error.status = response.status || 502
    error.code = data.code
    error.detail = data
    throw error
  }

  return data
}
