import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ExtractionField,
  FieldDefinition,
  PolicyDocument,
  PolicyType,
} from '../../shared/types.ts'
import {
  applyUserEdit,
  buildExtractionJson,
  createFieldFromDefinition,
  groupFields,
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

function document(policyType: PolicyType): PolicyDocument {
  return {
    id: `doc-${policyType}`,
    name: `poliza-${policyType}.pdf`,
    policyType,
    insurer: 'GNP',
    client: 'Ana',
    policyNumber: `POL-${policyType}`,
    fileType: 'pdf',
    pages: 2,
    sizeKb: 100,
    receivedAt: '2026-01-05',
    status: 'pending',
  }
}

type JsonShape = {
  document: { policyType: PolicyType; name: string } | null
  extraction: {
    method: string
    fields: {
      general: Record<string, unknown>
      specific: Record<string, unknown>
      additional: Record<string, unknown>
    }
  }
}

test('buildExtractionJson agrupa los campos por alcance', () => {
  const fields: ExtractionField[] = [
    createFieldFromDefinition(definition({ key: 'policyNumber', scope: 'general' }), {
      value: 'AUT-1',
    }),
    createFieldFromDefinition(definition({ key: 'vehicleModel', scope: 'specific' }), {
      value: 'Nissan Versa',
    }),
    createFieldFromDefinition(definition({ key: 'agentName', scope: 'additional' }), {
      value: 'Carlos',
    }),
  ]
  const json = buildExtractionJson(document('auto'), 'manual', fields) as JsonShape
  assert.equal(json.extraction.fields.general.policyNumber, 'AUT-1')
  assert.equal(json.extraction.fields.specific.vehicleModel, 'Nissan Versa')
  assert.equal(json.extraction.fields.additional.agentName, 'Carlos')
  assert.equal(json.extraction.method, 'manual')
  assert.equal(json.document?.policyType, 'auto')
})

test('editar un campo actualiza el JSON mostrado', () => {
  const fields: ExtractionField[] = [
    createFieldFromDefinition(
      definition({ key: 'policyNumber', required: true }),
      { value: 'AUT-1' },
    ),
  ]
  const before = buildExtractionJson(
    document('auto'),
    'gemini',
    fields,
  ) as JsonShape
  assert.equal(before.extraction.fields.general.policyNumber, 'AUT-1')

  const edited = fields.map((item) =>
    item.key === 'policyNumber' ? applyUserEdit(item, 'AUT-2') : item,
  )
  const after = buildExtractionJson(
    document('auto'),
    'gemini',
    edited,
  ) as JsonShape
  assert.equal(after.extraction.fields.general.policyNumber, 'AUT-2')
})

test('los valores vacíos se representan de forma consistente', () => {
  const fields: ExtractionField[] = [
    createFieldFromDefinition(definition({ key: 'agentName', scope: 'additional' })),
  ]
  const json = buildExtractionJson(document('vida'), 'manual', fields) as JsonShape
  assert.equal(json.extraction.fields.additional.agentName, '')
})

test('un documento nulo produce document: null', () => {
  const json = buildExtractionJson(null, 'manual', []) as JsonShape
  assert.equal(json.document, null)
})

test('manual y Gemini comparten la misma forma de JSON con los mismos valores', () => {
  const manual: ExtractionField[] = [
    createFieldFromDefinition(definition({ key: 'policyNumber' }), {
      value: 'POL-1',
      source: 'manual',
    }),
  ]
  const gemini: ExtractionField[] = [
    createFieldFromDefinition(definition({ key: 'policyNumber' }), {
      value: 'POL-1',
      source: 'gemini',
      confidence: 0.9,
    }),
  ]
  const manualJson = buildExtractionJson(document('auto'), 'manual', manual)
  const geminiJson = buildExtractionJson(document('auto'), 'gemini', gemini)
  assert.deepEqual(
    (manualJson as JsonShape).extraction.fields,
    (geminiJson as JsonShape).extraction.fields,
  )
})

test('distintos tipos de póliza mantienen la misma estructura', () => {
  const types: PolicyType[] = ['auto', 'gmm', 'vida', 'fianza', 'danos', 'recibo']
  for (const policyType of types) {
    const json = buildExtractionJson(document(policyType), 'manual', []) as JsonShape
    assert.equal(json.document?.policyType, policyType)
    assert.deepEqual(Object.keys(json.extraction.fields), [
      'general',
      'specific',
      'additional',
    ])
  }
})

test('groupFields reparte correctamente los alcances', () => {
  const fields: ExtractionField[] = [
    createFieldFromDefinition(definition({ key: 'a', scope: 'general' })),
    createFieldFromDefinition(definition({ key: 'b', scope: 'specific' })),
    createFieldFromDefinition(definition({ key: 'c', scope: 'specific' })),
    createFieldFromDefinition(definition({ key: 'd', scope: 'additional' })),
  ]
  const grouped = groupFields(fields)
  assert.equal(grouped.general.length, 1)
  assert.equal(grouped.specific.length, 2)
  assert.equal(grouped.additional.length, 1)
})
