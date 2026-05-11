import http from 'node:http'
import { createHash, createHmac } from 'node:crypto'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

loadLocalEnv()

const undiciFetch = globalThis.fetch.bind(globalThis)
const API_PORT = Number(process.env.API_PORT || 8787)
const BODY_LIMIT = 28 * 1024 * 1024
const MODEL_UPLOAD_LIMIT = 180 * 1024 * 1024
const TRIPO_API_KEY = process.env.TRIPO_API_KEY
const TRIPO_API_BASE = process.env.TRIPO_API_BASE || 'https://api.tripo3d.ai/v2/openapi'
const TRIPO_MODEL_VERSION = process.env.TRIPO_MODEL_VERSION || 'v3.0-20250812'
const RODIN_API_KEY = process.env.RODIN_API_KEY || 'vibecoding'
const RODIN_API_BASE = process.env.RODIN_API_BASE || 'https://api.hyper3d.com/api/v2'
const RODIN_TIER = process.env.RODIN_TIER || 'Gen-2'
const RODIN_QUALITY = process.env.RODIN_QUALITY || 'medium'
const HUNYUAN_API_BASE = process.env.HUNYUAN_API_BASE || 'http://127.0.0.1:8081'
const HUNYUAN_CREATE_PATH = process.env.HUNYUAN_CREATE_PATH || '/send'
const HUNYUAN_STATUS_PATH = process.env.HUNYUAN_STATUS_PATH || '/status'
const LOCAL_MODEL_DIR = path.resolve(process.env.LOCAL_MODEL_DIR || '.generated-models')
const OUTBOUND_PROXY_AGENT = await createProxyAgent()

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
          tripo: {
            configured: Boolean(TRIPO_API_KEY),
            modelVersion: TRIPO_MODEL_VERSION,
          },
          rodin: {
            configured: Boolean(RODIN_API_KEY),
            baseUrl: RODIN_API_BASE,
            tier: RODIN_TIER,
            quality: RODIN_QUALITY,
            meshMode: 'Raw',
          },
          hunyuan: {
            configured: Boolean(HUNYUAN_API_BASE),
            baseUrl: HUNYUAN_API_BASE,
            createPath: HUNYUAN_CREATE_PATH,
            statusPath: HUNYUAN_STATUS_PATH,
          },
        },
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/3d/generate') {
      const payload = await readJsonBody(request)
      const provider = payload.provider || 'tripo'

      if (provider === 'hunyuan') {
        const task = await createHunyuanTask(payload)
        sendJson(response, 200, task)
        return
      }

      if (provider === 'rodin') {
        const task = await createRodinTask(payload)
        sendJson(response, 200, task)
        return
      }

      requireTripoKey()
      const image = parseDataUrl(payload.imageDataUrl)
      const fileName = sanitizeFileName(payload.fileName || `cell-reference.${image.ext}`)
      const file = await uploadImageToTripo({ ...image, fileName })
      const task = await createTripoImageTask({
        file,
      })

      sendJson(response, 200, {
        provider: 'tripo',
        taskId: task.taskId,
        raw: task.raw,
      })
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/3d/status/')) {
      const taskId = decodeURIComponent(url.pathname.replace('/api/3d/status/', ''))
      const provider = url.searchParams.get('provider') || 'tripo'

      if (provider === 'hunyuan') {
        const task = await getHunyuanTask(taskId)
        sendJson(response, 200, task)
        return
      }

      if (provider === 'rodin') {
        const task = await getRodinTask(taskId)
        sendJson(response, 200, task)
        return
      }

      requireTripoKey()
      const task = await getTripoTask(taskId)
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

server.listen(API_PORT, () => {
  console.log(`Bio demo API running at http://127.0.0.1:${API_PORT}`)
  console.log(TRIPO_API_KEY ? 'Tripo API key loaded from environment.' : 'TRIPO_API_KEY is missing. Add it to .env.local.')
  console.log(RODIN_API_KEY ? 'Rodin API key loaded from environment.' : 'RODIN_API_KEY is missing. Add it to .env.local.')
  console.log(`Hunyuan3D local provider: ${HUNYUAN_API_BASE}`)
})

