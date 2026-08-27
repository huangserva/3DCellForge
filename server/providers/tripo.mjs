import { createHash, createHmac } from 'node:crypto'
import path from 'node:path'
import { fetch as undiciFetch } from 'undici'
import { OUTBOUND_PROXY_AGENT, TRIPO_API_BASE, TRIPO_API_KEY, TRIPO_API_VERSION, TRIPO_MODEL_VERSION, hasOutboundProxy } from '../config.mjs'
import { parseDataUrl, sanitizeFileName } from '../http-utils.mjs'
import { cacheRemoteModel, hasLocalModel, localModelUrl, shouldUseProxy } from '../model-store.mjs'
import { findFirstValue, findModelUrl, isSuccessStatus } from '../object-utils.mjs'
import { createTripoV3Task, getTripoV3Health, getTripoV3Task } from './tripo-v3.mjs'

const USE_V3 = TRIPO_API_VERSION !== 'v2'

export function getTripoHealth() {
  const base = USE_V3 ? getTripoV3Health() : {
    configured: Boolean(TRIPO_API_KEY),
    apiVersion: 'v2',
    base: TRIPO_API_BASE,
    modelVersion: TRIPO_MODEL_VERSION,
  }

  return { ...base, v3Available: true }
}

// v3 为默认路径；TRIPO_API_VERSION=v2 回退到已验证的旧实现
export function createTripoTask(payload) {
  return USE_V3 ? createTripoV3Task(payload) : createTripoV2Task(payload)
}

export function getTripoTask(taskId) {
  return USE_V3 ? getTripoV3Task(taskId) : getTripoV2Task(taskId)
}

async function createTripoV2Task(payload) {
  requireTripoKey()
  const image = parseDataUrl(payload.imageDataUrl)
  const fileName = sanitizeFileName(payload.fileName || `cell-reference.${image.ext}`)
  const file = await uploadImageToTripo({ ...image, fileName })
  const task = await createTripoImageTask({ file })

  return {
    provider: 'tripo',
    taskId: task.taskId,
    raw: task.raw,
  }
}

async function getTripoV2Task(taskId) {
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

  requireTripoKey()
  const raw = await tripoRequest(`/task/${encodeURIComponent(taskId)}`, { method: 'GET' })
  const data = raw.data || raw
  const status = data.status || data.task_status || data.state || 'unknown'
  const rawModelUrl = findModelUrl(data)
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
    progress: data.progress ?? data.percent ?? null,
    modelUrl,
    rawModelUrl,
    error: data.error || cacheError || '',
    raw,
  }
}

function requireTripoKey() {
  if (!TRIPO_API_KEY) {
    const error = new Error('TRIPO_API_KEY is not configured on the backend.')
    error.status = 500
    throw error
  }
}

async function uploadImageToTripo({ buffer, mime, fileName }) {
  const format = getTripoUploadFormat(fileName, mime)
  const tokenResult = await tripoRequest('/upload/sts/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  })
  const tokenData = tokenResult.data || tokenResult
  const host = tokenData.s3_host
  const bucket = tokenData.resource_bucket
  const key = tokenData.resource_uri

  if (!host || !bucket || !key || !tokenData.sts_ak || !tokenData.sts_sk || !tokenData.session_token) {
    const error = new Error('Tripo STS upload token response is missing required fields.')
    error.detail = sanitizeTripoRaw(tokenResult)
    throw error
  }

  await uploadToTripoObjectStorage({
    buffer,
    mime,
    host,
    bucket,
    key,
    accessKeyId: tokenData.sts_ak,
    secretAccessKey: tokenData.sts_sk,
    sessionToken: tokenData.session_token,
  })

  return {
    type: 'jpg',
    object: {
      bucket,
      key,
    },
  }
}

async function createTripoImageTask({ file }) {
  const payload = {
    type: 'image_to_model',
    model_version: TRIPO_MODEL_VERSION,
    file,
    texture: true,
    pbr: true,
    texture_quality: 'standard',
    geometry_quality: 'standard',
    enable_image_autofix: true,
  }

  try {
    return normalizeTaskCreateResponse(await tripoRequest('/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  } catch {
    const minimalPayload = {
      type: 'image_to_model',
      file,
    }

    return normalizeTaskCreateResponse(await tripoRequest('/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalPayload),
    }))
  }
}

function getTripoUploadFormat(fileName, mime) {
  const ext = path.extname(fileName).replace('.', '').toLowerCase()
  if (ext === 'png' || mime === 'image/png') return 'png'
  if (ext === 'webp' || mime === 'image/webp') return 'webp'
  return 'jpeg'
}

async function uploadToTripoObjectStorage({ buffer, mime, host, bucket, key, accessKeyId, secretAccessKey, sessionToken }) {
  const region = getAwsRegionFromS3Host(host)
  const amzDate = getAwsDate()
  const date = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(buffer)
  const canonicalUri = `/${bucket}/${encodeAwsPath(key)}`
  const headers = {
    'content-type': mime,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'x-amz-security-token': sessionToken,
  }
  const signedHeaderNames = Object.keys(headers).sort()
  const signedHeaders = signedHeaderNames.join(';')
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${String(headers[name]).trim()}\n`).join('')
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${date}/${region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const fetchOptions = shouldUseProxy(`https://${host}`) && OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}
  const response = await undiciFetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    ...fetchOptions,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: buffer,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const error = new Error(`Tripo object upload failed with ${response.status}.`)
    error.status = response.status || 502
    error.detail = detail.slice(0, 500)
    throw error
  }
}

function normalizeTaskCreateResponse(raw) {
  const taskId = findFirstValue(raw, ['task_id', 'taskId', 'id'])
  if (!taskId) {
    const error = new Error('Tripo task response did not include a task id.')
    error.detail = raw
    throw error
  }

  return { taskId, raw }
}

async function tripoRequest(requestPath, options = {}) {
  let response
  try {
    response = await undiciFetch(`${TRIPO_API_BASE}${requestPath}`, {
      ...options,
      ...(OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}),
      headers: {
        Authorization: `Bearer ${TRIPO_API_KEY}`,
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    const wrapped = new Error(`Tripo network request failed: ${error.message}`)
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

  if (!response.ok || (typeof data.code === 'number' && data.code !== 0)) {
    const error = new Error(data.message || data.error || `Tripo request failed with ${response.status}.`)
    error.status = response.status || 502
    error.detail = data
    throw error
  }

  return data
}

function sanitizeTripoRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw, (key, value) => {
    if (['sts_ak', 'sts_sk', 'session_token'].includes(key)) return '[secret omitted]'
    return value
  }))
}

function getAwsRegionFromS3Host(host) {
  return host.match(/s3[.-]([a-z0-9-]+)\./)?.[1] || 'us-west-2'
}

function getAwsDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function encodeAwsPath(value) {
  return String(value).split('/').map((part) => encodeURIComponent(part)).join('/')
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest()
}
