import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionField, ExtractionMethod } from '../../shared/types.ts'
import {
  clearStoredExtraction,
  extractionStorageKey,
  readStoredExtraction,
  shouldPersistExtraction,
  writeStoredExtraction,
  type ExtractionStorage,
} from '../../src/features/extraction/utils/extractionPersistence.ts'

/**
 * Pruebas de preparación para el Bug 1 (captura manual con Guardar explícito).
 *
 * Todo se ejercita contra la API de persistencia REAL de producción
 * (`extractionPersistence.ts`): la guarda document-scoped del Bug 3 y el
 * contrato de almacenamiento que la futura acción "Guardar" deberá usar.
 *
 * No se crea ni se modifica lógica de producción. Las partes que dependen de
 * APIs que todavía no existen (acción Guardar, hidratación manual, estado
 * "sucio") quedan documentadas en el informe, no se simulan aquí.
 */

const MANUAL: ExtractionMethod = 'manual'
const GEMINI: ExtractionMethod = 'gemini'

class FakeStorage implements ExtractionStorage {
  private readonly values = new Map<string, string>()
  failOnGet = false
  failOnSet = false
  failOnRemove = false

  getItem(key: string): string | null {
    if (this.failOnGet) throw new Error('almacenamiento no disponible')
    return this.values.has(key) ? this.values.get(key)! : null
  }

  setItem(key: string, value: string): void {
    if (this.failOnSet) throw new Error('QuotaExceededError')
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    if (this.failOnRemove) throw new Error('almacenamiento no disponible')
    this.values.delete(key)
  }

  has(key: string): boolean {
    return this.values.has(key)
  }
}

function field(key: string, value: string): ExtractionField {
  return {
    key,
    label: key,
    kind: 'text',
    scope: 'general',
    value,
    source: 'manual',
    status: 'ok',
    required: false,
  }
}

test('escenario 1 (precondición) — sin captura guardada la lectura devuelve null', () => {
  const storage = new FakeStorage()
  assert.equal(readStoredExtraction('doc-A', MANUAL, storage), null)
  assert.equal(readStoredExtraction('doc-A', MANUAL, null), null)
})

test('escenario 5 — Guardar persiste bajo el método manual y el documentId correctos', () => {
  const storage = new FakeStorage()
  const fields = [field('premium', '1500')]
  const snapshot = { documentId: 'doc-A', fields }

  // La futura acción Guardar solo debe escribir tras pasar la guarda de identidad.
  assert.equal(shouldPersistExtraction('doc-A', 'done', snapshot), true)
  writeStoredExtraction('doc-A', MANUAL, snapshot.fields, storage)

  assert.ok(storage.has(extractionStorageKey('doc-A', MANUAL)))
  assert.deepEqual(readStoredExtraction('doc-A', MANUAL, storage)?.fields, fields)
  // No debe quedar nada bajo el método Gemini.
  assert.equal(readStoredExtraction('doc-A', GEMINI, storage), null)
})

test('escenario 5 (identidad) — no se guarda si el documentId de los campos no es el activo', () => {
  const snapshot = { documentId: 'doc-A', fields: [field('premium', '1')] }
  assert.equal(shouldPersistExtraction('doc-B', 'done', snapshot), false)
  assert.equal(shouldPersistExtraction(null, 'done', snapshot), false)
  assert.equal(shouldPersistExtraction('doc-A', 'ready', snapshot), false)
})

test('escenario 7 — la transición A → B no mezcla capturas manuales ni sobrescribe B', () => {
  const storage = new FakeStorage()
  const fieldsFromA = [field('premium', '1000')]
  const fieldsFromB = [field('premium', '2000')]
  writeStoredExtraction('A', MANUAL, fieldsFromA, storage)
  writeStoredExtraction('B', MANUAL, fieldsFromB, storage)

  // Commit de React al cambiar de documento: activo B, campos aún de A.
  const transition = { documentId: 'A', fields: fieldsFromA }
  if (shouldPersistExtraction('B', 'done', transition)) {
    writeStoredExtraction('B', MANUAL, transition.fields, storage)
  }

  assert.deepEqual(readStoredExtraction('A', MANUAL, storage)?.fields, fieldsFromA)
  assert.deepEqual(readStoredExtraction('B', MANUAL, storage)?.fields, fieldsFromB)
})

test('escenario 6 — volver a seleccionar recupera la última versión guardada (nivel almacenamiento)', () => {
  const storage = new FakeStorage()
  const v1 = [field('premium', '1000')]
  const v2 = [field('premium', '1200')]

  writeStoredExtraction('doc-A', MANUAL, v1, storage)
  writeStoredExtraction('doc-A', MANUAL, v2, storage)

  assert.deepEqual(readStoredExtraction('doc-A', MANUAL, storage)?.fields, v2)
})

test('escenario 9 — manual y gemini usan claves distintas y no se pisan', () => {
  const storage = new FakeStorage()
  const geminiFields = [field('premium', '1000')]
  const manualFields = [field('premium', '1300')]

  assert.notEqual(
    extractionStorageKey('doc-A', MANUAL),
    extractionStorageKey('doc-A', GEMINI),
  )

  writeStoredExtraction('doc-A', GEMINI, geminiFields, storage)
  writeStoredExtraction('doc-A', MANUAL, manualFields, storage)

  assert.deepEqual(readStoredExtraction('doc-A', GEMINI, storage)?.fields, geminiFields)
  assert.deepEqual(readStoredExtraction('doc-A', MANUAL, storage)?.fields, manualFields)
  // La guarda del flujo Gemini se conserva tal cual (Bug 3 intacto).
  assert.equal(
    shouldPersistExtraction('doc-A', 'done', { documentId: 'doc-A', fields: geminiFields }),
    true,
  )
})

test('escenario 8 — un fallo de escritura no se propaga y no deja datos (sin falso éxito)', () => {
  const storage = new FakeStorage()
  storage.failOnSet = true

  assert.doesNotThrow(() => {
    writeStoredExtraction('doc-A', MANUAL, [field('premium', '1')], storage)
  })

  // Como la escritura falló, no hay dato guardado que pueda leerse como éxito.
  storage.failOnSet = false
  assert.equal(readStoredExtraction('doc-A', MANUAL, storage), null)
})

test('escenario 8 — un fallo de lectura devuelve null en lugar de lanzar', () => {
  const storage = new FakeStorage()
  writeStoredExtraction('doc-A', MANUAL, [field('premium', '1')], storage)
  storage.failOnGet = true

  let result: unknown = 'sin-asignar'
  assert.doesNotThrow(() => {
    result = readStoredExtraction('doc-A', MANUAL, storage)
  })
  assert.equal(result, null)
})

test('escenario 8 — un fallo al borrar no bloquea el restablecimiento', () => {
  const storage = new FakeStorage()
  storage.failOnRemove = true
  assert.doesNotThrow(() => {
    clearStoredExtraction('doc-A', MANUAL, storage)
  })
})

test('restablecer en manual borra solo la captura manual del documento', () => {
  const storage = new FakeStorage()
  writeStoredExtraction('doc-A', MANUAL, [field('premium', '1')], storage)
  writeStoredExtraction('doc-A', GEMINI, [field('premium', '2')], storage)

  clearStoredExtraction('doc-A', MANUAL, storage)

  assert.equal(readStoredExtraction('doc-A', MANUAL, storage), null)
  assert.notEqual(readStoredExtraction('doc-A', GEMINI, storage), null)
})
