import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CAPABILITIES, getCapability, listAvailableCapabilities, route } from '../server/providers/registry.mjs'

// 注册表不静态 import 任何 provider，所以这些测试在没装 SDK 的情况下也能跑。
// 测试环境默认没有配置任何 key，configured 全为 false —— 这正好用来验证过滤逻辑。

describe('route', () => {
  it('未知能力应抛出 400', () => {
    assert.throws(() => route('does.not.exist'), (error) => error.status === 400)
  })

  it('默认返回所有已实现该能力的引擎', () => {
    const result = route('generate.image-to-model')
    const ids = result.map((entry) => entry.providerId)

    assert.deepEqual(ids.sort(), ['fal', 'hunyuan', 'rodin', 'tripo'])
  })

  it('按偏好排序：fastest 选最快的', () => {
    const result = route('generate.image-to-model', { prefer: 'fastest' })
    assert.equal(result[0].providerId, 'tripo', 'Tripo speed=9 应为最快')
  })

  it('按偏好排序：cheapest 选最便宜的', () => {
    const result = route('generate.image-to-model', { prefer: 'cheapest' })
    assert.equal(result[0].providerId, 'hunyuan', '本地 Hunyuan3D cost=1 应为最便宜')
  })

  it('按偏好排序：quality 选质量最高的', () => {
    const result = route('generate.image-to-model', { prefer: 'quality' })
    assert.equal(result[0].providerId, 'rodin', 'Rodin Gen-2 quality=10 应为最高')
  })

  it('按偏好排序：balanced 给出折衷结果', () => {
    const result = route('generate.image-to-model', { prefer: 'balanced' })
    assert.equal(result[0].providerId, 'tripo')
    assert.ok(result[0].score > result[result.length - 1].score)
  })

  it('不同偏好应产生不同的首选引擎', () => {
    const picks = ['fastest', 'cheapest', 'quality'].map(
      (prefer) => route('generate.image-to-model', { prefer })[0].providerId,
    )
    assert.equal(new Set(picks).size, 3, `三种偏好应选出三款不同引擎，实际为 ${picks.join('/')}`)
  })

  it('onlyConfigured 在无 key 时返回空', () => {
    const result = route('generate.image-to-model', { onlyConfigured: true })
    assert.equal(result.length, 0)
  })

  it('implementedOnly=false 时会包含仅声明未实现的能力', () => {
    const declared = route('edit.prompt', { implementedOnly: false })
    assert.equal(declared.length, 1)
    assert.equal(declared[0].providerId, 'rodin')
    assert.equal(declared[0].implemented, false)
  })

  it('未知偏好退回 balanced 而不是报错', () => {
    const fallback = route('generate.image-to-model', { prefer: 'nonsense' })
    const balanced = route('generate.image-to-model', { prefer: 'balanced' })
    assert.deepEqual(
      fallback.map((entry) => entry.providerId),
      balanced.map((entry) => entry.providerId),
    )
  })
})

describe('getCapability', () => {
  it('已实现的能力返回条目', () => {
    const entry = getCapability('tripo', 'generate.image-to-model')
    assert.ok(entry)
    assert.equal(typeof entry.create, 'function')
    assert.equal(typeof entry.get, 'function')
  })

  it('仅声明未实现的能力返回 null', () => {
    assert.equal(getCapability('rodin', 'edit.prompt'), null)
  })

  it('未登记的能力返回 null', () => {
    // animate.retarget 在 CAPABILITIES 里有定义，但没有任何 provider 实现它
    assert.equal(getCapability('tripo', 'animate.retarget'), null)
  })

  it('unknown provider 返回 null', () => {
    assert.equal(getCapability('nope', 'generate.image-to-model'), null)
  })

  it('本地引擎的同步能力用 run 暴露，不走 create/get', () => {
    const entry = getCapability('local', 'postprocess.optimize')
    assert.ok(entry, '本地优化能力应可用')
    assert.equal(typeof entry.run, 'function')
    assert.equal(entry.create, undefined, '同步能力不该有 create')
  })

  it('Tripo 的后处理能力已登记且可轮询', () => {
    for (const capability of ['mesh.segment', 'mesh.complete', 'mesh.decimate', 'model.convert']) {
      const entry = getCapability('tripo', capability)
      assert.ok(entry, `${capability} 应已登记`)
      assert.equal(typeof entry.create, 'function')
      assert.equal(typeof entry.get, 'function', `${capability} 必须能复用统一轮询`)
    }
  })
})

describe('listAvailableCapabilities', () => {
  it('只包含真正接了引擎的能力', () => {
    const ids = listAvailableCapabilities().map((capability) => capability.id)
    assert.ok(!ids.includes('edit.prompt'), 'edit.prompt 只登记未实现，不该出现在可选项中')
    assert.ok(!ids.includes('animate.retarget'), 'animate.retarget 没有任何 provider 实现')

    // 已实现的都应该在；注意这里不过滤 key —— 有 key 就能用，UI 想要
    // 「当前可用」的列表时传 onlyConfigured: true
    assert.deepEqual(ids.sort(), [
      'animate.rig',
      'generate.image-to-model',
      'mesh.complete',
      'mesh.decimate',
      'mesh.segment',
      'model.convert',
      'model.texture',
      'postprocess.optimize',
    ])
  })

  it('每项都带完整的元信息与引擎列表', () => {
    const capability = listAvailableCapabilities().find((entry) => entry.id === 'generate.image-to-model')
    assert.equal(capability.label, '图生 3D')
    assert.equal(capability.stage, 'generate')
    assert.equal(capability.providers.length, 4)
    assert.ok(capability.providers.every((provider) => provider.perf))
  })

  it('未配置任何 key 时，本地能力仍然可用', () => {
    // 这是「本地零成本模式」的核心保证：没 key 也能用上后处理
    const ids = listAvailableCapabilities({ onlyConfigured: true }).map((capability) => capability.id)
    assert.deepEqual(ids, ['postprocess.optimize'])
  })

  it('本地优化能力标为 sync', () => {
    const capability = listAvailableCapabilities({ onlyConfigured: true })
      .find((entry) => entry.id === 'postprocess.optimize')
    assert.equal(capability.sync, true)
    assert.equal(capability.providers[0].providerId, 'local')
  })
})

describe('CAPABILITIES', () => {
  it('每个能力都有 label 与 stage', () => {
    for (const [id, capability] of Object.entries(CAPABILITIES)) {
      assert.ok(capability.label, `${id} 缺 label`)
      assert.ok(['generate', 'postprocess'].includes(capability.stage), `${id} 的 stage 非法`)
    }
  })

  it('后处理能力的输入都含 model', () => {
    for (const [id, capability] of Object.entries(CAPABILITIES)) {
      if (capability.stage !== 'postprocess') continue
      assert.ok(capability.input.includes('model'), `${id} 是后处理却不以 model 为输入`)
    }
  })
})
