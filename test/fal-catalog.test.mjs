import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FAL_MODEL_DEFINITIONS } from '../server/providers/fal.mjs'
import { DEFAULT_FAL_MODEL, FAL_MODEL_OPTIONS } from '../src/config/appConfig.js'

/**
 * 前端选模型的下拉框和服务端真正认识的模型列表，是两份独立维护的数据。
 * 一旦不同步，用户在前端选了新模型，服务端 normalizeFalModelId 会静默回退到
 * 旧模型 —— 前端毫无报错，用户拿到的却是另一个模型的结果。
 *
 * 这个 bug 在 2026-08-27 的 Sprint 1 里真实发生过（只改了前端没改服务端），
 * 所以加测试永久钉死。
 */
describe('Fal 模型目录前后端一致性', () => {
  it('两边声明的模型 id 完全一致', () => {
    const frontend = FAL_MODEL_OPTIONS.map((option) => option.id).sort()
    const server = FAL_MODEL_DEFINITIONS.map((definition) => definition.id).sort()

    assert.deepEqual(
      frontend,
      server,
      `前端与服务端模型列表不一致。仅前端有：${frontend.filter((id) => !server.includes(id))}；仅服务端有：${server.filter((id) => !frontend.includes(id))}`,
    )
  })

  it('默认模型必须在服务端列表中', () => {
    const ids = new Set(FAL_MODEL_DEFINITIONS.map((definition) => definition.id))
    assert.ok(ids.has(DEFAULT_FAL_MODEL), `默认模型 ${DEFAULT_FAL_MODEL} 不在服务端列表里，会被静默回退`)
  })

  it('每个服务端模型都声明了接收图片的字段', () => {
    for (const definition of FAL_MODEL_DEFINITIONS) {
      assert.ok(definition.imageField, `${definition.id} 缺 imageField`)
    }
  })

  it('每个前端模型都标注了是否已实测验证', () => {
    for (const option of FAL_MODEL_OPTIONS) {
      assert.equal(typeof option.verified, 'boolean', `${option.id} 缺 verified 标记`)
      assert.ok(option.perf, `${option.id} 缺 perf`)
    }
  })

  it('未验证的模型在服务端也标了 unverified', () => {
    const unverifiedIds = FAL_MODEL_OPTIONS.filter((option) => !option.verified).map((option) => option.id)

    for (const id of unverifiedIds) {
      const definition = FAL_MODEL_DEFINITIONS.find((entry) => entry.id === id)
      assert.equal(definition?.unverified, true, `${id} 前端标了未验证，服务端却没有`)
    }
  })

  it('未验证的模型不能当默认模型', () => {
    const fallback = FAL_MODEL_OPTIONS.find((option) => option.id === DEFAULT_FAL_MODEL)
    assert.equal(fallback?.verified, true, '默认模型必须是已实测验证过的，否则开箱即坏')
  })
})
