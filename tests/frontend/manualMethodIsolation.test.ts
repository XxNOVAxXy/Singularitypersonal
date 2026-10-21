import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtractionField, ExtractionMethod, FieldSource } from '../../shared/types.ts'
import type { ExtractionStatus } from '../../src/features/extraction/utils/extractionState.ts'
import {
  canAdoptAsMethod,
  clearStoredExtraction,
  isGeminiDerived,
  readStoredExtraction,
  shouldPersistExtraction,
  writeStoredExtraction,
  type DocumentFields,
  type ExtractionStorage,
} from '../../src/features/extraction/utils/extractionPersistence.ts'
import { resolveInitialFields } from '../../src/features/extraction/utils/extractionInitialFields.ts'
import { decideSessionMigration } from '../../src/features/extraction/utils/catalog.ts'

/**
 * Pruebas de aislamiento entre métodos (R1).
 *
 * Reproducen el defecto original: al cambiar de método, React confirma el
 * render nuevo conservando el estado del render anterior, y el efecto de
 * persistencia escribía ese estado obsoleto bajo el método nuevo. El
 * resultado de Gemini quedaba guardado como si fuera una captura manual.
 *
 * Aquí no se monta React (el repositorio no tiene entorno DOM): se emula el
 * orden de los efectos con las mismas funciones puras que usa el hook, de
 * modo que la guarda que decide la escritura queda verificada.
 */

const MANUAL: ExtractionMethod = 'manual'
const GEMINI: ExtractionMethod = 'gemini'

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

function blankManualFields(): ExtractionField[] {
  return [field('policyNumber', ''), field('premium', '')]
}

interface FakeBackend {
  [method: string]: ExtractionField[]
}

/**
 * Emula el efecto de persistencia del hook: escribe en la sesión y replica
 * en el "backend" solo si la guarda de identidad lo permite.
 */
function persistEffect(
  activeDocumentId: string | null,
  activeMethod: ExtractionMethod,
  status: ExtractionStatus,
  snapshot: DocumentFields,
  storage: ExtractionStorage,
  backend: FakeBackend,
): void {
  if (!shouldPersistExtraction(activeDocumentId, status, snapshot, activeMethod)) return
  writeStoredExtraction(activeDocumentId as string, activeMethod, snapshot.fields, storage)
  backend[activeMethod] = snapshot.fields
}

/**
 * Condición de persistencia vigente antes de la corrección: solo miraba el
 * estado y que hubiera campos. Se conserva para documentar el fallo original.
 */
function legacyShouldPersist(status: ExtractionStatus, fields: ExtractionField[]): boolean {
  return status === 'done' && fields.length > 0
}

test('el defecto original: la condición previa guardaba el estado obsoleto bajo el método nuevo', () => {
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]
  // Con el método activo ya en "manual" y los campos todavía de Gemini.
  assert.equal(legacyShouldPersist('done', geminiFields), true)
})

test('R1: cambiar de Gemini a manual no copia el resultado de Gemini al método manual', () => {
  const storage = new FakeStorage()
  const backend: FakeBackend = {}
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]

  // Render con Gemini terminado: el resultado se guarda bajo su método.
  persistEffect(
    'A', GEMINI, 'done',
    { documentId: 'A', method: GEMINI, fields: geminiFields },
    storage, backend,
  )
  assert.deepEqual(backend[GEMINI], geminiFields)
  assert.equal(backend[MANUAL], undefined)

  // Commit de React tras cambiar a manual: el estado conserva los campos de
  // Gemini, pero el método activo es "manual".
  persistEffect(
    'A', MANUAL, 'done',
    { documentId: 'A', method: GEMINI, fields: geminiFields },
    storage, backend,
  )

  assert.equal(backend[MANUAL], undefined, 'no se debe escribir en el backend como manual')
  assert.equal(readStoredExtraction('A', MANUAL, storage), null, 'ni en la sesión')
  assert.deepEqual(
    readStoredExtraction('A', GEMINI, storage)?.fields,
    geminiFields,
    'el resultado de Gemini permanece intacto',
  )
})

test('R1: tras una captura manual real cada método conserva su propio resultado', () => {
  const storage = new FakeStorage()
  const backend: FakeBackend = {}
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]
  const manualFields = [field('policyNumber', 'P-1', 'manual')]

  persistEffect(
    'A', GEMINI, 'done',
    { documentId: 'A', method: GEMINI, fields: geminiFields },
    storage, backend,
  )
  persistEffect(
    'A', MANUAL, 'done',
    { documentId: 'A', method: MANUAL, fields: manualFields },
    storage, backend,
  )

  assert.deepEqual(backend[GEMINI], geminiFields)
  assert.deepEqual(backend[MANUAL], manualFields)
  assert.deepEqual(readStoredExtraction('A', GEMINI, storage)?.fields, geminiFields)
  assert.deepEqual(readStoredExtraction('A', MANUAL, storage)?.fields, manualFields)
})

test('R1: un resultado de Gemini no se adopta como captura manual', () => {
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]
  const manualFields = [field('policyNumber', 'P-1', 'manual')]

  assert.equal(isGeminiDerived(geminiFields), true)
  assert.equal(isGeminiDerived(manualFields), false)
  assert.equal(canAdoptAsMethod(MANUAL, geminiFields), false)
  assert.equal(canAdoptAsMethod(MANUAL, manualFields), true)
  assert.equal(canAdoptAsMethod(GEMINI, geminiFields), true)
})

