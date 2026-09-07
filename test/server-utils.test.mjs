import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertLocalDiagnosticsRequest, parseDataUrl, sanitizeFileName } from '../server/http-utils.mjs'
import { getModelExtension, shouldAttachTripoAuth, validateModelBuffer } from '../server/model-store.mjs'
import { findFirstValue, findModelUrl, isSuccessStatus } from '../server/object-utils.mjs'
import { buildFalInput, decodeFalTaskId, encodeFalTaskId, findFalModelFile, normalizeFalModelId, normalizeFalStatus } from '../server/providers/fal.mjs'
import { findAtlasModelUrl, normalizeAtlasStatus } from '../server/providers/atlas.mjs'
import { decodeRodinTaskId, encodeRodinTaskId, findRodinDownloadItem, normalizeRodinStatus } from '../server/providers/rodin.mjs'
import { extractJsonObject, normalizeVisionInsight } from '../server/providers/vision.mjs'
import { compactCustomCellsForStorage, persistCustomCells } from '../src/domain/cellPersistence.js'

describe('server utility functions', () => {
  it('sanitizes uploaded filenames without losing readable words', () => {
    assert.equal(sanitizeFileName('../plant cell ✨.png'), 'plant cell .png')
    assert.equal(sanitizeFileName(''), 'asset-reference.png')
  })

  it('parses supported image data URLs and rejects tiny payloads', () => {
    const dataUrl = `data:image/png;base64,${Buffer.alloc(1024).toString('base64')}`
    const image = parseDataUrl(dataUrl)

    assert.equal(image.mime, 'image/png')
    assert.equal(image.ext, 'png')
    assert.equal(image.buffer.length, 1024)
    assert.throws(() => parseDataUrl('data:text/plain;base64,abc'), /Only PNG, JPEG, or WebP/)
    assert.throws(() => parseDataUrl(`data:image/png;base64,${Buffer.alloc(8).toString('base64')}`), /too small/)
  })

  it('restricts diagnostics logs to local callers and localhost pages', () => {
    assert.doesNotThrow(() => assertLocalDiagnosticsRequest({
      socket: { remoteAddress: '127.0.0.1' },
      headers: { origin: 'http://127.0.0.1:5174' },
    }))
    assert.doesNotThrow(() => assertLocalDiagnosticsRequest({
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: { referer: 'http://localhost:5174/logs' },
    }))

    assert.throws(
      () => assertLocalDiagnosticsRequest({
        socket: { remoteAddress: '192.168.1.8' },
        headers: {},
      }),
      /only available from this machine/,
    )
    assert.throws(
      () => assertLocalDiagnosticsRequest({
        socket: { remoteAddress: '127.0.0.1' },
        headers: { origin: 'https://example.com' },
      }),
      /only available to localhost pages/,
    )
  })

  it('detects model extensions and validates GLB headers', () => {
    assert.equal(getModelExtension('https://example.com/model.glb?download=1'), 'glb')
    assert.equal(getModelExtension('scene.gltf'), 'gltf')
    assert.throws(() => getModelExtension('model.obj'), /Only GLB/)

    assert.doesNotThrow(() => validateModelBuffer(Buffer.concat([Buffer.from('glTF'), Buffer.alloc(28)]), 'glb'))
    assert.throws(() => validateModelBuffer(Buffer.concat([Buffer.from('nope'), Buffer.alloc(28)]), 'glb'), /GLB files/)
  })

  it('does not attach Tripo auth to arbitrary model URLs', () => {
    assert.equal(shouldAttachTripoAuth('https://example.com/model.glb'), false)
    assert.equal(shouldAttachTripoAuth('http://127.0.0.1:8787/model.glb'), false)
  })

  it('finds nested task ids and preferred model URLs', () => {
    const payload = {
      data: {
        task: { task_id: 'task-123' },
        assets: [
          { url: 'https://example.com/preview.png' },
          { result: 'https://example.com/model.obj' },
          { result: 'https://example.com/model.glb?x=1' },
        ],
      },
    }

    assert.equal(findFirstValue(payload, ['task_id']), 'task-123')
    assert.equal(findModelUrl(payload), 'https://example.com/model.glb?x=1')
    assert.equal(findModelUrl({ result: 'https://example.com/model.obj' }), '')
    assert.equal(isSuccessStatus('finished'), true)
    assert.equal(isSuccessStatus('running'), false)
  })

  it('normalizes model vision output for asset intelligence', () => {
    const parsed = extractJsonObject('```json\n{"objectName":"Red Supercar","categoryId":"car","confidence":92,"tags":["Vehicle","Gloss"]}\n```')
    const insight = normalizeVisionInsight(parsed, { provider: 'openai', model: 'test-model' })

    assert.equal(insight.objectName, 'Red Supercar')
    assert.equal(insight.categoryId, 'road')
    assert.equal(insight.categoryLabel, 'Performance Vehicle')
    assert.equal(insight.confidence, 0.92)
    assert.deepEqual(insight.tags, ['vehicle', 'gloss'])
  })

  it('normalizes Rodin task ids, statuses, and downloads', () => {
    const task = { taskUuid: 'task-uuid-1', subscriptionKey: 'subscription-key-1' }
    const encoded = encodeRodinTaskId(task)

    assert.deepEqual(decodeRodinTaskId(encoded), task)
    assert.deepEqual(decodeRodinTaskId('legacy-task-id'), { taskUuid: 'legacy-task-id', subscriptionKey: 'legacy-task-id' })
    assert.equal(normalizeRodinStatus(['Done', 'Done']), 'success')
    assert.equal(normalizeRodinStatus(['Waiting']), 'queued')
    assert.equal(normalizeRodinStatus(['Generating']), 'running')
    assert.equal(normalizeRodinStatus(['Done', 'Failed']), 'failed')
    assert.deepEqual(
      findRodinDownloadItem({
        list: [
          { name: 'preview.webp', url: 'https://example.com/preview.webp' },
          { name: 'model.glb', url: 'https://cdn.example.com/signed-download' },
        ],
      }),
      { name: 'model.glb', url: 'https://cdn.example.com/signed-download' },
    )
  })

  it('normalizes Fal model ids, task ids, inputs, statuses, and model files', () => {
    const task = { modelId: 'tripo3d/tripo/v2.5/image-to-3d', requestId: 'fal-request-1' }
    const encoded = encodeFalTaskId(task)

    assert.deepEqual(decodeFalTaskId(encoded), task)
    assert.equal(normalizeFalModelId('tripo3d/tripo/v2.5/image-to-3d'), 'tripo3d/tripo/v2.5/image-to-3d')
    assert.equal(normalizeFalModelId('fal-ai/tripo3d/v2.5/image-to-3d'), 'fal-ai/hunyuan3d/v2')
    assert.equal(normalizeFalStatus('IN_QUEUE'), 'queued')
    assert.equal(normalizeFalStatus('IN_PROGRESS'), 'running')
    assert.equal(normalizeFalStatus('COMPLETED'), 'success')
    assert.equal(normalizeFalStatus('ERROR'), 'failed')

    assert.deepEqual(
      buildFalInput('fal-ai/hunyuan3d/v2', 'https://cdn.example.com/input.png', { seed: 12 }),
      { input_image_url: 'https://cdn.example.com/input.png', seed: 12 },
    )
    assert.deepEqual(
      buildFalInput('fal-ai/hyper3d/rodin', 'https://cdn.example.com/input.png', { prompt: 'a detailed cell', seed: 7 }),
      {
        geometry_file_format: 'glb',
        input_image_urls: ['https://cdn.example.com/input.png'],
        material: 'PBR',
        prompt: 'a detailed cell',
        quality: 'medium',
        seed: 7,
        tier: 'Regular',
      },
    )

    assert.deepEqual(
      findFalModelFile({
        base_model: { url: 'https://cdn.example.com/base.glb' },
        pbr_model: { url: 'https://cdn.example.com/file', content_type: 'model/gltf-binary' },
      }),
      { url: 'https://cdn.example.com/file', ext: 'glb' },
    )
  })

  it('normalizes Atlas Cloud statuses and selects GLB outputs', () => {
    assert.equal(normalizeAtlasStatus('created'), 'queued')
    assert.equal(normalizeAtlasStatus('processing'), 'processing')
    assert.equal(normalizeAtlasStatus('completed'), 'success')
    assert.equal(normalizeAtlasStatus('failed'), 'failed')
    assert.equal(
      findAtlasModelUrl({
        files: [
          { type: 'PNG', url: 'https://cdn.example.com/preview.png' },
          { type: 'GLB', url: 'https://cdn.example.com/model-download' },
        ],
      }),
      'https://cdn.example.com/model-download',
    )
    assert.equal(
      findAtlasModelUrl({ outputs: ['https://cdn.example.com/preview.png', 'https://cdn.example.com/model.glb?token=1'] }),
      'https://cdn.example.com/model.glb?token=1',
    )
  })

  it('compacts generated custom cells without dropping pending retry images first', () => {
    const generated = {
      id: 'custom-ready',
      imageUrl: 'data:image/webp;base64,large',
      thumbnailUrl: 'data:image/webp;base64,thumb',
      generation: { status: 'success', modelUrl: '/api/3d/local-model/task.glb', rawModelUrl: 'https://signed.example.com/model.glb', message: 'ready' },
    }
    const pending = {
      id: 'custom-pending',
      imageUrl: 'data:image/webp;base64,source',
      generation: { status: 'failed', modelUrl: '', rawModelUrl: '', message: 'retry possible' },
    }

    assert.deepEqual(
      compactCustomCellsForStorage([generated, pending], 'generated-previews').map((cell) => cell.imageUrl),
      ['', pending.imageUrl],
    )
    assert.equal(compactCustomCellsForStorage([generated, pending], 'generated-previews')[0].thumbnailUrl, generated.thumbnailUrl)
    assert.deepEqual(
      compactCustomCellsForStorage([generated, pending], 'minimal').map((cell) => ({
        imageUrl: cell.imageUrl,
        thumbnailUrl: cell.thumbnailUrl,
        rawModelUrl: cell.generation.rawModelUrl,
      })),
      [
        { imageUrl: '', thumbnailUrl: generated.thumbnailUrl, rawModelUrl: '' },
        { imageUrl: '', thumbnailUrl: undefined, rawModelUrl: '' },
      ],
    )
  })

  it('falls back to compact custom-cell storage when localStorage quota fails', () => {
    const writes = []
    global.window = {
      localStorage: {
        setItem(key, value) {
          writes.push({ key, value: JSON.parse(value) })
          if (writes.length === 1) throw new Error('quota exceeded')
        },
      },
    }

    try {
      const result = persistCustomCells([
        {
          id: 'custom-ready',
          imageUrl: 'data:image/webp;base64,large',
          thumbnailUrl: 'data:image/webp;base64,thumb',
          generation: { status: 'success', modelUrl: '/api/3d/local-model/task.glb', rawModelUrl: 'https://signed.example.com/model.glb', message: 'ready' },
        },
      ])

      assert.equal(result.stored, true)
      assert.equal(result.compacted, true)
      assert.equal(result.cells[0].imageUrl, '')
      assert.equal(result.cells[0].thumbnailUrl, 'data:image/webp;base64,thumb')
      assert.equal(result.cells[0].generation.modelUrl, '/api/3d/local-model/task.glb')
      assert.equal(writes.length, 2)
    } finally {
      delete global.window
    }
  })

  it('keeps compacted custom-cell array identity when storage remains unavailable', () => {
    global.window = {
      localStorage: {
        setItem() {
          throw new Error('storage unavailable')
        },
      },
    }

    try {
      const compacted = [
        {
          id: 'custom-ready',
          imageUrl: '',
          previewDropped: true,
          generation: { status: 'success', modelUrl: '/api/3d/local-model/task.glb', rawModelUrl: '', message: 'ready' },
        },
      ]
      const result = persistCustomCells(compacted)

      assert.equal(result.stored, false)
      assert.equal(result.compacted, true)
      assert.equal(result.cells, compacted)
    } finally {
      delete global.window
    }
  })
})
