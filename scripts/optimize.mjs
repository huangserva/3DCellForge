#!/usr/bin/env node
/**
 * 本地资产优化 CLI —— 不需要任何 API key。
 *
 * 用法：
 *   npm run optimize -- ./public/generated-models/xxx.glb
 *   npm run optimize -- ./model.glb --ratio 0.5 --compress draco
 *   npm run optimize -- ./model.glb --ratio 0.75 --compress meshopt -o ./model.small.glb
 *
 * 不加 -o 时只报告优化效果，不写文件。
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

import { OPTIMIZE_COMPRESS_OPTIONS, formatSavings, optimizeGlb } from '../server/optimize.mjs'

const args = parseArgs(process.argv.slice(2))
const input = args._[0]

main().catch((error) => {
  console.error(`\n优化失败：${error.message}`)
  process.exit(1)
})

async function main() {
  if (!input) {
    console.log('用法：npm run optimize -- <file.glb> [--ratio 0.75] [--compress meshopt] [-o out.glb]')
    console.log(`compress 可选：${OPTIMIZE_COMPRESS_OPTIONS.join(' / ')}`)
    process.exit(1)
  }

  const resolved = path.resolve(input)
  if (!existsSync(resolved)) throw new Error(`找不到文件：${resolved}`)

  console.log(`输入：${path.basename(resolved)}`)

  const startedAt = Date.now()
  const result = await optimizeGlb(await readFile(resolved), {
    ratio: args.ratio ?? 1,
    error: args.error ?? 0.001,
    compress: args.compress || 'meshopt',
    weld: args.weld !== false,
  })
  const elapsed = Date.now() - startedAt

  console.log(`步骤：${result.steps.join(' → ')}`)
  console.log(`体积：${formatSavings(result.before, result.after)}`)
  console.log(
    `面数：${result.before.triangles.toLocaleString()} → ${result.after.triangles.toLocaleString()}` +
      `（省 ${Math.round((1 - result.after.triangles / Math.max(1, result.before.triangles)) * 100)}%）`,
  )
  console.log(`耗时：${(elapsed / 1000).toFixed(1)}s`)

  if (args.o) {
    const outputPath = path.resolve(args.o)
    await writeFile(outputPath, result.buffer)
    console.log(`\n已写入：${outputPath}`)
  } else {
    console.log('\n未指定 -o，只做测算，未写文件。')
  }
}

function parseArgs(argv) {
  const parsed = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[index + 1]
      parsed[key] = next !== undefined && !next.startsWith('--') ? coerce(next) : true
      if (parsed[key] !== true) index += 1
    } else if (token === '-o') {
      parsed.o = argv[index + 1]
      index += 1
    } else {
      parsed._.push(token)
    }
  }

  return parsed
}

function coerce(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  const numeric = Number(value)
  return Number.isFinite(numeric) && value.trim() !== '' ? numeric : value
}