test('R1: la hidratación desde sessionStorage no restaura una copia de Gemini como manual', () => {
  const storage = new FakeStorage()
  // Copia contaminada: contiene el resultado de Gemini bajo la clave manual.
  writeStoredExtraction('A', MANUAL, [field('policyNumber', 'G-9', 'gemini')], storage)

  const stored = readStoredExtraction('A', MANUAL, storage)
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: MANUAL,
    storedFields: stored?.fields ?? null,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: blankManualFields(),
  })

  assert.equal(resolution.source, 'manual-blank')
  assert.deepEqual(resolution.fields, blankManualFields())
  assert.equal(resolution.method, MANUAL)
})

test('R1: la migración desde sessionStorage no sube una copia de Gemini como manual', () => {
  const contaminated = {
    fields: [field('policyNumber', 'G-9', 'gemini')],
    updatedAt: '2026-01-01T00:00:00.000Z',
    method: MANUAL,
  }
  const decision = decideSessionMigration({
    sessionExtraction: contaminated,
    backendExtraction: null,
    documentId: 'A',
    knownRemoteIds: new Set(['A']),
    method: MANUAL,
  })
  assert.equal(decision, 'skip')

  // Una copia heredada sin sello de método se valida por el origen de sus campos.
  const legacy = {
    fields: [field('policyNumber', 'G-9', 'gemini')],
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const legacyDecision = decideSessionMigration({
    sessionExtraction: legacy,
    backendExtraction: null,
    documentId: 'A',
    knownRemoteIds: new Set(['A']),
    method: MANUAL,
  })
  assert.equal(legacyDecision, 'skip')
})

test('R1: una captura manual legítima sí se migra al servidor', () => {
  const decision = decideSessionMigration({
    sessionExtraction: {
      fields: [field('premium', '1500', 'manual')],
      updatedAt: '2026-01-01T00:00:00.000Z',
      method: MANUAL,
    },
    backendExtraction: null,
    documentId: 'A',
    knownRemoteIds: new Set(['A']),
    method: MANUAL,
  })
  assert.equal(decision, 'migrate')
})

test('R1: una copia declarada de otro método no se migra bajo el método activo', () => {
  const decision = decideSessionMigration({
    sessionExtraction: {
      fields: [field('premium', '1500', 'manual')],
      updatedAt: '2026-01-01T00:00:00.000Z',
      method: GEMINI,
    },
    backendExtraction: null,
    documentId: 'A',
    knownRemoteIds: new Set(['A']),
    method: MANUAL,
  })
  assert.equal(decision, 'skip')
})

test('R1: las ediciones manuales se conservan al guardar y recargar', () => {
  const storage = new FakeStorage()
  const edited = [
    field('policyNumber', 'P-1', 'user'),
    field('premium', '1500', 'user'),
  ]

  // Guardado explícito de la captura manual.
  writeStoredExtraction('A', MANUAL, edited, storage, '2026-01-01T00:00:00.000Z')

  // Recarga: la hidratación de sesión recupera exactamente esas ediciones.
  const stored = readStoredExtraction('A', MANUAL, storage)
  const resolution = resolveInitialFields({
    documentId: 'A',
    method: MANUAL,
    storedFields: stored?.fields ?? null,
    hasAttachment: false,
    initialFields: null,
    blankManualFields: blankManualFields(),
  })

  assert.equal(resolution.source, 'manual-restored')
  assert.deepEqual(resolution.fields, edited)
  assert.equal(stored?.method, MANUAL, 'la copia declara el método que la produjo')
})

test('R1: restablecer un método no elimina el resultado del otro método', () => {
  const storage = new FakeStorage()
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]
  const manualFields = [field('policyNumber', 'P-1', 'manual')]

  writeStoredExtraction('A', GEMINI, geminiFields, storage)
  writeStoredExtraction('A', MANUAL, manualFields, storage)

  // Restablecer el método manual: solo se borra su copia de sesión.
  clearStoredExtraction('A', MANUAL, storage)

  assert.equal(readStoredExtraction('A', MANUAL, storage), null)
  assert.deepEqual(readStoredExtraction('A', GEMINI, storage)?.fields, geminiFields)
})

test('R1: la guarda exige documento, método y estado coherentes', () => {
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]
  const snapshot: DocumentFields = { documentId: 'A', method: GEMINI, fields: geminiFields }

  assert.equal(shouldPersistExtraction('A', 'done', snapshot, GEMINI), true)
  assert.equal(shouldPersistExtraction('A', 'done', snapshot, MANUAL), false)
  assert.equal(shouldPersistExtraction('B', 'done', snapshot, GEMINI), false)
  assert.equal(shouldPersistExtraction('A', 'ready', snapshot, GEMINI), false)
  assert.equal(shouldPersistExtraction('A', 'done', { ...snapshot, fields: [] }, GEMINI), false)
})

test('R1: sin método conocido no se escribe nada', () => {
  const geminiFields = [field('policyNumber', 'G-9', 'gemini')]
  // Un estado sin método propietario (por ejemplo tras una recarga en caliente
  // con versiones mezcladas) no puede persistirse bajo ningún método.
  const orphan = { documentId: 'A', method: null, fields: geminiFields }
  assert.equal(shouldPersistExtraction('A', 'done', orphan, GEMINI), false)
  assert.equal(shouldPersistExtraction('A', 'done', orphan, MANUAL), false)
  assert.equal(shouldPersistExtraction('A', 'done', orphan, null), false)
})
