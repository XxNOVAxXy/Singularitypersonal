import type { ExtractionField, ExtractionMethod } from '../../../../shared/types.ts'
import type { ExtractionStatus } from './extractionState.ts'

export interface StoredExtraction {
  fields: ExtractionField[]
  updatedAt: string
}

export interface ExtractionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Estado de campos junto con la identidad del documento al que pertenecen. */
export interface DocumentFields {
  documentId: string | null
  fields: ExtractionField[]
}

export function extractionStorageKey(
  documentId: string,
  method: ExtractionMethod,
): string {
  return `singularity.extraction.${method}.${encodeURIComponent(documentId)}`
}

export function readStoredExtraction(
  documentId: string,
  method: ExtractionMethod,
  storage: ExtractionStorage | null,
): StoredExtraction | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(extractionStorageKey(documentId, method))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredExtraction>
    return Array.isArray(parsed.fields) && typeof parsed.updatedAt === 'string'
      ? { fields: parsed.fields, updatedAt: parsed.updatedAt }
      : null
  } catch {
    return null
  }
}

export function writeStoredExtraction(
  documentId: string,
  method: ExtractionMethod,
  fields: ExtractionField[],
  storage: ExtractionStorage | null,
  updatedAt: string = new Date().toISOString(),
): void {
  if (!storage) return
  try {
    const value: StoredExtraction = { fields, updatedAt }
    storage.setItem(extractionStorageKey(documentId, method), JSON.stringify(value))
  } catch {
    // La extracción sigue funcionando aunque el almacenamiento de sesión esté lleno.
  }
}

export function clearStoredExtraction(
  documentId: string,
  method: ExtractionMethod,
  storage: ExtractionStorage | null,
): void {
  if (!storage) return
  try {
    storage.removeItem(extractionStorageKey(documentId, method))
  } catch {
    // No bloquea el restablecimiento del formulario.
  }
}

export function shouldPersistExtraction(
  activeDocumentId: string | null,
  status: ExtractionStatus,
  snapshot: DocumentFields,
): boolean {
  return (
    activeDocumentId !== null &&
    status === 'done' &&
    snapshot.fields.length > 0 &&
    snapshot.documentId === activeDocumentId
  )
}
