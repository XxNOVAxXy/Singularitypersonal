import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionField, ExtractionMethod } from '../../shared/types.ts'
import type { ExtractionStatus } from '../../src/features/extraction/utils/extractionState.ts'
import {
  clearStoredExtraction,
  extractionStorageKey,
  readStoredExtraction,
  shouldPersistExtraction,
  writeStoredExtraction,
  type ExtractionStorage,
} from '../../src/features/extraction/utils/extractionPersistence.ts'
import { resolveSearchParamNavigation } from '../../src/features/extraction/utils/documentNavigation.ts'

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
  entries(): Array<[string, string]> {
    return [...this.values.entries()]
  }
}

function field(key: string, value: string): ExtractionField {
  return {
    key,
    label: key,
    kind: 'text',
    scope: 'general',
    value,
    source: 'gemini',
    status: 'ok',
    required: false,
  }
}

const METHOD: ExtractionMethod = 'gemini'

/**
 * Reproduce la condición de persistencia vigente antes de la corrección:
 * solo mira el estado de ejecución y que haya campos, sin comprobar a qué
 * documento pertenecen. Se usa para documentar el fallo original.
 */
function legacyShouldPersist(
  activeDocumentId: string | null,
  status: ExtractionStatus,
  fields: ExtractionField[],
): boolean {
  return Boolean(activeDocumentId) && status === 'done' && fields.length > 0
}

/**
 * Emula el commit de React al cambiar de documento: el efecto de persistencia
 * se ejecuta con el documento activo NUEVO pero con los campos/estado AÚN del
 * documento anterior.
 */
function persistFromEffect(
  activeDocumentId: string | null,
  status: ExtractionStatus,
  snapshot: { documentId: string | null; fields: ExtractionField[] },
  storage: ExtractionStorage,
): void {
  if (!shouldPersistExtraction(activeDocumentId, status, snapshot)) return
  writeStoredExtraction(activeDocumentId as string, METHOD, snapshot.fields, storage)
}

test('la condición original reproducía el guardado de campos de A bajo el ID de B', () => {
  const fieldsFromA = [field('premium', '1000')]
  assert.equal(legacyShouldPersist('B', 'done', fieldsFromA), true)
})

test('cambio A → B: los campos de A nunca se guardan bajo el ID de B', () => {
  const storage = new FakeStorage()
  const fieldsFromA = [field('premium', '1000')]
  persistFromEffect('A', 'done', { documentId: 'A', fields: fieldsFromA }, storage)

  // React confirmó el cambio a B: documento activo B, campos todavía de A.
  persistFromEffect('B', 'done', { documentId: 'A', fields: fieldsFromA }, storage)

  assert.equal(readStoredExtraction('B', METHOD, storage), null)
  const storedA = readStoredExtraction('A', METHOD, storage)
  assert.deepEqual(storedA?.fields, fieldsFromA)
})

test('hidratación: B recupera exactamente los campos que pertenecen a B', () => {
  const storage = new FakeStorage()
  const fieldsFromB = [field('policyNumber', 'B-1')]
  writeStoredExtraction('B', METHOD, fieldsFromB, storage)

  assert.deepEqual(readStoredExtraction('B', METHOD, storage)?.fields, fieldsFromB)
  assert.equal(readStoredExtraction('A', METHOD, storage), null)
})

test('edición: los campos editados de B se persisten bajo el ID de B', () => {
  const storage = new FakeStorage()
  const editedB = [field('premium', '9999')]
  persistFromEffect('B', 'done', { documentId: 'B', fields: editedB }, storage)

  assert.deepEqual(readStoredExtraction('B', METHOD, storage)?.fields, editedB)
})

test('regresión: cambiar de documento no borra ni sobrescribe resultados ajenos', () => {
  const storage = new FakeStorage()
  const fieldsFromA = [field('premium', '1000')]
  const fieldsFromB = [field('premium', '2000')]
  writeStoredExtraction('A', METHOD, fieldsFromA, storage)
  writeStoredExtraction('B', METHOD, fieldsFromB, storage)

  // Transición A → B con campos de A aún en memoria.
  persistFromEffect('B', 'done', { documentId: 'A', fields: fieldsFromA }, storage)

  assert.deepEqual(readStoredExtraction('A', METHOD, storage)?.fields, fieldsFromA)
  assert.deepEqual(readStoredExtraction('B', METHOD, storage)?.fields, fieldsFromB)
})

test('no persiste mientras la extracción no ha terminado', () => {
  const snapshot = { documentId: 'A', fields: [field('premium', '1000')] }
  assert.equal(shouldPersistExtraction('A', 'extracting', snapshot), false)
  assert.equal(shouldPersistExtraction('A', 'ready', snapshot), false)
  assert.equal(shouldPersistExtraction('A', 'error', snapshot), false)
})

test('no persiste un conjunto de campos vacío ni sin documento activo', () => {
  assert.equal(shouldPersistExtraction('A', 'done', { documentId: 'A', fields: [] }), false)
  assert.equal(
    shouldPersistExtraction(null, 'done', { documentId: null, fields: [field('x', '1')] }),
    false,
  )
})

test('la clave de almacenamiento codifica el documento y respeta el método', () => {
  assert.equal(extractionStorageKey('gmail/1', METHOD), `singularity.extraction.${METHOD}.gmail%2F1`)
  assert.notEqual(extractionStorageKey('A', METHOD), extractionStorageKey('B', METHOD))
})

test('clearStoredExtraction elimina solo la entrada indicada', () => {
  const storage = new FakeStorage()
  writeStoredExtraction('A', METHOD, [field('premium', '1')], storage)
  writeStoredExtraction('B', METHOD, [field('premium', '2')], storage)

  clearStoredExtraction('A', METHOD, storage)

  assert.equal(readStoredExtraction('A', METHOD, storage), null)
  assert.notEqual(readStoredExtraction('B', METHOD, storage), null)
  assert.deepEqual(storage.entries(), [[extractionStorageKey('B', METHOD), storage.getItem(extractionStorageKey('B', METHOD))!]])
})

test('navegación por URL: un documento nuevo distinto del activo invalida el adjunto previo', () => {
  const navigation = resolveSearchParamNavigation('B', 'A', ['A', 'B'])
  assert.deepEqual(navigation, { documentId: 'B', clearAttachment: true })
})

test('navegación por URL: el mismo documento activo no invalida el adjunto', () => {
  assert.equal(resolveSearchParamNavigation('A', 'A', ['A', 'B']), null)
})

test('navegación por URL: parámetro ausente o desconocido no cambia la selección', () => {
  assert.equal(resolveSearchParamNavigation(null, 'A', ['A', 'B']), null)
  assert.equal(resolveSearchParamNavigation('Z', 'A', ['A', 'B']), null)
})
