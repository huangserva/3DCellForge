import assert from 'node:assert/strict'
import test from 'node:test'

import { assessMetrics, formatBytes, formatDuration, formatNumber, getModelQuality } from '../src/lib/modelQuality.js'

/**
 * 注意这些断言锁的是**语义**，不是具体分数。
 *
 * 旧版评分按文件体积和面数加分，等于奖励臃肿。这里刻意钉死相反的行为：
 * 面数多、有大破洞、没 UV 的模型，必须比面数合理、封闭、UV 完整的高面数模型得分低。
 */

function goodMetrics(overrides = {}) {
  return {
    fileBytes: 4_800_000,
    meshCount: 8,
    materialCount: 2,
    textureCount: 5,
    triangleCount: 90_000,
    vertexCount: 48_000,
    maxTextureSize: 2048,
    pbrChannels: 3,
    boundaryEdges: 0,
    degenerateTriangles: 0,
    analyzedTriangles: 90_000,
    manifoldComplete: true,
    uvCoverage: 0.82,
    meshWithUv: 8,
    ...overrides,
  }
}

test('model quality scoring', async (t) => {
  await t.test('keeps built-in starter models in the usable range', () => {
    const quality = getModelQuality({ id: 'plant', custom: false }, null, [])

    assert.equal(quality.score, 68)
    assert.equal(quality.verdict, 'Usable')
    assert.equal(quality.providerLabel, 'Built-in')
    assert.equal(quality.hasGlb, false)
  })

  await t.test('rates a clean, well-formed GLB as demo-ready', () => {
    const quality = getModelQuality(
      {
        id: 'custom-1',
        custom: true,
        generation: { provider: 'tripo', status: 'success', modelUrl: '/api/3d/local-model/custom-1.glb' },
      },
      goodMetrics(),
      [{ cellId: 'custom-1', status: 'success', durationMs: 92_000 }],
    )

    assert.equal(quality.verdict, 'Demo-ready')
    assert.ok(quality.score >= 86, `干净的网格应达到 Demo-ready，实际 ${quality.score}`)
    assert.equal(quality.hasGlb, true)
    assert.equal(quality.fileBytes, 4_800_000)
  })

  await t.test('keeps failed generations clearly below demo quality', () => {
    const quality = getModelQuality({
      id: 'custom-failed',
      custom: true,
      generation: { provider: 'tripo', status: 'failed', modelUrl: '' },
    })

    assert.equal(quality.score, 12)
    assert.equal(quality.verdict, 'Failed')
  })
})

test('文件体积不再影响评分', () => {
  const small = assessMetrics(goodMetrics({ fileBytes: 3_000_000 }))
  // 同样的几何与材质，只把体积放大 10 倍 —— 分数必须完全不变
  const huge = assessMetrics(goodMetrics({ fileBytes: 30_000_000 }))

  assert.equal(small.score, huge.score, '体积不该影响质量分')
})

test('面数多不再等于质量好', () => {
  const sensible = assessMetrics(goodMetrics({ triangleCount: 80_000 }))
  const bloated = assessMetrics(
    goodMetrics({
      triangleCount: 1_900_000,
      fileBytes: 58_000_000,
      boundaryEdges: 24_000,
      degenerateTriangles: 3_000,
      meshCount: 60,
    }),
  )

  assert.ok(
    bloated.score < sensible.score,
    `190 万面且有破洞的烂模型不该比 8 万面的干净模型分高（实际 ${bloated.score} vs ${sensible.score}）`,
  )
})

test('六项检查各自生效', async (t) => {
  const baseline = assessMetrics(goodMetrics())

  await t.test('破洞网格在封闭性上被扣分', () => {
    const leaky = assessMetrics(goodMetrics({ boundaryEdges: 4_500, triangleCount: 90_000 }))
    const check = findCheck(leaky, 'watertight')
    const base = findCheck(baseline, 'watertight')

    assert.ok(check.ratio < base.ratio, '有边界边应扣分')
    assert.match(check.detail, /边界边/)
  })

  await t.test('缺少 PBR 通道被扣分', () => {
    const flat = assessMetrics(goodMetrics({ pbrChannels: 0 }))
    assert.ok(findCheck(flat, 'pbr').ratio < findCheck(baseline, 'pbr').ratio)
  })

  await t.test('没有 UV 直接判为不可用', () => {
    const noUv = assessMetrics(goodMetrics({ uvCoverage: 0, meshWithUv: 0 }))
    assert.equal(findCheck(noUv, 'uv').ratio, 0)
  })

  await t.test('纹理分辨率过低被扣分', () => {
    const lowRes = assessMetrics(goodMetrics({ maxTextureSize: 256 }))
    assert.ok(findCheck(lowRes, 'texture').ratio < findCheck(baseline, 'texture').ratio)
  })

  await t.test('面数远超 Web 需要时被扣分', () => {
    const heavy = assessMetrics(goodMetrics({ triangleCount: 1_200_000 }))
    assert.ok(findCheck(heavy, 'density').ratio < findCheck(baseline, 'density').ratio)
  })

  await t.test('退化三角形与碎片化被扣分', () => {
    const messy = assessMetrics(goodMetrics({ degenerateTriangles: 9_000, meshCount: 80 }))
    assert.ok(findCheck(messy, 'clean').ratio < findCheck(baseline, 'clean').ratio)
  })
})

test('抽样评估不能冒充全量结论', () => {
  const partial = assessMetrics(goodMetrics({ manifoldComplete: false, boundaryEdges: 0, analyzedTriangles: 400_000 }))
  const complete = assessMetrics(goodMetrics({ manifoldComplete: true, boundaryEdges: 0 }))

  assert.ok(
    findCheck(partial, 'watertight').ratio < findCheck(complete, 'watertight').ratio,
    '只评估了部分网格时，封闭性得分应低于全量确认过的',
  )
  assert.match(findCheck(partial, 'watertight').detail, /抽样/)
})

test('每项检查都带可展示的理由', () => {
  const { checks } = assessMetrics(goodMetrics())

  assert.equal(checks.length, 6)
  for (const check of checks) {
    assert.ok(check.label, `${check.id} 缺 label`)
    assert.ok(check.detail, `${check.id} 缺 detail`)
    assert.ok(check.ratio >= 0 && check.ratio <= 1, `${check.id} 的 ratio 越界`)
  }
})

test('model quality formatters', () => {
  assert.equal(formatBytes(0), 'n/a')
  assert.equal(formatBytes(2_400_000), '2.4 MB')
  assert.equal(formatDuration(92_000), '1m 32s')
  assert.equal(formatNumber(72_000), '72,000')
})

function findCheck(result, id) {
  const check = result.checks.find((entry) => entry.id === id)
  assert.ok(check, `找不到检查项 ${id}`)
  return check
}
