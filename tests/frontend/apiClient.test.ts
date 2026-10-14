import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createApiClient } from '../../src/services/apiClient.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('postJson devuelve el cuerpo parseado en una respuesta 200', async () => {
  const client = createApiClient({
    baseUrl: 'http://test',
    fetchImpl: async () => jsonResponse(200, { ok: true, fields: [] }),
  })
  const data = await client.postJson<{ ok: boolean }>('/api/extract', { a: 1 })
  assert.equal(data.ok, true)
})

test('postJson usa la URL base y el método POST', async () => {
  let capturedUrl = ''
  let capturedMethod = ''
  const client = createApiClient({
    baseUrl: 'http://test/',
    fetchImpl: async (input, init) => {
      capturedUrl = String(input)
      capturedMethod = init?.method ?? ''
      return jsonResponse(200, {})
    },
  })
  await client.postJson('/api/extract', {})
  assert.equal(capturedUrl, 'http://test/api/extract')
  assert.equal(capturedMethod, 'POST')
})

test('postJson lanza ApiError http con código y detalles', async () => {
  const client = createApiClient({
    baseUrl: 'http://test',
    fetchImpl: async () =>
      jsonResponse(503, {
        ok: false,
        error: 'service_unavailable',
        details: ['intenta más tarde'],
      }),
  })
  await assert.rejects(
    () => client.postJson('/api/extract', {}),
    (error: unknown) =>
      error instanceof ApiError &&
      error.kind === 'http' &&
      error.status === 503 &&
      error.code === 'service_unavailable' &&
      error.details?.[0] === 'intenta más tarde',
  )
})

test('postJson lanza ApiError parse ante un cuerpo no JSON', async () => {
  const client = createApiClient({
    baseUrl: 'http://test',
    fetchImpl: async () => new Response('no es json', { status: 200 }),
  })
  await assert.rejects(
    () => client.postJson('/api/extract', {}),
    (error: unknown) => error instanceof ApiError && error.kind === 'parse',
  )
})

test('postJson lanza ApiError network cuando falla la conexión', async () => {
  const client = createApiClient({
    baseUrl: 'http://test',
    fetchImpl: async () => {
      throw new TypeError('failed to fetch')
    },
  })
  await assert.rejects(
    () => client.postJson('/api/extract', {}),
    (error: unknown) => error instanceof ApiError && error.kind === 'network',
  )
})

test('postJson lanza ApiError timeout al exceder el tiempo de espera', async () => {
  const hangingFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })

  const client = createApiClient({
    baseUrl: 'http://test',
    timeoutMs: 10,
    fetchImpl: hangingFetch,
  })
  await assert.rejects(
    () => client.postJson('/api/extract', {}),
    (error: unknown) => error instanceof ApiError && error.kind === 'timeout',
  )
})

test('postJson respeta una señal externa ya abortada', async () => {
  const controller = new AbortController()
  controller.abort()
  const client = createApiClient({
    baseUrl: 'http://test',
    fetchImpl: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          return
        }
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      }),
  })
  await assert.rejects(
    () => client.postJson('/api/extract', {}, { signal: controller.signal }),
    (error: unknown) => error instanceof ApiError && error.kind === 'timeout',
  )
})
