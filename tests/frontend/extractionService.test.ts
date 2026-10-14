import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionSuccessResponse } from '../../shared/api.ts'
import { ApiError } from '../../src/services/apiClient.ts'
import type { ApiClient } from '../../src/services/apiClient.ts'
import {
  EXTRACTION_ERROR_MESSAGES,
  ExtractionServiceError,
  extractFromFile,
  extractPolicyFields,
} from '../../src/services/extractionService.ts'

const successPayload: ExtractionSuccessResponse = {
  ok: true,
  method: 'gemini',
  fields: [
    {
      key: 'policyNumber',
      label: 'Número de póliza',
      kind: 'text',
      scope: 'general',
      value: 'ABC-123',
      source: 'gemini',
      status: 'ok',
      required: true,
    },
  ],
  summary: { total: 1, filled: 1, missing: 0, review: 0, completion: 1 },
  meta: {
    model: 'gemini-3.8-flash',
    policyType: 'auto',
    totalFields: 1,
    providedFields: 1,
    missingRequired: 0,
    unknownFields: [],
  },
}

const validRequest = {
  policyType: 'auto' as const,
  document: {
    name: 'poliza.pdf',
    mimeType: 'application/pdf' as const,
    dataBase64: 'QUJD',
  },
}

function clientReturning(payload: unknown): ApiClient {
  return {
    async postJson<T>() {
      return payload as T
    },
  }
}

function clientThrowing(error: unknown): ApiClient {
  return {
    async postJson<T>(): Promise<T> {
      throw error
    },
  }
}

test('extractPolicyFields devuelve el payload cuando es válido', async () => {
  const result = await extractPolicyFields(validRequest, {
    client: clientReturning(successPayload),
  })
  assert.equal(result.ok, true)
  assert.equal(result.fields[0]?.value, 'ABC-123')
})

test('extractPolicyFields rechaza un payload sin ok', async () => {
  await assert.rejects(
    () =>
      extractPolicyFields(validRequest, {
        client: clientReturning({ ok: false }),
      }),
    (error: unknown) =>
      error instanceof ExtractionServiceError &&
      error.code === 'unexpected_response',
  )
})

test('extractPolicyFields rechaza un payload con fields inválidos', async () => {
  await assert.rejects(
    () =>
      extractPolicyFields(validRequest, {
        client: clientReturning({ ok: true, method: 'gemini', fields: [{}] }),
      }),
    (error: unknown) =>
      error instanceof ExtractionServiceError &&
      error.code === 'unexpected_response',
  )
})

test('extractPolicyFields mapea un error HTTP con código conocido', async () => {
  await assert.rejects(
    () =>
      extractPolicyFields(validRequest, {
        client: clientThrowing(
          new ApiError('http', 'req failed', {
            status: 503,
            code: 'service_unavailable',
            details: ['demasiadas solicitudes'],
          }),
        ),
      }),
    (error: unknown) =>
      error instanceof ExtractionServiceError &&
      error.code === 'service_unavailable' &&
      error.message === EXTRACTION_ERROR_MESSAGES.service_unavailable &&
      error.details?.[0] === 'demasiadas solicitudes',
  )
})

test('extractPolicyFields mapea un estado HTTP desconocido a internal_error', async () => {
  await assert.rejects(
    () =>
      extractPolicyFields(validRequest, {
        client: clientThrowing(
          new ApiError('http', 'req failed', { status: 418 }),
        ),
      }),
    (error: unknown) =>
      error instanceof ExtractionServiceError && error.code === 'internal_error',
  )
})

test('extractPolicyFields mapea un error de red', async () => {
  await assert.rejects(
    () =>
      extractPolicyFields(validRequest, {
        client: clientThrowing(new ApiError('network', 'no connection')),
      }),
    (error: unknown) =>
      error instanceof ExtractionServiceError && error.code === 'network_error',
  )
})

test('extractPolicyFields mapea un timeout', async () => {
  await assert.rejects(
    () =>
      extractPolicyFields(validRequest, {
        client: clientThrowing(new ApiError('timeout', 'too slow')),
      }),
    (error: unknown) =>
      error instanceof ExtractionServiceError && error.code === 'timeout',
  )
})

test('extractFromFile convierte el archivo y envía base64 en la solicitud', async () => {
  let captured: unknown
  const client: ApiClient = {
    async postJson<T>(_path: string, body: unknown) {
      captured = body
      return successPayload as T
    },
  }
  const file = new File([new Uint8Array([65, 66, 67])], 'poliza.png', {
    type: 'image/png',
  })

  await extractFromFile({ policyType: 'auto', file }, { client })

  const body = captured as {
    policyType: string
    document: { name: string; mimeType: string; dataBase64: string }
  }
  assert.equal(body.policyType, 'auto')
  assert.equal(body.document.name, 'poliza.png')
  assert.equal(body.document.mimeType, 'image/png')
  assert.equal(Buffer.from(body.document.dataBase64, 'base64').toString(), 'ABC')
})

test('extractFromFile lanza unsupported_media_type ante un archivo no válido', async () => {
  const file = new File([new Uint8Array([1])], 'notas.txt', {
    type: 'text/plain',
  })
  await assert.rejects(
    () => extractFromFile({ policyType: 'auto', file }),
    (error: unknown) =>
      error instanceof ExtractionServiceError &&
      error.code === 'unsupported_media_type',
  )
})
