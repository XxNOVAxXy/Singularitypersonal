import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decideSessionMigration,
  filterDeletedDocuments,
  isDemoMode,
  markDemoDocumentDeleted,
  mergeCatalogDocuments,
  readDeletedDemoIds,
  type KeyValueStorage,
} from '../../src/features/extraction/utils/catalog.ts'

function fakeStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

test('por defecto el modo demostración está desactivado', () => {
  assert.equal(isDemoMode(), false)
})

test('mergeCatalogDocuments deduplica y respeta el modo demostración', () => {
  const remote = [{ id: 'gmail-1', name: 'Correo.pdf' }]
  const demo = [
    { id: 'doc-1', name: 'Demo 1' },
    { id: 'gmail-1', name: 'Duplicado' },
  ]

  const withoutDemo = mergeCatalogDocuments(remote, demo, false)
  assert.deepEqual(withoutDemo, [{ id: 'gmail-1', name: 'Correo.pdf' }])

  const withDemo = mergeCatalogDocuments(remote, demo, true)
  assert.deepEqual(withDemo.map((item) => item.id), ['gmail-1', 'doc-1'])
  assert.equal(withDemo[0].name, 'Correo.pdf')
})

test('decideSessionMigration no sobrescribe una extracción del backend', () => {
  const decision = decideSessionMigration({
    sessionExtraction: { fields: [{ key: 'a' } as never], updatedAt: 't' },
    backendExtraction: { fields: [], updatedAt: 't' },
    documentId: 'manual-1',
    knownRemoteIds: new Set(['manual-1']),
    method: 'manual',
  })
  assert.equal(decision, 'skip')
})

test('decideSessionMigration migra una copia identificable sin datos en backend', () => {
  const decision = decideSessionMigration({
    sessionExtraction: { fields: [{ key: 'a' } as never], updatedAt: 't' },
    backendExtraction: null,
    documentId: 'manual-1',
    knownRemoteIds: new Set(['manual-1']),
    method: 'manual',
  })
  assert.equal(decision, 'migrate')
})

test('decideSessionMigration no migra documentos ambiguos (mocks)', () => {
  const decision = decideSessionMigration({
    sessionExtraction: { fields: [{ key: 'a' } as never], updatedAt: 't' },
    backendExtraction: null,
    documentId: 'doc-1',
    knownRemoteIds: new Set(['manual-1']),
    method: 'manual',
  })
  assert.equal(decision, 'skip')
})

test('decideSessionMigration ignora copias vacías', () => {
  const decision = decideSessionMigration({
    sessionExtraction: { fields: [], updatedAt: 't' },
    backendExtraction: null,
    documentId: 'manual-1',
    knownRemoteIds: new Set(['manual-1']),
    method: 'manual',
  })
  assert.equal(decision, 'skip')
})

test('un documento de demostración eliminado no reaparece tras recargar', () => {
  const storage = fakeStorage()
  assert.equal(readDeletedDemoIds(storage).size, 0)

  markDemoDocumentDeleted('doc-1', storage)
  markDemoDocumentDeleted('doc-1', storage)
  markDemoDocumentDeleted('doc-2', storage)

  const deleted = readDeletedDemoIds(storage)
  assert.deepEqual([...deleted].sort(), ['doc-1', 'doc-2'])

  const documents = [
    { id: 'doc-1', name: 'Demo 1' },
    { id: 'doc-2', name: 'Demo 2' },
    { id: 'doc-3', name: 'Demo 3' },
  ]
  const visible = filterDeletedDocuments(documents, deleted)
  assert.deepEqual(visible.map((item) => item.id), ['doc-3'])
})

test('readDeletedDemoIds tolera almacenamiento vacío o corrupto', () => {
  const storage = fakeStorage()
  storage.setItem('singularity.demo.deletedDocuments', 'no-es-json')
  assert.equal(readDeletedDemoIds(storage).size, 0)
})
