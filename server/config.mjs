import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ProxyAgent } from 'undici'

loadLocalEnv()

export const API_PORT = Number(process.env.API_PORT || 8787)
export const API_HOST = process.env.API_HOST || '127.0.0.1'
export const BODY_LIMIT = 28 * 1024 * 1024
export const MODEL_UPLOAD_LIMIT = 180 * 1024 * 1024
export const TRIPO_API_KEY = process.env.TRIPO_API_KEY
export const TRIPO_API_BASE = process.env.TRIPO_API_BASE || 'https://api.tripo3d.ai/v2/openapi'
export const TRIPO_MODEL_VERSION = process.env.TRIPO_MODEL_VERSION || 'v3.0-20250812'
// v3（默认，官方现版本：openapi.tripo3d.ai/v3）或 v2（已验证的旧实现）
// v3 尚未用真实 key 实测，如遇问题设 TRIPO_API_VERSION=v2 回退
export const TRIPO_API_VERSION = String(process.env.TRIPO_API_VERSION || 'v3').toLowerCase()
export const RODIN_API_KEY = process.env.RODIN_API_KEY
export const RODIN_API_BASE = process.env.RODIN_API_BASE || 'https://api.hyper3d.com/api/v2'
export const RODIN_TIER = process.env.RODIN_TIER || 'Gen-2'
export const RODIN_QUALITY = process.env.RODIN_QUALITY || 'medium'
export const RODIN_MESH_MODE = process.env.RODIN_MESH_MODE || 'Raw'
export const RODIN_MATERIAL = process.env.RODIN_MATERIAL || 'PBR'
export const HUNYUAN_API_BASE = process.env.HUNYUAN_API_BASE || 'http://127.0.0.1:8081'
export const HUNYUAN_CREATE_PATH = process.env.HUNYUAN_CREATE_PATH || '/send'
export const HUNYUAN_STATUS_PATH = process.env.HUNYUAN_STATUS_PATH || '/status'
export const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_KEY
// 默认用已验证的 Hi3D V3.0；与前端 appConfig.js 的 DEFAULT_FAL_MODEL 保持一致
export const FAL_DEFAULT_MODEL = process.env.FAL_DEFAULT_MODEL || 'fal-ai/hitem3d/hi3d/v3.0/image-to-3d'
export const VISION_PROVIDER = process.env.VISION_PROVIDER || 'openai'
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY
export const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
export const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini'
export const LOCAL_MODEL_DIR = path.resolve(process.env.LOCAL_MODEL_DIR || '.generated-models')
// 能力路由开关。设为 off 时走原有的 if-else dispatch，新逻辑完全不参与。
// 这是 registry 重构期间的安全阀 —— 任何时刻都能一键回退到已验证的路径。
export const CAPABILITY_ROUTER = String(process.env.CAPABILITY_ROUTER || 'on').toLowerCase() !== 'off'
export const LOG_DIR = path.resolve(process.env.LOG_DIR || '.logs')
export const LOG_FILE = path.resolve(LOG_DIR, process.env.LOG_FILE || '3d-model-studio-api.log')
export const OUTBOUND_PROXY_AGENT = createProxyAgent()

export function hasOutboundProxy() {
  return Boolean(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy)
}

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

function createProxyAgent() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (!proxy) return null

  return new ProxyAgent(proxy)
}
