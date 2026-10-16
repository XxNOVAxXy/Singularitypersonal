import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ExtractionField,
  ExtractionMethod,
  FieldSource,
} from '../../shared/types.ts'
import {
  extractionStorageKey,
  readStoredExtraction,
  writeStoredExtraction,
  type ExtractionStorage,
} from '../../src/features/extraction/utils/extractionPersistence.ts'
import { resolveInitialFields } from '../../src/features/extraction/utils/extractionInitialFields.ts'

class FakeStorage implements ExtractionStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function field(key: string, value: string, source: FieldSource = 'manual'): ExtractionField {
  return {
    key,
    label: key,
    kind: 'text',
    scope: 'general',
    value,
    source,
    status: value === '' ? 'missing' : 'ok',
    required: false,
  }
}

const MANUAL: ExtractionMethod = 'manual'
const GEMINI: ExtractionMethod = 'gemini'

function blankManualFields(): ExtractionField[] {
  return [field('policyNumber', ''), field('premium', '')]
}

test('manual con captura guardada: recupera los campos y valores guardados', () => {
  const saved = [field('policyNumber', 'P-1', 'user'), field('premium', '1200', 'user')]
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: MANUAL,
    storedFields: saved,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: blankManualFields(),
  })

  assert.equal(resolution.source, 'manual-restored')
  assert.deepEqual(resolution.fields, saved)
})

test('manual sin captura guardada: crea los campos vacíos', () => {
  const blanks = blankManualFields()
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: MANUAL,
    storedFields: null,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: blanks,
  })

  assert.equal(resolution.source, 'manual-blank')
  assert.deepEqual(resolution.fields, blanks)
})

test('gemini con captura guardada: conserva la hidratación existente', () => {
  const saved = [field('policyNumber', 'G-9', 'gemini')]
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: GEMINI,
    storedFields: saved,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: [],
  })

  assert.equal(resolution.source, 'stored')
  assert.deepEqual(resolution.fields, saved)
})

test('gemini con campos iniciales (bandeja) mantiene el comportamiento previo', () => {
  const initial = [field('policyNumber', 'INBOX-1', 'gemini')]
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: GEMINI,
    storedFields: null,
    hasAttachment: false,
    initialFields: initial,
    blankManualFields: [],
  })

  assert.equal(resolution.source, 'initial')
  assert.deepEqual(resolution.fields, initial)
})

test('gemini con adjunto: parte de campos vacíos mientras procesa el archivo', () => {
  const saved = [field('policyNumber', 'G-9', 'gemini')]
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: GEMINI,
    storedFields: saved,
    hasAttachment: true,
    initialFields: null,
    blankManualFields: [],
  })

  assert.equal(resolution.source, 'attachment')
  assert.deepEqual(resolution.fields, [])
})

test('cambio entre documentos: no reutiliza la captura manual de otro documento', () => {
  const storage = new FakeStorage()
  const savedA = [field('policyNumber', 'A-1', 'user')]
  writeStoredExtraction('A', MANUAL, savedA, storage)

  const storedB = readStoredExtraction('B', MANUAL, storage)
  const resolution = resolveInitialFields({
    documentId: 'B',
    method: MANUAL,
    storedFields: storedB?.fields ?? null,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: blankManualFields(),
  })

  assert.equal(storedB, null)
  assert.equal(resolution.source, 'manual-blank')
  assert.notDeepEqual(resolution.fields, savedA)
  // La captura de A permanece intacta.
  assert.deepEqual(readStoredExtraction('A', MANUAL, storage)?.fields, savedA)
})

test('identidad: los campos recuperados quedan asociados al documentId activo', () => {
  const cases: Array<{ method: ExtractionMethod; stored: ExtractionField[] | null }> = [
    { method: MANUAL, stored: [field('x', '1', 'user')] },
    { method: MANUAL, stored: null },
    { method: GEMINI, stored: [field('x', '1', 'gemini')] },
    { method: GEMINI, stored: null },
  ]
  for (const { method, stored } of cases) {
    const resolution = resolveInitialFields({
      documentId: 'active-1',
      method,
      storedFields: stored,
      hasAttachment: false,
      initialFields: null,
      blankManualFields: blankManualFields(),
    })
    assert.equal(resolution.documentId, 'active-1')
  }
})

test('aislamiento por método: una captura gemini no se muestra como captura manual', () => {
  const storage = new FakeStorage()
  const geminiSaved = [field('policyNumber', 'G-9', 'gemini')]
  writeStoredExtraction('A', GEMINI, geminiSaved, storage)

  const storedManual = readStoredExtraction('A', MANUAL, storage)
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: MANUAL,
    storedFields: storedManual?.fields ?? null,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: blankManualFields(),
  })

  assert.equal(storedManual, null)
  assert.equal(resolution.source, 'manual-blank')
  assert.notEqual(extractionStorageKey('A', MANUAL), extractionStorageKey('A', GEMINI))
  assert.deepEqual(readStoredExtraction('A', GEMINI, storage)?.fields, geminiSaved)
})
