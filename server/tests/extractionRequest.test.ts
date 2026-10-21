import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateExtractionRequest } from '../validation/extractionRequest.ts'

function validBody(): {
  policyType: string
  document: { name: string; mimeType: string; dataBase64: string }
} {
  return {
    policyType: 'auto',
    document: {
      name: 'poliza-auto.pdf',
      mimeType: 'application/pdf',
      dataBase64: Buffer.from('%PDF-1.4 contenido de prueba').toString('base64'),
    },
  }
}

test('acepta una solicitud válida', () => {
  const result = validateExtractionRequest(validBody())
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.value.policyType, 'auto')
    assert.equal(result.value.document.mimeType, 'application/pdf')
    assert.equal(result.value.document.name, 'poliza-auto.pdf')
  }
})

test('rechaza un cuerpo que no es objeto', () => {
  const result = validateExtractionRequest('no soy un objeto')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.error, 'invalid_request')
  }
})

test('rechaza policyType inválido', () => {
  const body = validBody()
  body.policyType = 'inventado'
  const result = validateExtractionRequest(body)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.status, 400)
})

test('rechaza document ausente', () => {
  const result = validateExtractionRequest({ policyType: 'auto' })
  assert.equal(result.ok, false)
})

test('rechaza nombre vacío', () => {
  const body = validBody()
  body.document.name = '   '
  const result = validateExtractionRequest(body)
  assert.equal(result.ok, false)
})

test('rechaza tipo MIME no soportado con 415', () => {
  const body = validBody()
  body.document.mimeType = 'application/zip'
  const result = validateExtractionRequest(body)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 415)
    assert.equal(result.error, 'unsupported_media_type')
  }
})

test('rechaza base64 inválido', () => {
  const body = validBody()
  body.document.dataBase64 = 'esto no es base64!!'
  const result = validateExtractionRequest(body)
  assert.equal(result.ok, false)
})

test('rechaza documento demasiado grande con 413', () => {
  const body = validBody()
  // Longitud múltiplo de 4 sin relleno -> decodifica a > 25 MB.
  body.document.dataBase64 = 'A'.repeat(34 * 1024 * 1024 + 4)
  const result = validateExtractionRequest(body)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 413)
    assert.equal(result.error, 'payload_too_large')
  }
})
