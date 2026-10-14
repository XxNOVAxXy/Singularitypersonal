import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionField, FieldDefinition } from '../../shared/types.ts'
import {
  applyFieldValidation,
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

function field(overrides: Partial<ExtractionField>): ExtractionField {
  return {
    key: 'field',
    label: 'Campo',
    kind: 'text',
    scope: 'general',
    value: '',
    source: 'manual',
    status: 'ok',
    required: false,
    ...overrides,
  }
}

test('un obligatorio vacío queda como missing con motivo', () => {
  const result = applyFieldValidation(
    field({ required: true, value: '', status: 'ok' }),
  )
  assert.equal(result.status, 'missing')
  assert.equal(result.reason, 'missing_required')
  assert.equal(result.note, 'Campo obligatorio sin valor')
})

test('un opcional vacío queda como ok sin motivo', () => {
  const result = applyFieldValidation(
    field({ required: false, value: '', note: undefined }),
  )
  assert.equal(result.status, 'ok')
  assert.equal(result.note, undefined)
})

test('una fecha con formato inválido requiere revisión', () => {
  const result = applyFieldValidation(
    field({ kind: 'date', value: '31/12/2026' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'invalid_format')
})

test('una fecha imposible requiere revisión', () => {
  const result = applyFieldValidation(
    field({ kind: 'date', value: '2026-02-30' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'invalid_format')
})

test('una fecha ISO válida se valida', () => {
  const result = applyFieldValidation(
    field({ kind: 'date', value: '2026-02-28' }),
  )
  assert.equal(result.status, 'ok')
  assert.equal(result.reason, undefined)
})

test('un número inválido requiere revisión', () => {
  const result = applyFieldValidation(
    field({ kind: 'number', value: 'doce' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'invalid_format')
})

test('un número decimal válido se valida', () => {
  const result = applyFieldValidation(
    field({ kind: 'number', value: '1234.56' }),
  )
  assert.equal(result.status, 'ok')
})

test('una moneda inválida requiere revisión', () => {
  const result = applyFieldValidation(
    field({ kind: 'currency', value: 'cinco mil' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'invalid_format')
})

test('una moneda con símbolo y separadores se valida', () => {
  const result = applyFieldValidation(
    field({ kind: 'currency', value: '$ 12,500.00' }),
  )
  assert.equal(result.status, 'ok')
})

test('un booleano ambiguo requiere revisión', () => {
  const result = applyFieldValidation(
    field({ kind: 'boolean', value: 'Tal vez' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'ambiguous')
})

test('un booleano Sí/No se valida', () => {
  assert.equal(
    applyFieldValidation(field({ kind: 'boolean', value: 'Sí' })).status,
    'ok',
  )
  assert.equal(
    applyFieldValidation(field({ kind: 'boolean', value: 'No' })).status,
    'ok',
  )
})

test('un select fuera de opciones requiere revisión', () => {
  const result = applyFieldValidation(
    field({ kind: 'select', value: 'Deluxe', options: ['Básico', 'Amplio'] }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'ambiguous')
})

test('un select dentro de opciones se valida', () => {
  const result = applyFieldValidation(
    field({ kind: 'select', value: 'Amplio', options: ['Básico', 'Amplio'] }),
  )
  assert.equal(result.status, 'ok')
})

test('la confianza baja mantiene el campo en revisión aunque tenga valor', () => {
  const result = applyFieldValidation(
    field({ value: 'AUT-2026-1', confidence: 0.4, source: 'gemini' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'low_confidence')
})

test('un valor respaldado con confianza alta se valida', () => {
  const result = applyFieldValidation(
    field({ value: 'AUT-2026-1', confidence: 0.95, source: 'gemini' }),
  )
  assert.equal(result.status, 'ok')
})

test('un valor de Gemini sin medida de confianza no se da por validado', () => {
  const result = applyFieldValidation(
    field({ value: 'AUT-2026-1', source: 'gemini' }),
  )
  assert.equal(result.status, 'review')
  assert.equal(result.reason, 'low_confidence')
})

test('un valor manual sin confianza sí se valida (no proviene del modelo)', () => {
  const result = applyFieldValidation(
    field({ value: 'AUT-2026-1', source: 'manual' }),
  )
  assert.equal(result.status, 'ok')
})

test('el estado se recalcula: no arrastra missing previo', () => {
  const result = withResolvedStatus(
    field({ required: true, value: 'AUT-2026-1', status: 'missing' }),
  )
  assert.equal(result.status, 'ok')
})

test('createFieldFromDefinition marca missing solo a los obligatorios', () => {
  const required = createFieldFromDefinition(
    definition({ key: 'policyNumber', required: true }),
  )
  const optional = createFieldFromDefinition(
    definition({ key: 'currency', required: false }),
  )
  assert.equal(required.status, 'missing')
  assert.equal(optional.status, 'ok')
  assert.equal(required.value, '')
  assert.equal(optional.value, '')
})

test('un valor de fecha válido en un obligatorio queda como ok', () => {
  const result = withResolvedStatus(
    createFieldFromDefinition(
      definition({ key: 'startDate', kind: 'date', required: true }),
      { value: '2026-01-01', source: 'gemini', confidence: 0.9 },
    ),
  )
  assert.equal(result.status, 'ok')
})
