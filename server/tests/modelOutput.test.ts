import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FieldKind } from '../../shared/types.ts'
import { ModelOutputError, parseModelOutput } from '../validation/modelOutput.ts'

const allowed = new Map<string, FieldKind>([
  ['policyNumber', 'text'],
  ['premium', 'currency'],
  ['active', 'boolean'],
])

test('analiza una salida válida y conserva valor y confianza', () => {
  const raw = JSON.stringify({
    fields: {
      policyNumber: { value: 'AUT-2026-1', confidence: 0.92 },
      premium: { value: 12345.5, confidence: 0.8 },
    },
  })
  const { values, unknownFields } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.value, 'AUT-2026-1')
  assert.equal(values.get('policyNumber')?.confidence, 0.92)
  assert.equal(values.get('premium')?.value, '12345.5')
  assert.deepEqual(unknownFields, [])
})

test('reporta claves desconocidas y no las convierte en campos', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: 'X' }, campoInventado: { value: 'Y' } },
  })
  const { values, unknownFields } = parseModelOutput(raw, allowed)
  assert.deepEqual(unknownFields, ['campoInventado'])
  assert.equal(values.has('campoInventado'), false)
})

test('omite valores vacíos', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: '   ' }, premium: { value: '' } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.size, 0)
})

test('acepta JSON envuelto en bloques de código', () => {
  const raw = '```json\n{"fields":{"policyNumber":{"value":"OK"}}}\n```'
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.value, 'OK')
})

test('normaliza booleanos a Sí/No', () => {
  const raw = JSON.stringify({
    fields: {
      active: { value: true },
    },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('active')?.value, 'Sí')
})

test('normaliza cadenas booleanas', () => {
  const raw = JSON.stringify({
    fields: { active: { value: 'no' } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('active')?.value, 'No')
})

test('acota la confianza al rango [0, 1]', () => {
  const raw = JSON.stringify({
    fields: {
      policyNumber: { value: 'A', confidence: 3 },
      premium: { value: 'B', confidence: -1 },
    },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.confidence, 1)
  assert.equal(values.get('premium')?.confidence, 0)
})

test('ignora confianzas no numéricas', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: 'A', confidence: 'alta' } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.confidence, undefined)
})

test('conserva la página y el fragmento de origen cuando existen', () => {
  const raw = JSON.stringify({
    fields: {
      policyNumber: {
        value: 'AUT-2026-1',
        confidence: 0.9,
        page: 2,
        snippet: 'Número de póliza: AUT-2026-1',
      },
    },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.page, 2)
  assert.equal(values.get('policyNumber')?.sourceRef, 'Número de póliza: AUT-2026-1')
})

test('acepta la página como cadena numérica', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: 'A', page: '3' } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.page, 3)
})

test('ignora páginas inválidas y fragmentos vacíos', () => {
  const raw = JSON.stringify({
    fields: {
      policyNumber: { value: 'A', page: -1, snippet: '   ' },
      premium: { value: 'B', page: 'uno' },
    },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.page, undefined)
  assert.equal(values.get('policyNumber')?.sourceRef, undefined)
  assert.equal(values.get('premium')?.page, undefined)
})

test('recorta fragmentos de origen demasiado largos', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: 'A', snippet: 'x'.repeat(500) } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.sourceRef?.length, 160)
})

test('lanza ModelOutputError con JSON inválido', () => {
  assert.throws(() => parseModelOutput('esto no es json', allowed), ModelOutputError)
})

test('lanza ModelOutputError si falta "fields"', () => {
  assert.throws(
    () => parseModelOutput(JSON.stringify({ otros: {} }), allowed),
    ModelOutputError,
  )
})

test('lanza ModelOutputError si la raíz no es objeto', () => {
  assert.throws(() => parseModelOutput('[]', allowed), ModelOutputError)
})

test('conserva fragmento de origen de exactamente 160 caracteres', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: 'A', snippet: 'x'.repeat(160) } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.sourceRef?.length, 160)
  assert.equal(values.get('policyNumber')?.sourceRef, 'x'.repeat(160))
})

test('limita fragmento de origen de 161 caracteres a 160', () => {
  const raw = JSON.stringify({
    fields: { policyNumber: { value: 'A', snippet: 'x'.repeat(161) } },
  })
  const { values } = parseModelOutput(raw, allowed)
  assert.equal(values.get('policyNumber')?.sourceRef?.length, 160)
  assert.equal(values.get('policyNumber')?.sourceRef, 'x'.repeat(160))
})

test('normaliza valores booleanos TRUE, Si, SI, YES, False y NO correctamente', () => {
  const booleanFields = new Map<string, FieldKind>([
    ['b1', 'boolean'],
    ['b2', 'boolean'],
    ['b3', 'boolean'],
    ['b4', 'boolean'],
    ['b5', 'boolean'],
    ['b6', 'boolean'],
  ])
  const raw = JSON.stringify({
    fields: {
      b1: { value: 'TRUE' },
      b2: { value: 'Si' },
      b3: { value: 'SI' },
      b4: { value: 'YES' },
      b5: { value: 'False' },
      b6: { value: 'NO' },
    },
  })
  const { values, unknownFields } = parseModelOutput(raw, booleanFields)
  assert.deepEqual(unknownFields, [])
  assert.equal(values.get('b1')?.value, 'Sí')
  assert.equal(values.get('b2')?.value, 'Sí')
  assert.equal(values.get('b3')?.value, 'Sí')
  assert.equal(values.get('b4')?.value, 'Sí')
  assert.equal(values.get('b5')?.value, 'No')
  assert.equal(values.get('b6')?.value, 'No')
})
