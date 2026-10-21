import type { ExtractionMethod } from '../../../../shared/types.ts'
import { canAdoptAsMethod, type StoredExtraction } from './extractionPersistence.ts'

export interface DocumentOptionLike {
  id: string
  name: string
}

/**
 * El catálogo de demostración solo se inyecta cuando se habilita de forma
 * explícita. Desactivado por defecto para no resucitar documentos eliminados.
 */
export function isDemoMode(): boolean {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>
  }
  return meta.env?.VITE_DEMO_MODE === 'true'
}

export function mergeCatalogDocuments<T extends DocumentOptionLike>(
  remote: T[],
  demo: T[],
  includeDemo: boolean,
): T[] {
  const merged = includeDemo ? [...remote, ...demo] : [...remote]
  return merged.filter(
    (document, index, list) =>
      list.findIndex((item) => item.id === document.id) === index,
  )
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const DELETED_DEMO_KEY = 'singularity.demo.deletedDocuments'

function defaultStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readDeletedDemoIds(
  storage: KeyValueStorage | null = defaultStorage(),
): Set<string> {
  if (!storage) return new Set()
  try {
    const raw = storage.getItem(DELETED_DEMO_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

/** Registra un documento de demostración eliminado para que no reaparezca. */
export function markDemoDocumentDeleted(
  id: string,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    const ids = readDeletedDemoIds(storage)
    ids.add(id)
    storage.setItem(DELETED_DEMO_KEY, JSON.stringify([...ids]))
  } catch {
    // La eliminación visual continúa aunque el almacenamiento falle.
  }
}

export function filterDeletedDocuments<T extends DocumentOptionLike>(
  documents: T[],
  deleted: Set<string>,
): T[] {
  if (deleted.size === 0) return documents
  return documents.filter((document) => !deleted.has(document.id))
}

export type MigrationDecision = 'migrate' | 'skip'

/**
 * Decide si una copia de sessionStorage puede migrarse al backend. Solo se
 * migran documentos que el backend reconoce (no mocks ni IDs ambiguos), y
 * nunca se sobrescribe una extracción ya existente en el backend.
 *
 * La copia debe pertenecer al método que se va a migrar: una copia de sesión
 * que contiene un resultado de Gemini nunca se migra como captura manual.
 */
export function decideSessionMigration(args: {
  sessionExtraction: StoredExtraction | null
  backendExtraction: unknown
  documentId: string
  knownRemoteIds: Set<string>
  method: ExtractionMethod
}): MigrationDecision {
  const { sessionExtraction, backendExtraction, documentId, knownRemoteIds, method } = args
  if (backendExtraction) return 'skip'
  if (!sessionExtraction || sessionExtraction.fields.length === 0) return 'skip'
  if (!knownRemoteIds.has(documentId)) return 'skip'
  // Las copias escritas a partir de esta corrección declaran su método: si no
  // coincide, la copia pertenece a otro resultado y no se migra.
  if (sessionExtraction.method !== undefined && sessionExtraction.method !== method) {
    return 'skip'
  }
  if (!canAdoptAsMethod(method, sessionExtraction.fields)) return 'skip'
  return 'migrate'
}