function loadLocalEnv() {
  if (!existsSync('.env.local')) return

  const env = readFileSync('.env.local', 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    value = value.replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

async function createProxyAgent() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!proxy) return null

  try {
    const { ProxyAgent } = await import('undici')
    return new ProxyAgent(proxy)
  } catch (error) {
    console.warn(`Proxy support unavailable: ${error.message}`)
    return null
  }
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function requireTripoKey() {
  if (!TRIPO_API_KEY) {
    const error = new Error('TRIPO_API_KEY is not configured on the backend.')
    error.status = 500
    throw error
  }
}

function requireRodinKey() {
  if (!RODIN_API_KEY) {
    const error = new Error('RODIN_API_KEY is not configured on the backend.')
    error.status = 500
    throw error
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Image payload is too large.'), { status: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload.'), { status: 400 }))
      }
    })

    request.on('error', reject)
  })
}

function readRawBody(request, limit = MODEL_UPLOAD_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('Model payload is too large.'), { status: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })

    request.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    request.on('error', reject)
  })
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw Object.assign(new Error('imageDataUrl is required.'), { status: 400 })
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/)
  if (!match) {
    throw Object.assign(new Error('Only PNG, JPEG, or WebP image data URLs are supported.'), { status: 400 })
  }

  const mime = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'

  if (buffer.length < 1024) {
    throw Object.assign(new Error('Image is too small for 3D generation.'), { status: 400 })
  }

  return { mime, buffer, ext }
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^\w.\- ]+/g, '').trim() || 'cell-reference.png'
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

function normalizeTaskCreateResponse(raw) {
  const taskId = findFirstValue(raw, ['task_id', 'taskId', 'id'])
  if (!taskId) {
    const error = new Error('Tripo task response did not include a task id.')
    error.detail = raw
    throw error
  }

  return { taskId, raw }
}

async function getTripoTask(taskId) {
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

async function createRodinTask(payload) {
  requireRodinKey()

  const image = parseDataUrl(payload.imageDataUrl)
  const fileName = sanitizeFileName(payload.fileName || `cell-reference.${image.ext}`)
  const form = new FormData()
  form.append('images', new Blob([image.buffer], { type: image.mime }), fileName)
  form.append('geometry_file_format', 'glb')
  form.append('material', 'PBR')
  form.append('quality', payload.quality || RODIN_QUALITY)
  form.append('tier', payload.tier || RODIN_TIER)
  form.append('mesh_mode', 'Raw')

  if (payload.prompt) form.append('prompt', payload.prompt)

  const raw = await rodinRequest('/rodin', {
    method: 'POST',
    body: form,
  })
  const taskUuid = findFirstValue(raw, ['uuid', 'task_uuid', 'taskUuid', 'taskId', 'id'])
  const subscriptionKey = findFirstValue(raw.jobs || raw, ['subscription_key', 'subscriptionKey'])

  if (!taskUuid) {
    const error = new Error('Rodin task response did not include a task uuid.')
    error.detail = sanitizeRodinRaw(raw)
    throw error
  }

  if (!subscriptionKey) {
    const error = new Error('Rodin task response did not include a subscription key.')
    error.detail = sanitizeRodinRaw(raw)
    throw error
  }

  return {
    provider: 'rodin',
    taskId: encodeRodinTaskId({ taskUuid, subscriptionKey }),
    status: 'queued',
    raw: sanitizeRodinRaw(raw),
  }
}

async function getRodinTask(taskId) {
  requireRodinKey()

  if (!taskId) {
    throw Object.assign(new Error('taskId is required.'), { status: 400 })
  }

  const rodinTask = decodeRodinTaskId(taskId)
  if (await hasLocalModel(rodinTask.taskUuid, 'glb')) {
    return {
      provider: 'rodin',
      taskId,
      status: 'success',
      progress: 100,
      modelUrl: localModelUrl(rodinTask.taskUuid, 'glb'),
      rawModelUrl: '',
      error: '',
      raw: { cached: true },
    }
  }

  const raw = await rodinRequest('/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription_key: rodinTask.subscriptionKey }),
  })
  const jobs = Array.isArray(raw.jobs) ? raw.jobs : []
  const statuses = jobs.map((job) => job.status).filter(Boolean)
  const status = normalizeRodinStatus(statuses)
  let modelUrl = ''
  let rawModelUrl = ''
  let cacheError = ''

  if (status === 'success') {
    try {
      const download = await getRodinDownload(rodinTask.taskUuid)
      rawModelUrl = download.url
      modelUrl = await cacheRemoteModelAs(rodinTask.taskUuid, rawModelUrl, download.ext)
    } catch (error) {
      cacheError = error.message || 'Rodin model download failed.'
    }
  }

  return {
    provider: 'rodin',
    taskId,
    status,
    progress: getRodinProgress(status, jobs),
    modelUrl,
    rawModelUrl,
    error: raw.error || cacheError || '',
    raw: sanitizeRodinRaw(raw),
  }
}

