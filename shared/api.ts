import type { ExtractionField, PolicyType } from './types.ts'
import type { ExtractionSummary } from './extraction.ts'

/** Tipos MIME de documento aceptados por el endpoint de extracción. */
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number]

/** Límite único del tamaño del documento (decodificado desde base64). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

export interface ExtractionDocumentInput {
  name: string
  mimeType: SupportedMimeType
  dataBase64: string
}

/** Cuerpo esperado en `POST /api/extract`. */
export interface ExtractionRequest {
  policyType: PolicyType
  document: ExtractionDocumentInput
}

export interface ExtractionMeta {
  model: string
  policyType: PolicyType
  totalFields: number
  providedFields: number
  missingRequired: number
  unknownFields: string[]
}

export interface ExtractionSuccessResponse {
  ok: true
  method: 'gemini'
  fields: ExtractionField[]
  summary: ExtractionSummary
  meta: ExtractionMeta
}

export interface ExtractionErrorResponse {
  ok: false
  error: string
  details?: string[]
}

export type ExtractionResponse =
  | ExtractionSuccessResponse
  | ExtractionErrorResponse
