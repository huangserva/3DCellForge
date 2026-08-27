/**
 * 本地资产优化（gltf-transform）
 *
 * 这条流水线不需要任何 API key —— 它直接支撑「本地零成本模式」那根柱子。
 * 生成本身可以交给云厂商，但优化永远该在本地做：不花钱、不泄露资产、可批量。
 *
 * 处理顺序是有讲究的：
 *   dedup  先去掉完全重复的 accessor / mesh / texture
 *   prune  再清掉没人引用的资源（前面去重后才清得干净）
 *   weld   焊接重合顶点，否则 simplify 会在裂缝处崩形状
 *   simplify 减面（有损，按 ratio + error 双约束）
 *   compress 最后做几何压缩（Draco 压缩率高，Meshopt 解码快）
 *
 * textureCompress 没启用 —— 它依赖 sharp（原生模块），会显著增加安装体积。
 * 需要时再加，见下方 TODO。
 */

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, meshopt, prune, simplify, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

export const OPTIMIZE_COMPRESS_OPTIONS = ['none', 'meshopt', 'draco']

let ioPromise = null

/**
 * NodeIO 需要注册扩展才能读写 KHR_draco_mesh_compression / EXT_meshopt_compression
 * 这类带扩展的 glTF。构造一次复用。
 */
function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      const dracoModule = await draco3d.createEncoderModule()
      await MeshoptEncoder.ready
      await MeshoptSimplifier.ready

      return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.encoder': dracoModule,
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'meshopt.encoder': MeshoptEncoder,
        'meshopt.decoder': MeshoptEncoder,
      })
    })()
  }

  return ioPromise
}

/**
 * @param {Buffer|Uint8Array} input  原始 GLB
 * @param {object} options
 * @param {number} options.ratio      保留顶点比例 0–1，1 表示不减面
 * @param {number} options.error      减面误差上限（占网格半径比例）
 * @param {string} options.compress   none | meshopt | draco
 * @param {boolean} options.weld      是否焊接重合顶点
 * @returns {Promise<{ buffer: Uint8Array, before: object, after: object, steps: string[] }>}
 */
export async function optimizeGlb(input, options = {}) {
  const { ratio = 1, error = 0.001, compress = 'meshopt', weld: doWeld = true } = options

  if (!OPTIMIZE_COMPRESS_OPTIONS.includes(compress)) {
    throw new Error(`compress 只支持 ${OPTIMIZE_COMPRESS_OPTIONS.join(' / ')}`)
  }
  if (!(ratio > 0 && ratio <= 1)) {
    throw new Error('ratio 必须在 (0, 1] 区间内')
  }

  const io = await getIO()
  const source = input instanceof Uint8Array ? input : new Uint8Array(input)
  const document = await io.readBinary(source)

  const before = { bytes: source.byteLength, ...measure(document) }
  const steps = ['dedup', 'prune']

  const transforms = [dedup(), prune()]
  if (doWeld) {
    transforms.push(weld())
    steps.push('weld')
  }
  if (ratio < 1) {
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio, error }))
    steps.push(`simplify(${ratio})`)
  }

  await document.transform(...transforms)

  if (compress === 'draco') {
    await document.transform(draco())
    steps.push('draco')
  } else if (compress === 'meshopt') {
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
    steps.push('meshopt')
  }

  const output = await io.writeBinary(document)

  return {
    buffer: output,
    before,
    after: { bytes: output.byteLength, ...measure(document) },
    steps,
  }
}

/**
 * 统计面数与纹理数，用于前后对比。
 */
export function measure(document) {
  const root = document.getRoot()
  let triangles = 0
  let vertices = 0

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION')
      if (position) vertices += position.getCount()

      const indices = primitive.getIndices()
      triangles += indices ? indices.getCount() / 3 : (position ? position.getCount() / 3 : 0)
    }
  }

  // 纹理挂在 Root 上，不在 Material 上 —— Material 只有 getBaseColorTexture 这类单取方法
  return {
    triangles: Math.round(triangles),
    vertices,
    textures: root.listTextures().length,
    materials: root.listMaterials().length,
    meshes: root.listMeshes().length,
  }
}

export function formatSavings(before, after) {
  if (!before?.bytes) return '—'
  const ratio = 1 - after.bytes / before.bytes
  return `${before.bytes > 1_000_000 ? (before.bytes / 1_000_000).toFixed(1) + ' MB' : Math.round(before.bytes / 1000) + ' KB'} → ${
    after.bytes > 1_000_000 ? (after.bytes / 1_000_000).toFixed(1) + ' MB' : Math.round(after.bytes / 1000) + ' KB'
  }（省 ${Math.round(ratio * 100)}%）`
}

// TODO: 纹理压缩（KTX2 / WebP）需要 sharp 这个原生依赖。
// 装上之后加一步 textureCompress({ encoder: sharp, targetFormat: 'ktx2' })，
// 通常还能再省 60–80%，是目前最大的一块剩余空间。
