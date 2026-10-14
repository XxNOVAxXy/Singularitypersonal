import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionRequest } from '../../shared/api.ts'
import {
  GeminiServiceError,
} from '../services/geminiClient.ts'
import type { GeminiGateway } from '../services/geminiClient.ts'
import { runExtraction } from '../services/extractionService.ts'
import { ModelOutputError } from '../validation/modelOutput.ts'

function autoRequest(): ExtractionRequest {
  return {
    policyType: 'auto',
    document: {
      name: 'poliza.pdf',
      mimeType: 'application/pdf',
      dataBase64: Buffer.from('%PDF-1.4').toString('base64'),
    },
  }
}

function gatewayReturning(output: unknown): GeminiGateway {
  return {
    async generateJson() {
      return JSON.stringify(output)
    },
  }
}

test('devuelve el conjunto completo de campos del tipo de póliza', async () => {
  const result = await runExtraction(
    autoRequest(),
    gatewayReturning({ fields: {} }),
  )
  // 8 generales + 5 específicos de auto + 3 adicionales
  assert.equal(result.fields.length, 16)
  assert.equal(result.meta.totalFields, 16)
  assert.equal(result.method, 'gemini')
})

test('marca como ok un campo encontrado con confianza alta', async () => {
  const result = await runExtraction(
    autoRequest(),
    gatewayReturning({
      fields: { policyNumber: { value: 'AUT-2026-1', confidence: 0.95 } },
    }),
  )
  const field = result.fields.find((item) => item.key === 'policyNumber')
  assert.ok(field)
  assert.equal(field.value, 'AUT-2026-1')
  assert.equal(field.status, 'ok')
  assert.equal(field.source, 'gemini')
  assert.equal(field.confidence, 0.95)
  assert.equal(result.meta.providedFields, 1)
})

test('marca como review un campo con confianza baja', async () => {
  const result = await runExtraction(
    autoRequest(),
    gatewayReturning({
      fields: { premium: { value: '5000', confidence: 0.4 } },
    }),
  )
  const field = result.fields.find((item) => item.key === 'premium')
  assert.equal(field?.status, 'review')
  assert.equal(result.summary.review, 1)
})

test('marca como missing los obligatorios no encontrados', async () => {
  const result = await runExtraction(
    autoRequest(),
    gatewayReturning({ fields: { policyNumber: { value: 'X' } } }),
  )
  const insurer = result.fields.find((item) => item.key === 'insurer')
  assert.equal(insurer?.value, '')
  assert.equal(insurer?.status, 'missing')
  // insurer, client, startDate, endDate, premium + 3 specific obligatorios
  assert.ok(result.meta.missingRequired >= 5)
  assert.equal(result.summary.missing, result.meta.missingRequired)
})

test('un campo opcional no encontrado queda como ok y vacío', async () => {
  const result = await runExtraction(
    autoRequest(),
    gatewayReturning({ fields: {} }),
  )
  const optional = result.fields.find((item) => item.key === 'observations')
  assert.equal(optional?.value, '')
  assert.equal(optional?.status, 'ok')
})

test('reporta claves desconocidas sin crear campos', async () => {
  const result = await runExtraction(
    autoRequest(),
    gatewayReturning({
      fields: { campoFantasma: { value: 'x' } },
    }),
  )
  assert.deepEqual(result.meta.unknownFields, ['campoFantasma'])
  assert.equal(
    result.fields.some((item) => item.key === 'campoFantasma'),
    false,
  )
})

test('propaga los errores del servicio de Gemini', async () => {
  const gateway: GeminiGateway = {
    async generateJson() {
      throw new GeminiServiceError('service_unavailable', 503, 'no disponible')
    },
  }
  await assert.rejects(
    () => runExtraction(autoRequest(), gateway),
    (error: unknown) => error instanceof GeminiServiceError,
  )
})

test('rechaza una salida del modelo que no es JSON válido', async () => {
  const gateway: GeminiGateway = {
    async generateJson() {
      return 'no es json'
    },
  }
  await assert.rejects(
    () => runExtraction(autoRequest(), gateway),
    (error: unknown) => error instanceof ModelOutputError,
  )
})

test('usa la misma cantidad de campos para otro tipo de póliza', async () => {
  const request: ExtractionRequest = {
    ...autoRequest(),
    policyType: 'recibo',
  }
  const result = await runExtraction(
    request,
    gatewayReturning({ fields: {} }),
  )
  // 8 generales + 2 específicos de recibo + 3 adicionales
  assert.equal(result.fields.length, 13)
})
