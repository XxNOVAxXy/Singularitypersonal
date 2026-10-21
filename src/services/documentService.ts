import type { ExtractionField, ExtractionMethod } from '../../shared/types.ts'
import {
  getGmailDocuments,
  type GmailDocumentRecord,
} from './gmailService.ts'

export type DocumentOrigin = 'gmail' | 'manual' | 'demo' | 'imap'

export interface CatalogDocument {
  id: string
  filename: string
  status: string
  origin: DocumentOrigin
  contentHash?: string | null
  sizeBytes?: number | null
  mimeType?: string | null
  uploadedAt?: string | null
  sources?: unknown[]
  result?: unknown
  createdAt?: string | null
}

export interface StoredExtractionPayload {
  fields: ExtractionField[]
  updatedAt: string
  method?: ExtractionMethod
}

export class DocumentServiceError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'DocumentServiceError'
    this.status = status
  }
}

function resolveBaseUrl(): string {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>
  }
  const raw = (meta.env?.VITE_GMAIL_API_URL || meta.env?.VITE_API_BASE_URL || '').trim()
  return raw.replace(/\/+$/, '')
}

async function parseError(response: Response): Promise<DocumentServiceError> {
  let message = `La solicitud fue rechazada (${response.status}).`
  try {
    const payload = (await response.json()) as { detail?: string }
    if (payload.detail) message = payload.detail
  } catch {
    // Mantiene el mensaje genérico cuando el backend no devuelve JSON.
  }
  return new DocumentServiceError(message, response.status)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${resolveBaseUrl()}/api${path}`, init)
  } catch {
    throw new DocumentServiceError('No se pudo conectar con el servicio de documentos.')
  }
  if (!response.ok) throw await parseError(response)
  return response.json() as Promise<T>
}

export async function getDocuments(): Promise<CatalogDocument[]> {
  const payload = await request<{ documents: CatalogDocument[] }>('/documents')
  return payload.documents
}

export interface CatalogLoadResult {
  documents: CatalogDocument[]
  degraded: boolean
  /** Motivo de la degradación (error de la ruta unificada) o null si no hay. */
  degradedReason: string | null
}

/**
 * La ruta `/api/gmail/documents` lista el registro completo (incluidos los
 * documentos manuales e IMAP). El backend expone `origin`; para versiones
 * antiguas que no lo envían se usa una inferencia conservadora: solo los IDs
 * de documento manual (prefijo `manual-`) se consideran borrables; cualquier
 * otro registro se trata como correo (Gmail/IMAP) para no permitir su
 * eliminación.
 */
function fromGmailRecord(record: GmailDocumentRecord): CatalogDocument {
  const hasMailSource = Boolean(record.messageId || record.attachmentId)
  const origin: DocumentOrigin =
    record.origin === 'manual' || record.origin === 'demo' || record.origin === 'imap'
      ? record.origin
      : record.origin === 'gmail' || hasMailSource || !record.id.startsWith('manual-')
        ? 'gmail'
        : 'manual'
  const sources = Array.isArray(record.sources) && record.sources.length > 0
    ? record.sources
    : hasMailSource
      ? [{ messageId: record.messageId, attachmentId: record.attachmentId }]
      : []
  return {
    id: record.id,
    filename: record.filename,
    status: record.status,
    origin,
    contentHash: record.contentHash ?? null,
    sizeBytes: record.sizeBytes ?? null,
    mimeType: record.mimeType ?? null,
    uploadedAt: record.uploadedAt ?? null,
    sources,
    result: record.result,
    createdAt: record.createdAt ?? null,
  }
}

/**
 * Carga el catálogo unificado de documentos. Si la ruta nueva
 * `/api/documents` no está disponible (backend sin actualizar), recurre a la
 * ruta existente de Gmail en lugar de devolver una lista vacía. Solo cuando
 * ambas fallan se propaga el error para que la interfaz pueda identificarlo.
 */
export async function loadCatalogDocuments(): Promise<CatalogLoadResult> {
  try {
    return { documents: await getDocuments(), degraded: false, degradedReason: null }
  } catch (primaryError) {
    const reason =
      primaryError instanceof Error && primaryError.message
        ? primaryError.message
        : 'No se pudo consultar /api/documents.'
    try {
      const gmail = await getGmailDocuments()
      return { documents: gmail.map(fromGmailRecord), degraded: true, degradedReason: reason }
    } catch {
      throw primaryError instanceof DocumentServiceError
        ? primaryError
        : new DocumentServiceError(
            'No se pudo cargar el catálogo de documentos.',
          )
    }
  }
}

export async function registerManualDocument(file: File): Promise<CatalogDocument> {
  const formData = new FormData()
  formData.append('file', file)
  return request<CatalogDocument>('/documents', { method: 'POST', body: formData })
}

export async function getDocumentExtractions(
  documentId: string,
): Promise<Record<string, StoredExtractionPayload>> {
  const payload = await request<{ extractions: Record<string, StoredExtractionPayload> }>(
    `/documents/${encodeURIComponent(documentId)}/extractions`,
  )
  return payload.extractions
}

export async function saveDocumentExtraction(
  documentId: string,
  method: ExtractionMethod,
  fields: ExtractionField[],
  updatedAt: string,
): Promise<StoredExtractionPayload> {
  const payload = await request<{ extraction: StoredExtractionPayload }>(
    `/documents/${encodeURIComponent(documentId)}/extractions/${method}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields, updatedAt }),
    },
  )
  return payload.extraction
}

export async function deleteDocumentExtraction(
  documentId: string,
  method: ExtractionMethod,
): Promise<void> {
  await request(
    `/documents/${encodeURIComponent(documentId)}/extractions/${method}`,
    { method: 'DELETE' },
  )
}

export async function deleteDocument(documentId: string): Promise<void> {
  await request(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
}
