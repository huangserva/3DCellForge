#!/usr/bin/env node
/**
 * 把 three 自带的 draco / basis(KTX2) 解码器复制到 public/decoders/。
 *
 * 为什么需要这一步：drei 的 useGLTF 默认把 Draco 解码器指向
 * https://www.gstatic.com/draco/versioned/decoders/1.5.5/ —— 一个外部 CDN。
 * 对一个主打「可自托管、可离线」的工具来说这不可接受：断网就加载不了
 * 压缩模型，而且每个用户的浏览器都会去请求 Google。
 *
 * 复制到 public/ 之后，解码器由本项目自己提供，离线可用。
 * 不进 git（见 .gitignore），靠 predev / prebuild 自动生成。
 */

import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const THREE_LIBS = path.join(ROOT, 'node_modules/three/examples/jsm/libs')
const PUBLIC_DECODERS = path.join(ROOT, 'public/decoders')

const TARGETS = [
  { from: 'draco', to: 'draco' },
  { from: 'basis', to: 'basis' },
]

async function main() {
  if (!(await exists(THREE_LIBS))) {
    console.error(`找不到 three 的 libs 目录：${THREE_LIBS}`)
    console.error('请先执行 npm install')
    process.exit(1)
  }

  await mkdir(PUBLIC_DECODERS, { recursive: true })

  for (const { from, to } of TARGETS) {
    const source = path.join(THREE_LIBS, from)
    const destination = path.join(PUBLIC_DECODERS, to)

    if (!(await exists(source))) {
      console.warn(`跳过 ${from}：源目录不存在`)
      continue
    }

    await cp(source, destination, { recursive: true })
    const files = await readdir(destination)
    console.log(`${from} → public/decoders/${to}  (${files.length} 个文件)`)
  }

  console.log('解码器就位，运行时将走本地路径而非 CDN。')
}

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

main().catch((error) => {
  console.error(`复制解码器失败：${error.message}`)
  process.exit(1)
})