async function getRodinDownload(taskUuid) {
  const raw = await rodinRequest('/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_uuid: taskUuid }),
  })
  const items = Array.isArray(raw.list) ? raw.list : []
  const item = items.find((entry) => /\.glb(?:[?#]|$)/i.test(entry.name || entry.url || ''))
    || items.find((entry) => /\.gltf(?:[?#]|$)/i.test(entry.name || entry.url || ''))
    || items.find((entry) => /^https?:\/\//i.test(entry.url || ''))

  if (!item?.url) {
    const error = new Error('Rodin download response did not include a model URL.')
    error.detail = sanitizeRodinRaw(raw)
    throw error
  }

  const ext = /\.gltf(?:[?#]|$)/i.test(item.name || item.url) ? 'gltf' : 'glb'
  return { url: item.url, ext, raw }
}

function normalizeRodinStatus(statuses) {
  const values = (Array.isArray(statuses) ? statuses : [statuses]).map((status) => String(status || '').trim().toLowerCase())
  if (!values.length) return 'running'
  if (values.some((status) => ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status))) return 'failed'
  if (values.every((status) => ['done', 'success', 'succeeded', 'completed', 'complete', 'finish', 'finished'].includes(status))) return 'success'
  if (values.some((status) => ['waiting', 'queued', 'pending'].includes(status))) return 'queued'
  return 'running'
}

function getRodinProgress(status, jobs) {
  if (status === 'success') return 100
  if (status === 'queued') return 0
  if (!Array.isArray(jobs) || !jobs.length) return null

  const done = jobs.filter((job) => normalizeRodinStatus(job.status) === 'success').length
  if (!done) return null
  return Math.round((done / jobs.length) * 100)
}

function encodeRodinTaskId(task) {
  return `rodin-${Buffer.from(JSON.stringify(task)).toString('base64url')}`
}

function decodeRodinTaskId(taskId) {
  const raw = String(taskId || '')
  if (!raw.startsWith('rodin-')) {
    return { taskUuid: raw, subscriptionKey: raw }
  }

  try {
    const parsed = JSON.parse(Buffer.from(raw.slice(6), 'base64url').toString('utf8'))
    return {
      taskUuid: parsed.taskUuid || parsed.uuid || raw,
      subscriptionKey: parsed.subscriptionKey || parsed.subscription_key || parsed.taskUuid || raw,
    }
  } catch {
    return { taskUuid: raw, subscriptionKey: raw }
  }
}

async function createHunyuanTask(payload) {
  const image = parseDataUrl(payload.imageDataUrl)
  const imageBase64 = image.buffer.toString('base64')
  const requestBody = {
    image: `data:${image.mime};base64,${imageBase64}`,
    image_base64: imageBase64,
    prompt: payload.prompt || '',
    seed: payload.seed ?? 1234,
    remove_background: payload.removeBackground ?? true,
    texture: payload.texture ?? true,
    pbr: payload.pbr ?? true,
    octree_resolution: payload.octreeResolution ?? 256,
    num_inference_steps: payload.numInferenceSteps ?? 50,
    guidance_scale: payload.guidanceScale ?? 5.5,
    face_count: payload.faceCount ?? 60000,
  }

  const raw = await hunyuanRequest(HUNYUAN_CREATE_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  const data = raw.data || raw
  const taskId = findFirstValue(data, ['uid', 'task_id', 'taskId', 'id']) || `hunyuan-${Date.now()}`
  const rawModelUrl = findModelUrl(data)
  const modelBase64 = findFirstValue(data, ['model_base64', 'modelBase64', 'glb_base64', 'glbBase64'])
  let modelUrl = rawModelUrl ? `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}` : ''

  if (modelBase64) {
    await saveLocalModel(taskId, modelBase64, 'glb')
    modelUrl = localModelUrl(taskId, 'glb')
  }

  return {
    provider: 'hunyuan',
    taskId,
    status: modelUrl ? 'success' : 'queued',
    modelUrl,
    raw: sanitizeHunyuanRaw(raw),
  }
}

async function getHunyuanTask(taskId) {
  if (!taskId) {
    throw Object.assign(new Error('taskId is required.'), { status: 400 })
  }

  if (await hasLocalModel(taskId, 'glb')) {
    return {
      provider: 'hunyuan',
      taskId,
      status: 'success',
      progress: 100,
      modelUrl: localModelUrl(taskId, 'glb'),
      rawModelUrl: '',
      error: '',
      raw: {},
    }
  }

  const raw = await hunyuanRequest(`${HUNYUAN_STATUS_PATH}/${encodeURIComponent(taskId)}`, { method: 'GET' })
  const data = raw.data || raw
  const status = normalizeHunyuanStatus(data.status || data.task_status || data.state || data.message || 'running')
  const progress = data.progress ?? data.percent ?? null
  const rawModelUrl = findModelUrl(data)
  const modelBase64 = findFirstValue(data, ['model_base64', 'modelBase64', 'glb_base64', 'glbBase64'])
  let modelUrl = rawModelUrl ? `/api/3d/model?url=${encodeURIComponent(rawModelUrl)}` : ''

  if (modelBase64) {
    await saveLocalModel(taskId, modelBase64, 'glb')
    modelUrl = localModelUrl(taskId, 'glb')
  }

  return {
    provider: 'hunyuan',
    taskId,
    status,
    progress,
    modelUrl,
    rawModelUrl,
    error: data.error || data.message || '',
    raw: sanitizeHunyuanRaw(raw),
  }
}

async function hunyuanRequest(pathname, options = {}) {
  let response
  try {
    response = await undiciFetch(`${HUNYUAN_API_BASE.replace(/\/$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, options)
  } catch (error) {
    const wrapped = new Error(`Hunyuan3D local server unavailable at ${HUNYUAN_API_BASE}. Start the local Hunyuan3D API server or switch provider.`)
    wrapped.detail = {
      path: pathname,
      cause: error.cause?.message || error.cause?.code || error.message,
    }
    throw wrapped
  }

  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text || 'Non-JSON response from Hunyuan3D.' }
  }

  if (!response.ok || (typeof data.code === 'number' && data.code !== 0)) {
    const error = new Error(data.message || data.error || `Hunyuan3D request failed with ${response.status}.`)
    error.status = response.status || 502
    error.detail = sanitizeHunyuanRaw(data)
    throw error
  }

  return data
}

function normalizeHunyuanStatus(status) {
  const value = String(status || '').toLowerCase()
  if (['success', 'succeeded', 'completed', 'complete', 'done', 'finish', 'finished'].includes(value)) return 'success'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(value)) return 'failed'
  if (['queued', 'pending', 'waiting'].includes(value)) return 'queued'
  return 'running'
}

function isSuccessStatus(status) {
  return ['success', 'succeeded', 'completed', 'complete', 'done', 'finish', 'finished'].includes(String(status || '').toLowerCase())
}

function parseModelBase64(modelBase64) {
  const raw = String(modelBase64 || '').replace(/^data:.*?;base64,/, '')
  return Buffer.from(raw, 'base64')
}

async function saveLocalModel(taskId, modelData, ext = 'glb') {
  const buffer = Buffer.isBuffer(modelData) ? modelData : parseModelBase64(modelData)
  validateModelBuffer(buffer, ext)

  await mkdir(LOCAL_MODEL_DIR, { recursive: true })
  await writeFile(localModelPath(taskId, ext), buffer)
}

async function hasLocalModel(taskId, ext = 'glb') {
  try {
    await access(localModelPath(taskId, ext))
    return true
  } catch {
    return false
  }
}

function localModelPath(taskId, ext = 'glb') {
  return path.join(LOCAL_MODEL_DIR, `${sanitizeModelId(taskId)}.${ext}`)
}

function localModelUrl(taskId, ext = 'glb') {
  return `/api/3d/local-model/${encodeURIComponent(sanitizeModelId(taskId))}.${ext}`
}

async function serveLocalModel(url, response) {
  const rawFileName = decodeURIComponent(url.pathname.replace('/api/3d/local-model/', ''))
  const ext = getModelExtension(rawFileName)
  const modelId = rawFileName.replace(/\.(?:glb|gltf)$/i, '')
  const buffer = await readFile(localModelPath(modelId, ext))
  response.writeHead(200, {
    'Content-Type': ext === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary',
    'Cache-Control': 'private, max-age=3600',
  })
  response.end(buffer)
}

async function importLocalModel(request, url) {
  const fileName = sanitizeFileName(url.searchParams.get('fileName') || 'local-model.glb')
  const ext = getModelExtension(fileName)
  const buffer = await readRawBody(request, MODEL_UPLOAD_LIMIT)
  validateModelBuffer(buffer, ext)

  const baseName = fileName.replace(/\.(?:glb|gltf)$/i, '') || 'local-model'
  const modelId = `local-${Date.now()}-${baseName}`
  await saveLocalModel(modelId, buffer, ext)

  return {
    provider: 'local',
    taskId: sanitizeModelId(modelId),
    status: 'success',
    progress: 100,
    modelUrl: localModelUrl(modelId, ext),
    rawModelUrl: '',
    fileName,
  }
}

async function cacheRemoteModel(taskId, rawModelUrl) {
  return cacheRemoteModelAs(taskId, rawModelUrl, getModelExtension(rawModelUrl))
}

async function cacheRemoteModelAs(taskId, rawModelUrl, ext = 'glb') {
  if (await hasLocalModel(taskId, ext)) return localModelUrl(taskId, ext)

  await mkdir(LOCAL_MODEL_DIR, { recursive: true })
  const targetPath = localModelPath(taskId, ext)
  const tempPath = `${targetPath}.${Date.now()}.tmp`

  try {
    const remote = await fetchRemoteModel(rawModelUrl)
    await pipeline(Readable.fromWeb(remote.body), createWriteStream(tempPath))
    const buffer = await readFile(tempPath)
    validateModelBuffer(buffer, ext)
    await rename(tempPath, targetPath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  return localModelUrl(taskId, ext)
}

async function fetchRemoteModel(rawUrl) {
  const fetchOptions = shouldUseProxy(rawUrl) && OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}
  const remote = await undiciFetch(rawUrl, fetchOptions)
  if (remote.ok && remote.body) return remote

  const retry = await undiciFetch(rawUrl, {
    headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
    ...fetchOptions,
  })
  if (retry.ok && retry.body) return retry

  throw Object.assign(new Error(`Model download failed with ${retry.status || remote.status}.`), { status: 502 })
}

function getModelExtension(value) {
  const pathname = /^https?:\/\//i.test(String(value)) ? new URL(value).pathname : String(value)
  const ext = path.extname(pathname).replace('.', '').toLowerCase()
  if (ext === 'gltf') return 'gltf'
  if (ext === 'glb') return 'glb'
  throw Object.assign(new Error('Only GLB or self-contained GLTF models are supported.'), { status: 400 })
}

function validateModelBuffer(buffer, ext = 'glb') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    throw Object.assign(new Error('Model file is too small or invalid.'), { status: 400 })
  }

  if (ext === 'glb') {
    if (buffer.subarray(0, 4).toString('ascii') !== 'glTF') {
      throw Object.assign(new Error('GLB files must start with a glTF binary header.'), { status: 400 })
    }
    return
  }

  try {
    JSON.parse(buffer.toString('utf8'))
  } catch {
    throw Object.assign(new Error('GLTF files must be valid JSON.'), { status: 400 })
  }
}

function sanitizeModelId(value) {
  return sanitizeFileName(String(value)).replace(/\.(?:glb|gltf)$/i, '').replace(/\s+/g, '-').slice(0, 96) || `model-${Date.now()}`
}

function sanitizeHunyuanRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw, (key, value) => {
    if (['model_base64', 'modelBase64', 'glb_base64', 'glbBase64'].includes(key)) return '[base64 omitted]'
    return value
  }))
}

function sanitizeTripoRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw, (key, value) => {
    if (['sts_ak', 'sts_sk', 'session_token'].includes(key)) return '[secret omitted]'
    return value
  }))
}

function sanitizeRodinRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return JSON.parse(JSON.stringify(raw))
}

async function proxyModel(url, response) {
  const rawUrl = url.searchParams.get('url')
  if (!rawUrl || !isAllowedProxyModelUrl(rawUrl)) {
    throw Object.assign(new Error('A valid HTTPS or localhost model URL is required.'), { status: 400 })
  }

  const fetchOptions = shouldUseProxy(rawUrl) && OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}
  const remote = await undiciFetch(rawUrl, fetchOptions)
  if (!remote.ok || !remote.body) {
    const retry = await undiciFetch(rawUrl, {
      headers: { Authorization: `Bearer ${TRIPO_API_KEY}` },
      ...fetchOptions,
    })
    if (!retry.ok || !retry.body) {
      throw Object.assign(new Error(`Model download failed with ${retry.status || remote.status}.`), { status: 502 })
    }
    await streamRemoteModel(retry, response)
    return
  }

  await streamRemoteModel(remote, response)
}

function isAllowedProxyModelUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol !== 'http:') return false
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

async function streamRemoteModel(remote, response) {
  response.writeHead(200, {
    'Content-Type': remote.headers.get('content-type') || 'model/gltf-binary',
    'Cache-Control': 'private, max-age=3600',
  })

  await pipeline(Readable.fromWeb(remote.body), response)
}

async function tripoRequest(path, options = {}) {
  let response
  try {
    response = await undiciFetch(`${TRIPO_API_BASE}${path}`, {
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
      path,
      cause: error.cause?.message || error.cause?.code || '',
      proxy: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
    }
    throw wrapped
  }
  const text = await response.text()
  let data = {}
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

async function rodinRequest(path, options = {}) {
  let response
  try {
    response = await undiciFetch(`${RODIN_API_BASE.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      ...(OUTBOUND_PROXY_AGENT ? { dispatcher: OUTBOUND_PROXY_AGENT } : {}),
      headers: {
        Authorization: `Bearer ${RODIN_API_KEY}`,
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    const wrapped = new Error(`Rodin network request failed: ${error.message}`)
    wrapped.detail = {
      path,
      cause: error.cause?.message || error.cause?.code || '',
      proxy: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy),
    }
    throw wrapped
  }

  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text || 'Non-JSON response from Rodin.' }
  }

  if (!response.ok || data.error) {
    const error = new Error(data.message || data.error || `Rodin request failed with ${response.status}.`)
    error.status = response.status || 502
    error.detail = sanitizeRodinRaw(data)
    throw error
  }

  return data
}

function shouldUseProxy(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    return !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
  } catch {
    return true
  }
}

function findFirstValue(value, keys) {
  if (!value || typeof value !== 'object') return ''

  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key]) return value[key]
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findFirstValue(item, keys)
        if (found) return found
      }
    } else if (child && typeof child === 'object') {
      const found = findFirstValue(child, keys)
      if (found) return found
    }
  }

  return ''
}

function findModelUrl(value) {
  const urls = []
  collectUrls(value, urls)

  const glb = urls.find((url) => /\.glb(?:[?#]|$)/i.test(url))
  if (glb) return glb

  return urls.find((url) => /\.(?:gltf|fbx|obj)(?:[?#]|$)/i.test(url)) || ''
}

function collectUrls(value, urls) {
  if (!value) return

  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) urls.push(value)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls))
    return
  }

  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, urls))
  }
}
