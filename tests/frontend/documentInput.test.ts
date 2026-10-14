import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  arrayBufferToBase64,
  fileToDocumentInput,
  resolveMimeType,
  validateDocumentFile,
} from '../../src/services/documentInput.ts'

test('resolveMimeType reconoce por extensión cuando el navegador no informa tipo', () => {
  assert.equal(resolveMimeType('poliza.PDF', ''), 'application/pdf')
  assert.equal(resolveMimeType('foto.jpeg', ''), 'image/jpeg')
  assert.equal(resolveMimeType('scan.webp', ''), 'image/webp')
})

test('resolveMimeType prioriza el tipo declarado soportado', () => {
  assert.equal(resolveMimeType('archivo', 'image/png'), 'image/png')
})

test('resolveMimeType devuelve null para tipos no soportados', () => {
  assert.equal(resolveMimeType('hoja.xlsx', 'application/vnd.ms-excel'), null)
  assert.equal(resolveMimeType('notas.txt', 'text/plain'), null)
})

test('validateDocumentFile acepta un archivo válido', () => {
  const result = validateDocumentFile({
    name: 'poliza.pdf',
    type: 'application/pdf',
    size: 1024,
  })
  assert.equal(result.ok, true)
})

test('validateDocumentFile rechaza formatos no soportados', () => {
  const result = validateDocumentFile({
    name: 'poliza.xlsx',
    type: 'application/vnd.ms-excel',
    size: 1024,
  })
  assert.equal(result.ok, false)
  assert.match(result.message ?? '', /Formato no compatible/)
})

test('validateDocumentFile rechaza archivos vacíos', () => {
  const result = validateDocumentFile({
    name: 'poliza.pdf',
    type: 'application/pdf',
    size: 0,
  })
  assert.equal(result.ok, false)
})

test('validateDocumentFile rechaza archivos mayores a 6 MB', () => {
  const result = validateDocumentFile({
    name: 'poliza.pdf',
    type: 'application/pdf',
    size: 6 * 1024 * 1024 + 1,
  })
  assert.equal(result.ok, false)
  assert.match(result.message ?? '', /6 MB/)
})

test('arrayBufferToBase64 coincide con la codificación esperada', () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5])
  assert.equal(
    arrayBufferToBase64(bytes.buffer),
    Buffer.from(bytes).toString('base64'),
  )
})

test('fileToDocumentInput convierte el archivo a base64 y resuelve el MIME', async () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'poliza.png', {
    type: 'image/png',
  })
  const input = await fileToDocumentInput(file)
  assert.equal(input.name, 'poliza.png')
  assert.equal(input.mimeType, 'image/png')
  assert.equal(
    Buffer.from(input.dataBase64, 'base64').toString('hex'),
    '010203',
  )
})
