import type { ExtractionField, ExtractionMethod } from '../../../../shared/types.ts'
import type { ExtractionStatus } from './extractionState.ts'

export interface StoredExtraction {
  fields: ExtractionField[]
  updatedAt: string
  /**
   * Método que produjo el resultado. Las copias heredadas (escritas antes de
   * esta corrección) no lo llevan y se validan por el origen de sus campos.
   */
  method?: ExtractionMethod
}

export interface ExtractionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Estado de campos junto con la identidad del documento al que pertenecen. */
export interface DocumentFields {
  documentId: string | null
  /**
   * Método que produjo estos campos. Impide que un resultado se escriba bajo
   * otro método (por ejemplo, el resultado de Gemini guardado como captura
   * manual) cuando React aún conserva el estado del render anterior.
   */
  method: ExtractionMethod | null
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
    if (!Array.isArray(parsed.fields) || typeof parsed.updatedAt !== 'string') return null
    const storedMethod =
      parsed.method === 'manual' || parsed.method === 'gemini' ? parsed.method : undefined
    return {
      fields: parsed.fields,
      updatedAt: parsed.updatedAt,
      ...(storedMethod ? { method: storedMethod } : {}),
    }
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
    const value: StoredExtraction = { fields, updatedAt, method }
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

/**
 * Decide si un resultado puede guardarse. Solo se persiste lo que pertenece
 * al documento activo, al método activo y a un estado ya terminado: durante
 * un cambio de método o de documento React todavía conserva el estado del
 * render anterior y ese estado obsoleto no debe escribirse.
 *
 * La guarda es restrictiva por defecto: si falta cualquier identidad
 * (documento, método o método propietario de los campos) no se escribe nada.
 */
export function shouldPersistExtraction(
  activeDocumentId: string | null,
  status: ExtractionStatus,
  snapshot: DocumentFields,
  activeMethod: ExtractionMethod | null,
): boolean {
  if (!activeDocumentId || !activeMethod) return false
  if (status !== 'done') return false
  if (snapshot.fields.length === 0) return false
  if (snapshot.documentId !== activeDocumentId) return false
  if (!snapshot.method || snapshot.method !== activeMethod) return false
  return true
}

/**
 * Un resultado de Gemini no puede presentarse como captura manual: los campos
 * de Gemini llevan `source: 'gemini'` y una captura manual solo contiene
 * campos `manual` (reglas locales) o `user` (edición del usuario).
 */
export function isGeminiDerived(fields: ExtractionField[]): boolean {
  return fields.some((field) => field.source === 'gemini')
}

/**
 * Indica si un resultado puede adoptarse como captura del método indicado.
 * Es la regla que impide que una copia de Gemini se hydrate, se migre al
 * servidor o se presente como captura manual.
 */
export function canAdoptAsMethod(
  method: ExtractionMethod,
  fields: ExtractionField[],
): boolean {
  if (method !== 'manual') return true
  return !isGeminiDerived(fields)
}
