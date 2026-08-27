#!/usr/bin/env node
/**
 * 多引擎横评 —— 这是能力注册表的验收脚本。
 *
 * 它存在的意义不只是"比个高低"：横评是注册表最好的压力测试。
 * 如果某个 provider 声明支持某能力、实际调用却对不上，跑一次就会暴露。
 *
 * 用法：
 *   npm run compare -- --image ./reference.png
 *   npm run compare -- --image ./reference.png --providers tripo,fal
 *   npm run compare -- --capability generate.image-to-model --dry-run
 *   npm run compare -- --image ./ref.png --prefer fastest
 *
 * 依赖 .env.local 里配好的 key。未配置的引擎会自动跳过并明确提示。
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { existsSync, statSync } from 'node:fs'

import { LOCAL_MODEL_DIR } from '../server/config.mjs'
import { CAPABILITIES, getCapability, route } from '../server/providers/registry.mjs'

const POLL_INTERVAL_MS = 3500
const POLL_TIMEOUT_MS = 8 * 60 * 1000

const args = parseArgs(process.argv.slice(2))
const capability = args.capability || 'generate.image-to-model'
const prefer = args.prefer || 'balanced'

main().catch((error) => {
  console.error(`\n横评失败：${error.message}`)
  if (error.detail) console.error(JSON.stringify(error.detail, null, 2))
  process.exit(1)
})

async function main() {
  if (!CAPABILITIES[capability]) {
    throw new Error(`未知能力 "${capability}"。可用：${Object.keys(CAPABILITIES).join(', ')}`)
  }

  const candidates = route(capability, { prefer })
  console.log(`\n能力：${capability}  (${CAPABILITIES[capability].label})`)
  console.log(`偏好：${prefer}`)
  console.log(`\n候选引擎（按偏好排序）：`)
  for (const c of candidates) {
    const flag = c.configured ? '已配置' : '未配置 key'
    const perf = c.perf ? `speed=${c.perf.speed} quality=${c.perf.quality} cost=${c.perf.cost}` : ''
    console.log(`  ${c.configured ? '●' : '○'} ${c.providerId.padEnd(10)} ${String(flag).padEnd(12)} score=${String(c.score).padEnd(6)} ${perf}`)
  }

  const selected = args.providers
    ? candidates.filter((c) => args.providers.includes(c.providerId))
    : candidates.filter((c) => c.configured)

  if (args.dryRun) {
    console.log('\n--dry-run：不实际调用，以上为注册表当前状态。')
    return
  }

  if (!selected.length) {
    console.log('\n没有可用的引擎。请在 .env.local 配置至少一个 API key。')
    return
  }

  if (!args.image) {
    throw new Error('需要 --image 参数指向一张参考图。加 --dry-run 可只看候选列表。')
  }

  const imageDataUrl = await loadImageAsDataUrl(args.image)
  console.log(`\n参考图：${args.image}`)
  console.log(`参与引擎：${selected.map((c) => c.providerId).join(', ')}`)
  console.log('\n开始生成（并行）…\n')

  const startedAt = Date.now()

  // 在 runOne 内部兜住异常，这样即使某个引擎炸了也知道是谁炸的
  const results = await Promise.all(
    selected.map(async (candidate) => {
      const begin = Date.now()
      try {
        return await runOne(candidate, capability, imageDataUrl, args.image)
      } catch (error) {
        return {
          providerId: candidate.providerId,
          status: 'error',
          durationMs: Date.now() - begin,
          modelUrl: '',
          bytes: 0,
          error: error.message || String(error),
        }
      }
    }),
  )

  printTable(results, Date.now() - startedAt)
}

async function runOne(candidate, capabilityId, imageDataUrl, imagePath) {
  const entry = getCapability(candidate.providerId, capabilityId)
  if (!entry) throw new Error(`${candidate.providerId} 声明了 ${capabilityId} 但注册表里取不到实现。`)

  const startedAt = Date.now()
  const created = await entry.create({
    imageDataUrl,
    fileName: path.basename(imagePath),
    capability: capabilityId,
  })

  if (!created?.taskId) {
    throw new Error(`${candidate.providerId} 创建任务未返回 taskId。`)
  }

  const task = await pollUntilDone(entry, created.taskId)

  return {
    providerId: candidate.providerId,
    status: task.status,
    durationMs: Date.now() - startedAt,
    modelUrl: task.modelUrl || '',
    bytes: getLocalModelBytes(task.modelUrl),
    credits: task.creditsConsumed,
    error: task.error || '',
  }
}

async function pollUntilDone(entry, taskId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let last = null

  while (Date.now() < deadline) {
    last = await entry.get(taskId)

    if (['success', 'failed', 'cancelled'].includes(String(last.status).toLowerCase())) {
      return last
    }

    await sleep(POLL_INTERVAL_MS)
  }

  return { ...(last || {}), status: 'timeout', error: `轮询超过 ${POLL_TIMEOUT_MS / 1000}s 未结束。`, taskId }
}

function printTable(results, totalMs) {
  console.log('┌────────────┬──────────┬──────────┬──────────┬──────────────────────────────┐')
  console.log('│ 引擎       │ 状态     │ 耗时     │ 体积     │ 备注                         │')
  console.log('├────────────┼──────────┼──────────┼──────────┼──────────────────────────────┤')

  for (const row of results) {
    const provider = String(row.providerId || '').padEnd(10)
    const status = String(row.status || '').padEnd(8)
    const duration = formatDuration(row.durationMs).padEnd(8)
    const size = formatBytes(row.bytes).padEnd(8)
    const note = String(row.error || row.modelUrl || '').slice(0, 28).padEnd(28)
    console.log(`│ ${provider} │ ${status} │ ${duration} │ ${size} │ ${note} │`)
  }

  console.log('└────────────┴──────────┴──────────┴──────────┴──────────────────────────────┘')
  console.log(`\n总耗时 ${formatDuration(totalMs)}`)

  const ok = results.filter((row) => row.status === 'success')
  const failed = results.filter((row) => row.status !== 'success')

  if (ok.length > 1) {
    const fastest = ok.reduce((a, b) => (a.durationMs < b.durationMs ? a : b))
    console.log(`最快：${fastest.providerId}（${formatDuration(fastest.durationMs)}）`)
  }

  if (failed.length) {
    console.log(`失败 ${failed.length} 项：${failed.map((row) => `${row.providerId}(${row.status})`).join(', ')}`)
  }
}

async function loadImageAsDataUrl(imagePath) {
  const resolved = path.resolve(imagePath)
  if (!existsSync(resolved)) throw new Error(`找不到图片：${resolved}`)

  const buffer = await readFile(resolved)
  const ext = path.extname(resolved).replace('.', '').toLowerCase()
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * 模型已缓存到本地时直接量文件大小；远端 URL 就没法在不下载的情况下知道，返回 0。
 */
function getLocalModelBytes(modelUrl) {
  const match = String(modelUrl || '').match(/\/api\/3d\/local-model\/(.+)$/)
  if (!match) return 0

  try {
    const filePath = path.join(LOCAL_MODEL_DIR, match[1])
    return existsSync(filePath) ? statSync(filePath).size : 0
  } catch {
    return 0
  }
}

function formatDuration(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 60000) return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`
  return `${Math.max(1, Math.round(value / 1000))}s`
}

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`
  return `${Math.round(value / 1000)} KB`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseArgs(argv) {
  const parsed = { providers: null }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue

    const key = token.slice(2)
    const next = argv[index + 1]

    if (key === 'dry-run') {
      parsed.dryRun = true
      continue
    }

    if (key === 'providers') {
      parsed.providers = String(next || '').split(',').map((v) => v.trim()).filter(Boolean)
      index += 1
      continue
    }

    parsed[key] = next
    index += 1
  }

  return parsed
}
