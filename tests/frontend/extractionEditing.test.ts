import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionField, FieldDefinition } from '../../shared/types.ts'
import {
  applyUserEdit,
  createFieldFromDefinition,
  withResolvedStatus,
} from '../../shared/extraction.ts'

function definition(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'test',
    key: 'field',
    label: 'Campo',
    kind: 'text',
    scope: 'general',
    required: false,
    enabled: true,
    ...overrides,
  }
}

test('applyUserEdit marca el origen, limpia trazabilidad y recalcula estado', () => {
  const geminiField = withResolvedStatus(
    createFieldFromDefinition(definition({ key: 'premium', kind: 'currency' }), {
      value: '5000',
      source: 'gemini',
      confidence: 0.4,
      note: 'Confianza baja del modelo',
      reason: 'low_confidence',
      page: 2,
      sourceRef: 'Prima total 5000',
    }),
  )
  assert.equal(geminiField.status, 'review')

  const edited = applyUserEdit(geminiField, '5000.00')
  assert.equal(edited.source, 'user')
  assert.equal(edited.confidence, undefined)
  assert.equal(edited.page, undefined)
  assert.equal(edited.sourceRef, undefined)
  assert.equal(edited.status, 'ok')
  assert.equal(edited.note, undefined)
  assert.equal(edited.reason, undefined)
})

test('edit a un valor inválido deja motivo fresco de revisión', () => {
  const edited = applyUserEdit(
    createFieldFromDefinition(definition({ key: 'startDate', kind: 'date' })),
    'ayer',
  )
  assert.equal(edited.status, 'review')
  assert.equal(edited.reason, 'invalid_format')
  assert.match(edited.note ?? '', /fecha/i)
})

test('edit a un obligatorio vacío lo marca como missing', () => {
  const edited = applyUserEdit(
    createFieldFromDefinition(
      definition({ key: 'policyNumber', required: true }),
      { value: 'AUT-1' },
    ),
    '',
  )
  assert.equal(edited.status, 'missing')
  assert.equal(edited.reason, 'missing_required')
})

test('editar un campo no afecta a los demás', () => {
  const fields: ExtractionField[] = [
    createFieldFromDefinition(definition({ key: 'a' }), { value: '1' }),
    createFieldFromDefinition(definition({ key: 'b' }), { value: '2' }),
  ]
  const updated = fields.map((item) =>
    item.key === 'a' ? applyUserEdit(item, '99') : item,
  )
  assert.equal(updated[0]?.value, '99')
  assert.equal(updated[0]?.source, 'user')
  assert.equal(updated[1]?.value, '2')
  assert.equal(updated[1]?.source, 'manual')
})

