import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createApp } from '../app.ts'
import { GeminiServiceError } from '../services/geminiClient.ts'
import type { GeminiGateway } from '../services/geminiClient.ts'

const okGateway: GeminiGateway = {
  async generateJson() {
    return JSON.stringify({
      fields: { policyNumber: { value: 'AUT-2026-9', confidence: 0.9 } },
    })
  },
}

async function withServer(
  gateway: GeminiGateway,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = createApp({ geminiGateway: gateway })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

function validPayload(): Record<string, unknown> {
  return {
    policyType: 'auto',
    document: {
      name: 'poliza.pdf',
      mimeType: 'application/pdf',
      dataBase64: Buffer.from('%PDF-1.4').toString('base64'),
    },
  }
}

function postExtract(
  baseUrl: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/api/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

test('POST /api/extract responde 200 con extracción normalizada', async () => {
  await withServer(okGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, validPayload())
    assert.equal(response.status, 200)
    const payload = (await response.json()) as {
      ok: boolean
      method: string
      fields: unknown[]
      meta: { providedFields: number; totalFields: number }
    }
    assert.equal(payload.ok, true)
    assert.equal(payload.method, 'gemini')
    assert.equal(payload.fields.length, 16)
    assert.equal(payload.meta.providedFields, 1)
    assert.equal(payload.meta.totalFields, 16)
  })
})

test('POST /api/extract responde 400 con cuerpo inválido', async () => {
  await withServer(okGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, { policyType: 'auto' })
    assert.equal(response.status, 400)
    const payload = (await response.json()) as { ok: boolean; error: string }
    assert.equal(payload.ok, false)
    assert.equal(payload.error, 'invalid_request')
  })
})

test('POST /api/extract responde 400 con JSON malformado', async () => {
  await withServer(okGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, '{ esto no es json')
    assert.equal(response.status, 400)
  })
})

test('POST /api/extract responde 415 con MIME no soportado', async () => {
  await withServer(okGateway, async (baseUrl) => {
    const body = validPayload()
    ;(body.document as Record<string, unknown>).mimeType = 'application/zip'
    const response = await postExtract(baseUrl, body)
    assert.equal(response.status, 415)
  })
})

test('POST /api/extract responde 413 si el documento es demasiado grande', async () => {
  await withServer(okGateway, async (baseUrl) => {
    const body = validPayload()
    ;(body.document as Record<string, unknown>).dataBase64 = 'A'.repeat(
      34 * 1024 * 1024 + 4,
    )
    const response = await postExtract(baseUrl, body)
    assert.equal(response.status, 413)
  })
})

test('POST /api/extract propaga el error del servicio de Gemini', async () => {
  const failingGateway: GeminiGateway = {
    async generateJson() {
      throw new GeminiServiceError('service_unavailable', 503, 'no disponible')
    },
  }
  await withServer(failingGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, validPayload())
    assert.equal(response.status, 503)
    const payload = (await response.json()) as { error: string }
    assert.equal(payload.error, 'service_unavailable')
  })
})

test('POST /api/extract conserva Retry-After en un error 429', async () => {
  const failingGateway: GeminiGateway = {
    async generateJson() {
      throw new GeminiServiceError('rate_limited', 429, 'cuota temporal', {
        retryAfterMs: 5000,
      })
    },
  }
  await withServer(failingGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, validPayload())
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after'), '5')
  })
})

test('POST /api/extract identifica una cuota diaria agotada', async () => {
  const failingGateway: GeminiGateway = {
    async generateJson() {
      throw new GeminiServiceError('rate_limited', 429, 'cuota diaria', {
        quotaExhausted: true,
      })
    },
  }
  await withServer(failingGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, validPayload())
    assert.equal(response.status, 429)
    const payload = (await response.json()) as { error: string }
    assert.equal(payload.error, 'quota_exhausted')
    assert.equal(response.headers.has('retry-after'), false)
  })
})

test('POST /api/extract responde 502 si la salida del modelo no es válida', async () => {
  const badGateway: GeminiGateway = {
    async generateJson() {
      return 'esto no es json'
    },
  }
  await withServer(badGateway, async (baseUrl) => {
    const response = await postExtract(baseUrl, validPayload())
    assert.equal(response.status, 502)
    const payload = (await response.json()) as { error: string }
    assert.equal(payload.error, 'model_output_invalid')
  })
})

test('una ruta desconocida responde 404', async () => {
  await withServer(okGateway, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/no-existe`)
    assert.equal(response.status, 404)
  })
})
