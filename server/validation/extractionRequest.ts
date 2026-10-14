import type { PolicyType } from '../../shared/types.ts'
import {
  MAX_DOCUMENT_BYTES,
  SUPPORTED_MIME_TYPES,
} from '../../shared/api.ts'
import type {
  ExtractionDocumentInput,
  ExtractionRequest,
  SupportedMimeType,
} from '../../shared/api.ts'

const POLICY_TYPES: readonly PolicyType[] = [
  'auto',
  'gmm',
  'vida',
  'fianza',
  'danos',
  'recibo',
]

const MAX_NAME_LENGTH = 200

export type RequestValidation =
  | { ok: true; value: ExtractionRequest }
  | { ok: false; status: number; error: string; details?: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(details: string[]): RequestValidation {
  return { ok: false, status: 400, error: 'invalid_request', details }
}

function isValidBase64(value: string): boolean {
  if (value.length === 0) return false
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false
  if (value.length % 4 === 1) return false
  return true
}

function estimateBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor((value.length * 3) / 4) - padding
}

/**
 * Valida el cuerpo de `POST /api/extract`. No confía en ninguna forma previa:
 * revisa tipo de póliza, metadatos del documento, tipo MIME y tamaño.
 */
export function validateExtractionRequest(body: unknown): RequestValidation {
  if (!isRecord(body)) {
    return invalid(['El cuerpo de la solicitud debe ser un objeto JSON.'])
  }

  const policyType = body.policyType
  if (
    typeof policyType !== 'string' ||
    !POLICY_TYPES.includes(policyType as PolicyType)
  ) {
    return invalid([
      `"policyType" es inválido. Valores permitidos: ${POLICY_TYPES.join(', ')}.`,
    ])
  }

  const document = body.document
  if (!isRecord(document)) {
    return invalid(['"document" debe ser un objeto.'])
  }

  const name = document.name
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.length > MAX_NAME_LENGTH
  ) {
    return invalid([
      `"document.name" debe ser texto no vacío de máximo ${MAX_NAME_LENGTH} caracteres.`,
    ])
  }

  const mimeType = document.mimeType
  if (
    typeof mimeType !== 'string' ||
    !SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType)
  ) {
    return {
      ok: false,
      status: 415,
      error: 'unsupported_media_type',
      details: [`Tipos permitidos: ${SUPPORTED_MIME_TYPES.join(', ')}.`],
    }
  }

  const dataBase64 = document.dataBase64
  if (
    typeof dataBase64 !== 'string' ||
    dataBase64.trim().length === 0 ||
    !isValidBase64(dataBase64)
  ) {
    return invalid(['"document.dataBase64" no es una cadena base64 válida.'])
  }

  const size = estimateBase64Bytes(dataBase64)
  if (size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      status: 413,
      error: 'payload_too_large',
      details: [
        `El documento supera el límite de ${MAX_DOCUMENT_BYTES} bytes (${size} bytes recibidos).`,
      ],
    }
  }
  if (size <= 0) {
    return invalid(['"document.dataBase64" está vacío.'])
  }

  const value: ExtractionDocumentInput = {
    name,
    mimeType: mimeType as SupportedMimeType,
    dataBase64,
  }

  return {
    ok: true,
    value: { policyType: policyType as PolicyType, document: value },
  }
}
